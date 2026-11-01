import { selectMergeMethod } from "@github/copilot-app";
import { requireEvidence } from "./agent-merge-reads.mjs";

export const MERGE_STRATEGY_POLICY = "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab";

export const MERGE_STRATEGIES = [
	{
		method: "noFastForward",
		setting: "allowNoFastForward",
		label: "Merge (no fast-forward)",
		description: "A non-linear history preserving all commits.",
	},
	{
		method: "squash",
		setting: "allowSquash",
		label: "Squash commit",
		description: "A linear history with a single commit on the target.",
	},
	{
		method: "rebase",
		setting: "allowRebase",
		label: "Rebase and fast-forward",
		description: "Rebase source commits onto target and fast-forward.",
	},
	{
		method: "rebaseMerge",
		setting: "allowRebaseMerge",
		label: "Semi-linear merge",
		description:
			"Rebase source commits onto target and create a two-parent merge.",
	},
];

const DEFAULT_METHOD_ORDER = [
	"squash",
	"noFastForward",
	"rebase",
	"rebaseMerge",
];

export function mergeStrategyPermission(settings, method) {
	if (!settings || typeof settings !== "object") return undefined;
	const legacy = Object.hasOwn(settings, "useSquashMerge");
	const modern = MERGE_STRATEGIES.some(({ setting }) =>
		Object.hasOwn(settings, setting),
	);
	if (legacy && modern) return undefined;
	if (legacy) {
		if (typeof settings.useSquashMerge !== "boolean") return undefined;
		return method === (settings.useSquashMerge ? "squash" : "noFastForward");
	}
	if (!modern) return undefined;
	const strategy = MERGE_STRATEGIES.find((item) => item.method === method);
	if (!strategy) return undefined;
	if (!Object.hasOwn(settings, strategy.setting)) return false;
	const value = settings[strategy.setting];
	return typeof value === "boolean" ? value : undefined;
}

export function required(configuration) {
	requireEvidence(
		Number.isSafeInteger(configuration?.id) &&
			configuration.id > 0 &&
			Number.isSafeInteger(configuration.revision) &&
			configuration.revision > 0 &&
			typeof configuration.isEnabled === "boolean" &&
			typeof configuration.isBlocking === "boolean",
	);
	return (
		configuration.isEnabled &&
		configuration.isBlocking &&
		configuration.isDeleted !== true
	);
}

export function mergeMethods(snapshot) {
	const policies = [
		...snapshot.policies,
		...snapshot.evaluations
			.filter((evaluation) => evaluation.status !== "notApplicable")
			.map((evaluation) => evaluation.configuration),
	].filter(
		(configuration) =>
			required(configuration) &&
			configuration.type?.id?.toLowerCase() === MERGE_STRATEGY_POLICY,
	);
	const unknown = policies.some((policy) =>
		MERGE_STRATEGIES.some(
			({ method }) =>
				mergeStrategyPermission(policy.settings, method) === undefined,
		),
	);
	const options = unknown
		? []
		: MERGE_STRATEGIES.filter(({ method }) =>
				policies.every(
					(policy) => mergeStrategyPermission(policy.settings, method) === true,
				),
			).map(({ method, label, description }) => ({
				method,
				label,
				description,
				contributionId: `complete-${method}`,
			}));
	const allowedMethods = new Set(options.map(({ method }) => method));
	return {
		unknown,
		options,
		defaultMethod:
			selectMergeMethod(
				DEFAULT_METHOD_ORDER.filter((method) => allowedMethods.has(method)),
				snapshot.raw.completionOptions?.mergeStrategy,
			) ?? null,
	};
}
