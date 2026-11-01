import { safeActionError } from "./action-telemetry.mjs";
import { completePullRequest, evaluateMerge } from "./agent-merge-policy.mjs";
import { requireEvidence, sameSourceRevision } from "./agent-merge-reads.mjs";
import { AZURE_DEVOPS_HOST } from "./azure-devops-host.mjs";
import { CREATION_PROMPT } from "./creation-prompt.mjs";
import { mergeDetails } from "./merge-details.mjs";
import { MERGE_STRATEGIES } from "./merge-methods.mjs";
import { pullRequestCreationErrorDetails } from "./pull-request-http-error.mjs";
import {
	parsePullRequestViewContext,
	resolveRepository,
} from "./pull-request-locator.mjs";
import { createThreadBody } from "./pull-request-operations.mjs";
import {
	AzureDevOpsContentError,
	AzureDevOpsHttpError,
	createPullRequestBody,
	createPullRequestClient,
	isTemporaryReadError,
} from "./pull-requests.mjs";
import { waitWithCancellation } from "./request.mjs";

const reviewOptions = [
	{
		id: "comment",
		label: "Comment",
		description: "Publish comments without changing your vote",
	},
	{ id: "approve", label: "Approve", description: "Approve this pull request" },
	{
		id: "approve-with-suggestions",
		label: "Approve with suggestions",
		description: "Approve with suggestions for the author",
	},
	{
		id: "wait-for-author",
		label: "Wait for author",
		description: "Ask the author to make changes",
	},
	{ id: "reject", label: "Reject", description: "Reject this pull request" },
];

export function parseRepositoryOrigin(originUrl) {
	if (!URL.canParse(originUrl))
		throw new Error("Unsupported Azure DevOps repository origin.");
	const url = new URL(originUrl);
	const segments = url.pathname.split("/").filter(Boolean);
	if (
		url.protocol !== "https:" ||
		url.hostname !== AZURE_DEVOPS_HOST ||
		url.username ||
		url.password ||
		url.port ||
		url.search ||
		url.hash ||
		segments.length !== 4 ||
		segments[2] !== "_git"
	)
		throw new Error("Unsupported Azure DevOps repository origin.");
	const [organization, project, , repository] =
		segments.map(decodeURIComponent);
	const name = repository.replace(/\.git$/, "");
	if (!name || name.startsWith("."))
		throw new Error("Unsupported Azure DevOps repository origin.");
	return {
		organization,
		project,
		repository: name,
	};
}

/** @returns {import("@github/copilot-app").PrUiState["contributions"]} */
function createButtons() {
	return [false, true].map((draft) => ({
		kind: "button",
		slot: "pr.create",
		id: draft ? "create-draft-pr" : "create-pr",
		label: draft ? "Create draft PR" : "Create PR",
		description: draft
			? "Create a draft pull request"
			: "Create a pull request",
		action: { actionId: "create", input: { draft } },
	}));
}

/**
 * @param {Pick<import("./pull-requests.mjs").PullRequest, "id" | "state" | "url" | "sourceRef" | "targetRef" | "sourceCommitId"> | null} [pr]
 * @param {boolean} [allowReplacement]
 * @returns {import("@github/copilot-app").PrUiState}
 */
function snapshot(pr = null, allowReplacement = false) {
	/** @type {import("@github/copilot-app").PrUiState["contributions"]} */
	const contributions = [
		...(pr
			? [
					/** @type {const} */ ({
						kind: "badge",
						slot: "pr.status",
						id: "pull-request",
						number: pr.id,
						state: pr.state,
						url: pr.url,
					}),
				]
			: []),
		...(!pr || allowReplacement ? createButtons() : []),
	];
	if (pr && ["open", "draft"].includes(pr.state)) {
		const draft = pr.state !== "draft";
		contributions.push({
			kind: "button",
			slot: draft ? "pr.mark-draft" : "pr.publish",
			id: draft ? "mark-draft" : "publish",
			label: draft ? "Mark as draft" : "Publish",
			action: { actionId: "set-draft", input: { draft } },
		});
		if (pr.state === "open" && pr.sourceCommitId) {
			contributions.push({
				kind: "button",
				slot: "pr.complete",
				id: "complete",
				label: "Complete",
				description:
					"Complete with an allowed merge strategy. Policies are not bypassed.",
				action: {
					actionId: "complete",
					input: {
						sourceRef: pr.sourceRef,
						targetRef: pr.targetRef,
						sourceCommit: pr.sourceCommitId,
					},
				},
			});
			for (const { method, label, description } of MERGE_STRATEGIES)
				contributions.push({
					kind: "button",
					slot: "pr.complete",
					id: `complete-${method}`,
					label,
					description,
					action: {
						actionId: "complete",
						input: {
							sourceRef: pr.sourceRef,
							targetRef: pr.targetRef,
							sourceCommit: pr.sourceCommitId,
							mergeStrategy: method,
						},
					},
				});
		}
	}
	return {
		status: "ready",
		error: null,
		...(pr && ["open", "draft"].includes(pr.state)
			? {
					review: {
						actionId: "submit-review",
						defaultOptionId: "comment",
						options:
							pr.state === "draft"
								? reviewOptions.filter((option) => option.id === "comment")
								: reviewOptions,
					},
				}
			: {}),
		...(!pr || allowReplacement ? { creationPrompt: CREATION_PROMPT } : {}),
		contributions,
	};
}

