import { evaluateMerge } from "./agent-merge-policy.mjs";
import { sameSourceRevision } from "./agent-merge-reads.mjs";
import { normalizeAnchor } from "./pull-request-review-state.mjs";
import { isActivityThread } from "./pull-request-thread-kind.mjs";

export class PullRequestActionError extends Error {}

/**
 * Dispatch only provider operations on the fixed, app-selected PR. Authorization
 * is supplied and rechecked by the controller; input never selects a binding.
 * @param {{client: ReturnType<typeof import("./pull-requests.mjs").createPullRequestClient>, id: number, snapshot: import("./linked-pull-request.mjs").Snapshot, operation: string, input: unknown, viewerId: string, signal: AbortSignal, draftPosted(id: string): Promise<void>}} context
 */
export async function executeMutation(context) {
	const { client, id, snapshot, operation, viewerId, signal, draftPosted } =
		context;
	const input = object(context.input);
	const options = { signal };
	const current = snapshot.pullRequest;
	if (!current)
		throw new PullRequestActionError("Load the pull request first.");
	if (operation === "edit") {
		const edit = {
			...(input.title !== undefined ? { title: text(input.title) } : {}),
			...(input.description !== undefined
				? { description: text(input.description, true) }
				: {}),
		};
		if (!Object.keys(edit).length)
			throw new PullRequestActionError("Enter a title or description.");
		return client.update(id, edit, options);
	}
	if (operation === "comment") {
		const anchor = input.anchor ? normalizeAnchor(input.anchor) : undefined;
		if (anchor) await validateAnchors(context, [anchor]);
		return client.createThread(
			id,
			{ content: text(input.content), ...(anchor ? { anchor } : {}) },
			options,
		);
	}
	if (
		operation === "reply" ||
		operation === "edit-comment" ||
		operation === "delete-comment" ||
		operation === "thread-status"
	) {
		const threadId = integer(input.threadId);
		const thread = snapshot.overview.data?.threads.find(
			(item) => item.id === threadId,
		);
		if (!thread)
			throw new PullRequestActionError(
				"Select a thread from the loaded Overview.",
			);
		if (isActivityThread(thread))
			throw new PullRequestActionError("Activity entries are read-only.");
		if (operation === "reply")
			return client.reply(id, threadId, text(input.content), options);
		if (operation === "thread-status")
			return client.setThreadStatus(
				id,
				threadId,
				threadStatus(input.status),
				options,
			);
		const commentId = integer(input.commentId);
		if (
			!thread.comments.some(
				(comment) =>
					comment.id === commentId && comment.author?.id === viewerId,
			)
		)
			throw new PullRequestActionError(
				"Only your own loaded comments can be edited or deleted.",
			);
		if (operation === "delete-comment")
			return client.deleteComment(id, threadId, commentId, options);
		return client.editComment(
			id,
			threadId,
			commentId,
			text(input.content),
			options,
		);
	}
	if (operation === "vote") {
		if (current.state !== "open")
			throw new PullRequestActionError(
				"This action is not available in the current pull request state.",
			);
		return client.vote(id, viewerId, vote(input.vote), options);
	}
	if (operation === "reviewer") {
		if (!["open", "draft"].includes(current.state))
			throw new PullRequestActionError(
				"This action is not available in the current pull request state.",
			);
		const reviewer = text(input.reviewerId);
		const requireActivePullRequest = async () => {
			const fresh = await client.get(id, options);
			if (!["open", "draft"].includes(fresh.state))
				throw new PullRequestActionError(
					"The pull request changed. Refresh before you continue.",
				);
		};
		if (input.remove === true) {
			if (
				!snapshot.overview.data?.reviewers.some(
					(candidate) => candidate.id === reviewer,
				)
			)
				throw new PullRequestActionError(
					"Select a reviewer from the loaded Overview.",
				);
			await requireActivePullRequest();
			return client.setReviewer(id, reviewer, null, options);
		}
		if (input.isRequired === true)
			throw new PullRequestActionError(
				"Adding required reviewers is not available.",
			);
		const reviewerId = await client.resolveReviewer(reviewer, options);
		const existing = snapshot.overview.data?.reviewers.find(
			(candidate) => candidate.id === reviewerId,
		);
		if (existing?.isRequired)
			throw new PullRequestActionError(
				"Changing existing reviewer roles is not available.",
			);
		await requireActivePullRequest();
		return client.setReviewer(id, reviewerId, { isRequired: false }, options);
	}
	if (operation === "draft") {
		if (typeof input.draft !== "boolean")
			throw new PullRequestActionError("Select draft or ready for review.");
		const draft = input.draft;
		if (
			(draft && current.state !== "open") ||
			(!draft && current.state !== "draft")
		)
			throw new PullRequestActionError(
				"This action is not available in the current pull request state.",
			);
		return client.update(id, { draft }, options);
	}
	if (["complete", "abandon", "reactivate"].includes(operation)) {
		if (input.confirm !== true)
			throw new PullRequestActionError("Confirm this pull request action.");
		if (
			(operation === "complete" && current.state !== "open") ||
			(operation === "reactivate" && current.state !== "closed") ||
			(operation === "abandon" && !["open", "draft"].includes(current.state))
		)
			throw new PullRequestActionError(
				"This action is not available in the current pull request state.",
			);
		if (operation === "complete") {
			const strategy = input.mergeStrategy;
			if (
				!["noFastForward", "squash", "rebase", "rebaseMerge"].includes(
					String(strategy),
				) ||
				!current.sourceCommitId
			)
				throw new PullRequestActionError(
					"Select a supported merge strategy and refresh the source commit.",
				);
			let evidence;
			try {
				evidence = await client.getAgentMergeEvidence(id, { signal });
			} catch {
				signal.throwIfAborted();
				throw new PullRequestActionError(
					"Completion readiness could not be confirmed. Refresh and try again.",
				);
			}
			if (
				evidence.normalized.state !== current.state ||
				!sameSourceRevision(
					{
						sourceRef: current.sourceRef,
						targetRef: current.targetRef,
						sourceCommit: current.sourceCommitId.toLowerCase(),
					},
					evidence.revision,
				)
			)
				throw new PullRequestActionError(
					"The pull request changed. Refresh before you continue.",
				);
			let completion;
			try {
				completion = evaluateMerge(evidence, strategy).completion;
			} catch {
				throw new PullRequestActionError(
					"Completion readiness could not be confirmed. Refresh and try again.",
				);
			}
			if (completion.status !== "ready")
				throw new PullRequestActionError(
					completion.reason ??
						"Complete is not available until required policies and checks pass.",
				);
			return client.complete(
				id,
				{
					sourceCommitId: evidence.revision.sourceCommit,
					title: evidence.normalized.title,
					description: evidence.normalized.description,
					mergeStrategy:
						/** @type {import("./pull-requests.mjs").MergeStrategy} */ (
							strategy
						),
					deleteSourceBranch: input.deleteSourceBranch === true,
				},
				options,
			);
		}
		const fresh = await client.get(id, options);
		if (
			fresh.state !== current.state ||
			fresh.sourceCommitId !== current.sourceCommitId
		)
			throw new PullRequestActionError(
				"The pull request changed. Refresh before you continue.",
			);
		if (operation === "abandon") return client.abandon(id, options);
		if (operation === "reactivate")
			return client.update(id, { status: "active" }, options);
	}
	if (operation === "build-retry" || operation === "build-cancel") {
		const buildId = integer(input.buildId);
		if (
			!snapshot.overview.data?.policies.some(
				(policy) => policy.buildId === buildId,
			)
		)
			throw new PullRequestActionError(
				"Select a build from the loaded checks.",
			);
		return operation === "build-retry"
			? client.retryBuild(buildId, options)
			: client.cancelBuild(buildId, options);
	}
	if (operation === "review") {
		const drafts = snapshot.reviewState.drafts;
		const content = input.content ? text(input.content) : undefined;
		const reviewVote = input.vote !== undefined ? vote(input.vote) : undefined;
		if (!drafts.length && !content && reviewVote === undefined)
			throw new PullRequestActionError("Add a comment or review vote.");
		const anchors = drafts.flatMap((draft) =>
			draft.anchor ? [draft.anchor] : [],
		);
		if (anchors.length) await validateAnchors(context, anchors);
		// ADO has no atomic review submission. Remove each confirmed post before
		// sending the next one, and retain everything not confirmed on failure.
		for (const draft of drafts) {
			await client.createThread(
				id,
				{
					content: draft.content,
					...(draft.anchor ? { anchor: draft.anchor } : {}),
				},
				options,
			);
			signal.throwIfAborted();
			await draftPosted(draft.id);
		}
		if (content) await client.createThread(id, { content }, options);
		if (reviewVote !== undefined)
			await client.vote(id, viewerId, reviewVote, options);
		return;
	}
	throw new PullRequestActionError(
		"This pull request action is not supported.",
	);
}

