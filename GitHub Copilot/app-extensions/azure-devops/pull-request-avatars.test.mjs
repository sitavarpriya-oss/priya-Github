// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import { createAvatarCache } from "./pull-request-avatars.mjs";
import { createPullRequestClient } from "./pull-requests.mjs";
import { bearerRequestInit } from "./request.mjs";

const repository = {
	organization: "example",
	project: "tools",
	repositoryId: "repo",
	accountId: "account",
};
const url =
	"https://dev.azure.com/example/_apis/GraphProfile/MemberAvatars/aad.person";
const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const accessToken = "fixture-token";
const authentication = {
	getAccessToken: async () => ({ accessToken }),
};

/** Fake ADO transport: asserts the bearer seam, then routes to `handler`. */
function bearerFetch(handler) {
	return vi.fn(async (input, { headers, ...init }) => {
		const { Authorization, ...visible } = headers;
		expect(Authorization).toBe(`Bearer ${accessToken}`);
		expect(init.redirect).toBe("error");
		expect(headers["User-Agent"]).toBe("ADOGithubApp");
		return handler(String(input), { ...init, headers: visible });
	});
}

test("cancelling a streamed photo closes its body without waiting for the rest", async () => {
	let cancelled = false;
	const response = new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(png);
			},
			cancel() {
				cancelled = true;
			},
		}),
		{ headers: { "content-type": "image/png" } },
	);
	const client = createPullRequestClient({
		repository,
		authentication,
		fetch: bearerFetch(async () => response),
	});
	const controller = new AbortController();
	const photo = client.getAvatar(url, { signal: controller.signal });
	const rejected = expect(photo).rejects.toThrow();
	await vi.waitFor(() => expect(response.body.locked).toBe(true));
	controller.abort();
	await rejected;
	expect(cancelled).toBe(true);
});

test("avatar reads use the selected account token, image Accept headers and canonical same-org URLs", async () => {
	const getAccessToken = vi.fn(async () => ({ accessToken }));
	const fetch = bearerFetch(
		async () =>
			new Response(png, {
				headers: { "content-type": "image/png; api-version=7.1" },
			}),
	);
	const client = createPullRequestClient({
		repository,
		authentication: { getAccessToken },
		fetch,
	});
	const photo = await client.getAvatar(
		`${url}?size=large&untrusted=drop#fragment`,
	);
	expect(photo).toEqual({
		content: new Uint8Array(png),
		contentType: "image/png",
	});
	expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({
		accountId: "account",
		resource: "azure-devops",
	});
	expect(fetch).toHaveBeenCalledWith(
		url,
		expect.objectContaining({
			method: "GET",
			headers: expect.objectContaining({
				Accept: "image/png,image/jpeg,image/gif,image/webp",
			}),
		}),
	);
	expect(fetch.mock.calls[0][1]).not.toHaveProperty("responseType");
	for (const candidate of [
		"https://evil.example/photo",
		url.replace("/example/", "/another/"),
		url.replace("https:", "http:"),
		url.replace("dev.azure.com", "user:password@dev.azure.com"),
		"https://dev.azure.com/example/_apis/git/repositories",
		`${url}/extra`,
		"javascript:alert(1)",
	])
		await expect(client.getAvatar(candidate)).rejects.toThrow();
	expect(getAccessToken).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
	"https://evil.example/example/_apis/GraphProfile/MemberAvatars/aad.person",
	"http://dev.azure.com/example/_apis/GraphProfile/MemberAvatars/aad.person",
	"https://dev.azure.com.evil.example/example/_apis/GraphProfile/MemberAvatars/aad.person",
	"https://user:password@dev.azure.com/example/_apis/GraphProfile/MemberAvatars/aad.person",
])(
	"never attaches the bearer token to a foreign image origin: %s",
	(target) => {
		const init = {
			method: "GET",
			headers: { Accept: "image/png" },
		};
		expect(() => bearerRequestInit(target, init, accessToken)).toThrow(
			"Azure DevOps request URL is not allowed.",
		);
		expect(init.headers).not.toHaveProperty("Authorization");
	},
);

test.each([
	"https://dev.azure.com/example/_apis/GraphProfile/MemberAvatars/aad.person",
	"https://vssps.dev.azure.com/example/_apis/graph/users",
	"https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
])(
	"attaches the bearer token and app user agent without following redirects for %s",
	(target) => {
		expect(
			bearerRequestInit(
				target,
				{ method: "GET", headers: { Accept: "image/png" } },
				accessToken,
			),
		).toEqual({
			method: "GET",
			redirect: "error",
			headers: {
				Accept: "image/png",
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "ADOGithubApp",
			},
		});
	},
);

test.each(["GET", "POST", "PATCH", "PUT", "DELETE"])(
	"preserves %s request options while setting the app user agent",
	(method) => {
		const signal = new AbortController().signal;
		const init = {
			method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"User-Agent": "caller-agent",
			},
			body: JSON.stringify({ title: "Example" }),
			signal,
		};
		const result = bearerRequestInit(url, init, accessToken);
		expect(result).toEqual({
			...init,
			redirect: "error",
			headers: {
				...init.headers,
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "ADOGithubApp",
			},
		});
		expect(result.signal).toBe(signal);
		expect(init.headers["User-Agent"]).toBe("caller-agent");
		expect(init.headers).not.toHaveProperty("Authorization");
	},
);

test.each([
	["image/svg+xml", png],
	["text/html", png],
	["image/png", Buffer.from("<svg/>")],
	["image/png", Buffer.alloc(256 * 1024 + 1)],
])(
	"rejects unsupported or oversized avatar payloads (%s)",
	async (contentType, content) => {
		const client = createPullRequestClient({
			repository,
			authentication,
			fetch: bearerFetch(
				async () =>
					new Response(content, { headers: { "content-type": contentType } }),
			),
		});
		await expect(client.getAvatar(url)).rejects.toThrow();
	},
);

