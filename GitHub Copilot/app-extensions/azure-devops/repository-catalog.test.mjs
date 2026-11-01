// @vitest-environment node
import { getEventListeners } from "node:events";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import { createActionTelemetry } from "./action-telemetry.mjs";
import {
	createNativeRepositoryCatalog,
	createRepositoryCatalog,
} from "./repository-catalog.mjs";

// Fictionalized response bodies follow the Microsoft REST 7.1 examples linked in README.md.
const profileId = "ee238eb3-efed-42c3-b57e-f34c297c933d";
const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
const projectId = "20df9a20-bf49-4ccf-b355-a75bc89cf728";
const repositoryId = "72fb8993-569d-4b27-9dde-6325437726a4";
const account = {
	accountId: organizationId,
	accountName: "juniper-example",
	accountUri: "https://example.invalid/never-follow-this",
};
const project = { id: projectId, name: "Studio & tools" };
const repository = { id: repositoryId, name: "service", project };
const list = (value) => ({ count: value.length, value });

function setup() {
	const report = vi.fn();
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "fixture-token" }),
	};
	const fetch = vi.fn();
	const input = {
		accountId: "native-repository-account",
		authentication,
		fetch,
		telemetry: createActionTelemetry(report),
	};
	const catalog = createRepositoryCatalog(input);
	function respond(data, headers) {
		fetch.mockResolvedValueOnce(Response.json(data, { headers }));
	}
	async function organizations(accounts = [account]) {
		respond({ id: profileId, emailAddress: "reader@example.test" });
		respond(list(accounts));
		return catalog.listOrganizations({});
	}
	async function projects() {
		const [organization] = await organizations();
		respond(list([project]));
		const [selectedProject] = await catalog.listProjects({ organization });
		return { organization, project: selectedProject };
	}
	return {
		catalog,
		authentication,
		fetch,
		input,
		respond,
		organizations,
		projects,
		report,
	};
}

afterEach(() => vi.restoreAllMocks());

test("flat discovery uses one organization-wide request without enumerating projects or following paging", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(
		list(
			Array.from({ length: 1100 }, (_, index) => ({
				...repository,
				id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
			})),
		),
	);
	const results = await source.catalog.listOrganizationRepositories({
		organization,
	});
	expect(results).toHaveLength(100);
	expect(results.discoveryLimited).toBe(true);
	expect(results[0]).toMatchObject({
		name: "juniper-example/Studio & tools/service",
		project: { id: `${organizationId}/${projectId}`, name: project.name },
		repository: {
			id: `${organizationId}/${projectId}/00000000-0000-0000-0000-000000000000`,
			name: "service",
		},
	});
	expect(source.fetch).toHaveBeenCalledTimes(3);
	for (const [, init] of source.fetch.mock.calls) {
		expect(init.headers["User-Agent"]).toBe("ADOGithubApp");
	}
	const url = new URL(source.fetch.mock.calls[2][0]);
	expect(url.pathname).toBe("/juniper-example/_apis/git/repositories");
	expect(url.searchParams.has("continuationToken")).toBe(false);
	source.respond(list([repository]), {
		"x-ms-continuationtoken": "unexpected",
	});
	await expect(
		source.catalog.listOrganizationRepositories({ organization }),
	).rejects.toMatchObject({ code: "invalid-response" });
	expect(source.fetch).toHaveBeenCalledTimes(4);
});

test.each([99, 100, 101])(
	"flat discovery exposes prefix coverage separately from list length: %s records",
	async (count) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(
			list(
				Array.from({ length: count }, (_, index) => ({
					...repository,
					id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
				})),
			),
		);
		const results = await source.catalog.listOrganizationRepositories({
			organization,
		});
		expect(results).toHaveLength(Math.min(count, 100));
		expect(results.discoveryLimited).toBe(count > 100);
	},
);

test("fully qualified lookup resolves one canonical repository without enumerating projects or repositories", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond({
		...repository,
		remoteUrl: "https://example.invalid/not-a-clone-origin",
	});
	const result = await source.catalog.findRepository({
		organization,
		projectName: project.name,
		repository: "SERVICE",
	});
	expect(result).toMatchObject({
		id: `${organizationId}/${projectId}/${repositoryId}`,
		project: { id: `${organizationId}/${projectId}`, name: project.name },
		repository: {
			id: `${organizationId}/${projectId}/${repositoryId}`,
			name: "service",
		},
	});
	expect(new URL(source.fetch.mock.calls.at(-1)[0]).pathname).toBe(
		"/juniper-example/Studio%20%26%20tools/_apis/git/repositories/SERVICE",
	);
	expect(source.fetch).toHaveBeenCalledTimes(3);
	expect(JSON.stringify(result)).not.toContain("example.invalid");
});

test("an exact project's sibling catalog uses its canonical route without project discovery and survives bounded project reads", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(repository);
	const exact = await source.catalog.findRepository({
		organization,
		projectName: project.name,
		repository: repository.name,
	});
	const sibling = { ...repository, id: profileId, name: "service.skills" };
	source.respond(list([repository, sibling]));
	const results = await source.catalog.listOrganizationRepositories({
		organization,
		project: exact.project,
	});
	expect(results.map((item) => item.repository.name)).toEqual([
		"service",
		"service.skills",
	]);
	expect(new URL(source.fetch.mock.calls.at(-1)[0]).pathname).toBe(
		`/juniper-example/${projectId}/_apis/git/repositories`,
	);
	expect(source.fetch).toHaveBeenCalledTimes(4);
	source.respond(list([{ id: profileId, name: "Another project" }]), {
		"x-ms-continuationtoken": "ignored-by-bounded-discovery",
	});
	await source.catalog.listProjects({ organization, bounded: true });
	source.respond(list([sibling]));
	await expect(
		source.catalog.listOrganizationRepositories({
			organization,
			project: exact.project,
		}),
	).resolves.toHaveLength(1);
	expect(source.fetch).toHaveBeenCalledTimes(6);
});

test("project discovery streams a large complete catalog and retains only compact identities beyond record 1000", async () => {
	const source = setup();
	const { organization, project: selectedProject } = await source.projects();
	const diagnostics = {};
	source.respond(
		list(
			Array.from({ length: 1500 }, (_, index) => ({
				...repository,
				id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
				name: index === 1499 ? "service.skills" : `unrelated${index}`,
				description: "discarded metadata ".repeat(256),
			})),
		),
	);
	const results = await source.catalog.listOrganizationRepositories({
		organization,
		project: selectedProject,
		diagnostics,
	});
	expect(results).toHaveLength(1500);
	expect(results.at(-1).repository.name).toBe("service.skills");
	expect(JSON.stringify(results)).not.toContain("discarded metadata");
	expect(source.report.mock.calls.at(-1)[0].responseBytes).toBeGreaterThan(
		2 * 1024 * 1024,
	);
	expect(source.fetch).toHaveBeenCalledTimes(4);
});

test("project discovery reads beyond 100 records across UTF-8 and JSON chunk boundaries", async () => {
	const source = setup();
	const { organization, project: selectedProject } = await source.projects();
	const values = Array.from({ length: 110 }, (_, index) => ({
		...repository,
		id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
		name: `caf\u00e9-${index}`,
		description: 'escaped \\" metadata [value]',
	}));
	const bytes = new TextEncoder().encode(
		JSON.stringify({ value: values, count: values.length }),
	);
	let offset = 0;
	source.fetch.mockResolvedValueOnce(
		new Response(
			new ReadableStream(
				{
					pull(controller) {
						if (offset === bytes.length) controller.close();
						else {
							const end = Math.min(offset + 17, bytes.length);
							controller.enqueue(bytes.slice(offset, end));
							offset = end;
						}
					},
				},
				{ highWaterMark: 0 },
			),
		),
	);
	const results = await source.catalog.listOrganizationRepositories({
		organization,
		project: selectedProject,
	});
	expect(results).toHaveLength(110);
	expect(results.at(-1).repository.name).toBe("caf\u00e9-109");
	expect(offset).toBe(bytes.length);
});

