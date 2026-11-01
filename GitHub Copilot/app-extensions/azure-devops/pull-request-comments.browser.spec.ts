import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

type CanvasEventWindow = Window & {
	canvasEvents: {
		latest?: import("./pull-request-snapshot.d.mts").Snapshot;
		held: string[];
		releaseErrors: () => void;
	};
};

async function observeCanvasEvents(page: Page, holdErrors = false) {
	await page.addInitScript((holdErrors) => {
		const NativeEventSource = window.EventSource;
		window.EventSource = class extends NativeEventSource {
			constructor(...args: ConstructorParameters<typeof EventSource>) {
				super(...args);
				const events: CanvasEventWindow["canvasEvents"] = {
					held: [],
					releaseErrors: () => {
						holdErrors = false;
						for (const data of events.held.splice(0))
							this.dispatchEvent(new MessageEvent("message", { data }));
					},
				};
				(window as CanvasEventWindow).canvasEvents = events;
				this.addEventListener("message", (event) => {
					const state = JSON.parse(event.data);
					if (holdErrors && state.mutation?.status === "error") {
						events.held.push(event.data);
						event.stopImmediatePropagation();
					} else events.latest = state;
				});
			}
		};
	}, holdErrors);
}

function trackMutations(page: Page) {
	const writes: { operation: string; input: Record<string, unknown> }[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/mutate/"))
			writes.push(request.postDataJSON());
	});
	return writes;
}

async function openReply(page: Page) {
	const thread = page.locator("#thread-1");
	const trigger = thread.locator('button[data-action="Reply"]');
	await trigger.click();
	const composer = thread.getByRole("form", { name: "Reply", exact: true });
	const input = composer.getByRole("textbox", { name: "Comment", exact: true });
	await expect(input).toBeFocused();
	return { thread, trigger, composer, input };
}