test("deduplicates photos, bounds concurrency and cache, and drains queued healthy work", async () => {
	let active = 0;
	let peak = 0;
	const releases = [];
	const load = vi.fn(async (key) => {
		active++;
		peak = Math.max(peak, active);
		await new Promise((resolve) => releases.push(resolve));
		active--;
		return key;
	});
	const cache = createAvatarCache(load);
	const first = cache.get("one");
	expect(cache.get("one")).toBe(first);
	const rest = ["two", "three", "four"].map((key) => cache.get(key));
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
	releases.shift()();
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(4));
	for (const release of releases) release();
	expect(await Promise.all([first, ...rest])).toEqual([
		"one",
		"two",
		"three",
		"four",
	]);
	expect(peak).toBe(3);
	expect(await cache.get("one")).toBe("one");
	expect(load).toHaveBeenCalledTimes(4);
	cache.clear();
});

test("binding teardown cancels active and queued photos without waiting for a stalled transport", async () => {
	const load = vi.fn(() => new Promise(() => {}));
	const cache = createAvatarCache(load);
	const requests = ["one", "two", "three", "four"].map((key) => cache.get(key));
	const outcomes = Promise.allSettled(requests);
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
	cache.clear();
	expect((await outcomes).every((result) => result.status === "rejected")).toBe(
		true,
	);
	load.mockImplementation(async () => "new binding");
	expect(await cache.get("new")).toBe("new binding");
	expect(load).toHaveBeenCalledTimes(4);
});

test("failed reads have bounded negative caching", async () => {
	vi.useFakeTimers();
	try {
		const load = vi.fn(async () => {
			throw new Error("Photo unavailable");
		});
		const cache = createAvatarCache(load);
		await expect(cache.get("photo")).rejects.toThrow("Photo unavailable");
		await expect(cache.get("photo")).rejects.toThrow("Photo unavailable");
		expect(load).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(30_001);
		await expect(cache.get("photo")).rejects.toThrow("Photo unavailable");
		expect(load).toHaveBeenCalledTimes(2);
		cache.clear();
	} finally {
		vi.useRealTimers();
	}
});

test("stalled reads time out and cache capacity evicts older completed photos", async () => {
	vi.useFakeTimers();
	const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
		const controller = new AbortController();
		setTimeout(
			() =>
				controller.abort(new DOMException("Photo timed out", "TimeoutError")),
			ms,
		);
		return controller.signal;
	});
	try {
		const load = vi.fn(() => new Promise(() => {}));
		const cache = createAvatarCache(load);
		const outcomes = Promise.allSettled(
			["one", "two", "three", "four"].map((key) => cache.get(key)),
		);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(
			(await outcomes).every((result) => result.status === "rejected"),
		).toBe(true);
		expect(timeout).toHaveBeenCalledWith(30_000);
		load.mockImplementation(async (key) => key);
		cache.clear();
		for (let index = 0; index < 130; index++) await cache.get(String(index));
		const calls = load.mock.calls.length;
		await cache.get("129");
		expect(load).toHaveBeenCalledTimes(calls);
		await cache.get("0");
		expect(load).toHaveBeenCalledTimes(calls + 1);
		cache.clear();
	} finally {
		timeout.mockRestore();
		vi.useRealTimers();
	}
});

test("production linked binding rejects an old photo while a new binding remains readable", async () => {
	const repo = {
		...repository,
		repositoryId: "11111111-1111-4111-8111-111111111111",
	};
	const photo = Promise.withResolvers();
	let reads = 0;
	let stalled = true;
	const linked = createLinkedPullRequest({
		authentication,
		fetch: bearerFetch(async (requestUrl) => {
			const path = new URL(requestUrl).pathname;
			if (path.includes("MemberAvatars")) {
				reads++;
				return stalled
					? photo.promise
					: new Response(png, { headers: { "content-type": "image/png" } });
			}
			if (path.endsWith("/pullrequests/22"))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repo.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Photo fixture",
					status: "active",
					sourceRefName: "refs/heads/a",
					targetRefName: "refs/heads/b",
					reviewers: [],
				});
			if (path.endsWith("/threads"))
				return Response.json({
					value: [
						{
							id: 1,
							status: "active",
							comments: [
								{
									id: 1,
									content: "Hello",
									author: {
										id: "person",
										displayName: "Person",
										imageUrl: url,
									},
								},
							],
						},
					],
				});
			return Response.json({ value: [] });
		}),
	});
	try {
		linked.setBinding({ repository: repo, pullRequestId: 22 });
		await linked.refresh();
		await linked.loadOverview();
		const oldRevision = linked.getSnapshot().bindingRevision;
		const pending = linked.getAvatar(oldRevision, 1, 1);
		const rejected = expect(pending).rejects.toThrow();
		await vi.waitFor(() => expect(reads).toBe(1));
		linked.setBinding({ repository: repo, pullRequestId: 22 });
		await rejected;
		stalled = false;
		await linked.refresh();
		await linked.loadOverview();
		photo.resolve(
			new Response(png, { headers: { "content-type": "image/png" } }),
		);
		await expect(linked.getAvatar(oldRevision, 1, 1)).rejects.toThrow(
			"unavailable",
		);
		expect(
			(await linked.getAvatar(linked.getSnapshot().bindingRevision, 1, 1))
				.content,
		).toEqual(new Uint8Array(png));
		expect(reads).toBe(2);
	} finally {
		photo.resolve(
			new Response(png, { headers: { "content-type": "image/png" } }),
		);
		linked.dispose();
	}
});