test.each(["cancellation", "deadline"])(
	"a stalled full project stream stops on %s without returning its partial catalog",
	async (kind) => {
		const source = setup();
		const { organization, project: selectedProject } = await source.projects();
		const controller = new AbortController();
		const timeout =
			kind === "deadline" &&
			vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
		const reading = Promise.withResolvers();
		const cancel = vi.fn();
		let pulls = 0;
		source.fetch.mockResolvedValueOnce(
			new Response(
				new ReadableStream(
					{
						pull(stream) {
							if (++pulls === 1) {
								stream.enqueue(
									new TextEncoder().encode(
										`{"count":2,"value":[${JSON.stringify(repository)},`,
									),
								);
							} else reading.resolve();
						},
						cancel,
					},
					{ highWaterMark: 0 },
				),
			),
		);
		const pending = source.catalog.listOrganizationRepositories({
			organization,
			project: selectedProject,
			...(kind === "cancellation" ? { signal: controller.signal } : {}),
		});
		const result = expect(pending).rejects.toMatchObject({
			name: kind === "deadline" ? "TimeoutError" : "AbortError",
		});
		await reading.promise;
		controller.abort(
			new DOMException(
				"Project read stopped",
				kind === "deadline" ? "TimeoutError" : "AbortError",
			),
		);
		await result;
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(source.fetch).toHaveBeenCalledTimes(4);
		if (timeout) expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
	},
);

test.each([
	`{"count":2,"value":[${JSON.stringify(repository)}]}`,
	`{"count":1,"value":[${JSON.stringify(repository)},]}`,
	`{"count":1,"value":[,${JSON.stringify(repository)}]}`,
	`{"count":1,"value":[${JSON.stringify(repository)}]`,
	`{"count":1,"value":[${JSON.stringify(repository)}],"value":[]}`,
])(
	"a streamed project catalog rejects malformed or incomplete collections: %s",
	async (body) => {
		const source = setup();
		const { organization, project: selectedProject } = await source.projects();
		source.fetch.mockResolvedValueOnce(new Response(body));
		await expect(
			source.catalog.listOrganizationRepositories({
				organization,
				project: selectedProject,
			}),
		).rejects.toMatchObject({ code: "invalid-response" });
	},
);

test("project streams retain the per-record size safeguard", async () => {
	const source = setup();
	const { organization, project: selectedProject } = await source.projects();
	source.respond(
		list([{ ...repository, description: "x".repeat(2 * 1024 * 1024) }]),
	);
	await expect(
		source.catalog.listOrganizationRepositories({
			organization,
			project: selectedProject,
		}),
	).rejects.toMatchObject({ code: "limit" });
});

test("project streams bound the retained identity index instead of retaining unlimited metadata", async () => {
	const source = setup();
	const { organization, project: selectedProject } = await source.projects();
	source.respond(
		list(
			Array.from({ length: 5000 }, (_, index) => ({
				...repository,
				id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
				name: "x".repeat(500),
			})),
		),
	);
	await expect(
		source.catalog.listOrganizationRepositories({
			organization,
			project: selectedProject,
		}),
	).rejects.toMatchObject({ code: "limit" });
});

test.each([401, 403, 429, 503])(
	"exact lookup surfaces HTTP %i instead of hiding it as a search miss",
	async (status) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.fetch.mockResolvedValueOnce(
			new Response("private upstream body", { status }),
		);
		await expect(
			source.catalog.findRepository({
				organization,
				projectName: project.name,
				repository: repository.name,
			}),
		).rejects.toMatchObject({ code: "http", status });
		expect(source.fetch).toHaveBeenCalledTimes(3);
	},
);

test("only HTTP 404 is an exact lookup miss", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
	await expect(
		source.catalog.findRepository({
			organization,
			projectName: project.name,
			repository: repository.name,
		}),
	).resolves.toBeNull();
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		result: "success",
		choiceCount: 0,
	});
});

test.each([
	{ ...repository, name: "another" },
	{ ...repository, project: { ...project, name: "another" } },
	{ ...repository, id: "not-a-guid" },
	{ ...repository, project: { ...project, id: "not-a-guid" } },
])(
	"exact lookup rejects mismatched or malformed identity metadata",
	async (value) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(value);
		await expect(
			source.catalog.findRepository({
				organization,
				projectName: project.name,
				repository: repository.name,
			}),
		).rejects.toMatchObject({ code: "invalid-response" });
	},
);

test("bounded project discovery does not follow continuation and scopes the streamed repository request", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([project]), {
		"x-ms-continuationtoken": "unused-next-page",
	});
	const [selectedProject] = await source.catalog.listProjects({
		organization,
		bounded: true,
	});
	expect(source.fetch).toHaveBeenCalledTimes(3);
	source.respond(
		list(
			Array.from({ length: 150 }, (_, index) => ({
				...repository,
				id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
			})),
		),
	);
	const results = await source.catalog.listOrganizationRepositories({
		organization,
		project: selectedProject,
	});
	expect(results).toHaveLength(150);
	expect(new URL(source.fetch.mock.calls.at(-1)[0]).pathname).toBe(
		`/juniper-example/${project.id}/_apis/git/repositories`,
	);
	expect(source.fetch).toHaveBeenCalledTimes(4);
});

test("flat discovery keeps the 2 MiB byte bound even for oversized individual records", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	const large = list([
		{
			...repository,
			project: { ...project, description: "x".repeat(3 * 1024 * 1024) },
		},
	]);
	source.respond(large);
	await expect(
		source.catalog.listOrganizationRepositories({ organization }),
	).rejects.toMatchObject({ code: "limit" });
	source.respond(list([project]));
	const [selectedProject] = await source.catalog.listProjects({ organization });
	source.respond(large);
	await expect(
		source.catalog.listRepositories({
			organization,
			project: selectedProject,
		}),
	).rejects.toMatchObject({ code: "limit" });
	source.fetch.mockResolvedValueOnce(
		new Response(
			new ReadableStream({
				start(controller) {
					const chunk = new Uint8Array(1024 * 1024);
					for (let index = 0; index < 3; index++) controller.enqueue(chunk);
					controller.close();
				},
			}),
		),
	);
	await expect(
		source.catalog.listOrganizationRepositories({ organization }),
	).rejects.toMatchObject({ code: "limit" });
});

test("project routes for a cached organization survive discovering another organization's projects", async () => {
	const source = setup();
	const orgs = await source.organizations([
		account,
		{
			accountId: "122f65e4-d483-4d07-8a91-74265e029d5e",
			accountName: "harbor",
		},
	]);
	source.respond(list([project]));
	const [selectedProject] = await source.catalog.listProjects({
		organization: orgs[0],
		bounded: true,
	});
	source.respond(list([project]));
	await source.catalog.listProjects({ organization: orgs[1], bounded: true });
	source.respond(list([repository]));
	await expect(
		source.catalog.listOrganizationRepositories({
			organization: orgs[0],
			project: selectedProject,
		}),
	).resolves.toHaveLength(1);
});

test.each(["count-first", "value-first"])(
	"flat discovery cancels after 100 records without reading a large or stalled tail (%s)",
	async (order) => {
		const source = setup();
		const [organization] = await source.organizations();
		const values = Array.from({ length: 100 }, (_, index) => ({
			...repository,
			id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
			extra: {
				value: ['"},[', "\\", "caf\u00e9"],
				nested: [{ name: "value" }],
			},
		}));
		const prefix = `${order === "count-first" ? '{"count":10000,' : "{"}"value":[${values.map((value) => JSON.stringify(value)).join(",")},`;
		let reads = 0;
		const cancel = vi.fn();
		source.fetch.mockResolvedValueOnce(
			new Response(
				new ReadableStream(
					{
						pull(controller) {
							reads += 1;
							if (reads === 1)
								controller.enqueue(new TextEncoder().encode(prefix));
							else throw new Error("The repository tail must not be requested");
						},
						cancel,
					},
					{ highWaterMark: 0 },
				),
				{
					headers: { "content-length": String(16 * 1024 * 1024) },
				},
			),
		);
		const results = await source.catalog.listOrganizationRepositories({
			organization,
		});
		expect(results).toHaveLength(100);
		expect(reads).toBe(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
			result: "success",
			choiceCount: 100,
			responseBytes: new TextEncoder().encode(prefix).byteLength,
		});
	},
);

