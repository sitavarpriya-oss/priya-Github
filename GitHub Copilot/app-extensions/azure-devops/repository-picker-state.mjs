import { parseAzureDevOpsRepositoryUrl } from "./repository-url.mjs";

/**
 * @typedef {"organization" | "project" | "repository"} PickerField
 * @typedef {{ id: string, name: string, description?: string, secondaryLabel?: string, account?: Choice }} Choice
 * @typedef {{ id: string, name: string, organization: Choice, project: Choice, repository: Choice, account?: Choice }} RepositoryResult
 * @typedef {{ query: string, selected: Choice | null, options: Choice[], status: "idle" | "loading" | "ready" | "error", error?: string, authorization?: Choice }} FieldState
 * @typedef {{ account?: Choice, organization: Choice, project: Choice, repository: Choice }} Selection
 * @typedef {{ revision: number, sequence: number, accountRevision?: number, repositoryUrl?: string, repositoryUrlResultMode?: boolean, urlSelection?: Selection | null, fields: Record<PickerField, FieldState>, results?: {query: string, options: RepositoryResult[], status: FieldState["status"], error?: string, errorCode?: string, authorization?: Choice, truncated?: boolean, discoveryLimited?: boolean}, selection: Selection | null }} PickerState
 * @typedef {{ signal: AbortSignal, telemetryEntryPoint?: "automatic" | "selection" | "retry" | "url_validation" }} CatalogRequest
 * @typedef {{ listOrganizations(input: CatalogRequest): Promise<Choice[]>, listProjects(input: CatalogRequest & { organization: Choice, bounded?: boolean }): Promise<Choice[]>, listRepositories(input: CatalogRequest & { organization: Choice, project: Choice }): Promise<Choice[]>, listOrganizationRepositories?(input: CatalogRequest & { organization: Choice, project?: Choice }): Promise<RepositoryResult[] & {discoveryLimited?: boolean}>, findRepository?(input: CatalogRequest & { organization: Choice, projectName: string, repository: string }): Promise<RepositoryResult | null>, resolveRepositoryUrl?(input: CatalogRequest & { organization: string, project?: string, repository: string }): Promise<{ organization: Choice, project: Choice, repository: Choice, account?: Choice }> }} Catalog
 */

export const fieldNames = ["organization", "project", "repository"];
export const repositoryResultLimit = 100;
const namedOrganizationLimit = 10;

export function matchesRepositoryResult(result, query) {
	const parts = query.trim().normalize("NFKC").toLocaleLowerCase().split("/");
	const names = [result.organization, result.project, result.repository].map(
		(choice) => comparable(choice.name),
	);
	return parts.length === 1
		? names.some((name) => name.includes(parts[0]))
		: parts.length <= 3 &&
				parts.every((part, index) => names[index].includes(part.trim()));
}

export class PickerInputError extends Error {
	constructor(message, status = 400, code = undefined, account = undefined) {
		super(message);
		this.status = status;
		this.code = code;
		this.account = account;
	}
}

const errorMessages = {
	account_required:
		"Add a Microsoft account in Account settings, then retry the list.",
	auth_required:
		"Microsoft authorization needs updating. In Account settings, choose Update authorization for the affected Microsoft account, then close Settings and retry.",
	unauthorized:
		"Azure DevOps rejected authorization for this request (HTTP 401). You can try Update authorization for the affected Microsoft account in Account settings, then close Settings and retry.",
	forbidden:
		"Your Microsoft account does not have access (HTTP 403). Check its Azure DevOps permissions.",
};

export function authorizationRecovery(code) {
	return code === "auth_required" || code === "unauthorized";
}

export function pickerErrorMessage(code) {
	return Object.hasOwn(errorMessages, code) ? errorMessages[code] : null;
}

function pickerErrorCode(error) {
	if (error?.name !== "AzureDevOpsCatalogError") return "unknown";
	if (error.code === "http" && error.status === 401) return "unauthorized";
	if (error.code === "http" && error.status === 403) return "forbidden";
	return pickerErrorMessage(error.code) ? error.code : "unknown";
}

function failedAuthorization(error) {
	if (!authorizationRecovery(pickerErrorCode(error))) return undefined;
	const account = error.account;
	if (!record(account) || !text(account.id) || !text(account.name))
		return undefined;
	return {
		id: account.id,
		name: account.name,
		...(text(account.secondaryLabel)
			? { secondaryLabel: account.secondaryLabel }
			: {}),
	};
}

