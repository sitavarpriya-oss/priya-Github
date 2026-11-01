// @vitest-environment node
import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
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

function response(id = 22) {
	return Response.json({
		pullRequestId: id,
		repository: { id: binding.repository.repositoryId },
		title: `Pull request ${id}`,
		status: "active",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
	});
}

function setup(reportCanvasAction, requestFix) {
	const requestFetch = vi.fn().mockImplementation(async () => response());
	const canvas = createPullRequestCanvas({
		reportCanvasAction,
		requestFix,
		authentication: {
			getAccessToken: vi
				.fn()
				.mockResolvedValue({ accessToken: "private-token" }),
		},
		fetch: requestFetch,
	});
	onTestFinished(() => canvas.dispose());
	const first = randomUUID();
	canvas.setBinding(first, binding);
	return { canvas, first, requestFetch };
}

async function snapshot(url) {
	return (await fetch(url.replace("/canvases/", "/instances/"))).json();
}

test("interaction reports preserve origin and binding fences and reject arbitrary fields", async () => {
	const reports = [];
	const { canvas, first } = setup((report) => reports.push(report));
	const opened = await canvas.open({ instanceId: first, input: {} });
	await expect
		.poll(async () => (await snapshot(opened.url)).status)
		.toBe("ready");
	await expect.poll(() => reports.length).toBe(2);
	expect(reports.splice(0)).toEqual([
		expect.objectContaining({
			action: "load",
			stage: "details",
			entryPoint: "automatic",
			phase: "started",
			canvasId: "pull-request",
			instanceId: first,
		}),
		expect.objectContaining({
			action: "load",
			stage: "details",
			entryPoint: "automatic",
			phase: "finished",
			result: "success",
		}),
	]);
	await canvas.open({ instanceId: first, input: {}, reopen: true });
	await setImmediate();
	expect(reports).toEqual([]);
	const state = await snapshot(opened.url);
	const origin = new URL(opened.url).origin;
	const report = {
		actionId: randomUUID(),
		action: "expand",
		stage: "access",
		phase: "finished",
		result: "success",
		durationMs: 1,
		entryPoint: "guest",
	};
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String(state.bindingRevision),
	};
	const post = (body, overrides = {}) =>
		fetch(`${origin}/interaction/${first}`, {
			method: "POST",
			headers: { ...headers, ...overrides },
			body: JSON.stringify(body),
		});
	expect(
		(await post(report, { Origin: "https://foreign.example" })).status,
	).toBe(403);
	expect((await post(report, { "X-Canvas-Binding": "0" })).status).toBe(409);
	expect(
		(await post({ ...report, properties: { secret: "poison" } })).status,
	).toBe(400);
	expect(
		(await post({ ...report, stage: "https://private/?query=poison" })).status,
	).toBe(400);
	expect(reports).toEqual([]);
	const { result: _result, durationMs: _duration, ...started } = report;
	expect((await post({ ...started, phase: "started" })).status).toBe(400);
	expect((await post(report)).status).toBe(200);
	expect(reports).toEqual([
		{ ...report, canvasId: "pull-request", instanceId: first },
	]);
	canvas.setBinding(first, { ...binding, pullRequestId: 23 });
	expect(
		(
			await post({
				...report,
				phase: "finished",
				result: "success",
				durationMs: 1,
			})
		).status,
	).toBe(409);
	expect(reports).toHaveLength(1);
});

