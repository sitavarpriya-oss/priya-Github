// @vitest-environment node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getHost, selectMergeMethod } from "@github/copilot-app";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import activate from "./app.mjs";
import { createCreateFromCanvas } from "./create-from.mjs";
import {
	branchName,
	createCreateFromApi,
	repositoryOrigin,
} from "./create-from-api.mjs";
import { createCreateFromState } from "./create-from-state.mjs";
import { createPullRequestUi } from "./pr-ui.mjs";
import { createPullRequestProjectionObserver } from "./pull-request-projection-observer.mjs";
import { createCloneDescriptor } from "./repository-selection.mjs";
import { MAX_RESPONSE_BYTES } from "./request.mjs";

const repositorySelection = {
	account: { id: "microsoft-account", name: "Ada" },
	organization: {
		id: "11111111-1111-1111-1111-111111111111",
		name: "Fabrikam",
	},
	project: {
		id: "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222",
		name: "Developer Tools",
	},
	repository: {
		id: "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333",
		name: "Copilot App",
	},
};
const prUiContext = {
	originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets",
	sourceRef: "refs/heads/change",
	targetRef: "refs/heads/main",
	title: "A change",
	description: "Generated description grounded in the branch changes.",
};

const createFromOrigin = "https://dev.azure.com/fabrikam/Tools/_git/widgets";
const createFromRepository = {
	id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
	name: "widgets",
	project: { id: "d3220790-8a9a-46a4-a2b8-77ecfc7e4c77", name: "Tools" },
	webUrl: createFromOrigin,
};
function createFromBranch(
	name = "feature/real",
	date = "2026-10-04T10:00:00Z",
) {
	return { name, commit: { commitId: "a".repeat(40), committer: { date } } };
}
function createFromRef(name, objectId = "a".repeat(40)) {
	return { name: `refs/heads/${name}`, objectId };
}
function createFromRefs({ all = [], mine = [] }) {
	const calls = [];
	const auth = createFromAuthentication({
		async authenticatedFetch(input) {
			const url = new URL(input.url);
			if (!url.pathname.endsWith("/refs"))
				return Response.json({
					...createFromRepository,
					defaultBranch: "refs/heads/main",
				});
			calls.push(url.searchParams);
			if (url.searchParams.has("includeMyBranches"))
				return url.searchParams.has("$top")
					? new Response(null, { status: 400 })
					: Response.json({ value: mine.map((name) => createFromRef(name)) });
			const search = url.searchParams.get("filterContains").toLowerCase();
			const matching = all.filter((name) =>
				name.toLowerCase().includes(search),
			);
			const start = Number(
				url.searchParams.get("continuationToken")?.split("=")[1] ?? 0,
			);
			const next = start + Number(url.searchParams.get("$top"));
			return Response.json(
				{
					value: matching.slice(start, next).map((name) => createFromRef(name)),
				},
				next < matching.length
					? { headers: { "x-ms-continuationtoken": `opaque&next=${next}` } }
					: undefined,
			);
		},
	});
	return { calls, api: createCreateFromApi(auth, createFromOrigin) };
}
function createFromPr(overrides = {}) {
	return {
		pullRequestId: 73,
		status: "active",
		title: "Real provider change",
		sourceRefName: "refs/heads/feature/real",
		targetRefName: "refs/heads/main",
		creationDate: "2026-10-04T11:00:00Z",
		isDraft: true,
		lastMergeSourceCommit: { commitId: "a".repeat(40) },
		repository: createFromRepository,
		_links: { web: { href: `${createFromOrigin}/pullrequest/73` } },
		...overrides,
	};
}
function createFromAuthentication(overrides = {}) {
	const requests = [];
	const originalFetch = globalThis.fetch;
	let selectedAccount = "native-account";
	const authentication = {
		requests,
		async getAccessToken(input) {
			expect(input.resource).toBe("azure-devops");
			expect(
				input.accountId === undefined || input.accountId === "native-account",
			).toBe(true);
			selectedAccount = input.accountId ?? "native-account";
			return { accessToken: "create-from-fixture-token" };
		},
		async listAccounts() {
			return [{ id: "native-account", name: "Ada" }];
		},
		async authenticatedFetch(input) {
			requests.push(input);
			expect(input.resource).toBe("azure-devops");
			expect(input.accountId).toBe("native-account");
			expect(input.init.method).toBe("GET");
			expect(input.init.headers).toEqual({
				Accept: "application/json",
				"User-Agent": "ADOGithubApp",
			});
			const url = new URL(input.url);
			if (url.pathname.endsWith("/stats/branches"))
				return Response.json(createFromBranch(url.searchParams.get("name")));
			if (url.pathname.endsWith("/pullrequests"))
				return Response.json({ value: [createFromPr()] });
			if (url.pathname.endsWith("/pullrequests/73"))
				return Response.json(createFromPr());
			if (url.pathname.endsWith("/refs"))
				return Response.json({
					value: [
						{ name: "refs/heads/feature/real", objectId: "a".repeat(40) },
					],
				});
			return Response.json(createFromRepository);
		},
		...overrides,
	};
	vi.stubGlobal("fetch", async (url, options) => {
		if (new URL(String(url)).origin !== "https://dev.azure.com")
			return originalFetch(url, options);
		const { headers, ...init } = options;
		const { Authorization, ...visibleHeaders } = headers;
		expect(Authorization).toBe("Bearer create-from-fixture-token");
		expect(init.redirect).toBe("error");
		expect(new URL(url).origin).toBe("https://dev.azure.com");
		return authentication.authenticatedFetch({
			accountId: selectedAccount,
			resource: "azure-devops",
			url: String(url),
			init: { ...init, headers: visibleHeaders },
		});
	});
	onTestFinished(() => vi.unstubAllGlobals());
	return authentication;
}

test("Create from validates credential-free canonical origins and Git refs", () => {
	expect(repositoryOrigin(createFromOrigin).url).toBe(createFromOrigin);
	for (const value of [
		"http://dev.azure.com/fabrikam/Tools/_git/widgets",
		"https://user@dev.azure.com/fabrikam/Tools/_git/widgets",
		`${createFromOrigin}?token=value`,
		`${createFromOrigin}#fragment`,
		"https://dev.azure.com/fabrikam/Tools/_git/a%2Fb",
		"https://dev.azure.com/fabrikam/Tools/_git/%77idgets",
		"https://fabrikam.visualstudio.com/Tools/_git/widgets",
	])
		expect(() => repositoryOrigin(value)).toThrow();
	expect(branchName("refs/heads/feature/real")).toBe("feature/real");
	for (const value of [
		"refs/heads/-option",
		"refs/heads/a..b",
		"refs/heads/a.lock",
		"refs/heads/a/.b",
		"refs/heads/a@{b",
		"refs/heads/a b",
		"refs/heads/a\\b",
		"refs/heads/a/",
	])
		expect(() => branchName(value)).toThrow();
});

test("Create from reads current branch and draft PR metadata only through mediated GET", async () => {
	const auth = createFromAuthentication();
	const api = createCreateFromApi(auth, createFromOrigin);
	const signal = AbortSignal.timeout(5000);
	const branches = await api.list("native-account", "branch", "", signal);
	expect(branches.options[0].id).toBe("refs/heads/feature/real");
	expect(
		await api.confirm("native-account", "branch", branches.options[0], signal),
	).toEqual({ branchName: "feature/real" });
	const prs = await api.list("native-account", "pull-request", "", signal);
	expect(prs.options[0].draft).toBe(true);
	expect(
		await api.confirm("native-account", "pull-request", prs.options[0], signal),
	).toEqual({
		pullRequest: { number: 73, accountId: "native-account" },
	});
	expect(
		auth.requests.every((input) => input.url.includes("api-version=7.1")),
	).toBe(true);
});

test("Create from supports GUID origins but preserves their canonical input metadata", async () => {
	const auth = createFromAuthentication();
	const origin = `https://dev.azure.com/fabrikam/Tools/_git/${createFromRepository.id}`;
	const api = createCreateFromApi(auth, origin);
	const branches = await api.list(
		"native-account",
		"branch",
		"",
		AbortSignal.timeout(5000),
	);
	expect(branches.repositoryName).toBe("widgets");
	const list = await api.list(
		"native-account",
		"pull-request",
		"",
		AbortSignal.timeout(5000),
	);
	expect(list.repositoryName).toBe("widgets");
	expect(
		(
			await api.confirm(
				"native-account",
				"pull-request",
				list.options[0],
				AbortSignal.timeout(5000),
			)
		).pullRequest,
	).toEqual({ number: 73, accountId: "native-account" });
});

test("PR-session resolver independently reloads authoritative metadata without merge-policy evidence", async () => {
	const auth = createFromAuthentication();
	const scopedAuth = {
		getAccessToken: auth.getAccessToken,
	};
	await expect(
		createCreateFromApi(scopedAuth, createFromOrigin).resolve(
			73,
			AbortSignal.timeout(5000),
		),
	).resolves.toEqual({
		repository: createFromOrigin,
		repositoryId: createFromRepository.id,
		number: 73,
		title: "Real provider change",
		url: `${createFromOrigin}/pullrequest/73`,
		baseRef: "main",
		headRef: "feature/real",
		headCommit: "a".repeat(40),
		draft: true,
	});
	expect(auth.requests.every((input) => input.init.method === "GET")).toBe(
		true,
	);
	expect(
		auth.requests.some((input) =>
			/threads|votes|statuses|iterations/.test(input.url),
		),
	).toBe(false);
});

test.each([
	{ repositoryUrl: false, prRepositoryUrl: true, prLink: true },
	{ repositoryUrl: true, prRepositoryUrl: false, prLink: true },
	{ repositoryUrl: true, prRepositoryUrl: true, prLink: false },
	{ repositoryUrl: false, prRepositoryUrl: false, prLink: false },
])(
	"Create from supports documented optional web metadata %j",
	async ({ repositoryUrl, prRepositoryUrl, prLink }) => {
		const repository = {
			...createFromRepository,
			webUrl: repositoryUrl ? createFromOrigin : undefined,
			remoteUrl: createFromOrigin,
			_links: { web: { href: createFromOrigin } },
		};
		const pr = createFromPr({
			repository: {
				id: repository.id,
				name: repository.name,
				project: repository.project,
				webUrl: prRepositoryUrl ? createFromOrigin : undefined,
			},
			_links: prLink
				? { web: { href: `${createFromOrigin}/pullrequest/73` } }
				: undefined,
		});
		const origin = `https://dev.azure.com/fabrikam/${repository.project.id}/_git/${repository.id}`;
		const api = createCreateFromApi(
			createFromAuthentication({
				async authenticatedFetch(input) {
					const url = new URL(input.url);
					if (url.pathname.endsWith("/pullrequests"))
						return Response.json({ value: [pr] });
					if (url.pathname.endsWith("/pullrequests/73"))
						return Response.json(pr);
					if (url.pathname.endsWith("/refs"))
						return Response.json({
							value: [{ name: pr.sourceRefName, objectId: "a".repeat(40) }],
						});
					return Response.json(repository);
				},
			}),
			origin,
		);
		const signal = AbortSignal.timeout(5000);
		const listed = await api.list("native-account", "pull-request", "", signal);
		expect(listed.options[0].sourcePullRequest.url).toBe(
			`${origin}/pullrequest/73`,
		);
		await expect(
			api.confirm("native-account", "pull-request", listed.options[0], signal),
		).resolves.toEqual({
			pullRequest: { number: 73, accountId: "native-account" },
		});
		await expect(api.resolve(73, signal)).resolves.toMatchObject({
			repository: origin,
			repositoryId: repository.id,
			number: 73,
			url: `${origin}/pullrequest/73`,
			headCommit: "a".repeat(40),
		});
	},
);

test("Create from shows pull request titles with control characters on one line", async () => {
	const pr = createFromPr({ title: "Fix\r\nthe\tthing\r" });
	const api = createCreateFromApi(
		createFromAuthentication({
			async authenticatedFetch(input) {
				const url = new URL(input.url);
				if (url.pathname.endsWith("/pullrequests"))
					return Response.json({ value: [pr] });
				if (url.pathname.endsWith("/pullrequests/73")) return Response.json(pr);
				if (url.pathname.endsWith("/refs"))
					return Response.json({
						value: [{ name: pr.sourceRefName, objectId: "a".repeat(40) }],
					});
				return Response.json(createFromRepository);
			},
		}),
		createFromOrigin,
	);
	const signal = AbortSignal.timeout(5000);
	const listed = await api.list("native-account", "pull-request", "", signal);
	expect(listed.options[0]).toMatchObject({
		name: "Fix the thing",
		sourcePullRequest: { title: "Fix the thing" },
	});
	await expect(
		api.confirm("native-account", "pull-request", listed.options[0], signal),
	).resolves.toEqual({
		pullRequest: { number: 73, accountId: "native-account" },
	});
	await expect(api.resolve(73, signal)).resolves.toMatchObject({
		title: "Fix the thing",
	});
});

