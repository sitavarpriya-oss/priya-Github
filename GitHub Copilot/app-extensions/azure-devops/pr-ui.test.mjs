// @vitest-environment node
import assert from "node:assert/strict";
import { getHost } from "@github/copilot-app";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import activate from "./app.mjs";
import { createPullRequestUi } from "./pr-ui.mjs";

vi.mock("@github/copilot-app", () => ({ getHost: vi.fn() }));

const viewerId = "d6245f20-2af8-44f4-9451-8107cb2767db";

test("Create capability discovery needs only the repository origin and never queries PRs", async () => {
	const fetch = vi.fn(() => {
		throw new Error("Capability discovery must not use HTTP");
	});
	vi.stubGlobal("fetch", fetch);
	onTestFinished(() => vi.unstubAllGlobals());
	const ui = createPullRequestUi(undefined);
	onTestFinished(() => ui.dispose());
	const state = await ui.read(
		{
			originUrl: "https://dev.azure.com/org/project/_git/repo",
			sourceRef: "",
			targetRef: "",
			title: "",
		},
		{ authenticated: false },
	);
	expect(state.status).toBe("ready");
	expect(state.contributions.map((entry) => entry.slot)).toEqual([
		"pr.create",
		"pr.create",
	]);
	expect(fetch).not.toHaveBeenCalled();
});