test("content reads require the current binding and cannot select arbitrary files", async () => {
	const { canvas, first, requestFetch } = setup();
	const opened = await canvas.open({ instanceId: first, input: {} });
	await expect
		.poll(async () => (await snapshot(opened.url)).status)
		.toBe("ready");
	const state = await snapshot(opened.url);
	const origin = new URL(opened.url).origin;
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String(state.bindingRevision),
	};
	const endpoint = `${origin}/load-overview/${first}`;
	expect(
		(
			await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, "X-Canvas-Binding": "0" },
			})
		).status,
	).toBe(409);
	expect(
		(await fetch(`${origin}/load-file/${first}/0`, { method: "POST", headers }))
			.status,
	).toBe(409);
	const count = requestFetch.mock.calls.length;
	expect(
		(
			await fetch(`${origin}/load-file/${first}/..`, {
				method: "POST",
				headers,
			})
		).status,
	).toBe(404);
	expect(requestFetch).toHaveBeenCalledTimes(count);
	expect((await fetch(endpoint, { method: "POST", headers })).status).toBe(202);
	canvas.setBinding(first, { ...binding, pullRequestId: 23 });
	expect((await fetch(endpoint, { method: "POST", headers })).status).toBe(409);
});

test("does not expose retired full-file assets or grant worker evaluation", async () => {
	const { canvas, first } = setup();
	const opened = await canvas.open({ instanceId: first, input: {} });
	const origin = new URL(opened.url).origin;
	const page = await fetch(opened.url);
	const policy = page.headers.get("content-security-policy");
	expect(policy).not.toContain("worker-src 'self'");
	expect(policy).not.toMatch(/wasm-unsafe-eval|'unsafe-eval'/);
	for (const path of [
		"/assets/syntax/pull-request-syntax-worker.js",
		"/assets/syntax/not-listed.js",
		"/pull-request-syntax-worker.mjs",
		"/pull-request-changes-controls.mjs",
		"/assets/pull-request-diff.js",
		"/assets/syntax/../../request.mjs",
	]) {
		expect((await fetch(`${origin}${path}`)).status).toBe(404);
	}
});

test("thread code reads accept only bounded IDs from the current bound discussion", async () => {
	const requestFix = vi.fn();
	const { canvas, first, requestFetch } = setup(undefined, requestFix);
	const repositoryId = "11111111-1111-4111-8111-111111111111";
	canvas.setBinding(first, {
		...binding,
		repository: { ...binding.repository, repositoryId },
	});
	requestFetch.mockImplementation(async (input) => {
		const path = new URL(input).pathname;
		if (path.endsWith("/threads"))
			return Response.json({
				value: [
					{
						id: 1,
						status: "active",
						comments: [{ id: 1, content: "Check this line." }],
						threadContext: {
							filePath: "/src/main.ts",
							rightFileStart: { line: 2, offset: 1 },
							rightFileEnd: { line: 2, offset: 4 },
						},
					},
				],
			});
		if (path.endsWith("/statuses") || path.endsWith("/evaluations"))
			return Response.json({ value: [] });
		return Response.json({
			...(await response().json()),
			repository: {
				id: repositoryId,
				project: { id: "22222222-2222-4222-8222-222222222222" },
			},
			reviewers: [],
		});
	});
	const opened = await canvas.open({ instanceId: first, input: {} });
	await expect
		.poll(async () => (await snapshot(opened.url)).status)
		.toBe("ready");
	const origin = new URL(opened.url).origin;
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String((await snapshot(opened.url)).bindingRevision),
	};
	await fetch(`${origin}/load-overview/${first}`, { method: "POST", headers });
	await expect
		.poll(async () => (await snapshot(opened.url)).overview)
		.toEqual({
			status: "ready",
			data: expect.any(Object),
			error: null,
		});
	const endpoint = `${origin}/load-thread-code/${first}`;
	for (const body of [
		{ threadIds: [99] },
		{ threadIds: [1, 1] },
		{ threadIds: Array.from({ length: 11 }, (_, i) => i + 1) },
		{ threadIds: [1], path: "/arbitrary.txt" },
		{ threadIds: "1" },
	]) {
		expect(
			(
				await fetch(endpoint, {
					method: "POST",
					headers,
					body: JSON.stringify(body),
				})
			).status,
		).toBe(400);
	}
	const body = JSON.stringify({ threadIds: [1] });
	expect(
		(
			await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, Origin: "https://untrusted.invalid" },
				body,
			})
		).status,
	).toBe(403);
	expect(
		(
			await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, "X-Canvas-Binding": "0" },
				body,
			})
		).status,
	).toBe(409);
	expect(
		(await fetch(endpoint, { method: "POST", headers, body })).status,
	).toBe(202);
	await expect
		.poll(async () => (await snapshot(opened.url)).threadCode.status)
		.toBe("ready");
	const code = (await snapshot(opened.url)).threadCode.data;
	expect(code).toMatchObject([
		{ threadId: 1, preview: null, error: expect.any(String) },
	]);
	expect(JSON.stringify(code)).not.toContain("private-token");
	const fix = (threadIds) =>
		fetch(`${origin}/fix/${first}`, {
			method: "POST",
			headers,
			body: JSON.stringify({ kind: "discussion", threadIds }),
		});
	expect((await fix([99])).status).toBe(400);
	expect((await fix([1])).status).toBe(202);
	expect(requestFix).toHaveBeenCalledWith({
		instanceId: first,
		fix: { kind: "discussion", threadId: "thread:1" },
		guidance: expect.stringContaining("read_agent_merge_reviews"),
	});
	requestFix.mockRejectedValueOnce(new Error("Not accepted"));
	expect((await fix([1])).status).toBe(400);
	requestFix.mockResolvedValueOnce("unknown");
	const checks = await fetch(`${origin}/fix/${first}`, {
		method: "POST",
		headers,
		body: JSON.stringify({ kind: "checks" }),
	});
	expect(checks.status).toBe(202);
	expect(await checks.json()).toEqual({ outcome: "unknown" });
	expect(requestFix).toHaveBeenLastCalledWith({
		instanceId: first,
		fix: { kind: "checks" },
		guidance: expect.stringContaining("do not queue validation"),
	});
	canvas.setBinding(first, { ...binding, pullRequestId: 23 });
	expect(
		(await fetch(endpoint, { method: "POST", headers, body })).status,
	).toBe(409);
});