test.each(["  Before after", "Before after  ", "\u00a0Before after"])(
	"Create from finds a pull request by its copied title %j",
	async (title) => {
		const pr = createFromPr({ title });
		const api = createCreateFromApi(
			createFromAuthentication({
				async authenticatedFetch(input) {
					return Response.json(
						new URL(input.url).pathname.endsWith("/pullrequests")
							? { value: [pr] }
							: createFromRepository,
					);
				},
			}),
			createFromOrigin,
		);
		const listed = await api.list(
			"native-account",
			"pull-request",
			title,
			AbortSignal.timeout(5000),
		);
		expect(listed.options.map((option) => option.id)).toEqual(["73"]);
	},
);

test.each(["repository", "project", "pr-repository"])(
	"Missing web metadata does not bypass the bound %s identity",
	async (mismatch) => {
		const foreignId = "00000000-0000-0000-0000-000000000000";
		const repository = {
			...createFromRepository,
			webUrl: undefined,
			id: mismatch === "repository" ? foreignId : createFromRepository.id,
			project: {
				...createFromRepository.project,
				id:
					mismatch === "project" ? foreignId : createFromRepository.project.id,
			},
		};
		const pr = createFromPr({
			repository: {
				id: mismatch === "pr-repository" ? foreignId : repository.id,
			},
			_links: undefined,
		});
		const origin = `https://dev.azure.com/fabrikam/${createFromRepository.project.id}/_git/${createFromRepository.id}`;
		const api = createCreateFromApi(
			createFromAuthentication({
				async authenticatedFetch(input) {
					return Response.json(
						new URL(input.url).pathname.endsWith("/pullrequests/73")
							? pr
							: repository,
					);
				},
			}),
			origin,
		);
		await expect(api.resolve(73, AbortSignal.timeout(5000))).rejects.toThrow(
			/different repository/,
		);
	},
);

test.each([
	"https://fabrikam.visualstudio.com/Tools/_git/widgets",
	"https://fabrikam.visualstudio.com/DefaultCollection/Tools/_git/widgets",
	"https://dev.azure.com/fabrikam/Tools/_git/widgets",
	"https://dev.azure.com/fabrikam/Developer Tools/_git/Widget Kit",
])(
	"Create from accepts API repository aliases %s while returning its bound GUID URL",
	async (webUrl) => {
		const names = webUrl.includes("Developer Tools")
			? { project: "Developer Tools", repository: "Widget Kit" }
			: { project: "Tools", repository: "widgets" };
		const repository = {
			...createFromRepository,
			name: names.repository,
			project: { ...createFromRepository.project, name: names.project },
			webUrl,
		};
		const pr = createFromPr({
			repository,
			_links: { web: { href: `${webUrl}/pullrequest/73` } },
		});
		const requests = [];
		const origin = `https://dev.azure.com/fabrikam/${repository.project.id}/_git/${repository.id}`;
		const auth = createFromAuthentication({
			async authenticatedFetch(input) {
				requests.push(input);
				const url = new URL(input.url);
				if (url.pathname.endsWith("/pullrequests"))
					return Response.json({ value: [pr] });
				if (url.pathname.endsWith("/pullrequests/73")) return Response.json(pr);
				if (url.pathname.endsWith("/refs"))
					return Response.json({
						value: [{ name: pr.sourceRefName, objectId: "a".repeat(40) }],
					});
				return Response.json(repository);
			},
		});
		const api = createCreateFromApi(auth, origin);
		const signal = AbortSignal.timeout(5000);
		const listed = await api.list("native-account", "pull-request", "", signal);
		expect(listed.options[0].sourcePullRequest.url).toBe(
			`${origin}/pullrequest/73`,
		);
		await expect(
			api.confirm("native-account", "pull-request", listed.options[0], signal),
		).resolves.toEqual({
			pullRequest: { number: 73, accountId: "native-account" },
		});
		await expect(api.resolve(73, signal)).resolves.toMatchObject({
			repository: origin,
			repositoryId: repository.id,
			url: `${origin}/pullrequest/73`,
			headCommit: "a".repeat(40),
		});
		expect(
			requests.every(
				(input) =>
					new URL(input.url).hostname === "dev.azure.com" &&
					input.init.method === "GET",
			),
		).toBe(true);
	},
);

test.each([
	"https://other.visualstudio.com/Tools/_git/widgets",
	"https://fabrikam.visualstudio.com/Tools/_git/another",
	"https://fabrikam.visualstudio.com/Other/_git/widgets",
	"https://fabrikam.visualstudio.com/Tools/_git/widgets/extra",
	"https://user@fabrikam.visualstudio.com/Tools/_git/widgets",
	"https://fabrikam.visualstudio.com/Tools/_git/widgets?token=example",
	"https://fabrikam.visualstudio.com/Tools/_git/widgets#fragment",
	"http://fabrikam.visualstudio.com/Tools/_git/widgets",
])(
	"Create from still rejects unbound or unsafe API repository URL %s",
	async (webUrl) => {
		const api = createCreateFromApi(
			createFromAuthentication({
				async authenticatedFetch() {
					return Response.json({ ...createFromRepository, webUrl });
				},
			}),
			createFromOrigin,
		);
		await expect(
			api.list("native-account", "pull-request", "", AbortSignal.timeout(5000)),
		).rejects.toThrow();
	},
);

test.each([
	"https://other.visualstudio.com/Tools/_git/widgets/pullrequest/73",
	"https://fabrikam.visualstudio.com/Tools/_git/another/pullrequest/73",
	`${createFromOrigin}/pullrequest/74`,
	`${createFromOrigin}/pullrequest/73?token=example`,
	`${createFromOrigin}/pullrequest/73#fragment`,
	"https://user@fabrikam.visualstudio.com/Tools/_git/widgets/pullrequest/73",
])("PR-session resolver rejects unbound or unsafe PR link %s", async (href) => {
	const api = createCreateFromApi(
		createFromAuthentication({
			async authenticatedFetch(input) {
				return Response.json(
					new URL(input.url).pathname.endsWith("/pullrequests/73")
						? createFromPr({ _links: { web: { href } } })
						: createFromRepository,
				);
			},
		}),
		createFromOrigin,
	);
	await expect(api.resolve(73, AbortSignal.timeout(5000))).rejects.toThrow();
});

test("Create from does not hand off PR repository metadata exceeding the native UTF-8 bound", async () => {
	const name = "é".repeat(90);
	const origin = `https://dev.azure.com/fabrikam/Tools/_git/${encodeURIComponent(name)}`;
	const repository = { ...createFromRepository, name, webUrl: origin };
	const api = createCreateFromApi(
		createFromAuthentication({
			async authenticatedFetch(input) {
				if (new URL(input.url).pathname.endsWith("/pullrequests"))
					return Response.json({
						value: [
							createFromPr({
								repository,
								_links: { web: { href: `${origin}/pullrequest/73` } },
							}),
						],
					});
				return Response.json(repository);
			},
		}),
		origin,
	);
	await expect(
		api.list("native-account", "pull-request", "", AbortSignal.timeout(5000)),
	).rejects.toThrow("too long");
});

test("Create from default branches use my branches with the repository default pinned first", async () => {
	const { api, calls } = createFromRefs({ mine: ["zeta", "main", "alpha"] });
	const list = await api.list(
		"native-account",
		"branch",
		"",
		AbortSignal.timeout(5000),
	);
	expect(list.options.map((item) => item.name)).toEqual([
		"main",
		"alpha",
		"zeta",
	]);
	expect(list.truncated).toBe(false);
	expect(calls).toHaveLength(1);
	expect(calls[0].get("includeMyBranches")).toBe("true");
	expect(calls[0].has("$top")).toBe(false);
	expect(calls[0].has("filter")).toBe(false);
	expect(calls[0].has("filterContains")).toBe(false);
});

const largeRepositoryBranches = Array.from({ length: 1500 }, (_, index) =>
	index === 1400 ? "deep/needle" : `branch-${String(index).padStart(4, "0")}`,
);

test("Create from truncates more than 1000 of my branches instead of failing", async () => {
	const { api } = createFromRefs({
		mine: [...largeRepositoryBranches, "main"],
	});
	const list = await api.list(
		"native-account",
		"branch",
		"",
		AbortSignal.timeout(5000),
	);
	expect(list.options).toHaveLength(200);
	expect(list.options.slice(0, 2).map((item) => item.name)).toEqual([
		"main",
		"branch-0000",
	]);
	expect(list.truncated).toBe(true);
});

test("Create from searches a repository with more than 1000 branches on the server", async () => {
	const { api, calls } = createFromRefs({
		all: largeRepositoryBranches,
		mine: ["main"],
	});
	const list = await api.list(
		"native-account",
		"branch",
		" NEEDLE ",
		AbortSignal.timeout(5000),
	);
	expect(list.options).toEqual([
		{ id: "refs/heads/deep/needle", name: "deep/needle" },
	]);
	expect(list.truncated).toBe(false);
	expect(calls).toHaveLength(1);
	expect(calls[0].get("filter")).toBe("heads/");
	expect(calls[0].get("filterContains")).toBe("NEEDLE");
	expect(calls[0].get("$top")).toBe("100");
	expect(calls[0].has("includeMyBranches")).toBe(false);
});

test("Create from bounds branch search paging, encodes continuation, and reports truncation", async () => {
	const { api, calls } = createFromRefs({ all: largeRepositoryBranches });
	const list = await api.list(
		"native-account",
		"branch",
		"branch",
		AbortSignal.timeout(5000),
	);
	expect(calls).toHaveLength(10);
	expect(calls[0].has("continuationToken")).toBe(false);
	expect(calls[1].get("continuationToken")).toBe("opaque&next=100");
	expect(list.options).toHaveLength(200);
	expect(list.options[0].name).toBe("branch-0000");
	expect(list.truncated).toBe(true);
});

test.each([
	[createFromOrigin, `${createFromOrigin}/pullrequest/73`],
	[
		createFromOrigin,
		`${createFromOrigin}/pullrequest/73?path=/src/app.mjs&_a=files`,
	],
	[
		`https://dev.azure.com/fabrikam/${createFromRepository.project.id}/_git/${createFromRepository.id}`,
		`${createFromOrigin}/pullrequest/73`,
	],
	[
		createFromOrigin,
		"https://dev.azure.com/fabrikam/_git/widgets/pullrequest/73",
	],
	[
		createFromOrigin,
		"https://fabrikam.visualstudio.com/Tools/_git/widgets/pullrequest/73",
	],
	[
		createFromOrigin,
		"https://fabrikam.visualstudio.com/DefaultCollection/Tools/_git/widgets/pullrequest/73?_a=files",
	],
	[
		createFromOrigin,
		"https://fabrikam.visualstudio.com/_git/widgets/pullrequest/73",
	],
	[
		createFromOrigin,
		"https://fabrikam.visualstudio.com/DefaultCollection/_git/widgets/pullrequest/73",
	],
])(
	"Create from extracts the PR number from a repository PR URL: %s",
	async (origin, query) => {
		const api = createCreateFromApi(createFromAuthentication(), origin);
		const result = await api.list(
			"native-account",
			"pull-request",
			query,
			AbortSignal.timeout(5000),
		);
		expect(result.options.map((item) => item.id)).toEqual(["73"]);
	},
);

test("Create from matches a pasted PR URL by exact ID", async () => {
	const api = createCreateFromApi(
		createFromAuthentication({
			async authenticatedFetch(input) {
				const pathname = new URL(input.url).pathname;
				if (pathname.endsWith("/pullrequests"))
					return Response.json({
						value: [
							createFromPr({
								pullRequestId: 173,
								title: "Newer 73 work",
								_links: {
									web: { href: `${createFromOrigin}/pullrequest/173` },
								},
							}),
							createFromPr(),
						],
					});
				if (pathname.endsWith("/pullrequests/73"))
					return Response.json(createFromPr());
				return Response.json(createFromRepository);
			},
		}),
		createFromOrigin,
	);
	const result = await api.list(
		"native-account",
		"pull-request",
		`${createFromOrigin}/pullrequest/73`,
		AbortSignal.timeout(5000),
	);
	expect(result.options.map((item) => item.id)).toEqual(["73"]);
});