/**
 * Native operation scope supplies the saved repository account, so requests omit it.
 * @param {import("@github/copilot-app").AppAuthentication | undefined} authentication
 * @param {(changed: {organization: string, repositoryId: string, pullRequestId: number}, completing: boolean) => void} [pullRequestChanged]
 * @param {Map<string, number>} [mutationRevisions]
 * @param {(details: {kind: "http", status: number, serviceErrorType?: string, serviceErrorCode?: number, parameter?: string, reason?: "invalid_source_ref" | "invalid_target_ref" | "invalid_branch_ref" | "active_pull_request_exists"}, options?: {cause?: unknown}) => Error} [createPullRequestError]
 * @returns {NonNullable<import("@github/copilot-app").Provider["prUi"]> & {
 *   readAssociated(associatedUri: string, options?: {authenticated?: boolean, signal?: AbortSignal}): Promise<import("@github/copilot-app").PrUiState>,
 *   readCreate(context: import("@github/copilot-app").PrUiContext, options?: {authenticated?: boolean, signal?: AbortSignal}): Promise<import("@github/copilot-app").PrUiState>,
 *   dispose(): void
 * }}
 */
export function createPullRequestUi(
	authentication,
	pullRequestChanged = () => {},
	mutationRevisions = new Map(),
	createPullRequestError,
) {
	let disposed = false;
	const requireActive = () => {
		if (disposed) throw new Error("PR UI is disposed.");
	};
	const operationAuthentication =
		typeof authentication?.getAccessToken === "function"
			? authentication
			: {
					async getAccessToken() {
						throw new Error("Native authentication is unavailable.");
					},
				};

	async function clientFor(
		repository,
		markMutationDispatched = undefined,
		detail = false,
		signal = undefined,
	) {
		const { id, project } = await resolveRepository(repository, {
			authentication: operationAuthentication,
			signal,
		});
		if (detail && typeof project?.id !== "string")
			throw new AzureDevOpsContentError(
				"missing-project",
				"The repository project ID is unavailable.",
			);
		return createPullRequestClient({
			repository: {
				organization: repository.organization,
				project: detail ? project.id : repository.project,
				projectId: project?.id,
				repositoryId: id,
			},
			authentication: operationAuthentication,
			markMutationDispatched,
		});
	}

	const api = {
		async readAssociated(associatedUri, options) {
			return api.read({ originUrl: associatedUri, associatedUri }, options);
		},
		async readCreate(context, options) {
			return api.read(context, options);
		},
		async read(context, options) {
			// Optional identity and checks share the lookup budget, leaving room
			// in the host's 60-second operation for preflight and publication.
			const deadline = AbortSignal.timeout(30_000);
			const checksDeadline = options?.signal
				? AbortSignal.any([options.signal, deadline])
				: deadline;
			options?.signal?.throwIfAborted();
			const { authenticated = true } = options ?? {};
			requireActive();
			if (!context) {
				return /** @type {import("@github/copilot-app").PrUiState} */ ({
					status: "unavailable",
					error: "Repository and authentication are not configured.",
					contributions: [],
				});
			}
			const origin = context.associatedUri
				? null
				: parseRepositoryOrigin(context.originUrl);
			const associatedPullRequest = context.associatedUri
				? parsePullRequestViewContext({ url: context.associatedUri })
				: null;
			if (!authenticated) {
				return context.associatedUri
					? /** @type {import("@github/copilot-app").PrUiState} */ ({
							status: "unavailable",
							error:
								"Sign in with the repository account to refresh this pull request.",
							contributions: [],
						})
					: snapshot();
			}
			if (!context.associatedUri) createPullRequestBody(context);
			const parsed = context.associatedUri ? associatedPullRequest : origin;
			if (!parsed)
				throw new Error("Unsupported Azure DevOps pull request URI.");
			const client = await clientFor(
				parsed,
				undefined,
				options?.mergeDetails === true,
				options?.signal,
			);
			let evidence = null;
			let detailError = null;
			if (options?.mergeDetails && context.associatedUri) {
				try {
					evidence = await client.getAgentMergeEvidence(parsed.pullRequestId, {
						signal: checksDeadline,
					});
				} catch (error) {
					if (
						!(error instanceof AzureDevOpsContentError) &&
						!(error instanceof AzureDevOpsHttpError) &&
						!isTemporaryReadError(error) &&
						!(error instanceof DOMException && error.name === "AbortError")
					)
						throw error;
					detailError = `Merge details are unavailable. Refresh to retry. ${error.message}`;
				}
			}
			// A failed optional read still requires a successful PR identity read.
			const pr =
				evidence?.normalized ??
				(context.associatedUri
					? await client.get(parsed.pullRequestId, { signal: options?.signal })
					: await client.findByRefs(context.sourceRef, context.targetRef, {
							signal: options?.signal,
						}));
			if (
				pr &&
				(pr.state === "open" || pr.state === "draft") &&
				context.requestedTargetRef != null &&
				pr.targetRef !== context.requestedTargetRef
			) {
				return /** @type {import("@github/copilot-app").PrUiState} */ ({
					status: "unavailable",
					error: `Existing PR targets ${pr.targetRef}, but ${context.requestedTargetRef} was requested. This tool cannot retarget an existing PR.`,
					contributions: [],
				});
			}
			// The host pins opens to the saved URI, not an equivalent GUID URL.
			const result = snapshot(
				pr && context.associatedUri
					? { ...pr, url: context.associatedUri }
					: pr,
				pr?.state === "merged" || pr?.state === "closed",
			);
			result.error = detailError;
			if (evidence) {
				result.mergeDetails = mergeDetails(evidence);
				if (
					!result.contributions.some(
						(entry) => entry.kind === "button" && entry.slot === "pr.complete",
					)
				)
					delete result.mergeDetails.mergeMethods;
			}
			if (!pr || !["open", "draft"].includes(pr.state)) return result;
			const readOwnership = async () => {
				try {
					if (!pr.authorId)
						throw new AzureDevOpsContentError(
							"missing-author",
							"Azure DevOps did not return the PR creator.",
						);
					const viewerId = await waitWithCancellation(
						client.getCurrentUserId({ signal: checksDeadline }),
						checksDeadline,
					);
					result.viewerIsAuthor =
						viewerId.toLowerCase() === pr.authorId.toLowerCase();
					return null;
				} catch (error) {
					if (
						!(error instanceof AzureDevOpsContentError) &&
						!(error instanceof AzureDevOpsHttpError) &&
						!isTemporaryReadError(error) &&
						!(
							error instanceof DOMException &&
							["AbortError", "TimeoutError"].includes(error.name)
						)
					)
						throw error;
					return `Pull request author identity is unavailable. Refresh to retry. ${error.message}`;
				}
			};
			const readChecks = async () => {
				if (pr.state !== "open") return null;
				try {
					const statuses = await client.getStatuses(pr.id, {
						signal: checksDeadline,
					});
					const checksSummary = {
						total: statuses.length,
						success: 0,
						failure: 0,
						pending: 0,
					};
					for (const status of statuses) {
						switch (status.state) {
							case "notApplicable":
								checksSummary.total--;
								break;
							case "succeeded":
								checksSummary.success++;
								break;
							case "failed":
							case "error":
								checksSummary.failure++;
								break;
							case "pending":
							case "notSet":
								checksSummary.pending++;
								break;
							default:
								throw new AzureDevOpsContentError(
									"unknown-status",
									"Unrecognized pull request check state.",
								);
						}
					}
					const badge = result.contributions.find(
						(entry) => entry.kind === "badge",
					);
					if (badge && checksSummary.total > 0)
						badge.checksSummary = checksSummary;
					return null;
				} catch (error) {
					if (
						!(error instanceof AzureDevOpsContentError) &&
						!(error instanceof AzureDevOpsHttpError) &&
						!isTemporaryReadError(error) &&
						!(error instanceof DOMException && error.name === "AbortError")
					)
						throw error;
					return `Pull request checks are unavailable. Refresh to retry. ${error.message}`;
				}
			};
			const readReadiness = async () => {
				if (pr.state !== "open") return null;
				try {
					const readiness =
						evidence ??
						(await client.getMergeReadinessEvidence(pr.id, {
							signal: checksDeadline,
						}));
					const badge = result.contributions.find(
						(entry) => entry.kind === "badge",
					);
					if (badge && readiness.normalized.state === "open")
						badge.readyToMerge =
							evaluateMerge(readiness).completion.status === "ready";
				} catch {
					// Readiness is optional. Unknown readiness hides the ready state.
				}
				return null;
			};
			const errors = await Promise.all([
				readOwnership(),
				readChecks(),
				readReadiness(),
			]);
			options?.signal?.throwIfAborted();
			result.error = [detailError, ...errors].filter(Boolean).join(" ") || null;
			return result;
		},
		actions: [
			{
				name: "create",
				async handler(input, context, operation) {
					requireActive();
					if (
						!input ||
						typeof input !== "object" ||
						Array.isArray(input) ||
						Object.keys(input).length !== 1 ||
						typeof input.draft !== "boolean"
					)
						throw new TypeError("Invalid pull request creation action.");
					const repository = parseRepositoryOrigin(context.originUrl);
					if (
						typeof context.description !== "string" ||
						!context.description.trim()
					)
						throw new TypeError(
							"A generated pull request description is required. Retry creation.",
						);
					const createInput = {
						title: context.title,
						description: context.description,
						sourceRef: context.sourceRef,
						targetRef: context.targetRef,
						draft: input.draft,
					};
					// Reject partial context before even resolving the repository over HTTP.
					createPullRequestBody(createInput);
					const client = await clientFor(
						repository,
						operation?.markMutationDispatched,
					);
					try {
						return snapshot(await client.create(createInput));
					} catch (error) {
						const details = pullRequestCreationErrorDetails(error);
						if (!details || !createPullRequestError) throw error;
						throw createPullRequestError(details, { cause: error });
					}
				},
			},
			{
				name: "submit-review",
				async handler(input, context, operation) {
					requireActive();
					const review = parseReview(input);
					const associated = context.associatedUri
						? parsePullRequestViewContext({ url: context.associatedUri })
						: null;
					if (!associated)
						throw new TypeError(
							"An associated Azure DevOps pull request is required.",
						);
					const origin =
						context.originUrl === context.associatedUri
							? associated
							: parseRepositoryOrigin(context.originUrl);
					if (
						associated.organization.toLowerCase() !==
							origin.organization.toLowerCase() ||
						associated.project.toLowerCase() !== origin.project.toLowerCase()
					)
						throw new TypeError(
							"Pull request repository does not match the workspace.",
						);
					let dispatched = false;
					let confirmed = 0;
					let writeKind = "general_comment";
					const client = await clientFor(origin, () => {
						dispatched = true;
						operation?.markMutationDispatched();
					});
					const associatedRepository = await resolveRepository(associated, {
						authentication: operationAuthentication,
					});
					const pr = await client.get(associated.pullRequestId);
					if (
						associatedRepository.id.toLowerCase() !==
						pr.repositoryId.toLowerCase()
					)
						throw new TypeError(
							"Pull request repository does not match the workspace.",
						);
					if (!["open", "draft"].includes(pr.state))
						throw new TypeError(
							"This pull request is closed. Refresh before reviewing.",
						);
					if (pr.state === "draft" && review.decision !== "comment")
						throw new TypeError(
							"Voting is disabled on draft pull requests. Submit comments without a vote.",
						);
					if (
						review.sourceCommitId &&
						pr.sourceCommitId !== review.sourceCommitId
					)
						throw new TypeError(
							"The inline source revision changed; refresh before reviewing.",
						);
					const vote =
						review.decision === "comment"
							? undefined
							: /** @type {10 | 5 | -5 | -10} */ (
									{
										approve: 10,
										"approve-with-suggestions": 5,
										"wait-for-author": -5,
										reject: -10,
									}[review.decision]
								);
					const viewerId =
						vote === undefined ? undefined : await client.getCurrentUserId();
					const threads = [];
					if (review.body.trim()) threads.push({ content: review.body });
					if (review.inlineComments.length) {
						const changes = await client.getChanges(pr.id);
						for (const comment of review.inlineComments) {
							const index = changes.files.findIndex(
								(file) => file.path === comment.path,
							);
							const file = changes.files[index];
							if (
								index < 0 ||
								!file.changeTrackingId ||
								changes.sourceCommitId !== review.sourceCommitId
							)
								throw new TypeError(
									"The inline source revision changed; refresh before reviewing.",
								);
							const diff = await client.getFileDiff(changes, index);
							const text =
								comment.side === "original" ? diff.original : diff.modified;
							const lines =
								text === null || text === ""
									? 0
									: text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
							if (diff.binary || comment.endLine > lines)
								throw new TypeError("Invalid inline comment location.");
							threads.push({
								content: comment.body,
								anchor: {
									path: file.path,
									side: comment.side,
									startLine: comment.startLine,
									endLine: comment.endLine,
									baseCommitId: changes.baseCommitId,
									sourceCommitId: changes.sourceCommitId,
									iterationId: changes.iterationId,
									changeTrackingId: file.changeTrackingId,
								},
							});
						}
					}
					const requireBoundedBody = (body) => {
						if (
							new TextEncoder().encode(JSON.stringify(body)).byteLength >
							12 * 1024
						)
							throw new TypeError(
								"Review content exceeds the mediated request size limit. Shorten the comments before submitting.",
							);
					};
					for (const thread of threads)
						requireBoundedBody(createThreadBody(thread));
					if (vote !== undefined) requireBoundedBody({ id: viewerId, vote });
					try {
						for (const thread of threads) {
							writeKind = thread.anchor ? "inline_comment" : "general_comment";
							requireActive();
							await client.createThread(pr.id, thread);
							confirmed++;
						}
						if (vote !== undefined) {
							writeKind = "vote";
							requireActive();
							await client.vote(pr.id, viewerId, vote);
							confirmed++;
						}
					} catch (cause) {
						console.error("Azure DevOps review submission failed.", {
							dispatched,
							confirmedWrites: confirmed,
							writeKind,
							...(cause instanceof AzureDevOpsHttpError
								? {
										...(cause.serviceErrorType
											? { serviceErrorType: cause.serviceErrorType }
											: {}),
										...(cause.serviceErrorCode !== undefined
											? { serviceErrorCode: cause.serviceErrorCode }
											: {}),
										...(cause.parameter ? { parameter: cause.parameter } : {}),
									}
								: {}),
							...safeActionError(cause),
						});
						if (!dispatched) throw cause;
						throw new Error(
							`Review submission is partial or unconfirmed (${confirmed} writes confirmed). Refresh and inspect the remote discussion and vote before retrying; do not automatically resubmit comments.`,
							{ cause },
						);
					}
					pullRequestChanged(
						{
							organization: associated.organization,
							repositoryId: pr.repositoryId,
							pullRequestId: pr.id,
						},
						false,
					);
					return snapshot({ ...pr, url: context.associatedUri });
				},
			},
			{
				name: "set-draft",
				async handler(input, context, operation) {
					requireActive();
					if (
						!input ||
						typeof input !== "object" ||
						Array.isArray(input) ||
						Object.keys(input).length !== 1 ||
						typeof input.draft !== "boolean"
					)
						throw new TypeError("Invalid draft action.");
					const parsed = parsePullRequestViewContext({
						url: context.associatedUri,
					});
					requireEvidence(parsed, "A linked pull request is required.");
					const client = await clientFor(
						parsed,
						operation?.markMutationDispatched,
					);
					const pr = await client.get(parsed.pullRequestId);
					requireEvidence(
						["open", "draft"].includes(pr.state),
						"Only active pull requests can change draft status.",
					);
					const updated = await client.update(pr.id, { draft: input.draft });
					requireEvidence(
						updated.state === (input.draft ? "draft" : "open"),
						"Draft status was not confirmed. Refresh the pull request.",
					);
					pullRequestChanged(
						{
							organization: parsed.organization,
							repositoryId: updated.repositoryId,
							pullRequestId: updated.id,
						},
						false,
					);
					return snapshot({ ...updated, url: context.associatedUri });
				},
			},
			{
				name: "complete",
				async handler(input, context, operation) {
					requireActive();
					if (
						!input ||
						typeof input !== "object" ||
						Array.isArray(input) ||
						(input.mergeStrategy !== undefined &&
							(typeof input.mergeStrategy !== "string" ||
								!MERGE_STRATEGIES.some(
									({ method }) => method === input.mergeStrategy,
								)))
					)
						throw new TypeError("Invalid completion action.");
					const parsed = parsePullRequestViewContext({
						url: context.associatedUri,
					});
					requireEvidence(parsed, "A linked pull request is required.");
					const client = await clientFor(
						parsed,
						operation?.markMutationDispatched,
						true,
					);
					const evidence = await client.getAgentMergeEvidence(
						parsed.pullRequestId,
						{
							signal: AbortSignal.timeout(30_000),
						},
					);
					requireEvidence(
						sameSourceRevision(input, evidence.revision),
						"Source revision or target ref changed. Refresh before completing.",
					);
					const completed = await completePullRequest(
						client,
						parsed.pullRequestId,
						evidence,
						input.mergeStrategy,
						input.postCompletionOptions,
					);
					pullRequestChanged(
						{
							organization: parsed.organization,
							repositoryId: completed.repositoryId,
							pullRequestId: completed.id,
						},
						completed.state !== "merged",
					);
					return snapshot(
						{ ...completed, url: context.associatedUri },
						completed.state === "merged",
					);
				},
			},
		],
		dispose() {
			disposed = true;
		},
	};
	for (const action of api.actions) {
		const handler = action.handler;
		action.handler = async (input, context, operation) => {
			const uri = context?.associatedUri;
			const advance = () => {
				if (uri)
					mutationRevisions.set(uri, (mutationRevisions.get(uri) ?? 0) + 1);
			};
			advance();
			try {
				const confirmed = await handler(input, context, operation);
				if (!uri) return confirmed;
				let current = confirmed;
				try {
					current = await api.readAssociated(uri, {
						signal: AbortSignal.timeout(30_000),
					});
				} catch (error) {
					if (
						!(error instanceof AzureDevOpsContentError) &&
						!(error instanceof AzureDevOpsHttpError) &&
						!isTemporaryReadError(error) &&
						!(
							error instanceof DOMException &&
							["AbortError", "TimeoutError"].includes(error.name)
						)
					)
						throw error;
					confirmed.error =
						"Action confirmed, but refreshed pull request details are unavailable. Refresh to retry.";
				}
				current.contributions = current.contributions.filter(
					(entry) => entry.slot !== "pr.create",
				);
				current.creationPrompt = undefined;
				return current;
			} finally {
				advance();
			}
		};
	}
	return api;
}

