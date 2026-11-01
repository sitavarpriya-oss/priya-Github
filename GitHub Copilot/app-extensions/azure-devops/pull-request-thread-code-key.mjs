/** @param {import("./pull-requests.mjs").Thread} thread */
export function threadCodeKey(thread) {
	return JSON.stringify([
		thread.path ?? null,
		thread.threadContext ?? null,
		thread.pullRequestThreadContext ?? null,
	]);
}