test("Create from fetches a pasted PR URL outside the bounded active list", async () => {
	const calls = [];
	const api = createCreateFromApi(
		createFromAuthentication({
			async authenticatedFetch(input) {
				const url = new URL(input.url);
				calls.push(url.pathname);
				if (url.pathname.endsWith("/pullrequests")) {
					const skip = Number(url.searchParams.get("$skip"));
					return Response.json({
						value: Array.from({ length: 100 }, (_, index) => {
							const pullRequestId = 1001 + skip + index;
							return createFromPr({
								pullRequestId,
								_links: {
									web: {
										href: `${createFromOrigin}/pullrequest/${pullRequestId}`,
									},
								},
							});
						}),
					});
				}
				if (url.pathname.endsWith("/pullrequests/73"))
					return Response.json(createFromPr());
				return Response.json(createFromRepository);
			},
		}),
		createFromOrigin,
	);
	const result = await api.list(
		"native-account",
		"pull-request",
		`${createFromOrigin}/pullrequest/73`,
		AbortSignal.timeout(5000),
	);
	expect(result.options.map((item) => item.id)).toEqual(["73"]);
	expect(calls.filter((path) => path.endsWith("/pullrequests"))).toEqual([]);
	expect(
		calls.filter((path) => path.endsWith("/pullrequests/73")),
	).toHaveLength(1);
});

test.each([
	"https://dev.azure.com/fabrikam/Tools/_git/other/pullrequest/73",
	"https://fabrikam.visualstudio.com/DefaultCollection/_git/other/pullrequest/73",
])(
	"Create from does not treat a different repository PR URL as a number search: %s",
	async (query) => {
		const api = createCreateFromApi(
			createFromAuthentication(),
			createFromOrigin,
		);
		const result = await api.list(
			"native-account",
			"pull-request",
			query,
			AbortSignal.timeout(5000),
		);
		expect(result.options).toEqual([]);
	},
);

test.each([
	{ status: "completed" },
	{ sourceRefName: "refs/heads/changed" },
	{ targetRefName: "refs/heads/changed-target" },
	{ lastMergeSourceCommit: { commitId: "b".repeat(40) } },
	{ forkSource: { repository: { id: "foreign" } } },
	{ _links: { web: { href: "https://example.com/steal" } } },
	{
		repository: {
			...createFromRepository,
			id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
		},
	},
])(
	"Create from revalidation rejects changed or unsupported PR data %j",
	async (changed) => {
		const auth = createFromAuthentication();
		const api = createCreateFromApi(auth, createFromOrigin);
		const selection = (
			await api.list(
				"native-account",
				"pull-request",
				"",
				AbortSignal.timeout(5000),
			)
		).options[0];
		const original = auth.authenticatedFetch;
		auth.authenticatedFetch = async (input) =>
			new URL(input.url).pathname.endsWith("/pullrequests/73")
				? Response.json(createFromPr(changed))
				: original(input);
		await expect(
			api.confirm(
				"native-account",
				"pull-request",
				selection,
				AbortSignal.timeout(5000),
			),
		).rejects.toThrow();
	},
);

test("Create from excludes forks from active results and reports bounded truncation", async () => {
	const auth = createFromAuthentication({
		async authenticatedFetch(input) {
			if (new URL(input.url).pathname.endsWith("/pullrequests"))
				return Response.json({
					value: [
						createFromPr(),
						createFromPr({ pullRequestId: 74, forkSource: {} }),
					],
				});
			if (new URL(input.url).pathname.endsWith("/refs"))
				return Response.json({
					value: Array.from({ length: 250 }, (_, index) =>
						createFromRef(`branch-${index}`),
					),
				});
			return Response.json(createFromRepository);
		},
	});
	const api = createCreateFromApi(auth, createFromOrigin);
	expect(
		(
			await api.list(
				"native-account",
				"pull-request",
				"",
				AbortSignal.timeout(5000),
			)
		).options,
	).toHaveLength(1);
	const list = await api.list(
		"native-account",
		"branch",
		"",
		AbortSignal.timeout(5000),
	);
	expect(list.options).toHaveLength(200);
	expect(list.truncated).toBe(true);
});

test("Create from production canvas accepts long multibyte PR URLs", async () => {
	const canvas = createCreateFromCanvas(createFromAuthentication());
	const instanceId = randomUUID();
	try {
		const opened = await canvas.open({
			instanceId,
			input: { originUrl: createFromOrigin },
			completionOwner: "host",
		});
		const origin = new URL(opened.url).origin;
		const document = await (await fetch(opened.url)).text();
		expect(document).not.toContain("maxlength");
		const token = /name="picker-document" content="([^"]+)"/.exec(document)[1];
		const endpoint = `${origin}/instances/${instanceId}`;
		const headers = {
			"X-Picker-Document": token,
			"Content-Type": "application/json",
			Origin: origin,
		};
		const read = async () => (await fetch(endpoint, { headers })).json();
		await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
		await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify({
				type: "mode",
				value: "pull-request",
				sequence: 1,
			}),
		});
		await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
		const query = `${createFromOrigin}/pullrequest/73?path=/${"界".repeat(2800)}&_a=files`;
		expect(query.length).toBeGreaterThan(256);
		const body = JSON.stringify({ type: "query", value: query, sequence: 2 });
		expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(8192);
		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body,
		});
		expect(response.status).toBe(200);
		await vi.waitFor(async () => {
			const state = await read();
			expect(state.status).toBe("ready");
			expect(state.options.map((item) => item.id)).toEqual(["73"]);
		});
	} finally {
		await canvas.dispose();
	}
});

test("Create from production canvas keeps over-limit searches recoverable and blocks confirmation", async () => {
	const authentication = createFromAuthentication();
	const canvas = createCreateFromCanvas(authentication);
	const instanceId = randomUUID();
	try {
		const opened = await canvas.open({
			instanceId,
			input: { originUrl: createFromOrigin },
			completionOwner: "host",
		});
		const origin = new URL(opened.url).origin;
		const document = await (await fetch(opened.url)).text();
		const token = /name="picker-document" content="([^"]+)"/.exec(document)[1];
		const endpoint = `${origin}/instances/${instanceId}`;
		const headers = {
			"X-Picker-Document": token,
			"Content-Type": "application/json",
			Origin: origin,
		};
		const read = async () => (await fetch(endpoint, { headers })).json();
		let sequence = 0;
		const change = (type, value) =>
			fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({ type, value, sequence: ++sequence }),
			});
		await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
		await change("select", "refs/heads/feature/real");
		const requestsBeforeSearch = authentication.requests.length;
		const response = await change("query", "x".repeat(4097));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "error",
			error:
				"Search text must be 4096 characters or fewer. Shorten your search.",
			selectedId: null,
			options: [],
		});
		expect(authentication.requests).toHaveLength(requestsBeforeSearch);
		expect(
			await canvas.actions
				.find((item) => item.name === "confirm-selection")
				.handler({ instanceId }),
		).toEqual({
			status: "rejected",
			message:
				"Search text must be 4096 characters or fewer. Shorten your search.",
		});
		expect((await change("query", "x".repeat(4096))).status).toBe(200);
		await vi.waitFor(async () => {
			expect(await read()).toMatchObject({
				status: "ready",
				error: null,
				query: "x".repeat(4096),
			});
		});
		expect((await change("query", "")).status).toBe(200);
		await vi.waitFor(async () => {
			expect(await read()).toMatchObject({
				status: "ready",
				error: null,
				selectedId: null,
				options: [expect.objectContaining({ name: "feature/real" })],
			});
		});
		for (const value of [null, 123, "invalid\tquery", "invalid\u0000query"]) {
			expect((await change("query", value)).status).toBe(400);
			expect(await read()).toMatchObject({ status: "ready", query: "" });
		}
		for (const value of [null, "unknown", "arbitrary error message"]) {
			expect((await change("query-error", value)).status).toBe(400);
		}
		const requestsBeforeValidation = authentication.requests.length;
		const invalid = await change("query-error", "control-characters");
		expect(invalid.status).toBe(200);
		expect(await invalid.json()).toMatchObject({
			status: "error",
			queryError:
				"Search text cannot contain control characters. Remove them and try again.",
			selectedId: null,
			options: [],
		});
		expect((await change("retry")).status).toBe(200);
		expect(authentication.requests).toHaveLength(requestsBeforeValidation);
		expect((await read()).status).toBe("error");
		expect((await change("mode", "pull-request")).status).toBe(200);
		await vi.waitFor(async () =>
			expect(await read()).toMatchObject({
				status: "ready",
				query: "",
				queryError: null,
				error: null,
			}),
		);
	} finally {
		await canvas.dispose();
	}
});

test.each(["branch", "pull-request"])(
	"Create from over-limit %s searches cancel pending confirmations and ignore stale reads",
	async (mode) => {
		const options = [{ id: "current", name: "Current result" }];
		const stale = Promise.withResolvers();
		const confirmation = Promise.withResolvers();
		const list = vi.fn(async (_accountId, _mode, query) =>
			query === "stalled" ? stale.promise : { options, truncated: false },
		);
		const state = createCreateFromState({
			accounts: async () => [{ id: "a", name: "Ada" }],
			list,
			confirm: () => confirmation.promise,
		});
		try {
			const token = state.document();
			await vi.waitFor(() => expect(state.read().status).toBe("ready"));
			state.change({ type: "mode", value: mode, sequence: 1 }, token);
			await vi.waitFor(() => expect(state.read().status).toBe("ready"));
			state.change({ type: "select", value: "current", sequence: 2 }, token);
			const pending = state.confirm();
			const acknowledgement = state.acknowledge(
				{
					sequence: 2,
					selectedId: "current",
					requestToken: state.read().confirmation.requestToken,
				},
				token,
			);
			state.change(
				{ type: "query", value: "x".repeat(4097), sequence: 3 },
				token,
			);
			expect(await pending).toMatchObject({ status: "rejected" });
			expect(await acknowledgement).toMatchObject({ status: "rejected" });
			confirmation.resolve({ branchName: "obsolete" });
			expect(state.read()).toMatchObject({
				status: "error",
				selectedId: null,
				options: [],
			});
			expect((await state.observe(null)).ready).toBe(false);

			state.change({ type: "query", value: "stalled", sequence: 4 }, token);
			const requestCount = list.mock.calls.length;
			state.change(
				{ type: "query", value: "x".repeat(4097), sequence: 5 },
				token,
			);
			stale.resolve({ options, truncated: false });
			await new Promise((resolve) => setImmediate(resolve));
			expect(list).toHaveBeenCalledTimes(requestCount);
			expect(state.read()).toMatchObject({
				status: "error",
				selectedId: null,
				options: [],
			});
			state.change(
				{
					type: "mode",
					value: mode === "branch" ? "pull-request" : "branch",
					sequence: 6,
				},
				token,
			);
			await vi.waitFor(() =>
				expect(state.read()).toMatchObject({
					status: "ready",
					query: "",
					error: null,
					options,
				}),
			);
		} finally {
			state.close();
		}
	},
);

test("Create from production canvas synchronizes guest selection and host completion, isolates instances, and rejects stale documents", async () => {
	const canvas = createCreateFromCanvas(createFromAuthentication());
	const instanceId = randomUUID();
	const otherId = randomUUID();
	try {
		const opened = await canvas.open({
			instanceId,
			input: {
				originUrl: `https://dev.azure.com/fabrikam/Tools/_git/${createFromRepository.id}`,
			},
			completionOwner: "host",
		});
		const origin = new URL(opened.url).origin;
		const document = await (await fetch(opened.url)).text();
		const token = /name="picker-document" content="([^"]+)"/.exec(document)[1];
		const endpoint = `${origin}/instances/${instanceId}`;
		const headers = {
			"X-Picker-Document": token,
			"Content-Type": "application/json",
			Origin: origin,
		};
		const read = async () => (await fetch(endpoint, { headers })).json();
		await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
		expect((await read()).repositoryName).toBe("widgets");
		expect(document).not.toContain(createFromRepository.id);
		const selected = await (
			await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({
					type: "select",
					value: "refs/heads/feature/real",
					sequence: 1,
				}),
			})
		).json();
		const hint = canvas.actions.find((item) => item.name === "dialog-state");
		expect(
			await hint.handler({ instanceId, input: { afterRevision: null } }),
		).toEqual({
			revision: expect.any(Number),
			ready: true,
			disabledReason: null,
		});
		const other = await canvas.open({
			instanceId: otherId,
			input: { originUrl: createFromOrigin },
			completionOwner: "host",
		});
		const otherDocument = await (await fetch(other.url)).text();
		expect(otherDocument).toContain(
			'<meta name="repository-name" content="widgets">',
		);
		expect(
			await hint.handler({
				instanceId: otherId,
				input: { afterRevision: null },
			}),
		).toEqual({
			revision: expect.any(Number),
			ready: false,
			disabledReason: expect.any(String),
		});
		const pending = canvas.actions
			.find((item) => item.name === "confirm-selection")
			.handler({ instanceId });
		const challenge = (await read()).confirmation;
		const confirmed = await (
			await fetch(`${endpoint}/confirmation`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					sequence: selected.sequence,
					selectedId: selected.selectedId,
					requestToken: challenge.requestToken,
				}),
			})
		).json();
		expect(confirmed).toEqual({
			status: "completed",
			value: { branchName: "feature/real" },
		});
		expect(await pending).toEqual(confirmed);
		await fetch(opened.url);
		expect((await fetch(endpoint, { headers })).status).toBe(409);
		expect(
			await hint.handler({ instanceId, input: { afterRevision: null } }),
		).toEqual({
			revision: expect.any(Number),
			ready: false,
			disabledReason: expect.any(String),
		});
		expect(
			(
				await fetch(endpoint, {
					method: "POST",
					headers: { ...headers, Origin: "https://foreign.example" },
					body: "{}",
				})
			).status,
		).toBe(403);
		expect((await fetch(`${origin}/create-from-api.mjs`)).status).toBe(404);
	} finally {
		await canvas.dispose();
	}
});

