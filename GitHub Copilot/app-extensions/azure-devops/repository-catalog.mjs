// @ts-check

import { safeActionError } from "./action-telemetry.mjs";
import {
	choiceDisplayDetails,
	repositoryResultLimit,
} from "./repository-picker-state.mjs";
import {
	bearerRequestInit,
	getAccessToken,
	waitWithCancellation,
} from "./request.mjs";

/**
 * @typedef {import("./repository-picker-state.mjs").Choice} Choice
 * @typedef {ReturnType<typeof import("./action-telemetry.mjs").createActionTelemetry>} Telemetry
 * @typedef {{ accountId: string, authentication: import("./pull-requests.mjs").Authentication, fetch?: typeof globalThis.fetch, telemetry?: Telemetry }} RepositoryDiscovery
 * @typedef {{ errorStage?: string, errorCode?: string, responseBytes?: number, choiceCount?: number, pageCount?: number }} Diagnostics
 * @typedef {import("@github/copilot-app").AppAuthentication} NativeAuthentication
 * @typedef {"authentication" | "account_required" | "auth_required" | "credential_unavailable" | "account_unavailable" | "denied" | "invalid_request" | "busy" | "timeout" | "response_too_large" | "http" | "network" | "invalid-response" | "invalid-selection" | "limit"} CatalogErrorCode
 */

const API_VERSION = "7.1";
const LIST_TIMEOUT_MS = 30_000;
const ACCOUNT_TIMEOUT_MS = 25_000;
const URL_ACCOUNT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CHOICES = 1000;
const MAX_PROJECT_PAGES = 100;
const PROJECT_PAGE_SIZE = 100;
const MAX_CONTINUATION_LENGTH = 1024;
const GUID_PATTERN =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function catalogError(error) {
	const safe = safeActionError(error);
	if (error?.name === "TimeoutError") safe.errorCode = "local_timeout";
	return safe;
}

function instrumentCatalog(catalog, telemetry) {
	if (!telemetry) return;
	for (const method of Object.keys(catalog)) {
		const read = catalog[method];
		catalog[method] = async (input = {}) => {
			const stage = {
				listAccounts: "account",
				listOrganizations: "organization",
				listProjects: "project",
				listRepositories: "repository",
				listOrganizationRepositories: "repository",
				findRepository: "repository",
				resolveRepositoryUrl: "repository",
			}[method];
			const action = telemetry.start(
				["resolveRepositoryUrl", "findRepository"].includes(method)
					? "resolve"
					: "load",
				stage,
				input.telemetryEntryPoint ?? "automatic",
			);
			const diagnostics = { errorStage: stage, errorCode: undefined };
			try {
				const result = await waitWithCancellation(
					read({ ...input, diagnostics }),
					input.signal,
				);
				const {
					errorStage: _stage,
					errorCode: _code,
					...metrics
				} = diagnostics;
				action.finish("success", {
					...metrics,
					...(Array.isArray(result) ? { choiceCount: result.length } : {}),
				});
				return result;
			} catch (error) {
				const safe = catalogError(error);
				if (
					diagnostics.errorCode &&
					safe.errorCode !== "aborted" &&
					safe.errorCode !== "local_timeout"
				)
					safe.errorCode = diagnostics.errorCode;
				action.finish(safe.errorCode === "aborted" ? "cancelled" : "failure", {
					...diagnostics,
					...safe,
				});
				throw error;
			}
		};
	}
}