function accountIdentity(value) {
	return record(value) &&
		text(value.id) &&
		value.id.trim() &&
		text(value.name) &&
		value.name.trim()
		? { id: value.id, name: value.name }
		: undefined;
}

/** @param {FieldState["status"]} [status] @returns {FieldState} */
function emptyField(status = "idle") {
	return { query: "", selected: null, options: [], status };
}

function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
	return typeof value === "string" && value.length <= 512;
}

export function choiceDisplayDetails(field, value) {
	if (
		field !== "project" ||
		value.description === undefined ||
		value.description === null
	)
		return {};
	if (typeof value.description !== "string")
		throw new Error("Invalid catalog display metadata");
	const content = value.description.trim();
	if (!content) return {};
	const limit = 2048;
	return {
		description:
			content.length > limit ? `${content.slice(0, limit - 3)}...` : content,
	};
}

function choiceIdentity({ id, name }) {
	return { id, name };
}

export function canConfirm(state) {
	if (state.repositoryUrl && !state.repositoryUrlResultMode) return true;
	return fieldNames.every((name) => {
		const field = state.fields[name];
		return (
			field.status === "ready" &&
			field.selected !== null &&
			field.query === field.selected.name
		);
	});
}

export function confirmDisabledReason(state) {
	if (state.repositoryUrl && !state.repositoryUrlResultMode) return null;
	const error = fieldNames
		.map((name) => state.fields[name])
		.find(
			(field) => field.status === "error" && pickerErrorMessage(field.error),
		);
	if (error) return pickerErrorMessage(error.error);
	if (state.results && !canConfirm(state)) {
		if (state.fields.organization.status === "error")
			return "Could not load organizations. Retry the list.";
		if (state.results.status === "error")
			return (
				pickerErrorMessage(state.results.errorCode) ??
				state.results.error ??
				"Could not load repositories. Retry the list."
			);
		if (state.results.status === "loading") return "Searching repositories...";
		return "Choose a repository from the list.";
	}
	for (const name of fieldNames) {
		const field = state.fields[name];
		const plural = name === "repository" ? "repositories" : `${name}s`;
		if (field.status === "loading") return `Loading ${plural}...`;
		if (field.status === "error")
			return `Could not load ${plural}. Retry the list.`;
		if (field.status === "ready" && field.options.length === 0)
			return name === "organization"
				? "No organizations are available. Retry or check your Azure DevOps access."
				: `No ${plural} are available. Retry or choose a different parent.`;
		if (!field.selected || field.query !== field.selected.name)
			return `Choose an ${name === "organization" ? "organization" : name === "project" ? "available project" : "available repository"} from the list.`;
	}
	return null;
}

function nextRevision(revision) {
	if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER)
		throw new PickerInputError("Reload the picker to continue.", 409);
	return revision + 1;
}