test("serves the real canvas, retains an instance on reopen, and isolates siblings", async () => {
	const { canvas, first, requestFetch } = setup();
	const second = randomUUID();
	canvas.setBinding(second, { ...binding, pullRequestId: 23 });
	const opened = await canvas.open({
		instanceId: first,
		input: {},
		reopen: false,
	});
	await expect
		.poll(async () => (await snapshot(opened.url)).status)
		.toBe("ready");
	requestFetch.mockResolvedValueOnce(response(23));
	const sibling = await canvas.open({
		instanceId: second,
		input: {},
		reopen: false,
	});
	await expect
		.poll(async () => (await snapshot(sibling.url)).status)
		.toBe("ready");
	expect((await snapshot(opened.url)).pullRequest.id).toBe(22);
	expect((await snapshot(sibling.url)).pullRequest.id).toBe(23);
	expect(
		await canvas.open({ instanceId: first, input: {}, reopen: true }),
	).toEqual(opened);
	expect(requestFetch).toHaveBeenCalledTimes(2);
	const page = await fetch(opened.url);
	expect(page.headers.get("content-security-policy")).toContain(
		"connect-src 'self'",
	);
	expect(await page.text()).toContain("Azure DevOps pull request");
	expect(JSON.stringify(await snapshot(opened.url))).not.toMatch(
		/private-token|account-one/,
	);
	await canvas.onClose({ instanceId: first });
	expect((await fetch(opened.url)).status).toBe(404);
	expect((await fetch(sibling.url)).status).toBe(200);
	await expect(
		canvas.open({ instanceId: first, input: {}, reopen: true }),
	).rejects.toThrow("closed");
	expect(() => canvas.setBinding(first, binding)).toThrow("closed");
});

