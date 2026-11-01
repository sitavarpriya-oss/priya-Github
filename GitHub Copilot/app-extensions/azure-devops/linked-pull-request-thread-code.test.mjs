// @vitest-environment node
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import { createActionTelemetry } from "./action-telemetry.mjs";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import {
	AzureDevOpsContentError,
	AzureDevOpsHttpError,
	createPullRequestClient,
} from "./pull-requests.mjs";

vi.mock("./pull-requests.mjs", async (original) => ({
	...(await original()),
	createPullRequestClient: vi.fn(),
}));

const binding = {
	repository: {
		organization: "fabrikam",
		project: "tools",
		repositoryId: "repo-one",
		accountId: "account-one",
	},
	pullRequestId: 22,
};
const preview = {
	path: "/src/main.ts",
	originalPath: null,
	baseCommitId: "a".repeat(40),
	sourceCommitId: "b".repeat(40),
	iterationId: 2,
	rows: [
		{ kind: "delete", text: "old();", originalLine: 2, modifiedLine: null },
		{ kind: "add", text: "new();", originalLine: null, modifiedLine: 2 },
	],
	truncated: false,
};
const instances = [];
afterEach(() => {
	for (const linked of instances.splice(0)) linked.dispose();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function thread(id, line = 2) {
	return {
		id,
		path: preview.path,
		status: "active",
		comments: [],
		threadContext: {
			filePath: preview.path,
			rightFileStart: { line, offset: 1 },
			rightFileEnd: { line, offset: 6 },
		},
		pullRequestThreadContext: {
			changeTrackingId: 1,
			iterationContext: {
				firstComparingIteration: 2,
				secondComparingIteration: 2,
			},
		},
	};
}

async function setup(
	threads = [thread(1), thread(2)],
	telemetry,
	refreshIntervalMs,
) {
	const client = {
		get: vi.fn().mockResolvedValue({
			id: 22,
			state: "open",
			sourceCommitId: preview.sourceCommitId,
		}),
		getOverview: vi.fn().mockResolvedValue({
			author: null,
			createdAt: null,
			reviewers: [],
			policies: [],
			statuses: [],
			threads,
		}),
		getThreadCode: vi.fn().mockResolvedValue(preview),
	};
	createPullRequestClient.mockReturnValue(client);
	const linked = createLinkedPullRequest({
		authentication: { getAccessToken: vi.fn() },
		telemetry,
		refreshIntervalMs,
	});
	instances.push(linked);
	linked.setBinding(binding);
	await linked.refresh();
	await linked.loadOverview();
	return { linked, client };
}

test.each([
	[new AzureDevOpsContentError("too-large", "Preview is too large"), true],
	[new AzureDevOpsContentError("unsupported-diff", "Unsupported file"), true],
	[
		new AzureDevOpsContentError("thread-code-unavailable", "No text preview"),
		true,
	],
	[new AzureDevOpsHttpError(404), true],
	[new AzureDevOpsHttpError(401), false],
	[new AzureDevOpsHttpError(403), false],
	[new AzureDevOpsContentError("invalid-response", "Invalid response"), false],
])(
	"preview error %s preserves PR polling only for local preview limits (%s)",
	async (error, continues) => {
		vi.useFakeTimers();
		try {
			const { linked, client } = await setup(undefined, undefined, 1000);
			client.getThreadCode.mockRejectedValue(error);
			await linked.loadThreadCode([1]);
			expect(linked.getSnapshot().threadCode.data[0].error).toBeTruthy();
			await vi.advanceTimersByTimeAsync(3000);
			expect(client.get.mock.calls.length > 1).toBe(continues);
			expect(client.getThreadCode).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	},
);

test.each([false, true])(
	"explicit preview retry reports partial versus wholly failed batches (%s)",
	async (allFailed) => {
		const reports = [];
		const { linked, client } = await setup(
			undefined,
			createActionTelemetry((report) => reports.push(report)),
		);
		expect(reports).toEqual([]);
		client.getThreadCode.mockImplementation(async (_id, selected) => {
			if (allFailed || selected.id === 1) throw new AzureDevOpsHttpError(503);
			return preview;
		});
		await linked.loadThreadCode([1, 2], true);
		expect(reports).toHaveLength(2);
		expect(reports[1]).toMatchObject({
			actionId: reports[0].actionId,
			action: "retry",
			stage: "thread_code",
			result: allFailed ? "failure" : "partial",
			errorCode: "http",
			httpStatus: 503,
		});
		expect(JSON.stringify(reports)).not.toContain(preview.path);
	},
);

test("loads only selected line-linked threads and bounds the visible batch", async () => {
	const { linked, client } = await setup([
		thread(1),
		thread(2),
		{ id: 3, path: null, comments: [], status: "active" },
	]);
	expect(client.getThreadCode).not.toHaveBeenCalled();
	for (const ids of [
		[99],
		[3],
		[1, 1],
		Array.from({ length: 11 }, (_, i) => i + 1),
	]) {
		expect(() => linked.loadThreadCode(ids)).toThrow();
	}
	await linked.loadThreadCode([2]);
	expect(client.getThreadCode).toHaveBeenCalledTimes(1);
	expect(client.getThreadCode).toHaveBeenCalledWith(22, thread(2), {
		signal: expect.any(AbortSignal),
	});
	expect(linked.getSnapshot().threadCode).toMatchObject({
		status: "ready",
		data: [{ threadId: 2, preview, error: null }],
	});
	expect(JSON.parse(linked.getSnapshot().threadCode.data[0].key)).toEqual([
		preview.path,
		thread(2).threadContext,
		thread(2).pullRequestThreadContext,
	]);
	await linked.loadThreadCode([]);
	expect(linked.getSnapshot().threadCode.data).toBeNull();
});

test("coalesces a batch and limits parallel reads while sharing its cancellation signal", async () => {
	const { linked, client } = await setup(
		Array.from({ length: 10 }, (_, i) => thread(i + 1)),
	);
	const pending = Promise.withResolvers();
	client.getThreadCode.mockReturnValue(pending.promise);
	const ids = Array.from({ length: 10 }, (_, i) => i + 1);
	const first = linked.loadThreadCode(ids);
	expect(linked.loadThreadCode(ids)).toBe(first);
	await setImmediate();
	expect(client.getThreadCode).toHaveBeenCalledTimes(3);
	const signals = client.getThreadCode.mock.calls.map((call) => call[2].signal);
	expect(new Set(signals).size).toBe(1);
	pending.resolve(preview);
	await first;
	expect(client.getThreadCode).toHaveBeenCalledTimes(10);
	expect(linked.getSnapshot().threadCode.data).toHaveLength(10);
});

test("ends the batch at its deadline without starting queued file reads", async () => {
	const { linked, client } = await setup(
		Array.from({ length: 10 }, (_, i) => thread(i + 1)),
	);
	const deadline = new AbortController();
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(deadline.signal);
	const pending = Promise.withResolvers();
	client.getThreadCode.mockReturnValue(pending.promise);
	const loading = linked.loadThreadCode(
		Array.from({ length: 10 }, (_, i) => i + 1),
	);
	await setImmediate();
	expect(timeout).toHaveBeenCalledWith(30_000);
	expect(client.getThreadCode).toHaveBeenCalledTimes(3);
	deadline.abort(new DOMException("Deadline reached", "TimeoutError"));
	await loading;
	expect(client.getThreadCode).toHaveBeenCalledTimes(3);
	const settled = linked.getSnapshot();
	expect(settled.threadCode.data).toHaveLength(10);
	expect(
		settled.threadCode.data.every(
			(result) => result.preview === null && result.error.includes("timed out"),
		),
	).toBe(true);
	pending.resolve(preview);
	await setImmediate();
	expect(linked.getSnapshot()).toBe(settled);
});

test("keeps matching last-good code and independent failures without leaking remote errors", async () => {
	const { linked, client } = await setup();
	await linked.loadThreadCode([1, 2]);
	client.getThreadCode.mockImplementation(async (_id, selected) => {
		if (selected.id === 1) throw new Error("private-token in upstream error");
		return { ...preview, path: "/src/second.ts" };
	});
	await linked.loadThreadCode([1, 2]);
	const results = linked.getSnapshot().threadCode.data;
	expect(results[0]).toMatchObject({
		threadId: 1,
		preview,
		error: expect.any(String),
	});
	expect(results[1]).toMatchObject({
		threadId: 2,
		preview: { path: "/src/second.ts" },
		error: null,
	});
	expect(JSON.stringify(results)).not.toContain("private-token");
	client.getThreadCode.mockResolvedValue(preview);
	await linked.loadThreadCode([1, 2]);
	expect(
		linked
			.getSnapshot()
			.threadCode.data.every((result) => result.error === null),
	).toBe(true);
});

test.each(["cancel", "dispose", "binding", "page"])(
	"rejects late results after %s",
	async (operation) => {
		const reports = [];
		const { linked, client } = await setup(
			undefined,
			createActionTelemetry((report) => reports.push(report)),
		);
		const pending = Promise.withResolvers();
		client.getThreadCode.mockReturnValueOnce(pending.promise);
		const first = linked.loadThreadCode([1], true);
		const rejected = expect(first).rejects.toMatchObject({
			name: "AbortError",
		});
		await setImmediate();
		if (operation === "binding")
			linked.setBinding({ ...binding, pullRequestId: 23 });
		else if (operation === "page") await linked.loadThreadCode([2]);
		else linked[operation]();
		await rejected;
		const settled = linked.getSnapshot();
		pending.resolve(preview);
		await setImmediate();
		expect(linked.getSnapshot()).toBe(settled);
		expect(reports).toHaveLength(2);
		expect(reports[1]).toMatchObject({
			actionId: reports[0].actionId,
			phase: "finished",
			result: "cancelled",
		});
		expect(client.getThreadCode.mock.calls[0][2].signal.aborted).toBe(true);
		if (operation === "page")
			expect(settled.threadCode.data.map((result) => result.threadId)).toEqual([
				2,
			]);
		else if (operation !== "cancel") expect(settled.threadCode.data).toBeNull();
	},
);

test("does not reuse a previous location's code after a thread moves", async () => {
	const { linked, client } = await setup();
	await linked.loadThreadCode([1]);
	client.getOverview.mockResolvedValue({
		...linked.getSnapshot().overview.data,
		threads: [thread(1, 30)],
	});
	await linked.loadOverview();
	client.getThreadCode.mockRejectedValue(new AzureDevOpsHttpError(404));
	await linked.loadThreadCode([1]);
	expect(linked.getSnapshot().threadCode.data[0]).toMatchObject({
		threadId: 1,
		preview: null,
		error: expect.any(String),
	});
});

test("does not publish an in-flight location after overview changes its anchor", async () => {
	const { linked, client } = await setup();
	const pending = Promise.withResolvers();
	client.getThreadCode.mockReturnValueOnce(pending.promise);
	const loading = linked.loadThreadCode([1]);
	await setImmediate();
	client.getOverview.mockResolvedValue({
		...linked.getSnapshot().overview.data,
		threads: [thread(1, 30)],
	});
	await linked.loadOverview();
	pending.resolve(preview);
	await loading;
	expect(linked.getSnapshot().threadCode).toMatchObject({
		status: "error",
		data: null,
	});
});
