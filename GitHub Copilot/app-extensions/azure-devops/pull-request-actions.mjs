import {
	renderMarkdown as renderSafeMarkdown,
	sanitizeExternalUrl,
} from "./assets/pull-request-renderers.js";
import {
	createCopilotIcon,
	createGitHubCodeIcon,
	createGitHubEllipsisIcon,
	createGitHubLinkIcon,
	createGitHubPencilIcon,
	createGitHubTrashIcon,
} from "./github-ui-icons.mjs";
import {
	manualFixComment,
	manualFixThreads,
} from "./pull-request-fix-state.mjs";
import {
	closePopupWithin,
	openPopup,
	popupTriggerWithin,
} from "./pull-request-popups.mjs";
import { telemetry } from "./pull-request-telemetry.mjs";

export function renderMarkdown(container, value) {
	return renderSafeMarkdown(container, value, {
		onLink: () => telemetry.start("open_link", "link").finish("success"),
	});
}

const voteOptions = [
	["0", "No vote"],
	["10", "Approve"],
	["5", "Approve with suggestions"],
	["-5", "Wait for author"],
	["-10", "Reject"],
];

/** @template {keyof HTMLElementTagNameMap} Tag @param {Tag} tag @param {string} [value] @param {string} [className] */
export function node(tag, value = "", className = "") {
	const result = document.createElement(tag);
	result.textContent = value;
	if (className) result.className = className;
	return result;
}

/** @param {string} name */
export function avatar(name) {
	const initials =
		name
			.split(" ")
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?";
	const result = node("span", initials, "avatar");
	result.setAttribute("aria-hidden", "true");
	return result;
}

/** @param {HTMLElement} button @param {boolean} value */
export function inactive(button, value) {
	button.setAttribute("aria-disabled", String(value));
}

/** @param {string | null} value */
export function date(value) {
	if (!value) return "Not reported";
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime())
		? "Not reported"
		: parsed.toLocaleString();
}

// Page instead of accumulating rows/text. Controls remain mounted while their
// page changes so keyboard focus and bounded DOM size survive navigation.
/**
 * @param {HTMLElement} host @param {number} total @param {number} size
 * @param {string} label @param {(start: number, end: number) => void} show
 */
export function pager(host, total, size, label, show, initialPage = 0) {
	let page = Math.min(initialPage, Math.max(0, Math.ceil(total / size) - 1));
	const controls = node("div", "", "pager");
	const previous = node("button", `Previous ${label}`);
	const next = node("button", `Next ${label}`);
	const count = node("span");
	previous.type = next.type = "button";
	controls.append(previous, count, next);
	controls.hidden = total <= size;
	host.append(controls);
	function update() {
		const start = page * size;
		show(start, start + size);
		count.textContent = `${Math.min(start + 1, total)}\u2013${Math.min(start + size, total)} of ${total}`;
		inactive(previous, page === 0);
		inactive(next, start + size >= total);
	}
	function announce() {
		const notice = document.getElementById("notice");
		if (notice) notice.textContent = `${label}: ${count.textContent}`;
	}
	previous.addEventListener("click", () => {
		if (page === 0) return;
		const action = telemetry.start("previous_page", pagingStage(label));
		page--;
		update();
		announce();
		action.finish("success");
	});
	next.addEventListener("click", () => {
		if ((page + 1) * size >= total) return;
		const action = telemetry.start("next_page", pagingStage(label));
		page++;
		update();
		announce();
		action.finish("success");
	});
	update();
}

function pagingStage(label) {
	if (label === "reviewers") return "reviewers";
	if (label === "threads") return "threads";
	if (label.startsWith("comments in thread ")) return "replies";
	return "checks";
}

/**
 * @template T
 * @param {HTMLElement} host @param {readonly T[]} items
 * @param {string} label @param {string} empty
 * @param {(row: HTMLLIElement, item: T, index: number) => HTMLLIElement | void} makeRow
 * @param {number | null} [size] Null renders a continuous list.
 * @param {(items: readonly T[], start: number) => void} [onPage]
 * @param {number} [initialPage]
 */
export function pagedList(
	host,
	items,
	label,
	empty,
	makeRow,
	size = 20,
	onPage,
	initialPage = 0,
) {
	host.replaceChildren();
	if (!items.length) {
		host.append(node("p", empty, "muted"));
		onPage?.([], 0);
		return;
	}
	const list = node("ul");
	list.dataset.selectable = "true";
	host.append(list);
	const show = (start, end) => {
		list.replaceChildren(
			...items.slice(start, end).map((item, offset) => {
				const row = node("li");
				return makeRow(row, item, start + offset) || row;
			}),
		);
		onPage?.(items.slice(start, end), start);
	};
	if (size === null) show(0, items.length);
	else pager(host, items.length, size, label, show, initialPage);
}

function field(form, label, type = "text", value = "", options) {
	const wrapper = node("label", label, "form-field");
	const input = node(
		type === "textarea" ? "textarea" : options ? "select" : "input",
	);
	if (input instanceof HTMLInputElement) input.type = type;
	if (options)
		for (const [key, text] of options) {
			const option = node("option", text);
			option.value = key;
			input.append(option);
		}
	input.value = value;
	input.spellcheck = false;
	wrapper.append(input);
	form.append(wrapper);
	return input;
}

function button(label, handler) {
	const result = node("button", label);
	result.type = "button";
	result.addEventListener("click", () => {
		if (result.getAttribute("aria-disabled") !== "true") handler(result);
	});
	return result;
}

function dropdownIndicator(trigger) {
	const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	icon.setAttribute("width", "14");
	icon.setAttribute("height", "14");
	icon.setAttribute("viewBox", "0 0 16 16");
	icon.setAttribute("aria-hidden", "true");
	icon.setAttribute("focusable", "false");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "m4 6 4 4 4-4");
	path.setAttribute("fill", "none");
	path.setAttribute("stroke", "currentColor");
	path.setAttribute("stroke-width", "1.5");
	path.setAttribute("stroke-linecap", "round");
	path.setAttribute("stroke-linejoin", "round");
	icon.append(path);
	trigger.append(icon);
	trigger.classList.add("dropdown-trigger");
}

