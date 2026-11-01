import {
	createCompletedActionTelemetry,
	safeActionError,
} from "./action-telemetry.mjs";
import { metaContent } from "./canvas-guest-view.mjs";
import { fieldNames, updatePicker } from "./repository-picker-state.mjs";
import { renderRepositoryPicker } from "./repository-picker-view.mjs";
import { parseAzureDevOpsRepositoryUrl } from "./repository-url.mjs";

// Native canvas WebViews do not inherit the app document's platform attribute.
// Mirror the app's detection so its scrollbar styling keeps the same OS policy.
const detectedPlatform = navigator.platform;
document.documentElement.dataset.platform = detectedPlatform.startsWith("Mac")
	? "macos"
	: detectedPlatform.startsWith("Win")
		? "windows"
		: "linux";

const instanceId = location.pathname.split("/").at(-1);
const endpoint = `/instances/${instanceId}`;
const documentToken = metaContent("picker-document");
const completionOwner = metaContent("completion-owner");
const pending = new Set();
let state;
let sequence = 0;
let revision = -1;
let appliedAccountRevision = 0;
let disposed = false;
let stateObservation;
let writing = false;
let writes = Promise.resolve();
let writeFailed = false;

let confirming = false;
let confirmationFailed = false;
let notificationError = "";
let observing = false;
let quickFillRevision = 0;
let quickFilling = false;
let quickFillTimer;
let quickFillController;
const telemetry = createCompletedActionTelemetry((report) =>
	request(report, "/interaction", 2_000),
);

const view = renderRepositoryPicker(
	document.querySelector("[data-repository-picker]"),
	{
		onCommand: change,
		onQuickFill: queueQuickFill,
		onReload: () => void load(true),
		completionOwner,
		onInteraction: (action, stage) =>
			telemetry.start(action, stage).finish("success"),
	},
);

async function request(command, suffix = "", timeout = 10_000, externalSignal) {
	const controller = new AbortController();
	pending.add(controller);
	try {
		const response = await fetch(`${endpoint}${suffix}`, {
			method: command ? "POST" : "GET",
			headers: {
				"X-Picker-Document": documentToken,
				...(command ? { "Content-Type": "application/json" } : {}),
			},
			body: command ? JSON.stringify(command) : undefined,
			signal: AbortSignal.any([
				controller.signal,
				AbortSignal.timeout(timeout),
				...(externalSignal ? [externalSignal] : []),
			]),
		});
		if (!response.ok) {
			const error = await response.json().catch(() => null);
			throw Object.assign(new Error(error?.error ?? "Picker request failed"), {
				code: error?.code,
			});
		}
		return await response.json();
	} finally {
		pending.delete(controller);
	}
}

function apply(next, resync = false) {
	if (
		disposed ||
		(!resync && (writeFailed || confirmationFailed)) ||
		(state &&
			!resync &&
			(next.sequence !== sequence || next.revision < revision))
	)
		return;
	const initializing = !state;
	const previousAccountRevision = appliedAccountRevision;
	state = next;
	sequence = next.sequence;
	revision = next.revision;
	view.showError(notificationError);
	view.update(state, writing, resync);
	const draftUrl = view.readDraft().url;
	const parsedDraftUrl = parseAzureDevOpsRepositoryUrl(draftUrl);
	const accountRevision = state.accountRevision ?? 0;
	appliedAccountRevision = accountRevision;
	if (
		(!state.repositoryUrl || state.repositoryUrlResultMode) &&
		parsedDraftUrl?.repository &&
		(initializing ||
			(completionOwner === "host" &&
				state.results &&
				accountRevision !== previousAccountRevision))
	)
		queueQuickFill(draftUrl, false);
}

function stopStateObservation() {
	stateObservation?.abort();
	stateObservation = undefined;
}

