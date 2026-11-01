// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { createAgentMerge } from "./agent-merge.mjs";
import { evaluateMerge } from "./agent-merge-policy.mjs";
import {
	COMPLETE_ASSOCIATED_WORK_ITEMS,
	DELETE_SOURCE_BRANCH,
	parsePostCompletionOptions,
	postCompletionOptions,
} from "./completion-options.mjs";
import { mergeMethods } from "./merge-methods.mjs";
import { createPullRequestUi } from "./pr-ui.mjs";
import { createPullRequestClient } from "./pull-requests.mjs";

vi.mock("./pull-request-canvas.mjs", () => {
	throw new Error("Headless Agent merge must never load the PR canvas.");
});
vi.mock("./linked-pull-request.mjs", () => {
	throw new Error("Headless Agent merge must never load a UI subscription.");
});

const repositoryId = "3411ebc1-d5aa-464f-9615-0b527bc66719";
const projectId = "22222222-2222-2222-2222-222222222222";
const sourceCommit = "a".repeat(40);
const targetCommit = "b".repeat(40);
const mergeCommit = "c".repeat(40);
const revision = {
	sourceRef: "refs/heads/change",
	targetRef: "refs/heads/main",
	sourceCommit,
	targetCommit,
};
const context = {
	url: "https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
	originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets",
};
const types = {
	build: "0609b952-1397-4640-95ec-e00a01b2c241",
	squash: "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab",
	review: "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",
};

test("post-completion options use stable IDs and reject unadvertised input", () => {
	expect(postCompletionOptions()).toEqual([
		{
			id: DELETE_SOURCE_BRANCH,
			label: "Delete source branch after merging",
		},
		{
			id: COMPLETE_ASSOCIATED_WORK_ITEMS,
			label: "Complete associated work items after merging",
		},
	]);
	expect(
		parsePostCompletionOptions([
			DELETE_SOURCE_BRANCH,
			COMPLETE_ASSOCIATED_WORK_ITEMS,
		]),
	).toEqual({
		deleteSourceBranch: true,
		transitionWorkItems: true,
	});
	for (const invalid of [
		null,
		DELETE_SOURCE_BRANCH,
		["unknown"],
		[DELETE_SOURCE_BRANCH, DELETE_SOURCE_BRANCH],
	]) {
		expect(() => parsePostCompletionOptions(invalid)).toThrow(
			"Invalid post-completion options.",
		);
	}
});

function policy(id, type = types.build, settings = {}) {
	return {
		id,
		revision: 1,
		isEnabled: true,
		isBlocking: true,
		isDeleted: false,
		type: { id: type, displayName: `Policy ${id}` },
		settings: {
			scope: [
				{ repositoryId, refName: revision.targetRef, matchKind: "Exact" },
			],
			...settings,
		},
	};
}

function fixture() {
	const policies = [
		policy(1, types.build, { buildDefinitionId: 9 }),
		policy(2, types.squash, { allowSquash: true }),
	];
	const state = {
		pr: {
			pullRequestId: 17,
			repository: {
				id: repositoryId,
				project: { id: projectId, name: "Tools" },
			},
			title: "Change",
			status: "active",
			isDraft: false,
			sourceRefName: revision.sourceRef,
			targetRefName: revision.targetRef,
			lastMergeSourceCommit: { commitId: sourceCommit },
			lastMergeTargetCommit: { commitId: targetCommit },
			lastMergeCommit: { commitId: mergeCommit },
			mergeStatus: "succeeded",
			reviewers: [],
		},
		policies,
		evaluations: [
			{
				evaluationId: "00000000-0000-0000-0000-000000000001",
				artifactId: `vstfs:///CodeReview/CodeReviewId/${projectId}/17`,
				configuration: structuredClone(policies[0]),
				status: "approved",
				completedDate: "2026-09-18T11:00:00Z",
				context: { buildId: 88 },
			},
		],
		iterations: [
			{
				id: 3,
				createdDate: "2026-09-18T10:00:00Z",
				sourceRefCommit: { commitId: sourceCommit },
				targetRefCommit: { commitId: targetCommit },
			},
		],
		refs: [
			{ name: revision.sourceRef, objectId: sourceCommit },
			{ name: revision.targetRef, objectId: targetCommit },
		],
		threads: [],
		build: {
			id: 88,
			definition: { id: 9, name: "Tests" },
			project: { id: projectId, name: "Tools" },
			repository: { id: repositoryId, type: "TfsGit" },
			sourceBranch: "refs/pull/17/merge",
			sourceVersion: mergeCommit,
			status: "completed",
			result: "succeeded",
		},
		timeline: {
			records: [
				{
					id: "job",
					name: "Unit tests",
					result: "failed",
					issues: [{ type: "error", message: "Test failed" }],
					log: { id: 4 },
				},
			],
		},
	};
	const requests = [];
	const overrides = new Map();
	const authentication = {
		getAccessToken: vi.fn(async (input) => {
			// Agent merge omits the account; native binds the saved repository account.
			expect(input).toEqual({ resource: "azure-devops" });
			return { accessToken: "fixture-token" };
		}),
	};
	const fetch = vi.fn(async (input, { headers, ...init }) => {
		const { Authorization, ...visibleHeaders } = headers;
		expect(Authorization).toBe("Bearer " + "fixture-token");
		expect(init.redirect).toBe("error");
		expect(headers["User-Agent"]).toBe("ADOGithubApp");
		const request = {
			resource: "azure-devops",
			url: String(input),
			init: { ...init, headers: visibleHeaders },
		};
		requests.push(request);
		const url = new URL(request.url);
		const path = url.pathname
			.split("/_apis/")[1]
			.replace(
				/^git\/repositories\/widgets\//,
				`git/repositories/${repositoryId}/`,
			);
		const override = overrides.get(`${request.init.method} ${path}`);
		if (override) return override(request, url);
		if (
			path === "git/repositories/widgets" ||
			path === `git/repositories/${repositoryId}`
		)
			return Response.json({
				id: repositoryId,
				name: "widgets",
				project: { id: projectId, name: "Tools" },
			});
		const prPath = `git/repositories/${repositoryId}/pullrequests/17`;
		if (request.init.method === "PATCH" && path === prPath)
			return Response.json(state.pr, { status: 202 });
		if (path === prPath) return Response.json(state.pr);
		if (path === "git/policy/configurations") {
			expect(url.searchParams.get("repositoryId")).toBe(repositoryId);
			expect(url.searchParams.get("refName")).toBe(revision.targetRef);
			return collection(state.policies);
		}
		if (path === "policy/evaluations") {
			expect(url.searchParams.get("includeNotApplicable")).toBe("true");
			return collection(state.evaluations);
		}
		if (path === `${prPath}/iterations`) return collection(state.iterations);
		if (path === `${prPath}/threads`) return collection(state.threads);
		if (path === `${prPath}/statuses`)
			return collection([
				{ id: 1, state: "succeeded", context: { name: "Tests", genre: "ci" } },
			]);
		if (path === `git/repositories/${repositoryId}/refs`)
			return collection(
				state.refs.filter((ref) =>
					ref.name.startsWith(`refs/${url.searchParams.get("filter")}`),
				),
			);
		if (path === "build/builds/88") return Response.json(state.build);
		if (path === "build/builds/88/timeline")
			return Response.json(state.timeline);
		if (path === "build/builds/88/logs/4")
			return collection(["failure line", "second line"]);
		if (path === `${prPath}/threads/5` && request.init.method === "GET")
			return Response.json(state.threads[0]);
		if (path === `${prPath}/threads/5/comments`)
			return Response.json({
				id: 2,
				parentCommentId: 1,
				commentType: 1,
				content: JSON.parse(request.init.body).content,
			});
		if (path === `${prPath}/threads/5` && request.init.method === "PATCH")
			return Response.json({ ...state.threads[0], status: "fixed" });
		throw new Error(
			`Unexpected fixture request ${request.init.method} ${path}`,
		);
	});
	vi.stubGlobal("fetch", fetch);
	const api = createAgentMerge(authentication);
	const client = createPullRequestClient({
		repository: { organization: "fabrikam", project: projectId, repositoryId },
		authentication,
		fetch,
	});
	return { api, state, requests, overrides, authentication, fetch, client };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

function collection(value) {
	return Response.json({ count: value.length, value });
}

const observe = (api, extra = {}) =>
	api.observe({
		context,
		...extra,
	});
const writes = (requests) =>
	requests.filter(({ init }) => init.method !== "GET");

test.each([false, true])(
	"drawer action changes draft state to %s through the PR client",
	async (draft) => {
		const setup = fixture();
		setup.state.pr.isDraft = !draft;
		setup.overrides.set(
			`PATCH git/repositories/${repositoryId}/pullrequests/17`,
			(request) => {
				expect(JSON.parse(request.init.body)).toEqual({ isDraft: draft });
				setup.state.pr.isDraft = draft;
				return Response.json(setup.state.pr);
			},
		);
		const changed = vi.fn();
		const ui = createPullRequestUi(setup.authentication, changed);
		const prContext = {
			...revision,
			originUrl: context.originUrl,
			associatedUri: context.url,
		};
		const before = await ui.read(prContext);
		expect(
			before.contributions.find(
				(entry) => entry.slot === (draft ? "pr.mark-draft" : "pr.publish"),
			)?.label,
		).toBe(draft ? "Mark as draft" : "Publish");
		const markMutationDispatched = vi.fn();
		const result = await ui.actions
			.find((action) => action.name === "set-draft")
			.handler({ draft }, prContext, { markMutationDispatched });
		expect(markMutationDispatched).toHaveBeenCalledOnce();
		expect(writes(setup.requests)).toHaveLength(1);
		expect(changed).toHaveBeenCalledExactlyOnceWith(
			{ organization: "fabrikam", repositoryId, pullRequestId: 17 },
			false,
		);
		expect(result.contributions[0]).toMatchObject({
			state: draft ? "draft" : "open",
			url: context.url,
		});
		expect(
			result.contributions.some(
				(entry) => entry.slot === (draft ? "pr.publish" : "pr.mark-draft"),
			),
		).toBe(true);
	},
);

test.each(["completed", "abandoned"])(
	"drawer action rejects draft changes to a %s PR",
	async (status) => {
		const setup = fixture();
		setup.state.pr.status = status;
		const changed = vi.fn();
		const ui = createPullRequestUi(setup.authentication, changed);
		const prContext = {
			...revision,
			originUrl: context.originUrl,
			associatedUri: context.url,
		};
		expect(
			(await ui.read(prContext)).contributions.some((entry) =>
				["pr.mark-draft", "pr.publish", "pr.complete"].includes(entry.slot),
			),
		).toBe(false);
		await expect(
			ui.actions
				.find((action) => action.name === "set-draft")
				.handler({ draft: true }, prContext),
		).rejects.toThrow("Only active");
		expect(writes(setup.requests)).toHaveLength(0);
		expect(changed).not.toHaveBeenCalled();
	},
);

test.each(["source", "target"])(
	"drawer completion rechecks %s movement and retains pinned squash completion",
	async (branch) => {
		const setup = fixture();
		const changed = vi.fn();
		const ui = createPullRequestUi(setup.authentication, changed);
		const prContext = {
			...revision,
			originUrl: context.originUrl,
			associatedUri: context.url,
		};
		const before = await ui.read(prContext);
		const contribution = before.contributions.find(
			(entry) => entry.slot === "pr.complete",
		);
		expect(contribution.label).toBe("Complete");
		const advanced = "d".repeat(40);
		const index = branch === "source" ? 0 : 1;
		setup.state.refs[index].objectId = advanced;
		if (branch === "source") {
			setup.state.pr.lastMergeSourceCommit.commitId = advanced;
			setup.state.iterations[0].sourceRefCommit.commitId = advanced;
		}
		setup.state.pr.title = "Updated title";
		setup.state.pr.description = "Updated body";
		const markMutationDispatched = vi.fn();
		const completion = ui.actions
			.find((action) => action.name === "complete")
			.handler(contribution.action.input, prContext, {
				markMutationDispatched,
			});
		if (branch === "source") {
			await expect(completion).rejects.toThrow(
				"Source revision or target ref changed",
			);
			expect(writes(setup.requests)).toHaveLength(0);
			expect(changed).not.toHaveBeenCalled();
		} else {
			const result = await completion;
			expect(changed).toHaveBeenCalledExactlyOnceWith(
				{ organization: "fabrikam", repositoryId, pullRequestId: 17 },
				result.contributions[0].state !== "merged",
			);
			expect(result.contributions[0].url).toBe(context.url);
			expect(markMutationDispatched).toHaveBeenCalledOnce();
			expect(writes(setup.requests)).toHaveLength(1);
			expect(JSON.parse(writes(setup.requests)[0].init.body)).toEqual({
				status: "completed",
				lastMergeSourceCommit: { commitId: sourceCommit },
				completionOptions: {
					mergeStrategy: "squash",
					mergeCommitMessage: "Merged PR 17: Updated title\n\nUpdated body",
					deleteSourceBranch: false,
					bypassPolicy: false,
					transitionWorkItems: false,
				},
			});
		}
	},
);

test.each(["draft", "conflicts", "policy", "unknown", "queued"])(
	"drawer completion rejects %s without a write",
	async (condition) => {
		const setup = fixture();
		if (condition === "draft") setup.state.pr.isDraft = true;
		if (condition === "conflicts") setup.state.pr.mergeStatus = "conflicts";
		if (condition === "policy") setup.state.evaluations[0].status = "rejected";
		if (condition === "unknown") setup.state.pr.mergeStatus = "queued";
		if (condition === "queued")
			setup.state.pr.autoCompleteSetBy = { id: "reviewer" };
		const ui = createPullRequestUi(setup.authentication);
		await expect(
			ui.actions
				.find((action) => action.name === "complete")
				.handler(revision, {
					...revision,
					originUrl: context.originUrl,
					associatedUri: context.url,
				}),
		).rejects.toThrow();
		expect(writes(setup.requests)).toHaveLength(0);
	},
);

async function readMergeDetails(fixture) {
	return createPullRequestUi(fixture.authentication).read(
		{
			...revision,
			originUrl: context.originUrl,
			associatedUri: context.url,
			title: "Change",
		},
		{ authenticated: true, mergeDetails: true },
	);
}

test("PR UI reads merge evidence without enabling automation or writing", async () => {
	const setup = fixture();
	const result = await readMergeDetails(setup);
	expect(result.contributions[0].url).toBe(context.url);
	expect(result.mergeDetails).toMatchObject({
		revision,
		summary: "Ready for Agent merge.",
		merge: { status: "satisfied" },
		checks: {
			total: 1,
			status: "satisfied",
			items: [
				{
					description: "Policy 1 (Required)",
					status: "satisfied",
				},
			],
		},
		reviews: { total: 0 },
		postCompletionOptions: [
			{
				id: "deleteSourceBranch",
				label: "Delete source branch after merging",
			},
			{
				id: "completeAssociatedWorkItems",
				label: "Complete associated work items after merging",
			},
		],
	});
	expect(writes(setup.requests)).toEqual([]);
	expect(setup.requests.some(({ url }) => url.includes("/build/"))).toBe(false);
	expect(result.contributions[0].checksSummary).toEqual({
		total: 1,
		success: 1,
		failure: 0,
		pending: 0,
	});
});

test.each([
	["ready", () => {}, true],
	["conflicts", (state) => (state.pr.mergeStatus = "conflicts"), false],
	[
		"auto-complete",
		(state) => (state.pr.autoCompleteSetBy = { id: "reviewer" }),
		false,
	],
])(
	"routine PR UI reads report readiness for %s without race re-reads",
	async (_name, change, expected) => {
		const setup = fixture();
		change(setup.state);
		const result = await createPullRequestUi(
			setup.authentication,
		).readAssociated(context.url);
		expect(result.contributions[0].readyToMerge).toBe(expected);
		expect(result.mergeDetails).toBeUndefined();
		expect(writes(setup.requests)).toEqual([]);
		const paths = setup.requests.map(({ url }) => new URL(url).pathname);
		expect(paths.filter((path) => path.endsWith("/refs"))).toEqual([]);
		expect(
			paths.filter((path) => path.endsWith("/pullrequests/17")),
		).toHaveLength(2);
	},
);

test("routine PR UI reads omit readiness for drafts and unreadable evidence", async () => {
	const draft = fixture();
	draft.state.pr.isDraft = true;
	const draftResult = await createPullRequestUi(
		draft.authentication,
	).readAssociated(context.url);
	expect(draftResult.contributions[0].state).toBe("draft");
	expect(draftResult.contributions[0].readyToMerge).toBeUndefined();
	expect(draft.requests.some(({ url }) => url.includes("/policy/"))).toBe(
		false,
	);

	const unreadable = fixture();
	unreadable.overrides.set(
		"GET policy/evaluations",
		() => new Response(null, { status: 500 }),
	);
	const result = await createPullRequestUi(
		unreadable.authentication,
	).readAssociated(context.url);
	expect(result.contributions[0].state).toBe("open");
	expect(result.contributions[0].readyToMerge).toBeUndefined();
	expect(result.error).not.toMatch(/ready|merge|polic/i);
});

test("draft merge details retain requirements and Publish without completion method metadata", async () => {
	const setup = fixture();
	setup.state.pr.isDraft = true;
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.mergeMethods).toBeUndefined();
	expect(result.mergeDetails.postCompletionOptions).toHaveLength(2);
	expect(result.mergeDetails.merge).toMatchObject({
		status: "failed",
		items: expect.arrayContaining([
			expect.objectContaining({
				id: "draft",
				status: "failed",
				description: "Draft: publish before completion.",
			}),
		]),
	});
	expect(result.contributions).toContainEqual(
		expect.objectContaining({
			kind: "button",
			slot: "pr.publish",
			action: { actionId: "set-draft", input: { draft: false } },
		}),
	);
	expect(
		result.contributions.some((entry) => entry.slot === "pr.complete"),
	).toBe(false);
	expect(writes(setup.requests)).toEqual([]);
});

