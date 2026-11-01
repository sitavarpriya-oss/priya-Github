import {
	languageFromPath,
	renderCodeLines,
} from "./assets/pull-request-renderers.js";
import { inactive, node } from "./pull-request-actions.mjs";
import { threadCodeKey } from "./pull-request-thread-code-key.mjs";

export function hasThreadCode(thread) {
	const context = thread.threadContext;
	return Boolean(
		(thread.path ?? context?.filePath) &&
			(context?.rightFileStart?.line ||
				context?.leftFileStart?.line ||
				thread.anchor?.startLine),
	);
}

// Slots update independently of discussion cards so incoming code cannot
// replace a reply/edit form, its selection, or its keyboard focus.
export function createThreadCodeView({
	getSnapshot,
	getSignal,
	instanceId,
	onUnavailable,
}) {
	const slots = new Map();
	const visible = new Set();
	const cached = new Map();
	let indexedThreads;
	let threadsById = new Map();
	let pageThreads = [];
	let pageContext = "";
	let requested = "";
	let requestedIds = new Set();
	let generation = 0;
	let pending = false;
	let started = false;
	let error = null;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const id = Number(entry.target.getAttribute("data-thread-id"));
				if (slots.get(id)?.host !== entry.target) continue;
				if (entry.isIntersecting) visible.add(id);
				else visible.delete(id);
			}
			loadVisible();
		},
		{ root: document.getElementById("details"), rootMargin: "240px" },
	);

	function threadIndex() {
		const threads = getSnapshot().overview.data?.threads;
		if (threads !== indexedThreads) {
			indexedThreads = threads;
			threadsById = new Map(
				(threads ?? []).map((thread) => [thread.id, thread]),
			);
		}
		return threadsById;
	}

	function selection() {
		const threads = threadIndex();
		return pageThreads
			.map((id) => threads.get(id))
			.filter(
				(thread) => thread && visible.has(thread.id) && hasThreadCode(thread),
			)
			.filter((thread) => cached.get(thread.id)?.key !== threadCodeKey(thread))
			.slice(0, 10);
	}

	function fingerprint(threads) {
		return JSON.stringify([
			getSnapshot().bindingRevision,
			pageContext,
			threads.map((thread) => [thread.id, threadCodeKey(thread)]),
		]);
	}

	function loadVisible() {
		if (
			pending ||
			getSnapshot().threadCode?.status === "loading" ||
			getSignal().aborted
		)
			return;
		const threads = selection();
		if (threads.length && fingerprint(threads) !== requested)
			void request(false, threads);
	}

	async function request(userAction = false, threads = selection()) {
		const token = ++generation;
		const binding = getSnapshot().bindingRevision;
		const key = fingerprint(threads);
		requested = key;
		requestedIds = new Set(threads.map((thread) => thread.id));
		pending = true;
		started = false;
		error = null;
		render();
		try {
			const response = await fetch(`/load-thread-code/${instanceId}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Canvas-Binding": String(binding),
					...(userAction ? { "X-Canvas-User-Action": "retry" } : {}),
				},
				body: JSON.stringify({
					threadIds: threads.map((thread) => thread.id),
				}),
				signal: getSignal(),
			});
			if (token !== generation || binding !== getSnapshot().bindingRevision)
				return;
			if (response.status === 403 || response.status === 404)
				return onUnavailable();
			if (response.status === 409)
				error = "The pull request changed. Retry after it refreshes.";
			else if (!response.ok)
				error = "The code preview request could not start. Try again.";
		} catch {
			if (token === generation && !getSignal().aborted)
				error = "The code preview request could not start. Try again.";
		} finally {
			if (token === generation) {
				pending = false;
				render();
			}
		}
	}

	function render() {
		const snapshot = getSnapshot();
		const threads = threadIndex();
		const resource = snapshot.threadCode ?? {
			status: "idle",
			data: null,
			error: null,
		};
		if (resource.status === "loading") started = true;
		else if (started) pending = false;
		for (const result of resource.data ?? [])
			cached.set(result.threadId, result);
		for (const [id, slot] of slots) {
			if (!slot.host.isConnected) {
				observer.unobserve(slot.host);
				visible.delete(id);
				slots.delete(id);
				continue;
			}
			const thread = threads.get(id);
			if (!thread || !hasThreadCode(thread)) {
				slot.host.hidden = true;
				slot.code.replaceChildren();
				slot.rendered = null;
				continue;
			}
			slot.host.hidden = false;
			const key = thread ? threadCodeKey(thread) : null;
			const stored = cached.get(id);
			const result = stored?.key === key ? stored : null;
			const preview = result?.preview;
			const selected = requestedIds.has(id);
			const loading = selected && (pending || resource.status === "loading");
			const cancelled = selected && resource.status === "cancelled";
			const failure =
				(selected ? error : null) ??
				(cancelled
					? null
					: (result?.error ?? (selected ? resource.error : null)));
			const message = loading
				? `Loading code preview...${preview ? " Showing last known code." : ""}`
				: failure
					? `Code preview unavailable: ${failure}${preview ? " Showing last known code." : ""}`
					: cancelled
						? `Code preview cancelled.${preview ? " Showing last known code." : ""} Retry to load it again.`
						: resource.status === "idle" && preview
							? "Code preview has not been refreshed. Showing last known code. Retry to load it."
							: !preview
								? "Code preview unavailable: it has not been loaded. Retry to load it."
								: "";
			const retryFocused = document.activeElement === slot.retry && !message;
			slot.status.textContent = message;
			slot.status.hidden = !message;
			slot.retry.hidden = !message;
			inactive(slot.retry, loading);
			const serialized = JSON.stringify([key, preview]);
			if (serialized === slot.rendered) {
				if (retryFocused) slot.code.querySelector('[tabindex="0"]')?.focus();
				continue;
			}
			slot.rendered = serialized;
			const hadFocus = slot.code.contains(document.activeElement);
			slot.code.replaceChildren();
			const line =
				thread?.anchor?.startLine ??
				thread?.threadContext?.rightFileStart?.line ??
				thread?.threadContext?.leftFileStart?.line;
			// Tracking can relocate the current comment. Label the returned
			// recorded rows rather than borrowing a line from that newer location.
			const recordedLines =
				preview && thread.pullRequestThreadContext?.trackingCriteria
					? ["original", "modified"]
							.flatMap((side) => {
								const lines = preview.rows
									.map((row) => row[`${side}Line`])
									.filter(Number.isInteger);
								return lines.length
									? [
											`${side === "original" ? "Original" : "Modified"} lines ${Math.min(...lines)}–${Math.max(...lines)}`,
										]
									: [];
							})
							.join(" · ")
					: "";
			slot.path.textContent = `${preview?.path ?? thread?.path ?? ""}${recordedLines ? ` · Preview coverage: ${recordedLines}` : line ? `:${line}` : ""}`;
			if (preview) {
				slot.code.append(
					node(
						"p",
						`${preview.originalPath && preview.originalPath !== preview.path ? `Previously ${preview.originalPath} · ` : ""}Iteration ${preview.iterationId} · Base ${preview.baseCommitId.slice(0, 8)} · Source ${preview.sourceCommitId.slice(0, 8)}`,
						"thread-code-version",
					),
				);
				const scroll = node("div", "", "thread-code-scroll");
				scroll.dataset.action = "thread-code";
				scroll.tabIndex = 0;
				scroll.dataset.selectable = "true";
				scroll.setAttribute("role", "region");
				scroll.setAttribute(
					"aria-label",
					`Code preview for ${preview.path}, thread ${id}`,
				);
				const table = node("div", "", "thread-code-table");
				table.setAttribute("role", "table");
				table.setAttribute("aria-label", `Code diff for ${preview.path}`);
				const codeCells = [];
				for (const line of preview.rows) {
					const row = node("div", "", "thread-code-row");
					row.dataset.kind = line.kind;
					row.setAttribute("role", "row");
					const label =
						line.kind === "add"
							? `Added modified line ${line.modifiedLine}`
							: line.kind === "delete"
								? `Deleted original line ${line.originalLine}`
								: `Context original line ${line.originalLine ?? "none"}, modified line ${line.modifiedLine ?? "none"}`;
					row.setAttribute("aria-label", label);
					for (const value of [line.originalLine, line.modifiedLine]) {
						const cell = node(
							"span",
							value == null ? "" : String(value),
							"thread-code-line",
						);
						cell.setAttribute("role", "cell");
						row.append(cell);
					}
					const sign = node(
						"span",
						line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ",
						"thread-code-sign",
					);
					sign.setAttribute("role", "cell");
					const code = node("code", line.text, "thread-code-text");
					code.setAttribute("role", "cell");
					codeCells.push(code);
					row.append(sign, code);
					table.append(row);
				}
				renderCodeLines(
					codeCells,
					preview.rows,
					languageFromPath(preview.path),
				);
				scroll.append(table);
				slot.code.append(scroll);
				if (preview.truncated)
					slot.code.append(
						node(
							"p",
							"Code preview truncated. Only the nearby discussion context is shown.",
							"thread-code-note",
						),
					);
			}
			if (hadFocus || retryFocused)
				(slot.code.querySelector('[tabindex="0"]') ?? slot.status).focus();
		}
	}

	return {
		mount(thread, path) {
			const previous = slots.get(thread.id);
			if (previous) observer.unobserve(previous.host);
			visible.delete(thread.id);
			const host = node("div", "", "thread-code");
			host.dataset.threadId = String(thread.id);
			const code = node("div");
			code.dataset.selectable = "true";
			const status = node("p", "", "thread-code-note");
			status.tabIndex = -1;
			status.dataset.selectable = "true";
			const retry = node("button", "Retry code preview", "thread-code-retry");
			retry.dataset.action = "retry-thread-code";
			retry.type = "button";
			retry.addEventListener("click", () => {
				if (retry.getAttribute("aria-disabled") !== "true")
					void request(true, [thread]);
			});
			host.append(code, status, retry);
			slots.set(thread.id, { host, code, status, retry, path, rendered: null });
			observer.observe(host);
			return host;
		},
		show(threads, context) {
			pageThreads = threads.filter(hasThreadCode).map((thread) => thread.id);
			pageContext = context;
			render();
			loadVisible();
		},
		render() {
			render();
			loadVisible();
		},
		clear() {
			generation++;
			observer.disconnect();
			visible.clear();
			cached.clear();
			indexedThreads = undefined;
			threadsById.clear();
			requestedIds.clear();
			pageThreads = [];
			pageContext = requested = "";
			pending = false;
			started = false;
			error = null;
			slots.clear();
		},
	};
}
