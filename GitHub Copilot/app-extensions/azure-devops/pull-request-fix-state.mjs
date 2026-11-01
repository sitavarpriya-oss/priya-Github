import { isActivityThread } from "./pull-request-thread-kind.mjs";

export const BUILD_POLICY = "0609b952-1397-4640-95ec-e00a01b2c241";

function sameName(left, right) {
	return (
		typeof left === "string" &&
		typeof right === "string" &&
		left.localeCompare(right, undefined, { sensitivity: "base" }) === 0
	);
}

export function policyMatchesStatus(policy, status) {
	if (policy.buildId && status.buildId)
		return policy.buildId === status.buildId;
	if (!policy.statusName) return false;
	return (
		sameName(policy.statusName, status.name) &&
		(!policy.statusGenre || sameName(policy.statusGenre, status.genre))
	);
}

export function manualFixComment(thread) {
	return (
		thread.comments.find(
			(comment) =>
				comment.content.trim() &&
				[undefined, "text", "system"].includes(comment.commentType),
		) ?? null
	);
}

export function manualFixThreads(data) {
	return (
		data?.threads.filter(
			(thread) =>
				!isActivityThread(thread) &&
				["active", "pending"].includes(thread.status) &&
				manualFixComment(thread),
		) ?? []
	);
}

export function hasUnknownManualFixThreads(data) {
	return (
		data?.threads.some(
			(thread) =>
				!isActivityThread(thread) &&
				thread.status === "unknown" &&
				manualFixComment(thread),
		) === true
	);
}

export function hasFailedRequiredChecks(data) {
	return (data?.policies ?? []).some(
		(policy) =>
			policy.isEnabled &&
			policy.isBlocking &&
			policy.typeId === BUILD_POLICY &&
			["rejected", "broken"].includes(policy.status),
	);
}
