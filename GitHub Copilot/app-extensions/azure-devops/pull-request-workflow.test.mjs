// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished, test, vi } from "vitest";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";
import {
	createReviewStorage,
	emptyReviewState,
} from "./pull-request-review-state.mjs";
import { executeMutation } from "./pull-request-workflow.mjs";

const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "repo-one",
		accountId: "account-one",
	},
	pullRequestId: 22,
};
function setup(extra = {}) {
	const fetch = vi.fn(async (_input, options) => {
		const body = options.body ? JSON.parse(options.body) : {};
		return Response.json({
			pullRequestId: 22,
			repository: { id: binding.repository.repositoryId },
			title: body.title ?? "Original title",
			status: "active",
			sourceRefName: "refs/heads/topic",
			targetRefName: "refs/heads/main",
		});
	});
	const linked = createLinkedPullRequest({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch,
		...extra,
	});
	onTestFinished(() => linked.dispose());
	linked.setBinding(binding);
	return { linked, fetch };
}

const completionProjectId = "11111111-1111-4111-8111-111111111111";
const completionSource = "a".repeat(40);
const completionTarget = "b".repeat(40);

function completionEvidence({
	status = "approved",
	isBlocking = true,
	isEnabled = true,
} = {}) {
	const configuration = {
		id: 1,
		revision: 1,
		isBlocking,
		isEnabled,
		type: { id: BUILD_POLICY, displayName: "Build validation" },
		settings: { displayName: "Required build" },
	};
	const normalized = {
		id: 22,
		repositoryId: binding.repository.repositoryId,
		title: "Current title",
		description: "Current description.",
		url: "https://dev.azure.com/fabrikam/tools/_git/tools/pullrequest/22",
		state: "open",
		sourceRef: "refs/heads/topic",
		targetRef: "refs/heads/main",
		sourceCommitId: completionSource,
		mergeStatus: "succeeded",
	};
	return {
		raw: {
			pullRequestId: 22,
			repository: {
				id: binding.repository.repositoryId,
				project: { id: completionProjectId },
			},
			title: normalized.title,
			description: normalized.description,
			status: "active",
			sourceRefName: normalized.sourceRef,
			targetRefName: normalized.targetRef,
			lastMergeSourceCommit: { commitId: completionSource },
			lastMergeTargetCommit: { commitId: completionTarget },
			mergeStatus: "succeeded",
			reviewers: [],
		},
		normalized,
		revision: {
			sourceRef: normalized.sourceRef,
			targetRef: normalized.targetRef,
			sourceCommit: completionSource,
			targetCommit: completionTarget,
		},
		policies: [configuration],
		evaluations: [
			{
				evaluationId: "evaluation-one",
				artifactId: `vstfs:///CodeReview/CodeReviewId/${completionProjectId}/22`,
				status,
				configuration,
				context: {},
			},
		],
		threads: [],
	};
}

function completionSnapshot(pullRequest) {
	const emptyResource = () => ({ status: "idle", data: null, error: null });
	return {
		revision: 1,
		bindingRevision: 1,
		changesRevision: 1,
		status: "ready",
		pullRequest,
		updatedAt: null,
		error: null,
		overview: emptyResource(),
		completion: emptyResource(),
		changes: emptyResource(),
		fileDiff: emptyResource(),
		threadCode: emptyResource(),
		selectedFile: null,
		access: { viewerId: "viewer", operations: ["complete"] },
		accessError: null,
		reviewState: emptyReviewState(),
		mutation: { status: "idle", error: null },
		selectedCommitId: null,
	};
}

