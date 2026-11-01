import { sanitizeExternalUrl } from "./assets/pull-request-renderers.js";
import { createGitHubStatusIcon } from "./github-ui-icons.mjs";
import {
	avatar,
	createReviewActions,
	inactive,
	node,
	pagedList,
	renderMarkdown,
} from "./pull-request-actions.mjs";
import { createChecksView } from "./pull-request-checks-view.mjs";
import { createDescriptionView } from "./pull-request-description.mjs";
import {
	renderActivityThread,
	renderDiscussionThread,
	updateCommentTimes,
} from "./pull-request-discussion-view.mjs";
import { createFeedbackView } from "./pull-request-feedback-view.mjs";
import {
	hasUnknownManualFixThreads,
	manualFixThreads,
} from "./pull-request-fix-state.mjs";
import { closePopupWithin } from "./pull-request-popups.mjs";
import { bindActionTelemetry, telemetry } from "./pull-request-telemetry.mjs";
import { createThreadCodeView } from "./pull-request-thread-code-view.mjs";
import { isActivityThread } from "./pull-request-thread-kind.mjs";

/** @typedef {import("./pull-request-snapshot.d.mts").Snapshot} Snapshot */
/** @typedef {"overview" | "refresh" | "cancel-refresh"} ActionKey */
/** @typedef {{token: object, accepted: boolean, refreshed: boolean}} RecoveryRequest */
/** @template T @typedef {import("./pull-request-snapshot.d.mts").Resource<T>} Resource */

const instanceId = location.pathname.split("/").at(-1);
const refresh = element("refresh");
const cancel = element("cancel");
const initialCancel = element("cancel-initial");
const status = element("status");
const notice = element("notice");
const events = new EventSource(`/events/${instanceId}`);
const lifetime = new AbortController();
const commentTimeTimer = setInterval(
	() => updateCommentTimes(element("threads")),
	60_000,
);
lifetime.signal.addEventListener(
	"abort",
	() => clearInterval(commentTimeTimer),
	{ once: true },
);
let bindingLifetime = new AbortController();
let revision = -1;
/** @type {Readonly<Snapshot>} */
let snapshot = {
	revision: -1,
	bindingRevision: -1,
	changesRevision: -1,
	status: "unavailable",
	pullRequest: null,
	updatedAt: null,
	error: null,
	overview: emptyResource(),
	completion: emptyResource(),
	threadCode: emptyResource(),
	changes: emptyResource(),
	fileDiff: emptyResource(),
	selectedFile: null,
	access: null,
	accessError: null,
	reviewState: {
		viewed: [],
		drafts: [],
		preferences: { mode: "unified", ignoreWhitespace: false },
		sourceCommitId: null,
	},
	mutation: { status: "idle", error: null },
	selectedCommitId: null,
};
let overviewRequested = false;
/** @type {object | false} */
let announceResult = false;
/** @type {Map<ActionKey | "copy", object>} */
const pendingActions = new Map();
/** @type {Map<ActionKey, string>} */
const actionErrors = new Map();
/** @type {object | false} */
let announceOverview = false;
let disconnected = false;
let userCancelled = false;
/** @type {RecoveryRequest | false} */
let recoveryRequested = false;
let recoveryOverviewStarted = false;
let mutationRecoveryRevision = -1;
let restoreBindingFocus = false;
const rendered = new Map();
const threadRows = new Map();
let discussionFilter = "everything";
let discussionSort = "newest";
const feedback = createFeedbackView({
	copyButton: element("copy-url"),
	tooltip: element("copy-tooltip"),
	toast: element("canvas-toast"),
	toastTitle: element("toast-title"),
	toastMessage: element("toast-message"),
	toastClose: element("toast-close"),
	notice,
	fallbackFocus,
	onChange: renderFooter,
});
const reviewActions = createReviewActions({
	getSnapshot: () => snapshot,
	getSignal: () => bindingLifetime.signal,
	getMutationRecoveryRevision: () => mutationRecoveryRevision,
	instanceId,
	isConnected: () => !disconnected,
	notify: (
		message,
		{
			error = false,
			recovery = true,
			replaceRecovery = true,
			transient = false,
			title = error ? "Pull request action failed" : "Pull request",
		} = {},
	) => {
		if (error) {
			if (recovery) recoveryRequested = recoveryOverviewStarted = false;
			feedback.error(title, message, { recovery, replaceRecovery });
		} else if (transient) feedback.message(title, message);
		else notice.textContent = message;
		renderFooter();
	},
	rerender: () => render(),
});
const fixAllCommentsButton = reviewActions.fixAction(
	"Fix unresolved comments",
	() => ({
		kind: "discussions",
		threadIds: manualFixThreads(snapshot.overview.data).map(
			(thread) => thread.id,
		),
	}),
);
fixAllCommentsButton.hidden = true;
element("discussion-fix-actions").append(fixAllCommentsButton);
const fixCiButton = reviewActions.fixAction("Fix failing checks", () => ({
	kind: "checks",
}));
fixCiButton.hidden = true;
element("checks-actions").append(fixCiButton);
const resolveConflictsButton = reviewActions.fixAction(
	"Resolve conflicts",
	() => ({ kind: "conflicts" }),
);
resolveConflictsButton.hidden = true;
const checksView = createChecksView(
	element("checks"),
	{
		icon: element("check-overview-icon"),
		summary: element("check-summary"),
		note: element("policy-summary"),
	},
	{ fixCiButton, resolveConflictsButton },
);
const descriptionView = createDescriptionView(
	element("description"),
	element("description-toggle"),
);
const threadCodeView = createThreadCodeView({
	getSnapshot: () => snapshot,
	getSignal: () => bindingLifetime.signal,
	instanceId,
	onUnavailable: unavailable,
});
const votes = {
	10: "Approved",
	5: "Approved with suggestions",
	0: "No vote",
	"-5": "Waiting for author",
	"-10": "Rejected",
};

