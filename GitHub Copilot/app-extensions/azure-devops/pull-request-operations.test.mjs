// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createPullRequestClient } from "./pull-requests.mjs";

const repository = {
	organization: "fabrikam",
	project: "Project",
	repositoryId: "3411ebc1-d5aa-464f-9615-0b527bc66719",
	accountId: "selected-account",
};
const projectId = "a7573007-bbb3-4341-b726-0c4148a07853";
const reviewerId = "d6245f20-2af8-44f4-9451-8107cb2767db";
const baseCommitId = "a".repeat(40);
const sourceCommitId = "b".repeat(40);
const root = `/fabrikam/Project/_apis/git/repositories/${repository.repositoryId}`;
const prPath = `${root}/pullrequests/22`;
const buildPath = "/fabrikam/Project/_apis/build/builds";
const person = {
	id: reviewerId,
	displayName: "Reviewer",
	uniqueName: "private-email",
};
const comment = {
	id: 2,
	parentCommentId: 1,
	commentType: "text",
	content: "Hello",
	author: person,
};
const thread = {
	id: 7,
	status: "active",
	comments: [{ ...comment, id: 1, parentCommentId: 0 }],
};
const build = {
	id: 88,
	definition: { id: 9, name: "Validation" },
	project: { id: projectId, name: repository.project },
	repository: { id: repository.repositoryId, type: "TfsGit" },
	status: "completed",
	result: "failed",
	sourceBranch: "refs/pull/22/merge",
	sourceVersion: sourceCommitId,
	parameters: '{"private-token":"secret"}',
	url: "https://untrusted.example/private-token",
};
const anchor = {
	path: "/file.txt",
	side: "modified",
	startLine: 4,
	endLine: 5,
	baseCommitId,
	sourceCommitId,
	iterationId: 3,
	changeTrackingId: 9,
};

function setup(handler = () => undefined, beforeWrite) {
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "private-token" }),
	};
	const fetch = vi.fn(async (input, init) => {
		const url = new URL(input);
		const body = init.body ? JSON.parse(init.body) : undefined;
		const custom = await handler(url, init, body);
		if (custom !== undefined)
			return custom instanceof Response ? custom : Response.json(custom);
		if (url.pathname === prPath)
			return Response.json({
				pullRequestId: 22,
				repository: { id: repository.repositoryId },
				title: "PR",
				status: "active",
				sourceRefName: "refs/heads/topic",
				targetRefName: "refs/heads/main",
				...body,
			});
		if (url.pathname.endsWith("/iterations"))
			return Response.json({
				value: [
					{
						id: 3,
						commonRefCommit: { commitId: baseCommitId },
						sourceRefCommit: { commitId: sourceCommitId },
					},
				],
			});
		if (url.pathname.endsWith("/changes"))
			return Response.json({
				changeEntries: [
					{
						changeId: 4,
						changeTrackingId: 9,
						item: { path: "/file.txt" },
						changeType: "edit",
					},
				],
			});
		if (url.pathname.endsWith("/commits")) return Response.json({ value: [] });
		if (url.pathname.includes("/reviewers/"))
			return init.method === "DELETE"
				? new Response(null, { status: 204 })
				: Response.json({ ...person, vote: 5, isRequired: false, ...body });
		if (url.pathname.includes("/comments"))
			return Response.json({ ...comment, ...body });
		if (url.pathname.includes("/threads"))
			return Response.json({ ...thread, ...body });
		if (url.pathname.startsWith(buildPath))
			return Response.json({ ...build, ...body });
		throw new Error("Unexpected request");
	});
	return {
		client: createPullRequestClient({
			repository,
			authentication,
			fetch,
			beforeWrite,
		}),
		fetch,
		authentication,
	};
}

