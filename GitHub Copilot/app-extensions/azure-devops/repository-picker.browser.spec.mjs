import { randomUUID } from "node:crypto";
import { register } from "node:module";
import { expect, test } from "@playwright/test";

const hostFixtureUrl = `data:text/javascript,${encodeURIComponent(`
let host;
export function getHost() { return host; }
export function setHost(value) { host = value; }
export function selectMergeMethod() {
	throw new Error("Merge-method selection is outside this picker fixture.");
}
`)}`;
register(
	`data:text/javascript,${encodeURIComponent(`
export function resolve(specifier, context, nextResolve) {
	if (specifier === "@github/copilot-app") {
		return { url: ${JSON.stringify(hostFixtureUrl)}, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}
`)}`,
);
const { setHost } = await import("@github/copilot-app");
const { default: activate } = await import("./app.mjs");
const { createCreateFromCanvas } = await import("./create-from.mjs");

let dispose;
let picker;
let instanceId;
let reports;
const requestFetch = globalThis.fetch;
const flatSearchPrompt =
	"Search or type org/project/repo, or paste a URL\u2026";
const urlRepository = {
	id: "72fb8993-569d-4b27-9dde-6325437726a4",
	name: "service",
	project: {
		id: "20df9a20-bf49-4ccf-b355-a75bc89cf728",
		name: "Studio",
	},
	remoteUrl: "https://example.invalid/never-follow-this",
};

function mockAdoFetch(respond) {
	globalThis.fetch = (url, init) =>
		String(url).startsWith("https://")
			? respond(String(url), init)
			: requestFetch(url, init);
}

function createFromFixture(authentication, repositoryName = "widgets") {
	const originUrl = `https://dev.azure.com/fabrikam/Tools/_git/${repositoryName}`;
	const repository = {
		id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
		name: repositoryName,
		project: { name: "Tools", id: "d3220790-8a9a-46a4-a2b8-77ecfc7e4c77" },
		remoteUrl: originUrl,
	};
	mockAdoFetch((url, init) => {
		expect(init.method).toBe("GET");
		const { Authorization, ...headers } = init.headers;
		const accountId = Authorization.slice("Bearer ".length);
		expect(["first", "second", "account-a"]).toContain(accountId);
		return /\/(?:refs|stats\/branches)$/.test(new URL(url).pathname)
			? authentication.authenticatedFetch({
					url,
					accountId,
					init: { ...init, headers },
				})
			: Response.json(repository);
	});
	return createCreateFromCanvas({
		listAccounts: authentication.listAccounts,
		async getAccessToken({ accountId }) {
			return { accessToken: accountId };
		},
	});
}

function iconGeometry(locator) {
	return locator.evaluate((icon) => ({
		strokeWidth: icon.getAttribute("stroke-width"),
		paths: [...icon.querySelectorAll("path")].map((path) =>
			path.getAttribute("d"),
		),
		circles: [...icon.querySelectorAll("circle")].map((circle) => [
			circle.getAttribute("cx"),
			circle.getAttribute("cy"),
			circle.getAttribute("r"),
		]),
		lines: [...icon.querySelectorAll("line")].map((line) => [
			line.getAttribute("x1"),
			line.getAttribute("x2"),
			line.getAttribute("y1"),
			line.getAttribute("y2"),
		]),
	}));
}

test("Create from guest keeps its dense tabs, keyboard focus, search and draft PR confirmation synchronized through real canvas transport", async ({
	page,
}) => {
	const originUrl = "https://dev.azure.com/fabrikam/Tools/_git/widgets";
	const repository = {
		id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
		name: "widgets",
		project: { name: "Tools", id: "d3220790-8a9a-46a4-a2b8-77ecfc7e4c77" },
		remoteUrl: originUrl,
		_links: { web: { href: originUrl } },
	};
	const requests = [];
	const authentication = {
		async listAccounts() {
			return [{ id: "account-a", name: "Ada" }];
		},
		async getAccessToken() {
			return { accessToken: "fixture-token" };
		},
		async authenticatedFetch(input) {
			requests.push(input);
			const url = new URL(input.url);
			const branch = {
				name: "feature/transport",
				commit: {
					commitId: "a".repeat(40),
					committer: { date: "2026-10-04T10:00:00Z" },
				},
			};
			const pr = {
				pullRequestId: 73,
				status: "active",
				title: "Transport change",
				isDraft: true,
				sourceRefName: "refs/heads/feature/transport",
				targetRefName: "refs/heads/main",
				creationDate: "2026-10-04T10:00:00Z",
				repository,
			};
			if (url.pathname.endsWith("/stats/branches"))
				return Response.json(branch);
			if (url.pathname.endsWith("/pullrequests"))
				return Response.json({ value: [pr] });
			if (url.pathname.endsWith("/pullrequests/73")) return Response.json(pr);
			if (url.pathname.endsWith("/refs"))
				return Response.json({
					value: [{ name: pr.sourceRefName, objectId: "a".repeat(40) }].filter(
						(ref) =>
							ref.name.includes(url.searchParams.get("filterContains") ?? ""),
					),
				});
			return Response.json(repository);
		},
	};
	mockAdoFetch((url, init) => {
		const { Authorization, ...headers } = init.headers;
		expect(Authorization).toBe(`Bearer ${"fixture-token"}`);
		return authentication.authenticatedFetch({
			url,
			accountId: "account-a",
			init: { ...init, headers },
		});
	});
	const canvas = createCreateFromCanvas(authentication);
	try {
		await page.setViewportSize({ width: 640, height: 420 });
		const instanceId = randomUUID();
		const opened = await canvas.open({
			instanceId,
			input: {
				originUrl: `https://dev.azure.com/fabrikam/Tools/_git/${repository.id}`,
			},
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const tabs = page.getByRole("tablist", { name: "Create from source" });
		const branchesTab = tabs.getByRole("tab", { name: "Branches" });
		const pullRequestsTab = tabs.getByRole("tab", { name: "Pull requests" });
		const search = page.getByRole("combobox", { name: "Search branches" });
		const branch = page.getByRole("option", {
			name: "feature/transport",
			exact: true,
		});
		const branchList = page.getByRole("listbox", {
			name: "Branches",
			exact: true,
		});
		const repositoryIcon = page.locator(".picker-repository svg");
		await expect(branch).toBeVisible();
		await expect(page.locator("html")).not.toHaveAttribute("data-platform");
		expect(
			await branchList.evaluate(
				(node) => getComputedStyle(node, "::-webkit-scrollbar").width,
			),
		).not.toBe("8px");
		await expect(search).toHaveCSS("appearance", "none");
		await expect(search).toHaveCSS("font-size", "13px");
		await expect(search).toHaveCSS("line-height", "20px");
		await expect(search).toHaveCSS("padding-top", "0px");
		await expect(search).toHaveCSS("padding-bottom", "12px");
		await expect(search).toHaveCSS("padding-left", "16px");
		await expect(search).toHaveCSS("padding-right", "16px");
		await expect(search).toHaveCSS("border-bottom-style", "solid");
		await expect(search).toHaveCSS("border-radius", "0px");
		const searchBounds = await search.boundingBox();
		await page.keyboard.press("Tab");
		await expect(search).toBeFocused();
		await expect(search).toHaveCSS("outline-style", "none");
		await expect(search).toHaveCSS("box-shadow", "none");
		expect(await search.boundingBox()).toEqual(searchBounds);
		expect(await iconGeometry(branch.locator("svg").first())).toEqual({
			strokeWidth: "2",
			paths: ["M15 6a9 9 0 0 0-9 9V3"],
			circles: [
				["18", "6", "3"],
				["6", "18", "3"],
			],
			lines: [],
		});
		await expect(repositoryIcon).toHaveAttribute("width", "14");
		await expect(repositoryIcon).toHaveAttribute("height", "14");
		expect(await iconGeometry(repositoryIcon)).toEqual({
			strokeWidth: "2",
			paths: [
				"M18 19a5 5 0 0 1-5-5v8",
				"M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5",
			],
			circles: [
				["13", "12", "2"],
				["20", "19", "2"],
			],
			lines: [],
		});
		await expect(branchesTab).toHaveAttribute("aria-selected", "true");
		await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
		await expect(
			page.getByRole("tabpanel", { name: "Branches" }),
		).toBeVisible();
		await expect(page.getByText("widgets", { exact: true })).toBeVisible();
		await expect(page.getByText(repository.id, { exact: true })).toHaveCount(0);
		await expect(
			page.getByRole("heading", { name: "Branches", exact: true }),
		).toBeVisible();
		await expect(branch).toHaveAccessibleName("feature/transport");
		await expect(branch.locator(".picker-row-hint")).toHaveText(
			/^Create\u21b5$/,
		);
		await expect(branch.getByText("\u21b5")).toBeVisible();
		await expect(branch.getByText("Create")).toBeHidden();
		expect(
			await page
				.locator(".picker-header")
				.evaluate((header) => getComputedStyle(header).borderBottomStyle),
		).toBe("solid");
		await expect(
			page.getByRole("combobox", { name: "Create from" }),
		).toHaveCount(0);
		await branchesTab.focus();
		await page.keyboard.press("ArrowRight");
		await expect(pullRequestsTab).toBeFocused();
		await expect(branchesTab).toHaveAttribute("aria-selected", "true");
		await expect(branch).toBeVisible();
		await page.keyboard.press("Home");
		await expect(branchesTab).toBeFocused();
		await page.keyboard.press("End");
		await expect(pullRequestsTab).toBeFocused();
		await page.keyboard.press("ArrowRight");
		await expect(branchesTab).toBeFocused();
		await expect(
			page.getByLabel("Microsoft account", { exact: true }),
		).toBeHidden();
		await branch.click();
		await expect(branch).toHaveAttribute("aria-selected", "true");
		await expect(search).toBeFocused();
		const observe = canvas.actions.find(
			(action) => action.name === "dialog-state",
		);
		await expect
			.poll(
				async () =>
					(
						await observe.handler({
							instanceId,
							input: { afterRevision: null },
						})
					).ready,
			)
			.toBe(true);
		await search.fill("not-found");
		await expect(page.locator("#status")).toHaveText(
			"No matching branches. Try a different search.",
		);
		await expect(
			page.getByRole("heading", { name: "Matching branches" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Retry branches" }),
		).toBeVisible();
		await expect(search).toBeFocused();
		expect(
			(await observe.handler({ instanceId, input: { afterRevision: null } }))
				.ready,
		).toBe(false);
		await search.fill("");
		await expect(branch).toBeVisible();
		await branch.click();
		await expect
			.poll(
				async () =>
					(
						await observe.handler({
							instanceId,
							input: { afterRevision: null },
						})
					).ready,
			)
			.toBe(true);
		await search.evaluate((input) =>
			input.dispatchEvent(
				new CompositionEvent("compositionstart", { bubbles: true }),
			),
		);
		const composingResult = await canvas.actions
			.find((action) => action.name === "confirm-selection")
			.handler({ instanceId });
		expect(composingResult).toMatchObject({
			status: "rejected",
			message: "Finish composing your search text, then try again.",
		});
		await search.evaluate((input) =>
			input.dispatchEvent(
				new CompositionEvent("compositionend", { bubbles: true }),
			),
		);
		await page.reload();
		await expect(branch).toBeVisible();
		expect(
			(await observe.handler({ instanceId, input: { afterRevision: null } }))
				.ready,
		).toBe(false);
		await search.fill("feature");
		await expect(branch).toBeVisible();
		await branchesTab.focus();
		await page.keyboard.press("ArrowRight");
		await expect(branchesTab).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("Enter");
		const pr = page.getByRole("option", {
			name: /#73 Transport change \(Draft\)/,
		});
		await expect(pr).toBeVisible();
		await expect(
			page.getByRole("tabpanel", { name: "Pull requests" }),
		).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: "Search pull requests" }),
		).toHaveValue("");
		await expect(pullRequestsTab).toHaveAttribute("aria-selected", "true");
		await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
		expect(
			(await observe.handler({ instanceId, input: { afterRevision: null } }))
				.ready,
		).toBe(false);
		await expect(pr).toContainText("feature/transport \u2192 main");
		await expect(pr.locator("svg").first()).toBeVisible();
		expect(await iconGeometry(pr.locator("svg").first())).toEqual({
			strokeWidth: "2",
			paths: ["M13 6h3a2 2 0 0 1 2 2v7"],
			circles: [
				["18", "18", "3"],
				["6", "6", "3"],
			],
			lines: [["6", "6", "9", "21"]],
		});
		await test.info().attach("Dense Azure DevOps pull request picker", {
			body: await page.screenshot({
				path: test.info().outputPath("dense-create-from-pr.png"),
			}),
			contentType: "image/png",
		});
		await page.setViewportSize({ width: 320, height: 400 });
		await expect(
			page.getByRole("combobox", { name: "Search pull requests" }),
		).toBeVisible();
		await expect(pullRequestsTab).toBeVisible();
		await expect(pr).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollHeight <= innerHeight,
			),
		).toBe(true);
		await pr.click();
		await expect(pr).toHaveAttribute("aria-selected", "true");
		await expect
			.poll(
				async () =>
					(
						await observe.handler({
							instanceId,
							input: { afterRevision: null },
						})
					).ready,
			)
			.toBe(true);
		const confirmed = await canvas.actions
			.find((action) => action.name === "confirm-selection")
			.handler({ instanceId });
		expect(confirmed).toEqual({
			status: "completed",
			value: {
				pullRequest: {
					number: 73,
					accountId: "account-a",
				},
			},
		});
		await expect(page.getByRole("status").last()).toHaveText(
			"Selected pull request: #73 Transport change",
		);
		expect(
			requests.every(
				(input) =>
					input.init.method === "GET" &&
					input.accountId === "account-a" &&
					!Object.hasOwn(input.init.headers, "Authorization"),
			),
		).toBe(true);
	} finally {
		await canvas.dispose();
	}
});

test("Create from guest recovers missing accounts and requires an explicit multiple-account choice", async ({
	page,
}) => {
	let checks = 0;
	const accountsUsed = [];
	const canvas = createFromFixture({
		async listAccounts() {
			return checks++ === 0
				? []
				: [
						{ id: "first", name: "Ada" },
						{
							id: "second",
							name: "Grace",
							secondaryLabel: "grace@example.com",
						},
					];
		},
		async authenticatedFetch(input) {
			accountsUsed.push(input.accountId);
			return Response.json({
				value: [{ name: "refs/heads/real/branch", objectId: "a".repeat(40) }],
			});
		},
	});
	try {
		const opened = await canvas.open({
			instanceId: randomUUID(),
			input: { originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets" },
			completionOwner: "host",
		});
		await page.goto(opened.url);
		await expect(
			page.getByRole("heading", { name: "Add a Microsoft account" }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Open Account settings" }),
		).toBeVisible();
		await expect(page.getByRole("tablist")).toBeHidden();
		await page.getByRole("button", { name: "check again" }).click();
		const account = page.getByLabel("Microsoft account", { exact: true });
		await expect(account).toBeVisible();
		await expect(account).toHaveValue("");
		await expect(account.locator("option")).toHaveText([
			"Choose a Microsoft account",
			"Ada",
			"Grace (grace@example.com)",
		]);
		await expect(
			page.getByRole("link", { name: "Open Account settings" }),
		).toBeHidden();
		await expect(page.locator("#status")).toHaveText(
			"Choose a Microsoft account first.",
		);
		expect(accountsUsed).toEqual([]);
		await account.selectOption("second");
		await expect(
			page.getByRole("option", { name: "real/branch", exact: true }),
		).toBeVisible();
		expect(accountsUsed).toEqual(["second"]);
	} finally {
		await canvas.dispose();
	}
});

test("Create from keeps search and source tabs visible while long branch results scroll at narrow widths", async ({
	page,
}) => {
	const repository = `widgets-${"long-name-".repeat(12)}`;
	const canvas = createFromFixture(
		{
			async listAccounts() {
				return [{ id: "account-a", name: "Ada" }];
			},
			async authenticatedFetch() {
				return Response.json({
					value: Array.from({ length: 40 }, (_, index) => ({
						name: `refs/heads/feature/${String(index).padStart(2, "0")}/a-long-branch-name`,
						objectId: "a".repeat(40),
					})),
				});
			},
		},
		repository,
	);
	try {
		await page.setViewportSize({ width: 320, height: 400 });
		const instanceId = randomUUID();
		const opened = await canvas.open({
			instanceId,
			input: {
				originUrl: `https://dev.azure.com/fabrikam/Tools/_git/${repository}`,
			},
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const panel = page.getByRole("tabpanel", { name: "Branches" });
		const list = panel.getByRole("listbox", { name: "Branches" });
		const branches = list.getByRole("option");
		await expect(branches).toHaveCount(40);
		await expect(page.getByText(repository, { exact: true })).toBeVisible();
		const search = page.getByRole("combobox", { name: "Search branches" });
		const before = await search.boundingBox();
		await branches.last().scrollIntoViewIfNeeded();
		await expect(search).toBeVisible();
		await expect(page.getByRole("tab", { name: "Branches" })).toBeVisible();
		expect(await search.boundingBox()).toEqual(before);
		expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
			0,
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollHeight <= innerHeight,
			),
		).toBe(true);
		await search.focus();
		await expect(search).toHaveAttribute(
			"aria-activedescendant",
			(await branches.first().getAttribute("id")) ?? "",
		);
		await page.keyboard.press("ArrowDown");
		await expect(branches.nth(1)).toHaveAttribute("data-active", "true");
		await expect(search).toHaveAttribute(
			"aria-activedescendant",
			(await branches.nth(1).getAttribute("id")) ?? "",
		);
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(branches.last()).toHaveAttribute("data-active", "true");
		await expect(branches.last()).toBeInViewport();
		await page.keyboard.press("Enter");
		await expect(branches.last()).toHaveAttribute("aria-selected", "true");
		await expect(search).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByRole("tab", { name: "Branches" })).toBeFocused();
		await expect
			.poll(
				async () =>
					(
						await canvas.actions
							.find((action) => action.name === "dialog-state")
							.handler({
								instanceId,
								input: { afterRevision: null },
							})
					).ready,
			)
			.toBe(true);
		await test
			.info()
			.attach("Dense Azure DevOps branch picker at narrow width", {
				body: await page.screenshot({
					path: test.info().outputPath("dense-create-from-branches.png"),
				}),
				contentType: "image/png",
			});
	} finally {
		await canvas.dispose();
	}
});

test("Create from guest hides account switching for a project-bound account even with several signed-in accounts", async ({
	page,
}) => {
	const used = [];
	const canvas = createFromFixture({
		async listAccounts() {
			return [
				{ id: "first", name: "Ada" },
				{ id: "second", name: "Grace" },
			];
		},
		async authenticatedFetch(input) {
			used.push(input.accountId);
			const branch = {
				name: "real/branch",
				commit: {
					commitId: "a".repeat(40),
					committer: { date: "2026-10-04T10:00:00Z" },
				},
			};
			return Response.json(
				new URL(input.url).searchParams.has("name")
					? branch
					: {
							value: [
								{ name: "refs/heads/real/branch", objectId: "a".repeat(40) },
							],
						},
			);
		},
	});
	try {
		const instanceId = randomUUID();
		const input = {
			originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets",
			accountId: "second",
		};
		const opened = await canvas.open({
			instanceId,
			input,
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const branch = page.getByRole("option", {
			name: "real/branch",
			exact: true,
		});
		await expect(branch).toBeVisible();
		await expect(
			page.getByLabel("Microsoft account", { exact: true }),
		).toBeHidden();
		await branch.click();
		await expect
			.poll(
				async () =>
					(
						await canvas.actions
							.find((action) => action.name === "dialog-state")
							.handler({ instanceId, input: { afterRevision: null } })
					).ready,
			)
			.toBe(true);
		const result = await canvas.actions
			.find((action) => action.name === "confirm-selection")
			.handler({ instanceId });
		expect(result).toEqual({
			status: "completed",
			value: { branchName: "real/branch" },
		});
		expect(used).toEqual(["second", "second"]);
		await expect(
			canvas.open({
				instanceId,
				input: { ...input, accountId: "first" },
				completionOwner: "host",
			}),
		).rejects.toThrow("different repository or account");
	} finally {
		await canvas.dispose();
	}
});

test("Create from shows list failures in one feedback row with mapped authorization guidance and inline retry", async ({
	page,
}) => {
	let failure = "unauthorized";
	const canvas = createFromFixture({
		async listAccounts() {
			return [{ id: "account-a", name: "Ada" }];
		},
		async authenticatedFetch() {
			if (failure === "unauthorized")
				return new Response("{}", { status: 401 });
			if (failure === "invalid") return Response.json({ value: "not a list" });
			return Response.json({
				value: [{ name: "refs/heads/real/branch", objectId: "a".repeat(40) }],
			});
		},
	});
	try {
		await page.setViewportSize({ width: 640, height: 200 });
		const opened = await canvas.open({
			instanceId: randomUUID(),
			input: { originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets" },
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const search = page.getByRole("combobox", { name: "Search branches" });
		const hint = page.locator("#status");
		const feedback = page.locator("#feedback");
		const retry = feedback.getByRole("button", { name: "Retry branches" });
		await expect(hint).toHaveText(
			/rejected authorization for this request \(HTTP 401\).*Update authorization/,
		);
		await expect(search).toHaveAttribute("aria-invalid", "true");
		await expect(page.getByText("widgets", { exact: true })).toBeVisible();
		await expect(search).toHaveAttribute("aria-describedby", "status");
		const accountSettings = page
			.getByRole("tabpanel", { name: "Branches" })
			.getByRole("link", { name: "Open Account settings" });
		const panel = page.getByRole("tabpanel", { name: "Branches" });
		const searchBox = await search.boundingBox();
		await expect(accountSettings).toBeVisible();
		await expect(accountSettings).not.toBeInViewport();
		await panel.hover();
		await page.mouse.wheel(0, 400);
		await expect(accountSettings).toBeInViewport();
		expect(await search.boundingBox()).toEqual(searchBox);
		await expect(
			page.getByRole("heading", { name: "Branches", exact: true }),
		).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
		await expect(page.locator(".request-error")).toHaveCount(0);
		await expect(page.getByText(/Could not load this list/)).toHaveCount(0);

		await page.setViewportSize({ width: 640, height: 420 });
		failure = "invalid";
		await retry.click();
		await expect(hint).toHaveText("Azure DevOps returned an invalid list.");
		await expect(
			page.getByRole("link", { name: "Open Account settings" }),
		).toBeHidden();
		const hintBox = await hint.boundingBox();
		const retryBox = await retry.boundingBox();
		expect(
			Math.abs(
				hintBox.y + hintBox.height / 2 - (retryBox.y + retryBox.height / 2),
			),
		).toBeLessThan(4);
		expect(retryBox.x).toBeGreaterThan(hintBox.x + hintBox.width - 1);

		failure = null;
		await retry.click();
		await expect(
			page.getByRole("option", { name: "real/branch", exact: true }),
		).toBeVisible();
		await expect(retry).toBeHidden();
		await expect(search).toBeFocused();
		await expect(search).toHaveAttribute("aria-invalid", "false");
	} finally {
		await canvas.dispose();
	}
});

test("Create from preserves oversized input and recovers without reloading through bounded canvas requests", async ({
	page,
}) => {
	const canvas = createFromFixture({
		async listAccounts() {
			return [{ id: "account-a", name: "Ada" }];
		},
		async authenticatedFetch() {
			return Response.json({
				value: [{ name: "refs/heads/real/branch", objectId: "a".repeat(40) }],
			});
		},
	});
	try {
		const instanceId = randomUUID();
		const opened = await canvas.open({
			instanceId,
			input: { originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets" },
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const search = page.getByRole("combobox", { name: "Search branches" });
		const branch = page.getByRole("option", {
			name: "real/branch",
			exact: true,
		});
		const error =
			"Search text must be 4096 characters or fewer. Shorten your search.";
		await expect(branch).toBeVisible();
		await search.press("Enter");
		await expect(branch).toHaveAttribute("aria-selected", "true");
		for (const query of [
			"x".repeat(50_000),
			"界".repeat(50_000),
			'"\\'.repeat(25_000),
			`${"x".repeat(4096)}\t`,
			"\u0001".repeat(50_000),
		]) {
			const posted = page.waitForResponse(
				(response) =>
					response.request().method() === "POST" &&
					response.request().postDataJSON()?.type === "query",
			);
			await search.fill(query);
			await expect(search).toHaveValue(query);
			const response = await posted;
			expect(response.ok()).toBe(true);
			expect(
				Buffer.byteLength(response.request().postData(), "utf8"),
			).toBeLessThan(16 * 1024);
			await expect(search).toHaveAccessibleDescription(error);
			await expect(search).toHaveAttribute("aria-invalid", "true");
			await expect(page.locator("#status")).toBeVisible();
			await expect(page.locator("#live")).toHaveText(error);
			await expect(branch).toHaveCount(0);
			await expect(
				page.getByRole("button", { name: "Reload picker" }),
			).toHaveCount(0);
			expect(
				await canvas.actions
					.find((action) => action.name === "confirm-selection")
					.handler({ instanceId }),
			).toEqual({ status: "rejected", message: error });
			if (query.includes("\t") || query.includes("\u0001")) {
				const invalidQuery = query.includes("\t")
					? query.slice(1)
					: query.slice(0, 4096);
				await search.fill(invalidQuery);
				await expect(search).toHaveValue(invalidQuery);
				await expect(search).toHaveAccessibleDescription(
					"Search text cannot contain control characters. Remove them and try again.",
				);
				await expect(search).toHaveAttribute("aria-invalid", "true");
				await expect(branch).toHaveCount(0);
				await expect(
					page.getByRole("button", { name: "Retry branches" }),
				).toBeHidden();
				await expect(
					page.getByRole("button", { name: "Reload picker" }),
				).toHaveCount(0);
				expect(
					await canvas.actions
						.find((action) => action.name === "confirm-selection")
						.handler({ instanceId }),
				).toMatchObject({ status: "rejected" });
			}
			await search.fill("real");
			await expect(branch).toBeVisible();
			await expect(search).toHaveAttribute("aria-invalid", "false");
			await expect(search).toBeFocused();
			await search.press("Enter");
			await expect(branch).toHaveAttribute("aria-selected", "true");
		}
	} finally {
		await canvas.dispose();
	}
});

test("Create from ignores Enter on a stale list while search writes are pending", async ({
	page,
}) => {
	const canvas = createFromFixture({
		async listAccounts() {
			return [{ id: "account-a", name: "Ada" }];
		},
		async authenticatedFetch() {
			return Response.json({
				value: [{ name: "refs/heads/real/branch", objectId: "a".repeat(40) }],
			});
		},
	});
	try {
		const instanceId = randomUUID();
		const opened = await canvas.open({
			instanceId,
			input: { originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets" },
			completionOwner: "host",
		});
		await page.goto(opened.url);
		const search = page.getByRole("combobox", { name: "Search branches" });
		const branch = page.getByRole("option", {
			name: "real/branch",
			exact: true,
		});
		await expect(branch).toBeVisible();
		const held = Promise.withResolvers();
		const release = Promise.withResolvers();
		const stateUrl = new URL(`/instances/${instanceId}`, opened.url).href;
		const latestListReady = page.waitForResponse(async (response) => {
			if (
				response.url() !== stateUrl ||
				response.request().method() !== "GET" ||
				!response.ok()
			)
				return false;
			const state = await response.json();
			return state.sequence === 2 && state.status === "ready";
		});
		await page.route("**/instances/**", async (route) => {
			if (
				route.request().method() === "POST" &&
				route.request().postDataJSON()?.type === "query"
			) {
				held.resolve();
				await release.promise;
			}
			await route.continue();
		});
		try {
			await search.focus();
			await page.keyboard.type("x");
			await page.keyboard.press("Backspace");
			await held.promise;
			await page.keyboard.press("Enter");
			await expect(branch).toHaveAttribute("aria-selected", "false");
		} finally {
			release.resolve();
		}
		await latestListReady;
		await expect(page.locator("#status")).toHaveText("1 branches available.");
		await expect(branch).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Reload picker" }),
		).toHaveCount(0);
		await expect(branch).toHaveAttribute("aria-selected", "false");
		await search.press("Enter");
		await expect(branch).toHaveAttribute("aria-selected", "true");
		await expect
			.poll(
				async () =>
					(
						await canvas.actions
							.find((action) => action.name === "dialog-state")
							.handler({ instanceId, input: { afterRevision: null } })
					).ready,
			)
			.toBe(true);
	} finally {
		try {
			await page.unrouteAll({ behavior: "wait" });
		} finally {
			await canvas.dispose();
		}
	}
});

function catalog(overrides = {}) {
	return {
		listOrganizations: async () => [
			{ id: "org-juniper", name: "Juniper example" },
			{ id: "org-harbor", name: "Harbor example" },
		],
		listProjects: async () => [
			{ id: "project-studio", name: "Studio" },
			{ id: "project-flight", name: "Flight" },
		],
		listRepositories: async ({ organization, project }) => [
			{ id: `${organization.id}-${project.id}-service`, name: "service" },
			{ id: `${organization.id}-${project.id}-docs`, name: "handbook" },
		],
		resolveRepositoryUrl: async ({
			organization,
			project = "Studio",
			repository,
		}) => ({
			organization: { id: `org-${organization}`, name: organization },
			project: { id: `project-${project}`, name: project },
			repository: { id: `repository-${repository}`, name: repository },
		}),
		...overrides,
	};
}

async function open(page, catalog, completionOwner = "guest", authentication) {
	reports = [];
	setHost({
		owner: "app",
		reportCanvasAction: (report) => reports.push(report),
		authentication,
		async registerProvider() {
			return () => {};
		},
		async registerCanvas(id, handlers) {
			if (id === "repository-picker") picker = handlers;
			return () => {};
		},
	});
	dispose = await activate(catalog ? { catalog } : undefined);
	instanceId = randomUUID();
	const { url } = await picker.open({ instanceId, input: {}, completionOwner });
	await page.goto(url);
	await expect(
		page
			.getByRole("combobox", { name: "Organization", exact: true })
			.or(page.getByRole("combobox", { name: flatSearchPrompt, exact: true }))
			.or(
				page.getByRole("heading", {
					name: "Add a Microsoft account",
					exact: true,
				}),
			),
	).toBeVisible();
	return url;
}

async function choose(page, label, name) {
	const input = page.getByRole("combobox", { name: label, exact: true });
	await input.click();
	await page.getByRole("option", { name, exact: true }).click();
	await expect(input).toHaveValue(name);
}

async function pasteQuickFill(page, value) {
	await page
		.getByRole("textbox", { name: "URL (quick fill)" })
		.or(page.getByRole("combobox", { name: flatSearchPrompt, exact: true }))
		.evaluate((input, pastedValue) => {
			input.value = pastedValue;
			input.dispatchEvent(
				new InputEvent("input", {
					bubbles: true,
					data: pastedValue,
					inputType: "insertFromPaste",
				}),
			);
		}, value);
}

function confirm() {
	return picker.actions
		.find((entry) => entry.name === "confirm-selection")
		.handler({ instanceId, input: {} });
}

function readPickerState() {
	return picker.actions
		.find((entry) => entry.name === "get-state")
		.handler({ instanceId, input: {} });
}

async function readyModal(page) {
	await open(page, catalog(), "host");
	await choose(page, "Organization", "Juniper example");
	await choose(page, "Project", "Studio");
	await choose(page, "Repository", "service");
	await expect
		.poll(async () => (await readPickerState()).fields.repository.selected)
		.toMatchObject({ name: "service" });
}

test("an account change re-resolves an entered repository URL", async ({
	page,
}) => {
	let resolutions = 0;
	await open(
		page,
		catalog({
			listOrganizationRepositories: async () => [],
			resolveRepositoryUrl: async () => {
				const suffix = ++resolutions === 1 ? "first" : "second";
				return {
					organization: { id: "org-juniper", name: "juniper" },
					project: { id: "project-studio", name: "Studio" },
					repository: {
						id: `repository-${suffix}`,
						name: `service-${suffix}`,
					},
					account: { id: suffix, name: suffix === "first" ? "Ada" : "Grace" },
				};
			},
		}),
		"host",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.fill("https://dev.azure.com/juniper/Studio/_git/service");
	await expect(
		page.getByRole("option", {
			name: "juniper/Studio/service-first",
			exact: true,
		}),
	).toBeVisible();

	await picker.actions
		.find((entry) => entry.name === "account-changed")
		.handler({ instanceId, input: { accountReference: "second" } });
	await expect(
		page.getByRole("option", {
			name: "juniper/Studio/service-second",
			exact: true,
		}),
	).toBeVisible();
	expect(resolutions).toBe(2);
	expect((await readPickerState()).fields.repository.selected).toBeNull();
	await page
		.getByRole("option", {
			name: "juniper/Studio/service-second",
			exact: true,
		})
		.click();
	await expect
		.poll(async () => (await readPickerState()).fields.repository.selected)
		.toMatchObject({
			id: "repository-second",
			account: { id: "second", name: "Grace" },
		});
});

for (const kind of ["partial", "full"]) {
	test(`${kind} URL submission resets browsing and a failed lookup leaves it usable`, async ({
		page,
	}) => {
		const organizationId = "11111111-1111-4111-8111-111111111111";
		const requests = [];
		mockAdoFetch(async (url) => {
			requests.push(url);
			if (url.includes("/profiles/me"))
				return Response.json({ id: organizationId });
			if (url.includes("/_apis/accounts"))
				return Response.json({
					count: 1,
					value: [{ accountId: organizationId, accountName: "juniper" }],
				});
			if (url.includes("/_apis/projects"))
				return Response.json({ count: 1, value: [urlRepository.project] });
			if (url.includes("/_apis/git/repositories/service"))
				return new Response("", { status: 404 });
			if (url.includes("/_apis/git/repositories"))
				return Response.json({ count: 1, value: [urlRepository] });
			throw new Error(`Unexpected fixture request: ${url}`);
		});
		await open(page, undefined, "host", {
			listAccounts: async () => [{ id: "ada", name: "Ada" }],
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		});
		await page
			.getByRole("option", { name: "juniper/Studio/service", exact: true })
			.click();
		await expect
			.poll(async () => (await readPickerState()).fields.repository.selected)
			.toBeTruthy();
		requests.length = 0;
		const input = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		await input.fill(
			kind === "full"
				? "https://dev.azure.com/juniper/Studio/_git/service"
				: "https://dev.azure.com/missing",
		);
		await expect
			.poll(async () => (await readPickerState()).results.query)
			.toBe(await input.inputValue());
		expect(requests).toEqual([]);
		if (kind === "full") {
			await expect(page.locator("#quick-fill-error")).toContainText(
				"not found",
			);
			expect(requests).toEqual([
				"https://dev.azure.com/juniper/Studio/_apis/git/repositories/service?api-version=7.1",
			]);
		} else {
			await input.press("Enter");
			await expect(page.locator("#quick-fill-error")).toContainText(
				"not found",
			);
		}
		for (const name of ["organization", "project", "repository"])
			expect((await readPickerState()).fields[name].selected).toBeNull();
		await input.fill("");
		await page
			.getByRole("option", { name: "juniper/Studio/service", exact: true })
			.click();
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: { accountId: "ada", repositoryId: urlRepository.id },
		});
	});
}

test("URL mode only disables browsing fields and preserves their layout and selections", async ({
	page,
}) => {
	await readyModal(page);
	const input = page.getByRole("textbox", { name: "URL (quick fill)" });
	const before = (await readPickerState()).fields;
	const names = ["Organization", "Project", "Repository"];
	const placeholders = await Promise.all(
		names.map((name) =>
			page
				.getByRole("combobox", { name, exact: true })
				.getAttribute("placeholder"),
		),
	);
	for (const width of [480, 320]) {
		await page.setViewportSize({ width, height: 600 });
		const bounds = await input.boundingBox();
		await input.fill("https://dev.azure.com/juniper/Studio/_git/service");
		await expect
			.poll(async () => (await readPickerState()).repositoryUrl)
			.toBeTruthy();
		expect((await readPickerState()).fields).toEqual(before);
		for (const [index, name] of names.entries()) {
			const field = page.getByRole("combobox", { name, exact: true });
			await expect(field).toHaveValue(before[name.toLowerCase()].query);
			await expect(field).toHaveAttribute("placeholder", placeholders[index]);
			await expect(field).toHaveAttribute("aria-disabled", "true");
			await expect(field).toHaveAttribute("readonly");
			await field.click({ force: true });
			await field.press("ArrowDown");
			await expect(field).toHaveAttribute("aria-expanded", "false");
		}
		const disabledBounds = await input.boundingBox();
		expect(disabledBounds.width).toBe(bounds.width);
		expect(disabledBounds.x).toBe(bounds.x);
		await expect(
			page.getByText(
				"Submit to connect using this URL, or clear it to browse.",
			),
		).toHaveCount(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		await input.fill("");
		await expect(
			page.getByRole("combobox", { name: "Repository", exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		expect((await readPickerState()).fields).toEqual(before);
	}
});

test("URL submission bypasses stalled discovery and ignores its late results", async ({
	page,
}) => {
	const stalled = Promise.withResolvers();
	let loads = 0;
	let signal;
	await open(
		page,
		catalog({
			listOrganizations: (input) => {
				if (++loads > 1)
					return Promise.resolve([{ id: "resumed", name: "Resumed" }]);
				signal = input.signal;
				return stalled.promise;
			},
			resolveRepositoryUrl: async () => ({
				organization: { id: "juniper", name: "juniper" },
				project: urlRepository.project,
				repository: { id: urlRepository.id, name: urlRepository.name },
			}),
		}),
		"host",
	);
	const before = (await readPickerState()).fields;
	const input = page.getByRole("textbox", { name: "URL (quick fill)" });
	await input.fill("https://dev.azure.com/juniper/Studio/_git/service");
	await expect.poll(() => signal?.aborted).toBe(true);
	stalled.resolve([{ id: "obsolete", name: "Obsolete" }]);
	expect((await readPickerState()).fields).toEqual(before);
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { id: urlRepository.id } },
	});
	expect((await readPickerState()).fields.organization).toMatchObject({
		status: "idle",
		options: [],
		selected: null,
		query: "",
	});
	expect(loads).toBe(1);
	await input.fill("");
	await expect.poll(() => loads).toBe(2);
	await page
		.getByRole("combobox", { name: "Organization", exact: true })
		.click();
	await expect(page.getByRole("option", { name: "Resumed" })).toBeVisible();
	await expect(page.getByRole("option", { name: "Obsolete" })).toHaveCount(0);
});

test("URL mode ignores authorization failures from inactive browsing lists", async ({
	page,
}) => {
	await open(
		page,
		catalog({
			listAccounts: async () => [{ id: "account", name: "Ada" }],
			listOrganizations: async () => {
				throw Object.assign(new Error("Authorization required"), {
					name: "AzureDevOpsCatalogError",
					code: "auth_required",
				});
			},
		}),
		"host",
	);
	const organization = page.getByRole("combobox", {
		name: "Organization",
		exact: true,
	});
	await expect(organization).toHaveAttribute("aria-invalid", "true");
	await page
		.getByRole("textbox", { name: "URL (quick fill)" })
		.fill("https://dev.azure.com/juniper/Studio/_git/service");
	await expect
		.poll(async () => (await readPickerState()).repositoryUrl)
		.toBeTruthy();
	await expect(organization).toHaveAttribute("aria-disabled", "true");
	await expect(organization).toHaveAttribute("aria-invalid", "false");
	const hint = await picker.actions
		.find((entry) => entry.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(hint).toMatchObject({ ready: true, disabledReason: null });
	expect(hint).not.toHaveProperty("accountAuthorization");
});

test("unsafe URL edits cannot submit an earlier valid repository", async ({
	page,
}) => {
	let lookups = 0;
	await open(
		page,
		catalog({
			resolveRepositoryUrl: async () => {
				lookups++;
				throw new Error("Unsafe URLs must not reach the resolver");
			},
		}),
		"host",
	);
	const input = page.getByRole("textbox", { name: "URL (quick fill)" });
	await input.fill("https://dev.azure.com/juniper/Studio/_git/service");
	await expect
		.poll(async () => (await readPickerState()).repositoryUrl)
		.toBeTruthy();
	for (const invalid of [
		"not a URL",
		"http://dev.azure.com/juniper/Studio/_git/service",
		"https://dev.azure.com.evil.example/juniper/Studio/_git/service",
		"https://user:fixture-password@dev.azure.com/juniper/Studio/_git/service",
	]) {
		await input.fill(invalid);
		expect(await confirm()).toMatchObject({ status: "rejected" });
		await expect(page.locator("#quick-fill-error")).toContainText(
			"Enter a complete Azure DevOps repository URL",
		);
		await expect(page.locator("#quick-fill-error")).not.toContainText(invalid);
		expect((await readPickerState()).selection).toBeNull();
	}
	expect(lookups).toBe(0);
});

test("short result lists fit their content", async ({ page }) => {
	await open(page, catalog());
	const organization = page.getByRole("combobox", {
		name: "Organization",
		exact: true,
	});
	await organization.click();
	const list = page.getByRole("listbox", { name: "Organization", exact: true });
	const optionHeight = (await page.getByRole("option").first().boundingBox())
		.height;
	expect((await list.boundingBox()).height).toBeLessThanOrEqual(
		optionHeight * 2 + 10,
	);
	await organization.fill("Juniper");
	await expect(page.getByRole("option")).toHaveCount(1);
	expect((await list.boundingBox()).height).toBeLessThanOrEqual(
		optionHeight + 10,
	);
});

for (const completionOwner of ["host", "guest"]) {
	test(`dropdowns use available height and filtered results fit without scrolling (${completionOwner})`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 600, height: 800 });
		const options = (prefix) =>
			Array.from({ length: 60 }, (_, index) => ({
				id: `${prefix}-${index}`,
				name: `${prefix}${index}`,
			}));
		await open(
			page,
			catalog({
				listOrganizations: async () => options("organization"),
				listProjects: async () => options("project"),
				listRepositories: async () => options("repository"),
			}),
			completionOwner,
		);
		for (const [label, prefix] of [
			["Organization", "organization"],
			["Project", "project"],
			["Repository", "repository"],
		]) {
			const input = page.getByRole("combobox", { name: label, exact: true });
			await input.click();
			const list = page.getByRole("listbox", { name: label, exact: true });
			await expect(list).toBeVisible();
			const popup = await list.boundingBox();
			const remaining = 800 - popup.y - popup.height;
			expect(remaining).toBeGreaterThanOrEqual(0);
			expect(remaining).toBeLessThanOrEqual(12);
			expect(
				await list.evaluate((node) => node.scrollHeight > node.clientHeight),
			).toBe(true);
			await input.fill(`${prefix}1`);
			await expect(page.getByRole("option")).toHaveCount(11);
			expect(
				await list.evaluate((node) => node.scrollHeight <= node.clientHeight),
			).toBe(true);
			expect((await list.boundingBox()).height).toBeLessThan(popup.height);
			await expect(
				page.getByRole("option", { name: `${prefix}19`, exact: true }),
			).toBeInViewport();
			await input.press("ArrowUp");
			await input.press("Enter");
			await expect(input).toHaveValue(`${prefix}19`);
			await expect(list).toBeHidden();
			expect(
				await page.evaluate(() => document.documentElement.scrollHeight),
			).toBe(800);
		}
	});
}

test("empty filtering clears the active option instead of restoring a stale highlight", async ({
	page,
}) => {
	await open(page, catalog());
	const organization = page.getByRole("combobox", {
		name: "Organization",
		exact: true,
	});
	await organization.click();
	const list = page.getByRole("listbox", { name: "Organization", exact: true });
	await organization.press("ArrowDown");
	await expect(organization).toHaveAttribute(
		"aria-activedescendant",
		/organization-option-/,
	);
	await organization.fill("No matches");
	await expect(list).toBeHidden();
	await expect(organization).not.toHaveAttribute("aria-activedescendant");
	await organization.fill("Juniper");
	await expect(list).toBeVisible();
	await expect(organization).not.toHaveAttribute("aria-activedescendant");
	await organization.press("Enter");
	expect(
		(await picker.actions[0].handler({ instanceId })).fields.organization
			.selected,
	).toBeNull();
	await organization.press("ArrowDown");
	await organization.press("Enter");
	await expect(organization).toHaveValue("Juniper example");
});

test("project option rendering never stringifies large description metadata", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const stringify = JSON.stringify;
		window.serializedDescriptionLists = 0;
		JSON.stringify = (value, ...args) => {
			if (
				Array.isArray(value) &&
				Array.isArray(value[0]) &&
				value[0].some((item) => item?.description)
			) {
				window.serializedDescriptionLists += 1;
			}
			return stringify(value, ...args);
		};
	});
	await open(
		page,
		catalog({
			listProjects: async () =>
				Array.from({ length: 1000 }, (_, index) => ({
					id: `project-${index}`,
					name: `Project ${index}`,
					description: "x".repeat(2048),
				})),
		}),
	);
	await choose(page, "Organization", "Juniper example");
	const project = page.getByRole("combobox", { name: "Project", exact: true });
	await project.click();
	await expect(page.getByRole("option")).toHaveCount(1000);
	await project.fill("Project 99");
	await expect(page.getByRole("option")).toHaveCount(11);
	expect(await page.evaluate(() => window.serializedDescriptionLists)).toBe(0);
});

test("dropdowns overlay the form downward without adding document scrolling", async ({
	page,
}) => {
	await page.setViewportSize({ width: 440, height: 340 });
	const options = (prefix) =>
		Array.from({ length: 60 }, (_, index) => ({
			id: `${prefix}-${index}`,
			name: `${prefix}${index}`,
		}));
	await open(
		page,
		catalog({
			listOrganizations: async () => options("organization"),
			listProjects: async () => options("project"),
			listRepositories: async () => options("repository"),
		}),
		"host",
	);
	for (const [label, prefix, nextLabel] of [
		["Organization", "organization", "Project"],
		["Project", "project", "Repository"],
		["Repository", "repository", null],
	]) {
		const input = page.getByRole("combobox", { name: label, exact: true });
		const following = nextLabel
			? page.getByRole("combobox", { name: nextLabel, exact: true })
			: null;
		const before = await page.evaluate(() => ({
			height: document.documentElement.scrollHeight,
			top: scrollY,
		}));
		const nextBounds = await following?.boundingBox();
		await input.click();
		const list = page.getByRole("listbox", { name: label, exact: true });
		await expect(list).toBeVisible();
		expect(
			await page.evaluate(() => ({
				height: document.documentElement.scrollHeight,
				top: scrollY,
			})),
		).toEqual(before);
		if (following) expect(await following.boundingBox()).toEqual(nextBounds);
		const anchor = await input.boundingBox();
		const popup = await list.boundingBox();
		expect(popup.x).toBe(anchor.x);
		expect(popup.width).toBe(anchor.width);
		expect(popup.y).toBeGreaterThanOrEqual(8);
		expect(popup.y + popup.height).toBeLessThanOrEqual(332);
		expect(popup.y).toBeGreaterThan(anchor.y + anchor.height);
		await list.hover();
		await page.mouse.wheel(0, 300);
		await expect
			.poll(() => list.evaluate((node) => node.scrollTop))
			.toBeGreaterThan(0);
		expect(await page.evaluate(() => scrollY)).toBe(before.top);
		await input.press("ArrowUp");
		await expect(
			page.getByRole("option", { name: `${prefix}59`, exact: true }),
		).toBeInViewport();
		expect(await page.evaluate(() => scrollY)).toBe(before.top);
		await input.press("Enter");
		await expect(input).toHaveValue(`${prefix}59`);
	}
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.click();
	await repository.fill("repository1");
	await expect(page.getByRole("option")).toHaveCount(11);
	await repository.press("Escape");
	await expect(repository).toBeFocused();
	await expect(page.getByRole("listbox")).toBeHidden();
	await repository.click();
	await page.setViewportSize({ width: 320, height: 280 });
	await expect(page.getByRole("listbox")).toBeHidden();
	await repository.click();
	await expect(page.getByRole("listbox")).toBeVisible();
	await repository.press("Tab");
	await expect(page.getByRole("listbox")).toBeHidden();
	await repository.click();
	await repository.fill("no matching repository");
	await expect(page.getByRole("listbox")).toBeHidden();
	await repository.fill("repository");
	await expect(page.getByRole("listbox")).toBeVisible();
	await page.locator("#organization-label").click();
	await expect(
		page.getByRole("listbox", { name: "Repository", exact: true }),
	).toBeHidden();
	await expect(
		page.getByRole("listbox", { name: "Organization", exact: true }),
	).toBeVisible();
	await page.setViewportSize({ width: 320, height: 180 });
	await repository.click();
	await expect(page.getByRole("listbox")).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollHeight - innerHeight,
		),
	).toBeGreaterThan(0);
	await page.evaluate(() => {
		const bottom = document.documentElement.scrollHeight - innerHeight;
		window.scrollTo(0, scrollY > 0 ? 0 : bottom);
	});
	await expect(page.getByRole("listbox")).toBeHidden();
});

test("dependent fields look unavailable and retain keyboard explanations until applicable", async ({
	page,
}) => {
	await open(page, catalog());
	const project = page.getByRole("combobox", { name: "Project", exact: true });
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await expect(project).toHaveAttribute(
		"placeholder",
		"Choose an organization first.",
	);
	await expect(repository).toHaveAttribute(
		"placeholder",
		"Choose a project first.",
	);
	await project.focus();
	await expect(project).toBeFocused();
	await project.press("ArrowDown");
	await expect(project).toHaveAttribute("aria-expanded", "false");
	await expect(project).toHaveAttribute("aria-disabled", "true");
	await choose(page, "Organization", "Juniper example");
	await expect(project).toHaveAttribute("placeholder", "Search projects");
	await expect(project).toHaveAttribute("aria-disabled", "false");
	await expect(repository).toHaveAttribute("aria-disabled", "true");
	await choose(page, "Project", "Studio");
	await expect(repository).toHaveAttribute(
		"placeholder",
		"Search repositories",
	);
	await page
		.getByRole("combobox", { name: "Organization", exact: true })
		.fill("different");
	await expect(project).toHaveAttribute("aria-disabled", "true");
	await expect(repository).toHaveAttribute("aria-disabled", "true");
});

test("repository summary omits project descriptions and long lists scroll in a compact picker", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 440, height: 340 });
	await open(
		page,
		catalog({
			listProjects: async () => [
				{
					id: "project-studio",
					name: "Studio",
					description: "Project purpose <script>plain text</script>",
				},
			],
			listRepositories: async () =>
				Array.from({ length: 60 }, (_, index) => ({
					id: `repo-${index}`,
					name: `service${index}`,
					...(index === 59
						? { defaultBranch: "refs/heads/release/stable" }
						: {}),
				})),
		}),
	);
	await choose(page, "Organization", "Juniper example");
	await choose(page, "Project", "Studio");
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.click();
	const list = page.getByRole("listbox", { name: "Repository", exact: true });
	expect(
		await list.evaluate(
			(node) =>
				node.scrollHeight > node.clientHeight &&
				node.clientHeight <= innerHeight / 2,
		),
	).toBe(true);
	await repository.press("ArrowUp");
	await expect(
		page.getByRole("option", { name: "service59", exact: true }),
	).toBeInViewport();
	await repository.press("Enter");
	await expect(repository).toHaveValue("service59");
	await expect(
		page.getByRole("heading", { name: "Repository details", exact: true }),
	).toBeHidden();
	await expect(page.getByText("release/stable", { exact: true })).toBeHidden();
	await expect(
		page.getByText("Project description", { exact: true }),
	).toBeHidden();
	await expect(
		page.getByText("Juniper example / Studio / service59", { exact: true }),
	).toBeHidden();
	await expect(
		page.getByText("Project purpose <script>plain text</script>", {
			exact: true,
		}),
	).toHaveCount(0);
	await expect(repository).toBeFocused();
	await expect(repository).not.toHaveAccessibleDescription(/Project purpose/);
	await expect(page.locator('[aria-live="polite"]')).toHaveText(
		"Repository selected: service59.",
	);
	await repository.press("Tab");
	await expect(repository).not.toHaveAccessibleDescription(/Project purpose/);
	await page.keyboard.press("Shift+Tab");
	await expect(repository).toBeFocused();
	await expect(repository).not.toHaveAccessibleDescription(/Project purpose/);
	expect(
		(await picker.actions[0].handler({ instanceId })).selection,
	).toBeNull();
	await page.screenshot({
		path: testInfo.outputPath("repository-details.png"),
	});
	await repository.fill("service0");
	await expect(
		page.getByText("Project purpose <script>plain text</script>", {
			exact: true,
		}),
	).toBeHidden();
	await choose(page, "Repository", "service0");
	await expect(page.getByText("Default branch", { exact: true })).toBeHidden();
	await page.setViewportSize({ width: 320, height: 360 });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.getByRole("button", { name: "Select repository" }).click();
	await expect(
		page.getByRole("heading", { name: "Repository selected", exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Juniper example / Studio / service0", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Project purpose <script>plain text</script>", {
			exact: true,
		}),
	).toHaveCount(0);
	const selection = (await picker.actions[0].handler({ instanceId })).selection;
	expect(selection.project).toEqual({ id: "project-studio", name: "Studio" });
	expect(selection.repository).toEqual({ id: "repo-0", name: "service0" });
});

test("host modal omits local submit and confirms the live guest without binding", async ({
	page,
}) => {
	const interactionPosts = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.endsWith("/interaction"))
			interactionPosts.push(request.postDataJSON());
	});
	await readyModal(page);
	await expect(
		page.getByRole("button", { name: "Select repository" }),
	).toHaveCount(0);
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.click();
	await repository.press("Escape");
	await expect(repository).toBeFocused();
	await expect(repository).toHaveAttribute("aria-expanded", "false");
	await repository.press("Shift+Tab");
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toBeFocused();
	const result = await confirm();
	expect(result).toMatchObject({
		status: "completed",
		value: { repository: { id: "org-juniper-project-studio-service" } },
	});
	const confirmations = reports.filter((report) => report.action === "confirm");
	expect(confirmations).toHaveLength(2);
	expect(confirmations[1]).toMatchObject({
		actionId: confirmations[0].actionId,
		result: "success",
		entryPoint: "dialog",
	});
	await expect
		.poll(
			() =>
				reports.filter(
					(report) =>
						report.action === "collapse" &&
						report.stage === "repository" &&
						report.phase === "finished",
				).length,
		)
		.toBe(1);
	expect(interactionPosts.length).toBeGreaterThan(0);
	expect(interactionPosts.every((report) => report.phase === "finished")).toBe(
		true,
	);
	expect(new Set(interactionPosts.map((report) => report.actionId)).size).toBe(
		interactionPosts.length,
	);
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toBeFocused();
});