describe("Native review submission", () => {
	const repositoryId = "3411ebc1-d5aa-464f-9615-0b527bc66719";
	const headSha = "b".repeat(40);
	const baseSha = "a".repeat(40);
	const context = {
		originUrl: "https://dev.azure.com/org/project/_git/repo",
		associatedUri: `https://dev.azure.com/org/project/_git/${repositoryId}/pullrequest/17`,
		sourceRef: "refs/heads/change",
		targetRef: "refs/heads/main",
		title: "A change",
	};
	const inline = {
		path: "/file.txt",
		side: "RIGHT",
		startLine: 2,
		line: 3,
		body: "Inline feedback",
	};

	function setup(
		override = () => undefined,
		draft = false,
		authentication = fixtureAuthentication(),
	) {
		let posted = 0;
		const fetch = vi.fn(async (request) => {
			expect(request.resource).toBe("azure-devops");
			expect(new Headers(request.init.headers).has("authorization")).toBe(
				false,
			);
			const url = new URL(request.url);
			const { method } = request.init;
			const body = request.init.body
				? JSON.parse(request.init.body)
				: undefined;
			const custom = await override(url, method, body);
			if (custom !== undefined) return custom;
			if (/\/repositories\/[^/]+$/.test(url.pathname))
				return Response.json({ id: repositoryId, name: "repo" });
			if (url.pathname.endsWith("/pullrequests/17"))
				return Response.json({
					pullRequestId: 17,
					repository: { id: repositoryId },
					createdBy: { id: "a6245f20-2af8-44f4-9451-8107cb2767db" },
					title: context.title,
					sourceRefName: context.sourceRef,
					targetRefName: context.targetRef,
					status: "active",
					isDraft: draft,
					lastMergeSourceCommit: { commitId: headSha },
				});
			if (url.pathname.endsWith("/connectionData")) {
				expect(method).toBe("GET");
				expect(url.searchParams.get("api-version")).toBe("7.1-preview.1");
				return Response.json({ authenticatedUser: { id: viewerId } });
			}
			if (url.pathname.endsWith("/iterations"))
				return Response.json({
					value: [
						{
							id: 3,
							commonRefCommit: { commitId: baseSha },
							sourceRefCommit: { commitId: headSha },
						},
					],
				});
			if (url.pathname.endsWith("/changes"))
				return Response.json({
					changeEntries: [
						{
							changeId: 1,
							changeTrackingId: 9,
							item: { path: inline.path },
							changeType: "edit",
						},
					],
				});
			if (
				url.pathname.endsWith("/commits") ||
				url.pathname.endsWith("/statuses")
			)
				return Response.json({ value: [] });
			if (url.pathname.endsWith("/items"))
				return Response.json({
					path: url.searchParams.get("path"),
					commitId: url.searchParams.get("versionDescriptor.version"),
					gitObjectType: "blob",
					contentMetadata: { isBinary: false },
					content: "first\nsecond\nthird\n",
				});
			if (url.pathname.endsWith("/threads") && method === "POST") {
				posted++;
				return Response.json({
					...body,
					id: posted,
					comments: body.comments.map((comment) => ({
						...comment,
						id: 1,
						author: { id: viewerId, displayName: "Reviewer" },
					})),
				});
			}
			if (url.pathname.endsWith(`/reviewers/${viewerId}`) && method === "PUT")
				return Response.json({
					...body,
					displayName: "Reviewer",
					isRequired: false,
				});
			throw new Error(`Unexpected ${method} ${url.pathname}`);
		});
		stubBearerFetch((request) =>
			fetch({ ...request, resource: "azure-devops" }),
		);
		const changed = vi.fn();
		const ui = createPullRequestUi(authentication, changed);
		const markMutationDispatched = vi.fn();
		const submit = (input, ctx = context) =>
			ui.actions
				.find((action) => action.name === "submit-review")
				.handler(
					input && input.inlineComments?.length
						? { sourceCommitId: headSha, ...input }
						: input,
					ctx,
					{ markMutationDispatched },
				);
		const writes = () =>
			fetch.mock.calls
				.map(([request]) => request)
				.filter(({ init }) => init.method !== "GET");
		return { ui, fetch, submit, writes, markMutationDispatched, changed };
	}

	test("Comment publishes general and staged inline threads without touching the vote or PR status", async () => {
		const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
		onTestFinished(() => diagnostic.mockRestore());
		const { ui, fetch, submit, writes, markMutationDispatched, changed } =
			setup();
		const state = await ui.read(context);
		expect(state.review.defaultOptionId).toBe("comment");
		expect(state.review.options.map(({ id }) => id)).toEqual([
			"comment",
			"approve",
			"approve-with-suggestions",
			"wait-for-author",
			"reject",
		]);
		const result = await submit({
			decision: "comment",
			body: "General feedback",
			inlineComments: [inline],
		});
		expect(result.contributions[0].state).toBe("open");
		expect(writes()).toHaveLength(2);
		expect(writes().every(({ init }) => init.method === "POST")).toBe(true);
		expect(writes().map(({ init }) => JSON.parse(init.body))).toMatchObject([
			{ comments: [{ content: "General feedback" }] },
			{
				comments: [{ content: inline.body }],
				threadContext: {
					filePath: inline.path,
					rightFileStart: { line: 2, offset: 1 },
					rightFileEnd: { line: 3, offset: 1 },
				},
				pullRequestThreadContext: {
					changeTrackingId: 9,
					iterationContext: {
						firstComparingIteration: 3,
						secondComparingIteration: 3,
					},
				},
			},
		]);
		expect(fetch.mock.calls.some(([{ url }]) => /reviewers/.test(url))).toBe(
			false,
		);
		expect(
			fetch.mock.calls
				.filter(([{ url }]) => url.includes("/connectionData"))
				.map(([{ init }]) => init.method),
		).toEqual(["GET", "GET"]);
		expect(markMutationDispatched).toHaveBeenCalledTimes(2);
		expect(changed).toHaveBeenCalledExactlyOnceWith(
			{ organization: "org", repositoryId, pullRequestId: 17 },
			false,
		);
		expect(diagnostic).not.toHaveBeenCalled();
	});

	test.each(["comment", "approve"])(
		"saved-URI-only context publishes %s with general and inline feedback",
		async (decision) => {
			const { submit, writes, markMutationDispatched } = setup();
			const result = await submit(
				{ decision, body: "General feedback", inlineComments: [inline] },
				{
					originUrl: context.associatedUri,
					associatedUri: context.associatedUri,
					sourceRef: "",
					targetRef: "",
					title: "",
				},
			);
			const expectedWrites = decision === "comment" ? 2 : 3;
			expect(writes()).toHaveLength(expectedWrites);
			expect(markMutationDispatched).toHaveBeenCalledTimes(expectedWrites);
			expect(
				writes()
					.slice(0, 2)
					.map(({ init }) => JSON.parse(init.body)),
			).toMatchObject([
				{ comments: [{ content: "General feedback" }] },
				{ comments: [{ content: inline.body }] },
			]);
			if (decision === "approve") {
				expect(JSON.parse(writes()[2].init.body)).toMatchObject({ vote: 10 });
			}
			expect(result.contributions[0]).toMatchObject({
				number: 17,
				state: "open",
			});
		},
	);

	test.each([
		"https://dev.azure.com/org/project/_git/repo/pullrequest/17?_a=files#review",
		"https://org.visualstudio.com/project/_git/repo/pullrequest/17?_a=files#review",
	])(
		"review completion refreshes checks and retains the exact saved URI: %s",
		async (uri) => {
			const { submit, fetch, writes } = setup((url) =>
				url.pathname.endsWith("/statuses")
					? Response.json({
							value: [
								{
									id: 1,
									state: "failed",
									context: { genre: "ci", name: "build" },
								},
							],
						})
					: undefined,
			);
			const result = await submit(
				{ decision: "comment", body: "Feedback", inlineComments: [] },
				{ ...context, associatedUri: uri },
			);
			expect(result.error).toBeNull();
			expect(result.viewerIsAuthor).toBe(false);
			expect(result.contributions[0]).toMatchObject({
				url: uri,
				checksSummary: { total: 1, success: 0, failure: 1, pending: 0 },
			});
			expect(writes()).toHaveLength(1);
			const writeIndex = fetch.mock.calls.findIndex(
				([{ init }]) => init.method === "POST",
			);
			expect(
				fetch.mock.calls
					.slice(writeIndex + 1)
					.some(
						([{ url, init }]) =>
							init.method === "GET" &&
							new URL(url).pathname.endsWith("/pullrequests/17"),
					),
			).toBe(true);
		},
	);

	test.each(["primary", "checks"])(
		"confirmed review reports failed post-action %s reads without replaying the write",
		async (failure) => {
			let written = false;
			const { submit, writes } = setup((url, method) => {
				if (method === "POST") written = true;
				if (
					written &&
					url.pathname.endsWith(
						failure === "primary" ? "/pullrequests/17" : "/statuses",
					)
				)
					return new Response("Unavailable", { status: 503 });
				return undefined;
			});
			const uri = "https://dev.azure.com/org/project/_git/repo/pullrequest/17";
			const result = await submit(
				{ decision: "comment", body: "Feedback", inlineComments: [] },
				{ ...context, associatedUri: uri },
			);
			expect(result.error).toBeTruthy();
			expect(result.contributions[0]).toMatchObject({
				number: 17,
				state: "open",
				url: uri,
			});
			expect(result.contributions[0].checksSummary).toBeUndefined();
			expect(writes()).toHaveLength(1);
		},
	);

	test("publishing a draft returns fresh checks and authorship", async () => {
		let draft = true;
		const { ui, writes } = setup((url, method, body) => {
			if (url.pathname.endsWith("/pullrequests/17")) {
				if (method === "PATCH") draft = body.isDraft;
				return Response.json({
					...pullRequestRecord("active"),
					isDraft: draft,
				});
			}
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [
						{
							id: 1,
							state: "pending",
							context: { genre: "ci", name: "build" },
						},
					],
				});
			return undefined;
		});
		const result = await ui.actions
			.find(({ name }) => name === "set-draft")
			.handler({ draft: false }, context, { markMutationDispatched: vi.fn() });
		expect(result.error).toBeNull();
		expect(result.viewerIsAuthor).toBe(true);
		expect(result.contributions[0]).toMatchObject({
			url: context.associatedUri,
			state: "open",
			checksSummary: { total: 1, success: 0, failure: 0, pending: 1 },
		});
		expect(writes()).toHaveLength(1);
	});

	test.each([
		[false, false],
		[false, true],
		[true, false],
		[true, true],
	])(
		"read reports account-bound ownership (associated-only %s, author %s)",
		async (associatedOnly, author) => {
			const { ui, writes } = setup((url) =>
				url.pathname.endsWith("/connectionData")
					? Response.json({
							authenticatedUser: {
								id: author ? "A6245F20-2AF8-44F4-9451-8107CB2767DB" : viewerId,
							},
						})
					: undefined,
			);
			const state = associatedOnly
				? await ui.readAssociated(context.associatedUri)
				: await ui.read(context);
			expect(state.viewerIsAuthor).toBe(author);
			expect(state.error).toBeNull();
			expect(writes()).toEqual([]);
		},
	);

	test("an identity lookup failure preserves PR presentation without claiming ownership", async () => {
		const { ui, writes } = setup((url) =>
			url.pathname.endsWith("/connectionData")
				? Response.json({}, { status: 403 })
				: undefined,
		);
		const state = await ui.read(context);
		expect(state.viewerIsAuthor).toBeUndefined();
		expect(state.error).toContain("author identity is unavailable");
		expect(state.contributions[0]).toMatchObject({
			kind: "badge",
			number: 17,
			state: "open",
		});
		expect(writes()).toEqual([]);
	});

	test("ownership follows the current mediated account rather than a cached viewer", async () => {
		let currentViewer = "a6245f20-2af8-44f4-9451-8107cb2767db";
		const { ui } = setup((url) =>
			url.pathname.endsWith("/connectionData")
				? Response.json({ authenticatedUser: { id: currentViewer } })
				: undefined,
		);
		expect((await ui.read(context)).viewerIsAuthor).toBe(true);
		currentViewer = viewerId;
		expect((await ui.read(context)).viewerIsAuthor).toBe(false);
		const signedOut = await ui.read(context, { authenticated: false });
		expect(signedOut.status).toBe("unavailable");
		expect(signedOut.viewerIsAuthor).toBeUndefined();
	});

	test("associated ownership follows account changes and reports identity failure", async () => {
		let currentViewer = "a6245f20-2af8-44f4-9451-8107cb2767db";
		let denied = false;
		const { ui } = setup((url) =>
			url.pathname.endsWith("/connectionData")
				? denied
					? Response.json({}, { status: 403 })
					: Response.json({ authenticatedUser: { id: currentViewer } })
				: undefined,
		);
		expect(
			(await ui.readAssociated(context.associatedUri)).viewerIsAuthor,
		).toBe(true);
		currentViewer = viewerId;
		expect(
			(await ui.readAssociated(context.associatedUri)).viewerIsAuthor,
		).toBe(false);
		denied = true;
		const unavailable = await ui.readAssociated(context.associatedUri);
		expect(unavailable.viewerIsAuthor).toBeUndefined();
		expect(unavailable.error).toContain("author identity is unavailable");
		expect(unavailable.contributions[0]).toMatchObject({
			kind: "badge",
			number: 17,
			state: "open",
		});
	});

	test("identity and checks failures remain explicit within the host error budget", async () => {
		const { ui } = setup((url) =>
			/\/(connectionData|statuses)$/.test(url.pathname)
				? Response.json({}, { status: 403 })
				: undefined,
		);
		const state = await ui.read(context);
		expect(state.viewerIsAuthor).toBeUndefined();
		expect(state.error).toContain("author identity is unavailable");
		expect(state.error).toContain("checks are unavailable");
		expect(new TextEncoder().encode(state.error).length).toBeLessThanOrEqual(
			2048,
		);
		expect(state.contributions[0].number).toBe(17);
	});

	test("missing author metadata leaves ownership unknown with an explicit error", async () => {
		const { ui, fetch } = setup((url) =>
			url.pathname.endsWith("/pullrequests/17")
				? Response.json({
						pullRequestId: 17,
						repository: { id: repositoryId },
						title: context.title,
						sourceRefName: context.sourceRef,
						targetRefName: context.targetRef,
						status: "active",
						isDraft: false,
					})
				: undefined,
		);
		const state = await ui.read(context);
		expect(state.viewerIsAuthor).toBeUndefined();
		expect(state.error).toContain("author identity is unavailable");
		expect(state.contributions[0].number).toBe(17);
		expect(
			fetch.mock.calls.some(([{ url }]) => url.includes("/connectionData")),
		).toBe(false);
	});

	test("stalled ownership is bounded without blocking independent CI presentation", async () => {
		const { ui } = setup((url) => {
			if (url.pathname.endsWith("/connectionData"))
				return new Promise(() => {});
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [{ id: 1, context: { name: "build" }, state: "succeeded" }],
				});
		});
		vi.useFakeTimers();
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation((ms) => {
				const controller = new AbortController();
				setTimeout(
					() => controller.abort(new DOMException("Timed out", "TimeoutError")),
					ms,
				);
				return controller.signal;
			});
		onTestFinished(() => {
			timeout.mockRestore();
			vi.useRealTimers();
		});
		const read = ui.read(context);
		await vi.advanceTimersByTimeAsync(30_000);
		const result = await read;
		expect(result.viewerIsAuthor).toBeUndefined();
		expect(result.error).toContain("author identity is unavailable");
		expect(result.contributions[0]).toMatchObject({
			number: 17,
			checksSummary: { total: 1, success: 1, failure: 0, pending: 0 },
		});
	});

	test.each([
		["approve", 10],
		["approve-with-suggestions", 5],
		["wait-for-author", -5],
		["reject", -10],
	])(
		"explicit %s updates only the authenticated reviewer's vote",
		async (decision, vote) => {
			const { submit, writes, fetch } = setup();
			await submit({ decision, body: "", inlineComments: [] });
			expect(writes()).toHaveLength(1);
			expect(writes()[0].init.method).toBe("PUT");
			expect(JSON.parse(writes()[0].init.body)).toEqual({ id: viewerId, vote });
			expect(
				fetch.mock.calls.some(([{ url }]) =>
					url.startsWith("https://dev.azure.com/org/_apis/connectionData"),
				),
			).toBe(true);
		},
	);

	test.each([
		null,
		{},
		{ decision: "comment", body: "", inlineComments: [] },
		{ decision: "unknown", body: "x", inlineComments: [] },
		{ decision: "comment", body: "x", inlineComments: [], vote: 0 },
		{
			decision: "comment",
			body: "x",
			inlineComments: [{ ...inline, body: " " }],
		},
		{
			decision: "comment",
			body: "x",
			inlineComments: [{ ...inline, startLine: 0 }],
		},
		{
			decision: "comment",
			body: "x",
			sourceCommitId: "invalid",
			inlineComments: [inline],
		},
		{
			decision: "comment",
			body: "x",
			sourceCommitId: undefined,
			inlineComments: [inline],
		},
	])("invalid input rejects before any requests (%j)", async (input) => {
		const { submit, fetch, markMutationDispatched } = setup();
		await expect(submit(input)).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
		expect(markMutationDispatched).not.toHaveBeenCalled();
	});

	test.each([
		{ ...inline, path: "/missing.txt" },
		{ ...inline, line: 40 },
		{ ...inline, startLine: 3, line: 2 },
	])(
		"all locations are checked before publishing even the general body (%j)",
		async (comment) => {
			const { submit, writes } = setup();
			await expect(
				submit({
					decision: "comment",
					body: "General",
					inlineComments: [inline, comment],
				}),
			).rejects.toThrow();
			expect(writes()).toEqual([]);
		},
	);

	test("multi-file review preserves first, last and inclusive ranges with one-based offsets on both sides", async () => {
		const files = [
			{ path: "/lf.txt", text: "first\nsecond\nlast\n", lines: 3 },
			{ path: "/no-final-lf.txt", text: "first\nsecond\nlast", lines: 3 },
			{ path: "/crlf.txt", text: "first\r\nsecond\r\nlast\r\n", lines: 3 },
			{ path: "/single.txt", text: "only", lines: 1 },
			{ path: "/unicode space é.txt", text: "α 😀\n", lines: 1 },
			{ path: "/blank.txt", text: "first\n\nlast\n", lines: 3 },
			{
				path: "/added.txt",
				text: "first\nlast\n",
				lines: 2,
				changeType: "add",
			},
			{
				path: "/deleted.txt",
				text: "first\nlast\n",
				lines: 2,
				changeType: "delete",
			},
		];
		const { submit, writes, markMutationDispatched } = setup((url) => {
			if (url.pathname.endsWith("/changes"))
				return Response.json({
					changeEntries: files.map((file, index) => ({
						changeId: index + 1,
						changeTrackingId: index + 10,
						item: { path: file.path },
						changeType: file.changeType ?? "edit",
					})),
				});
			if (url.pathname.endsWith("/items")) {
				const file = files.find(
					(file) => file.path === url.searchParams.get("path"),
				);
				expect(file).toBeDefined();
				return Response.json({
					path: file.path,
					commitId: url.searchParams.get("versionDescriptor.version"),
					gitObjectType: "blob",
					contentMetadata: { isBinary: false },
					content: file.text,
				});
			}
		});
		const comments = files.flatMap((file) => {
			const sides =
				file.changeType === "add"
					? ["RIGHT"]
					: file.changeType === "delete"
						? ["LEFT"]
						: ["LEFT", "RIGHT"];
			return sides.flatMap((side) =>
				[
					{ startLine: 1, line: 1 },
					{ startLine: file.lines, line: file.lines },
					{ startLine: 1, line: file.lines },
				].map((range) => ({
					path: file.path,
					side,
					...range,
					body: `${file.path} ${side} ${range.startLine}-${range.line}`,
				})),
			);
		});
		comments.push({
			path: "/blank.txt",
			side: "RIGHT",
			startLine: 2,
			line: 2,
			body: "Blank middle line",
		});
		await submit({
			decision: "comment",
			body: "General",
			inlineComments: comments,
		});
		expect(writes()).toHaveLength(comments.length + 1);
		expect(markMutationDispatched).toHaveBeenCalledTimes(comments.length + 1);
		expect(JSON.parse(writes()[0].init.body).threadContext).toBeUndefined();
		comments.forEach((comment, index) => {
			const apiSide = comment.side === "LEFT" ? "left" : "right";
			const fileIndex = files.findIndex((file) => file.path === comment.path);
			expect(writes()[index + 1].init.method).toBe("POST");
			expect(JSON.parse(writes()[index + 1].init.body)).toMatchObject({
				comments: [{ content: comment.body }],
				threadContext: {
					filePath: comment.path,
					[`${apiSide}FileStart`]: { line: comment.startLine, offset: 1 },
					[`${apiSide}FileEnd`]: { line: comment.line, offset: 1 },
				},
				pullRequestThreadContext: {
					changeTrackingId: fileIndex + 10,
					iterationContext: {
						firstComparingIteration: 3,
						secondComparingIteration: 3,
					},
				},
			});
		});
	});

	test.each([
		{ text: "", line: 1, side: "RIGHT", changeType: "edit" },
		{ text: "only\n", line: 2, side: "RIGHT", changeType: "edit" },
		{ text: "only", line: 2, side: "LEFT", changeType: "edit" },
		{ text: "first\r\nlast\r\n", line: 3, side: "RIGHT", changeType: "edit" },
		{ text: "first\nlast\n", line: 1, side: "LEFT", changeType: "add" },
		{ text: "first\nlast\n", line: 1, side: "RIGHT", changeType: "delete" },
	])(
		"rejects empty, past-EOF and unavailable-side locations before general or inline writes (%j)",
		async ({ text, line, side, changeType }) => {
			const { submit, writes, markMutationDispatched } = setup((url) => {
				if (url.pathname.endsWith("/changes"))
					return Response.json({
						changeEntries: [
							{
								changeId: 1,
								changeTrackingId: 9,
								item: { path: inline.path },
								changeType,
							},
						],
					});
				if (url.pathname.endsWith("/items"))
					return Response.json({
						path: inline.path,
						commitId: url.searchParams.get("versionDescriptor.version"),
						gitObjectType: "blob",
						contentMetadata: { isBinary: false },
						content: text,
					});
			});
			await expect(
				submit({
					decision: "comment",
					body: "Must not publish",
					inlineComments: [{ path: inline.path, line, side, body: "Invalid" }],
				}),
			).rejects.toThrow("Invalid inline comment location.");
			expect(writes()).toEqual([]);
			expect(markMutationDispatched).not.toHaveBeenCalled();
		},
	);

	test.each(["completed", "abandoned", "missing"])(
		"rejects %s PR without writes",
		async (status) => {
			const { submit, writes } = setup((url) => {
				if (!url.pathname.endsWith("/pullrequests/17")) return;
				if (status === "missing") return new Response(null, { status: 404 });
				return Response.json({
					pullRequestId: 17,
					repository: { id: repositoryId },
					title: "Closed",
					sourceRefName: context.sourceRef,
					targetRefName: context.targetRef,
					status,
				});
			});
			await expect(
				submit({ decision: "comment", body: "Feedback", inlineComments: [] }),
			).rejects.toThrow();
			expect(writes()).toEqual([]);
		},
	);

	test("foreign associated URI cannot redirect writes to another repository", async () => {
		const other = "44444444-4444-4444-8444-444444444444";
		const { submit, writes } = setup((url) =>
			url.pathname.endsWith(`/repositories/${other}`)
				? Response.json({ id: other, name: "another" })
				: undefined,
		);
		await expect(
			submit(
				{ decision: "comment", body: "Feedback", inlineComments: [] },
				{
					...context,
					associatedUri: context.associatedUri.replace(repositoryId, other),
				},
			),
		).rejects.toThrow(/repository/);
		expect(writes()).toEqual([]);
	});

	test.each(["http", "dispatch", "invalid-response"])(
		"partial/unconfirmed %s failures propagate and are never retried",
		async (failure) => {
			const diagnostic = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			onTestFinished(() => diagnostic.mockRestore());
			let posts = 0;
			const { submit, writes, markMutationDispatched } = setup(
				(url, method) => {
					if (
						method !== "POST" ||
						!url.pathname.endsWith("/threads") ||
						++posts !== 2
					)
						return;
					if (failure === "http")
						return Response.json(
							{ message: "Private server exception" },
							{ status: 500 },
						);
					if (failure === "invalid-response") return Response.json({});
					throw Object.assign(new Error("Lost acknowledgement"), {
						requestDispatched: true,
					});
				},
			);
			await expect(
				submit({
					decision: "approve",
					body: "General",
					inlineComments: [inline],
				}),
			).rejects.toThrow(
				/partial or unconfirmed \(1 writes confirmed\).*do not automatically/,
			);
			expect(writes()).toHaveLength(2);
			expect(markMutationDispatched).toHaveBeenCalledTimes(2);
			expect(diagnostic.mock.calls).toEqual([
				[
					"Azure DevOps review submission failed.",
					{
						dispatched: true,
						confirmedWrites: 1,
						writeKind: "inline_comment",
						errorCode:
							failure === "http"
								? "http"
								: failure === "dispatch"
									? "request_failed"
									: "invalid_response",
						...(failure === "http" ? { httpStatus: 500 } : {}),
					},
				],
			]);
		},
	);

	test("pre-dispatch authentication failure propagates without claiming writes", async () => {
		const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
		onTestFinished(() => diagnostic.mockRestore());
		const error = Object.assign(new Error("Native admission revoked"), {
			requestDispatched: false,
		});
		const authentication = fixtureAuthentication();
		const { submit, writes, markMutationDispatched } = setup(
			(url) => {
				if (url.pathname.endsWith("/pullrequests/17")) {
					authentication.getAccessToken.mockRejectedValue(error);
				}
			},
			false,
			authentication,
		);
		await expect(
			submit({ decision: "comment", body: "General", inlineComments: [] }),
		).rejects.toThrow();
		expect(writes()).toHaveLength(0);
		expect(markMutationDispatched).not.toHaveBeenCalled();
		expect(diagnostic.mock.calls).toEqual([
			[
				"Azure DevOps review submission failed.",
				{
					dispatched: false,
					confirmedWrites: 0,
					writeKind: "general_comment",
					errorCode: "request_failed",
				},
			],
		]);
	});

	test("first-post acknowledgement loss is unconfirmed, not safe to resubmit", async () => {
		const { submit, writes, markMutationDispatched } = setup((url, method) => {
			if (method === "POST")
				throw Object.assign(new Error("Acknowledgement lost"), {
					requestDispatched: true,
				});
		});
		await expect(
			submit({ decision: "comment", body: "General", inlineComments: [] }),
		).rejects.toThrow(
			/partial or unconfirmed \(0 writes confirmed\).*do not automatically/,
		);
		expect(writes()).toHaveLength(1);
		expect(markMutationDispatched).toHaveBeenCalledTimes(1);
	});

	test("first inline HTTP rejection records only safe diagnostics without retrying", async () => {
		const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
		onTestFinished(() => diagnostic.mockRestore());
		const { submit, writes, markMutationDispatched } = setup((url, method) =>
			method === "POST"
				? Response.json(
						{
							message: `Private exception for ${inline.path}: ${inline.body}\r\nParameter name: rightFileEnd`,
							typeKey: "ArgumentOutOfRangeException",
							errorCode: 42,
							innerException: { message: "Private credential" },
						},
						{ status: 400 },
					)
				: undefined,
		);
		await expect(
			submit({ decision: "comment", body: "", inlineComments: [inline] }),
		).rejects.toThrow(/partial or unconfirmed \(0 writes confirmed\)/);
		expect(writes()).toHaveLength(1);
		expect(markMutationDispatched).toHaveBeenCalledTimes(1);
		expect(diagnostic.mock.calls).toEqual([
			[
				"Azure DevOps review submission failed.",
				{
					dispatched: true,
					confirmedWrites: 0,
					writeKind: "inline_comment",
					errorCode: "http",
					httpStatus: 400,
					serviceErrorType: "ArgumentOutOfRangeException",
					serviceErrorCode: 42,
					parameter: "rightFileEnd",
				},
			],
		]);
	});

	test("inline-only Comment publishes on the original side without changing the vote", async () => {
		const { submit, writes } = setup();
		await submit({
			decision: "comment",
			body: " \n",
			inlineComments: [{ ...inline, side: "LEFT" }],
		});
		expect(writes()).toHaveLength(1);
		expect(JSON.parse(writes()[0].init.body).threadContext).toEqual({
			filePath: inline.path,
			leftFileStart: { line: 2, offset: 1 },
			leftFileEnd: { line: 3, offset: 1 },
		});
	});

	test("missing authenticated reviewer identity prevents even body writes for an explicit decision", async () => {
		const { submit, writes } = setup((url) =>
			url.pathname.endsWith("/connectionData") ? Response.json({}) : undefined,
		);
		await expect(
			submit({ decision: "approve", body: "General", inlineComments: [] }),
		).rejects.toThrow();
		expect(writes()).toEqual([]);
	});

	test("vote failure after comments reports a partial outcome without replaying threads", async () => {
		const { submit, writes, markMutationDispatched, changed } = setup(
			(url, method) =>
				method === "PUT" ? new Response(null, { status: 403 }) : undefined,
		);
		await expect(
			submit({ decision: "reject", body: "General", inlineComments: [] }),
		).rejects.toThrow(/partial or unconfirmed \(1 writes confirmed\)/);
		expect(writes().map(({ init }) => init.method)).toEqual(["POST", "PUT"]);
		expect(markMutationDispatched).toHaveBeenCalledTimes(2);
		expect(changed).not.toHaveBeenCalled();
	});

	test("binary inline locations are rejected before body writes", async () => {
		const { submit, writes } = setup((url) => {
			if (!url.pathname.endsWith("/items")) return;
			return Response.json({
				path: inline.path,
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: true },
			});
		});
		await expect(
			submit({
				decision: "comment",
				body: "General",
				inlineComments: [inline],
			}),
		).rejects.toThrow(/location/);
		expect(writes()).toEqual([]);
	});

	test("staged source commit must match the real PR before any writes", async () => {
		const { submit, writes } = setup();
		await expect(
			submit({
				decision: "comment",
				body: "General",
				inlineComments: [inline],
				sourceCommitId: "c".repeat(40),
			}),
		).rejects.toThrow(/source revision changed/);
		expect(writes()).toEqual([]);
	});

	test("native relative paths and optional range/side fields become current right-side anchors", async () => {
		const { submit, writes } = setup();
		await submit({
			decision: "comment",
			body: "",
			sourceCommitId: headSha.toUpperCase(),
			inlineComments: [
				{ path: "file.txt", line: 2, body: "Native staged comment" },
			],
		});
		expect(writes()).toHaveLength(1);
		expect(JSON.parse(writes()[0].init.body).threadContext).toEqual({
			filePath: "/file.txt",
			rightFileStart: { line: 2, offset: 1 },
			rightFileEnd: { line: 2, offset: 1 },
		});
	});

	test.each(["漢".repeat(5000), "\u0001".repeat(2100)])(
		"UTF-8 and JSON-escaped general bodies are bounded before any writes",
		async (body) => {
			const { submit, writes, markMutationDispatched } = setup();
			await expect(
				submit({ decision: "approve", body, inlineComments: [] }),
			).rejects.toThrow(/request size limit/);
			expect(writes()).toEqual([]);
			expect(markMutationDispatched).not.toHaveBeenCalled();
		},
	);

	test("an oversized later inline POST prevents publishing the general body", async () => {
		const { submit, writes, markMutationDispatched } = setup();
		await expect(
			submit({
				decision: "comment",
				body: "General feedback",
				inlineComments: [
					inline,
					{ ...inline, body: "x".repeat(12 * 1024 - 100) },
				],
			}),
		).rejects.toThrow(/request size limit/);
		expect(writes()).toEqual([]);
		expect(markMutationDispatched).not.toHaveBeenCalled();
	});

	test("draft PRs accept body and inline Comment without publishing or voting", async () => {
		const { ui, submit, writes, fetch } = setup(undefined, true);
		const read = await ui.read(context);
		expect(read.review.defaultOptionId).toBe("comment");
		expect(read.review.options.map(({ id }) => id)).toEqual(["comment"]);
		const result = await submit({
			decision: "comment",
			body: "Draft feedback",
			inlineComments: [inline],
		});
		expect(result.contributions[0].state).toBe("draft");
		expect(writes()).toHaveLength(2);
		expect(writes().every(({ init }) => init.method === "POST")).toBe(true);
		expect(fetch.mock.calls.some(([{ url }]) => /reviewers/.test(url))).toBe(
			false,
		);
	});

	test.each([
		"approve",
		"approve-with-suggestions",
		"wait-for-author",
		"reject",
	])(
		"draft %s rejects before publishing comments or changing status",
		async (decision) => {
			const { submit, writes, markMutationDispatched } = setup(undefined, true);
			await expect(
				submit({ decision, body: "Draft feedback", inlineComments: [inline] }),
			).rejects.toThrow(/Voting is disabled/);
			expect(writes()).toEqual([]);
			expect(markMutationDispatched).not.toHaveBeenCalled();
		},
	);
});

