// @vitest-environment node
import { randomUUID } from "node:crypto";
import { getHost } from "@github/copilot-app";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	createActionTelemetry,
	createCompletedActionTelemetry,
	isActionReport,
	safeActionError,
} from "./action-telemetry.mjs";
import activate from "./app.mjs";
import { createNativeRepositoryCatalog } from "./repository-catalog.mjs";
import {
	createPickerState,
	matchesRepositoryResult,
	PickerInputError,
} from "./repository-picker-state.mjs";
import { createCloneDescriptor } from "./repository-selection.mjs";
import { parseAzureDevOpsRepositoryUrl } from "./repository-url.mjs";

vi.mock("@github/copilot-app", () => ({ getHost: vi.fn() }));

test.each([
	[
		"https://dev.azure.com/Juniper%20example/Studio/_git/service",
		{
			organization: "Juniper example",
			project: "Studio",
			repository: "service",
		},
	],
	[
		"https://juniper-example@dev.azure.com/juniper-example/Studio/_git/service",
		{
			organization: "juniper-example",
			project: "Studio",
			repository: "service",
		},
	],
	[
		"https://juniper-example.visualstudio.com/Studio/_git/service",
		{
			organization: "juniper-example",
			project: "Studio",
			repository: "service",
		},
	],
	[
		"https://juniper-example.visualstudio.com/defaultCOLLECTION/Studio/_git/service?path=%2FREADME.md#version=GBmain",
		{
			organization: "juniper-example",
			project: "Studio",
			repository: "service",
		},
	],
	["https://mseng.visualstudio.com/", { organization: "mseng" }],
	[
		"https://mseng.visualstudio.com/AzureDevOps/",
		{ organization: "mseng", project: "AzureDevOps" },
	],
	[
		"https://mseng.visualstudio.com/AzureDevOps/_workitems/edit/2463396/",
		{ organization: "mseng", project: "AzureDevOps" },
	],
	[
		"https://mseng.visualstudio.com/_git/AzureDevOps",
		{ organization: "mseng", repository: "AzureDevOps" },
	],
	["https://dev.azure.com/mseng", { organization: "mseng" }],
	[
		"https://dev.azure.com/mseng/AzureDevOps/_build/results?buildId=42",
		{ organization: "mseng", project: "AzureDevOps" },
	],
	[
		"https://dev.azure.com/mseng/_git/AzureDevOps",
		{ organization: "mseng", repository: "AzureDevOps" },
	],
	[
		"https://dev.azure.com/mseng/_git/_optimized/AzureDevOps",
		{ organization: "mseng", repository: "AzureDevOps" },
	],
	[
		"https://mseng.visualstudio.com/DefaultCollection/_git/_optimized/AzureDevOps",
		{ organization: "mseng", repository: "AzureDevOps" },
	],
	[
		"https://juniper-example.visualstudio.com/DefaultCollection/Developer%20Tools/_git/_optimized/Widget%20Kit.git",
		{
			organization: "juniper-example",
			project: "Developer Tools",
			repository: "Widget Kit.git",
		},
	],
])("parses an Azure DevOps repository URL: %s", (url, expected) => {
	expect(parseAzureDevOpsRepositoryUrl(url)).toEqual(expected);
});

test.each([
	null,
	"",
	"not a URL",
	"http://dev.azure.com/org/project/_git/repo",
	"https://user@dev.azure.com/org/project/_git/repo",
	"https://org:secret@dev.azure.com/org/project/_git/repo",
	"https://org@juniper-example.visualstudio.com/project/_git/repo",
	"https://dev.azure.com:8443/org/project/_git/repo",
	"https://dev.azure.com.evil.example/org/project/_git/repo",
	"https://visualstudio.com/project/_git/repo",
	"https://dev.azure.com/org%2Fother/project/_git/repo",
	"https://dev.azure.com/org/%E0%A4%A/_git/repo",
	"https://dev.azure.com/org/project/_git/_optimized",
	"https://org.visualstudio.com/DefaultCollection/project/_git/_optimized/",
	"https://org.visualstudio.com/project/_git/_optimized/repo%2Fother",
	"https://user@dev.azure.com/org/project/_git/_optimized/repo",
	"https://dev.azure.com/org/project/_git/_optimized/%E0%A4%A",
])("rejects a non-repository Azure DevOps URL: %j", (url) => {
	expect(parseAzureDevOpsRepositoryUrl(url)).toBeNull();
});

test.each([
	"https://juniper-example.visualstudio.com/DefaultCollection/Studio/_git/_optimized/service",
	"https://juniper-example.visualstudio.com/Studio/_git/_optimized/service",
	"https://dev.azure.com/juniper-example/Studio/_git/_optimized/service",
	"https://dev.azure.com/juniper-example/Studio/_git/_OPTIMIZED/service/",
])("resolves the actual repository from an optimized URL: %s", async (url) => {
	const { authentication, ids, adoFetch } = nativeAuthentication();
	const source = createPickerState(
		createNativeRepositoryCatalog(authentication, adoFetch),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		adoFetch.mockClear();
		adoFetch.mockResolvedValueOnce(
			Response.json({
				id: ids.repository,
				name: "service",
				project: { id: ids.project, name: "Studio" },
			}),
		);
		source.change({ type: "url", value: url, sequence: 1 });
		await expect(
			source.validateQuickFill(parseAzureDevOpsRepositoryUrl(url)),
		).resolves.toEqual({ repositoryUrl: url });
		expect(adoFetch).toHaveBeenCalledExactlyOnceWith(
			"https://dev.azure.com/juniper-example/Studio/_apis/git/repositories/service?api-version=7.1",
			expect.objectContaining({ method: "GET", redirect: "error" }),
		);
		expect(source.read().urlSelection).toMatchObject({
			account: { id: "opaque-account" },
			organization: { name: "juniper-example" },
			project: { id: ids.project, name: "Studio" },
			repository: { id: ids.repository, name: "service" },
		});
	} finally {
		await source.close();
	}
});

beforeEach(() => {
	vi.mocked(getHost).mockReset();
});

const organizations = [
	{ id: "org-juniper", name: "Juniper example" },
	{ id: "org-harbor", name: "Harbor example" },
];
const projects = [
	{ id: "project-studio", name: "Studio" },
	{ id: "project-flight", name: "Flight" },
];
const disposers = [];

function flatResult(organization, index = 0, project = "Studio") {
	const id = `${organization.id}/project/repository-${index}`;
	return {
		id,
		name: `${organization.name}/${project}/service${index}`,
		organization,
		project: { id: `${organization.id}/project`, name: project },
		repository: { id, name: `service${index}` },
	};
}

test.each([
	["jun/stu", true],
	["JUN/STU/SERV", true],
	["/stu/", true],
	["service", true],
	["Juniper example", true],
	["jun/flight", false],
	["jun/stu/hand", false],
	["jun/stu/serv/extra", false],
])("flat search matches partial segments: %s", (query, expected) => {
	expect(matchesRepositoryResult(flatResult(organizations[0]), query)).toBe(
		expected,
	);
});

test.each(["mseng", "MSENG", "\uff4d\uff53\uff45\uff4e\uff47"])(
	"an exact organization filter %s takes precedence over earlier substring matches",
	async (query) => {
		const orgs = [
			{ id: "other", name: "a-mseng" },
			{ id: "exact", name: "mseng" },
		];
		const listOrganizationRepositories = vi.fn(async ({ organization }) => {
			const result = flatResult(organization, 0, "AzureDevOps");
			result.repository.name = "AzureDevOps";
			return [result];
		});
		const source = createPickerState(
			catalog({
				listOrganizations: async () => orgs,
				listProjects: async ({ organization }) => [
					{
						id: `${organization.id}/project`,
						name: "AzureDevOps",
					},
				],
				listOrganizationRepositories,
			}),
		);
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(
				listOrganizationRepositories.mock.calls[0][0].organization.id,
			).toBe("other");
			const search = source.change({
				type: "search",
				sequence: 1,
				value: `${query}/AzureDevOps/AzureDevOps`,
			});
			await search.completion;
			expect(source.read().results.options).toHaveLength(1);
			expect(source.read().results.options[0].organization.id).toBe("exact");
			expect(
				listOrganizationRepositories.mock.calls.map(
					([input]) => input.organization.id,
				),
			).toEqual(["other", "exact"]);
		} finally {
			await source.close();
		}
	},
);

test("flat discovery caps the default organization list, then scans and caches the full selected project", async () => {
	const listOrganizationRepositories = vi.fn(async ({ organization }) =>
		Array.from({ length: 150 }, (_, index) => flatResult(organization, index)),
	);
	const source = createPickerState(catalog({ listOrganizationRepositories }));
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(source.read().results.options).toHaveLength(100);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		source.change({ type: "search", sequence: 1, value: "jun/stu/service149" });
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(
			source.read().results.options.map((item) => item.repository.name),
		).toEqual(["service149"]);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		source.change({ type: "search", sequence: 2, value: "jun/stu/service99" });
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(
			source.read().results.options.map((item) => item.repository.name),
		).toEqual(["service99"]);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		source.change({
			type: "choose-result",
			sequence: 3,
			id: source.read().results.options[0].id,
		});
		const queries = Object.fromEntries(
			["organization", "project", "repository"].map((name) => [
				name,
				source.read().fields[name].query,
			]),
		);
		source.change({ type: "confirm", sequence: 4, queries });
		expect(source.read().selection).toEqual({
			organization: organizations[0],
			project: { id: "org-juniper/project", name: "Studio" },
			repository: {
				id: "org-juniper/project/repository-99",
				name: "service99",
			},
		});
		source.change({ type: "search", sequence: 5, value: "har/stu/service99" });
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(source.read().results.options[0].organization).toEqual(
			organizations[1],
		);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(3);
		source.change({ type: "search", sequence: 6, value: "jun/stu/service99" });
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(3);
	} finally {
		await source.close();
	}
});