for (const holdAcknowledgement of [false, true]) {
	test(`successful host teardown stays quiet before pagehide (held acknowledgement=${holdAcknowledgement})`, async ({
		page,
	}) => {
		await page.addInitScript((hold) => {
			window.pickerErrors = [];
			window.confirmationPolls = 0;
			window.acknowledgementConsumed = false;
			const released = new Promise((resolve) => {
				window.releaseAcknowledgement = resolve;
			});
			const fetch = window.fetch;
			window.fetch = async (url, options) => {
				const confirmation = new URL(url, location.href).pathname.endsWith(
					"/confirmation",
				);
				if (confirmation && options?.method === "GET")
					window.confirmationPolls += 1;
				const response = await fetch(url, options);
				if (confirmation && options?.method === "POST") {
					const json = response.json.bind(response);
					response.json = async () => {
						if (hold) await released;
						const result = await json();
						window.acknowledgementConsumed = true;
						return result;
					};
				}
				return response;
			};
			new MutationObserver((records) => {
				for (const record of records) {
					if (record.target.id === "request-error") {
						const text = [...record.addedNodes]
							.map((node) => node.textContent)
							.join("");
						if (text) window.pickerErrors.push(text);
					}
				}
			}).observe(document, { subtree: true, childList: true });
		}, holdAcknowledgement);
		await readyModal(page);
		expect(await confirm()).toMatchObject({ status: "completed" });
		if (holdAcknowledgement) {
			expect(await page.evaluate(() => window.acknowledgementConsumed)).toBe(
				false,
			);
		} else {
			await expect
				.poll(() => page.evaluate(() => window.acknowledgementConsumed))
				.toBe(true);
		}
		await picker.onClose({ instanceId });
		// Instance teardown is real; the document (and its response body) stays alive.
		expect(
			await page.evaluate(
				async () =>
					(await fetch(location.pathname.replace("/canvases/", "/instances/")))
						.status,
			),
		).toBe(404);
		await page.evaluate(() => window.releaseAcknowledgement());
		await expect
			.poll(() => page.evaluate(() => window.acknowledgementConsumed))
			.toBe(true);
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		expect(await page.evaluate(() => window.pickerErrors)).toEqual([]);
		expect(await page.evaluate(() => window.confirmationPolls)).toBe(1);
		await expect(page.locator("#request-error")).toBeHidden();
		await expect(
			page.getByRole("combobox", { name: "Repository", exact: true }),
		).toHaveValue("service");
	});
}