test.each([
	["queued", "pending", "Required policy evaluation is pending."],
	["running", "pending", "Required policy evaluation is pending."],
	["rejected", "failed", "A required branch policy is not satisfied."],
	["broken", "failed", "A required branch policy is not satisfied."],
	["unknown", "unknown", "Required policy evaluation is broken or unknown."],
	["notApplicable", "notApplicable", null],
])(
	"merge details show approval and custom policy status (%s) independently of work flags",
	async (status, mapped, reason) => {
		const setup = fixture();
		const review = policy(3, types.review);
		const custom = policy(4, "11111111-1111-1111-1111-111111111111");
		for (const configuration of [review, custom])
			setup.state.evaluations.push({
				evaluationId: `evaluation-${configuration.id}`,
				artifactId: setup.state.evaluations[0].artifactId,
				configuration,
				status,
			});
		const work = await observe(setup.api);
		expect(work.reviews).toBe(false);
		expect(work.checks).toBe(false);
		const result = await readMergeDetails(setup);
		expect(result.mergeDetails.reviews.items[0]).toMatchObject({
			status: mapped,
			description: "Policy 3 (Required)",
		});
		expect(result.mergeDetails.checks.items).toContainEqual(
			expect.objectContaining({
				id: "policy:evaluation-4",
				status: mapped,
				description: "Policy 4 (Required)",
			}),
		);
		expect(result.mergeDetails.merge.status === "satisfied").toBe(
			status === "notApplicable",
		);
		expect(work.mergeDetails).toEqual(result.mergeDetails);
		expect(work.readyToComplete).toBe(status === "notApplicable");
		if (status !== "notApplicable") {
			expect(work.mergeDetails.summary).toBe(
				`${mapped === "unknown" ? "Merge status unknown" : "Merge blocked"}: ${reason}`,
			);
		}
		expect(writes(setup.requests)).toEqual([]);
	},
);

test("approved evaluations with unknown required types stay unknown in both views", async () => {
	const setup = fixture();
	setup.state.evaluations[0].configuration.type.id = "unrecognized";
	const work = await observe(setup.api);
	const result = await readMergeDetails(setup);
	expect(work.readyToComplete).toBe(false);
	expect(work.mergeDetails).toEqual(result.mergeDetails);
	expect(work.mergeDetails.merge.status).toBe("unknown");
	expect(work.mergeDetails.checks.items[0].status).toBe("unknown");
	expect(work.mergeDetails.summary).toBe(
		"Merge status unknown: Required policy evaluation has an unknown type.",
	);
	expect(writes(setup.requests)).toEqual([]);
});

test("optional failed policies remain visible without blocking completion", async () => {
	const setup = fixture();
	setup.state.evaluations[0].configuration.isBlocking = false;
	setup.state.evaluations[0].status = "rejected";
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.merge.status).toBe("satisfied");
	expect(result.mergeDetails.checks.items[0]).toMatchObject({
		status: "failed",
		description: "Policy 1 (Optional)",
	});
});

test.each([
	["completed", "merged"],
	["abandoned", "closed"],
])(
	"merge details report terminal state %s without readiness",
	async (status, label) => {
		const setup = fixture();
		setup.state.pr.status = status;
		const { mergeDetails } = await readMergeDetails(setup);
		expect(mergeDetails.summary).toBe(`Pull request ${label}.`);
		expect(mergeDetails.merge.total).toBe(0);
		expect(writes(setup.requests)).toEqual([]);
	},
);

test("Agent merge applies the selected post-completion options", async () => {
	const setup = fixture();
	const observed = await observe(setup.api);
	await setup.api.complete({
		context,
		expected: observed.revision,
		mergeMethod: observed.mergeMethod,
		postCompletionOptions: [
			"deleteSourceBranch",
			"completeAssociatedWorkItems",
		],
	});
	expect(
		JSON.parse(writes(setup.requests)[0].init.body).completionOptions,
	).toMatchObject({
		deleteSourceBranch: true,
		transitionWorkItems: true,
		bypassPolicy: false,
	});
});

test.each([
	["draft", "Merge blocked: Pull request is a draft."],
	[
		"conflicts",
		"Merge blocked: Resolve conflicts using the observed source and target refs.",
	],
	[
		"squash",
		"Merge blocked: Branch policy does not allow any supported merge strategy.",
	],
	[
		"queued",
		"Merge status unknown: A completion request is already queued; reconcile it before another write.",
	],
])(
	"merge details retain the completion restriction for %s",
	async (state, summary) => {
		const setup = fixture();
		if (state === "draft") setup.state.pr.isDraft = true;
		if (state === "conflicts") setup.state.pr.mergeStatus = "conflicts";
		if (state === "squash")
			setup.state.policies[1].settings.allowSquash = false;
		if (state === "queued")
			setup.state.pr.completionQueueTime = "2026-10-01T10:00:00Z";
		const result = await readMergeDetails(setup);
		expect(result.mergeDetails.summary).toBe(summary);
		expect(result.mergeDetails.merge.status).not.toBe("satisfied");
		expect(
			result.mergeDetails.merge.items.some((item) =>
				["failed", "unknown", "pending"].includes(item.status),
			),
		).toBe(true);
		expect(writes(setup.requests)).toEqual([]);
	},
);

test.each([
	[0, "unknown", "Merge status unknown: Mergeability is not yet known."],
	[1, "satisfied", "Ready for Agent merge."],
])(
	"merge details preserve current conflict status and readiness when branch %s changes",
	async (branch, status, summary) => {
		const setup = fixture();
		setup.state.refs[branch].objectId = "d".repeat(40);
		const { mergeDetails } = await readMergeDetails(setup);
		expect(mergeDetails.summary).toBe(summary);
		expect(mergeDetails.merge.status).toBe(status);
		expect(mergeDetails.merge.items).toContainEqual({
			id: "conflicts",
			status: "satisfied",
			description: "No merge conflicts.",
		});
		expect(writes(setup.requests)).toEqual([]);
	},
);

test("merge details explain a pending conflict check", async () => {
	const setup = fixture();
	setup.state.pr.mergeStatus = "queued";
	const { mergeDetails } = await readMergeDetails(setup);
	expect(mergeDetails.summary).toBe(
		"Merge status unknown: Mergeability is not yet known.",
	);
	expect(mergeDetails.merge.items).toContainEqual({
		id: "conflicts",
		status: "unknown",
		description: "Azure DevOps has not confirmed whether there are conflicts.",
	});
	expect(writes(setup.requests)).toEqual([]);
});

test("discussion and required reviewers share Reviews, without counting raw votes", async () => {
	const setup = fixture();
	setup.state.threads = [thread()];
	const configuration = policy(3, "fd2167ab-b0be-447a-8ec8-39368250530e");
	setup.state.evaluations.push({
		evaluationId: "required-reviewers",
		artifactId: setup.state.evaluations[0].artifactId,
		configuration,
		status: "approved",
	});
	setup.state.pr.reviewers = [{ id: "reviewer", vote: -10, isRequired: true }];
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.reviews.total).toBe(2);
	expect(result.mergeDetails.reviews.items).toContainEqual(
		expect.objectContaining({
			status: "pending",
			description: expect.stringContaining("Please fix the race."),
		}),
	);
	expect(
		result.mergeDetails.reviews.items.some((item) =>
			item.description.startsWith("Unresolved discussion:"),
		),
	).toBe(true);
	expect(result.mergeDetails.reviews.items).toContainEqual(
		expect.objectContaining({
			id: "policy:required-reviewers",
			status: "satisfied",
		}),
	);
});

test("discussion display preserves Markdown blocks and escapes metadata without changing worker evidence", async () => {
	const setup = fixture();
	setup.state.threads = [thread()];
	setup.state.threads[0].threadContext = { filePath: "/src/<file>.ts" };
	setup.state.threads[0].comments[0].author = {
		id: "reviewer",
		displayName: "**Reviewer**",
	};
	setup.state.threads[0].comments[0].content = "```ts\nconst value = 1;\n```";
	setup.state.threads[0].comments.push({
		...setup.state.threads[0].comments[0],
		id: 2,
		parentCommentId: 1,
		author: { id: "reply", displayName: "Reply author" },
		content: "- [x] Timeout\n\n# Reply heading",
	});
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.reviews.total).toBe(1);
	expect(result.mergeDetails.reviews.items[0].description).toBe(
		"Unresolved discussion:\n\n/src/\\<file\\>\\.ts\n\n\\*\\*Reviewer\\*\\*:\n\n```ts\nconst value = 1;\n```\n\nReply author:\n\n- [x] Timeout\n\n# Reply heading",
	);
	const worker = await setup.api.readReviews({ context, expected: revision });
	expect(worker.body).toContain("**Reviewer**: ```ts");
});

test("discussion display keeps the existing review order", async () => {
	const setup = fixture();
	setup.state.threads = [
		{ ...thread(), id: 2 },
		{ ...thread(), id: 1 },
	];
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.reviews.items.map((item) => item.id)).toEqual([
		"thread:1",
		"thread:2",
	]);
});

test("comment-resolution policies are reviews and build validation keeps its own name", async () => {
	const setup = fixture();
	setup.state.evaluations[0].configuration.settings.displayName =
		"Windows validation";
	setup.state.evaluations.push({
		evaluationId: "comments",
		artifactId: setup.state.evaluations[0].artifactId,
		configuration: policy(3, "c6a1889d-b943-4856-b76f-9e46bb6b0df2"),
		status: "rejected",
	});
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.reviews.items).toEqual([
		expect.objectContaining({ id: "policy:comments", status: "failed" }),
	]);
	expect(result.mergeDetails.checks.items).toEqual([
		expect.objectContaining({
			description: "Windows validation (Required)",
			status: "satisfied",
		}),
	]);
});

test.each([
	[
		{
			displayName: "Validation",
			defaultDisplayName: "Default",
			statusName: "ci",
		},
		"Build",
		"Validation",
	],
	[{ defaultDisplayName: "Governance", statusName: "cg" }, null, "Governance"],
	[{ statusName: "Ownership Enforcer" }, null, "Ownership Enforcer"],
	[{}, "Knowledge vault lint", "Knowledge vault lint"],
	[{}, null, "Policy 1"],
])(
	"merge details use the available friendly policy name (%j)",
	async (settings, buildDefinitionName, name) => {
		const setup = fixture();
		Object.assign(setup.state.evaluations[0].configuration.settings, settings);
		setup.state.evaluations[0].context.buildDefinitionName =
			buildDefinitionName;
		const { mergeDetails } = await readMergeDetails(setup);
		expect(mergeDetails.checks.items[0].description).toBe(`${name} (Required)`);
		expect(setup.requests.some(({ url }) => url.includes("/build/"))).toBe(
			false,
		);
		expect(writes(setup.requests)).toEqual([]);
	},
);

