import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
	createCanvasActionTelemetry,
	isActionReport,
} from "./action-telemetry.mjs";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import { manualFixThreads } from "./pull-request-fix-state.mjs";
import { PullRequestActionError } from "./pull-request-workflow.mjs";

/**
 * @typedef {{ instanceId: string, input?: unknown, reopen?: boolean }} CanvasCall
 * @typedef {{ linked: ReturnType<typeof createLinkedPullRequest>, telemetry: ReturnType<typeof createCanvasActionTelemetry>, opened: boolean, streams: Set<import("node:http").ServerResponse> }} Instance
 */

const noWrites = "Never use Azure CLI or direct HTTP writes.";
const fixGuidance = {
	discussion: `Read the selected thread with read_agent_merge_reviews. ${noWrites}`,
	discussions: `Read the selected threads with read_agent_merge_reviews. ${noWrites}`,
	checks: `Read failed required checks and their diagnostics with read_agent_merge_check_failure. Diagnose and fix; do not queue validation. ${noWrites}`,
	conflicts: `Fetch the observed sourceRef and targetRef, merge the target branch with normal Git, and resolve conflicts carefully; do not force-push. ${noWrites}`,
};

const html = await readFile(
	new URL("./pull-request.html", import.meta.url),
	"utf8",
);
const client = await readFile(
	new URL("./pull-request-client.mjs", import.meta.url),
	"utf8",
);
const css = await readFile(
	new URL("./pull-request.css", import.meta.url),
	"utf8",
);
const extraScripts = new Map([
	[
		"/pull-request-telemetry.mjs",
		new URL("./pull-request-telemetry.mjs", import.meta.url),
	],
	["/action-telemetry.mjs", new URL("./action-telemetry.mjs", import.meta.url)],
	[
		"/assets/pull-request-renderers.js",
		new URL("./assets/pull-request-renderers.js", import.meta.url),
	],
	[
		"/pull-request-actions.mjs",
		new URL("./pull-request-actions.mjs", import.meta.url),
	],
	[
		"/pull-request-feedback-view.mjs",
		new URL("./pull-request-feedback-view.mjs", import.meta.url),
	],
	["/github-ui-icons.mjs", new URL("./github-ui-icons.mjs", import.meta.url)],
	[
		"/pull-request-popups.mjs",
		new URL("./pull-request-popups.mjs", import.meta.url),
	],
	[
		"/pull-request-checks-view.mjs",
		new URL("./pull-request-checks-view.mjs", import.meta.url),
	],
	[
		"/pull-request-fix-state.mjs",
		new URL("./pull-request-fix-state.mjs", import.meta.url),
	],
	[
		"/pull-request-description.mjs",
		new URL("./pull-request-description.mjs", import.meta.url),
	],
	[
		"/pull-request-discussion-view.mjs",
		new URL("./pull-request-discussion-view.mjs", import.meta.url),
	],
	[
		"/pull-request-thread-kind.mjs",
		new URL("./pull-request-thread-kind.mjs", import.meta.url),
	],
	[
		"/pull-request-thread-code-key.mjs",
		new URL("./pull-request-thread-code-key.mjs", import.meta.url),
	],
	[
		"/pull-request-thread-code-view.mjs",
		new URL("./pull-request-thread-code-view.mjs", import.meta.url),
	],
]);

/**
 * Package-local canvas handlers. A future authorized adapter must set the
 * binding in-process; canvas open/action input never selects a repository.
 * @param {Parameters<typeof createLinkedPullRequest>[0]} options
 */