test("a failed acknowledgement is not treated as successful host confirmation", async ({
	page,
}) => {
	await readyModal(page);
	const before = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	let failAcknowledgement = true;
	await page.route("**/instances/*/confirmation", async (route) => {
		if (failAcknowledgement && !route.request().postDataJSON()?.error) {
			failAcknowledgement = false;
			return route.abort();
		}
		await route.continue();
	});
	expect(await confirm()).toMatchObject({ status: "rejected" });
	const after = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(after.revision).toBeGreaterThan(before.revision);
	expect(after.draftRevision).toBe(before.draftRevision);
	await expect(page.locator("#request-error")).toBeVisible();
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).not.toHaveAttribute("readonly", "");
	expect(await confirm()).toMatchObject({ status: "completed" });
});

test("host confirmation settles uncommitted DOM values rather than accepting cached selection", async ({
	page,
}) => {
	await readyModal(page);
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.evaluate((input) => {
		input.value = "not a selected repository";
	});
	expect(await confirm()).toMatchObject({
		status: "rejected",
		message: expect.any(String),
	});
	await expect(repository).toHaveValue("not a selected repository");
	await expect(repository).not.toHaveAttribute("readonly", "");
	await expect(page.locator('[aria-live="polite"]')).toContainText(
		/Choose|confirm/,
	);
	expect(
		(await picker.actions[0].handler({ instanceId })).selection,
	).toBeNull();
});