test("merge detail previews do not split Unicode characters at their limits", async () => {
	const setup = fixture();
	const name = `${"a".repeat(119)}\u{1f600}`;
	const comment = `${"a".repeat(488)}\u{1f600}`;
	setup.state.evaluations[0].configuration.settings.displayName = `${name}extra`;
	setup.state.threads = [thread()];
	setup.state.threads[0].comments[0].content = `${comment}extra`;
	const { mergeDetails } = await readMergeDetails(setup);
	expect(mergeDetails.checks.items[0].description).toBe(`${name} (Required)`);
	expect(mergeDetails.reviews.items[0].description).toBe(
		`Unresolved discussion:\n\nReviewer:\n\n${comment}`,
	);
});

test("discussion previews fit the UTF-8 limit with emoji feedback", async () => {
	const setup = fixture();
	setup.state.threads = [thread()];
	setup.state.threads[0].comments[0].content = "\u{1f600}".repeat(600);
	const { mergeDetails } = await readMergeDetails(setup);
	const description = mergeDetails.reviews.items[0].description;
	expect(Buffer.byteLength(description, "utf8")).toBeLessThanOrEqual(2048);
	expect(description).toMatch(
		/^Unresolved discussion:\n\nReviewer:\n\n\u{1f600}+$/u,
	);
});

test("merge detail previews stay bounded but retain total counts and failure status", async () => {
	const setup = fixture();
	setup.state.evaluations = Array.from({ length: 80 }, (_, index) => ({
		...setup.state.evaluations[0],
		evaluationId: `evaluation-${index}`,
		configuration: {
			...policy(index + 1),
			type: { id: types.build, displayName: "界".repeat(120) },
		},
		status: index === 79 ? "rejected" : "approved",
	}));
	const result = await readMergeDetails(setup);
	expect(result.mergeDetails.checks.total).toBe(80);
	expect(result.mergeDetails.checks.items.length).toBeLessThanOrEqual(20);
	expect(result.mergeDetails.checks.status).toBe("failed");
	expect(result.mergeDetails.checks.items[0].status).toBe("failed");
	expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(12 * 1024);
});

test.each([
	"policy/evaluations",
	`git/repositories/${repositoryId}/pullrequests/17/threads`,
])(
	"unavailable merge detail (%s) retains PR controls but never reports ready to merge",
	async (path) => {
		const setup = fixture();
		setup.overrides.set(`GET ${path}`, () =>
			Response.json({ message: "Denied" }, { status: 403 }),
		);
		const result = await readMergeDetails(setup);
		expect(result.status).toBe("ready");
		expect(result.error).toContain("Merge details are unavailable");
		expect(result.mergeDetails).toBeUndefined();
		expect(result.contributions[0]).toMatchObject({
			kind: "badge",
			url: context.url,
			state: "open",
			checksSummary: { total: 1, success: 1, failure: 0, pending: 0 },
		});
		await expect(observe(setup.api)).rejects.toThrow();
		expect(writes(setup.requests)).toEqual([]);
	},
);

test("detail recovery cannot hide loss of access to the pull request", async () => {
	const setup = fixture();
	setup.overrides.set("GET policy/evaluations", () =>
		Response.json({ message: "Denied" }, { status: 403 }),
	);
	let reads = 0;
	setup.overrides.set(
		`GET git/repositories/${repositoryId}/pullrequests/17`,
		() =>
			++reads === 1
				? Response.json(setup.state.pr)
				: Response.json({ message: "Access revoked" }, { status: 401 }),
	);
	await expect(readMergeDetails(setup)).rejects.toThrow();
	expect(writes(setup.requests)).toEqual([]);
});

test("optional badge status failure retains the collected merge details", async () => {
	const setup = fixture();
	setup.overrides.set(
		`GET git/repositories/${repositoryId}/pullrequests/17/statuses`,
		() => Response.json({ message: "Unavailable" }, { status: 503 }),
	);
	const result = await readMergeDetails(setup);
	expect(result.status).toBe("ready");
	expect(result.mergeDetails.revision).toEqual(revision);
	expect(result.error).toContain("Pull request checks are unavailable");
});

test.each(["merge details", "badge status"])(
	"%s deadline retains freshly read PR controls and reports missing data",
	async (stage) => {
		const setup = fixture();
		const controller = new AbortController();
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValueOnce(controller.signal);
		try {
			setup.overrides.set(
				stage === "merge details"
					? "GET policy/evaluations"
					: `GET git/repositories/${repositoryId}/pullrequests/17/statuses`,
				(request) => {
					controller.abort(new DOMException("Timed out", "TimeoutError"));
					request.init.signal.throwIfAborted();
				},
			);
			const result = await readMergeDetails(setup);
			expect(result.status).toBe("ready");
			expect(result.contributions[0]).toMatchObject({
				kind: "badge",
				url: context.url,
				state: "open",
			});
			expect(result.contributions[0].checksSummary).toBeUndefined();
			expect(result.error).toContain("Pull request checks are unavailable");
			if (stage === "merge details") {
				expect(result.error).toContain("Merge details are unavailable");
				expect(result.mergeDetails).toBeUndefined();
				expect(
					setup.requests.filter(({ url }) =>
						new URL(url).pathname.endsWith("/pullrequests/17"),
					),
				).toHaveLength(2);
			} else {
				expect(result.mergeDetails.revision).toEqual(revision);
				expect(result.error).not.toContain("Merge details are unavailable");
			}
			expect(writes(setup.requests)).toEqual([]);
		} finally {
			timeout.mockRestore();
		}
	},
);

test.each(["merge details", "badge status"])(
	"%s transport failure retains basic controls and a visible warning",
	async (stage) => {
		const setup = fixture();
		setup.overrides.set(
			stage === "merge details"
				? "GET policy/evaluations"
				: `GET git/repositories/${repositoryId}/pullrequests/17/statuses`,
			() => {
				throw new TypeError("Fetch failed.");
			},
		);
		const result = await readMergeDetails(setup);
		expect(result.status).toBe("ready");
		expect(result.contributions[0]).toMatchObject({
			kind: "badge",
			url: context.url,
			state: "open",
		});
		if (stage === "merge details") {
			expect(result.error).toContain("Merge details are unavailable");
			expect(result.mergeDetails).toBeUndefined();
		} else {
			expect(result.error).toContain("Pull request checks are unavailable");
			expect(result.mergeDetails.revision).toEqual(revision);
		}
		expect(writes(setup.requests)).toEqual([]);
	},
);

test.each(["denied", "account_unavailable", "credential_unavailable"])(
	"optional detail reads do not hide host %s failures",
	async (code) => {
		const setup = fixture();
		setup.overrides.set("GET policy/evaluations", () => {
			throw Object.assign(new Error("Host authorization failed."), { code });
		});
		await expect(readMergeDetails(setup)).rejects.toThrow();
		expect(writes(setup.requests)).toEqual([]);
	},
);

const prPath = `git/repositories/${repositoryId}/pullrequests/17`;
function thread() {
	return {
		id: 5,
		status: "active",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				commentType: 1,
				content: "Please fix the race.",
				publishedDate: "2026-09-18T11:00:00Z",
			},
		],
	};
}

test("support is pure URL recognition, independent of account and canvas", () => {
	const { api, authentication, fetch } = fixture();
	expect(api.supports({ url: context.url })).toBe(true);
	for (const url of [
		context.url.replace("https:", "http:"),
		context.url.replace("dev.azure.com", "github.com"),
		context.url.replace("/17", "/0"),
		context.url.replace("/widgets/", "/%2F/"),
		context.url.replace("https://", "https://user:password@"),
	])
		expect(api.supports({ url })).toBe(false);
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
	expect(api).not.toHaveProperty("getAccess");
	expect(api).not.toHaveProperty("open");
});

test.each([
	["optional", { isBlocking: false }],
	["disabled", { isEnabled: false }],
	["deleted", { isDeleted: true }],
])(
	"fresh complete evidence permits squash despite %s failed evaluations",
	async (_name, flags) => {
		const { api, state, requests } = fixture();
		state.policies.push({ ...policy(9), ...flags });
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "optional",
			configuration: state.policies[2],
			status: "rejected",
		});
		const result = await observe(api);
		expect(result).toMatchObject({
			state: "open",
			revision,
			readyToComplete: true,
			reviews: false,
			checks: false,
			conflicts: false,
		});
		expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(requests.some(({ url }) => url.includes("/build/builds/"))).toBe(
			false,
		);
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	["ready", "82ac6efcb603bc595a781f1ae4840ddc466966e91d23ba0fd3fed68db3e758d9"],
	[
		"blocked",
		"933815fb4482e4a4a8a19eec1487ae162fa50eed2ee5de7b01115166e2c77d70",
	],
	[
		"unknown",
		"1eb7ad3140c5633c82e6a9a19943ac30f96594d2d884ed7becc2d4f0d37124bc",
	],
	["work", "b394087981067d7493e3e322bee18bd67da85a189a545a8a7493676c968fc5b5"],
])(
	"flat observation preserves full readiness and fingerprint inputs for %s",
	async (condition, fingerprint) => {
		const setup = fixture();
		const { api, state, client } = setup;
		if (condition === "blocked") state.pr.isDraft = true;
		if (condition === "unknown") state.pr.mergeStatus = "notSet";
		if (condition === "work") {
			state.threads = [thread()];
			state.evaluations[0].status = "rejected";
			state.build.result = "failed";
		}
		const snapshot = await client.getAgentMergeEvidence(17);
		const result = evaluateMerge(snapshot);
		const methods = mergeMethods(snapshot);
		expect(
			createHash("sha256")
				.update(
					JSON.stringify([
						revision,
						snapshot.normalized.state,
						result,
						methods,
					]),
				)
				.digest("hex"),
		).toBe(fingerprint);
		expect(await observe(api)).toEqual({
			state: snapshot.normalized.state,
			revision,
			reviews: result.reviews.length > 0,
			checks: result.checks.length > 0,
			conflicts: result.conflicts,
			readyToComplete: result.completion.status === "ready",
			mergeMethod: "squash",
			fingerprint,
			mergeDetails: {
				...(await readMergeDetails(setup)).mergeDetails,
				mergeMethods: {
					defaultMethod: methods.defaultMethod,
					options: methods.options,
				},
			},
		});
	},
);

test.each([false, undefined])(
	"squash policy allowSquash=%s fails closed",
	async (allowSquash) => {
		const { api, state } = fixture();
		state.policies[1].settings.allowSquash = allowSquash;
		const result = await observe(api);
		expect(result.readyToComplete).toBe(false);
		expect(result.mergeDetails.merge.items).toContainEqual({
			id: "merge-strategy",
			status: allowSquash === false ? "failed" : "unknown",
			description:
				allowSquash === false
					? "Branch policy does not allow any supported merge strategy."
					: "Branch policy does not establish which merge strategies are allowed.",
		});
	},
);