test.each([0, 1, 99, 100])(
	"flat discovery fully enumerates a %i-record response split across UTF-8 and JSON boundaries",
	async (count) => {
		const source = setup();
		const [organization] = await source.organizations();
		const values = Array.from({ length: count }, (_, index) => ({
			...repository,
			id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
			name: `caf\u00e9-${index}`,
		}));
		const bytes = new TextEncoder().encode(
			JSON.stringify({
				value: values,
				count,
			}),
		);
		let offset = 0;
		source.fetch.mockResolvedValueOnce(
			new Response(
				new ReadableStream(
					{
						pull(controller) {
							if (offset === bytes.length) controller.close();
							else {
								const end = Math.min(offset + 31, bytes.length);
								controller.enqueue(bytes.slice(offset, end));
								offset = end;
							}
						},
					},
					{ highWaterMark: 0 },
				),
			),
		);
		const results = await source.catalog.listOrganizationRepositories({
			organization,
		});
		expect(results).toHaveLength(count);
		if (count)
			expect(results.at(-1).repository.name).toBe(`caf\u00e9-${count - 1}`);
		if (count < 100) expect(offset).toBe(bytes.length);
	},
);

test("flat discovery does not count unrelated root arrays as repository records", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond({
		value: [repository],
		metadata: Array.from({ length: 150 }, (_, index) => index),
		count: 1,
	});
	const results = await source.catalog.listOrganizationRepositories({
		organization,
	});
	expect(results).toHaveLength(1);
	expect(results[0]).toMatchObject({ repository: { name: "service" } });
	expect(results.discoveryLimited).toBe(false);
});

test("flat discovery validates the full response when fewer than 100 records exist", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.fetch.mockResolvedValueOnce(
		new Response(
			`{"count":1,"value":[${JSON.stringify(repository)}]} malformed tail`,
		),
	);
	await expect(
		source.catalog.listOrganizationRepositories({ organization }),
	).rejects.toMatchObject({ code: "invalid-response" });
});

test.each([
	[1, 2],
	[100, 99],
	[100, 101],
	[101, 100],
])(
	"flat discovery rejects a complete %i-record array with inconsistent declared count %i",
	async (length, count) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond({
			count,
			value: Array.from({ length }, (_, index) => ({
				...repository,
				id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
			})),
		});
		await expect(
			source.catalog.listOrganizationRepositories({ organization }),
		).rejects.toMatchObject({ code: "invalid-response" });
	},
);

test.each([
	["auth_required", "auth_required"],
	["denied", "denied"],
	["account_unavailable", "account_unavailable"],
	["credential_unavailable", "credential_unavailable"],
	["busy", "busy"],
	["timeout", "timeout"],
	["response_too_large", "response_too_large"],
	["invalid_request", "invalid_request"],
	["future_code", "future_code", "authentication"],
	["private-code", "unknown", "authentication"],
])(
	"reports the native %s token failure as a safe authentication diagnostic before HTTP",
	async (code, errorCode, catalogCode = code) => {
		const report = vi.fn();
		const fetch = vi.fn();
		const getAccessToken = vi.fn(async () => {
			throw Object.assign(new Error(`Authentication ${code}`), {
				code,
				detail: "private raw host detail",
			});
		});
		const catalog = createRepositoryCatalog({
			accountId: "private-account",
			authentication: { getAccessToken },
			fetch,
			telemetry: createActionTelemetry(report),
		});
		const error = await catalog.listOrganizations().catch((error) => error);
		expect(error).toMatchObject({
			name: "AzureDevOpsCatalogError",
			code: catalogCode,
		});
		expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({
			accountId: "private-account",
			resource: "azure-devops",
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(report.mock.calls).toHaveLength(2);
		expect(report.mock.calls[1][0]).toMatchObject({
			actionId: report.mock.calls[0][0].actionId,
			phase: "finished",
			result: "failure",
			stage: "organization",
			errorStage: "profile",
			errorCode,
			pageCount: 1,
		});
		expect(report.mock.calls[1][0]).not.toHaveProperty("responseBytes");
		expect(JSON.stringify(report.mock.calls)).not.toContain("private");
		expect(JSON.stringify(error)).not.toContain("private");
	},
);

test.each([
	["a rejected request", new TypeError("private fetch failure"), "unknown"],
	[
		"a request deadline",
		new DOMException("private deadline", "TimeoutError"),
		"timeout",
	],
])(
	"reports %s as a safe network diagnostic without leaking the token",
	async (_, failure, errorCode) => {
		const source = setup();
		source.fetch.mockRejectedValueOnce(failure);
		const error = await source.catalog
			.listOrganizations()
			.catch((error) => error);
		expect(error).toMatchObject({
			name: "AzureDevOpsCatalogError",
			code: "network",
		});
		expect(source.fetch).toHaveBeenCalledOnce();
		expect(source.report.mock.calls[1][0]).toMatchObject({
			result: "failure",
			errorStage: "profile",
			errorCode,
			pageCount: 1,
		});
		const visible = JSON.stringify([
			error,
			error.message,
			source.report.mock.calls,
		]);
		expect(visible).not.toContain("private");
		expect(visible).not.toContain("fixture-token");
	},
);

test("keeps the access token out of catalog choices, errors, and diagnostics", async () => {
	const source = setup();
	const { organization, project: selected } = await source.projects();
	source.fetch.mockResolvedValueOnce(new Response("private", { status: 401 }));
	const error = await source.catalog
		.listRepositories({ organization, project: selected })
		.catch((error) => error);
	expect(error).toMatchObject({ code: "http", status: 401 });
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		result: "failure",
		errorCode: "http",
		httpStatus: 401,
	});
	const visible = JSON.stringify([
		organization,
		selected,
		error,
		error.message,
		source.report.mock.calls,
	]);
	expect(visible).not.toContain("fixture-token");
	expect(visible).not.toContain("Bearer");
});

test.each([401, 403, 429, 503])(
	"reports upstream HTTP %s at the actual failing stage",
	async (status) => {
		const source = setup();
		source.respond({ id: profileId });
		source.fetch.mockResolvedValueOnce(
			new Response("private body", { status }),
		);
		await expect(source.catalog.listOrganizations()).rejects.toMatchObject({
			code: "http",
			status,
		});
		expect(source.report.mock.calls[1][0]).toMatchObject({
			errorCode: "http",
			httpStatus: status,
			errorStage: "organization",
			pageCount: 2,
		});
	},
);

test.each([1000, 1001])(
	"measures organization choice count at the actual %s boundary",
	async (count) => {
		const source = setup();
		const values = Array.from({ length: count }, (_, index) => ({
			accountId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
			accountName: `private-organization-${index}`,
		}));
		const pending = source.organizations(values);
		if (count === 1000) expect(await pending).toHaveLength(1000);
		else await expect(pending).rejects.toMatchObject({ code: "limit" });
		expect(source.report.mock.calls).toHaveLength(2);
		expect(source.report.mock.calls[1][0]).toMatchObject({
			result: count === 1000 ? "success" : "failure",
			choiceCount: count,
			pageCount: 2,
			...(count === 1001
				? { errorCode: "choice_limit", errorStage: "organization" }
				: {}),
		});
		expect(JSON.stringify(source.report.mock.calls)).not.toContain(
			"private-organization",
		);
	},
);

