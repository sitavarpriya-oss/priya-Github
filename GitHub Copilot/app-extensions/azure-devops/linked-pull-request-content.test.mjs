// @vitest-environment node
import { setImmediate } from "node:timers/promises";
import { expect, onTestFinished, test, vi } from "vitest";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";

const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "22222222-2222-4222-8222-222222222222",
		accountId: "account-one",
	},
	pullRequestId: 22,
};

function pr(id = 22) {
	return Response.json({
		pullRequestId: id,
		repository: {
			id: binding.repository.repositoryId,
			project: { id: "11111111-1111-4111-8111-111111111111" },
		},
		title: `Pull request ${id}`,
		status: "active",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
		createdBy: { id: "author", displayName: "Ada" },
		reviewers: [{ id: "reviewer", displayName: "Sam", vote: 10 }],
	});
}

function setup(refreshIntervalMs) {
	const fetch = vi.fn(async (input) => {
		const url = new URL(input);
		if (/\/pullrequests\/\d+$/.test(url.pathname)) return pr();
		if (url.pathname.endsWith("/iterations"))
			return Response.json({
				value: [
					{
						id: 1,
						commonRefCommit: { commitId: "a".repeat(40) },
						sourceRefCommit: { commitId: "b".repeat(40) },
					},
				],
			});
		if (url.pathname.endsWith("/changes"))
			return Response.json({
				changeEntries: [
					{
						changeTrackingId: 1,
						changeType: "edit",
						item: { path: "/readme.md" },
					},
				],
				nextSkip: 0,
				nextTop: 0,
			});
		if (url.pathname.endsWith("/items"))
			return Response.json({
				path: url.searchParams.get("path"),
				commitId: url.searchParams.get("versionDescriptor.version"),
				gitObjectType: "blob",
				contentMetadata: { isBinary: false },
				content:
					url.searchParams.get("versionDescriptor.version") === "a".repeat(40)
						? "Before\n"
						: "After\n",
			});
		return Response.json({ value: [] });
	});
	const authentication = {
		getAccessToken: vi.fn(async () => ({ accessToken: "private-token" })),
	};
	const linked = createLinkedPullRequest({
		authentication,
		fetch,
		refreshIntervalMs,
	});
	onTestFinished(() => linked.dispose());
	linked.setBinding(binding);
	return { linked, fetch, authentication };
}

test.each(["network", "timeout", "http"])(
	"automatic refresh recovers partial overview reads after %s failures",
	async (failure) => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(1000);
		const original = fetch.getMockImplementation();
		let failing = false;
		let comment = "Last good comment";
		fetch.mockImplementation(async (input) => {
			if (new URL(input).pathname.endsWith("/threads")) {
				if (failing) {
					if (failure === "http") return new Response(null, { status: 429 });
					if (failure === "network")
						throw new TypeError("private network detail");
					throw new DOMException("private deadline detail", "TimeoutError");
				}
				return Response.json({
					value: [
						{
							id: 1,
							status: "active",
							comments: [{ id: 1, content: comment }],
						},
					],
				});
			}
			return original(input);
		});
		try {
			await linked.refresh();
			await linked.loadOverview();
			failing = true;
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot().overview.data).toMatchObject({
				threads: [{ comments: [{ content: "Last good comment" }] }],
				errors: { threads: expect.any(String) },
			});
			expect(JSON.stringify(linked.getSnapshot())).not.toContain("private");
			failing = false;
			comment = "New upstream comment";
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot().overview.data).toMatchObject({
				threads: [{ comments: [{ content: comment }] }],
			});
			expect(linked.getSnapshot().overview.data.errors).toBeUndefined();
		} finally {
			linked.dispose();
			vi.useRealTimers();
		}
	},
);

test.each(["timeout", "busy"])(
	"automatic refresh keeps polling through a temporary host token %s failure",
	async (code) => {
		vi.useFakeTimers();
		const { linked, fetch, authentication } = setup(1000);
		try {
			await linked.refresh();
			const calls = fetch.mock.calls.length;
			authentication.getAccessToken.mockRejectedValueOnce(
				Object.assign(new Error(`Authentication ${code}`), {
					code,
					detail: "private host detail",
				}),
			);
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot().status).toBe("error");
			expect(fetch).toHaveBeenCalledTimes(calls);
			expect(JSON.stringify(linked.getSnapshot())).not.toMatch(
				/private|Bearer/,
			);
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot().status).toBe("ready");
			expect(fetch.mock.calls.length).toBeGreaterThan(calls);
		} finally {
			linked.dispose();
			vi.useRealTimers();
		}
	},
);