function reviewerStatusIcon(vote) {
	const presentation = {
		10: { state: "approved", icon: "success" },
		5: { state: "suggestions", icon: "success" },
		0: { state: "pending", icon: "neutral" },
		"-5": { state: "waiting", icon: "pending" },
		"-10": { state: "rejected", icon: "danger" },
	}[vote] ?? { state: "unknown", icon: "neutral" };
	const icon = createGitHubStatusIcon(
		presentation.icon,
		"reviewer-status-icon",
	);
	icon.dataset.state = presentation.state;
	return icon;
}
const discussionSorts = [
	["oldest", "Oldest first"],
	["newest", "Newest first"],
];

function matchesDiscussionFilter(thread, filter) {
	if (filter === "everything") return true;
	if (filter === "new") return false;
	if (isActivityThread(thread)) return false;
	if (filter === "comments") return true;
	if (filter === "active") return ["active", "pending"].includes(thread.status);
	if (filter === "resolved")
		return !["active", "pending", "unknown"].includes(thread.status);
	if (filter === "mine")
		return thread.comments.some(
			(comment) => comment.author?.id === snapshot.access?.viewerId,
		);
	return false;
}

function discussionFilterOptions(threads) {
	const comments = threads.filter((thread) => !isActivityThread(thread));
	const count = (filter) =>
		threads.filter((thread) => matchesDiscussionFilter(thread, filter)).length;
	return [
		["everything", "Show everything", threads.length],
		["comments", "All comments", comments.length],
		["new", "What's new", 0],
		["mine", "My comments/replies", count("mine")],
		["active", "Active comments", count("active")],
		["resolved", "Resolved comments", count("resolved")],
	];
}

function renderDiscussionFilter(threads) {
	const host = element("discussion-filter");
	if (!host.firstElementChild) {
		const trigger = reviewActions.selectionMenu(
			host,
			() =>
				discussionFilterOptions(snapshot.overview.data?.threads ?? []).map(
					([id, label, count]) => ({
						label: `${label} (${count})`,
						checked: () => discussionFilter === id,
						onSelect() {
							const action = telemetry.start("filter", "discussion");
							discussionFilter = id;
							renderOverview(snapshot.overview);
							notice.textContent = `Comments filter: ${label}.`;
							action.finish("success");
						},
					}),
				),
			"Filter comments and activity",
		);
		trigger.dataset.control = "discussion-filter";
	}
	const [_, label, count] = discussionFilterOptions(threads).find(
		([id]) => id === discussionFilter,
	);
	const trigger = host.querySelector("button");
	if (trigger?.firstChild)
		trigger.firstChild.textContent = `${label} (${count})`;
}

function renderDiscussionSort() {
	const host = element("discussion-sort");
	if (!host.firstElementChild) {
		const trigger = reviewActions.selectionMenu(
			host,
			() =>
				discussionSorts.map(([id, label]) => ({
					label,
					checked: () => discussionSort === id,
					onSelect() {
						const action = telemetry.start("sort", "discussion");
						discussionSort = id;
						renderOverview(snapshot.overview);
						notice.textContent = `Comments sort: ${label}.`;
						action.finish("success");
					},
				})),
			"Sort discussion",
		);
		trigger.dataset.control = "discussion-sort";
	}
	const label = discussionSorts.find(([id]) => id === discussionSort)[1];
	const trigger = host.querySelector("button");
	if (trigger?.firstChild) trigger.firstChild.textContent = label;
}

