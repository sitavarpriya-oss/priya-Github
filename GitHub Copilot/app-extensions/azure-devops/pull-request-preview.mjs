import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";
import { createReviewStorage } from "./pull-request-review-state.mjs";

const projectId = "22222222-2222-4222-8222-222222222222";
const repository = {
	organization: "fabrikam",
	project: projectId,
	repositoryId: "11111111-1111-4111-8111-111111111111",
	accountId: "preview-account",
};
const baseCommit = "a".repeat(40);
const sourceCommit = "b".repeat(40);
const author = {
	id: "33333333-3333-4333-8333-333333333333",
	displayName: "Ada Example",
};
const reviewer = {
	id: "44444444-4444-4444-8444-444444444444",
	displayName: "Sam Example",
};
const activityActor = {
	id: "99999999-9999-4999-8999-999999999999",
	displayName: "Azure DevOps",
};
const previewReviewers = [
	{ ...reviewer, vote: 10, isRequired: true },
	{
		id: "55555555-5555-4555-8555-555555555555",
		displayName: "Grace Hopper",
		vote: 5,
		isRequired: false,
	},
	{
		id: "66666666-6666-4666-8666-666666666666",
		displayName: "Lin Chen",
		vote: -5,
		isRequired: true,
	},
	{
		id: "77777777-7777-4777-8777-777777777777",
		displayName: "Alan Turing",
		vote: -10,
		isRequired: true,
	},
	{
		id: "88888888-8888-4888-8888-888888888888",
		displayName: "Margaret Hamilton",
		vote: 0,
		isRequired: false,
	},
];
const previewReviewerDirectory = [
	{
		id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		displayName: "Qiren Lu",
		uniqueName: "v-qirenlu@microsoft.com",
		vote: 0,
		isRequired: false,
	},
	{
		id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		displayName: "Qiren Lu (Test)",
		uniqueName: "v-qirenlu@contoso.com",
		vote: 0,
		isRequired: false,
	},
];
const createdAt = "2026-09-10T09:00:00Z";
const files = [
	{ changeTrackingId: 1, changeType: "edit", item: { path: "/src/retry.ts" } },
	{
		changeTrackingId: 2,
		changeType: "add",
		item: { path: "/tests/retry.test.ts" },
	},
	{
		changeTrackingId: 3,
		changeType: "delete",
		item: { path: "/src/legacy-retry.ts" },
	},
	{
		changeTrackingId: 4,
		changeType: "rename",
		originalPath: "/docs/retries.md",
		item: { path: "/docs/retry-policy.md" },
	},
];
const initialThreads = [
	{
		id: 1,
		status: "active",
		publishedDate: createdAt,
		lastUpdatedDate: createdAt,
		threadContext: {
			filePath: "/src/retry.ts",
			rightFileStart: { line: 2, offset: 1 },
			rightFileEnd: { line: 2, offset: 1 },
		},
		pullRequestThreadContext: {
			changeTrackingId: 1,
			iterationContext: {
				firstComparingIteration: 2,
				secondComparingIteration: 2,
			},
		},
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: reviewer,
				content: "Does the retry limit include the first attempt?",
				publishedDate: createdAt,
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author,
				content: "Yes. There are at most three attempts in total.",
				publishedDate: createdAt,
				commentType: "text",
			},
			{
				id: 3,
				parentCommentId: 1,
				author: previewReviewers[1],
				content:
					"Could we include an example that shows how timeout errors are retried?",
				publishedDate: createdAt,
				commentType: "text",
			},
			{
				id: 4,
				parentCommentId: 1,
				author: previewReviewers[2],
				content:
					"**Question:** should cancellation stop the retry loop immediately?",
				publishedDate: createdAt,
				commentType: "text",
			},
			{
				id: 5,
				parentCommentId: 1,
				author: previewReviewers[3],
				content:
					"Please add coverage for permanent failures before this is completed.",
				publishedDate: createdAt,
				commentType: "text",
			},
		],
	},
	{
		id: 2,
		status: "fixed",
		publishedDate: "2026-09-10T10:00:00Z",
		lastUpdatedDate: "2026-09-10T12:00:00Z",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author,
				content:
					"The fallback should preserve the original error as the cause.",
				publishedDate: "2026-09-10T10:00:00Z",
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author: reviewer,
				content:
					"Updated in the latest push and added an assertion for the cause.",
				publishedDate: "2026-09-10T12:00:00Z",
				commentType: "text",
			},
		],
	},
	{
		id: 3,
		status: "active",
		publishedDate: "2026-09-10T13:00:00Z",
		lastUpdatedDate: "2026-09-10T15:00:00Z",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: previewReviewers[1],
				content:
					"Can we expose the retry reason in telemetry without including the error message?",
				publishedDate: "2026-09-10T13:00:00Z",
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author: previewReviewers[3],
				content:
					"The event name looks stable. The reason can stay in a bounded `RetryReason` enum.\n\n<details><summary>Details</summary>\n\nAllowed values: `Timeout`, `Throttled`.\n</details>",
				publishedDate: "2026-09-10T14:00:00Z",
				commentType: "text",
			},
			{
				id: 3,
				parentCommentId: 1,
				author: previewReviewers[4],
				content: "- [x] Timeout\n- [x] Throttled\n- [ ] Connection reset",
				publishedDate: "2026-09-10T15:00:00Z",
				commentType: "text",
			},
		],
	},
	{
		id: 4,
		status: "pending",
		publishedDate: "2026-09-11T09:00:00Z",
		lastUpdatedDate: "2026-09-11T09:30:00Z",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: reviewer,
				content:
					"Can we confirm the cancellation signal is checked before every retry?",
				publishedDate: "2026-09-11T09:00:00Z",
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author,
				content:
					"Yes. I am adding one final test before resolving this conversation.",
				publishedDate: "2026-09-11T09:30:00Z",
				commentType: "text",
			},
		],
	},
	{
		id: 5,
		status: "wontFix",
		publishedDate: "2026-09-11T11:00:00Z",
		lastUpdatedDate: "2026-09-11T11:20:00Z",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: previewReviewers[2],
				content: "Should retries use exponential backoff in this change?",
				publishedDate: "2026-09-11T11:00:00Z",
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author,
				content:
					"Not in this pull request. The current service contract requires fixed delays.",
				publishedDate: "2026-09-11T11:20:00Z",
				commentType: "text",
			},
		],
	},
	{
		id: 6,
		status: "byDesign",
		publishedDate: "2026-09-11T14:00:00Z",
		lastUpdatedDate: "2026-09-11T14:45:00Z",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: previewReviewers[4],
				content:
					"The legacy helper is still referenced by the compatibility path.",
				publishedDate: "2026-09-11T14:00:00Z",
				commentType: "text",
			},
			{
				id: 2,
				parentCommentId: 1,
				author: previewReviewers[1],
				content:
					"Keeping it is intentional until the older client version is retired.",
				publishedDate: "2026-09-11T14:45:00Z",
				commentType: "text",
			},
		],
	},
	...[
		[
			7,
			"2026-09-10T08:45:00Z",
			author,
			"created the pull request.",
			"StatusUpdate",
		],
		[
			8,
			"2026-09-10T09:30:00Z",
			author,
			"pushed 2 commits to improve-retries.",
			"RefUpdate",
		],
		[
			9,
			"2026-09-10T11:00:00Z",
			author,
			"added Grace Hopper as an optional reviewer.",
			"ReviewersUpdate",
		],
		[
			10,
			"2026-09-11T08:30:00Z",
			author,
			'changed the title to "Improve retry handling".',
			"PropertiesUpdate",
		],
		[
			11,
			"2026-09-11T10:30:00Z",
			reviewer,
			"voted Approved with suggestions.",
			"VoteUpdate",
		],
		[
			12,
			"2026-09-12T08:15:00Z",
			activityActor,
			"marked the pull request as ready for review.",
			"IsDraftUpdate",
		],
	].map(([id, timestamp, actor, content, activityType]) => ({
		id,
		status: "active",
		publishedDate: timestamp,
		lastUpdatedDate: timestamp,
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				author: actor,
				content,
				publishedDate: timestamp,
				commentType: "system",
			},
		],
		properties: {
			CodeReviewThreadType: {
				$type: "System.String",
				$value: activityType,
			},
		},
	})),
];

