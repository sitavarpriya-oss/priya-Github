import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

async function stageInlineDraft(page: Page, previewUrl: string) {
	const snapshotUrl = previewUrl.replace("/canvases/", "/instances/");
	const snapshot = async () => (await page.request.get(snapshotUrl)).json();
	await expect.poll(async () => (await snapshot()).status).toBe("ready");
	const state = await snapshot();
	const saved = await page.request.post(
		previewUrl.replace("/canvases/", "/review-state/"),
		{
			headers: {
				Origin: new URL(previewUrl).origin,
				"Content-Type": "application/json",
				"X-Canvas-Binding": String(state.bindingRevision),
				"X-Canvas-Changes": String(state.changesRevision),
			},
			data: {
				drafts: [
					{
						id: "saved-inline",
						content: "Keep this staged comment",
						anchor: {
							path: "/src/retry.ts",
							side: "modified",
							startLine: 2,
							endLine: 2,
							baseCommitId: "a".repeat(40),
							sourceCommitId: "b".repeat(40),
							iterationId: 2,
							changeTrackingId: 1,
						},
					},
				],
			},
		},
	);
	expect(saved.status()).toBe(200);
}

async function mutatePreview(
	page: Page,
	operation: string,
	input: Record<string, unknown>,
) {
	const status = await page.evaluate(
		async ({ operation, input }) => {
			const id = location.pathname.split("/").at(-1);
			const state = await (await fetch(`/instances/${id}`)).json();
			return (
				await fetch(`/mutate/${id}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Canvas-Binding": String(state.bindingRevision),
						"X-Canvas-Changes": String(state.changesRevision),
					},
					body: JSON.stringify({ operation, input }),
				})
			).status;
		},
		{ operation, input },
	);
	expect(status).toBe(200);
}

test("Approve and its vote menu apply immediately and restore focus", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		const options = page.getByRole("button", {
			name: "Review options",
			exact: true,
		});
		await expect(approve).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Review", exact: true }),
		).toHaveCount(0);
		await approve.click();
		await expect(page.getByRole("form", { name: "Approve" })).toHaveCount(0);
		await expect(page.getByTestId("reviewers")).toContainText("Approved");
		await expect.poll(() => writes.length).toBe(1);
		expect(writes).toEqual([{ operation: "vote", input: { vote: 10 } }]);
		await expect(approve).toBeFocused();
		await options.focus();
		await page.keyboard.press("ArrowDown");
		const menu = page.getByRole("menu", { name: "Review options" });
		await expect(
			menu.getByRole("menuitem", { name: "Approve", exact: true }),
		).toBeFocused();
		await expect(
			menu.getByRole("menuitemradio", { name: "Approve", exact: true }),
		).toHaveCount(0);
		await page.keyboard.press("End");
		await expect(
			menu.getByRole("menuitem", { name: "Reset feedback" }),
		).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(options).toBeFocused();
		await options.click();
		await menu.getByRole("menuitem", { name: "Wait for author" }).click();
		await expect(page.getByTestId("reviewers")).toContainText(
			"Waiting for author",
		);
		await expect(options).toBeFocused();
		await expect.poll(() => writes.length).toBe(2);
		expect(writes).toEqual([
			{ operation: "vote", input: { vote: 10 } },
			{ operation: "vote", input: { vote: -5 } },
		]);
		await options.click();
		await menu
			.getByRole("menuitem", { name: "Approve with suggestions" })
			.click();
		await expect(page.getByTestId("reviewers")).toContainText(
			"Approved with suggestions",
		);
		await options.click();
		await menu.getByRole("menuitem", { name: "Reject" }).click();
		await expect(page.getByTestId("reviewers")).toContainText("Rejected");
		await options.click();
		await menu.getByRole("menuitem", { name: "Reset feedback" }).click();
		await expect(page.getByTestId("reviewers")).toContainText("No vote");
		await approve.click();
		await expect(page.getByTestId("reviewers")).toContainText("Approved");
		await expect.poll(() => writes.length).toBe(6);
		expect(writes).toEqual([
			{ operation: "vote", input: { vote: 10 } },
			{ operation: "vote", input: { vote: -5 } },
			{ operation: "vote", input: { vote: 5 } },
			{ operation: "vote", input: { vote: -10 } },
			{ operation: "vote", input: { vote: 0 } },
			{ operation: "vote", input: { vote: 10 } },
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("canvas exposes only standalone Reactivate for an abandoned pull request", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({ completionReady: true });
	try {
		await page.goto(preview.url);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Publish", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await page
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();
		const addReviewer = page.getByRole("form", { name: "Add reviewer" });
		await expect(addReviewer).toBeVisible();
		await mutatePreview(page, "abandon", { confirm: true });
		const reactivate = page.getByRole("button", {
			name: "Reactivate",
			exact: true,
		});
		await expect(reactivate).toBeVisible();
		await expect(reactivate.locator("xpath=..")).not.toHaveClass(
			"split-control",
		);
		await expect(reactivate.locator("xpath=..")).not.toHaveAttribute(
			"role",
			"group",
		);
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Review options", exact: true }),
		).toHaveCount(0);
		await expect(addReviewer).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Add reviewer", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Options for Grace Hopper" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await reactivate.click();
		await expect(
			page.getByRole("form", { name: "Reactivate pull request" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#header-title")).toBeFocused();
		await expect(
			page.getByRole("button", { name: "Add reviewer", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Options for Grace Hopper" }),
		).toBeVisible();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("authorization failures keep PR details readable and actions unavailable", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({
		authorizationError: new Error("Private permission service detail"),
	});
	try {
		await page.goto(preview.url);
		await expect(
			page.getByRole("heading", {
				name: "[Preview] Improve retry handling",
				exact: true,
			}),
		).toBeVisible();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"Write authorization could not be verified",
		);
		await expect(page.locator("#thread-1")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Pull request actions", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", {
				name: "Edit pull request title",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(
			page.getByRole("form", { name: "Add comment", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", {
				name: "Actions for Sam Example",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Access", exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#access-status")).toHaveCount(0);
		await expect(
			page.getByText("Private permission service detail", { exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#notice")).toHaveText("");
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#notice")).toContainText(
			"Write authorization could not be verified",
		);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("restricted edit and comment grants expose existing controls without broader discussion writes", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({
		operations: ["edit", "comment", "edit-comment", "delete-comment"],
	});
	const writes: unknown[] = [];
	const snapshotUrl = preview.url.replace("/canvases/", "/instances/");
	const waitForSettledRefresh = async () => {
		let previousRevision = -1;
		await expect
			.poll(async () => {
				const snapshot = await (await page.request.get(snapshotUrl)).json();
				const settled =
					snapshot.status === "ready" &&
					snapshot.mutation.status === "ready" &&
					snapshot.overview.status === "ready" &&
					snapshot.revision === previousRevision;
				previousRevision = snapshot.revision;
				return settled;
			})
			.toBe(true);
	};
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const titleRow = page.locator(".title-row");
		const editTitle = titleRow.getByRole("button", {
			name: "Edit pull request title",
			exact: true,
		});
		await titleRow.hover();
		await editTitle.click();
		const titleInput = titleRow.getByRole("textbox", {
			name: "Edit pull request title",
			exact: true,
		});
		await titleInput.fill("Production pull request title");
		await titleInput.press("Enter");
		await expect(
			titleRow.getByRole("heading", {
				name: "Production pull request title",
				exact: true,
			}),
		).toBeVisible();

		const thread = page.locator("#thread-1");
		await expect(thread).toBeVisible();
		await expect(
			thread.getByRole("button", { name: "Reply", exact: true }),
		).toHaveCount(0);
		await expect(
			thread.getByRole("button", { name: "Resolve", exact: true }),
		).toHaveCount(0);
		await expect(
			thread.getByRole("button", {
				name: "Change comment status",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(
			thread.getByRole("button", {
				name: "Actions for Ada Example",
				exact: true,
			}),
		).toHaveCount(0);

		const ownActions = thread.getByRole("button", {
			name: "Actions for Sam Example",
			exact: true,
		});
		await ownActions.focus();
		await page.keyboard.press("Enter");
		const menu = page.getByRole("menu", {
			name: "Actions for Sam Example",
			exact: true,
		});
		await expect(menu.getByRole("menuitem")).toHaveText(["Edit", "Delete"]);
		await menu.getByRole("menuitem", { name: "Edit", exact: true }).click();
		const edit = thread.getByRole("form", { name: "Edit comment" });
		const editMode = edit.getByRole("tablist", { name: "Comment editor" });
		const editTab = editMode.getByRole("tab", {
			name: "Edit Markdown",
			exact: true,
		});
		const editPreviewTab = editMode.getByRole("tab", {
			name: "Preview Markdown",
			exact: true,
		});
		await expect(editTab).toHaveAttribute("aria-selected", "true");
		await expect(editTab).toHaveAttribute("tabindex", "0");
		await expect(editPreviewTab).toHaveAttribute("tabindex", "-1");
		const editInput = edit.getByRole("textbox", {
			name: "Comment",
			exact: true,
		});
		await editInput.fill("**Updated production reviewer comment**");
		await editPreviewTab.click();
		await expect(editPreviewTab).toHaveAttribute("aria-selected", "true");
		await expect(editPreviewTab).toBeFocused();
		await expect(editInput).toBeHidden();
		const editPreview = edit.getByRole("tabpanel", {
			name: "Preview Markdown",
			exact: true,
		});
		await expect(editPreview.locator("strong")).toHaveText(
			"Updated production reviewer comment",
		);
		await page.keyboard.press("ArrowLeft");
		await expect(editTab).toHaveAttribute("aria-selected", "true");
		await expect(editTab).toBeFocused();
		await expect(editInput).toBeVisible();
		await editPreviewTab.click();
		await edit
			.getByRole("button", { name: "Save comment", exact: true })
			.click();
		await expect(
			thread.getByText("Updated production reviewer comment", {
				exact: true,
			}),
		).toBeVisible();
		await waitForSettledRefresh();

		await ownActions.focus();
		await page.keyboard.press("Enter");
		await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
		const confirmation = page.getByRole("dialog", {
			name: "Delete comment",
			exact: true,
		});
		await confirmation
			.getByRole("button", { name: "Delete comment", exact: true })
			.click();
		await expect(thread.locator('[data-comment-id="1"]')).toHaveCount(0);
		await waitForSettledRefresh();

		const comment = page.getByRole("form", {
			name: "Add comment",
			exact: true,
		});
		const commentInput = comment.getByRole("textbox", {
			name: "Add a comment",
			exact: true,
		});
		await commentInput.focus();
		const commentMode = comment.getByRole("tablist", {
			name: "Comment editor",
		});
		const commentTabs = commentMode.getByRole("tab");
		await expect(commentTabs).toHaveCount(2);
		await expect(commentMode.locator('[role="tab"][tabindex="0"]')).toHaveCount(
			1,
		);
		const commentPreviewTab = commentMode.getByRole("tab", {
			name: "Preview Markdown",
			exact: true,
		});
		const cancel = comment.getByRole("button", {
			name: "Cancel",
			exact: true,
		});
		const save = comment.getByRole("button", { name: "Save", exact: true });
		await commentPreviewTab.click();
		await save.click();
		await expect(
			commentMode.getByRole("tab", {
				name: "Edit Markdown",
				exact: true,
			}),
		).toHaveAttribute("aria-selected", "true");
		await expect(commentInput).toBeFocused();
		await expect.poll(() => writes.length).toBe(3);
		await commentInput.fill("**Production top-level comment**");
		await commentPreviewTab.click();
		await expect(commentInput).toBeHidden();
		await expect(
			comment
				.getByRole("tabpanel", {
					name: "Preview Markdown",
					exact: true,
				})
				.locator("strong"),
		).toHaveText("Production top-level comment");
		const [modeBounds, cancelBounds, saveBounds] = await Promise.all(
			[commentMode, cancel, save].map((control) =>
				control.evaluate((element) => element.getBoundingClientRect().toJSON()),
			),
		);
		expect(modeBounds.x).toBeLessThan(cancelBounds.x);
		expect(cancelBounds.x).toBeLessThan(saveBounds.x);
		expect(Math.abs(modeBounds.top - cancelBounds.top)).toBeLessThanOrEqual(2);
		expect(Math.abs(cancelBounds.top - saveBounds.top)).toBeLessThanOrEqual(2);
		expect(
			await commentTabs.evaluateAll((tabs) =>
				tabs.map((tab) => ({
					width: tab.getBoundingClientRect().width,
					height: tab.getBoundingClientRect().height,
				})),
			),
		).toEqual([
			{ width: 28, height: 28 },
			{ width: 28, height: 28 },
		]);
		await save.click();
		await expect(
			page
				.getByTestId("threads")
				.getByText("Production top-level comment", { exact: true }),
		).toBeVisible();
		await commentInput.fill("Unsaved preview");
		await commentPreviewTab.click();
		await page.keyboard.press("Escape");
		await expect(commentInput).toHaveValue("");
		await expect(commentMode).toBeHidden();
		await expect(
			page.getByRole("heading", { name: /^Comments / }),
		).toBeFocused();
		await expect.poll(() => writes.length).toBe(4);
		expect(writes).toEqual([
			{
				operation: "edit",
				input: { title: "Production pull request title" },
			},
			{
				operation: "edit-comment",
				input: {
					threadId: 1,
					commentId: 1,
					content: "**Updated production reviewer comment**",
				},
			},
			{
				operation: "delete-comment",
				input: { threadId: 1, commentId: 1 },
			},
			{
				operation: "comment",
				input: { content: "**Production top-level comment**" },
			},
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

for (const { name, draft, exit } of [
	{ name: "empty", draft: "", exit: "pointer" },
	{ name: "whitespace", draft: "   ", exit: "keyboard" },
	{ name: "meaningful", draft: "**Keep my draft**", exit: "pointer" },
] as const) {
	test(`comment composer keeps a usable control when ${name} Preview drafts lose focus by ${exit}`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview({
			operations: ["edit", "comment", "edit-comment", "delete-comment"],
		});
		const writes: unknown[] = [];
		page.on("request", (request) => {
			if (request.url().includes("/mutate/"))
				writes.push(request.postDataJSON());
		});
		try {
			await page.goto(preview.url);
			await expect(page.locator("#thread-1")).toBeVisible();
			const comment = page.getByRole("form", {
				name: "Add comment",
				exact: true,
			});
			const input = comment.getByRole("textbox", {
				name: "Add a comment",
				exact: true,
			});
			const editTab = comment.getByRole("tab", {
				name: "Edit Markdown",
				exact: true,
			});
			const previewTab = comment.getByRole("tab", {
				name: "Preview Markdown",
				exact: true,
			});
			await input.fill(draft);
			await input.focus();
			await expect(comment).toHaveAttribute("data-expanded", "true");
			await previewTab.click();
			await expect(input).toBeHidden();

			const outside = page.locator("#header-title");
			if (exit === "pointer") {
				await outside.click();
				await expect(outside).toBeFocused();
			} else {
				for (let presses = 0; presses < 10; presses++) {
					if (
						!(await comment.evaluate((form) =>
							form.contains(document.activeElement),
						))
					)
						break;
					await page.keyboard.press("Tab");
				}
			}
			await expect
				.poll(() =>
					comment.evaluate((form) => form.contains(document.activeElement)),
				)
				.toBe(false);
			const outsideFocus = await page.evaluate(
				() => document.activeElement?.outerHTML,
			);

			if (draft.trim()) {
				await expect(comment).toHaveAttribute("data-expanded", "true");
				await expect(previewTab).toHaveAttribute("aria-selected", "true");
				await expect(input).toBeHidden();
				await expect(editTab).toBeVisible();
				await expect(
					comment.getByRole("button", { name: "Save", exact: true }),
				).toBeVisible();
			} else {
				await expect(comment).toHaveAttribute("data-expanded", "false");
				await expect(
					comment.locator('[role="tab"][aria-label="Edit Markdown"]'),
				).toHaveAttribute("aria-selected", "true");
				await expect(input).toBeVisible();
				await expect(comment.getByRole("tablist")).toBeHidden();
				expect(
					await page.evaluate(() => document.activeElement?.outerHTML),
				).toBe(outsideFocus);
				await input.click();
				await expect(input).toBeFocused();
				await expect(comment).toHaveAttribute("data-expanded", "true");
			}
			await expect(comment.locator("textarea")).toHaveValue(draft);
			expect(writes).toEqual([]);
		} finally {
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

for (const surface of [
	"description editor",
	"comment composer",
	"review popup",
	"already-open review popup",
] as const) {
	test(`hover-only copy tooltip lets Escape dismiss the ${surface}`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview();
		const writes: unknown[] = [];
		page.on("request", (request) => {
			if (request.url().includes("/mutate/"))
				writes.push(request.postDataJSON());
		});
		try {
			await page.goto(preview.url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await page.clock.install();
			const description = page.getByRole("textbox", {
				name: "Description",
				exact: true,
			});
			const composer = page.getByRole("form", {
				name: "Add comment",
				exact: true,
			});
			const comment = composer.getByRole("textbox", {
				name: "Add a comment",
				exact: true,
			});
			const options = page.getByRole("button", {
				name: "Review options",
				exact: true,
			});
			if (surface === "description editor") {
				await page.locator(".description-card").hover();
				await page
					.getByRole("button", {
						name: "Edit pull request description",
						exact: true,
					})
					.click();
				await description.fill("Cancel this description edit.");
			} else if (surface === "comment composer") {
				await comment.fill("Cancel this comment draft.");
				await expect(composer).toHaveAttribute("data-expanded", "true");
			} else {
				await options.focus();
				if (surface === "already-open review popup")
					await options.press("ArrowDown");
			}
			await page.locator(".title-row").hover();
			await page
				.getByRole("button", { name: "Copy PR URL", exact: true })
				.hover();
			await page.clock.fastForward(100);
			await expect(page.getByRole("tooltip")).toHaveText("Copy PR URL");
			const menu = page.getByRole("menu", { name: "Review options" });
			if (surface === "description editor")
				await expect(description).toBeFocused();
			else if (surface === "comment composer")
				await expect(comment).toBeFocused();
			else {
				// Register the popup after the hover tooltip's capture listener.
				if (surface === "review popup") await options.press("ArrowDown");
				await expect(menu).toBeVisible();
				await expect(
					menu.getByRole("menuitem", { name: "Approve", exact: true }),
				).toBeFocused();
				await expect(page.getByRole("tooltip")).toBeVisible();
			}
			await page.keyboard.press("Escape");
			await expect(page.getByRole("tooltip")).toHaveCount(0);
			if (surface === "description editor") {
				await expect(description).toHaveCount(0);
				await expect(
					page.getByRole("button", {
						name: "Edit pull request description",
						exact: true,
					}),
				).toBeFocused();
			} else if (surface === "comment composer") {
				await expect(composer).toHaveAttribute("data-expanded", "false");
				await expect(comment).toHaveValue("");
				await expect(
					page.getByRole("heading", { name: /^Comments / }),
				).toBeFocused();
			} else {
				await expect(menu).toBeHidden();
				await expect(options).toBeFocused();
			}
			expect(writes).toEqual([]);
		} finally {
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

for (const pause of ["none", "hover", "focus"] as const) {
	test(`canvas feedback shows edit-conflict guidance transiently without a footer (${pause})`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview();
		try {
			await page.goto(preview.url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await page.clock.install({
				time: new Date("2026-10-16T20:00:00Z"),
			});
			await page.clock.pauseAt(new Date("2026-10-16T20:00:01Z"));
			await page.locator(".description-card").hover();
			await page
				.getByRole("button", {
					name: "Edit pull request description",
					exact: true,
				})
				.click();
			const description = page.getByRole("textbox", {
				name: "Description",
				exact: true,
			});
			await description.fill("Keep this unsaved description.");
			await page.locator(".title-row").hover();
			await page
				.getByRole("button", { name: "Edit pull request title", exact: true })
				.click();
			const toast = page.locator("#canvas-toast");
			await expect(toast).toBeVisible();
			await expect(page.locator("#toast-message")).toHaveText(
				"Save or cancel the description edit before editing the title.",
			);
			await expect(description).toHaveValue("Keep this unsaved description.");
			await expect(description).toBeFocused();
			await expect(page.locator("#canvas-footer")).toBeHidden();
			await page.clock.fastForward(4_000);
			if (pause !== "none") {
				const close = toast.getByRole("button", {
					name: "Close notification: Pull request",
					exact: true,
				});
				if (pause === "hover") await toast.hover();
				else await close.focus();
				await page.clock.fastForward(6_000);
				await expect(toast).toBeVisible();
				if (pause === "hover") {
					await close.focus();
					await description.hover();
				} else {
					await toast.hover();
					await description.focus();
				}
				await page.clock.fastForward(6_000);
				await expect(toast).toBeVisible();
				await description.hover();
				await description.focus();
				await page.clock.fastForward(4_999);
				await expect(toast).toBeVisible();
				await page.clock.fastForward(1);
			} else {
				await expect(toast).toBeVisible();
				await page.clock.fastForward(1_000);
			}
			await expect(toast).toBeHidden();
			await expect(description).toHaveValue("Keep this unsaved description.");
			await expect(description).toBeFocused();
		} finally {
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

test("standalone votes preserve drafts until dedicated staged-comment submission", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await stageInlineDraft(page, preview.url);
		await page.goto(preview.url);
		await expect(
			page.getByRole("heading", { name: "Staged comments · 1" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Review", exact: true }),
		).toHaveCount(0);
		const submit = page.getByRole("button", {
			name: "Submit staged comments",
			exact: true,
		});
		await expect(submit).toBeVisible();
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(
			page.getByText("Keep this staged comment", { exact: true }),
		).toBeVisible();
		await expect.poll(() => writes.length).toBe(1);
		expect(writes).toEqual([{ operation: "vote", input: { vote: 10 } }]);
		const reviewResponse = page.waitForResponse((response) =>
			response.url().includes("/mutate/"),
		);
		await submit.click();
		const reviewResult = await reviewResponse;
		expect(reviewResult.ok()).toBe(true);
		await expect(
			page
				.locator("#review-actions")
				.getByText("Keep this staged comment", { exact: true }),
		).toHaveCount(0);
		await expect(submit).toHaveCount(0);
		await expect(
			page
				.getByTestId("threads")
				.getByText("Keep this staged comment", { exact: true }),
		).toBeVisible();
		await expect.poll(() => writes.length).toBe(2);
		expect(writes).toEqual([
			{ operation: "vote", input: { vote: 10 } },
			{ operation: "review", input: {} },
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("reviewer typeahead ignores Enter while IME composition is active", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		await page
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();
		const addForm = page.getByRole("form", { name: "Add reviewer" });
		const search = addForm.getByLabel(
			"Reviewer name, email, alias, or identity ID",
		);
		const response = page.waitForResponse((result) =>
			result.url().includes("/search-reviewers/"),
		);
		await search.fill("v-qirenlu");
		expect((await response).ok()).toBe(true);
		const results = addForm.locator(".reviewer-search-result");
		await expect(results).toHaveCount(2);

		await search.evaluate((element) => {
			element.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					isComposing: true,
					key: "Enter",
				}),
			);
			const legacyComposition = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Enter",
			});
			Object.defineProperty(legacyComposition, "keyCode", { value: 229 });
			element.dispatchEvent(legacyComposition);
		});

		await expect(search).toHaveValue("v-qirenlu");
		await expect(results).toHaveCount(2);
		await search.press("Enter");
		await expect(search).toHaveValue("Qiren Lu (v-qirenlu@microsoft.com)");
		await expect(results).toHaveCount(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("reviewer-only grants search, add, and remove reviewers", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({ operations: ["reviewer"] });
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		await expect(
			page.getByRole("button", { name: "Add reviewer", exact: true }),
		).toBeVisible();
		for (const label of ["Approve", "Complete", "Edit pull request title"])
			await expect(
				page.getByRole("button", { name: label, exact: true }),
			).toHaveCount(0);
		await expect(
			page.getByRole("form", { name: "Add comment", exact: true }),
		).toHaveCount(0);

		await page
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();
		const addForm = page.getByRole("form", { name: "Add reviewer" });
		const search = addForm.getByLabel(
			"Reviewer name, email, alias, or identity ID",
		);
		const searchResponse = page.waitForResponse((response) =>
			response.url().includes("/search-reviewers/"),
		);
		await search.fill("v-qirenlu");
		expect((await searchResponse).ok()).toBe(true);
		await addForm
			.getByRole("button", {
				name: "Qiren Lu v-qirenlu@microsoft.com",
				exact: true,
			})
			.click();
		await expect(addForm.getByLabel("Required reviewer")).toHaveCount(0);
		await addForm
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();

		const optional = page.locator(
			'section[aria-labelledby="reviewer-group-optional"]',
		);
		await expect(optional.getByText("Qiren Lu", { exact: true })).toBeVisible();

		const qiren = page
			.locator(".reviewer-row")
			.filter({ has: page.getByText("Qiren Lu", { exact: true }) });
		await qiren.hover();
		await qiren.getByRole("button", { name: "Options for Qiren Lu" }).click();
		const menu = page.getByRole("menu", { name: "Options for Qiren Lu" });
		await expect(menu.getByRole("menuitem")).toHaveText(["Remove Qiren Lu"]);
		await menu.getByRole("menuitem", { name: "Remove Qiren Lu" }).click();
		await expect(
			page
				.locator(".reviewer-row")
				.filter({ has: page.getByText("Qiren Lu", { exact: true }) }),
		).toHaveCount(0);

		await expect.poll(() => writes.length).toBe(2);
		expect(writes).toEqual([
			{
				operation: "reviewer",
				input: {
					reviewerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					remove: false,
					isRequired: false,
				},
			},
			{
				operation: "reviewer",
				input: {
					reviewerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					remove: true,
				},
			},
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("reviewer add, removal, and comment states apply immediately without confirmations", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);

		const addTrigger = page.getByRole("button", {
			name: "Add reviewer",
			exact: true,
		});
		await addTrigger.click();
		const addForm = page.getByRole("form", { name: "Add reviewer" });
		const reviewerSearch = addForm.getByLabel(
			"Reviewer name, email, alias, or identity ID",
		);
		const reviewerSearchResponse = page.waitForResponse((response) =>
			response.url().includes("/search-reviewers/"),
		);
		await reviewerSearch.fill("v-qirenlu");
		await expect(
			addForm.getByRole("button", { name: "Search", exact: true }),
		).toHaveCount(0);
		const reviewerResponse = await reviewerSearchResponse;
		expect(reviewerResponse.ok()).toBe(true);
		const reviewerResults = addForm.locator(".reviewer-search-result");
		await expect(reviewerResults).toHaveCount(2);
		const qiren = addForm.getByRole("button", {
			name: "Qiren Lu v-qirenlu@microsoft.com",
			exact: true,
		});
		const qirenTest = addForm.getByRole("button", {
			name: "Qiren Lu (Test) v-qirenlu@contoso.com",
			exact: true,
		});
		await reviewerSearch.press("ArrowDown");
		await expect(qiren).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(qirenTest).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(qiren).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(reviewerSearch).toHaveValue(
			"Qiren Lu (v-qirenlu@microsoft.com)",
		);
		await expect(addForm.getByLabel("Required reviewer")).toHaveCount(0);
		await addForm
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();
		await expect(page.getByText("Qiren Lu", { exact: true })).toBeVisible();

		const grace = page
			.locator(".reviewer-row")
			.filter({ has: page.getByText("Grace Hopper", { exact: true }) });
		await grace.hover();
		await grace
			.getByRole("button", { name: "Options for Grace Hopper" })
			.click();
		await page
			.getByRole("menu", { name: "Options for Grace Hopper" })
			.getByRole("menuitem", { name: "Remove Grace Hopper" })
			.click();
		await expect(
			page.getByRole("form", { name: /remove grace hopper/i }),
		).toHaveCount(0);
		await expect(
			page
				.locator(".reviewer-row")
				.filter({ has: page.getByText("Grace Hopper", { exact: true }) }),
		).toHaveCount(0);

		const thread = page.locator("#thread-1");
		const resolve = thread.getByRole("button", {
			name: "Resolve",
			exact: true,
		});
		const statusControl = thread.getByRole("group", {
			name: "Change comment status",
		});
		const statusMenuButton = statusControl.getByRole("button", {
			name: "Change comment status",
		});
		const actionHeights = await Promise.all(
			[resolve, statusMenuButton].map((control) =>
				control.evaluate((element) => element.getBoundingClientRect().height),
			),
		);
		expect(actionHeights).toEqual([28, 28]);
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		await statusMenuButton.click();
		const statusMenu = page.getByRole("menu", {
			name: "Change comment status",
		});
		await expect(statusMenu.getByRole("menuitem")).toHaveText([
			"Pending",
			"Won't fix",
			"Close",
		]);
		await expect(
			statusMenu.getByRole("menuitem", { name: "Pending" }),
		).toBeFocused();
		await page.keyboard.press("ArrowDown");
		const wontFix = statusMenu.getByRole("menuitem", { name: "Won't fix" });
		await expect(wontFix).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("form", { name: "Update thread" })).toHaveCount(
			0,
		);
		await expect(thread).toContainText("Won't fix");
		const resolvedLayout = await Promise.all(
			[
				thread.locator(".thread-actions"),
				thread.getByRole("button", { name: "Reply", exact: true }),
				thread.getByRole("button", { name: "Reopen", exact: true }),
			].map((element) =>
				element.evaluate((node) => node.getBoundingClientRect().toJSON()),
			),
		);
		expect(resolvedLayout[1].x).toBeCloseTo(resolvedLayout[0].x + 8, 1);
		expect(resolvedLayout[1].x).toBeLessThan(resolvedLayout[2].x);

		await expect.poll(() => writes.length).toBe(3);
		expect(writes).toEqual([
			{
				operation: "reviewer",
				input: {
					reviewerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					remove: false,
					isRequired: false,
				},
			},
			{
				operation: "reviewer",
				input: {
					reviewerId: "55555555-5555-4555-8555-555555555555",
					remove: true,
				},
			},
			{
				operation: "thread-status",
				input: { threadId: 1, status: "wontFix" },
			},
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("review-only grants can submit and clear staged comments", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({ operations: ["review"] });
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await stageInlineDraft(page, preview.url);
		await page.goto(preview.url);
		await expect(
			page.getByRole("button", { name: "Approve", exact: true }),
		).toHaveCount(0);
		const submit = page.getByRole("button", {
			name: "Submit staged comments",
			exact: true,
		});
		await expect(submit).toBeVisible();

		const reviewResponse = page.waitForResponse((response) =>
			response.url().includes("/mutate/"),
		);
		await submit.click();
		const reviewResult = await reviewResponse;
		expect(reviewResult.ok()).toBe(true);

		await expect(
			page
				.locator("#review-actions")
				.getByText("Keep this staged comment", { exact: true }),
		).toHaveCount(0);
		await expect(submit).toHaveCount(0);
		await expect(
			page
				.getByTestId("threads")
				.getByText("Keep this staged comment", { exact: true }),
		).toBeVisible();
		await expect.poll(() => writes.length).toBe(1);
		expect(writes).toEqual([{ operation: "review", input: {} }]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

for (const { name, operations, visible } of [
	{ name: "read-only", operations: [], visible: [] },
	{
		name: "vote-only",
		operations: ["vote"],
		visible: ["Approve", "Review options"],
	},
	{
		name: "review-only",
		operations: ["review"],
		visible: [],
	},
	{
		name: "reviewer-only",
		operations: ["reviewer"],
		visible: ["Add reviewer"],
	},
	{
		name: "edit-only",
		operations: ["edit"],
		visible: ["Edit pull request title"],
	},
	{
		name: "completion-only",
		operations: ["complete"],
		visible: [],
	},
	{
		name: "lifecycle-only",
		operations: ["draft", "abandon", "reactivate"],
		visible: [],
	},
]) {
	test(`${name} grants expose only the authorized review and state controls`, async ({
		page,
	}) => {
		const projectId = "22222222-2222-4222-8222-222222222222";
		const sourceCommit = "a".repeat(40);
		const targetCommit = "b".repeat(40);
		const repository = {
			organization: "fabrikam",
			project: projectId,
			repositoryId: "11111111-1111-4111-8111-111111111111",
			accountId: "fixture",
		};
		const canvas = createPullRequestCanvas({
			authentication: {
				getAccessToken: async () => ({ accessToken: "fixture" }),
			},
			...(operations.length
				? {
						getAccess: async () => ({
							viewerId: "44444444-4444-4444-8444-444444444444",
							operations,
						}),
					}
				: {}),
			fetch: async (input) => {
				const url = new URL(String(input));
				if (/\/pullrequests\/22$/.test(url.pathname))
					return Response.json({
						pullRequestId: 22,
						repository: {
							id: repository.repositoryId,
							project: { id: projectId },
						},
						title: "Read-only controls",
						status: "active",
						sourceRefName: "refs/heads/topic",
						targetRefName: "refs/heads/main",
						lastMergeSourceCommit: { commitId: sourceCommit },
						lastMergeTargetCommit: { commitId: targetCommit },
						mergeStatus: "succeeded",
						reviewers: [],
					});
				if (url.pathname.endsWith("/refs")) {
					const name = `refs/${url.searchParams.get("filter") ?? ""}`;
					const objectId =
						name === "refs/heads/topic"
							? sourceCommit
							: name === "refs/heads/main"
								? targetCommit
								: null;
					return Response.json({
						count: objectId ? 1 : 0,
						value: objectId ? [{ name, objectId }] : [],
					});
				}
				return Response.json({ count: 0, value: [] });
			},
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.getByTestId("pr-state")).toHaveText("Active");
			await expect(page.locator("#access-status")).toHaveCount(0);
			await expect(
				page.getByRole("button", { name: "Access", exact: true }),
			).toHaveCount(0);
			for (const label of [
				"Approve",
				"Review options",
				"Review",
				"Complete",
				"Pull request actions",
				"Edit pull request title",
				"Add reviewer",
			]) {
				const control = page.getByRole("button", { name: label, exact: true });
				if (visible.includes(label)) await expect(control).toBeVisible();
				else await expect(control).toHaveCount(0);
			}
		} finally {
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

for (const { status, label } of [
	{ status: "completed", label: "Completed" },
	{ status: "abandoned", label: "Abandoned" },
]) {
	test(`${label.toLowerCase()} pull requests keep reviewer controls read-only`, async ({
		page,
	}) => {
		const repository = {
			organization: "fabrikam",
			project: "tools",
			repositoryId: "11111111-1111-4111-8111-111111111111",
			accountId: "fixture",
		};
		const canvas = createPullRequestCanvas({
			authentication: {
				getAccessToken: async () => ({ accessToken: "fixture" }),
			},
			getAccess: async () => ({
				viewerId: "44444444-4444-4444-8444-444444444444",
				operations: ["reviewer"],
			}),
			fetch: async (input) =>
				/\/pullrequests\/22$/.test(new URL(String(input)).pathname)
					? Response.json({
							pullRequestId: 22,
							repository: {
								id: repository.repositoryId,
								project: { id: "22222222-2222-4222-8222-222222222222" },
							},
							title: `${label} pull request`,
							status,
							sourceRefName: "refs/heads/topic",
							targetRefName: "refs/heads/main",
							reviewers: [
								{
									id: "55555555-5555-4555-8555-555555555555",
									displayName: "Grace Hopper",
									vote: 5,
									isRequired: false,
								},
							],
						})
					: Response.json({ value: [] }),
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.getByTestId("pr-state")).toHaveText(label);
			const grace = page
				.locator(".reviewer-row")
				.filter({ has: page.getByText("Grace Hopper", { exact: true }) });
			await expect(grace).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Add reviewer", exact: true }),
			).toHaveCount(0);
			await expect(
				grace.getByRole("button", { name: "Options for Grace Hopper" }),
			).toHaveCount(0);
		} finally {
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

test("passive terminal state refreshes restore focus to a visible control", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.addInitScript(() => {
			const NativeEventSource = window.EventSource;
			window.EventSource = class extends NativeEventSource {
				constructor(...args: ConstructorParameters<typeof EventSource>) {
					super(...args);
					Object.assign(window, { previewEventSource: this });
				}
			};
		});
		await page.goto(preview.url);
		const snapshotUrl = preview.url.replace("/canvases/", "/instances/");
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return `${state.status}/${state.overview.status}/${state.completion.status}`;
			})
			.toBe("ready/ready/ready");
		await page.locator("#thread-1").scrollIntoViewIfNeeded();
		const codePreview = page.getByRole("region", {
			name: "Code preview for /src/retry.ts, thread 1",
		});
		await expect(codePreview).toBeVisible();
		const baseline = await (await page.request.get(snapshotUrl)).json();
		baseline.completion.data.completion = { status: "ready", reason: null };
		let nextRevision = baseline.revision + 1000;
		const pushSnapshot = async (
			mutateSnapshot: (draft: typeof baseline) => void,
		) => {
			const next = structuredClone(baseline);
			next.revision = ++nextRevision;
			mutateSnapshot(next);
			await page.evaluate((snapshot) => {
				const source = (window as Window & { previewEventSource?: EventSource })
					.previewEventSource;
				source?.close();
				source?.dispatchEvent(
					new MessageEvent("message", { data: JSON.stringify(snapshot) }),
				);
			}, next);
		};

		await codePreview.focus();
		await expect(codePreview).toBeFocused();
		await pushSnapshot((next) => {
			next.overview.data.threads[0].comments.push({
				id: 99,
				parentCommentId: 1,
				author: {
					id: "55555555-5555-4555-8555-555555555555",
					name: "Grace Hopper",
				},
				content: "Passive reply while code preview is focused.",
				publishedAt: "2026-09-10T09:10:00Z",
				updatedAt: "2026-09-10T09:10:00Z",
				commentType: "text",
				deleted: false,
				canEdit: false,
				canDelete: false,
				likedBy: [],
			});
		});
		await expect(page.locator("#thread-1")).toContainText(
			"Passive reply while code preview is focused.",
		);
		await expect(codePreview).toBeFocused();
		await expect(codePreview).toBeVisible();

		const reviewerOptions = page.getByRole("button", {
			name: "Options for Grace Hopper",
			exact: true,
		});
		await reviewerOptions.focus();
		await expect(reviewerOptions).toBeFocused();
		await pushSnapshot((next) => {
			next.overview.data.author.name = "Ada Lovelace (updated)";
		});
		await expect(page.locator("#author")).toHaveText("Ada Lovelace (updated)");
		await expect(reviewerOptions).toBeFocused();
		await expect(reviewerOptions).toBeVisible();

		await reviewerOptions.click();
		await expect(
			page
				.getByRole("menu", { name: "Options for Grace Hopper" })
				.getByRole("menuitem", { name: "Remove Grace Hopper" }),
		).toBeFocused();
		await pushSnapshot((next) => {
			next.overview.data.author.name = "Ada Lovelace (menu refresh)";
		});
		await expect(page.locator("#author")).toHaveText(
			"Ada Lovelace (menu refresh)",
		);
		await expect(reviewerOptions).toBeFocused();
		await expect(reviewerOptions).toBeVisible();

		const duplicateGraceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
		await pushSnapshot((next) => {
			next.overview.data.reviewers.push({
				id: duplicateGraceId,
				name: "Grace Hopper",
				vote: 0,
				isRequired: false,
			});
		});
		const duplicateReviewerOptions = page
			.locator(`[data-reviewer-id="${duplicateGraceId}"]`)
			.getByRole("button", {
				name: "Options for Grace Hopper",
				exact: true,
			});
		await duplicateReviewerOptions.click();
		await expect(
			page
				.locator(`[data-reviewer-id="${duplicateGraceId}"]`)
				.getByRole("menu", { name: "Options for Grace Hopper" })
				.getByRole("menuitem", { name: "Remove Grace Hopper" }),
		).toBeFocused();
		await pushSnapshot((next) => {
			next.overview.data.author.name = "Ada Lovelace (duplicate reviewer)";
			next.overview.data.reviewers.push({
				id: duplicateGraceId,
				name: "Grace Hopper",
				vote: 0,
				isRequired: false,
			});
		});
		await expect(page.locator("#author")).toHaveText(
			"Ada Lovelace (duplicate reviewer)",
		);
		await expect(duplicateReviewerOptions).toBeFocused();
		await expect(duplicateReviewerOptions).toBeVisible();

		for (const control of [
			"Approve",
			"Review options",
			"Add reviewer",
			"Options for Grace Hopper",
		]) {
			for (const state of ["merged", "closed"] as const) {
				await pushSnapshot(() => {});
				await expect(page.getByTestId("pr-state")).toHaveText("Active");
				const button = page.getByRole("button", {
					name: control,
					exact: true,
				});
				await expect(button).toBeVisible();
				await button.focus();
				await expect(button).toBeFocused();

				await pushSnapshot((next) => {
					next.pullRequest.state = state;
				});
				await expect(page.getByTestId("pr-state")).toHaveText(
					state === "merged" ? "Completed" : "Abandoned",
				);
				await expect(page.locator("#mutation-status")).toHaveText("");
				await expect(page.locator("#header-title")).toBeFocused();
				await expect(page.locator("#header-title")).toBeVisible();
			}
		}
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});
