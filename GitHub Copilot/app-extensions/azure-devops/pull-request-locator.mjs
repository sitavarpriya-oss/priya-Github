import { AZURE_DEVOPS_HOST } from "./azure-devops-host.mjs";
import { AzureDevOpsHttpError } from "./pull-request-http-error.mjs";
import { parseAzureDevOpsRepositoryUrl } from "./repository-url.mjs";
import {
	bearerRequestInit,
	getAccessToken,
	MAX_RESPONSE_BYTES,
	readLimitedJson,
} from "./request.mjs";

function parsePullRequestUrl(context) {
	if (
		!context ||
		typeof context.url !== "string" ||
		Object.keys(context).length !== 1 ||
		!URL.canParse(context.url)
	)
		return null;
	const url = new URL(context.url);
	if (url.protocol !== "https:" || url.username || url.password || url.port)
		return null;
	const match = /^(.*)\/pullrequest\/([1-9][0-9]*)\/?$/.exec(url.pathname);
	if (!match) return null;
	const repositoryUrl = new URL(url);
	repositoryUrl.pathname = match[1];
	repositoryUrl.search = "";
	repositoryUrl.hash = "";
	const host = repositoryUrl.hostname.toLowerCase();
	const exactRepositoryPath =
		host === AZURE_DEVOPS_HOST
			? /^\/[^/]+\/(?:[^/]+\/)?_git\/[^/]+\/?$/i.test(repositoryUrl.pathname)
			: host.endsWith(".visualstudio.com") &&
				/^\/(?:defaultcollection\/)?(?:[^/]+\/)?_git\/[^/]+\/?$/i.test(
					repositoryUrl.pathname,
				);
	if (!exactRepositoryPath) return null;
	const parsed = parseAzureDevOpsRepositoryUrl(repositoryUrl.href);
	const pullRequestId = Number(match[2]);
	if (
		!parsed ||
		typeof parsed.repository !== "string" ||
		!Number.isSafeInteger(pullRequestId)
	)
		return null;
	return {
		organization: parsed.organization,
		...(parsed.project ? { project: parsed.project } : {}),
		repository: parsed.repository,
		pullRequestId,
	};
}

/**
 * Context is only a locator. Recognition never reads or grants credentials.
 * @param {{ url?: unknown } | null | undefined} context
 * @returns {{ organization: string, project: string, repository: string, pullRequestId: number } | null}
 */
export function parsePullRequestViewContext(context) {
	const parsed = parsePullRequestUrl(context);
	if (!parsed) return null;
	if (typeof parsed.project === "string")
		return { ...parsed, project: parsed.project };
	if (typeof context?.url !== "string") return null;
	const url = new URL(context.url);
	return url.hostname.toLowerCase() === AZURE_DEVOPS_HOST
		? { ...parsed, project: parsed.repository }
		: null;
}

/**
 * @param {{ url?: unknown } | null | undefined} context
 * @returns {{ organization: string, project?: string, repository: string, pullRequestId: number } | null}
 */
export function parseBoundPullRequestSearchContext(context) {
	return parsePullRequestUrl(context);
}

export function supportsPullRequestView(context) {
	return parsePullRequestViewContext(context) !== null;
}

/**
 * @param {{ organization: string, project: string, repository: string }} locator
 * @param {{ authentication: import("./request.mjs").Authentication, accountId?: string, fetch?: typeof globalThis.fetch, signal?: AbortSignal }} options
 */
export async function resolveRepository(
	{ organization, project, repository },
	{
		authentication,
		accountId,
		fetch: requestFetch = globalThis.fetch,
		signal: cancellation,
	},
) {
	const deadline = AbortSignal.timeout(30_000);
	const signal = cancellation
		? AbortSignal.any([cancellation, deadline])
		: deadline;
	const endpoint = `https://${AZURE_DEVOPS_HOST}/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}?api-version=7.1`;
	const accessToken = await getAccessToken(authentication, accountId, signal);
	const response = await requestFetch(
		endpoint,
		bearerRequestInit(
			endpoint,
			{ method: "GET", headers: { Accept: "application/json" }, signal },
			accessToken,
		),
	);
	if (!response.ok || response.redirected) {
		await response.body?.cancel();
		throw new Error(
			`Azure DevOps repository lookup failed (HTTP ${response.status}).`,
			{ cause: new AzureDevOpsHttpError(response.status) },
		);
	}
	const data = /** @type {any} */ (
		await readLimitedJson(response, MAX_RESPONSE_BYTES, signal, {
			tooLarge: () =>
				Object.assign(
					new Error("Azure DevOps repository lookup response is too large."),
					{ code: "response_too_large" },
				),
			invalid: () =>
				Object.assign(
					new Error("Azure DevOps returned an invalid repository."),
					{
						code: "invalid-response",
					},
				),
		})
	);
	const guid =
		/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
	if (
		typeof data?.id !== "string" ||
		!guid.test(data.id) ||
		(guid.test(repository)
			? data.id.toLowerCase() !== repository.toLowerCase()
			: data.name !== repository)
	)
		throw Object.assign(
			new Error("Azure DevOps returned an invalid repository."),
			{
				code: "invalid-response",
			},
		);
	return data;
}
