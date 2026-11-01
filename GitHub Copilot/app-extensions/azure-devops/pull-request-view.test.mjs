// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import * as pullRequestCanvas from "./pull-request-canvas.mjs";
import { parsePullRequestViewContext } from "./pull-request-locator.mjs";
import {
	createPullRequestView,
	supportsPullRequestView,
} from "./pull-request-view.mjs";

const authentication = {
	getAccessToken: vi.fn(),
};

afterEach(() => vi.unstubAllGlobals());

test.each([
	"https://dev.azure.com/org/project/_git/repo/pullrequest/42",
	"https://dev.azure.com/org/Project%20Name/_git/repo/pullrequest/42?_a=files",
	"https://dev.azure.com/1esgitops/_git/agency/pullrequest/42",
	"https://org.visualstudio.com/project/_git/repo/pullrequest/42",
	"https://org.visualstudio.com/DefaultCollection/project/_git/repo/pullrequest/42?path=/src/app.mjs&_a=files",
])("supports an existing ADO PR locator without sign-in: %s", (url) => {
	expect(supportsPullRequestView({ url })).toBe(true);
});

test("infers the project from a project-less dev.azure.com repository URL", () => {
	expect(
		parsePullRequestViewContext({
			url: "https://dev.azure.com/1esgitops/_git/agency/pullrequest/42",
		}),
	).toEqual({
		organization: "1esgitops",
		project: "agency",
		repository: "agency",
		pullRequestId: 42,
	});
});

test.each([
	null,
	{},
	{ url: "https://github.com/owner/repo/pull/42" },
	{
		url: "https://dev.azure.com.evil.example/org/project/_git/repo/pullrequest/42",
	},
	{
		url: "https://user:token@dev.azure.com/org/project/_git/repo/pullrequest/42",
	},
	{ url: "http://dev.azure.com/org/project/_git/repo/pullrequest/42" },
	{ url: "https://dev.azure.com:8443/org/project/_git/repo/pullrequest/42" },
	{ url: "https://dev.azure.com/org/project/_git/repo" },
	{ url: "https://dev.azure.com/org/project/_git/repo/pullrequest/0" },
	{
		url: "https://dev.azure.com/org/project/_git/repo/extra/pullrequest/42",
	},
	{
		url: "https://dev.azure.com/org/project/_git/repo/pullrequest/17/pullrequest/42",
	},
	{
		url: "https://dev.azure.com/org/proj%0Aect/_git/repo/pullrequest/42",
	},
	{
		url: "https://org.visualstudio.com/project/_git/re%00po/pullrequest/42",
	},
	{
		url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
		accountId: "other",
	},
])("rejects unsupported or credential-bearing context: %j", (context) => {
	expect(supportsPullRequestView(context)).toBe(false);
});

test("a declared view cannot open without an app-selected account", async () => {
	const fetchSpy = vi.spyOn(globalThis, "fetch");
	const view = createPullRequestView(authentication);
	const instanceId = randomUUID();
	try {
		await expect(
			view.open({
				instanceId,
				input: {
					url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
				},
				reopen: false,
			}),
		).rejects.toThrow("authorized Azure DevOps account");
		expect(fetchSpy).not.toHaveBeenCalled();
	} finally {
		await view.dispose();
		fetchSpy.mockRestore();
	}
});

test("unsupported context cannot allocate a provider canvas", async () => {
	const view = createPullRequestView(authentication);
	try {
		await expect(
			view.open({
				instanceId: randomUUID(),
				input: { url: "https://github.com/owner/repo/pull/42" },
			}),
		).rejects.toThrow("not supported");
	} finally {
		await view.dispose();
	}
});