const context = {
	originUrl: "https://dev.azure.com/org/project/_git/repo",
	sourceRef: "refs/heads/change",
	targetRef: "refs/heads/main",
	title: "A change",
	description: "## Summary\n\nGrounded in the captured branch diff.",
};

test.each([false, true])(
	"Create PR propagates generated description (draft=%s)",
	async (draft) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		await ui.actions[0].handler({ draft }, context);
		const writes = fetch.mock.calls.filter(
			([request]) => request.init.method === "POST",
		);
		assert.equal(writes.length, 1);
		assert.equal(
			JSON.parse(writes[0][0].init.body).description,
			context.description,
		);
		assert.equal(JSON.parse(writes[0][0].init.body).isDraft, draft);
	},
);

test("returns the linked PR without retargeting it when the workspace base changes", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	fetch.mockClear();
	const state = await ui.read({
		...context,
		targetRef: "refs/heads/release",
		associatedUri: "https://dev.azure.com/org/project/_git/repo/pullrequest/17",
	});
	assert.equal(state.contributions[0].number, 17);
	assert.ok(
		fetch.mock.calls.every(([request]) => request.init.method === "GET"),
	);
});

test("a registered reader works without the package's private receiver methods", async () => {
	const fetch = fetchFixture({ record: pullRequestRecord("active") });
	const ui = await provider(fetch);
	const registered = { read: ui.read };
	const state = await registered.read({
		...context,
		associatedUri: "https://dev.azure.com/org/project/_git/repo/pullrequest/17",
	});
	assert.equal(state.status, "ready");
	assert.equal(state.contributions[0].number, 17);
	assert.ok(fetch.mock.calls.length > 0);
	assert.ok(
		fetch.mock.calls.every(([request]) => request.init.method === "GET"),
	);
});