test.each(["type", "isBlocking"])(
	"an incomplete branch configuration cannot establish squash permission (%s)",
	async (field) => {
		const { api, state, requests } = fixture();
		state.policies[1][field] = undefined;
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test("required failed build produces work; optional failed build does not", async () => {
	const { api, state } = fixture();
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	const result = await observe(api);
	expect(result.checks).toBe(true);
	expect(
		(await api.readCheckFailure({ context, expected: revision })).body,
	).toContain("policy:1:build:88\nPolicy 1: rejected");
	expect(result.readyToComplete).toBe(false);
	state.policies[0].isBlocking = false;
	state.evaluations[0].configuration.isBlocking = false;
	expect((await observe(api)).readyToComplete).toBe(true);
});

test.each([1, 2])(
	"PR evaluations determine policy readiness despite branch configuration revision %i",
	async (configurationRevision) => {
		const { api, state, requests } = fixture();
		state.policies[0].revision = configurationRevision;
		state.evaluations[0].configuration.settings.scope[0].matchKind = "exact";
		state.evaluations[0].configuration.settings.message = null;
		expect((await observe(api)).readyToComplete).toBe(true);
		expect(writes(requests)).toEqual([]);
		await api.complete({ context, expected: revision });
		expect(writes(requests)).toHaveLength(1);
	},
);

test.each([
	["project-wide", [{ repositoryId: null }]],
	["repository-wide", [{ repositoryId }]],
	[
		"default branch",
		[{ repositoryId, refName: null, matchKind: "DefaultBranch" }],
	],
	["new scope kind", [{ repositoryId, refName: null, matchKind: "Future" }]],
	[
		"server-selected branch",
		[{ repositoryId, refName: "refs/heads/other", matchKind: "Exact" }],
	],
	["omitted scope", undefined],
])(
	"ADO's branch-filtered response determines %s policy applicability",
	async (_name, scope) => {
		const { api, state, requests } = fixture();
		state.policies[0].settings.scope = scope;
		state.evaluations[0].configuration = structuredClone(state.policies[0]);
		expect((await observe(api)).readyToComplete).toBe(true);
		await expect(
			api.complete({ context, expected: revision }),
		).resolves.toBeUndefined();
		expect(writes(requests)).toHaveLength(1);
		expect(
			JSON.parse(writes(requests)[0].init.body).completionOptions,
		).toMatchObject({
			mergeStrategy: "squash",
			bypassPolicy: false,
		});
	},
);

test.each([false, true])(
	"repository policies without PR evaluations do not hide work or add completion requirements (draft=%s)",
	async (draft) => {
		const { api, state, requests } = fixture();
		state.pr.isDraft = draft;
		const pushPolicy = "e67ae10f-cf9a-40bc-8e66-6b3a8216956e";
		state.policies.push(
			policy(3, pushPolicy, { scope: [{ repositoryId: null }] }),
			policy(4, pushPolicy, { scope: [{ repositoryId }] }),
			policy(5, types.review, {
				scope: [{ repositoryId, refName: null, matchKind: "DefaultBranch" }],
			}),
		);
		state.threads = [thread()];
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		expect(await observe(api)).toMatchObject({
			revision,
			reviews: true,
			checks: true,
			readyToComplete: false,
		});
		expect(
			(await api.readReviews({ context, expected: revision })).body,
		).toContain("thread:5");
		expect(
			(await api.readCheckFailure({ context, expected: revision })).body,
		).toContain("policy:1:build:88");
		await expect(api.complete({ context, expected: revision })).rejects.toThrow(
			draft ? "draft" : "Unresolved review feedback",
		);
		expect(writes(requests)).toEqual([]);
		state.threads = [];
		state.evaluations[0].status = "approved";
		expect(await observe(api)).toMatchObject({
			reviews: false,
			checks: false,
			readyToComplete: !draft,
		});
	},
);

test.each([
	[
		"empty PR evaluation list",
		(s) => {
			s.evaluations = [];
		},
	],
	[
		"evaluation completed before the latest iteration",
		(s) => {
			s.evaluations[0].completedDate = "2026-09-17T10:00:00Z";
		},
	],
	[
		"evaluation without a completion date",
		(s) => {
			delete s.evaluations[0].completedDate;
		},
	],
	[
		"evaluation without a branch configuration",
		(s) => {
			s.policies = [];
		},
	],
	[
		"iteration with an earlier source",
		(s) => {
			s.iterations[0].sourceRefCommit.commitId = "d".repeat(40);
		},
	],
	[
		"iteration with an earlier target",
		(s) => {
			s.iterations[0].targetRefCommit.commitId = "d".repeat(40);
		},
	],
	[
		"no iterations",
		(s) => {
			s.iterations = [];
		},
	],
])("ADO policy results remain authoritative with %s", async (_name, mutate) => {
	const { api, state, requests } = fixture();
	mutate(state);
	expect((await observe(api)).readyToComplete).toBe(true);
	await api.complete({ context, expected: revision });
	expect(writes(requests)).toHaveLength(1);
	expect(JSON.parse(writes(requests)[0].init.body)).toMatchObject({
		lastMergeSourceCommit: { commitId: sourceCommit },
		completionOptions: {
			mergeStrategy: "squash",
			bypassPolicy: false,
		},
	});
});

test.each(["approved", "notApplicable"])(
	"ADO's %s build evaluation needs no build detail or iteration read",
	async (status) => {
		const { api, state, requests, overrides } = fixture();
		state.evaluations[0].status = status;
		const paths = [`${prPath}/iterations`, "build/builds/88"];
		for (const path of paths)
			overrides.set(`GET ${path}`, () => new Response(null, { status: 503 }));
		expect(await observe(api)).toMatchObject({
			readyToComplete: true,
			checks: false,
		});
		await api.complete({ context, expected: revision });
		expect(writes(requests)).toHaveLength(1);
		expect(
			requests.some(({ url }) =>
				paths.includes(new URL(url).pathname.split("/_apis/")[1]),
			),
		).toBe(false);
	},
);

test.each(["immediate", "after threshold", "never"])(
	"ADO controls build expiry after a target update (%s)",
	async (expiration) => {
		const { api, state, requests } = fixture();
		const expected = { ...revision, targetCommit: "d".repeat(40) };
		state.refs[1].objectId = expected.targetCommit;
		state.pr.lastMergeTargetCommit.commitId = expected.targetCommit;
		state.pr.lastMergeCommit.commitId = "e".repeat(40);
		state.evaluations[0].configuration.settings = {
			...state.evaluations[0].configuration.settings,
			queueOnSourceUpdateOnly: expiration === "never",
			validDuration: expiration === "after threshold" ? 120 : 0,
		};
		// ADO can retain approval for a build from the previous target revision.
		expect((await observe(api)).readyToComplete).toBe(true);
		await api.complete({ context, expected });
		expect(writes(requests)).toHaveLength(1);
		state.evaluations[0].status = "queued";
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(api.complete({ context, expected })).rejects.toThrow(
			"pending",
		);
		expect(writes(requests)).toHaveLength(1);
	},
);

test.each([
	"before observation",
	"before completion",
	"during observation",
	"during completion",
])(
	"target-only advancement %s permits source-pinned squash completion",
	async (timing) => {
		const { api, state, requests, overrides } = fixture();
		const advanceTarget = () => {
			state.refs[1].objectId = "d".repeat(40);
		};
		state.evaluations.push(
			{
				...structuredClone(state.evaluations[0]),
				evaluationId: "required-review",
				configuration: policy(3, types.review),
			},
			{
				...structuredClone(state.evaluations[0]),
				evaluationId: "optional-review",
				configuration: { ...policy(4, types.review), isBlocking: false },
				status: "running",
			},
		);
		if (timing === "before observation") advanceTarget();
		let reads = 0;
		overrides.set(`GET ${prPath}`, () => {
			reads++;
			if (
				(timing === "during observation" && reads === 2) ||
				(timing === "during completion" && reads === 4)
			)
				advanceTarget();
			return Response.json(state.pr);
		});
		const observed = await observe(api);
		expect(observed).toMatchObject({
			state: "open",
			reviews: false,
			checks: false,
			conflicts: false,
			readyToComplete: true,
		});
		if (timing === "before completion") advanceTarget();
		await api.complete({ context, expected: observed.revision });
		expect(writes(requests)).toHaveLength(1);
		expect(JSON.parse(writes(requests)[0].init.body)).toEqual({
			status: "completed",
			lastMergeSourceCommit: { commitId: sourceCommit },
			completionOptions: {
				mergeStrategy: "squash",
				mergeCommitMessage: "Merged PR 17: Change",
				deleteSourceBranch: false,
				bypassPolicy: false,
				transitionWorkItems: false,
			},
		});
		expect(state.pr.lastMergeTargetCommit.commitId).toBe(targetCommit);
	},
);

test("an unknown policy status blocks completion", async () => {
	const { api, state, requests } = fixture();
	state.evaluations[0].status = "future";
	expect((await observe(api)).readyToComplete).toBe(false);
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
	expect(writes(requests)).toEqual([]);
});

test.each([
	"conflicts",
	"queued",
	"failure",
	"rejectedByPolicy",
	"notSet",
	"future",
	undefined,
])(
	"target advancement cannot override merge status %s",
	async (mergeStatus) => {
		const { api, state, requests } = fixture();
		state.refs[1].objectId = "d".repeat(40);
		state.pr.mergeStatus = mergeStatus;
		const observed = await observe(api);
		expect(observed.readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: observed.revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	["source", false],
	["target", false],
	["source", true],
	["target", true],
])(
	"an advanced %s branch remains observable while its merge evidence is stale (draft=%s)",
	async (branch, draft) => {
		const { api, state, requests } = fixture();
		const commit = "d".repeat(40);
		const expected = { ...revision, [`${branch}Commit`]: commit };
		state.pr.isDraft = draft;
		state.refs[branch === "source" ? 0 : 1].objectId = commit;
		state.threads = [thread()];
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		expect(await observe(api)).toMatchObject({
			state: draft ? "draft" : "open",
			revision: expected,
			reviews: true,
			checks: true,
			conflicts: false,
			readyToComplete: false,
		});
		expect((await api.readReviews({ context, expected })).body).toContain(
			"Please fix the race.",
		);
		await expect(
			api.readReviews({ context, expected: revision }),
		).rejects.toThrow("revision changed");
		expect((await api.readCheckFailure({ context, expected })).body).toContain(
			"failure line",
		);
		await expect(api.complete({ context, expected })).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
		await api.replyToReview({
			context,
			expected,
			feedbackId: "thread:5",
			body: "Fixed.",
		});
		expect(writes(requests).map(({ init }) => init.method)).toEqual([
			"POST",
			"PATCH",
		]);
	},
);

test.each(["source", "target"])(
	"an advanced %s branch preserves reported check and conflict work until ADO clears it",
	async (branch) => {
		const { api, state, requests } = fixture();
		const commit = "d".repeat(40);
		const expected = { ...revision, [`${branch}Commit`]: commit };
		state.refs[branch === "source" ? 0 : 1].objectId = commit;
		state.iterations[0][`${branch}RefCommit`].commitId = commit;
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		for (const mergeStatus of ["succeeded", "conflicts"]) {
			state.pr.mergeStatus = mergeStatus;
			expect(await observe(api)).toMatchObject({
				revision: expected,
				checks: true,
				conflicts: mergeStatus === "conflicts",
				readyToComplete: false,
			});
			await expect(api.complete({ context, expected })).rejects.toThrow();
		}
		state.pr.mergeStatus = "succeeded";
		state.evaluations[0].status = "approved";
		state.build.result = "succeeded";
		expect((await observe(api)).readyToComplete).toBe(branch === "target");
		expect(writes(requests)).toEqual([]);
	},
);

test("a source push before observation waits for ADO to check the new source", async () => {
	const { api, state, requests } = fixture();
	const nextSource = "d".repeat(40);
	state.refs[0].objectId = nextSource;
	const observed = await observe(api);
	expect(observed).toMatchObject({
		revision: { ...revision, sourceCommit: nextSource },
		readyToComplete: false,
	});
	await expect(
		api.complete({ context, expected: observed.revision }),
	).rejects.toThrow("Mergeability");
	expect(writes(requests)).toEqual([]);
	state.pr.lastMergeSourceCommit.commitId = nextSource;
	const current = await observe(api);
	expect(current.readyToComplete).toBe(true);
	expect(current.fingerprint).not.toBe(observed.fingerprint);
	await api.complete({ context, expected: current.revision });
	expect(writes(requests)).toHaveLength(1);
	expect(JSON.parse(writes(requests)[0].init.body)).toMatchObject({
		lastMergeSourceCommit: { commitId: nextSource },
		completionOptions: { mergeStrategy: "squash", bypassPolicy: false },
	});
});

test.each(["source", "target"])(
	"an advanced %s branch becomes ready after ADO finishes its merge and check evaluations",
	async (branch) => {
		const { api, state, requests } = fixture();
		const commit = "d".repeat(40);
		const expected = { ...revision, [`${branch}Commit`]: commit };
		state.refs[branch === "source" ? 0 : 1].objectId = commit;
		state.pr.mergeStatus = "queued";
		state.evaluations[0].status = "queued";
		const stale = await observe(api);
		expect(stale.readyToComplete).toBe(false);
		state.pr[
			branch === "source" ? "lastMergeSourceCommit" : "lastMergeTargetCommit"
		].commitId = commit;
		state.iterations[0][`${branch}RefCommit`].commitId = commit;
		state.pr.lastMergeCommit.commitId = "e".repeat(40);
		state.build.sourceVersion = state.pr.lastMergeCommit.commitId;
		state.pr.mergeStatus = "succeeded";
		state.evaluations[0].status = "approved";
		const current = await observe(api);
		expect(current).toMatchObject({
			revision: expected,
			readyToComplete: true,
		});
		expect(current.fingerprint).not.toBe(stale.fingerprint);
		await api.complete({ context, expected });
		expect(writes(requests)).toHaveLength(1);
		expect(JSON.parse(writes(requests)[0].init.body)).toMatchObject({
			lastMergeSourceCommit: { commitId: expected.sourceCommit },
			completionOptions: { mergeStrategy: "squash" },
		});
	},
);

test("a live source change during evidence collection prevents completion", async () => {
	const { api, state, overrides, requests } = fixture();
	let reads = 0;
	overrides.set(`GET ${prPath}`, () => {
		if (++reads === 2) state.refs[0].objectId = "d".repeat(40);
		return Response.json(state.pr);
	});
	await expect(api.complete({ context, expected: revision })).rejects.toThrow(
		"branch changed",
	);
	expect(reads).toBe(2);
	expect(writes(requests)).toEqual([]);
});

test.each(["source", "target"])(
	"missing, ambiguous, or malformed live %s refs cannot establish a revision",
	async (branch) => {
		for (const value of [[], [{ objectId: "invalid" }], [{}, {}]]) {
			const { api, state, requests } = fixture();
			const index = branch === "source" ? 0 : 1;
			const ref = state.refs[index];
			state.refs.splice(
				index,
				1,
				...value.map((item) => ({ ...ref, ...item })),
			);
			await expect(observe(api)).rejects.toThrow();
			await expect(
				api.complete({ context, expected: revision }),
			).rejects.toThrow();
			expect(writes(requests)).toEqual([]);
		}
	},
);

test.each(["git/policy/configurations", "policy/evaluations"])(
	"rejects incomplete and oversized %s pages",
	async (path) => {
		for (const response of [
			() => Response.json({ count: 3, value: [] }),
			() => new Response("x".repeat(2 * 1024 * 1024 + 1)),
		]) {
			const { api, overrides } = fixture();
			overrides.set(`GET ${path}`, response);
			await expect(observe(api)).rejects.toThrow();
		}
	},
);

test("rejects repeated policy configuration pages", async () => {
	const { api, overrides, state } = fixture();
	overrides.set("GET git/policy/configurations", () =>
		Response.json(
			{ count: state.policies.length, value: state.policies },
			{ headers: { "x-ms-continuationtoken": "same-page" } },
		),
	);
	await expect(observe(api)).rejects.toThrow();
});

test("evidence reads exhaust continuation and offset pages", async () => {
	const { api, state, overrides, requests } = fixture();
	overrides.set("GET git/policy/configurations", (_request, url) => {
		expect(url.searchParams.get("$top")).toBe("100");
		return url.searchParams.has("continuationToken")
			? collection([state.policies[1]])
			: Response.json(
					{ count: 1, value: [state.policies[0]] },
					{ headers: { "x-ms-continuationtoken": "next" } },
				);
	});
	const evaluations = [
		...state.evaluations,
		...Array.from({ length: 100 }, (_, index) => ({
			...state.evaluations[0],
			evaluationId: `optional-${index}`,
			configuration: { ...state.policies[0], isBlocking: false },
		})),
	];
	overrides.set("GET policy/evaluations", (_request, url) => {
		expect(url.searchParams.get("api-version")).toBe("7.1-preview.1");
		const skip = Number(url.searchParams.get("$skip"));
		return collection(evaluations.slice(skip, skip + 100));
	});
	expect((await observe(api)).readyToComplete).toBe(true);
	expect(
		requests
			.filter(({ url }) => new URL(url).pathname.endsWith("/evaluations"))
			.map(({ url }) => new URL(url).searchParams.get("$skip")),
	).toEqual(["0", "100"]);
	expect(writes(requests)).toEqual([]);
});

test.each(["rejected", "unavailable"])(
	"a %s final evaluation page prevents completion",
	async (outcome) => {
		const { api, state, overrides, requests } = fixture();
		const optional = Array.from({ length: 100 }, (_, index) => ({
			...state.evaluations[0],
			evaluationId: `optional-${index}`,
			configuration: { ...state.policies[0], isBlocking: false },
		}));
		overrides.set("GET policy/evaluations", (_request, url) => {
			if (url.searchParams.get("$skip") === "0") return collection(optional);
			return outcome === "unavailable"
				? new Response(null, { status: 503 })
				: collection([
						{
							...state.evaluations[0],
							configuration: policy(3, types.review),
							status: "rejected",
						},
					]);
		});
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(
			requests.filter(({ url }) =>
				new URL(url).pathname.endsWith("/evaluations"),
			),
		).toHaveLength(2);
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	[
		"wrong PR",
		(evaluation) => {
			evaluation.artifactId += "8";
		},
	],
	[
		"missing configuration",
		(evaluation) => {
			delete evaluation.configuration;
		},
	],
	[
		"unknown requirement",
		(evaluation) => {
			delete evaluation.configuration.isBlocking;
		},
	],
	[
		"invalid configuration identity",
		(evaluation) => {
			evaluation.configuration.id = 0;
		},
	],
])(
	"a required evaluation with %s never permits completion",
	async (_name, mutate) => {
		const { api, state, requests } = fixture();
		mutate(state.evaluations[0]);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["evaluation", "configuration"])(
	"duplicate %s identities never permit completion",
	async (identity) => {
		const { api, state, requests } = fixture();
		const duplicate = structuredClone(state.evaluations[0]);
		if (identity === "configuration") duplicate.evaluationId = "duplicate";
		state.evaluations.push(duplicate);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["page limit", "item limit", "long token", "offset token"])(
	"evidence pagination rejects %s without writes",
	async (invalid) => {
		const { api, overrides, requests } = fixture();
		let pages = 0;
		const path =
			invalid === "offset token"
				? "policy/evaluations"
				: "git/policy/configurations";
		overrides.set(`GET ${path}`, () => {
			pages++;
			return Response.json(
				{
					count: invalid === "item limit" ? 2001 : 0,
					value: invalid === "item limit" ? Array(2001).fill({}) : [],
				},
				{
					headers: {
						"x-ms-continuationtoken":
							invalid === "long token" ? "x".repeat(1025) : `page-${pages}`,
					},
				},
			);
		});
		await expect(observe(api)).rejects.toThrow();
		expect(pages).toBe(invalid === "page limit" ? 20 : 1);
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	[
		"title",
		(pr) => {
			pr.title = "Updated title";
		},
	],
	[
		"description",
		(pr) => {
			pr.description = "Updated description";
		},
	],
	[
		"reviewer name",
		(pr) => {
			pr.reviewers[0].displayName = "New name";
		},
	],
	[
		"merge commit message",
		(pr) => {
			pr.lastMergeCommit.comment = "New message";
		},
	],
])(
	"metadata-only %s changes preserve readiness and use final metadata",
	async (_name, change) => {
		const { api, state, overrides, requests } = fixture();
		state.pr.reviewers = [{ id: "reviewer", displayName: "Reviewer", vote: 0 }];
		const initial = structuredClone(state.pr);
		let reads = 0;
		overrides.set(`GET ${prPath}`, () => {
			if (++reads === 2) change(state.pr);
			return Response.json(state.pr);
		});
		expect((await observe(api)).readyToComplete).toBe(true);
		expect(reads).toBe(2);
		expect(writes(requests)).toEqual([]);
		state.pr = initial;
		reads = 0;
		await api.complete({ context, expected: revision });
		expect(reads).toBe(2);
		expect(writes(requests)).toHaveLength(1);
		expect(
			JSON.parse(writes(requests)[0].init.body).completionOptions
				.mergeCommitMessage,
		).toBe(
			`Merged PR 17: ${state.pr.title}${state.pr.description ? `\n\n${state.pr.description}` : ""}`,
		);
	},
);

test.each([
	[
		"PR identity",
		(pr) => {
			pr.pullRequestId = 18;
		},
	],
	[
		"repository identity",
		(pr) => {
			pr.repository.id = projectId;
		},
	],
	[
		"project identity",
		(pr) => {
			pr.repository.project.id = repositoryId;
		},
	],
	[
		"source ref",
		(pr) => {
			pr.sourceRefName = "refs/heads/other";
		},
	],
	[
		"target ref",
		(pr) => {
			pr.targetRefName = "refs/heads/other";
		},
	],
	[
		"source commit",
		(pr) => {
			pr.lastMergeSourceCommit.commitId = "d".repeat(40);
		},
	],
	[
		"state",
		(pr) => {
			pr.status = "abandoned";
		},
	],
	[
		"draft",
		(pr) => {
			pr.isDraft = true;
		},
	],
	[
		"merge status",
		(pr) => {
			pr.mergeStatus = "conflicts";
		},
	],
	[
		"reviewer identity",
		(pr) => {
			pr.reviewers[0].id = "other";
		},
	],
	[
		"reviewer vote",
		(pr) => {
			pr.reviewers[0].vote = -5;
		},
	],
	[
		"required reviewer",
		(pr) => {
			pr.reviewers[0].isRequired = true;
		},
	],
	[
		"missing reviewers",
		(pr) => {
			delete pr.reviewers;
		},
	],
	[
		"auto-complete",
		(pr) => {
			pr.autoCompleteSetBy = { id: "reviewer" };
		},
	],
	[
		"completion queue",
		(pr) => {
			pr.completionQueueTime = "2026-09-24T12:00:00Z";
		},
	],
	[
		"merge strategy",
		(pr) => {
			pr.completionOptions = { mergeStrategy: "squash" };
		},
	],
])(
	"a changed %s during evidence collection prevents completion",
	async (_name, change) => {
		const { api, state, overrides, requests } = fixture();
		state.pr.reviewers = [{ id: "reviewer", displayName: "Reviewer", vote: 0 }];
		let reads = 0;
		overrides.set(`GET ${prPath}`, () => {
			if (++reads === 2) change(state.pr);
			return Response.json(state.pr);
		});
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(reads).toBe(2);
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["completed", "abandoned"])(
	"terminal %s is observed even with policies unavailable",
	async (status) => {
		const { api, state, overrides, requests } = fixture();
		state.pr.status = status;
		overrides.set(
			"GET git/policy/configurations",
			() => new Response(null, { status: 403 }),
		);
		expect(await observe(api)).toMatchObject({
			state: status === "completed" ? "merged" : "closed",
		});
		expect(writes(requests)).toEqual([]);
	},
);

test("draft and conflicts block completion and use the observed refs", async () => {
	const { api, state } = fixture();
	state.pr.isDraft = true;
	expect((await observe(api)).readyToComplete).toBe(false);
	state.pr.isDraft = false;
	state.pr.mergeStatus = "conflicts";
	expect(await observe(api)).toMatchObject({
		revision,
		conflicts: true,
		readyToComplete: false,
	});
	expect(api.skill).toContain("Git");
	expect(api.skill).not.toMatch(/\bgh\s/);
});

test("native policy summaries do not require Azure CLI access", () => {
	const { api } = fixture();
	const summary = api.skill.split("## Summary format\n")[1];
	for (const section of ["reviews", "checks", "merge"]) {
		expect(summary).toContain(`mergeDetails.${section}`);
	}
	expect(summary).toContain("from `read_agent_merge_state`");
	expect(summary).toContain(
		"Do not use Azure CLI for routine summaries, even review-only work.",
	);
	expect(summary).toContain(
		"Preserve native statuses and descriptions; missing evidence stays unknown.",
	);
	expect(summary).toContain(
		"Do not request CLI sign-in or another account. Work flags do not prove readiness.",
	);
	expect(summary).not.toMatch(/az repos pr policy|allowSquash|useSquashMerge/);
	expect(Buffer.byteLength(api.skill, "utf8")).toBeLessThanOrEqual(8192);
});

test("ADO's current review evaluation governs readiness without a local vote veto", async () => {
	for (const [vote, isRequired] of [
		[-10, false],
		[-5, false],
		[0, true],
		[2, false],
	]) {
		const { api, state, requests } = fixture();
		const configuration = policy(3, types.review, { allowDownvotes: true });
		state.policies.push(configuration);
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "review-policy",
			configuration,
			context: {},
		});
		state.pr.reviewers = [
			{ id: "reviewer", displayName: "Reviewer", vote, isRequired },
		];
		expect((await observe(api)).readyToComplete).toBe(true);
		state.evaluations[1].status = "rejected";
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	}
});

test("completion matches the source commit and both branch refs before any write", async () => {
	for (const key of ["sourceCommit", "sourceRef", "targetRef"]) {
		const { api, requests } = fixture();
		await expect(
			api.complete({
				context,
				expected: { ...revision, [key]: "different" },
			}),
		).rejects.toThrow("observe again");
		expect(writes(requests)).toEqual([]);
	}
});

test("a source push at dispatch is rejected and a new observation can complete the new source", async () => {
	const { api, state, requests, overrides } = fixture();
	const observed = await observe(api);
	overrides.set(`PATCH ${prPath}`, (request) => {
		state.refs[0].objectId = "d".repeat(40);
		const body = JSON.parse(request.init.body);
		if (body.lastMergeSourceCommit.commitId !== state.refs[0].objectId)
			return new Response(null, { status: 409 });
		state.pr.lastMergeSourceCommit = body.lastMergeSourceCommit;
		return Response.json(state.pr, { status: 202 });
	});
	await expect(
		api.complete({ context, expected: observed.revision }),
	).rejects.toThrow("409");
	expect(writes(requests)).toHaveLength(1);
	expect(
		JSON.parse(writes(requests)[0].init.body).lastMergeSourceCommit,
	).toEqual({ commitId: sourceCommit });
	state.pr.lastMergeSourceCommit.commitId = state.refs[0].objectId;
	const current = await observe(api);
	expect(current).toMatchObject({
		revision: { ...revision, sourceCommit: state.refs[0].objectId },
		readyToComplete: true,
	});
	expect(current.fingerprint).not.toBe(observed.fingerprint);
	await api.complete({ context, expected: current.revision });
	expect(writes(requests)).toHaveLength(2);
	expect(JSON.parse(writes(requests).at(-1).init.body)).toMatchObject({
		lastMergeSourceCommit: { commitId: current.revision.sourceCommit },
		completionOptions: { mergeStrategy: "squash", bypassPolicy: false },
	});
});

test.each([
	["Current title", "Current description."],
	["\u4e00".repeat(100), "\u4e00".repeat(4000)],
	['Quoted "title"', "\u0000".repeat(4000)],
])(
	"completion %#: uses full current metadata; only observation confirms merged",
	async (title, description) => {
		const { api, state, requests } = fixture();
		const observed = await observe(api);
		state.pr.title = title;
		state.pr.description = description;
		await expect(
			api.complete({ context, expected: observed.revision }),
		).resolves.toBeUndefined();
		expect(writes(requests)).toHaveLength(1);
		const message = `Merged PR 17: ${title}\n\n${description}`;
		expect(JSON.parse(writes(requests)[0].init.body)).toEqual({
			status: "completed",
			lastMergeSourceCommit: { commitId: sourceCommit },
			completionOptions: {
				mergeStrategy: "squash",
				mergeCommitMessage:
					message.length > 4000 ? `${message.slice(0, 3997)}...` : message,
				deleteSourceBranch: false,
				bypassPolicy: false,
				transitionWorkItems: false,
			},
		});
		expect((await observe(api)).state).toBe("open");
		state.pr.status = "completed";
		expect((await observe(api)).state).toBe("merged");
	},
);

test.each(["active", "completed"])(
	"completion returns no value for response type %s",
	async (status) => {
		const { api, overrides, state, requests } = fixture();
		overrides.set(`PATCH ${prPath}`, () =>
			Response.json({ ...state.pr, status }),
		);
		await expect(
			api.complete({ context, expected: revision }),
		).resolves.toBeUndefined();
		expect((await observe(api)).state).toBe("open");
		expect(writes(requests)).toHaveLength(1);
	},
);

test.each(["completed", "abandoned"])(
	"completion skips terminal %s without another write",
	async (status) => {
		const { api, state, requests } = fixture();
		state.pr.status = status;
		await expect(
			api.complete({ context, expected: revision }),
		).resolves.toBeUndefined();
		expect((await observe(api)).state).toBe(
			status === "completed" ? "merged" : "closed",
		);
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	[
		"network",
		() => {
			throw new Error("connection lost");
		},
	],
	["denied", () => new Response(null, { status: 403 })],
	["conflict", () => new Response(null, { status: 409 })],
	["server failure", () => new Response(null, { status: 500 })],
	["empty acknowledgement", () => new Response(null, { status: 202 })],
])(
	"completion reports %s honestly and never retries",
	async (_name, response) => {
		const { api, overrides, requests } = fixture();
		overrides.set(`PATCH ${prPath}`, response);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toHaveLength(1);
	},
);

test.each([false, true])(
	"reviews are bounded and replies resolve only after a confirmed reply (draft=%s)",
	async (draft) => {
		const { api, state, requests } = fixture();
		state.pr.isDraft = draft;
		state.threads = [thread()];
		const review = await api.readReviews({ context, expected: revision });
		expect(review).toEqual({
			body: "thread:5\nReviewer: Please fix the race.",
			nextCursor: null,
		});
		expect(review.nextCursor).toBeNull();
		expect(
			await api.replyToReview({
				context,
				expected: revision,
				feedbackId: "thread:5",
				body: "Fixed and tested.",
			}),
		).toBe("Reply posted and thread resolved.");
		expect(writes(requests).map(({ init }) => init.method)).toEqual([
			"POST",
			"PATCH",
		]);
	},
);

test("bot review threads with system comments are feedback, but ADO event threads are not", async () => {
	const setup = fixture();
	const { api, state, requests } = setup;
	state.threads = [
		{
			id: 5,
			status: "active",
			threadContext: {
				filePath: "/src/Options.cs",
				rightFileStart: { line: 24, offset: 1 },
				rightFileEnd: { line: 24, offset: 80 },
			},
			properties: {
				GitOpsUserAgent: {
					$type: "System.String",
					$value: "GitOps.Apps.Server.breeze",
				},
			},
			comments: [
				{
					id: 1,
					parentCommentId: 0,
					author: { id: "gitops", displayName: "GitOps (Git LowPriv)" },
					commentType: "system",
					content: "<table><tr><td>Hard-coded endpoint</td></tr></table>",
					publishedDate: "2026-09-18T11:00:00Z",
				},
			],
		},
		{
			id: 6,
			threadContext: null,
			properties: {
				CodeReviewThreadType: { $type: "System.String", $value: "RefUpdate" },
			},
			comments: [
				{
					id: 1,
					parentCommentId: 0,
					author: { id: "tfs", displayName: "TFS" },
					commentType: "system",
					content: "Updated the source branch.",
					publishedDate: "2026-09-18T11:00:00Z",
				},
			],
		},
		{
			id: 7,
			status: "active",
			threadContext: null,
			properties: {
				CodeReviewThreadType: {
					$type: "System.String",
					$value: "StatusUpdate",
				},
			},
			comments: [
				{
					id: 1,
					parentCommentId: 0,
					author: { id: "reviewer", displayName: "Reviewer" },
					commentType: "text",
					content: "Please check this status.",
					publishedDate: "2026-09-18T11:00:00Z",
				},
			],
		},
	];
	expect(await observe(api)).toMatchObject({ reviews: true });
	expect(await api.readReviews({ context, expected: revision })).toEqual({
		body: "thread:5\n/src/Options.cs\nGitOps (Git LowPriv): <table><tr><td>Hard-coded endpoint</td></tr></table>\n\nthread:7\nReviewer: Please check this status.",
		nextCursor: null,
	});
	const details = await readMergeDetails(setup);
	expect(details.mergeDetails.reviews.items.map((item) => item.id)).toEqual([
		"thread:5",
		"thread:7",
	]);
	expect(details.mergeDetails.reviews.items[0].description).toContain(
		"Hard-coded endpoint",
	);
	expect(
		await api.replyToReview({
			context,
			expected: revision,
			feedbackId: "thread:5",
			body: "Moved the endpoint to configuration.",
		}),
	).toBe("Reply posted and thread resolved.");
	expect(writes(requests).map(({ init }) => init.method)).toEqual([
		"POST",
		"PATCH",
	]);
});

test.each(["readReviews", "replyToReview"])(
	"%s does not read unrelated CI evidence",
	async (operation) => {
		const { api, state, requests, overrides } = fixture();
		state.threads = [thread()];
		const ciPaths = [
			`${prPath}/iterations`,
			"git/policy/configurations",
			"policy/evaluations",
			"build/builds/88",
		];
		for (const path of ciPaths)
			overrides.set(`GET ${path}`, () => new Response(null, { status: 503 }));
		if (operation === "readReviews") {
			expect(await api.readReviews({ context, expected: revision })).toEqual({
				body: "thread:5\nReviewer: Please fix the race.",
				nextCursor: null,
			});
			expect(writes(requests)).toEqual([]);
		} else {
			expect(
				await api.replyToReview({
					context,
					expected: revision,
					feedbackId: "thread:5",
					body: "Fixed",
				}),
			).toBe("Reply posted and thread resolved.");
			expect(writes(requests).map(({ init }) => init.method)).toEqual([
				"POST",
				"PATCH",
			]);
		}
		expect(
			requests.some(({ url }) =>
				ciPaths.includes(new URL(url).pathname.split("/_apis/")[1]),
			),
		).toBe(false);
	},
);

test.each(["git/policy/configurations", "policy/evaluations"])(
	"readiness and diagnostics still require %s",
	async (path) => {
		const { api, state, requests, overrides } = fixture();
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		overrides.set(`GET ${path}`, () => new Response(null, { status: 503 }));
		await expect(observe(api)).rejects.toThrow();
		await expect(
			api.readCheckFailure({ context, expected: revision }),
		).rejects.toThrow();
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["queued", "running"])(
	"a failed required policy remains actionable while another is %s",
	async (status) => {
		const { api, state } = fixture();
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "pending",
			configuration: policy(3, types.build, { buildDefinitionId: 10 }),
			status,
			context: {},
		});
		state.evaluations[0].status = "rejected";
		expect(await observe(api)).toMatchObject({
			checks: true,
			readyToComplete: false,
		});
		state.evaluations[0].status = "approved";
		expect(await observe(api)).toMatchObject({
			checks: false,
			readyToComplete: false,
		});
	},
);

test("unavailable build diagnostics do not hide reviews, CI, or conflicts", async () => {
	const { api, state, requests, overrides } = fixture();
	state.threads = [thread()];
	state.pr.mergeStatus = "conflicts";
	state.evaluations[0].status = "rejected";
	overrides.set(
		"GET build/builds/88",
		() => new Response(null, { status: 403 }),
	);
	expect(await observe(api)).toMatchObject({
		reviews: true,
		checks: true,
		conflicts: true,
		readyToComplete: false,
	});
	expect(requests.some(({ url }) => url.includes("/build/builds/"))).toBe(
		false,
	);
	await expect(
		api.readCheckFailure({ context, expected: revision }),
	).rejects.toThrow();
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
	expect(writes(requests)).toEqual([]);
});

test.each([
	["denied", () => new Response(null, { status: 403 })],
	[
		"unknown",
		() => {
			throw new Error("connection lost");
		},
	],
	["invalid acknowledgement", () => Response.json({ id: 2 })],
])("a %s reply never resolves the thread", async (_name, response) => {
	const { api, state, requests, overrides } = fixture();
	state.threads = [thread()];
	overrides.set(`POST ${prPath}/threads/5/comments`, response);
	await expect(
		api.replyToReview({
			context,
			expected: revision,
			feedbackId: "thread:5",
			body: "Fixed",
		}),
	).rejects.toThrow();
	expect(writes(requests).map(({ init }) => init.method)).toEqual(["POST"]);
});

test("confirmed reply with failed resolution throws a bounded partial error without replay", async () => {
	const { api, state, requests, overrides } = fixture();
	state.threads = [thread()];
	overrides.set(
		`PATCH ${prPath}/threads/5`,
		() => new Response(null, { status: 500 }),
	);
	await expect(
		api.replyToReview({
			context,
			expected: revision,
			feedbackId: "thread:5",
			body: "Fixed",
		}),
	).rejects.toThrow(
		"Reply was confirmed, but thread resolution was not confirmed. Do not post the reply again.",
	);
	expect(writes(requests)).toHaveLength(2);
});

test.each(["completionQueueTime", "autoCompleteSetBy"])(
	"remote %s blocks completion even after a failed acknowledgement and in a fresh callback instance",
	async (field) => {
		const { api, state, overrides, requests, authentication } = fixture();
		overrides.set(`PATCH ${prPath}`, () => {
			state.pr[field] =
				field === "completionQueueTime"
					? "2026-09-18T12:00:01Z"
					: { id: "user" };
			throw new Error("connection lost after queueing");
		});
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect((await observe(api)).readyToComplete).toBe(false);
		const fresh = createAgentMerge(authentication);
		await expect(
			fresh.complete({ context, expected: revision }),
		).resolves.toBeUndefined();
		expect(writes(requests)).toHaveLength(1);
	},
);

test("a later call observes again after failure without a local pending lockout", async () => {
	const { api, overrides, requests } = fixture();
	overrides.set(`PATCH ${prPath}`, () => new Response(null, { status: 500 }));
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
	expect(writes(requests)).toHaveLength(1);
	expect((await observe(api)).readyToComplete).toBe(true);
	overrides.delete(`PATCH ${prPath}`);
	await expect(
		api.complete({ context, expected: revision }),
	).resolves.toBeUndefined();
	expect(writes(requests)).toHaveLength(2);
});

test.each([undefined, null, "policy:1:build:88"])(
	"failure details page current checks and logs with checkId=%s",
	async (checkId) => {
		const { api, state, overrides, requests } = fixture();
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		const second = policy(3, types.build, { buildDefinitionId: 10 });
		state.policies.push(second);
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "second",
			configuration: second,
			context: { buildId: 89 },
		});
		overrides.set("GET build/builds/89", () =>
			Response.json({
				...state.build,
				id: 89,
				definition: { id: 10, name: "More tests" },
			}),
		);
		overrides.set("GET build/builds/89/timeline", () =>
			Response.json(state.timeline),
		);
		overrides.set("GET build/builds/88/logs/4", () =>
			collection(["first log ".repeat(1500)]),
		);
		overrides.set("GET build/builds/89/logs/4", () =>
			collection(["second build log"]),
		);
		const pages = [];
		let cursor;
		do {
			const page = await api.readCheckFailure({
				context,
				expected: revision,
				cursor,
				checkId,
			});
			expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(12 * 1024);
			pages.push(page.body);
			cursor = page.nextCursor;
			expect(pages.length).toBeLessThan(20);
		} while (cursor);
		expect(pages.length).toBeGreaterThan(1);
		expect(pages.join("")).toContain("policy:1:build:88");
		expect(pages.join("")).toContain("first log ".repeat(1500));
		if (checkId == null) {
			expect(pages.join("")).toContain("policy:3:build:89");
			expect(pages.join("")).toContain("second build log");
		} else {
			expect(pages.join("")).not.toContain("policy:3:build:89");
			expect(requests.some(({ url }) => url.includes("/89/logs/"))).toBe(false);
		}
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["log", "checks"])(
	"failure discovery rejects stale %s pagination",
	async (changed) => {
		const { api, state, overrides } = fixture();
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		let text = "long log ".repeat(2000);
		overrides.set("GET build/builds/88/logs/4", () => collection([text]));
		const page = await api.readCheckFailure({ context, expected: revision });
		expect(page.nextCursor).toEqual(expect.any(String));
		if (changed === "checks") {
			state.evaluations[0].status = "approved";
			state.build.result = "succeeded";
		} else {
			text += "changed";
		}
		await expect(
			api.readCheckFailure({
				context,
				expected: revision,
				cursor: page.nextCursor,
			}),
		).rejects.toThrow();
	},
);

test("check diagnostics follow the current required evaluation even for an older build", async () => {
	const { api, state, requests } = fixture();
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	const result = await api.readCheckFailure({
		context,
		expected: revision,
		checkId: "policy:1:build:88",
	});
	expect(result.body).toContain("Test failed");
	expect(result.body).toContain("failure line");
	expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(12 * 1024);
	await expect(
		api.readCheckFailure({
			context,
			expected: revision,
			checkId: "policy:9:build:123",
		}),
	).rejects.toThrow();
	state.build.sourceVersion = "e".repeat(40);
	const older = await api.readCheckFailure({
		context,
		expected: revision,
		checkId: "policy:1:build:88",
	});
	expect(older.body).toContain(state.build.sourceVersion);
	expect(older.body).toContain("failure line");
	expect(writes(requests)).toEqual([]);
});

test.each(["rejected", "broken"])(
	"a %s required build policy remains work without a build ID",
	async (status) => {
		const { api, state, requests } = fixture();
		state.evaluations[0].status = status;
		state.evaluations[0].context = {};
		expect(await observe(api)).toMatchObject({
			readyToComplete: false,
			checks: true,
		});
		const page = await api.readCheckFailure({ context, expected: revision });
		expect(page).toEqual({
			body: `policy:1\nPolicy 1: ${status}\nAzure DevOps did not supply a build ID. Build diagnostics are unavailable.`,
			nextCursor: null,
		});
		expect(
			await api.readCheckFailure({
				context,
				expected: revision,
				checkId: "policy:1",
			}),
		).toEqual(page);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(requests.some(({ url }) => url.includes("/build/builds/"))).toBe(
			false,
		);
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	{ status: "inProgress", result: null },
	{ status: "completed", result: "succeeded" },
])(
	"a rejected evaluation remains work while its build is $status/$result",
	async (buildState) => {
		const { api, state, requests } = fixture();
		state.evaluations[0].status = "rejected";
		Object.assign(state.build, buildState);
		expect(await observe(api)).toMatchObject({
			checks: true,
			readyToComplete: false,
		});
		const page = await api.readCheckFailure({ context, expected: revision });
		expect(page.body).toContain("Policy 1: rejected");
		expect(page.body).toContain(buildState.status);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	[
		"definition",
		(state) => {
			state.build.definition.id = 10;
		},
	],
	[
		"repository",
		(state) => {
			state.build.repository.id = projectId;
		},
	],
	[
		"project",
		(state) => {
			state.build.project.id = repositoryId;
		},
	],
])(
	"a different build %s prevents diagnostic access without hiding the failed policy",
	async (_name, mutate) => {
		const { api, state, requests } = fixture();
		state.evaluations[0].status = "rejected";
		mutate(state);
		expect((await observe(api)).checks).toBe(true);
		await expect(
			api.readCheckFailure({
				context,
				expected: revision,
				checkId: "policy:1:build:88",
			}),
		).rejects.toThrow();
		expect(requests.some(({ url }) => url.includes("/timeline"))).toBe(false);
		expect(writes(requests)).toEqual([]);
	},
);

for (const checkId of [undefined, null, "policy:1:build:88"]) {
	test.each(["approved", "optional", "replaced", "broken", "closed"])(
		`check diagnostics reject a failure that becomes %s during log I/O (checkId=${checkId})`,
		async (change) => {
			const { api, state, overrides, requests } = fixture();
			state.evaluations[0].status = "rejected";
			state.build.result = "failed";
			overrides.set("GET build/builds/89", () =>
				Response.json({ ...state.build, id: 89 }),
			);
			overrides.set("GET build/builds/88/logs/4", () => {
				switch (change) {
					case "approved":
						state.evaluations[0].status = "approved";
						state.build.result = "succeeded";
						break;
					case "optional":
						state.policies[0].isBlocking = false;
						state.evaluations[0].configuration.isBlocking = false;
						break;
					case "replaced":
						state.evaluations[0].context.buildId = 89;
						break;
					case "broken":
						state.evaluations[0].status = "broken";
						break;
					case "closed":
						state.pr.status = "abandoned";
						break;
				}
				return collection(["stale failure details"]);
			});
			await expect(
				api.readCheckFailure({ context, expected: revision, checkId }),
			).rejects.toThrow("Check results changed; read from the first page.");
			expect(
				requests.filter(({ url }) => url.includes("/logs/4")),
			).toHaveLength(1);
			expect(writes(requests)).toEqual([]);
		},
	);
}

test.each([200, 201])(
	"check log excerpts enforce the line bound (%i lines)",
	async (count) => {
		const { api, state, overrides, requests } = fixture();
		state.evaluations[0].status = "rejected";
		state.build.result = "failed";
		state.timeline.records[0].log.url = "https://untrusted.example/log";
		overrides.set("GET build/builds/88/logs/4", (_request, url) => {
			expect(url.searchParams.get("startLine")).toBe("0");
			expect(url.searchParams.get("endLine")).toBe("199");
			return collection(Array(count).fill("line"));
		});
		const result = api.readCheckFailure({ context, expected: revision });
		if (count === 200)
			expect((await result).body).toContain(
				"Log excerpt limited to the first 200 lines.",
			);
		else await expect(result).rejects.toThrow();
		expect(
			requests.every(({ url }) => new URL(url).hostname === "dev.azure.com"),
		).toBe(true);
		expect(writes(requests)).toEqual([]);
	},
);

test("cancelled check reads do not return diagnostics or retry", async () => {
	const { api, state, overrides, requests } = fixture();
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	const controller = new AbortController();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(controller.signal);
	overrides.set("GET build/builds/88/logs/4", () => {
		controller.abort(new DOMException("Stopped", "AbortError"));
		return collection(["late log"]);
	});
	try {
		await expect(
			api.readCheckFailure({ context, expected: revision }),
		).rejects.toThrow("Stopped");
		expect(requests.filter(({ url }) => url.includes("/logs/4"))).toHaveLength(
			1,
		);
		expect(writes(requests)).toEqual([]);
	} finally {
		timeout.mockRestore();
	}
});

test.each(["sourceRef", "targetRef", "sourceCommit", "targetCommit"])(
	"review and check callbacks reject a stale %s",
	async (key) => {
		const { api, state, requests } = fixture();
		state.threads = [thread()];
		const expected = { ...revision, [key]: "different" };
		await expect(api.readReviews({ context, expected })).rejects.toThrow(
			"revision changed",
		);
		await expect(api.readCheckFailure({ context, expected })).rejects.toThrow(
			"revision changed",
		);
		await expect(
			api.replyToReview({
				context,
				expected,
				feedbackId: "thread:5",
				body: "Fixed",
			}),
		).rejects.toThrow("revision changed");
		expect(writes(requests)).toEqual([]);
	},
);

test("a revision change after reply blocks resolution without posting again", async () => {
	const { api, state, overrides, requests } = fixture();
	state.threads = [thread()];
	overrides.set(`POST ${prPath}/threads/5/comments`, () => {
		state.pr.lastMergeSourceCommit.commitId = "d".repeat(40);
		state.refs[0].objectId = "d".repeat(40);
		return Response.json({
			id: 2,
			parentCommentId: 1,
			commentType: 1,
			content: "Fixed",
		});
	});
	await expect(
		api.replyToReview({
			context,
			expected: revision,
			feedbackId: "thread:5",
			body: "Fixed",
		}),
	).rejects.toThrow("Do not post the reply again.");
	expect(writes(requests).map(({ init }) => init.method)).toEqual(["POST"]);
});

test.each(["completed", "abandoned"])(
	"a PR that becomes %s after a draft reply cannot resolve the thread",
	async (status) => {
		const { api, state, overrides, requests } = fixture();
		state.pr.isDraft = true;
		state.threads = [thread()];
		overrides.set(`POST ${prPath}/threads/5/comments`, () => {
			state.pr.status = status;
			return Response.json({
				id: 2,
				parentCommentId: 1,
				commentType: 1,
				content: "Fixed",
			});
		});
		await expect(
			api.replyToReview({
				context,
				expected: revision,
				feedbackId: "thread:5",
				body: "Fixed",
			}),
		).rejects.toThrow("Do not post the reply again.");
		expect(writes(requests).map(({ init }) => init.method)).toEqual(["POST"]);
	},
);

test("mismatched saved origin never reaches the API", async () => {
	const { api, authentication, fetch } = fixture();
	await expect(
		observe(api, {
			context: {
				...context,
				originUrl: context.originUrl.replace("fabrikam", "other"),
			},
		}),
	).rejects.toThrow("Saved repository origin");
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});

test("canonical PR repository IDs resolve against the saved named checkout origin", async () => {
	const { api } = fixture();
	const result = await observe(api, {
		context: { ...context, url: context.url.replace("widgets", repositoryId) },
	});
	expect(result.readyToComplete).toBe(true);
});

test("repository aliases never allow another saved repository binding", async () => {
	const { api, overrides, requests } = fixture();
	overrides.set("GET git/repositories/other", () =>
		Response.json({
			id: "44444444-4444-4444-4444-444444444444",
			name: "other",
			project: { id: projectId },
		}),
	);
	await expect(
		observe(api, {
			context: {
				...context,
				originUrl: context.originUrl.replace("widgets", "other"),
			},
		}),
	).rejects.toThrow("different repositories");
	expect(writes(requests)).toEqual([]);
});

test("missing expected revision never authorizes review or diagnostics", async () => {
	const { api, state, requests } = fixture();
	state.threads = [thread()];
	await expect(api.readReviews({ context })).rejects.toThrow();
	await expect(
		api.replyToReview({
			context,
			feedbackId: "thread:5",
			body: "Fixed",
		}),
	).rejects.toThrow("expected revision");
	await expect(api.readCheckFailure({ context })).rejects.toThrow(
		"expected revision",
	);
	expect(writes(requests)).toEqual([]);
});

test("a required evaluation can select source-branch build diagnostics", async () => {
	const { api, state, requests } = fixture();
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	state.build.sourceBranch = revision.sourceRef;
	state.build.sourceVersion = sourceCommit;
	expect(await observe(api)).toMatchObject({
		readyToComplete: false,
		checks: true,
	});
	const page = await api.readCheckFailure({
		context,
		expected: revision,
		checkId: "policy:1:build:88",
	});
	expect(page.body).toContain(revision.sourceRef);
	expect(page.body).toContain(sourceCommit);
	expect(page.body).toContain("failure line");
	expect(writes(requests)).toEqual([]);
});

test("completion acknowledgement for a different source is uncertain", async () => {
	const { api, state, overrides } = fixture();
	overrides.set(`PATCH ${prPath}`, () =>
		Response.json({
			...state.pr,
			status: "completed",
			lastMergeSourceCommit: { commitId: "d".repeat(40) },
		}),
	);
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
});

test("blocked squash or changed policy is rechecked at completion and never written", async () => {
	const { api, state, requests } = fixture();
	state.evaluations.push({
		...structuredClone(state.evaluations[0]),
		evaluationId: "merge-strategy",
		configuration: structuredClone(state.policies[1]),
		status: "rejected",
		context: {},
	});
	expect((await observe(api)).readyToComplete).toBe(true);
	state.policies[1].settings.allowSquash = false;
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
	expect(writes(requests)).toEqual([]);
});

test("full reviewer content pages fit frames and fence stale pagination", async () => {
	const { api, state } = fixture();
	state.threads = [thread()];
	state.threads[0].comments[0].content = "long feedback \u0001".repeat(2000);
	const seen = [];
	let cursor;
	do {
		const page = await api.readReviews({ context, expected: revision, cursor });
		expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(12 * 1024);
		seen.push(page.body);
		cursor = page.nextCursor;
	} while (cursor);
	expect(seen.join("")).toContain(state.threads[0].comments[0].content);
	const page = await api.readReviews({ context, expected: revision });
	state.threads[0].comments[0].content += " New feedback";
	await expect(
		api.readReviews({ context, expected: revision, cursor: page.nextCursor }),
	).rejects.toThrow();
});

test("inherited exact and prefix policies are evaluated, disabled ones are not required", async () => {
	const { api, state } = fixture();
	state.policies[0].settings.scope = [
		{ repositoryId: null, refName: "refs/heads/", matchKind: "Prefix" },
	];
	state.evaluations[0].configuration = structuredClone(state.policies[0]);
	expect((await observe(api)).readyToComplete).toBe(true);
	state.policies[0].isEnabled = false;
	state.evaluations = [];
	expect((await observe(api)).readyToComplete).toBe(true);
});

test("server queued completion prevents a write", async () => {
	const { api, state, requests } = fixture();
	expect((await observe(api)).readyToComplete).toBe(true);
	state.pr.completionQueueTime = "2026-09-18T12:00:01Z";
	expect((await observe(api)).readyToComplete).toBe(false);
	await expect(
		api.complete({ context, expected: revision }),
	).resolves.toBeUndefined();
	expect(writes(requests)).toEqual([]);
});

test("conflicts remain actionable when target advancement invalidates prior iteration checks", async () => {
	const { api, state } = fixture();
	state.pr.mergeStatus = "conflicts";
	state.refs[1].objectId = "d".repeat(40);
	state.iterations[0].targetRefCommit.commitId = "d".repeat(40);
	expect(await observe(api)).toMatchObject({
		revision: { ...revision, targetCommit: "d".repeat(40) },
		conflicts: true,
		readyToComplete: false,
	});
});

test("without policies, complete authoritative coverage still permits squash", async () => {
	const { api, state } = fixture();
	state.policies = [];
	state.evaluations = [];
	expect((await observe(api)).readyToComplete).toBe(true);
});

test("a target merge calculation update during completion does not block the write", async () => {
	const { api, state, overrides, requests } = fixture();
	let reads = 0;
	overrides.set(`GET ${prPath}`, () => {
		reads++;
		if (reads === 2) {
			state.pr.lastMergeTargetCommit.commitId = "e".repeat(40);
			state.pr.lastMergeCommit.commitId = "f".repeat(40);
		}
		return Response.json(state.pr);
	});
	await api.complete({ context, expected: revision });
	expect(writes(requests)).toHaveLength(1);
});

test("minimum-reviewer readiness follows the current ADO evaluation, not local approval counts", async () => {
	const { api, state } = fixture();
	const configuration = policy(3, types.review, {
		minimumApproverCount: 2,
		creatorVoteCounts: false,
	});
	state.policies.push(configuration);
	state.evaluations.push({
		...structuredClone(state.evaluations[0]),
		evaluationId: "review-policy",
		configuration,
		context: {},
	});
	state.pr.createdBy = { id: "author", displayName: "Author" };
	state.pr.reviewers = [
		{ id: "author", displayName: "Author", vote: 10 },
		{ id: "reviewer", displayName: "Reviewer", vote: 10 },
	];
	expect((await observe(api)).readyToComplete).toBe(true);
	state.evaluations[1].status = "rejected";
	expect((await observe(api)).readyToComplete).toBe(false);
	state.pr.reviewers.push({ id: "second", displayName: "Second", vote: 5 });
	expect((await observe(api)).readyToComplete).toBe(false);
	state.evaluations[1].status = "approved";
	expect((await observe(api)).readyToComplete).toBe(true);
});

test.each(["creator", "last pusher"])(
	"ADO evaluates excluded %s votes instead of the client counting them",
	async (excluded) => {
		const { api, state } = fixture();
		const identity = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const configuration = policy(3, types.review, {
			minimumApproverCount: 1,
			creatorVoteCounts: excluded !== "creator",
			blockLastPusherVote: excluded === "last pusher",
		});
		state.policies.push(configuration);
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "review-policy",
			configuration,
			context: {},
		});
		state.pr.createdBy = { id: identity.toUpperCase() };
		state.iterations[0].author = { id: identity.toUpperCase() };
		state.pr.reviewers = [{ id: identity, displayName: "Excluded", vote: 10 }];
		expect((await observe(api)).readyToComplete).toBe(true);
		state.evaluations[1].status = "rejected";
		expect((await observe(api)).readyToComplete).toBe(false);
		state.pr.reviewers.push({
			id: "independent",
			displayName: "Independent",
			vote: 10,
		});
		expect((await observe(api)).readyToComplete).toBe(false);
		state.evaluations[1].status = "approved";
		expect((await observe(api)).readyToComplete).toBe(true);
	},
);