// This launcher never uses ambient credentials or the network. It is not
// registered in app.mjs and is not an alternative authentication path.
function createFixtureFetch({ completionReady = false } = {}) {
	const edits = {};
	const addedThreads = [];
	const threadEdits = new Map();
	const commentEdits = new Map();
	const deletedComments = new Map();
	let nextCommentId = 100;
	const reviewerEdits = new Map(
		previewReviewers.map((entry) => [entry.id, entry]),
	);
	const reviewerDirectory = new Map(reviewerEdits);
	for (const entry of previewReviewerDirectory)
		reviewerDirectory.set(entry.id, entry);
	const builds = new Map([
		[42, { id: 42, status: "completed", result: "succeeded" }],
		[43, { id: 43, status: "inProgress", result: null }],
		[44, { id: 44, status: "completed", result: "failed" }],
	]);
	const policyConfigurations = [
		{
			id: 1,
			revision: 1,
			isEnabled: true,
			isBlocking: false,
			type: { id: BUILD_POLICY, displayName: "Build validation" },
			settings: { buildDefinitionId: 7 },
		},
		{
			id: 2,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: { id: BUILD_POLICY, displayName: "Integration validation" },
			settings: { buildDefinitionId: 7 },
		},
		{
			id: 3,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: { id: BUILD_POLICY, displayName: "Lint validation" },
			settings: { buildDefinitionId: 7 },
		},
		{
			id: 4,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: {
				id: "c6a1889d-b943-4856-b76f-9e46bb6b0df2",
				displayName: "Comments must be resolved",
			},
			settings: {},
		},
		{
			id: 5,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: {
				id: "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",
				displayName: "Minimum number of reviewers",
			},
			settings: { minimumApproverCount: 2 },
		},
		{
			id: 6,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: {
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				displayName: "Proof of presence is required",
			},
			settings: {},
		},
		{
			id: 7,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				displayName: "No merge conflicts",
			},
			settings: {},
		},
	];
	const policyEvaluations = [
		{
			evaluationId: "55555555-5555-4555-8555-555555555555",
			status: "approved",
			context: { buildId: 42 },
			configuration: policyConfigurations[0],
		},
		{
			evaluationId: "66666666-6666-4666-8666-666666666666",
			status: completionReady ? "approved" : "running",
			context: { buildId: 43 },
			configuration: policyConfigurations[1],
		},
		{
			evaluationId: "77777777-7777-4777-8777-777777777777",
			status: completionReady ? "approved" : "rejected",
			context: { buildId: 44 },
			configuration: policyConfigurations[2],
		},
		{
			evaluationId: "88888888-8888-4888-8888-888888888888",
			status: completionReady ? "approved" : "rejected",
			context: {},
			configuration: policyConfigurations[3],
		},
		{
			evaluationId: "99999999-9999-4999-8999-999999999999",
			status: completionReady ? "approved" : "running",
			context: {},
			configuration: policyConfigurations[4],
		},
		{
			evaluationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			status: completionReady ? "approved" : "running",
			context: {},
			configuration: policyConfigurations[5],
		},
		{
			evaluationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			status: "approved",
			context: {},
			configuration: policyConfigurations[6],
		},
	];
	let nextThread = 13;
	const buildDetails = (build) => ({
		...build,
		repository: { id: repository.repositoryId, type: "TfsGit" },
		sourceVersion: sourceCommit,
		sourceBranch: "refs/heads/improve-retries",
		definition: { id: 7, name: "Preview CI" },
		project: { id: projectId, name: "tools" },
	});
	/** @param {Parameters<typeof globalThis.fetch>[0]} input @param {Parameters<typeof globalThis.fetch>[1]} [options] */
	return async function fixtureFetch(input, options) {
		options?.signal?.throwIfAborted();
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url,
		);
		const method = options?.method ?? "GET";
		const body =
			typeof options?.body === "string" ? JSON.parse(options.body) : {};
		const threadRoute = /\/threads\/(\d+)(?:\/comments(?:\/(\d+))?)?$/.exec(
			url.pathname,
		);
		const reviewersRoute = /\/pullrequests\/22\/reviewers$/.test(url.pathname);
		const reviewerRoute = /\/reviewers\/([^/]+)$/.exec(url.pathname);
		const buildRoute = /\/builds\/(\d+)$/.exec(url.pathname);
		if (method !== "GET") {
			if (/\/pullrequests\/22$/.test(url.pathname) && method === "PATCH") {
				Object.assign(edits, body);
			} else if (url.pathname.endsWith("/threads") && method === "POST") {
				const thread = {
					id: nextThread++,
					status: "active",
					...body,
					comments: body.comments.map((comment, index) => ({
						id: index + 1,
						author: reviewer,
						publishedDate: new Date().toISOString(),
						...comment,
					})),
				};
				addedThreads.push(thread);
				return Response.json(thread);
			} else if (threadRoute) {
				const id = Number(threadRoute[1]);
				if (url.pathname.includes("/comments")) {
					const existing = commentEdits.get(id) ?? [];
					const commentId = Number(threadRoute[2]);
					if (method === "DELETE") {
						const deleted = deletedComments.get(id) ?? new Set();
						deleted.add(commentId);
						deletedComments.set(id, deleted);
						commentEdits.set(
							id,
							existing.filter((comment) => comment.id !== commentId),
						);
						return new Response(null, { status: 204 });
					}
					const comment = {
						id: commentId || nextCommentId++,
						author: reviewer,
						publishedDate: new Date().toISOString(),
						commentType: "text",
						...body,
					};
					commentEdits.set(id, [
						...existing.filter((item) => item.id !== comment.id),
						comment,
					]);
					return Response.json(comment);
				}
				threadEdits.set(id, body);
				return fixtureFetch(url, { method: "GET", signal: options?.signal });
			} else if (reviewersRoute && method === "POST") {
				if (!Array.isArray(body)) throw new Error("Invalid reviewer request");
				const added = body.map(({ id }) => {
					const current = reviewerEdits.get(id);
					if (current) return current;
					const person = reviewerDirectory.get(id) ?? {
						id,
						displayName: "Requested reviewer",
						vote: 0,
						isRequired: false,
					};
					const changed = { ...person, vote: 0, isRequired: false };
					reviewerEdits.set(id, changed);
					return changed;
				});
				return Response.json(added);
			} else if (reviewerRoute) {
				const id = decodeURIComponent(reviewerRoute[1]);
				if (method === "DELETE") {
					reviewerEdits.delete(id);
					return new Response(null, { status: 204 });
				}
				const person = reviewerEdits.get(id) ??
					reviewerDirectory.get(id) ?? {
						id,
						displayName: "Requested reviewer",
						vote: 0,
						isRequired: false,
					};
				const changed = { ...person, ...body };
				reviewerEdits.set(id, changed);
				return Response.json(changed);
			} else if (buildRoute) {
				const id = Number(buildRoute[1]);
				const build = builds.get(id);
				if (!build) return Response.json({}, { status: 404 });
				const changed = {
					...build,
					status: body.status ?? "inProgress",
					result: null,
				};
				builds.set(id, changed);
				return Response.json(buildDetails(changed));
			} else if (url.pathname.endsWith("/build/builds") && method === "POST") {
				const build = {
					id: 42 + builds.size,
					status: "notStarted",
					result: null,
				};
				builds.set(build.id, build);
				return Response.json(buildDetails(build));
			} else if (
				url.pathname.endsWith("/_apis/graph/subjectquery") &&
				method === "POST"
			) {
				return Response.json({ value: [] });
			} else
				throw new Error(`Unknown preview write: ${method} ${url.pathname}`);
		}
		if (threadRoute && !url.pathname.includes("/comments")) {
			const listUrl = new URL(url);
			listUrl.pathname = listUrl.pathname.replace(/\/\d+$/, "");
			const list = await (
				await fixtureFetch(listUrl, { method: "GET", signal: options?.signal })
			).json();
			const thread = list.value.find(
				(item) => item.id === Number(threadRoute[1]),
			);
			return Response.json(thread ?? {}, { status: thread ? 200 : 404 });
		}
		if (
			url.hostname === "vssps.dev.azure.com" &&
			url.pathname.endsWith("/_apis/identities")
		) {
			const query = url.searchParams.get("filterValue") ?? "";
			return Response.json({
				count: previewReviewerDirectory.length,
				value: previewReviewerDirectory.map((entry) => ({
					id: entry.id,
					providerDisplayName: entry.displayName,
					isActive: true,
					properties: {
						Account: { $type: "System.String", $value: query },
						Mail: { $type: "System.String", $value: entry.uniqueName },
					},
				})),
			});
		}
		if (
			url.hostname === "dev.azure.com" &&
			url.pathname.endsWith(`/_apis/projects/${projectId}/teams`)
		)
			return Response.json({ count: 0, value: [] });
		if (reviewerRoute) {
			const person = reviewerEdits.get(decodeURIComponent(reviewerRoute[1]));
			return Response.json(person ?? {}, { status: person ? 200 : 404 });
		}
		if (/\/pullrequests\/22$/.test(url.pathname)) {
			return Response.json({
				pullRequestId: 22,
				repository: { id: repository.repositoryId, project: { id: projectId } },
				title: "[Preview] Improve retry handling",
				description:
					"Sample data only. Actions change this local sample, not Azure DevOps.\n\n## Retry behavior\n\n- Retry temporary service failures up to **three times**.\n- Keep permanent failures visible to the caller.\n\n| Result | Behavior |\n| --- | --- |\n| Temporary failure | Retry |\n| Permanent failure | Return immediately |\n\n- [x] Add focused coverage\n- [ ] Finish integration coverage\n\n```ts\nawait run(request);\n```",
				status: "active",
				isDraft: false,
				sourceRefName: "refs/heads/improve-retries",
				targetRefName: "refs/heads/main",
				lastMergeSourceCommit: { commitId: sourceCommit },
				lastMergeTargetCommit: { commitId: baseCommit },
				mergeStatus: "succeeded",
				createdBy: author,
				creationDate: createdAt,
				reviewers: [...reviewerEdits.values()],
				...edits,
			});
		}
		if (url.pathname.endsWith("/threads")) {
			const value = [...initialThreads, ...addedThreads].map((thread) => {
				const changed = commentEdits.get(thread.id) ?? [];
				const deleted = deletedComments.get(thread.id) ?? new Set();
				return {
					...thread,
					...(completionReady && ["active", "pending"].includes(thread.status)
						? { status: "fixed" }
						: {}),
					...threadEdits.get(thread.id),
					comments: [
						...thread.comments.filter(
							(comment) =>
								!deleted.has(comment.id) &&
								!changed.some((item) => item.id === comment.id),
						),
						...changed.filter((comment) => !deleted.has(comment.id)),
					],
				};
			});
			return Response.json({ count: value.length, value });
		}
		if (url.pathname.endsWith("/refs")) {
			const name = `refs/${url.searchParams.get("filter") ?? ""}`;
			const objectId =
				name === "refs/heads/improve-retries"
					? sourceCommit
					: name === "refs/heads/main"
						? baseCommit
						: null;
			return Response.json({
				count: objectId ? 1 : 0,
				value: objectId ? [{ name, objectId }] : [],
			});
		}
		if (url.pathname.endsWith("/configurations"))
			return Response.json({
				count: policyConfigurations.length,
				value: policyConfigurations,
			});
		if (url.pathname.endsWith("/evaluations")) {
			const value = policyEvaluations.map((evaluation) => ({
				...evaluation,
				artifactId: url.searchParams.get("artifactId"),
			}));
			return Response.json({
				count: value.length,
				value,
			});
		}
		if (url.pathname.endsWith("/statuses")) {
			return Response.json({
				value: [
					{
						id: 1,
						iterationId: 2,
						context: { name: "Unit tests", genre: "preview-ci" },
						state: "succeeded",
						description: "Sample unit tests passed.",
						creationDate: createdAt,
						updatedDate: createdAt,
						targetUrl: `https://dev.azure.com/fabrikam/${projectId}/_build/results?buildId=42`,
					},
					{
						id: 2,
						iterationId: 2,
						context: { name: "Integration tests", genre: "preview-ci" },
						state: "pending",
						description: "Sample integration tests are running.",
						creationDate: createdAt,
						updatedDate: createdAt,
						targetUrl: `https://dev.azure.com/fabrikam/${projectId}/_build/results?buildId=43`,
					},
					{
						id: 3,
						iterationId: 2,
						context: { name: "Lint", genre: "preview-ci" },
						state: "failed",
						description: "Lint found formatting errors.",
						creationDate: createdAt,
						updatedDate: createdAt,
						targetUrl: `https://dev.azure.com/fabrikam/${projectId}/_build/results?buildId=44`,
					},
				],
			});
		}
		if (buildRoute) {
			const build = builds.get(Number(buildRoute[1]));
			return Response.json(build ? buildDetails(build) : {}, {
				status: build ? 200 : 404,
			});
		}
		if (url.pathname.endsWith(`/commits/${sourceCommit}`)) {
			return Response.json({ commitId: sourceCommit, parents: [baseCommit] });
		}
		if (url.pathname.endsWith(`/commits/${sourceCommit}/changes`)) {
			return Response.json({
				changes: files.slice(0, 1),
			});
		}
		if (url.pathname.endsWith("/iterations")) {
			return Response.json({
				value: [
					{
						id: 2,
						commonRefCommit: { commitId: baseCommit },
						sourceRefCommit: { commitId: sourceCommit },
					},
				],
			});
		}
		if (url.pathname.endsWith("/changes")) {
			return Response.json({ changeEntries: files, nextSkip: 0, nextTop: 0 });
		}
		if (url.pathname.endsWith("/commits")) {
			return Response.json({
				value: [
					{
						commitId: sourceCommit,
						comment: "Bound retries and cover permanent failures",
						author: { name: author.displayName, date: createdAt },
					},
				],
			});
		}
		if (url.pathname.endsWith("/items")) {
			const path = url.searchParams.get("path");
			const original =
				url.searchParams.get("versionDescriptor.version") === baseCommit;
			let content;
			switch (path) {
				case "/src/retry.ts":
					content = original
						? "export async function run(request) {\n  return request();\n}\n"
						: 'export async function run(request) {\n  for (let attempt = 0; attempt < 3; attempt++) {\n    const result = await request();\n    if (result.ok || !result.retryable) return result;\n  }\n  throw new Error("Retry limit reached");\n}\n';
					break;
				case "/tests/retry.test.ts":
					content =
						'test("does not retry permanent failures", async () => {\n  const result = await run(permanentFailure);\n  expect(result.retryable).toBe(false);\n});\n';
					break;
				case "/src/legacy-retry.ts":
					content = "export const retryCount = Infinity;\n";
					break;
				case "/docs/retries.md":
				case "/docs/retry-policy.md":
					content =
						"# Retry policy\n\nAt most three attempts. Permanent failures are not retried.\n";
					break;
				default:
					throw new Error("Unknown preview file");
			}
			return Response.json({
				path,
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				content,
				contentMetadata: { isBinary: false },
			});
		}
		throw new Error(`Unknown preview API route: ${url.pathname}`);
	};
}

