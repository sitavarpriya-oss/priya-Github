// Adapted from Microsoft azure-devops-copilot-plugin ui/connection-view.mjs
// at 8f30ba3210758239be19e2143943e0830f07601a. See THIRD_PARTY_NOTICES.txt.

import {
	createGitHubRepoIcon,
	createGitHubReturnIcon,
} from "./github-ui-icons.mjs";
import {
	authorizationRecovery,
	canConfirm,
	confirmDisabledReason,
	fieldNames,
	pickerErrorMessage,
} from "./repository-picker-state.mjs";

// Collate only in the guest, using the WebView locale rather than the process locale.
const nameCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function element(tagName, className, text) {
	const node = document.createElement(tagName);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

const labels = {
	organization: "Organization",
	project: "Project",
	repository: "Repository",
};
const plurals = {
	organization: "organizations",
	project: "projects",
	repository: "repositories",
};
const flatSearchPrompt =
	"Search or type org/project/repo, or paste a URL\u2026";

function field(
	name,
	onCommand,
	announce,
	onEdit,
	signal,
	onInteraction,
	inline = false,
	onQuickFill = undefined,
) {
	const wrapper = element("div", "picker-field");
	const id = inline ? "repository-search" : name;
	const label = element(
		inline ? "div" : "label",
		"field-label",
		inline ? "Repositories" : labels[name],
	);
	if (!inline) label.htmlFor = id;
	label.id = `${id}-label`;
	const input = element("input", "picker-input");
	input.id = id;
	input.type = "text";
	input.autocomplete = "off";
	input.spellcheck = false;
	input.readOnly = true;
	input.placeholder = inline ? flatSearchPrompt : `Search ${plurals[name]}`;
	input.setAttribute("role", "combobox");
	input.setAttribute("aria-expanded", "false");
	input.setAttribute("aria-required", String(!inline));
	input.setAttribute("aria-disabled", "true");
	if (inline) input.setAttribute("aria-label", flatSearchPrompt);
	const describedBy = `${id}-hint${inline ? " quick-fill-error" : ""} request-error`;
	input.setAttribute("aria-describedby", describedBy);
	const list = element("div", "picker-options");
	if (inline) {
		wrapper.classList.add("flat-picker");
		list.classList.add("flat-options");
	}
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-labelledby", label.id);
	list.hidden = true;
	const hint = element("p", "field-hint", "Loading picker...");
	hint.id = `${id}-hint`;
	const retry = element("button", "inline-retry", "Retry");
	retry.type = "button";
	retry.setAttribute("aria-label", `Retry ${plurals[name]}`);
	retry.hidden = true;
	const feedback = element("div", "field-feedback");
	feedback.append(hint, retry);
	wrapper.append(input, label, list, feedback);
	const tooltip = inline ? element("div", "repository-path-tooltip") : null;
	if (tooltip) {
		tooltip.hidden = true;
		tooltip.setAttribute("aria-hidden", "true");
		wrapper.append(tooltip);
		tooltip.addEventListener(
			"pointermove",
			(event) => {
				pointerPosition = { x: event.clientX, y: event.clientY };
			},
			{ signal },
		);
		list.addEventListener(
			"pointerleave",
			(event) => {
				if (!tooltipKeyboard && !tooltip.contains(event.relatedTarget))
					hideTooltip();
			},
			{ signal },
		);
		tooltip.addEventListener(
			"pointerleave",
			() => {
				if (!tooltipKeyboard) hideTooltip();
			},
			{ signal },
		);
	}

	let state;
	let filtering = false;
	let expanded = inline;
	let visibleValues = [];
	let activeId = null;
	let rendered = "";
	let frozen = false;
	let composing = false;
	let urlMode = false;
	let positionedScrollX = 0;
	let positionedScrollY = 0;
	let tooltipScrollTop = 0;
	let tooltipKeyboard = false;
	let pointerPosition = null;
	let keyboardActive = false;
	let pointerFocus = false;

	function hideTooltip() {
		if (tooltip) tooltip.hidden = true;
	}

	function showTooltip(option, keyboard) {
		hideTooltip();
		if (!tooltip || !option || frozen || urlMode || list.hidden) return;
		const name = option.querySelector(".repository-name");
		if (!name || name.scrollWidth <= name.clientWidth) return;
		const anchor = option.getBoundingClientRect();
		tooltip.textContent = name.textContent;
		tooltip.style.top = "0px";
		tooltip.hidden = false;
		const { width, height } = tooltip.getBoundingClientRect();
		tooltip.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
		tooltip.style.top = `${anchor.bottom + height <= window.innerHeight - 8 ? anchor.bottom : Math.max(8, anchor.top - height)}px`;
		tooltipScrollTop = list.scrollTop;
		tooltipKeyboard = keyboard;
	}

	function positionOptions() {
		// Measure only on opening or changed results, never for list scrolling.
		let anchor = input.getBoundingClientRect();
		list.style.left = `${anchor.left}px`;
		list.style.width = `${anchor.width}px`;
		list.style.top = "0px";
		list.style.blockSize = "0px";
		const desired = list.scrollHeight + 2;
		let below = Math.max(0, window.innerHeight - anchor.bottom - 12);
		const minimum = Math.min(desired, 96);
		if (below < minimum) {
			// The guest's bottom padding reserves space for downward results.
			// Keep that extent stable so dismissing cannot move a pointer target.
			window.scrollBy({ top: minimum - below, behavior: "instant" });
			anchor = input.getBoundingClientRect();
			below = Math.max(0, window.innerHeight - anchor.bottom - 12);
			list.style.left = `${anchor.left}px`;
			list.style.width = `${anchor.width}px`;
		}
		const height = Math.min(desired, below);
		list.style.blockSize = `${height}px`;
		list.style.top = `${anchor.bottom + 4}px`;
		positionedScrollX = window.scrollX;
		positionedScrollY = window.scrollY;
	}

	function close(user = false) {
		hideTooltip();
		if (inline) return;
		if (expanded && user === true) onInteraction("collapse", name);
		expanded = false;
		keyboardActive = false;
		list.dataset.keyboardActive = "false";
		list.hidden = true;
		activeId = null;
		for (const option of list.children) option.dataset.active = "false";
		input.setAttribute("aria-expanded", "false");
		input.removeAttribute("aria-activedescendant");
	}

	function message() {
		if (inline) {
			if (state?.quickFillPending) return "Looking up this Azure DevOps URL...";
			if (!state || state.status === "loading")
				return "Searching repositories...";
			if (state.status === "error")
				return (
					pickerErrorMessage(state.errorCode) ??
					state.error ??
					"Could not load repositories. Retry the list."
				);
			if (state.query.includes("://"))
				return state.repositoryUrl
					? "Submit to connect using this URL, or clear it to search."
					: "Press Enter to find this repository.";
			return !state.options.length
				? (state.emptyMessage ??
						"No matching repositories. Try a different search.")
				: state.truncated
					? `Only the first ${visibleValues.length} matching repositories are shown. Narrow your search to see others.`
					: state.discoveryLimited
						? "Results are limited. Specify 'org/project/repo' or a URL to find exact matches."
						: `${visibleValues.length} repositories available.`;
		}
		if (!state) return "Loading picker...";
		if (state.status === "idle") {
			if (name === "organization")
				return "Clear the repository URL to browse organizations.";
			return name === "project"
				? "Choose an organization first."
				: "Choose a project first.";
		}
		if (state.status === "loading") return `Loading ${plurals[name]}...`;
		if (state.status === "error")
			return (
				pickerErrorMessage(state.error) ?? `Could not load ${plurals[name]}.`
			);
		if (state.options.length === 0 && name === "organization")
			return "No organizations are available. Retry or check your Azure DevOps access.";
		if (state.options.length === 0)
			return `No ${plurals[name]} are available here. Retry or choose a different ${name === "repository" ? "project" : "organization"}.`;
		const query = input.value.trim().toLocaleLowerCase();
		if (
			filtering &&
			query &&
			!state.options.some((item) =>
				item.name.toLocaleLowerCase().includes(query),
			)
		) {
			return `No matching ${plurals[name]}. Try a different search.`;
		}
		if (expanded) return `${visibleValues.length} ${plurals[name]} available.`;
		return state.selected ? "" : "Choose a result from the list.";
	}

	function setActive(id, source = null) {
		hideTooltip();
		if (source === "keyboard") keyboardActive = true;
		else if (source === "pointer") keyboardActive = false;
		list.dataset.keyboardActive = String(keyboardActive);
		activeId = id;
		for (const option of list.children) {
			option.dataset.active = String(option.dataset.id === id);
		}
		const active = [...list.children].find(
			(option) => option.dataset.id === id,
		);
		if (active) {
			input.setAttribute("aria-activedescendant", active.id);
			// Only scroll the results, not the guest document behind the popup.
			const top = active.offsetTop;
			const bottom = top + active.offsetHeight;
			if (top < list.scrollTop) list.scrollTop = top;
			else if (bottom > list.scrollTop + list.clientHeight)
				list.scrollTop = bottom - list.clientHeight;
			if (source) showTooltip(active, source === "keyboard");
		} else {
			input.removeAttribute("aria-activedescendant");
		}
	}

	function choose(value) {
		if (frozen || urlMode) return;
		if (!inline) input.value = value.name;
		close();
		onCommand({ type: "choose", field: name, id: value.id });
	}

	function renderOptions() {
		const query =
			!inline && filtering ? input.value.trim().toLocaleLowerCase() : "";
		visibleValues = (state?.options ?? []).filter(
			(item) => !query || item.name.toLocaleLowerCase().includes(query),
		);
		if (!inline) {
			visibleValues.sort(
				(a, b) =>
					nameCollator.compare(a.name, b.name) ||
					(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
			);
		}
		const signature = JSON.stringify([
			visibleValues.map(({ id, name }) => [id, name]),
			state?.selected?.id,
		]);
		const changed = signature !== rendered;
		const wasHidden = list.hidden;
		if (changed) {
			rendered = signature;
			list.replaceChildren();
			for (const [index, value] of visibleValues.entries()) {
				const option = element("div", "picker-option");
				option.id = `${id}-option-${index}`;
				option.dataset.id = value.id;
				option.setAttribute("role", "option");
				option.setAttribute(
					"aria-selected",
					String(value.id === state?.selected?.id),
				);
				if (inline) {
					const icon = element("span", "repository-icon");
					icon.setAttribute("aria-hidden", "true");
					icon.append(createGitHubRepoIcon("", 16));
					option.append(icon);
				}
				option.append(element("span", "repository-name", value.name));
				if (inline && value.id === state?.selected?.id) {
					const check = element("span", "", "\u2713");
					check.setAttribute("aria-hidden", "true");
					option.append(check);
				}
				if (inline) {
					const returnHint = element("span", "return-hint");
					returnHint.setAttribute("aria-hidden", "true");
					returnHint.append(createGitHubReturnIcon(""));
					option.append(returnHint);
				}
				if (inline) {
					const activateFromPointer = (event) => {
						if (frozen || urlMode) return;
						const last = pointerPosition;
						pointerPosition = { x: event.clientX, y: event.clientY };
						if (
							keyboardActive &&
							(!last || (last.x === event.clientX && last.y === event.clientY))
						)
							return;
						keyboardActive = false;
						if (activeId !== value.id || event.type === "pointerenter")
							setActive(value.id, "pointer");
					};
					option.addEventListener("pointerenter", activateFromPointer);
					option.addEventListener("pointermove", activateFromPointer);
				}
				option.addEventListener("pointerdown", (event) => {
					event.preventDefault();
					if (inline) {
						pointerFocus = true;
						keyboardActive = false;
						list.dataset.keyboardActive = "false";
						input.focus({ preventScroll: true });
					}
				});
				option.addEventListener("click", () => choose(value));
				list.append(option);
			}
		}
		list.hidden = !expanded || visibleValues.length === 0;
		input.setAttribute("aria-expanded", String(!list.hidden));
		hint.textContent = message();
		feedback.hidden = urlMode || !hint.textContent;
		feedback.classList.toggle(
			"sr-only",
			(!inline && (input.readOnly || state?.status === "loading")) ||
				(state?.status === "ready" &&
					state.options.length > 0 &&
					visibleValues.length > 0 &&
					(!inline || (!state.truncated && !state.discoveryLimited))),
		);
		if (!inline && !list.hidden && (changed || wasHidden)) {
			positionOptions();
		}
		if (changed || wasHidden) {
			setActive(
				!list.hidden && visibleValues.some((value) => value.id === activeId)
					? activeId
					: inline
						? (visibleValues[0]?.id ?? null)
						: null,
			);
		}
	}

	function open(filter, user = false) {
		if (frozen || urlMode || !state || state.status === "idle") return;
		if (!expanded && user) onInteraction("expand", name);
		filtering = filter;
		expanded = true;
		renderOptions();
		announce(`${labels[name]}: ${hint.textContent}`);
	}

	input.addEventListener(
		"input",
		(event) => {
			hideTooltip();
			onEdit();
			if (frozen || urlMode) return;
			filtering = true;
			onCommand({ type: "query", field: name, value: input.value });
			const pasted =
				event instanceof InputEvent && event.inputType === "insertFromPaste";
			if (inline && !pasted) {
				keyboardActive = true;
				list.dataset.keyboardActive = "true";
			}
			onQuickFill?.(input.value, pasted);
			open(true);
		},
		{ signal },
	);
	input.addEventListener(
		"compositionstart",
		() => {
			composing = true;
			onEdit();
		},
		{ signal },
	);
	input.addEventListener(
		"compositionend",
		() => {
			composing = false;
			onEdit();
		},
		{ signal },
	);
	input.addEventListener(
		"pointerdown",
		() => {
			if (!inline) return;
			pointerFocus = true;
			keyboardActive = false;
			list.dataset.keyboardActive = "false";
		},
		{ signal },
	);
	input.addEventListener(
		"focus",
		() => {
			if (!inline) return;
			keyboardActive = !pointerFocus;
			pointerFocus = false;
			list.dataset.keyboardActive = String(keyboardActive);
		},
		{ signal },
	);
	input.addEventListener("click", () => open(false, true), { signal });
	input.addEventListener(
		"keydown",
		(event) => {
			if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
				return;
			if ((frozen || urlMode) && event.key !== "Escape" && event.key !== "Tab")
				return;
			if (
				inline &&
				(event.key === "Home" || event.key === "End") &&
				visibleValues.length > 0
			) {
				event.preventDefault();
				if (!expanded) open(false, true);
				setActive(
					event.key === "Home"
						? visibleValues[0].id
						: visibleValues[visibleValues.length - 1].id,
					"keyboard",
				);
			} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				if (!state || state.status === "idle") return;
				event.preventDefault();
				if (!expanded) open(false, true);
				const index = visibleValues.findIndex((value) => value.id === activeId);
				const next =
					index < 0
						? event.key === "ArrowDown"
							? 0
							: visibleValues.length - 1
						: (index +
								(event.key === "ArrowDown" ? 1 : -1) +
								visibleValues.length) %
							visibleValues.length;
				setActive(visibleValues[next]?.id ?? null, "keyboard");
			} else if (event.key === "Enter") {
				// A search field never implicitly submits the whole form.
				event.preventDefault();
				const value = visibleValues.find((item) => item.id === activeId);
				if (expanded && value) choose(value);
				else if (onQuickFill && input.value.includes("://"))
					onQuickFill(input.value, true);
			} else if (event.key === "Escape" && tooltip && !tooltip.hidden) {
				event.preventDefault();
				hideTooltip();
			} else if (!inline && event.key === "Escape" && expanded) {
				if (!list.hidden) event.preventDefault();
				close(true);
			} else if (event.key === "Tab") {
				close();
			}
		},
		{ signal },
	);
	input.addEventListener(
		"blur",
		() => {
			if (inline) {
				pointerFocus = false;
				keyboardActive = false;
				list.dataset.keyboardActive = "false";
				hideTooltip();
			}
			close();
		},
		{ signal },
	);
	window.addEventListener("resize", () => close(), { signal });
	document.addEventListener(
		"scroll",
		(event) => {
			if (event.target === list && list.scrollTop !== tooltipScrollTop)
				hideTooltip();
			if (
				expanded &&
				!list.hidden &&
				event.target === document &&
				(window.scrollX !== positionedScrollX ||
					window.scrollY !== positionedScrollY)
			)
				close();
		},
		{ capture: true, signal },
	);
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (!wrapper.contains(event.target)) close(true);
		},
		{ signal },
	);
	retry.addEventListener(
		"click",
		() => {
			if (frozen || urlMode) return;
			input.focus();
			onCommand({ type: "retry", field: name });
		},
		{ signal },
	);

	return {
		wrapper,
		input,
		hint,
		isComposing: () => composing,
		freeze(value) {
			frozen = value;
			input.readOnly = frozen || urlMode || !state || state.status === "idle";
			input.setAttribute("aria-disabled", String(input.readOnly));
			input.setAttribute(
				"aria-describedby",
				frozen ? "selection-help request-error" : describedBy,
			);
			retry.setAttribute("aria-disabled", String(frozen || urlMode));
			if (frozen) close();
		},
		update(next, resync, useUrl = false) {
			urlMode = useUrl;
			input.setAttribute("aria-required", String(!inline && !urlMode));
			retry.setAttribute("aria-disabled", String(frozen || urlMode));
			const mayPatchQuery =
				resync ||
				!state ||
				input.value === state.query ||
				next.query !== state.query;
			state = next;
			// Keep the original input node and do not disturb its caret on async patches.
			if (!frozen && !composing && mayPatchQuery && input.value !== next.query)
				input.value = next.query;
			input.readOnly = frozen || urlMode || next.status === "idle";
			input.setAttribute("aria-disabled", String(input.readOnly));
			wrapper.dataset.blocked = String(next.status === "idle");
			input.placeholder = inline
				? flatSearchPrompt
				: next.status === "idle"
					? message()
					: `Search ${plurals[name]}`;
			input.setAttribute(
				"aria-invalid",
				String(
					(!urlMode && next.status === "error") ||
						Boolean(next.validationError),
				),
			);
			if (input.readOnly) close();
			retry.hidden =
				urlMode ||
				!(
					next.status === "error" ||
					(!inline && next.status === "ready" && !next.options.length)
				);
			renderOptions();
		},
	};
}

