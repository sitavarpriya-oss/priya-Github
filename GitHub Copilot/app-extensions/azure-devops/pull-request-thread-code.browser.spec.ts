import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";

const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "thread-code-fixture",
	},
	pullRequestId: 22,
};
const base = "a".repeat(40);
const source = "b".repeat(40);

async function refreshCanvas(
	canvas: ReturnType<typeof createPullRequestCanvas>,
	instanceId: string,
) {
	const action = canvas.actions.find((action) => action.name === "refresh");
	if (!action) throw new Error("Refresh action missing");
	return action.handler({ instanceId, input: {} });
}

function thread(
	id: number,
	line: number | null = 2,
	path: string | null = "/src/example.ts",
) {
	return {
		id,
		status: id === 12 ? "fixed" : "active",
		comments: [
			{
				id: 1,
				content: `Discussion ${id}`,
				author: { id: "viewer", displayName: "Ada Author" },
				publishedDate: "2026-09-10T09:00:00Z",
				commentType: "text",
			},
		],
		threadContext: path
			? {
					filePath: path,
					...(line
						? {
								rightFileStart: { line, offset: 1 },
								rightFileEnd: { line, offset: 1 },
							}
						: {}),
				}
			: null,
		pullRequestThreadContext: {
			changeTrackingId: 1,
			iterationContext: {
				firstComparingIteration: 1,
				secondComparingIteration: 1,
			},
		},
	};
}

function fixture(
	options: {
		threads?: ReturnType<typeof thread>[];
		originalPath?: string;
		latestSource?: string;
		refreshIntervalMs?: number;
		readItem?: (
			url: URL,
			signal?: AbortSignal | null,
		) => Promise<Response | null>;
	} = {},
) {
	const state = {
		threads: options.threads ?? [thread(1)],
		prId: 22,
		authorName: "Ada Author",
	};
	const canvas = createPullRequestCanvas({
		refreshIntervalMs: options.refreshIntervalMs,
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "viewer",
			operations: ["reply", "edit-comment"],
		}),
		fetch: async (input, init) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/\d+$/.test(url.pathname))
				return Response.json({
					pullRequestId: state.prId,
					repository: {
						id: binding.repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: `Review ${state.prId}`,
					createdBy: { id: "viewer", displayName: state.authorName },
					status: "active",
					sourceRefName: "refs/heads/feature",
					targetRefName: "refs/heads/main",
					lastMergeSourceCommit: { commitId: options.latestSource ?? source },
					reviewers: [],
				});
			if (url.pathname.endsWith("/threads"))
				return Response.json({ value: state.threads });
			if (url.pathname.endsWith("/iterations"))
				return Response.json({
					value: [
						{
							id: 1,
							sourceRefCommit: { commitId: source },
							commonRefCommit: { commitId: base },
						},
						...(options.latestSource
							? [
									{
										id: 2,
										sourceRefCommit: { commitId: options.latestSource },
										commonRefCommit: { commitId: base },
									},
								]
							: []),
					],
				});
			if (url.pathname.endsWith("/changes"))
				return Response.json({
					changeEntries: [
						{
							changeTrackingId: 1,
							changeType: options.originalPath ? "rename, edit" : "edit",
							...(options.originalPath
								? { originalPath: options.originalPath }
								: {}),
							item: { path: "/src/example.ts" },
						},
					],
				});
			if (url.pathname.endsWith("/items")) {
				const result = await options.readItem?.(url, init?.signal);
				if (result) return result;
				return Response.json({
					path: url.searchParams.get("path"),
					commitId: url.searchParams.get("versionDescriptor.version"),
					gitObjectType: "blob",
					contentMetadata: { isBinary: false },
					content:
						url.searchParams.get("versionDescriptor.version") === base
							? "first\nbefore <script>text</script>\nlast\n"
							: "first\nafter <img src=x>\nlast\n",
				});
			}
			return Response.json({ value: [] });
		},
	});
	const instanceId = randomUUID();
	canvas.setBinding(instanceId, binding);
	return { canvas, state, instanceId };
}