test("Add comment persists through the production client, refresh and reload", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes = trackMutations(page);
	try {
		await page.goto(preview.url);
		const composer = page.getByRole("form", {
			name: "Add comment",
			exact: true,
		});
		const input = composer.getByRole("textbox", {
			name: "Add a comment",
			exact: true,
		});
		await input.fill("**Persist this new PR comment**");
		await composer.getByRole("button", { name: "Save", exact: true }).click();
		const comment = page
			.getByTestId("threads")
			.getByText("Persist this new PR comment", { exact: true });
		await expect(comment).toBeVisible();
		await expect(input).toHaveValue("");
		await expect(composer).toHaveAttribute("data-expanded", "false");
		await preview.refresh();
		await expect(comment).toBeVisible();
		await page.reload();
		await expect(comment).toBeVisible();
		await expect(comment).toHaveCount(1);
		expect(writes).toEqual([
			{
				operation: "comment",
				input: { content: "**Persist this new PR comment**" },
			},
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("Reply replaces only its thread's action row until Cancel or Escape", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes = trackMutations(page);
	try {
		await page.goto(preview.url);
		const { thread, trigger, composer, input } = await openReply(page);
		await expect(trigger).toBeHidden();
		for (const name of ["Fix", "Resolve", "Change comment status"])
			await expect(
				thread.getByRole("button", { name, exact: true }),
			).toBeHidden();
		await expect(composer.getByRole("button")).toHaveText([
			"Cancel",
			"Reply",
			"Reply and resolve",
		]);
		const buttons = composer.getByRole("button");
		const heights = await buttons.evaluateAll((elements) =>
			elements.map((element) => element.getBoundingClientRect().height),
		);
		expect(heights).toEqual([heights[0], heights[0], heights[0]]);
		await expect(
			composer.getByRole("button", { name: "Reply", exact: true }),
		).toHaveAttribute("data-variant", "default");
		await expect(
			page
				.locator("#thread-3")
				.getByRole("button", { name: "Reply", exact: true }),
		).toBeVisible();
		await input.fill("Keep this draft during refresh");
		await preview.refresh();
		await expect(input).toHaveValue("Keep this draft during refresh");
		await expect(input).toBeFocused();
		await composer.getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(composer).toHaveCount(0);
		await expect(trigger).toBeFocused();
		for (const name of ["Fix", "Resolve", "Change comment status"])
			await expect(
				thread.getByRole("button", { name, exact: true }),
			).toBeVisible();
		await trigger.click();
		await expect(input).toHaveValue("");
		await input.fill("Discard this draft with Escape");
		await input.press("Escape");
		await expect(composer).toHaveCount(0);
		await expect(trigger).toBeFocused();
		expect(writes).toEqual([]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("Reply posts once to the existing thread without resolving it", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes = trackMutations(page);
	try {
		await page.goto(preview.url);
		const { thread, trigger, composer, input } = await openReply(page);
		await input.fill("**Reply without resolving**");
		await composer.getByRole("button", { name: "Reply", exact: true }).click();
		await expect(
			thread.getByText("Reply without resolving", { exact: true }),
		).toBeVisible();
		await expect(composer).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect(thread.getByText("Active", { exact: true })).toBeVisible();
		await page.reload();
		await expect(
			thread.getByText("Reply without resolving", { exact: true }),
		).toHaveCount(1);
		await expect(thread.getByText("Active", { exact: true })).toBeVisible();
		expect(writes).toEqual([
			{
				operation: "reply",
				input: { threadId: 1, content: "**Reply without resolving**" },
			},
		]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

for (const action of ["Reply", "Reply and resolve"]) {
	test(`${action} preserves focus moved outside the composer while submitting`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview();
		const responseHeld = Promise.withResolvers<void>();
		const releaseResponse = Promise.withResolvers<void>();
		await page.route("**/mutate/**", async (route) => {
			if (route.request().postDataJSON().operation !== "reply")
				return route.continue();
			const response = await route.fetch();
			responseHeld.resolve();
			await releaseResponse.promise;
			await route.fulfill({ response });
		});
		try {
			await page.goto(preview.url);
			const { thread, composer, input } = await openReply(page);
			await input.fill("Keep focus where I moved it");
			await composer.getByRole("button", { name: action, exact: true }).click();
			await responseHeld.promise;
			const outside = page.getByRole("button", {
				name: "Copy PR URL",
				exact: true,
			});
			await outside.focus();
			await expect(outside).toBeFocused();
			releaseResponse.resolve();
			await expect(composer).toHaveCount(0);
			await expect(
				thread.getByText("Keep focus where I moved it", { exact: true }),
			).toBeVisible();
			await expect(
				thread.getByText(action === "Reply" ? "Active" : "Resolved", {
					exact: true,
				}),
			).toBeVisible();
			await expect(outside).toBeFocused();
		} finally {
			releaseResponse.resolve();
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

test("Reply and resolve waits for the reply and prevents duplicate submissions", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes = trackMutations(page);
	let releaseReply!: () => void;
	const pendingReply = new Promise<void>((resolve) => {
		releaseReply = resolve;
	});
	await page.route("**/mutate/**", async (route) => {
		if (route.request().postDataJSON().operation === "reply")
			await pendingReply;
		await route.continue();
	});
	try {
		await page.goto(preview.url);
		const { thread, trigger, composer, input } = await openReply(page);
		await input.fill("Reply before resolving");
		const reply = composer.getByRole("button", { name: "Reply", exact: true });
		const resolve = composer.getByRole("button", {
			name: "Reply and resolve",
			exact: true,
		});
		await resolve.click();
		await expect.poll(() => writes.length).toBe(1);
		await expect(reply).toHaveAttribute("aria-disabled", "true");
		await expect(resolve).toHaveAttribute("aria-disabled", "true");
		await expect(input).toHaveJSProperty("readOnly", true);
		await reply.click({ force: true });
		expect(writes).toEqual([
			{
				operation: "reply",
				input: { threadId: 1, content: "Reply before resolving" },
			},
		]);
		releaseReply();
		await expect(composer).toHaveCount(0);
		await expect(
			thread.getByText("Reply before resolving", { exact: true }),
		).toBeVisible();
		await expect(thread.getByText("Resolved", { exact: true })).toBeVisible();
		await expect(trigger).toBeFocused();
		await expect(
			thread.getByRole("button", { name: "Reopen", exact: true }),
		).toBeVisible();
		expect(writes).toEqual([
			{
				operation: "reply",
				input: { threadId: 1, content: "Reply before resolving" },
			},
			{
				operation: "thread-status",
				input: { threadId: 1, status: "fixed" },
			},
		]);
		await page.reload();
		await expect(
			thread.getByText("Reply before resolving", { exact: true }),
		).toHaveCount(1);
		await expect(thread.getByText("Resolved", { exact: true })).toBeVisible();
	} finally {
		releaseReply();
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

for (const action of ["Reply", "Reply and resolve"]) {
	test(`${action} keeps a rejected reply's draft without resolving`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview();
		const writes = trackMutations(page);
		await page.route("**/mutate/**", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ error: "Reply rejected" }),
			}),
		);
		try {
			await page.goto(preview.url);
			const { thread, trigger, composer, input } = await openReply(page);
			await input.fill("Keep this failed reply draft");
			await composer.getByRole("button", { name: action, exact: true }).click();
			await expect(page.locator("#toast-message")).toContainText(
				"The action could not be confirmed.",
			);
			await expect(input).toHaveValue("Keep this failed reply draft");
			await expect(input).toHaveJSProperty("readOnly", false);
			await expect(trigger).toBeHidden();
			await expect(thread.getByText("Active", { exact: true })).toBeVisible();
			expect(writes).toEqual([
				{
					operation: "reply",
					input: { threadId: 1, content: "Keep this failed reply draft" },
				},
			]);
			await composer
				.getByRole("button", { name: "Cancel", exact: true })
				.click();
			await expect(trigger).toBeFocused();
		} finally {
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

for (const errorDelivery of ["before HTTP", "after HTTP"] as const) {
	test(`confirmed-reply recovery survives resolution errors delivered ${errorDelivery}`, async ({
		page,
	}) => {
		const preview = await startPullRequestPreview();
		const writes = trackMutations(page);
		await observeCanvasEvents(page, errorDelivery === "after HTTP");
		await page.route("**/mutate/**", async (route) => {
			const body = route.request().postDataJSON();
			if (body.operation === "thread-status") {
				const response = await route.fetch({
					postData: JSON.stringify({
						...body,
						input: { ...body.input, status: "invalid-status" },
					}),
				});
				expect(response.status()).toBe(400);
				if (errorDelivery === "before HTTP")
					await expect(page.locator("#mutation-status")).toContainText(
						"Select a supported thread status.",
					);
				await route.fulfill({ response });
			} else await route.continue();
		});
		try {
			await page.goto(preview.url);
			const { thread, trigger, composer, input } = await openReply(page);
			await input.fill("This reply was posted");
			await composer
				.getByRole("button", { name: "Reply and resolve", exact: true })
				.click();
			await expect(composer).toHaveCount(0);
			const guidance =
				"Your reply was posted, but thread resolution could not be confirmed. Do not post the reply again. Refresh to check the thread, then use Resolve if needed.";
			await expect(page.locator("#toast-message")).toHaveText(guidance);
			await expect(trigger).toBeFocused();
			if (errorDelivery === "after HTTP") {
				await expect
					.poll(() =>
						page.evaluate(
							() => (window as CanvasEventWindow).canvasEvents.held.length,
						),
					)
					.toBeGreaterThan(0);
				await page.evaluate(() =>
					(window as CanvasEventWindow).canvasEvents.releaseErrors(),
				);
			}
			await expect(page.locator("#mutation-status")).toHaveText(guidance);
			await page
				.getByRole("button", {
					name: "Close notification: Pull request action failed",
					exact: true,
				})
				.click();
			await expect(page.locator("#canvas-toast")).toBeHidden();
			await expect(page.locator("#mutation-status")).toHaveText(guidance);
			await expect(
				thread.getByRole("button", { name: "Resolve", exact: true }),
			).toBeVisible();
			expect(writes).toEqual([
				{
					operation: "reply",
					input: { threadId: 1, content: "This reply was posted" },
				},
				{
					operation: "thread-status",
					input: { threadId: 1, status: "fixed" },
				},
			]);
			await thread
				.getByRole("button", { name: "Resolve", exact: true })
				.click();
			await expect(page.locator("#mutation-status")).toHaveText(
				"Select a supported thread status.",
			);
			await page.reload();
			await page.evaluate(() =>
				(window as CanvasEventWindow).canvasEvents.releaseErrors(),
			);
			await expect(
				thread.getByText("This reply was posted", { exact: true }),
			).toHaveCount(1);
			await expect(thread.getByText("Active", { exact: true })).toBeVisible();
		} finally {
			await page.goto("about:blank").catch(() => {});
			await preview.dispose();
		}
	});
}

test("a binding change prevents an old reply completion from moving replacement PR focus", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const nativeFetch = window.fetch;
		window.fetch = (input, options) => {
			const resolution =
				typeof input === "string" &&
				input.startsWith("/mutate/") &&
				typeof options?.body === "string" &&
				JSON.parse(options.body).operation === "thread-status";
			return nativeFetch(
				input,
				resolution ? { ...options, signal: undefined } : options,
			);
		};
	});
	const repository = {
		organization: "fabrikam",
		project: "22222222-2222-4222-8222-222222222222",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture",
	};
	const author = {
		id: "44444444-4444-4444-8444-444444444444",
		displayName: "Sam Example",
	};
	const threads = new Map(
		[22, 23].map((id) => {
			const thread = {
				id: 1,
				status: "active",
				comments: [
					{
						id: 1,
						parentCommentId: 0,
						content: `Comment on PR ${id}`,
						commentType: 1,
						author,
					},
				],
			};
			return [id, thread] as const;
		}),
	);
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: author.id,
			operations: ["reply", "thread-status"],
		}),
		fetch: async (input, options) => {
			const path = new URL(String(input)).pathname;
			const id = Number(/\/pullrequests\/(\d+)/.exec(path)?.[1]);
			const thread = threads.get(id);
			if ((options?.method ?? "GET") !== "GET") {
				if (path.endsWith("/comments") && thread) {
					const body = JSON.parse(String(options?.body));
					const comment = { id: 2, author, ...body };
					thread.comments.push(comment);
					return Response.json(comment);
				}
				throw new Error("Unexpected discussion fixture write");
			}
			if (/\/pullrequests\/\d+$/.test(path))
				return Response.json({
					pullRequestId: id,
					repository: {
						id: repository.repositoryId,
						project: { id: repository.project },
					},
					title: `Reply binding ${id}`,
					status: "active",
					sourceRefName: "refs/heads/feature",
					targetRefName: "refs/heads/main",
					reviewers: [],
				});
			if (path.endsWith("/threads/1")) return Response.json(thread);
			return Response.json({
				value: path.endsWith("/threads") ? [thread] : [],
			});
		},
	});
	const instanceId = randomUUID();
	const resolutionStarted = Promise.withResolvers<void>();
	const releaseResolution = Promise.withResolvers<void>();
	await page.route("**/mutate/**", async (route) => {
		const body = route.request().postDataJSON();
		if (body.operation === "thread-status") {
			resolutionStarted.resolve();
			await releaseResolution.promise;
			await route.abort("failed");
		} else await route.continue();
	});
	try {
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const { composer, input } = await openReply(page);
		await input.fill("Reply to the previous PR");
		await composer
			.getByRole("button", { name: "Reply and resolve", exact: true })
			.click();
		await resolutionStarted.promise;
		canvas.setBinding(instanceId, { repository, pullRequestId: 23 });
		await expect(page.locator("#pr-title")).toHaveText("Reply binding 23");
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const focused = page.getByRole("button", {
			name: "Copy PR URL",
			exact: true,
		});
		await focused.focus();
		const rejected = page.waitForEvent("requestfailed", (request) =>
			request.url().includes("/mutate/"),
		);
		releaseResolution.resolve();
		await rejected;
		await page.evaluate(
			() => new Promise<number>((resolve) => requestAnimationFrame(resolve)),
		);
		await expect(focused).toBeFocused();
		await expect(composer).toHaveCount(0);
		await expect(page.locator("#canvas-toast")).toBeHidden();
		await expect(page.locator("#canvas-footer")).toBeHidden();
	} finally {
		releaseResolution.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("editing a later same-author reply restores its own menu after overview-before-HTTP refresh", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	await observeCanvasEvents(page);
	try {
		await page.goto(preview.url);
		const { thread, composer, input } = await openReply(page);
		await input.fill("Later reply from the same reviewer");
		await composer.getByRole("button", { name: "Reply", exact: true }).click();
		const later = thread.locator("[data-comment-id]").filter({
			has: page.getByText("Later reply from the same reviewer", {
				exact: true,
			}),
		});
		await expect(later).toBeVisible();
		const commentId = await later.getAttribute("data-comment-id");
		expect(commentId).toMatch(/^\d+$/);
		const edited = thread.locator(`[data-comment-id="${commentId}"]`);
		await edited.hover();
		await edited
			.getByRole("button", { name: "Actions for Sam Example" })
			.click();
		await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
		const edit = thread.getByRole("form", {
			name: "Edit comment",
			exact: true,
		});
		await edit
			.getByRole("textbox", { name: "Comment", exact: true })
			.fill("Updated later reply");
		await page.route("**/mutate/**", async (route) => {
			if (route.request().postDataJSON().operation !== "edit-comment")
				return route.continue();
			const response = await route.fetch();
			await expect
				.poll(() =>
					page.evaluate(
						(id) =>
							(
								window as CanvasEventWindow
							).canvasEvents.latest?.overview.data?.threads
								.find((thread) => thread.id === 1)
								?.comments.find((comment) => String(comment.id) === id)
								?.content,
						commentId,
					),
				)
				.toBe("Updated later reply");
			await route.fulfill({ response });
		});
		await edit
			.getByRole("button", { name: "Save comment", exact: true })
			.click();
		await expect(
			edited.getByText("Updated later reply", { exact: true }),
		).toBeVisible();
		await expect(
			edited.getByRole("button", { name: "Actions for Sam Example" }),
		).toBeFocused();
		await expect(
			thread.locator('[data-comment-id="1"]').getByRole("button", {
				name: "Actions for Sam Example",
			}),
		).not.toBeFocused();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("reply-only grants do not expose Reply and resolve", async ({ page }) => {
	const preview = await startPullRequestPreview({ operations: ["reply"] });
	try {
		await page.goto(preview.url);
		const { composer } = await openReply(page);
		await expect(composer.getByRole("button")).toHaveText(["Cancel", "Reply"]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});