test("a URL draft clears a prior flat selection without running repository discovery", async () => {
	const listProjects = vi.fn().mockResolvedValue(projects);
	const listOrganizationRepositories = vi.fn(async ({ organization }) => [
		flatResult(organization),
	]);
	const source = createPickerState(
		catalog({ listProjects, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		source.change({
			type: "choose-result",
			sequence: 1,
			id: source.read().results.options[0].id,
		});
		const draft = source.change({
			type: "search",
			sequence: 2,
			value: "https://dev.azure.com/Juniper%20example/Studio/_git/service",
		});
		expect(source.read().results.status).toBe("ready");
		await draft.completion;
		expect(source.read().fields.repository.selected).toBeNull();
		expect(source.read().results).toMatchObject({
			status: "ready",
			options: [],
			query: "https://dev.azure.com/Juniper%20example/Studio/_git/service",
		});
		expect(listProjects).not.toHaveBeenCalled();
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		await source.change({
			type: "search",
			sequence: 3,
			value: "service",
		}).completion;
		expect(source.read().results.options).toHaveLength(1);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
	} finally {
		await source.close();
	}
});

test("project-qualified search scopes before the repository cap and caches distinct projects without paging or backfill", async () => {
	const listProjects = vi.fn(async () => [
		{ id: "a-studio", name: "A-Studio" },
		...projects,
	]);
	const listOrganizationRepositories = vi.fn(
		async ({ organization, project }) => {
			if (!project)
				return Array.from({ length: 150 }, (_, index) =>
					flatResult(organization, index, "Flight"),
				);
			const result = flatResult(organization, 0, project.name);
			result.project = project;
			result.id = `${project.id}/repo`;
			result.repository.id = result.id;
			return [result];
		},
	);
	const source = createPickerState(
		catalog({ listProjects, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		const first = source.change({
			type: "search",
			sequence: 1,
			value: "jun/STUDIO/service0",
		});
		await first.completion;
		expect(source.read().results.options).toHaveLength(1);
		expect(source.read().results.options[0].project).toEqual(projects[0]);
		expect(listProjects.mock.calls[0][0]).toMatchObject({
			bounded: true,
			organization: organizations[0],
		});
		await source.change({
			type: "search",
			sequence: 2,
			value: "jun/studio/missing",
		}).completion;
		expect(source.read().results.options).toEqual([]);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		await source.change({
			type: "search",
			sequence: 3,
			value: "jun/flight/service0",
		}).completion;
		expect(source.read().results.options[0].project).toEqual(projects[1]);
		await source.change({
			type: "search",
			sequence: 4,
			value: "jun/studio/service0",
		}).completion;
		expect(source.read().results.options[0].project).toEqual(projects[0]);
		expect(listProjects).toHaveBeenCalledTimes(1);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(3);
	} finally {
		await source.close();
	}
});

test("a complete path resolves the named repository outside enumeration caps and reuses the exact lookup across case changes", async () => {
	const listOrganizationRepositories = vi.fn(
		async ({ organization, project }) =>
			Array.from({ length: 150 }, (_, index) =>
				flatResult(organization, index, project?.name ?? "Studio"),
			),
	);
	const listProjects = vi
		.fn()
		.mockResolvedValue([{ id: "project-outside", name: "Outside" }]);
	const findRepository = vi.fn(async ({ organization }) =>
		flatResult(organization, 149, "Outside"),
	);
	const source = createPickerState(
		catalog({ listOrganizationRepositories, listProjects, findRepository }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Outside/service149",
		}).completion;
		expect(source.read().results.options).toHaveLength(1);
		expect(source.read().results.options[0].repository.name).toBe("service149");
		await source.change({
			type: "search",
			sequence: 2,
			value: "JUNIPER EXAMPLE/OUTSIDE/SERVICE149",
		}).completion;
		expect(source.read().results.options[0].repository.name).toBe("service149");
		expect(findRepository).toHaveBeenCalledTimes(1);
		expect(listProjects).not.toHaveBeenCalled();
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		source.change({
			type: "choose-result",
			sequence: 3,
			id: source.read().results.options[0].id,
		});
		const queries = Object.fromEntries(
			["organization", "project", "repository"].map((name) => [
				name,
				source.read().fields[name].query,
			]),
		);
		source.change({ type: "confirm", sequence: 4, queries });
		expect(source.read().selection.repository.name).toBe("service149");
	} finally {
		await source.close();
	}
});

test("exact lookup misses are cached and retain partial filtering of the bounded project catalog", async () => {
	const findRepository = vi.fn().mockResolvedValue(null);
	const listProjects = vi.fn().mockResolvedValue(projects);
	const listOrganizationRepositories = vi.fn(async ({ organization }) => [
		flatResult(organization, 90),
	]);
	const source = createPickerState(
		catalog({ findRepository, listProjects, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Studio/service9",
		}).completion;
		expect(source.read().results.options[0].repository.name).toBe("service90");
		await source.change({
			type: "search",
			sequence: 2,
			value: "JUNIPER EXAMPLE/STUDIO/SERVICE9",
		}).completion;
		expect(source.read().results.options[0].repository.name).toBe("service90");
		expect(findRepository).toHaveBeenCalledTimes(1);
		expect(listProjects).toHaveBeenCalledTimes(1);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
	} finally {
		await source.close();
	}
});

test.each([0, 149])(
	"a complete path includes partial siblings without duplicating the exact match at catalog position %i",
	async (exactPosition) => {
		const named = (organization, index, name) => {
			const result = flatResult(organization, index);
			return {
				...result,
				name: `${organization.name}/Studio/${name}`,
				repository: { ...result.repository, name },
			};
		};
		const findRepository = vi.fn(async ({ organization }) =>
			named(organization, exactPosition, "service"),
		);
		const listProjects = vi.fn();
		const listOrganizationRepositories = vi.fn(async ({ organization }) =>
			Array.from({ length: 150 }, (_, index) =>
				named(
					organization,
					index,
					index === exactPosition
						? "service"
						: index === 1
							? "service.skills"
							: `unrelated${index}`,
				),
			),
		);
		const source = createPickerState(
			catalog({ findRepository, listProjects, listOrganizationRepositories }),
		);
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			await source.change({
				type: "search",
				sequence: 1,
				value: "Juniper example/Studio/service",
			}).completion;
			expect(
				source.read().results.options.map((item) => item.repository.name),
			).toEqual(["service", "service.skills"]);
			expect(
				new Set(source.read().results.options.map((item) => item.id)).size,
			).toBe(2);
			await source.change({
				type: "search",
				sequence: 2,
				value: "JUNIPER EXAMPLE/STUDIO/SERVICE",
			}).completion;
			expect(
				source.read().results.options.map((item) => item.repository.name),
			).toEqual(["service", "service.skills"]);
			expect(findRepository).toHaveBeenCalledTimes(1);
			expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
			expect(listProjects).not.toHaveBeenCalled();
		} finally {
			await source.close();
		}
	},
);

test("an exact match beyond the enumeration cap shares the 100-result limit with partial matches", async () => {
	const findRepository = vi.fn(async ({ organization }) => {
		const result = flatResult(organization, 150);
		return {
			...result,
			name: `${organization.name}/Studio/service`,
			repository: { ...result.repository, name: "service" },
		};
	});
	const listOrganizationRepositories = vi.fn(async ({ organization }) =>
		Array.from({ length: 150 }, (_, index) => flatResult(organization, index)),
	);
	const source = createPickerState(
		catalog({ findRepository, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Studio/service",
		}).completion;
		const results = source.read().results.options;
		expect(results).toHaveLength(100);
		expect(results[0].repository.name).toBe("service");
		expect(results.at(-1).repository.name).toBe("service98");
		expect(new Set(results.map((item) => item.id)).size).toBe(100);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		expect(
			listOrganizationRepositories.mock.calls.every(
				([input]) => input.organization.id === organizations[0].id,
			),
		).toBe(true);
	} finally {
		await source.close();
	}
});

test("project search finds late matches, promotes an exact match, and preserves API order for siblings", async () => {
	const findRepository = vi.fn().mockResolvedValue(null);
	const listProjects = vi.fn().mockResolvedValue(projects);
	const listOrganizationRepositories = vi.fn(async ({ organization }) =>
		Array.from({ length: 1500 }, (_, index) => {
			const result = flatResult(organization, index);
			const name =
				index === 1499
					? "skill"
					: index === 1100
						? "skill-z"
						: index === 1150
							? "skill-a"
							: `unrelated${index}`;
			return {
				...result,
				name: `${organization.name}/Studio/${name}`,
				repository: { ...result.repository, name },
			};
		}),
	);
	const source = createPickerState(
		catalog({ findRepository, listProjects, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Studio/skill",
		}).completion;
		expect(
			source.read().results.options.map((item) => item.repository.name),
		).toEqual(["skill", "skill-z", "skill-a"]);
		expect(source.read().results.truncated).toBe(false);
		await source.change({
			type: "search",
			sequence: 2,
			value: "JUNIPER EXAMPLE/STUDIO/SKILL",
		}).completion;
		expect(
			source.read().results.options.map((item) => item.repository.name),
		).toEqual(["skill", "skill-z", "skill-a"]);
		expect(findRepository).toHaveBeenCalledTimes(1);
		expect(listProjects).toHaveBeenCalledTimes(1);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
	} finally {
		await source.close();
	}
});

test.each([99, 100, 101])(
	"project result truncation depends on matching count %i, not enumeration size",
	async (count) => {
		const source = createPickerState(
			catalog({
				listOrganizationRepositories: async ({ organization }) =>
					Array.from({ length: 1100 + count }, (_, index) => {
						const result = flatResult(organization, index);
						const name = index < 1100 ? `unrelated${index}` : `match${index}`;
						return {
							...result,
							name: `${organization.name}/Studio/${name}`,
							repository: { ...result.repository, name },
						};
					}),
			}),
		);
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			await source.change({
				type: "search",
				sequence: 1,
				value: "jun/Studio/match",
			}).completion;
			expect(source.read().results.options).toHaveLength(Math.min(count, 100));
			expect(source.read().results.options[0].repository.name).toBe(
				"match1100",
			);
			expect(source.read().results.truncated).toBe(count > 100);
		} finally {
			await source.close();
		}
	},
);

test("rapid complete-path edits debounce into only the final exact request", async () => {
	vi.useFakeTimers();
	const findRepository = vi.fn(async ({ organization }) =>
		flatResult(organization, 149, "Outside"),
	);
	const listProjects = vi.fn();
	const source = createPickerState(
		catalog({
			findRepository,
			listProjects,
			listOrganizationRepositories: async ({ organization }) => [
				flatResult(organization),
			],
		}),
	);
	try {
		await vi.advanceTimersByTimeAsync(300);
		source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Outside/service1",
		});
		await vi.advanceTimersByTimeAsync(150);
		source.change({
			type: "search",
			sequence: 2,
			value: "Juniper example/Outside/service14",
		});
		await vi.advanceTimersByTimeAsync(150);
		source.change({
			type: "search",
			sequence: 3,
			value: "Juniper example/Outside/service149",
		});
		await vi.advanceTimersByTimeAsync(299);
		expect(findRepository).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(findRepository).toHaveBeenCalledTimes(1);
		expect(findRepository.mock.calls[0][0].repository).toBe("service149");
		expect(source.read().results.options[0].repository.name).toBe("service149");
		expect(listProjects).not.toHaveBeenCalled();
	} finally {
		await source.close();
		vi.useRealTimers();
	}
});

test("an exact lookup failure is retryable and never falls through into more enumeration", async () => {
	const findRepository = vi
		.fn()
		.mockRejectedValueOnce(
			Object.assign(new Error("private upstream body"), {
				code: "http",
				status: 429,
				name: "AzureDevOpsCatalogError",
			}),
		)
		.mockImplementation(async ({ organization }) => flatResult(organization));
	const listProjects = vi.fn();
	const source = createPickerState(
		catalog({
			findRepository,
			listProjects,
			listOrganizationRepositories: async ({ organization }) => [
				flatResult(organization),
			],
		}),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Studio/service0",
		}).completion;
		expect(source.read().results.status).toBe("error");
		expect(source.read().results.error).toContain("HTTP 429");
		expect(source.read().results.error).not.toContain("private");
		expect(findRepository).toHaveBeenCalledTimes(1);
		expect(listProjects).not.toHaveBeenCalled();
		await source.change({ type: "retry-search", sequence: 2 }).completion;
		expect(source.read().results.status).toBe("ready");
		expect(source.read().results.options).toHaveLength(1);
		expect(findRepository).toHaveBeenCalledTimes(2);
		expect(listProjects).not.toHaveBeenCalled();
	} finally {
		await source.close();
	}
});

test("closing cancels an in-flight exact lookup and prevents queued exact requests", async () => {
	vi.useFakeTimers();
	const held = deferred();
	let signal;
	const findRepository = vi.fn((input) => {
		signal = input.signal;
		return held.promise;
	});
	const source = createPickerState(
		catalog({
			findRepository,
			listOrganizationRepositories: async ({ organization }) => [
				flatResult(organization),
			],
		}),
	);
	try {
		await vi.advanceTimersByTimeAsync(300);
		const first = source.change({
			type: "search",
			sequence: 1,
			value: "Juniper example/Outside/service149",
		});
		await vi.advanceTimersByTimeAsync(300);
		expect(findRepository).toHaveBeenCalledTimes(1);
		const second = source.change({
			type: "search",
			sequence: 2,
			value: "Juniper example/Outside/service150",
		});
		await vi.advanceTimersByTimeAsync(300);
		expect(findRepository).toHaveBeenCalledTimes(1);
		await source.close();
		expect(signal.aborted).toBe(true);
		held.resolve(flatResult(organizations[0], 149, "Outside"));
		await expect(first.completion).resolves.toEqual([{ status: "cancelled" }]);
		await expect(second.completion).resolves.toEqual([{ status: "cancelled" }]);
		expect(findRepository).toHaveBeenCalledTimes(1);
	} finally {
		await source.close();
		vi.useRealTimers();
	}
});

test("rapid flat edits debounce upstream calls and stale reads cannot overwrite the latest query", async () => {
	vi.useFakeTimers();
	const first = deferred();
	const listOrganizationRepositories = vi.fn(({ organization }) =>
		organization.id === organizations[0].id
			? first.promise
			: Promise.resolve([flatResult(organization)]),
	);
	const source = createPickerState(catalog({ listOrganizationRepositories }));
	try {
		await vi.advanceTimersByTimeAsync(300);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		for (const [index, value] of ["h", "ha", "har/stu"].entries()) {
			source.change({ type: "search", sequence: index + 1, value });
			await vi.advanceTimersByTimeAsync(100);
		}
		await vi.advanceTimersByTimeAsync(300);
		// A new prefix cannot start a concurrent ADO request.
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		first.resolve([flatResult(organizations[0])]);
		await vi.advanceTimersByTimeAsync(0);
		expect(source.read().results).toMatchObject({
			query: "har/stu",
			status: "ready",
			options: [expect.objectContaining({ organization: organizations[1] })],
		});
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
	} finally {
		await source.close();
		vi.useRealTimers();
	}
});

test("closing during project discovery cancels it without starting a repository read", async () => {
	const held = deferred();
	let signal;
	const listOrganizationRepositories = vi.fn(async ({ organization }) => [
		flatResult(organization),
	]);
	const source = createPickerState(
		catalog({
			listOrganizationRepositories,
			listProjects: vi.fn((input) => {
				signal = input.signal;
				return held.promise;
			}),
		}),
	);
	await expect.poll(() => source.read().results.status).toBe("ready");
	source.change({ type: "search", sequence: 1, value: "jun/studio/service" });
	await expect.poll(() => Boolean(signal)).toBe(true);
	await source.close();
	expect(signal.aborted).toBe(true);
	held.resolve(projects);
	expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
});

