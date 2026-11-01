/**
 * @typedef {{ organization: string, project: string, projectId?: string, repositoryId: string, accountId?: string }} AzureDevOpsRepository
 * @typedef {import("./request.mjs").Authentication} Authentication
 * @typedef {(load: () => Promise<[number, string]>) => Promise<[number, string]>} BuildMetadataLimiter
 * @typedef {{ signal?: AbortSignal }} RequestOptions
 * @typedef {{ terminal?: boolean }} ReadErrorOptions
 * @typedef {"open" | "draft" | "merged" | "closed"} PullRequestState
 * @typedef {"noFastForward" | "squash" | "rebase" | "rebaseMerge"} MergeStrategy
 * @typedef {{ title: string, description?: string, sourceRef: string, targetRef: string, draft?: boolean }} CreateInput
 * @typedef {{ sourceCommitId: string, mergeStrategy: MergeStrategy, title: string, description?: string | null, deleteSourceBranch?: boolean, transitionWorkItems?: boolean }} CompleteInput
 * @typedef {object} PullRequest
 * @property {number} id
 * @property {string} repositoryId
 * @property {string} [authorId]
 * @property {string} title
 * @property {string | null} description
 * @property {string} url
 * @property {PullRequestState} state
 * @property {string} sourceRef
 * @property {string} targetRef
 * @property {string | null} sourceCommitId
 * @property {string | null} mergeStatus
 * @typedef {{ id: string, name: string, avatarUrl?: string }} Person
 * @typedef {{ id: string, name: string, vote: number, isRequired: boolean }} Reviewer
 * @typedef {{ id: string, name: string, detail?: string }} ReviewerCandidate
 * @typedef {{ id: number, author: Person | null, content: string, publishedAt: string | null, parentCommentId?: number, commentType?: string }} Comment
 * @typedef {{line: number, offset: number}} CommentPosition
 * @typedef {{filePath?: string, leftFileStart?: CommentPosition, leftFileEnd?: CommentPosition, rightFileStart?: CommentPosition, rightFileEnd?: CommentPosition}} ThreadContext
 * @typedef {{firstComparingIteration: number, secondComparingIteration: number}} IterationContext
 * @typedef {IterationContext & {origFilePath?: string, origLeftFileStart?: CommentPosition, origLeftFileEnd?: CommentPosition, origRightFileStart?: CommentPosition, origRightFileEnd?: CommentPosition}} TrackingCriteria
 * @typedef {{changeTrackingId?: number, iterationContext?: IterationContext, trackingCriteria?: TrackingCriteria}} PullRequestThreadContext
 * @typedef {{path: string, side: "original" | "modified", startLine: number, endLine: number, iterationId: number, changeTrackingId: number}} ThreadAnchor
 * @typedef {{ id: number, status: string, path: string | null, comments: Comment[], publishedAt?: string, updatedAt?: string, activityType?: string, threadContext?: ThreadContext, pullRequestThreadContext?: PullRequestThreadContext, anchor?: ThreadAnchor }} Thread
 * @typedef {{ id: string, name: string, typeId?: string, displayName?: string, status: string, isBlocking: boolean, isEnabled: boolean, url?: string, buildId?: number, buildDefinitionId?: number, pipelineName?: string, statusName?: string, statusGenre?: string, minimumApproverCount?: number }} Policy
 * @typedef {{ id: number, name: string, genre: string, state: string, description: string | null, iterationId: number | null, createdAt: string | null, updatedAt: string | null, url?: string, buildId?: number, pipelineName?: string }} Status
 * @typedef {{ author: Person | null, createdAt: string | null, reviewers: Reviewer[], threads: Thread[], policies: Policy[], statuses: Status[], errors?: {threads?: string, policies?: string, statuses?: string, builds?: string} }} Overview
 * @typedef {{ id: string, message: string, author: string, date: string | null }} Commit
 * @typedef {{ id: number, path: string, originalPath: string | null, changeType: string, changeTrackingId?: number }} ChangedFile
 * @typedef {{ iterationId: number, baseCommitId: string, sourceCommitId: string, commits: Commit[], files: ChangedFile[], selectedCommitId?: string }} ChangeSet
 * @typedef {{ path: string, original: string | null, modified: string | null, binary: boolean }} FileDiff
 * @typedef {import("./pull-request-thread-code.mjs").ThreadCode} ThreadCode
 */

import { createAgentMergeReads } from "./agent-merge-reads.mjs";
import { AZURE_DEVOPS_HOST } from "./azure-devops-host.mjs";
import { avatarUrl, readAvatar } from "./pull-request-avatars.mjs";
import {
	AzureDevOpsHttpError,
	readPullRequestHttpError,
} from "./pull-request-http-error.mjs";
import {
	createPullRequestOperations,
	safeDetailUrl,
} from "./pull-request-operations.mjs";
import { createThreadCodeReader } from "./pull-request-thread-code.mjs";
import {
	bearerRequestInit,
	getAccessToken,
	MAX_RESPONSE_BYTES,
	readLimitedJson,
	waitWithCancellation,
} from "./request.mjs";

const REQUEST_TIMEOUT_MS = 30_000;
const API_VERSION = "7.1";
const COMMIT_ID_PATTERN = /^[a-f0-9]{40}$/i;
const GUID_PATTERN =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GIT_REPOSITORIES_NAMESPACE = "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87";
const GIT_PULL_REQUEST_CONTRIBUTE = 16384;
const PAGE_SIZE = 100;
const REVIEWER_SEARCH_LIMIT = 20;
const REVIEWER_TEAM_SEARCH_LIMIT = 20;
const REVIEWER_TEAM_SEARCH_CONCURRENCY = 4;
const BUILD_METADATA_CONCURRENCY = 16;
const MAX_TEXT_BYTES = 1024 * 1024;
// JSON escaping can expand one text byte into six, plus item metadata.
const MAX_ITEM_JSON_BYTES = MAX_TEXT_BYTES * 6 + 64 * 1024;
const THREAD_STATUSES = [
	"unknown",
	"active",
	"fixed",
	"wontFix",
	"closed",
	"byDesign",
	"pending",
];
const POLICY_STATUSES = [
	"queued",
	"running",
	"approved",
	"rejected",
	"notApplicable",
	"broken",
];
const STATUS_STATES = [
	"notSet",
	"pending",
	"succeeded",
	"failed",
	"error",
	"notApplicable",
];
const CHANGE_TYPES = [
	"none",
	"add",
	"edit",
	"encoding",
	"rename",
	"delete",
	"undelete",
	"branch",
	"merge",
	"lock",
	"rollback",
	"sourceRename",
	"targetRename",
	"property",
	"all",
];
// Azure DevOps rejects a longer completion merge commit message with HTTP 400.
const MAX_MERGE_COMMIT_MESSAGE_LENGTH = 4000;
const SUPPORTED_MERGE_STRATEGIES = [
	"noFastForward",
	"squash",
	"rebase",
	"rebaseMerge",
];
const unavailableAuthentication = {
	async getAccessToken() {
		throw new Error("Azure DevOps pull request authentication is unavailable.");
	},
};
const limitBuildMetadataLookup = createBuildMetadataLimiter();

export { AzureDevOpsHttpError } from "./pull-request-http-error.mjs";

export class AzureDevOpsContentError extends Error {
	/** @param {string} code @param {string} message @param {unknown} [cause] */
	constructor(code, message, cause) {
		super(message, { cause });
		this.name = "AzureDevOpsContentError";
		this.code = code;
	}
}

class AzureDevOpsNetworkError extends Error {
	constructor(original) {
		super("Azure DevOps PR content request failed.");
		this.code = "network";
		this.original = original;
	}
}

/** @param {unknown} error */
export function isTemporaryReadError(error) {
	if (error instanceof AzureDevOpsNetworkError)
		return (
			error.original instanceof TypeError ||
			isTemporaryReadError(error.original)
		);
	if (error instanceof AzureDevOpsContentError)
		return isTemporaryReadError(error.cause);
	if (error instanceof AzureDevOpsHttpError)
		return error.status === 408 || error.status === 429 || error.status >= 500;
	return (
		error instanceof Error &&
		(error.name === "TimeoutError" ||
			("code" in error && ["timeout", "busy"].includes(String(error.code))))
	);
}

/** @param {unknown} error */
function isAuthorityReadError(error) {
	if (!error || (typeof error !== "object" && typeof error !== "function"))
		return false;
	if (
		"code" in error &&
		["denied", "account_unavailable", "credential_unavailable"].includes(
			String(error.code),
		)
	)
		return true;
	if (error instanceof AzureDevOpsHttpError) return error.status === 401;
	if (error instanceof AzureDevOpsNetworkError)
		return isAuthorityReadError(error.original);
	if (error instanceof AzureDevOpsContentError)
		return isAuthorityReadError(error.cause);
	return error instanceof Error ? isAuthorityReadError(error.cause) : false;
}

/** @returns {BuildMetadataLimiter} */
function createBuildMetadataLimiter() {
	let active = 0;
	/** @type {Array<() => void>} */
	const waiting = [];
	return async (load) => {
		if (active < BUILD_METADATA_CONCURRENCY) {
			active++;
		} else {
			await new Promise((resolve) => {
				waiting.push(() => resolve(undefined));
			});
		}
		try {
			return await load();
		} finally {
			const next = waiting.shift();
			if (next) next();
			else active--;
		}
	};
}