test.each([
	"denied",
	"account_unavailable",
	"auth_required",
	"credential_unavailable",
	"invalid_request",
])("does not poll after host %s failures in a content read", async (code) => {
	vi.useFakeTimers();
	const { linked, fetch, authentication } = setup(1000);
	try {
		await linked.refresh();
		const calls = fetch.mock.calls.length;
		authentication.getAccessToken.mockRejectedValue(
			Object.assign(new Error("private host detail"), { code }),
		);
		await linked.loadOverview();
		expect(linked.getSnapshot().overview.status).toBe("error");
		const tokenCalls = authentication.getAccessToken.mock.calls.length;
		await vi.advanceTimersByTimeAsync(3000);
		expect(fetch).toHaveBeenCalledTimes(calls);
		expect(authentication.getAccessToken).toHaveBeenCalledTimes(tokenCalls);
		expect(JSON.stringify(linked.getSnapshot())).not.toContain(
			"private host detail",
		);
	} finally {
		linked.dispose();
		vi.useRealTimers();
	}
});

test("loads overview and Changes only on request, then reads the selected file", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(linked.getSnapshot().overview.status).toBe("idle");
	await linked.loadOverview();
	expect(linked.getSnapshot().overview).toMatchObject({
		status: "ready",
		data: { author: { name: "Ada" }, reviewers: [{ name: "Sam", vote: 10 }] },
	});
	await linked.loadChanges();
	await linked.loadFile(0);
	expect(linked.getSnapshot()).toMatchObject({
		selectedFile: 0,
		fileDiff: {
			status: "ready",
			data: { path: "/readme.md", original: "Before\n", modified: "After\n" },
		},
	});
	expect(Object.isFrozen(linked.getSnapshot().changes.data.files[0])).toBe(
		true,
	);
	expect(JSON.stringify(linked.getSnapshot())).not.toMatch(
		/private-token|account-one/,
	);
});

test("reloading aggregate Changes clears Viewed marks from a previous source revision", async () => {
	const { linked, fetch } = setup();
	const original = fetch.getMockImplementation();
	let sourceCommitId = "b".repeat(40);
	fetch.mockImplementation(async (input) => {
		const response = await original(input);
		if (!new URL(input).pathname.endsWith("/iterations")) return response;
		const data = await response.json();
		data.value[0].sourceRefCommit.commitId = sourceCommitId;
		return Response.json(data);
	});
	await linked.refresh();
	await linked.loadChanges();
	await linked.updateReviewState({
		viewed: { path: "/readme.md", viewed: true },
	});
	sourceCommitId = "c".repeat(40);
	await linked.loadChanges();
	expect(linked.getSnapshot().reviewState).toMatchObject({
		sourceCommitId,
		viewed: [],
	});
});

test("a delayed PR refresh cannot replace progress from a newer aggregate comparison", async () => {
	const { linked, fetch } = setup();
	const original = fetch.getMockImplementation();
	let sourceCommitId = "b".repeat(40);
	fetch.mockImplementation(async (input) => {
		const response = await original(input);
		const data = await response.json();
		const path = new URL(input).pathname;
		if (path.endsWith("/iterations"))
			data.value[0].sourceRefCommit.commitId = sourceCommitId;
		if (/\/pullrequests\/\d+$/.test(path))
			data.lastMergeSourceCommit = { commitId: sourceCommitId };
		return Response.json(data);
	});
	await linked.refresh();
	await linked.loadChanges();
	const incoming = Promise.withResolvers();
	const started = Promise.withResolvers();
	const oldResponse = Response.json({
		...(await pr().json()),
		lastMergeSourceCommit: { commitId: sourceCommitId },
	});
	fetch.mockImplementationOnce(() => {
		started.resolve();
		return incoming.promise;
	});
	const refresh = linked.refresh({ background: true });
	await started.promise;
	sourceCommitId = "c".repeat(40);
	await linked.loadChanges();
	await linked.updateReviewState({
		viewed: { path: "/readme.md", viewed: true },
	});
	incoming.resolve(oldResponse);
	await refresh;
	expect(linked.getSnapshot().reviewState).toMatchObject({
		sourceCommitId,
		viewed: ["/readme.md"],
	});
});

test("preserves last-good section data on errors and retries explicitly", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	await linked.loadOverview();
	const good = linked.getSnapshot().overview.data;
	fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
	await linked.loadOverview();
	expect(linked.getSnapshot().overview).toMatchObject({
		status: "error",
		data: good,
		error: expect.stringContaining("503"),
	});

	await linked.loadOverview();
	expect(linked.getSnapshot().overview.status).toBe("ready");
});

