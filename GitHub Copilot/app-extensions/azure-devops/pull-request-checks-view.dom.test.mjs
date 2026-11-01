import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createReviewActions } from "./pull-request-actions.mjs";
import { createChecksView } from "./pull-request-checks-view.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";

const mergeStrategyType = "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab";
const pullRequest = { state: "open", mergeStatus: "succeeded" };
let host;
let overview;
let view;

beforeEach(() => {
	document.body.replaceChildren();
	host = document.createElement("div");
	overview = {
		icon: document.createElement("span"),
		summary: document.createElement("span"),
		note: document.createElement("span"),
	};
	document.body.append(host, ...Object.values(overview));
	view = createChecksView(host, overview);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function strategy(status, isBlocking = true) {
	return {
		id: isBlocking ? "strategy" : "optional-strategy",
		typeId: mergeStrategyType,
		name: "Require a merge strategy",
		status,
		isBlocking,
		isEnabled: true,
	};
}

test.each(["rejected", "queued", "approved", "notApplicable", "unknown"])(
	"omits %s merge-strategy policies from check rows and counts",
	(status) => {
		view.render(
			{
				policies: [strategy(status), strategy(status, false)],
				statuses: [],
			},
			pullRequest,
		);
		expect(overview.summary.textContent).toBe("No required checks");
		expect(overview.note.textContent).toBe("");
		expect(host.querySelectorAll(".check-list-row")).toHaveLength(0);
		expect(host.textContent).not.toContain("Require a merge strategy");
		expect(host.textContent).toContain("No merge conflicts");
	},
);

test("preserves real check counts alongside a rejected merge-strategy policy", () => {
	view.render(
		{
			policies: [
				strategy("rejected"),
				{
					id: "unit",
					name: "Status",
					statusName: "Unit tests",
					status: "approved",
					isBlocking: true,
					isEnabled: true,
				},
				{
					id: "comments",
					name: "Comment requirements",
					status: "rejected",
					isBlocking: true,
					isEnabled: true,
				},
			],
			statuses: [
				{ id: 1, name: "Unit tests", state: "succeeded" },
				{ id: 2, name: "Preview", state: "succeeded" },
			],
		},
		pullRequest,
	);
	expect(overview.summary.textContent).toBe("1 of 2 required checks failed");
	expect(overview.note.textContent).toBe("Optional check succeeded");
	host.querySelector(".checks-view-all").click();
	expect(
		[...host.querySelectorAll(".check-list-name")].map(
			(name) => name.textContent,
		),
	).toEqual(["Unit tests", "Preview", "Comments must be resolved"]);
	expect(host.textContent).not.toContain("Require a merge strategy");
});

test("collapses passed checks behind View checks", () => {
	view.render(
		{
			policies: [],
			statuses: [
				{ id: 1, name: "Build", state: "succeeded" },
				{ id: 2, name: "Lint", state: "succeeded" },
			],
		},
		pullRequest,
	);
	const viewAll = host.querySelector(".checks-view-all");
	expect(overview.note.textContent).toBe("2 optional checks succeeded");
	expect(host.querySelector(".ci-checks-card").hidden).toBe(true);
	expect(viewAll.hidden).toBe(false);
	expect(viewAll.textContent).toBe("View checks");
	expect(viewAll.getAttribute("aria-expanded")).toBe("false");
	viewAll.click();
	expect(host.querySelector(".ci-checks-card").hidden).toBe(false);
	expect(
		[...host.querySelectorAll(".check-list-name")].map(
			(name) => name.textContent,
		),
	).toEqual(["Build", "Lint"]);
	expect(viewAll.getAttribute("aria-expanded")).toBe("true");
});

test("identifies merge-strategy policies by type, not display name", () => {
	view.render(
		{
			policies: [
				{ ...strategy("rejected"), name: "Select a completion method" },
				{ ...strategy("rejected"), id: "other", typeId: "other-policy" },
			],
			statuses: [],
		},
		pullRequest,
	);
	expect(overview.summary.textContent).toBe("1 of 1 required checks failed");
	expect(
		[...host.querySelectorAll(".check-list-name")].map(
			(name) => name.textContent,
		),
	).toEqual(["Require a merge strategy"]);
});

test("offers Fix checks only for failures the check reader reports", () => {
	const fixCiButton = document.createElement("button");
	view = createChecksView(host, overview, { fixCiButton });
	const required = {
		name: "Policy",
		status: "rejected",
		isBlocking: true,
		isEnabled: true,
	};
	const external = { ...required, id: "status", statusName: "Unit tests" };
	view.render({ policies: [external], statuses: [] }, pullRequest, true);
	expect(fixCiButton.hidden).toBe(true);
	const build = { ...required, id: "build", typeId: BUILD_POLICY };
	view.render({ policies: [external, build], statuses: [] }, pullRequest, true);
	expect(fixCiButton.hidden).toBe(false);
});

test("a rejected Fix checks request restores the button and says why", async () => {
	document.body.innerHTML =
		'<p id="mutation-status"></p><button id="edit-title"></button><button id="edit-description"></button>';
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("", { status: 400 })),
	);
	const notify = vi.fn();
	const actions = createReviewActions({
		getSnapshot: () => ({
			status: "ready",
			pullRequest,
			overview: { status: "ready", data: {} },
			bindingRevision: 1,
			changesRevision: 1,
		}),
		getSignal: () => new AbortController().signal,
		instanceId: "canvas",
		notify,
		rerender: () => actions.setFixLabel(control, "Fix checks"),
	});
	const control = actions.fixAction("Fix checks", () => ({ kind: "checks" }));
	control.click();
	expect(control.textContent).toBe("Fix requested");
	await vi.waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			"Copilot could not start this fix. Refresh and try again.",
			{ error: true },
		),
	);
	expect(control.textContent).toBe("Fix checks");
});