/**
 * @param {Parameters<typeof executeMutation>[0]} context
 * @param {import("./pull-request-review-state.mjs").ReviewAnchor[]} anchors
 */
async function validateAnchors({ client, id, snapshot, signal }, anchors) {
	if (snapshot.selectedCommitId)
		throw new PullRequestActionError(
			"Return to all changes before posting inline comments.",
		);
	const fresh = await client.getChanges(id, { signal });
	for (const anchor of anchors) {
		const file = fresh.files.find((item) => item.path === anchor.path);
		if (
			fresh.sourceCommitId !== anchor.sourceCommitId ||
			fresh.baseCommitId !== anchor.baseCommitId ||
			fresh.iterationId !== anchor.iterationId ||
			file?.changeTrackingId !== anchor.changeTrackingId
		)
			throw new PullRequestActionError(
				"A review draft refers to old changes. Refresh and update its line selection.",
			);
	}
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new PullRequestActionError("Invalid action input.");
	return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {boolean} [allowEmpty] */
function text(value, allowEmpty = false) {
	if (
		typeof value !== "string" ||
		(!allowEmpty && !value.trim()) ||
		value.length > 65_536
	)
		throw new PullRequestActionError("Enter valid text for this action.");
	return value;
}
/** @param {unknown} value */
function integer(value) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
		throw new PullRequestActionError(
			"Select an item from the current pull request.",
		);
	return value;
}
/** @param {unknown} value */
function vote(value) {
	switch (value) {
		case 10:
		case 5:
		case 0:
		case -5:
		case -10:
			return value;
		default:
			throw new PullRequestActionError("Select a supported review vote.");
	}
}

/** @param {unknown} value */
function threadStatus(value) {
	switch (value) {
		case "active":
		case "fixed":
		case "wontFix":
		case "closed":
		case "byDesign":
		case "pending":
			return value;
		default:
			throw new PullRequestActionError("Select a supported thread status.");
	}
}