test("catalog attempts cancel once and fence late native results while a healthy sibling progresses", async () => {
	const report = vi.fn();
	const pending = Promise.withResolvers();
	const authentication = {
		getAccessToken: vi.fn(async () => ({ accessToken: "fixture-token" })),
	};
	const fetch = vi
		.fn()
		.mockReturnValueOnce(pending.promise)
		.mockResolvedValueOnce(Response.json({ id: profileId }))
		.mockResolvedValueOnce(Response.json(list([])));
	const catalog = createRepositoryCatalog({
		accountId: "private",
		authentication,
		fetch,
		telemetry: createActionTelemetry(report),
	});
	const controller = new AbortController();
	const old = catalog.listOrganizations({ signal: controller.signal });
	const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
	controller.abort();
	await rejected;
	expect(await catalog.listOrganizations()).toEqual([]);
	pending.resolve(Response.json({ id: profileId }));
	await setImmediate();
	const events = report.mock.calls.map(([value]) => value);
	expect(events).toHaveLength(4);
	expect(events[1]).toMatchObject({
		result: "cancelled",
		errorCode: "aborted",
	});
	expect(events[3]).toMatchObject({ result: "success" });
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(authentication.getAccessToken).toHaveBeenCalledTimes(3);
});

test("discovers memberships using the ADO profile ID, not the native account ID", async () => {
	const source = setup();
	source.input.accountId = "another-native-account";
	expect(await source.organizations()).toEqual([
		{ id: organizationId, name: "juniper-example" },
	]);
	expect(source.fetch.mock.calls.map(([url]) => url)).toEqual([
		"https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
		`https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profileId}&api-version=7.1`,
	]);
	expect(source.authentication.getAccessToken.mock.calls).toEqual([
		[{ accountId: "native-repository-account", resource: "azure-devops" }],
		[{ accountId: "native-repository-account", resource: "azure-devops" }],
	]);
	for (const [, init] of source.fetch.mock.calls) {
		expect(init).toMatchObject({
			method: "GET",
			redirect: "error",
			headers: {
				Accept: "application/json",
				Authorization: "Bearer fixture-token",
			},
		});
		expect(init.body).toBeUndefined();
	}
});

test("uses continuation headers rather than page length or count to list every project", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([project]), { "x-ms-continuationtoken": "12" });
	source.respond(list([]), { "x-ms-continuationtoken": "24" });
	source.respond(
		list([
			{ id: "122f65e4-d483-4d07-8a91-74265e029d5e", name: "Studio & tools" },
		]),
	);
	expect(await source.catalog.listProjects({ organization })).toEqual([
		{ id: `${organizationId}/${projectId}`, name: "Studio & tools" },
		{
			id: `${organizationId}/122f65e4-d483-4d07-8a91-74265e029d5e`,
			name: "Studio & tools",
		},
	]);
	const urls = source.fetch.mock.calls.slice(2).map(([url]) => new URL(url));
	expect(urls.map((url) => url.pathname)).toEqual(
		Array(3).fill("/juniper-example/_apis/projects"),
	);
	expect(urls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
		{ $top: "100", "api-version": "7.1" },
		{ $top: "100", continuationToken: "12", "api-version": "7.1" },
		{ $top: "100", continuationToken: "24", "api-version": "7.1" },
	]);
});

test("routes by trusted organization context and canonical project ID, not display text or response URLs", async () => {
	const source = setup();
	const context = await source.projects();
	source.respond(list([{ ...repository, remoteUrl: account.accountUri }]));
	const result = await source.catalog.listRepositories({
		organization: { ...context.organization, name: "https://example.invalid" },
		project: { ...context.project, name: "../untrusted" },
	});
	expect(source.fetch.mock.calls.at(-1)[0]).toBe(
		`https://dev.azure.com/juniper-example/${projectId}/_apis/git/repositories?api-version=7.1`,
	);
	expect(result).toEqual([
		{
			id: `${organizationId}/${projectId}/${repositoryId}`,
			name: "service",
		},
	]);
});

test("resolves a project-less repository URL without catalog discovery", async () => {
	const source = setup();
	source.respond(repository);
	await expect(
		source.catalog.resolveRepositoryUrl({
			organization: "juniper-example",
			repository: "service",
		}),
	).resolves.toEqual({
		organization: { id: "juniper-example", name: "juniper-example" },
		project: { id: projectId, name: project.name },
		repository: { id: repositoryId, name: repository.name },
	});
	expect(source.fetch).toHaveBeenCalledTimes(1);
	const url = new URL(source.fetch.mock.calls.at(-1)[0]);
	expect(url.pathname).toBe("/juniper-example/_apis/git/repositories/service");
	expect(Object.fromEntries(url.searchParams)).toEqual({
		"api-version": "7.1",
	});
});

test("a missing repository does not fall back to catalog enumeration", async () => {
	const source = setup();
	source.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
	await expect(
		source.catalog.resolveRepositoryUrl({
			organization: "juniper-example",
			repository: "SERVICE",
		}),
	).rejects.toMatchObject({ code: "http", status: 404 });
	expect(source.fetch).toHaveBeenCalledTimes(1);
});

test("rejects repository collections instead of guessing a match", async () => {
	const source = setup();
	source.respond(
		list([
			repository,
			{
				...repository,
				id: "122f65e4-d483-4d07-8a91-74265e029d5e",
				project: {
					id: "a03e4e67-91f7-4d47-9fe2-9af2aec1cb99",
					name: "Another project",
				},
			},
		]),
	);
	await expect(
		source.catalog.resolveRepositoryUrl({
			organization: "juniper-example",
			repository: "service",
		}),
	).rejects.toMatchObject({ code: "invalid-response" });
	expect(source.fetch).toHaveBeenCalledTimes(1);
});

test("encodes the organization path and ignores account-supplied routing URLs", async () => {
	const source = setup();
	const [organization] = await source.organizations([
		{ ...account, accountName: "Juniper & tools%23" },
	]);
	source.respond(list([]));
	await source.catalog.listProjects({ organization });
	expect(new URL(source.fetch.mock.calls.at(-1)[0]).pathname).toBe(
		"/Juniper%20%26%20tools%2523/_apis/projects",
	);
	expect(new URL(source.fetch.mock.calls.at(-1)[0]).origin).toBe(
		"https://dev.azure.com",
	);
});

test("retains only bounded preview metadata from existing catalog requests", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(
		list([{ ...project, description: "Project purpose", url: "private" }]),
	);
	const [selectedProject] = await source.catalog.listProjects({ organization });
	expect(selectedProject).toEqual({
		id: `${organizationId}/${projectId}`,
		name: project.name,
		description: "Project purpose",
	});
	source.respond(
		list([
			{
				...repository,
				defaultBranch: "refs/heads/trunk",
				description: "Not a repository field",
			},
		]),
	);
	expect(
		await source.catalog.listRepositories({
			organization,
			project: selectedProject,
		}),
	).toEqual([
		{
			id: `${organizationId}/${projectId}/${repositoryId}`,
			name: repository.name,
		},
	]);
	expect(source.fetch).toHaveBeenCalledTimes(4);
});

test.each([undefined, null, "", "   "])(
	"omits absent project descriptions and default branches: %j",
	async (value) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(list([{ ...project, description: value }]));
		const [selectedProject] = await source.catalog.listProjects({
			organization,
		});
		expect(selectedProject).not.toHaveProperty("description");
		source.respond(list([{ ...repository, defaultBranch: value }]));
		const [selectedRepository] = await source.catalog.listRepositories({
			organization,
			project: selectedProject,
		});
		expect(selectedRepository).not.toHaveProperty("defaultBranch");
	},
);

