// @vitest-environment node
import { expect, onTestFinished, test, vi } from "vitest";
import { createLinkedPullRequest } from "./linked-pull-request.mjs";
import * as pullRequests from "./pull-requests.mjs";

test("rechecks cancellation after awaiting content when another section replaces the binding", async () => {
	const originalFactory = pullRequests.createPullRequestClient;
	const spy = vi
		.spyOn(pullRequests, "createPullRequestClient")
		.mockImplementation((options) => ({
			...originalFactory(options),
			getOverview: async () => ({
				author: { id: "old-author", name: "Old author" },
				createdAt: null,
				reviewers: [],
				threads: [],
				policies: [],
			}),
			getChanges: async () => ({
				iterationId: 1,
				baseCommitId: "a".repeat(40),
				sourceCommitId: "b".repeat(40),
				commits: [],
				files: [],
			}),
		}));
	onTestFinished(() => spy.mockRestore());
	const linked = createLinkedPullRequest({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture-token" }),
		},
		fetch: async () =>
			Response.json({
				pullRequestId: 22,
				repository: { id: "repository-one" },
				title: "Old PR",
				status: "active",
				sourceRefName: "refs/heads/feature",
				targetRefName: "refs/heads/main",
			}),
	});
	onTestFinished(() => linked.dispose());
	linked.setBinding({
		repository: {
			organization: "fabrikam",
			project: "tools",
			repositoryId: "repository-one",
			accountId: "account-one",
		},
		pullRequestId: 22,
	});
	await linked.refresh();
	const bindingRevision = linked.getSnapshot().bindingRevision;
	const unsubscribe = linked.subscribe((state) => {
		if (
			state.bindingRevision === bindingRevision &&
			state.overview.status === "ready"
		) {
			linked.setBinding(null);
		}
	});
	onTestFinished(unsubscribe);
	const overview = linked.loadOverview();
	const changes = linked.loadChanges();
	const cancelled = expect(changes).rejects.toMatchObject({
		name: "AbortError",
	});
	await overview;
	await cancelled;
	expect(linked.getSnapshot()).toMatchObject({
		status: "unavailable",
		pullRequest: null,
		overview: { status: "idle", data: null },
		changes: { status: "idle", data: null },
	});
});

test("selecting another commit rejects an old comparison even if its service ignores cancellation", async () => {
	const late = Promise.withResolvers();
	const firstCommit = "a".repeat(40);
	const secondCommit = "b".repeat(40);
	const originalFactory = pullRequests.createPullRequestClient;
	const spy = vi
		.spyOn(pullRequests, "createPullRequestClient")
		.mockImplementation((options) => ({
			...originalFactory(options),
			getChanges: async (_id, { commitId }) =>
				commitId === firstCommit
					? late.promise
					: {
							iterationId: 1,
							baseCommitId: firstCommit,
							sourceCommitId: secondCommit,
							selectedCommitId: secondCommit,
							commits: [],
							files: [],
						},
		}));
	onTestFinished(() => spy.mockRestore());
	const linked = createLinkedPullRequest({
		authentication: {
			getAccessToken: async () => ({ accessToken: "fixture" }),
		},
		fetch: async () =>
			Response.json({
				pullRequestId: 22,
				repository: { id: "repository-one" },
				title: "PR",
				status: "active",
				sourceRefName: "refs/heads/topic",
				targetRefName: "refs/heads/main",
			}),
	});
	onTestFinished(() => linked.dispose());
	linked.setBinding({
		repository: {
			organization: "fabrikam",
			project: "tools",
			repositoryId: "repository-one",
			accountId: "account-one",
		},
		pullRequestId: 22,
	});
	await linked.refresh();
	const old = linked.loadChanges(firstCommit);
	const cancelled = expect(old).rejects.toMatchObject({ name: "AbortError" });
	await Promise.resolve();
	await linked.loadChanges(secondCommit);
	await cancelled;
	const current = linked.getSnapshot();
	late.resolve({
		iterationId: 1,
		files: [],
		commits: [],
		baseCommitId: firstCommit,
		sourceCommitId: firstCommit,
	});
	await Promise.resolve();
	expect(linked.getSnapshot()).toBe(current);
	expect(current.selectedCommitId).toBe(secondCommit);
});