test("duplicate reviewer entries cannot override ADO's review evaluation", async () => {
	const { api, state, requests } = fixture();
	const identity = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
	const configuration = policy(3, types.review, {
		minimumApproverCount: 2,
		creatorVoteCounts: true,
	});
	state.policies.push(configuration);
	state.evaluations.push({
		...structuredClone(state.evaluations[0]),
		evaluationId: "review-policy",
		configuration,
		context: {},
		status: "rejected",
	});
	state.pr.reviewers = [
		{ id: identity, displayName: "Reviewer", vote: 10 },
		{ id: identity.toUpperCase(), displayName: "Same reviewer", vote: 10 },
	];
	expect((await observe(api)).readyToComplete).toBe(false);
	await expect(api.complete({ context, expected: revision })).rejects.toThrow();
	expect(writes(requests)).toEqual([]);
	state.evaluations[1].status = "approved";
	expect((await observe(api)).readyToComplete).toBe(true);
});

test.each([240, 1000])(
	"review text stays valid Unicode at the %i-character boundary",
	async (boundary) => {
		const { api, state } = fixture();
		const content = `${"x".repeat(boundary - 11)}\u{1f600} trailing text`;
		state.threads = [thread()];
		state.threads[0].comments[0].content = content;
		const observation = await observe(api);
		expect(observation.reviews).toBe(true);
		const page = await api.readReviews({ context, expected: revision });
		expect(page.body.isWellFormed()).toBe(true);
		expect(page.body).toBe(`thread:5\nReviewer: ${content}`);
	},
);