test.each([
	{
		name: "pending required policy",
		evidence: completionEvidence({ status: "queued" }),
		error: "Required policy evaluation is pending.",
	},
	{
		name: "failed required policy",
		evidence: completionEvidence({ status: "rejected" }),
		error: "A required branch policy is not satisfied.",
	},
	{
		name: "satisfied required policy",
		evidence: completionEvidence(),
	},
	{
		name: "failed optional policy",
		evidence: completionEvidence({ status: "rejected", isBlocking: false }),
	},
	{
		name: "failed disabled policy",
		evidence: completionEvidence({ status: "rejected", isEnabled: false }),
	},
	{
		name: "not-applicable required policy",
		evidence: completionEvidence({ status: "notApplicable" }),
	},
])(
	"direct completion follows existing readiness semantics for $name",
	async ({ evidence, error }) => {
		const client = {
			getAgentMergeEvidence: vi.fn().mockResolvedValue(evidence),
			complete: vi.fn().mockResolvedValue(evidence.normalized),
		};
		const mutation = executeMutation({
			client,
			id: 22,
			snapshot: completionSnapshot(evidence.normalized),
			operation: "complete",
			input: {
				confirm: true,
				mergeStrategy: "squash",
				deleteSourceBranch: true,
			},
			viewerId: "viewer",
			signal: new AbortController().signal,
			draftPosted: vi.fn(),
		});
		if (error) await expect(mutation).rejects.toThrow(error);
		else await expect(mutation).resolves.toEqual(evidence.normalized);
		expect(client.complete).toHaveBeenCalledTimes(error ? 0 : 1);
		if (!error)
			expect(client.complete).toHaveBeenCalledWith(
				22,
				{
					sourceCommitId: completionSource,
					title: evidence.normalized.title,
					description: evidence.normalized.description,
					mergeStrategy: "squash",
					deleteSourceBranch: true,
				},
				{ signal: expect.any(AbortSignal) },
			);
	},
);

test("direct completion refuses unavailable readiness without writing", async () => {
	const evidence = completionEvidence();
	const client = {
		getAgentMergeEvidence: vi
			.fn()
			.mockRejectedValue(new Error("private policy failure")),
		complete: vi.fn(),
	};
	await expect(
		executeMutation({
			client,
			id: 22,
			snapshot: completionSnapshot(evidence.normalized),
			operation: "complete",
			input: { confirm: true, mergeStrategy: "squash" },
			viewerId: "viewer",
			signal: new AbortController().signal,
			draftPosted: vi.fn(),
		}),
	).rejects.toThrow(
		"Completion readiness could not be confirmed. Refresh and try again.",
	);
	expect(client.complete).not.toHaveBeenCalled();
});

test("direct completion accepts an uppercase source SHA from pull request details", async () => {
	const evidence = completionEvidence();
	const pullRequest = {
		...evidence.normalized,
		sourceCommitId: completionSource.toUpperCase(),
	};
	const client = {
		getAgentMergeEvidence: vi.fn().mockResolvedValue(evidence),
		complete: vi.fn().mockResolvedValue(evidence.normalized),
	};
	await expect(
		executeMutation({
			client,
			id: 22,
			snapshot: completionSnapshot(pullRequest),
			operation: "complete",
			input: { confirm: true, mergeStrategy: "squash" },
			viewerId: "viewer",
			signal: new AbortController().signal,
			draftPosted: vi.fn(),
		}),
	).resolves.toEqual(evidence.normalized);
	expect(client.complete).toHaveBeenCalledWith(
		22,
		expect.objectContaining({ sourceCommitId: completionSource }),
		{ signal: expect.any(AbortSignal) },
	);
});

test("mutations deny by default and recheck access before sending", async () => {
	let access = { viewerId: "viewer", operations: ["edit"] };
	const { linked, fetch } = setup({ getAccess: async () => access });
	await linked.refresh();
	expect(linked.getSnapshot().access).toEqual(access);
	access = null;
	await expect(linked.mutate("edit", { title: "Changed" })).rejects.toThrow(
		"not authorized",
	);
	expect(
		fetch.mock.calls.every(([, options]) => options.method === "GET"),
	).toBe(true);
	const denied = setup();
	await denied.linked.refresh();
	await expect(
		denied.linked.mutate("edit", { title: "Changed" }),
	).rejects.toThrow("not authorized");
});

test("rebinding while authorization is pending prevents the old write", async () => {
	const grant = Promise.withResolvers();
	let checking = false;
	const { linked, fetch } = setup({
		getAccess: async () =>
			checking ? grant.promise : { viewerId: "viewer", operations: ["edit"] },
	});
	await linked.refresh();
	checking = true;
	const mutation = linked.mutate("edit", { title: "Old binding edit" });
	const rejected = expect(mutation).rejects.toMatchObject({
		name: "AbortError",
	});
	linked.setBinding(null);
	grant.resolve({ viewerId: "viewer", operations: ["edit"] });
	await rejected;
	expect(
		fetch.mock.calls.every(([, options]) => options.method === "GET"),
	).toBe(true);
	expect(linked.getSnapshot().access).toBeNull();
});

