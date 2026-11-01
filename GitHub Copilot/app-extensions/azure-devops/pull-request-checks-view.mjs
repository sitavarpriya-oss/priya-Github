import { sanitizeExternalUrl } from "./assets/pull-request-renderers.js";
import {
	createGitHubExternalLinkIcon,
	createGitHubStatusIcon,
} from "./github-ui-icons.mjs";
import { node, pagedList } from "./pull-request-actions.mjs";
import {
	hasFailedRequiredChecks,
	policyMatchesStatus,
} from "./pull-request-fix-state.mjs";
import { telemetry } from "./pull-request-telemetry.mjs";

function icon(state, className = "check-indicator") {
	return createGitHubStatusIcon(
		{
			attention: "danger",
			progress: "pending",
			passed: "success",
			information: "neutral",
		}[state],
		className,
	);
}

function toneForState(state) {
	if (["rejected", "failed", "error", "broken"].includes(state))
		return "attention";
	if (["notSet", "notset", "pending", "queued", "running"].includes(state))
		return "progress";
	if (["approved", "succeeded", "notApplicable"].includes(state))
		return "passed";
	return "information";
}

function combinedCheckState(status, policies) {
	const priority = {
		passed: 0,
		information: 1,
		progress: 2,
		attention: 3,
	};
	return policies.reduce(
		(selected, policy) =>
			priority[toneForState(policy.status)] > priority[toneForState(selected)]
				? policy.status
				: selected,
		status.state,
	);
}

function stateLabel(value) {
	return (
		{
			notSet: "Not set",
			notset: "Not set",
			pending: "Pending",
			queued: "Queued",
			running: "Running",
			approved: "Approved",
			succeeded: "Succeeded",
			rejected: "Rejected",
			failed: "Failed",
			error: "Error",
			broken: "Broken",
			notApplicable: "Not applicable",
		}[value] ?? "Unknown"
	);
}

function normalizedName(value) {
	return value.trim().toLocaleLowerCase();
}

const MINIMUM_APPROVAL_POLICY = "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd";
const REQUIRED_REVIEWER_POLICY = "fd2167ab-b0be-447a-8ec8-39368250530e";
const MERGE_STRATEGY_POLICY = "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab";

function isReviewerPolicy(policy) {
	return (
		policy.typeId === MINIMUM_APPROVAL_POLICY ||
		policy.typeId === REQUIRED_REVIEWER_POLICY
	);
}

function isMergePolicy(policy) {
	return normalizedName(policy.name).includes("merge conflict");
}

function policyCheckName(policy) {
	if (policy.displayName) return policy.displayName;
	if (policy.pipelineName) return policy.pipelineName;
	const name = normalizedName(policy.name);
	if (name === "work item linking") return "Work items must be linked";
	if (name === "comment requirements") return "Comments must be resolved";
	if (name === "status" && policy.statusName) {
		if (normalizedName(policy.statusName) === "codecoverage")
			return "Code coverage";
		return policy.statusName;
	}
	return policy.name;
}

function statusCheckName(status) {
	if (status.pipelineName) return status.pipelineName;
	if (!status.buildId && status.description?.trim())
		return status.description.trim();
	return status.name;
}

function reviewerPresentations(pullRequest, reviewerPolicies) {
	if (pullRequest?.state === "draft")
		return [
			{
				id: "reviewers",
				name: "No reviewers notified in draft mode",
				status: "notApplicable",
				tone: "information",
			},
		];
	return [MINIMUM_APPROVAL_POLICY, REQUIRED_REVIEWER_POLICY].flatMap(
		(typeId) => {
			const policies = reviewerPolicies.filter(
				(policy) => policy.typeId === typeId,
			);
			if (!policies.length) return [];
			const tones = policies.map((policy) => toneForState(policy.status));
			const tone = tones.includes("attention")
				? "attention"
				: tones.includes("progress")
					? "progress"
					: tones.every((value) => value === "passed")
						? "passed"
						: "information";
			let name =
				tone === "passed"
					? "Required reviewer policy satisfied"
					: "Required reviewers must approve";
			if (typeId === MINIMUM_APPROVAL_POLICY) {
				const count = policies.reduce(
					(maximum, policy) =>
						Math.max(maximum, policy.minimumApproverCount ?? 0),
					0,
				);
				name = count
					? tone === "passed"
						? `${count} ${count === 1 ? "reviewer" : "reviewers"} approved`
						: `At least ${count} ${count === 1 ? "reviewer" : "reviewers"} must approve`
					: tone === "passed"
						? "Reviewer approval requirement met"
						: "Reviewer approval required";
			}
			return [
				{
					id: typeId,
					name,
					status:
						tone === "attention"
							? "rejected"
							: tone === "progress"
								? "pending"
								: tone === "passed"
									? "approved"
									: "unknown",
					tone,
				},
			];
		},
	);
}