test("bounds long display metadata without changing repository identity", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([{ ...project, description: "a".repeat(3000) }]));
	const [selectedProject] = await source.catalog.listProjects({ organization });
	expect(selectedProject.description).toBe(`${"a".repeat(2045)}...`);
	source.respond(
		list([{ ...repository, defaultBranch: `refs/heads/${"a".repeat(600)}` }]),
	);
	const [selectedRepository] = await source.catalog.listRepositories({
		organization,
		project: selectedProject,
	});
	expect(selectedRepository).not.toHaveProperty("defaultBranch");
	expect(selectedRepository.id).toBe(
		`${organizationId}/${projectId}/${repositoryId}`,
	);
});

test("rejects malformed optional display metadata instead of displaying provider objects", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(
		list([{ ...project, description: { private: "never display" } }]),
	);
	await expect(
		source.catalog.listProjects({ organization }),
	).rejects.toMatchObject({
		name: "AzureDevOpsCatalogError",
		code: "invalid-response",
	});
});

test.each(["organizations", "projects", "repositories"])(
	"returns no %s only after a successful empty response",
	async (kind) => {
		const source = setup();
		if (kind === "organizations") {
			expect(await source.organizations([])).toEqual([]);
		} else if (kind === "projects") {
			const [organization] = await source.organizations();
			source.respond(list([]));
			expect(await source.catalog.listProjects({ organization })).toEqual([]);
		} else {
			const context = await source.projects();
			source.respond(list([]));
			expect(await source.catalog.listRepositories(context)).toEqual([]);
		}
	},
);

test.each([401, 403, 404, 429, 500])(
	"reports HTTP %s safely without retrying or reading the error body",
	async (status) => {
		const source = setup();
		const cancel = vi.fn(() =>
			Promise.reject(new Error("private cleanup detail")),
		);
		source.fetch.mockResolvedValue(
			new Response(new ReadableStream({ cancel }), { status }),
		);
		await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
			name: "AzureDevOpsCatalogError",
			code: "http",
			status,
			message: `Azure DevOps repository discovery failed (HTTP ${status}).`,
		});
		expect(source.fetch).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledTimes(1);
	},
);

test.each(["organizations", "projects", "repositories"])(
	"rejects a false empty %s collection with a nonzero count",
	async (kind) => {
		const source = setup();
		let pending;
		if (kind === "organizations") {
			source.respond({ id: profileId });
			source.respond({ count: 1, value: [] });
			pending = source.catalog.listOrganizations({});
		} else if (kind === "projects") {
			const [organization] = await source.organizations();
			source.respond({ count: 1, value: [] });
			pending = source.catalog.listProjects({ organization });
		} else {
			const context = await source.projects();
			source.respond({ count: 1, value: [] });
			pending = source.catalog.listRepositories(context);
		}
		await expect(pending).rejects.toMatchObject({
			code: "invalid-response",
		});
	},
);

test.each([undefined, null, "0", false, -1, 0.5])(
	"rejects missing or invalid collection count: %j",
	async (count) => {
		const source = setup();
		source.respond({ id: profileId });
		source.respond({ count, value: [] });
		await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
			code: "invalid-response",
		});
	},
);

test.each([0, 2])(
	"rejects a project page count of %i for one entry without publishing partial routes",
	async (count) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(list([project]), { "x-ms-continuationtoken": "12" });
		source.respond(
			{
				count,
				value: [{ id: "122f65e4-d483-4d07-8a91-74265e029d5e", name: "Flight" }],
			},
			{ "x-ms-continuationtoken": "24" },
		);
		source.respond(list([]));
		await expect(
			source.catalog.listProjects({ organization }),
		).rejects.toMatchObject({ code: "invalid-response" });
		expect(source.fetch).toHaveBeenCalledTimes(4);
		await expect(
			source.catalog.listRepositories({
				organization,
				project: { id: `${organizationId}/${projectId}`, name: project.name },
			}),
		).rejects.toMatchObject({ code: "invalid-selection" });
		expect(source.fetch).toHaveBeenCalledTimes(4);
	},
);

test.each(["token", "network", "json", "stream"])(
	"keeps private %s failure details out of errors",
	async (failure) => {
		const source = setup();
		const detail = "private account and token detail";
		if (failure === "token") {
			source.authentication.getAccessToken.mockRejectedValue(new Error(detail));
		} else if (failure === "network") {
			source.fetch.mockRejectedValue(new TypeError(detail));
		} else if (failure === "json") {
			source.fetch.mockResolvedValue(new Response(`{"invalid": ${detail}}`));
		} else {
			source.fetch.mockResolvedValue(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error(detail));
						},
					}),
				),
			);
		}
		const error = await source.catalog
			.listOrganizations({})
			.catch((error) => error);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("AzureDevOpsCatalogError");
		expect(error.message).not.toContain(detail);
		expect(JSON.stringify(error)).not.toContain(detail);
		expect(error.cause).toBeUndefined();
		expect(source.fetch.mock.calls.length).toBe(failure === "token" ? 0 : 1);
	},
);

test.each([
	"auth_required",
	"credential_unavailable",
	"account_unavailable",
	"denied",
	"busy",
	"timeout",
	"response_too_large",
])(
	"preserves native token failure %s without dispatching HTTP",
	async (code) => {
		const source = setup();
		source.authentication.getAccessToken.mockRejectedValue(
			Object.assign(new Error("private credential diagnostic"), { code }),
		);
		const error = await source.catalog
			.listOrganizations({})
			.catch((error) => error);
		expect(error).toMatchObject({ name: "AzureDevOpsCatalogError", code });
		expect(error.message).not.toContain("private");
		expect(error.cause).toBeUndefined();
		expect(source.fetch).not.toHaveBeenCalled();
	},
);

test("does not expose an unrecognized token failure code", async () => {
	const source = setup();
	source.authentication.getAccessToken.mockRejectedValue(
		Object.assign(new Error("private credential diagnostic"), {
			code: "private-native-code",
		}),
	);
	await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
		code: "authentication",
	});
	expect(source.fetch).not.toHaveBeenCalled();
});

test.each(["", " ", null, undefined])(
	"rejects an invalid approved access token before HTTP: %s",
	async (accessToken) => {
		const source = setup();
		source.authentication.getAccessToken.mockResolvedValue({ accessToken });
		await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
			code: "authentication",
		});
		expect(source.fetch).not.toHaveBeenCalled();
	},
);

test.each([
	{},
	{ accountId: "" },
	{ accountId: "native-account" },
	{ accountId: "native-account", authentication: {} },
])("requires an explicit native account and token port: %j", (input) => {
	expect(() => createRepositoryCatalog(input)).toThrow();
});

test.each([301, 302, 307, 308])("rejects redirects (%s)", async (status) => {
	const source = setup();
	source.fetch.mockResolvedValue(
		new Response(null, {
			status,
			headers: { Location: "https://example.invalid" },
		}),
	);
	await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
		code: "http",
		status,
	});
	expect(source.fetch).toHaveBeenCalledTimes(1);
	expect(source.fetch.mock.calls[0][1].redirect).toBe("error");
});

test.each([null, {}, { id: "native-repository-account" }])(
	"rejects malformed profile data before requesting memberships: %j",
	async (profile) => {
		const source = setup();
		source.respond(profile);
		await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
			code: "invalid-response",
		});
		expect(source.fetch).toHaveBeenCalledTimes(1);
	},
);

test.each([
	null,
	{},
	{ value: {} },
	list([{ ...account, accountId: "not-an-ado-id" }]),
	list([{ ...account, accountName: "" }]),
	list([{ ...account, accountName: ".." }]),
	list([{ ...account, accountName: "../elsewhere" }]),
	list([account, account]),
])("rejects malformed organization lists: %j", async (data) => {
	const source = setup();
	source.respond({ id: profileId });
	source.respond(data);
	await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
		code: "invalid-response",
	});
});