test.each(
	[false, true].flatMap((draft) =>
		[undefined, null, "refs/heads/main", "refs/heads/release"].map(
			(requestedTargetRef) => ({ draft, requestedTargetRef }),
		),
	),
)(
	"validates an explicit target when reusing a linked PR (draft=$draft, target=$requestedTargetRef)",
	async ({ draft, requestedTargetRef }) => {
		const fetch = fetchFixture({
			record: { ...pullRequestRecord("active"), isDraft: draft },
		});
		const ui = await provider(fetch);
		const state = await ui.read({
			...context,
			targetRef: requestedTargetRef ?? "refs/heads/release",
			requestedTargetRef,
			associatedUri:
				"https://dev.azure.com/org/project/_git/repo/pullrequest/17",
		});
		if (requestedTargetRef === "refs/heads/release") {
			assert.equal(state.status, "unavailable");
			assert.match(state.error, /main.*release.*cannot retarget/i);
			assert.deepEqual(state.contributions, []);
		} else {
			assert.equal(state.status, "ready");
			assert.equal(state.contributions[0].number, 17);
			assert.equal(state.contributions[0].state, draft ? "draft" : "open");
		}
		assert.ok(fetch.mock.calls.length > 0);
		assert.ok(
			fetch.mock.calls.every(([request]) => request.init.method === "GET"),
		);
	},
);

