import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

test("distinguishes minimum approvals from required reviewers using policy types", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	const minimumType = "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd";
	const requiredType = "fd2167ab-b0be-447a-8ec8-39368250530e";
	const policy = (
		id: string,
		typeId: string,
		status: string,
		minimumApproverCount?: number,
		isBlocking = true,
		isEnabled = true,
	) => ({
		evaluationId: id,
		status,
		configuration: {
			isBlocking,
			isEnabled,
			settings:
				minimumApproverCount === undefined ? {} : { minimumApproverCount },
			type: {
				id: typeId,
				displayName:
					typeId === minimumType
						? "Minimum number of reviewers"
						: "Required reviewers",
			},
		},
	});
	let policies = [
		policy("minimum", minimumType, "queued", 1),
		policy("optional-reviewers", requiredType, "queued", 1, false),
	];
	const writes: unknown[] = [];
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input, init) => {
			if (init?.method && init.method !== "GET") writes.push(init.method);
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Approval policy wording",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [
						{
							id: "optional",
							displayName: "Optional reviewer",
							vote: 10,
							isRequired: false,
						},
					],
				});
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: policies.map((entry) => ({
						...entry,
						artifactId: url.searchParams.get("artifactId"),
					})),
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		const rows = page.locator(".policy-list .policy-summary-row");
		const names = rows.locator(".policy-summary-name");
		await expect(names).toHaveCount(1);
		await expect(names).toHaveText(["At least 1 reviewer must approve"]);
		await expect(rows).toHaveAttribute("data-status", "pending");
		policies[0] = policy("minimum", minimumType, "approved", 1);
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText(["1 reviewer approved"]);
		await expect(rows).toHaveAttribute("data-status", "approved");
		await expect(rows.getByText("Approved", { exact: true })).toHaveClass(
			"sr-only",
		);
		policies = [
			policy("minimum", minimumType, "queued", 2),
			policy("required", requiredType, "queued"),
		];
		policies[0].configuration.type.displayName = "Reviewer policy";
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText([
			"At least 2 reviewers must approve",
			"Required reviewers must approve",
		]);
		policies[0] = policy("minimum", minimumType, "approved", 2);
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText([
			"2 reviewers approved",
			"Required reviewers must approve",
		]);
		await expect(rows.nth(0)).toHaveAttribute("data-status", "approved");
		await expect(rows.nth(1)).toHaveAttribute("data-status", "pending");
		policies[1] = policy("required", requiredType, "approved");
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText([
			"2 reviewers approved",
			"Required reviewer policy satisfied",
		]);

		policies = [
			policy("minimum", minimumType, "unexpected", 1),
			policy("disabled", requiredType, "rejected", undefined, true, false),
			policy("exempt", requiredType, "notApplicable"),
			policy("optional", requiredType, "rejected", 1, false),
			policy("optional-minimum", minimumType, "rejected", 3, false),
		];
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText(["At least 1 reviewer must approve"]);
		await expect(rows).toHaveAttribute("data-status", "unknown");
		await expect(rows.getByText("Unknown", { exact: true })).toHaveClass(
			"sr-only",
		);
		policies[0] = policy("minimum", minimumType, "rejected", 1);
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText(["At least 1 reviewer must approve"]);
		await expect(rows).toHaveAttribute("data-status", "rejected");

		policies[0] = policy("minimum", minimumType, "unexpected");
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveText(["Reviewer approval required"]);
		await expect(rows).toHaveAttribute("data-status", "unknown");

		policies.shift();
		await refresh.handler({ instanceId, input: {} });
		await expect(names).toHaveCount(0);
		expect(writes).toEqual([]);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("compact checks use one expandable list and static policy rows", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 900 });
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const checks = page.getByTestId("checks");
		await expect(page.locator("#check-summary")).toHaveText(
			"2 of 4 required checks failed",
		);
		await expect(page.locator("#policy-summary")).toHaveText(
			"Optional check succeeded",
		);
		await expect(checks.getByText("Unit tests", { exact: true })).toHaveCount(
			0,
		);
		for (const name of [
			"Integration tests",
			"Lint",
			"Comments must be resolved",
			"Proof of presence is required",
		]) {
			const row = checks
				.locator(".check-list-row")
				.filter({ has: page.getByText(name, { exact: true }) });
			await expect(row).toBeVisible();
			await expect(row.locator(".check-list-name")).toHaveText(name);
		}
		await expect(checks.locator(".check-requirement")).toHaveCount(0);
		await expect(
			checks
				.locator(".check-list-row")
				.filter({
					has: page.getByText("Integration tests", { exact: true }),
				})
				.locator(".check-indicator circle"),
		).toHaveAttribute("r", "10");
		await expect(
			checks
				.locator(".check-list-row")
				.filter({ has: page.getByText("Lint", { exact: true }) })
				.locator(".check-indicator mask path")
				.first(),
		).toHaveAttribute("d", "M5.6 5.6 10.4 10.4");
		await expect(checks.locator(".check-list-row button")).toHaveCount(0);
		const viewAll = checks.locator(".checks-view-all");
		await expect(viewAll).toHaveText("View checks");
		await expect(viewAll).toHaveAttribute("aria-expanded", "false");
		await viewAll.click();
		await expect(viewAll).toHaveText("Collapse");
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		await expect(checks.getByText("Unit tests", { exact: true })).toBeVisible();
		for (const policy of [
			"At least 2 reviewers must approve",
			"No merge conflicts",
		])
			await expect(checks.getByText(policy, { exact: true })).toBeVisible();
		await expect(checks.locator(".policy-list button")).toHaveCount(0);
		await expect(checks.locator(".policy-list .check-requirement")).toHaveCount(
			0,
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(writes).toEqual([]);
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

test("matches Azure DevOps check grouping in draft and active states", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let draft = true;
	const pullRequest = () => ({
		pullRequestId: 22,
		title: "Align the pull request canvas",
		status: "active",
		isDraft: draft,
		mergeStatus: "rejectedByPolicy",
		sourceRefName: "refs/heads/feature/checks",
		targetRefName: "refs/heads/main",
		createdBy: { id: "reviewer", displayName: "Nate Qualls" },
		reviewers: [
			{
				id: "reviewer",
				displayName: "Nate Qualls",
				vote: 0,
				isRequired: true,
			},
		],
		lastMergeSourceCommit: { commitId: "1".repeat(40) },
		repository: {
			id: repository.repositoryId,
			project: { id: "22222222-2222-4222-8222-222222222222" },
		},
	});
	const policy = (
		id: string,
		displayName: string,
		status: string,
		settings: Record<string, unknown> = {},
		isBlocking = true,
	) => ({
		evaluationId: id,
		status,
		configuration: {
			id,
			isEnabled: true,
			isBlocking,
			settings,
			type: {
				id:
					displayName === "Minimum number of reviewers"
						? "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd"
						: displayName === "Required reviewers"
							? "fd2167ab-b0be-447a-8ec8-39368250530e"
							: id,
				displayName,
			},
		},
	});
	const draftPolicies = [
		policy(
			"00000000-0000-4000-8000-000000000001",
			"Minimum number of reviewers",
			"queued",
			{ minimumApproverCount: 2 },
		),
		policy(
			"00000000-0000-4000-8000-000000000002",
			"Status",
			"approved",
			{
				statusGenre: "vsts-scc-vscode",
				statusName: "FCIB Governance",
			},
			false,
		),
	];
	const activePolicies = [
		...draftPolicies.slice(0, 1),
		policy(
			"00000000-0000-4000-8000-000000000003",
			"Minimum number of reviewers",
			"queued",
			{ minimumApproverCount: 1 },
		),
		policy(
			"00000000-0000-4000-8000-000000000004",
			"Required reviewers",
			"queued",
		),
		policy(
			"00000000-0000-4000-8000-000000000005",
			"Work item linking",
			"rejected",
		),
		policy(
			"00000000-0000-4000-8000-000000000006",
			"Comment requirements",
			"rejected",
		),
		policy("00000000-0000-4000-8000-000000000007", "Status", "approved", {
			statusGenre: "vsts-scc-vscode",
			statusName: "FCIB Governance",
		}),
		policy(
			"00000000-0000-4000-8000-000000000008",
			"Status",
			"queued",
			{ statusGenre: "ado", statusName: "Code coverage" },
			false,
		),
		policy("00000000-0000-4000-8000-000000000009", "Status", "notApplicable", {
			statusGenre: "ado",
			statusName: "1ES Security",
		}),
	];
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		getAccess: async () => ({
			viewerId: "reviewer",
			operations: ["vote", "draft"],
		}),
		fetch: async (input, init) => {
			const url = new URL(String(input));
			if (init?.method === "PATCH") {
				const body = JSON.parse(String(init.body));
				if (body.isDraft === false) draft = false;
				return Response.json(pullRequest());
			}
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json(pullRequest());
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [
						{
							id: 1,
							state: "succeeded",
							description: "No FCIB(s) detected.",
							context: {
								genre: "vsts-scc-vscode",
								name: "FCIB Governance",
							},
							targetUrl: "https://example.com/fcib",
						},
					],
				});
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: (draft ? draftPolicies : activePolicies).map((entry) => ({
						...entry,
						artifactId: url.searchParams.get("artifactId"),
					})),
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);

		await expect(page.locator("#check-summary")).toHaveText(
			"No required checks",
		);
		await expect(page.getByTestId("policy-summary")).toHaveText(
			"Optional check succeeded",
		);
		await expect(page.locator(".ci-checks-card")).toBeHidden();
		const viewChecks = page.locator(".checks-view-all");
		await expect(viewChecks).toHaveText("View checks");
		await expect(viewChecks).toHaveAttribute("aria-expanded", "false");
		await viewChecks.click();
		await expect(viewChecks).toHaveAttribute("aria-expanded", "true");
		await expect(page.locator("#ci-checks-list")).toContainText(
			"No FCIB(s) detected.",
		);
		await expect(page.locator(".check-requirement")).toHaveCount(0);
		await viewChecks.click();
		await expect(viewChecks).toHaveAttribute("aria-expanded", "false");
		await expect(page.locator(".policy-list .policy-summary-name")).toHaveText([
			"No reviewers notified in draft mode",
			"No merge conflicts",
		]);
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Review options", exact: true }),
		).toHaveCount(0);

		draft = false;
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await refresh.handler({ instanceId, input: {} });
		await expect(page.getByTestId("pr-state")).toHaveText("Active");
		await expect(page.locator("#check-summary")).toHaveText(
			"2 of 3 required checks failed",
		);
		await expect(page.getByTestId("policy-summary")).toHaveText(
			"1 optional check not yet run",
		);
		await expect(page.locator("#ci-checks-list .check-list-name")).toHaveText([
			"Work items must be linked",
			"Comments must be resolved",
		]);
		await expect(
			page.getByRole("button", { name: "View checks", exact: true }),
		).toBeVisible();
		await expect(page.locator(".policy-list .policy-summary-name")).toHaveText([
			"At least 2 reviewers must approve",
			"Required reviewers must approve",
			"No merge conflicts",
		]);
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toBeVisible();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("shows a draft build policy's pipeline name before its first run", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	const definitionRequests: string[] = [];
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Draft pipeline naming",
					status: "active",
					isDraft: true,
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			if (url.pathname.endsWith("/statuses"))
				return Response.json({ value: [] });
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: [
						{
							evaluationId: "draft-build",
							artifactId: url.searchParams.get("artifactId"),
							status: "queued",
							context: {
								buildId: 0,
								buildDefinitionName: " ",
							},
							configuration: {
								isBlocking: true,
								isEnabled: true,
								settings: {
									buildDefinitionId: 77,
									displayName: " ",
								},
								type: { displayName: "Build" },
							},
						},
					],
				});
			if (url.pathname.endsWith("/build/definitions/77")) {
				definitionRequests.push(url.pathname);
				return Response.json({
					id: 77,
					name: "Draft validation pipeline",
				});
			}
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);

		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks pending",
		);
		const row = page.locator("#ci-checks-list .check-list-row");
		await expect(
			row.getByText("Draft validation pipeline", { exact: true }),
		).toBeVisible();
		await expect(row.getByText("Build", { exact: true })).toHaveCount(0);
		expect(definitionRequests).toHaveLength(1);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("treats an omitted ADO status state as a pending required check", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let omitState = false;
	let includePolicy = true;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Reset status state",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [
						{
							id: 1,
							...(omitState ? {} : { state: "succeeded" }),
							context: { name: "Required validation", genre: "test" },
						},
					],
				});
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: includePolicy
						? [
								{
									evaluationId: "required-validation",
									artifactId: url.searchParams.get("artifactId"),
									status: omitState ? "queued" : "approved",
									configuration: {
										isBlocking: true,
										isEnabled: true,
										settings: {
											statusGenre: "test",
											statusName: "Required validation",
										},
										type: { displayName: "Status" },
									},
								},
							]
						: [],
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#check-summary")).toHaveText(
			"1 required check has passed",
		);

		omitState = true;
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await refresh.handler({ instanceId, input: {} });

		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks pending",
		);
		const row = page.locator("#ci-checks-list .check-list-row");
		await expect(row).toHaveAttribute("data-status", "notSet");
		await expect(row.getByText("Not set", { exact: true })).toHaveClass(
			"sr-only",
		);
		await expect(row.locator(".check-indicator path")).toHaveAttribute(
			"d",
			"M12 6v6l4 2",
		);

		includePolicy = false;
		await refresh.handler({ instanceId, input: {} });
		await expect(page.locator("#check-summary")).toHaveText(
			"No required checks",
		);
		await expect(page.getByTestId("policy-summary")).toHaveText(
			"1 optional check not yet run",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("uses a matching blocking policy result over a successful status", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let policyStatus = "rejected";
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Policy authority",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [
						{
							id: 1,
							state: "succeeded",
							context: { name: "Successful build", genre: "build" },
							targetUrl:
								"https://dev.azure.com/fabrikam/tools/_build/results?buildId=42",
						},
					],
				});
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: [
						{
							evaluationId: "blocking-build",
							artifactId: url.searchParams.get("artifactId"),
							status: policyStatus,
							context: {
								buildId: 42,
								buildDefinitionName: "Supplied build definition",
							},
							configuration: {
								isBlocking: true,
								isEnabled: true,
								settings: { displayName: "Build and Test" },
								type: { displayName: "Build validation" },
							},
						},
					],
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const row = page.locator("#ci-checks-list .check-list-row");
		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks failed",
		);
		await expect(row).toHaveAttribute("data-status", "rejected");
		await expect(
			row.getByText("Build and Test", { exact: true }),
		).toBeVisible();
		await expect(
			row.getByText("Successful build", { exact: true }),
		).toHaveCount(0);
		await expect(row.getByText("Rejected", { exact: true })).toHaveClass(
			"sr-only",
		);

		policyStatus = "queued";
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await refresh.handler({ instanceId, input: {} });

		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks pending",
		);
		await expect(row).toHaveAttribute("data-status", "queued");
		await expect(row.getByText("Queued", { exact: true })).toHaveClass(
			"sr-only",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

for (const scenario of [
	{
		name: "keeps a rejected matching policy optional beside a passing required check",
		statusState: "succeeded",
		policies: [
			{
				evaluationId: "11111111-1111-4111-8111-111111111111",
				status: "approved",
				configuration: {
					isBlocking: true,
					isEnabled: true,
					settings: {
						displayName: "Required lint",
						statusGenre: "ci",
						statusName: "Lint",
					},
					type: { displayName: "Status" },
				},
			},
			{
				evaluationId: "22222222-2222-4222-8222-222222222222",
				status: "rejected",
				configuration: {
					isBlocking: false,
					isEnabled: true,
					settings: {
						displayName: "Optional lint",
						statusGenre: "ci",
						statusName: "Lint",
					},
					type: { displayName: "Status" },
				},
			},
		],
		summary: "1 required check has passed",
		optionalSummary: "1 optional check failed",
		expand: true,
		rows: [
			{ name: "Required lint", status: "succeeded", requirement: "Required" },
			{ name: "Optional lint", status: "rejected", requirement: "Optional" },
		],
	},
	{
		name: "keeps a failed status optional when its blocking policy is exempt",
		statusState: "failed",
		policies: [
			{
				evaluationId: "33333333-3333-4333-8333-333333333333",
				status: "notApplicable",
				configuration: {
					isBlocking: true,
					isEnabled: true,
					settings: {
						displayName: "Exempt lint",
						statusGenre: "ci",
						statusName: "Lint",
					},
					type: { displayName: "Status" },
				},
			},
		],
		summary: "No required checks",
		optionalSummary: "1 optional check failed",
		expand: false,
		rows: [{ name: "Lint", status: "failed", requirement: "Optional" }],
	},
]) {
	test(scenario.name, async ({ page }) => {
		const repository = {
			organization: "fabrikam",
			project: "tools",
			repositoryId: "11111111-1111-4111-8111-111111111111",
			accountId: "fixture-account",
		};
		const canvas = createPullRequestCanvas({
			authentication: {
				getAccessToken: async () => ({ accessToken: "fixture-token" }),
			},
			fetch: async (input) => {
				const url = new URL(String(input));
				if (/\/pullrequests\/22$/i.test(url.pathname))
					return Response.json({
						pullRequestId: 22,
						repository: {
							id: repository.repositoryId,
							project: { id: "22222222-2222-4222-8222-222222222222" },
						},
						title: "Policy requiredness",
						status: "active",
						sourceRefName: "refs/heads/topic",
						targetRefName: "refs/heads/main",
						reviewers: [],
					});
				if (url.pathname.endsWith("/statuses"))
					return Response.json({
						value: [
							{
								id: 1,
								state: scenario.statusState,
								context: { name: "Lint", genre: "ci" },
							},
						],
					});
				if (url.pathname.endsWith("/evaluations"))
					return Response.json({
						value: scenario.policies.map((policy) => ({
							...policy,
							artifactId: url.searchParams.get("artifactId"),
						})),
					});
				return Response.json({ value: [] });
			},
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.locator("#check-summary")).toHaveText(scenario.summary);
			await expect(page.getByTestId("policy-summary")).toHaveText(
				scenario.optionalSummary,
			);
			if (scenario.expand) await page.locator(".checks-view-all").click();
			const rows = page.locator("#ci-checks-list .check-list-row");
			await expect(rows).toHaveCount(scenario.rows.length);
			for (const expected of scenario.rows) {
				const row = rows.filter({
					has: page.getByText(expected.name, { exact: true }),
				});
				await expect(row).toHaveAttribute("data-status", expected.status);
				await expect(
					row.getByText(expected.requirement, { exact: true }),
				).toHaveClass("sr-only");
			}
			await expect(page.getByText("Exempt lint", { exact: true })).toHaveCount(
				0,
			);
		} finally {
			await page.goto("about:blank");
			await canvas.dispose();
		}
	});
}

test("scheduled check updates preserve View-all state and keyboard focus", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let changed = false;
	const canvas = createPullRequestCanvas({
		refreshIntervalMs: 1000,
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: Array.from({ length: 25 }, (_, index) => ({
						id: index + 1,
						state: index < 5 ? "pending" : "succeeded",
						context: {
							name:
								changed && index === 24
									? "Check 25 updated"
									: `Check ${index + 1}`,
							genre: "test",
						},
					})),
				});
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Scheduled checks",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const viewAll = page.locator(".checks-view-all");
		await expect(viewAll).toHaveText("View checks");
		await expect(viewAll).toHaveAttribute("aria-expanded", "false");
		await viewAll.click();
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		const next = page.getByRole("button", { name: "Next checks" });
		await next.click();
		await expect(page.getByText("Check 21", { exact: true })).toBeVisible();
		await expect(next).toBeFocused();
		changed = true;
		await expect(
			page.getByText("Check 25 updated", { exact: true }),
		).toBeVisible();
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		await expect(next).toBeFocused();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("moves focus to the overview when View-all disappears after refresh", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let allActionable = false;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/statuses"))
				return Response.json({
					value: [
						{
							id: 1,
							state: "failed",
							context: { name: "Failed check", genre: "test" },
						},
						{
							id: 2,
							state: allActionable ? "pending" : "succeeded",
							context: { name: "Changing check", genre: "test" },
						},
					],
				});
			if (/\/pullrequests\/22$/i.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Disclosure focus",
					status: "active",
					mergeStatus: "succeeded",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const viewAll = page.locator(".checks-view-all");
		await expect(viewAll).toHaveText("View checks");
		await expect(viewAll).toBeVisible();
		await viewAll.focus();

		allActionable = true;
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await refresh.handler({ instanceId, input: {} });

		await expect(viewAll).toBeHidden();
		await expect(page.locator("#overview-status")).toBeFocused();
		const hiddenViewAllGap = await page.evaluate(() => {
			const checks = document.querySelector(".ci-checks-card");
			const policies = document.querySelector(".policy-list");
			if (!checks || !policies) throw new Error("Checks layout is missing");
			return (
				policies.getBoundingClientRect().top -
				checks.getBoundingClientRect().bottom
			);
		});
		expect(hiddenViewAllGap).toBe(12);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("policy rows stay static and refresh exact ADO status", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let policyStatus = "rejected";
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		getAccess: async () => ({
			viewerId: "reviewer",
			operations: ["build-retry"],
		}),
		fetch: async (input, init) => {
			expect(init?.method ?? "GET").toBe("GET");
			const url = new URL(String(input));
			if (url.pathname.endsWith("/evaluations")) {
				return Response.json({
					value: [
						{
							evaluationId: "required-build",
							artifactId: url.searchParams.get("artifactId"),
							status: policyStatus,
							context: {
								buildId: 42,
								buildDefinitionName: "Required build",
							},
							configuration: {
								isBlocking: true,
								isEnabled: true,
								type: { displayName: "Required build" },
							},
						},
					],
				});
			}
			if (/\/pullRequests\/22$/i.test(url.pathname)) {
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Checks disclosure refresh",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			}
			return Response.json({ value: [] });
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks failed",
		);
		await expect(page.locator("#policy-summary")).toHaveText("");
		const policy = page
			.locator(".check-list-row")
			.filter({ has: page.getByText("Required build", { exact: true }) });
		await expect(policy.getByText("Rejected", { exact: true })).toHaveClass(
			"sr-only",
		);
		await expect(policy.getByRole("button")).toHaveCount(0);
		await expect(policy.locator(".check-requirement")).toHaveCount(0);
		await expect(policy.locator(".policy-summary-status")).toHaveCount(0);
		await expect(
			policy.getByRole("link", {
				name: /^Required build .*Pipeline\. Opens in a new browser tab\.$/,
			}),
		).toHaveAttribute(
			"href",
			"https://dev.azure.com/fabrikam/tools/_build/results?buildId=42",
		);
		const focusedControl = page.getByRole("button", {
			name: "Copy PR URL",
			exact: true,
		});
		await focusedControl.focus();
		await refresh.handler({ instanceId, input: {} });
		await expect(focusedControl).toBeFocused();

		policyStatus = "future-private-status";
		await refresh.handler({ instanceId, input: {} });
		await expect(page.locator("#check-summary")).toHaveText(
			"1 of 1 required checks pending",
		);
		await expect(policy.getByText("Unknown", { exact: true })).toHaveClass(
			"sr-only",
		);

		policyStatus = "approved";
		await refresh.handler({ instanceId, input: {} });
		await expect(page.locator("#check-summary")).toHaveText(
			"1 required check has passed",
		);
		await page
			.getByRole("button", { name: "View checks", exact: true })
			.click();
		await expect(policy.getByText("Approved", { exact: true })).toHaveClass(
			"sr-only",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("keeps read-only checks truthful, paged and isolated across bindings at narrow width", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 900 });
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture-account",
	};
	let failed = true;
	let unavailable = false;
	let replacement = false;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input, init) => {
			expect(init?.method ?? "GET").toBe("GET");
			const url = new URL(String(input));
			if (url.pathname.endsWith("/evaluations")) {
				if (unavailable) return new Response(null, { status: 503 });
				return Response.json({
					value: [
						{
							evaluationId: "policy-one",
							artifactId: url.searchParams.get("artifactId"),
							status: "rejected",
							configuration: {
								isBlocking: true,
								isEnabled: false,
								type: { displayName: "Disabled policy" },
							},
						},
					],
				});
			}
			if (url.pathname.endsWith("/statuses")) {
				if (unavailable) return new Response(null, { status: 503 });
				return Response.json({
					value: Array.from({ length: 31 }, (_, index) => ({
						id: index + 1,
						state:
							index === 29
								? "notSet"
								: index === 30
									? "pending"
									: index === 0 && failed
										? "failed"
										: "succeeded",
						context: {
							name: `${replacement ? "Replacement" : "Original"} check ${index}`,
							genre: "test",
						},
						...(index === 0
							? {
									targetUrl:
										"https://dev.azure.com/fabrikam/tools/_build/results?buildId=88",
								}
							: {}),
					})),
				});
			}
			if (
				url.pathname.endsWith("/iterations") ||
				url.pathname.endsWith("/threads")
			)
				return Response.json({ value: [] });
			if (/\/pullRequests\/\d+$/i.test(url.pathname)) {
				return Response.json({
					pullRequestId: replacement ? 23 : 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: `A long pull request title ${"for a narrow review panel ".repeat(5)}`,
					description: "Review the result before changing the policy.",
					status: "active",
					isDraft: false,
					sourceRefName: `refs/heads/${"long-source-branch-".repeat(8)}`,
					targetRefName: "refs/heads/main",
					reviewers: [
						{
							id: "reviewer",
							displayName: "Sam Example",
							vote: 0,
							isRequired: true,
						},
					],
				});
			}
			throw new Error(`Unexpected fixture request: ${url.pathname}`);
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.getByTestId("reviewers")).toContainText("Sam Example");
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toBeHidden();
		await expect(page.locator("#check-summary")).toHaveText(
			"No required checks",
		);
		const viewAll = page.locator(".checks-view-all");
		await expect(viewAll).toHaveText("View checks");
		await expect(viewAll).toHaveAttribute("aria-expanded", "false");
		await expect(
			page.getByText("Original check 0", { exact: true }),
		).toBeVisible();
		const pipelineLink = page.getByRole("link", {
			name: /^Original check 0 .*Pipeline\. Opens in a new browser tab\.$/,
		});
		await expect(pipelineLink).toHaveAttribute(
			"href",
			"https://dev.azure.com/fabrikam/tools/_build/results?buildId=88",
		);
		const pipelineIcon = pipelineLink.locator(".check-details-icon");
		await expect(pipelineIcon).toHaveCSS("opacity", "0");
		await pipelineLink.hover();
		await expect(pipelineIcon).toHaveCSS("opacity", "1");
		await page.mouse.move(0, 0);
		await pipelineLink.focus();
		await expect(pipelineIcon).toHaveCSS("opacity", "1");
		await expect(
			page
				.locator(".check-list-row")
				.filter({
					has: page.getByText("Original check 0", { exact: true }),
				})
				.getByText("Optional", { exact: true }),
		).toHaveClass("sr-only");
		await expect(
			page.getByText("Original check 1", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText("Original check 30", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Original check 29", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Disabled policy", { exact: true }),
		).toHaveCount(0);
		await expect(page.locator(".policy-list .check-requirement")).toHaveCount(
			0,
		);
		await viewAll.click();
		await expect(viewAll).toHaveText("Collapse");
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		await expect(
			page.getByText("Original check 1", { exact: true }),
		).toBeVisible();
		await page.getByRole("button", { name: "Next checks" }).click();
		await expect(
			page.getByText("Original check 26", { exact: true }),
		).toBeVisible();
		await expect(page.getByTestId("policy-summary")).toHaveText(
			"1 optional check failed \u00b7 2 optional checks not yet run \u00b7 28 optional checks succeeded",
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		unavailable = true;
		const refresh = canvas.actions.find((action) => action.name === "refresh");
		if (!refresh) throw new Error("Refresh action missing");
		await refresh.handler({ instanceId, input: {} });
		await expect(page.locator("#status-checks-error")).toContainText(
			"Showing last known results",
		);
		await expect(page.getByTestId("policy-summary")).toContainText(
			"unavailable",
		);
		await expect(page.getByTestId("refresh-status")).toContainText(
			"unavailable",
		);
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		await expect(viewAll).toHaveText("Collapse");
		unavailable = false;
		failed = false;
		replacement = true;
		canvas.setBinding(instanceId, { repository, pullRequestId: 23 });
		await expect(page.locator("#pr-number")).toHaveText("#23");
		await expect(viewAll).toHaveAttribute("aria-expanded", "false");
		await expect(viewAll).toHaveText("View checks");
		await expect(
			page.getByText("Original check 0", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText("Replacement check 30", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Replacement check 29", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Replacement check 0", { exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#check-summary")).toHaveText(
			"No required checks",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});