test("project discovery errors are explicit and retry performs one new project read", async () => {
	const listProjects = vi
		.fn()
		.mockRejectedValueOnce(new Error("private upstream body"))
		.mockResolvedValue(projects);
	const listOrganizationRepositories = vi.fn(async ({ organization }) => [
		flatResult(organization),
	]);
	const source = createPickerState(
		catalog({ listProjects, listOrganizationRepositories }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({
			type: "search",
			sequence: 1,
			value: "jun/studio/service",
		}).completion;
		expect(source.read().results.status).toBe("error");
		expect(source.read().results.error).not.toContain("private");
		expect(listProjects).toHaveBeenCalledTimes(1);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		await source.change({ type: "retry-search", sequence: 2 }).completion;
		expect(source.read().results.status).toBe("ready");
		expect(source.read().results.options).toHaveLength(1);
		expect(listProjects).toHaveBeenCalledTimes(2);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
	} finally {
		await source.close();
	}
});

test.each([
	[0, 0],
	[2, 1],
	[100, 11],
])(
	"flat discovery never tops up a %i-repository organization or its filtered results from another organization",
	async (count, partialCount) => {
		const listOrganizationRepositories = vi.fn(async ({ organization }) =>
			organization.id === organizations[0].id
				? Array.from({ length: count }, (_, index) =>
						flatResult(organization, index),
					)
				: [flatResult(organization, 199)],
		);
		const source = createPickerState(catalog({ listOrganizationRepositories }));
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(source.read().results.options).toHaveLength(count);
			expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
			source.change({ type: "search", sequence: 1, value: "service1" });
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(source.read().results.options).toHaveLength(partialCount);
			expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
			source.change({ type: "search", sequence: 2, value: "service199" });
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(source.read().results.options).toEqual([]);
			expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
			source.change({
				type: "search",
				sequence: 3,
				value: "har/stu/service199",
			});
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(source.read().results.options).toHaveLength(1);
			expect(
				listOrganizationRepositories.mock.calls.map(
					([input]) => input.organization.id,
				),
			).toEqual([organizations[0].id, organizations[1].id]);
		} finally {
			await source.close();
		}
	},
);

test.each(["Harbor example", "harb"])(
	"a bare organization name %j searches that organization without a trailing slash",
	async (value) => {
		const listOrganizationRepositories = vi.fn(async ({ organization }) => [
			flatResult(organization, organization.id === organizations[0].id ? 0 : 1),
		]);
		const source = createPickerState(catalog({ listOrganizationRepositories }));
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			await source.change({ type: "search", sequence: 1, value }).completion;
			expect(source.read().results.options).toEqual([
				expect.objectContaining({ organization: organizations[1] }),
			]);
			expect(
				listOrganizationRepositories.mock.calls.map(
					([input]) => input.organization.id,
				),
			).toEqual([organizations[0].id, organizations[1].id]);
		} finally {
			await source.close();
		}
	},
);

test("bare organization prefixes share the result limit across every matching organization", async () => {
	const harbors = [
		{ id: "org-harbor-large", name: "Harbor large" },
		{ id: "org-harbor-small", name: "Harbor small" },
	];
	const listOrganizationRepositories = vi.fn(async ({ organization }) =>
		Array.from(
			{ length: organization.id === harbors[0].id ? 150 : 1 },
			(_, index) => flatResult(organization, index),
		),
	);
	const source = createPickerState(
		catalog({
			listOrganizations: async () => [organizations[0], ...harbors],
			listOrganizationRepositories,
		}),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({ type: "search", sequence: 1, value: "harbor" })
			.completion;
		const { options, truncated } = source.read().results;
		expect(truncated).toBe(true);
		expect(options.map((option) => option.organization.id)).toEqual([
			...Array(99).fill(harbors[0].id),
			harbors[1].id,
		]);
	} finally {
		await source.close();
	}
});

test("bare organization prefixes search at most 10 organizations, exact names first", async () => {
	const harbors = Array.from({ length: 11 }, (_, index) => ({
		id: `org-harbor-${index}`,
		name: `Harbor ${String(index).padStart(2, "0")}`,
	}));
	const exact = { id: "org-harbor", name: "Harbor" };
	const listOrganizationRepositories = vi.fn(async ({ organization }) => [
		flatResult(organization),
	]);
	const source = createPickerState(
		catalog({
			listOrganizations: async () => [organizations[0], ...harbors, exact],
			listOrganizationRepositories,
		}),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({ type: "search", sequence: 1, value: "harbor" })
			.completion;
		const searched = [exact, ...harbors.slice(0, 9)].map((org) => org.id);
		expect(
			listOrganizationRepositories.mock.calls.map(
				([input]) => input.organization.id,
			),
		).toEqual([organizations[0].id, ...searched]);
		const { options, discoveryLimited } = source.read().results;
		expect(options.map((option) => option.organization.id)).toEqual(searched);
		expect(discoveryLimited).toBe(true);
	} finally {
		await source.close();
	}
});

test("a failing additional organization keeps the other organizations' results", async () => {
	const harbors = [
		{ id: "org-harbor-main", name: "Harbor main" },
		{ id: "org-harbor-secondary", name: "Harbor secondary" },
		{ id: "org-harbor-third", name: "Harbor third" },
	];
	const listOrganizationRepositories = vi.fn(async ({ organization }) => {
		if (organization.id === harbors[1].id)
			throw Object.assign(new Error("Service unavailable"), { status: 503 });
		return [flatResult(organization)];
	});
	const source = createPickerState(
		catalog({
			listOrganizations: async () => harbors,
			listOrganizationRepositories,
		}),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		await source.change({ type: "search", sequence: 1, value: "harbor" })
			.completion;
		const { status, options } = source.read().results;
		expect(status).toBe("ready");
		expect(options.map((option) => option.organization.id)).toEqual([
			harbors[0].id,
			harbors[2].id,
		]);
	} finally {
		await source.close();
	}
});

test("bare organization search reports an error when every organization fails", async () => {
	const harbors = [
		{ id: "org-harbor-main", name: "Harbor main" },
		{ id: "org-harbor-secondary", name: "Harbor secondary" },
	];
	const listOrganizationRepositories = vi.fn(async () => {
		throw Object.assign(new Error("Service unavailable"), { status: 503 });
	});
	const source = createPickerState(
		catalog({
			listOrganizations: async () => harbors,
			listOrganizationRepositories,
		}),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("error");
		await source.change({ type: "search", sequence: 1, value: "harbor" })
			.completion;
		expect(source.read().results.status).toBe("error");
		expect(source.read().results.options).toEqual([]);
	} finally {
		await source.close();
	}
});

test("failed flat discovery stays an error until explicit retry, and close cancels an active read", async () => {
	const listOrganizationRepositories = vi
		.fn()
		.mockRejectedValueOnce(new Error("Discovery unavailable"))
		.mockImplementation(async ({ organization }) => [flatResult(organization)]);
	const source = createPickerState(catalog({ listOrganizationRepositories }));
	try {
		await expect.poll(() => source.read().results.status).toBe("error");
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(1);
		const retry = source.change({ type: "retry-search", sequence: 1 });
		await expect.poll(() => source.read().results.status).toBe("ready");
		expect(await retry.completion).toEqual([
			{ status: "ready", error: undefined },
		]);
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
	} finally {
		await source.close();
	}
	const held = deferred();
	let signal;
	const pending = createPickerState(
		catalog({
			listOrganizationRepositories: vi.fn((input) => {
				signal = input.signal;
				return held.promise;
			}),
		}),
	);
	await expect.poll(() => Boolean(signal)).toBe(true);
	await pending.close();
	expect(signal.aborted).toBe(true);
	held.resolve([flatResult(organizations[0])]);
});

test.each([
	["http", 403, "HTTP 403"],
	["limit", undefined, "size limit"],
	["invalid-response", undefined, "invalid repository catalog"],
	["authentication", undefined, "Could not load repositories"],
	["unknown", undefined, "Could not load repositories"],
])(
	"flat discovery exposes a safe %s error and clears it on recovery",
	async (code, status, message) => {
		const failure = Object.assign(
			new Error("private upstream body and token"),
			{
				name: "AzureDevOpsCatalogError",
				code,
				status,
			},
		);
		const source = createPickerState(
			catalog({
				listOrganizationRepositories: vi
					.fn()
					.mockRejectedValueOnce(failure)
					.mockResolvedValue([]),
			}),
		);
		try {
			await expect.poll(() => source.read().results.status).toBe("error");
			expect(source.read().results.error).toContain(message);
			expect(JSON.stringify(source.read())).not.toContain("private upstream");
			source.change({ type: "search", value: "har/", sequence: 1 });
			expect(source.read().results.error).toBeUndefined();
			await expect.poll(() => source.read().results.status).toBe("ready");
			expect(source.read().results.error).toBeUndefined();
		} finally {
			await source.close();
		}
	},
);

test("a timed-out stale read releases the queue so the current search can complete", async () => {
	vi.useFakeTimers();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockImplementation((delay) => {
			const controller = new AbortController();
			setTimeout(
				() => controller.abort(new DOMException("Timed out", "TimeoutError")),
				delay,
			);
			return controller.signal;
		});
	const held = deferred();
	const listOrganizationRepositories = vi.fn(({ organization }) =>
		organization.id === organizations[0].id
			? held.promise
			: new Promise((resolve) =>
					setTimeout(() => resolve([flatResult(organization)]), 1000),
				),
	);
	const source = createPickerState(catalog({ listOrganizationRepositories }));
	try {
		await vi.advanceTimersByTimeAsync(300);
		source.change({ type: "search", value: "har/stu", sequence: 1 });
		await vi.advanceTimersByTimeAsync(300);
		// The first response is late; both searches must remain bounded.
		await vi.advanceTimersByTimeAsync(30_000);
		expect(source.read().results.status).toBe("loading");
		await vi.advanceTimersByTimeAsync(1000);
		expect(source.read().results.status).toBe("ready");
		expect(listOrganizationRepositories).toHaveBeenCalledTimes(2);
		expect(source.read().results.options[0].organization).toEqual(
			organizations[1],
		);
		held.resolve([flatResult(organizations[0])]);
		await vi.advanceTimersByTimeAsync(0);
		expect(source.read().results.options[0].organization).toEqual(
			organizations[1],
		);
	} finally {
		await source.close();
		timeout.mockRestore();
		vi.useRealTimers();
	}
});

test.each([
	"harbor",
	"missing-organization",
	"missing-project",
	"submitted-repository",
])(
	"native route caches recover after URL validation for %s",
	async (target) => {
		const { authentication, ids, adoFetch } = nativeAuthentication();
		const flight = {
			id: "11223344-5566-7788-99aa-bbccddeeff00",
			name: "Flight",
		};
		const studio = { id: ids.project, name: "Studio" };
		adoFetch.mockImplementation(async (url) => {
			const path = new URL(url).pathname;
			if (path.endsWith("/profiles/me"))
				return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
			if (path.endsWith("/accounts"))
				return Response.json({
					count: 2,
					value: [
						{ accountId: ids.organization, accountName: "juniper" },
						{
							accountId: "122f65e4-d483-4d07-8a91-74265e029d5e",
							accountName: "harbor",
						},
					],
				});
			if (path.endsWith("/projects"))
				return Response.json({ count: 2, value: [studio, flight] });
			const project = path.includes(flight.id) ? flight : studio;
			if (path.endsWith("/git/repositories/service"))
				return Response.json({ id: ids.repository, name: "service", project });
			return Response.json({
				count: 1,
				value: [{ id: ids.repository, name: "service", project }],
			});
		});
		const source = createPickerState(
			createNativeRepositoryCatalog(authentication, adoFetch),
		);
		try {
			await expect.poll(() => source.read().results.status).toBe("ready");
			await source.change({ type: "search", sequence: 1, value: "jun/Studio" })
				.completion;
			expect(source.read().results.options[0].project.name).toBe("Studio");
			await source.change({
				type: "search",
				sequence: 2,
				value: `https://dev.azure.com/${target}/Studio`,
			}).completion;
			if (target === "submitted-repository")
				await source.change({
					type: "url",
					sequence: 3,
					value: "https://dev.azure.com/harbor/Studio/_git/service",
					reset: true,
				}).completion;
			const validation = source.validateQuickFill({
				organization: ["missing-project", "submitted-repository"].includes(
					target,
				)
					? "harbor"
					: target,
				project: target === "missing-project" ? "Missing" : "Studio",
				...(target === "submitted-repository" ? { repository: "service" } : {}),
			});
			if (["harbor", "submitted-repository"].includes(target)) await validation;
			else await expect(validation).rejects.toThrow("not found");
			await source.change({ type: "search", sequence: 4, value: "jun/Flight" })
				.completion;
			await expect.poll(() => source.read().results.status).not.toBe("loading");
			expect(source.read().results).toMatchObject({
				status: "ready",
				options: [
					expect.objectContaining({
						project: expect.objectContaining({ name: "Flight" }),
					}),
				],
			});
			expect(
				adoFetch.mock.calls.filter(
					([url]) => new URL(url).pathname === "/juniper/_apis/projects",
				),
			).toHaveLength(2);
		} finally {
			await source.close();
		}
	},
);

test("unified URL drafts retain the URL allowance without relaxing identity or plain-search limits", async () => {
	const source = createPickerState(
		catalog({ listOrganizationRepositories: async () => [] }),
	);
	try {
		await expect.poll(() => source.read().results.status).toBe("ready");
		const url = `https://dev.azure.com/juniper/Studio/_git/service?path=${"a".repeat(700)}`;
		await source.change({ type: "search", sequence: 1, value: url }).completion;
		expect(source.read().results.query).toBe(url);
		expect(() =>
			source.change({ type: "search", sequence: 2, value: "a".repeat(513) }),
		).toThrow("too long");
		expect(() =>
			source.change({
				type: "query",
				sequence: 2,
				field: "organization",
				value: "a".repeat(513),
			}),
		).toThrow();
		expect(() =>
			source.change({
				type: "search",
				sequence: 2,
				value: `https://${"a".repeat(4096)}`,
			}),
		).toThrow("too long");
	} finally {
		await source.close();
	}
});