/** @param {CreateInput} input */
export function createPullRequestBody({
	title,
	description = "",
	sourceRef,
	targetRef,
	draft = false,
}) {
	if (typeof description !== "string")
		throw new TypeError("Invalid PR description");
	return {
		title: requireString(title, "PR title"),
		description,
		sourceRefName: requireBranchRef(sourceRef),
		targetRefName: requireBranchRef(targetRef),
		isDraft: requireBoolean(draft),
	};
}

/**
 * Bind a client to one app-selected repository. Requests use a host-issued
 * token for the repository's account reference, or for the host-scoped
 * operation account when the repository omits one.
 * beforeWrite authorizes before transport; markMutationDispatched synchronously
 * records dispatch evidence and must not be used as a permission check.
 * @param {{ repository: AzureDevOpsRepository, authentication?: Authentication, fetch?: typeof globalThis.fetch, beforeWrite?: (signal: AbortSignal) => Promise<void>, markMutationDispatched?: () => void }} options
 */
export function createPullRequestClient({
	repository,
	authentication,
	fetch: requestFetch = globalThis.fetch,
	beforeWrite,
	markMutationDispatched,
}) {
	const accountId =
		repository.accountId === undefined
			? undefined
			: requireString(repository.accountId, "account ID");
	const tokenAuthentication =
		typeof authentication?.getAccessToken === "function"
			? { getAccessToken: authentication.getAccessToken.bind(authentication) }
			: unavailableAuthentication;
	const repositoryId = requireString(repository.repositoryId, "repository ID");
	const project = repository.project;
	const projectUrl = `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/${segment(repository.project)}`;
	const repositoryPath = `git/repositories/${segment(repositoryId)}`;
	const prPath = `${repositoryPath}/pullrequests`;
	const webUrl = `${projectUrl}/_git/${segment(repositoryId)}/pullrequest`;
	// Nested content readers must preserve the installer's authorization errors.
	const writeErrors = new WeakSet();
	const primitiveWriteErrors = new Set();
	const writeErrorCollection = (error) =>
		(error !== null && typeof error === "object") || typeof error === "function"
			? writeErrors
			: primitiveWriteErrors;
	const preserveWriteError = (error) => writeErrorCollection(error).has(error);

	/**
	 * @param {"GET" | "POST" | "PATCH" | "PUT" | "DELETE"} method
	 * @param {string} path Package-constructed API path, never a response URL.
	 * @param {Record<string, unknown> | readonly unknown[] | undefined} body
	 * @param {AbortSignal | undefined} signal
	 * @param {Record<string, string>} [query]
	 * @param {string} [version]
	 * @param {number | undefined} [maxBytes]
	 * @param {string | undefined} [imageUrl] Package-validated profile endpoint only.
	 * @param {string | undefined} [requestUrl] Package-constructed JSON endpoint only.
	 * @param {boolean} [write] Whether this request dispatches a mutation.
	 */
	async function requestJson(
		method,
		path,
		body,
		signal,
		query = {},
		version = API_VERSION,
		maxBytes,
		imageUrl,
		requestUrl,
		write = method !== "GET",
	) {
		const serialized = body === undefined ? undefined : JSON.stringify(body);
		signal?.throwIfAborted();
		// One deadline covers token refresh, write authorization, and HTTP.
		const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
		const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
		const accessToken = await getAccessToken(
			tokenAuthentication,
			accountId,
			requestSignal,
		);
		requestSignal.throwIfAborted();

		const params = new URLSearchParams({ ...query, "api-version": version });
		const markWriteDispatched = () => {
			if (write) markMutationDispatched?.();
		};
		if (write && beforeWrite) {
			try {
				await waitWithCancellation(beforeWrite(requestSignal), requestSignal);
				requestSignal.throwIfAborted();
			} catch (error) {
				writeErrorCollection(error).add(error);
				throw error;
			}
		}
		requestSignal.throwIfAborted();
		// A disallowed origin is a client bug, not a network failure.
		const url =
			imageUrl ?? requestUrl ?? `${projectUrl}/_apis/${path}?${params}`;
		const init = bearerRequestInit(
			url,
			{
				method,
				headers: {
					Accept: imageUrl
						? "image/png,image/jpeg,image/gif,image/webp"
						: "application/json",
					...(serialized === undefined
						? {}
						: { "Content-Type": "application/json" }),
				},
				body: serialized,
				signal: requestSignal,
			},
			accessToken,
		);
		let response;
		try {
			markWriteDispatched();
			response = await requestFetch(url, init);
		} catch (error) {
			signal?.throwIfAborted();
			if (error instanceof Error && error.name === "AbortError") throw error;
			throw new AzureDevOpsNetworkError(error);
		}
		if (!response.ok) {
			throw await readPullRequestHttpError(response, requestSignal);
		}
		let data;
		try {
			data = imageUrl
				? await readAvatar(response, requestSignal)
				: method === "DELETE"
					? null
					: await readLimitedJson(
							response,
							maxBytes ?? MAX_RESPONSE_BYTES,
							requestSignal,
							maxBytes === undefined ? responseLimitErrors : textLimitErrors,
						);
		} catch (error) {
			signal?.throwIfAborted();
			// Body transport errors are TypeErrors; malformed UTF-8 is an
			// invalid-response content error and invalid JSON is a SyntaxError.
			if (error instanceof TypeError) throw new AzureDevOpsNetworkError(error);
			throw error;
		}
		requestSignal.throwIfAborted();
		return {
			data,
			continuationToken: response.headers.get("x-ms-continuationtoken"),
		};
	}

	/**
	 * @param {"GET" | "POST" | "PATCH"} method
	 * @param {number | undefined} id
	 * @param {Record<string, unknown> | undefined} body
	 * @param {AbortSignal | undefined} signal
	 * @returns {Promise<PullRequest>}
	 */
	async function request(method, id, body, signal) {
		let response;
		try {
			response = await requestJson(
				method,
				id === undefined ? prPath : `${prPath}/${id}`,
				body,
				signal,
			);
		} catch (error) {
			if (method !== "GET" && error instanceof AzureDevOpsNetworkError)
				throw error.original;
			throw error;
		}
		return readPullRequest(response.data, repositoryId, webUrl, id);
	}

	/**
	 * Threads/commits use continuation headers when present; policy evaluations
	 * document $top/$skip, so a full policy page requires another offset read.
	 * @param {string} path
	 * @param {AbortSignal | undefined} signal
	 * @param {Record<string, string>} [query]
	 * @param {boolean} [policies]
	 * @param {(value: unknown) => unknown} [read]
	 * @param {{maxPages: number, maxBytes: number}} [limits] Strict complete reads for automation.
	 */
	async function list(
		path,
		signal,
		query = {},
		policies = false,
		read = (value) => value,
		limits,
	) {
		const values = [];
		const seen = new Set();
		const policyIds = new Set();
		/** @type {string | null} */
		let continuationToken = null;
		for (let pageIndex = 0; ; pageIndex++) {
			if (limits && pageIndex >= limits.maxPages)
				throw invalidContent(
					"Azure DevOps evidence exceeds the complete-read limit.",
				);
			const page = await requestJson(
				"GET",
				path,
				undefined,
				signal,
				{
					...query,
					...(policies || limits ? { $top: String(PAGE_SIZE) } : {}),
					...(policies ? { $skip: String(values.length) } : {}),
					...(continuationToken ? { continuationToken } : {}),
				},
				policies ? "7.1-preview.1" : API_VERSION,
				limits?.maxBytes,
			);
			const items = array(record(page.data).value);
			if (
				limits &&
				(page.data.count !== items.length ||
					values.length + items.length > PAGE_SIZE * limits.maxPages)
			)
				throw paginationError();
			if (policies) {
				for (const item of items) {
					const id = nonemptyText(record(item).evaluationId);
					if (policyIds.has(id)) throw paginationError();
					policyIds.add(id);
				}
			}
			values.push(...items.map(read));
			continuationToken = page.continuationToken;
			if (continuationToken) {
				if (
					seen.has(continuationToken) ||
					(limits && (policies || continuationToken.length > 1024))
				)
					throw paginationError();
				seen.add(continuationToken);
			} else if (!policies || items.length < PAGE_SIZE) {
				break;
			}
		}
		return values;
	}

	/** @param {number} id @param {AbortSignal | undefined} signal @returns {Promise<Status[]>} */
	async function readStatuses(id, signal) {
		const entries = await list(
			`${prPath}/${id}/statuses`,
			signal,
			{},
			false,
			(value) => readStatus(value, projectUrl),
		);
		let latestIteration = null;
		if (entries.some((entry) => entry.iterationId !== null)) {
			const iterations = await list(
				`${prPath}/${id}/iterations`,
				signal,
				{},
				false,
				(value) => positiveInteger(record(value).id),
			);
			latestIteration = iterations.reduce((a, b) => Math.max(a, b), 0);
			const iterationIds = new Set(iterations);
			if (
				entries.some(
					(entry) =>
						entry.iterationId !== null && !iterationIds.has(entry.iterationId),
				)
			)
				throw invalidContent(
					"Status response does not match the pull request iterations.",
				);
		}
		/** @type {Map<string, Status>} */
		const current = new Map();
		for (const entry of entries) {
			// An old iteration's success says nothing about the current code.
			if (entry.iterationId !== null && entry.iterationId !== latestIteration)
				continue;
			const key = JSON.stringify([entry.genre, entry.name]);
			const previous = current.get(key);
			const updated = entry.updatedAt ?? entry.createdAt ?? "";
			const previousUpdated = previous?.updatedAt ?? previous?.createdAt ?? "";
			if (
				!previous ||
				updated > previousUpdated ||
				(updated === previousUpdated && entry.id > previous.id)
			)
				current.set(key, entry);
		}
		return [...current.values()];
	}

	/** @param {number[]} buildIds @param {AbortSignal | undefined} signal */
	async function readBuildNames(buildIds, signal) {
		const entries = await Promise.all(
			[...new Set(buildIds)].map((buildId) =>
				limitBuildMetadataLookup(async () => {
					const { data } = await readContent(
						() =>
							requestJson("GET", `build/builds/${buildId}`, undefined, signal),
						signal,
					);
					const build = record(data);
					if (positiveInteger(build.id) !== buildId) throw invalidContent();
					return [buildId, nonemptyText(record(build.definition).name)];
				}),
			),
		);
		return new Map(entries);
	}

	/** @param {number[]} definitionIds @param {AbortSignal | undefined} signal */
	async function readBuildDefinitionNames(definitionIds, signal) {
		const entries = await Promise.all(
			[...new Set(definitionIds)].map((definitionId) =>
				limitBuildMetadataLookup(async () => {
					const { data } = await readContent(
						() =>
							requestJson(
								"GET",
								`build/definitions/${definitionId}`,
								undefined,
								signal,
							),
						signal,
					);
					const definition = record(data);
					if (positiveInteger(definition.id) !== definitionId)
						throw invalidContent();
					return [definitionId, nonemptyText(definition.name)];
				}),
			),
		);
		return new Map(entries);
	}

	/** @param {string} path @param {string} commitId @param {AbortSignal | undefined} signal */
	async function readFile(path, commitId, signal) {
		const { data } = await requestJson(
			"GET",
			`${repositoryPath}/items`,
			undefined,
			signal,
			{
				path,
				"versionDescriptor.version": commitId,
				"versionDescriptor.versionType": "commit",
				includeContent: "true",
				includeContentMetadata: "true",
				$format: "json",
			},
			API_VERSION,
			MAX_ITEM_JSON_BYTES,
		);
		const file = record(data);
		if (file.path !== path || commitIdOf(file.commitId) !== commitId) {
			throw invalidContent(
				"File response does not match the requested path and commit.",
			);
		}
		if (file.gitObjectType !== "blob" || file.isFolder === true) {
			throw unsupportedDiff();
		}
		if (boolean(record(file.contentMetadata).isBinary, false))
			return { binary: true, content: null };
		const content = text(file.content);
		if (content.includes("\0")) throw unsupportedDiff();
		if (new TextEncoder().encode(content).byteLength > MAX_TEXT_BYTES)
			throw tooLarge();
		return { binary: false, content };
	}

	const readThreadCode = createThreadCodeReader({
		prPath,
		list,
		requestJson,
		readFile,
		readChangedFile,
		error: (code, message) => new AzureDevOpsContentError(code, message),
	});

	/** @param {string} query @param {string} searchFilter @param {AbortSignal | undefined} signal */
	async function findReviewerIdentities(query, searchFilter, signal) {
		const params = new URLSearchParams({
			searchFilter,
			filterValue: query,
			queryMembership: "None",
			"api-version": API_VERSION,
		});
		const url = `https://vssps.dev.azure.com/${segment(repository.organization)}/_apis/identities?${params}`;
		const { data } = await requestJson(
			"GET",
			"",
			undefined,
			signal,
			{},
			API_VERSION,
			undefined,
			undefined,
			url,
		);
		return readReviewerIdentities(data);
	}

	/** @param {string} query */
	function reviewerIdentitySearchFilters(query) {
		if (query.includes("@")) return ["General", "MailAddress"];
		if (query.includes("\\")) return ["General", "AccountName"];
		return ["General", "AccountName", "DisplayName"];
	}

	/** @param {string} teamId @param {AbortSignal | undefined} signal */
	async function findReviewerTeamMembers(teamId, signal) {
		const membersUrl = `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/_apis/projects/${segment(repository.project)}/teams/${segment(teamId)}/members?${new URLSearchParams(
			{
				$top: "100",
				"api-version": API_VERSION,
			},
		)}`;
		const members = await requestJson(
			"GET",
			"",
			undefined,
			signal,
			{},
			API_VERSION,
			undefined,
			undefined,
			membersUrl,
		);
		return readReviewerTeamMembers(members.data);
	}

	/** @param {string} query @param {AbortSignal | undefined} signal */
	async function findProjectReviewerIdentities(query, signal) {
		const teamsUrl = `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/_apis/projects/${segment(repository.project)}/teams?${new URLSearchParams(
			{
				$mine: "false",
				$top: "100",
				"api-version": API_VERSION,
			},
		)}`;
		const teams = await requestJson(
			"GET",
			"",
			undefined,
			signal,
			{},
			API_VERSION,
			undefined,
			undefined,
			teamsUrl,
		);
		const teamIds = readReviewerTeamIds(teams.data);
		const selectedTeamIds = teamIds.slice(0, REVIEWER_TEAM_SEARCH_LIMIT);
		const identities = [];
		let incomplete = selectedTeamIds.length < teamIds.length;
		for (
			let offset = 0;
			offset < selectedTeamIds.length;
			offset += REVIEWER_TEAM_SEARCH_CONCURRENCY
		) {
			const batch = selectedTeamIds.slice(
				offset,
				offset + REVIEWER_TEAM_SEARCH_CONCURRENCY,
			);
			const results = await Promise.all(
				batch.map(async (teamId) => {
					try {
						return await findReviewerTeamMembers(teamId, signal);
					} catch (error) {
						if (reviewerSearchSourceUnavailable(error)) {
							incomplete = true;
							return [];
						}
						throw error;
					}
				}),
			);
			identities.push(...results.flat());
			if (
				rankReviewerIdentities(identities, query, REVIEWER_SEARCH_LIMIT)
					.length >= REVIEWER_SEARCH_LIMIT
			)
				break;
		}
		return { identities, incomplete };
	}

	/** @param {string} query @param {AbortSignal | undefined} signal */
	async function findGraphReviewerIdentities(query, signal) {
		const url = `https://vssps.dev.azure.com/${segment(repository.organization)}/_apis/graph/subjectquery?api-version=7.1-preview.1`;
		const { data } = await requestJson(
			"POST",
			"",
			{
				query,
				subjectKind: ["User", "Group"],
			},
			signal,
			{},
			"7.1-preview.1",
			undefined,
			undefined,
			url,
			false,
		);
		const subjects = readReviewerSubjects(data);
		const selected = subjects.slice(0, REVIEWER_SEARCH_LIMIT);
		if (!selected.length)
			return {
				identities: [],
				incomplete: subjects.length > REVIEWER_SEARCH_LIMIT,
			};
		const params = new URLSearchParams({
			subjectDescriptors: selected
				.map((subject) => subject.descriptor)
				.join(","),
			queryMembership: "None",
			"api-version": API_VERSION,
		});
		const resolveUrl = `https://vssps.dev.azure.com/${segment(repository.organization)}/_apis/identities?${params}`;
		const resolved = await requestJson(
			"GET",
			"",
			undefined,
			signal,
			{},
			API_VERSION,
			undefined,
			undefined,
			resolveUrl,
		);
		return {
			identities: readReviewerIdentities(resolved.data),
			incomplete: subjects.length > REVIEWER_SEARCH_LIMIT,
		};
	}

	/** @param {number} permission @param {string} token @param {AbortSignal | undefined} signal */
	async function hasPermission(permission, token, signal) {
		const params = new URLSearchParams({
			tokens: token,
			alwaysAllowAdministrators: "false",
			"api-version": API_VERSION,
		});
		const url = `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/_apis/permissions/${GIT_REPOSITORIES_NAMESPACE}/${permission}?${params}`;
		const { data } = await requestJson(
			"GET",
			"",
			undefined,
			signal,
			{},
			API_VERSION,
			undefined,
			undefined,
			url,
		);
		const result = record(data);
		const values = array(result.value);
		if (
			result.count !== 1 ||
			values.length !== 1 ||
			typeof values[0] !== "boolean"
		)
			throw invalidContent("Invalid Azure DevOps permission response.");
		return values[0];
	}

	const client = {
		/** @param {RequestOptions} [options] @returns {Promise<string>} */
		async getCurrentUserId({ signal } = {}) {
			return readContent(async () => {
				const { data } = await requestJson(
					"GET",
					"connectionData",
					undefined,
					signal,
					{},
					"7.1-preview.1",
					MAX_ITEM_JSON_BYTES,
					undefined,
					`https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/_apis/connectionData?api-version=7.1-preview.1`,
				);
				const id = record(record(data).authenticatedUser).id;
				if (typeof id !== "string" || !GUID_PATTERN.test(id))
					throw invalidContent(
						"Authenticated reviewer identity is unavailable.",
					);
				return id;
			}, signal);
		},
		/**
		 * Check the bound account's repository-level pull-request contribution
		 * permission. Azure DevOps still enforces every actual write.
		 * @param {RequestOptions} [options]
		 */
		async hasPullRequestContributePermission({ signal } = {}) {
			if (!GUID_PATTERN.test(project) || !GUID_PATTERN.test(repositoryId))
				throw invalidContent(
					"Cannot identify the repository permission scope.",
				);
			return hasPermission(
				GIT_PULL_REQUEST_CONTRIBUTE,
				`repoV2/${project}/${repositoryId}`,
				signal,
			);
		},

		/**
		 * Create a normal or draft PR and return its current data.
		 * The app must commit and push the source branch before creation.
		 * @param {CreateInput} input
		 * @param {RequestOptions} [options]
		 */
		async create(input, { signal } = {}) {
			return request("POST", undefined, createPullRequestBody(input), signal);
		},

		/**
		 * Fetch current PR data without caching or starting background polling.
		 * @param {number} id
		 * @param {RequestOptions} [options]
		 */
		async get(id, { signal } = {}) {
			return request("GET", requireId(id), undefined, signal);
		},

		/**
		 * Resolve the current PR for one exact source/target ref pair.
		 * @param {string} sourceRef
		 * @param {string} targetRef
		 * @param {RequestOptions} [options]
		 */
		async findByRefs(sourceRef, targetRef, { signal } = {}) {
			const source = requireBranchRef(sourceRef);
			const target = requireBranchRef(targetRef);
			let response;
			try {
				response = await requestJson("GET", prPath, undefined, signal, {
					"searchCriteria.sourceRefName": source,
					"searchCriteria.targetRefName": target,
					"searchCriteria.status": "all",
					$top: "10",
				});
			} catch (error) {
				if (error instanceof AzureDevOpsNetworkError) throw error.original;
				throw error;
			}
			const matches = array(record(response.data).value)
				.map((value) => readPullRequest(value, repositoryId, webUrl, undefined))
				.filter(
					(pullRequest) =>
						pullRequest.sourceRef === source &&
						pullRequest.targetRef === target,
				);
			return (
				matches.find(
					(pullRequest) =>
						pullRequest.state === "open" || pullRequest.state === "draft",
				) ??
				matches[0] ??
				null
			);
		},

		/** @param {number} id @param {RequestOptions} [options] @returns {Promise<Status[]>} */
		async getStatuses(id, { signal } = {}) {
			const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
			const boundedSignal = signal
				? AbortSignal.any([signal, deadline])
				: deadline;
			return readContent(
				() =>
					waitWithCancellation(
						readStatuses(requireId(id), boundedSignal),
						boundedSignal,
					),
				boundedSignal,
			);
		},

		/** @param {string} value @param {RequestOptions} [options] */
		async getAvatar(value, { signal } = {}) {
			const url = avatarUrl(value, repository.organization);
			const { data } = await requestJson(
				"GET",
				"",
				undefined,
				signal,
				{},
				API_VERSION,
				undefined,
				url,
			);
			return data;
		},

		/**
		 * Search identities visible to the selected ADO account. Organization
		 * identity search is supplemented with project team membership because
		 * either service can omit valid reviewers.
		 * @param {string} value
		 * @param {RequestOptions} [options]
		 * @returns {Promise<{reviewers: ReviewerCandidate[], incomplete: boolean}>}
		 */
		async searchReviewers(value, { signal } = {}) {
			const query = requireString(value, "reviewer search").trim();
			if (!GUID_PATTERN.test(query) && query.length < 2)
				throw new TypeError("Enter at least two characters to search.");
			if (GUID_PATTERN.test(query))
				return {
					reviewers: [
						{
							id: query,
							name: query,
							detail: "Azure DevOps identity ID",
						},
					],
					incomplete: false,
				};
			const identities = [];
			let incomplete = false;
			for (const searchFilter of reviewerIdentitySearchFilters(query)) {
				try {
					identities.push(
						...(await findReviewerIdentities(query, searchFilter, signal)),
					);
					if (
						rankReviewerIdentities(identities, query, REVIEWER_SEARCH_LIMIT)
							.length
					)
						break;
				} catch (error) {
					if (reviewerSearchSourceUnavailable(error)) incomplete = true;
					else throw error;
				}
			}
			if (
				rankReviewerIdentities(identities, query, REVIEWER_SEARCH_LIMIT)
					.length < REVIEWER_SEARCH_LIMIT
			) {
				try {
					const projectMatches = await findProjectReviewerIdentities(
						query,
						signal,
					);
					identities.push(...projectMatches.identities);
					incomplete ||= projectMatches.incomplete;
				} catch (error) {
					if (reviewerSearchSourceUnavailable(error)) incomplete = true;
					else throw error;
				}
			}
			if (
				rankReviewerIdentities(identities, query, REVIEWER_SEARCH_LIMIT)
					.length < REVIEWER_SEARCH_LIMIT
			) {
				try {
					const graphMatches = await findGraphReviewerIdentities(query, signal);
					identities.push(...graphMatches.identities);
					incomplete ||= graphMatches.incomplete;
				} catch (error) {
					if (reviewerSearchSourceUnavailable(error)) incomplete = true;
					else throw error;
				}
			}
			return {
				reviewers: rankReviewerIdentities(
					mergeReviewerIdentities(identities),
					query,
					REVIEWER_SEARCH_LIMIT,
				).map(reviewerCandidate),
				incomplete,
			};
		},

		/**
		 * Resolve an ADO reviewer GUID from a name, email, alias, or GUID.
		 * @param {string} value
		 * @param {RequestOptions} [options]
		 */
		async resolveReviewer(value, { signal } = {}) {
			const query = requireString(value, "reviewer").trim();
			if (!query) throw new TypeError("Expected a reviewer");
			if (GUID_PATTERN.test(query)) return query;
			let identities = [];
			for (const searchFilter of reviewerIdentitySearchFilters(query)) {
				identities = await findReviewerIdentities(query, searchFilter, signal);
				if (identities.length) break;
			}
			if (!identities.length) {
				const teamsUrl = `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}/_apis/projects/${segment(repository.project)}/teams?${new URLSearchParams(
					{
						$mine: "false",
						$top: "100",
						"api-version": API_VERSION,
					},
				)}`;
				const teams = await requestJson(
					"GET",
					"",
					undefined,
					signal,
					{},
					API_VERSION,
					undefined,
					undefined,
					teamsUrl,
				);
				for (const teamId of readReviewerTeamIds(teams.data)) {
					const teamIdentities = await findReviewerTeamMembers(teamId, signal);
					const exactTeamMatches = teamIdentities.filter((identity) =>
						identity.matches.some(
							(candidate) =>
								candidate.localeCompare(query, undefined, {
									sensitivity: "base",
								}) === 0,
						),
					);
					if (!/\s/.test(query) && exactTeamMatches.length > 0)
						return exactTeamMatches[0].id;
					identities.push(...teamIdentities);
				}
			}
			if (!identities.length) {
				const url = `https://vssps.dev.azure.com/${segment(repository.organization)}/_apis/graph/subjectquery?api-version=7.1-preview.1`;
				const { data } = await requestJson(
					"POST",
					"",
					{
						query,
						subjectKind: ["User", "Group"],
					},
					signal,
					{},
					"7.1-preview.1",
					undefined,
					undefined,
					url,
					false,
				);
				const subjects = readReviewerSubjects(data);
				if (subjects.length > 20)
					throw new AzureDevOpsContentError(
						"reviewer-ambiguous",
						"More than one Azure DevOps reviewer matched. Enter a more specific name or email.",
					);
				if (subjects.length) {
					const params = new URLSearchParams({
						subjectDescriptors: subjects
							.map((subject) => subject.descriptor)
							.join(","),
						queryMembership: "None",
						"api-version": API_VERSION,
					});
					const resolveUrl = `https://vssps.dev.azure.com/${segment(repository.organization)}/_apis/identities?${params}`;
					const resolved = await requestJson(
						"GET",
						"",
						undefined,
						signal,
						{},
						API_VERSION,
						undefined,
						undefined,
						resolveUrl,
					);
					identities = readReviewerIdentities(resolved.data);
				}
			}
			identities = mergeReviewerIdentities(identities);
			const exact = identities.filter((identity) =>
				identity.matches.some(
					(candidate) =>
						candidate.localeCompare(query, undefined, {
							sensitivity: "base",
						}) === 0,
				),
			);
			const matches = exact.length ? exact : identities;
			if (matches.length === 1) return matches[0].id;
			if (matches.length === 0)
				throw new AzureDevOpsContentError(
					"reviewer-not-found",
					"No Azure DevOps reviewer matched that name, email, alias, or identity ID.",
				);
			throw new AzureDevOpsContentError(
				"reviewer-ambiguous",
				"More than one Azure DevOps reviewer matched. Enter a more specific name or email.",
			);
		},

		/** @param {number} id @param {RequestOptions & {onError?: (error: unknown, options?: ReadErrorOptions) => void}} [options] @returns {Promise<Overview>} */
		async getOverview(id, { signal, onError } = {}) {
			return readContent(async () => {
				requireId(id);
				const { data } = await requestJson(
					"GET",
					`${prPath}/${id}`,
					undefined,
					signal,
				);
				readPullRequest(data, repositoryId, webUrl, id);
				const raw = record(data);
				const context = record(raw.repository);
				const projectContext = isRecord(context.project) ? context.project : {};
				if (
					!GUID_PATTERN.test(repositoryId) ||
					typeof projectContext.id !== "string" ||
					!GUID_PATTERN.test(projectContext.id)
				) {
					throw new AzureDevOpsContentError(
						"missing-project-context",
						"Azure DevOps PR overview requires repository and project GUID context.",
					);
				}
				if (
					(GUID_PATTERN.test(project) &&
						project.toLowerCase() !== projectContext.id.toLowerCase()) ||
					(!GUID_PATTERN.test(project) &&
						projectContext.name !== undefined &&
						text(projectContext.name).toLowerCase() !== project.toLowerCase())
				)
					throw invalidContent("PR response does not match the project.");
				const author = readPerson(raw.createdBy);
				const createdAt = date(raw.creationDate);
				const reviewers = array(raw.reviewers).map(readReviewer);
				const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectContext.id}/${id}`;
				const errors = {};
				const optionalResource = async (
					name,
					load,
					allowContentError = false,
				) => {
					try {
						return await load();
					} catch (error) {
						signal?.throwIfAborted();
						if (
							!(error instanceof AzureDevOpsHttpError) &&
							!(error instanceof AzureDevOpsNetworkError) &&
							!(allowContentError && error instanceof AzureDevOpsContentError)
						)
							throw error;
						errors[name] = error.message;
						onError?.(error);
						return [];
					}
				};
				const optionalBuildMetadata = async (load) => {
					try {
						return await load();
					} catch (error) {
						signal?.throwIfAborted();
						if (
							!(error instanceof AzureDevOpsHttpError) &&
							!(error instanceof AzureDevOpsNetworkError) &&
							!(error instanceof AzureDevOpsContentError)
						)
							throw error;
						errors.builds = error.message;
						onError?.(error, { terminal: isAuthorityReadError(error) });
						return new Map();
					}
				};
				const threads = (
					await optionalResource("threads", () =>
						list(`${prPath}/${id}/threads`, signal, {}, false, (value) =>
							boolean(record(value).isDeleted, false)
								? null
								: readThread(value),
						),
					)
				).filter((value) => value !== null);
				const policies = await optionalResource("policies", () =>
					list(
						"policy/evaluations",
						signal,
						{ artifactId, includeNotApplicable: "true" },
						true,
						(value) => readPolicy(value, artifactId, projectUrl),
					),
				);
				const statuses = await optionalResource("statuses", () =>
					readStatuses(id, signal),
				);
				const genericBuildPolicies = policies.filter(
					(entry) =>
						entry.isEnabled &&
						entry.status !== "notApplicable" &&
						!entry.displayName &&
						entry.name.localeCompare("Build", undefined, {
							sensitivity: "base",
						}) === 0,
				);
				const genericBuildIds = [...genericBuildPolicies, ...statuses]
					.filter(
						(entry) =>
							entry.buildId &&
							entry.name.localeCompare("Build", undefined, {
								sensitivity: "base",
							}) === 0,
					)
					.map((entry) => entry.buildId);
				const genericBuildDefinitionIds = genericBuildPolicies
					.filter((entry) => !entry.buildId && entry.buildDefinitionId)
					.map((entry) => entry.buildDefinitionId);
				const [buildNamesResult, buildDefinitionNamesResult] =
					await Promise.all([
						genericBuildIds.length
							? optionalBuildMetadata(() =>
									readBuildNames(genericBuildIds, signal),
								)
							: new Map(),
						genericBuildDefinitionIds.length
							? optionalBuildMetadata(() =>
									readBuildDefinitionNames(genericBuildDefinitionIds, signal),
								)
							: new Map(),
					]);
				const buildNames =
					buildNamesResult instanceof Map ? buildNamesResult : new Map();
				const buildDefinitionNames =
					buildDefinitionNamesResult instanceof Map
						? buildDefinitionNamesResult
						: new Map();
				const withPipelineName = (entry) => {
					const pipelineName = entry.buildId
						? buildNames.get(entry.buildId)
						: undefined;
					return pipelineName ? { ...entry, pipelineName } : entry;
				};
				const withPolicyPipelineName = (entry) => {
					const { buildDefinitionId, ...policy } = entry;
					if (entry.displayName) return policy;
					const pipelineName = entry.buildId
						? buildNames.get(entry.buildId)
						: buildDefinitionId
							? buildDefinitionNames.get(buildDefinitionId)
							: undefined;
					return pipelineName ? { ...policy, pipelineName } : policy;
				};
				return freezeTree({
					author,
					createdAt,
					reviewers,
					threads,
					policies: policies.map(withPolicyPipelineName),
					statuses: statuses.map(withPipelineName),
					...(Object.keys(errors).length ? { errors } : {}),
				});
			}, signal);
		},

		/** @param {number} id @param {Thread} thread @param {RequestOptions} [options] @returns {Promise<ThreadCode>} */
		async getThreadCode(id, thread, { signal } = {}) {
			return readContent(
				() => readThreadCode(requireId(id), thread, signal),
				signal,
			);
		},

		/** @param {number} id @param {RequestOptions & {commitId?: string}} [options] @returns {Promise<ChangeSet>} */
		async getChanges(id, { signal, commitId } = {}) {
			return readContent(async () => {
				requireId(id);
				const selectedCommitId =
					commitId === undefined ? undefined : commitIdOf(commitId);
				const latest = readLatestIteration(
					await list(`${prPath}/${id}/iterations`, signal),
				);
				if (!latest) {
					throw new AzureDevOpsContentError(
						"no-iterations",
						"Azure DevOps PR has no iterations to compare.",
					);
				}
				let { baseCommitId, sourceCommitId } = latest;
				const files = [];
				let commits;
				if (selectedCommitId) {
					commits = (
						await list(`${prPath}/${id}/commits`, signal, {
							$top: String(PAGE_SIZE),
						})
					).map(readCommit);
					if (!commits.some((commit) => commit.id === selectedCommitId))
						throw invalidContent(
							"Selected commit is not in this pull request.",
						);
					const { data } = await requestJson(
						"GET",
						`${repositoryPath}/commits/${selectedCommitId}`,
						undefined,
						signal,
					);
					const selected = record(data);
					if (commitIdOf(selected.commitId) !== selectedCommitId)
						throw invalidContent(
							"Commit response does not match the selected commit.",
						);
					const parents = array(selected.parents).map(commitIdOf);
					if (!parents.length)
						throw new AzureDevOpsContentError(
							"unsupported-diff",
							"A root commit has no first parent to compare.",
						);
					baseCommitId = parents[0];
					sourceCommitId = selectedCommitId;
					let skip = 0;
					const seen = new Set();
					for (;;) {
						const { data } = await requestJson(
							"GET",
							`${repositoryPath}/commits/${selectedCommitId}/changes`,
							undefined,
							signal,
							{ top: String(PAGE_SIZE), skip: String(skip) },
						);
						const page = array(record(data).changes);
						for (const value of page) {
							const change = readChangedFile({
								...record(value),
								changeId: files.length + 1,
							});
							if (seen.has(change.path)) throw paginationError();
							seen.add(change.path);
							files.push(change);
						}
						if (page.length < PAGE_SIZE) break;
						skip += page.length;
					}
				} else {
					let skip = 0;
					let top = PAGE_SIZE;
					for (;;) {
						const { data } = await requestJson(
							"GET",
							`${prPath}/${id}/iterations/${latest.id}/changes`,
							undefined,
							signal,
							{
								$compareTo: "0",
								$skip: String(skip),
								$top: String(top),
							},
						);
						const page = record(data);
						files.push(...array(page.changeEntries).map(readChangedFile));
						if (page.nextSkip === undefined && page.nextTop === undefined)
							break;
						const nextSkip = integer(page.nextSkip);
						const nextTop = integer(page.nextTop);
						if (nextSkip === 0 && nextTop === 0) break;
						if (nextSkip <= skip || nextTop <= 0 || nextTop > 2000)
							throw paginationError();
						skip = nextSkip;
						top = nextTop;
					}
					commits = (
						await list(`${prPath}/${id}/commits`, signal, {
							$top: String(PAGE_SIZE),
						})
					).map(readCommit);
				}
				// PR-wide commit pages are mutable; verify the selected comparison
				// once after the last page before publishing any of the result.
				const current = readLatestIteration(
					await list(`${prPath}/${id}/iterations`, signal),
				);
				if (
					!current ||
					current.id !== latest.id ||
					current.baseCommitId !== latest.baseCommitId ||
					current.sourceCommitId !== latest.sourceCommitId
				) {
					throw new AzureDevOpsContentError(
						"stale-changes",
						"Azure DevOps PR changed while loading. Refresh to load the current changes.",
					);
				}
				return freezeTree({
					iterationId: latest.id,
					baseCommitId,
					sourceCommitId,
					commits,
					files,
					...(selectedCommitId ? { selectedCommitId } : {}),
				});
			}, signal);
		},

		/** @param {ChangeSet} changes @param {number} index @param {RequestOptions} [options] @returns {Promise<FileDiff>} */
		async getFileDiff(changes, index, { signal } = {}) {
			return readContent(async () => {
				if (
					!isRecord(changes) ||
					!Array.isArray(changes.files) ||
					!Number.isSafeInteger(index) ||
					index < 0 ||
					index >= changes.files.length
				) {
					throw invalidContent("Invalid changed file index.");
				}
				const file = record(changes.files[index]);
				const path = filePath(file.path);
				const originalPath =
					file.originalPath == null ? null : filePath(file.originalPath);
				const baseCommitId = commitIdOf(changes.baseCommitId);
				const sourceCommitId = commitIdOf(changes.sourceCommitId);
				const types = changeType(file.changeType).split(", ");
				if (
					types.some(
						(type) =>
							!["add", "edit", "delete", "rename", "encoding"].includes(type),
					) ||
					(types.includes("add") && types.includes("delete")) ||
					(types.includes("rename") &&
						(!originalPath ||
							types.includes("add") ||
							types.includes("delete")))
				)
					throw unsupportedDiff();
				const original = types.includes("add")
					? null
					: await readFile(originalPath ?? path, baseCommitId, signal);
				const modified = types.includes("delete")
					? null
					: await readFile(path, sourceCommitId, signal);
				const binary = original?.binary === true || modified?.binary === true;
				return Object.freeze({
					path,
					original: binary ? null : (original?.content ?? null),
					modified: binary ? null : (modified?.content ?? null),
					binary,
				});
			}, signal);
		},

		/**
		 * Request a merge using the supplied source commit and merge strategy.
		 * Completion can be queued: only a server status of completed maps to merged.
		 * @param {number} id
		 * @param {CompleteInput} input
		 * @param {RequestOptions} [options]
		 */
		async complete(id, input, { signal } = {}) {
			const {
				sourceCommitId,
				mergeStrategy,
				deleteSourceBranch = false,
				transitionWorkItems = false,
			} = input;
			if (!COMMIT_ID_PATTERN.test(sourceCommitId)) {
				throw new TypeError("A source commit ID is required to complete a PR");
			}
			if (!SUPPORTED_MERGE_STRATEGIES.includes(mergeStrategy)) {
				throw new TypeError("An explicit supported merge strategy is required");
			}
			let message = `Merged PR ${id}: ${input.title}${input.description ? `\n\n${input.description}` : ""}`;
			if (message.length > MAX_MERGE_COMMIT_MESSAGE_LENGTH) {
				// Do not leave half of a surrogate pair at the cut.
				message = `${message
					.slice(0, MAX_MERGE_COMMIT_MESSAGE_LENGTH - 3)
					.replace(/[\uD800-\uDBFF]$/, "")}...`;
			}
			return request(
				"PATCH",
				requireId(id),
				{
					status: "completed",
					lastMergeSourceCommit: { commitId: sourceCommitId },
					completionOptions: {
						mergeStrategy,
						mergeCommitMessage:
							mergeStrategy === "squash" ? message : undefined,
						deleteSourceBranch: requireBoolean(deleteSourceBranch),
						bypassPolicy: false,
						transitionWorkItems: requireBoolean(transitionWorkItems),
					},
				},
				signal,
			);
		},

		/**
		 * Close the PR without merging or deleting its source branch.
		 * @param {number} id
		 * @param {RequestOptions} [options]
		 */
		async abandon(id, { signal } = {}) {
			return request("PATCH", requireId(id), { status: "abandoned" }, signal);
		},
	};
	return Object.assign(
		client,
		createPullRequestOperations({
			prPath,
			projectUrl,
			repositoryId,
			project,
			getChanges: (id, options) => client.getChanges(id, options),
			readers: {
				thread: readThread,
				comment: readComment,
				reviewer: readReviewer,
				pullRequest: (data, id) =>
					readPullRequest(data, repositoryId, webUrl, id),
			},
			run: (action, signal) => readContent(action, signal, preserveWriteError),
			send: async (method, path, body, signal, reader) =>
				readContent(
					async () =>
						freezeTree(
							reader((await requestJson(method, path, body, signal)).data),
						),
					signal,
					preserveWriteError,
				),
		}),
		createAgentMergeReads({
			requestJson,
			list,
			repositoryPath,
			prPath,
			repositoryId,
			// Evidence matches the project GUID, which a name-bound client can also supply.
			project: repository.projectId ?? project,
			organizationUrl: `https://${AZURE_DEVOPS_HOST}/${segment(repository.organization)}`,
			readPullRequest: (data, id) =>
				readPullRequest(data, repositoryId, webUrl, id),
			readThread,
		}),
	);
}