test.each(["completed", "abandoned"])(
	"allows replacement of a terminal PR when the explicit target differs (%s)",
	async (status) => {
		const fetch = fetchFixture({ record: pullRequestRecord(status) });
		const ui = await provider(fetch);
		const state = await ui.read({
			...context,
			targetRef: "refs/heads/release",
			requestedTargetRef: "refs/heads/release",
			associatedUri:
				"https://dev.azure.com/org/project/_git/repo/pullrequest/17",
		});
		assert.equal(state.status, "ready");
		assert.ok(state.contributions.some((entry) => entry.slot === "pr.create"));
		assert.ok(
			fetch.mock.calls.every(([request]) => request.init.method === "GET"),
		);
	},
);

test("unlinked release availability does not reuse a same-source PR targeting main", async () => {
	const fetch = fetchFixture({
		record: pullRequestRecord("active"),
		targetRef: "refs/heads/release",
	});
	const ui = await provider(fetch);
	const state = await ui.read({
		...context,
		targetRef: "refs/heads/release",
		requestedTargetRef: "refs/heads/release",
	});
	assert.equal(state.status, "ready");
	assert.ok(state.contributions.every((entry) => entry.slot === "pr.create"));
	assert.ok(state.contributions.length > 0);
	assert.ok(
		fetch.mock.calls.every(([request]) => request.init.method === "GET"),
	);
});

test.each([undefined, "", " \n", null])(
	"rejects missing generated description before remote requests (%s)",
	async (description) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		await assert.rejects(
			ui.actions[0].handler({ draft: false }, { ...context, description }),
			/description/i,
		);
		assert.equal(fetch.mock.calls.length, 0);
	},
);

const ACCESS_TOKEN = "fixture-token";

function fixtureAuthentication() {
	return {
		getAccessToken: vi.fn(async (input) => {
			// PR UI is operation-scoped; native binds the saved repository account.
			assert.deepEqual(input, { resource: "azure-devops" });
			return { accessToken: ACCESS_TOKEN };
		}),
	};
}

/**
 * Route bearer-token fetches to a fixture that sees only package-visible
 * request fields, after checking the token is attached to Azure DevOps alone.
 */
function stubBearerFetch(handler) {
	const fetch = vi.fn(async (input, { headers, ...init }) => {
		const { Authorization, ...visibleHeaders } = headers;
		assert.equal(Authorization, `Bearer ${ACCESS_TOKEN}`);
		assert.equal(init.redirect, "error");
		assert.equal(new URL(String(input)).origin, "https://dev.azure.com");
		return handler({
			url: String(input),
			init: { ...init, headers: visibleHeaders },
		});
	});
	vi.stubGlobal("fetch", fetch);
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
	return fetch;
}

async function provider(
	handler,
	authentication = fixtureAuthentication(),
	createPullRequestError,
) {
	if (handler) stubBearerFetch(handler);
	let registered;
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication,
		...(createPullRequestError
			? { pullRequests: { createPullRequestError } }
			: {}),
		async registerProvider(id, value) {
			assert.equal(id, "azure-devops");
			registered = value;
			return () => {};
		},
		async registerCanvas() {
			return () => {};
		},
	});
	const release = await activate();
	onTestFinished(release);
	assert.ok(registered.prUi);
	return registered.prUi;
}