/** The same transition drives immediate guest feedback and authoritative instance state. */
export function updatePicker(state, command) {
	if (!record(command) || !Number.isSafeInteger(command.sequence)) {
		throw new PickerInputError("Invalid picker request.");
	}
	if (command.sequence <= state.sequence) {
		throw new PickerInputError("The picker has already changed.", 409);
	}
	const commandKeys = {
		search: ["type", "sequence", "value"],
		"choose-result": ["type", "sequence", "id"],
		"retry-search": ["type", "sequence"],
		url: ["type", "sequence", "value", "reset", "selectResult"],
		query: ["type", "sequence", "field", "value"],
		choose: ["type", "sequence", "field", "id"],
		retry: ["type", "sequence", "field"],
		confirm: ["type", "sequence", "queries", "url"],
	};
	if (
		!Object.hasOwn(commandKeys, command.type) ||
		Object.keys(command).some((key) => !commandKeys[command.type].includes(key))
	) {
		throw new PickerInputError("Invalid picker request.");
	}
	const next = structuredClone(state);
	const names = fieldNames;
	next.sequence = command.sequence;
	next.revision = nextRevision(next.revision);
	if (["search", "choose-result", "retry-search"].includes(command.type)) {
		if (!next.results)
			throw new PickerInputError("Repository search is unavailable.");
		if (command.type === "choose-result") {
			const result = next.results.options.find(
				(item) => item.id === command.id,
			);
			if (next.results.status !== "ready" || !result)
				throw new PickerInputError(
					"Choose a repository from the current list.",
				);
			for (const name of fieldNames) {
				const selected = choiceIdentity(result[name]);
				if (name === "repository" && result.account)
					selected.account = result.account;
				next.fields[name] = {
					query: selected.name,
					selected,
					options:
						name === "organization"
							? next.fields.organization.options
							: [selected],
					status: "ready",
				};
			}
		} else {
			if (command.type === "search") {
				if (
					!text(command.value) &&
					!(
						typeof command.value === "string" &&
						command.value.includes("://") &&
						command.value.length <= 4096
					)
				)
					throw new PickerInputError("The search text is too long.");
				next.results.query = command.value;
			} else if (
				next.results.status !== "error" &&
				next.fields.organization.status !== "error"
			) {
				throw new PickerInputError("This list is not waiting for a retry.");
			}
			next.results.status = "loading";
			next.results.options = [];
			next.results.error = undefined;
			next.results.errorCode = undefined;
			next.results.authorization = undefined;
			next.results.truncated = undefined;
			next.results.discoveryLimited = undefined;
			for (const name of ["project", "repository"])
				next.fields[name] = emptyField();
			next.fields.organization.selected = null;
			next.fields.organization.query = "";
			if (next.fields.organization.status === "idle")
				next.fields.organization.status = "loading";
			if (
				command.type === "retry-search" &&
				next.fields.organization.status === "error"
			) {
				next.fields.organization.status = "loading";
				next.fields.organization.error = undefined;
				next.fields.organization.authorization = undefined;
			}
		}
		next.repositoryUrl = undefined;
		next.repositoryUrlResultMode = undefined;
		next.urlSelection = null;
		next.selection = null;
		return next;
	}
	if (command.type === "url") {
		if (typeof command.value !== "string" || command.value.length > 4096)
			throw new PickerInputError("The repository URL is too long.");
		if (command.reset !== undefined && typeof command.reset !== "boolean")
			throw new PickerInputError("Invalid picker request.");
		if (
			command.selectResult !== undefined &&
			typeof command.selectResult !== "boolean"
		)
			throw new PickerInputError("Invalid picker request.");
		next.repositoryUrl = command.value || undefined;
		if (next.repositoryUrl && command.selectResult === true)
			next.repositoryUrlResultMode = true;
		else next.repositoryUrlResultMode = undefined;
		next.urlSelection = null;
		next.selection = null;
		if (command.reset)
			for (const name of fieldNames) next.fields[name] = emptyField();
		if (!next.repositoryUrl && next.fields.organization.status === "idle")
			next.fields.organization.status = "loading";
		return next;
	}
	if (command.type === "confirm") {
		if (
			!canConfirm(state) ||
			(state.repositoryUrl &&
				!state.repositoryUrlResultMode &&
				(!state.urlSelection || command.url !== state.repositoryUrl)) ||
			!record(command.queries) ||
			Object.keys(command.queries).some((name) => !names.includes(name)) ||
			names.some((name) => command.queries[name] !== state.fields[name].query)
		) {
			throw new PickerInputError(
				"Choose an organization, project and repository from the lists.",
			);
		}
		const account = next.fields.repository.selected?.account;
		next.selection =
			next.repositoryUrl && !next.repositoryUrlResultMode
				? next.urlSelection
				: {
						...(account ? { account: choiceIdentity(account) } : {}),
						organization: choiceIdentity(next.fields.organization.selected),
						project: choiceIdentity(next.fields.project.selected),
						repository: choiceIdentity(next.fields.repository.selected),
					};
		return next;
	}
	if (next.repositoryUrl && !next.repositoryUrlResultMode)
		throw new PickerInputError("Clear the repository URL to browse the lists.");
	if (!names.includes(command.field)) {
		throw new PickerInputError("Unknown picker field.");
	}
	const field = next.fields[command.field];
	if (field.status === "idle") {
		throw new PickerInputError("Choose the organization and project first.");
	}
	let changed = false;
	if (command.type === "query") {
		if (!text(command.value)) {
			throw new PickerInputError("The search text is too long.");
		}
		field.query = command.value;
		if (field.selected && field.query !== field.selected.name) {
			field.selected = null;
			changed = true;
		}
	} else if (command.type === "choose") {
		const option = field.options.find((item) => item.id === command.id);
		if (field.status !== "ready" || !option) {
			throw new PickerInputError("Choose a result from the current list.");
		}
		changed = field.selected?.id !== option.id;
		field.selected = option;
		field.query = option.name;
	} else {
		if (
			field.status !== "error" &&
			!(field.status === "ready" && field.options.length === 0)
		) {
			throw new PickerInputError("This list is not waiting for a retry.");
		}
		field.status = "loading";
		field.error = undefined;
		field.authorization = undefined;
	}
	if (changed) {
		next.selection = null;
		next.urlSelection = null;
		const index = names.indexOf(command.field);
		for (const name of names.slice(index + 1)) {
			next.fields[name] = emptyField();
		}
		if (!next.repositoryUrl && field.selected && index < names.length - 1) {
			next.fields[names[index + 1]].status = "loading";
		}
	}
	return next;
}