function catalog(overrides = {}) {
	return {
		listOrganizations: async () => organizations,
		listProjects: async () => projects,
		listRepositories: async ({ organization, project }) => [
			{ id: `${organization.id}-${project.id}-service`, name: "service" },
		],
		...overrides,
	};
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

async function start(
	source,
	repositoryDiscovery,
	authentication,
	reportCanvasAction,
) {
	let picker;
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication,
		reportCanvasAction,
		async registerProvider() {
			return () => {};
		},
		async registerCanvas(id, handlers) {
			if (id === "repository-picker") picker = handlers;
			return () => {};
		},
	});
	const dispose = await activate({ catalog: source, repositoryDiscovery });
	disposers.push(dispose);
	async function open(completionOwner = "guest") {
		const instanceId = randomUUID();
		const opened = await picker.open({
			instanceId,
			input: {},
			completionOwner,
		});
		const endpoint = opened.url.replace("/canvases/", "/instances/");
		let sequence = 0;
		const read = async () => (await fetch(endpoint)).json();
		const post = async (command, nextSequence = ++sequence) =>
			fetch(endpoint, {
				method: "POST",
				headers: {
					Origin: new URL(endpoint).origin,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ...command, sequence: nextSequence }),
			});

		async function change(command) {
			const response = await post(command);
			expect(response.status).toBe(200);
			return response.json();
		}
		async function choose(field, id) {
			await expect.poll(read).toMatchObject({
				fields: { [field]: { status: "ready" } },
			});
			return change({ type: "choose", field, id });
		}
		return { instanceId, opened, endpoint, read, post, change, choose };
	}
	return { picker, open };
}

test("native picker emits one cancelled load on supersession and ignores its late result", async () => {
	const report = vi.fn();
	const previous = deferred();
	const first = "11111111-1111-1111-1111-111111111111";
	const second = "22222222-2222-2222-2222-222222222222";
	const adoFetch = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ id: first }))
		.mockResolvedValueOnce(
			Response.json({
				count: 2,
				value: [
					{ accountId: first, accountName: "First" },
					{ accountId: second, accountName: "Second" },
				],
			}),
		)
		.mockReturnValueOnce(previous.promise)
		.mockResolvedValueOnce(Response.json({ count: 0, value: [] }));
	const requestFetch = globalThis.fetch;
	// Keep loopback transport real; only control the external ADO boundary.
	vi.spyOn(globalThis, "fetch").mockImplementation((url, init) =>
		String(url).startsWith("https://")
			? adoFetch(url, init)
			: requestFetch(url, init),
	);
	const getAccessToken = vi.fn(async () => ({ accessToken: "fixture-token" }));
	const { picker, open } = await start(
		undefined,
		undefined,
		{
			listAccounts: async () => [{ id: "private-account", name: "Private" }],
			getAccessToken,
		},
		report,
	);
	const canvas = await open();
	await canvas.choose("organization", first);
	await vi.waitFor(() => expect(adoFetch).toHaveBeenCalledTimes(3));
	for (const [, init] of adoFetch.mock.calls) {
		expect(init.redirect).toBe("error");
		expect(init.headers.Authorization).toBe(`Bearer ${"fixture-token"}`);
	}
	expect(getAccessToken).toHaveBeenCalledWith({
		accountId: "private-account",
		resource: "azure-devops",
	});
	await canvas.choose("organization", second);
	await expect.poll(canvas.read).toMatchObject({
		fields: { project: { status: "ready", options: [] } },
	});
	const finishes = () =>
		report.mock.calls
			.map(([value]) => value)
			.filter(
				(value) =>
					value.action === "load" &&
					value.stage === "project" &&
					value.phase === "finished",
			);
	await vi.waitFor(() => expect(finishes()).toHaveLength(2));
	expect(
		finishes()
			.map(({ result }) => result)
			.sort(),
	).toEqual(["cancelled", "success"]);
	previous.resolve(
		Response.json({ count: 1, value: [{ id: first, name: "Stale" }] }),
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(finishes()).toHaveLength(2);
	expect((await canvas.read()).fields.project.options).toEqual([]);
	await picker.onClose({ instanceId: canvas.instanceId });
	expect(finishes()).toHaveLength(2);
});

test("picker state exposes neutral outcomes for exactly the loads caused by a command", async () => {
	const previous = deferred();
	const replacement = deferred();
	const state = createPickerState(
		catalog({
			listProjects: ({ organization }) =>
				organization.id === organizations[0].id
					? previous.promise
					: replacement.promise,
		}),
	);
	try {
		await expect
			.poll(() => state.read().fields.organization.status)
			.toBe("ready");
		const first = state.change({
			type: "choose",
			field: "organization",
			id: organizations[0].id,
			sequence: 1,
		});
		expect(first.state.fields.project.status).toBe("loading");
		const second = state.change({
			type: "choose",
			field: "organization",
			id: organizations[1].id,
			sequence: 2,
		});
		await expect(first.completion).resolves.toMatchObject([
			{ status: "cancelled" },
		]);
		previous.resolve(projects);
		replacement.resolve([]);
		await expect(second.completion).resolves.toEqual([{ status: "ready" }]);
		expect(state.read().fields.project.options).toEqual([]);
		const retry = state.change({
			type: "retry",
			field: "project",
			sequence: 3,
		});
		await expect(retry.completion).resolves.toEqual([{ status: "ready" }]);
	} finally {
		await state.close();
	}
});

test("instance state GET waits for a newer picker revision", async () => {
	const organizationsReady = deferred();
	const { open } = await start(
		catalog({ listOrganizations: () => organizationsReady.promise }),
	);
	const canvas = await open();
	const initial = await canvas.read();
	expect(initial.fields.organization.status).toBe("loading");
	let settled = false;
	const observing = fetch(
		`${canvas.endpoint}?afterRevision=${initial.revision}`,
	).then(async (response) => {
		expect(response.status).toBe(200);
		settled = true;
		return response.json();
	});
	await new Promise((resolve) => setTimeout(resolve, 25));
	expect(settled).toBe(false);
	organizationsReady.resolve(organizations);
	await expect(observing).resolves.toMatchObject({
		revision: expect.any(Number),
		fields: { organization: { status: "ready" } },
	});
	expect((await observing).revision).toBeGreaterThan(initial.revision);
});

test.each(["", "-1", "1.5", "not-a-revision"])(
	"instance state GET rejects invalid afterRevision values: %j",
	async (afterRevision) => {
		const { open } = await start(catalog());
		const canvas = await open();
		const response = await fetch(
			`${canvas.endpoint}?afterRevision=${encodeURIComponent(afterRevision)}`,
		);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid picker state revision.",
		});
	},
);

test("closing picker state aborts and settles repository URL resolution", async () => {
	const pending = deferred();
	let signal;
	const state = createPickerState(
		catalog({
			resolveRepositoryUrl: (input) => {
				signal = input.signal;
				return pending.promise;
			},
		}),
	);
	await expect
		.poll(() => state.read().fields.organization.status)
		.toBe("ready");
	state.change({
		type: "url",
		value: "https://dev.azure.com/juniper/_git/service",
		sequence: 1,
	});
	const resolution = state.validateQuickFill({
		organization: "juniper",
		repository: "service",
	});
	const rejected = expect(resolution).rejects.toThrow(/aborted/i);
	await expect.poll(() => signal?.aborted).toBe(false);
	await state.close();
	expect(signal.aborted).toBe(true);
	await rejected;
});

test("aborting a validation request aborts its repository lookup", async () => {
	const pending = deferred();
	let signal;
	const { open } = await start(
		catalog({
			resolveRepositoryUrl: (input) => {
				signal = input.signal;
				return pending.promise;
			},
		}),
	);
	const canvas = await open();
	await canvas.change({
		type: "url",
		value: "https://dev.azure.com/juniper/_git/service",
	});
	const controller = new AbortController();
	const resolution = fetch(`${canvas.endpoint}/validate`, {
		method: "POST",
		headers: {
			Origin: new URL(canvas.endpoint).origin,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ organization: "juniper", repository: "service" }),
		signal: controller.signal,
	});
	await expect.poll(() => signal?.aborted).toBe(false);
	controller.abort();
	await expect(resolution).rejects.toThrow(/aborted/i);
	await expect.poll(() => signal?.aborted).toBe(true);
});

test.each([
	[
		Object.assign(new Error("private auth detail"), {
			name: "AzureDevOpsCatalogError",
			code: "authentication",
		}),
		"Azure DevOps could not resolve this repository. Try again.",
	],
	[
		Object.assign(new Error("private forbidden detail"), {
			name: "AzureDevOpsCatalogError",
			code: "http",
			status: 403,
		}),
		"Your Microsoft account does not have access (HTTP 403). Check its Azure DevOps permissions.",
	],
	[
		Object.assign(new Error("private missing detail"), {
			name: "AzureDevOpsCatalogError",
			code: "http",
			status: 404,
		}),
		"This repository was not found in the selected organization.",
	],
	[
		Object.assign(new Error("private network detail"), {
			name: "AzureDevOpsCatalogError",
			code: "network",
		}),
		"Could not reach Azure DevOps. Check your connection and try again.",
	],
	[
		new DOMException("private timeout detail", "TimeoutError"),
		"Repository lookup timed out. Check your connection and try again.",
	],
	[
		Object.assign(new Error("private native timeout detail"), {
			name: "AzureDevOpsCatalogError",
			code: "timeout",
		}),
		"Repository lookup timed out. Check your connection and try again.",
	],
	[
		Object.assign(new Error("private service detail"), {
			name: "AzureDevOpsCatalogError",
			code: "http",
			status: 500,
		}),
		"Azure DevOps could not resolve this repository. Try again.",
	],
])(
	"normalizes repository URL resolution failures: %s",
	async (failure, message) => {
		const state = createPickerState(
			catalog({
				resolveRepositoryUrl: async () => {
					throw failure;
				},
			}),
		);
		try {
			await expect
				.poll(() => state.read().fields.organization.status)
				.toBe("ready");
			state.change({
				type: "url",
				value: "https://dev.azure.com/juniper/_git/service",
				sequence: 1,
			});
			const error = await state
				.validateQuickFill({ organization: "juniper", repository: "service" })
				.catch((reason) => reason);
			expect(error).toBeInstanceOf(PickerInputError);
			expect(error).toMatchObject({ message, status: 400 });
		} finally {
			await state.close();
		}
	},
);

test("preserves unexpected repository URL resolution failures", async () => {
	const failure = new Error("unexpected implementation failure");
	const state = createPickerState(
		catalog({
			resolveRepositoryUrl: async () => {
				throw failure;
			},
		}),
	);
	try {
		await expect
			.poll(() => state.read().fields.organization.status)
			.toBe("ready");
		state.change({
			type: "url",
			value: "https://dev.azure.com/juniper/_git/service",
			sequence: 1,
		});
		await expect(
			state.validateQuickFill({
				organization: "juniper",
				repository: "service",
			}),
		).rejects.toBe(failure);
	} finally {
		await state.close();
	}
});

test("completed-only guest telemetry sends once with duration and no start request", () => {
	const report = vi.fn();
	const telemetry = createCompletedActionTelemetry(report);
	const action = telemetry.start("copy_link", "link");
	expect(report).not.toHaveBeenCalled();
	action.finish("failure", { errorCode: "clipboard" });
	action.finish("success");
	expect(report).toHaveBeenCalledTimes(1);
	expect(report.mock.calls[0][0]).toMatchObject({
		phase: "finished",
		action: "copy_link",
		stage: "link",
		result: "failure",
		errorCode: "clipboard",
		durationMs: expect.any(Number),
	});
	expect(report.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
});

test("package reports validate structure without duplicating native semantic vocabulary", () => {
	const common = {
		actionId: randomUUID(),
		phase: "started",
		action: "future_action",
		stage: "future_stage",
		entryPoint: "guest",
	};
	expect(isActionReport(common)).toBe(true);
	expect(
		isActionReport({
			...common,
			phase: "finished",
			result: "future_result",
			durationMs: 1,
			errorCode: "future_error",
		}),
	).toBe(true);
	for (const invalid of [
		{ ...common, action: 123 },
		{ ...common, result: "success" },
		{ ...common, phase: "finished" },
		{ ...common, phase: "finished", result: "success", durationMs: "private" },
		{ ...common, message: "private" },
	])
		expect(isActionReport(invalid)).toBe(false);
});

test.each([
	["errorCode", "timeout", 123],
	["errorStage", "profile", 123],
	["httpStatus", 600, "private"],
	["responseBytes", 2 ** 32, "private"],
	["choiceCount", -1, "private"],
	["pageCount", 0.5, "private"],
])("passes optional %s unchanged to host validation", (key, valid, invalid) => {
	const report = vi.fn();
	const telemetry = createCompletedActionTelemetry(report);
	for (const value of [undefined, valid, invalid, null]) {
		const input = {
			actionId: randomUUID(),
			phase: "finished",
			action: "load",
			stage: "organization",
			entryPoint: "automatic",
			result: "failure",
			durationMs: 1,
			[key]: value,
		};
		expect(isActionReport(input)).toBe(true);
		telemetry
			.start("load", "organization", "automatic")
			.finish("failure", { [key]: value, message: "private content" });
		const emitted = report.mock.calls.at(-1)[0];
		if (value !== undefined) expect(emitted[key]).toBe(value);
		else expect(emitted).not.toHaveProperty(key);
		expect(emitted).not.toHaveProperty("message");
	}
});

test("package telemetry leaves label, status and duration bounds to the host", () => {
	const report = vi.fn();
	const telemetry = createCompletedActionTelemetry(report);
	const clock = vi
		.spyOn(performance, "now")
		.mockReturnValueOnce(0)
		.mockReturnValueOnce(86_400_001);
	try {
		telemetry.start("a".repeat(65), "organization").finish("failure", {
			errorStage: "s".repeat(65),
			httpStatus: 600,
		});
		expect(report).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				action: "a".repeat(65),
				errorStage: "s".repeat(65),
				httpStatus: 600,
				durationMs: 86_400_001,
			}),
		);
	} finally {
		clock.mockRestore();
	}
});

