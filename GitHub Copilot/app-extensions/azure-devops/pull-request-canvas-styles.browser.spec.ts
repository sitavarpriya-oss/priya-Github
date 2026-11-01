import { expect, test } from "@playwright/test";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

// Reference-inspired ADO layout, with the existing host theme contract.
// These measurements cover the package guest, not native app integration.
for (const mode of ["light", "dark"] as const) {
	test(`uses the reference-inspired ADO layout and host theme in ${mode} mode`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: mode });
		const preview = await startPullRequestPreview({
			completionReady: true,
		});
		try {
			await page.goto(preview.url);
			await expect(page.getByTestId("reviewers")).toContainText("Sam Example");
			for (const name of [
				"Alan Turing",
				"Grace Hopper",
				"Lin Chen",
				"Margaret Hamilton",
			])
				await expect(page.getByTestId("reviewers")).toContainText(name);
			const optionalReviewers = page.getByRole("region", {
				name: "Optional (2)",
				exact: true,
			});
			const grace = optionalReviewers
				.locator(".reviewer-row")
				.filter({ has: page.getByText("Grace Hopper", { exact: true }) });
			await expect(grace.locator(".reviewer-details")).toHaveCSS(
				"display",
				"flex",
			);
			await expect(grace.locator("p")).toHaveCount(0);
			await expect(grace.locator(".reviewer-vote")).toHaveText(
				"Approved with suggestions",
			);
			await expect(grace.locator(".reviewer-status-icon")).toHaveAttribute(
				"data-state",
				"suggestions",
			);
			await expect(
				grace.locator(".reviewer-status-icon mask path"),
			).toHaveAttribute("d", "M5.25 8.25 7 10l3.75-3.75");
			await expect(grace.locator(".reviewer-status-icon")).toHaveCSS(
				"color",
				mode === "light" ? "rgb(26, 127, 55)" : "rgb(63, 185, 80)",
			);
			const margaret = optionalReviewers
				.locator(".reviewer-row")
				.filter({ has: page.getByText("Margaret Hamilton", { exact: true }) });
			await expect(margaret.locator(".reviewer-status-icon")).toHaveAttribute(
				"data-state",
				"pending",
			);
			await expect(
				margaret.locator(".reviewer-status-icon circle"),
			).toHaveAttribute("r", "3.5");
			const reviewerOptions = grace.getByRole("button", {
				name: "Options for Grace Hopper",
				exact: true,
			});
			await expect(reviewerOptions).toHaveCSS("opacity", "0");
			await grace.hover();
			await expect(reviewerOptions).toHaveCSS("opacity", "1");
			await expect(reviewerOptions).toHaveCSS("width", "24px");
			await expect(reviewerOptions.locator("svg circle")).toHaveCount(3);
			await expect(reviewerOptions.locator("svg path")).toHaveCount(0);
			await reviewerOptions.focus();
			await expect(reviewerOptions).toHaveCSS("outline-style", "solid");
			await reviewerOptions.click();
			const reviewerMenu = page.getByRole("menu", {
				name: "Options for Grace Hopper",
				exact: true,
			});
			const reviewerTriggerBounds = await reviewerOptions.boundingBox();
			const reviewerMenuBounds = await reviewerMenu.boundingBox();
			if (!reviewerTriggerBounds || !reviewerMenuBounds)
				throw new Error("Reviewer menu geometry is unavailable");
			expect(reviewerMenuBounds.x + reviewerMenuBounds.width).toBeCloseTo(
				reviewerTriggerBounds.x + reviewerTriggerBounds.width,
				1,
			);
			await page.keyboard.press("Escape");
			await expect(reviewerOptions).toBeFocused();
			for (const label of ["Approve", "Review options", "Add reviewer"]) {
				const button = page.getByRole("button", { name: label, exact: true });
				await expect(button).toHaveCSS("min-height", "28px");
				expect((await button.boundingBox())?.height).toBe(28);
			}
			await expect(
				page.getByRole("button", {
					name: "Pull request actions",
					exact: true,
				}),
			).toHaveCount(0);
			await expect(page.getByRole("tablist")).toHaveCount(0);
			await expect(page.locator("body")).toHaveCSS(
				"color",
				mode === "light" ? "rgb(31, 35, 40)" : "rgb(240, 246, 252)",
			);
			await expect(page.locator("body")).toHaveCSS(
				"background-color",
				mode === "light" ? "rgb(255, 255, 255)" : "rgb(13, 17, 23)",
			);
			const refresh = page.locator("#refresh");
			await expect(refresh).toBeHidden();
			await expect(refresh).toHaveCSS("border-top-width", "0px");
			await expect(refresh).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(page.locator(".description-card")).toHaveCSS(
				"border-top-color",
				mode === "light" ? "rgb(209, 217, 224)" : "rgb(61, 68, 77)",
			);
			await expect(page.locator(".branch").first()).toHaveCSS(
				"font-family",
				'"Cascadia Mono", Menlo, Consolas, "Courier New", monospace',
			);
			const statusBadge = page.locator("#pr-badge");
			await expect(statusBadge.locator("svg")).toBeVisible();
			await expect(statusBadge).toHaveCSS("height", "22px");
			await expect(statusBadge).toHaveCSS("padding-left", "6px");
			await expect(statusBadge).toHaveCSS("border-top-width", "0px");
			await expect(statusBadge).toHaveCSS("border-radius", "8px");
			await expect(statusBadge).toHaveCSS(
				"background-color",
				mode === "light" ? "rgb(31, 136, 61)" : "rgb(35, 134, 54)",
			);
			await expect(statusBadge).toHaveCSS("color", "rgb(255, 255, 255)");
			await expect(page.locator("#author")).toHaveText("Ada Example");
			const inlineCode = page
				.locator("#threads code")
				.filter({ hasText: "RetryReason" });
			await expect(inlineCode).toHaveCSS("font-size", /^(12\.99\d*|13)px$/);
			await expect(inlineCode).toHaveCSS("font-weight", "400");
			await expect(inlineCode).toHaveCSS(
				"font-family",
				'"Cascadia Mono", Menlo, Consolas, "Courier New", monospace',
			);
			await expect(inlineCode).toHaveCSS(
				"background-color",
				mode === "light"
					? "rgba(129, 139, 152, 0.12)"
					: "rgba(101, 108, 118, 0.2)",
			);
			const disclosure = page
				.locator("#threads details")
				.filter({ hasText: "Allowed values" });
			const disclosureSummary = disclosure.getByText("Details", {
				exact: true,
			});
			await expect(disclosure).not.toHaveAttribute("open");
			await expect(disclosure.getByText("Allowed values:")).toBeHidden();
			await disclosureSummary.focus();
			await expect(disclosureSummary).toHaveCSS("outline-style", "solid");
			await page.keyboard.press("Enter");
			await expect(disclosure.getByText("Allowed values:")).toBeVisible();
			await disclosureSummary.click();
			await expect(disclosure.getByText("Allowed values:")).toBeHidden();
			const copy = page.getByRole("button", { name: "Copy PR URL" });
			await copy.focus();
			await expect(copy).toHaveCSS("outline-style", "solid");
			await expect(
				page.locator(".title-actions").getByRole("button"),
			).toHaveCount(2);
			await expect(page.locator(".branch-row").getByRole("button")).toHaveCount(
				0,
			);
			await expect(copy).toBeVisible();
			await copy.focus();
			await expect(page.locator(".title-actions")).toHaveCSS("opacity", "1");
			await preview.refresh();
			await expect(refresh).toHaveAttribute("aria-disabled", "false");
			await expect(copy).toBeFocused();
			await expect(copy).toBeVisible();
			await expect(
				page
					.locator(".canvas-header")
					.getByRole("button", { name: "Copy PR URL" }),
			).toBeVisible();
			await expect(
				page.locator(".title-actions").getByRole("button"),
			).toHaveCount(2);
			await expect(page.locator(".branch-row").getByRole("button")).toHaveCount(
				0,
			);
			await expect(
				page.getByRole("heading", { name: "Description", exact: true }),
			).toBeVisible();
			for (const width of [1600, 1280, 1279, 1012, 420, 320]) {
				await page.setViewportSize({ width, height: 720 });
				const layout = await page.evaluate(() => {
					const details = document.getElementById("details");
					if (!details) throw new Error("Missing PR details");
					const rect = (selector: string) => {
						const element = document.querySelector(selector);
						if (!element) throw new Error(`Missing ${selector}`);
						return element.getBoundingClientRect().toJSON();
					};
					return {
						availableWidth: details.clientWidth,
						page: rect(".overview-layout"),
						heading: rect(".title-row"),
						summary: rect(".pr-summary"),
						reviewers: rect(".reviewers-card"),
						checks: rect(".checks-card"),
						description: rect(".description-card"),
						discussion: rect(".discussion"),
					};
				});
				expect(layout.page.width).toBe(Math.min(layout.availableWidth, 1200));
				expect(layout.page.x).toBeCloseTo(
					(layout.availableWidth - layout.page.width) / 2,
					1,
				);
				expect(layout.heading.x).toBe(layout.checks.x);
				expect(layout.heading.right).toBeLessThanOrEqual(
					layout.reviewers.right,
				);
				expect(layout.checks.top).toBeGreaterThan(layout.summary.bottom);
				if (width >= 1280) {
					expect(layout.reviewers.x).toBeGreaterThan(layout.checks.right);
					expect(layout.reviewers.top).toBeCloseTo(layout.checks.top, 1);
					expect(layout.description.x).toBe(layout.checks.x);
					expect(layout.checks.bottom).toBeLessThan(layout.description.top);
				} else {
					expect(layout.checks.bottom).toBeLessThan(layout.reviewers.top);
					expect(layout.reviewers.x).toBe(layout.checks.x);
					expect(layout.reviewers.right).toBe(layout.checks.right);
					expect(layout.reviewers.x).toBe(layout.description.x);
					expect(layout.reviewers.bottom).toBeLessThan(layout.description.top);
				}
				expect(layout.discussion.x).toBe(layout.checks.x);
				expect(layout.discussion.right).toBe(layout.checks.right);
				await expect(
					page.getByRole("button", { name: "Approve", exact: true }),
				).toBeVisible();
				await expect(
					page.getByRole("button", { name: "Review", exact: true }),
				).toHaveCount(0);
				expect(
					await page.evaluate(() => {
						const panel = document.getElementById("overview-panel");
						if (!panel) throw new Error("Missing Overview panel");
						return (
							panel.scrollWidth <= panel.clientWidth &&
							document.documentElement.scrollWidth <= innerWidth
						);
					}),
				).toBe(true);
				await page
					.getByRole("heading", { name: "Reviewers" })
					.scrollIntoViewIfNeeded();
				await expect(page.getByTestId("reviewers")).toBeInViewport();
				await expect(
					page.getByRole("region", { name: "Pull request metadata" }),
				).toHaveCount(0);
				await page.locator("#details").evaluate((element) => {
					element.scrollTop = 0;
				});
				await expect(
					page.getByRole("heading", { name: "Checks" }),
				).toBeInViewport();
				await expect(
					page.getByRole("heading", { name: "Properties" }),
				).not.toBeInViewport();
			}
			await page.setViewportSize({ width: 1280, height: 720 });

			const reply = page
				.locator("#threads")
				.getByRole("button", { name: "Reply", exact: true })
				.first();
			await reply.click();
			const draft = page
				.locator("#threads")
				.getByRole("textbox", { name: "Comment", exact: true });
			await draft.fill("Keep this theme-change draft.");
			await draft.evaluate((element) =>
				element.scrollIntoView({ block: "center" }),
			);
			const scroll = await page.locator("#details").evaluate(
				(element) =>
					new Promise<number>((resolve) => {
						let previous = -1;
						let frames = 0;
						const sample = () => {
							const current = element.scrollTop;
							if (current === previous || frames++ >= 10) {
								resolve(current);
								return;
							}
							previous = current;
							requestAnimationFrame(sample);
						};
						requestAnimationFrame(sample);
					}),
			);
			await page.emulateMedia({
				colorScheme: mode === "dark" ? "light" : "dark",
			});
			await expect(page.locator("body")).toHaveCSS(
				"background-color",
				mode === "dark" ? "rgb(255, 255, 255)" : "rgb(13, 17, 23)",
			);
			await expect(draft).toHaveValue("Keep this theme-change draft.");
			await expect(draft).toBeFocused();
			expect(
				await page.locator("#details").evaluate((element) => element.scrollTop),
			).toBe(scroll);
			await draft.press("Escape");

			// Host input is prepended, as in the native theme injector. Keep CSP.
			await page.route(page.url(), async (route) => {
				const result = await route.fetch();
				await route.fulfill({
					response: result,
					body: (await result.text()).replace(
						"<head>",
						`<head><style>:root {
							color-scheme: light;
							--text-color-default: #1f2328;
							--background-color-default: #f6f8fa;
							--background-color-button-default-active: #e8dfff;
							--background-color-button-primary-rest: #2762aa;
							--background-color-button-primary-hover: #1e4f90;
							--background-color-button-primary-active: #17447f;
							--background-color-button-danger-rest: #f6f8fa;
							--text-color-button-danger-rest: #a20b21;
							--background-color-control-transparent-hover: #e2ddf0;
							--text-color-danger: #a20b21;
							--background-color-danger-muted: #f4dce0;
						}</style>`,
					),
				});
			});
			await page.reload();
			await expect(page.locator("body")).toHaveCSS("color", "rgb(31, 35, 40)");
			await expect(page.locator("body")).toHaveCSS(
				"background-color",
				"rgb(246, 248, 250)",
			);
			await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
			await expect(
				page.getByRole("button", {
					name: "Pull request actions",
					exact: true,
				}),
			).toHaveCount(0);
			const commentForm = page.getByRole("form", { name: "Add comment" });
			const commentInput = commentForm.getByRole("textbox", {
				name: "Add a comment",
				exact: true,
			});
			const saveComment = commentForm.getByRole("button", {
				name: "Save",
				exact: true,
			});
			await expect(saveComment).toBeHidden();
			await commentInput.focus();
			await expect(saveComment).toBeVisible();
			await expect(saveComment).toHaveCSS(
				"background-color",
				"rgb(39, 98, 170)",
			);
			await saveComment.hover();
			await expect(saveComment).toHaveCSS(
				"background-color",
				"rgb(30, 79, 144)",
			);
			await saveComment.focus();
			await expect(saveComment).toBeFocused();
		} finally {
			await preview.dispose();
		}
	});
}