test("keeps the declared view available without an authentication facade", async () => {
	const canvas = {
		open: vi.fn(),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const spy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	onTestFinished(() => spy.mockRestore());

	expect(() => createPullRequestView()).not.toThrow();
	const injectedAuthentication = spy.mock.calls[0][0].authentication;
	await expect(
		injectedAuthentication.getAccessToken({
			accountId: "unavailable-account",
			resource: "azure-devops",
		}),
	).rejects.toThrow("authentication is unavailable");
});

test("injects the admitted process authentication facade into the PR canvas", () => {
	const canvas = {
		open: vi.fn(),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const spy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	onTestFinished(() => spy.mockRestore());

	const view = createPullRequestView(authentication);

	expect(spy).toHaveBeenCalledWith({
		authentication,
		getAccess: expect.any(Function),
		refreshIntervalMs: 60_000,
	});
	expect(view.canvas.actions).toBe(canvas.actions);
	expect(view.canvas.onClose).toBe(canvas.onClose);
	// The canvas contribution is a distinct handler set: registering it must never hand
	// the account-bound opener to the generic canvas open.
	expect(view.canvas.open).not.toBe(view.open);
});

test("the generic canvas contribution opens unbound and takes no account", async () => {
	const calls = [];
	const canvas = {
		setBinding: vi.fn((instanceId, binding) => calls.push(binding)),
		open: vi.fn(() => ({ url: "http://127.0.0.1/canvas" })),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const canvasSpy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	const fetchSpy = vi.spyOn(globalThis, "fetch");
	onTestFinished(() => {
		canvasSpy.mockRestore();
		fetchSpy.mockRestore();
	});

	const view = createPullRequestView(authentication);
	await view.canvas.open({
		instanceId: "public-instance",
		input: {
			url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
		},
		accountId: "smuggled-account",
	});

	expect(calls).toEqual([null]);
	expect(canvas.open).toHaveBeenCalledWith({
		instanceId: "public-instance",
		input: {},
	});
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
	expect(fetchSpy).not.toHaveBeenCalled();
});

test("the generic canvas contribution still refuses an unsupported locator", async () => {
	const view = createPullRequestView(authentication);
	try {
		await expect(
			view.canvas.open({
				instanceId: randomUUID(),
				input: { url: "https://github.com/owner/repo/pull/42" },
			}),
		).rejects.toThrow("not supported");
	} finally {
		await view.dispose();
	}
});

test("resolves and binds the saved PR with an account-scoped token before the retained canvas opens", async () => {
	const url =
		"https://dev.azure.com/fabrikam/Project%20Name/_git/tools/pullrequest/42";
	const repositoryEndpoint =
		"https://dev.azure.com/fabrikam/Project%20Name/_apis/git/repositories/tools?api-version=7.1";
	const calls = [];
	const canvas = {
		setBinding: vi.fn(() => calls.push("bind")),
		open: vi.fn(() => {
			calls.push("open");
			return { url: "http://127.0.0.1/canvas" };
		}),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const canvasSpy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	const fetch = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
				name: "tools",
				project: { id: "project-id" },
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		),
	);
	vi.stubGlobal("fetch", fetch);
	const authentication = {
		getAccessToken: vi.fn(async () => ({ accessToken: "fixture-token" })),
	};
	onTestFinished(() => {
		canvasSpy.mockRestore();
	});

	const view = createPullRequestView(authentication);
	const opened = await view.open({
		instanceId: "retained-instance",
		input: { url },
		accountId: "selected-account",
	});
	expect(opened.title).toBe("PR #42");

	expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
		accountId: "selected-account",
		resource: "azure-devops",
	});
	expect(fetch).toHaveBeenCalledExactlyOnceWith(
		repositoryEndpoint,
		expect.objectContaining({
			method: "GET",
			redirect: "error",
			headers: {
				Accept: "application/json",
				"User-Agent": "ADOGithubApp",
				Authorization: `Bearer ${"fixture-token"}`,
			},
		}),
	);
	expect(canvas.setBinding).toHaveBeenCalledWith("retained-instance", {
		repository: {
			organization: "fabrikam",
			project: "project-id",
			repositoryId: "3411ebc1-d5aa-464f-9615-0b527bc66719",
			accountId: "selected-account",
		},
		pullRequestId: 42,
		authorizedActions: [],
	});
	expect(calls).toEqual(["bind", "open"]);
	expect(canvas.open).toHaveBeenCalledWith({
		instanceId: "retained-instance",
		input: {},
	});
	expect(JSON.stringify([opened, canvas.setBinding.mock.calls])).not.toContain(
		"fixture-token",
	);
});

test.each([
	{ authorizedActions: ["build-retry"] },
	{ authorizedActions: ["vote", "vote"] },
])(
	"a bound open rejects unsupported or duplicate action grants: %j",
	async ({ authorizedActions }) => {
		const canvas = {
			setBinding: vi.fn(),
			open: vi.fn(),
			actions: [],
			onClose: vi.fn(),
			dispose: vi.fn(),
		};
		const canvasSpy = vi
			.spyOn(pullRequestCanvas, "createPullRequestCanvas")
			.mockReturnValueOnce(canvas);
		onTestFinished(() => canvasSpy.mockRestore());
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const view = createPullRequestView(authentication);

		await expect(
			view.open({
				instanceId: "retained-instance",
				input: {
					url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
				},
				accountId: "selected-account",
				authorizedActions,
			}),
		).rejects.toThrow("Unsupported Azure DevOps pull request action grant");
		expect(fetch).not.toHaveBeenCalled();
		expect(canvas.setBinding).not.toHaveBeenCalled();
	},
);