test("rejects wrong-project repositories and selections not obtained from this catalog", async () => {
	const source = setup();
	const context = await source.projects();
	source.respond(
		list([{ ...repository, project: { ...project, id: organizationId } }]),
	);
	await expect(source.catalog.listRepositories(context)).rejects.toMatchObject({
		code: "invalid-response",
	});
	source.fetch.mockClear();
	source.authentication.getAccessToken.mockClear();
	await expect(
		source.catalog.listProjects({
			organization: { id: "invented", name: "example" },
		}),
	).rejects.toMatchObject({ code: "invalid-selection" });
	await expect(
		source.catalog.listRepositories({
			...context,
			project: { id: projectId, name: project.name },
		}),
	).rejects.toMatchObject({ code: "invalid-selection" });
	expect(source.authentication.getAccessToken).not.toHaveBeenCalled();
	expect(source.fetch).not.toHaveBeenCalled();
});

test("rejects repeated continuation tokens instead of looping or publishing a partial list", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([project]), { "x-ms-continuationtoken": "12" });
	source.respond(list([]), { "x-ms-continuationtoken": "12" });
	await expect(
		source.catalog.listProjects({ organization }),
	).rejects.toMatchObject({
		code: "invalid-response",
	});
	expect(source.fetch).toHaveBeenCalledTimes(4);
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "invalid_pagination",
		errorStage: "project",
		pageCount: 2,
	});
});

test.each(["profile", "organizations", "repositories"])(
	"does not invent pagination for the unpaged %s endpoint",
	async (kind) => {
		const source = setup();
		let pending;
		if (kind === "profile") {
			source.respond({ id: profileId }, { "x-ms-continuationtoken": "next" });
			pending = source.catalog.listOrganizations({});
		} else if (kind === "organizations") {
			source.respond({ id: profileId });
			source.respond(list([account]), { "x-ms-continuationtoken": "next" });
			pending = source.catalog.listOrganizations({});
		} else {
			const context = await source.projects();
			source.respond(list([repository]), { "x-ms-continuationtoken": "next" });
			pending = source.catalog.listRepositories(context);
		}
		await expect(pending).rejects.toMatchObject({ code: "invalid-response" });
		expect(source.fetch).toHaveBeenCalledTimes(
			kind === "profile" ? 1 : kind === "organizations" ? 2 : 4,
		);
		expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
			errorCode: "unexpected_pagination",
			errorStage:
				kind === "profile"
					? "profile"
					: kind === "organizations"
						? "organization"
						: "repository",
		});
	},
);

test.each([false, true])(
	"cancels a pending token wait and fences its late failure=%s",
	async (lateFailure) => {
		const source = setup();
		const token = Promise.withResolvers();
		source.authentication.getAccessToken.mockReturnValue(token.promise);
		const controller = new AbortController();
		const pending = source.catalog.listOrganizations({
			signal: controller.signal,
		});
		const result = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		controller.abort();
		await result;
		expect(source.fetch).not.toHaveBeenCalled();
		if (lateFailure) token.reject(new Error("private late token failure"));
		else token.resolve({ accessToken: "late-token" });
		await setImmediate();
		expect(source.fetch).not.toHaveBeenCalled();
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	},
);

test("does not request a token for an already cancelled caller", async () => {
	const source = setup();
	const signal = AbortSignal.abort();
	await expect(source.catalog.listOrganizations({ signal })).rejects.toBe(
		signal.reason,
	);
	expect(source.authentication.getAccessToken).not.toHaveBeenCalled();
	expect(source.fetch).not.toHaveBeenCalled();
});

test.each(["profile", "project-page"])(
	"a late %s response cannot start another request",
	async (kind) => {
		const source = setup();
		const context =
			kind === "project-page" ? (await source.organizations())[0] : null;
		source.fetch.mockClear();
		const page = Promise.withResolvers();
		source.fetch.mockReturnValueOnce(page.promise);
		const controller = new AbortController();
		const pending =
			kind === "profile"
				? source.catalog.listOrganizations({ signal: controller.signal })
				: source.catalog.listProjects({
						organization: context,
						signal: controller.signal,
					});
		const cancelled = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await vi.waitFor(() => expect(source.fetch).toHaveBeenCalledTimes(1));
		controller.abort();
		await cancelled;
		page.resolve(
			Response.json(kind === "profile" ? { id: profileId } : list([project]), {
				headers: kind === "profile" ? {} : { "x-ms-continuationtoken": "12" },
			}),
		);
		await setImmediate();
		expect(source.fetch).toHaveBeenCalledTimes(1);
	},
);

test("cancelling one catalog does not cancel a shared native token refresh", async () => {
	const first = setup();
	const second = setup();
	const token = Promise.withResolvers();
	first.authentication.getAccessToken.mockReturnValue(token.promise);
	second.authentication.getAccessToken.mockReturnValue(token.promise);
	second.respond({ id: profileId });
	second.respond(list([]));
	const controller = new AbortController();
	const stopped = first.catalog.listOrganizations({
		signal: controller.signal,
	});
	const cancelled = expect(stopped).rejects.toMatchObject({
		name: "AbortError",
	});
	const active = second.catalog.listOrganizations({});
	controller.abort();
	token.resolve({ accessToken: "shared-fixture-token" });
	await cancelled;
	expect(await active).toEqual([]);
	expect(first.fetch).not.toHaveBeenCalled();
	expect(second.fetch).toHaveBeenCalledTimes(2);
});

test("keeps repeated project and repository names distinct under their parent organizations", async () => {
	const source = setup();
	const otherOrganizationId = "c2a0dcc0-88f7-4542-9698-0f4c8b78a4a1";
	const organizations = await source.organizations([
		account,
		{
			...account,
			accountId: otherOrganizationId,
			accountName: "harbor-example",
		},
	]);
	const choices = [];
	for (const organization of organizations) {
		source.respond(list([project]));
		const [selectedProject] = await source.catalog.listProjects({
			organization,
		});
		source.respond(list([repository]));
		const [selectedRepository] = await source.catalog.listRepositories({
			organization,
			project: selectedProject,
		});
		choices.push({ project: selectedProject, repository: selectedRepository });
	}
	expect(choices).toEqual([
		{
			project: { id: `${organizationId}/${projectId}`, name: "Studio & tools" },
			repository: {
				id: `${organizationId}/${projectId}/${repositoryId}`,
				name: "service",
			},
		},
		{
			project: {
				id: `${otherOrganizationId}/${projectId}`,
				name: "Studio & tools",
			},
			repository: {
				id: `${otherOrganizationId}/${projectId}/${repositoryId}`,
				name: "service",
			},
		},
	]);
});

test("rejects duplicate project identities across continuation pages", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([project]), { "x-ms-continuationtoken": "12" });
	source.respond(list([{ ...project, id: project.id.toUpperCase() }]));
	await expect(
		source.catalog.listProjects({ organization }),
	).rejects.toMatchObject({
		code: "invalid-response",
	});
});

test.each(["", " ", "x".repeat(1025)])(
	"rejects malformed continuation headers",
	async (continuationToken) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(list([project]), {
			"x-ms-continuationtoken": continuationToken,
		});
		await expect(
			source.catalog.listProjects({ organization }),
		).rejects.toMatchObject({
			code: "invalid-response",
		});
		expect(source.fetch).toHaveBeenCalledTimes(3);
		expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
			errorCode: "invalid_pagination",
			errorStage: "project",
			pageCount: 1,
		});
	},
);

test("bounds project pagination even if a service keeps returning new continuation tokens", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	for (let page = 1; page <= 100; page++) {
		source.respond(list([]), { "x-ms-continuationtoken": String(page) });
	}
	await expect(
		source.catalog.listProjects({ organization }),
	).rejects.toMatchObject({
		code: "limit",
	});
	expect(source.fetch).toHaveBeenCalledTimes(102);
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "page_limit",
		pageCount: 100,
		choiceCount: 0,
	});
});

