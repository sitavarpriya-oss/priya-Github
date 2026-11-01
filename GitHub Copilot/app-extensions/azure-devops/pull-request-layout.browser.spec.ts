import { expect, type Page, test } from "@playwright/test";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

async function mutatePreview(
	page: Page,
	operation: string,
	input: Record<string, unknown>,
) {
	const status = await page.evaluate(
		async ({ operation, input }) => {
			const id = location.pathname.split("/").at(-1);
			const state = await (await fetch(`/instances/${id}`)).json();
			const response = await fetch(`/mutate/${id}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Canvas-Binding": String(state.bindingRevision),
					"X-Canvas-Changes": String(state.changesRevision),
				},
				body: JSON.stringify({ operation, input }),
			});
			return response.status;
		},
		{ operation, input },
	);
	expect(status).toBe(200);
}

test("PR number opens its ADO page without leaving the canvas", async ({
	page,
	context,
}) => {
	const preview = await startPullRequestPreview();
	const destination =
		"https://dev.azure.com/fabrikam/22222222-2222-4222-8222-222222222222/_git/11111111-1111-4111-8111-111111111111/pullrequest/22";
	await context.route(destination, (route) =>
		route.fulfill({
			contentType: "text/html",
			body: "<h1>ADO PR fixture</h1>",
		}),
	);
	try {
		await page.goto(preview.url);
		const number = page.getByRole("link", {
			name: "#22. Opens in a new browser tab.",
			exact: true,
		});
		await expect(number).toHaveAttribute("href", destination);
		await expect(number).toHaveAttribute("rel", "noopener noreferrer");
		const opened = context.waitForEvent("page");
		await number.click();
		const external = await opened;
		await expect(external).toHaveURL(destination);
		await expect(external.getByRole("heading")).toHaveText("ADO PR fixture");
		await expect(page).toHaveURL(preview.url);
		await external.close();
		await expect(number).toBeVisible();
		for (const branch of ["improve-retries", "main"]) {
			const link = page.getByRole("link", {
				name: `${branch}. Opens in a new browser tab.`,
				exact: true,
			});
			await expect(link).toHaveAttribute(
				"href",
				`${destination.replace(/\/pullrequest\/22$/, "")}?version=GB${branch}`,
			);
			await expect(link).toHaveAttribute("target", "_blank");
			await expect(link).toHaveAttribute("rel", "noopener noreferrer");
		}
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(page.getByRole("tablist")).toHaveCount(0);
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

test("title row owns edit and copy while ADO metadata keeps PR identity", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const titleRow = page.locator(".title-row");
		const heading = titleRow.getByRole("heading", { level: 2 });
		await expect(heading).toContainText("[Preview] Improve retry handling");
		await expect(
			page.locator(".identity-row").getByRole("link", { name: /^#22\./ }),
		).toBeVisible();
		await expect(
			titleRow.getByRole("button", { name: "Copy PR URL", exact: true }),
		).toBeVisible();
		const edit = titleRow.getByRole("button", {
			name: "Edit pull request title",
			exact: true,
		});
		await expect(edit).toBeVisible();
		expect(
			await titleRow
				.locator(".title-actions > button")
				.evaluateAll((buttons) => buttons.map((button) => button.id)),
		).toEqual(["edit-title", "copy-url"]);
		const titleText = titleRow.locator("#pr-title");
		await page.setViewportSize({ width: 1000, height: 800 });
		const inlineHeader = await page.evaluate(() => {
			const title = document
				.querySelector(".title-row")
				?.getBoundingClientRect();
			const actions = document
				.querySelector("#header-actions")
				?.getBoundingClientRect();
			if (!title || !actions) throw new Error("Missing header layout");
			return { title: title.toJSON(), actions: actions.toJSON() };
		});
		expect(inlineHeader.actions.top).toBeLessThan(inlineHeader.title.bottom);
		await titleText.evaluate((element) => {
			element.textContent =
				"A pull request title long enough to move review actions below the header";
		});
		const reflowedHeader = await page.evaluate(() => {
			const title = document
				.querySelector(".title-row")
				?.getBoundingClientRect();
			const heading = document
				.querySelector("#header-title")
				?.getBoundingClientRect();
			const actions = document
				.querySelector("#header-actions")
				?.getBoundingClientRect();
			if (!title || !heading || !actions)
				throw new Error("Missing header layout");
			return {
				title: title.toJSON(),
				heading: heading.toJSON(),
				actions: actions.toJSON(),
			};
		});
		expect(reflowedHeader.heading.height).toBeLessThanOrEqual(32);
		expect(reflowedHeader.heading.height).toBeGreaterThan(20);
		expect(reflowedHeader.actions.top).toBeGreaterThanOrEqual(
			reflowedHeader.title.bottom,
		);
		expect(reflowedHeader.actions.x).toBeCloseTo(reflowedHeader.title.x, 1);
		await page.setViewportSize({ width: 1200, height: 800 });
		await titleText.evaluate((element) => {
			element.textContent =
				"A deliberately long pull request title that wraps onto another line while its copy and edit actions remain aligned with the final line";
		});
		const wrappedTitle = await Promise.all(
			[heading, titleRow.locator(".title-actions")].map((element) =>
				element.evaluate((node) => node.getBoundingClientRect().toJSON()),
			),
		);
		expect(wrappedTitle[0].height).toBeGreaterThan(32);
		expect(
			Math.abs(wrappedTitle[1].bottom - wrappedTitle[0].bottom),
		).toBeLessThanOrEqual(4);
		await titleText.evaluate((element) => {
			element.textContent = "[Preview] Improve retry handling";
		});
		await page.setViewportSize({ width: 1280, height: 720 });
		await expect(page.locator(".branch-row").getByRole("button")).toHaveCount(
			0,
		);

		await titleRow.hover();
		await edit.click();
		const input = titleRow.getByRole("textbox", {
			name: "Edit pull request title",
			exact: true,
		});
		await expect(input).toBeFocused();
		expect(
			await input.evaluate((element: HTMLTextAreaElement) => [
				element.selectionStart,
				element.selectionEnd,
			]),
		).toEqual([0, "[Preview] Improve retry handling".length]);
		await input.fill("Do not save this title");
		await input.press("Escape");
		await expect(heading).toContainText("[Preview] Improve retry handling");
		await expect(edit).toBeFocused();

		await titleRow.hover();
		await edit.click();
		await input.fill("A revised pull request title");
		await input.evaluate((element: HTMLTextAreaElement) => {
			element.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					isComposing: true,
					key: "Enter",
				}),
			);
			const legacyEscape = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Escape",
			});
			Object.defineProperty(legacyEscape, "keyCode", { value: 229 });
			element.dispatchEvent(legacyEscape);
		});
		await expect(input).toBeVisible();
		await expect(input).toBeFocused();
		expect(writes).toEqual([]);
		await input.press("Enter");
		await expect(heading).toContainText("A revised pull request title");
		await expect(edit).toBeFocused();
		await expect.poll(() => writes.length).toBe(1);
		expect(writes).toEqual([
			{
				operation: "edit",
				input: { title: "A revised pull request title" },
			},
		]);

		await titleRow.hover();
		await edit.click();
		await input.fill("A title saved on blur");
		await page.locator(".proposal").click();
		await expect(heading).toContainText("A title saved on blur");
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

for (const width of [480, 640, 800]) {
	test(`keeps one PR identity and groups checks at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const preview = await startPullRequestPreview();
		try {
			await page.goto(preview.url);
			await expect(page.getByTestId("reviewers")).toContainText("Sam Example");
			await expect(
				page.getByRole("region", { name: "Pull request metadata" }),
			).toHaveCount(0);
			await expect(page.locator("#author")).toHaveText("Ada Example");
			await expect(
				page.getByText("Last successful refresh", { exact: true }),
			).toHaveCount(0);
			await expect(
				page.getByText("ADO merge status", { exact: true }),
			).toHaveCount(0);
			await expect(
				page.getByText("[Preview] Improve retry handling", { exact: true }),
			).toHaveCount(1);
			const checks = page.getByTestId("checks");
			await expect(page.locator("#check-summary")).toHaveText(
				"2 of 4 required checks failed",
			);
			await expect(checks.getByText("Unit tests", { exact: true })).toHaveCount(
				0,
			);
			await expect(
				checks.getByText("Integration tests", { exact: true }),
			).toBeVisible();
			await expect(checks.getByText("Lint", { exact: true })).toBeVisible();
			const viewAll = checks.locator(".checks-view-all");
			await expect(viewAll).toHaveText("View checks");
			await viewAll.press("Enter");
			await expect(viewAll).toHaveText("Collapse");
			await expect(viewAll).toHaveAttribute("aria-expanded", "true");
			await expect(
				checks.getByText("Unit tests", { exact: true }),
			).toBeVisible();
			await preview.refresh();
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await expect(viewAll).toHaveAttribute("aria-expanded", "true");
			await expect(
				checks.getByText("Unit tests", { exact: true }),
			).toBeVisible();
			await expect(page.locator("#pr-title")).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Copy PR URL" }),
			).toBeVisible();
			expect(
				await page.evaluate(() => {
					const details = document.getElementById("details");
					if (!details) throw new Error("Missing PR content");
					return (
						details.scrollWidth <= details.clientWidth &&
						document.documentElement.scrollWidth <= innerWidth
					);
				}),
			).toBe(true);
		} finally {
			await page.goto("about:blank");
			await preview.dispose();
		}
	});
}

