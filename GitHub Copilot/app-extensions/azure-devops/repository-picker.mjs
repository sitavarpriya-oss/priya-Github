import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
	createCanvasActionTelemetry,
	isActionReport,
	safeActionError,
} from "./action-telemetry.mjs";
import {
	allowedCanvasPost,
	canvasCommand,
	canvasHeaders,
} from "./canvas-loopback.mjs";
import {
	confirmDisabledReason,
	createPickerState,
	fieldNames,
	PickerInputError,
} from "./repository-picker-state.mjs";

const html = await readFile(
	new URL("./repository-picker.html", import.meta.url),
	"utf8",
);
/** @type {Map<string, Buffer>} */
const assets = new Map(
	await Promise.all(
		[
			new URL("./repository-picker-client.mjs", import.meta.url),
			new URL("./canvas-guest-view.mjs", import.meta.url),
			new URL("./github-ui-icons.mjs", import.meta.url),
			new URL("./repository-picker-state.mjs", import.meta.url),
			new URL("./repository-picker-view.mjs", import.meta.url),
			new URL("./repository-url.mjs", import.meta.url),
			new URL("./repository-picker.css", import.meta.url),
			new URL("./action-telemetry.mjs", import.meta.url),
		].map(
			async (url) =>
				/** @type {[string, Buffer]} */ ([
					`/${url.pathname.split("/").at(-1)}`,
					await readFile(url),
				]),
		),
	),
);

// Reserve space for the host's identity/correlation envelope within its 16 KiB frame.
const MAX_INSPECTION_BYTES = 12 * 1024;

const waitBudget = 20_000;
// Observation shares a serialized host channel with confirmation.
const stateWaitBudget = 1_000;
const clientStateWaitBudget = 20_000;