/** @template T @param {() => Promise<T>} action @param {AbortSignal | undefined} signal @param {(error: unknown) => boolean} [preserveError] */
async function readContent(action, signal, preserveError) {
	try {
		signal?.throwIfAborted();
		const value = await action();
		signal?.throwIfAborted();
		return value;
	} catch (error) {
		if (!signal?.aborted && preserveError?.(error)) throw error;
		if (
			signal?.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw new DOMException(
				"Azure DevOps PR content request cancelled.",
				"AbortError",
			);
		}
		if (
			error instanceof AzureDevOpsContentError ||
			error instanceof AzureDevOpsHttpError
		)
			throw error;
		throw new AzureDevOpsContentError(
			"request-failed",
			"Azure DevOps PR content request failed.",
			error,
		);
	}
}

/** @param {string} [message] */
function invalidContent(message = "Invalid Azure DevOps PR content response.") {
	return new AzureDevOpsContentError("invalid-response", message);
}

function paginationError() {
	return invalidContent("Invalid Azure DevOps PR content pagination.");
}

function unsupportedDiff() {
	return new AzureDevOpsContentError(
		"unsupported-diff",
		"This Azure DevOps file diff is unsupported.",
	);
}

const textLimitErrors = { tooLarge, invalid: () => invalidContent() };
const responseLimitErrors = {
	tooLarge: () =>
		new AzureDevOpsContentError(
			"too-large",
			"Azure DevOps response is too large (2 MiB limit).",
		),
	invalid: () => invalidContent(),
};

