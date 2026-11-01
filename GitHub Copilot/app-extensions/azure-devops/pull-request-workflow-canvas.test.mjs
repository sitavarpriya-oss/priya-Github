// @vitest-environment node
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { expect, onTestFinished, test, vi } from "vitest";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";

const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "repo-one",
		accountId: "account-one",
	},
	pullRequestId: 22,
};
async function setup({ operations = ["edit"], handler } = {}) {
	const requestFetch = vi.fn(async (input, options) => {
		const custom = await handler?.(new URL(input), options);
		if (custom !== undefined)
			return custom instanceof Response ? custom : Response.json(custom);
		return Response.json({
			pullRequestId: 22,
			repository: { id: "repo-one" },
			title: "Sample",
			status: "active",
			sourceRefName: "refs/heads/topic",
			targetRefName: "refs/heads/main",
			...(options.body ? JSON.parse(options.body) : {}),
		});
	});
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: requestFetch,
		getAccess: async () => ({ viewerId: "viewer", operations }),
	});
	onTestFinished(() => canvas.dispose());
	const instanceId = randomUUID();
	canvas.setBinding(instanceId, binding);
	const { url } = await canvas.open({ instanceId, input: {} });
	const origin = new URL(url).origin;
	const getState = async () =>
		(await fetch(`${origin}/instances/${instanceId}`)).json();
	await expect.poll(async () => (await getState()).status).toBe("ready");
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String((await getState()).bindingRevision),
	};
	return { canvas, instanceId, origin, headers, requestFetch, getState };
}

test("reviewer search is binding-scoped, authorized, and read-only", async () => {
	const { origin, instanceId, headers, requestFetch } = await setup({
		operations: ["reviewer"],
		handler(url, options) {
			if (url.pathname.endsWith("/_apis/identities"))
				return {
					value: [
						{
							id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
							providerDisplayName: "Qiren Lu",
							isActive: true,
							properties: {
								Account: { $value: "v-qirenlu" },
								Mail: { $value: "v-qirenlu@microsoft.com" },
							},
						},
					],
				};
			if (url.pathname.endsWith("/_apis/projects/tools/teams"))
				return { value: [] };
			if (
				url.pathname.endsWith("/_apis/graph/subjectquery") &&
				options.method === "POST"
			)
				return { value: [] };
			return undefined;
		},
	});
	const url = `${origin}/search-reviewers/${instanceId}`;
	const body = JSON.stringify({ query: "v-qirenlu" });
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers: { ...headers, "X-Canvas-Binding": "0" },
				body,
			})
		).status,
	).toBe(409);
	const response = await fetch(url, { method: "POST", headers, body });
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({
		reviewers: [
			{
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				name: "Qiren Lu",
				detail: "v-qirenlu@microsoft.com",
			},
		],
		incomplete: false,
	});
	expect(
		requestFetch.mock.calls.every(
			([, options]) => !["PATCH", "PUT", "DELETE"].includes(options.method),
		),
	).toBe(true);
});

test("cancelled reviewer search aborts its ADO identity request", async () => {
	const started = Promise.withResolvers();
	const aborted = Promise.withResolvers();
	const { origin, instanceId, headers } = await setup({
		operations: ["reviewer"],
		handler(url, options) {
			if (!url.pathname.endsWith("/_apis/identities")) return undefined;
			started.resolve();
			return new Promise((_, reject) => {
				options.signal.addEventListener(
					"abort",
					() => {
						aborted.resolve();
						reject(options.signal.reason);
					},
					{ once: true },
				);
			});
		},
	});
	const controller = new AbortController();
	const pending = fetch(`${origin}/search-reviewers/${instanceId}`, {
		method: "POST",
		headers,
		body: JSON.stringify({ query: "qiren" }),
		signal: controller.signal,
	});
	await started.promise;
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	await expect(aborted.promise).resolves.toBeUndefined();
});

test("mutation routes require origin, current binding, bounded JSON, and approved operation", async () => {
	const { origin, instanceId, headers, requestFetch } = await setup();
	const url = `${origin}/mutate/${instanceId}`;
	const body = JSON.stringify({
		operation: "edit",
		input: { title: "Changed" },
	});
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers: { ...headers, Origin: "https://example.com" },
				body,
			})
		).status,
	).toBe(403);
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers: { ...headers, "X-Canvas-Binding": "0" },
				body,
			})
		).status,
	).toBe(409);
	expect(
		(await fetch(url, { method: "POST", headers, body: "[" })).status,
	).toBe(400);
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({
					operation: "abandon",
					input: { confirm: true },
				}),
			})
		).status,
	).toBe(400);
	expect(
		requestFetch.mock.calls.every(([, options]) => options.method === "GET"),
	).toBe(true);
	expect((await fetch(url, { method: "POST", headers, body })).status).toBe(
		200,
	);
	expect(
		requestFetch.mock.calls.filter(([, options]) => options.method === "PATCH"),
	).toHaveLength(1);
});

test("binding replacement during body receipt prevents writes", async () => {
	const { canvas, origin, instanceId, headers, requestFetch } = await setup();
	const body = JSON.stringify({
		operation: "edit",
		input: { title: "Old binding" },
	});
	const response = Promise.withResolvers();
	const outgoing = request(
		`${origin}/mutate/${instanceId}`,
		{
			method: "POST",
			headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
		},
		(incoming) => {
			incoming.resume();
			response.resolve(incoming.statusCode);
		},
	);
	outgoing.on("error", response.reject);
	outgoing.write(body.slice(0, 10));
	await new Promise((resolve) => setTimeout(resolve, 20));
	canvas.setBinding(instanceId, null);
	outgoing.end(body.slice(10));
	expect(await response.promise).toBe(409);
	expect(
		requestFetch.mock.calls.every(([, options]) => options.method === "GET"),
	).toBe(true);
});

test("review state transport keeps preferences and rejects unscoped file progress", async () => {
	const { origin, instanceId, headers, getState } = await setup();
	const url = `${origin}/review-state/${instanceId}`;
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({ preferences: { mode: "split" } }),
			})
		).status,
	).toBe(200);
	expect((await getState()).reviewState.preferences.mode).toBe("split");
	expect(
		(
			await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({ viewed: { path: "/unknown", viewed: true } }),
			})
		).status,
	).toBe(400);
});