function createInstance(
	catalog,
	completionOwner,
	telemetry,
	validateHostSelection,
) {
	const listeners = new Set();
	let revision = 0;
	let closed = false;
	let documentToken = null;
	let documentIssued = false;
	let challenge = null;
	let quickFillValidations = 0;
	/** @type {{ accountReference: string | null } | null} */
	let quickFillRecovery = null;
	const state = createPickerState(catalog, changed);

	function changed() {
		if (revision >= Number.MAX_SAFE_INTEGER)
			throw new PickerInputError("Reload the picker to continue.", 409);
		revision += 1;
		for (const listener of [...listeners]) listener();
	}

	function assertOpen() {
		if (closed) throw new PickerInputError("Canvas instance is closed", 404);
	}

	function assertDocument(token) {
		assertOpen();
		if (!documentToken || token !== documentToken)
			throw new PickerInputError(
				"This picker document was replaced. Reload the picker.",
				409,
			);
	}

	function finish(result, errorCode = "invalid_selection") {
		const pending = challenge;
		if (!pending) return;
		challenge = null;
		clearTimeout(pending.timer);
		pending.action.finish(
			result.status === "completed"
				? "success"
				: closed
					? "cancelled"
					: "rejected",
			result.status === "completed" ? {} : { errorCode },
		);
		pending.resolve(result);
		changed();
	}

	function reject(message, errorCode) {
		const result = { status: "rejected", message };
		finish(result, errorCode);
		return result;
	}

	function wait(read, ready, signal, budget = waitBudget) {
		return new Promise((resolve, reject) => {
			let timer;
			function cleanup() {
				clearTimeout(timer);
				listeners.delete(check);
				signal?.removeEventListener("abort", abort);
			}
			function abort() {
				cleanup();
				reject(signal.reason);
			}
			function check(expired = false) {
				try {
					assertOpen();
					const value = read();
					if (!expired && !ready(value)) return;
					cleanup();
					resolve(value);
				} catch (error) {
					cleanup();
					reject(error);
				}
			}
			listeners.add(check);
			timer = setTimeout(() => check(true), budget);
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
			else check();
		});
	}

	function hint() {
		assertOpen();
		let disabledReason = !documentToken
			? "Loading the picker. If it does not appear, reload it."
			: challenge
				? "Checking your latest changes..."
				: quickFillValidations > 0
					? "Wait for the repository URL to finish filling the picker, then try again."
					: quickFillRecovery
						? quickFillRecovery.accountReference === null
							? "Sign in to continue."
							: "Update authorization to continue."
						: confirmDisabledReason(state.read());
		const current = state.read();
		const organization = current.fields.organization;
		const needsAccount =
			quickFillRecovery?.accountReference === null ||
			(!current.repositoryUrl &&
				organization.status === "error" &&
				organization.error === "account_required");
		const failure = current.repositoryUrl
			? undefined
			: [...fieldNames.map((name) => current.fields[name]), current.results]
					.filter((field) => field?.status === "error")
					.find(
						(field) => (field.errorCode ?? field.error) === "auth_required",
					);
		const accountReference =
			failure?.authorization?.id ?? quickFillRecovery?.accountReference;
		const needsAuthorization = Boolean(accountReference);
		const offerRecovery =
			completionOwner === "host" &&
			documentToken &&
			!challenge &&
			quickFillValidations === 0 &&
			(needsAccount || needsAuthorization);
		if (offerRecovery)
			disabledReason = needsAccount
				? "Sign in to continue."
				: "Update authorization to continue.";
		return {
			revision,
			draftRevision: current.sequence,
			ready: disabledReason === null,
			disabledReason,
			...(offerRecovery
				? {
						accountAuthorization: {
							accountReference: needsAccount ? null : accountReference,
						},
					}
				: {}),
		};
	}

	function noteQuickFillRecovery(error, before, token, signal) {
		const code = error?.code;
		if (
			closed ||
			signal?.aborted ||
			!["account_required", "auth_required"].includes(code)
		)
			return;
		const current = state.read();
		if (
			(current.accountRevision ?? 0) !== (before.accountRevision ?? 0) ||
			current.sequence !== before.sequence ||
			(documentIssued && token !== documentToken)
		)
			return;
		if (code === "account_required")
			quickFillRecovery = { accountReference: null };
		else if (error.account?.id)
			quickFillRecovery = { accountReference: error.account.id };
	}

	return {
		read: state.read,
		report(value, token) {
			assertDocument(token);
			if (
				!isActionReport(value) ||
				value.phase !== "finished" ||
				value.entryPoint !== "guest" ||
				!(
					(["expand", "collapse"].includes(value.action) &&
						["organization", "project", "repository"].includes(value.stage)) ||
					(value.action === "settings" && value.stage === "account") ||
					(value.action === "reload" && value.stage === "selection")
				)
			)
				throw new PickerInputError("Invalid interaction report.");
			telemetry.report(value);
			return {};
		},
		change(command, token) {
			if (documentIssued) assertDocument(token);
			quickFillRecovery = null;
			const actionType =
				command?.type === "choose-result"
					? "choose"
					: command?.type === "retry-search"
						? "retry"
						: command?.type;
			const actionField = ["choose-result", "retry-search"].includes(
				command?.type,
			)
				? "repository"
				: command?.field;
			const action =
				["choose", "retry", "confirm"].includes(actionType) &&
				(actionType === "confirm" ||
					["organization", "project", "repository"].includes(actionField))
					? telemetry.start(
							actionType,
							actionType === "confirm" ? "selection" : actionField,
						)
					: undefined;
			try {
				const transition = state.change(command);
				void transition.completion
					.then((outcomes) => {
						const failed = outcomes.find(
							(outcome) => outcome.status !== "ready",
						);
						action?.finish(
							failed?.status === "cancelled"
								? "cancelled"
								: failed
									? "failure"
									: "success",
							failed ? safeActionError(failed.error) : {},
						);
					})
					.catch((error) => {
						action?.finish("failure", safeActionError(error));
						console.error("Azure DevOps picker transition completion failed");
					});
				return transition.state;
			} catch (error) {
				action?.finish("rejected", { errorCode: "invalid_selection" });
				throw error;
			}
		},
		document() {
			assertOpen();
			state.cancelResolutions();
			reject(
				"The picker was reloaded. Check your selection and try again.",
				"stale",
			);
			documentToken = randomUUID();
			documentIssued = true;
			changed();
			return { documentToken, completionOwner };
		},
		releaseDocument(token) {
			assertDocument(token);
			state.cancelResolutions();
			documentToken = null;
			reject(
				"The picker document was closed. Reload the picker to continue.",
				"stale",
			);
			changed();
			return {};
		},
		observe(afterRevision) {
			if (
				afterRevision !== null &&
				(!Number.isSafeInteger(afterRevision) || afterRevision < 0)
			)
				throw new PickerInputError("Invalid dialog state revision.");
			return wait(
				hint,
				(value) => afterRevision === null || value.revision > afterRevision,
				undefined,
				stateWaitBudget,
			);
		},
		observeState(afterRevision, signal) {
			if (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
				throw new PickerInputError("Invalid picker state revision.");
			return wait(
				state.read,
				(value) => value.revision > afterRevision,
				signal,
				clientStateWaitBudget,
			);
		},
		async validateQuickFill(command, token, signal) {
			if (documentIssued) assertDocument(token);
			const action = telemetry.start("validate", "selection", "url_validation");
			quickFillValidations += 1;
			const before = state.read();
			quickFillRecovery = null;
			changed();
			try {
				const result = await state.validateQuickFill(command, signal);
				action.finish("success");
				return result;
			} catch (error) {
				noteQuickFillRecovery(error, before, token, signal);
				action.finish(error?.name === "AbortError" ? "cancelled" : "failure");
				throw error;
			} finally {
				quickFillValidations -= 1;
				changed();
			}
		},
		accountChanged(input) {
			assertOpen();
			const reference = input?.accountReference;
			if (reference !== null && (typeof reference !== "string" || !reference))
				throw new PickerInputError("Invalid account reference.");
			quickFillRecovery = null;
			state.refreshDiscovery();
			return {};
		},
		confirm() {
			assertOpen();
			const action = telemetry.start("confirm", "selection", "dialog");
			if (challenge) {
				action.finish("rejected", { errorCode: "busy" });
				return {
					status: "rejected",
					message: "A confirmation is already in progress.",
				};
			}
			if (!documentToken) {
				action.finish("rejected", { errorCode: "invalid_selection" });
				return reject("Reload the picker before confirming your selection.");
			}
			return new Promise((resolve) => {
				const current = state.read();
				challenge = {
					action,
					documentToken,
					requestToken: randomUUID(),
					resolve,
					revision: current.revision,
					sequence: current.sequence,
					expiresAt: Date.now() + waitBudget,
					timer: setTimeout(
						() =>
							reject(
								"The picker did not respond. Check your input and try again, or reload the picker.",
								"timeout",
							),
						waitBudget,
					),
				};
				changed();
			});
		},
		notice(token, afterRequest, signal) {
			return wait(
				() => {
					assertDocument(token);
					if (!challenge || challenge.requestToken === afterRequest)
						return null;
					const { documentToken, requestToken, revision, sequence, expiresAt } =
						challenge;
					return { documentToken, requestToken, revision, sequence, expiresAt };
				},
				(value) => value !== null,
				signal,
			);
		},
		acknowledge(ack) {
			assertDocument(ack.documentToken);
			if (!challenge || ack.requestToken !== challenge.requestToken)
				throw new PickerInputError(
					"This confirmation is no longer active. Try again.",
					409,
				);
			const current = state.read();
			let message;
			if (Date.now() >= challenge.expiresAt)
				message = "The confirmation expired. Check your input and try again.";
			else if (
				typeof ack.error === "string" &&
				ack.error.trim() &&
				ack.error.length <= 512
			)
				message = ack.error;
			else if (
				ack.sequence !== current.sequence ||
				ack.revision !== current.revision ||
				ack.sequence < challenge.sequence ||
				ack.revision < challenge.revision
			)
				message =
					"The picker changed during confirmation. Check your input and try again.";
			if (message) {
				reject(message);
				throw new PickerInputError(message, 409);
			}
			try {
				const { state: next } = state.change({
					type: "confirm",
					sequence: current.sequence + 1,
					queries: ack.queries,
					url: ack.url,
				});
				const result = { status: "completed", value: next.selection };
				// Validate the host handoff before recording completion; projection
				// errors must not turn a rejected selection into telemetry success.
				if (completionOwner === "host") validateHostSelection?.(next.selection);
				finish(result);
				return { result, state: next };
			} catch (error) {
				const message =
					error instanceof PickerInputError
						? error.message
						: "Could not confirm this selection. Reload the picker.";
				reject(message);
				throw new PickerInputError(message, 409);
			}
		},
		async close() {
			if (closed) return;
			closed = true;
			reject("The picker was closed.", "aborted");
			await state.close();
			changed();
		},
	};
}

/** @param {(telemetry: ReturnType<typeof createCanvasActionTelemetry>) => import("./repository-picker-state.mjs").Catalog | undefined} createCatalog */
export function createRepositoryPicker(
	createCatalog,
	reportCanvasAction,
	validateHostSelection,
) {
	const instances = new Map();
	let server;
	let started;
	let origin;
	let disposed = false;

	function getInstance(instanceId) {
		const state = instances.get(instanceId);
		if (!state || disposed) throw new Error("Canvas instance is closed");
		return state;
	}

	function getState({ instanceId }) {
		const result = getInstance(instanceId).read();
		if (Buffer.byteLength(JSON.stringify(result)) > MAX_INSPECTION_BYTES) {
			throw new Error(
				"Picker state is too large to inspect. Use the repository picker.",
			);
		}
		return result;
	}

	async function handleRequest(request, response) {
		canvasHeaders(response);
		if (disposed || request.headers.host !== new URL(origin).host) {
			response.writeHead(403).end("Canvas is unavailable");
			return;
		}
		const url = new URL(request.url, origin);
		const path = url.pathname;
		if (request.method === "GET" && assets.has(path)) {
			response.setHeader(
				"Content-Type",
				path.endsWith(".css")
					? "text/css; charset=utf-8"
					: "text/javascript; charset=utf-8",
			);
			response.end(assets.get(path));
			return;
		}
		const match =
			/^\/(canvases|instances)\/([0-9a-f-]{36})(\/confirmation|\/document|\/interaction|\/validate)?$/.exec(
				path,
			);
		const state = match && instances.get(match[2]);
		if (!state) {
			response.writeHead(404).end("Canvas instance is closed");
			return;
		}
		if (request.method === "GET" && match[1] === "canvases" && !match[3]) {
			const { documentToken, completionOwner } = state.document();
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.end(
				html
					.replace("PICKER_DOCUMENT", documentToken)
					.replace("COMPLETION_OWNER", completionOwner),
			);
			return;
		}
		if (match[1] !== "instances") {
			response.writeHead(405).end("Method not allowed");
			return;
		}
		let result;
		if (request.method === "GET") {
			if (match[3] === "/document" || match[3] === "/interaction") {
				response.writeHead(405).end("Method not allowed");
				return;
			}
			if (match[3] === "/confirmation") {
				const controller = new AbortController();
				response.once("close", () => controller.abort());
				result = await state.notice(
					url.searchParams.get("documentToken"),
					url.searchParams.get("afterRequest"),
					controller.signal,
				);
			} else if (url.searchParams.has("afterRevision")) {
				const value = url.searchParams.get("afterRevision");
				if (!/^(0|[1-9][0-9]*)$/.test(value ?? ""))
					throw new PickerInputError("Invalid picker state revision.");
				const controller = new AbortController();
				response.once("close", () => controller.abort());
				result = await state.observeState(Number(value), controller.signal);
			} else result = state.read();
		} else if (allowedCanvasPost(request, origin)) {
			const command = await canvasCommand(request);
			if (instances.get(match[2]) !== state || disposed) {
				response.writeHead(404).end("Canvas instance is closed");
				return;
			}
			if (!command || typeof command !== "object" || Array.isArray(command))
				throw new PickerInputError("Invalid picker request.");
			const lookup =
				match[3] === "/validate" ? new AbortController() : undefined;
			if (lookup) response.once("close", () => lookup.abort());
			result =
				match[3] === "/interaction"
					? state.report(command, request.headers["x-picker-document"])
					: match[3] === "/confirmation"
						? state.acknowledge(command)
						: match[3] === "/document"
							? state.releaseDocument(command.documentToken)
							: match[3] === "/validate"
								? await state.validateQuickFill(
										command,
										request.headers["x-picker-document"],
										lookup?.signal,
									)
								: state.change(command, request.headers["x-picker-document"]);
		} else {
			response.writeHead(403).end("Canvas request is not allowed");
			return;
		}
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.end(JSON.stringify(result));
	}

	async function start() {
		server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
			handleRequest(request, response).catch((error) => {
				if (response.destroyed) return;
				if (error instanceof PickerInputError) {
					response.writeHead(error.status, {
						"Content-Type": "application/json; charset=utf-8",
					});
					response.end(
						JSON.stringify({ error: error.message, code: error.code }),
					);
				} else {
					console.error("Azure DevOps canvas request failed");
					if (!response.headersSent) response.writeHead(500);
					response.end("The canvas request failed. Try again.");
				}
			});
		});
		server.requestTimeout = 5000;
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		origin = `http://127.0.0.1:${server.address().port}`;
	}

	return {
		async open({ instanceId, completionOwner = "guest" }) {
			if (disposed) throw new Error("Canvas activation is closed");
			started ??= start();
			await started;
			if (disposed) throw new Error("Canvas activation is closed");
			if (!instances.has(instanceId)) {
				if (!["host", "guest"].includes(completionOwner))
					throw new Error("Invalid completion owner");
				const telemetry = createCanvasActionTelemetry(
					reportCanvasAction,
					"repository-picker",
					instanceId,
				);
				instances.set(
					instanceId,
					createInstance(
						createCatalog(telemetry),
						completionOwner,
						telemetry,
						validateHostSelection,
					),
				);
			}
			return {
				url: `${origin}/canvases/${instanceId}`,
				title: "Azure DevOps repository picker",
			};
		},
		actions: [
			{ name: "get-state", handler: getState },
			{
				name: "account-changed",
				handler: ({ instanceId, input }) =>
					getInstance(instanceId).accountChanged(input),
			},
			{
				name: "dialog-state",
				handler({ instanceId, input }) {
					return getInstance(instanceId).observe(input.afterRevision);
				},
			},
			{
				name: "confirm-selection",
				handler({ instanceId }) {
					return getInstance(instanceId).confirm();
				},
			},
		],
		async onClose({ instanceId }) {
			await instances.get(instanceId)?.close();
			instances.delete(instanceId);
		},
		async dispose() {
			disposed = true;
			await Promise.all([...instances.values()].map((state) => state.close()));
			instances.clear();
			if (!started) return;
			await started;
			/** @type {Promise<void>} */
			const closed = new Promise((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeAllConnections();
			});
			await closed;
		},
	};
}
