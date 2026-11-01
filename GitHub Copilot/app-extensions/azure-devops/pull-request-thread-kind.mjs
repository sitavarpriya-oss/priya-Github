/**
 * ADO event threads (votes, pushes, policy status) set CodeReviewThreadType and
 * have no status. Bots such as Breeze post review threads with system comments,
 * a status, and no thread type.
 * @param {import("./pull-requests.mjs").Thread} thread
 */
export function isActivityThread(thread) {
	const hasUserComment = thread.comments.some(
		(comment) =>
			comment.commentType === "text" || comment.commentType === "codeChange",
	);
	return (
		!hasUserComment &&
		(Boolean(thread.activityType) ||
			(thread.status === "unknown" &&
				thread.comments.some((comment) => comment.commentType === "system")))
	);
}