test("picker interaction endpoint accepts only guest-owned action and stage pairs", async () => {
	const reports = [];
	const { open } = await start(catalog(), undefined, undefined, (report) =>
		reports.push(report),
	);
	const canvas = await open();
	const { documentToken } = await liveDocument(canvas);
	const post = (action, stage) =>
		fetch(`${canvas.endpoint}/interaction`, {
			method: "POST",
			headers: {
				Origin: new URL(canvas.endpoint).origin,
				"Content-Type": "application/json",
				"X-Picker-Document": documentToken,
			},
			body: JSON.stringify({
				actionId: randomUUID(),
				phase: "finished",
				result: "success",
				durationMs: 1,
				action,
				stage,
				entryPoint: "guest",
			}),
		});
	for (const [action, stage] of [
		["confirm", "selection"],
		["retry", "account"],
		["close", "canvas"],
		["expand", "details"],
		["settings", "repository"],
		["reload", "account"],
	]) {
		expect((await post(action, stage)).status).toBe(400);
	}
	expect(reports).toEqual([]);
	for (const field of ["organization", "project", "repository"]) {
		for (const action of ["expand", "collapse"]) {
			expect((await post(action, field)).status).toBe(200);
		}
	}
	expect((await post("settings", "account")).status).toBe(200);
	expect((await post("reload", "selection")).status).toBe(200);
	expect(reports).toHaveLength(8);
});

test("explicit picker retry finishes its own catalog read, not its loading response", async () => {
	const report = vi.fn();
	const pending = deferred();
	const listOrganizations = vi
		.fn()
		.mockResolvedValueOnce([])
		.mockReturnValueOnce(pending.promise);
	const { open } = await start(
		catalog({ listOrganizations }),
		undefined,
		undefined,
		report,
	);
	const canvas = await open();
	await expect
		.poll(canvas.read)
		.toMatchObject({ fields: { organization: { status: "ready" } } });
	expect(report).not.toHaveBeenCalled();
	await canvas.change({ type: "retry", field: "organization" });
	expect(report).toHaveBeenCalledTimes(1);
	expect(report.mock.calls[0][0]).toMatchObject({
		canvasId: "repository-picker",
		instanceId: canvas.instanceId,
		phase: "started",
		action: "retry",
		stage: "organization",
	});
	pending.resolve([]);
	await expect.poll(() => report.mock.calls.length).toBe(2);
	expect(report.mock.calls[1][0]).toMatchObject({
		actionId: report.mock.calls[0][0].actionId,
		phase: "finished",
		result: "success",
	});
});

test("report failures do not change business outcomes and error content cannot escape", () => {
	const sink = vi.fn();
	const telemetry = createActionTelemetry(sink);
	const action = telemetry.start("retry", "organization");
	const poison = Object.assign(
		new Error("https://private.example/?secret=token"),
		{
			code: "private-code",
			status: 503,
			stack: "private stack",
		},
	);
	action.finish("failure", safeActionError(poison));
	action.finish("success");
	expect(sink).toHaveBeenCalledTimes(2);
	expect(JSON.stringify(sink.mock.calls)).not.toContain("private");
	expect(sink.mock.calls[1][0]).toMatchObject({
		result: "failure",
		errorCode: "http",
		httpStatus: 503,
	});
	const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		const failing = createActionTelemetry(() => {
			throw poison;
		});
		expect(() =>
			failing.start("confirm", "selection").finish("success"),
		).not.toThrow();
		expect(diagnostic).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private");
	} finally {
		diagnostic.mockRestore();
	}
});

test("superseding and closing cancel only their own pending selection reads", async () => {
	const reports = [];
	const oldRead = deferred();
	const currentRead = deferred();
	const { picker, open } = await start(
		catalog({
			listProjects: ({ organization }) =>
				organization.id === organizations[0].id
					? oldRead.promise
					: currentRead.promise,
		}),
		undefined,
		undefined,
		(report) => reports.push(report),
	);
	const canvas = await open();
	await canvas.choose("organization", organizations[0].id);
	await canvas.choose("organization", organizations[1].id);
	const starts = reports.filter((report) => report.phase === "started");
	expect(starts).toHaveLength(2);
	expect(reports.filter((report) => report.phase === "finished")).toMatchObject(
		[{ actionId: starts[0].actionId, result: "cancelled" }],
	);
	oldRead.resolve(projects);
	await picker.onClose({ instanceId: canvas.instanceId });
	currentRead.resolve(projects);
	expect(reports.filter((report) => report.phase === "finished")).toMatchObject(
		[
			{ actionId: starts[0].actionId, result: "cancelled" },
			{ actionId: starts[1].actionId, result: "cancelled" },
		],
	);
});

test("host confirmation cannot report success for a rejected clone descriptor", async () => {
	const reports = [];
	const { picker, open } = await start(
		catalog({
			listOrganizations: async () => [{ ...organizations[0], name: ".." }],
			listRepositories: async ({ organization, project }) => [
				{
					id: `${organization.id}-${project.id}-service`,
					name: "service",
					account: { id: "account", name: "Account" },
				},
			],
		}),
		undefined,
		undefined,
		(report) => reports.push(report),
	);
	const canvas = await open("host");
	await canvas.choose("organization", organizations[0].id);
	await canvas.choose("project", projects[0].id);
	await expect
		.poll(canvas.read)
		.toMatchObject({ fields: { repository: { status: "ready" } } });
	await canvas.choose(
		"repository",
		(await canvas.read()).fields.repository.options[0].id,
	);
	const document = await liveDocument(canvas);
	const pending = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await document.notice();
	expect((await document.acknowledge(challenge)).status).toBe(409);
	expect(await pending).toMatchObject({ status: "rejected" });
	const confirmations = reports.filter((report) => report.action === "confirm");
	expect(confirmations).toHaveLength(2);
	expect(confirmations[1]).toMatchObject({
		actionId: confirmations[0].actionId,
		phase: "finished",
		result: "rejected",
	});
});

async function liveDocument(canvas) {
	const html = await (await fetch(canvas.opened.url)).text();
	const documentToken = /name="picker-document" content="([^"]+)"/.exec(
		html,
	)?.[1];
	expect(documentToken).toBeTruthy();
	return {
		documentToken,
		async notice(afterRequest = "") {
			const url = `${canvas.endpoint}/confirmation?documentToken=${documentToken}&afterRequest=${afterRequest}`;
			return (await fetch(url)).json();
		},
		async acknowledge(challenge, overrides = {}) {
			const state = await canvas.read();
			return fetch(`${canvas.endpoint}/confirmation`, {
				method: "POST",
				headers: {
					Origin: new URL(canvas.endpoint).origin,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					documentToken,
					requestToken: challenge.requestToken,
					sequence: state.sequence,
					revision: state.revision,
					queries: Object.fromEntries(
						Object.entries(state.fields).map(([name, field]) => [
							name,
							field.query,
						]),
					),
					...overrides,
				}),
			});
		},
	};
}

function action(picker, name, instanceId, input = {}) {
	return picker.actions
		.find((entry) => entry.name === name)
		.handler({ instanceId, input });
}

async function selectedCanvas(open) {
	const canvas = await open("host");
	await canvas.choose("organization", "org-juniper");
	await canvas.choose("project", "project-studio");
	await canvas.choose("repository", "org-juniper-project-studio-service");
	return canvas;
}

test("dialog completion waits for the exact live guest instead of accepting cached state", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	const guest = await liveDocument(canvas);
	const hint = await action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: null,
	});
	expect(hint).toMatchObject({ ready: true, disabledReason: null });
	expect(Number.isSafeInteger(hint.revision)).toBe(true);
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	expect(challenge.requestToken).toBeTruthy();
	expect(
		await action(picker, "confirm-selection", canvas.instanceId),
	).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/already/i),
	});
	const ack = await guest.acknowledge(challenge);
	expect(ack.status).toBe(200);
	expect(await confirm).toEqual({
		status: "completed",
		value: {
			organization: organizations[0],
			project: projects[0],
			repository: { id: "org-juniper-project-studio-service", name: "service" },
		},
	});
});

test.each(["revision", "sequence", "requestToken", "queries"])(
	"rejects stale %s acknowledgement without accepting a selection",
	async (fence) => {
		const { picker, open } = await start(catalog());
		const canvas = await selectedCanvas(open);
		const guest = await liveDocument(canvas);
		const confirm = action(picker, "confirm-selection", canvas.instanceId);
		const challenge = await guest.notice();
		const overrides = {
			revision: { revision: 0 },
			sequence: { sequence: 0 },
			requestToken: { requestToken: randomUUID() },
			queries: { queries: { organization: "new unsaved text" } },
		};
		expect((await guest.acknowledge(challenge, overrides[fence])).status).toBe(
			409,
		);
		if (fence === "requestToken") {
			await picker.onClose({ instanceId: canvas.instanceId });
		}
		expect(await confirm).toMatchObject({
			status: "rejected",
			message: expect.any(String),
		});
		if (fence !== "requestToken")
			expect((await canvas.read()).selection).toBeNull();
	},
);

test("replaced documents and closed instances retire pending challenges and observations", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	const guest = await liveDocument(canvas);
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	await liveDocument(canvas);
	expect(await confirm).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/reloaded|replaced/i),
	});
	expect((await guest.acknowledge(challenge)).status).toBe(409);
	const snapshot = await action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: null,
	});
	const observing = action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: snapshot.revision,
	});
	const closed = expect(observing).rejects.toThrow(/closed/i);
	await picker.onClose({ instanceId: canvas.instanceId });
	await closed;
});

test("dialog hints wait for revision changes and provide useful disabled reasons", async () => {
	const { picker, open } = await start();
	const canvas = await open("host");
	await liveDocument(canvas);
	const snapshot = await action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: null,
	});
	expect(snapshot).toMatchObject({
		ready: false,
		disabledReason: expect.stringMatching(/organizations.*Retry/i),
	});
	const observing = action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: snapshot.revision,
	});
	await liveDocument(canvas);
	expect((await observing).revision).toBeGreaterThan(snapshot.revision);
});
afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

test("unchanged dialog observations wait for a bounded heartbeat without holding up confirmation", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	await liveDocument(canvas);
	const snapshot = await action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: null,
	});
	vi.useFakeTimers();
	let responded = false;
	const observing = action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: snapshot.revision,
	});
	const observed = observing.then(() => {
		responded = true;
	});
	observed.catch(() => {});
	await vi.advanceTimersByTimeAsync(999);
	expect(responded).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect(responded).toBe(true);
	expect(await observing).toEqual(snapshot);
});

test("a confirmation timeout invalidates late acknowledgement and the next request uses a new token", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	const guest = await liveDocument(canvas);
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	const clock = vi.spyOn(Date, "now").mockReturnValue(challenge.expiresAt);
	expect((await guest.acknowledge(challenge)).status).toBe(409);
	expect(await confirm).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/expired/i),
	});
	expect((await canvas.read()).selection).toBeNull();
	clock.mockRestore();
	const retry = action(picker, "confirm-selection", canvas.instanceId);
	const next = await guest.notice(challenge.requestToken);
	expect(next.requestToken).not.toBe(challenge.requestToken);
	expect((await guest.acknowledge(challenge)).status).toBe(409);
	expect((await guest.acknowledge(next)).status).toBe(200);
	expect(await retry).toMatchObject({ status: "completed" });
});

test("an absent live acknowledgement times out instead of returning cached readiness", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	await liveDocument(canvas);
	vi.useFakeTimers();
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	await vi.advanceTimersByTimeAsync(20_000);
	expect(await confirm).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/did not respond/i),
	});
});

