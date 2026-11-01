export type ReviewAnchor = {
	path: string;
	side: "original" | "modified";
	startLine: number;
	endLine: number;
	sourceCommitId: string;
	baseCommitId: string;
	iterationId: number;
	changeTrackingId: number;
};

export type ReviewDraft = {
	id: string;
	content: string;
	anchor?: ReviewAnchor;
};

export type ReviewPreferences = {
	mode: "unified" | "split";
	ignoreWhitespace: boolean;
};

export type ReviewState = {
	viewed: string[];
	drafts: ReviewDraft[];
	preferences: ReviewPreferences;
	sourceCommitId: string | null;
};

export type ReviewStorage = {
	load(key: string): Promise<ReviewState | null>;
	save(key: string, state: ReviewState): Promise<void>;
};
