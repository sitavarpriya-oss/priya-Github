const LEGACY_HOST_SUFFIX = ".visualstudio.com";

function decodeSegment(value) {
	try {
		const decoded = decodeURIComponent(value);
		return decoded &&
			!/[/\\]/.test(decoded) &&
			![...decoded].some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			)
			? decoded
			: null;
	} catch {
		return null;
	}
}

/**
 * Parse a copied Azure DevOps Services repository URL without consulting
 * authentication or the repository catalog.
 * @param {unknown} value
 * @returns {{ organization: string, project?: string, repository?: string } | null}
 */
export function parseAzureDevOpsRepositoryUrl(value) {
	if (typeof value !== "string" || value.length > 4096) return null;
	const input = value.trim();
	if (!input || !URL.canParse(input)) return null;
	const url = new URL(input);
	if (url.protocol !== "https:" || url.password || url.port) return null;
	const segments = url.pathname.split("/").filter(Boolean);
	const host = url.hostname.toLowerCase();
	let organization;
	let project;
	let repository;
	let path;
	if (host === "dev.azure.com") {
		[organization] = segments;
		path = segments.slice(1);
	} else if (host.endsWith(LEGACY_HOST_SUFFIX)) {
		const hostOrganization = host.slice(0, -LEGACY_HOST_SUFFIX.length);
		const offset = segments[0]?.toLowerCase() === "defaultcollection" ? 1 : 0;
		if (!hostOrganization) return null;
		organization = hostOrganization;
		path = segments.slice(offset);
	} else {
		return null;
	}
	let repositoryIndex;
	if (path[0]?.toLowerCase() === "_git" && path[1]) {
		repositoryIndex = 1;
	} else if (path[1]?.toLowerCase() === "_git" && path[2]) {
		project = path[0];
		repositoryIndex = 2;
	} else if (path[0] && !path[0].startsWith("_")) {
		project = path[0];
	}
	if (repositoryIndex !== undefined) {
		if (path[repositoryIndex].toLowerCase() === "_optimized") {
			repositoryIndex += 1;
			if (!path[repositoryIndex]) return null;
		}
		repository = path[repositoryIndex];
	}
	if (!organization) return null;
	const decodedOrganization = decodeSegment(organization);
	const decodedUsername = url.username
		? decodeSegment(url.username)
		: undefined;
	const decodedProject =
		project === undefined ? undefined : decodeSegment(project);
	const decodedRepository =
		repository === undefined ? undefined : decodeSegment(repository);
	if (
		decodedOrganization === null ||
		decodedUsername === null ||
		decodedProject === null ||
		decodedRepository === null ||
		(decodedUsername !== undefined &&
			(host !== "dev.azure.com" ||
				decodedUsername.toLocaleLowerCase() !==
					decodedOrganization.toLocaleLowerCase()))
	)
		return null;
	return {
		organization: decodedOrganization,
		...(decodedProject ? { project: decodedProject } : {}),
		...(decodedRepository ? { repository: decodedRepository } : {}),
	};
}