test.each([1000, 1001])(
	"enforces the 1,000-choice bound without truncation: %s",
	async (count) => {
		const source = setup();
		const [organization] = await source.organizations();
		source.respond(
			list(
				Array.from({ length: count }, (_, index) => ({
					id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
					name: `Project ${index}`,
				})),
			),
		);
		const pending = source.catalog.listProjects({ organization });
		if (count === 1000) {
			expect(await pending).toHaveLength(count);
		} else {
			await expect(pending).rejects.toMatchObject({ code: "limit" });
		}
		expect(source.fetch).toHaveBeenCalledTimes(3);
	},
);

test("the choice bound applies across pages, not just to each response", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	for (let start = 0; start <= 1000; start += 100) {
		source.respond(
			list(
				Array.from({ length: start === 1000 ? 1 : 100 }, (_, offset) => ({
					id: `00000000-0000-4000-8000-${String(start + offset).padStart(12, "0")}`,
					name: `Project ${start + offset}`,
				})),
			),
			start === 1000 ? {} : { "x-ms-continuationtoken": String(start + 100) },
		);
	}
	await expect(
		source.catalog.listProjects({ organization }),
	).rejects.toMatchObject({
		code: "limit",
	});
	expect(source.fetch).toHaveBeenCalledTimes(13);
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "choice_limit",
		pageCount: 11,
		choiceCount: 1001,
	});
});

test.each(["declared", "streamed"])(
	"rejects %s responses beyond 2 MiB without exposing body contents",
	async (kind) => {
		const source = setup();
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				if (kind === "streamed") {
					controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1).fill(32));
				}
			},
			cancel,
		});
		source.fetch.mockResolvedValue(
			new Response(body, {
				headers:
					kind === "declared"
						? { "Content-Length": String(2 * 1024 * 1024 + 1) }
						: {},
			}),
		);
		await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
			code: "limit",
		});
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(source.fetch).toHaveBeenCalledTimes(1);
		expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
			errorCode: "response_too_large",
			errorStage: "profile",
			...(kind === "streamed" ? { responseBytes: 2 * 1024 * 1024 + 1 } : {}),
		});
	},
);

test("the 30-second list deadline includes token acquisition and cannot send a late request", async () => {
	const source = setup();
	const deadline = new AbortController();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(deadline.signal);
	const token = Promise.withResolvers();
	source.authentication.getAccessToken.mockReturnValue(token.promise);
	const pending = source.catalog.listOrganizations({});
	const result = expect(pending).rejects.toMatchObject({
		name: "TimeoutError",
	});
	expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
	deadline.abort(new DOMException("The list timed out", "TimeoutError"));
	await result;
	token.resolve({ accessToken: "late-token" });
	await setImmediate();
	expect(source.fetch).not.toHaveBeenCalled();
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "local_timeout",
		result: "failure",
		errorStage: "profile",
	});
});

test("one list deadline covers all continuation pages and stops a stalled response body", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	const deadline = new AbortController();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(deadline.signal);
	source.respond(list([project]), { "x-ms-continuationtoken": "12" });
	const reading = Promise.withResolvers();
	const cancel = vi.fn();
	source.fetch.mockResolvedValueOnce(
		new Response(
			new ReadableStream({
				pull() {
					reading.resolve();
				},
				cancel,
			}),
		),
	);
	const pending = source.catalog.listProjects({ organization });
	const result = expect(pending).rejects.toMatchObject({
		name: "TimeoutError",
	});
	await reading.promise;
	await vi.waitFor(() => expect(source.fetch).toHaveBeenCalledTimes(4));
	deadline.abort(new DOMException("The list timed out", "TimeoutError"));
	await result;
	expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
	expect(cancel).toHaveBeenCalledTimes(1);
	expect(source.fetch).toHaveBeenCalledTimes(4);
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "local_timeout",
		result: "failure",
		pageCount: 2,
		choiceCount: 1,
	});
});

test("accepts a response exactly at the 2 MiB byte bound", async () => {
	const source = setup();
	const prefix = `{"id":"${profileId}","ignored":"`;
	const suffix = '"}';
	const body =
		prefix +
		" ".repeat(2 * 1024 * 1024 - prefix.length - suffix.length) +
		suffix;
	expect(Buffer.byteLength(body)).toBe(2 * 1024 * 1024);
	source.fetch.mockResolvedValueOnce(new Response(body));
	source.respond(list([]));
	expect(await source.catalog.listOrganizations({})).toEqual([]);
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		result: "success",
		responseBytes:
			2 * 1024 * 1024 + Buffer.byteLength(JSON.stringify(list([]))),
	});
});

test("rejects invalid UTF-8 without exposing the response", async () => {
	const source = setup();
	source.fetch.mockResolvedValueOnce(
		new Response(new Uint8Array([0x7b, 0xff, 0x7d])),
	);
	await expect(source.catalog.listOrganizations({})).rejects.toMatchObject({
		code: "invalid-response",
	});
	expect(source.report.mock.calls.at(-1)[0]).toMatchObject({
		errorCode: "invalid_response",
		errorStage: "profile",
		responseBytes: 3,
	});
});

test("escapes an opaque continuation header as one query value", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([]), {
		"x-ms-continuationtoken": "next+/=?&memberId=ignored",
	});
	source.respond(list([]));
	expect(await source.catalog.listProjects({ organization })).toEqual([]);
	const url = new URL(source.fetch.mock.calls.at(-1)[0]);
	expect(Object.fromEntries(url.searchParams)).toEqual({
		$top: "100",
		continuationToken: "next+/=?&memberId=ignored",
		"api-version": "7.1",
	});
	expect(url.origin).toBe("https://dev.azure.com");
});

test("a synchronous host abort cannot send an approved token to the service", async () => {
	const source = setup();
	const controller = new AbortController();
	source.authentication.getAccessToken.mockImplementationOnce(async () => {
		controller.abort();
		return { accessToken: "fixture-token" };
	});
	await expect(
		source.catalog.listOrganizations({ signal: controller.signal }),
	).rejects.toBe(controller.signal.reason);
	expect(source.fetch).not.toHaveBeenCalled();
});

test("cancels token acquisition between pages before it can send another HTTP request", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	source.respond(list([project]), { "x-ms-continuationtoken": "12" });
	const token = Promise.withResolvers();
	const waiting = Promise.withResolvers();
	source.authentication.getAccessToken
		.mockResolvedValueOnce({ accessToken: "fixture-token" })
		.mockImplementationOnce(() => {
			waiting.resolve();
			return token.promise;
		});
	const controller = new AbortController();
	const pending = source.catalog.listProjects({
		organization,
		signal: controller.signal,
	});
	const cancelled = expect(pending).rejects.toMatchObject({
		name: "AbortError",
	});
	await waiting.promise;
	controller.abort();
	await cancelled;
	token.resolve({ accessToken: "late-token" });
	await setImmediate();
	expect(source.fetch).toHaveBeenCalledTimes(3);
});

test("repeated repository names under different project IDs remain separate choices", async () => {
	const source = setup();
	const [organization] = await source.organizations();
	const otherProjectId = "122f65e4-d483-4d07-8a91-74265e029d5e";
	source.respond(list([project, { ...project, id: otherProjectId }]));
	const projects = await source.catalog.listProjects({ organization });
	const repositoryChoices = [];
	for (const [index, selectedProject] of projects.entries()) {
		source.respond(
			list([
				{
					...repository,
					project: { ...project, id: index === 0 ? projectId : otherProjectId },
				},
			]),
		);
		repositoryChoices.push(
			await source.catalog.listRepositories({
				organization,
				project: selectedProject,
			}),
		);
	}
	expect(repositoryChoices.map(([choice]) => choice.id)).toEqual([
		`${organizationId}/${projectId}/${repositoryId}`,
		`${organizationId}/${otherProjectId}/${repositoryId}`,
	]);
});