test("a newer authoritative process revision cannot be acknowledged using an older draft", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	const guest = await liveDocument(canvas);
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	const old = await canvas.read();
	const edited = await fetch(canvas.endpoint, {
		method: "POST",
		headers: {
			Origin: new URL(canvas.endpoint).origin,
			"Content-Type": "application/json",
			"X-Picker-Document": guest.documentToken,
		},
		body: JSON.stringify({
			type: "query",
			field: "repository",
			value: "new draft",
			sequence: old.sequence + 1,
		}),
	});
	expect(edited.status).toBe(200);
	expect(
		(
			await guest.acknowledge(challenge, {
				revision: old.revision,
				sequence: old.sequence,
			})
		).status,
	).toBe(409);
	expect(await confirm).toMatchObject({ status: "rejected" });
	expect((await canvas.read()).selection).toBeNull();
});

test("document release retires notification waits and rejects old-document command writes", async () => {
	const { picker, open } = await start(catalog());
	const canvas = await selectedCanvas(open);
	const guest = await liveDocument(canvas);
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	const notification = guest.notice(challenge.requestToken);
	const release = await fetch(`${canvas.endpoint}/document`, {
		method: "POST",
		headers: {
			Origin: new URL(canvas.endpoint).origin,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ documentToken: guest.documentToken }),
	});
	expect(release.status).toBe(200);
	expect(await confirm).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/closed/i),
	});
	expect(await notification).toMatchObject({
		error: expect.stringMatching(/replaced/i),
	});
	const next = await liveDocument(canvas);
	expect(next.documentToken).not.toBe(guest.documentToken);
	const staleWrite = await fetch(canvas.endpoint, {
		method: "POST",
		headers: {
			Origin: new URL(canvas.endpoint).origin,
			"Content-Type": "application/json",
			"X-Picker-Document": guest.documentToken,
		},
		body: JSON.stringify({
			type: "query",
			field: "organization",
			value: "obsolete",
			sequence: 100,
		}),
	});
	expect(staleWrite.status).toBe(409);
	expect((await canvas.read()).fields.organization.query).toBe(
		"Juniper example",
	);
});

test("requires an organization, project and stable repository identity before selecting", async () => {
	const { open } = await start(catalog());
	const canvas = await open();
	await expect.poll(canvas.read).toMatchObject({
		fields: {
			organization: { status: "ready", options: organizations },
			project: { status: "idle", selected: null },
			repository: { status: "idle", selected: null },
		},
		selection: null,
	});
	expect((await canvas.post({ type: "confirm", queries: {} })).status).toBe(
		400,
	);
	await canvas.choose("organization", "org-juniper");
	await canvas.choose("project", "project-studio");
	await canvas.choose("repository", "org-juniper-project-studio-service");
	const confirmed = await canvas.change({
		type: "confirm",
		queries: {
			organization: "Juniper example",
			project: "Studio",
			repository: "service",
		},
	});
	expect(confirmed.selection).toEqual({
		organization: organizations[0],
		project: projects[0],
		repository: {
			id: "org-juniper-project-studio-service",
			name: "service",
		},
	});
	expect(JSON.stringify(confirmed)).not.toMatch(/connected|cloned/i);
});

test("upstream edits clear downstream queries, results and the confirmed selection", async () => {
	const { open } = await start(catalog());
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await canvas.choose("project", "project-studio");
	await canvas.choose("repository", "org-juniper-project-studio-service");
	await canvas.change({
		type: "confirm",
		queries: {
			organization: "Juniper example",
			project: "Studio",
			repository: "service",
		},
	});
	const edited = await canvas.change({
		type: "query",
		field: "organization",
		value: "Har",
	});
	expect(edited).toMatchObject({
		fields: {
			organization: { query: "Har", selected: null },
			project: { query: "", options: [], selected: null, status: "idle" },
			repository: { query: "", options: [], selected: null, status: "idle" },
		},
		selection: null,
	});
	await canvas.choose("organization", "org-harbor");
	await canvas.choose("project", "project-flight");
	await canvas.choose("repository", "org-harbor-project-flight-service");
	const result = await canvas.change({
		type: "confirm",
		queries: {
			organization: "Harbor example",
			project: "Flight",
			repository: "service",
		},
	});
	expect(result.selection.repository.id).toBe(
		"org-harbor-project-flight-service",
	);
	expect(result.selection.organization.id).toBe("org-harbor");
	expect(result.selection.project.id).toBe("project-flight");
	const changedProject = await canvas.change({
		type: "query",
		field: "project",
		value: "Stu",
	});
	expect(changedProject.fields.repository).toMatchObject({
		query: "",
		options: [],
		selected: null,
		status: "idle",
	});
	expect(changedProject.selection).toBeNull();
});

test("fences late project responses, including after returning to the same organization", async () => {
	const first = deferred();
	const calls = [];
	const { open } = await start(
		catalog({
			listProjects: ({ organization, signal }) => {
				calls.push({ organization, signal });
				return calls.length === 1 ? first.promise : Promise.resolve(projects);
			},
		}),
	);
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await expect.poll(() => calls.length).toBe(1);
	await canvas.choose("organization", "org-harbor");
	await canvas.choose("organization", "org-juniper");
	await expect.poll(canvas.read).toMatchObject({
		fields: { project: { status: "ready", options: projects } },
	});
	expect(calls[0].signal.aborted).toBe(true);
	first.resolve([{ id: "obsolete", name: "Obsolete project" }]);
	await first.promise;
	expect((await canvas.read()).fields.project.options).toEqual(projects);
});

test("keeps typed queries while a catalog response is pending and rejects reordered edits", async () => {
	const loading = deferred();
	const { open } = await start(
		catalog({ listProjects: () => loading.promise }),
	);
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await canvas.change({ type: "query", field: "project", value: "Stu" });
	loading.resolve(projects);
	await expect.poll(canvas.read).toMatchObject({
		fields: {
			project: { query: "Stu", status: "ready", options: projects },
		},
	});
	expect(
		(
			await canvas.post(
				{ type: "query", field: "project", value: "latest" },
				20,
			)
		).status,
	).toBe(200);
	expect(
		(
			await canvas.post(
				{ type: "query", field: "project", value: "obsolete" },
				19,
			)
		).status,
	).toBe(409);
	expect((await canvas.read()).fields.project.query).toBe("latest");
});

test("changing projects fences repository responses even when the repository names repeat", async () => {
	const obsolete = deferred();
	const calls = [];
	const { open } = await start(
		catalog({
			listRepositories: ({ project, signal }) => {
				calls.push({ project, signal });
				return calls.length === 1
					? obsolete.promise
					: Promise.resolve([{ id: "repo-flight-service", name: "service" }]);
			},
		}),
	);
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await canvas.choose("project", "project-studio");
	await canvas.choose("project", "project-flight");
	await canvas.choose("repository", "repo-flight-service");
	expect(calls[0].signal.aborted).toBe(true);
	obsolete.resolve([{ id: "repo-studio-service", name: "service" }]);
	await obsolete.promise;
	expect((await canvas.read()).fields.repository).toMatchObject({
		status: "ready",
		selected: { id: "repo-flight-service", name: "service" },
		options: [{ id: "repo-flight-service", name: "service" }],
	});
});

test("shows catalog failures without leaking their body and supports explicit retry and empty results", async () => {
	let attempts = 0;
	const { open } = await start(
		catalog({
			listProjects: async () => {
				if (++attempts === 1) throw new Error("private upstream response");
				return [];
			},
		}),
	);
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await expect.poll(canvas.read).toMatchObject({
		fields: { project: { status: "error", options: [], selected: null } },
	});
	expect(JSON.stringify(await canvas.read())).not.toContain(
		"private upstream response",
	);
	await canvas.change({ type: "query", field: "project", value: "missing" });
	await canvas.change({ type: "retry", field: "project" });
	await expect.poll(canvas.read).toMatchObject({
		fields: {
			project: { status: "ready", query: "missing", options: [] },
			repository: { status: "idle" },
		},
		selection: null,
	});
	expect(attempts).toBe(2);
});

test("closing during load aborts only that instance and cannot republish a late result", async () => {
	const pending = deferred();
	const signals = [];
	const { picker, open } = await start(
		catalog({
			listProjects: ({ signal }) => {
				signals.push(signal);
				return pending.promise;
			},
		}),
	);
	const first = await open();
	const second = await open();
	await first.choose("organization", "org-juniper");
	await second.choose("organization", "org-harbor");
	await picker.onClose({ instanceId: first.instanceId });
	expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
	expect((await fetch(first.endpoint)).status).toBe(404);
	pending.resolve(projects);
	await expect.poll(second.read).toMatchObject({
		fields: {
			organization: { selected: organizations[1] },
			project: { status: "ready", options: projects },
		},
	});
	expect((await fetch(first.opened.url)).status).toBe(404);
	expect(
		await picker.open({ instanceId: second.instanceId, reopen: true }),
	).toEqual(second.opened);
});

test("missing discovery reports a load error, never fixture data or a token API", async () => {
	const { open } = await start();
	const canvas = await open();
	expect(await canvas.read()).toMatchObject({
		fields: {
			organization: { status: "error", options: [], selected: null },
		},
		selection: null,
	});
	expect(
		(
			await canvas.post({
				type: "choose",
				field: "organization",
				id: "org-juniper",
			})
		).status,
	).toBe(400);
});

test("validates repository identity and returns only catalog display fields to the guest", async () => {
	const { open } = await start(
		catalog({
			listRepositories: async () => [
				{ id: "repo-one", name: "service", internal: "never expose" },
				{ id: "repo-two", name: "service" },
			],
		}),
	);
	const canvas = await open();
	await canvas.choose("organization", "org-juniper");
	await canvas.choose("project", "project-studio");
	await expect.poll(canvas.read).toMatchObject({
		fields: { repository: { status: "ready" } },
	});
	expect(
		(
			await canvas.post({
				type: "choose",
				field: "repository",
				id: "service",
			})
		).status,
	).toBe(400);
	await canvas.choose("repository", "repo-two");
	expect((await canvas.read()).fields.repository.selected).toEqual({
		id: "repo-two",
		name: "service",
	});
	expect(JSON.stringify(await canvas.read())).not.toContain("never expose");
	expect(
		(
			await canvas.post({
				type: "confirm",
				queries: {
					organization: "Juniper example",
					project: "Studio",
					repository: "different visible value",
				},
			})
		).status,
	).toBe(400);
});

test("populates the production picker and confirms an unbound API-backed selection using the native account port", async () => {
	const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
	const projectId = "20df9a20-bf49-4ccf-b355-a75bc89cf728";
	const repositoryId = "72fb8993-569d-4b27-9dde-6325437726a4";
	const responses = [
		{ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" },
		{
			count: 1,
			value: [
				{
					accountId: organizationId,
					accountName: "juniper-example",
					accountUri: "https://example.invalid/do-not-follow",
				},
			],
		},
		{
			count: 1,
			value: [
				{
					id: projectId,
					name: "Studio & tools",
					description: "Tools for the studio",
				},
			],
		},
		{
			count: 1,
			value: [
				{
					id: repositoryId,
					name: "service",
					project: { id: projectId, name: "Studio & tools" },
					defaultBranch: "refs/heads/trunk",
					remoteUrl: "https://example.invalid/do-not-follow",
				},
			],
		},
	];
	const apiFetch = vi.fn(async () => Response.json(responses.shift()));
	const { picker, open } = await start(undefined, {
		accountId: "native-repository-account",
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: apiFetch,
	});
	const canvas = await open();
	await canvas.choose("organization", organizationId);
	await canvas.choose("project", `${organizationId}/${projectId}`);
	await canvas.choose(
		"repository",
		`${organizationId}/${projectId}/${repositoryId}`,
	);
	expect((await canvas.read()).fields.project.selected.description).toBe(
		"Tools for the studio",
	);
	expect((await canvas.read()).fields.repository.selected).not.toHaveProperty(
		"defaultBranch",
	);
	const state = await canvas.change({
		type: "confirm",
		queries: {
			organization: "juniper-example",
			project: "Studio & tools",
			repository: "service",
		},
	});
	expect(state.selection).toEqual({
		organization: { id: organizationId, name: "juniper-example" },
		project: { id: `${organizationId}/${projectId}`, name: "Studio & tools" },
		repository: {
			id: `${organizationId}/${projectId}/${repositoryId}`,
			name: "service",
		},
	});
	expect(picker.actions[0].handler({ instanceId: canvas.instanceId })).toEqual(
		state,
	);
	expect(apiFetch).toHaveBeenCalledTimes(4);
	expect(JSON.stringify(state)).not.toMatch(
		/fixture-token|native-repository-account|accountUri|remoteUrl|connected|cloned/,
	);
});

function nativeAuthentication() {
	const ids = {
		organization: "820f6651-2635-4e59-9121-0dedade21f89",
		project: "20df9a20-bf49-4ccf-b355-a75bc89cf728",
		repository: "72fb8993-569d-4b27-9dde-6325437726a4",
	};
	const authentication = {
		listAccounts: vi
			.fn()
			.mockResolvedValue([{ id: "opaque-account", name: "Ada Example" }]),
		getAccessToken: vi.fn(async () => ({ accessToken: "fixture-token" })),
	};
	const adoFetch = vi.fn(async (url) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/profiles/me"))
			return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
		if (path.endsWith("/accounts"))
			return Response.json({
				count: 1,
				value: [{ accountId: ids.organization, accountName: "juniper" }],
			});
		if (path.endsWith("/projects"))
			return Response.json({
				count: 1,
				value: [{ id: ids.project, name: "Studio" }],
			});
		return Response.json({
			count: 1,
			value: [
				{
					id: ids.repository,
					name: "service",
					project: { id: ids.project, name: "Studio" },
				},
			],
		});
	});
	const requestFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation((url, init) =>
		String(url).startsWith("https://")
			? adoFetch(url, init)
			: requestFetch(url, init),
	);
	return { authentication, ids, adoFetch };
}

