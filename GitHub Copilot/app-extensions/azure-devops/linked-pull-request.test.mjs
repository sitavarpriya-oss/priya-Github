// @vitest-environment node
import { setImmediate } from "node:timers/promises";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createActionTelemetry } from "./action-telemetry.mjs";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import { BUILD_POLICY } from "./pull-request-fix-state.mjs";

const repository = {
	organization: "fabrikam",
	project: "tools",
	repositoryId: "repository-one",
	accountId: "account-one",
};
const binding = { repository, pullRequestId: 22 };

function response(overrides = {}) {
	return Response.json({
		pullRequestId: 22,
		repository: { id: repository.repositoryId },
		title: "Update the tools",
		description: "PR details",
		status: "active",
		isDraft: false,
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
		...overrides,
	});
}

function setup(telemetry, refreshIntervalMs, options = {}) {
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "private-token" }),
	};
	const fetch = vi.fn().mockImplementation(async () => response());
	const linked = createLinkedPullRequest({
		authentication,
		fetch,
		telemetry,
		refreshIntervalMs,
		...options,
	});
	onTestFinished(() => linked.dispose());
	linked.setBinding(binding);
	return { linked, authentication, fetch };
}

function readyCompletion(linked, fetch, overrides = {}) {
	const repositoryId = "11111111-1111-4111-8111-111111111111";
	const projectId = "22222222-2222-4222-8222-222222222222";
	const sourceCommit = "a".repeat(40);
	const targetCommit = "b".repeat(40);
	linked.setBinding({
		repository: {
			...repository,
			project: projectId,
			repositoryId,
		},
		pullRequestId: 22,
	});
	const state = {
		repositoryId,
		record: {
			repository: { id: repositoryId, project: { id: projectId } },
			lastMergeSourceCommit: { commitId: sourceCommit },
			lastMergeTargetCommit: { commitId: targetCommit },
			mergeStatus: "succeeded",
			reviewers: [],
			...overrides,
		},
		readThreads: () => Response.json({ count: 0, value: [] }),
	};
	fetch.mockImplementation(async (input) => {
		const url = new URL(String(input));
		if (/\/pullrequests\/22$/i.test(url.pathname))
			return response(state.record);
		if (url.pathname.endsWith("/refs")) {
			const name = `refs/${url.searchParams.get("filter") ?? ""}`;
			const objectId =
				name === "refs/heads/feature"
					? sourceCommit
					: name === "refs/heads/main"
						? targetCommit
						: null;
			return Response.json({
				count: objectId ? 1 : 0,
				value: objectId ? [{ name, objectId }] : [],
			});
		}
		if (url.pathname.endsWith("/threads")) return state.readThreads();
		return Response.json({ count: 0, value: [] });
	});
	return state;
}

function slowOverview(linked, fetch, overrides = {}) {
	const state = readyCompletion(linked, fetch, overrides);
	let holdNextThreadRead = false;
	let blockedThreadReads = 0;
	state.release = undefined;
	state.holdNextThreadRead = () => {
		holdNextThreadRead = true;
		state.release = undefined;
	};
	state.blockedThreadReads = () => blockedThreadReads;
	state.threadReads = () =>
		fetch.mock.calls.filter(([input]) =>
			new URL(input).pathname.endsWith("/threads"),
		).length;
	state.readThreads = () =>
		holdNextThreadRead && !state.release
			? new Promise((resolve) => {
					blockedThreadReads += 1;
					state.release = () => {
						holdNextThreadRead = false;
						resolve(Response.json({ count: 0, value: [] }));
					};
				})
			: Response.json({ count: 0, value: [] });
	return state;
}