describe("caller-authorized Azure DevOps PR operations", () => {
	test("updates only supported fields, allowing empty descriptions and reactivation", async () => {
		const { client, fetch } = setup();
		expect(
			await client.update(22, {
				title: "New",
				description: "",
				draft: true,
				status: "active",
			}),
		).toMatchObject({ title: "New", description: "", state: "draft" });
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
			title: "New",
			description: "",
			isDraft: true,
			status: "active",
		});
	});

	test.each([
		{},
		{ status: "completed" },
		{ title: " " },
		{ draft: "true" },
		{ description: null },
		{ bypassPolicy: true },
	])("rejects unsupported updates before network: %j", async (input) => {
		const { client, fetch } = setup();
		await expect(client.update(22, input)).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});

	test("posts a general comment as a thread without invented inline context", async () => {
		const { client, fetch } = setup((url, init, body) =>
			init.method === "POST"
				? { ...thread, comments: [{ ...comment, ...body.comments[0] }] }
				: undefined,
		);
		expect(await client.createThread(22, { content: "Hello" })).toMatchObject({
			id: 7,
		});
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
			comments: [{ parentCommentId: 0, content: "Hello", commentType: 1 }],
			status: 1,
		});
	});

	test.each(["original", "modified"])(
		"maps verified %s inline source anchors to ADO's common-base iteration context",
		async (side) => {
			const apiSide = side === "original" ? "left" : "right";
			const { client, fetch } = setup((url, init, body) =>
				init.method === "POST"
					? {
							...thread,
							...body,
							comments: [{ ...comment, ...body.comments[0] }],
						}
					: undefined,
			);
			await client.createThread(22, {
				content: "Inline",
				anchor: { ...anchor, side },
			});
			const write = fetch.mock.calls.find(([, init]) => init.method === "POST");
			expect(JSON.parse(write[1].body)).toMatchObject({
				threadContext: {
					filePath: "/file.txt",
					[`${apiSide}FileStart`]: { line: 4, offset: 1 },
					[`${apiSide}FileEnd`]: { line: 5, offset: 1 },
				},
				pullRequestThreadContext: {
					changeTrackingId: 9,
					iterationContext: {
						firstComparingIteration: 3,
						secondComparingIteration: 3,
					},
				},
			});
		},
	);

	test.each([
		{ sourceCommitId: undefined },
		{ iterationId: undefined },
		{ changeTrackingId: 0 },
		{ side: "new" },
		{ side: "left" },
		{ side: "right" },
		{ startLine: 0 },
		{ endLine: 3 },
		{ path: "../file.txt" },
		{ selectedCommitId: sourceCommitId },
	])("rejects invalid inline anchors before network: %j", async (override) => {
		const { client, fetch } = setup();
		await expect(
			client.createThread(22, {
				content: "Hello",
				anchor: { ...anchor, ...override },
			}),
		).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		{ sourceCommitId: "c".repeat(40) },
		{ baseCommitId: "c".repeat(40) },
		{ iterationId: 4 },
		{ changeTrackingId: 7 },
		{ path: "/other.txt" },
	])(
		"refuses stale or foreign inline anchors without writing: %j",
		async (override) => {
			const { client, fetch } = setup();
			await expect(
				client.createThread(22, {
					content: "Hello",
					anchor: { ...anchor, ...override },
				}),
			).rejects.toThrow();
			expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(
				true,
			);
		},
	);

	test("replies under the server-fetched root comment and updates the exact comment", async () => {
		const { client, fetch } = setup();
		expect(await client.reply(22, 7, "Reply")).toMatchObject({
			id: 2,
			parentCommentId: 1,
			content: "Reply",
		});
		expect(await client.editComment(22, 7, 2, "Edited")).toMatchObject({
			id: 2,
			content: "Edited",
		});
		expect(await client.deleteComment(22, 7, 2)).toBeNull();
		const writes = fetch.mock.calls.filter(([, init]) => init.method !== "GET");
		expect(
			writes.map(([url, init]) => [
				new URL(url).pathname,
				init.method,
				init.body ? JSON.parse(init.body) : undefined,
			]),
		).toEqual([
			[
				`${prPath}/threads/7/comments`,
				"POST",
				{ content: "Reply", parentCommentId: 1, commentType: 1 },
			],
			[`${prPath}/threads/7/comments/2`, "PATCH", { content: "Edited" }],
			[`${prPath}/threads/7/comments/2`, "DELETE", undefined],
		]);
	});

	test.each(["active", "fixed", "wontFix", "closed", "byDesign", "pending"])(
		"preserves thread status %s",
		async (status) => {
			const { client, fetch } = setup();
			expect(await client.setThreadStatus(22, 7, status)).toMatchObject({
				id: 7,
				status,
			});
			expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status });
		},
	);

	test.each([-10, -5, 0, 5, 10])(
		"preserves ADO vote %s without changing required status",
		async (vote) => {
			const { client, fetch } = setup();
			expect(await client.vote(22, reviewerId, vote)).toMatchObject({
				id: reviewerId,
				vote,
			});
			expect(fetch.mock.calls[0][1].method).toBe("PUT");
			expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
				id: reviewerId,
				vote,
			});
		},
	);

	test("adds an optional reviewer through the identity-only collection endpoint and supports empty DELETE", async () => {
		const { client, fetch } = setup((url, init) =>
			url.pathname === `${prPath}/reviewers` && init.method === "POST"
				? [{ ...person, vote: 0, isRequired: false }]
				: undefined,
		);
		expect(
			await client.setReviewer(22, reviewerId, { isRequired: false }),
		).toMatchObject({ vote: 0, isRequired: false });
		expect(fetch.mock.calls[0][1].method).toBe("POST");
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([
			{ id: reviewerId },
		]);
		expect(await client.setReviewer(22, reviewerId, null)).toBeNull();
		expect(fetch.mock.calls[1][1].method).toBe("DELETE");
	});

	test("identity-only add preserves a concurrently present reviewer vote and role", async () => {
		const concurrent = { ...person, vote: 10, isRequired: true };
		const { client, fetch } = setup((url, init) =>
			url.pathname === `${prPath}/reviewers` && init.method === "POST"
				? [concurrent]
				: undefined,
		);
		await expect(
			client.setReviewer(22, reviewerId, { isRequired: false }),
		).resolves.toMatchObject({
			id: reviewerId,
			vote: 10,
			isRequired: true,
		});
		expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(["POST"]);
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([
			{ id: reviewerId },
		]);
		expect(concurrent).toMatchObject({ vote: 10, isRequired: true });
	});

	test("rejects required reviewer adds before transport", async () => {
		const { client, fetch } = setup();
		await expect(
			client.setReviewer(22, reviewerId, { isRequired: true }),
		).rejects.toThrow("Adding required reviewers is not supported");
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		(client) => client.vote(22, reviewerId, 1),
		(client) => client.vote(22, "../reviewer", 10),
		(client) => client.setReviewer(22, reviewerId, { isRequired: "true" }),
		(client) => client.setReviewer(22, reviewerId, { vote: 10 }),
		(client) => client.setThreadStatus(22, 7, "resolved"),
		(client) => client.editComment(22, 7, 0, "Hello"),
		(client) => client.deleteComment(22, 7, 0),
		(client) => client.reply(22, 7, " "),
	])("validates arguments before requests", async (call) => {
		const { client, fetch } = setup();
		await expect(call(client)).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("explicit Azure DevOps build operations", () => {
	test("normalizes build details and never forwards response URLs or private fields", async () => {
		const { client } = setup();
		expect(await client.getBuild(88)).toEqual({
			id: 88,
			definitionId: 9,
			name: "Validation",
			status: "completed",
			result: "failed",
			sourceBranch: "refs/pull/22/merge",
			sourceVersion: sourceCommitId,
			url: "https://dev.azure.com/fabrikam/Project/_build/results?buildId=88",
		});
	});

	test("retry queues fetched definition and immutable source as a new manual build, not a policy rerun", async () => {
		const { client, fetch } = setup((url, init, body) =>
			init.method === "POST"
				? {
						...build,
						...body,
						id: 89,
						definition: build.definition,
						status: "notStarted",
						result: undefined,
					}
				: undefined,
		);
		expect(await client.retryBuild(88)).toMatchObject({
			id: 89,
			status: "notStarted",
		});
		expect(
			fetch.mock.calls.map(([url, init]) => [
				new URL(url).pathname,
				init.method,
			]),
		).toEqual([
			[`${buildPath}/88`, "GET"],
			[buildPath, "POST"],
		]);
		expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
			definition: { id: 9 },
			sourceBranch: "refs/pull/22/merge",
			sourceVersion: sourceCommitId,
		});
	});

	test("cancels a verified in-progress build with the documented cancelling state", async () => {
		const { client, fetch } = setup((url, init, body) =>
			url.pathname.startsWith(buildPath)
				? { ...build, status: "inProgress", ...body }
				: undefined,
		);
		expect(await client.cancelBuild(88)).toMatchObject({
			id: 88,
			status: "cancelling",
		});
		expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
			status: "cancelling",
		});
	});

	test.each([
		{ id: 89 },
		{ repository: { id: "wrong", type: "TfsGit" } },
		{ project: { id: projectId, name: "Other" } },
		{ sourceVersion: "main" },
		{ definition: {} },
	])(
		"refuses mismatched build identity/properties before writes: %j",
		async (override) => {
			const { client, fetch } = setup(() => ({ ...build, ...override }));
			await expect(client.retryBuild(88)).rejects.toThrow();
			expect(fetch).toHaveBeenCalledTimes(1);
		},
	);

	test("refuses retry of running or cancel of completed builds", async () => {
		const { client, fetch } = setup();
		await expect(client.cancelBuild(88)).rejects.toThrow();
		expect(fetch).toHaveBeenCalledTimes(1);
		const running = setup(() => ({ ...build, status: "inProgress" }));
		await expect(running.client.retryBuild(88)).rejects.toThrow();
		expect(running.fetch).toHaveBeenCalledTimes(1);
	});

	test("does not accept a queued build for a different definition or revision", async () => {
		const { client, fetch } = setup((url, init) =>
			init.method === "POST"
				? { ...build, id: 89, definition: { id: 99, name: "Other" } }
				: undefined,
		);
		await expect(client.retryBuild(88)).rejects.toThrow();
		expect(
			fetch.mock.calls.filter(([, init]) => init.method === "POST"),
		).toHaveLength(1);
	});
});