function fetchFixture({
	failPost = false,
	record: initialRecord,
	targetRef = context.targetRef,
} = {}) {
	let record = initialRecord;
	return vi.fn(async ({ url, init }) => {
		if (new URL(url).pathname.endsWith("/connectionData")) {
			assert.equal(init.method, "GET");
			assert.equal(new URL(url).pathname, "/org/_apis/connectionData");
			return Response.json({ authenticatedUser: { id: viewerId } });
		}
		assert.match(
			url,
			/^https:\/\/dev\.azure\.com\/org\/project\/_apis\/git\/repositories\//,
		);
		assert.ok(["POST", "GET"].includes(init.method));
		const endpoint = new URL(url);
		assert.equal(endpoint.searchParams.get("api-version"), "7.1");
		assert.equal(new Headers(init.headers).has("authorization"), false);
		if (/\/repositories\/[^/?]+\?/.test(url)) {
			assert.equal(init.method, "GET");
			assert.ok(
				["repo", "3411ebc1-d5aa-464f-9615-0b527bc66719"].includes(
					endpoint.pathname.split("/").at(-1),
				),
			);
			return Response.json({
				id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
				name: "repo",
			});
		}

		if (/\/pullrequests\/17\?/i.test(url)) {
			assert.equal(init.method, "GET");
			return Response.json(record);
		}
		if (endpoint.pathname.endsWith("/statuses"))
			return Response.json({ value: [] });
		assert.equal(
			endpoint.pathname,
			"/org/project/_apis/git/repositories/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequests",
		);
		if (init.method === "GET") {
			assert.equal(
				endpoint.searchParams.get("searchCriteria.sourceRefName"),
				context.sourceRef,
			);
			assert.equal(
				endpoint.searchParams.get("searchCriteria.targetRefName"),
				targetRef,
			);
			return Response.json({ value: record ? [record] : [] });
		}
		if (failPost) throw new Error("connection lost after dispatch");
		const body = JSON.parse(init.body);
		record = {
			pullRequestId: 17,
			createdBy: { id: viewerId },
			repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719" },
			title: body.title,
			description: body.description,
			sourceRefName: body.sourceRefName,
			targetRefName: body.targetRefName,
			isDraft: body.isDraft,
			status: "active",
			mergeStatus: "notSet",
		};
		return Response.json(record);
	});
}

function pullRequestRecord(status) {
	return {
		pullRequestId: 17,
		createdBy: { id: viewerId },
		repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719" },
		title: "A change",
		sourceRefName: context.sourceRef,
		targetRefName: context.targetRef,
		isDraft: false,
		status,
		mergeStatus: "succeeded",
	};
}

test("PR UI publishes lifecycle changes for Agent merge without reading merge details", async () => {
	let record = pullRequestRecord("active");
	const fetch = vi.fn(async ({ url, init }) => {
		assert.equal(init.method, "GET");
		const path = new URL(url).pathname;
		if (/\/repositories\/[^/]+$/.test(path))
			return Response.json({
				id: record.repository.id,
				name: "repo",
			});
		if (/\/pullrequests\/17$/i.test(path)) return Response.json(record);
		if (path.endsWith("/statuses")) return Response.json({ value: [] });
		if (path.endsWith("/connectionData"))
			return Response.json({ authenticatedUser: { id: viewerId } });
		throw new Error(`Unexpected status read: ${path}`);
	});
	const ui = await provider(fetch);
	for (const [status, draft, mergeStatus, expected] of [
		["active", false, "succeeded", "open"],
		["active", true, "succeeded", "draft"],
		["active", false, "conflicts", "open"],
		["active", false, "queued", "open"],
		["completed", false, "succeeded", "merged"],
		["abandoned", false, "succeeded", "closed"],
	]) {
		record = { ...record, status, isDraft: draft, mergeStatus };
		const result = await ui.read({
			...context,
			associatedUri: `https://dev.azure.com/org/project/_git/${record.repository.id}/pullrequest/17`,
		});
		assert.equal(result.error, null);
		assert.equal(result.contributions[0].state, expected);
	}
});

test("PR UI reads current CI contexts without loading the full overview", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	const baseFetch = fetch.getMockImplementation();
	fetch.mockImplementation(async (request) => {
		const url = new URL(request.url);
		if (url.pathname.endsWith("/statuses")) {
			const status = (id, name, state, iterationId) => ({
				id,
				context: { name, genre: "ci" },
				state,
				iterationId,
			});
			return url.searchParams.has("continuationToken")
				? Response.json({
						value: [
							status(2, "build", "pending", 2),
							status(3, "tests", "failed", 2),
							status(4, "lint", "succeeded", 2),
							status(5, "old", "succeeded", 1),
							status(6, "optional", "notApplicable", 2),
						],
					})
				: Response.json(
						{ value: [status(1, "build", "succeeded", 2)] },
						{ headers: { "x-ms-continuationtoken": "next" } },
					);
		}
		if (url.pathname.endsWith("/iterations"))
			return Response.json({ value: [{ id: 1 }, { id: 2 }] });
		return baseFetch(request);
	});

	const state = await ui.read(context);
	assert.equal(state.error, null);
	assert.deepEqual(state.contributions[0].checksSummary, {
		total: 3,
		success: 1,
		failure: 1,
		pending: 1,
	});
	assert.equal(
		fetch.mock.calls.some(([{ url }]) => /threads|polic/i.test(url)),
		false,
	);
});

test.each([
	["succeeded", "success"],
	["failed", "failure"],
	["error", "failure"],
	["pending", "pending"],
	["notSet", "pending"],
])("PR UI counts %s CI contexts as %s", async (state, category) => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	const baseFetch = fetch.getMockImplementation();
	fetch.mockImplementation((request) =>
		new URL(request.url).pathname.endsWith("/statuses")
			? Response.json({ value: [{ id: 1, context: { name: "build" }, state }] })
			: baseFetch(request),
	);
	assert.deepEqual((await ui.read(context)).contributions[0].checksSummary, {
		total: 1,
		success: 0,
		failure: 0,
		pending: 0,
		[category]: 1,
	});
});

test("not-applicable contexts do not fabricate an all-passed checks badge", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	const baseFetch = fetch.getMockImplementation();
	fetch.mockImplementation((request) =>
		new URL(request.url).pathname.endsWith("/statuses")
			? Response.json({
					value: [
						{ id: 1, context: { name: "optional" }, state: "notApplicable" },
					],
				})
			: baseFetch(request),
	);
	const result = await ui.read(context);
	assert.equal(result.error, null);
	assert.equal(result.contributions[0].number, 17);
	assert.equal(result.contributions[0].checksSummary, undefined);
});

test("an empty CI response has no fabricated checks badge", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	const result = await ui.read(context);
	assert.equal(result.error, null);
	assert.equal(result.contributions[0].checksSummary, undefined);
	assert.ok(
		fetch.mock.calls.some(([{ url }]) =>
			new URL(url).pathname.endsWith("/statuses"),
		),
	);
});

test("stalled checks are bounded and leave PR identity available", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	await ui.actions[0].handler({ draft: false }, context);
	const baseFetch = fetch.getMockImplementation();
	const started = Promise.withResolvers();
	fetch.mockImplementation((request) => {
		if (new URL(request.url).pathname.endsWith("/statuses")) {
			started.resolve();
			return new Promise(() => {});
		}
		return baseFetch(request);
	});
	const controller = new AbortController();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(controller.signal);
	onTestFinished(() => timeout.mockRestore());
	const read = ui.read(context);
	await started.promise;
	controller.abort(new DOMException("Timed out", "TimeoutError"));
	const result = await read;
	assert.match(result.error, /checks.*unavailable/i);
	assert.equal(result.contributions[0].number, 17);
	assert.equal(result.contributions[0].checksSummary, undefined);
});