test("a queued failure prevents stale host acceptance until explicit reload", async ({
	page,
}) => {
	await readyModal(page);
	const release = Promise.withResolvers();
	const held = Promise.withResolvers();
	const writes = [];
	let failWrites = true;
	await page.route("**/instances/*", async (route) => {
		const command = route.request().postDataJSON();
		if (!command || !failWrites) return route.continue();
		writes.push(command);
		held.resolve();
		await release.promise;
		await route.fulfill({ status: 503, body: "Unavailable" });
	});

	try {
		const repository = page.getByRole("combobox", {
			name: "Repository",
			exact: true,
		});
		await repository.fill("hand");
		await held.promise;
		await repository.press("ArrowDown");
		await repository.press("Enter");
		const completion = confirm();
		await expect(repository).toHaveAttribute("readonly", "");
		await expect(repository).toHaveAccessibleDescription(
			"Checking your latest changes...",
		);
		release.resolve();
		expect(await completion).toMatchObject({
			status: "rejected",
			message: expect.stringMatching(/save|Reload/i),
		});
		expect(writes).toHaveLength(1);
		await expect(repository).toHaveValue("handbook");
		// Keep interception active while the next confirmation long poll starts.
		failWrites = false;
		const reload = page.getByRole("button", { name: "Reload picker" });
		await reload.click();
		await expect(repository).toHaveValue("service");
		await expect(reload).toBeHidden();
		expect(await confirm()).toMatchObject({ status: "completed" });
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("host confirmation waits for the latest typed draft and its queued selection", async ({
	page,
}) => {
	await readyModal(page);
	const held = Promise.withResolvers();
	const release = Promise.withResolvers();
	const writes = [];
	await page.route("**/instances/*", async (route) => {
		const command = route.request().postDataJSON();
		if (!command) return route.continue();
		writes.push(command.type);
		if (command.type === "query") {
			held.resolve();
			await release.promise;
		}
		await route.continue();
	});
	try {
		const repository = page.getByRole("combobox", {
			name: "Repository",
			exact: true,
		});
		await repository.fill("hand");
		await held.promise;
		await repository.press("ArrowDown");
		await repository.press("Enter");
		const completion = confirm();
		await expect(repository).toHaveAttribute("readonly", "");
		await expect(repository).toHaveValue("handbook");
		expect(writes).toEqual(["query"]);
		const cached = await picker.actions[0].handler({ instanceId });
		expect(cached.fields.repository.selected.name).toBe("service");
		expect(cached.selection).toBeNull();
		release.resolve();
		expect(await completion).toMatchObject({
			status: "completed",
			value: {
				repository: { id: "org-juniper-project-studio-docs", name: "handbook" },
			},
		});
		expect(writes).toEqual(["query", "choose"]);
		await expect(repository).not.toHaveAttribute("readonly", "");
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("confirmation drains edits made while its notification is in transit", async ({
	page,
}) => {
	await readyModal(page);
	const held = Promise.withResolvers();
	const release = Promise.withResolvers();
	await page.route("**/confirmation?**", async (route) => {
		const response = await route.fetch();
		held.resolve();
		await release.promise;
		await route.fulfill({ response });
	});
	// Replace the already-open long poll so the route owns this notification.
	await page.reload();
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).toHaveValue("service");
	const completion = confirm();
	try {
		await held.promise;
		await choose(page, "Repository", "handbook");
		release.resolve();
		expect(await completion).toMatchObject({
			status: "completed",
			value: { repository: { name: "handbook" } },
		});
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "ignoreErrors" });
	}
});

test("an input event during queue settlement rejects the challenge and preserves the draft", async ({
	page,
}) => {
	await readyModal(page);
	const held = Promise.withResolvers();
	const release = Promise.withResolvers();
	await page.route("**/instances/*", async (route) => {
		if (route.request().method() === "GET") {
			held.resolve();
			await release.promise;
		}
		await route.continue();
	});
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	const completion = confirm();
	try {
		await held.promise;
		await expect(repository).toHaveAttribute("readonly", "");
		await repository.evaluate((input) => {
			input.value = "late input";
			input.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});
		release.resolve();
		expect(await completion).toMatchObject({
			status: "rejected",
			message: expect.stringMatching(/input changed/i),
		});
		await expect(repository).toHaveValue("late input");
		await expect(repository).not.toHaveAttribute("readonly", "");
		expect(
			(await picker.actions[0].handler({ instanceId })).selection,
		).toBeNull();
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("active IME composition cannot confirm an earlier selected identity", async ({
	page,
}) => {
	await readyModal(page);
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.evaluate((input) => {
		input.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		);
		input.value = "composing text";
	});
	expect(await confirm()).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/composing/i),
	});
	await expect(repository).toHaveValue("composing text");
	await expect(repository).not.toHaveAttribute("readonly", "");
	await expect(page.locator('[aria-live="polite"]')).toContainText(
		/Finish composing/,
	);
	expect(
		(await picker.actions[0].handler({ instanceId })).selection,
	).toBeNull();
});

test("closing with a frozen guest retires confirmation without waiting for its acknowledgement", async ({
	page,
}) => {
	await readyModal(page);
	const held = Promise.withResolvers();
	const release = Promise.withResolvers();
	await page.route("**/instances/*/confirmation", async (route) => {
		held.resolve();
		await release.promise;
		await route.continue();
	});
	const completion = confirm();
	try {
		await held.promise;
		await picker.onClose({ instanceId });
		expect(await completion).toMatchObject({
			status: "rejected",
			message: expect.stringMatching(/closed/i),
		});
		release.resolve();
		await expect(
			page.getByRole("combobox", { name: "Repository", exact: true }),
		).not.toHaveAttribute("readonly", "");
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});
test("notification failure stays visible through edits until explicit reload reconnects", async ({
	page,
}) => {
	await readyModal(page);
	let notifications = 0;
	await page.route("**/confirmation?**", async (route) => {
		if (++notifications === 1) return route.abort();
		await route.continue();
	});
	await page.reload();
	const reload = page.getByRole("button", { name: "Reload picker" });
	await expect(reload).toBeVisible();
	await expect(page.locator("#request-error")).toContainText(
		/lost its connection/,
	);
	const repository = page.getByRole("combobox", {
		name: "Repository",
		exact: true,
	});
	await repository.fill("hand");
	await expect(reload).toBeVisible();
	await expect(page.locator("#request-error")).toBeVisible();
	await repository.press("ArrowDown");
	await repository.press("Enter");
	await expect
		.poll(
			async () =>
				(await picker.actions[0].handler({ instanceId })).fields.repository
					.selected?.name,
		)
		.toBe("handbook");
	await expect(page.locator("#request-error")).toContainText(
		/lost its connection/,
	);
	await expect(page.locator("#request-error")).toBeVisible();
	await expect(reload).toBeVisible();
	await expect(repository).toHaveAccessibleDescription(/lost its connection/);
	expect(notifications).toBe(1);
	await reload.click();
	await expect(page.locator("#request-error")).toBeHidden();
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "handbook" } },
	});
});

test.afterEach(async () => {
	await dispose?.();
	dispose = undefined;
	setHost(undefined);
	globalThis.fetch = requestFetch;
});

