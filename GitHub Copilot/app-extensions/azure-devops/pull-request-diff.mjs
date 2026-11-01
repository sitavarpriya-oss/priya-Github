import { structuredPatch } from "diff";

const MAX_DIFF_CHARACTERS = 1_000_000;
const MAX_DIFF_LINES = 50_000;
const MAX_EDIT_LENGTH = 2_000;

function lineCount(text) {
	if (!text) return 0;
	let count = text.endsWith("\n") ? 0 : 1;
	for (let i = 0; i < text.length; i++) if (text[i] === "\n") count++;
	return count;
}

/**
 * Full-file diff by default, with 1-based source coordinates and stable local IDs.
 * null counts mean comparison was not attempted/completed, never zero changes.
 */
export function createDiff(
	original,
	modified,
	{ context = Infinity, ignoreWhitespace = false } = {},
) {
	const before = String(original ?? "");
	const after = String(modified ?? "");
	const result = {
		status: "too-large",
		hunks: [],
		additions: null,
		deletions: null,
		originalLineCount: lineCount(before),
		modifiedLineCount: lineCount(after),
	};
	if (
		before.length > MAX_DIFF_CHARACTERS ||
		after.length > MAX_DIFF_CHARACTERS ||
		result.originalLineCount > MAX_DIFF_LINES ||
		result.modifiedLineCount > MAX_DIFF_LINES
	)
		return result;
	const patch = structuredPatch(
		"original",
		"modified",
		before,
		after,
		undefined,
		undefined,
		{
			context:
				context === Infinity
					? Math.max(result.originalLineCount, result.modifiedLineCount)
					: Number.isFinite(context)
						? Math.max(0, Math.min(100, Math.floor(context)))
						: 3,
			ignoreWhitespace: ignoreWhitespace === true,
			stripTrailingCr: true,
			maxEditLength: MAX_EDIT_LENGTH,
		},
	);
	if (!patch) return result;
	result.status = patch.hunks.length
		? "changed"
		: before || after
			? "unchanged"
			: "empty";
	result.additions = 0;
	result.deletions = 0;
	const [beforeLines, afterLines] = [before, after].map((text) => {
		const lines = text.split(/\r?\n/);
		if (lines.at(-1) === "") lines.pop();
		return lines;
	});
	if (context === Infinity && result.status === "unchanged") {
		const lines = afterLines.map((line) => ` ${line}`);
		if (!after.endsWith("\n")) lines.push("\\ No newline at end of file");
		patch.hunks.push({
			oldStart: 1,
			oldLines: beforeLines.length,
			newStart: 1,
			newLines: afterLines.length,
			lines,
		});
	}
	result.hunks = patch.hunks.map((hunk, index) => {
		let originalLine = hunk.oldStart;
		let modifiedLine = hunk.newStart;
		const rows = [];
		for (const line of hunk.lines) {
			if (line.startsWith("\\")) {
				const previous = rows.at(-1);
				if (previous) {
					previous.originalNoNewline = previous.originalLine !== null;
					previous.modifiedNoNewline = previous.modifiedLine !== null;
				}
				continue;
			}
			const kind =
				line[0] === "+" ? "add" : line[0] === "-" ? "delete" : "context";
			if (kind === "add") result.additions++;
			if (kind === "delete") result.deletions++;
			const oldLine = kind === "add" ? null : originalLine++;
			const newLine = kind === "delete" ? null : modifiedLine++;
			const text =
				kind === "delete" ? beforeLines[oldLine - 1] : afterLines[newLine - 1];
			rows.push({
				id: `line-${oldLine ?? "none"}-${newLine ?? "none"}-${kind}`,
				kind,
				text,
				...(kind === "context" && beforeLines[oldLine - 1] !== text
					? { originalText: beforeLines[oldLine - 1] }
					: {}),
				originalLine: oldLine,
				modifiedLine: newLine,
				originalNoNewline: false,
				modifiedNoNewline: false,
			});
		}
		return {
			id: `hunk-${index + 1}`,
			originalStart: hunk.oldStart,
			originalLines: hunk.oldLines,
			modifiedStart: hunk.newStart,
			modifiedLines: hunk.newLines,
			rows,
		};
	});
	return result;
}