test.each([
	{
		allowed: true,
		expected: [
			"edit",
			"comment",
			"reply",
			"edit-comment",
			"delete-comment",
			"thread-status",
			"vote",
			"reviewer",
			"draft",
			"complete",
			"abandon",
			"reactivate",
		],
	},
	{ allowed: false, expected: null },
])(
	"production access resolves the bound identity and intersects the host grant when allowed=$allowed",
	async ({ allowed, expected }) => {
		const canvas = {
			open: vi.fn(),
			actions: [],
			onClose: vi.fn(),
			dispose: vi.fn(),
		};
		const canvasSpy = vi
			.spyOn(pullRequestCanvas, "createPullRequestCanvas")
			.mockReturnValueOnce(canvas);
		onTestFinished(() => canvasSpy.mockRestore());
		const viewerId = "44444444-4444-4444-8444-444444444444";
		const projectId = "11111111-1111-4111-8111-111111111111";
		const repositoryId = "22222222-2222-4222-8222-222222222222";
		const fetch = vi.fn(async (input) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/_apis/connectionData"))
				return Response.json({ authenticatedUser: { id: viewerId } });
			if (url.pathname.includes("/_apis/permissions/"))
				return Response.json({ count: 1, value: [allowed] });
			return new Response(null, { status: 404 });
		});
		vi.stubGlobal("fetch", fetch);
		const getAccessToken = vi.fn(async () => ({
			accessToken: "fixture-token",
		}));
		createPullRequestView({ getAccessToken });
		const getAccess = canvasSpy.mock.calls[0][0].getAccess;
		const access = await getAccess(
			{
				repository: {
					organization: "fabrikam",
					project: projectId,
					repositoryId,
					accountId: "selected-account",
				},
				pullRequestId: 42,
				authorizedActions: [
					"edit",
					"comment",
					"reply",
					"edit-comment",
					"delete-comment",
					"thread-status",
					"vote",
					"reviewer",
					"draft",
					"complete",
					"abandon",
					"reactivate",
				],
			},
			{ signal: new AbortController().signal },
		);

		expect(access?.viewerId ?? null).toBe(allowed ? viewerId : null);
		expect(access?.operations ?? null).toEqual(expected);
		expect(getAccessToken).toHaveBeenCalledTimes(allowed ? 2 : 1);
		const permissionUrl = new URL(
			String(
				fetch.mock.calls.find(([input]) =>
					String(input).includes("/_apis/permissions/"),
				)?.[0],
			),
		);
		expect(permissionUrl.searchParams.get("tokens")).toBe(
			`repoV2/${projectId}/${repositoryId}`,
		);
		expect(permissionUrl.searchParams.get("alwaysAllowAdministrators")).toBe(
			"false",
		);
	},
);