export function createPullRequestCanvas(options) {
	/** @type {Map<string, Instance>} */
	const instances = new Map();
	const closed = new Set();
	/** @type {import("node:http").Server | undefined} */
	let server;
	/** @type {Promise<void> | undefined} */
	let started;
	/** @type {Promise<void> | undefined} */
	let stopped;
	let origin = "";
	let disposed = false;

	/** @param {string} instanceId */
	function instance(instanceId) {
		const entry = instances.get(instanceId);
		if (disposed || !entry) throw new Error("Canvas instance is closed");
		return entry;
	}

	/** @param {Instance} entry @param {boolean} [userAction] @param {"guest" | "dialog"} [entryPoint] */
	function startRefresh(entry, userAction = false, entryPoint = "guest") {
		if (entry.linked.getSnapshot().status === "unavailable")
			throw new Error("No linked pull request");
		if (entry.linked.getSnapshot().mutation.status === "loading")
			throw new PullRequestActionError("Wait for the current review action.");
		return startRead(entry, entry.linked.refresh({ userAction, entryPoint }));
	}

	/** @param {Instance} entry @param {Promise<Readonly<import("./linked-pull-request.mjs").Snapshot>>} pending */
	function startRead(entry, pending) {
		void pending.catch((error) => {
			if (error instanceof Error && error.name === "AbortError") return;
			// Remote/host failures are already safe error snapshots. This is a
			// handler failure; never put an arbitrary exception in the guest.
			console.error("Azure DevOps PR canvas read handler failed");
		});
		return summary(entry);
	}

	/** @param {Instance} entry */
	function summary(entry) {
		const { status, revision } = entry.linked.getSnapshot();
		return { status, revision };
	}

	/** @param {CanvasCall} call */
	async function refresh({ instanceId, input }) {
		requireEmptyInput(input);
		return startRefresh(instance(instanceId));
	}

	/** @param {CanvasCall} call */
	async function cancel({ instanceId, input }) {
		requireEmptyInput(input);
		const entry = instance(instanceId);
		entry.linked.cancel();
		return summary(entry);
	}

	/** @param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response */
	async function handleRequest(request, response) {
		response.setHeader("Cache-Control", "no-store");
		response.setHeader("X-Content-Type-Options", "nosniff");
		response.setHeader("Referrer-Policy", "no-referrer");
		response.setHeader(
			"Content-Security-Policy",
			"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
		);
		if (
			disposed ||
			!request.url ||
			request.headers.host !== new URL(origin).host
		) {
			response.writeHead(403).end("Canvas is unavailable");
			return;
		}
		const [path, query] = request.url.split("?", 2);
		const parameters = new URLSearchParams(query);
		if (
			query &&
			(!path.startsWith("/load-changes/") ||
				[...parameters.keys()].some((key) => key !== "commitId") ||
				parameters.getAll("commitId").length !== 1 ||
				!/^[a-f0-9]{40}$/i.test(parameters.get("commitId") ?? ""))
		) {
			response.writeHead(400).end("Invalid commit selection");
			return;
		}
		const script = extraScripts.get(path);
		const photo = /^\/avatars\/([0-9a-f-]{36})\/(\d+)\/(\d+)\/(\d+)$/i.exec(
			path,
		);
		if (request.method === "GET" && photo) {
			const owner = instances.get(photo[1]);
			if (
				!owner?.opened ||
				request.headers["sec-fetch-site"] === "cross-site"
			) {
				response.writeHead(404).end("Profile photo is unavailable.");
				return;
			}
			try {
				const image = await owner.linked.getAvatar(
					Number(photo[2]),
					Number(photo[3]),
					Number(photo[4]),
				);
				response.setHeader("Content-Type", image.contentType);
				response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
				response.end(image.content);
			} catch {
				response
					.writeHead(404)
					.end("Profile photo is unavailable. Initials are shown instead.");
			}
			return;
		}
		if (request.method === "GET" && script) {
			response.setHeader("Content-Type", "text/javascript; charset=utf-8");
			response.end(await readFile(script, "utf8"));
			return;
		}
		if (request.method === "GET" && path === "/pull-request-client.mjs") {
			response.setHeader("Content-Type", "text/javascript; charset=utf-8");
			response.end(client);
			return;
		}
		if (request.method === "GET" && path === "/pull-request.css") {
			response.setHeader("Content-Type", "text/css; charset=utf-8");
			response.end(css);
			return;
		}
		const match =
			/^\/(canvases|instances|events|refresh|cancel-refresh|load-overview|load-thread-code|load-changes|load-file|search-reviewers|mutate|review-state|interaction|fix)\/([0-9a-f-]{36})(?:\/(\d+))?$/i.exec(
				path,
			);
		const entry = match && instances.get(match[2]);
		if (
			!match ||
			!entry?.opened ||
			(match[1] === "load-file") !== (match[3] !== undefined)
		) {
			response.writeHead(404).end("Canvas instance is closed");
			return;
		}
		const route = match[1];
		const hasBody =
			route === "interaction" ||
			route === "mutate" ||
			route === "review-state" ||
			route === "search-reviewers" ||
			route === "load-thread-code" ||
			route === "fix";
		if (request.method === "GET" && route === "canvases") {
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.end(html);
			return;
		}
		if (request.method === "GET" && route === "events") {
			response.setHeader("Content-Type", "text/event-stream");
			entry.streams.add(response);
			/** @param {Readonly<import("./linked-pull-request.mjs").Snapshot>} state */
			const send = (state) =>
				response.write(`data: ${JSON.stringify(state)}\n\n`);
			const unsubscribe = entry.linked.subscribe(send);
			response.on("close", () => {
				unsubscribe();
				entry.streams.delete(response);
			});
			send(entry.linked.getSnapshot());
			return;
		}
		if (request.method === "GET" && route === "instances") {
			response.setHeader("Content-Type", "application/json; charset=utf-8");
			response.end(JSON.stringify(entry.linked.getSnapshot()));
			return;
		}
		if (
			request.method !== "POST" ||
			![
				"refresh",
				"cancel-refresh",
				"load-overview",
				"load-thread-code",
				"load-changes",
				"load-file",
				"search-reviewers",
				"mutate",
				"review-state",
				"interaction",
				"fix",
			].includes(route) ||
			request.headers.origin !== origin ||
			request.headers["content-type"] !== "application/json" ||
			request.headers["transfer-encoding"] ||
			(!hasBody && Number(request.headers["content-length"] ?? 0) !== 0) ||
			(hasBody &&
				(!request.headers["content-length"] ||
					Number(request.headers["content-length"]) >
						(["interaction", "search-reviewers", "fix"].includes(route)
							? 2048
							: 256 * 1024)))
		) {
			response.writeHead(403).end("Canvas request is not allowed");
			return;
		}
		const state = entry.linked.getSnapshot();
		if (
			(route === "refresh" || route === "cancel-refresh") &&
			request.headers["x-canvas-binding"] !== String(state.bindingRevision)
		) {
			response
				.writeHead(409)
				.end("Pull request binding changed. Wait for the current view.");
			return;
		}
		if (state.status === "unavailable") {
			response.writeHead(409).end("No linked pull request");
			return;
		}
		if (route === "refresh" && state.mutation.status === "loading") {
			response.writeHead(409).end("Wait for the current review action.");
			return;
		}
		if (
			(route.startsWith("load-") || hasBody) &&
			(!state.pullRequest ||
				request.headers["x-canvas-binding"] !== String(state.bindingRevision))
		) {
			response
				.writeHead(409)
				.end("Pull request binding changed. Wait for the current view.");
			return;
		}
		if (hasBody) {
			response.setHeader("Content-Type", "application/json; charset=utf-8");
			try {
				const chunks = [];
				for await (const chunk of request) chunks.push(chunk);
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				const current = entry.linked.getSnapshot();
				if (
					disposed ||
					!instances.has(match[2]) ||
					current.bindingRevision !== state.bindingRevision ||
					current.status === "unavailable"
				) {
					response
						.writeHead(409)
						.end(JSON.stringify({ error: "Pull request binding changed." }));
					return;
				}
				if (!body || typeof body !== "object" || Array.isArray(body))
					throw new PullRequestActionError("Invalid canvas request.");
				if (route === "interaction") {
					if (
						!isActionReport(body) ||
						body.phase !== "finished" ||
						body.entryPoint !== "guest" ||
						![
							"expand",
							"collapse",
							"copy_link",
							"open_link",
							"filter",
							"sort",
							"next_page",
							"previous_page",
						].includes(body.action)
					)
						throw new PullRequestActionError("Invalid interaction report.");
					entry.telemetry.report(body);
					response.writeHead(200).end("{}");
					return;
				}
				if (route === "fix") {
					const { kind, threadIds = [], ...rest } = body;
					const active = new Set(
						manualFixThreads(current.overview.data).map((thread) => thread.id),
					);
					if (
						Object.keys(rest).length ||
						!["discussion", "discussions", "checks", "conflicts"].includes(
							kind,
						) ||
						!Array.isArray(threadIds) ||
						(kind === "discussion"
							? threadIds.length !== 1
							: kind === "discussions"
								? threadIds.length < 1 || threadIds.length > 50
								: threadIds.length !== 0) ||
						threadIds.some((id) => !active.has(id))
					)
						throw new PullRequestActionError(
							"Select current unresolved comments.",
						);
					let outcome;
					try {
						if (!options.requestFix) throw new Error();
						const ids = threadIds.map((id) => `thread:${id}`);
						outcome = await options.requestFix({
							instanceId: match[2],
							fix:
								kind === "discussion"
									? { kind, threadId: ids[0] }
									: kind === "discussions"
										? { kind, threadIds: ids }
										: { kind },
							guidance: fixGuidance[kind],
						});
					} catch {
						throw new PullRequestActionError(
							"Copilot could not receive this fix request. Open the workspace and try again.",
						);
					}
					response.writeHead(202).end(JSON.stringify({ outcome }));
					return;
				}
				if (route === "load-thread-code") {
					if (Object.keys(body).some((key) => key !== "threadIds"))
						throw new PullRequestActionError("Select visible comments.");
					const result = startRead(
						entry,
						entry.linked.loadThreadCode(
							body.threadIds,
							request.headers["x-canvas-user-action"] === "retry",
						),
					);
					response.writeHead(202).end(JSON.stringify(result));
					return;
				}
				if (route === "search-reviewers") {
					if (
						Object.keys(body).some((key) => key !== "query") ||
						typeof body.query !== "string"
					)
						throw new PullRequestActionError(
							"Enter a reviewer name, email, or alias.",
						);
					const searchController = new AbortController();
					request.once("aborted", () => searchController.abort());
					response.once("close", () => {
						if (!response.writableEnded) searchController.abort();
					});
					const result = await entry.linked.searchReviewers(
						body.query,
						searchController.signal,
					);
					response.writeHead(200).end(JSON.stringify(result));
					return;
				}
				if (
					(route === "review-state" && (body.viewed || body.drafts)) ||
					(route === "mutate" &&
						(body.input?.anchor || body.operation === "review"))
				) {
					if (
						request.headers["x-canvas-changes"] !==
						String(current.changesRevision)
					)
						throw new PullRequestActionError(
							"Changes changed. Wait for the current view.",
						);
				}
				if (route === "review-state")
					await entry.linked.updateReviewState(body);
				else {
					if (typeof body.operation !== "string")
						throw new PullRequestActionError("Select a pull request action.");
					await entry.linked.mutate(body.operation, body.input);
				}
				response.writeHead(200).end(JSON.stringify(summary(entry)));
			} catch (error) {
				const aborted = error instanceof Error && error.name === "AbortError";
				const message =
					error instanceof PullRequestActionError
						? error.message
						: aborted
							? "Pull request binding changed."
							: "Could not process this canvas request.";
				if (
					!(
						error instanceof PullRequestActionError ||
						error instanceof SyntaxError ||
						error instanceof TypeError
					) &&
					!aborted
				)
					console.error("Azure DevOps PR canvas action handler failed");
				response
					.writeHead(aborted ? 409 : 400)
					.end(JSON.stringify({ error: message }));
			}
			return;
		}
		if (route === "load-file") {
			const index = Number(match[3]);
			if (
				request.headers["x-canvas-changes"] !== String(state.changesRevision) ||
				state.changes.status !== "ready" ||
				!state.changes.data ||
				!Number.isSafeInteger(index) ||
				index < 0 ||
				index >= state.changes.data.files.length
			) {
				response
					.writeHead(409)
					.end("Select a file from the loaded Changes view.");
				return;
			}
			startRead(entry, entry.linked.loadFile(index));
		} else if (route === "load-overview") {
			startRead(
				entry,
				entry.linked.loadOverview(
					request.headers["x-canvas-user-action"] === "retry",
				),
			);
		} else if (route === "load-changes") {
			startRead(entry, entry.linked.loadChanges(parameters.get("commitId")));
		} else if (route === "refresh") {
			startRefresh(
				entry,
				request.headers["x-canvas-user-action"] === "refresh",
			);
		} else {
			const action = entry.telemetry.start("cancel", "details");
			entry.linked.cancel();
			action.finish("success");
		}
		response.writeHead(202).end();
	}

	async function start() {
		server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
			void handleRequest(request, response).catch(() => {
				console.error("Azure DevOps PR canvas request handler failed");
				if (!response.headersSent) response.writeHead(500);
				response.end("Canvas request failed");
			});
		});
		server.requestTimeout = 5000;
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Canvas server has no TCP address");
		origin = `http://127.0.0.1:${address.port}`;
	}

	/** @param {string} instanceId @param {{ preventReopen?: boolean }} [options] */
	function remove(instanceId, { preventReopen = false } = {}) {
		if (preventReopen) closed.add(instanceId);
		const entry = instances.get(instanceId);
		instances.delete(instanceId);
		if (!entry) return;
		entry.linked.dispose();
		for (const response of entry.streams) response.end();
		entry.streams.clear();
	}

	return {
		/** Remove a failed open attempt without making retained recovery terminal. */
		discard(instanceId) {
			remove(instanceId);
		},
		/** @param {string} instanceId @param {import("./linked-pull-request.mjs").LinkedBinding | null} binding */
		setBinding(instanceId, binding) {
			if (disposed || closed.has(instanceId))
				throw new Error("Canvas instance is closed");
			let entry = instances.get(instanceId);
			if (!entry) {
				const telemetry = createCanvasActionTelemetry(
					options.reportCanvasAction,
					"pull-request",
					instanceId,
				);
				entry = {
					linked: createLinkedPullRequest({ ...options, telemetry }),
					telemetry,
					opened: false,
					streams: new Set(),
				};
				instances.set(instanceId, entry);
			}
			entry.linked.setBinding(binding);
			if (binding && entry.opened) startRefresh(entry);
		},
		/** @param {CanvasCall} call */
		async open({ instanceId, input }) {
			// TODO(#15224; kwerx + app-host owner): for a later slice, agree on owning-session
			// attachment and auto-open through the app canvas registry. Bind the
			// trusted PR before open; refresh must not reopen a user-closed canvas.
			requireEmptyInput(input);
			const entry = instance(instanceId);
			started ??= start();
			await started;
			if (instance(instanceId) !== entry)
				throw new Error("Canvas instance is closed");
			if (!entry.opened) {
				entry.opened = true;
				if (entry.linked.getSnapshot().status !== "unavailable")
					startRead(entry, entry.linked.refresh({ initialLoad: true }));
			}
			return {
				url: `${origin}/canvases/${instanceId}`,
				title: "Azure DevOps pull request",
			};
		},
		/** @param {Parameters<ReturnType<typeof createLinkedPullRequest>["reconcile"]>} args */
		reconcile(...args) {
			if (disposed) return;
			for (const entry of instances.values())
				if (entry.opened) entry.linked.reconcile(...args);
		},
		actions: [
			{ name: "refresh", handler: refresh },
			{ name: "cancel-refresh", handler: cancel },
		],
		/** @param {{ instanceId: string }} call */
		async onClose({ instanceId }) {
			remove(instanceId, { preventReopen: true });
		},
		dispose() {
			if (stopped) return stopped;
			disposed = true;
			for (const instanceId of instances.keys())
				remove(instanceId, { preventReopen: true });
			closed.clear();
			const running = server;
			stopped = (async () => {
				if (!started || !running) return;
				await started;
				await new Promise((resolve, reject) => {
					running.close((error) =>
						error ? reject(error) : resolve(undefined),
					);
					running.closeAllConnections();
				});
			})();
			return stopped;
		},
	};
}

/** @param {unknown} input */
function requireEmptyInput(input) {
	if (input === undefined) return;
	if (
		!input ||
		typeof input !== "object" ||
		Array.isArray(input) ||
		Object.keys(input).length
	)
		throw new TypeError("Canvas input must be an empty object");
}