/** @param {unknown} value */
function parseReview(value) {
	const object = (input, allowed) => {
		if (
			!input ||
			typeof input !== "object" ||
			Array.isArray(input) ||
			Object.keys(input).some((key) => !allowed.includes(key))
		)
			throw new TypeError("Invalid review input.");
		return input;
	};
	const input = object(value, [
		"decision",
		"body",
		"inlineComments",
		"sourceCommitId",
	]);
	if (
		!reviewOptions.some((option) => option.id === input.decision) ||
		typeof input.body !== "string" ||
		input.body.length > 65_536 ||
		!Array.isArray(input.inlineComments) ||
		input.inlineComments.length > 100 ||
		(input.sourceCommitId !== undefined &&
			(typeof input.sourceCommitId !== "string" ||
				!/^[a-f0-9]{40}$/i.test(input.sourceCommitId))) ||
		(input.inlineComments?.length > 0 && input.sourceCommitId === undefined)
	)
		throw new TypeError("Invalid review input.");
	const inlineComments = input.inlineComments.map((item) => {
		const comment = object(item, ["path", "side", "startLine", "line", "body"]);
		if (
			typeof comment.path !== "string" ||
			!comment.path ||
			/[\0\\]/.test(comment.path) ||
			(comment.side !== undefined &&
				!["LEFT", "RIGHT"].includes(comment.side)) ||
			(comment.startLine !== undefined &&
				(!Number.isSafeInteger(comment.startLine) || comment.startLine < 1)) ||
			!Number.isSafeInteger(comment.line) ||
			comment.line < (comment.startLine ?? 1) ||
			typeof comment.body !== "string" ||
			!comment.body.trim() ||
			comment.body.length > 65_536
		)
			throw new TypeError("Invalid inline comment input.");
		return {
			path: comment.path.startsWith("/") ? comment.path : `/${comment.path}`,
			side: comment.side === "LEFT" ? "original" : "modified",
			startLine: comment.startLine ?? comment.line,
			endLine: comment.line,
			body: comment.body,
		};
	});
	if (
		input.decision === "comment" &&
		!input.body.trim() &&
		!inlineComments.length
	)
		throw new TypeError("Add a review body or inline comment.");
	return {
		decision: input.decision,
		body: input.body,
		inlineComments,
		sourceCommitId: input.sourceCommitId?.toLowerCase(),
	};
}