/** @param {{reviewDirectory?: string, operations?: string[], authorizationError?: Error, completionReady?: boolean}} [options] */
export async function startPullRequestPreview(options = {}) {
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "preview-not-a-token" }),
		},
		fetch: createFixtureFetch({
			completionReady: options.completionReady === true,
		}),
		getAccess: async () => {
			if (options.authorizationError) throw options.authorizationError;
			return {
				viewerId: reviewer.id,
				operations: options.operations ?? [
					"edit",
					"comment",
					"reply",
					"edit-comment",
					"delete-comment",
					"thread-status",
					"vote",
					"reviewer",
					"complete",
					"abandon",
					"reactivate",
					"draft",
					"build-retry",
					"build-cancel",
					"review",
				],
			};
		},
		...(options.reviewDirectory
			? { reviewStorage: createReviewStorage(options.reviewDirectory) }
			: {}),
		refreshIntervalMs: 60_000,
	});
	const instanceId = randomUUID();
	canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
	try {
		const { url } = await canvas.open({ instanceId, input: {} });
		return {
			url,
			refresh() {
				const action = canvas.actions.find(
					(action) => action.name === "refresh",
				);
				if (!action) throw new Error("Refresh action missing");
				return action.handler({ instanceId, input: {} });
			},
			dispose: () => canvas.dispose(),
		};
	} catch (error) {
		await canvas.dispose();
		throw error;
	}
}

if (import.meta.main) {
	const preview = await startPullRequestPreview({
		reviewDirectory: resolve(".copilot-dev-state", "ado-pr-review-preview"),
	});
	console.log(`ADO PR fixture preview: ${preview.url}`);
	console.log(
		"Sample data only. Actions change the local sample. No live ADO requests, credentials, or writes. Press Ctrl+C to stop.",
	);
	const stop = () => {
		void preview.dispose().catch((error) => {
			console.error(error);
			process.exitCode = 1;
		});
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
}