test("required-reviewer readiness follows ADO instead of reconstructing reviewer membership", async () => {
	const { api, state } = fixture();
	const configuration = policy(3, "fd2167ab-b0be-447a-8ec8-39368250530e", {
		requiredReviewerIds: ["required-reviewer"],
		minimumNumberOfReviewers: 1,
	});
	state.policies.push(configuration);
	state.evaluations.push({
		...structuredClone(state.evaluations[0]),
		evaluationId: "required-reviewer-policy",
		configuration,
		context: {},
	});
	expect((await observe(api)).readyToComplete).toBe(true);
	state.evaluations[1].status = "rejected";
	expect((await observe(api)).readyToComplete).toBe(false);
	state.pr.reviewers = [
		{
			id: "required-reviewer",
			displayName: "Required",
			vote: 10,
			isRequired: true,
		},
	];
	expect((await observe(api)).readyToComplete).toBe(false);
	state.evaluations[1].status = "approved";
	expect((await observe(api)).readyToComplete).toBe(true);
});

test.each([
	["approved", true],
	["notApplicable", true],
	["rejected", false],
	["queued", false],
	["running", false],
	["broken", false],
	["future", false],
])(
	"an unfamiliar required policy with current status %s has readiness %s",
	async (status, ready) => {
		const { api, state, requests } = fixture();
		const configuration = policy(3, "ffffffff-ffff-ffff-ffff-ffffffffffff");
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "custom-policy",
			configuration,
			status,
			context: {},
		});
		expect((await observe(api)).readyToComplete).toBe(ready);
		expect(writes(requests)).toEqual([]);
		if (ready) {
			await expect(
				api.complete({ context, expected: revision }),
			).resolves.toBeUndefined();
			expect(writes(requests)).toHaveLength(1);
			expect(
				JSON.parse(writes(requests)[0].init.body).completionOptions,
			).toEqual({
				mergeStrategy: "squash",
				mergeCommitMessage: "Merged PR 17: Change",
				deleteSourceBranch: false,
				bypassPolicy: false,
				transitionWorkItems: false,
			});
		} else {
			await expect(
				api.complete({ context, expected: revision }),
			).rejects.toThrow();
			expect(writes(requests)).toEqual([]);
		}
	},
);

