import { parseBoundPullRequestSearchContext } from "./pull-request-locator.mjs";
import { parseAzureDevOpsRepositoryUrl } from "./repository-url.mjs";
import {
	bearerRequestInit,
	getAccessToken,
	waitWithCancellation,
} from "./request.mjs";

const LIMIT = 200;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
export const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function hasControlCharacters(value) {
	return [...value].some(
		(character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);
}

export function repositoryOrigin(value) {
	if (typeof value !== "string" || value.length > 2048 || !URL.canParse(value))
		throw new Error("Choose a canonical Azure DevOps repository URL.");
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.hostname !== "dev.azure.com" ||
		url.port ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	)
		throw new Error("Choose a credential-free dev.azure.com repository URL.");
	const parts = url.pathname.split("/");
	if (parts.length !== 5 || parts[3] !== "_git")
		throw new Error("Choose a canonical Azure DevOps repository URL.");
	const [organization, project, repository] = [
		parts[1],
		parts[2],
		parts[4],
	].map((part) => {
		let decoded;
		try {
			decoded = decodeURIComponent(part);
		} catch {
			throw new Error("Invalid repository URL encoding.");
		}
		if (
			!decoded ||
			/[/\\]/.test(decoded) ||
			hasControlCharacters(decoded) ||
			[".", ".."].includes(decoded)
		)
			throw new Error("Invalid repository URL.");
		return decoded;
	});
	const canonical = `https://dev.azure.com/${[organization, project, "_git", repository].map(encodeURIComponent).join("/")}`;
	if (value !== canonical)
		throw new Error("Choose a canonical Azure DevOps repository URL.");
	const name = repository.replace(/\.git$/, "");
	if (!name || name.startsWith(".")) throw new Error("Invalid repository URL.");
	return { url: canonical, organization, project, repository: name };
}

function responseRepositoryOrigin(value) {
	if (typeof value !== "string" || value.length > 2048 || !URL.canParse(value))
		throw new Error("Azure DevOps returned an invalid repository URL.");
	const url = new URL(value);
	const parts = url.pathname.replace(/\/$/, "").split("/");
	const legacy = url.hostname.endsWith(".visualstudio.com");
	const offset =
		legacy && parts[1]?.toLowerCase() === "defaultcollection" ? 1 : 0;
	const expectedLength = legacy ? 4 + offset : 5;
	const parsed = parseAzureDevOpsRepositoryUrl(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		url.search ||
		url.hash ||
		parts.length !== expectedLength ||
		parts.at(-2) !== "_git" ||
		!parsed?.project ||
		!parsed.repository
	)
		throw new Error("Azure DevOps returned an invalid repository URL.");
	return repositoryOrigin(
		`https://dev.azure.com/${[parsed.organization, parsed.project, "_git", parsed.repository].map(encodeURIComponent).join("/")}`,
	);
}

export function branchName(value) {
	if (typeof value !== "string" || !value.startsWith("refs/heads/"))
		throw new Error("Azure DevOps returned an invalid branch.");
	const name = value.slice(11);
	if (
		!name ||
		name.length > 512 ||
		name.startsWith("-") ||
		/[ ~^:?*\\[\]]/.test(name) ||
		hasControlCharacters(name) ||
		name.includes("..") ||
		name.includes("@{") ||
		name === "@" ||
		name
			.split("/")
			.some(
				(part) =>
					!part ||
					part.startsWith(".") ||
					part.endsWith(".") ||
					part.endsWith(".lock"),
			)
	)
		throw new Error("Azure DevOps returned an invalid branch.");
	return name;
}

function text(value, limit = 512) {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > limit ||
		hasControlCharacters(value)
	)
		throw new Error("Azure DevOps returned invalid data.");
	return value;
}

// ADO accepts line breaks and tabs in titles; show them on one line.
function singleLine(value) {
	return value.replace(/\p{Cc}+/gu, " ").trim();
}

function record(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Azure DevOps returned invalid data.");
	return value;
}

function date(value) {
	if (
		typeof value !== "string" ||
		value.length > 64 ||
		hasControlCharacters(value) ||
		!Number.isFinite(Date.parse(value))
	)
		throw new Error("Azure DevOps returned an invalid date.");
	return value;
}