test.each([25_000, 35_000])(
	"optional checks share the read budget after a %ims PR lookup",
	async (lookupDelay) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		await ui.actions[0].handler({ draft: false }, context);
		const baseFetch = fetch.getMockImplementation();
		vi.useFakeTimers();
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation((ms) => {
				const controller = new AbortController();
				setTimeout(
					() => controller.abort(new DOMException("Timed out", "TimeoutError")),
					ms,
				);
				return controller.signal;
			});
		onTestFinished(() => {
			timeout.mockRestore();
			vi.useRealTimers();
		});
		let checksSignal;
		fetch.mockImplementation(async (request) => {
			const url = new URL(request.url);
			if (url.pathname.endsWith("/statuses")) {
				checksSignal = request.init.signal;
				return new Promise(() => {});
			}
			if (url.pathname.endsWith("/pullrequests")) {
				await new Promise((resolve) => setTimeout(resolve, lookupDelay / 2));
			} else if (/\/repositories\/[^/]+$/.test(url.pathname)) {
				await new Promise((resolve) => setTimeout(resolve, lookupDelay / 2));
			}
			return baseFetch(request);
		});
		let result;
		const read = ui.read(context).then((value) => {
			result = value;
		});
		const completionTime = Math.max(30_000, lookupDelay);
		await vi.advanceTimersByTimeAsync(completionTime - 1);
		assert.equal(result, undefined);
		await vi.advanceTimersByTimeAsync(1);
		assert.ok(result, "PR identity must return without a fresh checks timeout");
		await read;
		assert.equal(result.status, "ready");
		assert.equal(result.contributions[0].number, 17);
		assert.equal(result.contributions[0].state, "open");
		assert.equal(result.contributions[0].checksSummary, undefined);
		assert.match(result.error, /checks.*unavailable/i);
		if (lookupDelay < 30_000) {
			assert.equal(checksSignal?.aborted, true);
		} else {
			assert.equal(checksSignal, undefined);
		}

		// An expired read must not consume the budget of the next observation.
		fetch.mockImplementation(baseFetch);
		const recovered = await ui.read(context);
		assert.equal(recovered.error, null);
		assert.equal(recovered.contributions[0].number, 17);
	},
);

test.each(["http", "invalid", "unknown"])(
	"PR UI retains identity but reports unavailable checks (%s), then recovers",
	async (failure) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		await ui.actions[0].handler({ draft: false }, context);
		const baseFetch = fetch.getMockImplementation();
		let failed = true;
		fetch.mockImplementation(async (request) => {
			if (new URL(request.url).pathname.endsWith("/statuses")) {
				if (failed && failure === "http")
					return new Response("", { status: 403 });
				return Response.json({
					value: [
						{
							id: failed && failure === "invalid" ? 0 : 1,
							context: { name: "build" },
							state:
								failed && failure === "unknown" ? "future-state" : "succeeded",
						},
					],
				});
			}
			return baseFetch(request);
		});
		const state = await ui.read(context);
		assert.equal(state.status, "ready");
		assert.match(state.error, /checks.*unavailable/i);
		assert.equal(state.contributions[0].number, 17);
		assert.equal(state.contributions[0].state, "open");
		assert.equal(state.contributions[0].checksSummary, undefined);
		failed = false;
		const recovered = await ui.read(context);
		assert.equal(recovered.error, null);
		assert.deepEqual(recovered.contributions[0].checksSummary, {
			total: 1,
			success: 1,
			failure: 0,
			pending: 0,
		});
	},
);

test("production activation is unavailable without host-owned workspace context", async (t) => {
	const ui = await provider(fetchFixture());
	const state = await ui.read();
	assert.equal(state.status, "unavailable");
	assert.match(state.error, /repository.*authentication/i);
	assert.deepEqual(state.contributions, []);
	const markMutationDispatched = vi.fn();
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, undefined, {
			markMutationDispatched,
		}),
		/originUrl/,
	);
	assert.equal(markMutationDispatched.mock.calls.length, 0);
});

test("unbound read declares normal and draft actions without authentication", async (t) => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	const state = await ui.read(context, { authenticated: false });
	assert.deepEqual(
		state.contributions.map((entry) => entry.action.input),
		[{ draft: false }, { draft: true }],
	);
	assert.equal(fetch.mock.calls.length, 0);
});

test("partial per-operation creation context fails before any authenticated HTTP", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	for (const invalid of [
		{ ...context, title: "" },
		{ ...context, sourceRef: undefined },
		{ ...context, targetRef: "main" },
	]) {
		const markMutationDispatched = vi.fn();
		await assert.rejects(ui.read(invalid), /title|ref/i);
		await assert.rejects(
			ui.actions[0].handler({ draft: false }, invalid, {
				markMutationDispatched,
			}),
			/title|ref/i,
		);
		assert.equal(markMutationDispatched.mock.calls.length, 0);
	}
	assert.equal(fetch.mock.calls.length, 0);
});

test("missing native authentication cannot fall back to unauthenticated HTTP", async () => {
	const directFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
		throw new Error("Unexpected unauthenticated request");
	});
	onTestFinished(() => directFetch.mockRestore());
	const ui = await provider(undefined, {});
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context),
		/native authentication.*unavailable/i,
	);
	await assert.rejects(ui.read(context), /native authentication.*unavailable/i);
	assert.equal(directFetch.mock.calls.length, 0);
});

test("picker GUID origins validate against the repository ID, not its display name", async (t) => {
	const repositoryId = "3411ebc1-d5aa-464f-9615-0b527bc66719";
	const fetch = vi.fn(async ({ init }) => {
		if (init.method === "GET") {
			return Response.json(
				fetch.mock.calls.length === 1
					? { id: repositoryId, name: "Copilot App" }
					: { value: [] },
			);
		}
		throw new Error("unexpected mutation");
	});
	const ui = await provider(fetch);
	const state = await ui.read({
		...context,
		originUrl: `https://dev.azure.com/org/project/_git/${repositoryId}`,
	});

	assert.equal(state.status, "ready");
	assert.deepEqual(
		state.contributions.map((entry) => entry.action.input),
		[{ draft: false }, { draft: true }],
	);
});

test.each(["repo", "3411ebc1-d5aa-464f-9615-0b527bc66719"])(
	"persisted URI reads the exact pull request and preserves its link (%s)",
	async (repository) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		await ui.actions[0].handler({ draft: true }, context);
		const linkedContext = {
			...context,
			sourceRef: "",
			targetRef: "",
			associatedUri: `https://dev.azure.com/org/project/_git/${repository}/pullrequest/17`,
		};
		const unauthenticated = await ui.read(linkedContext, {
			authenticated: false,
		});
		assert.equal(unauthenticated.status, "unavailable");
		assert.deepEqual(unauthenticated.contributions, []);

		const state = await ui.read(linkedContext);

		assert.deepEqual(state.contributions, [
			{
				kind: "badge",
				slot: "pr.status",
				id: "pull-request",
				number: 17,
				state: "draft",
				url: linkedContext.associatedUri,
			},
			{
				kind: "button",
				slot: "pr.publish",
				id: "publish",
				label: "Publish",
				action: { actionId: "set-draft", input: { draft: false } },
			},
		]);
		assert.equal(
			fetch.mock.calls.some(([request]) =>
				/pullrequests\?searchCriteria\./i.test(request.url),
			),
			false,
		);
	},
);

test.each([
	["completed", "merged"],
	["abandoned", "closed"],
])(
	"terminal persisted pull request keeps its badge and restores create actions (%s)",
	async (status, state) => {
		const fetch = vi.fn(async ({ url, init }) => {
			if (/\/repositories\/[^/?]+\?/.test(url)) {
				return Response.json({
					id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
					name: "repo",
				});
			}
			if (/\/pullrequests\/17\?/i.test(url)) {
				return Response.json(pullRequestRecord(status));
			}
			if (init.method === "GET") return Response.json({ value: [] });
			throw new Error("unexpected mutation");
		});
		const ui = await provider(fetch);
		const linked = await ui.read({
			...context,
			associatedUri:
				"https://dev.azure.com/org/project/_git/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequest/17",
		});

		expect(linked.contributions).toMatchObject([
			{ kind: "badge", state },
			{ kind: "button", action: { input: { draft: false } } },
			{ kind: "button", action: { input: { draft: true } } },
		]);
		assert.equal(
			fetch.mock.calls.some(([{ url }]) => /\/statuses/.test(url)),
			false,
		);
	},
);

test.each([
	["completed", "merged"],
	["abandoned", "closed"],
])(
	"terminal pull request discovered by refs restores create actions (%s)",
	async (status, state) => {
		const fetch = vi.fn(async ({ url, init }) => {
			if (/\/repositories\/[^/?]+\?/.test(url)) {
				return Response.json({
					id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
					name: "repo",
				});
			}
			if (init.method === "GET") {
				return Response.json({ value: [pullRequestRecord(status)] });
			}
			throw new Error("unexpected mutation");
		});
		const ui = await provider(fetch);
		const result = await ui.read(context);

		assert.deepEqual(
			result.contributions.map((entry) => [entry.kind, entry.state ?? null]),
			[
				["badge", state],
				["button", null],
				["button", null],
			],
		);
	},
);