describe("new operation request safety", () => {
	const calls = [
		(client, options) => client.update(22, { title: "New" }, options),
		(client, options) => client.createThread(22, { content: "Hello" }, options),
		(client, options) => client.reply(22, 7, "Hello", options),
		(client, options) => client.editComment(22, 7, 2, "Hello", options),
		(client, options) => client.deleteComment(22, 7, 2, options),
		(client, options) => client.setThreadStatus(22, 7, "fixed", options),
		(client, options) => client.vote(22, reviewerId, 10, options),
		(client, options) => client.setReviewer(22, reviewerId, null, options),
		(client, options) => client.setReviewer(22, reviewerId, {}, options),
		(client, options) => client.getBuild(88, options),
		(client, options) => client.retryBuild(88, options),
		(client, options) => client.cancelBuild(88, options),
	];
	test.each(calls)("cancels before requesting data", async (call) => {
		const { client, fetch } = setup();
		await expect(
			call(client, { signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).not.toHaveBeenCalled();
	});

	describe("provider-local last-moment write authorization", () => {
		const prerequisiteWrites = [
			["reply", (client, options) => client.reply(22, 7, "Reply", options)],
			[
				"inline",
				(client, options) =>
					client.createThread(22, { content: "Inline", anchor }, options),
			],
			["retry", (client, options) => client.retryBuild(88, options)],
			["cancel", (client, options) => client.cancelBuild(88, options)],
		];
		test.each(prerequisiteWrites)(
			"rechecks authorization after %s prerequisites and preserves hook failure",
			async (name, call) => {
				let authorized = true;
				const denial = new Error("Grant was revoked");
				const beforeWrite = vi.fn(async () => {
					if (!authorized) throw denial;
				});
				const { client, fetch } = setup((url, init) => {
					if (init.method === "GET") authorized = false;
					if (name === "cancel" && url.pathname.startsWith(buildPath))
						return { ...build, status: "inProgress" };
				}, beforeWrite);
				await expect(call(client)).rejects.toBe(denial);
				expect(fetch.mock.calls.length).toBeGreaterThan(0);
				expect(
					fetch.mock.calls.every(([, init]) => init.method === "GET"),
				).toBe(true);
				expect(beforeWrite).toHaveBeenCalledOnce();
			},
		);

		test("checks every non-GET including legacy operations before transport", async () => {
			const denial = new Error("No write grant");
			const calls = [
				(client) => client.update(22, { title: "Title" }),
				(client) => client.createThread(22, { content: "Comment" }),
				(client) => client.editComment(22, 7, 2, "Edit"),
				(client) => client.deleteComment(22, 7, 2),
				(client) => client.setThreadStatus(22, 7, "fixed"),
				(client) => client.vote(22, reviewerId, 5),
				(client) => client.setReviewer(22, reviewerId, null),
				(client) => client.setReviewer(22, reviewerId, {}),
				(client) =>
					client.create({
						title: "Title",
						sourceRef: "refs/heads/topic",
						targetRef: "refs/heads/main",
					}),
				(client) =>
					client.complete(22, {
						sourceCommitId,
						mergeStrategy: "squash",
						title: "PR title",
					}),
				(client) => client.abandon(22),
			];
			for (const call of calls) {
				const beforeWrite = vi.fn(async (signal) => {
					expect(signal).toBeInstanceOf(AbortSignal);
					throw denial;
				});
				const { client, fetch } = setup(undefined, beforeWrite);
				await expect(call(client)).rejects.toBe(denial);
				expect(beforeWrite).toHaveBeenCalledOnce();
				expect(fetch).not.toHaveBeenCalled();
			}
		});

		test("passes reads through without calling the write hook", async () => {
			const beforeWrite = vi.fn(async () => {
				throw new Error("No write grant");
			});
			const { client } = setup(undefined, beforeWrite);
			await client.get(22);
			await client.getChanges(22);
			await client.getBuild(88);
			expect(beforeWrite).not.toHaveBeenCalled();
		});

		test("runs an allowed hook immediately before fetch", async () => {
			const order = [];
			let hookSignal;
			const { client, fetch } = setup(
				() => {
					order.push("fetch");
				},
				async (signal) => {
					order.push("authorize");
					hookSignal = signal;
				},
			);
			await client.update(22, { title: "Authorized" });
			expect(order).toEqual(["authorize", "fetch"]);
			expect(fetch.mock.calls[0][1].signal).toBe(hookSignal);
		});

		test.each([new Error("Denied"), "Denied"])(
			"preserves hook failures across nested readers and permits an explicit later attempt",
			async (denial) => {
				const beforeWrite = vi
					.fn()
					.mockRejectedValueOnce(denial)
					.mockResolvedValueOnce(undefined);
				const { client, fetch } = setup(undefined, beforeWrite);
				await expect(client.reply(22, 7, "Reply")).rejects.toBe(denial);
				expect(
					fetch.mock.calls.filter(([, init]) => init.method !== "GET"),
				).toHaveLength(0);
				await client.reply(22, 7, "Reply");
				expect(beforeWrite).toHaveBeenCalledTimes(2);
				expect(
					fetch.mock.calls.filter(([, init]) => init.method !== "GET"),
				).toHaveLength(1);
			},
		);

		test("cancels a pending hook promptly and cannot write when it later resolves", async () => {
			const pending = Promise.withResolvers();
			const entered = Promise.withResolvers();
			const controller = new AbortController();
			let hookSignal;
			const { client, fetch } = setup(undefined, async (signal) => {
				hookSignal = signal;
				entered.resolve();
				await pending.promise;
			});
			const result = client.update(
				22,
				{ title: "Title" },
				{ signal: controller.signal },
			);
			const rejection = expect(result).rejects.toMatchObject({
				name: "AbortError",
			});
			await entered.promise;
			controller.abort();
			await rejection;
			expect(hookSignal.aborted).toBe(true);
			pending.resolve();
			await Promise.resolve();
			expect(fetch).not.toHaveBeenCalled();
		});

		test("request timeout bounds the hook and cannot write after a late authorization", async () => {
			vi.useFakeTimers();
			const timeout = new AbortController();
			vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
			try {
				const pending = Promise.withResolvers();
				const entered = Promise.withResolvers();
				const { client, fetch } = setup(undefined, async () => {
					entered.resolve();
					await pending.promise;
				});
				const result = client.update(22, { title: "Title" });
				const rejection = expect(result).rejects.toMatchObject({
					name: "TimeoutError",
				});
				await entered.promise;
				timeout.abort(new DOMException("Timed out", "TimeoutError"));
				await rejection;
				pending.resolve();
				await Promise.resolve();
				expect(fetch).not.toHaveBeenCalled();
				expect(AbortSignal.timeout).toHaveBeenCalledWith(30_000);
			} finally {
				vi.restoreAllMocks();
				vi.useRealTimers();
			}
		});
	});
	test.each(calls)(
		"cancels after responses without continuing",
		async (call) => {
			for (const stage of ["response"]) {
				const controller = new AbortController();
				const { client, fetch } = setup(() => {
					if (stage === "response") controller.abort();
				});
				await expect(
					call(client, { signal: controller.signal }),
				).rejects.toMatchObject({ name: "AbortError" });
				expect(fetch).toHaveBeenCalledTimes(1);
			}
		},
	);
	test.each(calls.filter((_, index) => index !== 8 && index !== 9))(
		"does not retry a failed write after any prerequisite reads",
		async (call) => {
			const { client, fetch } = setup((url, init) => {
				if (init.method !== "GET")
					return new Response("private-token", { status: 503 });
				if (url.pathname.startsWith(buildPath))
					return {
						...build,
						status: call === calls.at(-1) ? "inProgress" : "completed",
					};
			});
			await expect(call(client)).rejects.toMatchObject({ status: 503 });
			expect(
				fetch.mock.calls.filter(([, init]) => init.method !== "GET"),
			).toHaveLength(1);
		},
	);
	test.each(calls)(
		"sanitizes HTTP and network failure without retry",
		async (call) => {
			const { client, fetch } = setup(
				() => new Response("private-token", { status: 503 }),
			);
			await expect(call(client)).rejects.toMatchObject({ status: 503 });
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch.mock.calls[0][1]).toMatchObject({
				redirect: "error",
				signal: expect.any(AbortSignal),
			});
			const failing = setup(() => {
				throw new TypeError("private-token");
			});
			await expect(call(failing.client)).rejects.toThrow(
				"Azure DevOps PR content request failed.",
			);
			expect(failing.fetch).toHaveBeenCalledTimes(1);
		},
	);
});
