export type Resource<T> = Readonly<{
	status: "idle" | "loading" | "ready" | "error" | "cancelled";
	data: T | null;
	error: string | null;
}>;

export type ThreadCodeResult = {
	threadId: number;
	key: string;
	preview: import("./pull-request-thread-code.mjs").ThreadCode | null;
	error: string | null;
};

export type CompletionReadiness = Readonly<{
	revision: ReturnType<typeof import("./agent-merge-reads.mjs").revisionOf>;
	completion: ReturnType<
		typeof import("./agent-merge-policy.mjs").evaluateMerge
	>["completion"];
}>;

export type CompletionMethods = {
	defaultMethod: string | null;
	options: { method: string; label: string }[];
	error: string | null;
};

export interface Snapshot {
	revision: number;
	bindingRevision: number;
	changesRevision: number;
	status: "unavailable" | "idle" | "loading" | "ready" | "error" | "cancelled";
	pullRequest: Readonly<import("./pull-requests.mjs").PullRequest> | null;
	updatedAt: string | null;
	error: string | null;
	overview: Resource<
		import("./pull-requests.mjs").Overview & {
			mergeMethods?: CompletionMethods;
		}
	>;
	completion: Resource<CompletionReadiness>;
	changes: Resource<import("./pull-requests.mjs").ChangeSet>;
	fileDiff: Resource<import("./pull-requests.mjs").FileDiff>;
	threadCode: Resource<ThreadCodeResult[]>;
	selectedFile: number | null;
	access: { viewerId: string; operations: string[] } | null;
	accessError: string | null;
	reviewState: import("./pull-request-review-state-types.d.mts").ReviewState;
	mutation: {
		status: "idle" | "loading" | "ready" | "error";
		error: string | null;
		message?: string;
	};
	selectedCommitId: string | null;
}