test("a policy-only failure keeps prior checks while updating discussion", async () => {
	const { linked, fetch } = setup();
	const original = fetch.getMockImplementation();
	let failPolicies = false;
	fetch.mockImplementation(async (input) => {
		const url = new URL(input);
		if (url.pathname.endsWith("/evaluations")) {
			if (failPolicies) return new Response(null, { status: 503 });
			return Response.json({
				value: [
					{
						evaluationId: "11111111-1111-4111-8111-111111111111",
						artifactId: url.searchParams.get("artifactId"),
						status: "approved",
						configuration: {
							isEnabled: true,
							isBlocking: true,
							type: { displayName: "Build" },
						},
					},
				],
			});
		}
		if (url.pathname.endsWith("/threads"))
			return Response.json({
				value: [
					{
						id: 1,
						status: "active",
						comments: [
							{
								id: 1,
								content: failPolicies ? "New discussion" : "Old discussion",
								commentType: "text",
							},
						],
					},
				],
			});
		return original(input);
	});
	await linked.refresh();
	await linked.loadOverview();
	const policies = linked.getSnapshot().overview.data.policies;
	failPolicies = true;
	await linked.loadOverview();
	expect(linked.getSnapshot().overview.data).toMatchObject({
		policies,
		errors: { policies: expect.any(String) },
		threads: [{ comments: [{ content: "New discussion" }] }],
	});
});

test("coalesces a section read and cancels it without waiting for the remote service", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	const late = Promise.withResolvers();
	fetch.mockReturnValueOnce(late.promise);
	const first = linked.loadOverview();
	expect(linked.loadOverview()).toBe(first);
	const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
	await setImmediate();
	linked.cancel();
	await cancelled;
	expect(linked.getSnapshot().overview.status).toBe("cancelled");
	late.resolve(pr());
	await linked.loadOverview();
	expect(linked.getSnapshot().overview.status).toBe("ready");
});

test("binding replacement clears every section and rejects a late file result", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	await linked.loadChanges();
	const late = Promise.withResolvers();
	fetch.mockReturnValue(late.promise);
	const pending = linked.loadFile(0);
	const cancelled = expect(pending).rejects.toMatchObject({
		name: "AbortError",
	});
	const previousBinding = linked.getSnapshot().bindingRevision;
	await setImmediate();
	linked.setBinding({ ...binding, pullRequestId: 23 });
	await cancelled;
	const current = linked.getSnapshot();
	expect(current.bindingRevision).toBeGreaterThan(previousBinding);
	expect(current).toMatchObject({
		pullRequest: null,
		selectedFile: null,
		overview: { status: "idle", data: null },
		changes: { status: "idle", data: null },
		fileDiff: { status: "idle", data: null },
	});
	late.resolve(Response.json({ content: "Old file contents" }));
	await setImmediate();
	expect(linked.getSnapshot()).toBe(current);
});

test("file selection requires the loaded change set and does not accept arbitrary paths", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	await expect(linked.loadFile(0)).rejects.toThrow();
	await linked.loadChanges();
	const count = fetch.mock.calls.length;
	for (const index of [-1, 1, 0.5, "/secret"]) {
		await expect(linked.loadFile(index)).rejects.toThrow();
	}
	expect(fetch).toHaveBeenCalledTimes(count);
});

test("refresh reloads requested sections and invalidates the previous file selection", async () => {
	const { linked } = setup();
	await linked.refresh();
	await linked.loadOverview();
	await linked.loadChanges();
	await linked.loadFile(0);
	const changesRevision = linked.getSnapshot().changesRevision;
	await linked.refresh();
	await expect.poll(() => linked.getSnapshot().overview.status).toBe("ready");
	await expect.poll(() => linked.getSnapshot().changes.status).toBe("ready");
	expect(linked.getSnapshot().changesRevision).toBeGreaterThan(changesRevision);
	expect(linked.getSnapshot()).toMatchObject({
		selectedFile: null,
		fileDiff: { status: "idle", data: null },
	});
});

test("reloading Changes cancels an old file read even within the same binding", async () => {
	const { linked, fetch } = setup();
	await linked.refresh();
	await linked.loadChanges();
	const late = Promise.withResolvers();
	fetch.mockReturnValueOnce(late.promise);
	const file = linked.loadFile(0);
	const cancelled = expect(file).rejects.toMatchObject({ name: "AbortError" });
	await setImmediate();
	await linked.loadChanges();
	await cancelled;
	late.resolve(Response.json({ content: "Obsolete version" }));
	await setImmediate();
	expect(linked.getSnapshot()).toMatchObject({
		selectedFile: null,
		fileDiff: { status: "idle", data: null },
	});
});
