import { metaContent } from "./canvas-guest-view.mjs";
import {
	createGitHubBranchIcon,
	createGitHubPullRequestIcon,
	createGitHubRepoIcon,
} from "./github-ui-icons.mjs";
import { authorizationRecovery } from "./repository-picker-state.mjs";

const endpoint = `/instances/${location.pathname.split("/").at(-1)}`;
const documentToken = metaContent("picker-document");
const lifetime = new AbortController();
const get = (id) => document.getElementById(id);
const account = /** @type {HTMLSelectElement} */ (get("account"));
const query = /** @type {HTMLInputElement} */ (get("query"));
const results = get("results");
const hint = get("status");
const feedback = get("feedback");
const retry = get("retry");
const accountEmpty = get("account-empty");
const emptyTitle = get("account-empty-title");
const emptyDescription = get("account-empty-description");
const emptyHelp = get("account-empty-help");
const checkAccounts = get("check-accounts");
const live = get("live");
const tabs = [...get("source-tabs").querySelectorAll("button")];
let activeMode = "branch";
let sequence = 0;
let editVersion = 0;
let state;
let writes = Promise.resolve();
let stopped = false;
let confirming = false;
let lastChallenge = null;
let renderKey = "";
let composing = false;
let activeId = null;
let pointer = null;
let announcement;