test("discussion previews replace Changes and arrive without replacing a focused reply draft", async ({
	page,
}) => {
	const release = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	const { canvas, instanceId } = fixture({
		readItem: async () => {
			started.resolve();
			await release.promise;
			return null;
		},
	});
	const batches: unknown[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/load-thread-code/"))
			batches.push(request.postDataJSON());
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card.getByText("Discussion 1", { exact: true })).toBeVisible();
		await expect(page.getByRole("tablist")).toHaveCount(0);
		await expect(page.locator("#changes-panel")).toHaveCount(0);
		await started.promise;
		await card.getByRole("button", { name: "Reply", exact: true }).click();
		const input = card.getByRole("textbox", { name: "Comment", exact: true });
		await input.fill("Keep this local reply");
		await input.press("ArrowLeft");
		const selection = await input.evaluate(
			(input: HTMLTextAreaElement) => input.selectionStart,
		);
		release.resolve();
		const code = card.getByRole("table", { name: /Code diff/ });
		await expect(code).toContainText("after <img src=x>");
		await expect(input).toBeFocused();
		await expect(input).toHaveValue("Keep this local reply");
		expect(
			await input.evaluate(
				(input: HTMLTextAreaElement) => input.selectionStart,
			),
		).toBe(selection);
		await expect(card.locator("img, script")).toHaveCount(0);
		await expect(card.getByRole("button", { name: /^View \/src/ })).toHaveCount(
			0,
		);
		await expect(
			code.getByRole("row", { name: "Deleted original line 2" }),
		).toContainText("-");
		await expect(
			code.getByRole("row", { name: "Added modified line 2" }),
		).toContainText("+");
		expect(batches).toEqual([{ threadIds: [1] }]);
		const geometry = await card.evaluate((element) => {
			const rect = (selector: string) => {
				const part = element.querySelector(selector);
				if (!part) throw new Error(`Missing thread section: ${selector}`);
				return part.getBoundingClientRect();
			};
			return {
				header: rect(".comment-file-header").bottom,
				code: rect('[role="table"]').top,
				codeEnd: rect('[role="table"]').bottom,
				comment: rect(".thread-comments").top,
			};
		});
		expect(geometry.header).toBeLessThanOrEqual(geometry.code);
		expect(geometry.codeEnd).toBeLessThanOrEqual(geometry.comment);
	} finally {
		release.resolve();
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("discussion code previews syntax-highlight supported file types", async ({
	page,
}) => {
	const { canvas, instanceId } = fixture({
		readItem: async (url) =>
			Response.json({
				path: "/src/example.ts",
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: false },
				content:
					url.searchParams.get("versionDescriptor.version") === base
						? "first\nlet answer = 0;\nlast\n"
						: "first\nconst answer: number = 42;\nlast\n",
			}),
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const added = page
			.locator("#thread-1")
			.getByRole("row", { name: "Added modified line 2" })
			.locator("code");
		await expect(added).toHaveText("const answer: number = 42;");
		await expect(added).toHaveAttribute("data-syntax-highlighted", "true");
		await expect(added).toHaveAttribute("data-syntax-language", "typescript");
		await expect(added.locator(".syntax-keyword")).toHaveText("const");
		await expect(
			added.locator(".syntax-constant").filter({ hasText: "number" }),
		).toHaveText("number");
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("shows continuous discussion and fetches visible code in bounded batches", async ({
	page,
}) => {
	const threads = Array.from({ length: 12 }, (_, index) => thread(index + 1));
	threads.push(thread(13, null), thread(14, null, null));
	const { canvas, instanceId, state } = fixture({ threads });
	const batches: { threadIds: number[] }[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/load-thread-code/"))
			batches.push(request.postDataJSON());
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#threads > ul > li")).toHaveCount(14);
		await expect(
			page.getByRole("button", { name: /Next threads|Previous threads/ }),
		).toHaveCount(0);
		await page.locator("#thread-1").scrollIntoViewIfNeeded();
		await expect(page.locator("#thread-1").getByRole("table")).toBeVisible();
		expect(batches.some((batch) => batch.threadIds.includes(11))).toBe(false);
		await page.locator("#thread-11").scrollIntoViewIfNeeded();
		await expect(page.locator("#thread-11").getByRole("table")).toBeVisible();
		await expect(page.locator("#thread-13").getByRole("table")).toHaveCount(0);
		await expect(page.locator("#thread-14").getByRole("table")).toHaveCount(0);
		const filter = page.locator("#discussion-filter button");
		const sort = page.locator("#discussion-sort button");
		await filter.click();
		await page
			.getByRole("menuitemradio", { name: /^Resolved comments/ })
			.click();
		await expect(page.locator("#thread-12").getByRole("table")).toBeVisible();
		await filter.click();
		await page
			.getByRole("menuitemradio", { name: /^My comments\/replies/ })
			.click();
		await sort.click();
		await page
			.getByRole("menuitemradio", { name: "Newest first", exact: true })
			.click();
		await expect(page.locator("#threads > ul > li").first()).toHaveAttribute(
			"id",
			"thread-14",
		);
		await filter.click();
		await page.getByRole("menuitemradio", { name: /^Show everything/ }).click();
		await sort.click();
		await page
			.getByRole("menuitemradio", { name: "Oldest first", exact: true })
			.click();
		await expect(page.locator("#thread-1").getByRole("table")).toBeVisible();
		expect(batches.every((batch) => batch.threadIds.length <= 10)).toBe(true);
		state.threads = threads.map((thread) => ({
			...thread,
			status: thread.id > 12 ? "fixed" : "active",
		}));
		await refreshCanvas(canvas, instanceId);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await filter.click();
		await page
			.getByRole("menuitemradio", { name: /^Resolved comments/ })
			.click();
		await expect(page.locator("#thread-13")).toBeVisible();
		await expect(page.locator("#threads [role=table]")).toHaveCount(0);
		expect(
			batches.every((batch) => batch.threadIds.every((id) => id <= 12)),
		).toBe(true);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("preview failures retry explicitly, retain last-good code, and cancel without a retry loop", async ({
	page,
}) => {
	let fail = true;
	let slow = false;
	const release = Promise.withResolvers<void>();
	let reads = 0;
	const { canvas, instanceId } = fixture({
		readItem: async () => {
			reads++;
			if (slow) await release.promise;
			return fail ? new Response(null, { status: 503 }) : null;
		},
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card).toContainText("Code preview unavailable:");
		const retry = card.getByRole("button", {
			name: "Retry code preview",
			exact: true,
		});
		await expect(retry).toBeVisible();
		await expect.poll(() => reads).toBeGreaterThan(0);
		const failedReads = reads;
		await card.getByRole("button", { name: "Reply", exact: true }).click();
		await expect(
			card.getByRole("textbox", { name: "Comment", exact: true }),
		).toBeFocused();
		expect(reads).toBe(failedReads);
		await card.getByRole("button", { name: "Cancel", exact: true }).click();
		fail = false;
		await retry.click();
		await expect(card.getByRole("table")).toContainText("after <img src=x>");
		slow = true;
		// Start a code read with the existing preview still visible.
		await page.evaluate(async () => {
			const id = location.pathname.split("/").at(-1);
			const state = await (await fetch(`/instances/${id}`)).json();
			await fetch(`/load-thread-code/${id}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Canvas-Binding": String(state.bindingRevision),
				},
				body: JSON.stringify({ threadIds: [1] }),
			});
		});
		await expect(card).toContainText("Loading code preview");
		await refreshCanvas(canvas, instanceId);
		await expect(card).toContainText(/cancelled/i);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await retry.click();
		await expect(card).toContainText("Loading code preview");
		await page
			.getByRole("button", { name: "Cancel refresh", exact: true })
			.click();
		await expect(card).toContainText(/cancelled/i);
		await expect(card.getByRole("table")).toContainText("after <img src=x>");
		release.resolve();
		slow = false;
		fail = true;
		await retry.click();
		await expect(card).toContainText("Code preview unavailable:");
		await expect(card).toContainText("Showing last known code");
		await expect(card.getByRole("table")).toContainText("after <img src=x>");
	} finally {
		release.resolve();
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("a delayed preview acknowledgement does not block retry after cancellation", async ({
	page,
}) => {
	let fail = true;
	let slow = false;
	const releaseRead = Promise.withResolvers<void>();
	const releaseAck = Promise.withResolvers<void>();
	const { canvas, instanceId } = fixture({
		readItem: async () => {
			if (slow) await releaseRead.promise;
			return fail ? new Response(null, { status: 503 }) : null;
		},
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		const retry = card.getByRole("button", {
			name: "Retry code preview",
			exact: true,
		});
		await expect(card).toContainText("Code preview unavailable:");
		await expect(retry).toHaveAttribute("aria-disabled", "false");
		let first = true;
		await page.route("**/load-thread-code/**", async (route) => {
			const result = await route.fetch();
			if (first) {
				first = false;
				await releaseAck.promise;
			}
			await route.fulfill({ response: result });
		});
		fail = false;
		slow = true;
		await retry.click();
		await expect(card).toContainText("Loading code preview");
		await page
			.getByRole("button", { name: "Cancel refresh", exact: true })
			.click();
		await expect(card).toContainText(/cancelled/i);
		await expect(retry).toHaveAttribute("aria-disabled", "false");
		slow = false;
		await retry.click();
		await expect(card.getByRole("table")).toContainText("after <img src=x>");
	} finally {
		releaseRead.resolve();
		releaseAck.resolve();
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("scheduled discussion updates preserve reading position, code selection and keyboard focus", async ({
	page,
}) => {
	const { canvas, instanceId, state } = fixture({
		threads: Array.from({ length: 12 }, (_, index) => thread(index + 1)),
		refreshIntervalMs: 1000,
	});
	const batches: unknown[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/load-thread-code/"))
			batches.push(request.postDataJSON());
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#discussion-sort button")).toHaveText(
			"Newest first",
		);
		await page.locator("#thread-11").scrollIntoViewIfNeeded();
		const codeRegion = page
			.locator("#thread-11")
			.getByRole("region", { name: /Code preview/ });
		await codeRegion.focus();
		const code = page.locator("#thread-11 code").first();
		await expect(code).toHaveText("first");
		await code.evaluate((element) =>
			window.getSelection()?.selectAllChildren(element),
		);
		await expect(code).toBeInViewport();
		const readingTop = await code.evaluate(
			(element) => element.getBoundingClientRect().top,
		);
		const batchCount = batches.length;
		// Newest-first puts thread 12 above the reader and thread 10 below.
		// Growth above must adjust scrollTop, not move the selected code;
		// growth below must leave both the reading position and scrollTop alone.
		for (const id of [12, 10]) {
			const changedThread = page.locator(`#thread-${id}`);
			const height = await changedThread.evaluate(
				(element) => element.getBoundingClientRect().height,
			);
			const scroll = await page
				.locator("#details")
				.evaluate((element) => element.scrollTop);
			state.authorName = `Updated author ${id}`;
			state.threads[id - 1].comments.push({
				...state.threads[id - 1].comments[0],
				id: 2,
				content: `New comment on thread ${id}`,
			});
			await expect(page.locator("#author")).toHaveText(state.authorName);
			await expect(changedThread).toContainText(`New comment on thread ${id}`);
			await expect(code).toHaveText("first");
			await expect(codeRegion).toBeFocused();
			const growth =
				(await changedThread.evaluate(
					(element) => element.getBoundingClientRect().height,
				)) - height;
			expect(growth).toBeGreaterThan(0);
			expect(
				await code.evaluate((element) => element.getBoundingClientRect().top),
			).toBe(readingTop);
			expect(
				await page.locator("#details").evaluate((element) => element.scrollTop),
			).toBe(scroll + (id === 12 ? growth : 0));
			expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
				"first",
			);
			expect(batches).toHaveLength(batchCount);
		}
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("a file preview limit does not stop scheduled PR updates or retry the file", async ({
	page,
}) => {
	let fileReads = 0;
	const { canvas, instanceId, state } = fixture({
		refreshIntervalMs: 1000,
		readItem: async (url) => {
			fileReads++;
			return Response.json({
				path: url.searchParams.get("path"),
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: false },
				content: "x".repeat(1024 * 1024 + 1),
			});
		},
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card).toContainText(
			"Azure DevOps file content is too large to display (1 MiB text limit).",
		);
		const reads = fileReads;
		state.authorName = "Updated after preview limit";
		state.threads[0].comments.push({
			...state.threads[0].comments[0],
			id: 2,
			content: "A later upstream comment",
		});
		await expect(page.locator("#author")).toHaveText(state.authorName);
		await expect(card).toContainText("A later upstream comment");
		await expect(
			card.getByRole("button", { name: "Retry code preview" }),
		).toBeVisible();
		expect(fileReads).toBe(reads);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("recorded rename and historical versions are displayed rather than the current PR source", async ({
	page,
}) => {
	const versions: string[] = [];
	const { canvas, instanceId } = fixture({
		threads: [thread(1, 2, "/src/old-example.ts")],
		originalPath: "/src/old-example.ts",
		latestSource: "c".repeat(40),
		readItem: async (url) => {
			versions.push(url.searchParams.get("versionDescriptor.version") ?? "");
			return null;
		},
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card.getByRole("table")).toContainText("after <img src=x>");
		await expect(card.locator(".comment-file-header")).toContainText(
			"/src/example.ts:2",
		);
		await expect(card).toContainText("Previously /src/old-example.ts");
		await expect(card).toContainText(
			"Iteration 1 · Base aaaaaaaa · Source bbbbbbbb",
		);
		expect(versions).toEqual([base, source]);
		await expect(card.getByText(/cccccccc/)).toHaveCount(0);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("tracked historical code does not label recorded rows with a relocated current line", async ({
	page,
}) => {
	const recorded = {
		...thread(1, 99),
		pullRequestThreadContext: {
			...thread(1).pullRequestThreadContext,
			trackingCriteria: {
				firstComparingIteration: 0,
				secondComparingIteration: 1,
				origFilePath: "/src/example.ts",
				origRightFileStart: { line: 2, offset: 1 },
				origRightFileEnd: { line: 2, offset: 1 },
			},
		},
	};
	const { canvas, instanceId } = fixture({ threads: [recorded] });
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(
			card.getByRole("row", { name: "Added modified line 2" }),
		).toContainText("after");
		await expect(card.locator(".comment-file-header")).not.toContainText(":99");
		await expect(card.locator(".comment-file-header")).toContainText(
			"Preview coverage",
		);
		await expect(card.locator(".comment-file-header")).toContainText(
			"Modified lines 1–3",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("a changed context key removes old code while retaining a focused local draft", async ({
	page,
}) => {
	let hold = false;
	const release = Promise.withResolvers<void>();
	const { canvas, instanceId, state } = fixture({
		readItem: async () => {
			if (hold) await release.promise;
			return null;
		},
	});
	const batches: unknown[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/load-thread-code/"))
			batches.push(request.postDataJSON());
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card.getByRole("table")).toBeVisible();
		await card.getByRole("button", { name: "Reply", exact: true }).click();
		const comment = card.getByRole("textbox", { name: "Comment", exact: true });
		await comment.fill("Do not replace this draft");
		hold = true;
		state.threads = [thread(1, 99)];
		const response = await page.evaluate(async () => {
			const id = location.pathname.split("/").at(-1);
			const state = await (await fetch(`/instances/${id}`)).json();
			return (
				await fetch(`/load-overview/${id}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Canvas-Binding": String(state.bindingRevision),
					},
				})
			).status;
		});
		expect(response).toBe(202);
		await expect(card.getByRole("table")).toHaveCount(0);
		await expect(card.locator(".comment-file-header")).toContainText(":99");
		await expect(comment).toBeFocused();
		await expect(comment).toHaveValue("Do not replace this draft");
		release.resolve();
		await expect(card).toContainText("Code preview unavailable:");
		await expect(card.getByRole("table")).toHaveCount(0);
		expect(batches).toEqual([{ threadIds: [1] }, { threadIds: [1] }]);
	} finally {
		release.resolve();
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("stale preview acknowledgement cannot close a replacement binding", async ({
	page,
}) => {
	const release = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	const { canvas, instanceId, state } = fixture();
	await page.route("**/load-thread-code/**", async (route) => {
		expect(route.request().headers()["x-canvas-binding"]).toBeDefined();
		if (route.request().postDataJSON().threadIds.length) {
			started.resolve();
			await release.promise;
			await route.fulfill({ status: 403, body: "" });
		} else await route.continue();
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#thread-1")).toBeVisible();
		await started.promise;
		state.prId = 23;
		state.threads = [];
		canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
		await expect(
			page.getByRole("heading", { name: "Review 23", exact: true }),
		).toBeVisible();
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		await expect(page.locator("#threads")).toContainText(
			"No comments or activity.",
		);
		await expect(page.getByRole("table", { name: /Code diff/ })).toHaveCount(0);
	} finally {
		release.resolve();
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("binary preview failures and rejected batch requests stay explicit and require retry", async ({
	page,
}) => {
	const { canvas, instanceId } = fixture({
		readItem: async (url) =>
			Response.json({
				path: url.searchParams.get("path"),
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: true },
			}),
	});
	let rejected = true;
	const batches: unknown[] = [];
	await page.route("**/load-thread-code/**", async (route) => {
		batches.push(route.request().postDataJSON());
		if (rejected) await route.fulfill({ status: 409, body: "" });
		else await route.continue();
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const card = page.locator("#thread-1");
		await expect(card).toContainText(
			"Code preview unavailable: The pull request changed.",
		);
		await card.getByRole("button", { name: "Reply", exact: true }).click();
		await expect(
			card.getByRole("textbox", { name: "Comment", exact: true }),
		).toBeFocused();
		expect(batches).toHaveLength(1);
		await card.getByRole("button", { name: "Cancel", exact: true }).click();
		rejected = false;
		await card
			.getByRole("button", { name: "Retry code preview", exact: true })
			.click();
		await expect(card).toContainText(
			"Code preview unavailable: Azure DevOps thread code is unavailable",
		);
		await expect(card.getByRole("table")).toHaveCount(0);
		expect(batches).toHaveLength(2);
	} finally {
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

for (const colorScheme of ["light", "dark"] as const) {
	test(`plain code remains selectable and keyboard scrollable without page overflow in ${colorScheme}`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		const { canvas, instanceId } = fixture({
			readItem: async (url) =>
				Response.json({
					path: "/src/example.ts",
					commitId: url.searchParams.get("versionDescriptor.version"),
					gitObjectType: "blob",
					contentMetadata: { isBinary: false },
					content: `first\n${"long_identifier_".repeat(100)}\nlast\n`,
				}),
		});
		try {
			await page.setViewportSize({ width: 320, height: 720 });
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			const block = page.getByRole("region", { name: /Code preview for/ });
			await expect(block).toBeVisible();
			const sourceText = block.locator("code").nth(1);
			expect(
				await sourceText.evaluate((element) => {
					window.getSelection()?.selectAllChildren(element);
					return window.getSelection()?.toString();
				}),
			).toBe("long_identifier_".repeat(100).slice(0, 1_000));
			await expect(page.locator("#thread-1")).toContainText(
				"Code preview truncated.",
			);
			await block.focus();
			await block.press("ArrowRight");
			await expect
				.poll(() => block.evaluate((element) => element.scrollLeft))
				.toBeGreaterThan(0);
			for (const width of [320, 640, 1600]) {
				await page.setViewportSize({ width, height: 900 });
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
				const bounds = await block.boundingBox();
				if (!bounds) throw new Error("Missing code preview bounds");
				expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
			}
		} finally {
			await page.goto("about:blank");
			await canvas.dispose();
		}
	});
}

test("long code and comment bodies share the panel's only vertical scrollbar", async ({
	page,
}) => {
	const longThread = thread(1, 20);
	if (!longThread.threadContext?.rightFileEnd)
		throw new Error("Missing fixture line range");
	longThread.threadContext.rightFileEnd.line = 35;
	longThread.comments[0].content = `${"A long discussion paragraph. ".repeat(1500)}\n\nLast comment text`;
	const { canvas, instanceId } = fixture({
		threads: [longThread],
		readItem: async (url) =>
			Response.json({
				path: "/src/example.ts",
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: false },
				content: Array.from(
					{ length: 50 },
					(_, index) => `${index}: ${"long_identifier_".repeat(20)}`,
				).join("\n"),
			}),
	});
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const code = page.getByRole("region", { name: /Code preview for/ });
		await expect(code).toBeVisible();
		await expect(page.locator("#thread-1")).toContainText("Last comment text");
		await expect(page.locator(".render-pagination")).toHaveCount(0);
		expect(
			await code.evaluate((element) => element.scrollHeight),
		).toBeGreaterThan(300);
		for (const width of [1600, 640, 320]) {
			await page.setViewportSize({ width, height: 720 });
			expect(
				await page.evaluate(() => ({
					pageOverflow: document.documentElement.scrollHeight > innerHeight,
					scrollers: [...document.querySelectorAll<HTMLElement>("body *")]
						.filter(
							(element) =>
								/auto|scroll/.test(getComputedStyle(element).overflowY) &&
								element.clientHeight > 0 &&
								element.scrollHeight > element.clientHeight + 1,
						)
						.map((element) => element.id || element.className),
				})),
			).toEqual({ pageOverflow: false, scrollers: ["details"] });
			expect(
				await code.evaluate(
					(element) => element.scrollWidth > element.clientWidth,
				),
			).toBe(true);
		}
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});