test("a production bound view supports editing, discussion, reviewers and lifecycle actions but rejects ungranted writes", async () => {
	const realFetch = globalThis.fetch;
	const projectId = "11111111-1111-4111-8111-111111111111";
	const repositoryId = "22222222-2222-4222-8222-222222222222";
	const viewerId = "44444444-4444-4444-8444-444444444444";
	const otherUserId = "55555555-5555-4555-8555-555555555555";
	const sourceCommitId = "a".repeat(40);
	const targetCommitId = "b".repeat(40);
	let title = "Enable production actions";
	let status = "active";
	let isDraft = false;
	let permissionAllowed = true;
	let nextThreadId = 8;
	const writes = [];
	const threads = [
		{
			id: 7,
			status: "active",
			comments: [
				{
					id: 1,
					parentCommentId: 0,
					commentType: "text",
					content: "Original reviewer comment",
					author: { id: viewerId, displayName: "Bound reviewer" },
					publishedDate: "2026-10-08T12:00:00Z",
				},
				{
					id: 2,
					parentCommentId: 1,
					commentType: "text",
					content: "Author reply",
					author: { id: otherUserId, displayName: "Pull request author" },
					publishedDate: "2026-10-08T12:05:00Z",
				},
			],
		},
	];
	const pullRequest = () => ({
		pullRequestId: 42,
		repository: { id: repositoryId, project: { id: projectId } },
		title,
		description: "Use the existing ADO action implementation.",
		status,
		isDraft,
		sourceRefName: "refs/heads/topic",
		targetRefName: "refs/heads/main",
		lastMergeSourceCommit: { commitId: sourceCommitId },
		lastMergeTargetCommit: { commitId: targetCommitId },
		mergeStatus: "succeeded",
		reviewers: [],
	});
	const adoFetch = vi.fn(async (input, options = {}) => {
		const url = new URL(String(input));
		const method = options.method ?? "GET";
		if (url.pathname.endsWith("/_apis/git/repositories/tools"))
			return Response.json({
				id: repositoryId,
				name: "tools",
				project: { id: projectId },
			});
		if (url.pathname.endsWith("/_apis/connectionData"))
			return Response.json({ authenticatedUser: { id: viewerId } });
		if (url.pathname.includes("/_apis/permissions/"))
			return Response.json({ count: 1, value: [permissionAllowed] });
		if (url.pathname.endsWith("/refs")) {
			const name = `refs/${url.searchParams.get("filter") ?? ""}`;
			const objectId =
				name === "refs/heads/topic"
					? sourceCommitId
					: name === "refs/heads/main"
						? targetCommitId
						: null;
			return Response.json({
				count: objectId ? 1 : 0,
				value: objectId ? [{ name, objectId }] : [],
			});
		}
		if (url.pathname.endsWith("/pullrequests/42/threads")) {
			if (method === "POST") {
				const body = JSON.parse(options.body);
				expect(body).toEqual({
					comments: [
						{
							parentCommentId: 0,
							content: "Production comment",
							commentType: 1,
						},
					],
					status: 1,
				});
				const created = {
					id: nextThreadId++,
					status: "active",
					comments: body.comments.map((comment, index) => ({
						id: index + 1,
						author: { id: viewerId, displayName: "Bound reviewer" },
						publishedDate: "2026-10-08T12:10:00Z",
						...comment,
					})),
				};
				threads.push(created);
				writes.push("comment");
				return Response.json(created);
			}
			return Response.json({ count: threads.length, value: threads });
		}
		const threadRoute = /\/pullrequests\/42\/threads\/(\d+)$/.exec(
			url.pathname,
		);
		if (threadRoute) {
			const thread = threads.find((item) => item.id === Number(threadRoute[1]));
			if (!thread) return new Response(null, { status: 404 });
			if (method === "PATCH") {
				thread.status = JSON.parse(options.body).status;
				writes.push("thread-status");
			}
			return Response.json(thread);
		}
		const replyRoute = /\/pullrequests\/42\/threads\/(\d+)\/comments$/.exec(
			url.pathname,
		);
		if (replyRoute && method === "POST") {
			const thread = threads.find((item) => item.id === Number(replyRoute[1]));
			if (!thread) return new Response(null, { status: 404 });
			const body = JSON.parse(options.body);
			expect(body).toEqual({
				content: "Production thread reply",
				parentCommentId: 1,
				commentType: 1,
			});
			const comment = {
				id: 3,
				author: { id: viewerId, displayName: "Bound reviewer" },
				publishedDate: "2026-10-08T12:15:00Z",
				...body,
			};
			thread.comments.push(comment);
			writes.push("reply");
			return Response.json(comment);
		}
		const commentRoute =
			/\/pullrequests\/42\/threads\/(\d+)\/comments\/(\d+)$/.exec(url.pathname);
		if (commentRoute && method === "PATCH") {
			const thread = threads.find(
				(item) => item.id === Number(commentRoute[1]),
			);
			const comment = thread?.comments.find(
				(item) => item.id === Number(commentRoute[2]),
			);
			if (!comment) return new Response(null, { status: 404 });
			comment.content = JSON.parse(options.body).content;
			writes.push("edit-comment");
			return Response.json(comment);
		}
		if (commentRoute && method === "DELETE") {
			const thread = threads.find(
				(item) => item.id === Number(commentRoute[1]),
			);
			const commentIndex = thread?.comments.findIndex(
				(item) => item.id === Number(commentRoute[2]),
			);
			if (!thread || commentIndex === undefined || commentIndex < 0)
				return new Response(null, { status: 404 });
			thread.comments.splice(commentIndex, 1);
			writes.push("delete-comment");
			return new Response(null, { status: 204 });
		}
		if (url.pathname.endsWith(`/pullrequests/42/reviewers/${viewerId}`)) {
			writes.push("vote");
			return Response.json({
				id: viewerId,
				displayName: "Bound reviewer",
				vote: JSON.parse(options.body).vote,
				isRequired: false,
			});
		}
		if (url.pathname.endsWith("/pullrequests/42") && method === "PATCH") {
			const body = JSON.parse(options.body);
			if (typeof body.title === "string") {
				title = body.title;
				writes.push("edit");
			} else if (typeof body.isDraft === "boolean") {
				isDraft = body.isDraft;
				status = "active";
				writes.push(isDraft ? "draft" : "publish");
			} else if (body.status === "abandoned") {
				status = "abandoned";
				writes.push("abandon");
			} else if (body.status === "active") {
				status = "active";
				isDraft = false;
				writes.push("reactivate");
			} else if (body.status === "completed") {
				status = "completed";
				writes.push("complete");
			} else {
				return new Response(null, { status: 400 });
			}
			return Response.json(pullRequest());
		}
		if (url.pathname.endsWith("/pullrequests/42") && method === "GET")
			return Response.json(pullRequest());
		return Response.json({ count: 0, value: [] });
	});
	vi.stubGlobal("fetch", (input, options) =>
		new URL(String(input)).hostname === "dev.azure.com"
			? adoFetch(input, options)
			: realFetch(input, options),
	);
	const view = createPullRequestView({
		getAccessToken: async () => ({ accessToken: "fixture-token" }),
	});
	onTestFinished(() => view.dispose());
	const instanceId = randomUUID();
	const { url } = await view.open({
		instanceId,
		input: {
			url: "https://dev.azure.com/fabrikam/tools/_git/tools/pullrequest/42",
		},
		accountId: "selected-account",
		authorizedActions: [
			"edit",
			"comment",
			"reply",
			"edit-comment",
			"delete-comment",
			"thread-status",
			"vote",
			"reviewer",
			"draft",
			"complete",
			"abandon",
			"reactivate",
		],
	});
	const origin = new URL(url).origin;
	const getState = async () =>
		(await realFetch(`${origin}/instances/${instanceId}`)).json();
	await expect.poll(async () => (await getState()).status).toBe("ready");
	const state = await getState();
	expect(state.access).toEqual({
		viewerId,
		operations: [
			"edit",
			"comment",
			"reply",
			"edit-comment",
			"delete-comment",
			"thread-status",
			"vote",
			"reviewer",
			"draft",
			"complete",
			"abandon",
			"reactivate",
		],
	});
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String(state.bindingRevision),
	};
	expect(
		(
			await realFetch(`${origin}/load-overview/${instanceId}`, {
				method: "POST",
				headers,
			})
		).status,
	).toBe(202);
	await expect
		.poll(async () => (await getState()).overview)
		.toMatchObject({ status: "ready" });
	const mutate = (operation, input) =>
		realFetch(`${origin}/mutate/${instanceId}`, {
			method: "POST",
			headers,
			body: JSON.stringify({ operation, input }),
		});

	const denied = await mutate("build-retry", { buildId: 12 });
	expect(denied.ok).toBe(false);
	expect(await denied.text()).toContain("not authorized");
	expect(writes).toEqual([]);

	permissionAllowed = false;
	for (const [operation, input] of [
		["comment", { content: "Denied comment" }],
		["reply", { threadId: 7, content: "Denied reply" }],
		["thread-status", { threadId: 7, status: "fixed" }],
	]) {
		const revoked = await mutate(operation, input);
		expect(revoked.ok).toBe(false);
		expect(await revoked.text()).toContain("not authorized");
	}
	expect(writes).toEqual([]);

	permissionAllowed = true;
	expect((await mutate("edit", { title: "Updated production title" })).ok).toBe(
		true,
	);
	await expect
		.poll(async () => (await getState()).pullRequest.title)
		.toBe("Updated production title");
	expect((await mutate("comment", { content: "Production comment" })).ok).toBe(
		true,
	);
	await expect
		.poll(async () =>
			(await getState()).overview.data?.threads.find(
				(thread) => thread.id === 8,
			),
		)
		.toMatchObject({
			status: "active",
			comments: [
				{
					parentCommentId: 0,
					content: "Production comment",
					author: { id: viewerId },
				},
			],
		});
	const foreignEdit = await mutate("edit-comment", {
		threadId: 7,
		commentId: 2,
		content: "Not my comment",
	});
	expect(foreignEdit.ok).toBe(false);
	expect(await foreignEdit.text()).toContain("Only your own loaded comments");
	expect(writes).toEqual(["edit", "comment"]);
	expect(
		(
			await mutate("edit-comment", {
				threadId: 7,
				commentId: 1,
				content: "Updated reviewer comment",
			})
		).ok,
	).toBe(true);
	expect(
		(
			await mutate("reply", {
				threadId: 7,
				content: "Production thread reply",
			})
		).ok,
	).toBe(true);
	await expect
		.poll(async () =>
			(await getState()).overview.data?.threads
				.find((thread) => thread.id === 7)
				?.comments.find((comment) => comment.id === 3),
		)
		.toMatchObject({
			parentCommentId: 1,
			content: "Production thread reply",
			author: { id: viewerId },
		});
	for (const status of ["fixed", "active"]) {
		expect((await mutate("thread-status", { threadId: 7, status })).ok).toBe(
			true,
		);
		await expect
			.poll(async () =>
				(await getState()).overview.data?.threads.find(
					(thread) => thread.id === 7,
				),
			)
			.toMatchObject({ status });
	}
	expect(
		(
			await mutate("delete-comment", {
				threadId: 7,
				commentId: 1,
			})
		).ok,
	).toBe(true);
	expect((await mutate("vote", { vote: 10 })).ok).toBe(true);
	expect((await mutate("draft", { draft: true })).ok).toBe(true);
	await expect
		.poll(async () => (await getState()).pullRequest.state)
		.toBe("draft");
	expect((await mutate("vote", { vote: -10 })).ok).toBe(false);
	expect((await mutate("draft", { draft: true })).ok).toBe(false);
	expect((await mutate("draft", { draft: false })).ok).toBe(true);
	await expect
		.poll(async () => (await getState()).pullRequest.state)
		.toBe("open");
	expect((await mutate("abandon", { confirm: true })).ok).toBe(true);
	await expect
		.poll(async () => (await getState()).pullRequest.state)
		.toBe("closed");
	expect(
		(
			await mutate("reviewer", {
				reviewerId: viewerId,
				remove: false,
				isRequired: false,
			})
		).ok,
	).toBe(false);
	expect(writes).toEqual([
		"edit",
		"comment",
		"edit-comment",
		"reply",
		"thread-status",
		"thread-status",
		"delete-comment",
		"vote",
		"draft",
		"publish",
		"abandon",
	]);
	expect((await mutate("reactivate", { confirm: true })).ok).toBe(true);
	await expect
		.poll(async () => (await getState()).pullRequest.state)
		.toBe("open");
	for (const thread of threads) thread.status = "fixed";
	const completionResponse = await mutate("complete", {
		confirm: true,
		mergeStrategy: "squash",
		deleteSourceBranch: false,
	});
	expect(completionResponse.ok, await completionResponse.text()).toBe(true);
	expect(writes).toEqual([
		"edit",
		"comment",
		"edit-comment",
		"reply",
		"thread-status",
		"thread-status",
		"delete-comment",
		"vote",
		"draft",
		"publish",
		"abandon",
		"reactivate",
		"complete",
	]);
	await expect
		.poll(async () => (await getState()).pullRequest.state)
		.toBe("merged");
	for (const [operation, input] of [
		["vote", { vote: 10 }],
		["draft", { draft: true }],
		["complete", { confirm: true, mergeStrategy: "squash" }],
		["abandon", { confirm: true }],
		["reactivate", { confirm: true }],
		["reviewer", { reviewerId: viewerId, remove: false, isRequired: false }],
	])
		expect((await mutate(operation, input)).ok).toBe(false);
	expect(writes).toEqual([
		"edit",
		"comment",
		"edit-comment",
		"reply",
		"thread-status",
		"thread-status",
		"delete-comment",
		"vote",
		"draft",
		"publish",
		"abandon",
		"reactivate",
		"complete",
	]);
});