test("Create from selection changes cancel authoritative confirmation and stale loads cannot leak", async () => {
	let release;
	const api = {
		accounts: async () => [{ id: "a", name: "Ada" }],
		list: async () => ({
			options: [{ id: "refs/heads/real", name: "real" }],
			truncated: false,
		}),
		confirm: () =>
			new Promise((resolve) => {
				release = resolve;
			}),
	};
	const state = createCreateFromState(api);
	const token = state.document();
	await vi.waitFor(() => expect(state.read().status).toBe("ready"));
	state.change(
		{ type: "select", value: "refs/heads/real", sequence: 1 },
		token,
	);
	const pending = state.confirm();
	const acknowledgement = state.acknowledge(
		{
			sequence: 1,
			selectedId: "refs/heads/real",
			requestToken: state.read().confirmation.requestToken,
		},
		token,
	);
	state.change({ type: "query", value: "other", sequence: 2 }, token);
	release({ branchName: "real" });
	expect((await pending).status).toBe("rejected");
	expect((await acknowledgement).status).toBe("rejected");
	expect(state.read().selectedId).toBeNull();
	state.close();
});

test("Create from host observation and unresponsive confirmation are bounded", async () => {
	const state = createCreateFromState({
		accounts: async () => [{ id: "a", name: "Ada" }],
		list: async () => ({
			options: [{ id: "refs/heads/real", name: "real" }],
			truncated: false,
		}),
	});
	const token = state.document();
	await vi.waitFor(() => expect(state.read().status).toBe("ready"));
	vi.useFakeTimers();
	try {
		const observed = state.observe(state.read().revision);
		await vi.advanceTimersByTimeAsync(1000);
		expect((await observed).ready).toBe(false);
		state.change(
			{ type: "select", value: "refs/heads/real", sequence: 1 },
			token,
		);
		const pending = state.confirm();
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await pending).toMatchObject({ status: "rejected" });
		expect(state.read().selectedId).toBeNull();
		expect((await state.observe(null)).ready).toBe(false);
	} finally {
		state.close();
		vi.useRealTimers();
	}
});

test("Create from account switching ignores an obsolete reply and requires explicit multiple-account selection", async () => {
	let releaseOld;
	const state = createCreateFromState({
		accounts: async () => [
			{ id: "first", name: "Ada" },
			{ id: "second", name: "Grace" },
		],
		list: async (accountId) =>
			accountId === "first"
				? new Promise((resolve) => {
						releaseOld = resolve;
					})
				: {
						options: [{ id: "refs/heads/second", name: "second" }],
						truncated: false,
					},
	});
	try {
		const token = state.document();
		await vi.waitFor(() => expect(state.read().status).toBe("ready"));
		expect(state.read().accountId).toBeNull();
		expect((await state.observe(null)).ready).toBe(false);
		state.change({ type: "account", value: "first", sequence: 1 }, token);
		state.change({ type: "account", value: "second", sequence: 2 }, token);
		await vi.waitFor(() =>
			expect(state.read().options[0]?.name).toBe("second"),
		);
		releaseOld({
			options: [{ id: "refs/heads/obsolete", name: "obsolete" }],
			truncated: false,
		});
		await new Promise((resolve) => setImmediate(resolve));
		expect(state.read()).toMatchObject({
			accountId: "second",
			selectedId: null,
			status: "ready",
			options: [{ name: "second" }],
		});
	} finally {
		state.close();
	}
});

test("Create from cancellation releases a stalled mediated API read without affecting a healthy instance", async () => {
	const auth = createFromAuthentication({
		authenticatedFetch: () => new Promise(() => {}),
	});
	const controller = new AbortController();
	const stalled = createCreateFromApi(auth, createFromOrigin).list(
		"native-account",
		"branch",
		"",
		controller.signal,
	);
	controller.abort(new Error("Cancelled test read"));
	await expect(stalled).rejects.toThrow("Cancelled test read");
	const healthy = createCreateFromApi(
		createFromAuthentication(),
		createFromOrigin,
	);
	expect(
		(
			await healthy.list(
				"native-account",
				"branch",
				"",
				AbortSignal.timeout(5000),
			)
		).options[0].name,
	).toBe("feature/real");
});

test("Create from invalid or oversized API responses fail safely and do not become choices", async () => {
	for (const [response, message] of [
		[Response.json({ value: [{ name: 42 }] }), "invalid branch"],
		[Response.json({ value: [createFromRef("bad..ref")] }), "invalid branch"],
		[
			Response.json({ value: [createFromRef("real", "not-a-commit")] }),
			"invalid branch commit",
		],
		[
			Response.json({ value: [createFromRef("real"), createFromRef("real")] }),
			"duplicate entries",
		],
		[
			Response.json(
				{ value: [createFromRef("real")] },
				{ headers: { "x-ms-continuationtoken": "x".repeat(1025) } },
			),
			"invalid pagination",
		],
		[new Response("{ invalid JSON"), "invalid or oversized"],
		[
			new Response("x".repeat(2 * 1024 * 1024 + 1)),
			"Too many results to list. Search to narrow them.",
		],
	]) {
		const api = createCreateFromApi(
			createFromAuthentication({
				authenticatedFetch: async (input) =>
					new URL(input.url).pathname.endsWith("/refs")
						? response
						: Response.json(createFromRepository),
			}),
			createFromOrigin,
		);
		await expect(
			api.list("native-account", "branch", "", AbortSignal.timeout(5000)),
		).rejects.toThrow(message);
	}
});

test("Create from locks project-bound accounts, rechecks their existence on confirmation, and never falls back", async () => {
	let available = [
		{ id: "first", name: "Ada" },
		{ id: "second", name: "Grace" },
	];
	const listed = [];
	let confirmations = 0;
	const state = createCreateFromState(
		{
			accounts: async () => available,
			list: async (accountId) => {
				listed.push(accountId);
				return {
					options: [{ id: "refs/heads/real", name: "real" }],
					truncated: false,
				};
			},
			confirm: async () => {
				confirmations++;
				return { branchName: "real" };
			},
		},
		"second",
	);
	try {
		const token = state.document();
		await vi.waitFor(() => expect(state.read().status).toBe("ready"));
		expect(state.read()).toMatchObject({
			accountId: "second",
			accounts: [{ id: "second", name: "Grace" }],
		});
		expect(listed).toEqual(["second"]);
		expect(() =>
			state.change({ type: "account", value: "first", sequence: 1 }, token),
		).toThrow("current Microsoft account");
		state.change(
			{ type: "select", value: "refs/heads/real", sequence: 1 },
			token,
		);
		available = [{ id: "first", name: "Ada" }];
		const pending = state.confirm();
		const result = await state.acknowledge(
			{
				requestToken: state.read().confirmation.requestToken,
				selectedId: "refs/heads/real",
				sequence: 1,
			},
			token,
		);
		expect(result).toMatchObject({
			status: "rejected",
			message: expect.stringContaining("no longer available"),
		});
		expect(await pending).toEqual(result);
		expect(confirmations).toBe(0);
		expect((await state.observe(null)).ready).toBe(false);
		state.change({ type: "retry", sequence: 2 }, token);
		await vi.waitFor(() => expect(state.read().status).toBe("error"));
		expect(state.read()).toMatchObject({
			accountId: null,
			accounts: [],
			selectedId: null,
		});
		expect(listed).toEqual(["second"]);
	} finally {
		state.close();
	}
});

const TOKEN_ORIGINS = [
	"https://dev.azure.com",
	"https://vssps.dev.azure.com",
	"https://app.vssps.visualstudio.com",
];

/**
 * Production package code reads the global fetch. Route Azure DevOps requests
 * to a fixture that sees only package-visible fields, after checking the
 * bearer token stays on Azure DevOps origins; local picker traffic passes through.
 */
function stubServiceFetch(handler) {
	const requestFetch = globalThis.fetch;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input, init) => {
			if (!TOKEN_ORIGINS.includes(new URL(String(input)).origin))
				return requestFetch(input, init);
			const { headers, ...visibleInit } = init;
			const { Authorization, ...visibleHeaders } = headers;
			expect(Authorization).toBe(`Bearer ${"fixture-token"}`);
			expect(visibleInit.redirect).toBe("error");
			return handler({
				url: String(input),
				init: { ...visibleInit, headers: visibleHeaders },
			});
		}),
	);
	return handler;
}

function operationAuthentication() {
	return {
		getAccessToken: vi.fn(async (input) => {
			// PR UI is operation-scoped; native binds the saved repository account.
			expect(input).toEqual({ resource: "azure-devops" });
			return { accessToken: "fixture-token" };
		}),
	};
}

function projectionAuthentication(
	handler = async () => {
		throw new Error("Unexpected authenticated request");
	},
) {
	const requestFetch = globalThis.fetch;
	const authenticatedFetch = vi.fn(handler);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input, init = {}) => {
			if (!TOKEN_ORIGINS.includes(new URL(String(input)).origin))
				return requestFetch(input, init);
			const headers = new Headers(init.headers);
			const authorization = headers.get("Authorization");
			const prefix = "Bearer projection:";
			if (!authorization?.startsWith(prefix))
				throw new Error("Missing projection authentication");
			headers.delete("Authorization");
			return authenticatedFetch({
				accountId: authorization.slice(prefix.length),
				resource: "azure-devops",
				url: String(input),
				init: { ...init, headers: Object.fromEntries(headers.entries()) },
			});
		}),
	);
	return {
		authenticatedFetch,
		async listAccounts() {
			return [];
		},
		async getAccessToken({ accountId }) {
			return { accessToken: `projection:${accountId ?? ""}` };
		},
	};
}

function prUiFetch() {
	return vi.fn(async ({ init }) => {
		if (init.method === "GET") {
			return Response.json({
				id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
				name: "widgets",
			});
		}
		const body = JSON.parse(init.body);
		return Response.json({
			pullRequestId: 17,
			repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719" },
			title: body.title,
			sourceRefName: body.sourceRefName,
			targetRefName: body.targetRefName,
			isDraft: body.isDraft,
			status: "active",
			mergeStatus: "notSet",
		});
	});
}

test("projects an Azure DevOps picker result into a credential-free clone descriptor", () => {
	expect(createCloneDescriptor(repositorySelection)).toEqual({
		accountId: "microsoft-account",
		authority: "https://dev.azure.com/Fabrikam",
		repositoryId: "33333333-3333-3333-3333-333333333333",
		cloneUrl:
			"https://dev.azure.com/Fabrikam/22222222-2222-2222-2222-222222222222/_git/33333333-3333-3333-3333-333333333333",
		displayName: "Copilot App",
	});
});

test("unbound PR reads expose declared buttons without authentication", async () => {
	const fetch = stubServiceFetch(prUiFetch());
	const authentication = operationAuthentication();
	const ui = createPullRequestUi(authentication);
	const state = await ui.read(prUiContext, { authenticated: false });
	expect(state.status).toBe("ready");
	expect(
		state.contributions.map(({ label, action }) => ({ label, action })),
	).toEqual([
		{
			label: "Create PR",
			action: { actionId: "create", input: { draft: false } },
		},
		{
			label: "Create draft PR",
			action: { actionId: "create", input: { draft: true } },
		},
	]);
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});

