/**
 * @typedef {{kind: "context" | "add" | "delete", text: string, originalLine: number | null, modifiedLine: number | null}} ThreadCodeRow
 * @typedef {{path: string, originalPath: string | null, baseCommitId: string, sourceCommitId: string, iterationId: number, rows: readonly Readonly<ThreadCodeRow>[], truncated: boolean}} ThreadCode
 */
import { createDiff } from "./assets/pull-request-diff.js";

const CONTEXT_LINES = 3;
const MAX_ROWS = 40;
const MAX_ROW_CHARACTERS = 1_000;
const MAX_PATH_CHARACTERS = 4_096;

/** Uses only the client's repository-bound readers, never response URLs or repositories. */
export function createThreadCodeReader({
	prPath,
	list,
	requestJson,
	readFile,
	readChangedFile,
	error,
}) {
	// One parent-owned signal identifies one visible-page batch, not a durable cache.
	const batches = new WeakMap();
	const readInBatch = (signal, key, load) => {
		if (!signal) return load();
		signal.throwIfAborted();
		let reads = batches.get(signal);
		if (!reads) {
			reads = new Map();
			batches.set(signal, reads);
			signal.addEventListener("abort", () => batches.delete(signal), {
				once: true,
			});
		}
		if (!reads.has(key)) reads.set(key, load());
		return reads.get(key);
	};
	const unavailable = () =>
		error(
			"thread-code-unavailable",
			"Azure DevOps thread code is unavailable for the recorded comparison.",
		);
	const positive = (value) => Number.isSafeInteger(value) && value > 0;
	const pathOf = (value) => {
		if (
			typeof value !== "string" ||
			!value.startsWith("/") ||
			value.includes("\0") ||
			value.length > MAX_PATH_CHARACTERS
		)
			throw unavailable();
		return value;
	};
	const commitOf = (value) => {
		if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value))
			throw unavailable();
		return value.toLowerCase();
	};
	const rangeOf = (start, end) => {
		if (start == null && end == null) return null;
		if (
			!positive(start?.line) ||
			!positive(end?.line) ||
			!Number.isSafeInteger(start.offset) ||
			start.offset < 0 ||
			!Number.isSafeInteger(end.offset) ||
			end.offset < 0 ||
			end.line < start.line ||
			(end.line === start.line && end.offset < start.offset)
		)
			throw unavailable();
		return { start: start.line, end: end.line };
	};

	/** @param {number} id @param {import("./pull-requests.mjs").Thread} thread @param {AbortSignal | undefined} signal @returns {Promise<ThreadCode>} */
	return async (id, thread, signal) => {
		const context = thread?.threadContext;
		const prContext = thread?.pullRequestThreadContext;
		const tracking = prContext?.trackingCriteria;
		const tracked = tracking?.firstComparingIteration > 0;
		const comparison = tracked ? tracking : prContext?.iterationContext;
		const first = comparison?.firstComparingIteration;
		const second = comparison?.secondComparingIteration;
		const trackingId = prContext?.changeTrackingId;
		if (
			!Number.isSafeInteger(first) ||
			first < 0 ||
			!positive(second) ||
			!positive(trackingId)
		)
			throw unavailable();
		// A zero tracking baseline records the original location; positive tracking
		// comparisons instead describe the current positions in that comparison.
		const location = (key) =>
			(tracked
				? undefined
				: tracking?.[`orig${key[0].toUpperCase()}${key.slice(1)}`]) ??
			context?.[key];
		const threadPath = pathOf(location("filePath"));
		const originalRange = rangeOf(
			location("leftFileStart"),
			location("leftFileEnd"),
		);
		const modifiedRange = rangeOf(
			location("rightFileStart"),
			location("rightFileEnd"),
		);
		if (!originalRange && !modifiedRange) throw unavailable();

		const iterations = new Map();
		const iterationValues = await readInBatch(signal, `iterations:${id}`, () =>
			list(`${prPath}/${id}/iterations`, signal),
		);
		for (const iteration of iterationValues) {
			if (!positive(iteration?.id) || iterations.has(iteration.id))
				throw unavailable();
			iterations.set(iteration.id, iteration);
		}
		const source = iterations.get(second);
		const compareTo = first !== second ? first : 0;
		const sourceCommitId = commitOf(source?.sourceRefCommit?.commitId);
		const baseCommitId = commitOf(
			compareTo > 0
				? iterations.get(first)?.sourceRefCommit?.commitId
				: source?.commonRefCommit?.commitId,
		);

		const files = await readInBatch(
			signal,
			`changes:${id}:${second}:${compareTo}`,
			async () => {
				const files = [];
				let skip = 0;
				let top = 100;
				for (;;) {
					const { data } = await requestJson(
						"GET",
						`${prPath}/${id}/iterations/${second}/changes`,
						undefined,
						signal,
						{
							$compareTo: String(compareTo),
							$skip: String(skip),
							$top: String(top),
						},
					);
					if (!Array.isArray(data?.changeEntries)) throw unavailable();
					files.push(...data.changeEntries.map(readChangedFile));
					if (data.nextSkip === undefined && data.nextTop === undefined) break;
					if (data.nextSkip === 0 && data.nextTop === 0) break;
					if (
						!positive(data.nextSkip) ||
						data.nextSkip <= skip ||
						!positive(data.nextTop) ||
						data.nextTop > 2_000
					)
						throw unavailable();
					skip = data.nextSkip;
					top = data.nextTop;
				}
				return files;
			},
		);
		const matches = files.filter(
			(file) => file.changeTrackingId === trackingId,
		);
		if (matches.length !== 1) throw unavailable();
		const [file] = matches;
		const path = pathOf(file.path);
		const originalPath =
			file.originalPath === null ? null : pathOf(file.originalPath);
		const types = file.changeType.split(", ");
		const added = types.includes("add");
		const deleted = types.includes("delete");
		const renamed = types.includes("rename");
		if (
			types.some(
				(type) =>
					!["add", "edit", "delete", "rename", "encoding"].includes(type),
			) ||
			(added && deleted) ||
			(renamed &&
				(!originalPath || originalPath === path || added || deleted)) ||
			(!renamed && originalPath !== null && originalPath !== path) ||
			(threadPath !== path && (!renamed || threadPath !== originalPath)) ||
			(added && originalRange) ||
			(deleted && modifiedRange)
		)
			throw unavailable();

		const readVersion = (path, commitId) =>
			readInBatch(signal, `file:${commitId}:${path}`, () =>
				readFile(path, commitId, signal),
			);
		const original = added
			? null
			: await readVersion(originalPath ?? path, baseCommitId);
		if (original?.binary) throw unavailable();
		const modified = deleted ? null : await readVersion(path, sourceCommitId);
		if (modified?.binary) throw unavailable();
		signal?.throwIfAborted();
		const diff = createDiff(original?.content, modified?.content);
		if (diff.status === "too-large")
			throw error(
				"too-large",
				"Azure DevOps thread comparison is too large or complex to display.",
			);
		if (
			(originalRange && originalRange.end > diff.originalLineCount) ||
			(modifiedRange && modifiedRange.end > diff.modifiedLineCount)
		)
			throw unavailable();
		const snippet = selectRows(
			diff.hunks.flatMap((hunk) => hunk.rows),
			originalRange,
			modifiedRange,
		);
		if (!snippet.rows.length) throw unavailable();
		signal?.throwIfAborted();
		return Object.freeze({
			path,
			originalPath,
			baseCommitId,
			sourceCommitId,
			iterationId: second,
			...snippet,
		});
	};
}