test("review progress persists across controllers but is isolated by account", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ado-review-"));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	const storage = createReviewStorage(directory);
	const first = setup({ reviewStorage: storage }).linked;
	await first.refresh();
	await first.updateReviewState({ preferences: { mode: "split" } });
	const second = setup({
		reviewStorage: createReviewStorage(directory),
	}).linked;
	await second.refresh();
	expect(second.getSnapshot().reviewState.preferences.mode).toBe("split");
	second.setBinding({
		...binding,
		repository: { ...binding.repository, accountId: "account-two" },
	});
	await second.refresh();
	expect(second.getSnapshot().reviewState.preferences.mode).toBe("unified");
});

test("review state cannot mark a file that is not in the current comparison", async () => {
	const { linked } = setup();
	await linked.refresh();
	await expect(
		linked.updateReviewState({
			viewed: { path: "/private.txt", viewed: true },
		}),
	).rejects.toThrow("loaded Changes");
});

test("a cancelled write settles promptly and cannot publish into a new binding", async () => {
	const late = Promise.withResolvers();
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["edit"] }),
	});
	await linked.refresh();
	fetch.mockImplementationOnce(() => late.promise);
	const mutation = linked.mutate("edit", { title: "Old title" });
	const rejected = expect(mutation).rejects.toMatchObject({
		name: "AbortError",
	});
	await expect.poll(() => fetch.mock.calls.length).toBe(2);
	linked.setBinding(null);
	await rejected;
	const cleared = linked.getSnapshot();
	late.resolve(Response.json({}));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(linked.getSnapshot()).toBe(cleared);
});

test("failed writes are sent once and leave a visible uncertain-result warning", async () => {
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["edit"] }),
	});
	await linked.refresh();
	fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
	await expect(linked.mutate("edit", { title: "Changed" })).rejects.toThrow(
		"partly completed",
	);
	expect(
		fetch.mock.calls.filter(([, options]) => options.method === "PATCH"),
	).toHaveLength(1);
	expect(linked.getSnapshot().mutation.status).toBe("error");
});

test("reviewer resolution failures stay actionable", async () => {
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["reviewer"] }),
	});
	fetch.mockImplementation(async (input, options) => {
		const url = new URL(String(input));
		if (url.host === "vssps.dev.azure.com")
			return Response.json({ count: 0, value: [] });
		if (
			url.pathname.includes("/_apis/projects/") &&
			url.pathname.endsWith("/teams")
		)
			return Response.json({ count: 0, value: [] });
		const body = options.body ? JSON.parse(options.body) : {};
		return Response.json({
			pullRequestId: 22,
			repository: { id: binding.repository.repositoryId },
			title: body.title ?? "Original title",
			status: "active",
			sourceRefName: "refs/heads/topic",
			targetRefName: "refs/heads/main",
		});
	});
	await linked.refresh();

	await expect(
		linked.mutate("reviewer", {
			reviewerId: "missing-alias",
			isRequired: false,
		}),
	).rejects.toThrow(
		"No Azure DevOps reviewer matched that name, email, alias, or identity ID.",
	);
});

test("required reviewer additions stay unavailable without a provider write", async () => {
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["reviewer"] }),
	});
	await linked.refresh();

	await expect(
		linked.mutate("reviewer", {
			reviewerId: "77777777-7777-4777-8777-777777777777",
			isRequired: true,
		}),
	).rejects.toThrow("Adding required reviewers is not available");
	expect(
		fetch.mock.calls.every(([, options]) => options.method === "GET"),
	).toBe(true);
});

test("a confirmed write is not converted to failure by its reconciliation refresh", async () => {
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["edit"] }),
	});
	await linked.refresh();
	fetch
		.mockResolvedValueOnce(
			Response.json({
				pullRequestId: 22,
				repository: { id: binding.repository.repositoryId },
				title: "Changed",
				status: "active",
				sourceRefName: "refs/heads/topic",
				targetRefName: "refs/heads/main",
			}),
		)
		.mockResolvedValueOnce(new Response(null, { status: 503 }));

	await expect(
		linked.mutate("edit", { title: "Changed" }),
	).resolves.toMatchObject({
		mutation: { status: "ready", error: null },
	});
	await expect.poll(() => linked.getSnapshot().status).toBe("error");
	expect(linked.getSnapshot().mutation).toEqual({
		status: "ready",
		error: null,
	});
	expect(
		fetch.mock.calls.filter(([, options]) => options.method === "PATCH"),
	).toHaveLength(1);
});