describe("linked Azure DevOps pull request", () => {
	test.each(["active", "completed"])(
		"confirmed squash uses fresh metadata and keeps provider state %s",
		async (status) => {
			const { linked, fetch } = setup(undefined, undefined, {
				getAccess: async () => ({
					viewerId: "viewer",
					operations: ["complete"],
				}),
			});
			const sourceCommit = "a".repeat(40);
			const targetCommit = "b".repeat(40);
			const source = { commitId: sourceCommit };
			const completionRepository = {
				...repository,
				project: "11111111-1111-4111-8111-111111111111",
				repositoryId: "22222222-2222-4222-8222-222222222222",
			};
			linked.setBinding({
				repository: completionRepository,
				pullRequestId: 22,
			});
			const fresh = {
				lastMergeSourceCommit: source,
				lastMergeTargetCommit: { commitId: targetCommit },
				mergeStatus: "succeeded",
				reviewers: [],
				title: "Current title",
				description: "Current description.",
			};
			let remoteStatus = "active";
			fetch.mockImplementation(async (input, options = {}) => {
				const url = new URL(String(input));
				const method = options.method ?? "GET";
				if (/\/pullrequests\/22$/i.test(url.pathname)) {
					if (method === "PATCH") remoteStatus = status;
					return Response.json({
						pullRequestId: 22,
						repository: {
							id: completionRepository.repositoryId,
							project: { id: completionRepository.project },
						},
						status: remoteStatus,
						isDraft: false,
						sourceRefName: "refs/heads/feature",
						targetRefName: "refs/heads/main",
						...fresh,
					});
				}
				if (url.pathname.endsWith("/refs")) {
					const name = `refs/${url.searchParams.get("filter") ?? ""}`;
					const objectId =
						name === "refs/heads/feature"
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
			});
			await linked.refresh();
			await linked.mutate("complete", {
				confirm: true,
				mergeStrategy: "squash",
				title: "Untrusted title",
				description: "Untrusted description",
			});
			await vi.waitFor(() =>
				expect(linked.getSnapshot()).toMatchObject({
					status: "ready",
					pullRequest: {
						title: fresh.title,
						state: status === "completed" ? "merged" : "open",
					},
				}),
			);
			const writes = fetch.mock.calls.filter(
				([, options]) => options.method === "PATCH",
			);
			expect(writes).toHaveLength(1);
			expect(JSON.parse(writes[0][1].body).completionOptions).toEqual({
				mergeStrategy: "squash",
				mergeCommitMessage:
					"Merged PR 22: Current title\n\nCurrent description.",
				deleteSourceBranch: false,
				bypassPolicy: false,
				transitionWorkItems: false,
			});
		},
	);

	test("rechecks an accepted completion soon instead of waiting for the periodic read", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 60_000, {
			getAccess: async () => ({ viewerId: "viewer", operations: ["complete"] }),
		});
		try {
			const completion = readyCompletion(linked, fetch);
			await linked.refresh();
			await linked.mutate("complete", {
				confirm: true,
				mergeStrategy: "squash",
			});
			await vi.waitFor(() =>
				expect(linked.getSnapshot()).toMatchObject({
					status: "ready",
					mutation: { status: "ready" },
					pullRequest: { state: "open" },
				}),
			);
			const reads = fetch.mock.calls.length;
			completion.record.status = "completed";
			await vi.advanceTimersByTimeAsync(5000);
			expect(linked.getSnapshot()).toMatchObject({
				status: "ready",
				pullRequest: { state: "merged" },
			});
			expect(fetch.mock.calls.length).toBe(reads + 1);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(fetch.mock.calls.length).toBe(reads + 1);
			expect(
				fetch.mock.calls.filter(([, options]) => options.method === "PATCH"),
			).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test("stops quick completion rechecks after a bound and when the binding changes", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 60_000, {
			getAccess: async () => ({ viewerId: "viewer", operations: ["complete"] }),
		});
		try {
			readyCompletion(linked, fetch);
			await linked.refresh();
			await linked.mutate("complete", {
				confirm: true,
				mergeStrategy: "squash",
			});
			const patch = fetch.mock.calls.findIndex(
				([, options]) => options.method === "PATCH",
			);
			await vi.advanceTimersByTimeAsync(59_000);
			expect(fetch.mock.calls.slice(patch + 1)).toHaveLength(6);
			expect(linked.getSnapshot().pullRequest.state).toBe("open");
			await linked.mutate("complete", {
				confirm: true,
				mergeStrategy: "squash",
			});
			linked.setBinding({ ...binding, pullRequestId: 23 });
			const afterChange = fetch.mock.calls.length;
			await vi.advanceTimersByTimeAsync(30_000);
			expect(fetch.mock.calls.length).toBe(afterChange);
		} finally {
			vi.useRealTimers();
		}
	});

	test("does not recheck quickly after a rejected completion", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 60_000, {
			getAccess: async () => ({ viewerId: "viewer", operations: ["complete"] }),
		});
		try {
			fetch.mockImplementation(async (_url, options) =>
				options.method === "PATCH"
					? new Response("{}", { status: 409 })
					: response({ lastMergeSourceCommit: { commitId: "a".repeat(40) } }),
			);
			await linked.refresh();
			await expect(
				linked.mutate("complete", { confirm: true, mergeStrategy: "squash" }),
			).rejects.toThrow();
			const reads = fetch.mock.calls.length;
			await vi.advanceTimersByTimeAsync(30_000);
			expect(fetch.mock.calls.length).toBe(reads);
			expect(linked.getSnapshot()).toMatchObject({
				mutation: { status: "error" },
				pullRequest: { state: "open" },
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("reads again after a matching host write without waiting for the periodic read", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 60_000);
		try {
			await linked.refresh();
			const statuses = [];
			linked.subscribe((state) => statuses.push(state.status));
			linked.reconcile(
				{
					organization: "FABRIKAM",
					repositoryId: "repository-one",
					pullRequestId: 23,
				},
				false,
			);
			linked.reconcile(
				{
					organization: "fabrikam",
					repositoryId: "repository-two",
					pullRequestId: 22,
				},
				false,
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetch).toHaveBeenCalledTimes(1);
			fetch.mockImplementation(async () => response({ isDraft: true }));
			linked.reconcile(
				{
					organization: "FABRIKAM",
					repositoryId: "REPOSITORY-ONE",
					pullRequestId: 22,
				},
				false,
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetch).toHaveBeenCalledTimes(2);
			expect(linked.getSnapshot()).toMatchObject({
				status: "ready",
				pullRequest: { state: "draft" },
			});
			expect(statuses).not.toContain("loading");
		} finally {
			vi.useRealTimers();
		}
	});

	test("a host write waits for an older read and then reads current state", async () => {
		const { linked, fetch } = setup(undefined, 60_000);
		let release;
		fetch.mockImplementationOnce(
			() => new Promise((resolve) => (release = () => resolve(response()))),
		);
		const older = linked.refresh();
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		fetch.mockImplementation(async () => response({ status: "completed" }));
		linked.reconcile(
			{
				organization: "fabrikam",
				repositoryId: "repository-one",
				pullRequestId: 22,
			},
			true,
		);
		release();
		await older;
		await vi.waitFor(() =>
			expect(linked.getSnapshot().pullRequest.state).toBe("merged"),
		);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test("a binding change drops a pending host-write read", async () => {
		const { linked, fetch } = setup(undefined, 60_000);
		let release;
		fetch.mockImplementationOnce(
			() => new Promise((resolve) => (release = () => resolve(response()))),
		);
		void linked.refresh().catch(() => {});
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		linked.reconcile(
			{
				organization: "fabrikam",
				repositoryId: "repository-one",
				pullRequestId: 22,
			},
			true,
		);
		linked.setBinding({ ...binding, pullRequestId: 23 });
		release();
		await setImmediate();
		await setImmediate();
		expect(fetch).toHaveBeenCalledOnce();
		expect(linked.getSnapshot().status).toBe("idle");
	});

	test("a slow overview read does not use up the completion rechecks", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 60_000, {
			getAccess: async () => ({ viewerId: "viewer", operations: ["complete"] }),
		});
		const overview = slowOverview(linked, fetch, {
			lastMergeSourceCommit: { commitId: "a".repeat(40) },
		});
		try {
			await linked.refresh();
			await linked.mutate("complete", {
				confirm: true,
				mergeStrategy: "squash",
			});
			await vi.advanceTimersByTimeAsync(0);
			overview.holdNextThreadRead();
			void linked.loadOverview().catch(() => {});
			await vi.advanceTimersByTimeAsync(12_000);
			expect(overview.blockedThreadReads()).toBe(1);
			overview.record.status = "completed";
			overview.release();
			await vi.advanceTimersByTimeAsync(2000);
			expect(linked.getSnapshot().pullRequest.state).toBe("merged");
		} finally {
			vi.useRealTimers();
		}
	});

	test("retries a failed overview while completion evidence is still loading", async () => {
		const reports = [];
		const { linked, fetch } = setup(
			createActionTelemetry((report) => reports.push(report)),
			undefined,
			{
				getAccess: async () => ({
					viewerId: "viewer",
					operations: ["complete"],
				}),
			},
		);
		readyCompletion(linked, fetch);
		const original = fetch.getMockImplementation();
		const refs = Promise.withResolvers();
		let pullRequestReads = 0;
		let completionReads = 0;
		let holdRef = true;
		fetch.mockImplementation(async (input, options) => {
			const url = new URL(String(input));
			if (/\/pullrequests\/22$/i.test(url.pathname)) {
				pullRequestReads += 1;
				if (pullRequestReads === 2) return new Response(null, { status: 503 });
			}
			if (url.pathname.endsWith("/refs") && holdRef) {
				holdRef = false;
				completionReads += 1;
				return refs.promise;
			}
			return original(input, options);
		});

		await linked.refresh();
		const first = linked.loadOverview();
		await vi.waitFor(() => {
			expect(linked.getSnapshot()).toMatchObject({
				overview: { status: "error" },
				completion: { status: "loading" },
			});
			expect(completionReads).toBe(1);
		});

		const retry = linked.loadOverview(true);
		expect(retry).not.toBe(first);
		await vi.waitFor(() =>
			expect(linked.getSnapshot()).toMatchObject({
				overview: { status: "ready" },
				completion: { status: "loading" },
			}),
		);
		expect(pullRequestReads).toBe(6);
		expect(reports).toHaveLength(2);
		expect(reports[0]).toMatchObject({
			phase: "started",
			action: "retry",
			stage: "overview",
		});
		expect(reports[1]).toMatchObject({
			actionId: reports[0].actionId,
			phase: "finished",
			action: "retry",
			stage: "overview",
			result: "success",
		});

		refs.resolve(
			Response.json({
				count: 1,
				value: [{ name: "refs/heads/feature", objectId: "a".repeat(40) }],
			}),
		);
		await Promise.all([first, retry]);
	});

	test("a host write waits for an older overview read and then reads it again", async () => {
		const { linked, fetch } = setup(undefined, 60_000);
		const overview = slowOverview(linked, fetch);
		await linked.refresh();
		overview.holdNextThreadRead();
		void linked.loadOverview().catch(() => {});
		await vi.waitFor(() => expect(overview.threadReads()).toBe(1));
		linked.reconcile(
			{
				organization: "fabrikam",
				repositoryId: overview.repositoryId,
				pullRequestId: 22,
			},
			false,
		);
		overview.release();
		await vi.waitFor(() => expect(overview.threadReads()).toBe(2));
	});

	test("a same-source reconciliation replaces older completion evidence", async () => {
		const { linked, fetch } = setup(undefined, 60_000, {
			getAccess: async () => ({
				viewerId: "viewer",
				operations: ["complete"],
			}),
		});
		const completion = readyCompletion(linked, fetch);
		const original = fetch.getMockImplementation();
		const configuration = {
			id: 1,
			revision: 1,
			isEnabled: true,
			isBlocking: true,
			type: {
				id: BUILD_POLICY,
				displayName: "Build validation",
			},
			settings: { displayName: "Required build" },
		};
		const initialEvaluations = Promise.withResolvers();
		const staleThreads = Promise.withResolvers();
		const staleReadStarted = Promise.withResolvers();
		let policyStatus = "approved";
		let evaluationReads = 0;
		let heldThreads = false;
		fetch.mockImplementation(async (input, options) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/git/policy/configurations"))
				return Response.json({ count: 1, value: [configuration] });
			if (url.pathname.endsWith("/policy/evaluations")) {
				const status = policyStatus;
				evaluationReads++;
				if (evaluationReads === 2) initialEvaluations.resolve();
				if (evaluationReads <= 2) await initialEvaluations.promise;
				return Response.json({
					count: 1,
					value: [
						{
							evaluationId: `evaluation-${evaluationReads}`,
							artifactId: url.searchParams.get("artifactId"),
							status,
							configuration,
							context: {},
						},
					],
				});
			}
			if (
				url.pathname.endsWith("/threads") &&
				evaluationReads >= 2 &&
				!heldThreads
			) {
				heldThreads = true;
				staleReadStarted.resolve();
				return staleThreads.promise;
			}
			return original(input, options);
		});

		await linked.refresh();
		const first = linked.loadOverview().catch(() => {});
		try {
			await staleReadStarted.promise;
			await vi.waitFor(() =>
				expect(linked.getSnapshot()).toMatchObject({
					overview: { status: "ready" },
					completion: { status: "loading" },
				}),
			);
			policyStatus = "rejected";
			linked.reconcile(
				{
					organization: "fabrikam",
					repositoryId: completion.repositoryId,
					pullRequestId: 22,
				},
				false,
			);
			await vi.waitFor(() => expect(evaluationReads).toBeGreaterThan(2));
			staleThreads.resolve(Response.json({ count: 0, value: [] }));
			await first;
			await vi.waitFor(() =>
				expect(linked.getSnapshot().completion.data?.completion).toEqual({
					status: "blocked",
					reason: "A required branch policy is not satisfied.",
				}),
			);
		} finally {
			staleThreads.resolve(Response.json({ count: 0, value: [] }));
		}
	});

	test("keeps host token denials visible and resumes automatic reads only after manual recovery", async () => {
		vi.useFakeTimers();
		const { linked, authentication, fetch } = setup(undefined, 1000);
		try {
			await linked.refresh();
			const { pullRequest, updatedAt } = linked.getSnapshot();
			authentication.getAccessToken.mockRejectedValueOnce(
				Object.assign(new Error("Authentication denied"), {
					code: "denied",
					detail: "Private host detail",
				}),
			);
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot()).toMatchObject({
				status: "error",
				pullRequest,
				updatedAt,
				error:
					"Could not load the pull request. Check the connection and repository account in the app, then select Refresh.",
			});
			await vi.advanceTimersByTimeAsync(3000);
			expect(authentication.getAccessToken).toHaveBeenCalledTimes(2);
			expect(fetch).toHaveBeenCalledTimes(1);
			await linked.refresh();
			expect(linked.getSnapshot().status).toBe("ready");
			await vi.advanceTimersByTimeAsync(1000);
			expect(authentication.getAccessToken).toHaveBeenCalledTimes(4);
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(linked.getSnapshot().status).toBe("ready");
			expect(authentication.getAccessToken).toHaveBeenCalledWith({
				accountId: "account-one",
				resource: "azure-devops",
			});
			expect(JSON.stringify(linked.getSnapshot())).not.toMatch(
				/private-token|Private host detail/,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test("keeps PR reads and polling available when write authorization fails", async () => {
		vi.useFakeTimers();
		const getAccess = vi.fn().mockRejectedValue(
			Object.assign(new Error("Private permission service detail"), {
				status: 403,
			}),
		);
		const { linked, fetch } = setup(undefined, 1000, { getAccess });
		try {
			await linked.refresh();
			expect(linked.getSnapshot()).toMatchObject({
				status: "ready",
				pullRequest: { title: "Update the tools" },
				access: null,
				accessError:
					"Write authorization could not be verified. Pull request details remain read-only. Check the connection and repository account in the app, then select Refresh.",
			});
			expect(fetch).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1000);
			expect(getAccess).toHaveBeenCalledTimes(2);
			expect(fetch).toHaveBeenCalledTimes(2);
			expect(linked.getSnapshot().status).toBe("ready");
			expect(JSON.stringify(linked.getSnapshot())).not.toContain(
				"Private permission service detail",
			);
			await expect(linked.mutate("draft", { draft: true })).rejects.toThrow();
			expect(
				fetch.mock.calls.filter(([, options]) => options.method === "PATCH"),
			).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	test.each([
		{ repository: { id: "another-repository" } },
		{ pullRequestId: 23 },
		{ status: "invalid" },
	])(
		"stops polling and clears access after a malformed PR response: %j",
		async (invalid) => {
			vi.useFakeTimers();
			const access = { viewerId: "viewer", operations: ["reply"] };
			const { linked, fetch } = setup(undefined, 1000, {
				getAccess: async () => access,
			});
			try {
				await linked.refresh();
				const lastGood = linked.getSnapshot().pullRequest;
				fetch.mockResolvedValueOnce(response(invalid));
				await vi.advanceTimersByTimeAsync(1000);
				expect(linked.getSnapshot()).toMatchObject({
					status: "error",
					access: null,
					pullRequest: lastGood,
				});
				await vi.advanceTimersByTimeAsync(3000);
				expect(fetch).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		},
	);

	test.each(["fetch", "response body"])(
		"recovers from a %s transport TypeError",
		async (stage) => {
			vi.useFakeTimers();
			const access = { viewerId: "viewer", operations: ["reply"] };
			const { linked, fetch } = setup(undefined, 1000, {
				getAccess: async () => access,
			});
			try {
				await linked.refresh();
				const error = new TypeError("Private transport details");
				if (stage === "fetch") fetch.mockRejectedValueOnce(error);
				else
					fetch.mockResolvedValueOnce(
						new Response(
							new ReadableStream({
								start(controller) {
									controller.error(error);
								},
							}),
						),
					);
				await vi.advanceTimersByTimeAsync(1000);
				expect(linked.getSnapshot()).toMatchObject({ status: "error", access });
				expect(linked.getSnapshot().error).not.toContain(
					"Private transport details",
				);
				await vi.advanceTimersByTimeAsync(1000);
				expect(linked.getSnapshot().status).toBe("ready");
				expect(fetch).toHaveBeenCalledTimes(3);
			} finally {
				vi.useRealTimers();
			}
		},
	);

	test("polls after a temporary read failure, but stops on access loss, cancellation and disposal", async () => {
		vi.useFakeTimers();
		const { linked, fetch } = setup(undefined, 1000);
		try {
			await linked.refresh();
			fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot()).toMatchObject({
				status: "error",
				pullRequest: { id: 22 },
			});
			await vi.advanceTimersByTimeAsync(1000);
			expect(linked.getSnapshot().status).toBe("ready");
			fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
			await vi.advanceTimersByTimeAsync(1000);
			const deniedCalls = fetch.mock.calls.length;
			await vi.advanceTimersByTimeAsync(3000);
			expect(fetch).toHaveBeenCalledTimes(deniedCalls);
			await linked.refresh();
			linked.cancel();
			await vi.advanceTimersByTimeAsync(3000);
			expect(fetch).toHaveBeenCalledTimes(deniedCalls + 1);
			await linked.refresh();
			linked.dispose();
			await vi.advanceTimersByTimeAsync(3000);
			expect(fetch).toHaveBeenCalledTimes(deniedCalls + 2);
		} finally {
			vi.useRealTimers();
		}
	});

	test("continues polling after optional definition-name metadata fails", async () => {
		vi.useFakeTimers();
		const repositoryId = "11111111-1111-4111-8111-111111111111";
		const projectId = "22222222-2222-4222-8222-222222222222";
		const { linked, fetch } = setup(undefined, 1000);
		linked.setBinding({
			repository: { ...repository, repositoryId },
			pullRequestId: 22,
		});
		let pullRequestReads = 0;
		fetch.mockImplementation(async (input) => {
			const url = new URL(input);
			if (/\/pullrequests\/22$/i.test(url.pathname)) {
				pullRequestReads += 1;
				return response({
					repository: { id: repositoryId, project: { id: projectId } },
					reviewers: [],
				});
			}
			if (url.pathname.endsWith("/threads"))
				return Response.json({ value: [] });
			if (url.pathname.endsWith("/statuses"))
				return Response.json({ value: [] });
			if (url.pathname.endsWith("/evaluations"))
				return Response.json({
					value: [
						{
							evaluationId: "build-policy",
							artifactId: url.searchParams.get("artifactId"),
							status: "queued",
							context: { buildId: 0 },
							configuration: {
								isEnabled: true,
								isBlocking: true,
								settings: { buildDefinitionId: 77 },
								type: { displayName: "Build" },
							},
						},
					],
				});
			if (url.pathname.endsWith("/build/definitions/77"))
				return new Response(null, { status: 404 });
			return Response.json({ value: [] });
		});
		try {
			await linked.refresh();
			await linked.loadOverview();
			expect(linked.getSnapshot().overview.data).toMatchObject({
				policies: [{ name: "Build" }],
				errors: { builds: expect.stringContaining("404") },
			});
			const initialReads = pullRequestReads;
			await vi.advanceTimersByTimeAsync(1000);
			await setImmediate();
			expect(pullRequestReads).toBeGreaterThan(initialReads);
			const nextReads = pullRequestReads;
			await vi.advanceTimersByTimeAsync(1000);
			await setImmediate();
			expect(pullRequestReads).toBeGreaterThan(nextReads);
		} finally {
			vi.useRealTimers();
		}
	});

	test("user refresh reports resolved error without exporting poisoned error content", async () => {
		const reports = [];
		const telemetry = {
			start: vi.fn(() => ({
				finish: (...args) => reports.push(args),
			})),
		};
		const { linked, fetch } = setup(telemetry);
		await linked.refresh();
		expect(telemetry.start).not.toHaveBeenCalled();
		fetch.mockResolvedValue(
			new Response("private-url?secret=token", { status: 503 }),
		);
		await linked.refresh({ userAction: true });
		expect(telemetry.start).toHaveBeenCalledWith("refresh", "details", "guest");
		expect(reports).toEqual([
			["failure", { errorCode: "http", httpStatus: 503 }],
		]);
	});

	test.each([false, true])(
		"keeps CI status failures independent and retains last-good checks when present (%s)",
		async (loadFirst) => {
			const reports = [];
			const { linked, fetch } = setup(
				createActionTelemetry((report) => reports.push(report)),
			);
			const repositoryId = "11111111-1111-4111-8111-111111111111";
			const projectId = "22222222-2222-4222-8222-222222222222";
			linked.setBinding({
				repository: { ...repository, repositoryId },
				pullRequestId: 22,
			});
			let failStatuses = !loadFirst;
			let checks = [
				{
					id: 1,
					context: { name: "Tests", genre: "CI" },
					state: "succeeded",
				},
			];
			fetch.mockImplementation(async (input) => {
				const url = new URL(input);
				if (url.pathname.endsWith("/statuses"))
					return failStatuses
						? new Response("private-token", { status: 503 })
						: Response.json({ value: checks });
				if (url.pathname.endsWith("/threads"))
					return Response.json({
						value: [
							{
								id: 1,
								status: "active",
								comments: [
									{
										id: 1,
										content: failStatuses ? "New comment" : "Old comment",
									},
								],
							},
						],
					});
				if (url.pathname.endsWith("/evaluations"))
					return Response.json({
						value: [
							{
								evaluationId: "policy",
								artifactId: url.searchParams.get("artifactId"),
								status: failStatuses ? "rejected" : "approved",
								configuration: {
									isEnabled: true,
									isBlocking: true,
									type: { displayName: "Branch policy" },
								},
							},
						],
					});
				return response({
					repository: { id: repositoryId, project: { id: projectId } },
					reviewers: [],
				});
			});
			await linked.refresh();
			let previous = [];
			if (loadFirst) {
				await linked.loadOverview();
				previous = linked.getSnapshot().overview.data.statuses;
			}
			failStatuses = true;
			expect(reports).toEqual([]);
			await linked.loadOverview(true);
			expect(reports).toHaveLength(2);
			expect(reports[1]).toMatchObject({
				actionId: reports[0].actionId,
				action: "retry",
				stage: "overview",
				result: "partial",
				errorCode: "http",
				httpStatus: 503,
			});
			expect(JSON.stringify(reports)).not.toContain("private-token");
			const overview = linked.getSnapshot().overview;
			expect(overview.status).toBe("ready");
			expect(overview.data.statuses).toEqual(previous);
			if (loadFirst) expect(overview.data.statuses).toBe(previous);
			expect(overview.data).toMatchObject({
				policies: [{ status: "rejected" }],
				threads: [{ comments: [{ content: "New comment" }] }],
				errors: { statuses: expect.stringContaining("503") },
			});
			expect(JSON.stringify(overview)).not.toContain("private-token");

			failStatuses = false;
			checks = [{ ...checks[0], id: 2, state: "failed" }];
			await linked.loadOverview();
			expect(linked.getSnapshot().overview.data.statuses).toMatchObject([
				{ id: 2, state: "failed" },
			]);
			expect(linked.getSnapshot().overview.data.errors).toBeUndefined();
			checks = [];
			await linked.loadOverview();
			expect(linked.getSnapshot().overview.data.statuses).toEqual([]);

			linked.setBinding(null);
			expect(linked.getSnapshot().overview.data).toBeNull();
		},
	);

	test("loads only a known linked PR and coalesces concurrent refreshes", async () => {
		const { linked, fetch } = setup();
		const pending = Promise.withResolvers();
		fetch.mockReturnValue(pending.promise);
		const changes = [];
		const unsubscribe = linked.subscribe((state) => changes.push(state));

		expect(linked.getSnapshot()).toMatchObject({
			status: "idle",
			pullRequest: null,
			updatedAt: null,
			error: null,
		});
		const first = linked.refresh();
		expect(linked.refresh()).toBe(first);
		expect(linked.getSnapshot().status).toBe("loading");
		pending.resolve(response());
		const result = await first;

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toContain("/pullrequests/22?");
		expect(result).toMatchObject({
			status: "ready",
			pullRequest: { id: 22, state: "open" },
			updatedAt: expect.any(String),
			error: null,
		});
		expect(changes.map((state) => state.status)).toEqual(["loading", "ready"]);
		expect(changes[1].revision).toBeGreaterThan(changes[0].revision);
		expect(JSON.stringify(result)).not.toMatch(/private-token|account-one/);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.pullRequest)).toBe(true);
		unsubscribe();
		linked.setBinding(null);
		expect(changes).toHaveLength(2);
	});

	test("retains the last good result and timestamp on failure, then recovers", async () => {
		const { linked, fetch } = setup();
		const good = await linked.refresh();
		fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
		const pending = linked.refresh();
		expect(linked.getSnapshot()).toMatchObject({
			status: "loading",
			pullRequest: good.pullRequest,
			updatedAt: good.updatedAt,
		});
		expect(await pending).toMatchObject({
			status: "error",
			pullRequest: good.pullRequest,
			updatedAt: good.updatedAt,
			error: expect.stringContaining("503"),
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		fetch.mockResolvedValueOnce(response({ status: "completed" }));
		expect(await linked.refresh()).toMatchObject({
			status: "ready",
			pullRequest: { state: "merged" },
			error: null,
		});
	});

	test("shows an initial error without leaking host exception text", async () => {
		const { linked, fetch } = setup();
		fetch.mockRejectedValue(
			new Error("credential=private-token for account-one"),
		);
		const state = await linked.refresh();
		expect(state).toMatchObject({
			status: "error",
			pullRequest: null,
			updatedAt: null,
			error: expect.stringContaining("Refresh"),
		});
		expect(JSON.stringify(state)).not.toMatch(/private-token|account-one/);
		expect(fetch).toHaveBeenCalledOnce();
	});

	test("cancels a pending request and can refresh again without waiting for it", async () => {
		const { linked, fetch } = setup();
		const responseWait = Promise.withResolvers();
		fetch.mockReturnValueOnce(responseWait.promise);
		const pending = linked.refresh();
		const cancelled = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await setImmediate();
		linked.cancel();
		await cancelled;
		expect(linked.getSnapshot().status).toBe("cancelled");
		expect((await linked.refresh()).status).toBe("ready");
		responseWait.resolve(response());
		await setImmediate();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test.each([
		"accountId",
		"repositoryId",
		"organization",
		"project",
		"pullRequestId",
	])(
		"isolates binding changes to %s even when an old request ignores cancellation",
		async (field) => {
			const { linked, fetch } = setup();
			await linked.refresh();
			const late = Promise.withResolvers();
			fetch.mockReturnValueOnce(late.promise);
			const pending = linked.refresh();
			const cancelled = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			await setImmediate();
			const nextRepository = {
				...repository,
				...(field === "pullRequestId" ? {} : { [field]: `${field}-two` }),
			};
			const nextId = field === "pullRequestId" ? 23 : 22;
			linked.setBinding({ repository: nextRepository, pullRequestId: nextId });
			expect(linked.getSnapshot()).toMatchObject({
				status: "idle",
				pullRequest: null,
				updatedAt: null,
				error: null,
			});
			await cancelled;
			expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
			fetch.mockResolvedValueOnce(
				response({
					pullRequestId: nextId,
					repository: { id: nextRepository.repositoryId },
					title: "New binding",
				}),
			);
			const current = await linked.refresh();
			late.resolve(response({ title: "Old binding" }));
			await setImmediate();
			expect(linked.getSnapshot()).toBe(current);
		},
	);

	test("revocation clears last-good data and blocks further requests", async () => {
		const { linked, fetch } = setup();
		await linked.refresh();
		linked.setBinding(null);
		expect(linked.getSnapshot()).toMatchObject({
			status: "unavailable",
			pullRequest: null,
			updatedAt: null,
			error: null,
		});
		await expect(linked.refresh()).rejects.toThrow("No linked pull request");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test("an invalid replacement cannot leave the previous account data visible", async () => {
		const { linked } = setup();
		await linked.refresh();
		expect(() => linked.setBinding({ repository, pullRequestId: 0 })).toThrow();
		expect(linked.getSnapshot().pullRequest).toBeNull();
		await expect(linked.refresh()).rejects.toThrow("No linked pull request");
	});

	test("disposal cancels requests and is terminal", async () => {
		const { linked, fetch } = setup();
		const late = Promise.withResolvers();
		fetch.mockReturnValueOnce(late.promise);
		const pending = linked.refresh();
		const cancelled = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await setImmediate();
		linked.dispose();
		await cancelled;
		const final = linked.getSnapshot();
		late.reject(new Error("Late network failure"));
		await setImmediate();
		expect(linked.getSnapshot()).toBe(final);
		expect(final.pullRequest).toBeNull();
		await expect(linked.refresh()).rejects.toThrow("closed");
		expect(() => linked.setBinding(binding)).toThrow("closed");
		linked.dispose();
	});
});
