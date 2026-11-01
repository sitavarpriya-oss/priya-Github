import { createPullRequestUi } from "./pr-ui.mjs";
import { AzureDevOpsHttpError } from "./pull-request-http-error.mjs";
import { parsePullRequestViewContext } from "./pull-request-view.mjs";

const FAILURE_CODES = new Set([
	"denied",
	"account_unavailable",
	"auth_required",
	"credential_unavailable",
	"busy",
	"timeout",
	"response_too_large",
	"network",
	"invalid-response",
]);

/** @param {unknown} error @returns {string} */
function failureCategory(error, depth = 0) {
	if (!error || typeof error !== "object") return "unknown";
	if (error instanceof SyntaxError) return "invalid-response";
	if (error instanceof AzureDevOpsHttpError) {
		if (error.status === 401 || error.status === 403) return "authentication";
		if (error.status === 429) return "rate_limit";
		if (error.status === 408) return "timeout";
		return error.status >= 500 ? "service" : "http";
	}
	if (error instanceof Error && error.name === "TimeoutError") return "timeout";
	if ("code" in error && error.code === "too-large")
		return "response_too_large";
	if (
		"code" in error &&
		typeof error.code === "string" &&
		FAILURE_CODES.has(error.code)
	)
		return error.code;
	if (depth < 3 && "cause" in error)
		return failureCategory(error.cause, depth + 1);
	return "unknown";
}

function accountAuthentication(authentication, accountId) {
	return {
		listAccounts(input) {
			return authentication.listAccounts(input);
		},
		getAccessToken(input) {
			return authentication.getAccessToken({ ...input, accountId });
		},
	};
}

/**
 * @typedef {object} PullRequestProjection
 * @property {string} [accountId]
 * @property {import("@github/copilot-app").PrUiState} state
 */

/**
 * @param {import("@github/copilot-app").AppAuthentication | undefined} authentication
 * @param {Map<string, number>} [mutationRevisions]
 * @returns {NonNullable<import("@github/copilot-app").Provider["pullRequestProjectionObserver"]> & {dispose(): void}}
 */
export function createPullRequestProjectionObserver(
	authentication,
	mutationRevisions = new Map(),
) {
	const jobs = new Map();
	const readers = new Map();
	const unauthenticatedReader = createPullRequestUi(authentication);
	let publishCurrent;
	let pass;
	let timer;
	let pollingOverride;
	let overrideTimer;
	let disposed = false;

	function schedulePolling() {
		if (disposed || pass || timer !== undefined || jobs.size === 0) return;
		const { minIntervalMs, maxIntervalMs } =
			pollingOverride && Date.now() < pollingOverride.expiresAt
				? pollingOverride
				: { minIntervalMs: 60_000, maxIntervalMs: 180_000 };
		timer = setTimeout(
			refreshAssociated,
			minIntervalMs + (maxIntervalMs - minIntervalMs) * Math.random(),
		);
		timer.unref?.();
	}

	function reschedulePolling() {
		clearTimeout(timer);
		timer = undefined;
		schedulePolling();
	}

	function refreshAssociated() {
		if (disposed) return;
		timer = undefined;
		for (const job of jobs.values())
			if (job.lane.kind === "associated") job.pending = true;
		void run().catch(() =>
			console.warn("Pull request projection refresh failed"),
		);
	}

	function run() {
		if (pass) return pass;
		async function worker() {
			while (!disposed) {
				const job = [...jobs.values()].find((candidate) => candidate.pending);
				if (!job) return;
				job.pending = false;
				try {
					const revision = mutationRevisions.get(job.lane.associatedUri) ?? 0;
					const update = await job.read();
					if (
						update &&
						revision === (mutationRevisions.get(job.lane.associatedUri) ?? 0) &&
						!job.controller.signal.aborted &&
						!disposed
					) {
						job.update = update;
						job.mutationRevision = revision;
						if (!publishCurrent([update])) {
							console.warn("Pull request projection publication was rejected");
						}
					}
				} catch (error) {
					if (!job.controller.signal.aborted && !disposed)
						console.warn("Pull request projection refresh failed", {
							workspaceId: job.workspaceId,
							lane: job.lane.kind,
							category: failureCategory(error),
						});
				}
			}
		}
		pass = Promise.all(Array.from({ length: 4 }, worker)).finally(() => {
			pass = undefined;
			if (disposed) return;
			if ([...jobs.values()].some((job) => job.pending)) {
				void run().catch(() =>
					console.warn("Pull request projection refresh failed"),
				);
			} else schedulePolling();
		});
		return pass;
	}

	return {
		setPollingOverride({ minIntervalMs, maxIntervalMs, durationMs }) {
			if (disposed) throw new Error("Projection observer is disposed");
			pollingOverride = {
				minIntervalMs,
				maxIntervalMs,
				expiresAt: Date.now() + durationMs,
			};
			clearTimeout(overrideTimer);
			overrideTimer = setTimeout(() => {
				pollingOverride = undefined;
				overrideTimer = undefined;
				reschedulePolling();
			}, durationMs);
			overrideTimer.unref?.();
			reschedulePolling();
		},
		dispose() {
			disposed = true;
			clearTimeout(timer);
			clearTimeout(overrideTimer);
			for (const job of jobs.values()) job.controller.abort();
			jobs.clear();
			for (const reader of readers.values()) reader.dispose();
			unauthenticatedReader.dispose();
		},
		async observe(inventory, publish) {
			if (disposed) return;
			if (typeof authentication?.getAccessToken !== "function") return;
			const entries = inventory.entries.filter(({ associatedUri }) =>
				supportsAssociatedUri(associatedUri),
			);
			publishCurrent = publish;

			const accountIds = opaqueAccountIds(
				entries.flatMap(({ accounts }) =>
					accounts.filter(({ resource }) => resource === "azure-devops"),
				),
			);

			for (const accountId of accountIds)
				if (!readers.has(accountId))
					readers.set(
						accountId,
						createPullRequestUi(
							accountAuthentication(authentication, accountId),
							undefined,
							mutationRevisions,
						),
					);
			const retained = new Set();
			for (const { workspaceId, associatedUri, accounts } of entries) {
				const key = workspaceId;
				retained.add(key);
				const signature = JSON.stringify([associatedUri, accounts]);
				const existing = jobs.get(key);
				if (existing?.signature === signature) {
					if (
						existing.update &&
						existing.mutationRevision ===
							(mutationRevisions.get(associatedUri) ?? 0) &&
						!publishCurrent([existing.update])
					)
						console.warn("Pull request projection publication was rejected");
					continue;
				}
				jobs.get(key)?.controller.abort();
				const controller = new AbortController();
				const lane = {
					kind: /** @type {const} */ ("associated"),
					associatedUri,
				};
				const read = () =>
					!hasAzureDevOpsAccount(accounts)
						? unauthenticatedReader
								.readAssociated(associatedUri, {
									authenticated: false,
									signal: controller.signal,
								})
								.then((state) =>
									projectionUpdate(workspaceId, lane, undefined, state),
								)
						: projectWithFirstUsableAccount(
								accounts,
								readers,
								(reader) =>
									reader.readAssociated(associatedUri, {
										authenticated: true,
										signal: controller.signal,
									}),
								(accountId, state) =>
									projectionUpdate(workspaceId, lane, accountId, state),
								controller.signal,
								{ workspaceId, lane: lane.kind },
							);
				jobs.set(key, {
					workspaceId,
					signature,
					controller,
					lane,
					read,
					pending: true,
				});
			}
			for (const [key, job] of jobs)
				if (!retained.has(key)) {
					job.controller.abort();
					jobs.delete(key);
				}
			for (const [accountId, reader] of readers)
				if (!accountIds.includes(accountId)) {
					reader.dispose();
					readers.delete(accountId);
				}
			if (jobs.size === 0) {
				clearTimeout(timer);
				timer = undefined;
			}
			await run();
		},
	};
}

