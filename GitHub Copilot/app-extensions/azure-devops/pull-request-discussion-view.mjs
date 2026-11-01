import { createGitHubStatusIcon } from "./github-ui-icons.mjs";
import {
	avatar,
	node,
	pagedList,
	renderMarkdown,
} from "./pull-request-actions.mjs";
import { openPopup } from "./pull-request-popups.mjs";
import { telemetry } from "./pull-request-telemetry.mjs";
import { hasThreadCode } from "./pull-request-thread-code-view.mjs";

const statuses = {
	active: "Active",
	fixed: "Resolved",
	wontFix: "Won't fix",
	closed: "Closed",
	byDesign: "By design",
	pending: "Pending",
};

/** @type {WeakMap<Element, (now: number) => void>} */
const commentTimeUpdaters = new WeakMap();

function relativeCommentTime(timestamp, now) {
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
	const [amount, unit, short] =
		seconds < 60
			? [0, "", ""]
			: seconds < 3600
				? [Math.floor(seconds / 60), "minute", "m"]
				: seconds < 86400
					? [Math.floor(seconds / 3600), "hour", "h"]
					: [Math.floor(seconds / 86400), "day", "d"];
	return {
		age: amount ? `${amount}${short} ago` : "now",
		spokenAge: amount
			? `${amount} ${unit}${amount === 1 ? "" : "s"} ago`
			: "now",
	};
}

/** @param {ParentNode} host @param {number} [now] */
export function updateCommentTimes(host, now = Date.now()) {
	for (const trigger of host.querySelectorAll("[data-comment-time]"))
		commentTimeUpdaters.get(trigger)?.(now);
}

function commentTime(comment, kind = "comment") {
	const timestamp = Date.parse(comment.publishedAt);
	if (!Number.isFinite(timestamp))
		return node("span", "Not reported", "row-meta");
	const full = new Intl.DateTimeFormat("en-US", {
		dateStyle: "long",
		timeStyle: "short",
	}).format(timestamp);
	const host = node("span", "", "comment-time");
	const trigger = node("button", "", "comment-age");
	trigger.type = "button";
	trigger.dataset.action = "comment-timestamp";
	trigger.dataset.commentTime = "";
	trigger.setAttribute("aria-expanded", "false");
	const time = node("time");
	time.dateTime = new Date(timestamp).toISOString();
	const author = comment.author?.name ?? "Unknown author";
	const update = (now) => {
		const { age, spokenAge } = relativeCommentTime(timestamp, now);
		if (time.textContent !== age) time.textContent = age;
		const label = `${spokenAge}, ${author} ${kind}, show timestamp`;
		if (trigger.getAttribute("aria-label") !== label)
			trigger.setAttribute("aria-label", label);
	};
	commentTimeUpdaters.set(trigger, update);
	update(Date.now());
	trigger.append(time);
	host.append(trigger);
	let dismiss = null;
	function show(userAction = false) {
		if (trigger.getAttribute("aria-expanded") === "true") return;
		const content = node("span", full, "floating-panel comment-timestamp");
		content.dataset.selectable = "true";
		host.append(content);
		dismiss = openPopup(trigger, content, (reason) => {
			content.remove();
			// Focus-loss (including Tab) may be programmatic; only explicit
			// dismissals of a user-opened panel count as another action.
			if (userAction === true && ["outside-pointer", "escape"].includes(reason))
				telemetry.start("collapse", "timestamp").finish("success");
		});
		const notice = document.getElementById("notice");
		if (notice) notice.textContent = `Published ${full}.`;
	}
	trigger.addEventListener("click", () => {
		const action = telemetry.start(
			trigger.getAttribute("aria-expanded") === "true" ? "collapse" : "expand",
			"timestamp",
		);
		if (trigger.getAttribute("aria-expanded") === "true") dismiss?.();
		else show(true);
		action.finish("success");
	});
	trigger.addEventListener("pointerenter", () => show());
	return host;
}

function byline(comment, avatarBase) {
	const author = comment.author?.name ?? "Unknown author";
	const identity = node("div", "", "comment-identity");
	const metadata = node("span", "", "comment-meta");
	metadata.append(
		node("strong", author),
		document.createTextNode(" \u00b7 "),
		commentTime(comment),
	);
	const profile = avatar(author);
	if (avatarBase && comment.author?.avatarUrl) {
		const image = node("img");
		image.alt = "";
		image.loading = "lazy";
		image.decoding = "async";
		image.dataset.loaded = "false";
		image.src = `${avatarBase}/${comment.id}`;
		image.addEventListener("load", () => {
			image.dataset.loaded = "true";
		});
		image.addEventListener(
			"error",
			() => {
				image.remove();
				metadata.append(
					node(
						"span",
						" Profile photo unavailable; initials shown.",
						"sr-only",
					),
				);
			},
			{ once: true },
		);
		profile.append(image);
	}
	identity.append(profile, metadata);
	return identity;
}

function appendStatusBadge(host, status) {
	if (!Object.hasOwn(statuses, status)) return;
	const badge = node("span", statuses[status], "comment-status");
	badge.dataset.status = status;
	host.append(badge);
}

const activityFallbacks = {
	RefUpdate: "updated the pull request branch.",
	ReviewersUpdate: "updated the reviewers.",
	StatusUpdate: "updated the pull request status.",
	IsDraftUpdate: "updated the draft state.",
};