function observeStateChanges() {
	stopStateObservation();
	if (
		!disposed &&
		!confirming &&
		!writeFailed &&
		!confirmationFailed &&
		!writing &&
		!quickFilling &&
		state &&
		!(completionOwner === "host" && state.selection) &&
		(completionOwner === "host" ||
			state.results?.status === "loading" ||
			fieldNames.some((name) => state.fields[name].status === "loading"))
	) {
		const controller = new AbortController();
		stateObservation = controller;
		void load(false, controller);
	}
}

async function load(resync = false, observation) {
	if (confirming) return;
	if (resync) {
		stopStateObservation();
		await writes;
	}
	if (disposed) return;
	const action = resync ? telemetry.start("reload", "selection") : undefined;
	const expected = sequence;
	try {
		const next = await request(
			undefined,
			observation ? `?afterRevision=${revision}` : "",
			observation ? 25_000 : 10_000,
			observation?.signal,
		);
		if (expected !== sequence || disposed) {
			action?.finish("cancelled", { errorCode: "stale" });
			return;
		}
		if (resync) {
			writeFailed = false;
			confirmationFailed = false;
			notificationError = "";
		}
		apply(next, resync);
		observeStateChanges();
		if (resync) void observeConfirmation();
		action?.finish("success");
	} catch (error) {
		if (observation?.signal.aborted || disposed) {
			action?.finish("cancelled", { errorCode: "cancelled" });
			return;
		}
		action?.finish(disposed ? "cancelled" : "failure", safeActionError(error));
		if (disposed || expected !== sequence) return;
		view.showError(
			"Could not load this picker. Reload it to try again, or close the dialog.",
		);
	} finally {
		if (stateObservation === observation) stateObservation = undefined;
	}
}

function change(command, settling = false) {
	if (!state || disposed || writeFailed || (confirming && !settling))
		return null;
	if (command.type === "confirm" && state.repositoryUrl && !settling)
		return confirmLive();
	if (!settling) {
		cancelQuickFill();
		view.showQuickFillError("");
	}
	stopStateObservation();
	const previous = state;
	const nextCommand = { ...command, sequence: sequence + 1 };
	let optimistic;
	try {
		optimistic = updatePicker(state, nextCommand);
	} catch (error) {
		view.showError(error.message);
		return null;
	}
	sequence = nextCommand.sequence;
	confirmationFailed = false;
	state = optimistic;
	writing = true;
	view.showError(notificationError);
	view.update(
		command.type === "confirm" ? previous : optimistic,
		true,
		!settling,
	);
	writes = writes.then(() => save(nextCommand));
	return writes;
}

function cancelQuickFill() {
	quickFillRevision += 1;
	clearTimeout(quickFillTimer);
	quickFillTimer = undefined;
	quickFillController?.abort();
	quickFillController = undefined;
	if (quickFilling) {
		quickFilling = false;
		view.setQuickFillPending(false);
		if (state) view.update(state, writing);
	}
	observeStateChanges();
}

function startQuickFill(target, delay = 0) {
	cancelQuickFill();
	const run = quickFillRevision;
	quickFillTimer = setTimeout(() => {
		quickFillTimer = undefined;
		if (disposed || run !== quickFillRevision) return;
		const controller = new AbortController();
		quickFillController = controller;
		quickFilling = true;
		stopStateObservation();
		view.setQuickFillPending(true);
		if (state) view.update(state, true);
		view.showQuickFillError("");
		void fillFromUrl(target, run, controller.signal);
	}, delay);
}

