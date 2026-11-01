export const DELETE_SOURCE_BRANCH = "deleteSourceBranch";
export const COMPLETE_ASSOCIATED_WORK_ITEMS = "completeAssociatedWorkItems";

const supported = new Set([
	DELETE_SOURCE_BRANCH,
	COMPLETE_ASSOCIATED_WORK_ITEMS,
]);

export function postCompletionOptions() {
	return [
		{
			id: DELETE_SOURCE_BRANCH,
			label: "Delete source branch after merging",
		},
		{
			id: COMPLETE_ASSOCIATED_WORK_ITEMS,
			label: "Complete associated work items after merging",
		},
	];
}

export function parsePostCompletionOptions(value) {
	if (value === undefined) {
		return { deleteSourceBranch: false, transitionWorkItems: false };
	}
	if (!Array.isArray(value) || value.length > supported.size)
		throw new TypeError("Invalid post-completion options.");
	const selected = new Set();
	for (const option of value) {
		if (
			typeof option !== "string" ||
			!supported.has(option) ||
			selected.has(option)
		)
			throw new TypeError("Invalid post-completion options.");
		selected.add(option);
	}
	return {
		deleteSourceBranch: selected.has(DELETE_SOURCE_BRANCH),
		transitionWorkItems: selected.has(COMPLETE_ASSOCIATED_WORK_ITEMS),
	};
}