export class AzureDevOpsCatalogError extends Error {
	/** @param {CatalogErrorCode} code @param {number} [status] */
	constructor(code, status) {
		const messages = {
			authentication:
				"Azure DevOps repository discovery needs an authorized account.",
			account_required:
				"Add a Microsoft account to browse Azure DevOps repositories.",
			auth_required: "Microsoft authorization needs updating.",
			credential_unavailable:
				"The Microsoft account credential is unavailable.",
			account_unavailable: "The selected Microsoft account is unavailable.",
			denied: "Repository discovery is not authorized by the app.",
			invalid_request:
				"The app could not accept the repository discovery request.",
			busy: "Repository discovery is busy.",
			timeout: "Repository discovery timed out.",
			response_too_large: "The repository discovery response is too large.",
			http: `Azure DevOps repository discovery failed (HTTP ${status}).`,
			network: "Could not reach Azure DevOps repository discovery.",
			"invalid-response":
				"Azure DevOps returned an invalid repository catalog.",
			"invalid-selection":
				"Choose a result from the current Azure DevOps catalog.",
			limit:
				"The Azure DevOps repository catalog exceeds this picker's limits.",
		};
		super(messages[code]);
		this.name = "AzureDevOpsCatalogError";
		this.code = code;
		if (status !== undefined) this.status = status;
	}
}

/**
 * Keep only native failure codes, never provider or credential diagnostics.
 * @param {unknown} error
 * @param {"network" | "authentication"} fallback
 */
function nativeCatalogError(error, fallback = "network") {
	const nativeCode =
		error && typeof error === "object" && "code" in error
			? error.code
			: undefined;
	switch (nativeCode) {
		case "auth_required":
		case "credential_unavailable":
		case "account_unavailable":
		case "denied":
		case "invalid_request":
		case "busy":
		case "timeout":
		case "response_too_large":
			return new AzureDevOpsCatalogError(nativeCode);
		default:
			return new AzureDevOpsCatalogError(fallback);
	}
}

/**
 * @param {NativeAuthentication} authentication
 * @param {typeof globalThis.fetch} [requestFetch]
 * @param {Telemetry} [telemetry]
 */