function queueQuickFill(value, reportInvalid) {
	if (confirming || disposed) return;
	const target = parseAzureDevOpsRepositoryUrl(value);
	if (completionOwner === "host" && state?.results && target?.repository) {
		if (state.repositoryUrl !== value)
			change({ type: "url", value, selectResult: true });
		startQuickFill(target, reportInvalid ? 0 : 300);
		return;
	}
	const direct =
		target?.repository ||
		(state?.repositoryUrl &&
			value &&
			!(reportInvalid && target && !target.repository));
	if (
		state &&
		(Boolean(direct) !== Boolean(state.repositoryUrl) ||
			(direct && state.selection))
	)
		change({ type: "url", value: direct ? value : "" });
	if (direct || !reportInvalid) {
		cancelQuickFill();
		return;
	}
	if (!target) {
		cancelQuickFill();
		if (reportInvalid && value.trim())
			view.showQuickFillError(
				"Paste a valid Azure DevOps repository URL from dev.azure.com or visualstudio.com.",
			);
		return;
	}
	startQuickFill(target);
}

function comparable(value) {
	return value.normalize("NFKC").toLocaleLowerCase();
}

function matchingChoice(field, value) {
	const expected = comparable(value);
	const matches = field.options.filter((choice) => {
		const id = choice.id.split("/").at(-1);
		return (
			comparable(choice.name) === expected ||
			comparable(choice.id) === expected ||
			(typeof id === "string" && comparable(id) === expected)
		);
	});
	return matches.length === 1 ? matches[0] : null;
}

async function waitForQuickFillField(name, run, signal) {
	const deadline = Date.now() + 30_000;
	while (!disposed && run === quickFillRevision) {
		const field = state?.fields[name];
		if (!field) throw new Error(`The ${name} list is unavailable.`);
		if (field.status === "ready") return field;
		if (field.status === "error")
			throw new Error(
				`Could not load ${name === "repository" ? "repositories" : `${name}s`}. Retry the list.`,
			);
		if (field.status === "idle")
			throw new Error(
				`Choose the ${name === "project" ? "organization" : "project"} first.`,
			);
		if (Date.now() >= deadline)
			throw new Error(
				`Timed out while loading ${name === "repository" ? "repositories" : `${name}s`}.`,
			);
		const remaining = deadline - Date.now();
		const next = await request(
			undefined,
			`?afterRevision=${state.revision}`,
			Math.min(25_000, Math.max(1, remaining)),
			signal,
		);
		if (run !== quickFillRevision || disposed) return null;
		apply(next);
	}
	return null;
}

async function chooseQuickFillField(name, value, run, signal) {
	const field = await waitForQuickFillField(name, run, signal);
	if (!field || run !== quickFillRevision) return false;
	const choice = matchingChoice(field, value);
	if (!choice)
		throw new Error(
			`This ${name} was not found in the current Azure DevOps catalog.`,
		);
	const completion = change(
		{
			type: "choose",
			field: name,
			id: choice.id,
		},
		true,
	);
	if (!completion) return false;
	await completion;
	if (writeFailed)
		throw new Error(
			"Could not save the repository fields. Reload the picker to recover.",
		);
	if (run !== quickFillRevision) return false;
	return true;
}

async function clearQuickFillField(name, run) {
	const field = state?.fields[name];
	if (!field || run !== quickFillRevision || !field.selected) return true;
	const completion = change({ type: "query", field: name, value: "" }, true);
	if (!completion) return false;
	await completion;
	if (writeFailed)
		throw new Error(
			"Could not save the repository fields. Reload the picker to recover.",
		);
	return run === quickFillRevision;
}