function choices(value, field) {
	if (!Array.isArray(value)) throw new Error("Invalid catalog response");
	const ids = new Set();
	return value.map((item) => {
		if (
			!record(item) ||
			!text(item.id) ||
			!item.id.trim() ||
			!text(item.name) ||
			!item.name.trim() ||
			ids.has(item.id)
		) {
			throw new Error("Invalid catalog choice");
		}
		ids.add(item.id);
		const account = field === "repository" && accountIdentity(item.account);
		// Catalog implementations stay in the process; only display data reaches the guest.
		return {
			id: item.id,
			name: item.name,
			...(text(item.secondaryLabel)
				? { secondaryLabel: item.secondaryLabel }
				: {}),
			...choiceDisplayDetails(field, item),
			...(account ? { account } : {}),
		};
	});
}

function comparable(value) {
	return value.normalize("NFKC").toLocaleLowerCase();
}

function matchingChoice(options, value) {
	const expected = comparable(value);
	const matches = options.filter((choice) => {
		const id = choice.id.split("/").at(-1);
		return (
			comparable(choice.name) === expected ||
			(typeof id === "string" && comparable(id) === expected)
		);
	});
	return matches.length === 1 ? matches[0] : null;
}

async function abortable(promise, signal) {
	signal.throwIfAborted();
	let abort;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				abort = () => reject(signal.reason);
				signal.addEventListener("abort", abort, { once: true });
			}),
		]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}

function repositoryResolutionError(error) {
	if (!record(error) || error.name !== "AzureDevOpsCatalogError") return null;
	const classified = pickerErrorCode(error);
	const message = pickerErrorMessage(classified);
	if (message)
		return new PickerInputError(
			message,
			400,
			classified,
			failedAuthorization(error),
		);
	const code = error.code;
	if (code === "timeout")
		return new PickerInputError(
			"Repository lookup timed out. Check your connection and try again.",
		);
	if (code === "http" && error.status === 404)
		return new PickerInputError(
			"This repository was not found in the selected organization.",
		);
	if (code === "network")
		return new PickerInputError(
			"Could not reach Azure DevOps. Check your connection and try again.",
		);
	if (
		code === "invalid-selection" ||
		code === "invalid-response" ||
		code === "limit"
	)
		return new PickerInputError(
			"Could not resolve this repository. Check the URL and try again.",
		);
	return new PickerInputError(
		"Azure DevOps could not resolve this repository. Try again.",
	);
}

function repositorySearchError(error) {
	if (record(error) && error.name === "TimeoutError")
		return "Repository discovery timed out. Narrow the search to an organization and try again.";
	if (record(error) && error.name === "AzureDevOpsCatalogError") {
		if (
			error.code === "http" &&
			Number.isInteger(error.status) &&
			error.status >= 100 &&
			error.status <= 599
		)
			return `Azure DevOps repository discovery failed (HTTP ${error.status}). Retry the list or search another organization.`;
		if (error.code === "network")
			return "Could not reach Azure DevOps. Check your connection and retry the list.";
		if (error.code === "limit")
			return "This organization's repository catalog exceeds the picker's size limit. Search another organization.";
		if (error.code === "invalid-response")
			return "Azure DevOps returned an invalid repository catalog. Retry the list or search another organization.";
		if (error.code === "invalid-selection")
			return "The Azure DevOps catalog has changed. Reopen the picker to reload it.";
	}
	return "Could not load repositories. Retry the list.";
}