export function renderRepositoryPicker(
	container,
	{
		onCommand,
		onQuickFill,
		onReload,
		completionOwner = "guest",
		onInteraction = (_action, _stage) => {},
	},
) {
	const events = new AbortController();
	const form = element("form", "picker-form");
	const live = element("div", "sr-only");
	live.setAttribute("aria-live", "polite");
	live.setAttribute("aria-atomic", "true");
	let announcement;
	let queuedMessage;
	let previousState;
	let frozen = false;
	let quickFillPending = false;
	let editVersion = 0;
	let initialFlatFocusApplied = false;
	const visibleFields = () =>
		fieldNames.filter((name) => !fields[name].wrapper.hidden);
	function announce(message) {
		if (queuedMessage === message) return;
		queuedMessage = message;
		clearTimeout(announcement);
		announcement = setTimeout(() => {
			if (live.isConnected && live.textContent !== message)
				live.textContent = message;
		}, 200);
	}
	const quickFill = element("section", "quick-fill");
	const urlLabel = element("label", "field-label", "URL (quick fill)");
	urlLabel.htmlFor = "repository-url";
	const urlInput = element("input", "picker-input");
	urlInput.id = "repository-url";
	urlInput.type = "text";
	urlInput.autocomplete = "off";
	urlInput.spellcheck = false;
	urlInput.placeholder =
		"https://dev.azure.com/organization/project/_git/repository";
	urlInput.setAttribute("aria-describedby", "quick-fill-error");
	const quickFillError = element("p", "request-error");
	quickFillError.id = "quick-fill-error";
	quickFillError.hidden = true;
	quickFill.append(urlLabel, urlInput, quickFillError);
	let quickFillErrorCode;
	let urlComposing = false;
	urlInput.addEventListener(
		"compositionstart",
		() => {
			urlComposing = true;
		},
		{ signal: events.signal },
	);
	urlInput.addEventListener(
		"compositionend",
		() => {
			urlComposing = false;
		},
		{ signal: events.signal },
	);
	function showQuickFillError(message, code) {
		quickFillErrorCode = code;
		quickFillError.textContent = message;
		quickFillError.hidden = !message;
		const input = previousState?.results ? flat.input : urlInput;
		input.setAttribute(
			"aria-invalid",
			String(Boolean(message) || previousState?.results?.status === "error"),
		);
		updateRecovery(previousState);
		if (message) announce(message);
	}
	urlInput.addEventListener(
		"input",
		() => {
			editVersion += 1;
			showQuickFillError("");
			onQuickFill(urlInput.value, false);
		},
		{ signal: events.signal },
	);
	urlInput.addEventListener(
		"keydown",
		(event) => {
			if (event.key !== "Enter" || event.isComposing || urlComposing) return;
			event.preventDefault();
			if (frozen) return;
			onQuickFill(urlInput.value, true);
		},
		{ signal: events.signal },
	);
	const fields = Object.fromEntries(
		fieldNames.map((name) => [
			name,
			field(
				name,
				onCommand,
				announce,
				() => {
					editVersion += 1;
					showQuickFillError("");
				},
				events.signal,
				onInteraction,
			),
		]),
	);
	const flat = field(
		"repository",
		(command) => {
			onCommand(
				command.type === "query"
					? { type: "search", value: command.value }
					: command.type === "choose"
						? { type: "choose-result", id: command.id }
						: { type: "retry-search" },
			);
		},
		announce,
		() => {
			editVersion += 1;
		},
		events.signal,
		onInteraction,
		true,
		onQuickFill,
	);
	flat.wrapper.hidden = true;
	const accountRecovery = element("section", "account-empty");
	accountRecovery.hidden = true;
	const emptyTitle = element("h2", "", "Add a Microsoft account");
	emptyTitle.hidden = true;
	const accountDescription = element("p", "field-hint");
	accountDescription.id = "account-recovery-description";
	const emptyIntro = element("div", "account-empty-intro");
	emptyIntro.append(emptyTitle, accountDescription);
	const settings = element("a", "account-settings", "Open Account settings");
	settings.href = "ghapp://settings/account";
	settings.target = "_blank";
	settings.rel = "noopener noreferrer";
	settings.setAttribute("aria-describedby", accountDescription.id);
	settings.addEventListener(
		"click",
		() => onInteraction("settings", "account"),
		{ signal: events.signal },
	);
	const checkAccounts = element("button", "inline-retry", "check again");
	checkAccounts.type = "button";
	const emptyHelp = element("p", "field-hint");
	emptyHelp.hidden = true;
	const retryContext = element(
		"span",
		"",
		completionOwner === "host"
			? "Already signed in? "
			: "After adding your account, close Settings and ",
	);
	retryContext.id = "account-empty-help";
	checkAccounts.setAttribute("aria-describedby", retryContext.id);
	emptyHelp.append(retryContext, checkAccounts, ".");
	checkAccounts.addEventListener(
		"click",
		() => {
			if (
				frozen ||
				previousState?.fields.organization.status !== "error" ||
				previousState.fields.organization.error !== "account_required"
			)
				return;
			onCommand(
				previousState.results
					? { type: "retry-search" }
					: { type: "retry", field: "organization" },
			);
		},
		{ signal: events.signal },
	);
	accountRecovery.append(emptyIntro, settings, emptyHelp);
	function updateRecovery(state) {
		const needsAccount = quickFillErrorCode === "account_required";
		const failures = state?.repositoryUrl
			? []
			: [
					...fieldNames.map((name) => state?.fields[name]),
					state?.results && {
						...state.results,
						error: state.results.errorCode,
					},
				].filter((field) => field?.status === "error");
		const failure = failures.find((field) =>
			authorizationRecovery(field.error),
		);
		const hadFocus = accountRecovery.contains(document.activeElement);
		accountRecovery.hidden = !(
			!emptyTitle.hidden ||
			needsAccount ||
			failure ||
			authorizationRecovery(quickFillErrorCode)
		);
		settings.hidden = false;
		emptyHelp.hidden = emptyTitle.hidden;
		const account = failure?.authorization;
		accountDescription.textContent =
			!emptyTitle.hidden || needsAccount
				? "Sign in with a Microsoft account to browse your Azure DevOps repositories."
				: account
					? `Microsoft account: ${account.secondaryLabel ? `${account.name} (${account.secondaryLabel})` : account.name}.`
					: "Update authorization for your Microsoft account in Account settings.";
		if (hadFocus && accountRecovery.hidden) {
			const name = visibleFields().find(
				(name) => state?.fields[name].status !== "idle",
			);
			if (state.results) flat.input.focus();
			else if (name) fields[name].input.focus();
		}
	}
	form.append(quickFill, accountRecovery);
	form.append(...fieldNames.map((name) => fields[name].wrapper));
	form.append(flat.wrapper);
	const result = element("section", "selection");
	result.id = "selected-repository";
	result.hidden = true;
	const resultTitle = element("h2", "", "Repository selected");
	const path = element("p", "selected-path");
	path.dataset.selectable = "true";
	result.append(resultTitle, path);
	let deferDescription = false;
	function syncRepositoryDescription() {
		fields.repository.input.setAttribute(
			"aria-describedby",
			`${frozen ? "selection-help" : "repository-hint"} request-error${!result.hidden && !deferDescription ? " selected-repository" : ""}`,
		);
	}
	fields.repository.input.addEventListener(
		"blur",
		() => {
			deferDescription = false;
			syncRepositoryDescription();
		},
		{ signal: events.signal },
	);
	const error = element("p", "request-error");
	error.id = "request-error";
	error.hidden = true;
	const reload = element("button", "secondary", "Reload picker");
	reload.type = "button";
	reload.hidden = true;
	reload.addEventListener(
		"click",
		() => {
			if (frozen) return;
			const first = visibleFields()[0];
			if (first) fields[first].input.focus();
			onReload();
		},
		{ signal: events.signal },
	);
	const help = element(
		"p",
		"sr-only",
		"Choose an organization, project and repository first.",
	);
	help.id = "selection-help";
	const select = element("button", "primary", "Select repository");
	select.type = "submit";
	select.setAttribute("aria-disabled", "true");
	select.setAttribute("aria-describedby", "selection-help request-error");
	form.append(result, error, reload, help);
	if (completionOwner !== "host") form.append(select);
	form.addEventListener(
		"submit",
		(event) => {
			event.preventDefault();
			if (
				completionOwner === "host" ||
				frozen ||
				select.getAttribute("aria-disabled") === "true"
			)
				return;
			onCommand({
				type: "confirm",
				url: urlInput.value,
				queries: Object.fromEntries(
					fieldNames.map((name) => [name, fields[name].input.value]),
				),
			});
		},
		{ signal: events.signal },
	);
	container.replaceChildren(form, live);

	return {
		readDraft() {
			return {
				searchQuery: previousState?.results ? flat.input.value : undefined,
				url: previousState?.results ? flat.input.value : urlInput.value,
				queries: Object.fromEntries(
					fieldNames.map((name) => [name, fields[name].input.value]),
				),
				composing:
					flat.isComposing() ||
					urlComposing ||
					visibleFields().some((name) => fields[name].isComposing()),
				editVersion,
			};
		},
		freeze(value) {
			frozen = value;
			urlInput.readOnly = value;
			urlInput.setAttribute("aria-disabled", String(value));
			for (const name of visibleFields()) fields[name].freeze(value);
			flat.freeze(value);
			reload.setAttribute("aria-disabled", String(value));
			checkAccounts.setAttribute("aria-disabled", String(value));
			if (value) {
				help.textContent = "Checking your latest changes...";
				help.hidden = false;
				select.setAttribute("aria-disabled", "true");
				announce(help.textContent);
			}
		},
		update(state, pending = false, resync = false) {
			if ((state.accountRevision ?? 0) > (previousState?.accountRevision ?? 0))
				showQuickFillError("");
			const names = fieldNames;
			const directHostSelection =
				completionOwner === "host" && Boolean(state.results);
			const organization = state.fields.organization;
			const noAccounts =
				organization.status === "error" &&
				organization.error === "account_required";
			const waitingForAccounts =
				organization.status === "loading" && !emptyTitle.hidden;
			const emptyHadFocus = emptyHelp.contains(document.activeElement);
			const quickFillHadFocus = quickFill.contains(document.activeElement);
			emptyTitle.hidden = emptyHelp.hidden = !(
				noAccounts || waitingForAccounts
			);
			quickFill.hidden = !emptyTitle.hidden || Boolean(state.results);
			const errorParent = state.results ? flat.wrapper : quickFill;
			if (quickFillError.parentElement !== errorParent)
				errorParent.append(quickFillError);
			checkAccounts.setAttribute(
				"aria-disabled",
				String(frozen || waitingForAccounts),
			);
			for (const name of fieldNames)
				fields[name].wrapper.hidden =
					!emptyTitle.hidden || Boolean(state.results);
			flat.wrapper.hidden = !emptyTitle.hidden || !state.results;
			if (state.results) {
				const parts = state.results.query.split("/");
				flat.update(
					{
						...state.results,
						repositoryUrl: state.repositoryUrl,
						quickFillPending,
						validationError: quickFillError.textContent,
						emptyMessage:
							state.fields.organization.options.length > 0 &&
							(parts.length !== 3 || parts.some((part) => !part.trim()))
								? "Results are limited. Specify 'org/project/repo' or a URL to find exact matches."
								: undefined,
						status: state.repositoryUrl
							? "ready"
							: state.fields.organization.status === "error"
								? "error"
								: state.results.status,
						errorCode:
							state.fields.organization.status === "error"
								? state.fields.organization.error
								: state.results.errorCode,
						selected:
							!directHostSelection && canConfirm(state)
								? state.fields.repository.selected
								: null,
					},
					resync,
				);
				if (state.results.status !== previousState?.results?.status)
					announce(flat.hint.textContent);
			}
			if (!previousState && state.repositoryUrl)
				urlInput.value = state.repositoryUrl;
			for (const name of names)
				fields[name].update(
					state.fields[name],
					resync,
					Boolean(state.repositoryUrl) && !state.repositoryUrlResultMode,
				);
			updateRecovery(state);
			if (
				!flat.wrapper.hidden &&
				accountRecovery.hidden &&
				!initialFlatFocusApplied
			) {
				initialFlatFocusApplied = true;
				requestAnimationFrame(() => {
					if (!frozen && flat.input.isConnected)
						flat.input.focus({ preventScroll: true });
				});
			}
			if (
				(emptyHadFocus && emptyHelp.hidden) ||
				(quickFillHadFocus && quickFill.hidden)
			) {
				if (!emptyHelp.hidden) settings.focus();
				else (state.results ? flat : fields.organization).input.focus();
			}
			const revealed = !previousState?.selection && Boolean(state.selection);
			const previewReady = canConfirm(state) && error.hidden;
			const nextPath = state.selection
				? names.map((name) => state.selection[name].name).join(" / ")
				: "";
			if (
				document.activeElement === fields.repository.input &&
				nextPath !== path.textContent
			) {
				// Announce this update once; the changed description is for the next focus visit.
				deferDescription = true;
				syncRepositoryDescription();
			}
			resultTitle.hidden = path.hidden =
				directHostSelection || !state.selection;
			path.textContent = nextPath;
			result.hidden = directHostSelection || !previewReady || !state.selection;
			syncRepositoryDescription();
			if (previousState?.selection && !state.selection) live.textContent = "";
			if (state.selection && !directHostSelection) {
				announce(`Repository selected: ${path.textContent}.`);
			} else if (
				!directHostSelection &&
				!state.repositoryUrl &&
				previewReady &&
				(!previousState ||
					!canConfirm(previousState) ||
					names.some(
						(name) =>
							previousState.fields[name]?.selected?.id !==
							state.fields[name].selected?.id,
					))
			) {
				announce(
					`Repository selected: ${(state.urlSelection ?? state.selection)?.repository.name ?? state.fields.repository.selected?.name}.`,
				);
			} else {
				const focused = names.find(
					(name) => document.activeElement === fields[name].input,
				);
				const changed =
					names.find(
						(name) =>
							state.fields[name].status === "error" &&
							(previousState?.fields[name].status !== "error" ||
								previousState?.fields[name].error !== state.fields[name].error),
					) ??
					names.find(
						(name) =>
							state.fields[name].status !== "idle" &&
							previousState?.fields[name].status !== state.fields[name].status,
					) ??
					(focused &&
					(previousState?.fields[focused].query !==
						state.fields[focused].query ||
						previousState?.fields[focused].selected?.id !==
							state.fields[focused].selected?.id)
						? focused
						: null);
				if (waitingForAccounts)
					announce("Checking for signed-in Microsoft accounts...");
				else if (noAccounts)
					announce(
						`${emptyTitle.textContent}. ${accountDescription.textContent}`,
					);
				else if (changed && !state.repositoryUrl)
					announce(
						`${labels[changed]}: ${fields[changed].hint.textContent || state.fields[changed].selected?.name || ""}`,
					);
			}
			const ready = canConfirm(state);
			select.setAttribute(
				"aria-disabled",
				String(
					frozen ||
						pending ||
						!error.hidden ||
						!ready ||
						Boolean(state.selection),
				),
			);
			help.textContent = frozen
				? "Checking your latest changes..."
				: pending
					? "Saving your changes..."
					: ready
						? "Select this repository to confirm your choice."
						: confirmDisabledReason(state);
			help.hidden = Boolean(state.selection);
			if (pending && document.activeElement === select)
				announce(help.textContent);
			select.setAttribute(
				"aria-describedby",
				state.selection
					? "selected-repository request-error"
					: "selection-help request-error",
			);
			if (revealed && document.activeElement === select) {
				select.scrollIntoView({ block: "nearest" });
			}
			previousState = state;
			container.dataset.flat = String(
				Boolean(state.results) && emptyTitle.hidden,
			);
		},
		showError(message) {
			error.textContent = message;
			error.hidden = !message;
			reload.hidden = !message;
			if (message) {
				result.hidden = true;
				fields.repository.input.setAttribute(
					"aria-describedby",
					"repository-hint request-error",
				);
				help.hidden = true;
				select.setAttribute("aria-disabled", "true");
				select.setAttribute("aria-describedby", "request-error");
				announce(message);
			}
		},
		showQuickFillError,
		setQuickFillPending(pending) {
			quickFillPending = pending;
			if (pending) announce("Looking up this Azure DevOps URL...");
		},
		announceQuickFill(message) {
			announce(message);
		},
		dispose() {
			clearTimeout(announcement);
			events.abort();
		},
	};
}