export function createNativeRepositoryCatalog(
	authentication,
	requestFetch = globalThis.fetch,
	telemetry,
) {
	/** @typedef {{ account: Choice, catalog: ReturnType<typeof createRepositoryCatalog> }} Route */
	/** @type {Map<string, Route>} */
	let organizations = new Map();
	/** @type {Map<string, Route>} */
	let organizationNames = new Map();
	let organizationReload = 0;
	let listed = false;

	const accountPort = {
		/** @param {{signal: AbortSignal, telemetryEntryPoint?: string, diagnostics?: Diagnostics}} input */
		async listAccounts({ signal, diagnostics = {} }) {
			signal.throwIfAborted();
			const result = await waitWithCancellation(
				authentication.listAccounts({ resource: "azure-devops" }),
				signal,
			).catch((error) => {
				signal.throwIfAborted();
				throw nativeCatalogError(error);
			});
			signal.throwIfAborted();
			if (Array.isArray(result)) diagnostics.choiceCount = result.length;
			if (Array.isArray(result) && result.length > MAX_CHOICES)
				diagnostics.errorCode = "choice_limit";
			if (!Array.isArray(result) || result.length > MAX_CHOICES)
				throw new AzureDevOpsCatalogError("invalid-response");
			const ids = new Set();
			return result.map((value) => {
				const item = record(value);
				const id = displayName(item.id);
				if (ids.has(id)) throw new AzureDevOpsCatalogError("invalid-response");
				ids.add(id);
				return {
					id,
					name: displayName(item.name),
					...(typeof item.secondaryLabel === "string"
						? { secondaryLabel: item.secondaryLabel }
						: {}),
				};
			});
		},
	};
	instrumentCatalog(accountPort, telemetry);

	/** @param {{signal: AbortSignal, telemetryEntryPoint?: string}} input @returns {Promise<Route[]>} */
	async function accountRoutes(input) {
		const accounts = await accountPort.listAccounts({
			signal: input.signal,
			telemetryEntryPoint: input.telemetryEntryPoint,
		});
		if (!accounts.length) throw new AzureDevOpsCatalogError("account_required");
		return accounts.map((account) => ({
			account,
			catalog: createRepositoryCatalog({
				accountId: account.id,
				authentication,
				fetch: requestFetch,
				telemetry,
			}),
		}));
	}

	/** @param {Route} route @param {Promise<any>} pending */
	function read(route, pending) {
		return pending.catch((error) => {
			throw Object.assign(error, { account: route.account });
		});
	}

	/** @param {Choice} organization */
	function owner(organization) {
		const route = organizations.get(organization?.id);
		if (!route) throw new AzureDevOpsCatalogError("invalid-selection");
		return route;
	}

	/** @template T @param {Route} route @param {T} value */
	function withAccount(route, value) {
		return {
			...value,
			account: { id: route.account.id, name: route.account.name },
		};
	}

	const catalog = {
		/** @param {{signal: AbortSignal, telemetryEntryPoint?: string}} input */
		async listOrganizations(input, accountTimeout = ACCOUNT_TIMEOUT_MS) {
			const reload = ++organizationReload;
			const routes = await accountRoutes(input);
			const settled = await Promise.allSettled(
				routes.map((route) =>
					read(
						route,
						route.catalog.listOrganizations({
							...input,
							signal: AbortSignal.any([
								input.signal,
								AbortSignal.timeout(accountTimeout),
							]),
						}),
					),
				),
			);
			input.signal.throwIfAborted();
			const owners = new Map();
			const names = new Map();
			/** @type {Choice[]} */
			const choices = [];
			for (const [index, outcome] of settled.entries()) {
				if (outcome.status === "rejected") continue;
				for (const organization of outcome.value) {
					if (owners.has(organization.id)) continue;
					owners.set(organization.id, routes[index]);
					names.set(organization.name.toLowerCase(), routes[index]);
					choices.push(organization);
				}
			}
			const failures = settled.flatMap((outcome) =>
				outcome.status === "rejected" ? [outcome.reason] : [],
			);
			if (!choices.length && failures.length)
				throw (
					failures.find((error) => error?.code === "auth_required") ??
					failures[0]
				);
			if (reload === organizationReload) {
				const timedOut = failures.some(
					(error) => error?.name === "TimeoutError",
				);
				if (timedOut) {
					for (const [id, route] of organizations)
						if (!owners.has(id)) owners.set(id, route);
					for (const [name, route] of organizationNames)
						if (!names.has(name)) names.set(name, route);
				}
				organizations = owners;
				organizationNames = names;
				listed = !timedOut;
			}
			return choices;
		},
		/** @param {{organization: Choice, bounded?: boolean, signal: AbortSignal}} input */
		listProjects(input) {
			const route = owner(input.organization);
			return read(route, route.catalog.listProjects(input));
		},
		/** @param {{organization: Choice, project: Choice, signal: AbortSignal}} input */
		async listRepositories(input) {
			const route = owner(input.organization);
			const choices = await read(route, route.catalog.listRepositories(input));
			return choices.map((choice) => withAccount(route, choice));
		},
		/** @param {{organization: Choice, project?: Choice, signal: AbortSignal}} input */
		async listOrganizationRepositories(input) {
			const route = owner(input.organization);
			const results = await read(
				route,
				route.catalog.listOrganizationRepositories(input),
			);
			return Object.assign(
				results.map((result) => withAccount(route, result)),
				{ discoveryLimited: results.discoveryLimited },
			);
		},
		/** @param {{organization: Choice, projectName: string, repository: string, signal: AbortSignal}} input */
		async findRepository(input) {
			const route = owner(input.organization);
			const found = await read(route, route.catalog.findRepository(input));
			return found && withAccount(route, found);
		},
		/** @param {{organization: string, project?: string, repository: string, signal: AbortSignal, telemetryEntryPoint?: string}} input */
		async resolveRepositoryUrl(input) {
			if (!listed)
				await catalog
					.listOrganizations(input, URL_ACCOUNT_TIMEOUT_MS)
					.catch(() => {});
			input.signal.throwIfAborted();
			const route =
				organizationNames.get(String(input.organization).toLowerCase()) ??
				(await accountRoutes(input))[0];
			return withAccount(
				route,
				await read(route, route.catalog.resolveRepositoryUrl(input)),
			);
		},
	};
	return catalog;
}

/**
 * One picker's routing context for an explicitly selected native account.
 * No repository, ambient credentials, token cache, or guest account input is used.
 * @param {RepositoryDiscovery} options
 */