test("automatic refresh recovers after a temporary error and stops on cancellation or disposal", async () => {
	vi.useFakeTimers();
	onTestFinished(() => vi.useRealTimers());
	const { linked, fetch } = setup({ refreshIntervalMs: 1000 });
	await linked.refresh();
	await vi.advanceTimersByTimeAsync(1000);
	expect(fetch).toHaveBeenCalledTimes(2);
	fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
	await vi.advanceTimersByTimeAsync(1000);
	expect(linked.getSnapshot().status).toBe("error");
	expect(fetch).toHaveBeenCalledTimes(3);
	await vi.advanceTimersByTimeAsync(1000);
	expect(linked.getSnapshot().status).toBe("ready");
	expect(fetch).toHaveBeenCalledTimes(4);
	await linked.refresh();
	linked.cancel();
	await vi.advanceTimersByTimeAsync(10_000);
	expect(fetch).toHaveBeenCalledTimes(5);
	await linked.refresh();
	linked.dispose();
	await vi.advanceTimersByTimeAsync(10_000);
	expect(fetch).toHaveBeenCalledTimes(6);
});

test.each([
	{ label: "blank", content: " \n\t " },
	{ label: "oversized", content: "x".repeat(65_537) },
	{ label: "non-text", content: { text: "Review comment" } },
])(
	"rejects $label review text before posting saved drafts",
	async ({ content }) => {
		const { linked, fetch } = setup({
			getAccess: async () => ({ viewerId: "viewer", operations: ["review"] }),
		});
		await linked.refresh();
		await linked.updateReviewState({
			drafts: [{ id: "saved", content: "Saved comment" }],
		});
		const progress = linked.getSnapshot().reviewState;
		fetch.mockImplementationOnce(async (_url, options) =>
			Response.json({
				id: 1,
				status: "active",
				comments: [{ id: 1, ...JSON.parse(options.body).comments[0] }],
			}),
		);

		await expect(
			linked.mutate("review", { content, vote: 10 }),
		).rejects.toThrow("Enter valid text");
		expect(
			fetch.mock.calls.filter(([, options]) => options.method !== "GET"),
		).toHaveLength(0);
		expect(linked.getSnapshot().reviewState).toBe(progress);
	},
);

test("review submission removes confirmed drafts and rechecks grants before the next post", async () => {
	let access = { viewerId: "viewer", operations: ["review"] };
	const { linked, fetch } = setup({ getAccess: async () => access });
	await linked.refresh();
	await linked.updateReviewState({
		drafts: [
			{ id: "first", content: "First comment" },
			{ id: "second", content: "Second comment" },
		],
	});
	fetch.mockImplementationOnce(async (_url, options) => {
		access = null;
		return Response.json({
			id: 1,
			status: "active",
			comments: [{ id: 1, ...JSON.parse(options.body).comments[0] }],
		});
	});
	await expect(linked.mutate("review", {})).rejects.toThrow("not authorized");
	expect(
		fetch.mock.calls.filter(([, options]) => options.method === "POST"),
	).toHaveLength(1);
	expect(linked.getSnapshot().reviewState.drafts).toEqual([
		{ id: "second", content: "Second comment" },
	]);
});

test.each([
	{ preferences: "split" },
	{ drafts: null },
	{ viewed: false },
	{ accountId: "another" },
])(
	"rejects invalid review-state updates without changing saved progress: %j",
	async (input) => {
		const { linked } = setup();
		await linked.refresh();
		const progress = linked.getSnapshot().reviewState;
		await expect(linked.updateReviewState(input)).rejects.toThrow();
		expect(linked.getSnapshot().reviewState).toBe(progress);
	},
);

test("a refresh cannot overwrite review progress saved while its read is pending", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	const original = fetch.getMockImplementation();
	const late = Promise.withResolvers();
	fetch.mockImplementationOnce(() => late.promise);
	const refresh = linked.refresh();
	await Promise.resolve();
	await linked.updateReviewState({ preferences: { mode: "split" } });
	late.resolve(await original("", {}));
	await refresh;
	expect(linked.getSnapshot().reviewState.preferences.mode).toBe("split");
});