function element(id) {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Missing canvas element: ${id}`);
	return found;
}

function isVisibleFocusTarget(target) {
	return (
		target instanceof HTMLElement &&
		target !== document.body &&
		target.isConnected &&
		!target.closest("[hidden]") &&
		target.getClientRects().length > 0 &&
		getComputedStyle(target).visibility === "visible"
	);
}

function focusWasLost(target) {
	return (
		target instanceof HTMLElement &&
		target !== document.body &&
		(!target.isConnected ||
			target.closest("[hidden]") !== null ||
			(document.activeElement !== target && !isVisibleFocusTarget(target)))
	);
}

function fallbackFocus() {
	return [
		refresh,
		status,
		element("mutation-status"),
		element("header-title"),
		initialCancel,
	].find(isVisibleFocusTarget);
}

function restoreFocus(target = fallbackFocus()) {
	if (
		!isVisibleFocusTarget(document.activeElement) &&
		isVisibleFocusTarget(target)
	)
		target?.focus({ preventScroll: true });
	restoreBindingFocus = !isVisibleFocusTarget(document.activeElement);
}

function renderFooter() {
	const footer = element("canvas-footer");
	const focused = footer.contains(document.activeElement)
		? document.activeElement
		: null;
	const message = feedback.recoveryMessage();
	const problem = ["error", "cancelled", "unavailable"].includes(
		status.dataset.status,
	);
	const mutationStatus = element("mutation-status");
	mutationStatus.hidden = !message;
	if (message) mutationStatus.textContent = message;
	status.hidden = Boolean(message) && !problem;
	footer.hidden = !problem && !message && !announceResult;
	refresh.hidden =
		lifetime.signal.aborted ||
		disconnected ||
		snapshot.status === "unavailable";
	if (focusWasLost(focused)) restoreFocus();
}

function inputElement(id) {
	const found = element(id);
	if (!(found instanceof HTMLInputElement))
		throw new Error(`Expected input canvas element: ${id}`);
	return found;
}

function text(id, value) {
	const target = element(id);
	if (target.textContent !== value) target.textContent = value;
}

function changed(key, data, update) {
	const serialized = JSON.stringify(data);
	if (rendered.get(key) === serialized) return;
	rendered.set(key, serialized);
	update();
}

/** @returns {Resource<null>} */
function emptyResource() {
	return { status: "idle", data: null, error: null };
}

function clearBinding() {
	const focused = document.activeElement;
	const lostFocus =
		isVisibleFocusTarget(focused) &&
		["details", "copy-fallback", "canvas-footer", "canvas-toast"].some((id) =>
			element(id).contains(focused),
		);
	bindingLifetime.abort();
	bindingLifetime = new AbortController();
	pendingActions.clear();
	actionErrors.clear();
	rendered.clear();
	threadRows.clear();
	overviewRequested = announceResult = announceOverview = false;
	userCancelled = recoveryRequested = recoveryOverviewStarted = false;
	mutationRecoveryRevision = -1;
	restoreBindingFocus ||= lostFocus;
	feedback.reset();
	discussionFilter = "everything";
	discussionSort = "newest";
	element("copy-fallback").hidden = true;
	inputElement("copy-fallback-url").value = "";
	reviewActions.clear();
	fixAllCommentsButton.hidden = true;
	element("discussion-filter").replaceChildren();
	element("discussion-sort").replaceChildren();
	checksView.clear();
	descriptionView.clear();
	threadCodeView.clear();
	text("copy-status", "");
	notice.textContent = "";
	for (const id of ["reviewers", "threads"]) element(id).replaceChildren();
	for (const id of [
		"description",
		"author",
		"policy-summary",
		"status-checks-error",
	])
		text(id, "");
	element("status-checks-error").hidden = true;
}

function renderOverview(resource) {
	const data = resource.data;
	const fixesVisible =
		!snapshot.selectedCommitId &&
		["open", "draft"].includes(snapshot.pullRequest?.state);
	const activeFixThreads = reviewActions.unrequestedFixThreads(data);
	const restoreFixAllFocus = document.activeElement === fixAllCommentsButton;
	if (resource.status !== "loading" || !data)
		fixAllCommentsButton.hidden =
			!fixesVisible ||
			resource.status !== "ready" ||
			Boolean(data?.errors?.threads) ||
			hasUnknownManualFixThreads(data) ||
			(activeFixThreads.length === 0 &&
				!reviewActions.fixCooling(fixAllCommentsButton));
	reviewActions.setFixLabel(
		fixAllCommentsButton,
		activeFixThreads.length > 50
			? "Fix up to 50 unresolved comments"
			: "Fix unresolved comments",
	);
	if (restoreFixAllFocus && fixAllCommentsButton.hidden)
		element("discussion-heading").focus({ preventScroll: true });
	element("overview-loading").hidden =
		Boolean(data) || resource.status !== "loading";
	renderDiscussionFilter(data?.threads ?? []);
	renderDiscussionSort();
	const partialErrors = Object.values(data?.errors ?? {});
	const resourceStatus =
		resource.status === "ready" && partialErrors.length
			? "error"
			: resource.status;
	const error =
		actionErrors.get("overview") ?? resource.error ?? partialErrors.join(" ");
	text(
		"overview-status",
		actionErrors.get("overview") ??
			{
				idle: "Overview has not loaded.",
				loading: "Loading overview...",
				ready: "Overview loaded.",
				cancelled: "Loading overview cancelled. Select Retry to try again.",
				error: `${error || "Could not load overview."} Select Retry to try again.`,
			}[resourceStatus],
	);
	const retry = element("retry-overview");
	const showRetry =
		Boolean(error) ||
		resourceStatus === "cancelled" ||
		(!retry.hidden && resourceStatus === "loading");
	if (!showRetry && document.activeElement === retry)
		element("overview-status").focus();
	retry.hidden = !showRetry;
	element("overview-status").parentElement.dataset.status = actionErrors.has(
		"overview",
	)
		? "error"
		: data && resourceStatus === "loading" && !showRetry
			? "refreshing"
			: resourceStatus;
	inactive(
		retry,
		resource.status === "loading" || pendingActions.has("overview"),
	);
	const checks = data?.statuses ?? [];
	element("status-checks-error").hidden = !data?.errors?.statuses;
	text(
		"status-checks-error",
		data?.errors?.statuses
			? checks.length
				? "CI status checks could not be refreshed. Showing last known results. Retry overview."
				: "CI status checks could not be loaded. Retry overview."
			: "",
	);
	checksView.render(
		data,
		snapshot.pullRequest,
		fixesVisible && resource.status === "ready",
	);
	if (reviewActions.isEditing(element("threads"))) return;
	const focused =
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
	const focusedFeedItem = focused?.closest(".thread, .activity-post")?.id;
	const focusedComment = focused
		?.closest("[data-comment-id]")
		?.getAttribute("data-comment-id");
	const focusedReviewer = focused
		?.closest("[data-reviewer-id]")
		?.getAttribute("data-reviewer-id");
	const focusedAction =
		focused instanceof HTMLElement
			? focused.closest("[data-action]")?.getAttribute("data-action")
			: null;
	const overviewFocus = ["threads", "reviewers"].some((id) =>
		element(id).contains(focused),
	);
	if (!reviewActions.isEditing(element("reviewers")))
		changed(
			"reviewers",
			[
				data?.author,
				data?.createdAt,
				data?.reviewers,
				snapshot.access,
				snapshot.selectedCommitId,
				snapshot.pullRequest?.state,
			],
			() => {
				closePopupWithin(element("reviewers"));
				text("author", data ? (data.author?.name ?? "Not reported") : "");
				if (!data) {
					element("reviewers").replaceChildren();
					return;
				}
				element("reviewers").replaceChildren();
				for (const required of [true, false]) {
					const label = required ? "Required" : "Optional";
					const reviewers = data.reviewers
						.filter((reviewer) => Boolean(reviewer.isRequired) === required)
						.toSorted((a, b) => a.name.localeCompare(b.name));
					const group = node("section", "", "reviewer-group");
					const heading = node("h4", `${label} (${reviewers.length})`);
					heading.id = `reviewer-group-${required ? "required" : "optional"}`;
					group.setAttribute("aria-labelledby", heading.id);
					group.append(heading);
					const list = node("div");
					group.append(list);
					element("reviewers").append(group);
					pagedList(
						list,
						reviewers,
						"reviewers",
						`No ${label.toLowerCase()} reviewers.`,
						(row, reviewer) => {
							row.className = "reviewer-row";
							row.dataset.reviewerId = reviewer.id;
							const statusIcon = reviewerStatusIcon(reviewer.vote);
							row.dataset.reviewState = statusIcon.dataset.state;
							const details = node("div", "", "reviewer-details");
							row.append(statusIcon, avatar(reviewer.name), details);
							details.append(
								node("strong", reviewer.name),
								node(
									"span",
									votes[reviewer.vote] ??
										`Vote not recognized (${reviewer.vote})`,
									"reviewer-vote",
								),
							);
							reviewActions.reviewer(row, reviewer);
						},
					);
				}
			},
		);
	changed(
		"threads",
		[
			data?.threads,
			data?.errors?.threads,
			snapshot.access,
			snapshot.selectedCommitId,
			discussionFilter,
			discussionSort,
		],
		() => {
			text(
				"discussion-count",
				String(
					data?.threads.filter((thread) => !isActivityThread(thread)).length ??
						0,
				),
			);
			if (!data) {
				element("threads").replaceChildren();
				threadRows.clear();
				return;
			}
			const threads = data.threads
				.filter((thread) => matchesDiscussionFilter(thread, discussionFilter))
				.toSorted((a, b) => {
					const aTime = Date.parse(
						a.comments.at(-1)?.publishedAt ??
							a.updatedAt ??
							a.publishedAt ??
							"",
					);
					const bTime = Date.parse(
						b.comments.at(-1)?.publishedAt ??
							b.updatedAt ??
							b.publishedAt ??
							"",
					);
					const direction = discussionSort === "newest" ? -1 : 1;
					if (
						Number.isFinite(aTime) &&
						Number.isFinite(bTime) &&
						aTime !== bTime
					)
						return direction * (aTime - bTime);
					return direction * (a.id - b.id);
				});
			const host = element("threads");
			const ids = new Set(threads.map((thread) => thread.id));
			for (const [id, entry] of threadRows) {
				if (!ids.has(id)) {
					entry.row.remove();
					threadRows.delete(id);
				}
			}
			if (!threads.length) {
				host.replaceChildren(
					node(
						"p",
						data.errors?.threads
							? "Comments and activity could not be loaded. Retry overview."
							: ({
									everything: "No comments or activity.",
									comments: "No comments.",
									new: "No new comments or activity.",
									mine: "No comments or replies from you.",
									active: "No active comments.",
									resolved: "No resolved comments.",
								}[discussionFilter] ?? "No comments match this filter."),
						"muted",
					),
				);
			} else {
				let list = host.querySelector("ul");
				if (!list) {
					list = node("ul");
					list.dataset.selectable = "true";
					host.replaceChildren(list);
				}
				let previous = null;
				for (const thread of threads) {
					const key = JSON.stringify([
						thread,
						snapshot.access,
						snapshot.status,
						snapshot.pullRequest?.state,
						snapshot.overview.status,
						snapshot.overview.data?.errors?.threads ?? null,
						snapshot.selectedCommitId,
					]);
					let entry = threadRows.get(thread.id);
					if (entry?.key !== key) {
						const row = node("li");
						if (isActivityThread(thread)) renderActivityThread(row, thread);
						else
							renderDiscussionThread(row, thread, {
								reviewActions,
								threadCodeView,
								avatarBase: `/avatars/${instanceId}/${snapshot.bindingRevision}/${thread.id}`,
							});
						entry?.row.replaceWith(row);
						entry = { key, row };
						threadRows.set(thread.id, entry);
					}
					const next = previous
						? previous.nextElementSibling
						: list.firstElementChild;
					if (entry.row !== next) list.insertBefore(entry.row, next);
					previous = entry.row;
				}
			}
			threadCodeView.show(
				threads.filter((thread) => !isActivityThread(thread)),
				`${discussionFilter}:${discussionSort}`,
			);
		},
	);
	if (overviewFocus && document.activeElement === document.body) {
		const thread = focusedFeedItem
			? document.getElementById(focusedFeedItem)
			: null;
		const scope = focusedFeedItem ? thread : element("reviewers");
		const replacement = [
			...(scope?.querySelectorAll("[data-action]:not(.action-menu)") ?? []),
		].find(
			(target) =>
				target instanceof HTMLElement &&
				target.tabIndex >= 0 &&
				target.dataset.action === focusedAction &&
				target.closest("[data-comment-id]")?.getAttribute("data-comment-id") ===
					focusedComment &&
				target
					.closest("[data-reviewer-id]")
					?.getAttribute("data-reviewer-id") === focusedReviewer,
		);
		const status = element("mutation-status");
		(replacement instanceof HTMLElement
			? replacement
			: status?.textContent && !status.hidden
				? status
				: fallbackFocus()
		).focus();
	}
}

function renderExternalLink(id, label, destination) {
	let number = element(id);
	const url = sanitizeExternalUrl(destination);
	if (number.tagName !== (url ? "A" : "SPAN")) {
		const replacement = document.createElement(url ? "a" : "span");
		replacement.id = number.id;
		replacement.className = number.className;
		replacement.dataset.selectable = "true";
		if (url)
			replacement.addEventListener("click", () => {
				telemetry.start("open_link", "details").finish("success");
			});
		number.replaceWith(replacement);
		number = replacement;
	}
	text(id, label);
	if (url) {
		number.setAttribute("href", url);
		number.setAttribute("target", "_blank");
		number.setAttribute("rel", "noopener noreferrer");
		number.setAttribute(
			"aria-label",
			`${number.textContent}. Opens in a new browser tab.`,
		);
	}
}

function branchUrl(pr, ref) {
	const safe = sanitizeExternalUrl(pr?.url);
	if (!safe || !ref?.startsWith("refs/heads/")) return null;
	const url = new URL(safe);
	if (!/\/pullrequest\/\d+\/?$/i.test(url.pathname)) return null;
	url.pathname = url.pathname.replace(/\/pullrequest\/\d+\/?$/i, "");
	url.search = "";
	url.hash = "";
	url.searchParams.set("version", `GB${ref.slice("refs/heads/".length)}`);
	return url.href;
}

function render() {
	const state = snapshot;
	const pr = state.pullRequest;
	const focused = document.activeElement;
	element("initial-loading").hidden = Boolean(pr) || state.status !== "loading";
	element("details").hidden = !pr;
	descriptionView.setActive(Boolean(pr));
	text("pr-title", pr?.title ?? "");
	renderExternalLink("pr-number", pr ? `#${pr.id}` : "", pr?.url);
	text(
		"pr-state",
		pr
			? {
					open: "Active",
					draft: "Draft",
					merged: "Completed",
					closed: "Abandoned",
				}[pr.state]
			: "",
	);
	element("pr-badge").setAttribute("data-state", pr?.state ?? "");
	for (const [id, ref] of [
		["source-ref", pr?.sourceRef],
		["target-ref", pr?.targetRef],
	])
		renderExternalLink(
			id,
			ref?.replace(/^refs\/heads\//, "") ?? "",
			branchUrl(pr, ref),
		);
	changed("description", pr?.description, () =>
		renderMarkdown(
			element("description"),
			pr ? pr.description || "No description." : "",
		),
	);
	text("pr-url", pr?.url ?? "");
	const contentError =
		Object.keys(state.overview?.data?.errors ?? {}).length > 0 ||
		actionErrors.has("overview") ||
		[state.overview, state.threadCode].some(
			(resource) =>
				resource?.status === "error" ||
				(userCancelled && resource?.status === "cancelled") ||
				(Array.isArray(resource?.data) &&
					resource.data.some((entry) => entry.error)),
		);
	const contentLoading = [state.overview, state.threadCode].some(
		(resource) => resource?.status === "loading",
	);
	text(
		"status",
		(disconnected
			? "Canvas connection was lost. Reconnecting... Your current view and drafts are kept."
			: null) ??
			actionErrors.get("refresh") ??
			{
				unavailable:
					"This PR view needs a trusted PR binding and read authorization from the app. No PR data has been loaded. Reopen the pull request from the workspace.",
				idle: "Select Refresh to load the linked pull request.",
				loading: pr ? "Refreshing pull request..." : "Loading pull request...",
				ready:
					state.accessError ??
					(contentError
						? "Some pull request content is unavailable. Retry the affected section."
						: contentLoading
							? "Loading pull request content..."
							: "Pull request is up to date."),
				cancelled: "Refresh cancelled.",
				error:
					state.error ??
					"Could not load the pull request. Select Refresh to try again.",
			}[state.status],
	);
	status.dataset.status =
		disconnected ||
		actionErrors.has("refresh") ||
		(state.status === "ready" && (contentError || state.accessError))
			? "error"
			: state.status;
	if (disconnected && events.readyState === EventSource.CLOSED)
		status.textContent =
			"Canvas connection was lost. Close this canvas and reopen it from the app. Your current view and drafts are kept until you close it.";
	const isUnavailable =
		lifetime.signal.aborted || disconnected || state.status === "unavailable";
	inactive(
		refresh,
		isUnavailable ||
			state.status === "loading" ||
			pendingActions.has("refresh"),
	);
	const canCancel =
		!isUnavailable && (state.status === "loading" || contentLoading);
	cancel.hidden = !canCancel || !pr;
	initialCancel.hidden = !canCancel || Boolean(pr);
	inactive(cancel, !canCancel || pendingActions.has("cancel-refresh"));
	inactive(initialCancel, !canCancel || pendingActions.has("cancel-refresh"));
	inactive(
		element("copy-url"),
		isUnavailable || !pr || pendingActions.has("copy"),
	);
	renderOverview(state.overview ?? emptyResource());
	updateCommentTimes(element("threads"));
	threadCodeView.render();
	reviewActions.render();
	renderFooter();
	if (restoreBindingFocus || focusWasLost(focused))
		restoreFocus(
			focused === initialCancel && isVisibleFocusTarget(cancel)
				? cancel
				: fallbackFocus(),
		);
}

function unavailable() {
	if (lifetime.signal.aborted) return;
	events.close();
	lifetime.abort();
	clearBinding();
	snapshot = {
		...snapshot,
		revision: ++revision,
		status: "unavailable",
		pullRequest: null,
		updatedAt: null,
		error: null,
		overview: emptyResource(),
		completion: emptyResource(),
		threadCode: emptyResource(),
	};
	render();
	status.textContent =
		"Canvas connection was lost. Close this canvas and reopen it from the app.";
	notice.textContent = status.textContent;
}

function finishRecovery() {
	// SSE may finish before HTTP confirms that the recovery request was accepted.
	if (
		!recoveryRequested ||
		!recoveryRequested.accepted ||
		!recoveryRequested.refreshed ||
		!recoveryOverviewStarted ||
		snapshot.status !== "ready" ||
		snapshot.accessError ||
		snapshot.overview.status !== "ready" ||
		Object.keys(snapshot.overview.data?.errors ?? {}).length > 0
	)
		return;
	recoveryRequested = recoveryOverviewStarted = false;
	feedback.clearRecovery();
}

events.onmessage = ({ data }) => {
	const state = JSON.parse(data);
	if (lifetime.signal.aborted || state.revision < revision) return;
	if (state.revision === revision) {
		disconnected = false;
		render();
		if (snapshot.pullRequest && snapshot.overview.status === "idle")
			void action("overview", null, false);
		return;
	}
	disconnected = false;
	const previous = snapshot;
	if (previous.bindingRevision !== state.bindingRevision) clearBinding();
	if (
		state.status === "cancelled" ||
		(state.status !== "loading" &&
			state.mutation?.status !== "loading" &&
			["overview", "threadCode"].some(
				(key) =>
					previous[key]?.status === "loading" &&
					state[key]?.status === "cancelled",
			))
	)
		userCancelled = true;
	revision = state.revision;
	snapshot = state;
	if (
		state.mutation?.status === "error" &&
		(previous.mutation?.status !== "error" ||
			previous.mutation.error !== state.mutation.error)
	) {
		recoveryRequested = recoveryOverviewStarted = false;
		mutationRecoveryRevision = state.revision;
		feedback.setRecovery(reviewActions.mutationError(state.mutation.error));
	}
	if (previous.bindingRevision !== state.bindingRevision)
		bindActionTelemetry(instanceId, state.bindingRevision);
	const refreshed =
		state.status === "ready" &&
		!state.accessError &&
		(previous.status === "loading" || previous.updatedAt !== state.updatedAt);
	const overviewLoaded =
		previous.overview?.status === "loading" &&
		state.overview?.status === "ready" &&
		Object.keys(state.overview.data?.errors ?? {}).length === 0;
	if (refreshed) actionErrors.delete("refresh");
	if (overviewLoaded) actionErrors.delete("overview");
	render();
	if (refreshed) feedback.clearRead("refresh");
	if (overviewLoaded) feedback.clearRead("overview");
	if (announceResult && state.status !== "loading") {
		if (state.status === "error" || state.accessError)
			feedback.error("Could not refresh pull request", status.textContent, {
				recovery: false,
				kind: "read:refresh",
			});
		else
			notice.textContent =
				state.status === "ready" && previous.status === "loading"
					? "Pull request details refreshed."
					: status.textContent;
		announceResult = false;
		renderFooter();
	}
	if (
		recoveryRequested &&
		(state.status === "error" ||
			state.status === "cancelled" ||
			state.mutation?.status === "loading" ||
			(state.status === "ready" && state.accessError) ||
			(recoveryOverviewStarted &&
				(state.overview.status === "error" ||
					state.overview.status === "cancelled" ||
					(state.overview.status === "ready" &&
						Object.keys(state.overview.data?.errors ?? {}).length > 0))))
	)
		recoveryRequested = recoveryOverviewStarted = false;
	// Refresh can join a background read that keeps the PR status ready.
	if (recoveryRequested && refreshed) recoveryRequested.refreshed = true;
	if (
		recoveryRequested &&
		recoveryRequested.refreshed &&
		state.status === "ready" &&
		state.overview.status === "loading"
	)
		recoveryOverviewStarted = true;
	finishRecovery();
	if (
		announceOverview &&
		previous.overview?.status === "loading" &&
		state.overview?.status !== "loading"
	) {
		if (
			state.overview.status === "error" ||
			Object.keys(state.overview.data?.errors ?? {}).length > 0
		)
			feedback.error(
				"Could not load pull request content",
				element("overview-status").textContent,
				{ recovery: false, kind: "read:overview" },
			);
		else notice.textContent = element("overview-status").textContent;
		announceOverview = false;
	}
	if (state.pullRequest && !overviewRequested) {
		overviewRequested = true;
		if (!state.overview || state.overview.status === "idle")
			void action("overview", null, false);
	}
};
events.onerror = () => {
	const previousStatus = status.textContent;
	const wasDisconnected = disconnected;
	disconnected = true;
	render();
	if (!wasDisconnected || previousStatus !== status.textContent)
		notice.textContent = status.textContent;
};

/** @param {ActionKey} key @param {HTMLElement | null} button @param {boolean} [announce] */
async function action(key, button, announce = true) {
	if (
		lifetime.signal.aborted ||
		disconnected ||
		snapshot.status === "unavailable" ||
		pendingActions.has(key) ||
		button?.getAttribute("aria-disabled") === "true"
	)
		return;
	const bindingRevision = snapshot.bindingRevision;
	const token = {};
	if (key === "refresh") {
		userCancelled = false;
		recoveryRequested = feedback.recoveryMessage()
			? { token, accepted: false, refreshed: false }
			: false;
		recoveryOverviewStarted = false;
	} else if (key === "cancel-refresh") {
		userCancelled = true;
		recoveryRequested = recoveryOverviewStarted = false;
	}
	pendingActions.set(key, token);
	actionErrors.delete(key);
	if (key === "refresh" || key === "cancel-refresh") announceResult = token;
	else if (announce) announceOverview = token;
	notice.textContent = "";
	const headers = new Headers({ "Content-Type": "application/json" });
	if (button)
		headers.set("X-Canvas-User-Action", key === "overview" ? "retry" : key);
	headers.set("X-Canvas-Binding", String(bindingRevision));
	render();
	function abandonRequest() {
		if (recoveryRequested && recoveryRequested.token === token)
			recoveryRequested = recoveryOverviewStarted = false;
		if (announceResult === token) announceResult = false;
		if (announceOverview === token) announceOverview = false;
	}
	try {
		const response = await fetch(
			`/${key === "overview" ? "load-overview" : key}/${instanceId}`,
			{
				method: "POST",
				headers,
				signal: bindingLifetime.signal,
			},
		);
		if (
			lifetime.signal.aborted ||
			pendingActions.get(key) !== token ||
			snapshot.bindingRevision !== bindingRevision
		)
			return;
		if (!response.ok) abandonRequest();
		if (response.status === 409) return;
		if (response.status === 403 || response.status === 404)
			return unavailable();
		if (!response.ok) {
			const error =
				key === "refresh" || key === "cancel-refresh"
					? "The canvas action failed. Select Refresh to try again."
					: "The canvas read could not start. Select Retry to try again.";
			actionErrors.set(key === "cancel-refresh" ? "refresh" : key, error);
			feedback.error("Pull request action failed", error, {
				recovery: false,
				kind: `read:${key === "cancel-refresh" ? "refresh" : key}`,
			});
		} else if (recoveryRequested && recoveryRequested.token === token) {
			recoveryRequested.accepted = true;
			finishRecovery();
		}
	} catch {
		if (
			!lifetime.signal.aborted &&
			pendingActions.get(key) === token &&
			snapshot.bindingRevision === bindingRevision
		) {
			abandonRequest();
			const error =
				"The canvas request failed. Your current view and drafts are kept. Retry when the connection is available.";
			actionErrors.set(key === "cancel-refresh" ? "refresh" : key, error);
			feedback.error("Pull request action failed", error, {
				recovery: false,
				kind: `read:${key === "cancel-refresh" ? "refresh" : key}`,
			});
		}
	} finally {
		if (pendingActions.get(key) === token) {
			pendingActions.delete(key);
			if (!lifetime.signal.aborted) render();
		}
	}
}

refresh.addEventListener("click", () => void action("refresh", refresh));
cancel.addEventListener("click", () => void action("cancel-refresh", cancel));
initialCancel.addEventListener(
	"click",
	() => void action("cancel-refresh", initialCancel),
);
element("retry-overview").addEventListener(
	"click",
	() => void action("overview", element("retry-overview")),
);
element("copy-url").addEventListener("click", async () => {
	const button = element("copy-url");
	if (
		!snapshot.pullRequest ||
		button.getAttribute("aria-disabled") === "true" ||
		lifetime.signal.aborted
	)
		return;
	const bindingRevision = snapshot.bindingRevision;
	const token = {};
	pendingActions.set("copy", token);
	text("copy-status", "");
	feedback.clearCopy();
	render();
	let message;
	let failed = false;
	const action = telemetry.start("copy_link", "details");
	try {
		await navigator.clipboard.writeText(snapshot.pullRequest.url);
		action.finish("success");
		message = "PR URL copied.";
	} catch {
		action.finish("failure", { errorCode: "clipboard" });
		failed = true;
		message = "Could not copy the PR URL. Copy it from the PR URL field.";
	}
	if (lifetime.signal.aborted || snapshot.bindingRevision !== bindingRevision)
		return;
	if (pendingActions.get("copy") === token) pendingActions.delete("copy");
	text("copy-status", message);
	element("copy-fallback").hidden = !failed;
	const fallback = inputElement("copy-fallback-url");
	fallback.value = failed ? snapshot.pullRequest.url : "";
	if (failed) {
		fallback.focus();
		fallback.select();
		feedback.error("Couldn't copy", message, { recovery: false });
	}
	render();
	if (!failed) feedback.copied();
});
window.addEventListener(
	"pagehide",
	() => {
		events.close();
		lifetime.abort();
		bindingLifetime.abort();
		descriptionView.dispose();
		threadCodeView.clear();
		feedback.dispose();
	},
	{ once: true },
);