function element(tagName, className, text) {
	const node = document.createElement(tagName);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function icon(kind) {
	if (kind === "repository") return createGitHubRepoIcon("picker-row-icon");
	const svg =
		kind === "branch"
			? createGitHubBranchIcon("picker-row-icon")
			: createGitHubPullRequestIcon("picker-row-icon");
	svg.dataset.kind = kind;
	return svg;
}

const originRepositoryName = metaContent("repository-name");
const repositoryName = element(
	"span",
	"picker-repository-name",
	originRepositoryName,
);
get("repository").append(icon("repository"), repositoryName);

function announce(message) {
	clearTimeout(announcement);
	announcement = setTimeout(() => {
		if (live.textContent !== message) live.textContent = message;
	}, 200);
}

function plural(mode) {
	return mode === "branch" ? "branches" : "pull requests";
}

function renderMode(value) {
	activeMode = value;
	for (const tab of tabs) {
		const selected = tab.dataset.mode === value;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
	}
	const label = tabs.find((tab) => tab.dataset.mode === value).textContent;
	get("source-panel").setAttribute("aria-label", label);
	get("query-label").textContent = `Search ${label.toLowerCase()}`;
	query.placeholder =
		value === "branch" ? "Search by branch name" : "Search pull requests";
	get("results-heading").textContent = query.value.trim()
		? `Matching ${label.toLowerCase()}`
		: value === "branch"
			? label
			: `Recent ${label.toLowerCase()}`;
}

function message(next) {
	const items = plural(next.mode);
	if (next.status === "loading") return `Loading ${items}...`;
	if (next.status === "error" || next.error)
		return next.error ?? `Could not load ${items}. Retry the list.`;
	if (!next.accountId) return "Choose a Microsoft account first.";
	if (!next.options.length)
		return next.query.trim()
			? `No matching ${items}. Try a different search.`
			: `No ${items} are available. Retry or check your Azure DevOps access.`;
	if (next.truncated)
		return `Only the first ${next.options.length} matching ${items} are shown. Narrow your search to see others.`;
	return `${next.options.length} ${items} available.`;
}

function selectionText(current) {
	const selected = current.options.find(
		(item) => item.id === current.selectedId,
	);
	if (!selected) return "";
	return current.mode === "branch"
		? `Selected branch: ${selected.name}`
		: `Selected pull request: #${selected.id} ${selected.name}`;
}

function setActive(id, scroll = true) {
	activeId = id;
	let active;
	for (const option of /** @type {HTMLCollectionOf<HTMLElement>} */ (
		results.children
	)) {
		option.dataset.active = String(option.dataset.id === id);
		if (option.dataset.id === id) active = option;
	}
	if (!active) {
		query.removeAttribute("aria-activedescendant");
		return;
	}
	query.setAttribute("aria-activedescendant", active.id);
	if (!scroll) return;
	const top = active.offsetTop;
	const bottom = top + active.offsetHeight;
	if (top < results.scrollTop) results.scrollTop = top;
	else if (bottom > results.scrollTop + results.clientHeight)
		results.scrollTop = bottom - results.clientHeight;
}

function choose(id) {
	if (
		state?.status === "ready" &&
		state.sequence === sequence &&
		state.query === query.value &&
		state.options.some((item) => item.id === id)
	)
		change("select", id);
}

function showFeedback(text) {
	hint.textContent = text;
	feedback.classList.remove("sr-only");
	announce(text);
}

async function request(command, suffix = "", keepalive = false) {
	const response = await fetch(`${endpoint}${suffix}`, {
		method: command ? "POST" : "GET",
		headers: {
			"X-Picker-Document": documentToken,
			...(command ? { "Content-Type": "application/json" } : {}),
		},
		body: command ? JSON.stringify(command) : undefined,
		signal: keepalive
			? undefined
			: AbortSignal.any([lifetime.signal, AbortSignal.timeout(12_000)]),
		keepalive,
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			value.error ?? "The picker lost its connection. Reload it to retry.",
		);
	return value;
}
function show(next) {
	if (
		stopped ||
		next.sequence !== sequence ||
		(state && next.revision < state.revision)
	)
		return;
	const previous = state;
	state = next;
	repositoryName.textContent = next.repositoryName ?? originRepositoryName;
	const choices = JSON.stringify(next.accounts);
	if (account.dataset.choices !== choices) {
		account.replaceChildren(
			new Option("Choose a Microsoft account", ""),
			...next.accounts.map(
				(item) =>
					new Option(
						item.secondaryLabel
							? `${item.name} (${item.secondaryLabel})`
							: item.name,
						item.id,
					),
			),
		);
		account.dataset.choices = choices;
	}
	account.value = next.accountId ?? "";
	const noAccounts = next.status === "ready" && !next.accounts.length;
	const waitingForAccounts =
		next.status === "loading" && !next.accounts.length && !emptyTitle.hidden;
	const emptyHadFocus = accountEmpty.contains(document.activeElement);
	emptyTitle.hidden = emptyHelp.hidden = !(noAccounts || waitingForAccounts);
	const recoveryParent = emptyTitle.hidden
		? get("source-panel")
		: get("picker-form");
	if (accountEmpty.parentElement !== recoveryParent) {
		if (emptyTitle.hidden) recoveryParent.append(accountEmpty);
		else recoveryParent.prepend(accountEmpty);
	}
	accountEmpty.hidden =
		emptyTitle.hidden &&
		!(
			next.status === "error" &&
			(!next.accounts.length || authorizationRecovery(next.errorCode))
		);
	emptyDescription.textContent = emptyTitle.hidden
		? "Use the selected Microsoft account in Account settings."
		: "Sign in with a Microsoft account to browse your Azure DevOps branches and pull requests.";
	checkAccounts.setAttribute("aria-disabled", String(waitingForAccounts));
	get("account-field").hidden = !emptyTitle.hidden || next.accounts.length <= 1;
	get("source").hidden = !emptyTitle.hidden;
	get("picker").dataset.flat = String(emptyTitle.hidden);
	renderMode(next.mode);
	query.readOnly = confirming || !next.accountId;
	query.setAttribute("aria-disabled", String(query.readOnly));
	query.setAttribute("aria-invalid", String(next.status === "error"));
	hint.textContent = message(next);
	feedback.classList.toggle(
		"sr-only",
		next.status === "ready" &&
			!next.error &&
			next.options.length > 0 &&
			!next.truncated,
	);
	retry.hidden =
		!!next.queryError ||
		next.query.length > 4096 ||
		(next.status !== "error" &&
			!(next.status === "ready" && next.accountId && !next.options.length));
	retry.setAttribute("aria-label", `Retry ${plural(next.mode)}`);
	const key = JSON.stringify([next.mode, next.options]);
	if (renderKey !== key) {
		renderKey = key;
		results.replaceChildren(
			...next.options.map((item, index) => {
				const option = element("div", "picker-option");
				option.id = `result-option-${index}`;
				option.dataset.id = item.id;
				option.setAttribute("role", "option");
				const rowIcon = icon(next.mode);
				rowIcon.dataset.draft = String(item.draft === true);
				const title = element(
					"span",
					"picker-row-title",
					next.mode === "branch"
						? item.name
						: `#${item.id} ${item.name}${item.draft ? " (Draft)" : ""}`,
				);
				if (next.mode === "pull-request") {
					const detail = element("span", "picker-row-detail");
					detail.append(
						title,
						element(
							"span",
							"picker-row-metadata",
							`${item.branchName} \u2192 ${item.baseBranch}`,
						),
					);
					option.append(rowIcon, detail);
				} else option.append(rowIcon, title);
				const hint = element("span", "picker-row-hint");
				hint.setAttribute("aria-hidden", "true");
				hint.append(
					element("span", "", "Create"),
					element("span", "", "\u21b5"),
				);
				option.append(hint);
				option.addEventListener("pointermove", (event) => {
					if (pointer?.x === event.clientX && pointer?.y === event.clientY)
						return;
					pointer = { x: event.clientX, y: event.clientY };
					if (activeId !== item.id) setActive(item.id, false);
				});
				option.addEventListener("pointerdown", (event) => {
					event.preventDefault();
					query.focus({ preventScroll: true });
				});
				option.addEventListener("click", () => choose(item.id));
				return option;
			}),
		);
		setActive(
			next.options.some((item) => item.id === activeId)
				? activeId
				: (next.options[0]?.id ?? null),
		);
	}
	results.hidden = !next.options.length;
	query.setAttribute("aria-expanded", String(!results.hidden));
	for (const option of /** @type {HTMLCollectionOf<HTMLElement>} */ (
		results.children
	)) {
		const selected = String(option.dataset.id === next.selectedId);
		if (option.getAttribute("aria-selected") !== selected)
			option.setAttribute("aria-selected", selected);
	}
	get("selected").textContent = selectionText(next);
	if (previous?.status !== next.status || previous?.error !== next.error)
		announce(
			emptyTitle.hidden
				? hint.textContent
				: `${emptyTitle.textContent}. ${emptyDescription.textContent}`,
		);
	if (emptyHadFocus && !accountEmpty.contains(document.activeElement))
		(accountEmpty.hidden
			? get("account-field").hidden
				? query
				: account
			: get("settings")
		).focus();
}
function fail(failure) {
	if (lifetime.signal.aborted) return;
	stopped = true;
	get("source").hidden = false;
	showFeedback(
		failure instanceof Error
			? failure.message
			: "The picker lost its connection. Reload it to retry.",
	);
	retry.textContent = "Reload";
	retry.setAttribute("aria-label", "Reload picker");
	retry.hidden = false;
}
function change(type, value) {
	if (stopped || confirming) return;
	editVersion += 1;
	// Send a bounded over-limit marker, not a shortened search. The full draft
	// stays in the input, even when JSON escaping would exceed the transport cap.
	if (type === "query" && value.length > 4096) value = " ".repeat(4097);
	else if (
		type === "query" &&
		[...value].some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		)
	) {
		type = "query-error";
		value = "control-characters";
	}
	const command = { type, value, sequence: ++sequence };
	// Serial writes and sequence fences keep a late search/account response from
	// restoring a selection the user has already changed.
	writes = writes
		.then(async () => {
			if (stopped) return;
			show(await request(command));
		})
		.catch(fail);
}
account.addEventListener("change", () => change("account", account.value));
for (const tab of tabs) {
	tab.addEventListener("click", () => {
		if (stopped || confirming || tab.dataset.mode === activeMode) return;
		query.value = "";
		renderMode(tab.dataset.mode);
		change("mode", activeMode);
	});
	tab.addEventListener("keydown", (event) => {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;
		const current = tabs.indexOf(tab);
		const next =
			event.key === "ArrowLeft"
				? (current - 1 + tabs.length) % tabs.length
				: event.key === "ArrowRight"
					? (current + 1) % tabs.length
					: event.key === "Home"
						? 0
						: event.key === "End"
							? tabs.length - 1
							: null;
		if (next === null) return;
		event.preventDefault();
		tabs[next].focus();
	});
}
query.addEventListener("input", () => change("query", query.value));
query.addEventListener("keydown", (event) => {
	if (
		event.isComposing ||
		composing ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	)
		return;
	const options = /** @type {HTMLElement[]} */ ([...results.children]);
	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		if (!options.length) return;
		event.preventDefault();
		const index = options.findIndex((option) => option.dataset.id === activeId);
		const delta = event.key === "ArrowDown" ? 1 : -1;
		const next =
			index < 0
				? delta === 1
					? 0
					: options.length - 1
				: (index + delta + options.length) % options.length;
		setActive(options[next].dataset.id);
	} else if (event.key === "Enter") {
		event.preventDefault();
		if (activeId !== null) choose(activeId);
	}
});
query.addEventListener("compositionstart", () => {
	composing = true;
});
query.addEventListener("compositionend", () => {
	composing = false;
	change("query", query.value);
});
retry.addEventListener("click", () => {
	if (stopped) {
		location.reload();
		return;
	}
	query.focus();
	change("retry");
});
checkAccounts.addEventListener("click", () => {
	if (checkAccounts.getAttribute("aria-disabled") !== "true") change("retry");
});

