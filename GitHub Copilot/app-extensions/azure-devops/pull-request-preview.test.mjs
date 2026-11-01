// @vitest-environment node
import { expect, onTestFinished, test } from "vitest";
import { startPullRequestPreview } from "./pull-request-preview.mjs";

async function workflow(options) {
	const preview = await startPullRequestPreview(options);
	onTestFinished(() => preview.dispose());
	const { origin, pathname } = new URL(preview.url);
	const id = pathname.split("/").at(-1);
	const state = async () => (await fetch(`${origin}/instances/${id}`)).json();
	await expect.poll(async () => (await state()).status).toBe("ready");
	async function post(route, body, commitId) {
		const current = await state();
		return fetch(
			`${origin}/${route}/${id}${commitId ? `?commitId=${commitId}` : ""}`,
			{
				method: "POST",
				headers: {
					Origin: origin,
					"Content-Type": "application/json",
					"X-Canvas-Binding": String(current.bindingRevision),
					"X-Canvas-Changes": String(current.changesRevision),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			},
		);
	}
	await post("load-overview");
	await expect.poll(async () => (await state()).overview.status).toBe("ready");
	async function mutate(operation, input) {
		const response = await post("mutate", { operation, input });
		expect(response.status, JSON.stringify(await response.json())).toBe(200);
		await expect
			.poll(async () => (await state()).overview.status)
			.toBe("ready");
		return state();
	}
	return { state, post, mutate };
}

test("starts a fixture-only preview through the production canvas and read APIs", async () => {
	const preview = await startPullRequestPreview();
	onTestFinished(() => preview.dispose());
	const url = new URL(preview.url);
	const id = url.pathname.split("/").at(-1);
	const snapshotUrl = `${url.origin}/instances/${id}`;
	const state = async () => (await fetch(snapshotUrl)).json();
	await expect.poll(async () => (await state()).status).toBe("ready");
	expect((await state()).pullRequest.title).toContain("[Preview]");
	const headers = {
		Origin: url.origin,
		"Content-Type": "application/json",
		"X-Canvas-Binding": String((await state()).bindingRevision),
	};
	for (const section of ["overview", "changes"]) {
		expect(
			(
				await fetch(`${url.origin}/load-${section}/${id}`, {
					method: "POST",
					headers,
				})
			).status,
		).toBe(202);
		await expect
			.poll(async () => (await state())[section].status)
			.toBe("ready");
	}
	const loaded = await state();
	expect(loaded.overview.data.threads).toHaveLength(12);
	expect(loaded.overview.data.threads[0].comments[0].content).toContain(
		"retry",
	);
	expect(loaded.overview.data.threads[0].comments).toHaveLength(5);
	expect(
		loaded.overview.data.threads[0].comments.map(
			(comment) => comment.author.name,
		),
	).toEqual([
		"Sam Example",
		"Ada Example",
		"Grace Hopper",
		"Lin Chen",
		"Alan Turing",
	]);
	expect(
		loaded.overview.data.threads
			.filter((thread) =>
				thread.comments.every((comment) => comment.commentType === "system"),
			)
			.map((thread) => thread.activityType),
	).toEqual([
		"StatusUpdate",
		"RefUpdate",
		"ReviewersUpdate",
		"PropertiesUpdate",
		"VoteUpdate",
		"IsDraftUpdate",
	]);
	expect(loaded.overview.data.statuses).toMatchObject([
		{
			name: "Unit tests",
			genre: "preview-ci",
			state: "succeeded",
			iterationId: 2,
			url: "https://dev.azure.com/fabrikam/22222222-2222-4222-8222-222222222222/_build/results?buildId=42",
		},
		{
			name: "Integration tests",
			genre: "preview-ci",
			state: "pending",
			iterationId: 2,
			url: "https://dev.azure.com/fabrikam/22222222-2222-4222-8222-222222222222/_build/results?buildId=43",
		},
		{
			name: "Lint",
			genre: "preview-ci",
			state: "failed",
			iterationId: 2,
			url: "https://dev.azure.com/fabrikam/22222222-2222-4222-8222-222222222222/_build/results?buildId=44",
		},
	]);
	expect(loaded.overview.data.errors).toBeUndefined();
	expect(loaded.changes.data.files).toHaveLength(4);
	expect(
		(
			await fetch(`${url.origin}/load-file/${id}/0`, {
				method: "POST",
				headers: {
					...headers,
					"X-Canvas-Changes": String(loaded.changesRevision),
				},
			})
		).status,
	).toBe(202);
	await expect.poll(async () => (await state()).fileDiff.status).toBe("ready");
	expect((await state()).fileDiff.data.modified).toContain("attempt < 3");
	expect(JSON.stringify(await state())).not.toContain("preview-not-a-token");
});

test("sample discussion includes code from its recorded PR comparison", async () => {
	const { state, post } = await workflow();
	expect((await post("load-thread-code", { threadIds: [1] })).status).toBe(202);
	await expect
		.poll(async () => (await state()).threadCode.status)
		.toBe("ready");
	const [result] = (await state()).threadCode.data;
	expect(result).toMatchObject({
		threadId: 1,
		error: null,
		preview: {
			path: "/src/retry.ts",
			baseCommitId: "a".repeat(40),
			sourceCommitId: "b".repeat(40),
			iterationId: 2,
		},
	});
	expect(result.preview.rows).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "delete",
				originalLine: 2,
				text: "  return request();",
			}),
			expect.objectContaining({
				kind: "add",
				modifiedLine: 2,
				text: "  for (let attempt = 0; attempt < 3; attempt++) {",
			}),
		]),
	);
	expect(result.preview.rows.length).toBeLessThanOrEqual(40);
});