for (const draft of [false, true]) {
	test(`real package maps ${draft ? "draft" : "normal"} creation into its declared badge`, async (t) => {
		const fetch = fetchFixture();
		const ui = await provider(fetch);
		assert.equal((await ui.read(context)).status, "ready");
		assert.equal(ui.actions[0].name, "create");
		const markMutationDispatched = vi.fn();
		const state = await ui.actions[0].handler({ draft }, context, {
			markMutationDispatched,
		});
		assert.deepEqual(state.contributions, [
			{
				kind: "badge",
				slot: "pr.status",
				id: "pull-request",
				number: 17,
				state: draft ? "draft" : "open",
				url: "https://dev.azure.com/org/project/_git/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequest/17",
			},
			{
				kind: "button",
				slot: draft ? "pr.publish" : "pr.mark-draft",
				id: draft ? "publish" : "mark-draft",
				label: draft ? "Publish" : "Mark as draft",
				action: { actionId: "set-draft", input: { draft: !draft } },
			},
		]);
		assert.equal(
			fetch.mock.calls.filter(([request]) => request?.init?.method === "POST")
				.length,
			1,
		);
		assert.equal(markMutationDispatched.mock.calls.length, 1);
		const post = fetch.mock.calls.find(
			([request]) => request.init.method === "POST",
		)[0];
		assert.deepEqual(JSON.parse(post.init.body), {
			title: context.title,
			description: context.description,
			sourceRefName: context.sourceRef,
			targetRefName: context.targetRef,
			isDraft: draft,
		});
	});
}

test("malformed action input cannot reach authenticated HTTP", async (t) => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	for (const input of [
		null,
		[],
		{},
		{ draft: "yes" },
		{ draft: false, repositoryId: "foreign" },
	]) {
		await assert.rejects(ui.actions[0].handler(input, context), /action/i);
	}
	assert.equal(fetch.mock.calls.length, 0);
});

test("transport failure is returned without retrying the mutation", async (t) => {
	const fetch = fetchFixture({ failPost: true });
	const ui = await provider(fetch);
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context),
		/connection lost/,
	);
	assert.equal(
		fetch.mock.calls.filter(([request]) => request?.init?.method === "POST")
			.length,
		1,
	);
});

test("a write is marked dispatched once fetch is invoked, even when it then fails", async () => {
	const fetch = fetchFixture({ failPost: true });
	const ui = await provider(fetch);
	const markMutationDispatched = vi.fn();
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context, {
			markMutationDispatched,
		}),
		/connection lost/,
	);
	assert.equal(markMutationDispatched.mock.calls.length, 1);
	assert.equal(
		fetch.mock.calls.filter(([request]) => request.init.method === "POST")
			.length,
		1,
	);
});

test("HTTP creation failures use only allowlisted agent-visible diagnostics", async () => {
	const fetch = fetchFixture();
	const baseFetch = fetch.getMockImplementation();
	fetch.mockImplementation(async (request) => {
		if (request.init.method !== "POST") return baseFetch(request);
		return Response.json(
			{
				typeKey: "ArgumentException",
				errorCode: 42,
				message:
					"Private https://dev.azure.com/org/project/_git/repo?token=secret\r\nParameter name: targetRefName",
				innerException: { message: "Private credential" },
			},
			{ status: 400 },
		);
	});
	const actionError = new Error("Authored public action failure");
	const createPullRequestError = vi.fn(() => actionError);
	const ui = await provider(
		fetch,
		fixtureAuthentication(),
		createPullRequestError,
	);
	const markMutationDispatched = vi.fn();
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context, {
			markMutationDispatched,
		}),
		(error) => error === actionError,
	);
	assert.equal(markMutationDispatched.mock.calls.length, 1);
	assert.equal(createPullRequestError.mock.calls.length, 1);
	const [details, options] = createPullRequestError.mock.calls[0];
	assert.deepEqual(details, {
		kind: "http",
		status: 400,
		serviceErrorType: "ArgumentException",
		serviceErrorCode: 42,
		parameter: "targetRefName",
		reason: "invalid_target_ref",
	});
	assert.doesNotMatch(
		JSON.stringify(details),
		/Private|dev\.azure|token|credential|:\/\//,
	);
	assert.ok(options.cause instanceof Error);
	assert.equal(options.cause.status, 400);
});

test("a write denied a token is neither dispatched nor marked", async () => {
	const fetch = fetchFixture();
	const authentication = fixtureAuthentication();
	const ui = await provider(fetch, authentication);
	// Repository resolution reads first; deny only the write's token.
	authentication.getAccessToken
		.mockImplementationOnce(
			authentication.getAccessToken.getMockImplementation(),
		)
		.mockImplementationOnce(async () => {
			throw Object.assign(new Error("Authentication denied"), {
				code: "denied",
			});
		});
	const markMutationDispatched = vi.fn();
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context, {
			markMutationDispatched,
		}),
		/^Error: Authentication denied$/,
	);
	assert.equal(authentication.getAccessToken.mock.calls.length, 2);
	assert.equal(fetch.mock.calls.length, 1);
	assert.equal(markMutationDispatched.mock.calls.length, 0);
	assert.equal(
		fetch.mock.calls.some(([request]) => request.init.method === "POST"),
		false,
	);
});

test("denied authentication surfaces a safe error before any request", async () => {
	const fetch = fetchFixture();
	const authentication = {
		getAccessToken: vi.fn(async () => {
			throw Object.assign(new Error("Authentication denied"), {
				code: "denied",
			});
		}),
	};
	const ui = await provider(fetch, authentication);
	const markMutationDispatched = vi.fn();
	await assert.rejects(ui.read(context), {
		message: "Authentication denied",
		code: "denied",
	});
	await assert.rejects(
		ui.actions[0].handler({ draft: false }, context, {
			markMutationDispatched,
		}),
		{ message: "Authentication denied", code: "denied" },
	);
	assert.equal(fetch.mock.calls.length, 0);
	assert.equal(markMutationDispatched.mock.calls.length, 0);
});

test("operation-scoped reads and creation request tokens without an account", async () => {
	const fetch = fetchFixture();
	const authentication = fixtureAuthentication();
	const ui = await provider(fetch, authentication);
	await ui.actions[0].handler({ draft: false }, context);
	await ui.read(context);
	await ui.read({
		...context,
		associatedUri: "https://dev.azure.com/org/project/_git/repo/pullrequest/17",
	});
	assert.ok(authentication.getAccessToken.mock.calls.length >= 3);
	for (const [input] of authentication.getAccessToken.mock.calls)
		assert.deepEqual(input, { resource: "azure-devops" });
});

test("the access token never reaches returned state or errors", async () => {
	const fetch = fetchFixture();
	const ui = await provider(fetch);
	const created = await ui.actions[0].handler({ draft: false }, context);
	const read = await ui.read(context);
	assert.equal(JSON.stringify([created, read]).includes(ACCESS_TOKEN), false);

	const baseFetch = fetch.getMockImplementation();
	fetch.mockImplementation((request) =>
		new URL(request.url).pathname.endsWith("/statuses")
			? new Response("", { status: 401 })
			: baseFetch(request),
	);
	const checksFailure = await ui.read(context);
	assert.match(checksFailure.error, /checks.*unavailable/i);
	assert.equal(JSON.stringify(checksFailure).includes(ACCESS_TOKEN), false);

	fetch.mockImplementation(async () => new Response("", { status: 401 }));
	const error = await ui.read(context).then(
		() => assert.fail("expected the PR read to fail"),
		(failure) => failure,
	);
	assert.equal(String(error).includes(ACCESS_TOKEN), false);
	assert.equal(String(error.stack).includes(ACCESS_TOKEN), false);
});

test("a foreign pull request link is rejected before a token is requested", async () => {
	const fetch = fetchFixture();
	const authentication = fixtureAuthentication();
	const ui = await provider(fetch, authentication);
	await assert.rejects(
		ui.read({
			...context,
			associatedUri:
				"https://evil.example/org/project/_git/repo/pullrequest/17",
		}),
		/unsupported/i,
	);
	assert.equal(authentication.getAccessToken.mock.calls.length, 0);
	assert.equal(fetch.mock.calls.length, 0);
});