test("a production bound view searches and manages reviewers through its fixed grant", async () => {
	const realFetch = globalThis.fetch;
	const projectId = "11111111-1111-4111-8111-111111111111";
	const repositoryId = "22222222-2222-4222-8222-222222222222";
	const viewerId = "44444444-4444-4444-8444-444444444444";
	const graceId = "55555555-5555-4555-8555-555555555555";
	const qirenId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const raceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
	let status = "active";
	let permissionAllowed = true;
	const permissionSequence = [];
	const reviewers = new Map([
		[
			graceId,
			{
				id: graceId,
				displayName: "Grace Hopper",
				vote: 5,
				isRequired: false,
			},
		],
	]);
	const writes = [];
	const pullRequest = () => ({
		pullRequestId: 42,
		repository: { id: repositoryId, project: { id: projectId } },
		title: "Manage production reviewers",
		description: "Use the existing ADO reviewer workflow.",
		status,
		sourceRefName: "refs/heads/topic",
		targetRefName: "refs/heads/main",
		lastMergeSourceCommit: { commitId: "a".repeat(40) },
		mergeStatus: "succeeded",
		reviewers: [...reviewers.values()],
	});
	const adoFetch = vi.fn(async (input, options = {}) => {
		const url = new URL(String(input));
		const method = options.method ?? "GET";
		if (url.pathname.endsWith("/_apis/git/repositories/tools"))
			return Response.json({
				id: repositoryId,
				name: "tools",
				project: { id: projectId },
			});
		if (url.pathname.endsWith("/_apis/connectionData"))
			return Response.json({ authenticatedUser: { id: viewerId } });
		if (url.pathname.includes("/_apis/permissions/"))
			return Response.json({
				count: 1,
				value: [
					permissionSequence.length
						? permissionSequence.shift()
						: permissionAllowed,
				],
			});
		if (
			url.hostname === "vssps.dev.azure.com" &&
			url.pathname.endsWith("/_apis/identities")
		)
			return Response.json({
				count: 1,
				value: [
					{
						id: qirenId,
						providerDisplayName: "Qiren Lu",
						isActive: true,
						properties: {
							Account: { $value: "v-qirenlu" },
							Mail: { $value: "v-qirenlu@microsoft.com" },
						},
					},
				],
			});
		if (url.pathname.endsWith("/_apis/projects/tools/teams"))
			return Response.json({ count: 0, value: [] });
		if (url.pathname.endsWith("/_apis/graph/subjectquery") && method === "POST")
			return Response.json({ count: 0, value: [] });
		const reviewersRoute = /\/pullrequests\/42\/reviewers$/.test(url.pathname);
		const reviewerRoute = /\/pullrequests\/42\/reviewers\/([^/]+)$/.exec(
			url.pathname,
		);
		if (reviewersRoute && method === "POST") {
			const body = JSON.parse(String(options.body));
			const added = body.map(({ id }) => {
				const current = reviewers.get(id);
				if (current) return current;
				const changed = {
					id,
					displayName: id === qirenId ? "Qiren Lu" : "Requested reviewer",
					vote: 0,
					isRequired: false,
				};
				reviewers.set(id, changed);
				return changed;
			});
			writes.push({ method, body });
			return Response.json(added);
		}
		if (reviewerRoute) {
			const id = decodeURIComponent(reviewerRoute[1]);
			const current = reviewers.get(id);
			if (method === "GET")
				return Response.json(current ?? {}, { status: current ? 200 : 404 });
			if (method === "DELETE") {
				writes.push({ method, id });
				reviewers.delete(id);
				return new Response(null, { status: 204 });
			}
			if (method === "PUT") {
				const body = JSON.parse(String(options.body));
				if (id !== viewerId && body.vote !== 0)
					return new Response("TF401186: Cannot vote for another reviewer.", {
						status: 400,
					});
				const changed = {
					id,
					displayName:
						id === qirenId ? "Qiren Lu" : (current?.displayName ?? "Reviewer"),
					vote: body.vote,
					isRequired: body.isRequired ?? false,
				};
				writes.push({ method, id, body });
				reviewers.set(id, changed);
				return Response.json(changed);
			}
		}
		if (url.pathname.endsWith("/pullrequests/42"))
			return Response.json(pullRequest());
		return Response.json({ count: 0, value: [] });
	});
	vi.stubGlobal("fetch", (input, options) =>
		new URL(String(input)).hostname.endsWith("dev.azure.com")
			? adoFetch(input, options)
			: realFetch(input, options),
	);
	const view = createPullRequestView({
		getAccessToken: async () => ({ accessToken: "fixture-token" }),
	});
	onTestFinished(() => view.dispose());
	const instanceId = randomUUID();
	const { url } = await view.open({
		instanceId,
		input: {
			url: "https://dev.azure.com/fabrikam/tools/_git/tools/pullrequest/42",
		},
		accountId: "selected-account",
		authorizedActions: ["reviewer"],
	});
	const origin = new URL(url).origin;
	const getState = async () =>
		(await realFetch(`${origin}/instances/${instanceId}`)).json();
	await expect.poll(async () => (await getState()).status).toBe("ready");
	const state = await getState();
	expect(state.access).toEqual({
		viewerId,
		operations: ["reviewer"],
	});
	const headers = {
		Origin: origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String(state.bindingRevision),
	};
	expect(
		(
			await realFetch(`${origin}/load-overview/${instanceId}`, {
				method: "POST",
				headers,
			})
		).status,
	).toBe(202);
	await expect
		.poll(async () => (await getState()).overview.status)
		.toBe("ready");
	const search = (query) =>
		realFetch(`${origin}/search-reviewers/${instanceId}`, {
			method: "POST",
			headers,
			body: JSON.stringify({ query }),
		});
	const mutate = (input) =>
		realFetch(`${origin}/mutate/${instanceId}`, {
			method: "POST",
			headers,
			body: JSON.stringify({ operation: "reviewer", input }),
		});

	permissionAllowed = false;
	const deniedSearch = await search("v-qirenlu");
	expect(deniedSearch.ok).toBe(false);
	expect(await deniedSearch.text()).toContain("not authorized");
	expect(
		adoFetch.mock.calls.some(([input]) =>
			new URL(String(input)).pathname.endsWith("/_apis/identities"),
		),
	).toBe(false);

	permissionAllowed = true;
	const searchResponse = await search("v-qirenlu");
	expect(searchResponse.ok).toBe(true);
	await expect(searchResponse.json()).resolves.toEqual({
		reviewers: [
			{
				id: qirenId,
				name: "Qiren Lu",
				detail: "v-qirenlu@microsoft.com",
			},
		],
		incomplete: false,
	});

	permissionSequence.push(true, false);
	const revokedAdd = await mutate({
		reviewerId: qirenId,
		remove: false,
		isRequired: false,
	});
	expect(revokedAdd.ok).toBe(false);
	expect(await revokedAdd.text()).toContain("not authorized");
	expect(writes).toEqual([]);

	expect(
		(
			await mutate({
				reviewerId: qirenId,
				remove: false,
				isRequired: false,
			})
		).ok,
	).toBe(true);
	await expect
		.poll(
			async () =>
				(await getState()).overview.data?.reviewers.find(
					(reviewer) => reviewer.id === qirenId,
				)?.isRequired,
		)
		.toBe(false);

	reviewers.set(raceId, {
		id: raceId,
		displayName: "Concurrent reviewer",
		vote: 10,
		isRequired: true,
	});
	expect(
		(
			await mutate({
				reviewerId: raceId,
				remove: false,
				isRequired: false,
			})
		).ok,
	).toBe(true);
	await expect
		.poll(
			async () =>
				(await getState()).overview.data?.reviewers.find(
					(reviewer) => reviewer.id === raceId,
				)?.vote,
		)
		.toBe(10);
	expect(reviewers.get(raceId)).toMatchObject({
		vote: 10,
		isRequired: true,
	});

	const roleChange = await mutate({
		reviewerId: raceId,
		remove: false,
		isRequired: false,
	});
	expect(roleChange.ok).toBe(false);
	expect(await roleChange.text()).toContain("role");
	await expect
		.poll(
			async () =>
				(await getState()).overview.data?.reviewers.find(
					(reviewer) => reviewer.id === raceId,
				)?.isRequired,
		)
		.toBe(true);

	expect((await mutate({ reviewerId: graceId, remove: true })).ok).toBe(true);
	await expect
		.poll(async () =>
			(await getState()).overview.data?.reviewers.some(
				(reviewer) => reviewer.id === graceId,
			),
		)
		.toBe(false);
	status = "completed";
	const staleRemove = await mutate({ reviewerId: raceId, remove: true });
	expect(staleRemove.ok).toBe(false);
	expect(await staleRemove.text()).toContain("changed");
	expect(reviewers.has(raceId)).toBe(true);
	expect(writes).toEqual([
		{
			method: "POST",
			body: [{ id: qirenId }],
		},
		{ method: "POST", body: [{ id: raceId }] },
		{ method: "DELETE", id: graceId },
	]);
});