function tooLarge() {
	return new AzureDevOpsContentError(
		"too-large",
		"Azure DevOps file content is too large to display (1 MiB text limit).",
	);
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
	if (!isRecord(value)) throw invalidContent();
	return value;
}

/** @param {unknown} value @returns {unknown[]} */
function array(value) {
	if (!Array.isArray(value)) throw invalidContent();
	return value;
}

/** @param {unknown} value */
function text(value) {
	if (typeof value !== "string") throw invalidContent();
	return value;
}

/** @param {unknown} value */
function nonemptyText(value) {
	const result = text(value);
	if (!result.trim()) throw invalidContent();
	return result;
}

/** @param {unknown} value */
function integer(value) {
	if (typeof value !== "number" || !Number.isSafeInteger(value))
		throw invalidContent();
	return value;
}

/** @param {unknown} value */
function positiveInteger(value) {
	const result = integer(value);
	if (result <= 0) throw invalidContent();
	return result;
}

/** @param {unknown} value @param {boolean | undefined} [fallback] */
function boolean(value, fallback) {
	if (value === undefined && fallback !== undefined) return fallback;
	if (typeof value !== "boolean") throw invalidContent();
	return value;
}

/** @param {unknown} value */
function date(value) {
	if (value == null) return null;
	const parsed = Date.parse(text(value));
	if (!Number.isFinite(parsed)) throw invalidContent();
	return new Date(parsed).toISOString();
}