test("disposing a controller cancels a pending progress save without adopting its result", async () => {
	const late = Promise.withResolvers();
	const { linked } = setup({
		reviewStorage: { load: async () => null, save: () => late.promise },
	});
	await linked.refresh();
	const save = linked.updateReviewState({ preferences: { mode: "split" } });
	const cancelled = expect(save).rejects.toMatchObject({ name: "AbortError" });
	linked.dispose();
	await cancelled;
	late.resolve();
	expect(linked.getSnapshot().status).toBe("unavailable");
});

test("a delayed progress save cannot restore the source revision that a refresh replaced", async () => {
	const saved = Promise.withResolvers();
	const { linked, fetch } = setup({
		reviewStorage: { load: async () => null, save: () => saved.promise },
	});
	await linked.refresh();
	const original = fetch.getMockImplementation();
	const incoming = Promise.withResolvers();
	fetch.mockImplementationOnce(() => incoming.promise);
	const refresh = linked.refresh();
	await Promise.resolve();
	const save = linked.updateReviewState({ preferences: { mode: "split" } });
	const data = await (await original("", {})).json();
	incoming.resolve(
		Response.json({
			...data,
			lastMergeSourceCommit: { commitId: "b".repeat(40) },
		}),
	);
	await refresh;
	saved.resolve();
	await save;
	expect(linked.getSnapshot().reviewState).toMatchObject({
		preferences: { mode: "split" },
		sourceCommitId: "b".repeat(40),
	});
});

test("a failed first PR read does not discard restored review drafts", async () => {
	const restored = {
		...emptyReviewState(),
		drafts: [{ id: "saved", content: "Saved review" }],
	};
	const { linked, fetch } = setup({
		reviewStorage: { load: async () => restored, save: async () => {} },
	});
	fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
	await linked.refresh();
	expect(linked.getSnapshot().status).toBe("error");
	await linked.refresh();
	expect(linked.getSnapshot().reviewState.drafts).toEqual(restored.drafts);
});

test("a confirmed posted comment is not eligible for resubmission when saving progress fails", async () => {
	const storage = { load: async () => null, save: vi.fn(async () => {}) };
	const { linked, fetch } = setup({
		getAccess: async () => ({ viewerId: "viewer", operations: ["review"] }),
		reviewStorage: storage,
	});
	await linked.refresh();
	await linked.updateReviewState({
		drafts: [{ id: "posted", content: "Review comment" }],
	});
	storage.save.mockRejectedValueOnce(new Error("Storage failed"));
	fetch.mockImplementationOnce(async (_url, options) =>
		Response.json({
			id: 1,
			status: "active",
			comments: [{ id: 1, ...JSON.parse(options.body).comments[0] }],
		}),
	);
	await expect(linked.mutate("review", {})).rejects.toThrow("posted");
	expect(linked.getSnapshot().reviewState.drafts).toEqual([]);
	await linked.refresh();
	await expect(linked.mutate("review", {})).rejects.toThrow("Add a comment");
	expect(
		fetch.mock.calls.filter(([, options]) => options.method === "POST"),
	).toHaveLength(1);
});

test("revoking the grant during a prerequisite read prevents the actual remote write", async () => {
	const reviewerId = "77777777-7777-4777-8777-777777777777";
	let access = { viewerId: "viewer", operations: ["reviewer"] };
	const { linked, fetch } = setup({ getAccess: async () => access });
	await linked.refresh();
	const original = fetch.getMockImplementation();
	fetch.mockImplementation(async (url, options) => {
		if (
			new URL(String(url)).pathname.endsWith("/pullrequests/22") &&
			options.method === "GET"
		) {
			access = null;
			return original(url, options);
		}
		if (
			new URL(String(url)).pathname.endsWith("/pullrequests/22/reviewers") &&
			options.method === "POST"
		)
			return Response.json([
				{
					id: reviewerId,
					displayName: "Reviewer",
					vote: 0,
					isRequired: false,
				},
			]);
		return original(url, options);
	});
	await expect(
		linked.mutate("reviewer", { reviewerId, isRequired: false }),
	).rejects.toThrow("not authorized");
	expect(
		fetch.mock.calls.some(([, options]) => options.method === "POST"),
	).toBe(false);
});