test("a denied retained-view token fails before any repository request", async () => {
	const canvas = {
		setBinding: vi.fn(),
		open: vi.fn(),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const canvasSpy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	onTestFinished(() => canvasSpy.mockRestore());
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	const getAccessToken = vi.fn(async () => {
		throw Object.assign(new Error("Authentication denied"), {
			code: "denied",
		});
	});
	const view = createPullRequestView({ getAccessToken });
	const error = await view
		.open({
			instanceId: "retained-instance",
			input: {
				url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
			},
			accountId: "selected-account",
		})
		.catch((error) => error);
	expect(error).toMatchObject({
		message: "Authentication denied",
		code: "denied",
	});
	expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({
		accountId: "selected-account",
		resource: "azure-devops",
	});
	expect(fetch).not.toHaveBeenCalled();
	expect(canvas.setBinding).not.toHaveBeenCalled();
	expect(canvas.open).not.toHaveBeenCalled();
});

test.each([
	{ id: "invalid", name: "tools" },
	{ id: "3411ebc1-d5aa-464f-9615-0b527bc66719", name: "another-repo" },
])(
	"retained opens reject a mismatched repository lookup: %j",
	async (repository) => {
		const canvas = {
			setBinding: vi.fn(),
			open: vi.fn(),
			dispose: vi.fn(),
		};
		const canvasSpy = vi
			.spyOn(pullRequestCanvas, "createPullRequestCanvas")
			.mockReturnValueOnce(canvas);
		onTestFinished(() => canvasSpy.mockRestore());
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					Response.json({ ...repository, project: { id: "project-id" } }),
				),
		);
		const view = createPullRequestView({
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		});
		await expect(
			view.open({
				instanceId: "retained-instance",
				input: {
					url: "https://dev.azure.com/org/project/_git/tools/pullrequest/42",
				},
				accountId: "selected-account",
			}),
		).rejects.toThrow(/invalid|lookup/);
		expect(canvas.setBinding).not.toHaveBeenCalled();
		expect(canvas.open).not.toHaveBeenCalled();
	},
);

test("keeps support registered but fails authorized reads without authentication", async () => {
	const canvas = {
		setBinding: vi.fn(),
		open: vi.fn(),
		actions: [],
		onClose: vi.fn(),
		dispose: vi.fn(),
	};
	const canvasSpy = vi
		.spyOn(pullRequestCanvas, "createPullRequestCanvas")
		.mockReturnValueOnce(canvas);
	onTestFinished(() => canvasSpy.mockRestore());

	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	const view = createPullRequestView();
	await expect(
		view.open({
			instanceId: "retained-instance",
			input: {
				url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
			},
			accountId: "selected-account",
		}),
	).rejects.toThrow("authentication is unavailable");
	expect(fetch).not.toHaveBeenCalled();
	expect(canvas.setBinding).not.toHaveBeenCalled();
	expect(canvas.open).not.toHaveBeenCalled();
});