function unsupportedFork(value) {
	const item = record(value);
	if (item.forkSource !== undefined && item.forkSource !== null) {
		record(item.forkSource);
		return true;
	}
	if (item.sourceRepository !== undefined && item.sourceRepository !== null) {
		const source = record(item.sourceRepository);
		const target = record(item.repository);
		if (
			typeof source.id !== "string" ||
			!guid.test(source.id) ||
			typeof target.id !== "string" ||
			!guid.test(target.id)
		)
			throw new Error("Azure DevOps returned an invalid repository identity.");
		return source.id.toLowerCase() !== target.id.toLowerCase();
	}
	return false;
}

/** All remote calls use the app's selected account port, never ambient credentials. */
export function createCreateFromApi(authentication, originUrl) {
	const origin = repositoryOrigin(originUrl);
	const base = `https://dev.azure.com/${encodeURIComponent(origin.organization)}/${encodeURIComponent(origin.project)}/_apis/git/repositories/${encodeURIComponent(origin.repository)}`;

	async function json(accountId, path, query, signal) {
		signal.throwIfAborted();
		let response;
		try {
			const accessToken = await getAccessToken(
				authentication,
				accountId,
				signal,
			);
			const url = `${base}${path}?${new URLSearchParams({ ...query, "api-version": "7.1" })}`;
			response = await waitWithCancellation(
				fetch(
					url,
					bearerRequestInit(
						url,
						{
							method: "GET",
							headers: { Accept: "application/json" },
							signal,
						},
						accessToken,
					),
				),
				signal,
			);
		} catch (failure) {
			signal.throwIfAborted();
			throw Object.assign(
				new Error("Could not reach Azure DevOps. Retry or check your account."),
				failure?.code === "auth_required" ? { code: "auth_required" } : {},
			);
		}
		if (!response.ok || response.redirected) {
			void response.body?.cancel().catch(() => {});
			throw Object.assign(
				new Error(
					"Could not read this Azure DevOps repository. Check account access and retry.",
				),
				response.status === 401
					? { code: "unauthorized" }
					: response.status === 403
						? { code: "forbidden" }
						: {},
			);
		}
		const reader = response.body?.getReader();
		if (!reader)
			throw new Error("Azure DevOps returned an empty response. Retry.");
		const decoder = new TextDecoder("utf-8", { fatal: true });
		let bytes = 0;
		let body = "";
		try {
			if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024)
				throw new Error("Response limit");
			while (true) {
				const chunk = await waitWithCancellation(reader.read(), signal);
				signal.throwIfAborted();
				if (chunk.done) break;
				bytes += chunk.value.byteLength;
				if (bytes > 2 * 1024 * 1024) throw new Error("Response limit");
				body += decoder.decode(chunk.value, { stream: true });
			}
			return {
				value: record(JSON.parse(body + decoder.decode())),
				headers: response.headers,
			};
		} catch (failure) {
			signal.throwIfAborted();
			throw new Error(
				failure instanceof Error && failure.message === "Response limit"
					? "Too many results to list. Search to narrow them."
					: "Azure DevOps returned invalid or oversized data. Retry the list.",
			);
		} finally {
			// Cancellation and cleanup cannot keep a dialog pending.
			void reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	}

	function branch(value) {
		const item = record(value);
		const rawName = text(item.name);
		// GitBranchStats uses short names; refs responses use qualified names.
		const name = branchName(
			rawName.startsWith("refs/heads/") ? rawName : `refs/heads/${rawName}`,
		);
		if (!/^[a-f0-9]{40}$/i.test(item.commit?.commitId))
			throw new Error("Azure DevOps returned an invalid branch commit.");
		return {
			id: `refs/heads/${name}`,
			name,
			updatedAt: date(item.commit.committer?.date),
		};
	}

	function ref(value) {
		const item = record(value);
		const name = branchName(item.name);
		if (
			typeof item.objectId !== "string" ||
			!/^[a-f0-9]{40}$/i.test(item.objectId)
		)
			throw new Error("Azure DevOps returned an invalid branch commit.");
		return { id: `refs/heads/${name}`, name };
	}

	function matchesRepositoryUrl(value, boundRepository) {
		const candidate = responseRepositoryOrigin(value);
		return (
			candidate.organization.toLowerCase() ===
				origin.organization.toLowerCase() &&
			[boundRepository.id, boundRepository.name].some(
				(value) =>
					typeof value === "string" &&
					value.toLowerCase() === candidate.repository.toLowerCase(),
			) &&
			[boundRepository.project?.id, boundRepository.project?.name].some(
				(value) =>
					typeof value === "string" &&
					value.toLowerCase() === candidate.project.toLowerCase(),
			)
		);
	}

	function pullRequestSearchQuery(value, boundRepository) {
		const locator = parseBoundPullRequestSearchContext({ url: value.trim() });
		const projectMatches =
			locator?.project === undefined ||
			[
				origin.project,
				boundRepository.project?.id,
				boundRepository.project?.name,
			]
				.filter((candidate) => typeof candidate === "string")
				.some(
					(candidate) =>
						candidate.toLowerCase() === locator.project.toLowerCase(),
				);
		if (
			locator &&
			locator.organization.toLowerCase() ===
				origin.organization.toLowerCase() &&
			projectMatches &&
			[origin.repository, boundRepository.id, boundRepository.name]
				.filter((candidate) => typeof candidate === "string")
				.some(
					(candidate) =>
						candidate.toLowerCase() === locator.repository.toLowerCase(),
				)
		)
			return locator.pullRequestId;
		return null;
	}

	async function repository(accountId, signal) {
		const item = (await json(accountId, "", {}, signal)).value;
		if (
			!guid.test(item.id) ||
			typeof item.name !== "string" ||
			![item.id, item.name].some(
				(value) => value.toLowerCase() === origin.repository.toLowerCase(),
			) ||
			![item.project?.id, item.project?.name].some(
				(value) =>
					typeof value === "string" &&
					value.toLowerCase() === origin.project.toLowerCase(),
			) ||
			(item.webUrl !== undefined && !matchesRepositoryUrl(item.webUrl, item))
		)
			throw new Error("Azure DevOps returned a different repository.");
		return item;
	}

	function pullRequest(value, boundRepository) {
		if (Buffer.byteLength(origin.url, "utf8") > 512)
			throw new Error(
				"This repository URL is too long for a native pull request workspace. Choose a branch instead.",
			);
		if (origin.url.endsWith(".git"))
			throw new Error(
				"Pull requests from a .git repository URL are not supported. Choose a branch instead.",
			);
		const item = record(value);
		if (
			!Number.isSafeInteger(item.pullRequestId) ||
			item.pullRequestId <= 0 ||
			item.status !== "active"
		)
			throw new Error("This pull request is no longer open. Reload the list.");
		const repository = record(item.repository);
		if (
			!guid.test(repository.id) ||
			repository.id.toLowerCase() !== boundRepository.id.toLowerCase() ||
			(repository.webUrl !== undefined &&
				!matchesRepositoryUrl(repository.webUrl, boundRepository))
		)
			throw new Error("This pull request belongs to a different repository.");
		// Fork branches cannot be checked out from this project's origin remote.
		if (unsupportedFork(item))
			throw new Error(
				"Fork pull requests are not supported. Choose a same-repository pull request.",
			);
		const headRef = branchName(item.sourceRefName);
		const baseRef = branchName(item.targetRefName);
		const suffix = `/pullrequest/${item.pullRequestId}`;
		// PR lists can omit web links and return shallow repository references.
		if (item._links?.web?.href !== undefined) {
			const href = text(item._links.web.href, 2048);
			if (!URL.canParse(href))
				throw new Error("Azure DevOps returned an invalid pull request URL.");
			const linkedUrl = new URL(href);
			if (!linkedUrl.pathname.endsWith(suffix))
				throw new Error("Azure DevOps returned an invalid pull request URL.");
			linkedUrl.pathname = linkedUrl.pathname.slice(0, -suffix.length);
			if (!matchesRepositoryUrl(linkedUrl.href, boundRepository))
				throw new Error("Azure DevOps returned an invalid pull request URL.");
		}
		const url = `${origin.url}${suffix}`;
		const title = text(
			typeof item.title === "string" ? singleLine(item.title) : item.title,
			2048,
		);
		if (item.isDraft !== undefined && typeof item.isDraft !== "boolean")
			throw new Error("Azure DevOps returned invalid pull request data.");
		const sourceCommitId =
			item.lastMergeSourceCommit === undefined ||
			item.lastMergeSourceCommit === null
				? null
				: record(item.lastMergeSourceCommit).commitId;
		if (
			sourceCommitId !== null &&
			(typeof sourceCommitId !== "string" ||
				!/^[a-f0-9]{40}$/i.test(sourceCommitId))
		)
			throw new Error("Azure DevOps returned an invalid pull request head.");
		return {
			id: String(item.pullRequestId),
			name: title,
			updatedAt: date(item.creationDate),
			draft: item.isDraft === true,
			branchName: headRef,
			baseBranch: baseRef,
			sourceCommitId,
			sourcePullRequest: {
				repository: origin.url,
				number: item.pullRequestId,
				title,
				url,
				baseRef,
				headRef,
			},
		};
	}

	return {
		async resolve(number, signal) {
			if (!Number.isSafeInteger(number) || number <= 0)
				throw new Error("Invalid pull request number.");
			const bound = await repository(undefined, signal);
			const current = pullRequest(
				(await json(undefined, `/pullrequests/${number}`, {}, signal)).value,
				bound,
			);
			const refs = (
				await json(
					undefined,
					"/refs",
					{
						filter: `heads/${current.branchName}`,
						$top: "100",
					},
					signal,
				)
			).value.value;
			const head =
				Array.isArray(refs) && refs.length <= 100
					? refs.find((ref) => ref?.name === `refs/heads/${current.branchName}`)
					: null;
			if (
				!head ||
				!/^[a-f0-9]{40}$/i.test(head.objectId) ||
				(current.sourceCommitId !== null &&
					head.objectId.toLowerCase() !== current.sourceCommitId.toLowerCase())
			)
				throw new Error(
					"The pull request source changed. Reload the selection.",
				);
			return {
				...current.sourcePullRequest,
				repositoryId: bound.id,
				headCommit: head.objectId.toLowerCase(),
				draft: current.draft,
			};
		},
		async accounts(signal) {
			let values;
			try {
				values = await waitWithCancellation(
					authentication.listAccounts({ resource: "azure-devops" }),
					signal,
				);
			} catch {
				signal.throwIfAborted();
				throw new Error(
					"Could not load Microsoft accounts. Open Account settings, then retry.",
				);
			}
			if (!Array.isArray(values) || values.length > 100)
				throw new Error("Invalid Microsoft account list.");
			const seen = new Set();
			return values.map((value) => {
				const item = record(value);
				const id = text(item.id);
				if (seen.has(id)) throw new Error("Invalid Microsoft account list.");
				seen.add(id);
				return {
					id,
					name: text(item.name),
					secondaryLabel:
						typeof item.secondaryLabel === "string"
							? item.secondaryLabel
							: undefined,
				};
			});
		},
		async list(accountId, mode, query, signal) {
			const boundRepository = await repository(accountId, signal);
			const search = query.trim();
			const pullRequestId =
				mode === "pull-request"
					? pullRequestSearchQuery(query, boundRepository)
					: null;
			if (pullRequestId !== null) {
				const current = pullRequest(
					(await json(accountId, `/pullrequests/${pullRequestId}`, {}, signal))
						.value,
					boundRepository,
				);
				if (current.id !== String(pullRequestId))
					throw new Error("Azure DevOps returned a different pull request.");
				return {
					repositoryName: text(boundRepository.name),
					options: [current],
					truncated: false,
				};
			}
			const values = [];
			let continuation;
			let truncated = false;
			for (let page = 0; page < MAX_PAGES; page++) {
				const result = await json(
					accountId,
					mode === "branch" ? "/refs" : "/pullrequests",
					mode === "branch"
						? {
								...(search
									? {
											filter: "heads/",
											filterContains: search,
											$top: String(PAGE_SIZE),
										}
									: { includeMyBranches: "true" }),
								...(continuation ? { continuationToken: continuation } : {}),
							}
						: {
								"searchCriteria.status": "active",
								$top: String(PAGE_SIZE),
								$skip: String(page * PAGE_SIZE),
							},
					signal,
				);
				if (
					!Array.isArray(result.value.value) ||
					result.value.value.length >
						(mode === "pull-request" ? PAGE_SIZE : search ? 1000 : Infinity)
				)
					throw new Error("Azure DevOps returned an invalid list.");
				for (const raw of result.value.value) {
					// Unsupported forks are deliberately not offered.
					if (mode === "pull-request" && unsupportedFork(raw)) continue;
					values.push(
						mode === "branch" ? ref(raw) : pullRequest(raw, boundRepository),
					);
				}
				continuation = result.headers.get("x-ms-continuationtoken");
				if (
					continuation &&
					(continuation.length > 1024 || hasControlCharacters(continuation))
				)
					throw new Error("Azure DevOps returned invalid pagination.");
				const more =
					mode === "branch"
						? !!continuation
						: result.value.value.length === PAGE_SIZE;
				if (!more) break;
				if (page === MAX_PAGES - 1) truncated = true;
			}
			const seen = new Set();
			for (const value of values) {
				if (seen.has(value.id))
					throw new Error("Azure DevOps returned duplicate entries.");
				seen.add(value.id);
			}
			const matches =
				mode === "branch"
					? values.sort(
							(a, b) =>
								Number(b.id === boundRepository.defaultBranch) -
									Number(a.id === boundRepository.defaultBranch) ||
								a.name.localeCompare(b.name),
						)
					: values
							.filter((value) =>
								`${value.name} ${value.id}`
									.toLowerCase()
									.includes(singleLine(query).toLowerCase()),
							)
							.sort(
								(a, b) =>
									Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
									a.id.localeCompare(b.id),
							);
			return {
				repositoryName: text(boundRepository.name),
				options: matches.slice(0, LIMIT),
				truncated: truncated || matches.length > LIMIT,
			};
		},
		async confirm(accountId, mode, selection, signal) {
			if (mode === "branch") {
				const result = await json(
					accountId,
					"/stats/branches",
					{ name: selection.name },
					signal,
				);
				const current = branch(result.value);
				if (current.id !== selection.id)
					throw new Error("The selected branch changed. Reload the list.");
				return { branchName: current.name };
			}
			const boundRepository = await repository(accountId, signal);
			const current = pullRequest(
				(
					await json(
						accountId,
						`/pullrequests/${encodeURIComponent(selection.id)}`,
						{},
						signal,
					)
				).value,
				boundRepository,
			);
			if (
				current.id !== selection.id ||
				current.branchName !== selection.branchName ||
				current.baseBranch !== selection.baseBranch ||
				current.sourceCommitId !== selection.sourceCommitId
			)
				throw new Error(
					"The pull request branches changed. Reload and select it again.",
				);
			// Check that its current source ref is available on this origin.
			const refs = await json(
				accountId,
				"/refs",
				{ filter: `heads/${current.branchName}`, $top: "100" },
				signal,
			);
			if (
				!Array.isArray(refs.value.value) ||
				refs.value.value.length > 100 ||
				!refs.value.value.every((ref) => {
					const item = record(ref);
					branchName(item.name);
					return (
						typeof item.objectId === "string" &&
						/^[a-f0-9]{40}$/i.test(item.objectId)
					);
				}) ||
				!refs.value.value.some(
					(ref) =>
						ref?.name === `refs/heads/${current.branchName}` &&
						/^[a-f0-9]{40}$/i.test(ref.objectId) &&
						(current.sourceCommitId === null ||
							ref.objectId.toLowerCase() ===
								current.sourceCommitId.toLowerCase()),
				)
			)
				throw new Error(
					"The pull request source branch is unavailable. Reload the list.",
				);
			return {
				pullRequest: { number: current.sourcePullRequest.number, accountId },
			};
		},
	};
}
