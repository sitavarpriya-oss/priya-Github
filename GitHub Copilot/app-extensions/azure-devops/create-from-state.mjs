import { randomUUID } from "node:crypto";
import { hasControlCharacters } from "./create-from-api.mjs";
import {
	PickerInputError,
	pickerErrorMessage,
} from "./repository-picker-state.mjs";
import { waitWithCancellation } from "./request.mjs";

export function createCreateFromState(api, boundAccountId = null) {
	let revision = 0;
	let sequence = 0;
	let closed = false;
	let completed = false;
	let documentToken = null;
	let controller;
	let pendingConfirmation;
	let accounts = [];
	let accountId = null;
	let mode = "branch";
	let query = "";
	let queryError = null;
	let options = [];
	let repositoryName = null;
	let selected = null;
	let status = "loading";
	let error = null;
	let errorCode = null;
	let truncated = false;
	const listeners = new Set();

	function changed() {
		revision += 1;
		for (const listener of [...listeners]) listener();
	}
	function assertOpen() {
		if (closed) throw new PickerInputError("Canvas instance is closed.", 404);
	}
	function assertDocument(token) {
		assertOpen();
		if (!documentToken || token !== documentToken)
			throw new PickerInputError(
				"This document was replaced. Reload the picker.",
				409,
			);
	}
	function rejectConfirmation(message) {
		if (!pendingConfirmation) return;
		controller?.abort();
		clearTimeout(pendingConfirmation.timer);
		pendingConfirmation.resolve({ status: "rejected", message });
		pendingConfirmation = null;
	}
	function invalidate() {
		controller?.abort();
		rejectConfirmation("The selection changed. Check it and try again.");
		selected = null;
	}
	async function load(reloadAccounts = false) {
		invalidate();
		options = [];
		status = "loading";
		error = null;
		errorCode = null;
		truncated = false;
		const work = new AbortController();
		controller = work;
		const signal = AbortSignal.any([work.signal, AbortSignal.timeout(15_000)]);
		changed();
		try {
			if (queryError) throw new PickerInputError(queryError);
			if (reloadAccounts) {
				repositoryName = null;
				accounts = [];
				accountId = null;
				const nextAccounts = await api.accounts(signal);
				signal.throwIfAborted();
				accounts =
					boundAccountId === null
						? nextAccounts
						: nextAccounts.filter((account) => account.id === boundAccountId);
				if (boundAccountId !== null && accounts.length !== 1)
					throw new Error(
						"The project's Microsoft account is no longer available. Open Account settings and retry.",
					);
				accountId = accounts.length === 1 ? accounts[0].id : null;
			}
			if (query.length > 4096)
				throw new PickerInputError(
					"Search text must be 4096 characters or fewer. Shorten your search.",
				);
			if (accountId) {
				const result = await api.list(accountId, mode, query, signal);
				signal.throwIfAborted();
				options = result.options;
				repositoryName = result.repositoryName;
				truncated = result.truncated;
			}
			status = "ready";
		} catch (failure) {
			if (work.signal.aborted || closed) return;
			status = "error";
			errorCode = pickerErrorMessage(failure?.code) ? failure.code : null;
			error = signal.aborted
				? "Azure DevOps took too long. Retry the list."
				: (pickerErrorMessage(errorCode) ??
					(failure instanceof Error
						? failure.message
						: "Could not load Azure DevOps. Retry the list."));
		}
		if (controller === work && !closed) changed();
	}
	function disabledReason() {
		if (completed) return "The selection was confirmed. Close this dialog.";
		if (!documentToken)
			return "Loading the picker. Reload if it does not appear.";
		if (pendingConfirmation) return "Checking the selected branch...";
		if (status === "loading") return "Loading Azure DevOps...";
		if (status === "error") return error;
		if (!accounts.length)
			return "Add a Microsoft account in Account settings, then retry.";
		if (!accountId) return "Choose a Microsoft account.";
		if (!selected) return "Choose a branch or open pull request.";
		return null;
	}
	function read() {
		assertOpen();
		return {
			revision,
			sequence,
			accounts,
			accountId,
			mode,
			query,
			queryError,
			options,
			repositoryName,
			selectedId: selected?.id ?? null,
			status,
			error,
			errorCode,
			truncated,
			confirmation: pendingConfirmation
				? { requestToken: pendingConfirmation.requestToken }
				: null,
		};
	}
	return {
		read,
		readDocument(token) {
			assertDocument(token);
			return read();
		},
		document() {
			assertOpen();
			invalidate();
			documentToken = randomUUID();
			completed = false;
			sequence = 0;
			query = "";
			queryError = null;
			mode = "branch";
			// A reload cannot retain a previous guest's selection or account.
			void load(true);
			changed();
			return documentToken;
		},
		change(command, token) {
			assertDocument(token);
			if (
				!Number.isSafeInteger(command.sequence) ||
				command.sequence <= sequence ||
				Object.keys(command).some(
					(key) => !["type", "value", "sequence"].includes(key),
				)
			)
				throw new PickerInputError("The picker has already changed.", 409);
			const value = command.value;
			if (
				command.type === "account" &&
				!accounts.some((item) => item.id === value)
			)
				throw new PickerInputError("Choose a current Microsoft account.");
			if (
				command.type === "mode" &&
				!["branch", "pull-request"].includes(value)
			)
				throw new PickerInputError("Choose a branch or pull request.");
			if (
				command.type === "query" &&
				(typeof value !== "string" ||
					(value.length <= 4096 && hasControlCharacters(value)))
			)
				throw new PickerInputError("Invalid search text.");
			if (command.type === "query-error" && value !== "control-characters")
				throw new PickerInputError("Invalid search validation.");
			if (
				command.type === "select" &&
				(status !== "ready" || !options.some((item) => item.id === value))
			)
				throw new PickerInputError("Choose a result from the current list.");
			if (
				![
					"account",
					"mode",
					"query",
					"query-error",
					"select",
					"retry",
					"release",
				].includes(command.type)
			)
				throw new PickerInputError("Invalid picker command.");
			sequence = command.sequence;
			if (command.type === "select") {
				rejectConfirmation("The selection changed. Try again.");
				error = null;
				selected = options.find((item) => item.id === value);
				changed();
			} else if (command.type === "release") {
				invalidate();
				documentToken = null;
				changed();
			} else {
				if (command.type === "account") accountId = value;
				if (command.type === "mode") {
					mode = value;
					query = "";
					queryError = null;
				}
				if (command.type === "query") {
					query = value;
					queryError = null;
				}
				if (command.type === "query-error") {
					query = "";
					queryError =
						"Search text cannot contain control characters. Remove them and try again.";
				}
				void load(command.type === "retry");
			}
			return read();
		},
		observe(afterRevision) {
			if (
				afterRevision !== null &&
				(!Number.isSafeInteger(afterRevision) || afterRevision < 0)
			)
				throw new PickerInputError("Invalid dialog revision.");
			const hint = () => {
				assertOpen();
				const disabled = disabledReason();
				return {
					revision,
					ready: disabled === null,
					disabledReason: disabled,
				};
			};
			if (afterRevision === null || afterRevision < revision)
				return Promise.resolve(hint());
			return new Promise((resolve, reject) => {
				const finish = () => {
					clearTimeout(timer);
					listeners.delete(finish);
					try {
						resolve(hint());
					} catch (failure) {
						reject(failure);
					}
				};
				const timer = setTimeout(finish, 1000);
				listeners.add(finish);
			});
		},
		confirm() {
			assertOpen();
			const reason = disabledReason();
			if (reason)
				return Promise.resolve({ status: "rejected", message: reason });
			return new Promise((resolve) => {
				pendingConfirmation = {
					resolve,
					requestToken: randomUUID(),
					timer: setTimeout(() => {
						rejectConfirmation(
							"The picker did not respond. Reload and try again.",
						);
						selected = null;
						changed();
					}, 15_000),
				};
				changed();
			});
		},
		async acknowledge(command, token) {
			assertDocument(token);
			if (
				pendingConfirmation &&
				command.requestToken === pendingConfirmation.requestToken &&
				typeof command.error === "string" &&
				command.error.length > 0 &&
				command.error.length <= 512 &&
				!hasControlCharacters(command.error)
			) {
				const result = { status: "rejected", message: command.error };
				rejectConfirmation(command.error);
				selected = null;
				error = command.error;
				changed();
				return result;
			}
			if (
				!pendingConfirmation ||
				command.requestToken !== pendingConfirmation.requestToken ||
				command.sequence !== sequence ||
				command.selectedId !== selected?.id
			)
				throw new PickerInputError(
					"The selection changed during confirmation.",
					409,
				);
			const challenge = pendingConfirmation;
			const current = selected;
			const expected = revision;
			const work = new AbortController();
			controller?.abort();
			controller = work;
			let result;
			try {
				const signal = AbortSignal.any([
					work.signal,
					AbortSignal.timeout(10_000),
				]);
				if (boundAccountId !== null) {
					const currentAccounts = await api.accounts(signal);
					signal.throwIfAborted();
					if (
						!currentAccounts.some((account) => account.id === boundAccountId)
					) {
						accounts = [];
						accountId = null;
						status = "error";
						throw new Error(
							"The project's Microsoft account is no longer available. Open Account settings and retry.",
						);
					}
				}
				const value = await waitWithCancellation(
					api.confirm(accountId, mode, current, signal),
					signal,
				);
				assertDocument(token);
				if (pendingConfirmation !== challenge || expected !== revision)
					throw new Error("The selection changed during confirmation.");
				result = { status: "completed", value };
			} catch (failure) {
				result = {
					status: "rejected",
					message: work.signal.aborted
						? "The selection changed. Try again."
						: "Could not validate the selection. Reload the list and try again.",
				};
				if (
					!work.signal.aborted &&
					failure instanceof Error &&
					failure.name !== "TimeoutError"
				)
					result.message = failure.message;
				if (pendingConfirmation === challenge) selected = null;
			}
			if (pendingConfirmation === challenge) {
				clearTimeout(challenge.timer);
				completed = result.status === "completed";
				challenge.resolve(result);
				pendingConfirmation = null;
				error = result.status === "rejected" ? result.message : null;
				changed();
			}
			return result;
		},
		close() {
			if (closed) return;
			invalidate();
			closed = true;
			documentToken = null;
			changed();
		},
	};
}