function mergePresentation(pullRequest) {
	if (!pullRequest?.mergeStatus) return null;
	const status = pullRequest.mergeStatus;
	const tone = ["succeeded", "rejectedByPolicy"].includes(status)
		? "passed"
		: ["conflicts", "failure"].includes(status)
			? "attention"
			: "progress";
	return {
		id: "merge",
		name:
			tone === "passed"
				? "No merge conflicts"
				: status === "conflicts"
					? "Merge conflicts must be resolved"
					: status === "failure"
						? "Merge conflict check failed"
						: "Checking for merge conflicts",
		status:
			tone === "passed"
				? "approved"
				: status === "conflicts"
					? "rejected"
					: status === "failure"
						? "error"
						: "pending",
		tone,
	};
}

function checksPresentation(data, pullRequest) {
	if (!data)
		return {
			checks: [],
			policyRows: [],
			tone: "information",
			title: "Check results have not loaded.",
			description: "",
		};
	const statuses = data?.statuses ?? [];
	const policies = (data?.policies ?? []).filter(
		(policy) => policy.isEnabled && policy.typeId !== MERGE_STRATEGY_POLICY,
	);
	const consumed = new Set();
	const checks = [];
	for (const status of statuses) {
		const matches = policies.filter((candidate) =>
			policyMatchesStatus(candidate, status),
		);
		const applicable = matches.filter(
			(policy) => policy.status !== "notApplicable",
		);
		const blocking = applicable.filter((policy) => policy.isBlocking);
		const represented = blocking.length ? blocking : applicable;
		for (const policy of represented) consumed.add(policy.id);
		const state = combinedCheckState(status, represented);
		const namedPolicy =
			represented.find((policy) => policy.isBlocking && policy.displayName) ??
			represented.find((policy) => policy.displayName);
		checks.push({
			id: `status:${status.id}`,
			name: namedPolicy?.displayName ?? statusCheckName(status),
			state,
			tone: toneForState(state),
			required: blocking.length > 0,
			url: status.url ?? represented.find((policy) => policy.url)?.url,
			pipelineUrl:
				(status.buildId ? status.url : undefined) ??
				represented.find((policy) => policy.buildId && policy.url)?.url,
		});
	}
	const reviewerPolicies = [];
	for (const policy of policies) {
		if (consumed.has(policy.id) || policy.status === "notApplicable") continue;
		if (isReviewerPolicy(policy)) {
			if (policy.isBlocking) reviewerPolicies.push(policy);
			continue;
		}
		if (isMergePolicy(policy)) continue;
		checks.push({
			id: `policy:${policy.id}`,
			name: policyCheckName(policy),
			state: policy.status,
			tone: toneForState(policy.status),
			required: policy.isBlocking,
			url: policy.url,
			pipelineUrl: policy.buildId ? policy.url : undefined,
		});
	}
	const required = checks.filter((check) => check.required);
	const optional = checks.filter((check) => !check.required);
	const failedRequired = required.filter((check) => check.tone === "attention");
	const pendingRequired = required.filter(
		(check) => check.tone === "progress" || check.tone === "information",
	);
	let tone = "passed";
	let title = "No required checks";
	if (failedRequired.length) {
		tone = "attention";
		title = `${failedRequired.length} of ${required.length} required checks failed`;
	} else if (pendingRequired.length) {
		tone = "progress";
		title = `${pendingRequired.length} of ${required.length} required checks pending`;
	} else if (required.length) {
		title = `${required.length} required ${required.length === 1 ? "check has" : "checks have"} passed`;
	}
	if (
		(data?.errors?.statuses ||
			data?.errors?.policies ||
			data?.errors?.builds) &&
		tone === "passed"
	) {
		tone = "information";
		title = "Some check results are unavailable";
	}
	const description = [];
	const optionalFailed = optional.filter(
		(check) => check.tone === "attention",
	).length;
	const optionalPending = optional.filter(
		(check) => check.tone === "progress" || check.tone === "information",
	).length;
	const optionalPassed = optional.filter(
		(check) => check.tone === "passed",
	).length;
	if (optionalFailed)
		description.push(
			`${optionalFailed} optional ${optionalFailed === 1 ? "check" : "checks"} failed`,
		);
	if (optionalPending)
		description.push(
			`${optionalPending} optional ${optionalPending === 1 ? "check" : "checks"} not yet run`,
		);
	if (optionalPassed)
		description.push(
			optionalPassed === 1
				? "Optional check succeeded"
				: `${optionalPassed} optional checks succeeded`,
		);
	if (data?.errors?.statuses || data?.errors?.policies || data?.errors?.builds)
		description.push("Some check results unavailable");
	const policyRows = [
		...reviewerPresentations(pullRequest, reviewerPolicies),
		mergePresentation(pullRequest),
	].filter(Boolean);
	return {
		checks,
		policyRows,
		tone,
		title,
		description: description.join(" \u00b7 "),
	};
}