/** @param {Catalog | undefined} catalog */
export function createPickerState(catalog, onChange = () => {}) {
	/** @type {PickerState} */
	let state = {
		revision: 0,
		sequence: 0,
		fields: {
			organization: emptyField("loading"),
			project: emptyField(),
			repository: emptyField(),
		},
		selection: null,
		...(catalog?.listOrganizationRepositories
			? { results: { query: "", options: [], status: "loading" } }
			: {}),
	};
	let closed = false;
	const pending = new Map();
	const resolutions = new Set();
	const repositoryCache = new Map();
	let searchTimer;
	let searchRun = 0;
	let searchKey;
	let searchAttempt;
	let repositoryReads = Promise.resolve();

	function invalidateSearchCache() {
		clearTimeout(searchTimer);
		searchAttempt?.resolve({ status: "cancelled" });
		searchRun += 1;
		searchKey = undefined;
		for (const entry of repositoryCache.values()) entry.controller.abort();
		repositoryCache.clear();
	}

	function synchronizeSearch(entryPoint = "automatic") {
		if (!state.results) return;
		const key = JSON.stringify([
			state.results.query,
			state.repositoryUrl,
			state.fields.organization.status,
		]);
		if (searchKey === key) return;
		searchKey = key;
		state.results.error = undefined;
		state.results.errorCode = undefined;
		state.results.authorization = undefined;
		clearTimeout(searchTimer);
		searchAttempt?.resolve({ status: "cancelled" });
		const run = ++searchRun;
		if (state.repositoryUrl) {
			state.results.options = [];
			state.results.status = "ready";
			return;
		}
		if (state.fields.organization.status !== "ready") {
			state.results.status = state.fields.organization.status;
			return;
		}
		if (state.results.query.includes("://")) {
			state.results.status = "ready";
			return;
		}
		const attempt = Promise.withResolvers();
		searchAttempt = attempt;
		searchTimer = setTimeout(() => {
			void search(run, entryPoint).then(attempt.resolve, (error) =>
				attempt.resolve({ status: "error", error }),
			);
		}, 300);
		return attempt.promise;
	}

	function cachedSearchRead(key, run, read) {
		let entry = repositoryCache.get(key);
		if (!entry) {
			const controller = new AbortController();
			entry = { controller, completion: null, run };
			repositoryCache.set(key, entry);
			entry.completion = repositoryReads
				.then(async () => {
					controller.signal.throwIfAborted();
					if (closed || entry.run !== searchRun)
						throw new DOMException("Search was replaced", "AbortError");
					const signal = AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(30_000),
					]);
					return abortable(read(signal), signal);
				})
				.catch((error) => {
					if (repositoryCache.get(key) === entry) repositoryCache.delete(key);
					throw error;
				});
			// Serialize project and repository reads without discarding their errors.
			repositoryReads = entry.completion.then(
				() => {},
				() => {},
			);
		}
		entry.run = run;
		return entry.completion;
	}

	function repositoryResults(values, organization, projectScoped = false) {
		if (!Array.isArray(values)) throw new Error("Invalid repository results");
		const ids = new Set();
		return values
			.slice(0, projectScoped ? values.length : repositoryResultLimit)
			.map((value) => {
				if (!record(value) || ids.has(value.id))
					throw new Error("Invalid repository result");
				ids.add(value.id);
				const [org] = choices([value.organization], "organization");
				const [project] = choices([value.project], "project");
				const [repository] = choices([value.repository], "repository");
				if (org.id !== organization.id || value.id !== repository.id)
					throw new Error("Invalid repository result identity");
				const account = accountIdentity(value.account);
				return {
					id: repository.id,
					name: `${org.name}/${project.name}/${repository.name}`,
					organization: org,
					project,
					repository,
					...(account ? { account } : {}),
				};
			});
	}

	async function search(run, entryPoint) {
		let outcome = { status: "ready", error: undefined };
		try {
			const query = state.results.query;
			const parts = query
				.trim()
				.normalize("NFKC")
				.split("/")
				.map((part) => part.trim());
			const orgPart = query.includes("/")
				? comparable(query.split("/")[0].trim())
				: "";
			const projectPart = query.includes("/")
				? comparable((query.split("/")[1] ?? "").trim())
				: "";
			const matches = state.fields.organization.options.filter((org) =>
				comparable(org.name).includes(orgPart),
			);
			const organization =
				matches.find((org) => comparable(org.name) === orgPart) ?? matches[0];
			const term = parts.length === 1 ? comparable(parts[0]) : "";
			const prefixed = term
				? matches
						.filter((org) => comparable(org.name).startsWith(term))
						.sort(
							(a, b) =>
								Number(comparable(b.name) === term) -
								Number(comparable(a.name) === term),
						)
				: [];
			const named = prefixed.slice(0, namedOrganizationLimit);
			const organizations = [organization, ...named].filter(
				(org, index, list) => org && list.indexOf(org) === index,
			);
			const groups = [];
			const failures = [];
			state.results.discoveryLimited = prefixed.length > named.length;
			for (const organization of organizations) {
				if (closed || run !== searchRun) return { status: "cancelled" };
				try {
					const group = [];
					let project;
					if (
						catalog.findRepository &&
						parts.length === 3 &&
						parts.every(Boolean) &&
						comparable(organization.name) === orgPart
					) {
						const exact = await cachedSearchRead(
							JSON.stringify([
								"exact",
								organization.id,
								comparable(parts[1]),
								comparable(parts[2]),
							]),
							run,
							async (signal) =>
								catalog.findRepository({
									organization,
									projectName: parts[1],
									repository: parts[2],
									signal,
									telemetryEntryPoint: entryPoint,
								}),
						);
						if (closed || run !== searchRun) return { status: "cancelled" };
						if (exact !== null) {
							const [result] = repositoryResults([exact], organization);
							group.push(result);
							project = result.project;
						}
					}
					if (projectPart && !project) {
						const projects = await cachedSearchRead(
							JSON.stringify(["projects", organization.id]),
							run,
							async (signal) =>
								choices(
									await catalog.listProjects({
										organization,
										bounded: true,
										signal,
										telemetryEntryPoint: entryPoint,
									}),
									"project",
								).slice(0, repositoryResultLimit),
						);
						if (closed || run !== searchRun) return { status: "cancelled" };
						const matches = projects.filter((item) =>
							comparable(item.name).includes(projectPart),
						);
						project =
							matches.find((item) => comparable(item.name) === projectPart) ??
							matches[0];
						if (!project) continue;
					}
					const discovered = await cachedSearchRead(
						JSON.stringify(["repositories", organization.id, project?.id]),
						run,
						async (signal) => {
							const values = await catalog.listOrganizationRepositories({
								organization,
								project,
								signal,
								telemetryEntryPoint: entryPoint,
							});
							return {
								options: repositoryResults(
									values,
									organization,
									Boolean(project),
								),
								discoveryLimited:
									!project &&
									(values.discoveryLimited ??
										values.length > repositoryResultLimit),
							};
						},
					);
					if (closed || run !== searchRun) return { status: "cancelled" };
					state.results.discoveryLimited ||= discovered.discoveryLimited;
					const matches = discovered.options.filter((value) =>
						matchesRepositoryResult(value, query),
					);
					const exact =
						parts.length === 3 &&
						matches.find(
							(value) =>
								comparable(value.repository.name) === comparable(parts[2]),
						);
					if (!group.length && exact) group.push(exact);
					group.push(
						...matches.filter(
							(value) => !group.some((result) => result.id === value.id),
						),
					);
					groups.push(group);
				} catch (error) {
					if (closed || run !== searchRun)
						return { status: "cancelled", error };
					failures.push(error);
				}
			}
			if (closed || run !== searchRun) return { status: "cancelled" };
			if (failures.length && failures.length === organizations.length)
				throw failures[0];

			const counts = groups.map(() => 0);
			let available = repositoryResultLimit;
			while (available > 0 && groups.some((g, i) => counts[i] < g.length)) {
				for (const [i, group] of groups.entries()) {
					if (available > 0 && counts[i] < group.length) {
						counts[i] += 1;
						available -= 1;
					}
				}
			}
			state.results.truncated =
				groups.reduce((total, group) => total + group.length, 0) >
				repositoryResultLimit;
			state.results.options = groups.flatMap((group, i) =>
				group.slice(0, counts[i]),
			);
			state.results.status = "ready";
		} catch (error) {
			if (closed || run !== searchRun) return { status: "cancelled", error };
			state.results.status = "error";
			state.results.error = repositorySearchError(error);
			state.results.errorCode = pickerErrorCode(error);
			state.results.authorization = failedAuthorization(error);
			searchRun += 1;
			outcome = { status: "error", error };
		}
		state.revision = nextRevision(state.revision);
		onChange();
		return outcome;
	}

	function assertOpen() {
		if (closed) throw new Error("Canvas instance is closed");
	}

	function contextKey(name) {
		return JSON.stringify([
			name,
			name !== "organization" && state.fields.organization.selected?.id,
			name === "repository" && state.fields.project.selected?.id,
		]);
	}

	async function load(name, request) {
		const signal = AbortSignal.any([
			request.controller.signal,
			AbortSignal.timeout(30_000),
		]);
		try {
			if (!catalog) throw new Error("Repository discovery is not configured");
			const input = {
				organization: state.fields.organization.selected,
				project: state.fields.project.selected,
				signal,
				telemetryEntryPoint: request.entryPoint,
			};
			const method = {
				organization: "listOrganizations",
				project: "listProjects",
				repository: "listRepositories",
			}[name];
			const result = choices(
				await abortable(catalog[method](input), signal),
				name,
			);
			if (closed || pending.get(name) !== request)
				return { status: "cancelled", error: request.controller.signal.reason };
			state.fields[name].options = result;
			state.fields[name].status = "ready";
			state.fields[name].error = undefined;
			state.fields[name].authorization = undefined;
			pending.delete(name);
			synchronizeSearch();
			state.revision = nextRevision(state.revision);
			onChange();
			return { status: "ready" };
		} catch (error) {
			if (closed || pending.get(name) !== request)
				return { status: "cancelled", error };
			state.fields[name].status = "error";
			state.fields[name].error = pickerErrorCode(error);
			state.fields[name].authorization = failedAuthorization(error);
			synchronizeSearch();
			state.revision = nextRevision(state.revision);
			onChange();
			return { status: "error", error };
		} finally {
			if (pending.get(name) === request) pending.delete(name);
		}
	}

	function synchronize(entryPoint = "automatic") {
		const loads = [];
		const searchLoad = synchronizeSearch(entryPoint);
		if (searchLoad) loads.push(searchLoad);
		for (const name of fieldNames) {
			const key = contextKey(name);
			const current = pending.get(name);
			const loading =
				state.fields[name].status === "loading" && !state.repositoryUrl;
			if (current && (!loading || current.key !== key)) {
				pending.delete(name);
				current.controller.abort();
			}
			if (loading && !pending.has(name)) {
				const request = {
					key,
					controller: new AbortController(),
					entryPoint,
				};
				pending.set(name, request);
				request.completion = load(name, request);
				loads.push(request.completion);
			}
		}
		// Only reads started by this transition belong to its completion.
		// Automatic dependent discovery keeps its own lifetime.
		return Promise.all(loads);
	}

	synchronize();
	return {
		cancelResolutions() {
			for (const resolution of resolutions) resolution.controller.abort();
		},
		read() {
			assertOpen();
			return structuredClone(state);
		},
		refreshDiscovery() {
			assertOpen();
			state.accountRevision = (state.accountRevision ?? 0) + 1;
			invalidateSearchCache();
			if (state.results) {
				state.results = {
					query: state.results.query,
					options: [],
					status: "loading",
				};
			}
			for (const resolution of resolutions) resolution.controller.abort();
			if (state.repositoryUrl) {
				state.urlSelection = null;
				state.selection = null;
				state.revision = nextRevision(state.revision);
				onChange();
				return;
			}
			const field =
				fieldNames.find((name) =>
					["error", "loading"].includes(state.fields[name].status),
				) ?? "organization";
			const previous = [...pending.values()];
			pending.clear();
			for (const request of previous) request.controller.abort();
			const names = fieldNames;
			const query = state.fields[field].query;
			// Reloading a catalog invalidates the routing identities below it.
			for (const name of names.slice(names.indexOf(field)))
				state.fields[name] = emptyField(name === field ? "loading" : "idle");
			state.fields[field].query = query;
			state.revision = nextRevision(state.revision);
			synchronize();
			onChange();
		},
		change(command) {
			assertOpen();
			state = updatePicker(state, command);
			if (command.type === "url" && command.reset) invalidateSearchCache();
			if (command.type === "retry-search" || command.type === "search")
				searchKey = undefined;
			for (const resolution of resolutions) resolution.controller.abort();
			const completion = synchronize(
				command.type === "retry" || command.type === "retry-search"
					? "retry"
					: "selection",
			);
			onChange();
			return { state: structuredClone(state), completion };
		},
		async validateQuickFill(command, externalSignal) {
			assertOpen();
			if (
				!record(command) ||
				Object.keys(command).some(
					(key) => !["organization", "project", "repository"].includes(key),
				) ||
				!text(command.organization) ||
				!command.organization.trim() ||
				(command.project !== undefined &&
					(!text(command.project) || !command.project.trim())) ||
				(command.repository !== undefined &&
					(!text(command.repository) || !command.repository.trim()))
			)
				throw new PickerInputError("Invalid repository URL target.");
			if (!catalog)
				throw new PickerInputError(
					"Repository discovery is not configured for this picker.",
				);
			for (const resolution of resolutions) resolution.controller.abort();
			const controller = new AbortController();
			let settle;
			const resolution = {
				controller,
				completion: new Promise((resolve) => {
					settle = resolve;
				}),
			};
			resolutions.add(resolution);
			const timeout = AbortSignal.timeout(30_000);
			try {
				const signal = AbortSignal.any([
					controller.signal,
					timeout,
					...(externalSignal ? [externalSignal] : []),
				]);
				if (command.repository) {
					const submittedUrl = state.repositoryUrl ?? state.results?.query;
					const target = parseAzureDevOpsRepositoryUrl(submittedUrl);
					if (
						!target ||
						fieldNames.some((name) => target[name] !== command[name])
					)
						throw new PickerInputError(
							"The repository URL changed. Press Enter to retry.",
						);
					if (!catalog.resolveRepositoryUrl)
						throw new PickerInputError(
							"Repository URL lookup is not available.",
						);
					const result = await abortable(
						catalog.resolveRepositoryUrl({
							...command,
							signal,
							telemetryEntryPoint: "url_validation",
						}),
						signal,
					);
					signal.throwIfAborted();
					assertOpen();
					const account = accountIdentity(result.account);
					if (state.results && state.repositoryUrlResultMode) {
						const [organization] = choices(
							[result.organization],
							"organization",
						);
						const [project] = choices([result.project], "project");
						const [repository] = choices([result.repository], "repository");
						const repositoryResult = {
							id: repository.id,
							name: `${organization.name}/${project.name}/${repository.name}`,
							organization,
							project,
							repository,
							...(account ? { account } : {}),
						};
						state.results.options = [repositoryResult];
						state.results.status = "ready";
						state.results.error = undefined;
						state.results.errorCode = undefined;
						state.results.authorization = undefined;
						state.results.truncated = false;
						state.results.discoveryLimited = false;
						state.repositoryUrl = undefined;
						state.repositoryUrlResultMode = undefined;
						state.urlSelection = null;
						state.selection = null;
						state.revision = nextRevision(state.revision);
						onChange();
						return { repositoryResult: repositoryResult.name };
					}
					state.urlSelection = {
						...(account ? { account } : {}),
						organization: result.organization,
						project: result.project,
						repository: result.repository,
					};
					state.revision = nextRevision(state.revision);
					onChange();
					return { repositoryUrl: state.repositoryUrl };
				}
				invalidateSearchCache();
				const organizations = await abortable(
					catalog.listOrganizations({
						signal,
						telemetryEntryPoint: "url_validation",
					}),
					signal,
				);
				invalidateSearchCache();
				synchronizeSearch();
				const organization = matchingChoice(
					choices(organizations, "organization"),
					command.organization,
				);
				if (!organization)
					throw new PickerInputError(
						"This organization was not found in the current Azure DevOps catalog.",
					);
				const validated = { organization: organization.id };
				if (!command.project)
					return state.results
						? { ...validated, searchQuery: `${organization.name}/` }
						: validated;
				const project = matchingChoice(
					choices(
						await abortable(
							catalog.listProjects({
								organization,
								signal,
								telemetryEntryPoint: "url_validation",
							}),
							signal,
						),
						"project",
					),
					command.project,
				);
				if (!project)
					throw new PickerInputError(
						"This project was not found in the current Azure DevOps catalog.",
					);
				validated.project = project.id;
				return state.results
					? {
							...validated,
							searchQuery: `${organization.name}/${project.name}/`,
						}
					: validated;
			} catch (error) {
				if (
					closed ||
					controller.signal.aborted ||
					(record(error) && error.name === "AbortError")
				)
					throw error;
				if (timeout.aborted || (record(error) && error.name === "TimeoutError"))
					throw new PickerInputError(
						"Repository lookup timed out. Check your connection and try again.",
					);
				if (error instanceof PickerInputError) throw error;
				throw repositoryResolutionError(error) ?? error;
			} finally {
				settle();
				resolutions.delete(resolution);
			}
		},
		async close() {
			closed = true;
			clearTimeout(searchTimer);
			searchAttempt?.resolve({ status: "cancelled" });
			searchRun += 1;
			for (const entry of repositoryCache.values()) entry.controller.abort();
			const cachedReads = [...repositoryCache.values()].map(
				(entry) => entry.completion,
			);
			const requests = [...pending.values()];
			const lookups = [...resolutions];
			for (const request of requests) {
				request.controller.abort();
			}
			pending.clear();
			for (const lookup of lookups) lookup.controller.abort();
			resolutions.clear();
			await Promise.all([
				...cachedReads.map((read) => read.catch(() => {})),
				...requests.map((request) => request.completion),
				...lookups.map((lookup) => lookup.completion),
			]);
		},
	};
}
