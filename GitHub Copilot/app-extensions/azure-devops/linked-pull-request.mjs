import { safeActionError } from "./action-telemetry.mjs";
import { evaluateMerge } from "./agent-merge-policy.mjs";
import { mergeMethods } from "./merge-methods.mjs";
import { createAvatarCache } from "./pull-request-avatars.mjs";
import {
	emptyReviewState,
	normalizeReviewState,
	reviewKey,
} from "./pull-request-review-state.mjs";
import { threadCodeKey } from "./pull-request-thread-code-key.mjs";
import {
	executeMutation,
	PullRequestActionError,
} from "./pull-request-workflow.mjs";
import {
	AzureDevOpsContentError,
	AzureDevOpsHttpError,
	createPullRequestClient,
	isTemporaryReadError,
} from "./pull-requests.mjs";

/**
 * @typedef {{ repository: import("./pull-requests.mjs").AzureDevOpsRepository, pullRequestId: number, authorizedActions?: readonly string[] }} LinkedBinding
 * @typedef {"overview" | "completion" | "changes" | "fileDiff" | "threadCode"} ContentKey
 * @typedef {import("./pull-request-snapshot.d.mts").Snapshot} Snapshot
 * @typedef {import("./pull-request-snapshot.d.mts").ThreadCodeResult} ThreadCodeResult
 * @typedef {NonNullable<Snapshot["access"]>} Access
 * @typedef {{authentication: import("./pull-requests.mjs").Authentication, fetch?: typeof globalThis.fetch, getAccess?: (binding: LinkedBinding, request: {signal: AbortSignal, operation?: string, input?: unknown}) => Promise<Access | null>, reviewStorage?: import("./pull-request-review-state.mjs").ReviewStorage, refreshIntervalMs?: number, telemetry?: ReturnType<typeof import("./action-telemetry.mjs").createActionTelemetry>, reportCanvasAction?: import("@github/copilot-app").AppHost["reportCanvasAction"], requestFix?: import("@github/copilot-app").AppHost["pullRequests"]["requestFix"]}} LinkedOptions
 * @typedef {{controller: AbortController, promise: Promise<Readonly<Snapshot>>, action?: ReturnType<ReturnType<typeof import("./action-telemetry.mjs").createActionTelemetry>["start"]>}} PendingRead
 */

/** @template T @typedef {import("./pull-request-snapshot.d.mts").Resource<T>} Resource */

/** @type {Readonly<Resource<null>>} */
const emptyResource = Object.freeze({
	status: "idle",
	data: null,
	error: null,
});
const WRITE_AUTHORIZATION_ERROR =
	"Write authorization could not be verified. Pull request details remain read-only. Check the connection and repository account in the app, then select Refresh.";
// Azure DevOps accepts completion before the merge finishes. Read again soon,
// a bounded number of times, so the canvas does not wait for the periodic read.
const COMPLETION_RECHECKS = 5;
const COMPLETION_RECHECK_MS = 2000;

/**
 * One provider-local observation of an app-selected PR. This is not a host
 * registration or a persisted binding. The owner selects, refreshes and disposes it.
 * @param {LinkedOptions} options
 */
