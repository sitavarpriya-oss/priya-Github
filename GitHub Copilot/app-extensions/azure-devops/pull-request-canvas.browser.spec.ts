import { randomUUID } from "node:crypto";
import { channel } from "node:diagnostics_channel";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";

// Real provider HTTP/SSE and browser UI; injected credentials and ADO responses.
const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "account-one",
	},
	pullRequestId: 22,
};

function response(overrides = {}) {
	return Response.json({
		pullRequestId: 22,
		repository: {
			id: binding.repository.repositoryId,
			project: { id: "22222222-2222-4222-8222-222222222222" },
		},
		title: "Update the tools",
		description: "Details for review",
		status: "active",
		isDraft: true,
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
		mergeStatus: "queued",
		reviewers: [],
		...overrides,
	});
}

function isPrimaryRequest(input: string | URL | Request) {
	const url = new URL(input instanceof Request ? input.url : input.toString());
	return /\/pullrequests\/\d+$/i.test(url.pathname);
}

function emptyResource() {
	return Response.json({ value: [] });
}

async function refreshCanvas(
	canvas: ReturnType<typeof createPullRequestCanvas>,
	instanceId: string,
) {
	const action = canvas.actions.find((action) => action.name === "refresh");
	if (!action) throw new Error("Refresh action missing");
	return action.handler({ instanceId, input: {} });
}

test("comment disclosures start collapsed and support native pointer and keyboard interaction", async ({
	page,
}) => {
	const content = [
		"Report overview.",
		"<details><summary><strong>Build report</strong></summary>",
		"## Results",
		"First paragraph.",
		"Second paragraph with `retryCount`.",
		"<details><summary>Compiler log</summary>",
		"```ts\nconst passed: boolean = true;\n```",
		"</details>",
		"</details>",
		"After the report.",
	].join("\n\n");
	let threadReads = 0;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			if (isPrimaryRequest(input)) return response();
			const url = new URL(
				input instanceof Request ? input.url : input.toString(),
			);
			if (!url.pathname.endsWith("/threads")) return emptyResource();
			threadReads++;
			return Response.json({
				value: [
					{
						id: 1,
						status: "active",
						comments: [
							{
								id: 1,
								author: { id: "reviewer", displayName: "Reviewer" },
								content,
								commentType: "text",
							},
						],
					},
					...(threadReads > 1
						? [
								{
									id: 2,
									status: "active",
									comments: [
										{
											id: 1,
											content: "Refreshed discussion reached the browser.",
											commentType: "text",
										},
									],
								},
							]
						: []),
				],
			});
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const comment = page.locator("#thread-1 .comment-body");
		const details = comment.locator("details").first();
		const summary = details.locator(":scope > summary");
		const nested = details.locator("details");
		const paragraph = comment.getByText("First paragraph.", { exact: true });
		const code = nested.locator("pre code");
		await expect(comment.getByText("Report overview.")).toBeVisible();
		await expect(comment.getByText("After the report.")).toBeVisible();
		await expect(summary).toHaveText("Build report");
		await expect(details).not.toHaveAttribute("open");
		await expect(paragraph).toBeHidden();
		await expect(code).toBeHidden();

		await summary.click();
		await expect(paragraph).toBeVisible();
		const firstParagraph = await paragraph.boundingBox();
		const secondParagraph = await comment
			.getByText("Second paragraph with retryCount.", { exact: true })
			.boundingBox();
		if (!firstParagraph || !secondParagraph)
			throw new Error("Expanded comment paragraphs are not visible");
		expect(secondParagraph.y).toBeGreaterThan(
			firstParagraph.y + firstParagraph.height,
		);
		await expect(nested).not.toHaveAttribute("open");
		await expect(code).toBeHidden();
		await nested.locator("summary").click();
		await expect(code).toBeVisible();
		await expect(code).toHaveAttribute("data-syntax-highlighted", "true");

		await summary.focus();
		await summary.press("Space");
		await expect(paragraph).toBeHidden();
		// WebKit retains layout boxes for open descendants of a closed disclosure.
		await expect
			.poll(() => code.evaluate((element) => element.checkVisibility()))
			.toBe(false);
		await expect(summary).toBeFocused();
		await summary.press("Enter");
		await expect(paragraph).toBeVisible();
		await expect(code).toBeVisible();
		await expect(summary).toHaveText("Build report");

		await refreshCanvas(canvas, instanceId);
		await expect(
			page
				.locator("#thread-2")
				.getByText("Refreshed discussion reached the browser.", {
					exact: true,
				}),
		).toBeVisible();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(paragraph).toBeVisible();
		await expect(code).toBeVisible();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

for (const activation of ["click", "Enter"]) {
	test(`opening a description disclosure by ${activation} keeps its full report reachable`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 640, height: 900 });
		const description = [
			"Short introduction.",
			"<details><summary>Detailed report</summary>",
			...Array.from(
				{ length: 20 },
				(_, index) => `Report paragraph ${index + 1}.`,
			),
			"</details>",
		].join("\n\n");
		const canvas = createPullRequestCanvas({
			authentication: {
				getAccessToken: async () => ({ accessToken: "fixture-token" }),
			},
			fetch: async (input) =>
				isPrimaryRequest(input) ? response({ description }) : emptyResource(),
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, binding);
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			const summary = page.locator("#description summary");
			const fullDescription = page.getByRole("button", {
				name: "Full description",
				exact: true,
			});
			await expect(summary).toBeVisible();
			await expect(fullDescription).toBeHidden();
			if (activation === "click") await summary.click();
			else await summary.press(activation);
			await expect(fullDescription).toBeVisible();
			await expect(fullDescription).toHaveAttribute("aria-expanded", "true");
			await expect(page.locator("#description-content")).toHaveAttribute(
				"data-collapsed",
				"false",
			);
			const lastParagraph = page
				.locator("#description")
				.getByText("Report paragraph 20.", { exact: true });
			await lastParagraph.scrollIntoViewIfNeeded();
			await expect(lastParagraph).toBeInViewport();
			await fullDescription.click();
			await expect(fullDescription).toHaveAttribute("aria-expanded", "false");
		} finally {
			await page.goto("about:blank");
			await canvas.dispose();
		}
	});
}