/** @param {unknown} value @returns {Person | null} */
function readPerson(value) {
	if (value == null) return null;
	const identity = record(value);
	const links = isRecord(identity._links) ? identity._links : {};
	const image =
		(isRecord(links.avatar) ? links.avatar.href : null) ?? identity.imageUrl;
	return {
		id: nonemptyText(identity.id),
		name: nonemptyText(identity.displayName),
		...(typeof image === "string" && image.length <= 2048 && image.length > 0
			? { avatarUrl: image }
			: {}),
	};
}

/** @param {unknown} value */
function filePath(value) {
	const path = nonemptyText(value);
	if (!path.startsWith("/") || path.includes("\0")) throw invalidContent();
	return path;
}

/** @param {unknown} value */
function commitIdOf(value) {
	const id = text(value);
	if (!COMMIT_ID_PATTERN.test(id)) throw invalidContent();
	return id.toLowerCase();
}

/** @param {unknown} value @returns {Thread} */
function readThread(value) {
	const thread = record(value);
	if (
		thread.status != null &&
		typeof thread.status !== "string" &&
		!Number.isSafeInteger(thread.status)
	)
		throw invalidContent();
	const status =
		typeof thread.status === "number"
			? (THREAD_STATUSES[thread.status] ?? "unknown")
			: typeof thread.status === "string" &&
					THREAD_STATUSES.includes(thread.status)
				? thread.status
				: "unknown";
	const context =
		thread.threadContext == null ? null : record(thread.threadContext);
	const prContext =
		thread.pullRequestThreadContext == null
			? null
			: record(thread.pullRequestThreadContext);
	const result = {
		id: positiveInteger(thread.id),
		status,
		path: context?.filePath == null ? null : filePath(context.filePath),
		comments: array(thread.comments)
			.filter((value) => !boolean(record(value).isDeleted, false))
			.map(readComment),
	};
	const publishedAt = date(thread.publishedDate);
	if (publishedAt) result.publishedAt = publishedAt;
	const updatedAt = date(thread.lastUpdatedDate);
	if (updatedAt) result.updatedAt = updatedAt;
	const activityType = readThreadActivityType(thread.properties);
	if (activityType) result.activityType = activityType;
	if (context) {
		result.threadContext = readPositions(context, [
			"leftFileStart",
			"leftFileEnd",
			"rightFileStart",
			"rightFileEnd",
		]);
		if (result.path !== null) result.threadContext.filePath = result.path;
	}
	if (prContext) {
		const output = {};
		if (prContext.changeTrackingId != null)
			output.changeTrackingId = positiveInteger(prContext.changeTrackingId);
		if (prContext.iterationContext != null)
			output.iterationContext = readIterationContext(
				prContext.iterationContext,
			);
		if (prContext.trackingCriteria != null) {
			const criteria = record(prContext.trackingCriteria);
			output.trackingCriteria = {
				...readIterationContext(criteria),
				...readPositions(criteria, [
					"origLeftFileStart",
					"origLeftFileEnd",
					"origRightFileStart",
					"origRightFileEnd",
				]),
			};
			if (criteria.origFilePath != null)
				output.trackingCriteria.origFilePath = filePath(criteria.origFilePath);
		}
		result.pullRequestThreadContext = output;
	}
	const anchor = readThreadAnchor(
		result.threadContext,
		result.pullRequestThreadContext,
	);
	if (anchor) result.anchor = anchor;
	return result;
}