test.each([false, true])(
	"declared PR action returns a normalized badge for draft=%s",
	async (draft) => {
		const fetch = stubServiceFetch(prUiFetch());
		const authentication = operationAuthentication();
		const ui = createPullRequestUi(authentication);
		const state = await ui.actions[0].handler({ draft }, prUiContext);
		const writes = fetch.mock.calls.filter(
			([request]) => request.init.method === "POST",
		);
		expect(writes).toHaveLength(1);
		expect(JSON.parse(writes[0][0].init.body)).toMatchObject({
			description: prUiContext.description,
			isDraft: draft,
		});
		expect(state).toEqual({
			status: "ready",
			error: null,
			review: {
				actionId: "submit-review",
				defaultOptionId: "comment",
				options: [
					{
						id: "comment",
						label: "Comment",
						description: "Publish comments without changing your vote",
					},
					{
						id: "approve",
						label: "Approve",
						description: "Approve this pull request",
					},
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
					{
						id: "reject",
						label: "Reject",
						description: "Reject this pull request",
					},
				].filter((option) => !draft || option.id === "comment"),
			},
			contributions: [
				{
					kind: "badge",
					slot: "pr.status",
					id: "pull-request",
					number: 17,
					state: draft ? "draft" : "open",
					url: "https://dev.azure.com/fabrikam/Tools/_git/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequest/17",
				},
				{
					kind: "button",
					slot: draft ? "pr.publish" : "pr.mark-draft",
					id: draft ? "publish" : "mark-draft",
					label: draft ? "Publish" : "Mark as draft",
					action: { actionId: "set-draft", input: { draft: !draft } },
				},
			],
		});
		expect(authentication.getAccessToken).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(state)).not.toContain("fixture-token");
	},
);

test("rejects choices that do not preserve Azure DevOps catalog ancestry", () => {
	expect(() =>
		createCloneDescriptor({
			...repositorySelection,
			repository: {
				...repositorySelection.repository,
				id: "11111111-1111-1111-1111-111111111111/99999999-9999-9999-9999-999999999999/33333333-3333-3333-3333-333333333333",
			},
		}),
	).toThrow("invalid repository selection");
});

const authentication = {
	async listAccounts() {
		return [];
	},
	async getAccessToken() {
		throw new Error("No account selected");
	},
};
const signedInAuthentication = {
	async listAccounts() {
		return [{ id: "native-account", name: "Example account" }];
	},
	async getAccessToken() {
		throw new Error("Credential unavailable");
	},
};

vi.mock("@github/copilot-app", async (importOriginal) => ({
	...(await importOriginal()),
	getHost: vi.fn(),
}));

beforeEach(() => {
	vi.mocked(getHost).mockReset();
});

test("manifest opts the provider into pull request projection observation", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
	);
	expect(
		manifest.activations[0].contributes.forgeProviders[0]
			.pullRequestProjectionObserver,
	).toBe(true);
});

test("publishes account-bound saved PR projections independently for supported workspaces", async () => {
	const accountIds = [];
	const authentication = projectionAuthentication(
		async ({ accountId, url }) => {
			accountIds.push(accountId);
			if (accountId === "denied-account") throw new Error("Forbidden");
			const endpoint = new URL(url);
			if (/\/repositories\/widgets$/.test(endpoint.pathname)) {
				return Response.json({
					id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
					name: "widgets",
				});
			}
			if (/\/pullrequests\/17$/.test(endpoint.pathname)) {
				return Response.json({
					pullRequestId: 17,
					repository: {
						id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
					},
					title: "A change",
					sourceRefName: prUiContext.sourceRef,
					targetRefName: prUiContext.targetRef,
					isDraft: false,
					status: "active",
					mergeStatus: "succeeded",
				});
			}
			if (endpoint.pathname.endsWith("/statuses")) {
				return Response.json({ value: [] });
			}
			if (endpoint.pathname.endsWith("/pullrequests")) {
				return Response.json({ value: [] });
			}
			throw new Error(`Unexpected request: ${url}`);
		},
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);

	await observer.observe(
		{
			revision: 3,
			entries: [
				{
					workspaceId: "linked",
					associatedUri:
						"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
					accounts: [
						{
							resource: "azure-devops",
							accountId: "denied-account",
							displayName: "Denied",
						},
						{
							resource: "azure-devops",
							accountId: "working-account",
							displayName: "Working",
						},
					],
				},
				{
					workspaceId: "unsupported",
					accounts: [],
				},
			],
		},
		publish,
	);

	expect(publish).toHaveBeenCalledOnce();
	const updates = publish.mock.calls.flatMap(([batch]) => batch);
	expect(updates.map(({ workspaceId }) => workspaceId)).toEqual(["linked"]);
	const linked = updates.find(
		({ workspaceId, lane }) =>
			workspaceId === "linked" && lane.kind === "associated",
	);
	expect(linked.projection).toMatchObject({
		accountId: "working-account",
		state: {
			status: "ready",
			contributions: expect.arrayContaining([
				expect.objectContaining({
					kind: "badge",
					number: 17,
					state: "open",
					url: "https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
				}),
			]),
		},
	});
	expect(
		linked.projection.state.contributions.every(
			(entry) => entry.kind === "badge" || entry.slot !== "pr.create",
		),
	).toBe(true);
	expect(accountIds).toContain("denied-account");
	expect(accountIds).toContain("working-account");
	expect(accountIds).not.toContain(undefined);
});

test("publishes nothing when no account can refresh an association", async () => {
	const associatedUri =
		"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17";
	const authentication = projectionAuthentication(async () => {
		throw new Error("Forbidden");
	});
	const publish = vi.fn(() => true);

	await createPullRequestProjectionObserver(authentication).observe(
		{
			revision: 4,
			entries: [
				{
					workspaceId: "linked",
					associatedUri,
					accounts: [
						{
							resource: "azure-devops",
							accountId: "denied-account",
							displayName: "Denied",
						},
					],
				},
			],
		},
		publish,
	);

	expect(publish).not.toHaveBeenCalled();
});

test("projects only the saved association without an Azure DevOps account", async () => {
	const authentication = projectionAuthentication(vi.fn());
	const publish = vi.fn(() => true);
	const associatedUri =
		"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17";

	await createPullRequestProjectionObserver(authentication).observe(
		{
			revision: 4,
			entries: [
				{
					workspaceId: "linked",
					associatedUri,
					accounts: [],
				},
			],
		},
		publish,
	);

	expect(authentication.authenticatedFetch).not.toHaveBeenCalled();
	expect(publish).toHaveBeenCalledWith([
		{
			workspaceId: "linked",
			lane: { kind: "associated", associatedUri },
			projection: {
				state: {
					status: "unavailable",
					error:
						"Sign in with the repository account to refresh this pull request.",
					contributions: [],
				},
			},
		},
	]);
});

test("refreshes opaque accounts for every full inventory revision", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const published = [];

	for (const revision of [1, 2]) {
		const accountId = revision === 1 ? "first-account" : "second-account";
		await observer.observe(
			{
				revision,
				entries: [
					{
						workspaceId: "workspace",
						associatedUri:
							"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
						accounts: [
							{
								resource: "azure-devops",
								accountId,
								displayName: accountId,
							},
						],
					},
				],
			},
			(updates) => {
				published.push(updates);
				return true;
			},
		);
	}

	expect(published.map((batch) => batch[0].projection.accountId)).toEqual([
		"first-account",
		"second-account",
	]);
});

test("ignores entries without a saved association without listing accounts", async () => {
	const authentication = {
		listAccounts: vi.fn(),
		authenticatedFetch: vi.fn(),
	};
	const publish = vi.fn();

	await createPullRequestProjectionObserver(authentication).observe(
		{
			revision: 4,
			entries: [
				{
					workspaceId: "unsupported",
					accounts: [],
				},
			],
		},
		publish,
	);

	expect(authentication.listAccounts).not.toHaveBeenCalled();
	expect(publish).not.toHaveBeenCalled();
});

test("refreshes an associated pull request without current repository context", async () => {
	const associatedUri =
		"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17";
	const authentication = projectionAuthentication(async ({ url }) => {
		const endpoint = new URL(url);
		if (/\/repositories\/widgets$/.test(endpoint.pathname)) {
			return Response.json({
				id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
				name: "widgets",
			});
		}
		if (/\/pullrequests\/17$/.test(endpoint.pathname)) {
			return Response.json({
				pullRequestId: 17,
				repository: {
					id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
				},
				title: "A change",
				sourceRefName: prUiContext.sourceRef,
				targetRefName: prUiContext.targetRef,
				isDraft: false,
				status: "active",
				mergeStatus: "succeeded",
			});
		}
		if (endpoint.pathname.endsWith("/statuses")) {
			return Response.json({ value: [] });
		}
		throw new Error(`Unexpected request: ${url}`);
	});
	const publish = vi.fn(() => true);

	await createPullRequestProjectionObserver(authentication).observe(
		{
			revision: 5,
			entries: [
				{
					workspaceId: "linked",
					associatedUri,
					accounts: [
						{
							resource: "azure-devops",
							accountId: "account",
							displayName: "Account",
						},
					],
				},
			],
		},
		publish,
	);

	expect(publish).toHaveBeenCalledOnce();
	expect(publish.mock.calls[0][0]).toMatchObject([
		{
			workspaceId: "linked",
			lane: { kind: "associated", associatedUri },
			projection: {
				accountId: "account",
				state: {
					contributions: expect.arrayContaining([
						expect.objectContaining({
							kind: "badge",
							number: 17,
							state: "open",
						}),
					]),
				},
			},
		},
	]);
});

test("does not retry a stale projection batch rejected by the host", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const publish = vi.fn(() => false);

	await createPullRequestProjectionObserver(authentication).observe(
		{
			revision: 1,
			entries: [
				{
					workspaceId: "workspace",
					associatedUri:
						"https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
					accounts: [
						{
							resource: "azure-devops",
							accountId: "account",
							displayName: "Account",
						},
					],
				},
			],
		},
		publish,
	);

	expect(publish).toHaveBeenCalledOnce();
});

function projectionLoopEntry(index = 17) {
	return {
		workspaceId: `loop-${index}`,
		associatedUri: `https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/${index}`,
		accounts: [
			{
				resource: "azure-devops",
				accountId: "account",
				displayName: "Account",
			},
		],
	};
}

function projectionLoopResponse(url) {
	const path = new URL(url).pathname;
	if (path.endsWith("/repositories/widgets"))
		return Response.json({
			id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
			name: "widgets",
		});
	const number = path.match(/\/pullrequests\/(\d+)$/)?.[1];
	if (number)
		return Response.json({
			pullRequestId: Number(number),
			repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719" },
			title: "Loop",
			sourceRefName: prUiContext.sourceRef,
			targetRefName: prUiContext.targetRef,
			isDraft: false,
			status: "active",
			mergeStatus: "succeeded",
		});
	if (path.endsWith("/statuses") || path.endsWith("/pullrequests"))
		return Response.json({ value: [] });
	throw new Error(`Unexpected loop request: ${url}`);
}

test.each([false, true])(
	"retained associated results replay through the current lease after old publication returns %s",
	async (accepted) => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const authentication = projectionAuthentication(({ url }) =>
			projectionLoopResponse(url),
		);
		const observer = createPullRequestProjectionObserver(authentication);
		const oldPublish = vi.fn(() => accepted);
		const currentPublish = vi.fn(() => true);
		const entries = [projectionLoopEntry(17), projectionLoopEntry(18)];
		try {
			await observer.observe({ revision: 1, entries }, oldPublish);
			expect(oldPublish).toHaveBeenCalledTimes(2);
			const reads = authentication.authenticatedFetch.mock.calls.length;
			await vi.advanceTimersByTimeAsync(30_000);
			await observer.observe(
				{
					revision: 2,
					entries,
				},
				currentPublish,
			);
			expect(
				currentPublish.mock.calls
					.flatMap(([batch]) => batch)
					.map((update) => update.workspaceId)
					.sort(),
			).toEqual(["loop-17", "loop-18"]);
			expect(authentication.authenticatedFetch).toHaveBeenCalledTimes(reads);
			await vi.advanceTimersByTimeAsync(29_999);
			expect(currentPublish).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(currentPublish).toHaveBeenCalledTimes(4);
		} finally {
			observer.dispose();
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	},
);

test("inventory replacement never replays a cached pre-mutation associated result", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const revisions = new Map();
	const observer = createPullRequestProjectionObserver(
		authentication,
		revisions,
	);
	const entries = [projectionLoopEntry()];
	const oldPublish = vi.fn(() => true);
	const currentPublish = vi.fn(() => true);
	try {
		await observer.observe({ revision: 1, entries }, oldPublish);
		const reads = authentication.authenticatedFetch.mock.calls.length;
		revisions.set(entries[0].associatedUri, 1);
		await observer.observe({ revision: 2, entries }, currentPublish);
		expect(currentPublish).not.toHaveBeenCalled();
		expect(authentication.authenticatedFetch).toHaveBeenCalledTimes(reads);
	} finally {
		observer.dispose();
	}
});