test("sample discussion, review, and reviewer actions use the provider mutation routes", async () => {
	const { mutate, state, post } = await workflow();
	const deniedActivityReply = await post("mutate", {
		operation: "reply",
		input: { threadId: 7, content: "System activity is read-only" },
	});
	expect(deniedActivityReply.status).toBe(400);
	expect(
		(await state()).overview.data.threads.find((thread) => thread.id === 7)
			.comments,
	).toHaveLength(1);
	await mutate("reply", { threadId: 1, content: "Sample reply" });
	const firstReply = (await state()).overview.data.threads[0].comments.at(-1);
	expect(firstReply.content).toBe("Sample reply");
	await mutate("delete-comment", {
		threadId: 1,
		commentId: firstReply.id,
	});
	expect(
		(await state()).overview.data.threads[0].comments.some(
			(comment) => comment.id === firstReply.id,
		),
	).toBe(false);
	await mutate("reply", { threadId: 1, content: "Replacement reply" });
	const replacement = (await state()).overview.data.threads[0].comments.at(-1);
	expect(replacement).toMatchObject({ content: "Replacement reply" });
	expect(replacement.id).toBeGreaterThan(firstReply.id);
	await mutate("edit-comment", {
		threadId: 1,
		commentId: 1,
		content: "Edited question",
	});
	expect(
		(await state()).overview.data.threads[0].comments.find(
			(comment) => comment.id === 1,
		).content,
	).toBe("Edited question");
	const deniedDelete = await post("mutate", {
		operation: "delete-comment",
		input: { threadId: 1, commentId: 2 },
	});
	expect(deniedDelete.status).toBe(400);
	expect(
		(await state()).overview.data.threads[0].comments.some(
			(comment) => comment.id === 2,
		),
	).toBe(true);
	await mutate("delete-comment", { threadId: 1, commentId: 1 });
	expect(
		(await state()).overview.data.threads[0].comments.some(
			(comment) => comment.id === 1,
		),
	).toBe(false);
	await mutate("thread-status", { threadId: 1, status: "fixed" });
	expect((await state()).overview.data.threads[0].status).toBe("fixed");
	await mutate("vote", { vote: -5 });
	expect((await state()).overview.data.reviewers[0].vote).toBe(-5);
	const reviewerId = "99999999-9999-4999-8999-999999999999";
	await mutate("reviewer", { reviewerId });
	expect((await state()).overview.data.reviewers).toHaveLength(6);
	await mutate("reviewer", { reviewerId, remove: true });
	expect((await state()).overview.data.reviewers).toHaveLength(5);
	expect(
		(
			await post("review-state", {
				drafts: [{ id: "draft", content: "Staged sample comment" }],
			})
		).status,
	).toBe(200);
	await mutate("review", { vote: 10, content: "Sample review summary" });
	expect((await state()).reviewState.drafts).toEqual([]);
	expect((await state()).overview.data.threads).toHaveLength(14);
});

test("sample build and lifecycle actions remain local and require explicit completion input", async () => {
	const { mutate, state } = await workflow({ completionReady: true });
	const overview = (await state()).overview.data;
	await mutate("build-retry", { buildId: 42 });
	await mutate("build-cancel", { buildId: 43 });
	expect((await state()).overview.data.statuses).toEqual(overview.statuses);
	expect((await state()).overview.data.policies).toEqual(overview.policies);
	await mutate("draft", { draft: true });
	expect((await state()).pullRequest.state).toBe("draft");
	await mutate("draft", { draft: false });
	await mutate("abandon", { confirm: true });
	expect((await state()).pullRequest.state).toBe("closed");
	await mutate("reactivate", { confirm: true });
	await mutate("complete", { confirm: true, mergeStrategy: "squash" });
	expect((await state()).pullRequest.state).toBe("merged");
});

test("sample history loads a listed commit against its immutable parent", async () => {
	const { post, state } = await workflow();
	const commitId = "b".repeat(40);
	expect((await post("load-changes", undefined, commitId)).status).toBe(202);
	await expect.poll(async () => (await state()).changes.status).toBe("ready");
	expect((await state()).changes.data).toMatchObject({
		selectedCommitId: commitId,
		baseCommitId: "a".repeat(40),
		sourceCommitId: commitId,
	});
});