test("wide Markdown reports scroll locally by keyboard without overflowing the PR", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 900 });
	const markdown = [
		"[Report reference](https://example.com/report)",
		`| First | Second | Third | Last |\n| --- | --- | --- | --- |\n| \`one\` | \`two\` | \`three\` | ${"unbroken".repeat(80)} |`,
		`\`\`\`ts\nconst report = "${"literal".repeat(120)}";\n\`\`\``,
	].join("\n\n");
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			if (isPrimaryRequest(input)) return response({ description: markdown });
			const url = new URL(
				input instanceof Request ? input.url : input.toString(),
			);
			return url.pathname.endsWith("/threads")
				? Response.json({
						value: [
							{
								id: 1,
								status: "active",
								comments: [{ id: 1, content: markdown }],
							},
						],
					})
				: emptyResource();
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		for (const scope of [
			page.locator("#description"),
			page.locator("#thread-1 .comment-body"),
		]) {
			await expect(
				scope.getByRole("link", {
					name: "Report reference. Opens in a new browser tab.",
					exact: true,
				}),
			).toHaveCSS("text-decoration-line", "underline");
			for (const label of ["Scrollable table", "Code"]) {
				const scroll = scope.getByRole("group", {
					name: label,
					exact: true,
				});
				await expect(scroll).toHaveAttribute("tabindex", "0");
				await scroll.focus();
				await expect(scroll).toBeFocused();
				await expect(scroll).toHaveCSS("outline-style", "solid");
				expect(
					await scroll.evaluate(
						(element) => element.scrollWidth > element.clientWidth,
					),
				).toBe(true);
				await scroll.press("ArrowRight");
				await expect
					.poll(() => scroll.evaluate((element) => element.scrollLeft))
					.toBeGreaterThan(0);
			}
		}
		expect(
			await page
				.locator("#details")
				.evaluate((element) => element.scrollWidth - element.clientWidth),
		).toBeLessThanOrEqual(1);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - innerWidth,
			),
		).toBeLessThanOrEqual(1);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("automatic read failures expose recovery without a permanent footer or Access", async ({
	page,
}) => {
	let failed = false;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		getAccess: async () => ({ viewerId: "viewer", operations: ["comment"] }),
		refreshIntervalMs: 1000,
		fetch: async (input) =>
			isPrimaryRequest(input)
				? failed
					? new Response(null, { status: 503 })
					: response({ isDraft: false })
				: emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(page.locator(".canvas-footer")).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Refresh", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Access", exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#access-status")).toHaveCount(0);
		const draft = page.getByRole("textbox", {
			name: "Add a comment",
			exact: true,
		});
		await draft.fill("Keep this draft through read recovery.");
		await draft.focus();
		failed = true;
		await expect(page.getByTestId("refresh-status")).toContainText("HTTP 503");
		await expect(page.locator(".canvas-footer")).toBeVisible();
		await expect(page.locator("#canvas-toast")).toBeHidden();
		await expect(draft).toBeFocused();
		await expect(draft).toHaveValue("Keep this draft through read recovery.");
		failed = false;
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(page.locator(".canvas-footer")).toBeHidden();
		await expect(draft).toHaveValue("Keep this draft through read recovery.");
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("focused Refresh moves to the visible connection message on disconnect", async ({
	page,
}) => {
	const instanceId = randomUUID();
	let stream: ServerResponse | undefined;
	const requests = channel("http.server.request.start");
	const observe = (message: unknown) => {
		const { request, response } = message as {
			request: IncomingMessage;
			response: ServerResponse;
		};
		if (request.url === `/events/${instanceId}`) stream = response;
	};
	requests.subscribe(observe);
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input)
				? new Response(null, { status: 503 })
				: emptyResource(),
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const status = page.getByTestId("refresh-status");
		await expect(status).toContainText("HTTP 503");
		const refresh = page.getByRole("button", { name: "Refresh", exact: true });
		await refresh.focus();
		await expect(refresh).toBeFocused();
		await page.route("**/events/**", (route) =>
			route.abort("connectionfailed"),
		);
		if (!stream) throw new Error("Missing live event stream");
		stream.destroy();
		await expect(status).toContainText("Reconnecting");
		await expect(page.locator("#canvas-footer")).toBeVisible();
		await expect(page.locator("#refresh")).toBeHidden();
		await expect(status).toBeFocused();
	} finally {
		requests.unsubscribe(observe);
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("binding replacement restores visible focus from Copy PR URL to a different PR", async ({
	page,
}) => {
	const replacement = Promise.withResolvers<Response>();
	let next = async () => response();
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? next() : emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const copy = page.getByRole("button", { name: "Copy PR URL", exact: true });
		await copy.focus();
		await expect(copy).toBeFocused();
		next = () => replacement.promise.then((result) => result.clone());
		canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
		const cancel = page.getByRole("button", {
			name: "Cancel refresh",
			exact: true,
		});
		await expect(page.locator("#initial-loading")).toBeVisible();
		await expect(cancel).toBeFocused();
		replacement.resolve(
			response({ pullRequestId: 23, title: "Replacement PR" }),
		);
		await expect(
			page.getByRole("heading", { name: "Replacement PR" }),
		).toBeVisible();
		await expect(page.locator("#header-title")).toBeFocused();
	} finally {
		replacement.resolve(response({ pullRequestId: 23 }));
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("unavailable to idle and loading retains restoration without stealing later visible focus", async ({
	page,
}) => {
	const instanceId = randomUUID();
	let stream: ServerResponse | undefined;
	let restoreStream: (() => void) | undefined;
	const requests = channel("http.server.request.start");
	const observe = (message: unknown) => {
		const { request, response } = message as {
			request: IncomingMessage;
			response: ServerResponse;
		};
		if (request.url === `/events/${instanceId}`) stream = response;
	};
	requests.subscribe(observe);
	const replacement = Promise.withResolvers<Response>();
	const overview = Promise.withResolvers<void>();
	let next = async () => response();
	let holdOverview = false;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			if (isPrimaryRequest(input)) return next();
			if (holdOverview) await overview.promise;
			return emptyResource();
		},
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		canvas.setBinding(instanceId, null);
		const status = page.getByTestId("refresh-status");
		await expect(status).toContainText("Reopen the pull request");
		await status.focus();
		await expect(status).toBeFocused();
		if (!stream) throw new Error("Missing live event stream");
		const write = stream.write.bind(stream);
		const loading = Promise.withResolvers<() => boolean>();
		// Let the real idle snapshot render before delivering the loading frame.
		stream.write = ((...args: Parameters<typeof write>) => {
			if (JSON.parse(String(args[0]).slice(6)).status === "loading") {
				loading.resolve(() => write(...args));
				return true;
			}
			return write(...args);
		}) as typeof stream.write;
		restoreStream = () => {
			if (stream) stream.write = write;
		};
		next = () => replacement.promise.then((result) => result.clone());
		holdOverview = true;
		canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
		const deliverLoading = await loading.promise;
		await expect(status).toHaveAttribute("data-status", "idle");
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(page.locator("#initial-loading")).toBeHidden();
		restoreStream();
		deliverLoading();
		await expect(page.locator("#initial-loading")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Cancel refresh", exact: true }),
		).toBeFocused();
		replacement.resolve(
			response({ pullRequestId: 23, title: "Replacement PR" }),
		);
		await expect(
			page.getByRole("heading", { name: "Replacement PR" }),
		).toBeVisible();
		await expect(page.locator("#overview-loading")).toBeVisible();
		const copy = page.getByRole("button", { name: "Copy PR URL", exact: true });
		await copy.focus();
		await expect(copy).toBeFocused();
		overview.resolve();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(copy).toBeFocused();
	} finally {
		requests.unsubscribe(observe);
		restoreStream?.();
		overview.resolve();
		replacement.resolve(response({ pullRequestId: 23 }));
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("failed initial load and Refresh retry keep the toast and Close fully in view", async ({
	page,
}) => {
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input)
				? new Response(null, { status: 503 })
				: emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.getByTestId("refresh-status")).toContainText("HTTP 503");
		await expect(page.locator("#initial-loading")).toBeHidden();
		await expect(page.getByTestId("pr-details")).toBeHidden();
		const refresh = page.getByRole("button", { name: "Refresh", exact: true });
		await refresh.press("Enter");
		const toast = page.locator("#canvas-toast");
		const close = toast.getByRole("button", {
			name: "Close notification: Could not refresh pull request",
			exact: true,
		});
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("HTTP 503");
		await expect(toast).toBeInViewport({ ratio: 1 });
		await expect(close).toBeInViewport({ ratio: 1 });
		await page.setViewportSize({ width: 320, height: 400 });
		await expect(toast).toBeInViewport({ ratio: 1 });
		await expect(close).toBeInViewport({ ratio: 1 });
		await close.press("Enter");
		await expect(toast).toBeHidden();
		await expect(refresh).toBeFocused();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("canvas-local copy feedback dismisses safely and clears on rebinding", async ({
	page,
}) => {
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? response() : emptyResource(),
	});
	try {
		await page
			.context()
			.grantPermissions(["clipboard-read", "clipboard-write"]);
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await page.clock.install();
		const copy = page.getByRole("button", { name: "Copy PR URL", exact: true });
		await copy.press("Enter");
		await expect(page.getByRole("tooltip")).toHaveText("Copied");
		await expect(copy).toHaveAttribute("data-copied", "true");
		await expect(copy).toBeFocused();
		await expect(page.locator(".canvas-footer")).toBeHidden();
		await page.clock.fastForward(1500);
		await expect(page.getByRole("tooltip")).toHaveCount(0);
		await expect(copy).not.toHaveAttribute("data-copied");
		await copy.hover();
		await page.clock.fastForward(100);
		await expect(page.getByRole("tooltip")).toHaveText("Copy PR URL");
		const escapeEvent = await page.evaluateHandle(() => {
			const observed = { event: null as KeyboardEvent | null };
			window.addEventListener(
				"keydown",
				(event) => {
					observed.event = event;
				},
				{ capture: true, once: true },
			);
			return observed;
		});
		await page.keyboard.press("Escape");
		expect(
			await escapeEvent.evaluate(
				(observed) => observed.event?.defaultPrevented,
			),
		).toBe(true);
		await escapeEvent.dispose();
		await expect(page.getByRole("tooltip")).toHaveCount(0);
		await expect(copy).toBeFocused();
		await page.evaluate(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: async () => {
						throw new Error("Private clipboard detail");
					},
				},
			});
		});
		await copy.press("Enter");
		const toast = page.locator("#canvas-toast");
		await expect(toast).toBeVisible();
		await expect(page.locator("#toast-title")).toHaveText("Couldn't copy");
		await expect(page.locator("#toast-message")).toContainText(
			"Copy it from the PR URL field",
		);
		await expect(
			page.getByText("Private clipboard detail", { exact: true }),
		).toHaveCount(0);
		const fallback = page.getByRole("textbox", { name: "PR URL", exact: true });
		await expect(fallback).toBeFocused();
		await expect(page.locator(".canvas-footer")).toBeHidden();
		await page.setViewportSize({ width: 320, height: 400 });
		await expect(toast).toBeInViewport({ ratio: 1 });
		await page.setViewportSize({ width: 1280, height: 720 });
		await toast
			.getByRole("button", {
				name: "Close notification: Couldn't copy",
				exact: true,
			})
			.press("Enter");
		await expect(toast).toBeHidden();
		await expect(fallback).toBeFocused();
		await copy.press("Enter");
		await expect(toast).toBeVisible();
		canvas.setBinding(instanceId, null);
		await expect(toast).toBeHidden();
		await expect(page.locator("#copy-tooltip")).toBeHidden();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"Reopen the pull request",
		);
		await expect(
			page.getByRole("button", { name: "Refresh", exact: true }),
		).toHaveCount(0);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

function tokenTransport(
	handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
	const tokenRequests: unknown[] = [];
	return {
		tokenRequests,
		authentication: {
			getAccessToken: async (input: unknown) => {
				tokenRequests.push(input);
				return { accessToken: "fixture-token" };
			},
		},
		fetch: async (input: string | URL | Request, init: RequestInit = {}) => {
			const { Authorization, ...headers } = init.headers as Record<
				string,
				string
			>;
			expect(Authorization).toBe(`Bearer ${"fixture-token"}`);
			expect(init.redirect).toBe("error");
			return handler(String(input), { ...init, headers });
		},
	};
}

test("system comment HTML reaches the safe renderer through the activity path", async ({
	page,
}) => {
	const content = [
		'<table style="width:100%" onclick="window.compromised=true"><tr><td><div><span style="color:orange">Scan result</span></div></td><td>Generated report</td></tr></table>',
		"",
		"**Review required**. Read [the report](https://example.com/report).",
		"",
		'<div>Open <a href="https://example.com/ticket?description=First%20line%0ASecond%20line&amp;source=scan" target="_blank" onmouseover="window.compromised=true">a tracking ticket</a>.</div>',
		'<details open><summary style="font-size:20px">Issue details</summary><p>Replace the embedded endpoint.</p></details>',
		'<script>window.compromised=true</script><iframe src="https://remote.invalid/frame"></iframe><img src="https://remote.invalid/pixel" onerror="window.compromised=true"><a href="javascript:alert(1)">Unsafe destination</a>',
	].join("\n");
	const transport = tokenTransport(async (url) => {
		if (isPrimaryRequest(url)) return response();
		if (new URL(url).pathname.endsWith("/threads")) {
			return Response.json({
				value: [
					{
						id: 1,
						comments: [
							{
								id: 1,
								commentType: 3,
								content,
								author: { id: "scanner", displayName: "Scan bot" },
								publishedDate: "2026-09-10T12:00:00Z",
							},
						],
					},
					{
						id: 2,
						status: "active",
						comments: [
							{ id: 1, commentType: 1, content: "**Ordinary comment**" },
						],
					},
				],
			});
		}
		return emptyResource();
	});
	const canvas = createPullRequestCanvas({
		authentication: transport.authentication,
		fetch: transport.fetch,
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		const { url } = await canvas.open({ instanceId, input: {} });
		const remoteRequests: string[] = [];
		await page.route("https://remote.invalid/**", async (route) => {
			remoteRequests.push(route.request().url());
			await route.abort();
		});
		await page.goto(url);
		const activity = page.locator("#activity-1 .activity-message");
		await expect(activity).toBeVisible();
		await expect(activity.locator("table")).toBeVisible();
		await expect(activity.locator("strong")).toHaveText([
			"Scan bot",
			"Review required",
		]);
		await expect(activity).toContainText("Issue details");
		await expect(activity).toContainText("Replace the embedded endpoint.");
		await expect(
			activity.getByRole("link", {
				name: "a tracking ticket. Opens in a new browser tab.",
				exact: true,
			}),
		).toHaveAttribute(
			"href",
			"https://example.com/ticket?description=First%20line%0ASecond%20line&source=scan",
		);
		await expect(activity.locator("a")).toHaveCount(2);
		await expect(activity).not.toContainText("<table");
		await expect(activity).not.toContainText("<details");
		await expect(
			activity.locator(
				"script, iframe, img, [style], [onclick], [onmouseover], [onerror]",
			),
		).toHaveCount(0);
		expect(remoteRequests).toEqual([]);
		expect(await page.evaluate(() => "compromised" in window)).toBe(false);
		await expect(page.locator("#thread-2 .markdown strong")).toHaveText(
			"Ordinary comment",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("discussion defaults to newest threads across pages, posting and refresh without reversing replies", async ({
	page,
}) => {
	const instanceId = randomUUID();
	const thread = (id: number, content: string) => ({
		id,
		status: "active",
		comments: [
			{
				id: 1,
				parentCommentId: 0,
				content,
				publishedDate: `2026-09-0${id}T12:00:00Z`,
			},
		],
	});
	const oldest = thread(1, "Oldest top-level comment");
	oldest.comments.push(
		{
			id: 2,
			parentCommentId: 1,
			content: "First reply",
			publishedDate: "2026-09-10T12:00:00Z",
		},
		{
			id: 3,
			parentCommentId: 1,
			content: "Second reply",
			publishedDate: "2026-09-11T12:00:00Z",
		},
	);
	const laterThreads = [thread(2, "Newer top-level comment")];
	const transport = tokenTransport(async (url, init) => {
		const request = new URL(url);
		if (isPrimaryRequest(url)) return response();
		if (request.pathname.endsWith("/threads")) {
			if (init?.method === "POST") {
				const body = JSON.parse(String(init.body));
				const posted = thread(3, body.comments[0].content);
				laterThreads.push(posted);
				return Response.json(posted);
			}
			return request.searchParams.has("continuationToken")
				? Response.json({ value: laterThreads })
				: Response.json(
						{ value: [oldest] },
						{ headers: { "x-ms-continuationtoken": "later-threads" } },
					);
		}
		return emptyResource();
	});
	const canvas = createPullRequestCanvas({
		authentication: transport.authentication,
		fetch: transport.fetch,
		getAccess: async () => ({ viewerId: "viewer", operations: ["comment"] }),
	});
	try {
		canvas.setBinding(instanceId, binding);
		const { url } = await canvas.open({ instanceId, input: {} });
		await page.goto(url);
		const roots = page.locator("#threads .thread");
		await expect(roots).toHaveCount(2);
		expect(
			await roots.evaluateAll((rows) => rows.map((row) => row.id)),
		).toEqual(["thread-1", "thread-2"]);
		await expect(
			page.getByRole("heading", { name: /^Comment \d+$/ }),
		).toHaveCount(0);
		await expect(page.locator("#discussion-sort button")).toHaveText(
			"Newest first",
		);
		const replies = page.locator("#thread-1 .comment-body .markdown");
		await expect(replies).toHaveText([
			"Oldest top-level comment",
			"First reply",
			"Second reply",
		]);

		const form = page.getByRole("form", { name: "Add comment" });
		const input = form.getByRole("textbox", {
			name: "Add a comment",
			exact: true,
		});
		const save = form.getByRole("button", { name: "Save", exact: true });
		await expect(save).toBeHidden();
		await input.focus();
		await expect(save).toBeVisible();
		await form.getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(save).toBeHidden();
		await expect(
			page.getByRole("heading", { name: /^Comments / }),
		).toBeFocused();
		await input.fill("Posted top-level comment");
		await save.click();
		await expect(roots).toHaveCount(3);
		expect(
			await roots.evaluateAll((rows) => rows.map((row) => row.id)),
		).toEqual(["thread-1", "thread-3", "thread-2"]);
		await expect(page.locator("#thread-3 .markdown")).toHaveText(
			"Posted top-level comment",
		);

		laterThreads.push(thread(4, "Comment from another reviewer"));
		await refreshCanvas(canvas, instanceId);
		await expect(roots).toHaveCount(4);
		expect(
			await roots.evaluateAll((rows) => rows.map((row) => row.id)),
		).toEqual(["thread-1", "thread-4", "thread-3", "thread-2"]);
		await expect(replies).toHaveText([
			"Oldest top-level comment",
			"First reply",
			"Second reply",
		]);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("commenter photos load through the bound canvas without disrupting reply drafts and keep initials on failure", async ({
	page,
}) => {
	const instanceId = randomUUID();
	const pendingPhoto = Promise.withResolvers<Response>();
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
		"base64",
	);
	let photoReads = 0;
	const requests: string[] = [];
	page.on("request", (request) => requests.push(request.url()));
	const transport = tokenTransport(async (url, init) => {
		const path = new URL(url).pathname;
		if (path.includes("/MemberAvatars/")) {
			expect(new Headers(init.headers).get("accept")).toMatch(/^image\//);
			photoReads++;
			if (path.endsWith("aad.broken"))
				return new Response("<html>Not an image</html>", {
					headers: { "content-type": "text/html" },
				});
			return pendingPhoto.promise;
		}
		if (isPrimaryRequest(url)) return response();
		if (path.endsWith("/threads"))
			return Response.json({
				value: [
					{
						id: 1,
						status: "active",
						comments: [1, 2, 3].map((id) => ({
							id,
							content: `Comment ${id}`,
							author: {
								id: `author-${id === 3 ? "broken" : "same"}`,
								displayName: id === 3 ? "Broken Photo" : "Ada Example",
								_links: {
									avatar: {
										href: `https://dev.azure.com/fabrikam/_apis/GraphProfile/MemberAvatars/aad.${id === 3 ? "broken" : "person"}`,
									},
								},
							},
						})),
					},
				],
			});
		return emptyResource();
	});
	const canvas = createPullRequestCanvas({
		authentication: transport.authentication,
		fetch: transport.fetch,
		getAccess: async () => ({ viewerId: "viewer", operations: ["reply"] }),
	});
	try {
		canvas.setBinding(instanceId, binding);
		const { url } = await canvas.open({ instanceId, input: {} });
		await page.goto(url);
		const thread = page.locator("#thread-1");
		await thread.getByRole("button", { name: "Reply", exact: true }).click();
		const draft = thread.getByRole("textbox", { name: "Comment", exact: true });
		await draft.fill("Keep this draft while the photos load.");
		await expect.poll(() => photoReads).toBe(2);
		await expect(thread.locator(".comment-meta")).toContainText([
			"Ada Example",
			"Ada Example",
			"Profile photo unavailable; initials shown.",
		]);
		pendingPhoto.resolve(
			new Response(png, { headers: { "content-type": "image/png" } }),
		);
		await expect(thread.locator(".avatar img[data-loaded=true]")).toHaveCount(
			2,
		);
		expect(
			await thread
				.locator(".avatar img")
				.evaluateAll((images: HTMLImageElement[]) =>
					images.every((image) => image.naturalWidth > 0),
				),
		).toBe(true);
		await expect(draft).toBeFocused();
		await expect(draft).toHaveValue("Keep this draft while the photos load.");
		await expect(thread.locator(".avatar").last()).toHaveText("BP");
		expect(
			requests.every(
				(request) => new URL(request).origin === new URL(url).origin,
			),
		).toBe(true);
		const photoPath = await thread
			.locator(".avatar img")
			.first()
			.getAttribute("src");
		if (!photoPath) throw new Error("Missing profile photo route");
		expect(
			(
				await page.request.get(
					new URL(`${photoPath}?url=https://evil.example`, url).href,
				)
			).status(),
		).toBe(400);
		expect(
			(
				await page.request.get(
					new URL(photoPath.replace(/\/1$/, "/999"), url).href,
				)
			).status(),
		).toBe(404);
		expect(
			(
				await page.request.get(new URL(photoPath, url).href, {
					headers: { "sec-fetch-site": "cross-site" },
				})
			).status(),
		).toBe(404);
		const state = await (
			await page.request.get(new URL(`/instances/${instanceId}`, url).href)
		).json();
		expect(JSON.stringify(state)).not.toContain(png.toString("base64"));
		expect(JSON.stringify(state)).not.toContain("fixture-token");
		expect(transport.tokenRequests).not.toHaveLength(0);
		for (const input of transport.tokenRequests)
			expect(input).toEqual({
				accountId: "account-one",
				resource: "azure-devops",
			});
		canvas.setBinding(instanceId, null);
		await expect(thread).toHaveCount(0);
		const rejected = await page.request.get(new URL(photoPath, url).href);
		expect(rejected.status()).toBe(404);
		expect(photoReads).toBe(2);
	} finally {
		pendingPhoto.resolve(
			new Response(png, { headers: { "content-type": "image/png" } }),
		);
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("initial skeleton ends on cancellation, while refresh retains readable content", async ({
	page,
}) => {
	const instanceId = randomUUID();
	let waiting = true;
	let overviewWaiting = true;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input, init) => {
			const primary = isPrimaryRequest(input);
			if (primary ? waiting : overviewWaiting)
				await new Promise((_, reject) => {
					init?.signal?.addEventListener(
						"abort",
						() => reject(init.signal?.reason),
						{ once: true },
					);
				});
			return primary ? response() : emptyResource();
		},
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#initial-loading")).toBeVisible();
		await expect(page.getByTestId("pr-details")).toBeHidden();
		await page.getByRole("button", { name: "Cancel refresh" }).click();
		await expect(page.locator("#initial-loading")).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Refresh", exact: true }),
		).toBeFocused();
		waiting = false;
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#pr-title")).toHaveText("Update the tools");
		await expect(page.locator("#overview-loading")).toBeVisible();
		await page.getByRole("button", { name: "Cancel refresh" }).click();
		await expect(page.locator("#overview-loading")).toBeHidden();
		overviewWaiting = false;
		await page.getByRole("button", { name: "Retry overview" }).click();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		waiting = true;
		await refreshCanvas(canvas, instanceId);
		await expect(
			page.getByRole("button", { name: "Cancel refresh" }),
		).toBeVisible();
		await expect(page.locator("#initial-loading")).toBeHidden();
		await expect(page.locator("#overview-loading")).toBeHidden();
		await expect(page.locator("#pr-title")).toBeVisible();
		await page.getByRole("button", { name: "Cancel refresh" }).click();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("read-only reviewer groups sort names without exposing write or lookup controls", async ({
	page,
}) => {
	const instanceId = randomUUID();
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input)
				? response({
						sourceRefName: "refs/heads/feature/retry+100%#fix",
						reviewers: [
							{ id: "z", displayName: "Zoe", vote: 0, isRequired: true },
							{ id: "b", displayName: "Bea", vote: 5, isRequired: false },
							{ id: "a", displayName: "Ada", vote: 10, isRequired: true },
						],
					})
				: emptyResource(),
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const required = page.getByRole("region", {
			name: "Required (2)",
			exact: true,
		});
		const optional = page.getByRole("region", {
			name: "Optional (1)",
			exact: true,
		});
		await expect(required.locator("li strong")).toHaveText(["Ada", "Zoe"]);
		await expect(optional.locator("li strong")).toHaveText(["Bea"]);
		await expect(
			page.getByRole("button", { name: /Options for|Add reviewer/ }),
		).toHaveCount(0);
		await expect(page.getByRole("searchbox")).toHaveCount(0);
		const source = page.getByRole("link", {
			name: "feature/retry+100%#fix. Opens in a new browser tab.",
			exact: true,
		});
		const href = await source.getAttribute("href");
		if (!href) throw new Error("Missing source branch link");
		const sourceUrl = new URL(href);
		expect(sourceUrl.searchParams.get("version")).toBe(
			"GBfeature/retry+100%#fix",
		);
		expect(sourceUrl.hash).toBe("");
		expect([...sourceUrl.searchParams.keys()]).toEqual(["version"]);
		const sort = page.locator("#discussion-sort button");
		await sort.click();
		await page
			.getByRole("menuitemradio", { name: "Newest first", exact: true })
			.click();
		await page.locator("#discussion-filter button").click();
		const menu = page.getByRole("menu", {
			name: "Filter comments and activity",
			exact: true,
		});
		await expect(menu).toBeVisible();
		canvas.setBinding(instanceId, null);
		await expect(menu).toHaveCount(0);
		await expect(page.getByTestId("refresh-status")).toBeFocused();
		canvas.setBinding(instanceId, binding);
		await expect(required.locator("li strong")).toHaveText(["Ada", "Zoe"]);
		await expect(sort).toHaveText("Newest first");
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("deeply nested HTML and Markdown cannot stop later discussion or controls", async ({
	page,
}) => {
	const errors: Error[] = [];
	page.on("pageerror", (error) => errors.push(error));
	const instanceId = randomUUID();
	const comments = [
		`${"<div>".repeat(5000)}Nested HTML${"</div>".repeat(5000)}`,
		`${"> ".repeat(5000)}Nested Markdown`,
		"**Discussion after nested comments**",
	];
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			if (isPrimaryRequest(input)) return response();
			if (new URL(String(input)).pathname.endsWith("/threads"))
				return Response.json({
					value: comments.map((content, index) => ({
						id: index + 1,
						status: "active",
						comments: [
							{
								id: 1,
								content,
								author: { id: "reviewer", displayName: "Reviewer" },
							},
						],
					})),
				});
			return emptyResource();
		},
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#thread-3 .markdown-body strong")).toHaveText(
			"Discussion after nested comments",
		);
		for (const id of [1, 2]) {
			const body = page.locator(`#thread-${id} .comment-body`).first();
			await expect(body).toContainText(
				"Nested Markdown exceeds the preview limit.",
			);
			expect(await body.locator("*").count()).toBeLessThan(100);
		}
		await refreshCanvas(canvas, instanceId);
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		expect(errors).toEqual([]);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("automatic reads and EventSource reconnection keep drafts, focus and scroll", async ({
	page,
}) => {
	let title = "Before upstream change";
	let failing = false;
	let writes = 0;
	let holdReads = false;
	const heldRead = Promise.withResolvers<Response>();
	const instanceId = randomUUID();
	let stream: ServerResponse | undefined;
	const requests = channel("http.server.request.start");
	const observe = (message: unknown) => {
		const { request, response } = message as {
			request: IncomingMessage;
			response: ServerResponse;
		};
		if (request.url === `/events/${instanceId}`) stream = response;
	};
	requests.subscribe(observe);
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		refreshIntervalMs: 1000,
		getAccess: async () => ({
			viewerId: "viewer",
			operations: ["reply", "review", "vote"],
		}),
		fetch: async (input, init) => {
			if (init?.method !== "GET") {
				writes++;
				throw new Error("This test must not write to ADO.");
			}
			if (isPrimaryRequest(input)) {
				if (holdReads) return heldRead.promise;
				return failing
					? new Response(null, { status: 503 })
					: response({ title, isDraft: false });
			}
			if (new URL(String(input)).pathname.endsWith("/threads"))
				return Response.json({
					value: Array.from({ length: 14 }, (_, index) => ({
						id: index + 1,
						status: "active",
						comments: [
							{
								id: 1,
								content: `Discussion ${index + 1}`,
								author: { id: "reviewer", displayName: "Reviewer" },
							},
						],
					})),
				});
			return emptyResource();
		},
	});
	try {
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const thread = page.locator("#thread-8");
		await thread.getByRole("button", { name: "Reply", exact: true }).click();
		const draft = thread.getByRole("textbox", { name: "Comment", exact: true });
		await draft.fill("Keep this unsent reply.");
		await draft.evaluate((element: HTMLTextAreaElement) =>
			element.setSelectionRange(5, 9),
		);
		const scroll = await page
			.locator("#details")
			.evaluate((element) => element.scrollTop);
		failing = true;
		await expect(page.getByTestId("refresh-status")).toContainText("503");
		await expect(draft).toHaveValue("Keep this unsent reply.");
		await expect(draft).toBeFocused();
		const submit = thread
			.getByRole("button", { name: "Reply", exact: true })
			.last();
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		await expect(submit).toHaveAttribute("aria-disabled", "true");
		await expect(approve).toHaveAttribute("aria-disabled", "true");
		await expect(submit).toHaveAccessibleDescription(/503/);
		await expect(
			thread.getByRole("button", { name: "Cancel", exact: true }),
		).not.toHaveAttribute("aria-disabled", "true");
		failing = false;
		title = "Changed upstream";
		await expect(page.locator("#pr-title")).toHaveText(title);
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		await expect(submit).toHaveAttribute("aria-disabled", "false");
		await expect(approve).toHaveAttribute("aria-disabled", "false");
		expect(
			await page.locator("#details").evaluate((element) => element.scrollTop),
		).toBe(scroll);
		expect(
			await draft.evaluate((element: HTMLTextAreaElement) => [
				element.selectionStart,
				element.selectionEnd,
			]),
		).toEqual([5, 9]);

		holdReads = true;
		let reconnects = 0;
		await page.locator("#notice").evaluate((notice) => {
			notice.setAttribute("data-test-announcements", "0");
			new MutationObserver((records) => {
				const count = Number(notice.getAttribute("data-test-announcements"));
				notice.setAttribute(
					"data-test-announcements",
					String(count + records.length),
				);
			}).observe(notice, { childList: true });
		});
		await page.route("**/events/**", (route) => {
			reconnects++;
			return route.abort("connectionfailed");
		});
		if (!stream) throw new Error("Missing live event stream");
		stream.destroy();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"Reconnecting",
		);
		await expect(draft).toHaveValue("Keep this unsent reply.");
		await expect(draft).toBeFocused();
		await expect(submit).toHaveAttribute("aria-disabled", "true");
		await expect(approve).toHaveAttribute("aria-disabled", "true");
		await expect
			.poll(() => reconnects, { timeout: 15_000 })
			.toBeGreaterThanOrEqual(2);
		await expect(page.locator("#notice")).toHaveAttribute(
			"data-test-announcements",
			"1",
		);
		await thread
			.getByRole("button", { name: "Reply", exact: true })
			.last()
			.dispatchEvent("click");
		expect(writes).toBe(0);
		await page.unroute("**/events/**");
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
			{ timeout: 10_000 },
		);
		await expect(draft).toHaveValue("Keep this unsent reply.");
		await expect(draft).toBeFocused();
		await expect(submit).toHaveAttribute("aria-disabled", "false");
		await expect(approve).toHaveAttribute("aria-disabled", "false");
		expect(
			await page.locator("#details").evaluate((element) => element.scrollTop),
		).toBe(scroll);
		expect(writes).toBe(0);
		canvas.setBinding(instanceId, null);
		await expect(draft).toHaveCount(0);
		await expect(page.getByTestId("pr-details")).toBeHidden();
	} finally {
		requests.unsubscribe(observe);
		heldRead.resolve(response());
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("loads, refreshes, preserves last-good content on error, and cancels by keyboard", async ({
	page,
}) => {
	const pending = Promise.withResolvers<Response>();
	const reports: Array<Record<string, unknown>> = [];
	let next = () => pending.promise;
	const canvas = createPullRequestCanvas({
		reportCanvasAction: (report: Record<string, unknown>) =>
			reports.push(report),
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? next() : emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Loading pull request...",
		);
		await expect(page.locator("a#pr-number")).toHaveCount(0);
		const refresh = page.locator("#refresh");
		await expect(refresh).toBeHidden();
		await expect(refresh).toHaveAttribute("aria-disabled", "true");
		pending.resolve(response());
		await expect(
			page.getByRole("heading", { name: "Update the tools" }),
		).toBeVisible();
		await expect(page.getByTestId("pr-state")).toHaveText("Draft");
		await expect(
			page.getByRole("region", { name: "Pull request metadata" }),
		).toHaveCount(0);
		const readState = async () =>
			(
				await page.request.get(
					new URL(`/instances/${instanceId}`, page.url()).href,
				)
			).json();
		const initial = await readState();
		expect(initial.pullRequest.mergeStatus).toBe("queued");
		expect(initial.updatedAt).toBeTruthy();
		expect(reports.splice(0)).toMatchObject([
			{
				action: "load",
				stage: "details",
				entryPoint: "automatic",
				phase: "started",
			},
			{
				action: "load",
				stage: "details",
				entryPoint: "automatic",
				phase: "finished",
				result: "success",
			},
		]);
		next = async () => new Response(null, { status: 503 });
		await refreshCanvas(canvas, instanceId);
		await expect(page.getByTestId("refresh-status")).toContainText("503");
		await refresh.click();
		await expect(page.getByTestId("refresh-status")).toContainText("503");
		await expect.poll(() => reports.length).toBe(2);
		expect(reports[1]).toMatchObject({
			phase: "finished",
			action: "refresh",
			stage: "details",
			result: "failure",
			errorCode: "http",
			httpStatus: 503,
			actionId: reports[0].actionId,
		});
		await expect(
			page.getByRole("heading", { name: "Update the tools" }),
		).toBeVisible();
		expect((await readState()).updatedAt).toBe(initial.updatedAt);
		await expect(refresh).toBeFocused();
		const refreshHelp =
			"Refresh is unavailable during another refresh or without a connected pull request.";
		await expect(refresh).toHaveAccessibleDescription(refreshHelp);
		await expect(page.locator("#notice")).toContainText("503");
		const slow = Promise.withResolvers<Response>();
		next = () => slow.promise;
		await refresh.press("Enter");
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Refreshing pull request...",
		);
		await page.getByRole("button", { name: "Copy PR URL" }).focus();
		await page.keyboard.press("Tab");
		const cancel = page.getByRole("button", {
			name: "Cancel refresh",
			exact: true,
		});
		await expect(cancel).toBeFocused();
		await cancel.press("Enter");
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Refresh cancelled.",
		);
		await expect.poll(() => reports.length).toBe(6);
		expect(
			reports.filter(
				(report) =>
					report.action === "refresh" && report.result === "cancelled",
			),
		).toHaveLength(1);
		const cancelReports = reports.filter(
			(report) => report.action === "cancel",
		);
		expect(cancelReports).toHaveLength(2);
		expect(cancelReports[0]).toMatchObject({
			phase: "started",
			stage: "details",
			entryPoint: "guest",
		});
		expect(cancelReports[1]).toMatchObject({
			actionId: cancelReports[0].actionId,
			phase: "finished",
			stage: "details",
			result: "success",
		});
		slow.resolve(response({ title: "Stale result" }));
		next = async () => response({ status: "completed" });
		await refresh.click();
		await expect(page.getByTestId("pr-state")).toHaveText("Completed");
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		await expect(page.locator(".canvas-footer")).toBeHidden();
		await expect(page.locator("#notice")).toHaveText(
			"Pull request details refreshed.",
		);
		await expect(
			page.getByRole("heading", { name: "Update the tools" }),
		).toBeVisible();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("renders provider text safely and clears revoked bindings and disposed views", async ({
	page,
}) => {
	let next = () =>
		response({
			title: "<img src=x onerror=alert(1)>",
			description: "<script>alert('unsafe')</script>",
		});
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? next() : emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.setViewportSize({ width: 360, height: 640 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(
			page.getByRole("heading", { name: "<img src=x onerror=alert(1)>" }),
		).toBeVisible();
		await expect(page.getByTestId("description")).toHaveText("");
		await expect(page.locator("img")).toHaveCount(0);
		expect(await page.locator("body").textContent()).not.toMatch(
			/fixture-token|account-one/,
		);
		canvas.setBinding(instanceId, null);
		await expect(page.getByTestId("refresh-status")).toContainText(
			"This PR view needs a trusted PR binding and read authorization from the app. No PR data has been loaded.",
		);
		await expect(page.getByTestId("pr-details")).toBeHidden();
		await expect(page.getByTestId("description")).toBeEmpty();
		await expect(page.locator("#pr-number")).not.toHaveAttribute("href");
		await expect(page.locator("a#pr-number")).toHaveCount(0);
		next = () => response({ pullRequestId: 23, title: "Another linked PR" });
		canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
		await expect(
			page.getByRole("heading", { name: "Another linked PR" }),
		).toBeVisible();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await canvas.dispose();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"Canvas connection was lost",
		);
		await expect(page.getByTestId("pr-details")).toBeHidden();
		await expect(page.locator("#refresh")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await expect(page.locator("#refresh")).toBeHidden();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("resets description expansion on rebinding and removes the toggle for short text", async ({
	page,
}) => {
	let pullRequestId = 22;
	let description = "A detailed explanation of the change.\n\n".repeat(30);
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input)
				? response({ pullRequestId, description })
				: emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.setViewportSize({ width: 320, height: 450 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const toggle = page.getByRole("button", { name: "Full description" });
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await toggle.press("Enter");
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		pullRequestId = 23;
		canvas.setBinding(instanceId, { ...binding, pullRequestId });
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await toggle.focus();
		description = "A short note.";
		await canvas.actions
			.find((action) => action.name === "refresh")
			?.handler({ instanceId, input: {} });
		await expect(page.getByTestId("description")).toHaveText(description);
		await expect(toggle).toBeHidden();
		await expect(page.getByTestId("description")).toBeFocused();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("opening a disclosure expands a short description beyond the preview limit", async ({
	page,
}) => {
	const description = `A short note.\n\n<details><summary>Logs</summary>\n\n${"Log line.\n\n".repeat(40)}</details>`;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? response({ description }) : emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const toggle = page.getByRole("button", { name: "Full description" });
		await expect(toggle).toBeHidden();
		await page.getByText("Logs", { exact: true }).click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(page.locator("#description-content")).toHaveAttribute(
			"data-collapsed",
			"false",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

for (const action of ["refresh", "cancel-refresh"]) {
	test(`a delayed ${action} cannot affect a replacement binding`, async ({
		page,
	}) => {
		const reports: Array<Record<string, unknown>> = [];
		const captured = Promise.withResolvers<{
			url: string;
			headers: Record<string, string>;
		}>();
		const release = Promise.withResolvers<void>();
		const newRead = Promise.withResolvers<Response>();
		let next = async () => response();
		const canvas = createPullRequestCanvas({
			authentication: {
				getAccessToken: async () => ({ accessToken: "fixture" }),
			},
			fetch: async (input) =>
				isPrimaryRequest(input) ? next() : emptyResource(),
			reportCanvasAction: (report) => reports.push(report),
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, binding);
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.getByTestId("refresh-status")).toHaveText(
				"Pull request is up to date.",
			);
			if (action === "cancel-refresh") {
				next = () => new Promise<Response>(() => {});
				await refreshCanvas(canvas, instanceId);
				await expect(
					page.getByRole("button", { name: "Cancel refresh", exact: true }),
				).toHaveAttribute("aria-disabled", "false");
			} else {
				next = async () => new Response(null, { status: 503 });
				await refreshCanvas(canvas, instanceId);
				await expect(page.getByTestId("refresh-status")).toContainText("503");
				next = async () => response();
			}
			await page.route(`**/${action}/*`, async (route) => {
				captured.resolve({
					url: route.request().url(),
					headers: await route.request().allHeaders(),
				});
				await release.promise;
				await route.abort();
			});
			await page
				.getByRole("button", {
					name: action === "refresh" ? "Refresh" : "Cancel refresh",
					exact: true,
				})
				.click();
			const request = await captured.promise;
			next = () => newRead.promise;
			canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
			const before = reports.length;
			// Deliver the captured old document's POST after the replacement read starts.
			expect(
				(await fetch(request.url, { method: "POST", headers: request.headers }))
					.status,
			).toBe(409);
			expect(reports).toHaveLength(before);
			newRead.resolve(response({ pullRequestId: 23, title: "Replacement PR" }));
			await expect(
				page.getByRole("heading", { name: "Replacement PR" }),
			).toBeVisible();
		} finally {
			release.resolve();
			newRead.resolve(response({ pullRequestId: 23 }));
			await page.goto("about:blank");
			await canvas.dispose();
		}
	});
}

test("can cancel a read before the refresh acknowledgement reaches the guest", async ({
	page,
}) => {
	const acknowledgement = Promise.withResolvers<void>();
	const slow = Promise.withResolvers<Response>();
	let next = async () => response();
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input) ? next() : emptyResource(),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		next = async () => new Response(null, { status: 503 });
		await refreshCanvas(canvas, instanceId);
		await expect(page.getByTestId("refresh-status")).toContainText("503");
		await page.route("**/refresh/*", async (route) => {
			const result = await route.fetch();
			await acknowledgement.promise;
			await route.fulfill({ response: result });
		});
		next = () => slow.promise;
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Refreshing pull request...",
		);
		await page
			.getByRole("button", { name: "Cancel refresh", exact: true })
			.click();
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Refresh cancelled.",
		);
	} finally {
		acknowledgement.resolve();
		slow.resolve(response());
		await page.unrouteAll({ behavior: "wait" });
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("overview retries independently and renders safe review context without a Changes surface", async ({
	page,
}) => {
	let fail = true;
	const reads: string[] = [];
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (isPrimaryRequest(input))
				return response({
					createdBy: { id: "author", displayName: "Ada Author" },
					reviewers: [
						{
							id: "r1",
							displayName: "Approved reviewer",
							vote: 10,
							isRequired: true,
						},
						{ id: "r2", displayName: "Suggestions reviewer", vote: 5 },
						{ id: "r3", displayName: "Unvoted reviewer", vote: 0 },
						{ id: "r4", displayName: "Waiting reviewer", vote: -5 },
						{ id: "r5", displayName: "Rejected reviewer", vote: -10 },
					],
				});
			if (url.pathname.endsWith("/threads"))
				return fail
					? new Response(null, { status: 503 })
					: Response.json({
							value: [
								{
									id: 1,
									status: "active",
									threadContext: { filePath: "/src/example.txt" },
									comments: [
										{
											id: 1,
											content: "<img src=x>",
											author: { id: "author", displayName: "Ada" },
										},
									],
								},
							],
						});
			return emptyResource();
		},
	});
	page.on("request", (request) => {
		if (request.method() === "POST")
			reads.push(new URL(request.url()).pathname);
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const retry = page.getByRole("button", {
			name: "Retry overview",
			exact: true,
		});
		await expect(retry).toBeVisible();
		fail = false;
		await retry.press("Enter");
		await expect(page.locator("#author")).toHaveText("Ada Author");
		await expect(page.locator("#threads")).toContainText(
			"remote image not loaded",
		);
		await expect(page.locator("#threads img")).toHaveCount(0);
		await expect(
			page.getByRole("region", { name: "Required (1)", exact: true }),
		).toContainText("Approved reviewerApproved");
		for (const vote of ["No vote", "Waiting for author", "Rejected"])
			await expect(page.locator("#reviewers")).toContainText(vote);
		for (const [reviewerName, state] of [
			["Approved reviewer", "approved"],
			["Suggestions reviewer", "suggestions"],
			["Unvoted reviewer", "pending"],
			["Waiting reviewer", "waiting"],
			["Rejected reviewer", "rejected"],
		] as const) {
			const row = page
				.locator(".reviewer-row")
				.filter({ has: page.getByText(reviewerName, { exact: true }) });
			await expect(row.locator(".reviewer-status-icon")).toHaveAttribute(
				"data-state",
				state,
			);
		}
		await expect(page.getByRole("tablist")).toHaveCount(0);
		expect(reads.some((path) => /^\/load-(changes|file)\//.test(path))).toBe(
			false,
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("copies the PR URL and ignores an old clipboard completion after rebinding", async ({
	page,
}) => {
	let prId = 22;
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async (input) =>
			isPrimaryRequest(input)
				? response({ pullRequestId: prId })
				: emptyResource(),
	});
	try {
		await page
			.context()
			.grantPermissions(["clipboard-read", "clipboard-write"]);
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, binding);
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const copy = page.getByRole("button", { name: "Copy PR URL", exact: true });
		await copy.press("Enter");
		await expect(page.getByTestId("copy-status")).toHaveText("PR URL copied.");
		await expect(copy).toBeFocused();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			`https://dev.azure.com/fabrikam/tools/_git/${binding.repository.repositoryId}/pullrequest/22`,
		);
		await page.evaluate(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: () =>
						new Promise<void>((resolve) => {
							window.addEventListener("finish-copy", () => resolve(), {
								once: true,
							});
						}),
				},
			});
		});
		await copy.click();
		await expect(copy).toHaveAttribute("aria-disabled", "true");
		prId = 23;
		canvas.setBinding(instanceId, { ...binding, pullRequestId: 23 });
		await expect(page.locator("#pr-number")).toHaveText("#23");
		await page.evaluate(() => window.dispatchEvent(new Event("finish-copy")));
		await expect(copy).toHaveAttribute("aria-disabled", "false");
		await expect(page.getByTestId("copy-status")).toBeEmpty();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});