test.each([
	["auth_required", "auth_required"],
	["timeout", "timeout"],
	["http401", "authentication"],
	["http400", "http"],
	["repository-http401", "authentication"],
	["invalid-json", "invalid-response"],
	["repository-invalid-json", "invalid-response"],
	["repository-invalid-content", "invalid-response"],
	["oversized-content", "response_too_large"],
	["repository-oversized-content", "response_too_large"],
	["too-large", "response_too_large"],
	["https://private.example/account", "unknown"],
])(
	"projection diagnostics classify %s without leaking account or provider data",
	async (code, category) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const failure = code.replace(/^repository-/, "");
		const httpStatus = /^http(\d{3})$/.exec(failure)?.[1];
		const responseFailure =
			httpStatus ||
			failure === "invalid-json" ||
			failure === "invalid-content" ||
			failure === "oversized-content";
		const endpoint = code.startsWith("repository-")
			? "/repositories/widgets"
			: "/pullrequests/17";
		const authentication = projectionAuthentication(({ url, accountId }) => {
			if (
				accountId === "private-account" &&
				responseFailure &&
				new URL(url).pathname.endsWith(endpoint)
			) {
				if (failure === "oversized-content")
					return new Response("private provider response", {
						headers: { "Content-Length": String(MAX_RESPONSE_BYTES + 1) },
					});
				if (httpStatus)
					return Response.json(
						{ message: "private provider response" },
						{ status: Number(httpStatus) },
					);
				return failure === "invalid-json"
					? new Response("{private", {
							headers: { "Content-Type": "application/json" },
						})
					: Response.json({ private: "provider response" });
			}
			return projectionLoopResponse(url);
		});
		const getAccessToken = authentication.getAccessToken;
		authentication.getAccessToken = async (input) => {
			if (input.accountId === "private-account" && !responseFailure)
				throw Object.assign(new Error("private token and provider response"), {
					code,
				});
			return getAccessToken(input);
		};
		const observer = createPullRequestProjectionObserver(authentication);
		const publish = vi.fn(() => true);
		const entry = projectionLoopEntry();
		entry.accounts.unshift({
			resource: "azure-devops",
			accountId: "private-account",
			displayName: "Private identity",
		});
		try {
			await observer.observe({ revision: 1, entries: [entry] }, publish);
			expect(publish).toHaveBeenCalledOnce();
			expect(warn.mock.calls).toEqual([
				[
					"Pull request projection account read failed",
					{
						workspaceId: entry.workspaceId,
						lane: "associated",
						attempt: 1,
						category,
					},
				],
			]);
			expect(JSON.stringify(warn.mock.calls)).not.toMatch(
				/private|dev\.azure\.com|pullrequest\/17/,
			);
		} finally {
			observer.dispose();
			warn.mockRestore();
		}
	},
);

test("worker failure diagnostics identify the lane without provider error text", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const observer = createPullRequestProjectionObserver(
		projectionAuthentication(({ url }) => projectionLoopResponse(url)),
	);
	const entry = projectionLoopEntry();
	const publish = vi.fn(() => {
		throw Object.assign(new Error("private provider response"), {
			code: "response_too_large",
		});
	});
	try {
		await observer.observe({ revision: 1, entries: [entry] }, publish);
		expect(publish).toHaveBeenCalledOnce();
		expect(warn.mock.calls).toEqual([
			[
				"Pull request projection refresh failed",
				{
					workspaceId: entry.workspaceId,
					lane: "associated",
					category: "response_too_large",
				},
			],
		]);
	} finally {
		observer.dispose();
		warn.mockRestore();
	}
});

test("new saved links are observed immediately and deletion retires their polling", async () => {
	vi.useFakeTimers();
	const observer = createPullRequestProjectionObserver(
		projectionAuthentication(({ url }) => projectionLoopResponse(url)),
	);
	const publish = vi.fn(() => true);
	const entry = projectionLoopEntry();
	try {
		await observer.observe({ revision: 1, entries: [] }, publish);
		expect(publish).not.toHaveBeenCalled();
		await observer.observe({ revision: 2, entries: [entry] }, publish);
		expect(publish).toHaveBeenCalledOnce();
		expect(publish.mock.calls[0][0][0]).toMatchObject({
			workspaceId: entry.workspaceId,
			lane: { kind: "associated", associatedUri: entry.associatedUri },
		});
		await observer.observe({ revision: 3, entries: [] }, publish);
		await vi.advanceTimersByTimeAsync(600_000);
		expect(publish).toHaveBeenCalledOnce();
	} finally {
		observer.dispose();
		vi.useRealTimers();
	}
});

test("associated observation keeps confirmed PR facts when optional checks fail", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		new URL(url).pathname.endsWith("/statuses")
			? new Response("Checks unavailable", { status: 503 })
			: projectionLoopResponse(url),
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);
	try {
		await observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			publish,
		);
		expect(publish).toHaveBeenCalledOnce();
		const projection = publish.mock.calls[0][0][0].projection;
		expect(projection.accountId).toBe("account");
		expect(projection.state.error).toBeTruthy();
		expect(projection.state.contributions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "badge", number: 17, state: "open" }),
				expect.objectContaining({ kind: "button", slot: "pr.mark-draft" }),
			]),
		);
	} finally {
		observer.dispose();
	}
});

test("a held pre-mutation observation cannot overwrite completed draft state", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0.9999);
	let releaseChecks;
	let checksStarted;
	const heldChecks = new Promise((resolve) => {
		releaseChecks = resolve;
	});
	const enteredChecks = new Promise((resolve) => {
		checksStarted = resolve;
	});
	let draft = false;
	let hold = true;
	const authentication = projectionAuthentication(async ({ url, init }) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/statuses") && hold) {
			checksStarted();
			await heldChecks;
		}
		const response = projectionLoopResponse(url);
		if (path.endsWith("/pullrequests/17")) {
			if (init.method === "PATCH") draft = JSON.parse(init.body).isDraft;
			return Response.json({ ...(await response.json()), isDraft: draft });
		}
		return response;
	});
	const revisions = new Map();
	const observer = createPullRequestProjectionObserver(
		authentication,
		revisions,
	);
	const ui = createPullRequestUi(authentication, undefined, revisions);
	const publish = vi.fn(() => true);
	try {
		const observation = observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			publish,
		);
		await enteredChecks;
		const result = await ui.actions
			.find(({ name }) => name === "set-draft")
			.handler(
				{ draft: true },
				{ ...prUiContext, associatedUri: projectionLoopEntry().associatedUri },
				{ markMutationDispatched: vi.fn() },
			);
		expect(result.contributions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "badge", state: "draft" }),
			]),
		);
		hold = false;
		releaseChecks();
		await observation;
		expect(publish).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(180_000);
		expect(publish).toHaveBeenCalledOnce();
		expect(publish.mock.calls[0][0][0].projection.state.contributions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "badge", state: "draft" }),
			]),
		);
	} finally {
		releaseChecks();
		observer.dispose();
		ui.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test("seventeen workspaces stay within the bridge authentication budget", async () => {
	let releaseTokens;
	const tokensReady = new Promise((resolve) => {
		releaseTokens = resolve;
	});
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const getAccessToken = authentication.getAccessToken;
	let pending = 0;
	let peak = 0;
	authentication.getAccessToken = async (input) => {
		pending++;
		peak = Math.max(peak, pending);
		try {
			if (pending > 16)
				throw new Error("Too many pending authentication requests");
			await tokensReady;
			return getAccessToken(input);
		} finally {
			pending--;
		}
	};
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);
	const observation = observer.observe(
		{
			revision: 1,
			entries: Array.from({ length: 17 }, (_, index) => {
				const entry = projectionLoopEntry(index + 1);
				entry.accounts[0].accountId = `account-${index}`;
				return entry;
			}),
		},
		publish,
	);
	try {
		await vi.waitFor(() => expect(pending).toBeGreaterThan(1));
		expect(peak).toBeLessThanOrEqual(16);
		releaseTokens();
		await observation;
		const updates = publish.mock.calls.flatMap(([batch]) => batch);
		expect(updates).toHaveLength(17);
		expect(
			updates.every(({ projection }) => projection.state.status === "ready"),
		).toBe(true);
	} finally {
		releaseTokens();
		await observation;
		observer.dispose();
	}
});

test.each([0, 0.9999])(
	"associated refresh uses randomized 1-3 minute cadence (%s)",
	async (random) => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(random);
		const authentication = projectionAuthentication(({ url }) =>
			projectionLoopResponse(url),
		);
		const observer = createPullRequestProjectionObserver(authentication);
		const publish = vi.fn(() => true);
		try {
			await observer.observe(
				{
					revision: 1,
					entries: [projectionLoopEntry()],
				},
				publish,
			);
			expect(publish).toHaveBeenCalledOnce();
			const delay = (1 + 2 * random) * 60_000;
			await vi.advanceTimersByTimeAsync(Math.floor(delay) - 1);
			expect(publish).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(2);
			expect(publish).toHaveBeenCalledTimes(2);
			expect(publish.mock.calls[1][0][0].lane.kind).toBe("associated");
			expect(
				authentication.authenticatedFetch.mock.calls.filter(([{ url }]) =>
					new URL(url).pathname.endsWith("/pullrequests"),
				),
			).toHaveLength(0);
			observer.dispose();
			await vi.advanceTimersByTimeAsync(600_000);
			expect(publish).toHaveBeenCalledTimes(2);
		} finally {
			observer.dispose();
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	},
);