function hasAzureDevOpsAccount(accounts) {
	return accounts.some(({ resource }) => resource === "azure-devops");
}

/** @param {string | undefined} associatedUri */
function supportsAssociatedUri(associatedUri) {
	return (
		typeof associatedUri === "string" &&
		parsePullRequestViewContext({ url: associatedUri }) !== null
	);
}

async function projectWithFirstUsableAccount(
	accounts,
	readers,
	read,
	project,
	signal,
	diagnostic,
) {
	let attempt = 0;
	for (const { accountId, resource } of accounts) {
		if (resource !== "azure-devops") continue;
		const reader = readers.get(accountId);
		if (!reader) continue;
		attempt++;
		signal.throwIfAborted();
		try {
			const state = await read(reader);
			signal.throwIfAborted();
			if (state.status === "ready") return project(accountId, state);
			console.warn("Pull request projection account read failed", {
				...diagnostic,
				attempt,
				category: "unavailable",
			});
		} catch (error) {
			signal.throwIfAborted();
			console.warn("Pull request projection account read failed", {
				...diagnostic,
				attempt,
				category: failureCategory(error),
			});
		}
	}
	console.warn("Pull request projection refresh has no usable account", {
		...diagnostic,
		attempts: attempt,
	});
	return undefined;
}

/** @param {unknown} value */
function opaqueAccountIds(value) {
	if (!Array.isArray(value)) return [];
	const ids = new Set();
	for (const account of value) {
		if (
			account &&
			typeof account === "object" &&
			!Array.isArray(account) &&
			typeof account.accountId === "string" &&
			account.accountId.length > 0
		) {
			ids.add(account.accountId);
		}
	}
	return [...ids];
}

/**
 * @param {string} workspaceId
 * @param {{kind: "associated", associatedUri: string}} lane
 * @param {string | undefined} accountId
 * @param {import("@github/copilot-app").PrUiState} state
 */
function projectionUpdate(workspaceId, lane, accountId, state) {
	const projection = /** @satisfies {PullRequestProjection} */ ({
		...(accountId === undefined ? {} : { accountId }),
		state: {
			...state,
			contributions: state.contributions.filter(
				(contribution) =>
					contribution.kind === "badge" || contribution.slot !== "pr.create",
			),
		},
	});
	return {
		workspaceId,
		lane,
		projection,
	};
}