test("flat hover, arrows and row clicks keep one active row and search focus", async ({
	page,
}) => {
	await page.setViewportSize({ width: 480, height: 320 });
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization }) =>
				["one", "two", "three"].map((id) => ({
					id,
					name: id,
					organization,
					project: { id: "studio", name: "Long project name ".repeat(5) },
					repository: { id, name: id },
				})),
		}),
		"host",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await expect(search).toBeFocused();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
	await expect(search).toHaveAttribute(
		"placeholder",
		"Search or type org/project/repo, or paste a URL\u2026",
	);
	await expect(search).toHaveAttribute("aria-required", "false");
	await expect(search).toHaveCSS("padding-top", "0px");
	const rows = page.getByRole("option");
	await expect(rows).toHaveCount(3);
	const list = page.getByRole("listbox", {
		name: "Repositories",
		exact: true,
	});
	const platform =
		process.platform === "darwin"
			? "macos"
			: process.platform === "win32"
				? "windows"
				: "linux";
	await expect(page.locator("html")).toHaveAttribute("data-platform", platform);
	if (platform !== "macos") {
		expect(
			await list.evaluate(
				(node) => getComputedStyle(node, "::-webkit-scrollbar").width,
			),
		).toBe("8px");
		expect(
			await list.evaluate(
				(node) =>
					getComputedStyle(node, "::-webkit-scrollbar-thumb").borderRadius,
			),
		).toBe("999px");
	}
	await expect(list).toHaveAttribute("data-keyboard-active", "true");
	expect(
		await rows
			.first()
			.evaluate((row) => getComputedStyle(row, "::after").content),
	).toBe('""');
	expect(
		await iconGeometry(rows.first().locator(".repository-icon svg")),
	).toEqual({
		strokeWidth: "2",
		paths: [
			"M18 19a5 5 0 0 1-5-5v8",
			"M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5",
		],
		circles: [
			["13", "12", "2"],
			["20", "19", "2"],
		],
		lines: [],
	});
	await expect(rows.first().locator(".repository-icon svg")).toHaveAttribute(
		"width",
		"16",
	);
	const hovered = rows.nth(1);
	const next = rows.nth(2);
	const hoveredId = await hovered.getAttribute("id");
	const nextId = await next.getAttribute("id");
	const tooltip = page.locator(".repository-path-tooltip");
	const rowBounds = await hovered.boundingBox();
	await search.click();
	await expect(list).toHaveAttribute("data-keyboard-active", "false");
	await hovered.hover();
	await expect(search).toHaveAttribute("aria-activedescendant", hoveredId);
	await expect(tooltip).toHaveText(
		await hovered.locator(".repository-name").innerText(),
	);
	await tooltip.hover();
	await expect(tooltip).toBeVisible();
	expect(await hovered.boundingBox()).toEqual(rowBounds);
	const tooltipBounds = await tooltip.boundingBox();
	if (!tooltipBounds) throw new Error("Expected a visible repository tooltip");
	const pointer = { x: tooltipBounds.x + 25, y: tooltipBounds.y + 10 };
	await page.mouse.move(pointer.x, pointer.y);
	await page.keyboard.press("ArrowDown");
	await expect(list).toHaveAttribute("data-keyboard-active", "true");
	await expect(search).toHaveAttribute("aria-activedescendant", nextId);
	await expect(tooltip).toHaveText(
		await next.locator(".repository-name").innerText(),
	);
	await expect(tooltip).toBeVisible();
	await page.evaluate(() => {
		window.addEventListener("keydown", (event) => {
			if (event.key === "Escape")
				window.escapeReachedHost = !event.defaultPrevented;
		});
	});
	await page.keyboard.press("Escape");
	await expect(tooltip).toBeHidden();
	expect(await page.evaluate(() => window.escapeReachedHost)).toBe(false);
	// Dismissing the overlay can expose a row under the stationary pointer.
	await hovered.evaluate(
		(row, position) =>
			row.dispatchEvent(
				new PointerEvent("pointerenter", {
					clientX: position.x,
					clientY: position.y,
				}),
			),
		pointer,
	);
	await expect(tooltip).toBeHidden();
	await expect(search).toHaveAttribute("aria-activedescendant", nextId);
	await page.keyboard.press("Escape");
	expect(await page.evaluate(() => window.escapeReachedHost)).toBe(true);
	await expect.soft(search).toHaveCSS("outline-style", "none");
	await expect(next).toHaveCSS("outline-style", "none");
	const activeTreatment = await next.evaluate((row) => {
		const hint = row.querySelector(".return-hint");
		const hintIcon = hint?.querySelector("svg");
		const rail = getComputedStyle(row, "::after");
		return {
			background: getComputedStyle(row).backgroundColor,
			hintAriaHidden: hint?.getAttribute("aria-hidden"),
			hintPaths: hintIcon
				? [...hintIcon.querySelectorAll("path")].map((path) =>
						path.getAttribute("d"),
					)
				: [],
			hintOpacity: hint ? getComputedStyle(hint).opacity : null,
			hintWidth: hintIcon?.getAttribute("width"),
			railContent: rail.content,
			railLeft: rail.left,
			railRadius: rail.borderRadius,
			railWidth: rail.width,
		};
	});
	expect(activeTreatment).toMatchObject({
		hintAriaHidden: "true",
		hintPaths: ["m15 10 5 5-5 5", "M4 4v7a4 4 0 0 0 4 4h12"],
		hintOpacity: "1",
		hintWidth: "14",
		railContent: '""',
		railLeft: "-6px",
		railRadius: "4px",
		railWidth: "4px",
	});
	expect(activeTreatment.background).not.toBe("rgba(0, 0, 0, 0)");
	await expect(hovered).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(next).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await hovered.hover({ position: { x: 25, y: 10 } });
	await expect(search).toHaveAttribute("aria-activedescendant", hoveredId);
	await expect(tooltip).toHaveText(
		await hovered.locator(".repository-name").innerText(),
	);
	await expect(page.getByRole("option", { selected: true })).toHaveCount(0);

	await page.keyboard.press("Tab");
	await expect(search).not.toBeFocused();
	await expect(list).toHaveAttribute("data-keyboard-active", "false");
	await expect(tooltip).toBeHidden();
	await expect(search).toHaveCSS("outline-style", "none");
	await expect(hovered).toHaveCSS("outline-style", "none");
	await hovered.click();
	await expect(hovered).toHaveAttribute("aria-selected", "false");
	await expect(page.getByText("\u2713", { exact: true })).toHaveCount(0);
	await expect(page.locator('[aria-live="polite"]')).not.toContainText(
		"Repository selected",
	);
	await expect(search).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(search).toHaveAttribute("aria-activedescendant", nextId);
	await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
	await expect(hovered).toHaveAttribute("aria-selected", "false");
	await search.fill("no-matching-repository");
	await expect(rows).toHaveCount(0);
	await expect(tooltip).toBeHidden();
	await expect.soft(search).toHaveCSS("outline-style", "none");
	await search.fill("");
	await page.addStyleTag({
		content:
			":root { --border-color-muted: #888; --text-color-default: #111; }",
	});
	const divider = await search.evaluate((input) => {
		input.blur();
		return getComputedStyle(input).borderBottomColor;
	});
	await search.focus();
	await expect(search).toHaveCSS("border-bottom-color", divider);
});

test("flat keyboard wrap activates without an intermediate selection state", async ({
	page,
}) => {
	await page.setViewportSize({ width: 480, height: 320 });
	const loaded = Promise.withResolvers();
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization }) => {
				await loaded.promise;
				return Array.from({ length: 20 }, (_, index) => ({
					id: `repo${index}`,
					organization,
					project: { id: "studio", name: "Studio" },
					repository: { id: `repo${index}`, name: `repo${index}` },
				}));
			},
		}),
		"host",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await page.addStyleTag({
		content:
			":root { --border-color-muted: #888; --text-color-default: #111; }",
	});
	await expect(page.locator("#repository-search-hint")).toHaveText(
		"Searching repositories...",
	);
	await search.evaluate((input) => input.blur());
	const divider = await search.evaluate(
		(input) => getComputedStyle(input).borderBottomColor,
	);
	await search.focus();
	await expect.soft(search).toHaveCSS("border-bottom-color", divider);
	loaded.resolve();
	const rows = page.getByRole("option");
	await expect(rows).toHaveCount(20);
	const first = await rows.first().boundingBox();
	const x = first.x + 25;
	const y = first.y + first.height / 2;
	await page.mouse.move(x, y);
	await expect(search).toHaveAttribute(
		"aria-activedescendant",
		await rows.first().getAttribute("id"),
	);
	await page.keyboard.press("End");
	await expect(search).toHaveAttribute(
		"aria-activedescendant",
		await rows.last().getAttribute("id"),
	);
	await page.keyboard.press("Home");
	await expect(search).toHaveAttribute(
		"aria-activedescendant",
		await rows.first().getAttribute("id"),
	);
	await page.keyboard.press("ArrowUp");
	await page.mouse.move(x, y);
	await expect(search).toHaveAttribute(
		"aria-activedescendant",
		await rows.last().getAttribute("id"),
	);
	await page.keyboard.press("Enter");
	await expect(rows.last()).toHaveAttribute("aria-selected", "false");
	await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
	await expect(page.getByText("\u2713", { exact: true })).toHaveCount(0);
	await page.mouse.move(x + 4, y);
	await expect(search).not.toHaveAttribute(
		"aria-activedescendant",
		await rows.last().getAttribute("id"),
	);
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "repo19" } },
	});
});

test("flat search limits to 100, matches partial org/project paths, and filters cached catalogs without paging", async ({
	page,
}) => {
	const reads = [];
	const source = catalog({
		listOrganizationRepositories: async ({ organization }) => {
			reads.push(organization.id);
			return Array.from({ length: 150 }, (_, index) => {
				const id = `${organization.id}/studio/service${index}`;
				return {
					id,
					name: `${organization.name}/Studio/service${index}`,
					organization,
					project: { id: `${organization.id}/studio`, name: "Studio" },
					repository: { id, name: `service${index}` },
				};
			});
		},
	});
	await open(page, source, "host");
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await expect(page.getByRole("option")).toHaveCount(100);
	expect(reads).toEqual(["org-juniper"]);
	await page.evaluate(() => {
		window.escapeReachedHost = false;
		window.addEventListener("keydown", (event) => {
			if (event.key === "Escape")
				window.escapeReachedHost = !event.defaultPrevented;
		});
	});
	await search.press("Escape");
	expect(await page.evaluate(() => window.escapeReachedHost)).toBe(true);
	await page.setViewportSize({ width: 320, height: 480 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
		320,
	);
	const firstRow = await page.getByRole("option").first().boundingBox();
	expect(firstRow.x).toBeGreaterThanOrEqual(0);
	expect(firstRow.x + firstRow.width).toBeLessThanOrEqual(320);
	await search.fill("JUN/STU/service99");
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(page.getByRole("option")).toHaveText(
		"Juniper example/Studio/service99",
	);
	await search.press("Enter");
	await expect
		.poll(() =>
			reports.filter(
				(report) => report.action === "choose" && report.phase === "finished",
			),
		)
		.toEqual([
			expect.objectContaining({ result: "success", stage: "repository" }),
		]);
	const hint = await picker.actions
		.find((entry) => entry.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(hint.ready).toBe(true);
	await expect(page.getByRole("option")).toHaveAttribute(
		"aria-selected",
		"false",
	);
	await expect(page.getByText("\u2713", { exact: true })).toHaveCount(0);
	await search.fill("har/stu");
	await expect(page.getByRole("option")).toHaveCount(100);
	expect(reads).toEqual(["org-juniper", "org-juniper", "org-harbor"]);
	await search.fill("jun/stu");
	await expect(page.getByRole("option")).toHaveCount(100);
	expect(reads).toHaveLength(3);
	const list = page.getByRole("listbox", { name: "Repositories", exact: true });
	await list.evaluate((node) => {
		node.scrollTop = node.scrollHeight;
	});
	await expect(page.getByRole("option")).toHaveCount(100);
	await search.fill("jun/stu/service149");
	await expect(page.locator("#repository-search-hint")).toHaveText(
		"1 repositories available.",
	);
	await expect(page.getByRole("option")).toHaveText(
		"Juniper example/Studio/service149",
	);
	expect(reads).toHaveLength(3);
	await search.fill("jun/stu/service99");
	await expect(page.getByRole("option")).toHaveCount(1);
	expect(reads).toHaveLength(3);
	await search.press("Enter");
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "service99" }, project: { name: "Studio" } },
	});
});

test("flat confirmation rejects an uncommitted search draft instead of confirming the old repository", async ({
	page,
}) => {
	const source = catalog({
		listOrganizationRepositories: async ({ organization }) => [
			{
				id: `${organization.id}/studio/service`,
				name: `${organization.name}/Studio/service`,
				organization,
				project: { id: `${organization.id}/studio`, name: "Studio" },
				repository: {
					id: `${organization.id}/studio/service`,
					name: "service",
				},
			},
		],
	});
	await open(page, source, "host");
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await page
		.getByRole("option", {
			name: "Juniper example/Studio/service",
			exact: true,
		})
		.click();
	await search.evaluate((input) => {
		input.value = "different search";
	});
	expect(await confirm()).toMatchObject({
		status: "rejected",
		message: expect.stringMatching(/current search/),
	});
	await expect(search).toHaveValue("different search");
	await expect(search).not.toHaveAttribute("readonly", "");
});

test("complete paths include exact and sibling repositories with valid disabled and ready dialog states", async ({
	page,
}) => {
	let lookups = 0;
	const source = catalog({
		listProjects: async () => [{ id: "outside", name: "Outside" }],
		listOrganizationRepositories: async ({ organization, project }) =>
			Array.from({ length: 150 }, (_, index) => {
				const projectName = project?.name ?? "Studio";
				const repositoryName =
					index === 0
						? "target.skills"
						: index === 149
							? "target"
							: `service${index}`;
				const id =
					repositoryName === "target"
						? `${organization.id}/outside/target`
						: `${organization.id}/${projectName}/${repositoryName}`;
				return {
					id,
					name: `${organization.name}/${projectName}/${repositoryName}`,
					organization,
					project: {
						id: `${organization.id}/${projectName}`,
						name: projectName,
					},
					repository: { id, name: repositoryName },
				};
			}),
		findRepository: async ({ organization }) => {
			lookups += 1;
			const id = `${organization.id}/outside/target`;
			return {
				id,
				name: `${organization.name}/Outside/target`,
				organization,
				project: { id: `${organization.id}/outside`, name: "Outside" },
				repository: { id, name: "target" },
			};
		},
	});
	await open(page, source, "host");
	await expect(page.getByRole("option")).toHaveCount(100);
	const hint = () =>
		picker.actions
			.find((entry) => entry.name === "dialog-state")
			.handler({ instanceId, input: { afterRevision: null } });
	const disabled = await hint();
	expect(disabled.ready).toBe(false);
	expect(typeof disabled.disabledReason).toBe("string");
	expect(Object.keys(disabled).sort()).toEqual([
		"disabledReason",
		"draftRevision",
		"ready",
		"revision",
	]);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.fill("Juniper example/Outside/target");
	await expect(page.getByRole("option")).toHaveCount(2);
	await expect(page.getByRole("option")).toHaveText([
		"Juniper example/Outside/target",
		"Juniper example/Outside/target.skills",
	]);
	await expect(page.locator("#quick-fill-error")).toHaveText("");
	await page
		.getByRole("option", {
			name: "Juniper example/Outside/target.skills",
			exact: true,
		})
		.click();
	expect(await hint()).toMatchObject({ ready: true, disabledReason: null });
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: {
			repository: { name: "target.skills" },
			project: { name: "Outside" },
		},
	});
	expect(lookups).toBe(1);
});

test("project search limits late matches, preserves API order and shows a non-selectable truncation note", async ({
	page,
}) => {
	let reads = 0;
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization, project }) => {
				reads += 1;
				return Array.from({ length: 1250 }, (_, index) => {
					const name =
						index < 1100 ? `unrelated${index}` : `match${1250 - index}`;
					const id = `${organization.id}/studio/${index}`;
					return {
						id,
						name: `${organization.name}/Studio/${name}`,
						organization,
						project: project ?? { id: "project-studio", name: "Studio" },
						repository: { id, name },
					};
				});
			},
		}),
		"host",
	);
	await expect(page.getByRole("option")).toHaveCount(100);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.fill("Juniper example/Studio/match");
	await expect(page.getByRole("option")).toHaveCount(100);
	await expect(page.getByRole("option").first()).toHaveText(
		"Juniper example/Studio/match150",
	);
	await expect(page.getByRole("option").last()).toHaveText(
		"Juniper example/Studio/match51",
	);
	const note = page.locator("#repository-search-hint");
	await expect(note).toContainText(
		"Only the first 100 matching repositories are shown",
	);
	await expect(note).toBeInViewport({ ratio: 1 });
	const [noteBounds, listBounds] = await Promise.all([
		note.boundingBox(),
		page
			.getByRole("listbox", { name: "Repositories", exact: true })
			.boundingBox(),
	]);
	expect(noteBounds.y).toBeGreaterThanOrEqual(listBounds.y + listBounds.height);
	await expect(note).not.toHaveAttribute("role", "option");
	await expect(note).not.toHaveAttribute("tabindex");
	const hint = () =>
		picker.actions
			.find((entry) => entry.name === "dialog-state")
			.handler({ instanceId, input: { afterRevision: null } });
	expect((await hint()).ready).toBe(false);
	await search.fill("Juniper example/Studio/match150");
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(note).toHaveText("1 repositories available.");
	expect(reads).toBe(2);
	await search.press("ArrowDown");
	await search.press("Enter");
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "match150" } },
	});
});

test("flat selection can submit a URL for another repository and another project", async ({
	page,
}) => {
	const source = catalog({
		listOrganizationRepositories: async ({ organization }) => [
			{
				id: `${organization.id}-project-studio-service`,
				name: `${organization.name}/Studio/service`,
				organization,
				project: { id: "project-studio", name: "Studio" },
				repository: {
					id: `${organization.id}-project-studio-service`,
					name: "service",
				},
			},
		],
	});
	await open(page, source, "host");
	await page
		.getByRole("option", {
			name: "Juniper example/Studio/service",
			exact: true,
		})
		.click();
	for (const project of ["Studio", "Flight"]) {
		const url = `https://dev.azure.com/Juniper%20example/${project}/_git/handbook`;
		await pasteQuickFill(page, url);
		await expect(page.locator("#quick-fill-error")).toHaveText("");
		await expect(
			page.getByRole("option", {
				name: `Juniper example/${project}/handbook`,
				exact: true,
			}),
		).toBeVisible();
		expect((await readPickerState()).repositoryUrl).toBeUndefined();
		expect((await readPickerState()).urlSelection).toBeNull();
		await page
			.getByRole("option", {
				name: `Juniper example/${project}/handbook`,
				exact: true,
			})
			.click();
	}
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { project: { name: "Flight" }, repository: { name: "handbook" } },
	});
});

for (const url of [
	"https://dev.azure.com/juniper-example/Studio/_git/handbook",
	"https://juniper-example.visualstudio.com/Studio/_git/handbook",
	"https://juniper-example.visualstudio.com/DefaultCollection/Studio/_git/handbook",
	"https://juniper-example.visualstudio.com/DefaultCollection/Studio/_git/_optimized/handbook",
	"https://juniper-example.visualstudio.com/Studio/_git/_optimized/handbook",
	"https://dev.azure.com/juniper-example/Studio/_git/_optimized/handbook",
]) {
	test(`flat search accepts a pasted repository URL through existing quick fill: ${url}`, async ({
		page,
	}) => {
		await open(
			page,
			catalog({
				listOrganizations: async () => [
					{ id: "org-juniper", name: "juniper-example" },
				],
				listOrganizationRepositories: async () => [],
			}),
			"host",
		);
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		await expect(search).toHaveAttribute(
			"placeholder",
			"Search or type org/project/repo, or paste a URL\u2026",
		);
		await expect(
			page.getByRole("textbox", { name: "URL (quick fill)" }),
		).toHaveCount(0);
		await expect(page.locator("input:visible")).toHaveCount(1);
		await pasteQuickFill(page, url);
		await expect
			.poll(
				async () =>
					(
						await picker.actions
							.find((entry) => entry.name === "dialog-state")
							.handler({ instanceId, input: { afterRevision: null } })
					).ready,
			)
			.toBe(false);
		await expect(search).toHaveValue(url);
		await expect(page.locator("#quick-fill-error")).toBeHidden();
		const result = page.getByRole("option", {
			name: "juniper-example/Studio/handbook",
			exact: true,
		});
		await expect(result).toBeVisible();
		await result.click();
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: { project: { name: "Studio" }, repository: { name: "handbook" } },
		});
	});
}