test.each(["projects", "repositories"])(
	"captures the selected parent identities before awaiting %s credentials",
	async (kind) => {
		const source = setup();
		const context = await source.projects();
		source.authentication.getAccessToken.mockImplementationOnce(async () => {
			context.organization.id = "changed-organization";
			context.project.id = "changed-project";
			return { accessToken: "fixture-token" };
		});
		source.respond(list(kind === "projects" ? [project] : [repository]));
		const result = await (kind === "projects"
			? source.catalog.listProjects(context)
			: source.catalog.listRepositories(context));
		expect(result).toEqual(
			kind === "projects"
				? [{ id: `${organizationId}/${projectId}`, name: "Studio & tools" }]
				: [
						{
							id: `${organizationId}/${projectId}/${repositoryId}`,
							name: "service",
						},
					],
		);
	},
);

const harbor = {
	accountId: "3c5e8f2a-1b4d-4e6f-8a9b-0c1d2e3f4a5b",
	accountName: "harbor-example",
};

function nativeCatalog(respond, accounts = ["a", "b"]) {
	const authentication = {
		listAccounts: async () => accounts.map((id) => ({ id, name: id })),
		getAccessToken: vi.fn(async ({ accountId }) => ({
			accessToken: accountId,
		})),
	};
	const fetch = vi.fn(async (url, init) => {
		const accountId = init.headers.Authorization.split(" ")[1];
		const path = new URL(url).pathname;
		if (path.endsWith("/profiles/me")) return Response.json({ id: profileId });
		const value = await respond(accountId, path);
		return value instanceof Response
			? value
			: value
				? Response.json(value)
				: new Response("", { status: 404 });
	});
	const routed = (path) =>
		fetch.mock.calls
			.filter(([url]) => new URL(url).pathname === path)
			.map(([, init]) => init.headers.Authorization.split(" ")[1]);
	return {
		catalog: createNativeRepositoryCatalog(authentication, fetch),
		authentication,
		routed,
		signal: new AbortController().signal,
	};
}

test("native discovery lists every account and reads a shared organization through the oldest", async () => {
	const { catalog, routed, signal } = nativeCatalog((accountId, path) => {
		if (path === "/_apis/accounts")
			return list(accountId === "a" ? [account] : [account, harbor]);
		if (path.endsWith("/_apis/git/repositories")) return list([repository]);
	});
	const [juniper, harborOrganization] = await catalog.listOrganizations({
		signal,
	});
	expect(harborOrganization.name).toBe("harbor-example");
	const [shared] = await catalog.listOrganizationRepositories({
		organization: juniper,
		signal,
	});
	const [own] = await catalog.listOrganizationRepositories({
		organization: harborOrganization,
		signal,
	});
	expect([shared.account, own.account]).toEqual([
		{ id: "a", name: "a" },
		{ id: "b", name: "b" },
	]);
	expect(routed("/juniper-example/_apis/git/repositories")).toEqual(["a"]);
});

test("native discovery skips failing accounts and surfaces an authorization failure only when nothing is listed", async () => {
	let listed = true;
	const source = nativeCatalog((accountId, path) =>
		accountId === "a"
			? new Response("", { status: 503 })
			: path === "/_apis/accounts"
				? list(listed ? [account] : [])
				: undefined,
	);
	await expect(
		source.catalog.listOrganizations({ signal: source.signal }),
	).resolves.toHaveLength(1);
	listed = false;
	source.authentication.getAccessToken.mockImplementation(
		async ({ accountId }) => {
			if (accountId === "b")
				throw Object.assign(new Error(""), { code: "auth_required" });
			return { accessToken: accountId };
		},
	);
	await expect(
		source.catalog.listOrganizations({ signal: source.signal }),
	).rejects.toMatchObject({ code: "auth_required", account: { id: "b" } });
	const empty = nativeCatalog(() => undefined, []);
	await expect(
		empty.catalog.listOrganizations({ signal: empty.signal }),
	).rejects.toMatchObject({ code: "account_required" });
});

test("native URL lookup lists organizations first and uses the organization's account, else the oldest", async () => {
	const { catalog, routed, signal } = nativeCatalog((accountId, path) =>
		path === "/_apis/accounts"
			? list(accountId === "b" ? [harbor] : [])
			: { ...repository, project: { id: projectId, name: "Studio" } },
	);
	const lookup = (organization) =>
		catalog.resolveRepositoryUrl({
			organization,
			project: "Studio",
			repository: "service",
			signal,
		});
	await expect(lookup("harbor-example")).resolves.toMatchObject({
		account: { id: "b" },
	});
	await expect(lookup("unlisted")).resolves.toMatchObject({
		account: { id: "a" },
	});
	expect(routed("/_apis/accounts")).toEqual(["a", "b"]);
});

test("native URL lookup bounds organization listing so a stalled account cannot hold confirmation", async () => {
	const deadline = new AbortController();
	const timeout = AbortSignal.timeout.bind(AbortSignal);
	vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
		ms === 8_000 ? deadline.signal : timeout(ms),
	);
	const { catalog, signal } = nativeCatalog((accountId, path) =>
		accountId === "a"
			? new Promise(() => {})
			: path === "/_apis/accounts"
				? list([harbor])
				: { ...repository, project: { id: projectId, name: "Studio" } },
	);
	const lookup = catalog.resolveRepositoryUrl({
		organization: "harbor-example",
		project: "Studio",
		repository: "service",
		signal,
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	deadline.abort(new DOMException("deadline", "TimeoutError"));
	await expect(lookup).resolves.toMatchObject({ account: { id: "b" } });
});

test("native URL lookup lists again after a listing that timed out an account", async () => {
	const deadlines = [];
	const timeout = AbortSignal.timeout.bind(AbortSignal);
	vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
		if (ms !== 8_000) return timeout(ms);
		deadlines.push(new AbortController());
		return deadlines.at(-1).signal;
	});
	let stalled = true;
	const { catalog, routed, signal } = nativeCatalog((accountId, path) => {
		if (path === "/_apis/accounts")
			return accountId === "a"
				? list([account])
				: stalled
					? new Promise(() => {})
					: list([harbor]);
		if (accountId === "b")
			return { ...repository, project: { id: projectId, name: "Studio" } };
	});
	const lookup = () =>
		catalog.resolveRepositoryUrl({
			organization: "harbor-example",
			project: "Studio",
			repository: "service",
			signal,
		});
	const first = lookup();
	await vi.waitFor(() => expect(deadlines).toHaveLength(2));
	for (const deadline of deadlines)
		deadline.abort(new DOMException("deadline", "TimeoutError"));
	await expect(first).rejects.toMatchObject({ account: { id: "a" } });
	stalled = false;
	await expect(lookup()).resolves.toMatchObject({ account: { id: "b" } });
	expect(routed("/_apis/accounts")).toEqual(["a", "b", "a", "b"]);
});

test("a timed-out relisting keeps organizations an earlier listing routed", async () => {
	const deadlines = [];
	const timeout = AbortSignal.timeout.bind(AbortSignal);
	vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
		if (ms !== 8_000) return timeout(ms);
		deadlines.push(new AbortController());
		return deadlines.at(-1).signal;
	});
	const stalled = new Set(["c"]);
	const { catalog, signal } = nativeCatalog(
		(accountId, path) =>
			path !== "/_apis/accounts"
				? { ...repository, project: { id: projectId, name: "Studio" } }
				: stalled.has(accountId)
					? new Promise(() => {})
					: list(accountId === "a" ? [account] : [harbor]),
		["a", "b", "c"],
	);
	const lookup = async (organization, listings) => {
		const pending = catalog.resolveRepositoryUrl({
			organization,
			project: "Studio",
			repository: "service",
			signal,
		});
		await vi.waitFor(() => expect(deadlines).toHaveLength(listings * 3));
		for (const deadline of deadlines)
			deadline.abort(new DOMException("deadline", "TimeoutError"));
		return pending;
	};
	await expect(lookup("juniper-example", 1)).resolves.toMatchObject({
		account: { id: "a" },
	});
	stalled.add("b");
	await expect(lookup("harbor-example", 2)).resolves.toMatchObject({
		account: { id: "b" },
	});
});