test("actions start reads without holding the host call open and share cancellation", async () => {
	const { canvas, first, requestFetch } = setup();
	const late = Promise.withResolvers();
	requestFetch.mockReturnValueOnce(late.promise);
	const opened = await canvas.open({ instanceId: first, input: {} });
	const refresh = canvas.actions.find(
		(action) => action.name === "refresh",
	).handler;
	const cancel = canvas.actions.find(
		(action) => action.name === "cancel-refresh",
	).handler;
	expect(await refresh({ instanceId: first, input: {} })).toMatchObject({
		status: "loading",
	});
	await setImmediate();
	expect(requestFetch).toHaveBeenCalledTimes(1);
	expect(await cancel({ instanceId: first, input: {} })).toMatchObject({
		status: "cancelled",
	});
	expect(requestFetch.mock.calls[0][1].signal.aborted).toBe(true);
	late.resolve(response());
	await setImmediate();
	expect((await snapshot(opened.url)).pullRequest).toBeNull();
	await canvas.onClose({ instanceId: first });
	await expect(refresh({ instanceId: first, input: {} })).rejects.toThrow(
		"closed",
	);
});

test("only trusted in-process binding changes can select an account or PR", async () => {
	const { canvas, first, requestFetch } = setup();
	await expect(
		canvas.open({ instanceId: first, input: binding }),
	).rejects.toThrow("input");
	const opened = await canvas.open({ instanceId: first, input: {} });
	const origin = new URL(opened.url).origin;
	const endpoint = `${origin}/refresh/${first}`;
	expect((await fetch(`${origin}//[`)).status).toBe(404);
	expect((await fetch(opened.url)).status).toBe(200);
	for (const options of [
		{
			headers: {
				Origin: "https://example.com",
				"Content-Type": "application/json",
			},
		},
		{
			headers: { Origin: origin, "Content-Type": "application/json" },
			body: JSON.stringify(binding),
		},
		{ headers: { Origin: origin, "Content-Type": "text/plain" } },
	]) {
		expect((await fetch(endpoint, { method: "POST", ...options })).status).toBe(
			403,
		);
	}
	await expect
		.poll(async () => (await snapshot(opened.url)).status)
		.toBe("ready");
	canvas.setBinding(first, null);
	expect(await snapshot(opened.url)).toMatchObject({
		status: "unavailable",
		pullRequest: null,
		updatedAt: null,
	});
	expect(
		(
			await fetch(endpoint, {
				method: "POST",
				headers: { Origin: origin, "Content-Type": "application/json" },
			})
		).status,
	).toBe(409);
	expect(requestFetch).toHaveBeenCalledTimes(1);
});

test("binding replacement updates an open canvas and rejects old results", async () => {
	const { canvas, first, requestFetch } = setup();
	const late = Promise.withResolvers();
	requestFetch.mockReturnValueOnce(late.promise);
	const opened = await canvas.open({ instanceId: first, input: {} });
	await setImmediate();
	requestFetch.mockResolvedValueOnce(response(23));
	canvas.setBinding(first, { ...binding, pullRequestId: 23 });
	await expect
		.poll(async () => (await snapshot(opened.url)).pullRequest?.id)
		.toBe(23);
	late.resolve(response());
	await setImmediate();
	expect((await snapshot(opened.url)).pullRequest.id).toBe(23);
});

test("close during server startup is terminal and disposal closes the listener", async () => {
	const { canvas, first, requestFetch } = setup();
	const opening = canvas.open({ instanceId: first, input: {} });
	const rejected = expect(opening).rejects.toThrow("closed");
	await canvas.onClose({ instanceId: first });
	await rejected;
	expect(requestFetch).not.toHaveBeenCalled();
	const second = randomUUID();
	canvas.setBinding(second, binding);
	const opened = await canvas.open({ instanceId: second, input: {} });
	await canvas.dispose();
	await expect(fetch(opened.url)).rejects.toThrow();
	await expect(canvas.open({ instanceId: second, input: {} })).rejects.toThrow(
		"closed",
	);
	await canvas.dispose();
});