export function createLinkedPullRequest(options) {
	/** @type {Set<(snapshot: Readonly<Snapshot>) => void>} */
	const listeners = new Set();
	/** @type {Readonly<Snapshot>} */
	let snapshot = Object.freeze({
		revision: 0,
		bindingRevision: 0,
		changesRevision: 0,
		status: "unavailable",
		pullRequest: null,
		updatedAt: null,
		error: null,
		overview: emptyResource,
		completion: emptyResource,
		changes: emptyResource,
		fileDiff: emptyResource,
		threadCode: emptyResource,
		selectedFile: null,
		selectedCommitId: null,
		access: null,
		accessError: null,
		reviewState: emptyReviewState(),
		mutation: Object.freeze({ status: "idle", error: null }),
	});
	/** @type {{ client: ReturnType<typeof createPullRequestClient>, id: number, binding: LinkedBinding, key: string, progressLoaded: boolean } | null} */
	let target = null;
	/** @type {PendingRead | null} */
	let pending = null;
	/** @type {Map<ContentKey, PendingRead>} */
	const contentReads = new Map();
	/** @type {{overview: Promise<Readonly<Snapshot>>, combined: Promise<Readonly<Snapshot>>} | null} */
	let combinedOverviewRead = null;
	let threadCodeSelection = "";
	let disposed = false;
	let avatars = null;
	/** @type {AbortController | null} */
	let writeController = null;
	/** @type {{controller: AbortController, authorize(signal: AbortSignal): Promise<void>} | null} */
	let activeWrite = null;
	let aggregateRevision = 0;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let refreshTimer;
	let polling = false;
	let completionRechecks = 0;

	/** @param {LinkedBinding} binding @param {AbortSignal} signal @param {string} [operation] @param {unknown} [input] */
	async function readAccess(binding, signal, operation, input) {
		const getAccess = options.getAccess;
		if (!getAccess) return null;
		const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
		return readWithCancellation(deadline, () =>
			getAccess(binding, { signal: deadline, operation, input }),
		);
	}

	/** @param {Partial<Snapshot>} change */
	function publish(change) {
		snapshot = Object.freeze({
			...snapshot,
			...change,
			revision: snapshot.revision + 1,
		});
		for (const listener of listeners) listener(snapshot);
		return snapshot;
	}

	function stop() {
		clearTimeout(refreshTimer);
		const previous = pending;
		pending = null;
		previous?.action?.finish("cancelled", { errorCode: "aborted" });
		previous?.controller.abort();
	}

	/** @param {ContentKey} key */
	function stopContent(key) {
		if (key === "overview" || key === "completion") combinedOverviewRead = null;
		const previous = contentReads.get(key);
		contentReads.delete(key);
		previous?.action?.finish("cancelled", { errorCode: "aborted" });
		previous?.controller.abort();
	}

	function stopContentReads() {
		/** @type {Partial<Snapshot>} */
		const change = {};
		for (const key of contentReads.keys()) {
			stopContent(key);
			Object.assign(change, {
				[key]: Object.freeze({
					...snapshot[key],
					status: "cancelled",
					error: null,
				}),
			});
		}
		return change;
	}

	/** @param {LinkedBinding | null} binding */
	function setBinding(binding) {
		// TODO(#15221; chuwik): agree on delivery of the existing app-owned
		// repository/account binding and its replacement/removal events. The PR
		// workflow must also supply a known PR ID; guest input is not authority.
		if (disposed) throw new Error("Linked pull request is closed");
		avatars?.clear();
		avatars = null;
		stop();
		stopContentReads();
		writeController?.abort();
		writeController = null;
		activeWrite = null;
		polling = false;
		completionRechecks = 0;
		target = null;
		threadCodeSelection = "";
		publish({
			bindingRevision: snapshot.bindingRevision + 1,
			changesRevision: snapshot.changesRevision + 1,
			status: "unavailable",
			pullRequest: null,
			updatedAt: null,
			error: null,
			overview: emptyResource,
			completion: emptyResource,
			changes: emptyResource,
			fileDiff: emptyResource,
			threadCode: emptyResource,
			selectedFile: null,
			selectedCommitId: null,
			access: null,
			accessError: null,
			reviewState: emptyReviewState(),
			mutation: { status: "idle", error: null },
		});
		if (binding === null) return;
		if (
			!Number.isSafeInteger(binding.pullRequestId) ||
			binding.pullRequestId <= 0
		)
			throw new TypeError("Invalid pull request ID");
		const client = createPullRequestClient({
			...options,
			repository: binding.repository,
			beforeWrite: async (signal) => {
				if (
					!activeWrite ||
					target?.client !== client ||
					activeWrite.controller !== writeController
				)
					throw new PullRequestActionError("This action is not authorized.");
				await activeWrite.authorize(signal);
			},
		});
		target = {
			client,
			id: binding.pullRequestId,
			binding: Object.freeze({
				repository: Object.freeze({ ...binding.repository }),
				pullRequestId: binding.pullRequestId,
				authorizedActions: Object.freeze([
					...(binding.authorizedActions ?? []),
				]),
			}),
			key: reviewKey(binding),
			progressLoaded: false,
		};
		avatars = createAvatarCache((url, signal) => {
			signal.throwIfAborted();
			return client.getAvatar(url, { signal });
		});
		publish({ status: "idle" });
	}

	/** @param {{background?: boolean, userAction?: boolean, initialLoad?: boolean, entryPoint?: "guest" | "dialog"}} [refreshOptions] */
	function refresh(refreshOptions = {}) {
		if (disposed)
			return Promise.reject(new Error("Linked pull request is closed"));
		if (!target) return Promise.reject(new Error("No linked pull request"));
		if (snapshot.mutation.status === "loading")
			return Promise.reject(
				new PullRequestActionError("Wait for the current review action."),
			);
		if (pending) return pending.promise;
		const action = refreshOptions.userAction
			? options.telemetry?.start(
					"refresh",
					"details",
					refreshOptions.entryPoint ?? "guest",
				)
			: refreshOptions.initialLoad
				? options.telemetry?.start("load", "details", "automatic")
				: undefined;
		clearTimeout(refreshTimer);
		polling = true;
		const selected = target;
		const controller = new AbortController();
		const { signal } = controller;
		const task = {
			controller,
			action,
			promise: Promise.resolve().then(async () => {
				let pullRequest;
				let access = snapshot.access;
				let accessChecked = false;
				let accessError = snapshot.accessError;
				const progressAtStart = snapshot.reviewState;
				const aggregateAtStart = aggregateRevision;
				let reviewState = progressAtStart;
				const reviewStorage = options.reviewStorage;
				try {
					if (options.getAccess) {
						accessChecked = true;
						accessError = null;
						try {
							access = await readAccess(selected.binding, signal);
						} catch {
							signal.throwIfAborted();
							access = null;
							accessError = WRITE_AUTHORIZATION_ERROR;
						}
					}
					if (reviewStorage && !selected.progressLoaded) {
						reviewState =
							(await readWithCancellation(
								AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
								() => reviewStorage.load(selected.key),
							)) ?? emptyReviewState();
					}
					// Settle promptly even if a service ignores cancellation. The
					// client also checks the signal before sending and after reading.
					pullRequest = await readWithCancellation(signal, () =>
						selected.client.get(selected.id, { signal }),
					);
					if (snapshot.reviewState !== progressAtStart)
						reviewState = snapshot.reviewState;
					// A newer aggregate read owns progress even if this PR response arrives later.
					if (
						aggregateRevision === aggregateAtStart &&
						pullRequest.sourceCommitId !== reviewState.sourceCommitId
					)
						reviewState = {
							...reviewState,
							viewed: [],
							sourceCommitId: pullRequest.sourceCommitId,
						};
				} catch (error) {
					action?.finish(
						signal.aborted ? "cancelled" : "failure",
						safeActionError(error),
					);
					signal.throwIfAborted();
					pending = null;
					const temporary = isTemporaryReadError(error);
					polling = polling && temporary;
					scheduleRefresh();
					return publish({
						status: "error",
						access: !temporary
							? null
							: accessChecked
								? access
									? Object.freeze({
											viewerId: access.viewerId,
											operations: [...access.operations],
										})
									: null
								: snapshot.access,
						accessError: accessChecked ? accessError : snapshot.accessError,
						error: refreshError(error),
					});
				}
				signal.throwIfAborted();
				action?.finish("success");
				pending = null;
				const sourceChanged =
					snapshot.pullRequest?.sourceCommitId !== pullRequest.sourceCommitId;
				const completionContextChanged = [
					"state",
					"sourceRef",
					"targetRef",
					"sourceCommitId",
				].some((key) => snapshot.pullRequest?.[key] !== pullRequest[key]);
				const reloadCompletion = snapshot.overview.status !== "idle";
				if (reloadCompletion) {
					// PR revisions do not version policy evidence. Replace an older
					// completion read even when the source revision is unchanged.
					stopContent("completion");
				}
				const refreshedCompletion = completionContextChanged
					? emptyResource
					: reloadCompletion
						? Object.freeze({
								...snapshot.completion,
								status: "loading",
								error: null,
							})
						: snapshot.completion;
				const result = publish({
					status: "ready",
					pullRequest: Object.freeze(pullRequest),
					updatedAt: new Date().toISOString(),
					error: null,
					access: access
						? Object.freeze({
								viewerId: access.viewerId,
								operations: [...access.operations],
							})
						: null,
					accessError,
					reviewState,
					...(refreshedCompletion !== snapshot.completion
						? { completion: refreshedCompletion }
						: {}),
				});
				selected.progressLoaded = true;
				if (pullRequest.state !== "open") completionRechecks = 0;
				if (reloadCompletion) startContent(loadOverview());
				if (
					snapshot.changes.status !== "idle" &&
					(!refreshOptions.background || sourceChanged)
				)
					startContent(loadChanges(snapshot.selectedCommitId));
				scheduleRefresh();
				return result;
			}),
		};
		pending = task;
		if (!refreshOptions.background) {
			const refreshingCompletion = snapshot.completion.data
				? Object.freeze({
						...snapshot.completion,
						status: "loading",
						error: null,
					})
				: emptyResource;
			publish({
				...stopContentReads(),
				completion: refreshingCompletion,
				status: "loading",
				error: null,
			});
		}
		return task.promise;
	}

	function scheduleRefresh() {
		clearTimeout(refreshTimer);
		let interval = options.refreshIntervalMs;
		if (!polling || disposed || !target || !interval) return;
		if (completionRechecks > 0)
			interval = Math.min(interval, COMPLETION_RECHECK_MS);
		refreshTimer = setTimeout(
			() => {
				if (writeController || pending || contentReads.size) {
					scheduleRefresh();
					return;
				}
				if (completionRechecks > 0) completionRechecks--;
				startContent(refresh({ background: true }));
			},
			Math.max(1000, interval),
		);
		refreshTimer.unref?.();
	}

	/**
	 * @template {ContentKey} Key
	 * @param {Key} key
	 * @param {(client: ReturnType<typeof createPullRequestClient>, id: number, signal: AbortSignal, onError: (error: unknown, options?: {terminal?: boolean}) => void) => Promise<NonNullable<Snapshot[Key]["data"]>>} load
	 * @param {Partial<Snapshot>} [change]
	 * @param {(data: NonNullable<Snapshot[Key]["data"]>) => NonNullable<Snapshot[Key]["data"]>} [merge]
	 */
	function loadContent(key, load, change = {}, merge, userAction = false) {
		if (disposed)
			return Promise.reject(new Error("Linked pull request is closed"));
		if (!target || !snapshot.pullRequest)
			return Promise.reject(new Error("Load the linked pull request first"));
		const existing = contentReads.get(key);
		if (existing) return existing.promise;
		const action = userAction
			? options.telemetry?.start(
					"retry",
					key === "threadCode" ? "thread_code" : key,
					"guest",
				)
			: undefined;
		const selected = target;
		const controller = new AbortController();
		const { signal } = controller;
		const task = {
			controller,
			action,
			promise: Promise.resolve().then(async () => {
				try {
					let partialError;
					const data = await readWithCancellation(signal, () =>
						load(selected.client, selected.id, signal, (error, options) => {
							partialError ??= safeActionError(error);
							const previewUnavailable =
								key === "threadCode" &&
								((error instanceof AzureDevOpsContentError &&
									[
										"too-large",
										"unsupported-diff",
										"thread-code-unavailable",
									].includes(error.code)) ||
									(error instanceof AzureDevOpsHttpError &&
										error.status === 404));
							if (
								options?.terminal !== false &&
								!previewUnavailable &&
								!isTemporaryReadError(error)
							) {
								polling = false;
								clearTimeout(refreshTimer);
							}
						}),
					);
					signal.throwIfAborted();
					const partial =
						key === "overview"
							? "errors" in data && Object.keys(data.errors ?? {}).length > 0
							: key === "threadCode" &&
								Array.isArray(data) &&
								data.some((item) => item.error);
					action?.finish(
						key === "threadCode" &&
							Array.isArray(data) &&
							data.length > 0 &&
							data.every((item) => item.error)
							? "failure"
							: partial
								? "partial"
								: "success",
						partial ? (partialError ?? { errorCode: "unknown" }) : {},
					);
					contentReads.delete(key);
					const aggregate =
						key === "changes" &&
						"sourceCommitId" in data &&
						!data.selectedCommitId;
					if (aggregate) aggregateRevision++;
					const progress =
						aggregate &&
						data.sourceCommitId !== snapshot.reviewState.sourceCommitId
							? {
									reviewState: {
										...snapshot.reviewState,
										viewed: [],
										sourceCommitId: data.sourceCommitId,
									},
								}
							: {};
					return publish({
						...progress,
						[key]: Object.freeze({
							status: "ready",
							data: merge ? merge(data) : data,
							error: null,
						}),
					});
				} catch (error) {
					action?.finish(
						signal.aborted ? "cancelled" : "failure",
						safeActionError(error),
					);
					signal.throwIfAborted();
					contentReads.delete(key);
					if (key !== "completion")
						polling = polling && isTemporaryReadError(error);
					scheduleRefresh();
					return publish({
						[key]: Object.freeze({
							...snapshot[key],
							status: "error",
							error: refreshError(error),
						}),
					});
				}
			}),
		};
		contentReads.set(key, task);
		publish({
			...change,
			[key]: Object.freeze({
				...(change[key] ?? snapshot[key]),
				status: "loading",
				error: null,
			}),
		});
		return task.promise;
	}

	function loadCompletion() {
		if (
			snapshot.pullRequest?.state !== "open" ||
			!snapshot.access?.operations.includes("complete")
		) {
			stopContent("completion");
			if (
				snapshot.completion.status === "idle" &&
				snapshot.completion.data === null &&
				snapshot.completion.error === null
			)
				return null;
			publish({ completion: emptyResource });
			return null;
		}
		return loadContent("completion", async (client, id, signal) => {
			const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
			const evidence = await client.getAgentMergeEvidence(id, {
				signal: deadline,
			});
			return {
				revision: evidence.revision,
				completion: evaluateMerge(evidence).completion,
			};
		});
	}

	/** Branch policy rules give the completion choices, as for Agent merge. */
	async function completionMethods(client, id, signal) {
		try {
			const methods = mergeMethods(
				await client.getMergePolicyEvidence(id, { signal }),
			);
			return {
				defaultMethod: methods.defaultMethod,
				options: methods.options,
				error: methods.unknown
					? "Branch policy does not establish which merge strategies are allowed."
					: methods.options.length === 0
						? "Branch policy does not allow any supported merge strategy."
						: null,
			};
		} catch {
			signal.throwIfAborted();
			return {
				defaultMethod: null,
				options: [],
				error: "Merge strategies are unavailable. Refresh to retry.",
			};
		}
	}

	function loadOverview(userAction = false) {
		const pendingOverview = contentReads.get("overview")?.promise;
		if (pendingOverview && combinedOverviewRead?.overview === pendingOverview)
			return combinedOverviewRead.combined;
		const overview = loadContent(
			"overview",
			snapshot.pullRequest?.state === "open" &&
				snapshot.access?.operations.includes("complete")
				? async (client, id, signal, onError) => {
						const [data, methods] = await Promise.all([
							client.getOverview(id, { signal, onError }),
							completionMethods(client, id, signal),
						]);
						return { ...data, mergeMethods: methods };
					}
				: (client, id, signal, onError) =>
						client.getOverview(id, { signal, onError }),
			{},
			(data) => {
				if (!data.errors) return data;
				const previous = snapshot.overview.data;
				return Object.freeze({
					...data,
					threads:
						data.errors.threads && previous ? previous.threads : data.threads,
					policies:
						data.errors.policies && previous
							? previous.policies
							: data.policies,
					statuses:
						data.errors.statuses && previous
							? previous.statuses
							: data.statuses,
				});
			},
			userAction,
		);
		const completion = loadCompletion();
		if (!completion) return overview;
		const combined = Promise.all([overview, completion]).then(() => snapshot);
		const read = { overview, combined };
		combinedOverviewRead = read;
		void overview.then(
			() => {
				if (combinedOverviewRead === read) combinedOverviewRead = null;
			},
			() => {
				if (combinedOverviewRead === read) combinedOverviewRead = null;
			},
		);
		return combined;
	}

	/** @param {number[]} threadIds */
	function loadThreadCode(threadIds, userAction = false) {
		const overview = snapshot.overview.data;
		if (disposed || !target || !overview)
			throw new PullRequestActionError(
				"Load the discussion before its code previews.",
			);
		if (
			!Array.isArray(threadIds) ||
			threadIds.length > 10 ||
			new Set(threadIds).size !== threadIds.length
		)
			throw new PullRequestActionError("Select up to 10 visible comments.");
		const threads = threadIds.map((id) => {
			const thread = overview.threads.find((item) => item.id === id);
			if (
				!thread?.path ||
				!(
					thread.threadContext?.leftFileStart ||
					thread.threadContext?.rightFileStart
				)
			)
				throw new PullRequestActionError(
					"Select a line-linked thread from the loaded discussion.",
				);
			return thread;
		});
		const selection = JSON.stringify(
			threads.map((thread) => [thread.id, threadCodeKey(thread)]),
		);
		const pending = contentReads.get("threadCode");
		if (pending && selection === threadCodeSelection) return pending.promise;
		stopContent("threadCode");
		threadCodeSelection = selection;
		if (!threads.length)
			return Promise.resolve(publish({ threadCode: emptyResource }));
		const previous = snapshot.threadCode.data ?? [];
		return loadContent(
			"threadCode",
			async (client, id, signal, onError) => {
				const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
				/** @type {ThreadCodeResult[]} */
				const results = [];
				let next = 0;
				await Promise.all(
					Array.from({ length: Math.min(3, threads.length) }, async () => {
						while (next < threads.length) {
							signal.throwIfAborted();
							const index = next++;
							const thread = threads[index];
							const key = threadCodeKey(thread);
							let preview = null;
							let error = null;
							try {
								preview = await readWithCancellation(deadline, () =>
									client.getThreadCode(id, thread, { signal: deadline }),
								);
							} catch (failure) {
								signal.throwIfAborted();
								onError(failure);
								preview =
									previous.find(
										(item) => item.threadId === thread.id && item.key === key,
									)?.preview ?? null;
								error =
									failure instanceof AzureDevOpsHttpError &&
									failure.status === 404
										? "The referenced file or revision was not found."
										: refreshError(failure);
							}
							results[index] = Object.freeze({
								threadId: thread.id,
								key,
								preview,
								error,
							});
						}
					}),
				);
				signal.throwIfAborted();
				if (
					results.some((result) => {
						const current = snapshot.overview.data?.threads.find(
							(thread) => thread.id === result.threadId,
						);
						return !current || threadCodeKey(current) !== result.key;
					})
				)
					throw new AzureDevOpsContentError(
						"stale-thread-code",
						"The discussion changed while loading code. Retry the code preview.",
					);
				return results;
			},
			{},
			undefined,
			userAction,
		);
	}

	/** @param {string | null} [commitId] */
	function loadChanges(commitId = null) {
		const existing = contentReads.get("changes");
		if (existing && snapshot.selectedCommitId === commitId)
			return existing.promise;
		if (commitId !== null && !/^[a-f0-9]{40}$/i.test(commitId))
			return Promise.reject(new TypeError("Invalid commit selection"));
		stopContent("changes");
		stopContent("fileDiff");
		return loadContent(
			"changes",
			(client, id, signal) =>
				client.getChanges(id, { signal, ...(commitId ? { commitId } : {}) }),
			{
				selectedCommitId: commitId,
				changesRevision: snapshot.changesRevision + 1,
				fileDiff: emptyResource,
				selectedFile: null,
			},
		);
	}

	/** @param {unknown} update */
	async function updateReviewState(update) {
		const selected = target;
		if (!selected || disposed || !snapshot.pullRequest)
			throw new PullRequestActionError("No linked pull request.");
		if (writeController)
			throw new PullRequestActionError("Wait for the current review action.");
		if (!update || typeof update !== "object" || Array.isArray(update))
			throw new PullRequestActionError("Invalid review progress.");
		const input = /** @type {Record<string, unknown>} */ (update);
		if (
			Object.keys(input).some(
				(key) => !["viewed", "drafts", "preferences"].includes(key),
			)
		)
			throw new PullRequestActionError("Invalid review progress.");
		const progress = structuredClone(snapshot.reviewState);
		if (input.viewed !== undefined) {
			if (
				!input.viewed ||
				typeof input.viewed !== "object" ||
				Array.isArray(input.viewed)
			)
				throw new PullRequestActionError(
					"Select a file from the loaded Changes view.",
				);
			const viewed = /** @type {{path?: unknown, viewed?: unknown}} */ (
				input.viewed
			);
			if (
				snapshot.selectedCommitId ||
				snapshot.changes.status !== "ready" ||
				!snapshot.changes.data?.files.some(
					(file) => file.path === viewed.path,
				) ||
				typeof viewed.viewed !== "boolean" ||
				typeof viewed.path !== "string"
			)
				throw new PullRequestActionError(
					"Select a file from the loaded Changes view.",
				);
			progress.viewed = progress.viewed.filter((path) => path !== viewed.path);
			if (viewed.viewed) progress.viewed.push(viewed.path);
		}
		if (
			input.preferences !== undefined &&
			(!input.preferences ||
				typeof input.preferences !== "object" ||
				Array.isArray(input.preferences) ||
				Object.keys(input.preferences).some(
					(key) => !["mode", "ignoreWhitespace"].includes(key),
				))
		)
			throw new PullRequestActionError("Invalid review preferences.");
		const preferences =
			input.preferences === undefined
				? undefined
				: /** @type {Partial<import("./pull-request-review-state.mjs").ReviewPreferences>} */ (
						input.preferences
					);
		const next = normalizeReviewState({
			...progress,
			...(input.drafts !== undefined ? { drafts: input.drafts } : {}),
			...(preferences !== undefined
				? {
						preferences: {
							...progress.preferences,
							...preferences,
						},
					}
				: {}),
		});
		const controller = new AbortController();
		const signal = AbortSignal.any([
			controller.signal,
			AbortSignal.timeout(30_000),
		]);
		writeController = controller;
		try {
			const storage = options.reviewStorage;
			if (storage)
				await readWithCancellation(signal, () =>
					storage.save(selected.key, next),
				);
			signal.throwIfAborted();
			if (target !== selected || disposed)
				throw new DOMException("Binding changed", "AbortError");
			const sourceCommitId = snapshot.reviewState.sourceCommitId;
			return publish({
				reviewState:
					next.sourceCommitId === sourceCommitId
						? next
						: { ...next, viewed: [], sourceCommitId },
			});
		} finally {
			if (writeController === controller) writeController = null;
		}
	}

	/** @param {string} query @param {AbortSignal | undefined} requestSignal */
	async function searchReviewers(query, requestSignal) {
		const selected = target;
		const bindingRevision = snapshot.bindingRevision;
		if (!selected || disposed || !snapshot.pullRequest)
			throw new PullRequestActionError("No linked pull request.");
		const deadline = AbortSignal.timeout(30_000);
		const signal = requestSignal
			? AbortSignal.any([requestSignal, deadline])
			: deadline;
		const access = await readAccess(selected.binding, signal, "reviewer");
		if (!access?.viewerId || !access.operations.includes("reviewer"))
			throw new PullRequestActionError("This action is not authorized.");
		const result = await selected.client.searchReviewers(query, { signal });
		if (
			disposed ||
			target !== selected ||
			snapshot.bindingRevision !== bindingRevision
		)
			throw new DOMException("Binding changed", "AbortError");
		return result;
	}

	/** @param {string} operation @param {unknown} input */
	async function mutate(operation, input) {
		const selected = target;
		if (!selected || disposed || !snapshot.pullRequest)
			throw new PullRequestActionError("No linked pull request.");
		if (writeController)
			throw new PullRequestActionError("Wait for the current review action.");
		const controller = new AbortController();
		const { signal } = controller;
		writeController = controller;
		stop();
		publish({
			...stopContentReads(),
			status: "ready",
			mutation: { status: "loading", error: null },
		});
		try {
			const access = await readAccess(
				selected.binding,
				signal,
				operation,
				input,
			);
			if (!access?.viewerId || !access.operations.includes(operation)) {
				publish({ access: null });
				throw new PullRequestActionError("This action is not authorized.");
			}
			activeWrite = {
				controller,
				async authorize(authorizationSignal) {
					const current = await readAccess(
						selected.binding,
						authorizationSignal,
						operation,
						input,
					);
					if (
						current?.viewerId !== access.viewerId ||
						!current?.operations.includes(operation)
					) {
						publish({ access: null });
						throw new PullRequestActionError("This action is not authorized.");
					}
				},
			};
			const result = await readWithCancellation(signal, () =>
				executeMutation({
					client: selected.client,
					id: selected.id,
					snapshot,
					operation,
					input,
					viewerId: access.viewerId,
					signal,
					async draftPosted(id) {
						const reviewState = {
							...snapshot.reviewState,
							drafts: snapshot.reviewState.drafts.filter(
								(draft) => draft.id !== id,
							),
						};
						const storage = options.reviewStorage;
						signal.throwIfAborted();
						publish({ reviewState });
						if (storage) {
							try {
								await readWithCancellation(
									AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
									() => storage.save(selected.key, reviewState),
								);
							} catch {
								signal.throwIfAborted();
								throw new PullRequestActionError(
									"The comment was posted, but review progress could not be saved. Do not resubmit it. Check the discussion before restoring saved drafts.",
								);
							}
						}
					},
				}),
			);
			signal.throwIfAborted();
			if (operation === "complete") completionRechecks = COMPLETION_RECHECKS;
			publish({
				mutation: {
					status: "ready",
					error: null,
					...(operation === "build-retry" && result && "id" in result
						? {
								message: `Queued build #${result.id}. This does not rerun the PR policy.`,
							}
						: {}),
					...(operation === "build-cancel"
						? { message: "Build cancellation requested." }
						: {}),
				},
			});
		} catch (error) {
			signal.throwIfAborted();
			const message =
				error instanceof PullRequestActionError ||
				error instanceof AzureDevOpsContentError
					? error.message
					: "Could not finish the action. It may have partly completed. Refresh before you try again.";
			publish({ mutation: { status: "error", error: message } });
			throw new PullRequestActionError(message);
		} finally {
			if (writeController === controller) writeController = null;
			if (activeWrite?.controller === controller) activeWrite = null;
		}
		void refresh().catch(() => {
			// Refresh publishes its own safe error snapshot. A confirmed mutation
			// must not be reported as failed because reconciliation is unavailable.
		});
		return snapshot;
	}

	/**
	 * Read again after a confirmed write from outside this canvas. Reads that
	 * started before the write settle first so they cannot publish older state.
	 * @param {{organization: string, repositoryId: string, pullRequestId: number}} changed
	 * @param {boolean} completing
	 */
	function reconcile(changed, completing) {
		const selected = target;
		if (
			disposed ||
			!selected ||
			selected.id !== changed.pullRequestId ||
			selected.binding.repository.organization.toLowerCase() !==
				changed.organization.toLowerCase() ||
			selected.binding.repository.repositoryId.toLowerCase() !==
				changed.repositoryId.toLowerCase()
		)
			return;
		if (completing) completionRechecks = COMPLETION_RECHECKS;
		void (async () => {
			await pending?.promise.catch(() => {});
			await contentReads.get("overview")?.promise.catch(() => {});
			// An in-canvas write reads again when it finishes.
			if (disposed || target !== selected || writeController) return;
			startContent(refresh({ background: true }));
		})();
	}

	/** @param {number} index */
	function loadFile(index) {
		const changes = snapshot.changes;
		if (
			changes.status !== "ready" ||
			!changes.data ||
			!Number.isSafeInteger(index) ||
			index < 0 ||
			index >= changes.data.files.length
		)
			return Promise.reject(
				new TypeError("Select a file from the loaded Changes view"),
			);
		const existing = contentReads.get("fileDiff");
		if (snapshot.selectedFile === index && existing) return existing.promise;
		const fileDiff =
			snapshot.selectedFile === index ? snapshot.fileDiff : emptyResource;
		stopContent("fileDiff");
		const selected = changes.data;
		return loadContent(
			"fileDiff",
			(client, _id, signal) => client.getFileDiff(selected, index, { signal }),
			{ selectedFile: index, fileDiff },
		);
	}

	return {
		getSnapshot: () => snapshot,
		async getAvatar(bindingRevision, threadId, commentId) {
			const selected = target;
			const author = snapshot.overview.data?.threads
				.find((thread) => thread.id === threadId)
				?.comments.find((comment) => comment.id === commentId)?.author;
			if (
				disposed ||
				!selected ||
				!avatars ||
				snapshot.bindingRevision !== bindingRevision ||
				!author?.avatarUrl
			)
				throw new Error("Profile photo is unavailable.");
			const image = await avatars.get(author.avatarUrl);
			const currentAuthor = snapshot.overview.data?.threads
				.find((thread) => thread.id === threadId)
				?.comments.find((comment) => comment.id === commentId)?.author;
			if (
				disposed ||
				target !== selected ||
				snapshot.bindingRevision !== bindingRevision ||
				currentAuthor?.id !== author.id ||
				currentAuthor?.avatarUrl !== author.avatarUrl
			)
				throw new Error("Profile photo binding changed.");
			return image;
		},
		setBinding,
		refresh,
		loadOverview,
		loadThreadCode,
		loadChanges,
		loadFile,
		searchReviewers,
		mutate,
		reconcile,
		updateReviewState,
		/** @param {(snapshot: Readonly<Snapshot>) => void} listener */
		subscribe(listener) {
			// TODO(#15224; kwerx + app-host owner): for later shared indicators,
			// agree on the snapshot envelope and provider/binding version checks
			// before forwarding updates to the app. Canvas subscribers stay local.
			// This local revision is not an app subscription or activation generation.
			if (disposed) throw new Error("Linked pull request is closed");
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		cancel() {
			avatars?.clear();
			polling = false;
			clearTimeout(refreshTimer);
			if (!pending && !contentReads.size) return;
			const status = pending ? "cancelled" : snapshot.status;
			stop();
			publish({ ...stopContentReads(), status, error: null });
		},
		dispose() {
			if (disposed) return;
			setBinding(null);
			disposed = true;
			listeners.clear();
		},
	};
}

/** @template T @param {AbortSignal} signal @param {() => Promise<T>} read */
async function readWithCancellation(signal, read) {
	/** @type {PromiseWithResolvers<never>} */
	const cancelled = Promise.withResolvers();
	const onAbort = () => cancelled.reject(signal.reason);
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		signal.throwIfAborted();
		const result = await Promise.race([cancelled.promise, read()]);
		signal.throwIfAborted();
		return result;
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}

/** @param {Promise<Readonly<Snapshot>>} pending */
function startContent(pending) {
	void pending.catch((error) => {
		if (error instanceof Error && error.name === "AbortError") return;
		console.error("Azure DevOps PR canvas content handler failed");
	});
}

/** @param {unknown} error */
function refreshError(error) {
	if (error instanceof AzureDevOpsContentError) return error.message;
	if (error instanceof AzureDevOpsHttpError) {
		if (error.status === 401 || error.status === 403)
			return "Access was denied. Check the repository account in the app, then select Refresh.";
		if (error.status === 404)
			return "The pull request was not found. Check the linked repository and pull request in the app.";
		return `Could not load the pull request (HTTP ${error.status}). Select Refresh to try again.`;
	}
	if (error instanceof Error && error.name === "TimeoutError")
		return "The request timed out. Select Refresh to try again.";
	// Host and network exceptions can contain credentials or private diagnostics.
	return "Could not load the pull request. Check the connection and repository account in the app, then select Refresh.";
}