function activityContent(content) {
	const vote = /(?:^|\s)voted\s+(.+?)\.?$/i
		.exec(content)?.[1]
		?.replace(/\.$/, "")
		.toLocaleLowerCase();
	return (
		{
			10: "approved the pull request.",
			approved: "approved the pull request.",
			5: "approved with suggestions.",
			"approved with suggestions": "approved with suggestions.",
			0: "reset their feedback.",
			"no vote": "reset their feedback.",
			"-5": "is waiting for the author.",
			"waiting for author": "is waiting for the author.",
			"-10": "rejected the pull request.",
			rejected: "rejected the pull request.",
		}[vote] ?? content
	);
}

/**
 * @param {HTMLLIElement} row
 * @param {import("./pull-requests.mjs").Thread} thread
 */
export function renderActivityThread(row, thread) {
	row.className = "activity-post";
	row.id = `activity-${thread.id}`;
	row.dataset.activityType = thread.activityType ?? "system";
	const comments = thread.comments.length
		? thread.comments
		: [
				{
					id: 0,
					author: null,
					content: "",
					publishedAt: thread.updatedAt ?? thread.publishedAt ?? null,
				},
			];
	for (const comment of comments) {
		const heading = node("h4", `Activity update ${thread.id}`, "sr-only");
		const entry = node("article", "", "activity-entry");
		const marker = node("span", "", "activity-marker");
		marker.append(createGitHubStatusIcon("neutral", "activity-icon"));
		const copy = node("div", "", "activity-copy");
		const message = node("div", "", "activity-message markdown");
		const author = comment.author?.name ?? "Azure DevOps";
		const content = activityContent(
			comment.content.trim() ||
				activityFallbacks[thread.activityType] ||
				"updated the pull request.",
		);
		renderMarkdown(message, content);
		// The activity entry owns h4; comment headings stay beneath it.
		for (const heading of message.querySelectorAll("h1,h2,h3,h4,h6")) {
			const nestedHeading = node("h5");
			nestedHeading.append(...heading.childNodes);
			heading.replaceWith(nestedHeading);
		}
		const body = message.querySelector(".markdown-body") ?? message;
		const byline =
			body.firstElementChild?.tagName === "P"
				? body.firstElementChild
				: node("p");
		if (!byline.parentNode) body.prepend(byline);
		byline.prepend(node("strong", author), document.createTextNode(" "));
		message.dataset.selectable = "true";
		const metadata = node("div", "", "activity-meta");
		metadata.append(commentTime(comment, "activity"));
		copy.append(message, metadata);
		entry.append(marker, copy);
		row.append(heading, entry);
	}
}

/**
 * Keep the discussion's ordering and filtering with its caller.
 * @param {HTMLLIElement} row
 * @param {import("./pull-requests.mjs").Thread} thread
 * @param {{reviewActions: ReturnType<typeof import("./pull-request-actions.mjs").createReviewActions>, threadCodeView: ReturnType<typeof import("./pull-request-thread-code-view.mjs").createThreadCodeView>, avatarBase?: string}} options
 */
export function renderDiscussionThread(
	row,
	thread,
	{ reviewActions, threadCodeView, avatarBase },
) {
	row.className = "thread";
	row.id = `thread-${thread.id}`;
	const card = node("div", "", "comment-thread");
	row.append(card);
	const path = thread.anchor?.path ?? thread.path;
	if (path) {
		const rightLine = thread.threadContext?.rightFileStart?.line;
		const leftLine = thread.threadContext?.leftFileStart?.line;
		const line = thread.anchor?.startLine ?? rightLine ?? leftLine;
		const header = node("div", "", "comment-header comment-file-header");
		const file = node(
			"span",
			`${path}${line ? `:${line}` : ""}`,
			"thread-context",
		);
		file.dataset.selectable = "true";
		header.append(file);
		appendStatusBadge(header, thread.status);
		card.append(header);
		if (hasThreadCode(thread)) card.append(threadCodeView.mount(thread, file));
	} else if (!thread.comments.length) {
		const header = node("div", "", "comment-header");
		appendStatusBadge(header, thread.status);
		if (header.hasChildNodes()) card.append(header);
	}
	const comments = node("div", "", "thread-comments");
	card.append(comments);
	pagedList(
		comments,
		thread.comments,
		`comments and replies ${thread.id}`,
		"No comments.",
		(commentRow, comment, index) => {
			commentRow.className = "comment-post";
			commentRow.dataset.commentId = String(comment.id);
			const pageHeader = !path && index === 0;
			const header = node(
				"div",
				"",
				pageHeader ? "comment-header" : "comment-byline",
			);
			const actionHost = node("div", "", "comment-actions");
			const trailing = node("div", "", "comment-byline-actions");
			if (pageHeader) appendStatusBadge(trailing, thread.status);
			trailing.append(actionHost);
			header.append(byline(comment, avatarBase), trailing);
			const body = node("div", "", "comment-body");
			const content = node("div", "", "markdown");
			content.dataset.selectable = "true";
			body.append(content);
			renderMarkdown(content, comment.content);
			commentRow.append(header, body);
			if (index === 0)
				reviewActions.threadLink(actionHost, thread, comment.author?.name);
			reviewActions.comment(actionHost, body, thread, comment);
			if (!actionHost.hasChildNodes()) actionHost.remove();
		},
		null,
	);
	reviewActions.thread(card, thread);
}