for (const paste of [false, true]) {
	test(`long navigation URLs confirm through the unified input (paste=${paste})`, async ({
		page,
	}) => {
		await open(
			page,
			catalog({
				listOrganizationRepositories: async () => [],
			}),
			"host",
		);
		const prefix =
			"https://dev.azure.com/Juniper%20example/Studio/_git/service?path=";
		const url = prefix + "a".repeat(4096 - prefix.length);
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		if (paste) await pasteQuickFill(page, url);
		else {
			await search.fill(url);
			await search.press("Enter");
		}
		await expect
			.poll(
				async () =>
					(
						await picker.actions
							.find((entry) => entry.name === "dialog-state")
							.handler({ instanceId, input: { afterRevision: null } })
					).ready,
			)
			.toBe(false);
		await expect(search).toHaveValue(url);
		const result = page.getByRole("option", {
			name: "Juniper example/Studio/service",
			exact: true,
		});
		await expect(result).toBeVisible();
		await result.click();
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: { project: { name: "Studio" }, repository: { name: "service" } },
		});
	});
}

for (const projectOnly of [false, true]) {
	test(`partial URLs expose selectable scoped flat results (projectOnly=${projectOnly})`, async ({
		page,
	}) => {
		await open(
			page,
			catalog({
				listOrganizationRepositories: async ({ organization, project }) =>
					(project
						? [project]
						: [
								{ id: "project-studio", name: "Studio" },
								{ id: "project-flight", name: "Flight" },
							]
					).map((parent) => {
						const repository = {
							id: `${organization.id}/${parent.id}/service`,
							name: "service",
						};
						return {
							id: repository.id,
							name: `${organization.name}/${parent.name}/service`,
							organization,
							project: parent,
							repository,
						};
					}),
			}),
			"host",
		);
		await page
			.getByRole("option", {
				name: "Juniper example/Studio/service",
				exact: true,
			})
			.click();
		await pasteQuickFill(
			page,
			`https://dev.azure.com/Juniper%20example${projectOnly ? "/Flight" : ""}`,
		);
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		await expect(search).toHaveValue(
			projectOnly ? "Juniper example/Flight/" : "Juniper example/",
		);
		await expect(page.getByRole("option")).toHaveCount(projectOnly ? 1 : 2);
		const selected = projectOnly ? "Flight" : "Studio";
		await page
			.getByRole("option", {
				name: `Juniper example/${selected}/service`,
				exact: true,
			})
			.click();
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: { project: { name: selected }, repository: { name: "service" } },
		});
	});
}

test("nonempty capped organization results retain visible discovery-scope guidance", async ({
	page,
}) => {
	let reads = 0;
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization }) => {
				reads++;
				return Array.from({ length: 150 }, (_, index) => {
					const repository = {
						id: `${organization.id}/studio/service${index}`,
						name: `service${index}`,
					};
					return {
						id: repository.id,
						name: `${organization.name}/Studio/${repository.name}`,
						organization,
						project: { id: "project-studio", name: "Studio" },
						repository,
					};
				});
			},
		}),
		"host",
	);
	await expect(page.getByRole("option")).toHaveCount(100);
	const hint = page.locator("#repository-search-hint");
	await expect(hint).toHaveText(
		"Results are limited. Specify 'org/project/repo' or a URL to find exact matches.",
	);
	await expect(hint).toBeInViewport({ ratio: 1 });
	await page
		.getByRole("combobox", { name: flatSearchPrompt, exact: true })
		.fill("service99");
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(hint).toHaveText(
		"Results are limited. Specify 'org/project/repo' or a URL to find exact matches.",
	);
	await expect(hint).toBeInViewport({ ratio: 1 });
	expect(reads).toBe(1);
});

test("unclassified native token failures offer generic retry without unavailable authorization", async ({
	page,
}) => {
	let repaired = false;
	let tokens = 0;
	mockAdoFetch(async (url) => {
		if (url.includes("/profiles/me"))
			return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
		if (url.includes("/accounts"))
			return Response.json({
				count: 1,
				value: [
					{
						accountId: "820f6651-2635-4e59-9121-0dedade21f89",
						accountName: "juniper",
					},
				],
			});
		return Response.json({ count: 0, value: [] });
	});
	await open(page, undefined, "host", {
		listAccounts: async () => [{ id: "opaque-account", name: "Ada Example" }],
		getAccessToken: async () => {
			if (++tokens >= 3 && !repaired)
				throw new Error("private uncategorized failure");
			return { accessToken: "fixture-token" };
		},
	});
	await expect(page.locator("#repository-search-hint")).toHaveText(
		"Could not load repositories. Retry the list.",
	);
	const state = await picker.actions
		.find((entry) => entry.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(state.accountAuthorization).toBeUndefined();
	await expect(
		page.getByRole("link", { name: "Open Account settings" }),
	).toBeHidden();
	repaired = true;
	await page
		.getByRole("button", { name: "Retry repositories", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Retry repositories", exact: true }),
	).toBeHidden();
	await expect(page.locator("#repository-search-hint")).not.toContainText(
		"authorization",
	);
});

test("flat full URL typing resolves one selectable repository result without discovery", async ({
	page,
}) => {
	let projectReads = 0;
	let repositoryReads = 0;
	let flatReads = 0;
	let urlReads = 0;
	await open(
		page,
		catalog({
			listProjects: async () => {
				projectReads += 1;
				return [{ id: "project-studio", name: "Studio" }];
			},
			listRepositories: async () => {
				repositoryReads += 1;
				return [{ id: "repository-handbook", name: "handbook" }];
			},
			listOrganizationRepositories: async () => {
				flatReads += 1;
				return [];
			},
			resolveRepositoryUrl: async () => {
				urlReads++;
				return {
					organization: { id: "org-juniper", name: "Juniper example" },
					project: { id: "project-studio", name: "Studio" },
					repository: { id: "repository-handbook", name: "handbook" },
				};
			},
		}),
		"host",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Results are limited",
	);
	await search.fill(
		"https://dev.azure.com/Juniper%20example/Studio/_git/handbook",
	);
	expect(projectReads).toBe(0);
	expect(repositoryReads).toBe(0);
	expect(flatReads).toBe(1);
	const result = page.getByRole("option", {
		name: "Juniper example/Studio/handbook",
		exact: true,
	});
	await expect(result).toBeVisible();
	await expect
		.poll(
			async () =>
				(
					await picker.actions
						.find((entry) => entry.name === "dialog-state")
						.handler({ instanceId, input: { afterRevision: null } })
				).ready,
		)
		.toBe(false);
	expect(projectReads).toBe(0);
	expect(repositoryReads).toBe(0);
	expect(urlReads).toBe(1);
	expect(flatReads).toBe(1);
	await search.press("ArrowDown");
	await search.press("Enter");
	await expect
		.poll(async () => (await readPickerState()).fields.repository.selected)
		.toMatchObject({ name: "handbook" });
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "handbook" } },
	});
	expect(urlReads).toBe(1);
});

test("normal flat search cancels a pending URL lookup and ignores its late result", async ({
	page,
}) => {
	const started = Promise.withResolvers();
	const held = Promise.withResolvers();
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization }) => {
				const id = `${organization.id}/studio/service`;
				return [
					{
						id,
						name: `${organization.name}/Studio/service`,
						organization,
						project: { id: "project-studio", name: "Studio" },
						repository: { id, name: "service" },
					},
				];
			},
			listProjects: async () => {
				started.resolve();
				return held.promise;
			},
		}),
		"host",
	);
	await expect(page.getByRole("option")).toHaveCount(1);
	await pasteQuickFill(page, "https://dev.azure.com/Juniper%20example/Studio");
	await started.promise;
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.fill("service");
	await expect(page.getByRole("option")).toHaveText(
		"Juniper example/Studio/service",
	);
	held.resolve([{ id: "project-studio", name: "Studio" }]);
	await search.press("Enter");
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "service" } },
	});
	await expect(search).toHaveValue("service");
	await expect(page.locator("#quick-fill-error")).toBeHidden();
});

test("invalid flat URLs show a visible associated error and recover through normal search", async ({
	page,
}) => {
	let flatReads = 0;
	await open(
		page,
		catalog({
			listOrganizationRepositories: async ({ organization }) => {
				flatReads += 1;
				const id = `${organization.id}/studio/service`;
				return [
					{
						id,
						name: `${organization.name}/Studio/service`,
						organization,
						project: { id: "project-studio", name: "Studio" },
						repository: { id, name: "service" },
					},
				];
			},
		}),
		"host",
	);
	await expect(page.getByRole("option")).toHaveCount(1);
	await page.getByRole("option").click();
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await pasteQuickFill(page, "https://example.invalid/Studio/_git/handbook");
	await expect(page.locator("#quick-fill-error")).toBeVisible();
	await expect(search).toHaveAccessibleDescription(
		/Paste a valid Azure DevOps repository URL/,
	);
	await expect(search).toHaveAttribute("aria-invalid", "true");
	await expect(
		page.getByRole("button", { name: "Retry repositories", exact: true }),
	).toBeHidden();
	await expect
		.poll(
			async () =>
				(
					await picker.actions
						.find((entry) => entry.name === "dialog-state")
						.handler({ instanceId, input: { afterRevision: null } })
				).ready,
		)
		.toBe(false);
	expect(flatReads).toBe(1);
	await search.fill("service");
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(page.locator("#quick-fill-error")).toBeHidden();
	await expect(search).toHaveAttribute("aria-invalid", "false");
	expect(flatReads).toBe(1);
	await search.press("Enter");
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repository: { name: "service" } },
	});
});

test("an empty organization catalog does not claim a limited search was performed", async ({
	page,
}) => {
	let repositoryReads = 0;
	await open(
		page,
		catalog({
			listOrganizations: async () => [],
			listOrganizationRepositories: async () => {
				repositoryReads += 1;
				return [];
			},
		}),
		"host",
	);
	await expect(page.locator("#repository-search-hint")).toHaveText(
		"No matching repositories. Try a different search.",
	);
	expect(repositoryReads).toBe(0);
});

for (const [query, limited] of [
	["", true],
	["missing", true],
	["jun/", true],
	["Juniper example/Studio", true],
	["Juniper example/Studio/", true],
	["Juniper example/Studio/   ", true],
	["Juniper example/Studio/missing", false],
]) {
	test(`empty flat search explains the scope for ${JSON.stringify(query)} without offering Retry`, async ({
		page,
	}) => {
		await open(
			page,
			catalog({ listOrganizationRepositories: async () => [] }),
			"host",
		);
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		await search.fill(query);
		const scopeMessage = limited
			? "Results are limited. Specify 'org/project/repo' or a URL to find exact matches."
			: "No matching repositories. Try a different search.";
		await expect(page.locator("#repository-search-hint")).toHaveText(
			scopeMessage,
		);
		await expect(page.locator("#repository-search-hint")).toBeInViewport({
			ratio: 1,
		});
		await expect(search).toHaveAccessibleDescription(scopeMessage);
		await expect(
			page.getByRole("button", { name: "Retry repositories", exact: true }),
		).toBeHidden();
		await expect(search).toBeEditable();
	});
}

test("flat discovery exposes a retryable error and reports the actual retry outcome", async ({
	page,
}) => {
	let reads = 0;
	const source = catalog({
		listOrganizationRepositories: async ({ organization }) => {
			if (++reads <= 2) throw new Error("Fixture discovery failed");
			const id = `${organization.id}/studio/service`;
			return [
				{
					id,
					name: `${organization.name}/Studio/service`,
					organization,
					project: { id: `${organization.id}/studio`, name: "Studio" },
					repository: { id, name: "service" },
				},
			];
		},
	});
	await open(page, source, "host");
	const retry = page.getByRole("button", {
		name: "Retry repositories",
		exact: true,
	});
	await expect(retry).toBeVisible();
	await expect(page.locator("#repository-search-hint")).toHaveText(
		"Could not load repositories. Retry the list.",
	);
	await expect(page.locator("#repository-search-hint")).toBeVisible();
	await retry.click();
	await expect
		.poll(
			() =>
				reports.filter(
					(report) => report.action === "retry" && report.phase === "finished",
				).length,
		)
		.toBe(1);
	expect(
		reports.find(
			(report) => report.action === "retry" && report.phase === "finished",
		),
	).toMatchObject({ result: "failure", stage: "repository" });
	await retry.click();
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(retry).toBeHidden();
	await expect
		.poll(
			() =>
				reports.filter(
					(report) => report.action === "retry" && report.phase === "finished",
				).length,
		)
		.toBe(2);
	expect(
		reports.filter(
			(report) => report.action === "retry" && report.phase === "finished",
		)[1],
	).toMatchObject({ result: "success", stage: "repository" });
});