test.each([undefined, "invalid"])(
	"a missing or malformed policy type %s cannot establish readiness",
	async (type) => {
		const { api, state, requests } = fixture();
		state.evaluations[0].configuration.type.id = type;
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each([true, false])(
	"verified legacy merge policy useSquashMerge=%s selects its permitted strategy",
	async (useSquashMerge) => {
		const { api, state, requests } = fixture();
		delete state.policies[1].settings.allowSquash;
		state.policies[1].settings.useSquashMerge = useSquashMerge;
		const result = await observe(api);
		const method = useSquashMerge ? "squash" : "noFastForward";
		expect(result).toMatchObject({
			readyToComplete: true,
			mergeMethod: method,
		});
		await api.complete({
			context,
			expected: revision,
			mergeMethod: result.mergeMethod,
		});
		expect(writes(requests)).toHaveLength(1);
		expect(
			JSON.parse(writes(requests)[0].init.body).completionOptions,
		).toMatchObject({
			mergeStrategy: method,
			bypassPolicy: false,
		});
	},
);

test("mixed or contradictory legacy and modern merge settings fail closed", async () => {
	const { api, state } = fixture();
	state.policies[1].settings.useSquashMerge = false;
	expect((await observe(api)).readyToComplete).toBe(false);
	delete state.policies[1].settings.allowSquash;
	state.policies[1].settings.useSquashMerge = true;
	state.policies[1].settings.allowRebase = true;
	expect((await observe(api)).readyToComplete).toBe(false);
});

test.each([{ allowSquash: true }, { useSquashMerge: true }])(
	"completion selects allowed squash despite a rejected merge-strategy evaluation (%j)",
	async (settings) => {
		const { api, state, requests } = fixture();
		state.pr.completionOptions = null;
		state.policies[1] = policy(2, types.squash, settings);
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "merge-strategy",
			configuration: structuredClone(state.policies[1]),
			status: "rejected",
			context: {},
		});
		expect(await observe(api)).toMatchObject({
			readyToComplete: true,
			checks: false,
		});
		expect(writes(requests)).toEqual([]);
		await api.complete({ context, expected: revision });
		expect(writes(requests)).toHaveLength(1);
		expect(JSON.parse(writes(requests)[0].init.body)).toEqual({
			status: "completed",
			lastMergeSourceCommit: { commitId: sourceCommit },
			completionOptions: {
				mergeStrategy: "squash",
				mergeCommitMessage: "Merged PR 17: Change",
				deleteSourceBranch: false,
				bypassPolicy: false,
				transitionWorkItems: false,
			},
		});
	},
);