test("an unknown Fix checks outcome keeps the request and says to check the conversation", async () => {
	document.body.innerHTML =
		'<p id="mutation-status"></p><button id="edit-title"></button><button id="edit-description"></button>';
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ outcome: "unknown" }, { status: 202 })),
	);
	const notify = vi.fn();
	const actions = createReviewActions({
		getSnapshot: () => ({
			status: "ready",
			pullRequest,
			overview: { status: "ready", data: {} },
			bindingRevision: 1,
			changesRevision: 1,
		}),
		getSignal: () => new AbortController().signal,
		instanceId: "canvas",
		notify,
		rerender: () => actions.setFixLabel(control, "Fix checks"),
	});
	const control = actions.fixAction("Fix checks", () => ({ kind: "checks" }));
	control.click();
	await vi.waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			"Copilot may still be working on this fix. Check the workspace conversation before trying again.",
			{ error: true, title: "Fix confirmation pending" },
		),
	);
	expect(control.textContent).toBe("Fix requested");
});

test("an accepted Fix checks request stays requested past 10 seconds until the source commit changes", async () => {
	vi.useFakeTimers();
	document.body.innerHTML =
		'<p id="mutation-status"></p><button id="edit-title"></button><button id="edit-description"></button>';
	const fetch = vi.fn(async () =>
		Response.json({ outcome: "accepted" }, { status: 202 }),
	);
	vi.stubGlobal("fetch", fetch);
	let current = { ...pullRequest, sourceCommitId: "b".repeat(40) };
	const actions = createReviewActions({
		getSnapshot: () => ({
			status: "ready",
			pullRequest: current,
			overview: { status: "ready", data: { threads: [] } },
			bindingRevision: 1,
			changesRevision: 1,
		}),
		getSignal: () => new AbortController().signal,
		instanceId: "canvas",
		notify: vi.fn(),
		rerender: () => actions.setFixLabel(control, "Fix checks"),
	});
	const control = actions.fixAction("Fix checks", () => ({ kind: "checks" }));
	const sync = () => {
		actions.unrequestedFixThreads();
		actions.setFixLabel(control, "Fix checks");
	};
	control.click();
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
	await vi.advanceTimersByTimeAsync(11_000);
	sync();
	expect(control.textContent).toBe("Fix requested");
	control.click();
	expect(fetch).toHaveBeenCalledOnce();
	current = { ...current, sourceCommitId: "c".repeat(40) };
	sync();
	expect(control.textContent).toBe("Fix checks");
});
