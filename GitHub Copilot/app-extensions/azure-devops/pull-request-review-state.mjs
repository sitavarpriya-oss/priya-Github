import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @typedef {import("./pull-request-review-state-types.d.mts").ReviewAnchor} ReviewAnchor
 * @typedef {import("./pull-request-review-state-types.d.mts").ReviewDraft} ReviewDraft
 * @typedef {import("./pull-request-review-state-types.d.mts").ReviewPreferences} ReviewPreferences
 * @typedef {import("./pull-request-review-state-types.d.mts").ReviewState} ReviewState
 * @typedef {import("./pull-request-review-state-types.d.mts").ReviewStorage} ReviewStorage
 */

/** @returns {ReviewState} */
export function emptyReviewState() {
	return {
		viewed: [],
		drafts: [],
		preferences: { mode: "unified", ignoreWhitespace: false },
		sourceCommitId: null,
	};
}

/** @param {import("./linked-pull-request.mjs").LinkedBinding} binding */
export function reviewKey(binding) {
	const { organization, project, repositoryId, accountId } = binding.repository;
	return createHash("sha256")
		.update(
			JSON.stringify([
				organization,
				project,
				repositoryId,
				accountId,
				binding.pullRequestId,
			]),
		)
		.digest("hex");
}

/**
 * The owning adapter supplies a storage directory. The guest never supplies a
 * path, and this stores review progress, not app repository/account bindings.
 * @param {string} directory
 * @returns {ReviewStorage}
 */
export function createReviewStorage(directory) {
	/** @type {Map<string, Promise<void>>} */
	const pending = new Map();
	return {
		async load(key) {
			await pending.get(key);
			const path = join(directory, `${key}.json`);
			let contents;
			try {
				contents = await readFile(path, "utf8");
			} catch (error) {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				)
					return null;
				throw new Error("Could not read saved review progress.");
			}
			const saved = JSON.parse(contents);
			if (saved.version !== 1)
				throw new Error("Unsupported review progress version.");
			return normalizeReviewState(saved.state);
		},
		async save(key, state) {
			const previous = pending.get(key);
			/** @type {PromiseWithResolvers<void>} */
			const turn = Promise.withResolvers();
			pending.set(key, turn.promise);
			try {
				await previous;
				await mkdir(directory, { recursive: true });
				const path = join(directory, `${key}.json`);
				const temporary = `${path}.${randomUUID()}.tmp`;
				await writeFile(temporary, JSON.stringify({ version: 1, state }), {
					mode: 0o600,
				});
				await rename(temporary, path);
			} finally {
				turn.resolve();
				if (pending.get(key) === turn.promise) pending.delete(key);
			}
		},
	};
}

/** @param {unknown} value @returns {ReviewState} */
export function normalizeReviewState(value) {
	if (!value || typeof value !== "object")
		throw new TypeError("Invalid review progress.");
	const state = /** @type {Record<string, unknown>} */ (value);
	if (
		!Array.isArray(state.viewed) ||
		!Array.isArray(state.drafts) ||
		state.viewed.length > 10_000 ||
		state.drafts.length > 100 ||
		!state.viewed.every(
			(path) => typeof path === "string" && path.startsWith("/"),
		)
	)
		throw new TypeError("Invalid review progress.");
	const preferences = state.preferences;
	if (
		!preferences ||
		typeof preferences !== "object" ||
		!("mode" in preferences) ||
		!["unified", "split"].includes(String(preferences.mode)) ||
		!("ignoreWhitespace" in preferences) ||
		typeof preferences.ignoreWhitespace !== "boolean"
	)
		throw new TypeError("Invalid review preferences.");
	const drafts = state.drafts.map((draft) => {
		if (
			!draft ||
			typeof draft !== "object" ||
			typeof draft.id !== "string" ||
			draft.id.length > 100 ||
			!draft.id ||
			typeof draft.content !== "string" ||
			!draft.content.trim() ||
			draft.content.length > 65_536
		)
			throw new TypeError("Invalid review draft.");
		return {
			id: draft.id,
			content: draft.content,
			...(draft.anchor ? { anchor: normalizeAnchor(draft.anchor) } : {}),
		};
	});
	if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length)
		throw new TypeError("Duplicate review draft.");
	return {
		viewed: [...new Set(state.viewed)],
		drafts,
		sourceCommitId:
			typeof state.sourceCommitId === "string" &&
			/^[a-f0-9]{40}$/i.test(state.sourceCommitId)
				? state.sourceCommitId
				: null,
		preferences: {
			mode: preferences.mode === "split" ? "split" : "unified",
			ignoreWhitespace: preferences.ignoreWhitespace,
		},
	};
}

/** @param {unknown} value @returns {ReviewAnchor} */
export function normalizeAnchor(value) {
	if (!value || typeof value !== "object")
		throw new TypeError("Invalid review anchor.");
	const anchor = /** @type {Record<string, unknown>} */ (value);
	if (
		typeof anchor.path !== "string" ||
		!anchor.path.startsWith("/") ||
		!["original", "modified"].includes(String(anchor.side)) ||
		!Number.isSafeInteger(anchor.startLine) ||
		Number(anchor.startLine) < 1 ||
		!Number.isSafeInteger(anchor.endLine) ||
		Number(anchor.endLine) < Number(anchor.startLine) ||
		!Number.isSafeInteger(anchor.iterationId) ||
		Number(anchor.iterationId) < 1 ||
		!Number.isSafeInteger(anchor.changeTrackingId) ||
		Number(anchor.changeTrackingId) < 1 ||
		typeof anchor.sourceCommitId !== "string" ||
		!/^[a-f0-9]{40}$/i.test(anchor.sourceCommitId) ||
		typeof anchor.baseCommitId !== "string" ||
		!/^[a-f0-9]{40}$/i.test(anchor.baseCommitId)
	)
		throw new TypeError("Invalid review anchor.");
	return {
		path: anchor.path,
		side: anchor.side === "original" ? "original" : "modified",
		startLine: Number(anchor.startLine),
		endLine: Number(anchor.endLine),
		sourceCommitId: anchor.sourceCommitId,
		baseCommitId: anchor.baseCommitId,
		iterationId: Number(anchor.iterationId),
		changeTrackingId: Number(anchor.changeTrackingId),
	};
}