test.each([
	["noFastForward", "allowNoFastForward"],
	["squash", "allowSquash"],
	["rebase", "allowRebase"],
	["rebaseMerge", "allowRebaseMerge"],
])(
	"automatically selects the sole permitted %s strategy without a remote choice",
	async (method, setting) => {
		const setup = fixture();
		setup.state.pr.completionOptions = null;
		setup.state.policies[1] = policy(2, types.squash, { [setting]: true });
		setup.state.evaluations.push({
			...structuredClone(setup.state.evaluations[0]),
			evaluationId: "merge-strategy",
			configuration: structuredClone(setup.state.policies[1]),
			status: "rejected",
		});
		const observed = await observe(setup.api);
		expect(observed).toMatchObject({
			readyToComplete: true,
			mergeMethod: method,
			checks: false,
		});
		const ui = await readMergeDetails(setup);
		expect(ui.mergeDetails.merge.status).toBe("satisfied");
		expect(ui.mergeDetails.mergeMethods).toMatchObject({
			defaultMethod: method,
			options: [{ method, contributionId: `complete-${method}` }],
		});
		expect(ui.mergeDetails.mergeMethods.options).toHaveLength(1);
		const contribution = ui.contributions.find(
			(item) => item.id === `complete-${method}`,
		);
		expect(contribution.action.input).toEqual({
			sourceRef: revision.sourceRef,
			targetRef: revision.targetRef,
			sourceCommit,
			mergeStrategy: method,
		});
		await setup.api.complete({
			context,
			expected: observed.revision,
			mergeMethod: observed.mergeMethod,
		});
		expect(writes(setup.requests)).toHaveLength(1);
		expect(JSON.parse(writes(setup.requests)[0].init.body)).toMatchObject({
			lastMergeSourceCommit: { commitId: sourceCommit },
			completionOptions: {
				mergeStrategy: method,
				bypassPolicy: false,
				deleteSourceBranch: false,
			},
		});
	},
);

test.each([
	[{}, "squash"],
	[{ allowSquash: true, allowRebase: true }, "squash"],
	[
		{ allowNoFastForward: true, allowSquash: true, allowRebase: true },
		"squash",
	],
	[{ allowRebase: true, allowRebaseMerge: true }, "rebase"],
])(
	"defaults to the ADO preference ordering for %j",
	async (settings, expected) => {
		const setup = fixture();
		if (Object.keys(settings).length)
			setup.state.policies[1].settings = settings;
		else setup.state.policies = [];
		const observed = await observe(setup.api);
		expect(observed).toMatchObject({
			readyToComplete: true,
			mergeMethod: expected,
		});
		await setup.api.complete({
			context,
			expected: revision,
			mergeMethod: observed.mergeMethod,
		});
		expect(
			JSON.parse(writes(setup.requests)[0].init.body).completionOptions
				.mergeStrategy,
		).toBe(expected);
	},
);

test.each([
	[{}, null, "squash"],
	[
		{ allowNoFastForward: true, allowSquash: true, allowRebase: true },
		"rebase",
		"rebase",
	],
	[{ allowNoFastForward: true, allowRebase: true }, "squash", "noFastForward"],
	[{ allowRebase: true, allowRebaseMerge: true }, null, "rebase"],
])(
	"manual and background completion share the permitted saved strategy and fallback order for %j with saved %s",
	async (settings, saved, expected) => {
		const setup = fixture();
		setup.state.pr.completionOptions = saved ? { mergeStrategy: saved } : null;
		if (Object.keys(settings).length)
			setup.state.policies[1].settings = settings;
		else setup.state.policies = [];
		const snapshot = await setup.client.getAgentMergeEvidence(17);
		expect(mergeMethods(snapshot).defaultMethod).toBe(expected);
		expect((await observe(setup.api)).mergeMethod).toBe(expected);
		expect(
			(await readMergeDetails(setup)).mergeDetails.mergeMethods.defaultMethod,
		).toBe(expected);
	},
);

test("the Complete dialog and Agent merge use the same method order", async () => {
	const setup = fixture();
	setup.state.policies = [];
	setup.state.pr.completionOptions = null;
	const snapshot = await setup.client.getAgentMergeEvidence(17);
	const ordinary = mergeMethods(snapshot);
	const dialog = (await readMergeDetails(setup)).mergeDetails.mergeMethods;

	expect(ordinary.defaultMethod).toBe("squash");
	expect(dialog.defaultMethod).toBe(ordinary.defaultMethod);
	expect(dialog.options).toEqual(ordinary.options);
});

test("the manual drawer shows every ADO strategy and uses the Agent merge default", async () => {
	const setup = fixture();
	setup.state.policies = [];
	setup.state.pr.completionOptions = null;
	const ui = await readMergeDetails(setup);

	expect(ui.mergeDetails.mergeMethods).toMatchObject({
		defaultMethod: "squash",
		options: [
			{
				method: "noFastForward",
				label: "Merge (no fast-forward)",
				description: "A non-linear history preserving all commits.",
			},
			{
				method: "squash",
				label: "Squash commit",
				description: "A linear history with a single commit on the target.",
			},
			{
				method: "rebase",
				label: "Rebase and fast-forward",
				description: "Rebase source commits onto target and fast-forward.",
			},
			{
				method: "rebaseMerge",
				label: "Semi-linear merge",
				description:
					"Rebase source commits onto target and create a two-parent merge.",
			},
		],
	});
});

test("remote preference and explicit drawer choice use permitted strategies", async () => {
	const setup = fixture();
	setup.state.policies[1].settings = {
		allowNoFastForward: true,
		allowSquash: true,
		allowRebase: true,
	};
	setup.state.pr.completionOptions = { mergeStrategy: "squash" };
	const observed = await observe(setup.api);
	const ui = await readMergeDetails(setup);
	expect(observed.mergeMethod).toBe("squash");
	expect(ui.mergeDetails.mergeMethods.defaultMethod).toBe("squash");
	const action = ui.contributions.find((item) => item.id === "complete-rebase");
	await createPullRequestUi(setup.authentication)
		.actions.find((action) => action.name === "complete")
		.handler(
			{
				...action.action.input,
				postCompletionOptions: [
					"deleteSourceBranch",
					"completeAssociatedWorkItems",
				],
			},
			{
				...revision,
				originUrl: context.originUrl,
				associatedUri: context.url,
				title: "Change",
			},
			{ markMutationDispatched() {} },
		);
	expect(
		JSON.parse(writes(setup.requests)[0].init.body).completionOptions,
	).toMatchObject({
		mergeStrategy: "rebase",
		bypassPolicy: false,
		deleteSourceBranch: true,
		transitionWorkItems: true,
	});
});

test("an observed method is pinned through completion and cannot fall back after policy changes", async () => {
	const setup = fixture();
	setup.state.policies[1].settings = { allowSquash: true, allowRebase: true };
	const observed = await observe(setup.api);
	expect(observed.mergeMethod).toBe("squash");
	setup.state.pr.completionOptions = { mergeStrategy: "rebase" };
	const current = await observe(setup.api);
	expect(current.mergeMethod).toBe("rebase");
	expect(current.fingerprint).not.toBe(observed.fingerprint);
	await setup.api.complete({
		context,
		expected: revision,
		mergeMethod: observed.mergeMethod,
	});
	expect(
		JSON.parse(writes(setup.requests)[0].init.body).completionOptions
			.mergeStrategy,
	).toBe("squash");
	setup.state.policies[1].settings.allowSquash = false;
	await expect(
		setup.api.complete({
			context,
			expected: revision,
			mergeMethod: observed.mergeMethod,
		}),
	).rejects.toThrow("forbids squash");
	expect(writes(setup.requests)).toHaveLength(1);
});

test("required policy intersections and evaluation-only restrictions govern every strategy", async () => {
	const setup = fixture();
	setup.state.policies[1].settings = {
		allowNoFastForward: true,
		allowSquash: true,
	};
	setup.state.evaluations.push({
		...structuredClone(setup.state.evaluations[0]),
		evaluationId: "merge-strategy",
		configuration: policy(3, types.squash, { allowSquash: true }),
		status: "rejected",
	});
	expect(await observe(setup.api)).toMatchObject({
		readyToComplete: true,
		mergeMethod: "squash",
	});
	expect(
		(await readMergeDetails(setup)).mergeDetails.mergeMethods.options.map(
			({ method }) => method,
		),
	).toEqual(["squash"]);
	setup.state.evaluations[1].configuration.settings = { allowRebase: true };
	expect((await observe(setup.api)).readyToComplete).toBe(false);
	await expect(
		setup.api.complete({ context, expected: revision }),
	).rejects.toThrow();
	expect(writes(setup.requests)).toEqual([]);
});

test.each([
	{ allowSquash: false },
	{},
	{ allowSquash: "true" },
	{ useSquashMerge: false },
	{ allowSquash: true, useSquashMerge: true },
])(
	"a rejected merge-strategy evaluation needs explicit squash permission (%j)",
	async (settings) => {
		const { api, state, requests } = fixture();
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "merge-strategy",
			configuration: policy(2, types.squash, settings),
			status: "rejected",
			context: {},
		});
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each([
	[types.build, "rejected"],
	[types.review, "queued"],
	["ffffffff-ffff-ffff-ffff-ffffffffffff", "rejected"],
])(
	"allowed squash still requires policy %s with status %s",
	async (type, status) => {
		const { api, state, requests } = fixture();
		state.evaluations.push(
			{
				...structuredClone(state.evaluations[0]),
				evaluationId: "merge-strategy",
				configuration: structuredClone(state.policies[1]),
				status: "rejected",
				context: {},
			},
			{
				...structuredClone(state.evaluations[0]),
				evaluationId: "other-policy",
				configuration: policy(3, type),
				status,
				context: {},
			},
		);
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test.each(["queued", "running", "broken", "future"])(
	"a %s merge-strategy evaluation never becomes ready from its configuration alone",
	async (status) => {
		const { api, state, requests } = fixture();
		state.evaluations.push({
			...structuredClone(state.evaluations[0]),
			evaluationId: "merge-strategy",
			configuration: structuredClone(state.policies[1]),
			status,
			context: {},
		});
		expect((await observe(api)).readyToComplete).toBe(false);
		await expect(
			api.complete({ context, expected: revision }),
		).rejects.toThrow();
		expect(writes(requests)).toEqual([]);
	},
);

test("fresh observations retain actionable work across a changed source", async () => {
	const { api, state, requests } = fixture();
	const changedSource = "d".repeat(40);
	state.pr.lastMergeSourceCommit.commitId = changedSource;
	state.refs[0].objectId = changedSource;
	state.iterations[0].sourceRefCommit.commitId = changedSource;
	state.threads = [thread()];
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	const result = await observe(api);
	expect(result).toMatchObject({
		state: "open",
		revision: { ...revision, sourceCommit: changedSource },
		reviews: true,
		checks: true,
		conflicts: false,
		readyToComplete: false,
	});
	expect(writes(requests)).toEqual([]);
});

test("a conflicted PR still exposes the required build failure reported by ADO", async () => {
	const { api, state } = fixture();
	state.pr.mergeStatus = "conflicts";
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	expect(await observe(api)).toMatchObject({
		checks: true,
		conflicts: true,
		readyToComplete: false,
	});
});

test("callbacks resolve the saved locator before using canonical client routes", async () => {
	const { api, state, requests } = fixture();
	state.evaluations[0].status = "rejected";
	state.build.result = "failed";
	await api.readCheckFailure({
		context,
		expected: revision,
		checkId: "policy:1:build:88",
	});
	const lookup = "/fabrikam/Tools/_apis/git/repositories/widgets";
	expect(new URL(requests[0].url).pathname).toBe(lookup);
	for (const request of requests) {
		const url = new URL(request.url);
		if (url.pathname === lookup) continue;
		expect(url.pathname.startsWith(`/fabrikam/${projectId}/_apis/`)).toBe(true);
		if (url.pathname.includes("/git/repositories/"))
			expect(
				url.pathname.startsWith(
					`/fabrikam/${projectId}/_apis/git/repositories/${repositoryId}/`,
				),
			).toBe(true);
	}
	expect(
		requests.some(
			({ url }) =>
				new URL(url).searchParams.get("repositoryId") === repositoryId,
		),
	).toBe(true);
	expect(
		requests.some(
			({ url }) =>
				new URL(url).searchParams.get("artifactId") ===
				`vstfs:///CodeReview/CodeReviewId/${projectId}/17`,
		),
	).toBe(true);
});