export function createRepositoryCatalog({
	accountId,
	authentication,
	fetch: requestFetch = globalThis.fetch,
	telemetry,
}) {
	const tokenAuthentication =
		typeof authentication?.getAccessToken === "function"
			? { getAccessToken: authentication.getAccessToken.bind(authentication) }
			: undefined;
	if (
		typeof accountId !== "string" ||
		!accountId.trim() ||
		!tokenAuthentication ||
		typeof requestFetch !== "function"
	) {
		throw new TypeError(
			"Repository discovery requires a native account and request port",
		);
	}
	/** @type {Map<string, string>} */
	let organizationRoutes = new Map();
	/** @type {Map<string, { organizationId: string, projectId: string }>} */
	let projectRoutes = new Map();

	/** @param {string} base @param {Record<string, string>} query @param {AbortSignal} signal @param {Diagnostics} diagnostics @param {number} [maximumChoices] @param {string} [projectId] */
	async function requestJson(
		base,
		query,
		signal,
		diagnostics,
		maximumChoices,
		projectId,
	) {
		signal.throwIfAborted();
		diagnostics.pageCount = (diagnostics.pageCount ?? 0) + 1;
		diagnostics.errorCode = undefined;
		let accessToken;
		try {
			accessToken = await getAccessToken(
				tokenAuthentication,
				accountId,
				signal,
			);
		} catch (error) {
			signal.throwIfAborted();
			diagnostics.errorCode = safeActionError(error).errorCode;
			throw nativeCatalogError(error, "authentication");
		}
		signal.throwIfAborted();
		const params = new URLSearchParams({
			...query,
			"api-version": API_VERSION,
		});
		const url = `${base}?${params}`;
		let response;
		try {
			response = await waitWithCancellation(
				requestFetch(
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
		} catch (error) {
			signal.throwIfAborted();
			diagnostics.errorCode = safeActionError(error).errorCode;
			throw new AzureDevOpsCatalogError("network");
		}
		if (!response.ok || response.redirected) {
			try {
				if (response.body) {
					await waitWithCancellation(response.body.cancel(), signal);
				}
			} catch {
				// Cleanup cannot replace the known, safe HTTP failure.
			}
			throw new AzureDevOpsCatalogError("http", response.status);
		}
		const data = await readJson(
			response,
			signal,
			diagnostics,
			maximumChoices,
			projectId,
		);
		if (isRecord(data) && Array.isArray(data.value))
			diagnostics.choiceCount =
				(diagnostics.choiceCount ?? 0) + data.value.length;
		signal.throwIfAborted();
		return {
			data,
			continuationToken: response.headers.get("x-ms-continuationtoken"),
		};
	}

	/** @param {Choice} organization */
	function organizationPath(organization) {
		const path = organizationRoutes.get(organization?.id);
		if (!path) throw new AzureDevOpsCatalogError("invalid-selection");
		return `https://dev.azure.com/${path}`;
	}

	const catalog = {
		/** @param {{ signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async listOrganizations({ signal: caller, diagnostics = {} } = {}) {
			const signal = listSignal(caller);
			diagnostics.errorStage = "profile";
			const profile = await requestJson(
				"https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
				{},
				signal,
				diagnostics,
			);
			unpaged(profile, diagnostics);
			const memberId = guid(record(profile.data).id);
			diagnostics.errorStage = "organization";
			const response = await requestJson(
				"https://app.vssps.visualstudio.com/_apis/accounts",
				{ memberId },
				signal,
				diagnostics,
			);
			unpaged(response, diagnostics);
			const routes = new Map();
			const choices = collection(response.data, diagnostics).map((value) => {
				const item = record(value);
				const id = guid(item.accountId);
				const name = displayName(item.accountName);
				const path = segment(name);
				if (routes.has(id))
					throw new AzureDevOpsCatalogError("invalid-response");
				routes.set(id, path);
				return { id, name };
			});
			signal.throwIfAborted();
			organizationRoutes = routes;
			projectRoutes = new Map();
			return choices;
		},

		/** @param {{ organization: Choice, bounded?: boolean, signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async listProjects({
			organization,
			bounded = false,
			signal: caller,
			diagnostics = {},
		}) {
			const signal = listSignal(caller);
			const organizationId = organization?.id;
			const base = `${organizationPath(organization)}/_apis/projects`;
			const routes = new Map();
			const seenTokens = new Set();
			/** @type {Choice[]} */
			const choices = [];
			let continuationToken;
			for (let page = 0; page < MAX_PROJECT_PAGES; page++) {
				signal.throwIfAborted();
				const response = await requestJson(
					base,
					{
						$top: String(PROJECT_PAGE_SIZE),
						...(continuationToken === undefined ? {} : { continuationToken }),
					},
					signal,
					diagnostics,
					bounded ? repositoryResultLimit : undefined,
				);
				for (const value of collection(response.data, diagnostics)) {
					const item = record(value);
					const projectId = guid(item.id);
					const id = `${organizationId}/${projectId}`;
					if (routes.has(id))
						throw new AzureDevOpsCatalogError("invalid-response");
					routes.set(id, { organizationId, projectId });
					let details;
					try {
						details = choiceDisplayDetails("project", item);
					} catch {
						throw new AzureDevOpsCatalogError("invalid-response");
					}
					choices.push({
						id,
						name: displayName(item.name),
						...details,
					});
					if (
						choices.length > (bounded ? repositoryResultLimit : MAX_CHOICES)
					) {
						diagnostics.errorCode = "choice_limit";
						throw new AzureDevOpsCatalogError("limit");
					}
				}
				signal.throwIfAborted();
				if (bounded || response.continuationToken === null) {
					if (!bounded)
						for (const [id, route] of projectRoutes)
							if (route.organizationId === organizationId)
								projectRoutes.delete(id);
					for (const [id, route] of routes) projectRoutes.set(id, route);
					return choices;
				}
				continuationToken = response.continuationToken;
				if (
					!continuationToken.trim() ||
					continuationToken.length > MAX_CONTINUATION_LENGTH ||
					seenTokens.has(continuationToken)
				) {
					diagnostics.errorCode = "invalid_pagination";
					throw new AzureDevOpsCatalogError("invalid-response");
				}
				seenTokens.add(continuationToken);
			}
			diagnostics.errorCode = "page_limit";
			throw new AzureDevOpsCatalogError("limit");
		},

		/** @param {{ organization: Choice, project: Choice, signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async listRepositories({
			organization,
			project,
			signal: caller,
			diagnostics = {},
		}) {
			const signal = listSignal(caller);
			const organizationId = organization?.id;
			const projectChoiceId = project?.id;
			const base = organizationPath(organization);
			const route = projectRoutes.get(projectChoiceId);
			if (!route || route.organizationId !== organizationId) {
				throw new AzureDevOpsCatalogError("invalid-selection");
			}
			const response = await requestJson(
				`${base}/${encodeURIComponent(route.projectId)}/_apis/git/repositories`,
				{},
				signal,
				diagnostics,
			);
			unpaged(response, diagnostics);
			const seen = new Set();
			const choices = collection(response.data, diagnostics).map((value) => {
				const item = record(value);
				if (guid(record(item.project).id) !== route.projectId) {
					throw new AzureDevOpsCatalogError("invalid-response");
				}
				const id = `${projectChoiceId}/${guid(item.id)}`;
				if (seen.has(id)) throw new AzureDevOpsCatalogError("invalid-response");
				seen.add(id);
				return {
					id,
					name: displayName(item.name),
				};
			});
			signal.throwIfAborted();
			return choices;
		},

		/** @param {{ organization: Choice, project?: Choice, signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async listOrganizationRepositories({
			organization,
			project,
			signal: caller,
			diagnostics = {},
		}) {
			const signal = listSignal(caller);
			const route = project && projectRoutes.get(project.id);
			if (project && (!route || route.organizationId !== organization.id))
				throw new AzureDevOpsCatalogError("invalid-selection");
			const response = await requestJson(
				`${organizationPath(organization)}${route ? `/${encodeURIComponent(route.projectId)}` : ""}/_apis/git/repositories`,
				{},
				signal,
				diagnostics,
				route ? undefined : repositoryResultLimit,
				route?.projectId,
			);
			unpaged(response, diagnostics);
			const data = record(response.data);
			if (!Array.isArray(data.value) || data.count !== data.value.length)
				throw new AzureDevOpsCatalogError("invalid-response");
			const seen = new Set();
			const results = data.value.map((value) => {
				const result = repositoryResult(value, organization);
				if (
					(route &&
						result.project.id !== `${organization.id}/${route.projectId}`) ||
					seen.has(result.id)
				)
					throw new AzureDevOpsCatalogError("invalid-response");
				seen.add(result.id);
				return result;
			});
			return Object.assign(results, {
				discoveryLimited: !route && data.discoveryLimited === true,
			});
		},

		/** @param {{ organization: Choice, projectName: string, repository: string, signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async findRepository({
			organization,
			projectName,
			repository,
			signal: caller,
			diagnostics = {},
		}) {
			const signal = listSignal(caller);
			if (
				[projectName, repository].some(
					(name) =>
						typeof name !== "string" ||
						!name.trim() ||
						name.length > 512 ||
						name === "." ||
						name === ".." ||
						/[/\\]/.test(name),
				)
			)
				throw new AzureDevOpsCatalogError("invalid-selection");
			let response;
			try {
				response = await requestJson(
					`${organizationPath(organization)}/${segment(projectName)}/_apis/git/repositories/${segment(repository)}`,
					{},
					signal,
					diagnostics,
				);
			} catch (error) {
				if (
					error instanceof AzureDevOpsCatalogError &&
					error.code === "http" &&
					error.status === 404
				) {
					diagnostics.choiceCount = 0;
					return null;
				}
				throw error;
			}
			unpaged(response, diagnostics);
			const result = repositoryResult(response.data, organization);
			const matches = (name, id, requested) =>
				name.normalize("NFKC").toLocaleLowerCase() ===
					requested.normalize("NFKC").toLocaleLowerCase() ||
				id.split("/").at(-1) === requested.toLowerCase();
			if (
				!matches(result.project.name, result.project.id, projectName) ||
				!matches(result.repository.name, result.repository.id, repository)
			)
				throw new AzureDevOpsCatalogError("invalid-response");
			projectRoutes.set(result.project.id, {
				organizationId: organization.id,
				projectId: result.project.id.slice(organization.id.length + 1),
			});
			diagnostics.choiceCount = 1;
			return result;
		},

		/** @param {{ organization: string, project?: string, repository: string, signal?: AbortSignal, diagnostics?: Diagnostics }} input */
		async resolveRepositoryUrl({
			organization,
			project,
			repository,
			signal: caller,
			diagnostics = {},
		}) {
			const signal = listSignal(caller);
			const organizationName = displayName(organization).toLowerCase();
			const path = segment(organizationName);
			const projectPath =
				project === undefined ? "" : `/${segment(displayName(project))}`;
			const response = await requestJson(
				`https://dev.azure.com/${path}${projectPath}/_apis/git/repositories/${segment(displayName(repository))}`,
				{},
				signal,
				diagnostics,
			);
			unpaged(response, diagnostics);
			const item = record(response.data);
			const owner = record(item.project);
			const resolved = {
				organization: { id: organizationName, name: organizationName },
				project: { id: guid(owner.id), name: displayName(owner.name) },
				repository: { id: guid(item.id), name: displayName(item.name) },
			};
			for (const { requested, choice } of [
				{ requested: project, choice: resolved.project },
				{ requested: repository, choice: resolved.repository },
			]) {
				if (
					requested !== undefined &&
					requested.toLowerCase() !==
						(GUID_PATTERN.test(requested)
							? choice.id
							: choice.name.toLowerCase())
				)
					throw new AzureDevOpsCatalogError("invalid-response");
			}
			signal.throwIfAborted();
			return resolved;
		},
	};
	instrumentCatalog(catalog, telemetry);
	return catalog;
}

/** @param {AbortSignal | undefined} caller */
function listSignal(caller) {
	caller?.throwIfAborted();
	const timeout = AbortSignal.timeout(LIST_TIMEOUT_MS);
	return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

/** @param {{ continuationToken: string | null }} response @param {Diagnostics} diagnostics */
function unpaged(response, diagnostics) {
	if (response.continuationToken !== null) {
		diagnostics.errorCode = "unexpected_pagination";
		throw new AzureDevOpsCatalogError("invalid-response");
	}
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
	if (!isRecord(value)) {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
	return value;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {Diagnostics} diagnostics @returns {unknown[]} */
function collection(value, diagnostics) {
	const data = record(value);
	if (!Array.isArray(data.value) || data.count !== data.value.length) {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
	if (data.value.length > MAX_CHOICES) {
		diagnostics.errorCode = "choice_limit";
		throw new AzureDevOpsCatalogError("limit");
	}
	return data.value;
}

/** @param {unknown} value */
/** @param {unknown} value @param {Choice} organization */
function repositoryResult(value, organization) {
	const item = record(value);
	const project = record(item.project);
	const projectChoice = {
		id: `${organization.id}/${guid(project.id)}`,
		name: displayName(project.name),
	};
	const id = `${projectChoice.id}/${guid(item.id)}`;
	const name = displayName(item.name);
	return {
		id,
		name: `${organization.name}/${projectChoice.name}/${name}`,
		organization,
		project: projectChoice,
		repository: { id, name },
	};
}
/** @param {unknown} value */
function guid(value) {
	if (typeof value !== "string" || !GUID_PATTERN.test(value)) {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
	return value.toLowerCase();
}

/** @param {unknown} value */
function displayName(value) {
	if (typeof value !== "string" || !value.trim() || value.length > 512) {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
	return value;
}

/** @param {string} value */
function segment(value) {
	if (value === "." || value === ".." || /[/\\]/.test(value)) {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
	try {
		return encodeURIComponent(value);
	} catch {
		throw new AzureDevOpsCatalogError("invalid-response");
	}
}

/** @param {Response} response @param {AbortSignal} signal @param {Diagnostics} diagnostics @param {number} [maximumChoices] @param {string} [projectId] @returns {Promise<unknown>} */
async function readJson(
	response,
	signal,
	diagnostics,
	maximumChoices,
	projectId,
) {
	const reader = response.body?.getReader();
	if (!reader) throw new AzureDevOpsCatalogError("invalid-response");
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let bytes = 0;
	let json = "";
	let cursor = 0;
	let depth = 0;
	let quoted = false;
	let escaped = false;
	let stringStart = 0;
	let lastRootString;
	let collectionStart = -1;
	let itemStart = 0;
	let itemCount = 0;
	const projectRepositories = projectId ? [] : undefined;
	const encoder = new TextEncoder();
	let indexBytes = 0;
	let collectionSeen = false;
	let awaitingItem = false;
	try {
		if (
			!projectRepositories &&
			maximumChoices === undefined &&
			Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES
		) {
			diagnostics.errorCode = "response_too_large";
			throw new AzureDevOpsCatalogError("limit");
		}
		while (true) {
			signal.throwIfAborted();
			let chunk;
			try {
				chunk = await waitWithCancellation(reader.read(), signal);
			} catch {
				signal.throwIfAborted();
				throw new AzureDevOpsCatalogError("network");
			}
			signal.throwIfAborted();
			if (chunk.done) break;
			bytes += chunk.value.byteLength;
			diagnostics.responseBytes =
				(diagnostics.responseBytes ?? 0) + chunk.value.byteLength;
			if (!projectRepositories && bytes > MAX_RESPONSE_BYTES) {
				diagnostics.errorCode = "response_too_large";
				throw new AzureDevOpsCatalogError("limit");
			}
			for (let offset = 0; offset < chunk.value.byteLength; offset += 65536) {
				json += decoder.decode(chunk.value.subarray(offset, offset + 65536), {
					stream: true,
				});
				if (
					projectRepositories &&
					encoder.encode(json).byteLength > MAX_RESPONSE_BYTES
				) {
					diagnostics.errorCode = "response_too_large";
					throw new AzureDevOpsCatalogError("limit");
				}
				if (maximumChoices === undefined && !projectRepositories) continue;
				for (; cursor < json.length; cursor++) {
					const character = json[cursor];
					if (quoted) {
						if (escaped) escaped = false;
						else if (character === "\\") escaped = true;
						else if (character === '"') {
							quoted = false;
							if (depth === 1)
								lastRootString = JSON.parse(
									json.slice(stringStart, cursor + 1),
								);
						}
						continue;
					}
					if (character === '"') {
						quoted = true;
						stringStart = cursor;
						continue;
					}
					if (
						collectionStart >= 0 &&
						depth === 2 &&
						(character === "," || character === "]")
					) {
						const fragment = json.slice(itemStart, cursor).trim();
						if (projectRepositories) {
							if (!fragment && (character === "," || awaitingItem))
								throw new AzureDevOpsCatalogError("invalid-response");
							if (fragment) {
								const item = record(JSON.parse(fragment));
								const parent = record(item.project);
								const repository = {
									id: guid(item.id),
									name: displayName(item.name),
									project: {
										id: guid(parent.id),
										name: displayName(parent.name),
									},
								};
								if (repository.project.id !== projectId)
									throw new AzureDevOpsCatalogError("invalid-response");
								indexBytes += encoder.encode(
									JSON.stringify(repository),
								).byteLength;
								if (indexBytes > MAX_RESPONSE_BYTES) {
									diagnostics.errorCode = "response_too_large";
									throw new AzureDevOpsCatalogError("limit");
								}
								projectRepositories.push(repository);
							}
							// Retain identities, not descriptions, URLs or the complete response text.
							json =
								json.slice(0, itemStart) +
								json.slice(cursor + (character === "," ? 1 : 0));
							cursor = itemStart;
							awaitingItem = character === ",";
							if (character === ",") {
								cursor -= 1;
								continue;
							}
						} else {
							if (fragment) itemCount += 1;
							itemStart = cursor + 1;
						}
						if (itemCount === maximumChoices) {
							const end = character === "," ? cursor : cursor + 1;
							const prefix = record(
								JSON.parse(
									`${json.slice(0, end)}${character === "," ? "]" : ""}}`,
								),
							);
							if (
								prefix.count !== undefined &&
								(typeof prefix.count !== "number" ||
									!Number.isSafeInteger(prefix.count) ||
									(character === "]"
										? prefix.count !== itemCount
										: prefix.count <= itemCount))
							)
								throw new AzureDevOpsCatalogError("invalid-response");
							// The remaining response is deliberately not downloaded or cached.
							return {
								count: itemCount,
								value: prefix.value,
								discoveryLimited: character === ",",
							};
						}
						if (character === "]") collectionStart = -1;
					}
					if (character === "[" || character === "{") {
						if (
							character === "[" &&
							depth === 1 &&
							lastRootString === "value"
						) {
							if (projectRepositories && collectionSeen)
								throw new AzureDevOpsCatalogError("invalid-response");
							collectionSeen = true;
							collectionStart = cursor;
							itemStart = cursor + 1;
							itemCount = 0;
						}
						depth += 1;
					} else if (character === "]" || character === "}") {
						depth -= 1;
					}
				}
			}
		}
		const data = JSON.parse(json + decoder.decode());
		if (projectRepositories) {
			if (
				!collectionSeen ||
				!Array.isArray(data.value) ||
				data.value.length !== 0 ||
				!Number.isSafeInteger(data.count) ||
				data.count !== projectRepositories.length
			)
				throw new AzureDevOpsCatalogError("invalid-response");
			return { count: projectRepositories.length, value: projectRepositories };
		}
		return data;
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof AzureDevOpsCatalogError) throw error;
		throw new AzureDevOpsCatalogError("invalid-response");
	} finally {
		try {
			await waitWithCancellation(reader.cancel(), signal);
		} catch {
			// A failed cleanup must not replace a parse, size, network, or abort error.
		}
		reader.releaseLock();
	}
}