async function fillFromUrl(target, run, signal) {
	try {
		const deadline = Date.now() + 10_000;
		while (!state && !disposed && run === quickFillRevision) {
			if (Date.now() >= deadline)
				throw new Error("The picker is still loading. Reload it to try again.");
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		if (disposed || run !== quickFillRevision || !state) return;
		if (!state.results) change({ type: "url", value: "", reset: true }, true);
		await writes;
		if (writeFailed || run !== quickFillRevision) return;
		confirmationFailed = false;
		const resolved = state.results
			? await request(target, "/validate", 30_000, signal)
			: null;
		if (run !== quickFillRevision || disposed) return;
		if (state.results && resolved.repositoryResult) {
			const next = await request();
			if (run !== quickFillRevision || disposed) return;
			apply(next);
			view.announceQuickFill(
				`Repository found: ${resolved.repositoryResult}. Choose it from the results.`,
			);
			return;
		}
		if (state.results && resolved.searchQuery) {
			const completion = change(
				{ type: "search", value: resolved.searchQuery },
				true,
			);
			if (!completion) return;
			await completion;
			if (writeFailed)
				throw new Error(
					"Could not save the repository search. Reload the picker to recover.",
				);
			if (run === quickFillRevision && !disposed)
				view.announceQuickFill(
					"Repository scope found. Choose a repository from the results.",
				);
			return;
		}
		if (
			!(await chooseQuickFillField(
				"organization",
				target.organization,
				run,
				signal,
			))
		)
			return;
		if (
			target.project &&
			!(await chooseQuickFillField("project", target.project, run, signal))
		)
			return;
		if (
			!(await clearQuickFillField(
				target.project ? "repository" : "project",
				run,
			))
		)
			return;
		if (run === quickFillRevision) {
			view.showQuickFillError("");
			const names = ["organization", "project"]
				.filter((name) => target[name])
				.map((name) => state.fields[name].selected?.name)
				.filter(Boolean);
			view.announceQuickFill(
				`${state.results ? "Repository found" : "Azure DevOps fields filled"}: ${names.join(" / ")}. Review the selections before continuing.`,
			);
		}
	} catch (error) {
		if (run === quickFillRevision && !disposed)
			view.showQuickFillError(
				error instanceof Error
					? error.message
					: "Could not fill repository fields from this URL.",
				error?.code,
			);
	} finally {
		if (run === quickFillRevision && !disposed) {
			quickFilling = false;
			quickFillController = undefined;
			view.setQuickFillPending(false);
			if (state) view.update(state, writing);
			observeStateChanges();
		}
	}
}

async function confirmLive(challenge = null) {
	if (
		disposed ||
		confirming ||
		(challenge && challenge.documentToken !== documentToken)
	)
		return;
	confirming = true;
	stopStateObservation();
	const draft = view.readDraft();
	const urlSubmission = Boolean(state?.repositoryUrl);
	const expiresAt = challenge?.expiresAt ?? Date.now() + 20_000;
	const lookup = new AbortController();
	let message = "";
	let errorCode;
	let success = false;
	let timeout;
	const expired = new Promise((_, reject) => {
		timeout = setTimeout(
			() =>
				reject(
					new Error(
						"The confirmation expired. Check your input and try again.",
					),
				),
			Math.max(0, expiresAt - Date.now()),
		);
	});
	const withinDeadline = (promise) => Promise.race([promise, expired]);
	try {
		if (!state)
			throw new Error(
				"The picker is still loading. Try again when it is ready.",
			);
		if (quickFilling)
			throw new Error(
				"Wait for the repository URL to finish filling the picker, then try again.",
			);
		if (draft.composing)
			throw new Error("Finish composing your text, then try again.");
		if (state.results && draft.searchQuery !== state.results.query) {
			change({ type: "search", value: draft.searchQuery }, true);
			await withinDeadline(writes);
			throw new Error("Choose a repository from the current search results.");
		}
		const target = urlSubmission
			? parseAzureDevOpsRepositoryUrl(draft.url)
			: null;
		if (urlSubmission && !target?.repository)
			throw new Error(
				"Enter a complete Azure DevOps repository URL, or clear it to browse.",
			);
		for (const name of fieldNames) {
			if (draft.queries[name] !== state.fields[name].query)
				change(
					{ type: "query", field: name, value: draft.queries[name] },
					true,
				);
		}
		if (urlSubmission)
			change({ type: "url", value: draft.url, reset: true }, true);
		view.freeze(true);
		await withinDeadline(writes);
		if (writeFailed)
			throw new Error(
				"Could not save your last change. Reload the picker before confirming.",
			);
		if (urlSubmission) {
			view.showQuickFillError("");
			view.setQuickFillPending(true);
			await withinDeadline(request(target, "/validate", 30_000, lookup.signal));
		}
		if (disposed) return;
		const expected = sequence;
		const settled = await withinDeadline(request());
		const latest = view.readDraft();
		if (
			latest.composing ||
			latest.editVersion !== draft.editVersion ||
			(state.results && latest.searchQuery !== settled.results.query) ||
			expected !== sequence ||
			settled.sequence !== sequence ||
			settled.revision < revision ||
			(settled.repositoryUrl && latest.url !== settled.repositoryUrl) ||
			fieldNames.some(
				(name) => latest.queries[name] !== settled.fields[name].query,
			)
		)
			throw new Error(
				"Your input changed during confirmation. Check your input and try again.",
			);
		if (Date.now() >= expiresAt)
			throw new Error(
				"The confirmation expired. Check your input and try again.",
			);
		const result = await withinDeadline(
			challenge
				? request(
						{
							documentToken,
							requestToken: challenge.requestToken,
							sequence,
							revision: settled.revision,
							queries: latest.queries,
							url: latest.url,
						},
						"/confirmation",
					)
				: request({
						type: "confirm",
						sequence: sequence + 1,
						queries: latest.queries,
						url: latest.url,
					}),
		);
		apply(challenge ? result.state : result, true);
		success = true;
	} catch (error) {
		message = error.message;
		errorCode = error.code;
		if (challenge && !disposed && Date.now() < expiresAt) {
			await withinDeadline(
				request(
					{
						documentToken,
						requestToken: challenge.requestToken,
						error: message,
					},
					"/confirmation",
				),
			).catch(() => {});
		}
	} finally {
		clearTimeout(timeout);
		lookup.abort();
		confirming = false;
		if (!disposed) {
			confirmationFailed =
				!success &&
				(!urlSubmission || writeFailed || Boolean(notificationError));
			view.setQuickFillPending(false);
			view.freeze(false);
			if (success) view.update(state, writing);
			else if (urlSubmission && !writeFailed && !notificationError) {
				view.showError("");
				view.showQuickFillError(message, errorCode);
				view.update(state, writing);
			} else view.showError(message);
			observeStateChanges();
		}
	}
	return success;
}

async function observeConfirmation() {
	if (observing || disposed) return;
	observing = true;
	let afterRequest = "";
	try {
		while (!disposed) {
			try {
				const challenge = await request(
					undefined,
					`/confirmation?documentToken=${documentToken}&afterRequest=${afterRequest}`,
					25_000,
				);
				if (challenge) {
					afterRequest = challenge.requestToken;
					const success = await confirmLive(challenge);
					// The host can close the instance before this document receives
					// pagehide. Only an acknowledged success ends its notification stream.
					if (success && completionOwner === "host") return;
				}
			} catch {
				if (!disposed) {
					notificationError =
						"The picker lost its connection. Reload the picker to try again, or close the dialog.";
					view.showError(notificationError);
				}
				return;
			}
		}
	} finally {
		observing = false;
	}
}

async function save(command) {
	if (disposed || writeFailed) return;
	try {
		const next = await request(command);
		if (command.sequence !== sequence || disposed) return;
		writing = false;
		apply(next);
		observeStateChanges();
	} catch {
		if (disposed) return;
		writeFailed = true;
		writing = false;
		view.showError(
			"Could not save your last change. Reload the picker to recover; that change may not have been saved.",
		);
	}
}

window.addEventListener(
	"pagehide",
	() => {
		cancelQuickFill();
		navigator.sendBeacon(
			`${endpoint}/document`,
			new Blob([JSON.stringify({ documentToken })], {
				type: "application/json",
			}),
		);
		disposed = true;
		stopStateObservation();
		for (const controller of pending) controller.abort();
		view.dispose();
	},
	{ once: true },
);

await load();
void observeConfirmation();