async function acknowledge(challenge) {
	confirming = true;
	query.readOnly = true;
	account.disabled = true;
	for (const tab of tabs) tab.setAttribute("aria-disabled", "true");
	const version = editVersion;
	try {
		if (composing)
			throw new Error("Finish composing your search text, then try again.");
		await writes;
		if (stopped || version !== editVersion)
			throw new Error("The selection changed. Try again.");
		const current = await request();
		if (
			version !== editVersion ||
			current.sequence !== sequence ||
			query.value !== current.query
		)
			throw new Error("Your latest input is not saved. Try again.");
		const result = await request(
			{
				requestToken: challenge.requestToken,
				sequence,
				selectedId: current.selectedId,
			},
			"/confirmation",
		);
		if (result.status === "completed") {
			stopped = true;
			get("selected").textContent = selectionText(current);
		} else showFeedback(result.message);
	} catch (failure) {
		if (lifetime.signal.aborted) return;
		const message =
			failure instanceof Error
				? failure.message
				: "Could not confirm this selection. Retry.";
		try {
			await request(
				{ requestToken: challenge.requestToken, error: message.slice(0, 512) },
				"/confirmation",
			);
			showFeedback(message);
		} catch (connectionFailure) {
			fail(connectionFailure);
		}
	} finally {
		confirming = false;
		query.readOnly = !state?.accountId;
		account.disabled = false;
		for (const tab of tabs) tab.removeAttribute("aria-disabled");
	}
}
async function poll() {
	try {
		while (!stopped && !lifetime.signal.aborted) {
			await writes;
			if (stopped) return;
			const next = await request();
			show(next);
			if (
				next.confirmation &&
				next.confirmation.requestToken !== lastChallenge
			) {
				lastChallenge = next.confirmation.requestToken;
				await acknowledge(next.confirmation);
			}
			if (!stopped) await new Promise((resolve) => setTimeout(resolve, 350));
		}
	} catch (failure) {
		fail(failure);
	}
}
window.addEventListener(
	"pagehide",
	() => {
		stopped = true;
		lifetime.abort();
		void request({ type: "release", sequence: ++sequence }, "", true).catch(
			() => {},
		);
	},
	{ once: true },
);
void poll();