function readThreadActivityType(value) {
	if (!isRecord(value)) return null;
	const property = value.CodeReviewThreadType;
	if (typeof property === "string") return text(property);
	if (!isRecord(property) || typeof property.$value !== "string") return null;
	return text(property.$value);
}

/** @param {ThreadContext | undefined} context @param {PullRequestThreadContext | undefined} prContext @returns {ThreadAnchor | undefined} */
function readThreadAnchor(context, prContext) {
	if (!context?.filePath || !prContext?.changeTrackingId) return undefined;
	const tracked = prContext.trackingCriteria;
	const iteration =
		tracked &&
		(tracked.firstComparingIteration > 0 ||
			tracked.secondComparingIteration > 0)
			? tracked
			: prContext.iterationContext;
	if (
		!iteration ||
		iteration.firstComparingIteration <= 0 ||
		iteration.firstComparingIteration !== iteration.secondComparingIteration
	)
		return undefined;
	const sides = ["left", "right"].filter(
		(side) => context[`${side}FileStart`] || context[`${side}FileEnd`],
	);
	if (sides.length !== 1) return undefined;
	const side = sides[0];
	const start = context[`${side}FileStart`];
	const end = context[`${side}FileEnd`];
	if (
		!start ||
		!end ||
		end.line < start.line ||
		(end.line === start.line && end.offset < start.offset)
	)
		return undefined;
	return {
		path: context.filePath,
		side: side === "left" ? "original" : "modified",
		startLine: start.line,
		endLine: end.line,
		iterationId: iteration.secondComparingIteration,
		changeTrackingId: prContext.changeTrackingId,
	};
}