test("native account discovery reaches a ready repository without exposing credentials", async ({
	page,
}) => {
	const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
	const projectId = "20df9a20-bf49-4ccf-b355-a75bc89cf728";
	const repositoryId = "72fb8993-569d-4b27-9dde-6325437726a4";
	const tokenRequests = [];
	const requestFetch = globalThis.fetch;
	const responses = [
		{ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" },
		{
			count: 1,
			value: [{ accountId: organizationId, accountName: "juniper-example" }],
		},
		{
			count: 1,
			value: [
				{
					id: repositoryId,
					name: "service",
					project: { id: projectId, name: "Studio" },
					defaultBranch: "refs/heads/trunk",
				},
			],
		},
	];
	globalThis.fetch = async (url, init) => {
		if (!String(url).startsWith("https://")) return requestFetch(url, init);
		expect(init.headers.Authorization).toBe("Bearer fixture-token");
		return Response.json(responses.shift());
	};
	try {
		const url = await open(page, undefined, "host", {
			listAccounts: async (input) => {
				expect(input).toEqual({ resource: "azure-devops" });
				return [{ id: "tenant:user", name: "Ada Example" }];
			},
			getAccessToken: async (input) => {
				tokenRequests.push(input);
				return { accessToken: "fixture-token" };
			},
		});
		await expect(
			page.getByRole("combobox", { name: flatSearchPrompt, exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		await expect(
			page.getByRole("combobox", { name: "Microsoft account", exact: true }),
		).toHaveCount(0);
		await page
			.getByRole("option", {
				name: "juniper-example/Studio/service",
				exact: true,
			})
			.click();
		await expect(page.getByText("trunk", { exact: true })).toBeHidden();
		await expect(
			page.getByText("Studio project purpose", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText("Selected from the list.", { exact: true }),
		).toHaveCount(0);
		const hint = await picker.actions
			.find((entry) => entry.name === "dialog-state")
			.handler({ instanceId, input: { afterRevision: null } });
		expect(hint).toMatchObject({ ready: true, disabledReason: null });
		expect(tokenRequests).toEqual(
			Array.from({ length: 3 }, () => ({
				accountId: "tenant:user",
				resource: "azure-devops",
			})),
		);
		const state = await (
			await requestFetch(url.replace("/canvases/", "/instances/"))
		).json();
		expect(state.selection).toBeNull();
		expect(JSON.stringify(state)).not.toMatch(/token|authorization|bearer/i);
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: {
				accountId: "tenant:user",
				authority: "https://dev.azure.com/juniper-example",
				repositoryId,
				cloneUrl: `https://dev.azure.com/juniper-example/${projectId}/_git/${repositoryId}`,
				displayName: "service",
			},
		});
	} finally {
		globalThis.fetch = requestFetch;
	}
});

test("a standalone empty account list offers settings and retries into an automatically selected account", async ({
	page,
}) => {
	let reads = 0;
	const accounts = Promise.withResolvers();
	await page.setViewportSize({ width: 640, height: 480 });
	await open(page, undefined, "guest", {
		listAccounts: async () => (++reads === 1 ? [] : accounts.promise),
		getAccessToken: async () => {
			throw Object.assign(new Error("Fixture credential unavailable"), {
				code: "auth_required",
			});
		},
	});
	await expect(
		page.getByRole("heading", { name: "Add a Microsoft account", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("combobox")).toHaveCount(0);
	await expect(
		page.getByRole("textbox", { name: "URL (quick fill)" }),
	).toHaveCount(0);
	const settings = page.getByRole("link", {
		name: "Open Account settings",
		exact: true,
	});
	const originalSettingsLink = await settings.elementHandle();
	await expect(settings).toHaveAttribute("href", "ghapp://settings/account");
	expect(
		await settings.evaluate(
			(element) => element.getBoundingClientRect().height,
		),
	).toBe(32);
	await settings.focus();
	await page.keyboard.press("Tab");
	const retry = page.getByRole("button", { name: "check again", exact: true });
	await expect(page.locator("p").filter({ has: retry })).toHaveText(
		"After adding your account, close Settings and check again.",
	);
	await expect(retry).toBeFocused();
	await retry.press("Enter");
	await expect(retry).toHaveAttribute("aria-disabled", "true");
	await expect(retry).toBeFocused();
	await retry.press("Enter");
	expect(reads).toBe(2);
	accounts.resolve([{ id: "native-account", name: "Ada Example" }]);
	const organization = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await expect(organization).toBeVisible();
	await expect(organization).toBeFocused();
	await expect(
		page.getByRole("textbox", { name: "URL (quick fill)" }),
	).toHaveCount(0);
	await expect(page.getByRole("combobox")).toHaveCount(1);
	await expect(
		page.getByRole("combobox", { name: "Microsoft account", exact: true }),
	).toHaveCount(0);
	expect(reads).toBe(2);
	await expect(settings).toBeVisible();
	expect(await originalSettingsLink.isVisible()).toBe(true);
	await expect(settings).toHaveAccessibleDescription(
		"Microsoft account: Ada Example.",
	);
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Update authorization",
	);
});

test("standalone authorization recovery is keyboard accessible and only discovery clears it", async ({
	page,
}) => {
	let repaired = false;
	let calls = 0;
	let providerCalls = 0;
	mockAdoFetch(async (url) => {
		providerCalls++;
		return url.includes("/profiles/me")
			? Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" })
			: url.includes("/_apis/git/repositories")
				? Response.json({ count: 0, value: [] })
				: Response.json({
						count: 1,
						value: [
							{
								accountId: "820f6651-2635-4e59-9121-0dedade21f89",
								accountName: "juniper",
							},
						],
					});
	});
	await open(page, undefined, "guest", {
		listAccounts: async () => [{ id: "opaque-account", name: "Ada Example" }],
		getAccessToken: async () => {
			calls++;
			if (!repaired)
				throw Object.assign(new Error("private native detail"), {
					code: "auth_required",
				});
			return { accessToken: "fixture-token" };
		},
	});
	const settings = page.getByRole("link", {
		name: "Open Account settings",
		exact: true,
	});
	await expect(settings).toBeVisible();
	await expect(settings).toHaveAttribute("href", "ghapp://settings/account");
	await expect(
		page.getByRole("combobox", { name: "Microsoft account", exact: true }),
	).toHaveCount(0);
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Update authorization",
	);
	await expect(page.locator('[aria-live="polite"]')).toContainText(
		"Update authorization",
	);
	await expect(settings).toHaveAccessibleDescription(
		"Microsoft account: Ada Example.",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.focus();
	await page.keyboard.press("Shift+Tab");
	await expect(settings).toBeFocused();
	expect(
		await settings.evaluate((node) => getComputedStyle(node).outlineStyle),
	).not.toBe("none");
	// Intercept only OS navigation: do not launch Settings or interactive OAuth.
	await settings.evaluate((node) =>
		node.addEventListener("click", (event) => event.preventDefault()),
	);
	await settings.press("Enter");
	await expect(settings).toBeFocused();
	expect(calls).toBe(1);
	const retry = page.getByRole("button", {
		name: "Retry repositories",
		exact: true,
	});
	await retry.focus();
	await retry.press("Enter");
	await expect(settings).toBeVisible();
	expect(calls).toBe(2);
	expect(providerCalls).toBe(0);
	repaired = true;
	await retry.focus();
	await retry.press("Enter");
	await expect(search).toBeFocused();
	await expect(search).toHaveAttribute("aria-invalid", "false");
	await expect(settings).toBeHidden();
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Results are limited.",
	);
	expect(providerCalls).toBe(3);
	expect(
		(
			await picker.actions
				.find((entry) => entry.name === "get-state")
				.handler({ instanceId, input: {} })
		).selection,
	).toBeNull();
});

test("an early repository URL offers inline missing-account recovery without losing the URL", async ({
	page,
}) => {
	const accounts = Promise.withResolvers();
	let reads = 0;
	let signedIn = false;
	mockAdoFetch(async () => Response.json(urlRepository));
	try {
		await page.setViewportSize({ width: 640, height: 400 });
		await open(page, undefined, "host", {
			listAccounts: async () =>
				++reads === 1
					? accounts.promise
					: signedIn
						? [{ id: "opaque-account", name: "Ada Example" }]
						: [],
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		});
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		const url = "https://dev.azure.com/juniper/Studio/_git/service";
		await search.fill(url);
		await expect(page.locator("#quick-fill-error")).toContainText(
			"Add a Microsoft account",
		);
		expect((await readPickerState()).fields.organization.status).toBe(
			"loading",
		);
		const settings = page.getByRole("link", {
			name: "Open Account settings",
			exact: true,
		});
		await expect(settings).toBeVisible();
		await expect(settings).toHaveAccessibleDescription(
			"Sign in with a Microsoft account to browse your Azure DevOps repositories.",
		);
		await expect(search).toHaveValue(url);
		await expect(search).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		await expect(settings).toBeFocused();

		signedIn = true;
		await picker.actions
			.find((entry) => entry.name === "account-changed")
			.handler({ instanceId, input: { accountReference: "opaque-account" } });
		const result = page.getByRole("option", {
			name: "juniper/Studio/service",
			exact: true,
		});
		await expect(result).toBeVisible();
		await expect(settings).toBeHidden();
		await expect(search).toHaveValue(url);
		await expect(search).toBeFocused();
		await result.click();
		expect(await confirm()).toMatchObject({
			status: "completed",
			value: {
				accountId: "opaque-account",
				repositoryId: urlRepository.id,
			},
		});
	} finally {
		accounts.resolve([]);
	}
});

test("a standalone early URL keeps account recovery and completes after sign-in", async ({
	page,
}) => {
	const accounts = Promise.withResolvers();
	let reads = 0;
	let signedIn = false;
	mockAdoFetch(async () => Response.json(urlRepository));
	try {
		await open(page, undefined, "guest", {
			listAccounts: async () =>
				++reads === 1
					? accounts.promise
					: signedIn
						? [{ id: "opaque-account", name: "Ada Example" }]
						: [],
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		});
		const search = page.getByRole("combobox", {
			name: flatSearchPrompt,
			exact: true,
		});
		const url = "https://dev.azure.com/juniper/Studio/_git/service";
		await search.fill(url);
		const select = page.getByRole("button", {
			name: "Select repository",
			exact: true,
		});
		await select.click();
		const settings = page.getByRole("link", {
			name: "Open Account settings",
			exact: true,
		});
		await expect(settings).toBeVisible();
		await expect(search).toHaveValue(url);
		expect((await readPickerState()).selection).toBeNull();
		const hint = await picker.actions
			.find((entry) => entry.name === "dialog-state")
			.handler({ instanceId, input: { afterRevision: null } });
		expect(hint).toMatchObject({
			ready: false,
			disabledReason: "Sign in to continue.",
		});
		expect(hint).not.toHaveProperty("accountAuthorization");
		signedIn = true;
		await select.click();
		await expect
			.poll(async () => (await readPickerState()).selection)
			.toMatchObject({
				account: { id: "opaque-account" },
				repository: { id: urlRepository.id },
			});
		await expect(settings).toBeHidden();
		await expect(search).toHaveValue(url);
	} finally {
		accounts.resolve([]);
	}
});

test("URL lookup failures offer appropriate recovery and retry on resubmission", async ({
	page,
}) => {
	let failure = null;
	let lookups = 0;
	mockAdoFetch(async (url) => {
		if (url.includes("/_apis/git/repositories/")) lookups++;
		if (failure)
			return new Response("private provider detail", { status: failure });
		if (url.includes("/_apis/git/repositories/"))
			return Response.json(urlRepository);
		return url.includes("/profiles/me")
			? Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" })
			: url.includes("/_apis/git/repositories")
				? Response.json({ count: 0, value: [] })
				: Response.json({
						count: 1,
						value: [
							{
								accountId: "820f6651-2635-4e59-9121-0dedade21f89",
								accountName: "juniper",
							},
						],
					});
	});
	await open(page, undefined, "host", {
		listAccounts: async () => [{ id: "opaque-account", name: "Ada Example" }],
		getAccessToken: async () => ({ accessToken: "fixture-token" }),
	});
	await expect(
		page.getByRole("combobox", { name: flatSearchPrompt, exact: true }),
	).toHaveAttribute("aria-invalid", "false");
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Results are limited.",
	);
	const quickFill = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	const settings = page.getByRole("link", {
		name: "Open Account settings",
		exact: true,
	});
	await quickFill.fill("https://dev.azure.com/juniper/Studio/_git/service");
	failure = 401;
	await confirm();
	await expect(page.locator("#quick-fill-error")).toContainText(
		"rejected authorization",
	);
	await expect(settings).toBeVisible();
	await expect(quickFill).toBeFocused();
	failure = 403;
	await confirm();
	await expect(page.locator("#quick-fill-error")).toContainText("permissions");
	await expect(page.locator("#quick-fill-error")).not.toContainText(
		"Update authorization",
	);
	await expect(settings).toBeHidden();
	await expect(quickFill).toBeFocused();
	failure = null;
	expect(await confirm()).toMatchObject({
		status: "completed",
		value: { repositoryId: urlRepository.id },
	});
	expect(lookups).toBe(3);
	await expect(page.locator("#quick-fill-error")).toBeHidden();
});

test("host-owned authorization recovery stays inline in the picker", async ({
	page,
}) => {
	let authorized = false;
	mockAdoFetch(async (url) =>
		url.includes("/profiles/me")
			? Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" })
			: url.includes("/_apis/git/repositories")
				? Response.json({ count: 0, value: [] })
				: Response.json({
						count: 1,
						value: [
							{
								accountId: "820f6651-2635-4e59-9121-0dedade21f89",
								accountName: "juniper",
							},
						],
					}),
	);
	await open(page, undefined, "host", {
		listAccounts: async () => [{ id: "opaque-account", name: "Ada Example" }],
		getAccessToken: async () => {
			if (!authorized)
				throw Object.assign(new Error("private"), { code: "auth_required" });
			return { accessToken: "fixture-token" };
		},
	});
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Account settings",
	);
	await expect(
		page.getByRole("link", { name: "Open Account settings" }),
	).toBeVisible();
	const hint = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(hint.accountAuthorization).toEqual({
		accountReference: "opaque-account",
	});
	authorized = true;
	await page
		.getByRole("button", { name: "Retry repositories", exact: true })
		.click();
	await expect(
		page.getByRole("combobox", { name: flatSearchPrompt, exact: true }),
	).toHaveAttribute("aria-invalid", "false");
	await expect(page.locator("#repository-search-hint")).not.toContainText(
		"authorization",
	);
	const recovered = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(recovered.accountAuthorization).toBeUndefined();
	expect(recovered.ready).toBe(false);
});

test("authorization recovery retries an app-hosted repository URL result", async ({
	page,
}) => {
	let authorized = false;
	await open(
		page,
		catalog({
			listOrganizationRepositories: async () => [],
			resolveRepositoryUrl: async () => {
				if (!authorized)
					throw Object.assign(new Error("private native detail"), {
						name: "AzureDevOpsCatalogError",
						code: "auth_required",
						account: { id: "opaque-account", name: "Ada Example" },
					});
				return {
					organization: { id: "org-juniper", name: "juniper" },
					project: { id: "project-studio", name: "Studio" },
					repository: { id: "repository-service", name: "service" },
				};
			},
		}),
		"host",
	);
	const search = page.getByRole("combobox", {
		name: flatSearchPrompt,
		exact: true,
	});
	await search.fill("https://dev.azure.com/juniper/Studio/_git/service");
	await expect(page.locator("#quick-fill-error")).toContainText(
		"authorization needs updating",
	);
	const blocked = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(blocked.accountAuthorization).toEqual({
		accountReference: "opaque-account",
	});
	await expect(
		page.getByRole("link", { name: "Open Account settings" }),
	).toBeVisible();

	authorized = true;
	await search.press("Enter");
	await expect(
		page.getByRole("option", {
			name: "juniper/Studio/service",
			exact: true,
		}),
	).toBeVisible();
	await expect(page.locator("#quick-fill-error")).toBeHidden();
	const recovered = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(recovered.accountAuthorization).toBeUndefined();
	expect(recovered.ready).toBe(false);
});

test("flat repository authorization failures use native recovery and refresh the live results", async ({
	page,
}) => {
	let authorized = false;
	let tokenReads = 0;
	let repositoryReads = 0;
	mockAdoFetch(async (url) => {
		if (url.includes("/profiles/me"))
			return Response.json({ id: "ee238eb3-efed-42c3-b57e-f34c297c933d" });
		if (url.includes("/_apis/git/repositories")) {
			repositoryReads++;
			return Response.json({
				count: 1,
				value: [
					{
						id: "11223344-5566-7788-99aa-bbccddeeff00",
						name: "service",
						project: {
							id: "20df9a20-bf49-4ccf-b355-a75bc89cf728",
							name: "Studio",
						},
					},
				],
			});
		}
		return Response.json({
			count: 1,
			value: [
				{
					accountId: "820f6651-2635-4e59-9121-0dedade21f89",
					accountName: "juniper",
				},
			],
		});
	});
	await open(page, undefined, "host", {
		listAccounts: async () => [{ id: "opaque-account", name: "Ada Example" }],
		getAccessToken: async () => {
			if (++tokenReads >= 3 && !authorized)
				throw Object.assign(new Error("private native detail"), {
					code: "auth_required",
				});
			return { accessToken: "fixture-token" };
		},
	});
	await expect(page.locator("#repository-search-hint")).toContainText(
		"Account settings",
	);
	const hint = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(hint.accountAuthorization).toEqual({
		accountReference: "opaque-account",
	});
	expect(repositoryReads).toBe(0);
	await expect(
		page.getByRole("link", { name: "Open Account settings" }),
	).toBeVisible();
	authorized = true;
	await page
		.getByRole("button", { name: "Retry repositories", exact: true })
		.click();
	await expect(
		page.getByRole("option", { name: "juniper/Studio/service", exact: true }),
	).toBeVisible();
	await expect(page.locator("#repository-search-hint")).not.toContainText(
		"authorization",
	);
	const recovered = await picker.actions
		.find((action) => action.name === "dialog-state")
		.handler({ instanceId, input: { afterRevision: null } });
	expect(recovered.accountAuthorization).toBeUndefined();
	expect(recovered.ready).toBe(false);
	expect(repositoryReads).toBe(1);
	const state = await picker.actions
		.find((action) => action.name === "get-state")
		.handler({ instanceId, input: {} });
	expect(state.selection).toBeNull();
	expect(state.results.errorCode).toBeUndefined();
	expect(JSON.stringify(state)).not.toContain("private");
});

test("required hierarchy filters, opens the full list after selection, and ends in selection only", async ({
	page,
}) => {
	await open(page, catalog());
	for (const label of ["Organization", "Project", "Repository"]) {
		await expect(
			page.getByRole("combobox", { name: label, exact: true }),
		).toHaveAttribute("aria-required", "true");
	}
	await expect(page.getByText(/Example catalog/)).toBeHidden();
	const select = page.getByRole("button", {
		name: "Select repository",
		exact: true,
	});
	await expect(select).toHaveAttribute("aria-disabled", "true");
	const organization = page.getByRole("combobox", {
		name: "Organization",
		exact: true,
	});
	await organization.fill("HARB");
	await expect(page.getByRole("option")).toHaveText(["Harbor example"]);
	await organization.press("ArrowDown");
	await organization.press("Enter");
	await expect(organization).toHaveValue("Harbor example");
	await organization.click();
	await expect(page.getByRole("option")).toHaveText([
		"Harbor example",
		"Juniper example",
	]);
	await organization.press("Escape");
	await choose(page, "Project", "Studio");
	await choose(page, "Repository", "service");
	await expect(select).toHaveAttribute("aria-disabled", "false");
	await expect(select).toHaveAccessibleDescription(
		"Select this repository to confirm your choice.",
	);
	const confirmation = Promise.withResolvers();
	await page.route("**/instances/*", async (route) => {
		if (route.request().postDataJSON()?.type === "confirm")
			await confirmation.promise;
		await route.continue();
	});
	try {
		await select.click();
		await expect(select).toHaveAccessibleDescription("Saving your changes...");
		await expect(select).toHaveAttribute("aria-disabled", "true");
		await expect(page.locator('[aria-live="polite"]')).toHaveText(
			"Saving your changes...",
		);
	} finally {
		confirmation.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
	await expect(
		page.getByText("Repository selected", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Harbor example / Studio / service", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText(/No repository has been added or cloned/),
	).toBeHidden();
	await expect(page.getByText(/This selection lasts only/)).toBeHidden();
	await expect(select).toHaveAccessibleDescription(
		/Repository selected.*Harbor example \/ Studio \/ service/,
	);
	await expect(select).toBeFocused();
	const state = await picker.actions[0].handler({ instanceId });
	expect(state.selection.repository.id).toBe(
		"org-harbor-project-studio-service",
	);

	await organization.fill("Jun");
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toHaveValue("");
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).toHaveValue("");
	await expect(select).toHaveAttribute("aria-disabled", "true");
	await expect(
		page.getByText("Repository selected", { exact: true }),
	).toBeHidden();
});

test("less-specific URLs clear descendants they do not identify", async ({
	page,
}) => {
	await open(
		page,
		catalog({
			listOrganizations: async () => [{ id: "org-mseng", name: "mseng" }],
			listProjects: async () => [
				{ id: "project-azure-devops", name: "AzureDevOps" },
			],
			listRepositories: async () => [
				{ id: "repository-azure-devops", name: "AzureDevOps" },
			],
		}),
	);
	await choose(page, "Organization", "mseng");
	await choose(page, "Project", "AzureDevOps");
	await choose(page, "Repository", "AzureDevOps");
	await pasteQuickFill(page, "https://mseng.visualstudio.com/");
	await page.getByRole("textbox", { name: "URL (quick fill)" }).press("Enter");
	await expect(
		page.getByRole("combobox", { name: "Organization", exact: true }),
	).toHaveValue("mseng");
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toHaveValue("");
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).toHaveValue("");
	await pasteQuickFill(
		page,
		"https://mseng.visualstudio.com/AzureDevOps/_workitems/edit/2463396/",
	);
	await page.getByRole("textbox", { name: "URL (quick fill)" }).press("Enter");
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toHaveValue("AzureDevOps");
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).toHaveValue("");
	await expect(
		page.getByRole("button", { name: "Select repository" }),
	).toHaveAttribute("aria-disabled", "true");
});