test.each([
	["auth_required", "auth_required"],
	["credential_unavailable", "unknown"],
	["account_unavailable", "unknown"],
	["denied", "unknown"],
	["invalid_request", "unknown"],
	["busy", "unknown"],
	["timeout", "unknown"],
	["request_failed", "unknown"],
	[401, "unauthorized"],
	[403, "forbidden"],
])(
	"picker distinguishes token failures and keeps other errors generic: %s",
	async (failure, expected) => {
		const { authentication, adoFetch } = nativeAuthentication();
		if (typeof failure === "number")
			adoFetch.mockImplementation(
				async () =>
					new Response("private provider diagnostic", { status: failure }),
			);
		else
			authentication.getAccessToken.mockRejectedValue(
				Object.assign(new Error("private native diagnostic"), {
					code: failure,
				}),
			);
		const { picker, open } = await start(undefined, undefined, authentication);
		const canvas = await open();
		await expect.poll(canvas.read).toMatchObject({
			fields: { organization: { status: "error", error: expected } },
		});
		if (expected === "unknown") {
			await liveDocument(canvas);
			expect(
				await action(picker, "dialog-state", canvas.instanceId, {
					afterRevision: null,
				}),
			).toMatchObject({
				ready: false,
				disabledReason: "Could not load organizations. Retry the list.",
			});
		}
		expect(JSON.stringify(await canvas.read())).not.toContain("private");
		if (typeof failure !== "number") expect(adoFetch).not.toHaveBeenCalled();
	},
);
test("missing-account discovery exposes host sign-in recovery before URL entry", async () => {
	const { picker, open } = await start(undefined, undefined, {
		listAccounts: async () => [],
		getAccessToken: vi.fn(),
	});
	const canvas = await open("host");
	await liveDocument(canvas);
	await expect.poll(canvas.read).toMatchObject({
		fields: { organization: { status: "error", error: "account_required" } },
	});
	expect(
		await action(picker, "dialog-state", canvas.instanceId, {
			afterRevision: null,
		}),
	).toMatchObject({
		ready: false,
		disabledReason: "Sign in to continue.",
		accountAuthorization: { accountReference: null },
	});
});

test.each([false, true])(
	"early complete URL retains host sign-in recovery after account_required (result mode: %s)",
	async (selectResult) => {
		const accounts = deferred();
		const authentication = {
			listAccounts: vi
				.fn()
				.mockReturnValueOnce(accounts.promise)
				.mockResolvedValue([]),
			getAccessToken: vi.fn(),
		};
		const { picker, open } = await start(undefined, undefined, authentication);
		const canvas = await open("host");
		try {
			await expect
				.poll(() => authentication.listAccounts.mock.calls.length)
				.toBe(1);
			expect((await canvas.read()).fields.organization.status).toBe("loading");
			const url = "https://dev.azure.com/juniper/Studio/_git/service";
			await canvas.change({ type: "url", value: url, selectResult });
			const guest = await liveDocument(canvas);
			const response = await fetch(`${canvas.endpoint}/validate`, {
				method: "POST",
				headers: {
					Origin: new URL(canvas.endpoint).origin,
					"Content-Type": "application/json",
					"X-Picker-Document": guest.documentToken,
				},
				body: JSON.stringify({
					organization: "juniper",
					project: "Studio",
					repository: "service",
				}),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ code: "account_required" });
			expect(authentication.getAccessToken).not.toHaveBeenCalled();
			expect(await canvas.read()).toMatchObject({
				repositoryUrl: url,
				fields: { organization: { status: "loading" } },
			});
			expect(
				await action(picker, "dialog-state", canvas.instanceId, {
					afterRevision: null,
				}),
			).toMatchObject({
				accountAuthorization: { accountReference: null },
				ready: false,
				disabledReason: "Sign in to continue.",
			});
			await action(picker, "account-changed", canvas.instanceId, {
				accountReference: null,
			});
			const retry = await action(picker, "dialog-state", canvas.instanceId, {
				afterRevision: null,
			});
			expect(retry).not.toHaveProperty("accountAuthorization");
			expect(retry.ready).toBe(!selectResult);
			expect((await canvas.read()).repositoryUrl).toBe(url);
		} finally {
			accounts.resolve([]);
			await picker.onClose({ instanceId: canvas.instanceId });
		}
	},
);

test.each(["none", "account", "url", "document", "close"])(
	"a late missing-account URL failure is fenced by %s changes",
	async (change) => {
		const accounts = deferred();
		const lookup = deferred();
		const authentication = {
			listAccounts: vi
				.fn()
				.mockReturnValueOnce(accounts.promise)
				.mockReturnValueOnce(lookup.promise)
				.mockResolvedValue([]),
			getAccessToken: vi.fn(),
		};
		const { picker, open } = await start(undefined, undefined, authentication);
		const canvas = await open("host");
		try {
			await expect
				.poll(() => authentication.listAccounts.mock.calls.length)
				.toBe(1);
			await canvas.change({
				type: "url",
				value: "https://dev.azure.com/juniper/Studio/_git/service",
			});
			const guest = await liveDocument(canvas);
			const request = fetch(`${canvas.endpoint}/validate`, {
				method: "POST",
				headers: {
					Origin: new URL(canvas.endpoint).origin,
					"Content-Type": "application/json",
					"X-Picker-Document": guest.documentToken,
				},
				body: JSON.stringify({
					organization: "juniper",
					project: "Studio",
					repository: "service",
				}),
			});
			await expect
				.poll(() => authentication.listAccounts.mock.calls.length)
				.toBe(2);
			if (change === "account")
				await action(picker, "account-changed", canvas.instanceId, {
					accountReference: "new-account",
				});
			else if (change === "url")
				await fetch(canvas.endpoint, {
					method: "POST",
					headers: {
						Origin: new URL(canvas.endpoint).origin,
						"Content-Type": "application/json",
						"X-Picker-Document": guest.documentToken,
					},
					body: JSON.stringify({
						type: "url",
						value: "https://dev.azure.com/juniper/Studio/_git/other",
						sequence: 2,
					}),
				});
			else if (change === "document") await liveDocument(canvas);
			else if (change === "close")
				await picker.onClose({ instanceId: canvas.instanceId });
			lookup.resolve([]);
			const response = await request;
			if (change === "none") {
				expect(response.status).toBe(400);
				expect(await response.json()).toMatchObject({
					code: "account_required",
				});
			}
			if (change !== "close") {
				const hint = await action(picker, "dialog-state", canvas.instanceId, {
					afterRevision: null,
				});
				if (change === "none")
					expect(hint).toMatchObject({
						accountAuthorization: { accountReference: null },
						ready: false,
						disabledReason: "Sign in to continue.",
					});
				else {
					expect(hint).not.toHaveProperty("accountAuthorization");
					expect(hint).toMatchObject({ ready: true, disabledReason: null });
				}
			}
		} finally {
			accounts.resolve([]);
			lookup.resolve([]);
			await picker.onClose({ instanceId: canvas.instanceId });
		}
	},
);

test.each(["project", "repository"])(
	"token-backed %s discovery recovers without losing upstream selections",
	async (field) => {
		const { authentication, ids } = nativeAuthentication();
		const healthy = authentication.getAccessToken.getMockImplementation();
		const { picker, open } = await start(undefined, undefined, authentication);
		const canvas = await open("host");
		await expect.poll(canvas.read).toMatchObject({
			fields: { organization: { status: "ready" } },
		});
		if (field === "repository") {
			await canvas.choose("organization", ids.organization);
			await expect.poll(canvas.read).toMatchObject({
				fields: { project: { status: "ready" } },
			});
		}
		authentication.getAccessToken.mockRejectedValue(
			Object.assign(new Error("private"), { code: "auth_required" }),
		);
		if (field === "repository")
			await canvas.choose("project", `${ids.organization}/${ids.project}`);
		else await canvas.choose("organization", ids.organization);
		await expect.poll(canvas.read).toMatchObject({
			fields: { [field]: { status: "error", error: "auth_required" } },
		});
		authentication.getAccessToken.mockImplementation(healthy);
		await action(picker, "account-changed", canvas.instanceId, {
			accountReference: "opaque-account",
		});
		await expect
			.poll(canvas.read)
			.toMatchObject({ fields: { [field]: { status: "ready" } } });
		const state = await canvas.read();
		expect(state.fields[field]).not.toHaveProperty("error");
		expect(state.fields.organization.selected.id).toBe(ids.organization);
	},
);

test.each([
	{ organization: "juniper", project: "Studio" },
	{ organization: "juniper", project: "Studio", repository: "service" },
])(
	"auth refresh fences an older quick-fill failure for the same account: %j",
	async (target) => {
		const { authentication, ids } = nativeAuthentication();
		const { picker, open } = await start(undefined, undefined, authentication);
		const canvas = await open("host");
		await canvas.choose("organization", ids.organization);
		await expect
			.poll(canvas.read)
			.toMatchObject({ fields: { project: { status: "ready" } } });
		if (target.repository)
			await canvas.change({
				type: "url",
				value: "https://dev.azure.com/juniper/Studio/_git/service",
			});
		const guest = await liveDocument(canvas);
		const oldToken = deferred();
		authentication.getAccessToken.mockReturnValueOnce(oldToken.promise);
		const before = authentication.getAccessToken.mock.calls.length;
		const lookup = fetch(`${canvas.endpoint}/validate`, {
			method: "POST",
			headers: {
				Origin: new URL(canvas.endpoint).origin,
				"Content-Type": "application/json",
				"X-Picker-Document": guest.documentToken,
			},
			body: JSON.stringify(target),
		});
		await expect
			.poll(() => authentication.getAccessToken.mock.calls.length)
			.toBe(before + 1);
		await action(picker, "account-changed", canvas.instanceId, {
			accountReference: "opaque-account",
		});
		await expect
			.poll(canvas.read)
			.toMatchObject({ fields: { organization: { status: "ready" } } });
		oldToken.reject(
			Object.assign(new Error("old credential"), { code: "auth_required" }),
		);
		await lookup;
		const hint = await action(picker, "dialog-state", canvas.instanceId, {
			afterRevision: null,
		});
		expect(hint).not.toHaveProperty("accountAuthorization");
		if (target.repository)
			expect(hint).toMatchObject({ ready: true, disabledReason: null });
		else expect(hint.disabledReason).not.toMatch(/authorization|URL/);
	},
);

test("a settled URL failure cannot publish authorization across a refresh revision", async () => {
	const error = new PickerInputError("Old authorization failure", 400);
	let refresh;
	let refreshed = false;
	Object.defineProperty(error, "code", {
		get() {
			// The resolver has settled; refresh immediately before marker classification.
			if (!refreshed) {
				refreshed = true;
				refresh();
			}
			return "auth_required";
		},
	});
	const { picker, open } = await start(
		catalog({
			listAccounts: async () => [{ id: "account", name: "Account" }],
			resolveRepositoryUrl: async () => {
				throw error;
			},
		}),
	);
	const canvas = await open("host");
	await canvas.choose("organization", organizations[0].id);
	await expect
		.poll(canvas.read)
		.toMatchObject({ fields: { project: { status: "ready" } } });
	await canvas.change({
		type: "url",
		value: "https://dev.azure.com/juniper/_git/service",
	});
	const guest = await liveDocument(canvas);
	refresh = () =>
		action(picker, "account-changed", canvas.instanceId, {
			accountReference: "account",
		});
	const response = await fetch(`${canvas.endpoint}/validate`, {
		method: "POST",
		headers: {
			Origin: new URL(canvas.endpoint).origin,
			"Content-Type": "application/json",
			"X-Picker-Document": guest.documentToken,
		},
		body: JSON.stringify({ organization: "juniper", repository: "service" }),
	});
	expect(response.status).toBe(400);
	expect(refreshed).toBe(true);
	const hint = await action(picker, "dialog-state", canvas.instanceId, {
		afterRevision: null,
	});
	expect(hint).not.toHaveProperty("accountAuthorization");
});

test("auth completion supersedes an older same-account catalog request", async () => {
	const previous = deferred();
	let loads = 0;
	const state = createPickerState(
		catalog({
			listAccounts: async () => [{ id: "account", name: "Account" }],
			listOrganizations: async () =>
				++loads === 1 ? previous.promise : organizations,
		}),
	);
	try {
		await expect.poll(() => loads).toBe(1);
		state.refreshDiscovery();
		await expect
			.poll(() => state.read().fields.organization.status)
			.toBe("ready");
		previous.reject(
			Object.assign(new Error("obsolete failure"), {
				name: "AzureDevOpsCatalogError",
				code: "auth_required",
			}),
		);
		await Promise.resolve();
		expect(state.read().fields.organization).toMatchObject({
			status: "ready",
			options: organizations,
		});
		expect(state.read().fields.organization.error).toBeUndefined();
	} finally {
		await state.close();
	}
});