function readPositions(context, keys) {
	return Object.fromEntries(
		keys
			.filter((key) => context[key] != null)
			.map((key) => {
				const position = record(context[key]);
				return [
					key,
					{
						line: positiveInteger(position.line),
						offset: nonnegativeInteger(position.offset),
					},
				];
			}),
	);
}

function nonnegativeInteger(value) {
	const number = integer(value);
	if (number < 0) throw invalidContent();
	return number;
}

function readIterationContext(value) {
	const context = record(value);
	return {
		firstComparingIteration: nonnegativeInteger(
			context.firstComparingIteration,
		),
		secondComparingIteration: nonnegativeInteger(
			context.secondComparingIteration,
		),
	};
}

/** @param {unknown} value @returns {Comment} */
function readComment(value) {
	const comment = record(value);
	const types = ["unknown", "text", "codeChange", "system"];
	const rawType = comment.commentType;
	if (
		rawType !== undefined &&
		typeof rawType !== "string" &&
		!(typeof rawType === "number" && Number.isSafeInteger(rawType))
	)
		throw invalidContent();
	const commentType =
		rawType === undefined
			? undefined
			: typeof rawType === "number"
				? (types[rawType] ?? "unknown")
				: typeof rawType === "string" && types.includes(rawType)
					? rawType
					: "unknown";
	return {
		id: positiveInteger(comment.id),
		author: readPerson(comment.author),
		content: text(comment.content),
		publishedAt: date(comment.publishedDate),
		...(comment.parentCommentId === undefined
			? {}
			: { parentCommentId: nonnegativeInteger(comment.parentCommentId) }),
		...(commentType === undefined ? {} : { commentType }),
	};
}

/** @param {unknown} value @returns {Reviewer} */
function readReviewer(value) {
	const reviewer = record(value);
	const identity = readPerson(reviewer);
	if (!identity) throw invalidContent();
	return {
		...identity,
		vote: integer(reviewer.vote),
		isRequired: boolean(reviewer.isRequired, false),
	};
}

/** @param {unknown} value */
function readReviewerIdentities(value) {
	const response = record(value);
	if (!Array.isArray(response.value)) throw invalidContent();
	return response.value.flatMap((entry) => {
		const identity = record(entry);
		if (identity.isActive === false) return [];
		const id = nonemptyText(identity.id);
		if (!GUID_PATTERN.test(id)) throw invalidContent();
		const matches = [];
		if (
			typeof identity.providerDisplayName === "string" &&
			identity.providerDisplayName.trim()
		)
			matches.push(identity.providerDisplayName.trim());
		if (isRecord(identity.properties)) {
			for (const property of Object.values(identity.properties)) {
				if (!isRecord(property)) continue;
				const candidate = property.$value;
				if (typeof candidate === "string" && candidate.trim())
					matches.push(candidate.trim());
			}
		}
		return [{ id, matches }];
	});
}

/** @param {unknown} value */
function readReviewerTeamIds(value) {
	const response = record(value);
	if (!Array.isArray(response.value)) throw invalidContent();
	return response.value.map((entry) => nonemptyText(record(entry).id));
}

/** @param {unknown} value */
function readReviewerTeamMembers(value) {
	const response = record(value);
	if (!Array.isArray(response.value)) throw invalidContent();
	const identities = new Map();
	for (const entry of response.value) {
		const identity = record(record(entry).identity);
		if (identity.isActive === false) continue;
		const id = nonemptyText(identity.id);
		if (!GUID_PATTERN.test(id)) throw invalidContent();
		const matches = [identity.displayName, identity.uniqueName].flatMap(
			(candidate) => {
				if (typeof candidate !== "string" || !candidate.trim()) return [];
				const value = candidate.trim();
				const aliases = [value];
				if (value.includes("@"))
					aliases.push(value.slice(0, value.indexOf("@")));
				if (value.includes("\\"))
					aliases.push(value.slice(value.lastIndexOf("\\") + 1));
				return aliases;
			},
		);
		const existing = identities.get(id);
		if (existing) existing.matches.push(...matches);
		else identities.set(id, { id, matches });
	}
	return [...identities.values()];
}

/** @param {Array<{id: string, matches: string[]}>} identities */
function mergeReviewerIdentities(identities) {
	const merged = new Map();
	for (const identity of identities) {
		const existing = merged.get(identity.id);
		if (existing) existing.matches.push(...identity.matches);
		else
			merged.set(identity.id, {
				id: identity.id,
				matches: [...identity.matches],
			});
	}
	return [...merged.values()];
}

/** @param {unknown} error */
function reviewerSearchSourceUnavailable(error) {
	return (
		error instanceof AzureDevOpsHttpError &&
		[401, 403, 404].includes(error.status)
	);
}

/** @param {{id: string, matches: string[]}} identity @returns {ReviewerCandidate} */
function reviewerCandidate(identity) {
	const values = [
		...new Map(
			identity.matches
				.map((value) => value.trim())
				.filter(Boolean)
				.map((value) => [value.toLocaleLowerCase(), value]),
		).values(),
	];
	const name =
		values.find((value) => !value.includes("@") && !value.includes("\\")) ??
		values[0] ??
		identity.id;
	const detail =
		values.find(
			(value) =>
				value.localeCompare(name, undefined, { sensitivity: "base" }) !== 0 &&
				(value.includes("@") || value.includes("\\")),
		) ??
		values.find(
			(value) =>
				value.localeCompare(name, undefined, { sensitivity: "base" }) !== 0,
		);
	return {
		id: identity.id,
		name,
		...(detail ? { detail } : {}),
	};
}

/**
 * @param {Array<{id: string, matches: string[]}>} identities
 * @param {string} query
 * @param {number} limit
 */
function rankReviewerIdentities(identities, query, limit) {
	const normalizedQuery = query.toLocaleLowerCase();
	const score = (identity) => {
		let best = Number.POSITIVE_INFINITY;
		for (const candidate of identity.matches) {
			const normalized = candidate.toLocaleLowerCase();
			if (normalized === normalizedQuery) best = Math.min(best, 0);
			else if (normalized.startsWith(normalizedQuery)) best = Math.min(best, 1);
			else if (
				normalized
					.split(/[^a-z0-9]+/i)
					.some((part) => part.startsWith(normalizedQuery))
			)
				best = Math.min(best, 2);
			else if (normalized.includes(normalizedQuery)) best = Math.min(best, 3);
		}
		return best;
	};
	return identities
		.map((identity) => ({ identity, score: score(identity) }))
		.filter((entry) => Number.isFinite(entry.score))
		.toSorted(
			(a, b) =>
				a.score - b.score ||
				reviewerCandidate(a.identity).name.localeCompare(
					reviewerCandidate(b.identity).name,
				),
		)
		.slice(0, limit)
		.map((entry) => entry.identity);
}

/** @param {unknown} value */
function readReviewerSubjects(value) {
	const entries = Array.isArray(value) ? value : record(value).value;
	if (!Array.isArray(entries)) throw invalidContent();
	return entries.map((entry) => {
		const subject = record(entry);
		const matches = [
			subject.displayName,
			subject.mailAddress,
			subject.principalName,
		].flatMap((candidate) =>
			typeof candidate === "string" && candidate.trim()
				? [candidate.trim()]
				: [],
		);
		return {
			descriptor: nonemptyText(subject.descriptor),
			matches,
		};
	});
}

