import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

// Seed existing progress through the provider API, not a removed composition UI.
async function saveExistingDraft(page: Page, content: string, line = 2) {
	await expect(page.locator("#overview-status")).toHaveText("Overview loaded.");
	const result = await page.evaluate(
		async ({ content, line }) => {
			const id = location.pathname.split("/").at(-1);
			const state = await (await fetch(`/instances/${id}`)).json();
			const saved = await fetch(`/review-state/${id}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Canvas-Binding": String(state.bindingRevision),
					"X-Canvas-Changes": String(state.changesRevision),
				},
				body: JSON.stringify({
					drafts: [
						...state.reviewState.drafts,
						{
							id: crypto.randomUUID(),
							content,
							anchor: {
								path: "/src/retry.ts",
								side: "modified",
								startLine: line,
								endLine: line,
								sourceCommitId: "b".repeat(40),
								baseCommitId: "a".repeat(40),
								iterationId: 2,
								changeTrackingId: 1,
							},
						},
					],
				}),
			});
			return saved.status;
		},
		{ content, line },
	);
	expect(result).toBe(200);
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

const completionRepositoryId = "11111111-1111-4111-8111-111111111111";
const completionProjectId = "22222222-2222-4222-8222-222222222222";
const completionSource = "a".repeat(40);
const completionTarget = "b".repeat(40);

function createCompletionReadinessFetch(
	readStatus: () =>
		| "approved"
		| "broken"
		| "notApplicable"
		| "queued"
		| "rejected"
		| "running"
		| "unavailable",
	onWrite?: (
		input: Parameters<typeof fetch>[0],
		options: Parameters<typeof fetch>[1],
	) => Promise<Response>,
	{ pullRequestSourceCommit = completionSource } = {},
) {
	const configuration = {
		id: 1,
		revision: 1,
		isEnabled: true,
		isBlocking: true,
		type: { id: BUILD_POLICY, displayName: "Build validation" },
		settings: { displayName: "Required build" },
	};
	return async (
		input: Parameters<typeof fetch>[0],
		options: Parameters<typeof fetch>[1] = {},
	) => {
		const url = new URL(String(input));
		const method = options.method ?? "GET";
		if (method !== "GET") {
			if (onWrite) return onWrite(input, options);
			throw new Error(`Unexpected fixture write: ${method} ${url.pathname}`);
		}
		if (/\/pullrequests\/22$/i.test(url.pathname))
			return Response.json({
				pullRequestId: 22,
				repository: {
					id: completionRepositoryId,
					project: { id: completionProjectId },
				},
				title: "Authorization fixture",
				description: "",
				status: "active",
				sourceRefName: "refs/heads/feature",
				targetRefName: "refs/heads/main",
				lastMergeSourceCommit: { commitId: pullRequestSourceCommit },
				lastMergeTargetCommit: { commitId: completionTarget },
				mergeStatus: "succeeded",
				reviewers: [],
			});
		if (url.pathname.endsWith("/refs")) {
			const name = `refs/${url.searchParams.get("filter") ?? ""}`;
			const objectId =
				name === "refs/heads/feature"
					? completionSource
					: name === "refs/heads/main"
						? completionTarget
						: null;
			return Response.json({
				count: objectId ? 1 : 0,
				value: objectId ? [{ name, objectId }] : [],
			});
		}
		if (url.pathname.endsWith("/configurations"))
			return Response.json({ count: 1, value: [configuration] });
		if (url.pathname.endsWith("/evaluations")) {
			const status = readStatus();
			if (status === "unavailable") return new Response(null, { status: 503 });
			return Response.json({
				count: 1,
				value: [
					{
						evaluationId: "evaluation-one",
						artifactId: url.searchParams.get("artifactId"),
						status,
						configuration,
						context: {},
					},
				],
			});
		}
		if (url.pathname.endsWith("/threads") || url.pathname.endsWith("/statuses"))
			return Response.json({ count: 0, value: [] });
		throw new Error(`Unexpected readiness request: ${url.pathname}`);
	};
}

test("canvas completion evidence updates without exposing a local Complete action", async ({
	page,
}) => {
	let policyStatus: "approved" | "queued" | "rejected" | "unavailable" =
		"queued";
	const repository = {
		organization: "fabrikam",
		project: completionProjectId,
		repositoryId: completionRepositoryId,
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations: ["complete"],
		}),
		fetch: createCompletionReadinessFetch(() => policyStatus),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		const url = (await canvas.open({ instanceId, input: {} })).url;
		const snapshotUrl = url.replace("/canvases/", "/instances/");
		const reconcile = () =>
			canvas.reconcile(
				{
					organization: repository.organization,
					repositoryId: repository.repositoryId,
					pullRequestId: 22,
				},
				false,
			);
		await page.goto(url);
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.data?.completion.reason;
			})
			.toBe("Required policy evaluation is pending.");
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);

		policyStatus = "rejected";
		reconcile();
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.data?.completion.reason;
			})
			.toBe("A required branch policy is not satisfied.");
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);

		policyStatus = "unavailable";
		reconcile();
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.status;
			})
			.toBe("error");
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);

		policyStatus = "approved";
		reconcile();
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.data?.completion;
			})
			.toEqual({ status: "ready", reason: null });
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("completion evidence accepts uppercase source SHAs from pull request details", async ({
	page,
}) => {
	const repository = {
		organization: "fabrikam",
		project: completionProjectId,
		repositoryId: completionRepositoryId,
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations: ["complete"],
		}),
		fetch: createCompletionReadinessFetch(() => "approved", undefined, {
			pullRequestSourceCommit: completionSource.toUpperCase(),
		}),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		const url = (await canvas.open({ instanceId, input: {} })).url;
		const snapshotUrl = url.replace("/canvases/", "/instances/");
		await page.goto(url);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		const state = await (await page.request.get(snapshotUrl)).json();
		expect(state.pullRequest.sourceCommitId).toBe(
			completionSource.toUpperCase(),
		);
		expect(state.completion.data.revision.sourceCommit).toBe(completionSource);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("completion eligibility updates while an unsaved comment stays open", async ({
	page,
}) => {
	let policyStatus: "approved" | "rejected" = "approved";
	const repository = {
		organization: "fabrikam",
		project: completionProjectId,
		repositoryId: completionRepositoryId,
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations: ["comment", "complete"],
		}),
		fetch: createCompletionReadinessFetch(() => policyStatus),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		const url = (await canvas.open({ instanceId, input: {} })).url;
		const snapshotUrl = url.replace("/canvases/", "/instances/");
		await page.goto(url);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		const comment = page.getByRole("textbox", {
			name: "Add a comment",
			exact: true,
		});
		await comment.fill("Keep this unsaved comment.");
		await expect(comment).toBeFocused();

		policyStatus = "rejected";
		canvas.reconcile(
			{
				organization: repository.organization,
				repositoryId: repository.repositoryId,
				pullRequestId: 22,
			},
			false,
		);
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.data?.completion.reason;
			})
			.toBe("A required branch policy is not satisfied.");
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		await expect(comment).toHaveValue("Keep this unsaved comment.");
		await expect(comment).toBeFocused();

		policyStatus = "approved";
		canvas.reconcile(
			{
				organization: repository.organization,
				repositoryId: repository.repositoryId,
				pullRequestId: 22,
			},
			false,
		);
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.data?.completion.status;
			})
			.toBe("ready");
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		await expect(comment).toHaveValue("Keep this unsaved comment.");
		await expect(comment).toBeFocused();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("background completion revalidation keeps canvas lifecycle actions absent", async ({
	page,
}) => {
	const revalidationStarted = Promise.withResolvers<void>();
	const releaseRevalidation = Promise.withResolvers<void>();
	let holdRevalidation = false;
	const repository = {
		organization: "fabrikam",
		project: completionProjectId,
		repositoryId: completionRepositoryId,
		accountId: "fixture",
	};
	const fixtureFetch = createCompletionReadinessFetch(() => "approved");
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations: ["complete", "abandon"],
		}),
		fetch: async (input, options) => {
			const url = new URL(String(input));
			if (holdRevalidation && url.pathname.endsWith("/refs")) {
				holdRevalidation = false;
				revalidationStarted.resolve();
				await releaseRevalidation.promise;
			}
			return fixtureFetch(input, options);
		},
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		const url = (await canvas.open({ instanceId, input: {} })).url;
		const snapshotUrl = url.replace("/canvases/", "/instances/");
		await page.goto(url);
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.status;
			})
			.toBe("ready");
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);

		holdRevalidation = true;
		canvas.reconcile(
			{
				organization: repository.organization,
				repositoryId: repository.repositoryId,
				pullRequestId: 22,
			},
			false,
		);
		await revalidationStarted.promise;
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.status;
			})
			.toBe("loading");
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);

		releaseRevalidation.resolve();
		await expect
			.poll(async () => {
				const state = await (await page.request.get(snapshotUrl)).json();
				return state.completion.status;
			})
			.toBe("ready");
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
	} finally {
		releaseRevalidation.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

// Exercises the package's real HTTP/SSE/browser path with fixture-only ADO.
test("clipboard failure reveals a selectable fallback and binding replacement clears it", async ({
	page,
}) => {
	const reports: Array<Record<string, unknown>> = [];
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async () => {
					throw new Error("Clipboard denied");
				},
			},
		});
	});
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		reportCanvasAction: (report) => reports.push(report),
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/\d+$/.test(url.pathname))
				return Response.json({
					pullRequestId: Number(url.pathname.split("/").at(-1)),
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Clipboard fixture",
					description:
						"[Documentation](https://learn.microsoft.com/azure/devops/)",
					status: "active",
					sourceRefName: "refs/heads/feature",
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
		await expect.poll(() => reports.length).toBe(2);
		expect(reports.splice(0)).toMatchObject([
			{ action: "load", stage: "details", phase: "started" },
			{
				action: "load",
				stage: "details",
				phase: "finished",
				result: "success",
			},
		]);
		const fallback = page.getByRole("textbox", { name: "PR URL" });
		await expect(fallback).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Pull request actions", exact: true }),
		).toBeHidden();
		await expect(
			page.getByRole("textbox", { name: "Add a comment", exact: true }),
		).toBeHidden();
		await page.locator(".title-row").hover();
		await page.getByRole("button", { name: "Copy PR URL" }).click();
		await expect.poll(() => reports.length).toBe(1);
		expect(reports[0]).toMatchObject({
			phase: "finished",
			action: "copy_link",
			stage: "details",
			result: "failure",
			errorCode: "clipboard",
		});
		await expect(fallback).toBeVisible();
		await expect(fallback).toBeFocused();
		await expect(fallback).toHaveValue(/pullrequest\/22$/);
		expect(
			await fallback.evaluate(
				(input: HTMLInputElement) =>
					input.selectionStart === 0 &&
					input.selectionEnd === input.value.length,
			),
		).toBe(true);
		await page
			.getByRole("button", { name: "Copy PR URL", exact: true })
			.press("Enter");
		await expect
			.poll(
				() =>
					reports.filter(
						(report) =>
							report.action === "copy_link" && report.phase === "finished",
					).length,
			)
			.toBe(2);
		expect(
			reports.filter(
				(report) =>
					report.action === "copy_link" && report.phase === "finished",
			),
		).toMatchObject([
			{ result: "failure", errorCode: "clipboard" },
			{ result: "failure", errorCode: "clipboard" },
		]);
		await page
			.context()
			.route("https://learn.microsoft.com/**", (route) =>
				route.fulfill({ body: "Documentation" }),
			);
		const popupPromise = page.waitForEvent("popup");
		await page.getByRole("link", { name: /^Documentation\./ }).click();
		const popup = await popupPromise;
		await expect(popup).toHaveURL("https://learn.microsoft.com/azure/devops/");
		await popup.close();
		await expect.poll(() => reports.length).toBe(3);
		expect(reports[2]).toMatchObject({
			action: "open_link",
			stage: "link",
			phase: "finished",
			result: "success",
		});
		expect(JSON.stringify(reports)).not.toContain("dev.azure.com");
		expect(JSON.stringify(reports)).not.toContain("learn.microsoft.com");
		expect(JSON.stringify(reports)).not.toContain("Clipboard denied");
		canvas.setBinding(instanceId, { repository, pullRequestId: 23 });
		await expect(fallback).toBeHidden();
		await expect(page.locator("#copy-fallback-url")).toHaveValue("");
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("Markdown links open externally without replacing the canvas or showing a copy panel", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	await page
		.context()
		.route("https://learn.microsoft.com/**", (route) =>
			route.fulfill({ body: "Documentation" }),
		);
	try {
		await page.goto(preview.url);
		await mutatePreview(page, "edit", {
			title: "[Preview] Improve retry handling",
			description:
				"[Documentation](https://learn.microsoft.com/azure/devops/) [Unsafe](javascript:alert(1))",
		});
		const link = page.getByTestId("description").getByRole("link", {
			name: "Documentation. Opens in a new browser tab.",
			exact: true,
		});
		await expect(link).toBeVisible();
		for (const activation of ["click", "Enter"]) {
			const popupPromise = page.waitForEvent("popup");
			if (activation === "click") await link.click();
			else await link.press("Enter");
			const popup = await popupPromise;
			await expect(popup).toHaveURL(
				"https://learn.microsoft.com/azure/devops/",
			);
			expect(await popup.evaluate(() => window.opener === null)).toBe(true);
			await popup.close();
			await expect(page).toHaveURL(preview.url);
			await expect(
				page.getByRole("group", { name: "External link" }),
			).toHaveCount(0);
		}
		await expect(
			page.getByTestId("description").getByRole("link", { name: /Unsafe/ }),
		).toHaveCount(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("description header edits inline with a pencil action", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const trigger = page.getByRole("button", {
			name: "Edit pull request description",
			exact: true,
		});
		await expect(trigger.locator("svg")).toHaveAttribute("aria-hidden", "true");
		await trigger.click();
		const form = page.getByRole("form", {
			name: "Edit pull request description",
		});
		const input = form.getByRole("textbox", {
			name: "Description",
			exact: true,
		});
		await expect(input).toBeFocused();
		await expect(input).toHaveAttribute(
			"aria-labelledby",
			"description-heading",
		);
		await expect(input).not.toHaveAttribute("aria-label");
		await expect(page.getByTestId("description")).toBeHidden();
		await input.fill("Updated description from the header editor.");
		await form
			.getByRole("button", { name: "Save description", exact: true })
			.click();
		await expect(page.getByTestId("description")).toHaveText(
			"Updated description from the header editor.",
		);
		await expect(trigger).toBeFocused();
		expect(writes.at(-1)).toEqual({
			operation: "edit",
			input: { description: "Updated description from the header editor." },
		});
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

function createReadOnlyFixture({
	originalSide = false,
	threadIteration = 2,
	trackingId = 99,
	commentCount = 0,
	commentContent = "",
} = {}) {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture",
	};
	const source = "b".repeat(40);
	const base = "a".repeat(40);
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/.test(url.pathname))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "22222222-2222-4222-8222-222222222222" },
					},
					title: "Tracking fixture",
					status: "active",
					sourceRefName: "refs/heads/feature",
					targetRefName: "refs/heads/main",
					lastMergeSourceCommit: { commitId: source },
					reviewers: [],
				});
			if (url.pathname.endsWith("/threads"))
				return Response.json({
					value: [
						{
							id: 1,
							status: "active",
							comments: Array.from({ length: commentCount }, (_, index) => ({
								id: index + 1,
								content:
									index === 0 && commentContent
										? commentContent
										: `Discussion reply ${index + 1}`,
								author: { id: "author", displayName: "Ada Example" },
								publishedDate: "2026-09-10T09:00:00Z",
								commentType: "text",
							})),
							threadContext: {
								filePath: "/src/retry.ts",
								[originalSide ? "leftFileStart" : "rightFileStart"]: {
									line: 2,
									offset: 1,
								},
								[originalSide ? "leftFileEnd" : "rightFileEnd"]: {
									line: 2,
									offset: 1,
								},
							},
							pullRequestThreadContext: {
								changeTrackingId: trackingId,
								iterationContext: {
									firstComparingIteration: threadIteration,
									secondComparingIteration: threadIteration,
								},
							},
						},
					],
				});
			if (url.pathname.endsWith("/iterations"))
				return Response.json({
					value: [
						{
							id: 2,
							sourceRefCommit: { commitId: source },
							commonRefCommit: { commitId: base },
						},
					],
				});
			if (url.pathname.endsWith("/changes"))
				return Response.json({
					changeEntries: [
						{
							changeTrackingId: 1,
							changeType: "edit",
							item: { path: "/src/retry.ts" },
						},
					],
				});
			if (url.pathname.endsWith("/items"))
				return Response.json({
					path: "/src/retry.ts",
					commitId: url.searchParams.get("versionDescriptor.version"),
					gitObjectType: "blob",
					content:
						url.searchParams.get("versionDescriptor.version") === base
							? "first\nbefore\nlast\n"
							: "first\nafter\nlast\n",
					contentMetadata: { isBinary: false },
				});
			return Response.json({ value: [] });
		},
	});
	return { canvas, repository };
}

test("discussion previews never relocate a line when file tracking differs", async ({
	page,
}) => {
	const { canvas, repository } = createReadOnlyFixture();
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const thread = page.locator("#thread-1");
		await expect(thread).toContainText("Code preview unavailable:");
		await expect(thread.getByRole("table")).toHaveCount(0);
		await expect(
			thread.getByRole("button", { name: "Retry code preview" }),
		).toBeVisible();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("discussion renders mixed ADO HTML and Markdown without active resources", async ({
	page,
}) => {
	const externalRequests: string[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).hostname !== "127.0.0.1")
			externalRequests.push(request.url());
	});
	const { canvas, repository } = createReadOnlyFixture({
		commentCount: 1,
		commentContent:
			'**Markdown** and <b>ADO HTML</b>\n\n<div><ul><li>HTML item</li></ul><p><a href="https://example.com/review">Safe review link</a></p></div>\n\n- Markdown item\n\n```js\nconst value = "<img>";\n```\n\n<script>window.compromised=true</script><iframe src="https://remote.invalid/frame"></iframe><img src="https://remote.invalid/pixel" onerror="window.compromised=true"><a href="javascript:alert(1)">Unsafe link</a>',
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const comment = page.locator("#thread-1 .markdown");
		await expect(comment.locator("strong")).toHaveText("Markdown");
		await expect(comment.locator("b")).toHaveText("ADO HTML");
		await expect(comment.locator("li")).toHaveText([
			"HTML item",
			"Markdown item",
		]);
		await expect(comment.locator("pre code")).toHaveText(
			'const value = "<img>";',
		);
		await expect(
			comment.locator("script,iframe,img,[src],[onerror]"),
		).toHaveCount(0);
		await expect(
			comment.getByRole("link", { name: /Unsafe link/ }),
		).toHaveCount(0);
		await expect(comment.locator("[href]")).toHaveCount(1);
		expect(await page.evaluate(() => "compromised" in window)).toBe(false);
		expect(externalRequests).toEqual([]);
		await page
			.context()
			.route("https://example.com/review", (route) =>
				route.fulfill({ body: "Review" }),
			);
		const popupPromise = page.waitForEvent("popup");
		await comment.getByRole("link", { name: /^Safe review link\./ }).click();
		const popup = await popupPromise;
		await expect(popup).toHaveURL("https://example.com/review");
		await popup.close();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("discussion keeps every reply in one continuous read-only thread", async ({
	page,
}) => {
	const { canvas, repository } = createReadOnlyFixture({ commentCount: 7 });
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		const thread = page.locator("#thread-1 .comment-thread");
		await expect(
			thread.getByText("Discussion reply 1", { exact: true }),
		).toBeVisible();
		await expect(thread.getByRole("listitem")).toHaveCount(7);
		for (const name of [
			"Reply",
			"Resolve",
			"Reopen",
			"Change comment status",
			"Edit comment",
		])
			await expect(
				thread.getByRole("button", { name, exact: true }),
			).toHaveCount(0);
		await expect(
			thread.getByRole("button", { name: /Next|Previous/ }),
		).toHaveCount(0);
		await expect(
			thread.getByText("Discussion reply 7", { exact: true }),
		).toBeVisible();
		await expect(
			thread.getByText("Discussion reply 1", { exact: true }),
		).toBeVisible();
		await expect(thread.getByText("Active", { exact: true })).toBeVisible();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

for (const [name, threadIteration] of [
	["current", 2],
	["earlier", 1],
] as const) {
	test(`discussion original-side preview respects its ${name} iteration`, async ({
		page,
	}) => {
		const { canvas, repository } = createReadOnlyFixture({
			originalSide: true,
			threadIteration,
			trackingId: 1,
		});
		try {
			const instanceId = randomUUID();
			canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			const thread = page.locator("#thread-1");
			if (threadIteration === 2) {
				await expect(
					thread.getByRole("row", { name: "Deleted original line 2" }),
				).toContainText("before");
				await expect(thread).toContainText("Iteration 2");
			} else {
				await expect(thread.getByRole("table")).toHaveCount(0);
				await expect(thread).toContainText("Code preview unavailable:");
			}
		} finally {
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

test("policy and CI outages retain independent last-good content without a fresh-status claim", async ({
	page,
}) => {
	let statusOutage = false;
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "22222222-2222-4222-8222-222222222222",
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async (input) => {
			const path = new URL(String(input)).pathname;
			if (/\/pullrequests\/22$/.test(path))
				return Response.json({
					pullRequestId: 22,
					repository: {
						id: repository.repositoryId,
						project: { id: "11111111-1111-4111-8111-111111111111" },
					},
					title: "Partial Overview",
					status: "active",
					sourceRefName: "refs/heads/topic",
					targetRefName: "refs/heads/main",
					createdBy: { id: "author", displayName: "Ada Example" },
					reviewers: [{ id: "reviewer", displayName: "Sam Example", vote: 10 }],
				});
			if (path.endsWith("/evaluations"))
				return new Response(null, { status: 503 });
			if (path.endsWith("/statuses"))
				return statusOutage
					? new Response(null, { status: 503 })
					: Response.json({
							value: [
								{
									id: 1,
									context: { name: "Continuous integration", genre: "build" },
									state: "succeeded",
								},
							],
						});
			if (path.endsWith("/threads"))
				return Response.json({
					value: [
						{
							id: 1,
							status: "active",
							comments: [
								{
									id: 1,
									content: "Discussion survives a policy outage.",
									author: { id: "reviewer", displayName: "Sam Example" },
								},
							],
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
		await expect(
			page.getByRole("button", { name: "Retry overview", exact: true }),
		).toBeVisible();
		await expect(page.locator("#author")).toContainText("Ada Example");
		await expect(page.getByTestId("reviewers")).toContainText("Sam Example");
		await expect(
			page.getByText("Discussion survives a policy outage.", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Pull request is up to date.", { exact: true }),
		).not.toBeVisible();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"content is unavailable",
		);
		const checks = page.getByTestId("checks");
		await expect(page.locator("#check-summary")).toHaveText(
			"Some check results are unavailable",
		);
		await expect(page.locator("#policy-summary")).toHaveText(
			"Optional check succeeded \u00b7 Some check results unavailable",
		);
		await page
			.getByRole("button", { name: "View checks", exact: true })
			.click();
		await expect(checks).toContainText("Continuous integration");
		await expect(page.locator("#status-checks-error")).toBeHidden();
		statusOutage = true;
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#status-checks-error")).toContainText(
			"Showing last known results",
		);
		await expect(page.locator("#check-summary")).toHaveText(
			"Some check results are unavailable",
		);
		await expect(page.getByTestId("threads")).toContainText(
			"Discussion survives a policy outage.",
		);
		statusOutage = false;
		await page
			.getByRole("button", { name: "Retry overview", exact: true })
			.click();
		await expect(page.locator("#status-checks-error")).toBeHidden();
		await expect(page.locator("#check-summary")).toHaveText(
			"Some check results are unavailable",
		);
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("read-only users can edit and discard stored drafts without remote mutation grants", async ({
	page,
}) => {
	const { canvas, repository } = createReadOnlyFixture();
	const mutations: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "POST" && request.url().includes("/mutate/"))
			mutations.push(request.url());
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(
			page.getByRole("button", { name: "Pull request actions", exact: true }),
		).toBeHidden();
		await saveExistingDraft(page, "Private review draft");
		await expect(
			page.getByText("Private review draft", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Review", exact: true }),
		).toBeHidden();
		await page.reload();
		await expect(
			page.getByText("Private review draft", { exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Edit staged comment", exact: true })
			.click();
		const edit = page.getByRole("form", { name: "Edit staged comment" });
		await edit
			.getByRole("textbox", { name: "Comment", exact: true })
			.fill("Revised private draft");
		await edit.getByRole("button", { name: "Save draft", exact: true }).click();
		await expect(
			page.getByText("Revised private draft", { exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Remove staged comment", exact: true })
			.click();
		await expect(
			page.getByText("Revised private draft", { exact: true }),
		).toHaveCount(0);
		expect(mutations).toEqual([]);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("staged draft editing survives another canvas staging a draft", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const second = await page.context().newPage();
	try {
		await page.goto(preview.url);
		await second.goto(preview.url);
		await saveExistingDraft(second, "A second canvas draft");
		await expect(
			second.getByText("A second canvas draft", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("A second canvas draft", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Review", exact: true }),
		).toHaveCount(0);
		await page
			.getByRole("button", { name: "Edit staged comment", exact: true })
			.click();
		const edit = page.getByRole("form", { name: "Edit staged comment" });
		await edit
			.getByRole("textbox", { name: "Comment", exact: true })
			.fill("Updated staged draft");
		await saveExistingDraft(second, "Keep the other draft", 3);
		await expect(
			second.getByText("Keep the other draft", { exact: true }),
		).toBeVisible();
		await expect(
			edit.getByRole("textbox", { name: "Comment", exact: true }),
		).toHaveValue("Updated staged draft");
		await expect(
			edit.getByRole("textbox", { name: "Comment", exact: true }),
		).toBeFocused();
		await edit.getByRole("button", { name: "Save draft", exact: true }).click();
		await expect(
			page.getByText("Updated staged draft", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Keep the other draft", { exact: true }),
		).toBeVisible();
	} finally {
		await second.close();
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("reviewer controls require explicit sample actions while lifecycle moves to the drawer", async ({
	page,
}) => {
	const preview = await startPullRequestPreview({ completionReady: true });
	try {
		await page.goto(preview.url);
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await page
			.getByRole("button", { name: "Add reviewer", exact: true })
			.click();
		const reviewer = page.getByRole("form", { name: "Add reviewer" });
		await reviewer
			.getByRole("searchbox", {
				name: "Reviewer name, email, alias, or identity ID",
			})
			.fill("99999999-9999-4999-8999-999999999999");
		await expect(
			reviewer.getByRole("checkbox", { name: "Required reviewer" }),
		).toHaveCount(0);
		await reviewer.getByRole("button", { name: "Add reviewer" }).click();
		await expect(page.getByTestId("reviewers")).toContainText(
			"Requested reviewer",
		);
		const requestedReviewer = page.locator(".reviewer-row").filter({
			has: page.getByText("Requested reviewer", { exact: true }),
		});
		await requestedReviewer.hover();
		await page
			.getByRole("button", {
				name: "Options for Requested reviewer",
				exact: true,
			})
			.click();
		await page
			.getByRole("menuitem", { name: "Remove Requested reviewer", exact: true })
			.click();
		await expect(
			page.getByRole("form", { name: /remove requested reviewer/i }),
		).toHaveCount(0);
		await expect(page.getByTestId("reviewers")).not.toContainText(
			"Requested reviewer",
		);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("View all expands the same checks list and policies stay aggregated", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const writes: unknown[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/")) writes.push(request.postDataJSON());
	});
	try {
		await page.goto(preview.url);
		const checks = page.getByTestId("checks");
		await expect(checks).not.toContainText("Unit tests");
		await expect(
			checks.getByText("Integration tests", { exact: true }),
		).toBeVisible();
		await expect(checks.getByText("Lint", { exact: true })).toBeVisible();
		await expect(checks.locator(".check-list-row button")).toHaveCount(0);
		const viewAll = checks.locator(".checks-view-all");
		await expect(viewAll).toHaveText("View checks");
		await viewAll.click();
		await expect(viewAll).toHaveText("Collapse");
		await expect(checks.getByText("Unit tests", { exact: true })).toBeVisible();
		await expect(viewAll).toHaveAttribute("aria-expanded", "true");
		for (const check of [
			["Comments must be resolved", "Rejected"],
			["Proof of presence is required", "Running"],
		] as const) {
			const row = checks
				.locator(".check-list-row")
				.filter({ has: page.getByText(check[0], { exact: true }) });
			await expect(row.getByText(check[1], { exact: true })).toHaveClass(
				"sr-only",
			);
			await expect(row.getByRole("button")).toHaveCount(0);
			await expect(row.locator(".check-requirement")).toHaveCount(0);
		}
		for (const policy of [
			["At least 2 reviewers must approve", "Pending"],
			["No merge conflicts", "Approved"],
		] as const) {
			const row = checks
				.locator(".policy-summary-row")
				.filter({ has: page.getByText(policy[0], { exact: true }) });
			await expect(row.getByText(policy[1], { exact: true })).toHaveClass(
				"sr-only",
			);
			await expect(row.getByRole("button")).toHaveCount(0);
			await expect(row.locator(".check-requirement")).toHaveCount(0);
			await expect(row.locator(".policy-summary-status")).toHaveCount(0);
		}
		for (const consumedPolicy of [
			"Build validation",
			"Integration validation",
			"Lint validation",
		])
			await expect(
				checks.getByText(consumedPolicy, { exact: true }),
			).toHaveCount(0);
		expect(writes).toEqual([]);
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

function createFeedbackFixture(refreshIntervalMs?: number) {
	const repository = {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture",
	};
	const remote = {
		failDetails: false,
		failOverview: false,
		detailsWait: null as ReturnType<typeof Promise.withResolvers<void>> | null,
		detailReads: 0,
		overviewWait: null as ReturnType<typeof Promise.withResolvers<void>> | null,
		writes: 0,
		threads: [] as Record<string, unknown>[],
		fixOutcome: "unknown" as "unknown" | "rejected",
		fixRequests: 0,
		failReviewSave: false,
		reviewState: null as
			| import("./pull-request-review-state-types.d.mts").ReviewState
			| null,
	};
	const canvas = createPullRequestCanvas({
		refreshIntervalMs,
		requestFix: async () => {
			remote.fixRequests++;
			if (remote.fixOutcome === "rejected") throw new Error("Not queued");
			return remote.fixOutcome;
		},
		reviewStorage: {
			load: async () => remote.reviewState,
			save: async (_key, state) => {
				if (remote.failReviewSave)
					throw new Error("Review storage unavailable");
				remote.reviewState = state;
			},
		},
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations: ["vote"],
		}),
		fetch: async (input, options) => {
			if ((options?.method ?? "GET") !== "GET") {
				remote.writes++;
				return new Response(null, { status: 503 });
			}
			const path = new URL(String(input)).pathname;
			if (/\/pullrequests\/22$/.test(path)) {
				remote.detailReads++;
				await remote.detailsWait?.promise;
				return remote.failDetails
					? new Response(null, { status: 503 })
					: Response.json({
							pullRequestId: 22,
							repository: {
								id: repository.repositoryId,
								project: { id: "22222222-2222-4222-8222-222222222222" },
							},
							title: "Recovery fixture",
							status: "active",
							sourceRefName: "refs/heads/feature",
							targetRefName: "refs/heads/main",
							lastMergeSourceCommit: { commitId: "b".repeat(40) },
							reviewers: [],
						});
			}
			if (path.endsWith("/threads")) {
				await remote.overviewWait?.promise;
				if (remote.failOverview) return new Response(null, { status: 503 });
				return Response.json({ value: remote.threads });
			}
			return Response.json({ value: [] });
		},
	});
	const instanceId = randomUUID();
	canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
	return {
		canvas,
		instanceId,
		repository,
		remote,
		async refresh() {
			const action = canvas.actions.find((action) => action.name === "refresh");
			if (!action) throw new Error("Refresh action missing");
			await action.handler({ instanceId, input: {} });
		},
	};
}

test("canvas feedback preserves mutation SSE guidance after its delayed HTTP failure", async ({
	page,
}) => {
	const { canvas, instanceId, remote } = createFeedbackFixture();
	const httpHeld = Promise.withResolvers<void>();
	const releaseHttp = Promise.withResolvers<void>();
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await page.route(/\/mutate\/[^/]+$/, async (route) => {
			const response = await route.fetch();
			httpHeld.resolve();
			await releaseHttp.promise;
			await route.fulfill({ response });
		});
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await httpHeld.promise;
		const warning = page.locator("#mutation-status");
		const guidance =
			"Could not finish the action. It may have partly completed. Refresh before you try again.";
		await expect(warning).toHaveText(guidance);
		await expect(page.locator("#canvas-toast")).toBeHidden();
		const failed = page.waitForResponse((response) =>
			response.url().includes("/mutate/"),
		);
		releaseHttp.resolve();
		expect((await failed).ok()).toBe(false);
		await expect(page.locator("#toast-message")).toHaveText(
			"The action could not be confirmed. Refresh to check its result before trying again.",
		);
		await expect(warning).toHaveText(guidance);
		await page
			.getByRole("button", {
				name: "Close notification: Pull request action failed",
				exact: true,
			})
			.click();
		await expect(page.locator("#canvas-toast")).toBeHidden();
		await expect(warning).toHaveText(guidance);
		expect(remote.writes).toBe(1);
	} finally {
		releaseHttp.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

for (const outcome of ["unknown", "rejected", "interrupted"] as const) {
	test(`canvas feedback replaces older recovery guidance after ${outcome} Fix confirmation`, async ({
		page,
	}) => {
		const fixture = createFeedbackFixture();
		const { canvas, instanceId, remote } = fixture;
		remote.fixOutcome = outcome === "interrupted" ? "unknown" : outcome;
		remote.threads.push({
			id: 1,
			status: "active",
			comments: [
				{
					id: 1,
					content: "Keep retries bounded.",
					commentType: "text",
					author: {
						id: "44444444-4444-4444-8444-444444444444",
						displayName: "Reviewer",
					},
				},
			],
		});
		try {
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await page.getByRole("button", { name: "Approve", exact: true }).click();
			await expect(page.locator("#toast-message")).toContainText(
				"The action could not be confirmed.",
			);
			const warning = page.locator("#mutation-status");
			await expect(warning).toContainText("may have partly completed");
			if (outcome === "interrupted")
				await page.route(/\/fix\/[^/]+$/, (route) => route.abort("failed"));
			const fixed =
				outcome === "interrupted"
					? page.waitForEvent("requestfailed", (request) =>
							request.url().includes("/fix/"),
						)
					: page.waitForResponse((response) =>
							response.url().includes("/fix/"),
						);
			await page
				.getByRole("button", { name: "Fix unresolved comments", exact: true })
				.click();
			const result = await fixed;
			if ("status" in result)
				expect(result.status()).toBe(outcome === "unknown" ? 202 : 400);
			const guidance =
				outcome === "unknown"
					? "Copilot may still be working on this fix. Check the workspace conversation before trying again."
					: outcome === "interrupted"
						? "Connection interrupted. Check the workspace conversation before trying again."
						: "Copilot could not start this fix. Refresh and try again.";
			await expect(page.locator("#toast-message")).toHaveText(guidance);
			await page.getByRole("button", { name: /^Close notification:/ }).click();
			await expect(page.locator("#canvas-toast")).toBeHidden();
			await expect(warning).toHaveText(guidance);
			await fixture.refresh();
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await expect(warning).toHaveText(guidance);
			await page.getByRole("button", { name: "Refresh", exact: true }).click();
			await expect(page.locator("#canvas-footer")).toBeHidden();
			expect(remote.writes).toBe(1);
			expect(remote.fixRequests).toBe(outcome === "interrupted" ? 0 : 1);
		} finally {
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

for (const outcome of ["rejected", "interrupted", "reported"] as const) {
	test(`canvas feedback replaces old Fix guidance after a ${outcome} mutation`, async ({
		page,
	}) => {
		const fixture = createFeedbackFixture();
		const { canvas, instanceId, remote } = fixture;
		const httpHeld = Promise.withResolvers<void>();
		const releaseHttp = Promise.withResolvers<void>();
		remote.threads.push({
			id: 1,
			status: "active",
			comments: [
				{
					id: 1,
					content: "Keep retries bounded.",
					commentType: "text",
					author: {
						id: "44444444-4444-4444-8444-444444444444",
						displayName: "Reviewer",
					},
				},
			],
		});
		try {
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			const approve = page.getByRole("button", {
				name: "Approve",
				exact: true,
			});
			await approve.click();
			await expect(page.locator("#toast-message")).toContainText(
				"The action could not be confirmed.",
			);
			await page
				.getByRole("button", { name: "Fix unresolved comments", exact: true })
				.click();
			const fixGuidance =
				"Copilot may still be working on this fix. Check the workspace conversation before trying again.";
			await expect(page.locator("#toast-message")).toHaveText(fixGuidance);
			await page.getByRole("button", { name: /^Close notification:/ }).click();
			const warning = page.locator("#mutation-status");
			await expect(warning).toHaveText(fixGuidance);
			await page.route(/\/mutate\/[^/]+$/, async (route) => {
				const response = outcome === "reported" ? await route.fetch() : null;
				httpHeld.resolve();
				await releaseHttp.promise;
				if (outcome === "interrupted") await route.abort("failed");
				else if (response) await route.fulfill({ response });
				else await route.fulfill({ status: 503 });
			});
			await approve.click();
			await httpHeld.promise;
			const reportedGuidance =
				"Could not finish the action. It may have partly completed. Refresh before you try again.";
			const pendingGuidance =
				outcome === "reported" ? reportedGuidance : fixGuidance;
			await expect(warning).toHaveText(pendingGuidance);
			// A newer read can repeat an older mutation error without owning this POST.
			remote.overviewWait = Promise.withResolvers<void>();
			await fixture.refresh();
			await expect(page.locator("#overview-status")).toHaveText(
				"Loading overview...",
			);
			remote.overviewWait.resolve();
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			await expect(warning).toHaveText(pendingGuidance);
			const settled =
				outcome === "interrupted"
					? page.waitForEvent("requestfailed", (request) =>
							request.url().includes("/mutate/"),
						)
					: page.waitForResponse((response) =>
							response.url().includes("/mutate/"),
						);
			releaseHttp.resolve();
			const result = await settled;
			if ("status" in result)
				expect(result.status()).toBe(outcome === "reported" ? 400 : 503);
			const httpGuidance =
				outcome === "interrupted"
					? "Connection interrupted. Refresh to check the result before trying again."
					: "The action could not be confirmed. Refresh to check its result before trying again.";
			await expect(page.locator("#toast-message")).toHaveText(httpGuidance);
			await page.getByRole("button", { name: /^Close notification:/ }).click();
			await expect(page.locator("#canvas-toast")).toBeHidden();
			await expect(warning).toHaveText(
				outcome === "reported" ? reportedGuidance : httpGuidance,
			);
			await page.getByRole("button", { name: "Refresh", exact: true }).click();
			await expect(page.locator("#canvas-footer")).toBeHidden();
			expect(remote.writes).toBe(outcome === "reported" ? 2 : 1);
			expect(remote.fixRequests).toBe(1);
		} finally {
			releaseHttp.resolve();
			remote.overviewWait?.resolve();
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

test("canvas feedback replaces older recovery guidance after a failed review-state save", async ({
	page,
}) => {
	const fixture = createFeedbackFixture();
	const { canvas, instanceId, remote } = fixture;
	remote.reviewState = {
		viewed: [],
		drafts: [{ id: "saved-draft", content: "Keep this staged comment." }],
		preferences: { mode: "unified", ignoreWhitespace: false },
		sourceCommitId: null,
	};
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(page.locator("#toast-message")).toContainText(
			"The action could not be confirmed.",
		);
		const warning = page.locator("#mutation-status");
		await expect(warning).toContainText("may have partly completed");
		remote.failReviewSave = true;
		await page
			.getByRole("button", { name: "Edit staged comment", exact: true })
			.click();
		const edit = page.getByRole("form", { name: "Edit staged comment" });
		const draft = edit.getByRole("textbox", { name: "Comment", exact: true });
		await draft.fill("Keep this unsaved draft edit.");
		const failed = page.waitForResponse((response) =>
			response.url().includes("/review-state/"),
		);
		await edit.getByRole("button", { name: "Save draft", exact: true }).click();
		expect((await failed).ok()).toBe(false);
		const guidance =
			"Could not save review state. Refresh to check the saved state.";
		await expect(page.locator("#toast-message")).toHaveText(guidance);
		await page
			.getByRole("button", {
				name: "Close notification: Pull request action failed",
				exact: true,
			})
			.click();
		await expect(page.locator("#canvas-toast")).toBeHidden();
		await expect(warning).toHaveText(guidance);
		await expect(draft).toHaveValue("Keep this unsaved draft edit.");
		await fixture.refresh();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(warning).toHaveText(guidance);
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(draft).toHaveValue("Keep this unsaved draft edit.");
		expect(remote.writes).toBe(1);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("canvas feedback recovers when Refresh joins an active background read", async ({
	page,
}) => {
	const fixture = createFeedbackFixture(1000);
	const { canvas, instanceId, remote } = fixture;
	const pendingDetails = Promise.withResolvers<void>();
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const readsBefore = remote.detailReads;
		remote.detailsWait = pendingDetails;
		await page.route(/\/mutate\/[^/]+$/, (route) =>
			route.fulfill({ status: 503 }),
		);
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		const warning = page.locator("#mutation-status");
		await expect(warning).toBeVisible();
		await expect.poll(() => remote.detailReads).toBeGreaterThan(readsBefore);
		const state = await (
			await page.request.get(
				new URL(`/instances/${instanceId}`, page.url()).href,
			)
		).json();
		expect(state.status).toBe("ready");
		const accepted = page.waitForResponse(
			(response) =>
				response.url().includes("/refresh/") && response.status() === 202,
		);
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await accepted;
		await expect(warning).toBeVisible();
		remote.detailsWait = null;
		pendingDetails.resolve();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(page.locator("#canvas-toast")).toBeHidden();
		expect(remote.writes).toBe(0);
	} finally {
		pendingDetails.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

for (const outcome of [409, 503, "network", "accepted"] as const) {
	test(`canvas feedback fences recovery for ${outcome} Refresh responses even when reads advance`, async ({
		page,
	}) => {
		const fixture = createFeedbackFixture();
		const { canvas, instanceId, remote } = fixture;
		const intercepted = Promise.withResolvers<void>();
		const releaseResponse = Promise.withResolvers<void>();
		try {
			await page.goto((await canvas.open({ instanceId, input: {} })).url);
			await expect(page.locator("#overview-status")).toHaveText(
				"Overview loaded.",
			);
			const failedWrite = page.waitForResponse((response) =>
				response.url().includes("/mutate/"),
			);
			await page.getByRole("button", { name: "Approve", exact: true }).click();
			expect((await failedWrite).ok()).toBe(false);
			const warning = page.locator("#mutation-status");
			await expect(warning).toContainText("may have partly completed");
			remote.overviewWait = Promise.withResolvers<void>();
			await page.route(/\/refresh\/[^/]+$/, async (route) => {
				const response = outcome === "accepted" ? await route.fetch() : null;
				intercepted.resolve();
				await releaseResponse.promise;
				if (outcome === "network") await route.abort("failed");
				else if (response) await route.fulfill({ response });
				else await route.fulfill({ status: outcome as number });
			});
			await page.getByRole("button", { name: "Refresh", exact: true }).click();
			await intercepted.promise;
			if (outcome !== "accepted") await fixture.refresh();
			await expect(page.locator("#overview-status")).toHaveText(
				"Loading overview...",
			);
			if (outcome === "accepted") {
				remote.overviewWait.resolve();
				await expect(page.locator("#overview-status")).toHaveText(
					"Overview loaded.",
				);
				await expect(warning).toBeVisible();
			}
			const settled =
				outcome === "network"
					? page.waitForEvent("requestfailed", (request) =>
							request.url().includes("/refresh/"),
						)
					: page.waitForResponse((response) =>
							response.url().includes("/refresh/"),
						);
			releaseResponse.resolve();
			await settled;
			await page.unroute(/\/refresh\/[^/]+$/);
			if (outcome !== "accepted") {
				if (outcome !== 409)
					await expect(page.locator("#canvas-toast")).toContainText(
						outcome === "network"
							? "The canvas request failed."
							: "The canvas action failed.",
					);
				remote.overviewWait.resolve();
				await expect(page.locator("#overview-status")).toHaveText(
					"Overview loaded.",
				);
				await expect(warning).toBeVisible();
				await fixture.refresh();
				await expect(page.locator("#overview-status")).toHaveText(
					"Overview loaded.",
				);
				await expect(warning).toBeVisible();
				await page
					.getByRole("button", { name: "Refresh", exact: true })
					.click();
			}
			await expect(page.locator("#canvas-footer")).toBeHidden();
			expect(remote.writes).toBe(1);
		} finally {
			releaseResponse.resolve();
			remote.overviewWait?.resolve();
			await page.goto("about:blank").catch(() => {});
			await canvas.dispose();
		}
	});
}

test("canvas feedback requires a new recovery Refresh after a newer failed write", async ({
	page,
}) => {
	const fixture = createFeedbackFixture();
	const { canvas, instanceId, remote } = fixture;
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		await approve.click();
		const warning = page.locator("#mutation-status");
		await expect(warning).toContainText("may have partly completed");
		remote.overviewWait = Promise.withResolvers<void>();
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#overview-status")).toHaveText(
			"Loading overview...",
		);
		await expect(approve).toHaveAttribute("aria-disabled", "false");
		const failedWrite = page.waitForResponse((response) =>
			response.url().includes("/mutate/"),
		);
		await approve.click();
		expect((await failedWrite).ok()).toBe(false);
		await expect.poll(() => remote.writes).toBe(2);
		await expect(page.locator("#overview-status")).toContainText("cancelled");
		remote.overviewWait.resolve();
		await page
			.getByRole("button", { name: "Retry overview", exact: true })
			.click();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(warning).toBeVisible();
		await expect(page.locator("#canvas-toast")).toBeVisible();
		await fixture.refresh();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await expect(warning).toBeVisible();
		await expect(page.locator("#canvas-toast")).toBeVisible();
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		expect(remote.writes).toBe(2);
	} finally {
		remote.overviewWait?.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("canvas feedback ignores an old binding's rejected Refresh during newer recovery", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const originalFetch = window.fetch;
		window.fetch = (input, options) =>
			typeof input === "string" && input.startsWith("/refresh/")
				? originalFetch(input, { ...options, signal: undefined })
				: originalFetch(input, options);
	});
	const fixture = createFeedbackFixture();
	const { canvas, instanceId, repository, remote } = fixture;
	const intercepted = Promise.withResolvers<void>();
	const releaseOldRequest = Promise.withResolvers<void>();
	let requests = 0;
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		await approve.click();
		await expect(page.locator("#mutation-status")).toBeVisible();
		await page.route(/\/refresh\/[^/]+$/, async (route) => {
			if (++requests !== 1) return route.continue();
			intercepted.resolve();
			await releaseOldRequest.promise;
			await route.fulfill({ status: 503 });
		});
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await intercepted.promise;
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await approve.click();
		await expect.poll(() => remote.writes).toBe(2);
		await expect(page.locator("#mutation-status")).toBeVisible();
		remote.overviewWait = Promise.withResolvers<void>();
		await page.getByRole("button", { name: "Refresh", exact: true }).click();
		await expect(page.locator("#overview-status")).toHaveText(
			"Loading overview...",
		);
		const rejected = page.waitForResponse(
			(response) =>
				response.url().includes("/refresh/") && response.status() === 503,
		);
		releaseOldRequest.resolve();
		await rejected;
		await expect(page.locator("#toast-message")).not.toContainText(
			"The canvas action failed.",
		);
		remote.overviewWait.resolve();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(page.locator("#canvas-toast")).toBeHidden();
		expect(remote.writes).toBe(2);
	} finally {
		releaseOldRequest.resolve();
		remote.overviewWait?.resolve();
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("canvas feedback recovers matching read toasts without dismissing clipboard failures", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async () => {
					throw new Error("Clipboard denied");
				},
			},
		});
	});
	const fixture = createFeedbackFixture();
	const { canvas, instanceId, remote } = fixture;
	try {
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		const toast = page.locator("#canvas-toast");
		const refresh = page.getByRole("button", { name: "Refresh", exact: true });
		remote.failDetails = true;
		await fixture.refresh();
		await expect(page.getByTestId("refresh-status")).toContainText(
			"Could not load the pull request",
		);
		await expect(toast).toBeHidden();
		await refresh.click();
		await expect(toast).toContainText("Could not refresh pull request");
		remote.failDetails = false;
		await refresh.click();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(toast).toBeHidden();

		remote.failOverview = true;
		await fixture.refresh();
		const retry = page.getByRole("button", {
			name: "Retry overview",
			exact: true,
		});
		await expect(retry).toBeVisible();
		await retry.click();
		await expect(toast).toContainText("Could not load pull request content");
		remote.failOverview = false;
		await retry.click();
		await expect(toast).toBeHidden();
		await expect(page.locator("#canvas-footer")).toBeHidden();

		remote.failOverview = true;
		await fixture.refresh();
		await expect(retry).toBeVisible();
		remote.failOverview = false;
		await page.route(/\/load-overview\/[^/]+$/, (route) =>
			route.fulfill({ status: 503 }),
		);
		await retry.click();
		await expect(toast).toContainText("The canvas read could not start.");
		await page.unroute(/\/load-overview\/[^/]+$/);
		await retry.click();
		await expect(toast).toBeHidden();
		await expect(page.locator("#canvas-footer")).toBeHidden();

		remote.failDetails = true;
		await fixture.refresh();
		await expect(refresh).toHaveAttribute("aria-disabled", "false");
		await page
			.getByRole("button", { name: "Copy PR URL", exact: true })
			.focus();
		await page.keyboard.press("Enter");
		await expect(toast).toContainText("Couldn't copy");
		remote.failDetails = false;
		await refresh.click();
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(toast).toContainText("Couldn't copy");
		await expect(toast).toBeVisible();
		expect(remote.writes).toBe(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await canvas.dispose();
	}
});

test("canvas feedback shows queued-build confirmations without a footer", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		await expect(page.locator("#overview-status")).toHaveText(
			"Overview loaded.",
		);
		await mutatePreview(page, "build-retry", { buildId: 42 });
		await expect(page.locator("#canvas-toast")).toBeVisible();
		await expect(page.locator("#toast-message")).toHaveText(
			"Queued build #45. This does not rerun the PR policy.",
		);
		await expect(page.locator("#canvas-footer")).toBeHidden();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("revoked authorization preserves the absence of canvas lifecycle controls", async ({
	page,
}) => {
	let operations = ["vote"];
	const repository = {
		organization: "fabrikam",
		project: completionProjectId,
		repositoryId: "11111111-1111-4111-8111-111111111111",
		accountId: "fixture",
	};
	const canvas = createPullRequestCanvas({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		getAccess: async () => ({
			viewerId: "44444444-4444-4444-8444-444444444444",
			operations,
		}),
		fetch: createCompletionReadinessFetch(() => "approved"),
	});
	try {
		const instanceId = randomUUID();
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page.goto((await canvas.open({ instanceId, input: {} })).url);
		await expect(
			page.getByRole("button", { name: "Pull request actions", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Complete", exact: true }),
		).toHaveCount(0);
		operations = [];
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await expect(
			page.getByRole("button", { name: "Pull request actions", exact: true }),
		).toBeHidden();
		await expect(page.locator("#access-status")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Access", exact: true }),
		).toHaveCount(0);
		await expect(page.locator("#pr-title")).toBeVisible();
		operations = ["vote"];
		canvas.setBinding(instanceId, { repository, pullRequestId: 22 });
		await page
			.getByRole("button", { name: "Review options", exact: true })
			.click();
		await expect(
			page.getByRole("menu", { name: "Review options" }),
		).toBeVisible();
		canvas.setBinding(instanceId, null);
		await expect(
			page.getByRole("menu", { name: "Review options" }),
		).toBeHidden();
		await expect(page.getByTestId("refresh-status")).toBeFocused();
	} finally {
		await page.goto("about:blank");
		await canvas.dispose();
	}
});

test("fixture authorization exposes explicit PR confirmations", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const mutations: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/"))
			mutations.push(request.postDataJSON().operation);
	});
	try {
		await page.goto(preview.url);
		const statusBadge = page.locator("#pr-badge");
		await expect(
			page
				.getByTestId("description")
				.getByRole("heading", { name: "Retry behavior" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await mutatePreview(page, "abandon", { confirm: true });
		await expect(page.getByTestId("pr-state")).toHaveText("Abandoned");
		await expect(statusBadge).toHaveCSS("background-color", "rgb(207, 34, 46)");
		await expect(statusBadge).toHaveCSS("color", "rgb(255, 255, 255)");
		expect(
			mutations.filter((operation) => operation === "abandon"),
		).toHaveLength(1);
		const reactivate = page.getByRole("button", {
			name: "Reactivate",
			exact: true,
		});
		await expect(reactivate).toBeVisible();
		await expect(
			page.getByRole("button", {
				name: "Pull request actions",
				exact: true,
			}),
		).toHaveCount(0);
		await reactivate.click();
		await expect(page.getByTestId("pr-state")).toHaveText("Active");
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});

test("discussion groups replies in one card with accessible relative timestamps", async ({
	page,
}) => {
	await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
	const preview = await startPullRequestPreview();
	const fileReads: string[] = [];
	const interactions: Array<Record<string, unknown>> = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/interaction/"))
			interactions.push(request.postDataJSON());
		if (/^\/(?:load-changes|load-file)\//.test(new URL(request.url()).pathname))
			fileReads.push(request.url());
	});
	try {
		await page.goto(preview.url);
		const thread = page.locator("#thread-1");
		await expect(thread).toContainText(
			"Does the retry limit include the first attempt?",
		);
		const card = thread.locator(".comment-thread");
		await expect(card).toHaveCount(1);
		await expect(card).toContainText(
			"Yes. There are at most three attempts in total.",
		);
		await expect(card.getByText("Active", { exact: true })).toBeVisible();
		await expect(card.locator(".comment-file-header")).toContainText(
			"/src/retry.ts:2",
		);
		await expect(card.getByRole("button", { name: /^View \/src/ })).toHaveCount(
			0,
		);
		const age = thread
			.locator('[data-comment-id="1"]')
			.first()
			.locator(".comment-age");
		await expect(age).toHaveAccessibleName(
			"now, Sam Example comment, show timestamp",
		);
		await expect(age).toHaveText("now");
		await expect(age.locator("time")).toHaveAttribute(
			"datetime",
			"2026-09-10T09:00:00.000Z",
		);
		expect(interactions).toEqual([]);
		await age.focus();
		await page.keyboard.press("Enter");
		await expect(age).toBeFocused();
		await expect(age).toHaveAttribute("aria-expanded", "true");
		await expect(card.getByText(/September 10, 2026/)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(age).toBeFocused();
		await expect(age).toHaveAttribute("aria-expanded", "false");
		await expect(card.getByText(/September 10, 2026/)).toBeHidden();
		await expect.poll(() => interactions.length).toBe(2);
		expect(
			interactions.filter((report) => report.phase === "finished"),
		).toMatchObject([
			{ action: "expand", stage: "timestamp", result: "success" },
			{ action: "collapse", stage: "timestamp", result: "success" },
		]);
		await age.press("Enter");
		await expect(age).toHaveAttribute("aria-expanded", "true");
		await expect.poll(() => interactions.length).toBe(3);
		await page.keyboard.press("Tab");
		await expect(age).toHaveAttribute("aria-expanded", "false");
		const reply = thread.getByRole("button", { name: "Reply", exact: true });
		await reply.focus();
		await age.hover();
		await expect(age).toHaveAttribute("aria-expanded", "true");
		await expect(reply).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(age).toHaveAttribute("aria-expanded", "false");
		await expect(reply).toBeFocused();

		await reply.click();
		const composer = thread.getByRole("form", { name: "Reply" });
		const comment = composer.getByRole("textbox", { name: "Comment" });
		await comment.fill("Keep this draft when dismissing the timestamp");
		await age.evaluate((element) => {
			element.setAttribute("data-clock-test-node", "retained");
		});
		await comment.focus();
		await page.clock.fastForward(2 * 60_000);
		await expect(age).toHaveText("2m ago");
		await expect(age).toHaveAccessibleName(
			"2 minutes ago, Sam Example comment, show timestamp",
		);
		await expect(age).toHaveAttribute("data-clock-test-node", "retained");
		await expect(comment).toBeFocused();
		await expect(comment).toHaveValue(
			"Keep this draft when dismissing the timestamp",
		);
		await preview.refresh();
		await expect(page.getByTestId("refresh-status")).toHaveText(
			"Pull request is up to date.",
		);
		await expect(age).toHaveAttribute("data-clock-test-node", "retained");
		await expect(age).toHaveText("2m ago");
		await expect(age.locator("time")).toHaveAttribute(
			"datetime",
			"2026-09-10T09:00:00.000Z",
		);
		await expect(comment).toHaveValue(
			"Keep this draft when dismissing the timestamp",
		);
		await comment.focus();
		await page.clock.fastForward(60_000);
		await expect(age).toHaveText("3m ago");
		await expect(age).toHaveAccessibleName(
			"3 minutes ago, Sam Example comment, show timestamp",
		);
		await expect(comment).toBeFocused();
		await age.hover();
		await expect(age).toHaveAttribute("aria-expanded", "true");
		await page.keyboard.press("Escape");
		await expect(age).toHaveAttribute("aria-expanded", "false");
		await expect(comment).toBeFocused();
		await expect(comment).toHaveValue(
			"Keep this draft when dismissing the timestamp",
		);
		await page.keyboard.press("Escape");
		await expect(composer).toBeHidden();
		await expect(reply).toBeFocused();
		expect(fileReads).toEqual([]);
		expect(interactions).toHaveLength(3);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("discussion actions hide during replies and restore keyboard focus after Cancel", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		const thread = page.locator("#thread-1");
		const reply = thread.locator('button[data-action="Reply"]');
		await reply.click();
		const composer = thread.getByRole("form", { name: "Reply" });
		const comment = composer.getByRole("textbox", { name: "Comment" });
		await comment.fill("Keep this draft while reading the discussion");
		await preview.refresh();
		await expect(comment).toHaveValue(
			"Keep this draft while reading the discussion",
		);
		const more = thread.getByRole("button", { name: "Change comment status" });
		await expect(reply).toBeHidden();
		await expect(more).toBeHidden();
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toBeHidden();
		await expect(
			thread.getByRole("button", { name: "Resolve", exact: true }),
		).toBeHidden();
		await expect(comment).toBeFocused();
		await expect(
			page.getByRole("menu", { name: "Change comment status" }),
		).toBeHidden();
		await composer.getByRole("button", { name: "Cancel" }).click();
		await expect(reply).toBeFocused();
		await more.focus();
		await page.keyboard.press("ArrowDown");
		const menu = page.getByRole("menu", { name: "Change comment status" });
		await expect(menu.getByRole("menuitem", { name: "Pending" })).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(
			menu.getByRole("menuitem", { name: "Won't fix" }),
		).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden();
		await expect(more).toBeFocused();
		await more.click();
		await menu.getByRole("menuitem", { name: "Pending" }).click();
		await expect(thread.getByRole("form", { name: "Pending" })).toHaveCount(0);
		await expect(thread.getByText("Pending", { exact: true })).toBeVisible();
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		await expect(more).toBeFocused();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("thread link buttons copy directly and comment menus only expose author actions", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (value: string) => {
					(
						window as typeof window & {
							copiedCommentLink?: string;
						}
					).copiedCommentLink = value;
				},
			},
		});
	});
	const preview = await startPullRequestPreview();
	try {
		await page.goto(preview.url);
		const thread = page.locator("#thread-1");
		const ownComment = thread.locator('[data-comment-id="1"]');
		const copyLink = ownComment.getByRole("button", {
			name: "Copy link, comment thread 1 by Sam Example",
			exact: true,
		});
		const ownActions = ownComment.getByRole("button", {
			name: "Actions for Sam Example",
			exact: true,
		});
		await expect(copyLink).toHaveCSS("width", "24px");
		await expect(copyLink).toHaveCSS("height", "24px");
		await expect(copyLink).toHaveCSS("opacity", "1");
		await expect(ownActions).toHaveCSS("width", "24px");
		await expect(ownActions).toHaveCSS("height", "24px");
		await expect(ownActions).toHaveCSS("opacity", "0");
		await ownActions.focus();
		await expect(copyLink).toHaveCSS("opacity", "1");
		await expect(ownActions).toHaveCSS("opacity", "1");
		await copyLink.click();
		await expect(page.locator("#canvas-toast")).toBeVisible();
		await expect(page.locator("#toast-message")).toHaveText(
			"Comment thread link copied.",
		);
		await expect(page.locator("#canvas-footer")).toBeHidden();
		await expect(
			page.getByRole("menu", {
				name: "Actions for Sam Example",
				exact: true,
			}),
		).toHaveCount(0);
		const copied = await page.evaluate(
			() =>
				(
					window as typeof window & {
						copiedCommentLink?: string;
					}
				).copiedCommentLink,
		);
		const copiedUrl = new URL(copied ?? "");
		const pullRequestUrl = new URL(
			(await page.locator("#pr-number").getAttribute("href")) ?? "",
		);
		expect(copiedUrl.origin).toBe(pullRequestUrl.origin);
		expect(copiedUrl.pathname).toBe(pullRequestUrl.pathname);
		expect(copiedUrl.searchParams.get("discussionId")).toBe("1");

		await ownActions.click();
		const menu = page.getByRole("menu", {
			name: "Actions for Sam Example",
			exact: true,
		});
		await expect(menu.getByRole("menuitem")).toHaveText(["Edit", "Delete"]);
		await expect(menu.locator(".action-menu-icon")).toHaveCount(2);
		await page.keyboard.press("Escape");

		const otherComment = thread.locator('[data-comment-id="2"]');
		await expect(otherComment.locator(".comment-actions")).toHaveCount(0);
		const secondThread = page.locator("#thread-2");
		const secondCopyLink = secondThread
			.locator('[data-comment-id="1"]')
			.getByRole("button", {
				name: "Copy link, comment thread 2 by Ada Example",
				exact: true,
			});
		await secondThread.locator('[data-comment-id="1"]').hover();
		await expect(secondCopyLink).toBeVisible();
		await secondCopyLink.click();
		const secondCopied = await page.evaluate(
			() =>
				(
					window as typeof window & {
						copiedCommentLink?: string;
					}
				).copiedCommentLink,
		);
		expect(new URL(secondCopied ?? "").searchParams.get("discussionId")).toBe(
			"2",
		);
		await expect(
			page.getByRole("menu", {
				name: "Actions for Ada Example",
				exact: true,
			}),
		).toHaveCount(0);

		await ownActions.focus();
		await ownActions.click();
		await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
		const confirmation = page.getByRole("dialog", {
			name: "Delete comment",
			exact: true,
		});
		await expect(confirmation).toBeVisible();
		await expect(confirmation).toHaveCSS("position", "fixed");
		await expect(ownComment).toBeVisible();
		await confirmation
			.getByRole("button", { name: "Delete comment", exact: true })
			.click();
		await expect(ownComment).toHaveCount(0);
		await expect(thread).toBeVisible();
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("discussion supports Markdown comments, replies, edits, resolution and file context", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const mutations: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/mutate/"))
			mutations.push(request.postDataJSON().operation);
	});
	try {
		await page.goto(preview.url);
		const form = page.getByRole("form", { name: "Add comment" });
		await form
			.getByRole("textbox", { name: "Add a comment", exact: true })
			.fill("**Fixture comment**");
		await form.getByRole("button", { name: "Save", exact: true }).click();
		await expect(
			page.getByTestId("threads").getByText("Fixture comment", { exact: true }),
		).toBeVisible();
		const thread = page.locator("#thread-1");
		const replyButton = thread.getByRole("button", {
			name: "Reply",
			exact: true,
		});
		const resolve = thread.getByRole("button", {
			name: "Resolve",
			exact: true,
		});
		const statusMenu = thread.getByRole("button", {
			name: "Change comment status",
			exact: true,
		});
		await expect(replyButton).toHaveClass(/thread-reply-button/);
		const actionLayout = await Promise.all(
			[replyButton, resolve, statusMenu].map((control) =>
				control.evaluate((element) => element.getBoundingClientRect().toJSON()),
			),
		);
		expect(actionLayout[0].x).toBeLessThan(actionLayout[1].x);
		expect(
			Math.abs(actionLayout[1].right - actionLayout[2].x),
		).toBeLessThanOrEqual(1);
		expect(
			await resolve.evaluate(
				(element) =>
					element.parentElement?.classList.contains("split-control") &&
					element.parentElement ===
						document.querySelector(
							'#thread-1 button[aria-label="Change comment status"]',
						)?.parentElement,
			),
		).toBe(true);
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		await replyButton.click();
		const reply = thread.getByRole("form", { name: "Reply" });
		await reply
			.getByRole("textbox", { name: "Comment", exact: true })
			.fill("Reply from sample reviewer");
		await reply.getByRole("button", { name: "Reply", exact: true }).click();
		await expect(thread.getByText("Reply from sample reviewer")).toBeVisible();
		const ownComment = thread.locator('[data-comment-id="1"]');
		const ownCommentActions = ownComment.getByRole("button", {
			name: "Actions for Sam Example",
			exact: true,
		});
		await ownCommentActions.focus();
		await ownCommentActions.click();
		await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
		const edit = thread.getByRole("form", { name: "Edit comment" });
		await edit
			.getByRole("textbox", { name: "Comment", exact: true })
			.fill("Updated reviewer comment");
		await edit.getByRole("button", { name: "Save comment" }).click();
		await expect(thread.getByText("Updated reviewer comment")).toBeVisible();
		await thread.getByRole("button", { name: "Resolve", exact: true }).click();
		await expect(thread.getByText("Resolved", { exact: true })).toBeVisible();
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toHaveCount(0);
		await expect(
			thread.getByRole("button", { name: "Reopen", exact: true }),
		).toBeFocused();
		await thread.getByRole("button", { name: "Reopen", exact: true }).click();
		await expect(thread.getByText("Active", { exact: true })).toBeVisible();
		await expect(
			thread.getByRole("button", { name: "Fix", exact: true }),
		).toHaveAttribute("aria-disabled", "false");
		await expect(
			thread.getByRole("button", { name: "Resolve", exact: true }),
		).toBeFocused();
		await thread.getByRole("button", { name: "Resolve", exact: true }).click();
		const commentsFilter = page.locator("#discussion-filter button");
		await commentsFilter.click();
		await page.getByRole("menuitemradio", { name: /^Active comments/ }).click();
		await expect(thread).toBeHidden();
		await commentsFilter.click();
		await page
			.getByRole("menuitemradio", { name: /^Resolved comments/ })
			.click();
		await expect(thread.locator(".comment-file-header")).toContainText(
			"/src/retry.ts:2",
		);
		await expect(
			thread.getByRole("table", { name: /Code diff/ }),
		).toContainText("request");
		await expect(page.getByRole("tablist")).toHaveCount(0);
	} finally {
		await page.goto("about:blank").catch(() => {});
		await preview.dispose();
	}
});

test("stored inline draft survives reload without loading Changes", async ({
	page,
}) => {
	const preview = await startPullRequestPreview();
	const changesRequests: string[] = [];
	page.on("request", (request) => {
		if (/^\/(?:load-changes|load-file)\//.test(new URL(request.url()).pathname))
			changesRequests.push(request.url());
	});
	try {
		await page.goto(preview.url);
		await saveExistingDraft(page, "Captured retry line");
		await expect(
			page.getByRole("heading", { name: "Staged comments · 1" }),
		).toBeVisible();
		await page.reload();
		await expect(
			page.getByText("Captured retry line", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Review", exact: true }),
		).toHaveCount(0);
		expect(changesRequests).toEqual([]);
	} finally {
		await page.goto("about:blank");
		await preview.dispose();
	}
});