test("late catalog patches preserve the actual input, caret, query and focus", async ({
	page,
}) => {
	let resolveProjects;
	const projects = new Promise((resolve) => {
		resolveProjects = resolve;
	});
	await open(page, catalog({ listProjects: () => projects }));
	await choose(page, "Organization", "Juniper example");
	const project = page.getByRole("combobox", { name: "Project", exact: true });
	await project.fill("Stu");
	await project.press("ArrowLeft");
	await page.evaluate(() => {
		window.originalProjectInput = document.getElementById("project");
	});
	resolveProjects([{ id: "project-studio", name: "Studio" }]);
	await expect(
		page.getByRole("option", { name: "Studio", exact: true }),
	).toBeVisible();
	await expect(project).toHaveValue("Stu");
	await expect(project).toBeFocused();
	expect(
		await project.evaluate((input) => ({
			sameNode: input === window.originalProjectInput,
			start: input.selectionStart,
			end: input.selectionEnd,
		})),
	).toEqual({ sameNode: true, start: 2, end: 2 });
	await project.press("ArrowDown");
	await project.press("Enter");
	await expect(project).toHaveValue("Studio");
});

test("errors retry without losing the query and empty search has a visible explanation", async ({
	page,
}) => {
	let attempts = 0;
	await open(
		page,
		catalog({
			listProjects: async () => {
				if (++attempts === 1)
					throw Object.assign(new Error("private response"), {
						name: "AzureDevOpsCatalogError",
						code: "network",
					});
				return [{ id: "project-studio", name: "Studio" }];
			},
		}),
	);
	await choose(page, "Organization", "Juniper example");
	const project = page.getByRole("combobox", { name: "Project", exact: true });
	await expect(project).toHaveAccessibleDescription(/Could not load projects/);
	await expect(page.locator('[aria-live="polite"]')).toHaveText(
		"Project: Could not load projects.",
	);
	await project.fill("absent");
	await page
		.getByRole("button", { name: "Retry projects", exact: true })
		.click();
	await expect(project).toHaveValue("absent");
	await expect(project).toHaveAccessibleDescription(/No matching projects/);
	await project.click();
	await expect(
		page.getByRole("option", { name: "Studio", exact: true }),
	).toBeVisible();
	await project.fill("absent");
	await expect(
		page.getByText("No matching projects. Try a different search.", {
			exact: true,
		}),
	).toBeVisible();
});

test("older HTTP snapshots cannot overwrite a newer query or reopen stale choices", async ({
	page,
}) => {
	const projects = Promise.withResolvers();
	await open(page, catalog({ listProjects: () => projects.promise }));
	const release = Promise.withResolvers();
	const held = Promise.withResolvers();
	const finished = Promise.withResolvers();
	let captured = false;
	await page.route("**/instances/*", async (route) => {
		if (route.request().method() === "GET" && !captured) {
			captured = true;
			expect(route.request().url()).toContain("afterRevision=");
			held.resolve();
			const response = await route.fetch();
			await release.promise;
			await route.fulfill({ response });
			finished.resolve();
		} else {
			const response = await route.fetch();
			await route.fulfill({ response });
		}
	});
	await choose(page, "Organization", "Juniper example");
	const project = page.getByRole("combobox", {
		name: "Project",
		exact: true,
	});
	try {
		await held.promise;
		await project.fill("Stu");
		projects.resolve([{ id: "project-studio", name: "Studio" }]);
		await expect(page.getByRole("option")).toHaveText(["Studio"]);
		release.resolve();
		await finished.promise;
		await expect(project).toHaveValue("Stu");
		await expect(page.getByRole("option")).toHaveText(["Studio"]);
		await project.press("ArrowDown");
		await project.press("Enter");
		await expect(project).toHaveValue("Studio");
	} finally {
		projects.resolve([]);
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("dependent edits wait for the upstream write without losing optimistic input", async ({
	page,
}) => {
	await open(page, catalog());
	const held = Promise.withResolvers();
	const release = Promise.withResolvers();
	const writes = [];
	let organizationSaved = false;
	await page.route("**/instances/*", async (route) => {
		const command = route.request().postDataJSON();
		if (!command) return route.continue();
		writes.push({ field: command.field, organizationSaved });
		if (command.type === "choose" && command.field === "organization") {
			held.resolve();
			await release.promise;
		}
		const response = await route.fetch();
		if (command.type === "choose" && command.field === "organization")
			organizationSaved = true;
		await route.fulfill({ response });
	});
	try {
		await choose(page, "Organization", "Juniper example");
		await held.promise;
		const project = page.getByRole("combobox", {
			name: "Project",
			exact: true,
		});
		await project.fill("Stu");
		await project.press("ArrowLeft");
		await expect(project).toHaveValue("Stu");
		release.resolve();
		await expect
			.poll(async () => {
				const state = await picker.actions[0].handler({ instanceId });
				return state.fields.project.query;
			})
			.toBe("Stu");
		expect(writes).toEqual([
			{ field: "organization", organizationSaved: false },
			{ field: "project", organizationSaved: true },
		]);
		await expect(
			page.getByRole("option", { name: "Studio", exact: true }),
		).toBeVisible();
		await expect(project).toBeFocused();
		expect(await project.evaluate((input) => input.selectionStart)).toBe(2);
		await project.press("ArrowDown");
		await project.press("Enter");
		await choose(page, "Repository", "service");
		await page.getByRole("button", { name: "Select repository" }).click();
		await expect(
			page.getByText("Juniper example / Studio / service", { exact: true }),
		).toBeVisible();
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
	}
});

for (const outcome of ["error", "dismissal"]) {
	test(`${outcome} stops queued dependent writes`, async ({ page }) => {
		await open(page, catalog());
		const held = Promise.withResolvers();
		const release = Promise.withResolvers();
		const writes = [];
		let intercepted = false;
		await page.route("**/instances/*", async (route) => {
			const command = route.request().postDataJSON();
			if (!command) return route.continue();
			writes.push(command.field);
			if (!intercepted) {
				intercepted = true;
				held.resolve();
				await release.promise;
				if (outcome === "dismissal") return route.abort();
				return route.fulfill({ status: 503, body: "Unavailable" });
			}
			await route.continue();
		});
		try {
			await choose(page, "Organization", "Juniper example");
			await held.promise;
			const project = page.getByRole("combobox", {
				name: "Project",
				exact: true,
			});
			await project.fill("Stu");
			await project.press("ArrowLeft");
			if (outcome === "dismissal") {
				await page.goto("about:blank");
				release.resolve();
				await page.unrouteAll({ behavior: "wait" });
			} else {
				release.resolve();
				const reload = page.getByRole("button", { name: "Reload picker" });
				await expect(reload).toBeVisible();
				await expect(
					page.getByRole("button", { name: "Select repository" }),
				).toHaveAccessibleDescription(/Could not save your last change/);
				await reload.click();
				await expect(project).toHaveValue("");
				await expect(project).toHaveAttribute("aria-disabled", "true");
			}
			expect(writes).toEqual(["organization"]);
			if (outcome === "error") {
				await choose(page, "Organization", "Harbor example");
				await choose(page, "Project", "Studio");
				await choose(page, "Repository", "service");
				await page.getByRole("button", { name: "Select repository" }).click();
				await expect(
					page.getByText("Harbor example / Studio / service", { exact: true }),
				).toBeVisible();
			}
		} finally {
			release.resolve();
			await page.unrouteAll({ behavior: "wait" });
		}
	});
}

for (const locale of ["en-US", "sv-SE"]) {
	test.describe(`alphabetical browsing in ${locale}`, () => {
		test.use({ locale });

		for (const reversed of [false, true]) {
			test(`sorts all catalog fields without ranking or selecting matches (reversed=${reversed})`, async ({
				page,
			}) => {
				const choices = [
					{ id: "choice-10", name: "repo10" },
					{ id: "choice-z", name: "repo2" },
					{ id: "choice-last", name: "zeta" },
					{ id: "choice-a", name: "REPO2" },
					{ id: "choice-Z", name: "r\u00e9po2" },
					{ id: "choice-substring", name: "arepo2" },
					{ id: "choice-accent", name: "\u00e5repo" },
				];
				const results = reversed ? choices.toReversed() : choices;
				const reads = [];
				await open(
					page,
					catalog(
						Object.fromEntries(
							["Organizations", "Projects", "Repositories"].map((kind) => [
								`list${kind}`,
								async () => {
									reads.push(kind);
									return results;
								},
							]),
						),
					),
				);
				const expected = [
					"arepo2",
					"r\u00e9po2",
					"REPO2",
					"repo2",
					"repo10",
					"zeta",
				];
				if (locale === "en-US") expected.unshift("\u00e5repo");
				else expected.push("\u00e5repo");

				for (const label of ["Organization", "Project", "Repository"]) {
					const field = label.toLowerCase();
					const input = page.getByRole("combobox", {
						name: label,
						exact: true,
					});
					const options = page.getByRole("option");
					await input.click();
					await expect(options).toHaveText(expected);
					await expect(input).toHaveValue("");
					await expect(input).not.toHaveAttribute("aria-activedescendant");

					await input.fill(" RePo2 ");
					await expect(options).toHaveText(["arepo2", "REPO2", "repo2"]);
					await input.press("Enter");
					await expect(input).toHaveValue(" RePo2 ");
					await expect
						.poll(
							async () =>
								(await picker.actions[0].handler({ instanceId })).fields[field]
									.query,
						)
						.toBe(" RePo2 ");
					expect(
						(await picker.actions[0].handler({ instanceId })).fields[field]
							.selected,
					).toBeNull();
					await expect(
						page.getByRole("button", { name: "Select repository" }),
					).toHaveAttribute("aria-disabled", "true");

					await input.press("ArrowDown");
					await input.press("ArrowDown");
					await input.fill("repo");
					await expect(options).toHaveText(
						expected.filter((name) => name.toLowerCase().includes("repo")),
					);
					const active = await input.getAttribute("aria-activedescendant");
					await expect(page.locator(`[id="${active}"]`)).toHaveAttribute(
						"data-id",
						"choice-a",
					);
					await expect(input).toBeFocused();
					expect(await input.evaluate((node) => node.selectionStart)).toBe(4);
					await input.press("Enter");
					await expect(input).toHaveValue("REPO2");
					await input.click();
					await expect(options).toHaveText(expected);
					await expect(
						page.getByRole("option", { selected: true }),
					).toHaveAttribute("data-id", "choice-a");
					await input.press("Escape");
				}
				await expect(
					page.getByRole("button", { name: "Select repository" }),
				).toHaveAttribute("aria-disabled", "false");
				expect(reads).toEqual(["Organizations", "Projects", "Repositories"]);
			});
		}
	});
}

for (const reversed of [false, true]) {
	test(`flat repositories preserve API encounter order (reversed=${reversed})`, async ({
		page,
	}) => {
		const organizationId = "820f6651-2635-4e59-9121-0dedade21f89";
		const projects = [
			{ id: "20df9a20-bf49-4ccf-b355-a75bc89cf728", name: "project10" },
			{ id: "122f65e4-d483-4d07-8a91-74265e029d5e", name: "project2" },
		];
		const pages = reversed ? projects.toReversed() : projects;
		const requests = [];
		const tokenRequests = [];
		const requestFetch = globalThis.fetch;
		globalThis.fetch = async (input, init) => {
			if (!String(input).startsWith("https://"))
				return requestFetch(input, init);
			expect(init.headers.Authorization).toBe(`Bearer ${"fixture-token"}`);
			expect(init.redirect).toBe("error");
			requests.push(String(input));
			const url = new URL(input);
			if (url.pathname.endsWith("/profiles/me"))
				return Response.json({
					id: "ee238eb3-efed-42c3-b57e-f34c297c933d",
				});
			if (url.pathname.endsWith("/accounts"))
				return Response.json({
					count: 1,
					value: [
						{ accountId: organizationId, accountName: "juniper-example" },
					],
				});
			if (url.pathname.endsWith("/_apis/git/repositories"))
				return Response.json({
					count: 2,
					value: pages.map((project) => ({
						id: project.id,
						name: "service",
						project,
					})),
				});
			throw new Error(`Unexpected provider request: ${input}`);
		};
		try {
			await open(page, undefined, "guest", {
				listAccounts: async () => [
					{ id: "native-account", name: "Ada Example" },
				],
				getAccessToken: async (input) => {
					tokenRequests.push(input);
					return { accessToken: "fixture-token" };
				},
			});
			await expect.poll(() => requests.length).toBe(3);
			const project = page.getByRole("combobox", {
				name: flatSearchPrompt,
				exact: true,
			});
			await expect(page.getByRole("option")).toHaveText(
				pages.map((project) => `juniper-example/${project.name}/service`),
			);
			await expect(project).toHaveValue("");
			expect(
				await page
					.getByRole("option")
					.evaluateAll((nodes) => nodes.map((node) => node.dataset.id)),
			).toEqual(
				pages.map((project) => `${organizationId}/${project.id}/${project.id}`),
			);
			expect(tokenRequests).toEqual(
				Array.from({ length: 3 }, () => ({
					accountId: "native-account",
					resource: "azure-devops",
				})),
			);
			expect(requests).toEqual([
				"https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
				"https://app.vssps.visualstudio.com/_apis/accounts?memberId=ee238eb3-efed-42c3-b57e-f34c297c933d&api-version=7.1",
				"https://dev.azure.com/juniper-example/_apis/git/repositories?api-version=7.1",
			]);
		} finally {
			globalThis.fetch = requestFetch;
		}
	});
}

test("production stays compact with inline recovery and accessible dependency descriptions", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 600, height: 400 });
	await open(page);
	await expect(
		page.getByRole("heading", { name: "Choose a repository", exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByText("Choose an organization, project and repository.", {
			exact: true,
		}),
	).toHaveCount(0);
	for (const [name, description] of [
		["Project", "Choose an organization first."],
		["Repository", "Choose a project first."],
	]) {
		await expect(
			page.getByRole("combobox", { name, exact: true }),
		).toHaveAccessibleDescription(description);
		await expect(
			page.getByText(description, { exact: true }),
		).not.toBeInViewport();
	}
	await expect(
		page.getByText("Choose an organization, project and repository first.", {
			exact: true,
		}),
	).not.toBeInViewport();
	const select = page.getByRole("button", {
		name: "Select repository",
		exact: true,
	});
	await expect(select).toBeInViewport();
	const organization = page.getByRole("combobox", {
		name: "Organization",
		exact: true,
	});
	await expect(organization).toHaveAccessibleDescription(
		"Could not load organizations.",
	);
	await expect(
		page.getByText(/Sign-in is not available in this build/),
	).toBeHidden();
	await expect(
		page.getByText("Example catalog.", { exact: false }),
	).toBeHidden();
	const retry = page.getByRole("button", {
		name: "Retry organizations",
		exact: true,
	});
	await expect(retry).toHaveText("Retry");
	await expect(retry).toHaveCSS("border-top-width", "0px");
	await expect(retry).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	const hintBounds = await page.locator("#organization-hint").boundingBox();
	const retryBounds = await retry.boundingBox();
	expect(retryBounds.y).toBeLessThan(hintBounds.y + hintBounds.height);
	expect(retryBounds.x).toBeGreaterThanOrEqual(hintBounds.x + hintBounds.width);
	expect(retryBounds.height).toBeGreaterThanOrEqual(24);
	await page.screenshot({ path: testInfo.outputPath("compact-picker.png") });
	await organization.click();
	await organization.press("Tab");
	await expect(retry).toBeFocused();
	await retry.press("Enter");
	await expect(organization).toBeFocused();
	await expect(organization).toHaveAccessibleDescription(
		"Could not load organizations.",
	);
	await organization.press("Tab");
	await retry.press("Tab");
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(
		page.getByRole("combobox", { name: "Repository", exact: true }),
	).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(select).toBeFocused();
	await expect(select).toHaveAttribute("aria-disabled", "true");
	await select.press("Enter");
	await expect(select).toHaveAccessibleDescription(
		"Could not load organizations. Retry the list.",
	);
});

test("the same form reflows at a narrow 200 percent equivalent viewport", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 360 });
	await open(page, catalog());
	await choose(page, "Organization", "Juniper example");
	await choose(page, "Project", "Studio");
	await choose(page, "Repository", "service");
	const select = page.getByRole("button", {
		name: "Select repository",
		exact: true,
	});
	await select.click();
	await expect(
		page.getByText("Repository selected", { exact: true }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await select.focus();
	await expect(select).toBeInViewport();
});