test("timer-only associated polling publishes draft, closed, reopened, and merged state without session activation", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0.9999);
	let state = { status: "active", isDraft: false };
	const authentication = projectionAuthentication(async ({ url }) => {
		const response = projectionLoopResponse(url);
		return new URL(url).pathname.endsWith("/pullrequests/17")
			? Response.json({ ...(await response.json()), ...state })
			: response;
	});
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);
	const entry = projectionLoopEntry();
	try {
		await observer.observe({ revision: 1, entries: [entry] }, publish);
		expect(publish).toHaveBeenCalledOnce();
		expect(publish.mock.calls[0][0][0].projection.state.contributions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ number: 17, state: "open" }),
			]),
		);
		const transitions = [
			{ status: "active", isDraft: true, badge: "draft" },
			{ status: "abandoned", isDraft: false, badge: "closed" },
			{ status: "active", isDraft: false, badge: "open" },
			{ status: "completed", isDraft: false, badge: "merged" },
		];
		for (const [index, transition] of transitions.entries()) {
			state = { status: transition.status, isDraft: transition.isDraft };
			await vi.advanceTimersByTimeAsync(180_000);
			expect(publish).toHaveBeenCalledTimes(index + 2);
			expect(publish.mock.calls.at(-1)[0]).toEqual([
				expect.objectContaining({
					workspaceId: entry.workspaceId,
					lane: { kind: "associated", associatedUri: entry.associatedUri },
					projection: expect.objectContaining({
						state: expect.objectContaining({
							contributions: expect.arrayContaining([
								expect.objectContaining({
									kind: "badge",
									number: 17,
									state: transition.badge,
								}),
							]),
						}),
					}),
				}),
			]);
		}
	} finally {
		observer.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test("inventory reconciliation preserves associated polling across unchanged entries", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);
	const initial = projectionLoopEntry();
	const associatedReads = () =>
		authentication.authenticatedFetch.mock.calls.filter(([{ url }]) =>
			new URL(url).pathname.endsWith("/pullrequests/17"),
		).length;
	try {
		await observer.observe({ revision: 1, entries: [initial] }, publish);
		const requests = authentication.authenticatedFetch.mock.calls.length;
		await vi.advanceTimersByTimeAsync(30_000);
		await observer.observe({ revision: 2, entries: [initial] }, publish);
		expect(authentication.authenticatedFetch).toHaveBeenCalledTimes(requests);
		expect(associatedReads()).toBe(1);
		await vi.advanceTimersByTimeAsync(30_001);
		expect(associatedReads()).toBe(2);
		expect(publish.mock.calls.at(-1)[0][0].lane.kind).toBe("associated");
	} finally {
		observer.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test.each([0, 0.9999])(
	"fast polling uses the requested interval then expires without activity (random=%s)",
	async (random) => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(random);
		const observer = createPullRequestProjectionObserver(
			projectionAuthentication(({ url }) => projectionLoopResponse(url)),
		);
		const publish = vi.fn(() => true);
		try {
			await observer.observe(
				{ revision: 1, entries: [projectionLoopEntry()] },
				publish,
			);
			observer.setPollingOverride({
				minIntervalMs: 30_000,
				maxIntervalMs: 45_000,
				durationMs: 20 * 60_000,
			});
			const fastInterval = Math.floor(30_000 + 15_000 * random);
			await vi.advanceTimersByTimeAsync(fastInterval - 1);
			expect(publish).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(1);
			expect(publish).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(20 * 60_000 - fastInterval);
			const callsAtExpiry = publish.mock.calls.length;
			await vi.advanceTimersByTimeAsync(45_000);
			expect(publish).toHaveBeenCalledTimes(callsAtExpiry);
			const normalInterval = Math.floor(60_000 + 120_000 * random);
			await vi.advanceTimersByTimeAsync(normalInterval - 45_000);
			expect(publish).toHaveBeenCalledTimes(callsAtExpiry + 1);
			observer.dispose();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			observer.dispose();
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	},
);

test("fast poll is activation-local and disposal cancels its expiry and refresh timers", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const fast = createPullRequestProjectionObserver(authentication);
	const normal = createPullRequestProjectionObserver(authentication);
	const fastPublish = vi.fn(() => true);
	const normalPublish = vi.fn(() => true);
	const inventory = { revision: 1, entries: [projectionLoopEntry()] };
	try {
		await fast.observe(inventory, fastPublish);
		await normal.observe(inventory, normalPublish);
		fast.setPollingOverride({
			minIntervalMs: 30_000,
			maxIntervalMs: 45_000,
			durationMs: 1_200_000,
		});
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fastPublish).toHaveBeenCalledTimes(2);
		expect(normalPublish).toHaveBeenCalledOnce();
		fast.dispose();
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fastPublish).toHaveBeenCalledTimes(2);
		expect(normalPublish).toHaveBeenCalledTimes(2);
	} finally {
		fast.dispose();
		normal.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test("fast poll expiry during an associated read restores normal scheduling after that pass", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	let hold = false;
	const observer = createPullRequestProjectionObserver(
		projectionAuthentication(async ({ url }) => {
			if (hold && new URL(url).pathname.endsWith("/pullrequests/17"))
				await held;
			return projectionLoopResponse(url);
		}),
	);
	const publish = vi.fn(() => true);
	try {
		await observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			publish,
		);
		observer.setPollingOverride({
			minIntervalMs: 30_000,
			maxIntervalMs: 45_000,
			durationMs: 20 * 60_000,
		});
		await vi.advanceTimersByTimeAsync(19 * 60_000);
		hold = true;
		await vi.advanceTimersByTimeAsync(60_000);
		const callsAtExpiry = publish.mock.calls.length;
		hold = false;
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(publish).toHaveBeenCalledTimes(callsAtExpiry + 1);
		await vi.advanceTimersByTimeAsync(45_000);
		expect(publish).toHaveBeenCalledTimes(callsAtExpiry + 1);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(publish).toHaveBeenCalledTimes(callsAtExpiry + 2);
	} finally {
		release();
		observer.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test("unchanged in-flight observation publishes through the current inventory lease", async () => {
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	const authentication = projectionAuthentication(async ({ url }) => {
		if (new URL(url).pathname.endsWith("/repositories/widgets")) await held;
		return projectionLoopResponse(url);
	});
	const observer = createPullRequestProjectionObserver(authentication);
	const oldPublish = vi.fn(() => false);
	const newPublish = vi.fn(() => true);
	try {
		const first = observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			oldPublish,
		);
		await vi.waitFor(() =>
			expect(authentication.authenticatedFetch).toHaveBeenCalledOnce(),
		);
		const second = observer.observe(
			{ revision: 2, entries: [projectionLoopEntry()] },
			newPublish,
		);
		release();
		await Promise.all([first, second]);
		expect(oldPublish).not.toHaveBeenCalled();
		expect(newPublish).toHaveBeenCalledOnce();
	} finally {
		release();
		observer.dispose();
	}
});

test("a replacement associated inventory progresses after an older publication is rejected", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const currentPublish = vi.fn(() => true);
	let replacement;
	const rejectedPublish = vi.fn(() => {
		replacement = observer.observe(
			{
				revision: 2,
				entries: [projectionLoopEntry()],
			},
			currentPublish,
		);
		return false;
	});

	try {
		await observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			rejectedPublish,
		);
		await replacement;
		await vi.waitFor(() => expect(currentPublish).toHaveBeenCalledOnce());
		expect(rejectedPublish).toHaveBeenCalledOnce();
		expect(currentPublish.mock.calls[0][0][0].lane).toEqual({
			kind: "associated",
			associatedUri: projectionLoopEntry().associatedUri,
		});
	} finally {
		observer.dispose();
	}
});

test("completed associated observations replay after an inventory delivery window without another read", async () => {
	const authentication = projectionAuthentication(({ url }) =>
		projectionLoopResponse(url),
	);
	const observer = createPullRequestProjectionObserver(authentication);
	const oldPublish = vi.fn(() => true);
	const newPublish = vi.fn(() => true);
	const entry = projectionLoopEntry();
	try {
		await observer.observe({ revision: 1, entries: [entry] }, oldPublish);
		expect(oldPublish).toHaveBeenCalledOnce();
		const reads = authentication.authenticatedFetch.mock.calls.length;
		await observer.observe({ revision: 2, entries: [entry] }, newPublish);
		expect(authentication.authenticatedFetch).toHaveBeenCalledTimes(reads);
		expect(newPublish).toHaveBeenCalledOnce();
		expect(newPublish.mock.calls[0][0]).toEqual(oldPublish.mock.calls[0][0]);
	} finally {
		observer.dispose();
	}
});

test("timer-driven associated refresh and inventory changes never overlap their four workers", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	const held = [];
	let active = 0;
	let maximum = 0;
	let hold = true;
	const authentication = projectionAuthentication(async ({ url, init }) => {
		if (hold && new URL(url).pathname.endsWith("/repositories/widgets")) {
			active++;
			maximum = Math.max(maximum, active);
			await new Promise((resolve, reject) => {
				held.push(resolve);
				init.signal.addEventListener(
					"abort",
					() => reject(init.signal.reason),
					{ once: true },
				);
			});
			active--;
		}
		return projectionLoopResponse(url);
	});
	const observer = createPullRequestProjectionObserver(authentication);
	const publish = vi.fn(() => true);
	try {
		const initial = observer.observe(
			{
				revision: 1,
				entries: Array.from({ length: 8 }, (_, index) =>
					projectionLoopEntry(index + 1),
				),
			},
			publish,
		);
		await vi.waitFor(() => expect(held).toHaveLength(4));
		hold = false;
		for (const release of held.splice(0)) release();
		await initial;
		expect(publish).toHaveBeenCalledTimes(8);
		hold = true;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(held).toHaveLength(4);
		const replacement = observer.observe(
			{
				revision: 2,
				entries: Array.from({ length: 9 }, (_, index) =>
					projectionLoopEntry(index + 1),
				),
			},
			publish,
		);
		expect(held).toHaveLength(4);
		hold = false;
		for (const release of held.splice(0)) release();
		await replacement;
		expect(publish).toHaveBeenCalledTimes(25);
		expect(maximum).toBe(4);
		await observer.observe({ revision: 3, entries: [] }, publish);
		await vi.advanceTimersByTimeAsync(600_000);
		expect(publish).toHaveBeenCalledTimes(25);
	} finally {
		observer.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test.each(["repository", "pull-request"])(
	"replacement cancels actual %s reads and prevents retired publication",
	async (stage) => {
		const cancelled = [];
		let hold = true;
		const authentication = projectionAuthentication(async ({ url, init }) => {
			if (
				hold &&
				(stage === "repository" ||
					/\/pullrequests\/17$/.test(new URL(url).pathname))
			) {
				await new Promise((_, reject) => {
					init.signal.addEventListener(
						"abort",
						() => {
							cancelled.push(url);
							reject(init.signal.reason);
						},
						{ once: true },
					);
				});
			}
			return projectionLoopResponse(url);
		});
		const observer = createPullRequestProjectionObserver(authentication);
		const oldPublish = vi.fn(() => true);
		const newPublish = vi.fn(() => true);
		try {
			const oldPass = observer.observe(
				{ revision: 1, entries: [projectionLoopEntry()] },
				oldPublish,
			);
			await vi.waitFor(() =>
				expect(authentication.authenticatedFetch).toHaveBeenCalledTimes(
					stage === "repository" ? 1 : 2,
				),
			);
			hold = false;
			await observer.observe(
				{ revision: 2, entries: [projectionLoopEntry(18)] },
				newPublish,
			);
			await oldPass;
			expect(cancelled).toHaveLength(1);
			expect(oldPublish).not.toHaveBeenCalled();
			expect(newPublish).toHaveBeenCalledOnce();
			expect(newPublish.mock.calls[0][0][0].workspaceId).toBe("loop-18");
		} finally {
			observer.dispose();
		}
	},
);

test("provider activation preserves the background polling deadline", async () => {
	vi.useFakeTimers();
	vi.spyOn(Math, "random").mockReturnValue(0);
	const registerProvider = vi.fn(async () => () => {});
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication: projectionAuthentication(({ url }) =>
			projectionLoopResponse(url),
		),
		registerProvider,
		registerCanvas: async () => () => {},
	});
	const dispose = await activate();
	const observer =
		registerProvider.mock.calls[0][1].pullRequestProjectionObserver;
	const publish = vi.fn(() => true);
	try {
		await observer.observe(
			{ revision: 1, entries: [projectionLoopEntry()] },
			publish,
		);
		expect(publish).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(publish).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(publish).toHaveBeenCalledTimes(2);
	} finally {
		await dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

test("failed provider registration leaves activation rejected", async () => {
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication: operationAuthentication(),
		registerProvider: async () => {
			throw new Error("Registration refused");
		},
	});
	await expect(activate()).rejects.toThrow("Registration refused");
});

afterEach(() => {
	vi.unstubAllGlobals();
});

test("production picker reports automatic native discovery failures and recovery without identities", async () => {
	const canvases = new Map();
	const reportCanvasAction = vi.fn();
	const getAccessToken = vi
		.fn(async (input) => {
			expect(input).toEqual({
				accountId: "private-account",
				resource: "azure-devops",
			});
			return { accessToken: "fixture-token" };
		})
		.mockRejectedValueOnce(
			Object.assign(new Error("private credential details"), {
				code: "credential_unavailable",
			}),
		);
	const serviceFetch = stubServiceFetch(vi.fn());
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		registerProvider: async () => () => {},
		registerCanvas: async (id, canvas) => {
			canvases.set(id, canvas);
			return () => {};
		},
		reportCanvasAction,
		authentication: {
			listAccounts: async () => [
				{ id: "private-account", name: "Private name" },
			],
			getAccessToken,
		},
	});
	const dispose = await activate();
	try {
		const picker = canvases.get("repository-picker");
		const instanceId = randomUUID();
		const opened = await picker.open({ instanceId });
		const endpoint = opened.url.replace("/canvases/", "/instances/");
		await vi.waitFor(() =>
			expect(reportCanvasAction.mock.calls.map(([value]) => value)).toEqual([
				expect.objectContaining({
					action: "load",
					stage: "account",
					phase: "started",
				}),
				expect.objectContaining({
					action: "load",
					stage: "account",
					phase: "finished",
					result: "success",
					choiceCount: 1,
				}),
				expect.objectContaining({
					action: "load",
					stage: "organization",
					phase: "started",
				}),
				expect.objectContaining({
					action: "load",
					stage: "organization",
					phase: "finished",
					result: "failure",
					errorCode: "credential_unavailable",
					errorStage: "profile",
					pageCount: 1,
				}),
			]),
		);
		serviceFetch
			.mockResolvedValueOnce(
				Response.json({ id: repositorySelection.organization.id }),
			)
			.mockResolvedValueOnce(Response.json({ count: 0, value: [] }));
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				Origin: new URL(endpoint).origin,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "retry",
				sequence: 1,
				field: "organization",
			}),
		});
		expect(response.ok).toBe(true);
		await vi.waitFor(() =>
			expect(
				reportCanvasAction.mock.calls
					.map(([value]) => value)
					.filter(
						(value) => value.action === "load" && value.phase === "finished",
					),
			).toHaveLength(4),
		);
		const reports = reportCanvasAction.mock.calls.map(([value]) => value);
		expect(
			reports.filter((value) => value.action === "load").at(-1),
		).toMatchObject({
			stage: "organization",
			result: "success",
			pageCount: 2,
			choiceCount: 0,
			responseBytes: expect.any(Number),
			entryPoint: "retry",
		});
		expect(JSON.stringify(reports)).not.toMatch(
			/private|Private|credential details/,
		);
	} finally {
		await dispose();
	}
});

test("the manifest declares one fixed Agent merge capability", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
	);
	expect(manifest.activations[0].contributes.forgeProviders[0].agentMerge).toBe(
		true,
	);
});

