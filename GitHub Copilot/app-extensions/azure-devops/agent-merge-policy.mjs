import { requireEvidence } from "./agent-merge-reads.mjs";
import { parsePostCompletionOptions } from "./completion-options.mjs";
import {
	MERGE_STRATEGY_POLICY,
	mergeMethods,
	mergeStrategyPermission,
	required,
} from "./merge-methods.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";
import { isActivityThread } from "./pull-request-thread-kind.mjs";

export { required } from "./merge-methods.mjs";

export const guid =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function reviewComments(thread) {
	if (isActivityThread(thread)) return [];
	return thread.comments.filter(
		(comment) => comment.commentType !== "codeChange",
	);
}

export function activeReviews(snapshot) {
	const items = [];
	for (const thread of snapshot.threads) {
		const comments = reviewComments(thread);
		if (!comments.length) continue;
		requireEvidence(
			thread.status !== "unknown",
			"A review thread has unknown resolution state.",
		);
		if (!["active", "pending"].includes(thread.status)) continue;
		items.push({
			id: `thread:${thread.id}`,
			summary: [
				...(thread.path ? [thread.path] : []),
				...comments.map(
					(comment) =>
						`${comment.author?.name ?? "Reviewer"}: ${comment.content}`,
				),
			].join("\n"),
		});
	}
	return items.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * ADO owns PR policy applicability, approval, and expiration.
 * @returns {{reviews: ReturnType<typeof activeReviews>, checks: Array<{id: string, summary: string, buildId: number | null, buildDefinitionId?: number}>, conflicts: boolean, completion: {status: "ready" | "blocked" | "unknown", reason: string | null}}}
 */
export function evaluateMerge(snapshot, requestedMethod) {
	const { raw, normalized, policies, evaluations } = snapshot;
	if (["merged", "closed"].includes(normalized.state))
		return {
			reviews: [],
			checks: [],
			conflicts: false,
			completion: {
				status: "blocked",
				reason: `Pull request is ${normalized.state}.`,
			},
		};
	const reviews = activeReviews(snapshot);
	const checks = [];
	const blocked = [];
	const unknown = [];
	const methods = mergeMethods(snapshot);
	const method = requestedMethod ?? methods.defaultMethod;
	const methodForbidden =
		!methods.unknown &&
		!methods.options.some((option) => option.method === method);
	if (methods.unknown)
		unknown.push(
			"Branch policy does not establish which merge strategies are allowed.",
		);
	else if (methodForbidden)
		blocked.push(
			requestedMethod
				? `Branch policy forbids ${requestedMethod} completion.`
				: "Branch policy does not allow any supported merge strategy.",
		);
	if (normalized.state === "draft") blocked.push("Pull request is a draft.");
	const conflicts = raw.mergeStatus === "conflicts";
	if (conflicts)
		blocked.push(
			"Resolve conflicts using the observed source and target refs.",
		);
	else if (
		raw.mergeStatus !== "succeeded" ||
		raw.lastMergeSourceCommit.commitId.toLowerCase() !==
			snapshot.revision.sourceCommit
	)
		unknown.push("Mergeability is not yet known.");
	if (raw.autoCompleteSetBy || raw.completionQueueTime)
		unknown.push(
			"A completion request is already queued; reconcile it before another write.",
		);
	if (reviews.length) blocked.push("Unresolved review feedback remains.");
	for (const config of policies) {
		if (!required(config)) continue;
		const type = config.type?.id?.toLowerCase();
		requireEvidence(
			guid.test(type),
			"Required branch policy has an unknown type.",
		);
	}
	const evaluatedConfigs = new Set();
	const evaluationIds = new Set();
	for (const evaluation of evaluations) {
		requireEvidence(
			typeof evaluation.evaluationId === "string" &&
				evaluation.evaluationId.length > 0 &&
				!evaluationIds.has(evaluation.evaluationId) &&
				typeof evaluation.artifactId === "string" &&
				decodeURIComponent(evaluation.artifactId).toLowerCase() ===
					`vstfs:///CodeReview/CodeReviewId/${raw.repository.project.id}/${normalized.id}`.toLowerCase(),
		);
		evaluationIds.add(evaluation.evaluationId);
		const config = evaluation.configuration;
		if (!required(config)) continue;
		requireEvidence(
			!evaluatedConfigs.has(config.id),
			"Ambiguous required policy evaluations.",
		);
		evaluatedConfigs.add(config.id);
		const type = config.type?.id?.toLowerCase();
		if (!guid.test(type)) {
			unknown.push("Required policy evaluation has an unknown type.");
			continue;
		}
		// Completion supplies the permitted method even if no method is selected remotely.
		if (
			type === MERGE_STRATEGY_POLICY &&
			evaluation.status === "rejected" &&
			mergeStrategyPermission(config.settings, method) === true
		)
			continue;
		if (["approved", "notApplicable"].includes(evaluation.status)) continue;
		if (["queued", "running"].includes(evaluation.status)) {
			blocked.push("Required policy evaluation is pending.");
			continue;
		}
		if (!["rejected", "broken"].includes(evaluation.status)) {
			unknown.push("Required policy evaluation is broken or unknown.");
			continue;
		}
		blocked.push("A required branch policy is not satisfied.");
		if (type === BUILD_POLICY) {
			const candidate = evaluation.context?.buildId;
			const buildId =
				Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
			const name =
				typeof config.type?.displayName === "string"
					? config.type.displayName.slice(0, 200)
					: `Policy ${config.id}`;
			checks.push({
				id: `policy:${config.id}${buildId === null ? "" : `:build:${buildId}`}`,
				summary: `${name}: ${evaluation.status}`,
				buildId,
				buildDefinitionId: config.settings?.buildDefinitionId,
			});
		}
	}
	return {
		reviews,
		checks: checks.sort((a, b) => a.id.localeCompare(b.id)),
		conflicts,
		completion: methodForbidden
			? {
					status: "blocked",
					reason: requestedMethod
						? `Branch policy forbids ${requestedMethod} completion.`
						: "Branch policy does not allow any supported merge strategy.",
				}
			: unknown.length
				? { status: "unknown", reason: unknown[0] }
				: blocked.length
					? { status: "blocked", reason: blocked[0] }
					: { status: "ready", reason: null },
	};
}

export async function completePullRequest(
	client,
	id,
	snapshot,
	requestedMethod,
	postCompletionOptions,
) {
	const method = requestedMethod ?? mergeMethods(snapshot).defaultMethod;
	const result = evaluateMerge(snapshot, method);
	requireEvidence(
		result.completion.status === "ready",
		result.completion.reason,
	);
	const { revision } = snapshot;
	const options = parsePostCompletionOptions(postCompletionOptions);
	const completed = await client.complete(id, {
		sourceCommitId: revision.sourceCommit,
		mergeStrategy: method,
		title: snapshot.normalized.title,
		description: snapshot.normalized.description,
		...options,
	});
	requireEvidence(
		completed.sourceCommitId === revision.sourceCommit &&
			completed.sourceRef === revision.sourceRef &&
			completed.targetRef === revision.targetRef &&
			["open", "merged"].includes(completed.state),
		"Completion acknowledgement does not match the attempted revision.",
	);
	return completed;
}