test("maximize keeps the GitHub reading width, panel-edge scrolling, and drafts", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.setViewportSize({ width: 640, height: 900 });
		await page.goto(preview.url);
		await expect(page.locator("#thread-1")).toBeVisible();
		const narrow = await page.locator(".discussion").boundingBox();
		await page
			.locator("#thread-1")
			.getByRole("button", { name: "Reply", exact: true })
			.click();
		const draft = page
			.locator("#thread-1")
			.getByRole("textbox", { name: "Comment", exact: true });
		await draft.fill("Keep this draft when the panel is maximized.");
		await page.setViewportSize({ width: 1920, height: 1080 });
		await expect(page.locator(".canvas-footer")).toBeHidden();
		for (const selector of [".canvas-header", ".overview-layout"]) {
			const bounds = await page.locator(selector).boundingBox();
			if (!bounds) throw new Error(`Missing ${selector}`);
			expect(bounds.width).toBe(1200);
			expect(bounds.x + bounds.width / 2).toBe(960);
		}
		await expect(draft).toBeFocused();
		await expect(draft).toHaveValue(
			"Keep this draft when the panel is maximized.",
		);
		const scroll = await page.locator("#details").evaluate((element) => ({
			width: element.getBoundingClientRect().width,
			right: element.getBoundingClientRect().right,
			viewport: document.documentElement.clientWidth,
			outerScroll: document.documentElement.scrollHeight - innerHeight,
			innerScroll: element.scrollHeight - element.clientHeight,
			bottom: element.getBoundingClientRect().bottom,
			viewportHeight: innerHeight,
		}));
		expect(scroll.width).toBe(scroll.viewport);
		expect(scroll.right).toBe(scroll.viewport);
		expect(scroll.outerScroll).toBe(0);
		expect(scroll.innerScroll).toBeGreaterThan(0);
		expect(scroll.bottom).toBe(scroll.viewportHeight);
		const wide = await page.locator(".discussion").boundingBox();
		if (!wide || !narrow) throw new Error("Missing discussion bounds");
		expect(wide.width).toBeGreaterThan(narrow.width);
		await expect(
			page.getByRole("region", { name: "Pull request metadata" }),
		).toHaveCount(0);
		await page.setViewportSize({ width: 320, height: 900 });
		expect(
			await page.evaluate(() => {
				const details = document.getElementById("details");
				if (!details) throw new Error("Missing PR content");
				return details.scrollWidth <= details.clientWidth;
			}),
		).toBe(true);
		await page.setViewportSize({ width: 640, height: 900 });
		const restored = await page.locator(".discussion").boundingBox();
		expect(restored?.width).toBe(narrow.width);
		await expect(draft).toBeFocused();
		await expect(draft).toHaveValue(
			"Keep this draft when the panel is maximized.",
		);
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

test("comment and activity filters mirror the ADO feed choices", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		await expect(page.locator("#thread-1")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Comments 6", exact: true }),
		).toBeVisible();
		await expect(page.locator("#activity-8")).toContainText(
			"Ada Example pushed 2 commits to improve-retries.",
		);
		await expect(page.locator("#activity-11")).toContainText(
			"Sam Example approved with suggestions.",
		);
		await expect(page.locator("#activity-8 .activity-icon")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		await expect(page.locator("#thread-3")).toContainText("Connection reset");
		const filter = page.locator("#discussion-filter button");
		const sort = page.locator("#discussion-sort button");
		await expect(page.locator(".discussion-controls button")).toHaveCount(2);
		await expect(page.locator("#discussion-filter-summary")).toHaveCount(0);
		await expect(page.locator("#discussion-sort select")).toHaveCount(0);
		await expect(filter).toBeVisible();
		await expect(filter).toHaveText("Show everything (12)");
		await expect(sort).toHaveText("Newest first");
		await filter.press("ArrowDown");
		const all = page.getByRole("menuitemradio", {
			name: "Show everything (12)",
			exact: true,
		});
		await expect(all).toBeFocused();
		await expect(all).toHaveAttribute("aria-checked", "true");
		for (const label of [
			"Show everything (12)",
			"All comments (6)",
			"What's new (0)",
			"My comments/replies (3)",
			"Active comments (3)",
			"Resolved comments (3)",
		])
			await expect(
				page.getByRole("menuitemradio", { name: label, exact: true }),
			).toBeVisible();
		await page
			.getByRole("menuitemradio", { name: "What's new (0)", exact: true })
			.click();
		await expect(filter).toBeFocused();
		await expect(filter).toHaveText("What's new (0)");
		await expect(page.getByTestId("threads")).toHaveText(
			"No new comments or activity.",
		);
		await filter.click();
		await page
			.getByRole("menuitemradio", {
				name: "Resolved comments (3)",
				exact: true,
			})
			.click();
		await expect(page.locator("#threads .thread")).toHaveCount(3);
		await expect(page.locator("#threads .activity-post")).toHaveCount(0);
		await filter.click();
		await page
			.getByRole("menuitemradio", {
				name: "Show everything (12)",
				exact: true,
			})
			.click();
		await expect(page.locator("#threads .thread")).toHaveCount(6);
		await expect(page.locator("#threads .activity-post")).toHaveCount(6);
		await sort.click();
		await page
			.getByRole("menuitemradio", { name: "Newest first", exact: true })
			.click();
		await expect(sort).toHaveText("Newest first");
		await expect(page.locator("#threads > ul > li").first()).toHaveAttribute(
			"id",
			"activity-12",
		);
		await filter.click();
		await page.keyboard.press("Escape");
		await expect(filter).toBeFocused();
		await expect(sort).toHaveText("Newest first");
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

test("bounds long descriptions without nested scrolling and keeps full text reachable", async ({
	page,
}) => {
	await page.setViewportSize({ width: 640, height: 900 });
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		const description = `${Array.from(
			{ length: 16 },
			(_, index) =>
				`## Section ${index + 1}\n\nA detailed explanation of the change and its expected behavior.`,
		).join("\n\n")}\n\n[Final reference](https://example.com/reference)`;
		await mutatePreview(page, "edit", {
			title: "[Preview] Improve retry handling",
			description,
		});
		const toggle = page.getByRole("button", {
			name: "Full description",
			exact: true,
		});
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		const chevron = toggle.locator("svg");
		await expect(chevron).toHaveAttribute("aria-hidden", "true");
		await expect(chevron).toHaveAttribute("focusable", "false");
		await expect(chevron).toHaveCSS("transform", "none");
		const frame = page.locator("#description-content");
		const collapsed = await frame.boundingBox();
		expect(
			await frame.evaluate((element) => getComputedStyle(element).overflowY),
		).not.toBe("auto");
		await toggle.press("Enter");
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(chevron).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
		const expanded = await frame.boundingBox();
		if (!expanded || !collapsed) throw new Error("Missing description bounds");
		expect(expanded.height).toBeGreaterThan(collapsed.height);
		await expect(
			page.getByRole("heading", { name: "Section 16", exact: true }),
		).toBeVisible();
		await preview.refresh();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await toggle.click();
		await expect(toggle).toBeFocused();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await expect(chevron).toHaveCSS("transform", "none");
		await page.setViewportSize({ width: 320, height: 900 });
		await toggle.scrollIntoViewIfNeeded();
		await expect(chevron).toBeInViewport();
		await expect(chevron).toHaveCSS("width", "16px");
		await expect(chevron).toHaveCSS("height", "16px");
		const alignment = await toggle.evaluate((button) => {
			const icon = button.querySelector("svg");
			if (!icon) throw new Error("Missing description chevron");
			const buttonBounds = button.getBoundingClientRect();
			const iconBounds = icon.getBoundingClientRect();
			return Math.abs(
				iconBounds.top +
					iconBounds.height / 2 -
					(buttonBounds.top + buttonBounds.height / 2),
			);
		});
		expect(alignment).toBeLessThan(1);
		await page
			.getByRole("link", {
				name: "Final reference. Opens in a new browser tab.",
				exact: true,
			})
			.focus();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(chevron).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
		await expect(
			page.getByRole("link", {
				name: "Final reference. Opens in a new browser tab.",
				exact: true,
			}),
		).toBeInViewport();
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});