test("the manifest advertises only implemented canvases and PR actions", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
	);
	const { forgeProviders, canvases } = manifest.activations[0].contributes;
	expect(forgeProviders[0].prUiActions.map((action) => action.name)).toEqual([
		"create",
		"set-draft",
		"complete",
		"submit-review",
	]);
	expect(canvases.map((canvas) => canvas.id)).toEqual([
		"create-from",
		"pull-request",
		"repository-picker",
	]);
});

test("activation registers the provider, repository picker, PR creation, and declared PR view", async () => {
	let registration;
	const canvases = new Map();
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		async registerProvider(providerId, provider) {
			if (registration) throw new Error("Duplicate provider registration");
			registration = { providerId, provider };
			return () => {
				registration = undefined;
			};
		},
		async registerCanvas(canvasId, handlers) {
			if (canvases.has(canvasId))
				throw new Error("Duplicate canvas registration");
			canvases.set(canvasId, handlers);
			return () => {
				canvases.delete(canvasId);
			};
		},
		authentication,
	});
	const dispose = await activate();
	expect(getHost).toHaveBeenCalledOnce();
	expect(registration.providerId).toBe("azure-devops");
	const prUi = registration.provider.prUi;
	expect(Object.keys(registration.provider.agentMerge).sort()).toEqual([
		"complete",
		"observe",
		"readCheckFailure",
		"readReviews",
		"replyToReview",
		"skill",
		"supports",
	]);
	const skill = registration.provider.agentMerge.skill;
	expect(skill).toEqual(expect.any(String));
	expect(skill).toBe(
		readFileSync(new URL("./agent-merge-skill.md", import.meta.url), "utf8"),
	);
	expect(skill.trim()).not.toBe("");
	expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(8192);
	expect(skill).toMatch(
		/Read-only State recovery may return a generation for the same saved\s+repository, PR URL and account/,
	);
	expect(skill).toContain("Use it and its revision in later calls.");
	expect(skill).toContain("Stop if target or account changes.");
	expect(skill).toContain("Never guess scope or replay stale writes.");
	for (const tool of [
		"read_agent_merge_state",
		"read_agent_merge_reviews",
		"reply_to_agent_merge_review",
		"read_agent_merge_check_failure",
	]) {
		expect(skill).toContain(tool);
	}
	expect(
		registration.provider.agentMerge.supports({
			url: "https://dev.azure.com/fabrikam/Tools/_git/widgets/pullrequest/17",
		}),
	).toBe(true);
	expect(await registration.provider.describe()).toEqual({
		displayName: "Azure DevOps",
		description:
			"Browse Azure DevOps repositories, choose branches or open pull requests, and review saved pull requests with your Microsoft account.",
		capabilities: ["provider.describe"],
	});
	expect([...canvases.keys()]).toEqual([
		"repository-picker",
		"pull-request",
		"create-from",
	]);
	expect(typeof registration.provider.pullRequestView.supports).toBe(
		"function",
	);
	// Recognition and the bound workspace open are separate declarations. The canvas
	// contribution must be the unbound handler set, not the account-bound opener.
	expect(typeof registration.provider.pullRequestView.open).toBe("function");
	expect(
		typeof registration.provider.pullRequestProjectionObserver.observe,
	).toBe("function");
	expect(canvases.get("pull-request").open).not.toBe(
		registration.provider.pullRequestView.open,
	);
	expect(await prUi.read()).toMatchObject({ status: "unavailable" });
	expect(prUi.actions.map((action) => action.name)).toEqual([
		"create",
		"submit-review",
		"set-draft",
		"complete",
	]);
	expect(
		canvases.get("repository-picker").actions.map((action) => action.name),
	).toEqual([
		"get-state",
		"account-changed",
		"dialog-state",
		"confirm-selection",
	]);
	expect(
		canvases.get("pull-request").actions.map((action) => action.name),
	).toEqual(["refresh", "cancel-refresh"]);
	await dispose();
	expect(registration).toBeUndefined();
	expect(canvases.size).toBe(0);
	await expect(prUi.read()).rejects.toThrow();
});

test("PR canvas registration failure releases the provider, picker, and PR actions", async () => {
	let prUi;
	const released = [];
	vi.mocked(getHost).mockReturnValue({
		async registerProvider(_id, provider) {
			prUi = provider.prUi;
			return () => released.push("provider");
		},
		async registerCanvas(id) {
			if (id === "pull-request") throw new Error("PR canvas rejected");
			return () => released.push(id);
		},
	});
	await expect(activate()).rejects.toThrow("PR canvas rejected");
	expect(released).toEqual(["repository-picker", "provider"]);
	await expect(prUi.read()).rejects.toThrow();
});

test("activation observes registration rejection", async () => {
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		async registerProvider() {
			throw new Error("Registration rejected");
		},
		authentication,
	});
	await expect(activate()).rejects.toThrow("Registration rejected");
});

test("activation retains provider support and PR canvas registration without authentication", async () => {
	let registration;
	const canvases = new Map();
	vi.mocked(getHost).mockReturnValue({
		async registerProvider(providerId, provider) {
			registration = { providerId, provider };
			return () => {};
		},
		async registerCanvas(canvasId, handlers) {
			canvases.set(canvasId, handlers);
			return () => {};
		},
	});
	const dispose = await activate();
	try {
		expect(registration.providerId).toBe("azure-devops");
		expect(
			registration.provider.pullRequestView.supports({
				url: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
			}),
		).toBe(true);
		expect(canvases.has("pull-request")).toBe(true);
	} finally {
		await dispose();
	}
});

test("the repository picker serves its UI and isolates instance state", async () => {
	let picker;
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication: signedInAuthentication,
		async registerProvider() {
			return () => {};
		},
		async registerCanvas(id, handlers) {
			if (id === "repository-picker") picker = handlers;
			return () => {};
		},
	});
	const dispose = await activate({
		catalog: {
			async listOrganizations() {
				throw new Error("Repository discovery unavailable");
			},
			async listProjects() {
				return [];
			},
			async listRepositories() {
				return [];
			},
		},
	});
	try {
		const first = randomUUID();
		const second = randomUUID();
		const opened = await picker.open({ instanceId: first, input: {} });
		const another = await picker.open({ instanceId: second, input: {} });
		const page = await fetch(opened.url);
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain("<title>Azure DevOps repository picker</title>");
		const read = picker.actions[0].handler;
		await expect
			.poll(() => read({ instanceId: first, input: {} }))
			.toMatchObject({
				fields: { organization: { status: "error", options: [] } },
				selection: null,
			});
		const endpoint = opened.url.replace("/canvases/", "/instances/");
		const result = await fetch(endpoint, {
			method: "POST",
			headers: {
				Origin: new URL(endpoint).origin,
				"Content-Type": "application/json",
				"X-Picker-Document": /name="picker-document" content="([^"]+)"/.exec(
					html,
				)[1],
			},
			body: JSON.stringify({
				type: "query",
				field: "organization",
				value: "Juniper example",
				sequence: 1,
			}),
		});
		expect(result.status).toBe(200);
		expect(await picker.open({ instanceId: first, reopen: true })).toEqual(
			opened,
		);
		expect((await read({ instanceId: first })).fields.organization.query).toBe(
			"Juniper example",
		);
		expect((await read({ instanceId: second })).fields.organization.query).toBe(
			"",
		);
		const observe = picker.actions.find(
			(action) => action.name === "dialog-state",
		).handler;
		expect(
			await observe({ instanceId: first, input: { afterRevision: null } }),
		).toMatchObject({
			revision: expect.any(Number),
			ready: false,
			disabledReason: expect.stringMatching(/\S/),
		});
		const confirm = picker.actions.find(
			(action) => action.name === "confirm-selection",
		).handler;
		const confirmation = confirm({ instanceId: first, input: {} });
		await picker.onClose({ instanceId: first });
		await expect(confirmation).resolves.toEqual({
			status: "rejected",
			message: expect.stringMatching(/\S/),
		});
		expect((await fetch(opened.url)).status).toBe(404);
		expect(() => read({ instanceId: first })).toThrow("closed");
		expect((await fetch(another.url)).status).toBe(200);
		expect(
			(
				await fetch(another.url.replace("/canvases/", "/instances/"), {
					method: "POST",
					headers: {
						Origin: "https://example.com",
						"Content-Type": "application/json",
					},
				})
			).status,
		).toBe(403);
	} finally {
		await dispose();
	}
});

test("the API-backed activation runs in Node from the relocated bundled package", () => {
	const directory = mkdtempSync(
		join(process.cwd(), ".ado-repository-discovery-"),
	);
	try {
		cpSync(new URL(".", import.meta.url), directory, { recursive: true });
		writeFileSync(
			join(directory, "host-loader.test.mjs"),
			`
import { register } from "node:module";
register("./host-resolver.test.mjs", import.meta.url);
`,
		);
		writeFileSync(
			join(directory, "host-resolver.test.mjs"),
			`
import { isBuiltin } from "node:module";
import { isAbsolute } from "node:path";
export function resolve(specifier, context, nextResolve) {
	if (specifier === "@github/copilot-app") {
		return { url: new URL("./host-fixture.test.mjs", import.meta.url).href, shortCircuit: true };
	}
	if (!isBuiltin(specifier) && !specifier.startsWith(".") && !specifier.startsWith("file:") && !isAbsolute(specifier)) {
		throw new Error("Unowned runtime dependency: " + specifier);
	}
	return nextResolve(specifier, context);
}
`,
		);
		writeFileSync(
			join(directory, "host-fixture.test.mjs"),
			`
import assert from "node:assert/strict";
export const selectMergeMethod = ${selectMergeMethod.toString()};
export let picker;
export let provider;
export function getHost() {
	return {
		owner: "app",
		async registerProvider(_id, value) { provider = value; return () => {}; },
		async registerCanvas(id, handlers) { if (id === "repository-picker") picker = handlers; return () => {}; },
		authentication: {
			async listAccounts(input) {
				assert.deepEqual(input, { resource: "azure-devops" });
				return [{id: "native-account", name: "Example account"}];
			},
			async getAccessToken(input) {
				assert.deepEqual(input, { accountId: "native-account", resource: "azure-devops" });
				return { accessToken: "fixture-token" };
			},
		},
	};
}
`,
		);
		const result = spawnSync(
			process.execPath,
			[
				"--import",
				"./host-loader.test.mjs",
				"--input-type=module",
				"--eval",
				`
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { picker, provider } from "./host-fixture.test.mjs";
const manifest = JSON.parse(readFileSync("./manifest.json", "utf8"));
assert.equal(manifest.activations[0].contributes.forgeProviders[0].agentMerge, true);
const { default: activate } = await import(manifest.activations[0].entry.node);
await assert.rejects(import("@github/copilot-app/internal"), /Unowned runtime dependency/);
let requests = 0;
const requestFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
	if (!String(url).startsWith("https://")) return requestFetch(url, init);
	assert.equal(init.headers.Authorization, "Bearer fixture-token");
	return Response.json(++requests === 1
		? { id: "ee238eb3-efed-42c3-b57e-f34c297c933d" }
		: { count: 0, value: [] });
};
const dispose = await activate();
try {
	assert.equal(typeof provider.agentMerge.skill, "string");
	assert.equal(provider.agentMerge.skill, readFileSync("./agent-merge-skill.md", "utf8"));
	assert.ok(Buffer.byteLength(provider.agentMerge.skill, "utf8") <= 8192);
	assert.equal(provider.agentMerge.actions, undefined);
	assert.equal(provider.agentMerge.guidance, undefined);
	const opened = await picker.open({
		instanceId: "5cf94e12-47e5-4ea9-aada-f30ed977db7a",
	});
	const endpoint = opened.url.replace("/canvases/", "/instances/");
	let state;
	for (let attempt = 0; attempt < 20; attempt++) {
		state = await (await fetch(endpoint)).json();
		if (state.fields.organization.status !== "loading" && state.fields.organization.status !== "idle") break;
	}
	assert.equal(state.fields.organization.status, "ready");
	assert.deepEqual(state.fields.organization.options, []);
	assert.equal(requests, 2);
	for (const asset of ["repository-picker-client.mjs", "repository-picker-view.mjs"]) {
		assert.equal((await fetch(new URL("/" + asset, opened.url))).status, 200);
	}
	for (const processOnly of ["repository-catalog.mjs", "request.mjs"]) {
		assert.equal((await fetch(new URL("/" + processOnly, opened.url))).status, 404);
	}
} finally {
	await dispose();
	globalThis.fetch = requestFetch;
}
`,
			],
			{ cwd: directory, encoding: "utf8", timeout: 10_000, env: {} },
		);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
	} finally {
		rmSync(directory, { recursive: true });
	}
});
