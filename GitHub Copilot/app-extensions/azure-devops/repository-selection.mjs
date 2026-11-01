const invalidSelection =
	"The extension returned an invalid repository selection.";

/**
 * Project the Azure DevOps picker result into the provider-neutral descriptor
 * consumed by the app-owned repository flow.
 * @param {unknown} value
 */
export function createCloneDescriptor(value) {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some(
			(key) =>
				!["account", "organization", "project", "repository"].includes(key),
		)
	) {
		throw new Error(invalidSelection);
	}
	const selection = value;
	const choice = (key) => {
		const field = selection[key];
		if (
			!field ||
			typeof field !== "object" ||
			Array.isArray(field) ||
			Object.keys(field).some((name) => !["id", "name"].includes(name))
		) {
			throw new Error(invalidSelection);
		}
		const { id, name } = field;
		if (
			typeof id !== "string" ||
			typeof name !== "string" ||
			!id ||
			!name.trim() ||
			id.length > 2048 ||
			name.length > 512
		) {
			throw new Error(invalidSelection);
		}
		return { id, name };
	};
	const account = choice("account");
	const organization = choice("organization");
	const project = choice("project");
	const repository = choice("repository");
	const guidPattern =
		/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
	const projectParts = project.id.split("/");
	const repositoryParts = repository.id.split("/");
	const usesHierarchicalIds =
		projectParts.length !== 1 || repositoryParts.length !== 1;
	if (usesHierarchicalIds) {
		if (
			!guidPattern.test(organization.id) ||
			projectParts.length !== 2 ||
			projectParts[0] !== organization.id ||
			!guidPattern.test(projectParts[1]) ||
			repositoryParts.length !== 3 ||
			repositoryParts.slice(0, 2).join("/") !== project.id ||
			!guidPattern.test(repositoryParts[2])
		) {
			throw new Error(invalidSelection);
		}
	}
	const segment = (name) => {
		if (name === "." || name === ".." || /[/\\]/.test(name)) {
			throw new Error(invalidSelection);
		}
		return encodeURIComponent(name);
	};
	const authority = `https://dev.azure.com/${segment(organization.name)}`;
	const projectId = projectParts.at(-1);
	const repositoryId = repositoryParts.at(-1);
	return {
		accountId: account.id,
		authority,
		repositoryId,
		cloneUrl: `${authority}/${segment(projectId)}/_git/${segment(repositoryId)}`,
		displayName: repository.name,
	};
}