function selectRows(rows, originalRange, modifiedRange) {
	const inRange = (line, range) =>
		range && line !== null && line >= range.start && line <= range.end;
	const selected = rows.map(
		(row) =>
			!!inRange(row.originalLine, originalRange) ||
			!!inRange(row.modifiedLine, modifiedRange),
	);
	const windows = [];
	for (let index = 0; index < rows.length; index++) {
		if (!selected[index]) continue;
		let start = index;
		let end = index;
		while (selected[end + 1]) end++;
		// Keep both sides of a replacement together, not just the selected addition.
		if (rows[start].kind !== "context") {
			while (start > 0 && rows[start - 1].kind !== "context") start--;
		}
		if (rows[end].kind !== "context") {
			while (end + 1 < rows.length && rows[end + 1].kind !== "context") end++;
		}
		windows.push([
			Math.max(0, start - CONTEXT_LINES),
			Math.min(rows.length - 1, end + CONTEXT_LINES),
		]);
		index = end;
	}
	const wanted = new Set();
	for (const [start, end] of windows) {
		for (let index = start; index <= end; index++) wanted.add(index);
	}
	// Preserve the actual selection ahead of surrounding context when bounded.
	const anchors = [...wanted].filter((index) => selected[index]);
	const chosen = new Set(anchors.slice(0, MAX_ROWS));
	const limit = Math.min(wanted.size, MAX_ROWS);
	for (let distance = 1; chosen.size < limit; distance++) {
		for (const anchor of anchors) {
			for (const index of [anchor - distance, anchor + distance]) {
				if (wanted.has(index) && chosen.size < limit) chosen.add(index);
			}
		}
	}
	let truncated = wanted.size > MAX_ROWS;
	const result = [...chosen]
		.sort((a, b) => a - b)
		.map((index) => {
			const row = rows[index];
			if (row.text.length > MAX_ROW_CHARACTERS) truncated = true;
			return Object.freeze({
				kind: row.kind,
				text: row.text.slice(0, MAX_ROW_CHARACTERS),
				originalLine: row.originalLine,
				modifiedLine: row.modifiedLine,
			});
		});
	return { rows: Object.freeze(result), truncated };
}
