import {
	evaluateMerge,
	guid,
	required,
	reviewComments,
} from "./agent-merge-policy.mjs";
import { requireEvidence } from "./agent-merge-reads.mjs";
import { postCompletionOptions } from "./completion-options.mjs";
import {
	MERGE_STRATEGY_POLICY,
	mergeMethods,
	mergeStrategyPermission,
} from "./merge-methods.mjs";

const REVIEW_POLICIES = new Set([
	"fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",
	"fd2167ab-b0be-447a-8ec8-39368250530e",
	"c6a1889d-b943-4856-b76f-9e46bb6b0df2",
]);

/** @type {Record<string, import("@github/copilot-app").PrMergeItem["status"]>} */
const POLICY_STATUS = {
	approved: "satisfied",
	notApplicable: "notApplicable",
	queued: "pending",
	running: "pending",
	rejected: "failed",
	broken: "failed",
};

function plainMarkdownText(value) {
	return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, "\\$&");
}

function discussionDescription(thread) {
	const parts = thread.path ? [plainMarkdownText(thread.path)] : [];
	for (const comment of reviewComments(thread)) {
		parts.push(
			`${plainMarkdownText(comment.author?.name ?? "Reviewer")}:\n\n${comment.content}`,
		);
	}
	return `Unresolved discussion:\n\n${Array.from(parts.join("\n\n")).slice(0, 500).join("")}`;
}

/** Display evidence only. Completion remains owned by evaluateMerge and its strict reads. */
export function mergeDetails(snapshot, evaluation = evaluateMerge(snapshot)) {
	const { raw, normalized, revision } = snapshot;
	const terminal = ["merged", "closed"].includes(normalized.state);
	const [label, status] = /** @type {const} */ ({
		ready: ["Ready for Agent merge", "satisfied"],
		blocked: ["Merge blocked", "failed"],
		unknown: ["Merge status unknown", "unknown"],
		merged: ["Pull request merged", "satisfied"],
		closed: ["Pull request closed", "notApplicable"],
	})[terminal ? normalized.state : evaluation.completion.status];
	/** @type {import("@github/copilot-app").PrMergeDetails} */
	const details = {
		revision,
		summary: terminal
			? `${label}.`
			: `${label}${evaluation.completion.reason ? `: ${evaluation.completion.reason}` : "."}`,
		merge: { status, total: 0, items: [] },
		reviews: { status: "notApplicable", total: 0, items: [] },
		checks: { status: "notApplicable", total: 0, items: [] },
	};
	if (terminal) return details;
	details.postCompletionOptions = postCompletionOptions();
	const methods = mergeMethods(snapshot);
	details.mergeMethods = {
		defaultMethod: methods.defaultMethod,
		options: methods.options,
	};

	details.merge.items.push(
		{
			id: "draft",
			status: normalized.state === "draft" ? "failed" : "satisfied",
			description:
				normalized.state === "draft"
					? "Draft: publish before completion."
					: "Ready for review: published.",
		},
		{
			id: "conflicts",
			status: evaluation.conflicts
				? "failed"
				: raw.mergeStatus === "succeeded"
					? "satisfied"
					: "unknown",
			description: evaluation.conflicts
				? "Merge conflicts: resolve using the current source and target branches."
				: raw.mergeStatus === "succeeded"
					? "No merge conflicts."
					: "Azure DevOps has not confirmed whether there are conflicts.",
		},
	);
	details.merge.items.push({
		id: "merge-strategy",
		status: methods.unknown
			? "unknown"
			: methods.options.length === 0
				? "failed"
				: "satisfied",
		description: methods.unknown
			? "Branch policy does not establish which merge strategies are allowed."
			: methods.options.length === 0
				? "Branch policy does not allow any supported merge strategy."
				: `Completion uses ${methods.options.find((option) => option.method === methods.defaultMethod).label.toLowerCase()} by default and does not bypass policies.`,
	});
	if (raw.autoCompleteSetBy || raw.completionQueueTime)
		details.merge.items.push({
			id: "completion",
			status: "pending",
			description:
				"Completion already requested: wait for Azure DevOps to confirm it.",
		});

	for (const item of snapshot.evaluations) {
		const config = item.configuration;
		if (!config.isEnabled || config.isDeleted === true) continue;
		const type = config.type?.id?.toLowerCase();
		const selectedMethod =
			type === MERGE_STRATEGY_POLICY &&
			item.status === "rejected" &&
			mergeStrategyPermission(config.settings, methods.defaultMethod) === true;
		const section =
			type === MERGE_STRATEGY_POLICY
				? details.merge
				: REVIEW_POLICIES.has(type)
					? details.reviews
					: details.checks;
		const name = String(
			config.settings?.displayName ||
				config.settings?.defaultDisplayName ||
				config.settings?.statusName ||
				item.context?.buildDefinitionName ||
				config.type?.displayName ||
				`Policy ${config.id}`,
		);
		section.items.push({
			id: `policy:${item.evaluationId}`,
			status:
				required(config) && !guid.test(type)
					? "unknown"
					: selectedMethod
						? "satisfied"
						: (POLICY_STATUS[item.status] ?? "unknown"),
			description: `${Array.from(name).slice(0, 120).join("")} (${required(config) ? "Required" : "Optional"})${
				selectedMethod ? ": the completion strategy is allowed." : ""
			}`,
		});
	}
	const reviewIds = new Set(evaluation.reviews.map((review) => review.id));
	const reviewThreads = snapshot.threads
		.filter((thread) => reviewIds.has(`thread:${thread.id}`))
		.sort((a, b) => `thread:${a.id}`.localeCompare(`thread:${b.id}`));
	for (const thread of reviewThreads) {
		const id = `thread:${thread.id}`;
		details.reviews.items.push({
			id,
			status: "pending",
			description: discussionDescription(thread),
		});
	}

	const sections = [details.merge, details.reviews, details.checks];
	for (const section of sections) {
		section.total = section.items.length;
		if (section !== details.merge)
			section.status =
				/** @type {const} */ ([
					"failed",
					"unknown",
					"pending",
					"satisfied",
				]).find((status) =>
					section.items.some((item) => item.status === status),
				) ?? "notApplicable";
		// Keep blockers first and the preview bounded. The PR view has the full list.
		section.items.sort(
			(a, b) =>
				Number(["satisfied", "notApplicable"].includes(a.status)) -
				Number(["satisfied", "notApplicable"].includes(b.status)),
		);
		section.items = section.items.slice(0, 20);
	}
	// Reserve room for the badge, review options, and merge-method actions.
	while (Buffer.byteLength(JSON.stringify(details), "utf8") > 9 * 1024) {
		const largest = sections.reduce((a, b) =>
			a.items.length >= b.items.length ? a : b,
		);
		requireEvidence(
			largest.items.length > 0,
			"Merge details exceed the display limit.",
		);
		largest.items.pop();
	}
	return details;
}