// App Primer wrappers depend on app context, which this isolated guest does
// not receive. Controls use the host's theme contract without importing IPC.
export function createReviewActions({
	getSnapshot,
	getSignal,
	getMutationRecoveryRevision = () => -1,
	instanceId,
	notify,
	rerender,
	isConnected = () => true,
}) {
	let generation = 0;
	let writeBusy = false;
	let stateBusy = false;
	let replyResolutionRecovery = "";
	const requestedThreads = new Map();
	let stateQueue = Promise.resolve();
	let presentationKey = "";
	let pullRequestActionsKey = "";
	let reviewKey = "";
	let reviewAccessKey = "";
	let accessKey = "";
	let mutationKey = "";
	let titleEditor = null;
	let descriptionEditor = null;
	let nextPopupTitleId = 0;
	const forms = new Set();
	const el = (id) => document.getElementById(id);
	const permissionKey = () =>
		JSON.stringify([
			getSnapshot().access,
			getSnapshot().accessError,
			getSnapshot().selectedCommitId,
		]);
	const isEditing = (host) =>
		accessKey === permissionKey() &&
		(host !== el("reviewer-actions") || permitted("reviewer")) &&
		Boolean(
			host.querySelector(
				'form:not(.comment-composer), form.comment-composer[data-expanded="true"]',
			),
		);
	const permitted = (operation) => {
		const state = getSnapshot();
		return (
			!state.selectedCommitId &&
			!getSignal().aborted &&
			Boolean(state.pullRequest) &&
			(operation !== "reviewer" ||
				["open", "draft"].includes(state.pullRequest.state)) &&
			state.access?.operations?.includes(operation) === true
		);
	};
	const canEditState = () =>
		Boolean(getSnapshot().pullRequest) &&
		!getSnapshot().selectedCommitId &&
		!getSignal().aborted;
	const canSaveState = () =>
		canEditState() && getSnapshot().status === "ready" && isConnected();
	const canShowFixes = () => {
		const state = getSnapshot();
		return (
			!state.selectedCommitId &&
			state.status === "ready" &&
			["open", "draft"].includes(state.pullRequest?.state) &&
			state.overview.status === "ready" &&
			!state.overview.data?.errors?.threads
		);
	};
	const allowed = (operation) => canSaveState() && permitted(operation);
	const fallbackFocus = () => {
		const status = el("mutation-status");
		if (status?.textContent && !status.hidden) return status;
		const refresh = el("refresh");
		return el("canvas-footer")?.hidden || refresh?.hidden
			? el("header-title")
			: refresh;
	};
	const announce = (message, options) => {
		el("mutation-status").textContent = message;
		if (options) notify(message, options);
		else notify(message);
	};

	function syncControl(control) {
		const key = control.dataset.fixKey;
		const ready =
			canSaveState() && (!key || getSnapshot().overview.status === "ready");
		const cooling = requestedThreads.has(key);
		const blocked = !ready || writeBusy || stateBusy || cooling;
		inactive(control, blocked);
		if (control.dataset.fixKey)
			control.lastElementChild.textContent = cooling
				? "Fix requested"
				: control.dataset.label;
		const descriptions = (control.getAttribute("aria-describedby") ?? "")
			.split(/\s+/)
			.filter((id) => id && id !== "status" && id !== "mutation-status");
		if (blocked) descriptions.push(ready ? "mutation-status" : "status");
		if (descriptions.length)
			control.setAttribute("aria-describedby", descriptions.join(" "));
		else control.removeAttribute("aria-describedby");
	}

	function writeControl(control) {
		control.dataset.reviewAction = "true";
		syncControl(control);
		return control;
	}

	function pruneRequestedThreads() {
		const state = getSnapshot();
		const pr = state.pullRequest;
		for (const [key, requested] of requestedThreads)
			if (
				!key.startsWith("discussion:") &&
				pr &&
				(pr.sourceCommitId !== requested.sourceCommitId ||
					(key === "conflicts" && pr.mergeStatus !== requested.mergeStatus))
			)
				requestedThreads.delete(key);
		if (
			!state.selectedCommitId &&
			state.overview.status === "ready" &&
			state.overview.data &&
			!state.overview.data.errors?.threads
		) {
			for (const thread of state.overview.data.threads) {
				const key = `discussion:${thread.id}`;
				if (
					requestedThreads.has(key) &&
					requestedThreads.get(key).status !== thread.status
				)
					requestedThreads.delete(key);
			}
		}
	}

	function unrequestedFixThreads(data) {
		pruneRequestedThreads();
		return manualFixThreads(data).filter(
			(thread) => !requestedThreads.has(`discussion:${thread.id}`),
		);
	}

	function syncReadiness() {
		pruneRequestedThreads();
		for (const control of document.querySelectorAll("[data-review-action]"))
			syncControl(control);
	}

	async function post(route, body) {
		const state = getSnapshot();
		const binding = state.bindingRevision;
		const current = generation;
		const response = await fetch(`/${route}/${instanceId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Canvas-Binding": String(binding),
				"X-Canvas-Changes": String(state.changesRevision),
			},
			body: JSON.stringify(body),
			signal: getSignal(),
		});
		if (current !== generation || binding !== getSnapshot().bindingRevision)
			return null;
		if (!response.ok) {
			if (response.status === 403)
				throw new Error(
					"This action is not authorized. Refresh to check access.",
				);
			if (response.status === 409)
				throw new Error(
					"The pull request changed. Refresh and check it before trying again.",
				);
			throw new Error(
				"The action could not be confirmed. Refresh to check its result before trying again.",
			);
		}
		return response;
	}

	async function searchReviewerDirectory(query, signal) {
		const state = getSnapshot();
		const binding = state.bindingRevision;
		const current = generation;
		const response = await fetch(`/search-reviewers/${instanceId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Canvas-Binding": String(binding),
			},
			body: JSON.stringify({ query }),
			signal: AbortSignal.any([getSignal(), signal]),
		});
		if (current !== generation || binding !== getSnapshot().bindingRevision)
			return null;
		const payload = await response.json();
		if (!response.ok)
			throw new Error(
				typeof payload?.error === "string"
					? payload.error
					: "Could not search Azure DevOps reviewers.",
			);
		if (
			!payload ||
			!Array.isArray(payload.reviewers) ||
			payload.reviewers.length > 20 ||
			typeof payload.incomplete !== "boolean" ||
			payload.reviewers.some(
				(reviewer) =>
					!reviewer ||
					typeof reviewer.id !== "string" ||
					typeof reviewer.name !== "string" ||
					(reviewer.detail !== undefined &&
						typeof reviewer.detail !== "string"),
			)
		)
			throw new TypeError("Invalid reviewer search response.");
		return payload;
	}

	function fixKey(input) {
		return input.kind === "discussion"
			? `discussion:${input.threadIds[0]}`
			: input.kind;
	}

	function fixAction(label, request) {
		const control = button("", async () => {
			const input = request();
			const key = fixKey(input);
			const current = generation;
			const selected = new Map();
			if (requestedThreads.has(key)) return;
			if (input.kind === "discussion" || input.kind === "discussions") {
				const threads = unrequestedFixThreads(getSnapshot().overview.data)
					.filter((thread) => input.threadIds.includes(thread.id))
					.slice(0, 50);
				if (!threads.length) return;
				input.threadIds = threads.map((thread) => thread.id);
				for (const thread of threads) {
					const threadKey = `discussion:${thread.id}`;
					const requested = { status: thread.status };
					selected.set(threadKey, requested);
					requestedThreads.set(threadKey, requested);
				}
			}
			if (input.kind === "checks" || input.kind === "conflicts") {
				const { sourceCommitId, mergeStatus } = getSnapshot().pullRequest ?? {};
				const requested = { sourceCommitId, mergeStatus };
				selected.set(key, requested);
				requestedThreads.set(key, requested);
			}
			replyResolutionRecovery = "";
			rerender();
			function clearRequest() {
				if (current !== generation) return;
				for (const [threadKey, requested] of selected)
					if (requestedThreads.get(threadKey) === requested)
						requestedThreads.delete(threadKey);
				rerender();
			}
			try {
				const response = await post("fix", input);
				if (!response) clearRequest();
				else if (
					(await response.json()).outcome === "unknown" &&
					current === generation &&
					!getSignal().aborted
				)
					announce(
						"Copilot may still be working on this fix. Check the workspace conversation before trying again.",
						{ error: true, title: "Fix confirmation pending" },
					);
			} catch (error) {
				clearRequest();
				if (current === generation && !getSignal().aborted)
					announce(
						error instanceof TypeError
							? "Connection interrupted. Check the workspace conversation before trying again."
							: "Copilot could not start this fix. Refresh and try again.",
						{ error: true },
					);
			}
		});
		control.classList.add("fix-action");
		control.dataset.action = label;
		control.dataset.label = label;
		control.dataset.fixKey = fixKey(request());
		control.append(createCopilotIcon(), node("span", label));
		return writeControl(control);
	}

	function setFixLabel(control, label) {
		control.dataset.label = label;
		syncControl(control);
	}

	async function mutate(operation, input, resolveReply = false) {
		if (
			!allowed(operation) ||
			(resolveReply && !permitted("thread-status")) ||
			writeBusy ||
			stateBusy
		) {
			announce("Wait for the current action, then try again.", {
				transient: true,
			});
			return false;
		}
		const current = generation;
		const revision = getSnapshot().revision;
		replyResolutionRecovery = "";
		writeBusy = true;
		syncReadiness();
		announce("Submitting action...");
		let replyPosted = false;
		try {
			const result = await post("mutate", { operation, input });
			if (!result) return false;
			if (resolveReply) {
				replyPosted = true;
				const resolved = await post("mutate", {
					operation: "thread-status",
					input: { threadId: input.threadId, status: "fixed" },
				});
				if (!resolved) return false;
			}
			const state = getSnapshot();
			announce(
				(state.revision > revision && state.mutation?.status === "ready"
					? state.mutation.message
					: null) || "Action completed.",
			);
			return true;
		} catch (error) {
			if (current !== generation || getSignal().aborted) return false;
			if (replyPosted)
				replyResolutionRecovery =
					"Your reply was posted, but thread resolution could not be confirmed. Do not post the reply again. Refresh to check the thread, then use Resolve if needed.";
			announce(
				replyResolutionRecovery ||
					(error instanceof TypeError
						? "Connection interrupted. Refresh to check the result before trying again."
						: error.message),
				// Preserve only an SSE result observed after this mutation started.
				{
					error: true,
					replaceRecovery:
						replyPosted || getMutationRecoveryRevision() <= revision,
				},
			);
			// A confirmed reply no longer needs a draft, even if resolving failed.
			return replyPosted;
		} finally {
			if (current === generation) {
				writeBusy = false;
				syncReadiness();
			}
		}
	}

	function saveState(input) {
		const current = generation;
		const changesRevision = getSnapshot().changesRevision;
		const task = stateQueue.then(() => {
			if (current !== generation) return false;
			const patch = typeof input === "function" ? input() : input;
			if (
				(patch.viewed || patch.drafts) &&
				changesRevision !== getSnapshot().changesRevision
			) {
				announce(
					"The pull request changed before review state could be saved. Refresh and try again.",
					{ error: true },
				);
				return false;
			}
			return persistState(patch);
		});
		stateQueue = task.then(() => {});
		return task;
	}

	async function persistState(input) {
		if (writeBusy || !canSaveState()) return false;
		const current = generation;
		replyResolutionRecovery = "";
		stateBusy = true;
		syncReadiness();
		try {
			const result = await post("review-state", input);
			if (!result) return false;
			announce("Review state saved in this canvas.");
			return true;
		} catch {
			if (current === generation && !getSignal().aborted)
				announce(
					"Could not save review state. Refresh to check the saved state.",
					{ error: true },
				);
			return false;
		} finally {
			if (current === generation) {
				stateBusy = false;
				syncReadiness();
			}
		}
	}

	function createForm(
		host,
		trigger,
		title,
		build,
		floating = false,
		telemetryStage,
	) {
		const ownerId = host.closest("[id]")?.id;
		const commentId = trigger
			.closest("[data-comment-id]")
			?.getAttribute("data-comment-id");
		function restoreTriggerFocus() {
			const liveHost = host.isConnected ? host : el(ownerId);
			const replacement = [
				...(liveHost?.querySelectorAll("button[data-action]") ?? []),
			].find(
				(button) =>
					button.dataset.action === trigger.dataset.action &&
					button
						.closest("[data-comment-id]")
						?.getAttribute("data-comment-id") === commentId,
			);
			(trigger.isConnected
				? trigger
				: (replacement ?? liveHost?.querySelector("button") ?? fallbackFocus())
			).focus();
		}
		const content = node(
			"div",
			"",
			floating ? "floating-panel action-popup" : "inline-form",
		);
		content.dataset.formName = title;
		content.hidden = true;
		if (floating) {
			content.setAttribute("role", "dialog");
			const heading = node("h3", title, "action-popup-title");
			heading.id = `action-popup-title-${++nextPopupTitleId}`;
			content.setAttribute("aria-labelledby", heading.id);
			content.append(heading);
		}
		host.append(content);
		forms.add(content);
		let dismiss = null;
		function close(userAction = false) {
			const restoreFocus = content.contains(document.activeElement);
			const action =
				userAction && telemetryStage
					? telemetry.start("collapse", telemetryStage)
					: undefined;
			dismiss?.("programmatic", false);
			forms.delete(content);
			content.remove();
			trigger.setAttribute("aria-expanded", "false");
			rerender();
			if (restoreFocus) restoreTriggerFocus();
			action?.finish("success");
		}
		build(content, () => close(true));
		content.addEventListener("keydown", (event) => {
			if (!floating && event.key === "Escape" && !event.defaultPrevented) {
				event.preventDefault();
				close(true);
			}
		});
		return {
			content,
			close,
			hide() {
				dismiss?.();
			},
			show() {
				if (floating) {
					dismiss = openPopup(
						trigger,
						content,
						(reason) => {
							const restoreFocus =
								reason !== "programmatic" &&
								content.contains(document.activeElement);
							forms.delete(content);
							content.remove();
							if (reason !== "programmatic") rerender();
							if (restoreFocus && !trigger.isConnected) restoreTriggerFocus();
						},
						"end",
					);
				} else {
					content.hidden = false;
					if (trigger.getAttribute("aria-haspopup") !== "menu")
						trigger.setAttribute("aria-expanded", "true");
				}
				const firstControl = content.querySelector(
					"input,textarea,select,button",
				);
				if (firstControl instanceof HTMLElement)
					firstControl.focus({ preventScroll: floating });
			},
		};
	}

	function disclosure(
		host,
		title,
		build,
		{
			floating = false,
			formName = title,
			telemetryStage = "",
			readOnly = false,
		} = {},
	) {
		let form = null;
		const trigger = button(title, () => {
			if (floating && focusActionForm(host)) return;
			const action = telemetryStage
				? telemetry.start(
						form?.content.isConnected && !form.content.hidden
							? "collapse"
							: "expand",
						telemetryStage,
					)
				: undefined;
			if (!form?.content.isConnected)
				form = createForm(
					host,
					trigger,
					formName,
					build,
					floating,
					telemetryStage,
				);
			else if (!form.content.hidden) {
				if (floating) form.hide();
				else form.close();
				action?.finish("success");
				return;
			}
			form.show();
			action?.finish("success");
		});
		if (!readOnly) writeControl(trigger);
		trigger.setAttribute("aria-expanded", "false");
		if (floating) {
			trigger.setAttribute("aria-haspopup", "dialog");
			dropdownIndicator(trigger);
		}
		trigger.dataset.action = title;
		host.append(trigger);
		return trigger;
	}

	function focusActionForm(host) {
		const form = host.querySelector(".inline-form form");
		if (!form || !isEditing(host)) return false;
		form.querySelector("input,textarea,select,button")?.focus();
		announce(
			"Save or cancel the current pull request action before starting another.",
			{ transient: true },
		);
		return true;
	}

	function actionMenu(
		host,
		entries,
		{
			label = "Pull request actions",
			iconOnly = false,
			formHost = host,
			readOnly = false,
			triggerVariant = "",
			triggerIcon = "chevron",
		} = {},
	) {
		let dismiss = null;
		const trigger = button(iconOnly ? "" : label, () => {
			if (trigger.getAttribute("aria-expanded") === "true") dismiss();
			else show();
		});
		if (!readOnly) writeControl(trigger);
		if (triggerIcon === "ellipsis") {
			trigger.append(createGitHubEllipsisIcon("action-ellipsis"));
			trigger.classList.add("dropdown-trigger");
		} else dropdownIndicator(trigger);
		trigger.dataset.action = label;
		if (iconOnly) {
			trigger.setAttribute("aria-label", label);
			trigger.classList.add("split-secondary");
		}
		if (triggerVariant) trigger.dataset.variant = triggerVariant;
		trigger.setAttribute("aria-haspopup", "menu");
		trigger.setAttribute("aria-expanded", "false");
		host.append(trigger);
		function show(last = false) {
			if (trigger.getAttribute("aria-disabled") === "true") return;
			if (focusActionForm(formHost)) return;
			const currentEntries =
				typeof entries === "function" ? entries() : entries;
			const menu = node("div", "", "floating-panel action-menu");
			menu.dataset.action = label;
			menu.setAttribute("role", "menu");
			menu.setAttribute("aria-label", label);
			const rows = node("div", "", "action-menu-rows");
			rows.setAttribute("role", "none");
			menu.append(rows);
			const items = currentEntries.map((entry, index) => {
				if (entry.separatorBefore) {
					const separator = node("div", "", "action-menu-divider");
					separator.setAttribute("role", "none");
					rows.append(separator);
				}
				const item = button(entry.label, () => {
					dismiss(false);
					if (entry.onSelect) {
						entry.onSelect();
						trigger.focus();
					} else
						createForm(
							formHost,
							trigger,
							entry.formName ?? entry.label,
							entry.build,
							entry.floating === true,
						).show();
				});
				if (!readOnly) writeControl(item);
				item.className = "action-menu-item";
				if (entry.danger) item.dataset.variant = "danger";
				if (entry.ariaLabel) item.setAttribute("aria-label", entry.ariaLabel);
				item.setAttribute("role", entry.checked ? "menuitemradio" : "menuitem");
				if (entry.checked) {
					const checked = entry.checked();
					item.setAttribute("aria-checked", String(checked));
					const indicator = node(
						"span",
						checked ? "\u2713" : "",
						"action-menu-check",
					);
					indicator.setAttribute("aria-hidden", "true");
					item.prepend(indicator);
				} else if (entry.icon) {
					item.prepend(entry.icon());
				}
				item.setAttribute("aria-setsize", String(currentEntries.length));
				item.setAttribute("aria-posinset", String(index + 1));
				item.tabIndex = -1;
				item.addEventListener("pointermove", () =>
					item.focus({ preventScroll: true }),
				);
				rows.append(item);
				return item;
			});
			let search = "";
			let lastKey = 0;
			menu.addEventListener("keydown", (event) => {
				const current = items.indexOf(document.activeElement);
				let next;
				if (event.key === "ArrowDown") next = (current + 1) % items.length;
				else if (event.key === "ArrowUp")
					next = (current - 1 + items.length) % items.length;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = items.length - 1;
				else if (
					event.key.length === 1 &&
					event.key !== " " &&
					!event.ctrlKey &&
					!event.altKey &&
					!event.metaKey
				) {
					search =
						performance.now() - lastKey > 500 ? event.key : search + event.key;
					lastKey = performance.now();
					next = currentEntries.findIndex((entry) =>
						entry.label.toLowerCase().startsWith(search.toLowerCase()),
					);
				} else return;
				event.preventDefault();
				if (next >= 0) items[next].focus();
			});
			host.append(menu);
			dismiss = openPopup(
				trigger,
				menu,
				() => menu.remove(),
				iconOnly ? "end" : "start",
			);
			items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
		}
		trigger.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				show(event.key === "ArrowUp");
			}
		});
		return trigger;
	}

	function actionControls(
		host,
		primary,
		entries,
		label = "Pull request actions",
	) {
		const split = Boolean(primary && entries.length);
		const controls = node("div", "", split ? "split-control" : "");
		if (split) {
			controls.setAttribute("role", "group");
			controls.setAttribute("aria-label", label);
		}
		host.append(controls);
		if (primary) {
			const trigger = button(primary.label, () => {
				if (focusActionForm(host)) return;
				closePopupWithin(host);
				if (primary.onSelect) void primary.onSelect();
				else
					createForm(
						host,
						trigger,
						primary.formName ?? primary.label,
						primary.build,
						primary.floating === true,
					).show();
			});
			writeControl(trigger);
			trigger.dataset.action = primary.action ?? primary.label;
			trigger.dataset.variant = primary.variant ?? "primary";
			trigger.setAttribute("aria-expanded", "false");
			if (primary.floating) trigger.setAttribute("aria-haspopup", "dialog");
			controls.append(trigger);
		}
		if (entries.length)
			actionMenu(controls, entries, {
				label,
				iconOnly: Boolean(primary),
				formHost: host,
				triggerVariant: primary ? (primary.variant ?? "primary") : undefined,
			});
	}

	function conclude(
		container,
		close,
		label,
		submit,
		variant = "primary",
		leadingAction,
		alternative,
	) {
		const form =
			container instanceof HTMLFormElement ? container : node("form");
		if (form !== container) {
			form.setAttribute("aria-label", container.dataset.formName ?? label);
			form.append(...container.childNodes);
			container.append(form);
		}
		const actions = node("div", "", "form-actions");
		const save = node("button", label);
		writeControl(save);
		save.type = "submit";
		save.dataset.variant = variant;
		const alternate = alternative
			? writeControl(node("button", alternative.label))
			: null;
		if (alternate) alternate.type = "submit";
		const cancel = button("Cancel", close);
		if (leadingAction) actions.append(leadingAction);
		actions.append(cancel, save);
		if (alternate) actions.append(alternate);
		form.append(actions);
		let submitting = false;
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const selected =
				alternate && event.submitter === alternate ? alternate : save;
			if (
				submitting ||
				selected.getAttribute("aria-disabled") === "true" ||
				!form.reportValidity()
			)
				return;
			submitting = true;
			inactive(save, true);
			if (alternate) inactive(alternate, true);
			const inputs = [...form.elements];
			for (const input of inputs)
				if (
					input instanceof HTMLInputElement ||
					input instanceof HTMLTextAreaElement
				)
					input.readOnly = true;
			try {
				if (await (selected === alternate ? alternative.submit() : submit()))
					close();
			} finally {
				submitting = false;
				syncReadiness();
				for (const input of inputs)
					if (
						input instanceof HTMLInputElement ||
						input instanceof HTMLTextAreaElement
					)
						input.readOnly = false;
			}
		});
		return save;
	}

	function markdownModeControl(editor, preview, content) {
		const control = node("div", "", "markdown-mode-tabs");
		control.setAttribute("role", "tablist");
		control.setAttribute("aria-label", "Comment editor");
		const modes = [
			{
				label: "Edit Markdown",
				panel: editor,
				icon: createGitHubPencilIcon,
			},
			{
				label: "Preview Markdown",
				panel: preview,
				icon: createGitHubCodeIcon,
			},
		];
		const tabs = modes.map((mode, index) => {
			const tab = button("", () => select(index));
			tab.classList.add("markdown-mode-tab");
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-label", mode.label);
			tab.append(mode.icon());
			control.append(tab);
			mode.panel.setAttribute("role", "tabpanel");
			mode.panel.setAttribute("aria-label", mode.label);
			return tab;
		});
		const select = (selected) => {
			for (const [index, mode] of modes.entries()) {
				const active = index === selected;
				tabs[index].setAttribute("aria-selected", String(active));
				tabs[index].tabIndex = active ? 0 : -1;
				mode.panel.hidden = !active;
			}
			if (selected === 1) renderMarkdown(preview, content.value);
		};
		control.addEventListener("keydown", (event) => {
			const current = tabs.indexOf(
				/** @type {HTMLButtonElement} */ (event.target),
			);
			if (current === -1) return;
			let next;
			switch (event.key) {
				case "ArrowRight":
				case "ArrowDown":
					next = (current + 1) % tabs.length;
					break;
				case "ArrowLeft":
				case "ArrowUp":
					next = (current - 1 + tabs.length) % tabs.length;
					break;
				case "Home":
					next = 0;
					break;
				case "End":
					next = tabs.length - 1;
					break;
				default:
					return;
			}
			event.preventDefault();
			select(next);
			tabs[next].focus();
		});
		content.addEventListener("invalid", () => select(0));
		select(0);
		return {
			control,
			reset() {
				select(0);
				preview.replaceChildren();
			},
		};
	}

	function buildTextAction(form, close, title, operation, input, initial = "") {
		const editor = node("div", "", "comment-editor-panel");
		const content = field(editor, "Comment", "textarea", initial);
		content.required = true;
		const preview = node("div", "", "markdown comment-preview");
		preview.dataset.selectable = "true";
		form.append(editor, preview);
		const mode = markdownModeControl(editor, preview, content);
		conclude(
			form,
			close,
			title,
			() => mutate(operation, { ...input, content: content.value }),
			operation === "reply" ? "default" : "primary",
			mode.control,
			operation === "reply" && permitted("thread-status")
				? {
						label: "Reply and resolve",
						submit: () =>
							mutate(operation, { ...input, content: content.value }, true),
					}
				: undefined,
		);
	}

	function textAction(host, title, operation, input, initial = "") {
		if (!permitted(operation)) return;
		return disclosure(host, title, (form, close) =>
			buildTextAction(form, close, title, operation, input, initial),
		);
	}

	function commentComposer(host) {
		if (!permitted("comment")) return;
		const form = node("form", "", "comment-composer");
		form.setAttribute("aria-label", "Add comment");
		form.dataset.expanded = "false";
		const label = node("label", "Add a comment", "sr-only");
		label.htmlFor = "new-comment";
		const content = node("textarea", "", "comment-composer-input");
		content.id = "new-comment";
		content.placeholder = "Add a comment...";
		content.rows = 1;
		content.required = true;
		content.spellcheck = false;
		const editor = node("div", "", "comment-editor-panel");
		editor.append(label, content);
		const preview = node("div", "", "markdown comment-preview");
		preview.dataset.selectable = "true";
		form.append(editor, preview);
		const mode = markdownModeControl(editor, preview, content);
		const collapse = () => {
			content.value = "";
			content.setCustomValidity("");
			mode.reset();
			const heading = el("discussion-heading");
			form.dataset.expanded = "false";
			setTimeout(() => {
				if (heading.isConnected) heading.focus({ preventScroll: true });
			}, 0);
		};
		content.addEventListener("focus", () => {
			form.dataset.expanded = "true";
		});
		form.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				collapse();
			}
		});
		form.addEventListener("focusout", () => {
			setTimeout(() => {
				if (!form.contains(document.activeElement) && !content.value.trim()) {
					// The collapsed composer only shows the editor panel, so return to Edit.
					mode.reset();
					form.dataset.expanded = "false";
				}
			}, 0);
		});
		conclude(
			form,
			collapse,
			"Save",
			() => mutate("comment", { content: content.value }),
			"primary",
			mode.control,
		);
		host.append(form);
	}

	function reviewerSearchForm(form, close) {
		let selected = null;
		let controller = null;
		let debounceTimer;
		let resultButtons = [];
		const query = /** @type {HTMLInputElement} */ (
			field(form, "Reviewer name, email, alias, or identity ID", "search")
		);
		query.required = true;
		query.parentElement?.classList.add("reviewer-search-field");
		const results = node("div", "", "reviewer-search-results-host");
		const status = node("p", "", "reviewer-search-status muted");
		status.dataset.selectable = "true";
		const help = node(
			"p",
			"Type at least two characters to search identities visible to this Azure DevOps project. Exact email or identity ID entry is always available. New reviewers are added as optional.",
			"muted",
		);
		help.id = "reviewer-search-help";
		query.setAttribute("aria-describedby", help.id);

		const cancelSearch = () => {
			clearTimeout(debounceTimer);
			debounceTimer = undefined;
			const activeSearch = controller;
			controller = null;
			activeSearch?.abort();
		};
		const hideResults = () => {
			resultButtons = [];
			results.replaceChildren();
			delete form.dataset.reviewerResults;
		};
		const selectReviewer = (reviewer) => {
			selected = reviewer;
			query.value = reviewer.detail
				? `${reviewer.name} (${reviewer.detail})`
				: reviewer.name;
			hideResults();
			status.textContent = `Selected ${reviewer.name}.`;
			announce(status.textContent);
			query.focus();
		};
		const focusResult = (index) => {
			if (!resultButtons.length) return;
			resultButtons[
				(index + resultButtons.length) % resultButtons.length
			].focus();
		};
		const renderReviewers = (reviewers) => {
			const list = node("ul", "", "reviewer-search-results");
			resultButtons = reviewers.map((reviewer, index) => {
				const item = node("li");
				const choose = button("", () => selectReviewer(reviewer));
				choose.className = "reviewer-search-result";
				const copy = node("span", "", "reviewer-search-result-copy");
				copy.append(
					node("strong", reviewer.name),
					...(reviewer.detail ? [node("span", reviewer.detail, "muted")] : []),
				);
				choose.append(avatar(reviewer.name), copy);
				choose.addEventListener("keydown", (event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						focusResult(index + 1);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						focusResult(index - 1);
					} else if (event.key === "Home") {
						event.preventDefault();
						focusResult(0);
					} else if (event.key === "End") {
						event.preventDefault();
						focusResult(resultButtons.length - 1);
					} else if (event.key === "Escape") {
						event.preventDefault();
						hideResults();
						query.focus();
					}
				});
				item.append(choose);
				list.append(item);
				return choose;
			});
			results.replaceChildren(list);
			form.dataset.reviewerResults = "true";
		};
		const runSearch = async (value) => {
			const searchController = new AbortController();
			controller = searchController;
			status.textContent = "Searching Azure DevOps identities...";
			announce(status.textContent);
			try {
				const result = await searchReviewerDirectory(
					value,
					searchController.signal,
				);
				if (!result || controller !== searchController) return;
				const existing = new Set(
					(getSnapshot().overview.data?.reviewers ?? []).map(
						(reviewer) => reviewer.id,
					),
				);
				const reviewers = result.reviewers.filter(
					(reviewer) => !existing.has(reviewer.id),
				);
				if (!reviewers.length) {
					hideResults();
					status.textContent = result.reviewers.length
						? "Every matching identity is already a reviewer."
						: result.incomplete
							? "No matches found. Some Azure DevOps identity sources were unavailable; enter an exact email or identity ID."
							: "No matches found. Enter an exact email or identity ID.";
					announce(status.textContent);
					return;
				}
				renderReviewers(reviewers);
				status.textContent = `${reviewers.length} reviewer ${reviewers.length === 1 ? "match" : "matches"} found${result.incomplete ? "; some Azure DevOps identity sources were unavailable" : ""}.`;
				announce(status.textContent);
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") return;
				if (controller !== searchController) return;
				hideResults();
				status.textContent =
					error instanceof Error
						? error.message
						: "Could not search Azure DevOps reviewers.";
				announce(status.textContent, { error: true, recovery: false });
			} finally {
				if (controller === searchController) controller = null;
			}
		};
		const scheduleSearch = () => {
			cancelSearch();
			selected = null;
			query.setCustomValidity("");
			status.textContent = "";
			hideResults();
			const value = query.value.trim();
			if (value.length < 2) return;
			debounceTimer = setTimeout(() => {
				debounceTimer = undefined;
				void runSearch(value);
			}, 300);
		};
		query.addEventListener("input", scheduleSearch);
		query.addEventListener("keydown", (event) => {
			if (event.isComposing || event.keyCode === 229) return;
			if (event.key === "ArrowDown" && resultButtons.length) {
				event.preventDefault();
				focusResult(0);
			} else if (event.key === "ArrowUp" && resultButtons.length) {
				event.preventDefault();
				focusResult(resultButtons.length - 1);
			} else if (event.key === "Enter" && resultButtons.length) {
				event.preventDefault();
				resultButtons[0].click();
			} else if (event.key === "Enter" && debounceTimer) {
				event.preventDefault();
				clearTimeout(debounceTimer);
				debounceTimer = undefined;
				void runSearch(query.value.trim());
			} else if (event.key === "Enter" && controller) {
				event.preventDefault();
			} else if (
				event.key === "Escape" &&
				(resultButtons.length || debounceTimer || controller)
			) {
				event.preventDefault();
				cancelSearch();
				hideResults();
				status.textContent = "";
			}
		});
		form.append(results, status, help);
		const closeSearch = () => {
			cancelSearch();
			close();
		};
		conclude(form, closeSearch, "Add reviewer", () => {
			cancelSearch();
			return mutate("reviewer", {
				reviewerId: selected?.id ?? query.value,
				remove: false,
				isRequired: false,
			});
		});
	}

	async function copyThreadLink(thread) {
		const current = generation;
		const pullRequestUrl = getSnapshot().pullRequest?.url;
		if (!pullRequestUrl) {
			announce("The pull request link is not available.", {
				error: true,
				recovery: false,
			});
			return;
		}
		let url;
		try {
			url = new URL(pullRequestUrl);
			if (!["http:", "https:"].includes(url.protocol)) throw new Error();
		} catch {
			announce("The pull request link is not valid.", {
				error: true,
				recovery: false,
			});
			return;
		}
		url.searchParams.set("discussionId", String(thread.id));
		const action = telemetry.start("copy_link", "discussion");
		try {
			await navigator.clipboard.writeText(url.toString());
			action.finish("success");
			if (current === generation && !getSignal().aborted)
				announce("Comment thread link copied.", {
					transient: true,
					title: "Link copied",
				});
		} catch {
			action.finish("failure", { errorCode: "clipboard" });
			if (current === generation && !getSignal().aborted)
				announce("Could not copy the comment thread link.", {
					error: true,
					recovery: false,
				});
		}
	}

	function confirm(host, title, operation, input, explanation) {
		if (!permitted(operation)) return;
		disclosure(host, title, (form, close) => {
			form.append(node("p", explanation, "remote-text"));
			conclude(form, close, `Confirm ${title.toLowerCase()}`, () =>
				mutate(operation, input),
			);
		});
	}

	function resizeTitleEditor(input) {
		input.style.height = "0";
		input.style.height = `${input.scrollHeight}px`;
	}

	function closeTitleEditor({ restoreFocus = false, renderView = true } = {}) {
		if (!titleEditor) return;
		titleEditor = null;
		el("title-editor").replaceChildren();
		delete el("details").dataset.titleEditing;
		if (renderView) rerender();
		const trigger = el("edit-title");
		if (restoreFocus && !trigger.hidden) trigger.focus();
	}

	async function saveTitleEditor(editor, restoreFocus) {
		if (titleEditor !== editor || editor.saving) return;
		const title = editor.input.value.replace(/\r?\n/g, " ").trim();
		if (!title) {
			editor.input.setCustomValidity("Enter a pull request title.");
			editor.input.reportValidity();
			editor.input.focus();
			return;
		}
		editor.input.setCustomValidity("");
		if (title === editor.baseline) {
			closeTitleEditor({ restoreFocus });
			return;
		}
		editor.saving = true;
		editor.input.readOnly = true;
		editor.input.setAttribute("aria-busy", "true");
		const saved = await mutate("edit", { title });
		if (titleEditor !== editor) return;
		editor.saving = false;
		editor.input.readOnly = false;
		editor.input.removeAttribute("aria-busy");
		if (saved) closeTitleEditor({ restoreFocus });
		else {
			editor.input.focus();
			editor.input.select();
		}
	}

	function startTitleEdit() {
		const state = getSnapshot();
		if (!allowed("edit") || !state.pullRequest || titleEditor) return;
		if (descriptionEditor) {
			descriptionEditor.input.focus();
			announce(
				"Save or cancel the description edit before editing the title.",
				{ transient: true },
			);
			return;
		}
		if (focusActionForm(el("pr-actions"))) return;
		closePopupWithin(document);
		const form = node("form", "", "title-edit-form");
		form.setAttribute("aria-label", "Edit pull request title");
		const input = node("textarea", "", "title-edit-input");
		input.setAttribute("aria-label", "Edit pull request title");
		input.rows = 1;
		input.required = true;
		input.spellcheck = false;
		input.value = state.pullRequest.title;
		form.append(input);
		const editor = {
			form,
			input,
			baseline: state.pullRequest.title,
			bindingRevision: state.bindingRevision,
			saving: false,
		};
		titleEditor = editor;
		el("title-editor").replaceChildren(form);
		el("details").dataset.titleEditing = "true";
		input.addEventListener("input", () => resizeTitleEditor(input));
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			void saveTitleEditor(editor, true);
		});
		input.addEventListener("keydown", (event) => {
			if (event.isComposing || event.keyCode === 229) return;
			if (event.key === "Enter") {
				event.preventDefault();
				void saveTitleEditor(editor, true);
			} else if (event.key === "Escape") {
				event.preventDefault();
				closeTitleEditor({ restoreFocus: true });
			}
		});
		input.addEventListener("blur", () => {
			if (titleEditor === editor && !editor.saving)
				void saveTitleEditor(editor, false);
		});
		resizeTitleEditor(input);
		input.focus();
		input.select();
	}

	function closeDescriptionEditor({
		restoreFocus = false,
		renderView = true,
	} = {}) {
		if (!descriptionEditor) return;
		descriptionEditor = null;
		el("description-editor").replaceChildren();
		delete el("details").dataset.descriptionEditing;
		if (renderView) rerender();
		const trigger = el("edit-description");
		if (restoreFocus && !trigger.hidden) trigger.focus();
	}

	function startDescriptionEdit() {
		const state = getSnapshot();
		if (!allowed("edit") || !state.pullRequest || descriptionEditor) return;
		if (titleEditor) {
			titleEditor.input.focus();
			announce(
				"Save or cancel the title edit before editing the description.",
				{ transient: true },
			);
			return;
		}
		if (focusActionForm(el("pr-actions"))) return;
		closePopupWithin(document);
		const form = node("form", "", "inline-form description-edit-form");
		form.setAttribute("aria-label", "Edit pull request description");
		const input = node("textarea", "", "description-edit-input");
		input.id = "description-edit-input";
		input.setAttribute("aria-labelledby", "description-heading");
		input.placeholder = "Add a description";
		input.spellcheck = false;
		input.value = state.pullRequest.description ?? "";
		form.append(input);
		const editor = {
			form,
			input,
			baseline: input.value,
			bindingRevision: state.bindingRevision,
		};
		descriptionEditor = editor;
		el("description-editor").replaceChildren(form);
		el("details").dataset.descriptionEditing = "true";
		const close = () =>
			closeDescriptionEditor({ restoreFocus: true, renderView: true });
		conclude(form, close, "Save description", () => {
			if (input.value === editor.baseline) return true;
			return mutate("edit", { description: input.value });
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		});
		input.focus();
		input.select();
	}

	function renderPullRequestActions(state) {
		const key = JSON.stringify([state.pullRequest, permissionKey()]);
		const host = el("pr-actions");
		if (key === pullRequestActionsKey || isEditing(host)) return;
		pullRequestActionsKey = key;
		const popupTrigger = popupTriggerWithin(host);
		const focused =
			host.contains(document.activeElement) || popupTrigger !== null;
		const focusedAction =
			(document.activeElement instanceof HTMLElement
				? document.activeElement
						.closest("[data-action]")
						?.getAttribute("data-action")
				: undefined) ?? popupTrigger?.dataset.action;
		closePopupWithin(host);
		host.replaceChildren();
		for (const form of forms) if (!form.isConnected) forms.delete(form);
		const writable =
			!state.selectedCommitId && state.access?.operations?.length > 0;
		if (state.pullRequest && writable) {
			let primary = null;
			if (state.pullRequest.state === "closed" && permitted("reactivate"))
				primary = {
					label: "Reactivate",
					action: "reactivate",
					onSelect() {
						return mutate("reactivate", { confirm: true });
					},
				};
			if (primary) actionControls(host, primary, []);
		}
		if (focused && !host.contains(document.activeElement)) {
			const replacement = [
				...host.querySelectorAll("button[data-action]"),
			].find(
				(button) =>
					button instanceof HTMLElement &&
					button.dataset.action === focusedAction,
			);
			const focusTarget =
				replacement ?? host.querySelector("button") ?? fallbackFocus();
			if (focusTarget instanceof HTMLElement) focusTarget.focus();
		}
	}

	function render() {
		const state = getSnapshot();
		const currentMutation = JSON.stringify(state.mutation);
		if (currentMutation !== mutationKey) {
			mutationKey = currentMutation;
			if (state.mutation?.status === "ready" && state.mutation.message)
				announce(state.mutation.message, {
					transient: true,
					title: "Pull request update",
				});
		}
		if (
			titleEditor &&
			(titleEditor.bindingRevision !== state.bindingRevision ||
				!permitted("edit"))
		)
			closeTitleEditor({ renderView: false });
		if (
			descriptionEditor &&
			(descriptionEditor.bindingRevision !== state.bindingRevision ||
				!permitted("edit"))
		)
			closeDescriptionEditor({ renderView: false });
		const key = JSON.stringify([state.pullRequest, permissionKey()]);
		const reviewerHost = el("reviewer-actions");
		if (!permitted("reviewer") && reviewerHost.hasChildNodes()) {
			const focusedReviewerControl = reviewerHost.contains(
				document.activeElement,
			);
			closePopupWithin(reviewerHost);
			reviewerHost.replaceChildren();
			for (const form of forms) if (!form.isConnected) forms.delete(form);
			if (focusedReviewerControl) fallbackFocus().focus();
		}
		renderPullRequestActions(state);
		const editing = [
			"comment-actions",
			"reviewer-actions",
			"description-editor",
		].some((id) => isEditing(el(id)));
		if (key !== presentationKey && !editing) {
			presentationKey = key;
			accessKey = permissionKey();
			const commentHost = el("comment-actions");
			const focusedHost = [commentHost, reviewerHost].find((element) =>
				element.contains(document.activeElement),
			);
			const focusedAction =
				document.activeElement instanceof HTMLElement
					? document.activeElement
							.closest("[data-action]")
							?.getAttribute("data-action")
					: undefined;
			for (const element of [commentHost, reviewerHost])
				closePopupWithin(element);
			commentHost.replaceChildren();
			reviewerHost.replaceChildren();
			for (const form of forms) if (!form.isConnected) forms.delete(form);
			const writable =
				!state.selectedCommitId && state.access?.operations?.length > 0;
			commentComposer(commentHost);
			if (permitted("reviewer"))
				disclosure(reviewerHost, "Add reviewer", reviewerSearchForm);
			if (focusedHost && document.activeElement === document.body) {
				const replacement = [
					...focusedHost.querySelectorAll("button[data-action]"),
				].find(
					(button) =>
						button instanceof HTMLElement &&
						button.dataset.action === focusedAction,
				);
				const focusTarget =
					replacement ?? focusedHost.querySelector("button") ?? fallbackFocus();
				if (focusTarget instanceof HTMLElement) focusTarget.focus();
			}
		}
		el("edit-title").hidden = !state.pullRequest || !permitted("edit");
		el("edit-description").hidden = !state.pullRequest || !permitted("edit");
		renderReview();
		syncReadiness();
	}

	function renderReview() {
		const state = getSnapshot();
		const drafts = state.reviewState?.drafts ?? [];
		const key = JSON.stringify([
			state.pullRequest?.state,
			drafts,
			permissionKey(),
		]);
		const host = el("review-actions");
		const controlHost = el("review-control");
		const access = permissionKey();
		if (
			key === reviewKey ||
			(reviewAccessKey === access &&
				(isEditing(host) || isEditing(controlHost)))
		)
			return;
		reviewKey = key;
		reviewAccessKey = access;
		const focused =
			host.contains(document.activeElement) ||
			controlHost.contains(document.activeElement);
		const focusedAction =
			document.activeElement instanceof HTMLElement
				? document.activeElement
						.closest("[data-action]")
						?.getAttribute("data-action")
				: undefined;
		closePopupWithin(controlHost);
		host.replaceChildren();
		controlHost.replaceChildren();
		const canVote = state.pullRequest?.state === "open" && permitted("vote");
		if (!canVote && !drafts.length) {
			if (focused) fallbackFocus().focus();
			return;
		}
		if (canVote) {
			const entries = [...voteOptions.slice(1), ["0", "Reset feedback"]].map(
				([value, label]) => ({
					label,
					danger: value === "-10",
					onSelect() {
						return mutate("vote", { vote: Number(value) });
					},
				}),
			);
			actionControls(
				controlHost,
				{ ...entries[0], variant: "default" },
				entries,
				"Review options",
			);
		}
		const title = node(
			"h3",
			`Staged comments${drafts.length ? ` \u00b7 ${drafts.length}` : ""}`,
		);
		title.tabIndex = -1;
		if (drafts.length) host.append(title);
		for (const draft of drafts.slice(0, 100)) {
			const row = node("div", "", "staged-comment");
			row.append(
				node(
					"p",
					draft.anchor
						? `${draft.anchor.path}:${draft.anchor.startLine} (${draft.anchor.side})`
						: "General comment",
					"row-meta",
				),
			);
			const content = node("div", "", "markdown");
			renderMarkdown(content, draft.content);
			row.append(content);
			if (!canEditState()) {
				host.append(row);
				continue;
			}
			disclosure(row, "Edit staged comment", (form, close) => {
				const content = field(form, "Comment", "textarea", draft.content);
				content.required = true;
				conclude(form, close, "Save draft", () =>
					saveState(() => ({
						drafts: (getSnapshot().reviewState?.drafts ?? []).map((entry) =>
							entry.id === draft.id
								? { ...entry, content: content.value }
								: entry,
						),
					})),
				);
			});
			row.append(
				writeControl(
					button(
						"Remove staged comment",
						() =>
							void saveState(() => ({
								drafts: (getSnapshot().reviewState?.drafts ?? []).filter(
									(entry) => entry.id !== draft.id,
								),
							})),
					),
				),
			);
			host.append(row);
		}
		if (drafts.length && permitted("review")) {
			const submit = writeControl(
				button("Submit staged comments", () => {
					void mutate("review", {});
				}),
			);
			submit.classList.add("staged-comment-submit");
			submit.dataset.action = "Submit staged comments";
			host.append(submit);
		}
		if (focused) {
			const replacement = [
				...controlHost.querySelectorAll("button[data-action]"),
				...host.querySelectorAll("button[data-action]"),
			].find(
				(control) =>
					control instanceof HTMLElement &&
					control.dataset.action === focusedAction,
			);
			if (replacement instanceof HTMLElement) replacement.focus();
			else if (title.isConnected) title.focus();
			else (controlHost.querySelector("button") ?? fallbackFocus()).focus();
		}
	}

	const editTitleControl = writeControl(el("edit-title"));
	editTitleControl.dataset.action = "Edit pull request title";
	editTitleControl.addEventListener("click", () => {
		if (editTitleControl.getAttribute("aria-disabled") !== "true")
			startTitleEdit();
	});
	const editDescriptionControl = writeControl(el("edit-description"));
	editDescriptionControl.dataset.action = "Edit pull request description";
	editDescriptionControl.addEventListener("click", () => {
		if (editDescriptionControl.getAttribute("aria-disabled") !== "true")
			startDescriptionEdit();
	});

	return {
		allowed,
		canSaveState,
		fixAction,
		fixCooling: (control) => requestedThreads.has(control.dataset.fixKey),
		setFixLabel,
		unrequestedFixThreads,
		isEditing,
		render,
		saveState,
		mutationError(message) {
			return replyResolutionRecovery || message;
		},
		selectionMenu(host, entries, label) {
			return actionMenu(host, entries, { label, readOnly: true });
		},
		clear() {
			closePopupWithin(document);
			closeTitleEditor({ renderView: false });
			generation++;
			writeBusy = stateBusy = false;
			replyResolutionRecovery = "";
			requestedThreads.clear();
			stateQueue = Promise.resolve();
			presentationKey =
				pullRequestActionsKey =
				reviewKey =
				reviewAccessKey =
				accessKey =
				mutationKey =
					"";
			for (const form of forms) form.remove();
			forms.clear();
			for (const id of [
				"pr-actions",
				"comment-actions",
				"reviewer-actions",
				"description-editor",
				"review-actions",
				"review-control",
			])
				el(id).replaceChildren();
			el("edit-title").hidden = true;
			el("edit-description").hidden = true;
			descriptionEditor = null;
			delete el("details").dataset.descriptionEditing;
			if (el("mutation-status")) el("mutation-status").textContent = "";
		},
		threadLink(host, thread, authorName) {
			const trigger = button("", () => {
				void copyThreadLink(thread);
			});
			trigger.classList.add("comment-copy-link");
			trigger.dataset.action = "Copy comment thread link";
			trigger.setAttribute(
				"aria-label",
				`Copy link, comment thread ${thread.id} by ${authorName ?? "unknown author"}`,
			);
			trigger.append(createGitHubLinkIcon());
			host.append(trigger);
		},
		comment(host, formHost, thread, comment) {
			const ownComment = comment.author?.id === getSnapshot().access?.viewerId;
			/** @type {Array<{label: string, icon: () => SVGSVGElement, onSelect?: () => void, build?: (form: HTMLElement, close: () => void) => void, danger?: boolean, separatorBefore?: boolean, formName?: string, floating?: boolean}>} */
			const entries = [];
			if (ownComment && permitted("edit-comment"))
				entries.push({
					label: "Edit",
					icon: createGitHubPencilIcon,
					formName: "Edit comment",
					build(form, close) {
						buildTextAction(
							form,
							close,
							"Save comment",
							"edit-comment",
							{ threadId: thread.id, commentId: comment.id },
							comment.content,
						);
					},
				});
			if (ownComment && permitted("delete-comment"))
				entries.push({
					label: "Delete",
					icon: createGitHubTrashIcon,
					danger: true,
					separatorBefore: true,
					formName: "Delete comment",
					floating: true,
					build(form, close) {
						form.append(
							node(
								"p",
								"Delete this comment permanently? This action cannot be undone.",
							),
						);
						conclude(
							form,
							close,
							"Delete comment",
							() =>
								mutate("delete-comment", {
									threadId: thread.id,
									commentId: comment.id,
								}),
							"danger",
						);
					},
				});
			if (!entries.length) return;
			actionMenu(host, entries, {
				label: `Actions for ${comment.author?.name ?? "comment"}`,
				iconOnly: true,
				formHost,
				readOnly: true,
				triggerIcon: "ellipsis",
			});
		},
		thread(host, thread) {
			const actions = node("div", "", "thread-actions");
			host.append(actions);
			const reply = textAction(actions, "Reply", "reply", {
				threadId: thread.id,
			});
			reply?.classList.add("thread-reply-button");
			if (
				canShowFixes() &&
				["active", "pending"].includes(thread.status) &&
				manualFixComment(thread)
			)
				actions.append(
					fixAction("Fix", () => ({
						kind: "discussion",
						threadIds: [thread.id],
					})),
				);
			let statusEntries = null;
			let status = null;
			if (permitted("thread-status")) {
				const resolved = ["fixed", "wontFix", "closed", "byDesign"].includes(
					thread.status,
				);
				const primaryStatus = resolved ? "active" : "fixed";
				status = {
					label: resolved ? "Reopen" : "Resolve",
					action: "thread-status",
					variant: "default",
					onSelect() {
						return mutate("thread-status", {
							threadId: thread.id,
							status: primaryStatus,
						});
					},
				};
				statusEntries = [
					["active", "Active"],
					["pending", "Pending"],
					["wontFix", "Won't fix"],
					["fixed", "Resolve"],
					["closed", "Close"],
				]
					.filter(
						([value]) => value !== thread.status && value !== primaryStatus,
					)
					.map(([value, label]) => ({
						label,
						onSelect() {
							return mutate("thread-status", {
								threadId: thread.id,
								status: value,
							});
						},
					}));
			}
			if (status)
				actionControls(
					actions,
					status,
					statusEntries ?? [],
					"Change comment status",
				);
			if (!actions.hasChildNodes()) actions.remove();
		},
		reviewer(host, reviewer) {
			if (!permitted("reviewer")) return;
			const trigger = actionMenu(
				host,
				[
					{
						label: `Remove ${reviewer.name}`,
						danger: true,
						onSelect() {
							return mutate("reviewer", {
								reviewerId: reviewer.id,
								remove: true,
							});
						},
					},
				],
				{
					label: `Options for ${reviewer.name}`,
					iconOnly: true,
					triggerIcon: "ellipsis",
				},
			);
			trigger.classList.add("reviewer-options");
		},
		policy(host, policy) {
			disclosure(
				host,
				"Policy details",
				(form, close) => {
					form.append(
						node(
							"p",
							policy.description || `${policy.name}: ${policy.status}`,
							"remote-text",
						),
					);
					const url = sanitizeExternalUrl(policy.url);
					if (url) {
						const link = node("div");
						renderMarkdown(link, `[Open build](<${url}>)`);
						form.append(link);
					}
					if (policy.buildId) {
						confirm(
							form,
							"Rerun build",
							"build-retry",
							{ buildId: policy.buildId },
							"Queue another run of this build?",
						);
						confirm(
							form,
							"Cancel build",
							"build-cancel",
							{ buildId: policy.buildId },
							"Cancel this running build?",
						);
					}
					form.append(button("Close details", close));
				},
				{ telemetryStage: "policy", readOnly: true },
			);
		},
	};
}