test.each([
	["auth_required", "auth_required", /Update authorization/],
	[401, "unauthorized", /rejected authorization/],
	[403, "forbidden", /permissions/],
])(
	"token-backed quick-fill preserves actionable classification %s",
	async (failure, code, message) => {
		const { authentication, adoFetch } = nativeAuthentication();
		const { open } = await start(undefined, undefined, authentication);
		const canvas = await open();
		await expect
			.poll(canvas.read)
			.toMatchObject({ fields: { organization: { status: "ready" } } });
		adoFetch.mockClear();
		if (typeof failure === "number")
			adoFetch.mockImplementation(
				async () => new Response("private", { status: failure }),
			);
		else
			authentication.getAccessToken.mockRejectedValue(
				Object.assign(new Error("private"), { code: failure }),
			);
		const response = await fetch(`${canvas.endpoint}/validate`, {
			method: "POST",
			headers: {
				Origin: new URL(canvas.endpoint).origin,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				organization: "juniper",
				project: "Studio",
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: expect.stringMatching(message),
			code,
		});
		if (typeof failure !== "number") expect(adoFetch).not.toHaveBeenCalled();
	},
);

test("a denied native token shows a safe discovery error without ADO requests", async () => {
	const report = vi.fn();
	const authentication = {
		listAccounts: vi
			.fn()
			.mockResolvedValue([{ id: "only-account", name: "Ada Example" }]),
		getAccessToken: vi.fn(async () => {
			throw Object.assign(new Error("Authentication denied"), {
				code: "denied",
				detail: "private host detail",
			});
		}),
	};
	const requestFetch = globalThis.fetch;
	const adoFetch = vi.fn();
	vi.spyOn(globalThis, "fetch").mockImplementation((url, init) =>
		String(url).startsWith("https://")
			? adoFetch(url, init)
			: requestFetch(url, init),
	);
	const { open } = await start(undefined, undefined, authentication, report);
	const canvas = await open();
	await expect.poll(canvas.read).toMatchObject({
		fields: {
			organization: { status: "error", options: [], selected: null },
		},
		selection: null,
	});
	await vi.waitFor(() =>
		expect(report).toHaveBeenCalledWith(
			expect.objectContaining({
				phase: "finished",
				stage: "organization",
				result: "failure",
				errorCode: "denied",
			}),
		),
	);
	expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
		accountId: "only-account",
		resource: "azure-devops",
	});
	expect(adoFetch).not.toHaveBeenCalled();
	expect(
		JSON.stringify([await canvas.read(), report.mock.calls]),
	).not.toContain("private");
});

test("closing before a sole account arrives cannot start token discovery", async () => {
	const accounts = deferred();
	const authentication = {
		listAccounts: vi.fn().mockReturnValue(accounts.promise),
		getAccessToken: vi.fn(),
	};
	const { picker, open } = await start(undefined, undefined, authentication);
	const canvas = await open();
	await expect
		.poll(() => authentication.listAccounts.mock.calls.length)
		.toBe(1);
	await picker.onClose({ instanceId: canvas.instanceId });
	accounts.resolve([{ id: "late-account", name: "Late account" }]);
	await accounts.promise;
	expect((await fetch(canvas.endpoint)).status).toBe(404);
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
});

test("keeps complete HTTP dropdown data and host completion while rejecting oversized bridge inspection", async () => {
	const choices = Array.from({ length: 200 }, (_, index) => ({
		id: `org-${index}`,
		name: `Organization ${index} ${"x".repeat(80)}`,
	}));
	const { picker, open } = await start(
		catalog({ listOrganizations: async () => choices }),
	);
	const canvas = await open("host");
	await expect.poll(canvas.read).toMatchObject({
		fields: { organization: { status: "ready", options: choices } },
	});
	const state = await canvas.read();
	expect(Buffer.byteLength(JSON.stringify(state))).toBeGreaterThan(16 * 1024);
	expect(() =>
		picker.actions[0].handler({ instanceId: canvas.instanceId }),
	).toThrow("too large to inspect");
	await canvas.choose("organization", "org-199");
	expect((await canvas.read()).fields.organization.selected).toEqual(
		choices[199],
	);
	expect((await canvas.read()).fields.organization.options).toEqual(choices);
	await canvas.choose("project", "project-studio");
	await canvas.choose("repository", "org-199-project-studio-service");
	const guest = await liveDocument(canvas);
	expect(
		await action(picker, "dialog-state", canvas.instanceId, {
			afterRevision: null,
		}),
	).toMatchObject({ ready: true, disabledReason: null });
	const confirm = action(picker, "confirm-selection", canvas.instanceId);
	const challenge = await guest.notice();
	expect((await guest.acknowledge(challenge)).status).toBe(200);
	expect(await confirm).toEqual({
		status: "completed",
		value: {
			organization: choices[199],
			project: projects[0],
			repository: {
				id: "org-199-project-studio-service",
				name: "service",
			},
		},
	});
});

test("inspection measures UTF-8 bytes rather than JavaScript string length", async () => {
	const { picker, open } = await start(
		catalog({
			listOrganizations: async () =>
				Array.from({ length: 20 }, (_, index) => ({
					id: `org-${index}`,
					name: "\u{1f333}".repeat(200),
				})),
		}),
	);
	const canvas = await open();
	await expect.poll(canvas.read).toMatchObject({
		fields: { organization: { status: "ready" } },
	});
	const json = JSON.stringify(await canvas.read());
	expect(json.length).toBeLessThan(12 * 1024);
	expect(Buffer.byteLength(json)).toBeGreaterThan(16 * 1024);
	expect(() =>
		picker.actions[0].handler({ instanceId: canvas.instanceId }),
	).toThrow("too large to inspect");
});

test.each([401, 403, 429, "malformed", "count-mismatch"])(
	"routes API project failure %s through the existing error and explicit retry state",
	async (failure) => {
		const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
		const authentication = {
			getAccessToken: vi
				.fn()
				.mockResolvedValue({ accessToken: "fixture-token" }),
		};
		const apiFetch = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" }),
			)
			.mockResolvedValueOnce(
				Response.json({
					count: 1,
					value: [
						{ accountId: organizationId, accountName: "juniper-example" },
					],
				}),
			)
			.mockResolvedValueOnce(
				failure === "malformed"
					? new Response('{"private": not-json}')
					: failure === "count-mismatch"
						? Response.json({ count: 1, value: [] })
						: new Response("private upstream details", { status: failure }),
			)
			.mockResolvedValueOnce(Response.json({ count: 0, value: [] }));
		const { open } = await start(undefined, {
			accountId: "native-repository-account",
			authentication,
			fetch: apiFetch,
		});
		const canvas = await open();
		await canvas.choose("organization", organizationId);
		await expect.poll(canvas.read).toMatchObject({
			fields: {
				project: { status: "error", options: [], selected: null },
				repository: { status: "idle" },
			},
		});
		expect(JSON.stringify(await canvas.read())).not.toMatch(
			/private|fixture-token|native-repository-account/,
		);
		expect(apiFetch).toHaveBeenCalledTimes(3);
		await canvas.change({ type: "retry", field: "project" });
		await expect.poll(canvas.read).toMatchObject({
			fields: { project: { status: "ready", options: [] } },
		});
		expect(apiFetch).toHaveBeenCalledTimes(4);
	},
);

test("closing an API-backed picker cancels its request wait without stopping a sibling", async () => {
	const firstProfile = deferred();
	const secondProfile = deferred();
	const apiFetch = vi
		.fn()
		.mockReturnValueOnce(firstProfile.promise)
		.mockReturnValueOnce(secondProfile.promise)
		.mockResolvedValueOnce(Response.json({ count: 0, value: [] }));
	const { picker, open } = await start(undefined, {
		accountId: "native-repository-account",
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: apiFetch,
	});
	const first = await open();
	const second = await open();
	await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
	await picker.onClose({ instanceId: first.instanceId });
	firstProfile.resolve(
		Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" }),
	);
	secondProfile.resolve(
		Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" }),
	);
	await expect.poll(second.read).toMatchObject({
		fields: { organization: { status: "ready", options: [] } },
	});
	expect(apiFetch).toHaveBeenCalledTimes(3);
	expect((await fetch(first.endpoint)).status).toBe(404);
});

test("each API-backed picker retains its own routing context when a sibling refreshes memberships", async () => {
	const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
	const otherOrganizationId = "c2a0dcc0-88f7-4542-9698-0f4c8b78a4a1";
	let membershipReads = 0;
	const apiFetch = vi.fn(async (url) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/profiles/me")) {
			return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
		}
		if (path.endsWith("/accounts")) {
			const first = ++membershipReads === 1;
			return Response.json({
				count: 1,
				value: [
					{
						accountId: first ? organizationId : otherOrganizationId,
						accountName: first ? "juniper-example" : "harbor-example",
					},
				],
			});
		}
		expect(path).toBe("/juniper-example/_apis/projects");
		return Response.json({ count: 0, value: [] });
	});
	const { open } = await start(undefined, {
		accountId: "native-repository-account",
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: apiFetch,
	});
	const first = await open();
	await expect.poll(first.read).toMatchObject({
		fields: { organization: { status: "ready" } },
	});
	const second = await open();
	await expect.poll(second.read).toMatchObject({
		fields: {
			organization: {
				status: "ready",
				options: [{ id: otherOrganizationId, name: "harbor-example" }],
			},
		},
	});
	await first.choose("organization", organizationId);
	await expect.poll(first.read).toMatchObject({
		fields: { project: { status: "ready", options: [] } },
	});
	expect((await second.read()).fields.project.status).toBe("idle");
	expect(apiFetch).toHaveBeenCalledTimes(5);
});

test("switching organizations fences an API page and prevents its continuation request", async () => {
	const firstOrganizationId = "820f6651-2635-4e59-9121-0dedade21f89";
	const secondOrganizationId = "c2a0dcc0-88f7-4542-9698-0f4c8b78a4a1";
	const projectId = "20df9a20-bf49-4ccf-b355-a75bc89cf728";
	const late = deferred();
	const apiFetch = vi.fn(async (url) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/profiles/me")) {
			return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
		}
		if (path.endsWith("/accounts")) {
			return Response.json({
				count: 2,
				value: [
					{ accountId: firstOrganizationId, accountName: "juniper-example" },
					{ accountId: secondOrganizationId, accountName: "harbor-example" },
				],
			});
		}
		if (path === "/juniper-example/_apis/projects") return late.promise;
		expect(path).toBe("/harbor-example/_apis/projects");
		return Response.json({
			count: 1,
			value: [{ id: projectId, name: "Studio" }],
		});
	});
	const { open } = await start(undefined, {
		accountId: "native-repository-account",
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: apiFetch,
	});
	const canvas = await open();
	await canvas.choose("organization", firstOrganizationId);
	await expect.poll(() => apiFetch.mock.calls.length).toBe(3);
	const obsoleteSignal = apiFetch.mock.calls[2][1].signal;
	await canvas.choose("organization", secondOrganizationId);
	await expect.poll(canvas.read).toMatchObject({
		fields: {
			project: {
				status: "ready",
				options: [
					{ id: `${secondOrganizationId}/${projectId}`, name: "Studio" },
				],
			},
		},
	});
	expect(obsoleteSignal.aborted).toBe(true);
	late.resolve(
		Response.json(
			{ count: 1, value: [{ id: projectId, name: "Obsolete" }] },
			{ headers: { "x-ms-continuationtoken": "12" } },
		),
	);
	const state = await canvas.read();
	expect(state.fields.project.options).toEqual([
		{ id: `${secondOrganizationId}/${projectId}`, name: "Studio" },
	]);
	expect(apiFetch).toHaveBeenCalledTimes(4);
});

test("several native accounts show one path-only list and confirm through the account listing the organization", async () => {
	const { authentication, ids } = nativeAuthentication();
	authentication.listAccounts.mockResolvedValue([
		{ id: "oldest", name: "Oldest" },
		{ id: "opaque-account", name: "Ada Example" },
	]);
	const healthy = authentication.getAccessToken.getMockImplementation();
	authentication.getAccessToken.mockImplementation(async (request) => {
		if (request.accountId === "oldest")
			throw Object.assign(new Error("private"), { code: "auth_required" });
		return healthy(request);
	});
	const { picker, open } = await start(undefined, undefined, authentication);
	const canvas = await open("host");
	await canvas.choose("organization", ids.organization);
	await canvas.choose("project", `${ids.organization}/${ids.project}`);
	await canvas.choose(
		"repository",
		`${ids.organization}/${ids.project}/${ids.repository}`,
	);
	const state = await canvas.read();
	expect(state.fields).not.toHaveProperty("account");
	expect(state.fields.organization).not.toHaveProperty("error");
	const guest = await liveDocument(canvas);
	const confirmation = action(picker, "confirm-selection", canvas.instanceId);
	expect((await guest.acknowledge(await guest.notice())).status).toBe(200);
	expect((await confirmation).value).toMatchObject({
		accountId: "opaque-account",
	});
});