/** @param {unknown} value @param {string} artifactId @param {string} projectUrl @returns {Policy} */
function readPolicy(value, artifactId, projectUrl) {
	const policy = record(value);
	if (typeof policy.status !== "string" && !Number.isSafeInteger(policy.status))
		throw invalidContent();
	if (
		decodeURIComponent(text(policy.artifactId)).toLowerCase() !==
		artifactId.toLowerCase()
	)
		throw invalidContent("Policy response does not match the pull request.");
	const configuration = record(policy.configuration);
	const type = record(configuration.type);
	const settings = isRecord(configuration.settings)
		? configuration.settings
		: {};
	const context = policy.context == null ? {} : record(policy.context);
	const buildId =
		context.buildId == null ? undefined : nonnegativeInteger(context.buildId);
	const buildDefinitionId =
		typeof settings.buildDefinitionId === "number" &&
		Number.isSafeInteger(settings.buildDefinitionId) &&
		settings.buildDefinitionId > 0
			? settings.buildDefinitionId
			: undefined;
	const web =
		isRecord(policy._links) && isRecord(policy._links.web)
			? policy._links.web
			: undefined;
	const url =
		safeDetailUrl(web?.href ?? context.url, projectUrl) ??
		(buildId ? `${projectUrl}/_build/results?buildId=${buildId}` : undefined);
	const statusName =
		typeof settings.statusName === "string" && settings.statusName.trim()
			? settings.statusName.trim()
			: undefined;
	const statusGenre =
		typeof settings.statusGenre === "string" && settings.statusGenre.trim()
			? settings.statusGenre.trim()
			: undefined;
	const displayName =
		typeof settings.displayName === "string" && settings.displayName.trim()
			? settings.displayName.trim()
			: typeof context.buildDefinitionName === "string" &&
					context.buildDefinitionName.trim()
				? context.buildDefinitionName.trim()
				: undefined;
	let minimumApproverCount;
	if (settings.minimumApproverCount != null) {
		minimumApproverCount = integer(settings.minimumApproverCount);
		if (minimumApproverCount < 0) throw invalidContent();
	}
	return {
		id: nonemptyText(policy.evaluationId),
		name: nonemptyText(type.displayName),
		...(typeof type.id === "string" ? { typeId: type.id.toLowerCase() } : {}),
		status:
			typeof policy.status === "string" &&
			POLICY_STATUSES.includes(policy.status)
				? policy.status
				: "unknown",
		isBlocking: boolean(configuration.isBlocking),
		isEnabled: boolean(configuration.isEnabled),
		...(displayName ? { displayName } : {}),
		...(buildId ? { buildId } : {}),
		...(buildDefinitionId ? { buildDefinitionId } : {}),
		...(url ? { url } : {}),
		...(statusName ? { statusName } : {}),
		...(statusGenre ? { statusGenre } : {}),
		...(minimumApproverCount === undefined ? {} : { minimumApproverCount }),
	};
}

/** @param {unknown} value @param {string} projectUrl @returns {Status} */
function readStatus(value, projectUrl) {
	const status = record(value);
	// ADO omits the default enum value from some status records.
	const state = status.state === undefined ? "notSet" : status.state;
	if (typeof state !== "string" && !Number.isSafeInteger(state))
		throw invalidContent();
	const context = record(status.context);
	const url = safeDetailUrl(status.targetUrl, projectUrl);
	let buildId;
	if (url) {
		const value = new URL(url).searchParams.get("buildId");
		const parsed = Number(value);
		if (Number.isSafeInteger(parsed) && parsed > 0) buildId = parsed;
	}
	return {
		id: positiveInteger(status.id),
		name: nonemptyText(context.name),
		genre: context.genre == null ? "" : text(context.genre),
		state:
			typeof state === "string" && STATUS_STATES.includes(state)
				? state
				: "unknown",
		description: status.description == null ? null : text(status.description),
		iterationId:
			status.iterationId == null ? null : positiveInteger(status.iterationId),
		createdAt: date(status.creationDate),
		updatedAt: date(status.updatedDate),
		...(url ? { url } : {}),
		...(buildId ? { buildId } : {}),
	};
}

/** @param {unknown} value */
function changeType(value) {
	const parts = nonemptyText(value)
		.split(",")
		.map((part) => part.trim());
	return parts.every((part) => CHANGE_TYPES.includes(part))
		? parts.join(", ")
		: "unknown";
}

/** @param {unknown} value @returns {ChangedFile} */
function readChangedFile(value) {
	const change = record(value);
	const type = changeType(change.changeType);
	const path = record(change.item).path;
	return {
		id: positiveInteger(
			change.changeId === undefined ? change.changeTrackingId : change.changeId,
		),
		path: filePath(
			path == null && type.split(", ").includes("delete")
				? change.originalPath
				: path,
		),
		originalPath:
			change.originalPath == null ? null : filePath(change.originalPath),
		changeType: type,
		...(change.changeTrackingId === undefined
			? {}
			: { changeTrackingId: positiveInteger(change.changeTrackingId) }),
	};
}

/** @param {unknown[]} values */
function readLatestIteration(values) {
	const iterations = values.map((value) => {
		const iteration = record(value);
		return {
			id: positiveInteger(iteration.id),
			commonRefCommit: iteration.commonRefCommit,
			sourceRefCommit: iteration.sourceRefCommit,
		};
	});
	if (iterations.length === 0) return null;
	const latest = iterations.reduce((a, b) => (a.id > b.id ? a : b));
	return {
		id: latest.id,
		baseCommitId: commitIdOf(record(latest.commonRefCommit).commitId),
		sourceCommitId: commitIdOf(record(latest.sourceRefCommit).commitId),
	};
}

/** @param {unknown} value @returns {Commit} */
function readCommit(value) {
	const commit = record(value);
	const author = record(commit.author);
	return {
		id: commitIdOf(commit.commitId),
		message: text(commit.comment),
		author: text(author.name),
		date: date(author.date),
	};
}

/** @template T @param {T} value @returns {T} */
function freezeTree(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeTree(child);
		Object.freeze(value);
	}
	return value;
}

/** @param {unknown} value @param {string} name @returns {string} */
function requireString(value, name) {
	if (typeof value !== "string" || !value.trim()) {
		throw new TypeError(`Invalid ${name}`);
	}
	return value;
}

/** @param {unknown} value @param {string} field @returns {string | null} */
function optionalString(value, field) {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string")
		throw new TypeError(`Invalid PR response field: ${field}`);
	return value;
}

/** @param {unknown} value @returns {boolean} */
function requireBoolean(value) {
	if (typeof value !== "boolean")
		throw new TypeError("Expected a boolean PR option");
	return value;
}

/** @param {unknown} value @returns {number} */
function requireId(value) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new TypeError("Invalid pull request ID");
	}
	return value;
}

/** @param {string} value */
function segment(value) {
	requireString(value, "repository path segment");
	if (value === "." || value === ".." || /[/\\]/.test(value)) {
		throw new TypeError("Invalid repository path segment");
	}
	return encodeURIComponent(value);
}

/** @param {unknown} value */
function requireBranchRef(value) {
	const ref = requireString(value, "branch ref");
	if (!ref.startsWith("refs/heads/") || ref === "refs/heads/") {
		throw new TypeError("Expected a full refs/heads/ branch ref");
	}
	return ref;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} repositoryId
 * @param {string} webUrl
 * @param {number | undefined} expectedId
 * @returns {PullRequest}
 */
function readPullRequest(value, repositoryId, webUrl, expectedId) {
	if (
		!isRecord(value) ||
		!isRecord(value.repository) ||
		typeof value.repository.id !== "string" ||
		value.repository.id.toLowerCase() !== repositoryId.toLowerCase()
	) {
		throw new TypeError("PR response does not match the repository");
	}
	const id = requireId(value.pullRequestId);
	if (expectedId !== undefined && id !== expectedId) {
		throw new TypeError(
			"PR response does not match the requested pull request",
		);
	}
	const draft =
		value.isDraft === undefined ? false : requireBoolean(value.isDraft);
	/** @type {PullRequestState} */
	let state;
	switch (value.status) {
		case "active":
			state = draft ? "draft" : "open";
			break;
		case "completed":
			state = "merged";
			break;
		case "abandoned":
			state = "closed";
			break;
		default:
			throw new TypeError("Unknown Azure DevOps pull request status");
	}
	/** @type {string | null} */
	let sourceCommitId = null;
	if (value.lastMergeSourceCommit != null) {
		if (!isRecord(value.lastMergeSourceCommit)) {
			throw new TypeError("Invalid source commit in PR response");
		}
		sourceCommitId = requireString(
			value.lastMergeSourceCommit.commitId,
			"source commit ID",
		);
	}
	return {
		id,
		repositoryId,
		...(value.createdBy != null
			? { authorId: requireString(record(value.createdBy).id, "PR author ID") }
			: {}),
		title: requireString(value.title, "PR title"),
		description: optionalString(value.description, "description"),
		url: `${webUrl}/${id}`,
		state,
		sourceRef: requireBranchRef(value.sourceRefName),
		targetRef: requireBranchRef(value.targetRefName),
		sourceCommitId,
		mergeStatus: optionalString(value.mergeStatus, "mergeStatus"),
	};
}