/**
 * Mirrors ADO's check list while using the app's icon and token language.
 * @param {HTMLElement} host
 * @param {{icon: HTMLElement, summary: HTMLElement, note: HTMLElement}} overview
 * @param {{fixCiButton?: HTMLButtonElement, resolveConflictsButton?: HTMLButtonElement}} [actions]
 */
export function createChecksView(
	host,
	overview,
	{ fixCiButton, resolveConflictsButton } = {},
) {
	const ciCard = node("div", "", "ci-checks-card");
	const ciList = node("div");
	ciList.id = "ci-checks-list";
	ciCard.append(ciList);
	const viewAll = node("button", "", "checks-view-all");
	viewAll.type = "button";
	viewAll.setAttribute("aria-controls", ciList.id);
	viewAll.setAttribute("aria-expanded", "false");
	const policyList = node("ul", "", "policy-list");
	policyList.dataset.selectable = "true";
	host.append(ciCard, viewAll, policyList);
	let rendered;
	let showAllChecks = false;
	let presentation = checksPresentation(null, null);
	let statusPage = 0;
	let fixesVisible = false;

	function renderOverview() {
		overview.icon.replaceChildren(
			icon(presentation.tone, "checks-overview-status"),
		);
		overview.icon.dataset.state = presentation.tone;
		overview.summary.textContent = presentation.title;
		overview.note.textContent = presentation.description;
	}

	function captureCheckFocus() {
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return null;
		if (active === viewAll) return { kind: "view-all" };
		if (!ciList.contains(active)) return null;
		if (active.matches(".pager button"))
			return { kind: "pager", label: active.textContent };
		if (active.dataset.checkFocusKey)
			return { kind: "check", key: active.dataset.checkFocusKey };
		return { kind: "list" };
	}

	function focusChecksFallback() {
		const target = viewAll.hidden
			? document.getElementById("overview-status")
			: viewAll;
		target?.focus({ preventScroll: true });
	}

	function restoreCheckFocus(focus) {
		if (!focus) return;
		if (focus.kind === "view-all") {
			focusChecksFallback();
			return;
		}
		if (focus.kind === "pager") {
			const replacement = [...ciList.querySelectorAll(".pager button")].find(
				(control) =>
					control.textContent === focus.label && !control.closest("[hidden]"),
			);
			if (replacement instanceof HTMLElement) {
				replacement.focus({ preventScroll: true });
				return;
			}
		}
		if (focus.kind === "check") {
			const replacement = [
				...ciList.querySelectorAll("[data-check-focus-key]"),
			].find(
				(control) =>
					control instanceof HTMLElement &&
					control.dataset.checkFocusKey === focus.key,
			);
			if (replacement instanceof HTMLElement) {
				replacement.focus({ preventScroll: true });
				return;
			}
		}
		focusChecksFallback();
	}

	function renderStatusRow(row, check) {
		row.className = "check-list-row";
		row.dataset.tone = check.tone;
		row.dataset.status = check.state;
		const name = node("span", check.name, "check-list-name");
		const spokenStatus = node("span", stateLabel(check.state), "sr-only");
		const requirement = node(
			"span",
			check.required ? "Required" : "Optional",
			"sr-only",
		);
		const pipelineUrl = sanitizeExternalUrl(check.pipelineUrl);
		if (pipelineUrl) {
			row.classList.add("check-list-row-linked");
			const link = node("a", "", "check-list-row-link");
			link.href = pipelineUrl;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.dataset.checkFocusKey = check.id;
			link.append(
				icon(check.tone),
				name,
				spokenStatus,
				requirement,
				node("span", "Pipeline. Opens in a new browser tab.", "sr-only"),
				createGitHubExternalLinkIcon(),
			);
			row.append(link);
			return;
		}
		row.append(icon(check.tone), name, spokenStatus, requirement);
		const detailsUrl = sanitizeExternalUrl(check.url);
		if (detailsUrl) {
			const details = node("a", "", "check-details-link");
			details.href = detailsUrl;
			details.target = "_blank";
			details.rel = "noopener noreferrer";
			details.dataset.checkFocusKey = check.id;
			details.setAttribute(
				"aria-label",
				`Open ${check.name} details. Opens in a new browser tab.`,
			);
			details.append(createGitHubExternalLinkIcon());
			row.append(details);
		}
	}

	function renderCiRows() {
		const focus = captureCheckFocus();
		const actionable = presentation.checks.filter((check) =>
			["attention", "progress", "information"].includes(check.tone),
		);
		const requiredActionable = actionable.filter((check) => check.required);
		const defaultVisible = requiredActionable.length
			? requiredActionable
			: actionable;
		const visible = showAllChecks ? presentation.checks : defaultVisible;
		ciCard.hidden = visible.length === 0;
		pagedList(
			ciList,
			visible,
			"checks",
			"No checks.",
			(row, check) => {
				renderStatusRow(row, check);
			},
			20,
			(_items, start) => {
				statusPage = start / 20;
			},
			statusPage,
		);
		viewAll.hidden =
			presentation.checks.length === 0 ||
			presentation.checks.length === defaultVisible.length;
		viewAll.textContent = showAllChecks ? "Collapse" : "View checks";
		viewAll.setAttribute("aria-expanded", String(showAllChecks));
		restoreCheckFocus(focus);
	}

	function renderPolicyRows() {
		const restoreResolveFocus =
			resolveConflictsButton &&
			document.activeElement === resolveConflictsButton;
		if (resolveConflictsButton) resolveConflictsButton.hidden = true;
		policyList.replaceChildren(
			...presentation.policyRows.map((policy) => {
				const row = node("li", "", "policy-summary-row");
				row.dataset.tone = policy.tone;
				row.dataset.status = policy.status;
				row.append(
					icon(policy.tone),
					node("span", policy.name, "policy-summary-name"),
					node("span", stateLabel(policy.status), "sr-only"),
				);
				if (
					resolveConflictsButton &&
					fixesVisible &&
					policy.id === "merge" &&
					policy.status === "rejected"
				) {
					resolveConflictsButton.hidden = false;
					row.append(resolveConflictsButton);
				}
				return row;
			}),
		);
		policyList.hidden = presentation.policyRows.length === 0;
		if (restoreResolveFocus) {
			const target =
				resolveConflictsButton &&
				!resolveConflictsButton.hidden &&
				resolveConflictsButton.isConnected
					? resolveConflictsButton
					: document.getElementById("overview-status");
			target?.focus({ preventScroll: true });
		}
	}

	viewAll.addEventListener("click", () => {
		const action = telemetry.start(
			showAllChecks ? "collapse" : "expand",
			"checks",
		);
		showAllChecks = !showAllChecks;
		statusPage = 0;
		renderCiRows();
		viewAll.focus();
		action.finish("success");
	});

	return {
		clear() {
			presentation = checksPresentation(null, null);
			showAllChecks = false;
			statusPage = 0;
			ciList.replaceChildren();
			policyList.replaceChildren();
			ciCard.hidden = true;
			viewAll.hidden = true;
			viewAll.textContent = "";
			viewAll.setAttribute("aria-expanded", "false");
			overview.icon.replaceChildren();
			overview.summary.textContent = "";
			overview.note.textContent = "";
			if (fixCiButton) fixCiButton.hidden = true;
			if (resolveConflictsButton) resolveConflictsButton.hidden = true;
			rendered = undefined;
		},
		render(data, pullRequest, showFixActions = false) {
			fixesVisible = showFixActions;
			const key = JSON.stringify([
				data?.statuses,
				data?.policies,
				data?.reviewers,
				data?.errors,
				pullRequest?.state,
				pullRequest?.mergeStatus,
				fixesVisible,
			]);
			if (key === rendered) return;
			rendered = key;
			presentation = checksPresentation(data, pullRequest);
			if (fixCiButton) {
				const restoreFixCiFocus = document.activeElement === fixCiButton;
				fixCiButton.hidden =
					!fixesVisible ||
					Boolean(
						data?.errors?.statuses ||
							data?.errors?.policies ||
							data?.errors?.builds,
					) ||
					!hasFailedRequiredChecks(data);
				if (restoreFixCiFocus && fixCiButton.hidden)
					document
						.getElementById("overview-status")
						?.focus({ preventScroll: true });
			}
			renderOverview();
			renderCiRows();
			renderPolicyRows();
		},
	};
}
