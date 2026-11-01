// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { manualFixThreads } from "./pull-request-fix-state.mjs";
import { isActivityThread } from "./pull-request-thread-kind.mjs";
import { createPullRequestClient } from "./pull-requests.mjs";

const repository = {
	organization: "fabrikam",
	project: "Project & tools",
	repositoryId: "3411ebc1-d5aa-464f-9615-0b527bc66719",
	accountId: "selected-account",
};
const projectId = "a7573007-bbb3-4341-b726-0c4148a07853";
const baseCommitId = "a".repeat(40);
const sourceCommitId = "b".repeat(40);
const createdAt = "2026-09-10T12:00:00.000Z";
const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/22`;
const person = {
	id: "author-id",
	displayName: "Author",
	uniqueName: "private-email",
	url: "https://untrusted.example/identity",
};
const apiPath = `/fabrikam/Project%20%26%20tools/_apis/git/repositories/${repository.repositoryId}`;
const prPath = `${apiPath}/pullrequests/22`;
const policyPath = "/fabrikam/Project%20%26%20tools/_apis/policy/evaluations";

function pr(overrides = {}) {
	return {
		pullRequestId: 22,
		repository: {
			id: repository.repositoryId,
			project: { id: projectId, name: repository.project },
		},
		title: "Example PR",
		status: "active",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
		createdBy: person,
		creationDate: createdAt,
		reviewers: [],
		...overrides,
	};
}

function thread(overrides = {}) {
	return {
		id: 1,
		status: "active",
		threadContext: { filePath: "/file.txt" },
		comments: [
			{
				id: 1,
				author: person,
				content: "Review this",
				publishedDate: createdAt,
			},
		],
		...overrides,
	};
}

function policy(index = 1, overrides = {}) {
	return {
		evaluationId: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
		artifactId,
		status: "approved",
		configuration: {
			id: index,
			isBlocking: true,
			isEnabled: true,
			type: { displayName: "Build" },
			url: "https://untrusted.example/policy",
		},
		...overrides,
	};
}

function status(id = 1, overrides = {}) {
	return {
		id,
		state: "pending",
		context: { name: "CI", genre: "continuous-integration" },
		description: "Build in progress",
		creationDate: createdAt,
		updatedDate: createdAt,
		createdBy: person,
		properties: { private: "private-token" },
		...overrides,
	};
}

function iteration(id = 3, overrides = {}) {
	return {
		id,
		commonRefCommit: { commitId: baseCommitId },
		sourceRefCommit: { commitId: sourceCommitId },
		targetRefCommit: { commitId: "c".repeat(40) },
		...overrides,
	};
}

function entry(changeType = "edit", overrides = {}) {
	return {
		changeId: 7,
		changeTrackingId: 9,
		changeType,
		item: { path: "/file.txt", url: "https://untrusted.example/blob" },
		...overrides,
	};
}

function commit(id = sourceCommitId) {
	return {
		commitId: id,
		comment: "Full commit message\n\nDetails",
		author: { name: "Author", date: createdAt, email: "private-email" },
		url: "https://untrusted.example/commit",
	};
}

function changes(changeType = "edit", overrides = {}) {
	return {
		iterationId: 3,
		baseCommitId,
		sourceCommitId,
		commits: [],
		files: [{ id: 7, path: "/file.txt", originalPath: null, changeType }],
		...overrides,
	};
}

function item(path, commitId, overrides = {}) {
	return {
		path,
		commitId,
		gitObjectType: "blob",
		contentMetadata: { isBinary: false },
		content: commitId === baseCommitId ? "old\n" : "new\n",
		url: "https://untrusted.example/blob",
		...overrides,
	};
}

function setup(handler = () => undefined) {
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "private-token" }),
	};
	const fetch = vi.fn(async (input, init) => {
		const url = new URL(input);
		const custom = await handler(url, init);
		if (custom !== undefined)
			return custom instanceof Response ? custom : Response.json(custom);
		if (url.pathname === prPath) return Response.json(pr());
		if (url.pathname === `${prPath}/iterations`)
			return Response.json({ value: [iteration()] });
		if (url.pathname.endsWith("/changes"))
			return Response.json({ changeEntries: [entry()] });
		if (url.pathname === `${apiPath}/items`)
			return Response.json(
				item(
					url.searchParams.get("path"),
					url.searchParams.get("versionDescriptor.version"),
				),
			);
		return Response.json({ value: [] });
	});
	const client = createPullRequestClient({ repository, authentication, fetch });
	return { client, authentication, fetch };
}

describe("Azure DevOps reviewer lookup", () => {
	test("resolves a reviewer alias through the organization identity service", async () => {
		const reviewerId = "d6245f20-2af8-44f4-9451-8107cb2767db";
		const { client, fetch } = setup((url) => {
			if (
				url.hostname === "vssps.dev.azure.com" &&
				url.pathname === "/fabrikam/_apis/identities"
			) {
				if (url.searchParams.has("subjectDescriptors"))
					return {
						count: 1,
						value: [
							{
								id: reviewerId,
								providerDisplayName: "Nate Reviewer",
								isActive: true,
								properties: {
									Account: {
										$type: "System.String",
										$value: "v-qirenlu",
									},
									Mail: {
										$type: "System.String",
										$value: "nate@example.com",
									},
								},
							},
						],
					};
				return { count: 0, value: [] };
			}
			if (
				url.hostname === "vssps.dev.azure.com" &&
				url.pathname === "/fabrikam/_apis/graph/subjectquery"
			)
				return {
					count: 1,
					value: [
						{
							descriptor: "aad.example",
							displayName: "Nate Reviewer",
							principalName: "nate@example.com",
						},
					],
				};
			return undefined;
		});

		await expect(client.resolveReviewer("v-qirenlu")).resolves.toBe(reviewerId);
		const identityRequests = fetch.mock.calls
			.map(([url]) => new URL(url))
			.filter(
				(url) =>
					url.hostname === "vssps.dev.azure.com" &&
					url.pathname === "/fabrikam/_apis/identities" &&
					url.searchParams.has("searchFilter"),
			);
		expect(
			identityRequests.map((url) => url.searchParams.get("searchFilter")),
		).toEqual(["General", "AccountName", "DisplayName"]);
		for (const identityRequest of identityRequests) {
			expect(identityRequest.searchParams.get("filterValue")).toBe("v-qirenlu");
			expect(identityRequest.searchParams.get("queryMembership")).toBe("None");
		}
		const graphRequest = fetch.mock.calls.find(
			([url]) => new URL(url).pathname === "/fabrikam/_apis/graph/subjectquery",
		);
		expect(graphRequest?.[1]).toMatchObject({
			method: "POST",
			body: expect.stringContaining('"query":"v-qirenlu"'),
		});
		const descriptorRequest = fetch.mock.calls
			.map(([url]) => new URL(url))
			.find((url) => url.searchParams.has("subjectDescriptors"));
		expect(descriptorRequest?.searchParams.get("subjectDescriptors")).toBe(
			"aad.example",
		);
	});

	test("resolves a reviewer alias from project team membership before Graph search", async () => {
		const reviewerId = "d6245f20-2af8-44f4-9451-8107cb2767db";
		const { client, fetch } = setup((url) => {
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname === "/fabrikam/_apis/projects/Project%20%26%20tools/teams"
			)
				return {
					count: 2,
					value: [{ id: "team-id" }, { id: "other-team-id" }],
				};
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname.startsWith(
					"/fabrikam/_apis/projects/Project%20%26%20tools/teams/",
				) &&
				url.pathname.endsWith("/members")
			)
				return {
					count: 1,
					value: [
						{
							identity: {
								id: reviewerId,
								displayName: "Qiren Lu",
								uniqueName: "v-qirenlu@example.com",
								isActive: true,
							},
						},
					],
				};
			return undefined;
		});

		await expect(client.resolveReviewer("v-qirenlu")).resolves.toBe(reviewerId);
		expect(
			fetch.mock.calls.filter(([url]) =>
				new URL(url).pathname.endsWith("/members"),
			),
		).toHaveLength(1);
		expect(
			fetch.mock.calls.some(
				([url]) =>
					new URL(url).pathname === "/fabrikam/_apis/graph/subjectquery",
			),
		).toBe(false);
	});

	test("uses the first active project identity when an exact alias appears in multiple teams", async () => {
		const { client } = setup((url) => {
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname === "/fabrikam/_apis/projects/Project%20%26%20tools/teams"
			)
				return {
					count: 2,
					value: [{ id: "team-id" }, { id: "other-team-id" }],
				};
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname.endsWith("/team-id/members")
			)
				return {
					count: 1,
					value: [
						{
							identity: {
								id: "d6245f20-2af8-44f4-9451-8107cb2767db",
								displayName: "First Qiren",
								uniqueName: "v-qirenlu@example.com",
								isActive: true,
							},
						},
					],
				};
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname.endsWith("/other-team-id/members")
			)
				return {
					count: 1,
					value: [
						{
							identity: {
								id: "0fc50b25-75c2-4d8a-86fb-6be66428dd84",
								displayName: "Second Qiren",
								uniqueName: "v-qirenlu@contoso.com",
								isActive: true,
							},
						},
					],
				};
			return undefined;
		});

		await expect(client.resolveReviewer("v-qirenlu")).resolves.toBe(
			"d6245f20-2af8-44f4-9451-8107cb2767db",
		);
	});

	test("searches selectable project identities when organization and Graph search are incomplete", async () => {
		const { client } = setup((url) => {
			if (
				url.hostname === "dev.azure.com" &&
				url.pathname === "/fabrikam/_apis/projects/Project%20%26%20tools/teams"
			)
				return {
					count: 2,
					value: [{ id: "team-one" }, { id: "team-two" }],
				};
			if (url.pathname.endsWith("/team-one/members"))
				return {
					count: 1,
					value: [
						{
							identity: {
								id: "d6245f20-2af8-44f4-9451-8107cb2767db",
								displayName: "Qiren Lu",
								uniqueName: "v-qirenlu@microsoft.com",
								isActive: true,
							},
						},
					],
				};
			if (url.pathname.endsWith("/team-two/members"))
				return {
					count: 1,
					value: [
						{
							identity: {
								id: "0fc50b25-75c2-4d8a-86fb-6be66428dd84",
								displayName: "Qiren Lu (Test)",
								uniqueName: "v-qirenlu@contoso.com",
								isActive: true,
							},
						},
					],
				};
			if (url.pathname.endsWith("/_apis/graph/subjectquery"))
				return new Response(null, { status: 401 });
			return undefined;
		});

		await expect(client.searchReviewers("v-qirenlu")).resolves.toEqual({
			reviewers: [
				{
					id: "d6245f20-2af8-44f4-9451-8107cb2767db",
					name: "Qiren Lu",
					detail: "v-qirenlu@microsoft.com",
				},
				{
					id: "0fc50b25-75c2-4d8a-86fb-6be66428dd84",
					name: "Qiren Lu (Test)",
					detail: "v-qirenlu@contoso.com",
				},
			],
			incomplete: true,
		});
	});

	test("uses an explicit reviewer GUID without an identity lookup", async () => {
		const reviewerId = "d6245f20-2af8-44f4-9451-8107cb2767db";
		const { client, fetch } = setup();

		await expect(client.resolveReviewer(reviewerId)).resolves.toBe(reviewerId);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("Azure DevOps PR overview reads", () => {
	test.each([
		["system event", [{ commentType: "system" }], "VoteUpdate", "active", true],
		[
			"untyped system event",
			[{ commentType: "system" }],
			undefined,
			"unknown",
			true,
		],
		["bot review", [{ commentType: "system" }], undefined, "active", false],
		["system activity type", [{}], "RefUpdate", "active", true],
		[
			"user comment",
			[{ commentType: "text" }],
			"StatusUpdate",
			"active",
			false,
		],
		[
			"code change",
			[{ commentType: "codeChange" }],
			undefined,
			"active",
			false,
		],
		["ordinary untyped comment", [{}], undefined, "active", false],
	])(
		"classifies %s consistently",
		(_label, comments, activityType, status, expected) => {
			expect(
				isActivityThread({
					id: 1,
					status,
					path: null,
					comments,
					...(activityType ? { activityType } : {}),
				}),
			).toBe(expected);
		},
	);

	test("bot review threads with system comments can be fixed", () => {
		const thread = {
			id: 1,
			status: "active",
			path: "/src/Options.cs",
			comments: [{ id: 1, commentType: "system", content: "<table></table>" }],
		};
		expect(manualFixThreads({ threads: [thread] })).toEqual([thread]);
	});

	test.each(["threads", "policies", "statuses"])(
		"preserves independent overview fields when %s fails",
		async (failed) => {
			const { client } = setup((url) => {
				if (url.pathname.endsWith("/threads"))
					return failed === "threads"
						? new Response("private-token", { status: 403 })
						: { value: [thread()] };
				if (url.pathname === policyPath) {
					if (failed === "policies") throw new TypeError("private-token");
					return { value: [policy()] };
				}
				if (url.pathname.endsWith("/statuses"))
					return failed === "statuses"
						? new Response("private-token", { status: 403 })
						: { value: [status()] };
			});
			const result = await client.getOverview(22);
			expect(result.author).toEqual({ id: person.id, name: "Author" });
			expect(result.reviewers).toEqual([]);
			expect(result.threads).toHaveLength(failed === "threads" ? 0 : 1);
			expect(result.policies).toHaveLength(failed === "policies" ? 0 : 1);
			expect(result.statuses).toHaveLength(failed === "statuses" ? 0 : 1);
			expect(Object.keys(result.errors)).toEqual([failed]);
			expect(result.errors[failed]).not.toMatch(/private-token/);
		},
	);

	test("reports all resource failures and rejects malformed successful JSON", async () => {
		const { client } = setup((url) =>
			url.pathname === prPath
				? undefined
				: new Response("private-token", { status: 503 }),
		);
		expect((await client.getOverview(22)).errors).toEqual({
			threads: expect.stringContaining("503"),
			policies: expect.stringContaining("503"),
			statuses: expect.stringContaining("503"),
		});
		const malformed = setup((url) =>
			url.pathname.endsWith("/threads")
				? new Response('{"broken":')
				: undefined,
		);
		await expect(malformed.client.getOverview(22)).rejects.toThrow();
	});

	test("preserves policies after a thread body network failure without swallowing parse errors", async () => {
		const { client } = setup((url) => {
			if (url.pathname.endsWith("/threads"))
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new TypeError("private-token"));
						},
					}),
				);
			if (url.pathname === policyPath) return { value: [policy()] };
		});
		const overview = await client.getOverview(22);
		expect(overview.policies).toHaveLength(1);
		expect(overview.errors.threads).not.toMatch(/private-token/);
	});

	test("does not hide an earlier page's schema mismatch behind a later HTTP failure", async () => {
		const { client, fetch } = setup((url) =>
			url.pathname.endsWith("/threads")
				? url.searchParams.has("continuationToken")
					? new Response(null, { status: 503 })
					: Response.json(
							{ value: [thread({ comments: null })] },
							{ headers: { "x-ms-continuationtoken": "more" } },
						)
				: undefined,
		);
		await expect(client.getOverview(22)).rejects.toMatchObject({
			code: "invalid-response",
		});
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test.each([
		{
			threadContext: {
				filePath: "/file.txt",
				rightFileStart: { line: 0, offset: 0 },
			},
		},
		{
			threadContext: {
				filePath: "/file.txt",
				leftFileEnd: { line: 1, offset: -1 },
			},
		},
		{ pullRequestThreadContext: { changeTrackingId: "9" } },
		{
			pullRequestThreadContext: {
				iterationContext: { firstComparingIteration: 3 },
			},
		},
		{ comments: [{ ...thread().comments[0], parentCommentId: -1 }] },
		{ comments: [{ ...thread().comments[0], commentType: {} }] },
	])(
		"rejects malformed optional thread context rather than partial success: %j",
		async (override) => {
			const { client } = setup((url) =>
				url.pathname.endsWith("/threads")
					? { value: [thread(override)] }
					: undefined,
			);
			await expect(client.getOverview(22)).rejects.toMatchObject({
				code: "invalid-response",
			});
		},
	);

	test("preserves optional source coordinates and comment metadata", async () => {
		const threadContext = {
			filePath: "/file.txt",
			rightFileStart: { line: 4, offset: 0 },
			rightFileEnd: { line: 5, offset: 8 },
		};
		const pullRequestThreadContext = {
			changeTrackingId: 9,
			iterationContext: {
				firstComparingIteration: 3,
				secondComparingIteration: 3,
			},
			trackingCriteria: {
				firstComparingIteration: 4,
				secondComparingIteration: 4,
				origFilePath: "/old.txt",
				origRightFileStart: { line: 4, offset: 0 },
			},
		};
		const { client } = setup((url) =>
			url.pathname.endsWith("/threads")
				? {
						value: [
							thread({
								threadContext,
								pullRequestThreadContext,
								comments: [
									{
										...thread().comments[0],
										parentCommentId: 0,
										commentType: 1,
									},
								],
							}),
						],
					}
				: undefined,
		);
		expect((await client.getOverview(22)).threads[0]).toMatchObject({
			threadContext,
			pullRequestThreadContext,
			comments: [{ parentCommentId: 0, commentType: "text" }],
		});
	});

	test("preserves ADO system activity type and dates without exposing its property bag", async () => {
		const updatedAt = "2026-09-11T08:30:00.000Z";
		const { client } = setup((url) =>
			url.pathname.endsWith("/threads")
				? {
						value: [
							thread({
								threadContext: null,
								publishedDate: createdAt,
								lastUpdatedDate: updatedAt,
								comments: [
									{
										...thread().comments[0],
										commentType: 3,
										content: "updated the pull request.",
									},
								],
								properties: {
									CodeReviewThreadType: {
										$type: "System.String",
										$value: "StatusUpdate",
									},
									private: "private-token",
								},
							}),
						],
					}
				: undefined,
		);
		const [activity] = (await client.getOverview(22)).threads;
		expect(activity).toMatchObject({
			publishedAt: createdAt,
			updatedAt,
			activityType: "StatusUpdate",
			comments: [{ commentType: "system" }],
		});
		expect(activity).not.toHaveProperty("properties");
		expect(JSON.stringify(activity)).not.toContain("private-token");
	});

	test.each(["original", "modified"])(
		"normalizes complete %s thread anchors for iteration-aware jumps",
		async (side) => {
			const apiSide = side === "original" ? "left" : "right";
			const { client } = setup((url) =>
				url.pathname.endsWith("/threads")
					? {
							value: [
								thread({
									threadContext: {
										filePath: "/file.txt",
										[`${apiSide}FileStart`]: { line: 4, offset: 0 },
										[`${apiSide}FileEnd`]: { line: 5, offset: 8 },
									},
									pullRequestThreadContext: {
										changeTrackingId: 9,
										iterationContext: {
											firstComparingIteration: 3,
											secondComparingIteration: 3,
										},
									},
								}),
							],
						}
					: undefined,
			);
			const anchor = (await client.getOverview(22)).threads[0].anchor;
			expect(anchor).toEqual({
				path: "/file.txt",
				side,
				startLine: 4,
				endLine: 5,
				iterationId: 3,
				changeTrackingId: 9,
			});
			expect(Object.isFrozen(anchor)).toBe(true);
		},
	);

	test("uses tracked current positions with their tracked iteration, not original iteration", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/threads")
				? {
						value: [
							thread({
								threadContext: {
									filePath: "/renamed.txt",
									rightFileStart: { line: 10, offset: 0 },
									rightFileEnd: { line: 10, offset: 8 },
								},
								pullRequestThreadContext: {
									changeTrackingId: 9,
									iterationContext: {
										firstComparingIteration: 3,
										secondComparingIteration: 3,
									},
									trackingCriteria: {
										firstComparingIteration: 4,
										secondComparingIteration: 4,
										origFilePath: "/file.txt",
										origRightFileStart: { line: 4, offset: 0 },
									},
								},
							}),
						],
					}
				: undefined,
		);
		expect((await client.getOverview(22)).threads[0].anchor).toEqual({
			path: "/renamed.txt",
			side: "modified",
			startLine: 10,
			endLine: 10,
			iterationId: 4,
			changeTrackingId: 9,
		});
	});

	test.each([
		{ threadContext: { filePath: "/file.txt" } },
		{
			threadContext: {
				rightFileStart: { line: 4, offset: 0 },
				rightFileEnd: { line: 5, offset: 8 },
			},
		},
		{
			threadContext: {
				filePath: "/file.txt",
				rightFileStart: { line: 4, offset: 0 },
			},
		},
		{
			threadContext: {
				filePath: "/file.txt",
				rightFileStart: { line: 5, offset: 0 },
				rightFileEnd: { line: 4, offset: 8 },
			},
		},
		{
			threadContext: {
				filePath: "/file.txt",
				rightFileStart: { line: 4, offset: 9 },
				rightFileEnd: { line: 4, offset: 8 },
			},
		},
		{
			threadContext: {
				filePath: "/file.txt",
				rightFileStart: { line: 4, offset: 0 },
				rightFileEnd: { line: 5, offset: 8 },
				leftFileStart: { line: 4, offset: 0 },
				leftFileEnd: { line: 5, offset: 8 },
			},
		},
		{ pullRequestThreadContext: { changeTrackingId: 9 } },
		{
			pullRequestThreadContext: {
				iterationContext: {
					firstComparingIteration: 3,
					secondComparingIteration: 3,
				},
			},
		},
		{
			pullRequestThreadContext: {
				changeTrackingId: 9,
				iterationContext: {
					firstComparingIteration: 2,
					secondComparingIteration: 3,
				},
			},
		},
		{
			pullRequestThreadContext: {
				changeTrackingId: 9,
				iterationContext: {
					firstComparingIteration: 0,
					secondComparingIteration: 0,
				},
			},
		},
	])(
		"omits incomplete or unsupported jump anchors without inventing source context: %j",
		async (override) => {
			const { client } = setup((url) =>
				url.pathname.endsWith("/threads")
					? {
							value: [
								thread({
									threadContext: {
										filePath: "/file.txt",
										rightFileStart: { line: 4, offset: 0 },
										rightFileEnd: { line: 5, offset: 8 },
									},
									pullRequestThreadContext: {
										changeTrackingId: 9,
										iterationContext: {
											firstComparingIteration: 3,
											secondComparingIteration: 3,
										},
									},
									...override,
								}),
							],
						}
					: undefined,
			);
			expect((await client.getOverview(22)).threads[0]).not.toHaveProperty(
				"anchor",
			);
		},
	);

	test.each(["%2f", "%2F"])(
		"accepts the service's encoded policy PR separator (%s)",
		async (separator) => {
			const { client } = setup((request) =>
				request.pathname === policyPath
					? {
							value: [
								policy(1, {
									artifactId: `vstfs:///CodeReview/CodeReviewId/${projectId}${separator}22`,
								}),
							],
						}
					: undefined,
			);
			expect((await client.getOverview(22)).policies).toHaveLength(1);
		},
	);

	test.each([
		`vstfs:///CodeReview/CodeReviewId/${projectId}%2f23`,
		`vstfs:///CodeReview/CodeReviewId/00000000-0000-0000-0000-000000000000%2f22`,
		`vstfs:///CodeReview/CodeReviewId/${projectId}%252f22`,
		`vstfs:///CodeReview/CodeReviewId/${projectId}%xx22`,
	])(
		"rejects mismatched or malformed encoded policy context: %s",
		async (artifactId) => {
			const { client } = setup((request) =>
				request.pathname === policyPath
					? { value: [policy(1, { artifactId })] }
					: undefined,
			);
			await expect(client.getOverview(22)).rejects.toMatchObject({
				name: "AzureDevOpsContentError",
			});
		},
	);

	test("preserves known policy build IDs and safe detail links only", async () => {
		const url =
			"https://dev.azure.com/fabrikam/Project%20%26%20tools/_build/results?buildId=88";
		const { client } = setup((request) => {
			if (
				request.pathname ===
				"/fabrikam/Project%20%26%20tools/_apis/build/builds/88"
			)
				return {
					id: 88,
					definition: { name: "Required build pipeline" },
				};
			return request.pathname === policyPath
				? {
						value: [
							policy(1, {
								context: { buildId: 88 },
								_links: { web: { href: url } },
							}),
							policy(2, {
								_links: { web: { href: "javascript:private-token" } },
							}),
						],
					}
				: undefined;
		});
		const { policies } = await client.getOverview(22);
		expect(policies[0]).toMatchObject({
			buildId: 88,
			pipelineName: "Required build pipeline",
			url,
		});
		expect(policies[1]).not.toHaveProperty("url");
		expect(policies[1]).not.toHaveProperty("buildId");
	});

	test("uses configured, supplied, build-run, definition, then generic build policy names", async () => {
		const buildRequests = [];
		const definitionRequests = [];
		const configuration = (id, settings, typeName) => ({
			id,
			isBlocking: true,
			isEnabled: true,
			settings,
			type: { displayName: typeName },
		});
		const { client } = setup((request) => {
			const build = /\/builds\/(\d+)$/.exec(request.pathname);
			if (build) {
				buildRequests.push(Number(build[1]));
				return {
					id: Number(build[1]),
					definition: { name: "Active build pipeline" },
				};
			}
			const definition = /\/definitions\/(\d+)$/.exec(request.pathname);
			if (definition) {
				definitionRequests.push(Number(definition[1]));
				return {
					id: Number(definition[1]),
					name: "Draft validation pipeline",
				};
			}
			return request.pathname === policyPath
				? {
						value: [
							policy(1, {
								context: {
									buildId: 81,
									buildDefinitionName: "Supplied build definition",
								},
								configuration: configuration(
									1,
									{
										buildDefinitionId: 91,
										displayName: "  Build and Test  ",
									},
									"Build",
								),
							}),
							policy(2, {
								context: {
									buildId: 82,
									buildDefinitionName: "  Supplied build definition  ",
								},
								configuration: configuration(
									2,
									{ buildDefinitionId: 92, displayName: "   " },
									"Build",
								),
							}),
							policy(3, {
								context: { buildId: 83, buildDefinitionName: "  " },
								configuration: configuration(
									3,
									{ buildDefinitionId: 93 },
									"Build",
								),
							}),
							policy(4, {
								context: { buildId: 0, buildDefinitionName: " " },
								configuration: configuration(
									4,
									{ buildDefinitionId: 84, displayName: " " },
									"Build",
								),
							}),
							policy(5, {
								context: { buildDefinitionName: " " },
								configuration: configuration(
									5,
									{ buildDefinitionId: " ", displayName: " " },
									"Build",
								),
							}),
						],
					}
				: undefined;
		});

		const { policies } = await client.getOverview(22);
		expect(
			policies.map(({ name, displayName, pipelineName }) => ({
				name,
				displayName,
				pipelineName,
			})),
		).toEqual([
			{
				name: "Build",
				displayName: "Build and Test",
				pipelineName: undefined,
			},
			{
				name: "Build",
				displayName: "Supplied build definition",
				pipelineName: undefined,
			},
			{
				name: "Build",
				displayName: undefined,
				pipelineName: "Active build pipeline",
			},
			{
				name: "Build",
				displayName: undefined,
				pipelineName: "Draft validation pipeline",
			},
			{
				name: "Build",
				displayName: undefined,
				pipelineName: undefined,
			},
		]);
		expect(buildRequests).toEqual([83]);
		expect(definitionRequests).toEqual([84]);
	});

	test("bounds mixed build metadata lookups to the authentication capacity", async () => {
		const authenticationCapacity = 16;
		const buildIds = Array.from({ length: 9 }, (_, index) => 100 + index);
		const definitionIds = Array.from({ length: 9 }, (_, index) => 200 + index);
		const configuration = (id, settings) => ({
			id,
			isBlocking: true,
			isEnabled: true,
			settings,
			type: { displayName: "Build" },
		});
		const evaluations = [
			...buildIds.map((buildId, index) =>
				policy(index + 1, {
					context: { buildId },
					configuration: configuration(index + 1, {}),
				}),
			),
			...definitionIds.map((buildDefinitionId, index) =>
				policy(buildIds.length + index + 1, {
					context: { buildId: 0 },
					configuration: configuration(buildIds.length + index + 1, {
						buildDefinitionId,
					}),
				}),
			),
		];
		let pending = 0;
		let peak = 0;
		let rejected = 0;
		const authentication = {
			getAccessToken: vi.fn(async ({ accountId, resource }) => {
				expect(accountId).toBe(repository.accountId);
				expect(resource).toBe("azure-devops");
				pending++;
				peak = Math.max(peak, pending);
				if (pending > authenticationCapacity) {
					pending--;
					rejected++;
					throw new Error("Too many pending authentication requests");
				}
				try {
					await Promise.resolve();
					return { accessToken: "private-token" };
				} finally {
					pending--;
				}
			}),
		};
		const fetch = vi.fn(async (input) => {
			const request = new URL(input);
			if (request.pathname === prPath) return Response.json(pr());
			if (request.pathname === policyPath)
				return Response.json({ value: evaluations });
			const build = /\/builds\/(\d+)$/.exec(request.pathname);
			if (build)
				return Response.json({
					id: Number(build[1]),
					definition: { name: `Build ${build[1]}` },
				});
			const definition = /\/definitions\/(\d+)$/.exec(request.pathname);
			if (definition)
				return Response.json({
					id: Number(definition[1]),
					name: `Definition ${definition[1]}`,
				});
			return Response.json({ value: [] });
		});
		const client = createPullRequestClient({
			repository,
			authentication,
			fetch,
		});

		const overview = await client.getOverview(22);

		expect(rejected).toBe(0);
		expect(peak).toBeLessThanOrEqual(authenticationCapacity);
		expect(overview.errors).toBeUndefined();
		expect(overview.policies.map((entry) => entry.pipelineName)).toEqual([
			...buildIds.map((buildId) => `Build ${buildId}`),
			...definitionIds.map(
				(buildDefinitionId) => `Definition ${buildDefinitionId}`,
			),
		]);
	});

	test("keeps checks available when optional build-name metadata is malformed", async () => {
		const { client } = setup((request) => {
			if (
				request.pathname ===
				"/fabrikam/Project%20%26%20tools/_apis/build/builds/88"
			)
				return { id: 88, definition: {} };
			return request.pathname === policyPath
				? {
						value: [
							policy(1, {
								context: { buildId: 88 },
								configuration: {
									id: 1,
									isBlocking: true,
									isEnabled: true,
									settings: {},
									type: { displayName: "Build" },
								},
							}),
						],
					}
				: undefined;
		});

		const overview = await client.getOverview(22);
		expect(overview.policies[0]).toMatchObject({
			buildId: 88,
			name: "Build",
		});
		expect(overview.policies[0]).not.toHaveProperty("pipelineName");
		expect(overview.errors?.builds).toBe(
			"Invalid Azure DevOps PR content response.",
		);
	});

	test("keeps checks available when optional definition-name metadata is malformed", async () => {
		const onError = vi.fn();
		const { client } = setup((request) => {
			if (
				request.pathname ===
				"/fabrikam/Project%20%26%20tools/_apis/build/definitions/77"
			)
				return { id: 77, name: " " };
			return request.pathname === policyPath
				? {
						value: [
							policy(1, {
								context: { buildId: 0 },
								configuration: {
									id: 1,
									isBlocking: true,
									isEnabled: true,
									settings: { buildDefinitionId: 77 },
									type: { displayName: "Build" },
								},
							}),
						],
					}
				: undefined;
		});

		const overview = await client.getOverview(22, { onError });
		expect(overview.policies[0]).toMatchObject({
			name: "Build",
		});
		expect(overview.policies[0]).not.toHaveProperty("buildDefinitionId");
		expect(overview.policies[0]).not.toHaveProperty("pipelineName");
		expect(overview.errors?.builds).toBe(
			"Invalid Azure DevOps PR content response.",
		);
		expect(onError).toHaveBeenCalledWith(expect.anything(), {
			terminal: false,
		});
	});

	test("keeps checks available when definition metadata contains invalid JSON", async () => {
		const onError = vi.fn();
		const { client } = setup((request) => {
			if (
				request.pathname ===
				"/fabrikam/Project%20%26%20tools/_apis/build/definitions/77"
			)
				return new Response('{"broken":');
			return request.pathname === policyPath
				? {
						value: [
							policy(1, {
								context: { buildId: 0 },
								configuration: {
									id: 1,
									isBlocking: true,
									isEnabled: true,
									settings: { buildDefinitionId: 77 },
									type: { displayName: "Build" },
								},
							}),
						],
					}
				: undefined;
		});

		const overview = await client.getOverview(22, { onError });
		expect(overview.policies[0]).toMatchObject({ name: "Build" });
		expect(overview.policies[0]).not.toHaveProperty("pipelineName");
		expect(overview.errors?.builds).toBe(
			"Azure DevOps PR content request failed.",
		);
		expect(onError).toHaveBeenCalledWith(expect.anything(), {
			terminal: false,
		});
	});

	test("skips definition lookups for hidden build policies", async () => {
		const definitionRequests = [];
		const configuration = (id, isEnabled = true) => ({
			id,
			isBlocking: true,
			isEnabled,
			settings: { buildDefinitionId: id },
			type: { displayName: "Build" },
		});
		const { client } = setup((request) => {
			const definition = /\/definitions\/(\d+)$/.exec(request.pathname);
			if (definition) {
				definitionRequests.push(Number(definition[1]));
				return {
					id: Number(definition[1]),
					name: "Visible pipeline",
				};
			}
			return request.pathname === policyPath
				? {
						value: [
							policy(77, {
								status: "queued",
								context: { buildId: 0 },
								configuration: configuration(77),
							}),
							policy(78, {
								status: "queued",
								context: { buildId: 0 },
								configuration: configuration(78, false),
							}),
							policy(79, {
								status: "notApplicable",
								context: { buildId: 0 },
								configuration: configuration(79),
							}),
						],
					}
				: undefined;
		});

		const overview = await client.getOverview(22);
		expect(definitionRequests).toEqual([77]);
		expect(overview.policies.map((entry) => entry.pipelineName)).toEqual([
			"Visible pipeline",
			undefined,
			undefined,
		]);
	});

	test("preserves the minimum reviewer count used by the checks summary", async () => {
		const { client } = setup((request) =>
			request.pathname === policyPath
				? {
						value: [
							policy(1, {
								configuration: {
									id: 1,
									isBlocking: true,
									isEnabled: true,
									settings: { minimumApproverCount: 2 },
									type: {
										id: "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",
										displayName: "Minimum number of reviewers",
									},
								},
							}),
						],
					}
				: undefined,
		);

		expect((await client.getOverview(22)).policies[0]).toMatchObject({
			typeId: "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",
			minimumApproverCount: 2,
		});
	});

	test("loads queued build policies with no assigned build", async () => {
		const { client } = setup((request) => {
			if (request.pathname.endsWith("/threads")) return { value: [thread()] };
			if (request.pathname === policyPath)
				return {
					value: [policy(1, { status: "queued", context: { buildId: 0 } })],
				};
		});
		const overview = await client.getOverview(22);
		expect(overview.threads).toHaveLength(1);
		expect(overview.policies).toHaveLength(1);
		expect(overview.policies[0]).toMatchObject({ status: "queued" });
		expect(overview.policies[0]).not.toHaveProperty("buildId");
		expect(overview.policies[0]).not.toHaveProperty("url");
		expect(overview).not.toHaveProperty("errors");
	});

	test("maps only public overview fields and reads every thread/policy page", async () => {
		const votes = [10, 5, 0, -5, -10, 17];
		const { client, fetch } = setup((url) => {
			if (url.pathname === prPath)
				return pr({
					reviewers: votes.map((vote, index) => ({
						...person,
						id: `reviewer-${index}`,
						vote,
						isRequired: index === 0,
					})),
				});
			if (url.pathname.endsWith("/threads")) {
				if (url.searchParams.has("continuationToken"))
					return { value: [thread({ id: 2, status: 2, threadContext: null })] };
				return Response.json(
					{
						value: [
							thread({
								comments: [
									...thread().comments,
									{ id: 2, isDeleted: true, content: "deleted-secret" },
								],
							}),
							{ id: 3, isDeleted: true },
						],
					},
					{ headers: { "x-ms-continuationtoken": "next & page" } },
				);
			}
			if (url.pathname === policyPath) {
				const skip = Number(url.searchParams.get("$skip"));
				return {
					value: skip
						? [policy(101, { status: "rejected" })]
						: Array.from({ length: 100 }, (_, index) => policy(index + 1)),
				};
			}
		});
		const overview = await client.getOverview(22);
		expect(overview).toEqual({
			author: { id: person.id, name: person.displayName },
			createdAt,
			reviewers: votes.map((vote, index) => ({
				id: `reviewer-${index}`,
				name: "Author",
				vote,
				isRequired: index === 0,
			})),
			threads: [1, 2].map((id) => ({
				id,
				status: id === 1 ? "active" : "fixed",
				path: id === 1 ? "/file.txt" : null,
				...(id === 1 ? { threadContext: { filePath: "/file.txt" } } : {}),
				comments: [
					{
						id: 1,
						author: { id: person.id, name: "Author" },
						content: "Review this",
						publishedAt: createdAt,
					},
				],
			})),
			policies: Array.from({ length: 101 }, (_, index) => ({
				id: policy(index + 1).evaluationId,
				name: "Build",
				status: index === 100 ? "rejected" : "approved",
				isBlocking: true,
				isEnabled: true,
			})),
			statuses: [],
		});
		const urls = fetch.mock.calls.map(([url]) => new URL(url));
		expect(urls.map((url) => url.pathname)).toEqual([
			prPath,
			`${prPath}/threads`,
			`${prPath}/threads`,
			policyPath,
			policyPath,
			`${prPath}/statuses`,
		]);
		expect(urls[2].searchParams.get("continuationToken")).toBe("next & page");
		expect(urls[4].searchParams.get("$skip")).toBe("100");
		for (const url of urls) {
			expect(url.origin).toBe("https://dev.azure.com");
			expect(url.searchParams.get("api-version")).toBe(
				url.pathname === policyPath ? "7.1-preview.1" : "7.1",
			);
			if (url.pathname === policyPath)
				expect(url.searchParams.get("artifactId")).toBe(artifactId);
		}
		for (const [, init] of fetch.mock.calls) {
			expect(init).toMatchObject({ method: "GET", redirect: "error" });
		}
		expect(JSON.stringify(overview)).not.toMatch(
			/private-token|private-email|untrusted|deleted-secret/,
		);
		expect(Object.isFrozen(overview.threads[0].comments[0].author)).toBe(true);
	});

	test("empty resources, absent optional identities/dates, and system threads are valid", async () => {
		const { client } = setup((url) => {
			if (url.pathname === prPath)
				return pr({ createdBy: null, creationDate: undefined });
			if (url.pathname.endsWith("/threads"))
				return {
					value: [
						thread({
							status: undefined,
							threadContext: null,
							comments: [{ id: 1, author: null, content: "" }],
						}),
					],
				};
		});
		expect(await client.getOverview(22)).toEqual({
			author: null,
			createdAt: null,
			reviewers: [],
			policies: [],
			statuses: [],
			threads: [
				{
					id: 1,
					path: null,
					status: "unknown",
					comments: [{ id: 1, author: null, content: "", publishedAt: null }],
				},
			],
		});
	});

	test("does not turn unknown thread/policy enum values into success", async () => {
		const { client } = setup((url) => {
			if (url.pathname.endsWith("/threads"))
				return { value: [thread({ status: 123 })] };
			if (url.pathname === policyPath)
				return { value: [policy(1, { status: "future-private-status" })] };
		});
		const overview = await client.getOverview(22);
		expect(overview.threads[0].status).toBe("unknown");
		expect(overview.policies[0].status).toBe("unknown");
	});

	test.each([
		{ repository: { id: "00000000-0000-0000-0000-000000000001" } },
		{ pullRequestId: 23 },
		{ repository: { id: repository.repositoryId } },
		{ repository: { id: repository.repositoryId, project: { id: "bad" } } },
		{
			repository: {
				id: repository.repositoryId,
				project: { id: projectId, name: "wrong project" },
			},
		},
		{ reviewers: null },
		{ reviewers: [{ ...person, vote: "10" }] },
		{ createdBy: { id: 42, displayName: "private-token" } },
		{ creationDate: "private-token" },
	])(
		"rejects invalid PR context before loading resources: %j",
		async (override) => {
			const { client, fetch } = setup((url) =>
				url.pathname === prPath ? pr(override) : undefined,
			);
			await expect(client.getOverview(22)).rejects.toThrow();
			expect(fetch).toHaveBeenCalledTimes(1);
		},
	);

	test.each([
		["threads", {}],
		["threads", { value: null }],
		["threads", { value: [thread({ comments: undefined })] }],
		["threads", { value: [thread({ isDeleted: "true" })] }],
		["threads", { value: [thread({ status: { private: "value" } })] }],
		["evaluations", { value: [policy(1, { artifactId: `${artifactId}3` })] }],
		["evaluations", { value: [policy(1, { configuration: {} })] }],
		["evaluations", { value: [policy(1, { status: undefined })] }],
		["evaluations", { value: [policy(1, { status: false })] }],
	])(
		"rejects malformed %s rather than returning empty",
		async (resource, data) => {
			const { client } = setup((url) =>
				url.pathname.endsWith(`/${resource}`) ? data : undefined,
			);
			await expect(client.getOverview(22)).rejects.toThrow();
		},
	);

	test.each([2, 21])(
		"UI reads follow %i thread pages without automation limits or counts",
		async (pages) => {
			const { client, fetch } = setup((url) => {
				if (!url.pathname.endsWith("/threads")) return undefined;
				const page = Number(url.searchParams.get("continuationToken") ?? "1");
				return page === pages
					? { value: [thread()] }
					: Response.json(
							{ value: [] },
							{ headers: { "x-ms-continuationtoken": String(page + 1) } },
						);
			});
			expect((await client.getOverview(22)).threads).toHaveLength(1);
			expect(
				fetch.mock.calls.filter(([url]) =>
					new URL(url).pathname.endsWith("/threads"),
				),
			).toHaveLength(pages);
		},
	);

	test("rejects repeated policy pages if the service ignores the offset", async () => {
		const { client, fetch } = setup((url) => {
			if (url.pathname !== policyPath) return undefined;
			if (url.searchParams.get("$skip") === "200")
				throw new Error("The client should already have stopped.");
			return {
				value: Array.from({ length: 100 }, (_, index) => policy(index + 1)),
			};
		});
		await expect(client.getOverview(22)).rejects.toThrow(/pagination/i);
		expect(
			fetch.mock.calls.filter(([url]) => url.includes("/policy/")),
		).toHaveLength(2);
	});
});

describe("Azure DevOps PR status checks", () => {
	test("maps status metadata and its safe build ID without identities or secrets", async () => {
		const url =
			"https://dev.azure.com/fabrikam/Project%20%26%20tools/_build/results?buildId=88";
		const { client, fetch } = setup((request) =>
			request.pathname.endsWith("/statuses")
				? { value: [status(7, { targetUrl: `${url}#private-token` })] }
				: undefined,
		);
		const overview = await client.getOverview(22);
		expect(overview.statuses).toEqual([
			{
				id: 7,
				name: "CI",
				genre: "continuous-integration",
				state: "pending",
				description: "Build in progress",
				iterationId: null,
				createdAt,
				updatedAt: createdAt,
				url,
				buildId: 88,
			},
		]);
		expect(Object.isFrozen(overview.statuses[0])).toBe(true);
		expect(JSON.stringify(overview.statuses)).not.toMatch(/private|isBlocking/);
		expect(fetch.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
			prPath,
			`${prPath}/threads`,
			policyPath,
			`${prPath}/statuses`,
		]);
	});

	test("an omitted default status state replaces an earlier success with notSet", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/statuses")
				? {
						value: [
							status(1, { state: "succeeded" }),
							status(2, { state: undefined }),
						],
					}
				: undefined,
		);
		expect((await client.getOverview(22)).statuses).toMatchObject([
			{ id: 2, state: "notSet" },
		]);
	});

	test.each([
		"notSet",
		"pending",
		"succeeded",
		"failed",
		"error",
		"notApplicable",
		"future-private-state",
		42,
	])(
		"preserves documented status states and treats %s conservatively",
		async (state) => {
			const { client } = setup((url) =>
				url.pathname.endsWith("/statuses")
					? {
							value: [
								status(1, {
									state,
									context: { name: "CI" },
									description: null,
									creationDate: undefined,
									updatedDate: null,
								}),
							],
						}
					: undefined,
			);
			expect((await client.getOverview(22)).statuses[0]).toMatchObject({
				state:
					state === "future-private-state" || state === 42 ? "unknown" : state,
				genre: "",
				description: null,
				createdAt: null,
				updatedAt: null,
			});
		},
	);

	test.each([
		"javascript:private-token",
		"http://dev.azure.com/fabrikam/Project%20%26%20tools/_build/results",
		"https://untrusted.example/build/88",
		"https://dev.azure.com/other/Project%20%26%20tools/_build/results",
		"https://dev.azure.com/fabrikam/other/_build/results",
		"https://user:private-token@dev.azure.com/fabrikam/Project%20%26%20tools/_build/results",
		"https://dev.azure.com/fabrikam/Project%20%26%20tools/_build/results?token=private-token",
	])(
		"omits unsafe or out-of-project status detail links: %s",
		async (targetUrl) => {
			const { client } = setup((url) =>
				url.pathname.endsWith("/statuses")
					? { value: [status(1, { targetUrl })] }
					: undefined,
			);
			expect((await client.getOverview(22)).statuses[0]).not.toHaveProperty(
				"url",
			);
		},
	);

	test("collapses context updates across pages without treating obsolete iterations as current", async () => {
		const later = "2026-09-10T13:00:00.000Z";
		const { client, fetch } = setup((url) => {
			if (url.pathname.endsWith("/statuses"))
				return url.searchParams.has("continuationToken")
					? {
							value: [
								status(10, { iterationId: 3, state: "pending" }),
								status(12, {
									iterationId: 2,
									state: "succeeded",
									updatedDate: later,
								}),
								status(13, {
									iterationId: 1,
									state: "succeeded",
									context: { name: "Old tests", genre: "" },
								}),
								status(14, {
									context: { name: "CI", genre: "other-service" },
								}),
								status(15, {
									context: { name: "Author check", genre: "" },
									state: "succeeded",
								}),
							],
						}
					: Response.json(
							{
								value: [
									status(11, {
										iterationId: 3,
										state: "failed",
										updatedDate: later,
									}),
									status(9, { iterationId: 3, state: "succeeded" }),
								],
							},
							{ headers: { "x-ms-continuationtoken": "next & page" } },
						);
			if (url.pathname.endsWith("/iterations"))
				return { value: [{ id: 3 }, { id: 1 }, { id: 2 }] };
		});
		const { statuses } = await client.getOverview(22);
		expect(
			statuses.map(({ id, state, iterationId }) => ({
				id,
				state,
				iterationId,
			})),
		).toEqual([
			{ id: 11, state: "failed", iterationId: 3 },
			{ id: 14, state: "pending", iterationId: null },
			{ id: 15, state: "succeeded", iterationId: null },
		]);
		const urls = fetch.mock.calls.map(([input]) => new URL(input));
		expect(urls[4].searchParams.get("continuationToken")).toBe("next & page");
		expect(urls[5].pathname).toBe(`${prPath}/iterations`);
		expect(urls.every((url) => url.origin === "https://dev.azure.com")).toBe(
			true,
		);
	});

	test("uses update time, creation time, then ID rather than response order for context updates", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/statuses")
				? {
						value: [
							status(2, { state: "failed", updatedDate: null }),
							status(1, { state: "succeeded", updatedDate: null }),
							status(3, {
								state: "pending",
								creationDate: "2026-09-09T12:00:00Z",
								updatedDate: null,
							}),
						],
					}
				: undefined,
		);
		expect((await client.getOverview(22)).statuses.map(({ id }) => id)).toEqual(
			[2],
		);
	});

	test.each(["statuses", "iterations"])(
		"keeps policies and threads if the %s status read is unavailable",
		async (resource) => {
			const { client } = setup((url) => {
				if (url.pathname.endsWith(`/${resource}`))
					throw new TypeError("private-token");
				if (url.pathname.endsWith("/statuses"))
					return { value: [status(1, { iterationId: 3 })] };
				if (url.pathname.endsWith("/threads")) return { value: [thread()] };
				if (url.pathname === policyPath) return { value: [policy()] };
			});
			const overview = await client.getOverview(22);
			expect(overview.statuses).toEqual([]);
			expect(overview.policies).toHaveLength(1);
			expect(overview.threads).toHaveLength(1);
			expect(overview.errors).toEqual({
				statuses: "Azure DevOps PR content request failed.",
			});
		},
	);

	test.each([
		{},
		{ value: null },
		{ value: [status(0)] },
		{ value: [status(1, { context: { name: "" } })] },
		{ value: [status(1, { context: { name: "CI", genre: 3 } })] },
		{ value: [status(1, { state: false })] },
		{ value: [status(1, { state: null })] },
		{ value: [status(1, { description: {} })] },
		{ value: [status(1, { iterationId: 0 })] },
		{ value: [status(1, { iterationId: "3" })] },
		{ value: [status(1, { updatedDate: "private-token" })] },
	])(
		"rejects malformed status data without returning misleading empty success: %j",
		async (data) => {
			const { client } = setup((url) =>
				url.pathname.endsWith("/statuses") ? data : undefined,
			);
			await expect(client.getOverview(22)).rejects.toMatchObject({
				code: "invalid-response",
			});
		},
	);

	test("rejects status references to iterations outside the requested PR", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/statuses")
				? { value: [status(1, { iterationId: 4 })] }
				: undefined,
		);
		await expect(client.getOverview(22)).rejects.toMatchObject({
			code: "invalid-response",
		});
	});

	test("honors cancellation between status pages rather than showing partial CI results", async () => {
		const controller = new AbortController();
		const { client, fetch } = setup((url) => {
			if (url.pathname.endsWith("/statuses")) {
				controller.abort("private-token");
				return Response.json(
					{ value: [status()] },
					{ headers: { "x-ms-continuationtoken": "more" } },
				);
			}
		});
		await expect(
			client.getOverview(22, { signal: controller.signal }),
		).rejects.toMatchObject({
			name: "AbortError",
			message: "Azure DevOps PR content request cancelled.",
		});
		expect(fetch).toHaveBeenCalledTimes(4);
	});

	test("rejects repeated status continuations instead of looping", async () => {
		const { client, fetch } = setup((url) =>
			url.pathname.endsWith("/statuses")
				? Response.json(
						{ value: [status()] },
						{ headers: { "x-ms-continuationtoken": "more" } },
					)
				: undefined,
		);
		await expect(client.getOverview(22)).rejects.toThrow(/pagination/i);
		expect(fetch).toHaveBeenCalledTimes(5);
	});
});

describe("Azure DevOps PR changes reads", () => {
	test("selects a known PR commit against its first parent and reads immutable content", async () => {
		const selected = "d".repeat(40);
		const { client, fetch } = setup((url) => {
			if (url.pathname === `${prPath}/commits`)
				return { value: [commit(selected)] };
			if (url.pathname === `${apiPath}/commits/${selected}`)
				return { ...commit(selected), parents: [baseCommitId, sourceCommitId] };
			if (url.pathname === `${apiPath}/commits/${selected}/changes`)
				return {
					changes: [{ item: { path: "/file.txt" }, changeType: "edit" }],
				};
		});
		const result = await client.getChanges(22, { commitId: selected });
		expect(result).toMatchObject({
			selectedCommitId: selected,
			baseCommitId,
			sourceCommitId: selected,
			files: [{ id: 1, path: "/file.txt", changeType: "edit" }],
		});
		await client.getFileDiff(result, 0);
		expect(
			fetch.mock.calls.some(([url]) =>
				url.includes(`/commits/${selected}/changes?`),
			),
		).toBe(true);
		expect(
			fetch.mock.calls
				.filter(([url]) => url.includes("/items?"))
				.map(([url]) =>
					new URL(url).searchParams.get("versionDescriptor.version"),
				),
		).toEqual([baseCommitId, selected]);
	});

	test("refuses unknown commits without fetching arbitrary commit paths", async () => {
		const { client, fetch } = setup();
		await expect(
			client.getChanges(22, { commitId: "d".repeat(40) }),
		).rejects.toThrow();
		expect(
			fetch.mock.calls.some(([url]) =>
				url.includes(`/commits/${"d".repeat(40)}`),
			),
		).toBe(false);
	});

	test("paginates selected commit changes using documented top/skip and PR commits using continuation", async () => {
		const selected = "d".repeat(40);
		const { client, fetch } = setup((url) => {
			if (url.pathname === `${prPath}/commits`)
				return url.searchParams.has("continuationToken")
					? { value: [commit(selected)] }
					: Response.json(
							{ value: [commit()] },
							{ headers: { "x-ms-continuationtoken": "more" } },
						);
			if (url.pathname === `${apiPath}/commits/${selected}`)
				return { ...commit(selected), parents: [baseCommitId] };
			if (url.pathname === `${apiPath}/commits/${selected}/changes`)
				return {
					changes: Array.from(
						{ length: url.searchParams.get("skip") === "0" ? 100 : 1 },
						(_, index) => ({
							item: {
								path: `/file-${Number(url.searchParams.get("skip")) + index}.txt`,
							},
							changeType: "add",
						}),
					),
				};
		});
		const changes = await client.getChanges(22, { commitId: selected });
		expect(changes.files).toHaveLength(101);
		const urls = fetch.mock.calls
			.map(([url]) => new URL(url))
			.filter((url) => url.pathname.endsWith(`/${selected}/changes`));
		expect(urls.map((url) => url.searchParams.get("skip"))).toEqual([
			"0",
			"100",
		]);
		expect(
			urls.every(
				(url) =>
					url.searchParams.get("top") === "100" &&
					!url.searchParams.has("$skip"),
			),
		).toBe(true);
	});

	test.each([
		{ commitId: sourceCommitId, parents: [baseCommitId] },
		{ parents: [] },
		{ parents: ["main"] },
	])(
		"rejects mismatched commit responses or unsupported parents: %j",
		async (override) => {
			const selected = "d".repeat(40);
			const { client, fetch } = setup((url) => {
				if (url.pathname === `${prPath}/commits`)
					return { value: [commit(selected)] };
				if (url.pathname === `${apiPath}/commits/${selected}`)
					return { ...commit(selected), ...override };
			});
			await expect(
				client.getChanges(22, { commitId: selected }),
			).rejects.toThrow();
			expect(
				fetch.mock.calls.some(([url]) => url.includes(`/${selected}/changes`)),
			).toBe(false);
		},
	);

	test("still fences PR history selection when the source changes while reading", async () => {
		const selected = "d".repeat(40);
		let iterationReads = 0;
		const { client } = setup((url) => {
			if (url.pathname.endsWith("/iterations"))
				return { value: [iteration(++iterationReads === 1 ? 3 : 4)] };
			if (url.pathname === `${prPath}/commits`)
				return { value: [commit(selected)] };
			if (url.pathname === `${apiPath}/commits/${selected}`)
				return { ...commit(selected), parents: [baseCommitId] };
			if (url.pathname === `${apiPath}/commits/${selected}/changes`)
				return { changes: [] };
		});
		await expect(
			client.getChanges(22, { commitId: selected }),
		).rejects.toMatchObject({ code: "stale-changes" });
	});

	test("chooses maximum iteration and exhausts changes and commits pagination", async () => {
		const { client, fetch } = setup((url) => {
			if (url.pathname.endsWith("/iterations"))
				return { value: [iteration(3), iteration(1), iteration(2)] };
			if (url.pathname.endsWith("/changes"))
				return url.searchParams.get("$skip") === "1"
					? {
							changeEntries: [entry("delete", { changeId: 8 })],
							nextSkip: 0,
							nextTop: 0,
						}
					: { changeEntries: [entry()], nextSkip: 1, nextTop: 20 };
			if (url.pathname.endsWith("/commits"))
				return url.searchParams.has("continuationToken")
					? { value: [commit(baseCommitId)] }
					: Response.json(
							{ value: [commit()] },
							{ headers: { "x-ms-continuationtoken": "next=commit&token" } },
						);
		});
		expect(await client.getChanges(22)).toEqual({
			iterationId: 3,
			baseCommitId,
			sourceCommitId,
			commits: [sourceCommitId, baseCommitId].map((id) => ({
				id,
				message: commit().comment,
				author: "Author",
				date: createdAt,
			})),
			files: [
				{
					id: 7,
					path: "/file.txt",
					originalPath: null,
					changeType: "edit",
					changeTrackingId: 9,
				},
				{
					id: 8,
					path: "/file.txt",
					originalPath: null,
					changeType: "delete",
					changeTrackingId: 9,
				},
			],
		});
		const urls = fetch.mock.calls.map(([url]) => new URL(url));
		const pages = urls.filter((url) => url.pathname.endsWith("/changes"));
		expect(pages).toHaveLength(2);
		for (const url of pages) {
			expect(url.pathname).toBe(`${prPath}/iterations/3/changes`);
			expect(url.searchParams.get("$compareTo")).toBe("0");
		}
		expect(pages[1].searchParams.get("$skip")).toBe("1");
		expect(pages[1].searchParams.get("$top")).toBe("20");
		expect(
			urls
				.filter((url) => url.pathname.endsWith("/commits"))
				.at(-1)
				.searchParams.get("continuationToken"),
		).toBe("next=commit&token");
		expect(
			urls.filter((url) => url.pathname.endsWith("/iterations")),
		).toHaveLength(2);
	});

	test("maps renames and retains unknown changes explicitly", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/changes")
				? {
						changeEntries: [
							entry("rename, edit", { originalPath: "/old.txt" }),
							entry("futureChange", { changeId: 8 }),
						],
					}
				: undefined,
		);
		expect((await client.getChanges(22)).files).toEqual([
			{
				id: 7,
				path: "/file.txt",
				originalPath: "/old.txt",
				changeType: "rename, edit",
				changeTrackingId: 9,
			},
			{
				id: 8,
				path: "/file.txt",
				originalPath: null,
				changeType: "unknown",
				changeTrackingId: 9,
			},
		]);
	});

	test("uses the tracking ID when an iteration change omits changeId", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/changes")
				? {
						changeEntries: [
							entry("rename", {
								changeId: undefined,
								originalPath: "/old.txt",
							}),
						],
					}
				: undefined,
		);
		expect((await client.getChanges(22)).files).toEqual([
			{
				id: 9,
				path: "/file.txt",
				originalPath: "/old.txt",
				changeType: "rename",
				changeTrackingId: 9,
			},
		]);
	});

	test.each([undefined, sourceCommitId])(
		"maps deleted files without a current path for commit %s",
		async (commitId) => {
			const { client } = setup((url) => {
				if (url.pathname === `${prPath}/commits`) return { value: [commit()] };
				if (url.pathname === `${apiPath}/commits/${sourceCommitId}`)
					return { ...commit(), parents: [baseCommitId] };
				if (url.pathname.endsWith("/changes")) {
					const deleted = entry("delete", {
						item: { path: null },
						originalPath: "/deleted.txt",
					});
					return commitId
						? { changes: [deleted] }
						: { changeEntries: [deleted] };
				}
			});
			expect((await client.getChanges(22, { commitId })).files).toEqual([
				{
					id: commitId ? 1 : 7,
					path: "/deleted.txt",
					originalPath: "/deleted.txt",
					changeType: "delete",
					changeTrackingId: 9,
				},
			]);
		},
	);

	test("considers iterations from every continuation page and accepts empty diffs", async () => {
		const { client } = setup((url) => {
			if (url.pathname.endsWith("/iterations"))
				return url.searchParams.has("continuationToken")
					? { value: [iteration(4)] }
					: Response.json(
							{ value: [iteration(3)] },
							{ headers: { "x-ms-continuationtoken": "more" } },
						);
			if (url.pathname.endsWith("/changes")) return { changeEntries: [] };
		});
		expect(await client.getChanges(22)).toEqual({
			iterationId: 4,
			baseCommitId,
			sourceCommitId,
			commits: [],
			files: [],
		});
	});

	test("reports no iterations explicitly", async () => {
		const { client } = setup((url) =>
			url.pathname.endsWith("/iterations") ? { value: [] } : undefined,
		);
		await expect(client.getChanges(22)).rejects.toMatchObject({
			name: "AzureDevOpsContentError",
			code: "no-iterations",
		});
	});

	test.each([
		["iterations", { value: [iteration(3, { commonRefCommit: null })] }],
		[
			"iterations",
			{ value: [iteration(3, { sourceRefCommit: { commitId: "main" } })] },
		],
		["changes", { changeEntries: null }],
		[
			"changes",
			{
				changeEntries: [
					entry("edit", {
						item: { path: null },
						originalPath: "/old.txt",
					}),
				],
			},
		],
		["changes", { changeEntries: [entry("delete", { item: { path: null } })] }],
		["changes", { changeEntries: [entry()], nextSkip: 1 }],
		["changes", { changeEntries: [entry()], nextSkip: -1, nextTop: 20 }],
		["commits", { value: [{ ...commit(), commitId: "main" }] }],
	])("rejects malformed %s", async (resource, data) => {
		const { client } = setup((url) =>
			url.pathname.endsWith(`/${resource}`) ? data : undefined,
		);
		await expect(client.getChanges(22)).rejects.toThrow();
	});

	test("rejects nonadvancing changes pages without retrying forever", async () => {
		const { client, fetch } = setup((url) =>
			url.pathname.endsWith("/changes")
				? { changeEntries: [entry()], nextSkip: 1, nextTop: 20 }
				: undefined,
		);
		await expect(client.getChanges(22)).rejects.toThrow(/pagination/i);
		expect(
			fetch.mock.calls.filter(([url]) => url.includes("/changes?")),
		).toHaveLength(2);
	});

	test.each([
		[
			"new source",
			iteration(3, { sourceRefCommit: { commitId: "c".repeat(40) } }),
		],
		[
			"new base",
			iteration(3, { commonRefCommit: { commitId: "d".repeat(40) } }),
		],
		["new iteration after a force-push back to the same source", iteration(4)],
		["removed iterations", null],
	])(
		"rejects a changed comparison after reading commits: %s",
		async (_name, updated) => {
			let commitsRead = false;
			const { client, fetch } = setup((url) => {
				if (url.pathname.endsWith("/iterations"))
					return {
						value: commitsRead
							? updated
								? [updated, iteration(1)]
								: []
							: [iteration()],
					};
				if (url.pathname.endsWith("/commits")) {
					commitsRead = true;
					return { value: [commit("c".repeat(40))] };
				}
			});
			await expect(client.getChanges(22)).rejects.toMatchObject({
				name: "AzureDevOpsContentError",
				code: "stale-changes",
				message:
					"Azure DevOps PR changed while loading. Refresh to load the current changes.",
			});
			expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
				`${prPath}/iterations`,
				`${prPath}/iterations/3/changes`,
				`${prPath}/commits`,
				`${prPath}/iterations`,
			]);
		},
	);

	test("never publishes commits mixed by a push between continuation pages", async () => {
		let pushed = false;
		const { client, fetch } = setup((url) => {
			if (url.pathname.endsWith("/iterations"))
				return {
					value: [
						pushed
							? iteration(4, { sourceRefCommit: { commitId: "c".repeat(40) } })
							: iteration(),
					],
				};
			if (url.pathname.endsWith("/commits")) {
				if (!url.searchParams.has("continuationToken"))
					return Response.json(
						{ value: [commit()] },
						{ headers: { "x-ms-continuationtoken": "next" } },
					);
				pushed = true;
				return { value: [commit("c".repeat(40))] };
			}
		});
		await expect(client.getChanges(22)).rejects.toMatchObject({
			code: "stale-changes",
		});
		expect(
			fetch.mock.calls.filter(([url]) => url.includes("/commits?")),
		).toHaveLength(2);
		expect(
			fetch.mock.calls.filter(([url]) => url.includes("/iterations?")),
		).toHaveLength(2);
	});

	test("checks the maximum iteration from every final continuation page", async () => {
		let commitsRead = false;
		const { client } = setup((url) => {
			if (url.pathname.endsWith("/iterations") && commitsRead)
				return url.searchParams.has("continuationToken")
					? { value: [iteration(4)] }
					: Response.json(
							{ value: [iteration()] },
							{ headers: { "x-ms-continuationtoken": "more" } },
						);
			if (url.pathname.endsWith("/commits")) {
				commitsRead = true;
				return { value: [] };
			}
		});
		await expect(client.getChanges(22)).rejects.toMatchObject({
			code: "stale-changes",
		});
	});

	test.each(["cancelled", "failed"])(
		"does not publish changes when final verification is %s",
		async (mode) => {
			const controller = new AbortController();
			let commitsRead = false;
			const { client, fetch } = setup((url) => {
				if (url.pathname.endsWith("/commits")) {
					commitsRead = true;
					return { value: [] };
				}
				if (url.pathname.endsWith("/iterations") && commitsRead) {
					if (mode === "cancelled") controller.abort();
					else return new Response("private-token", { status: 503 });
				}
			});
			await expect(
				client.getChanges(22, { signal: controller.signal }),
			).rejects.toMatchObject(
				mode === "cancelled"
					? { name: "AbortError" }
					: { name: "AzureDevOpsHttpError", status: 503 },
			);
			expect(fetch).toHaveBeenCalledTimes(4);
		},
	);
});

describe("Azure DevOps immutable file reads", () => {
	test.each([
		["edit", null, ["old\n", "new\n"], [baseCommitId, sourceCommitId]],
		["add", null, [null, "new\n"], [sourceCommitId]],
		["delete", null, ["old\n", null], [baseCommitId]],
		[
			"rename, edit",
			"/old & #?.txt",
			["old\n", "new\n"],
			[baseCommitId, sourceCommitId],
		],
	])(
		"reads %s using exact commits and encoded paths",
		async (changeType, originalPath, texts, refs) => {
			const { client, fetch } = setup();
			const path = "/new & #?.txt";
			const input = changes(changeType, {
				files: [{ id: 7, path, originalPath, changeType }],
			});
			expect(await client.getFileDiff(input, 0)).toEqual({
				path,
				original: texts[0],
				modified: texts[1],
				binary: false,
			});
			const urls = fetch.mock.calls.map(([url]) => new URL(url));
			expect(
				urls.map((url) => url.searchParams.get("versionDescriptor.version")),
			).toEqual(refs);
			for (const [index, url] of urls.entries()) {
				expect(url.pathname).toBe(`${apiPath}/items`);
				expect(url.searchParams.get("path")).toBe(
					index === 0 && originalPath ? originalPath : path,
				);
				expect(url.searchParams.get("versionDescriptor.versionType")).toBe(
					"commit",
				);
				expect(url.searchParams.get("includeContent")).toBe("true");
				expect(url.searchParams.get("includeContentMetadata")).toBe("true");
				expect(url.searchParams.get("$format")).toBe("json");
				expect(url.searchParams.get("api-version")).toBe("7.1");
			}
		},
	);

	test.each([-1, 1, 0.5, "0", undefined, Number.NaN])(
		"rejects bad index %s before requesting content",
		async (index) => {
			const { client, fetch } = setup();
			await expect(client.getFileDiff(changes(), index)).rejects.toThrow(
				/index/i,
			);
			expect(fetch).not.toHaveBeenCalled();
		},
	);

	test.each([
		changes("unknown"),
		changes("rename"),
		changes("edit", { baseCommitId: "main" }),
		changes("edit", {
			files: [
				{
					id: 7,
					path: "https://untrusted.example/file",
					originalPath: null,
					changeType: "edit",
				},
			],
		}),
	])(
		"rejects unsupported diffs or invalid refs before requests",
		async (input) => {
			const { client, fetch } = setup();
			await expect(client.getFileDiff(input, 0)).rejects.toThrow();
			expect(fetch).not.toHaveBeenCalled();
		},
	);

	test("reads text when ADO omits the default false binary flag", async () => {
		const { client } = setup((url) =>
			item("/file.txt", url.searchParams.get("versionDescriptor.version"), {
				contentMetadata: { encoding: 65001, contentType: "text/plain" },
			}),
		);
		expect(await client.getFileDiff(changes(), 0)).toEqual({
			path: "/file.txt",
			original: "old\n",
			modified: "new\n",
			binary: false,
		});
	});

	test.each([baseCommitId, sourceCommitId])(
		"marks binary at %s without decoding content",
		async (binaryRef) => {
			const { client } = setup((url) => {
				const ref = url.searchParams.get("versionDescriptor.version");
				return ref === binaryRef
					? item("/file.txt", ref, {
							contentMetadata: { isBinary: true },
							content: "aGVsbG8=",
						})
					: undefined;
			});
			expect(await client.getFileDiff(changes(), 0)).toEqual({
				path: "/file.txt",
				original: null,
				modified: null,
				binary: true,
			});
		},
	);

	test.each([
		{ path: "/wrong.txt" },
		{ commitId: "c".repeat(40) },
		{ content: undefined },
		{ contentMetadata: undefined },
		{ contentMetadata: { isBinary: "false" } },
		{ content: "nul\0garbage" },
		{ gitObjectType: "tree" },
		{ content: "é".repeat(524_289) },
	])(
		"rejects malformed, unsupported or oversized file data",
		async (overrides) => {
			const { client } = setup(() =>
				item("/file.txt", baseCommitId, overrides),
			);
			await expect(client.getFileDiff(changes(), 0)).rejects.toThrow();
		},
	);

	test("bounds streamed JSON before buffering an unbounded file", async () => {
		const cancel = vi.fn();
		let pulls = 0;
		const { client } = setup(
			() =>
				new Response(
					new ReadableStream({
						pull(controller) {
							pulls++;
							controller.enqueue(new Uint8Array(1024 * 1024).fill(32));
						},
						cancel,
					}),
					{ headers: { "Content-Type": "application/json" } },
				),
		);
		await expect(client.getFileDiff(changes(), 0)).rejects.toMatchObject({
			name: "AzureDevOpsContentError",
			code: "too-large",
		});
		expect(cancel).toHaveBeenCalledOnce();
		expect(pulls).toBeLessThan(12);
	});

	test("never interprets a missing edit side as add/delete", async () => {
		const { client, fetch } = setup(
			() => new Response("private-token", { status: 404 }),
		);
		await expect(client.getFileDiff(changes(), 0)).rejects.toMatchObject({
			status: 404,
		});
		expect(fetch).toHaveBeenCalledOnce();
	});

	test("does not observe caller mutations after starting the first file request", async () => {
		const input = changes();
		const { client, fetch } = setup(() => {
			input.sourceCommitId = "c".repeat(40);
			input.files[0].path = "/other.txt";
		});
		expect(await client.getFileDiff(input, 0)).toEqual({
			path: "/file.txt",
			original: "old\n",
			modified: "new\n",
			binary: false,
		});
		expect(
			new URL(fetch.mock.calls[1][0]).searchParams.get(
				"versionDescriptor.version",
			),
		).toBe(sourceCommitId);
	});
});

describe("Azure DevOps read safety", () => {
	const calls = {
		getOverview: (client, options) => client.getOverview(22, options),
		getChanges: (client, options) => client.getChanges(22, options),
		getFileDiff: (client, options) => client.getFileDiff(changes(), 0, options),
	};

	test.each(Object.keys(calls))(
		"%s sanitizes errors without retry or credential leakage",
		async (method) => {
			const { client, fetch } = setup();
			fetch.mockRejectedValueOnce(new Error("private-token"));
			await expect(calls[method](client)).rejects.toMatchObject({
				name: "AzureDevOpsContentError",
				code: "request-failed",
				message: "Azure DevOps PR content request failed.",
			});
			expect(fetch).toHaveBeenCalledOnce();
			fetch.mockRejectedValueOnce(
				new TypeError("private-token https://untrusted.example"),
			);
			await expect(calls[method](client)).rejects.toThrow(
				"Azure DevOps PR content request failed.",
			);
			fetch.mockResolvedValueOnce(new Response('{"private-token": broken'));
			const error = await calls[method](client).catch((error) => error);
			expect(error.message).not.toContain("private-token");
			expect(fetch).toHaveBeenCalledTimes(3);
		},
	);

	test.each(Object.keys(calls))(
		"%s honors cancellation before the request and after the response",
		async (method) => {
			for (const stage of ["before", "response"]) {
				const controller = new AbortController();
				const { client, fetch } = setup(() => {
					if (stage === "response") controller.abort();
				});
				if (stage === "before") controller.abort();
				await expect(
					calls[method](client, { signal: controller.signal }),
				).rejects.toMatchObject({ name: "AbortError" });
				expect(fetch).toHaveBeenCalledTimes(stage === "response" ? 1 : 0);
			}
		},
	);

	test("cancels between pages and does not fetch remaining resources", async () => {
		const controller = new AbortController();
		const { client, fetch } = setup((url) => {
			if (url.pathname.endsWith("/threads")) {
				controller.abort();
				return Response.json(
					{ value: [thread()] },
					{ headers: { "x-ms-continuationtoken": "more" } },
				);
			}
		});
		await expect(
			client.getOverview(22, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test("rejects repeated continuation without looping or following remote URLs", async () => {
		const { client, fetch } = setup((url) =>
			url.pathname.endsWith("/threads")
				? Response.json(
						{ value: [thread()] },
						{
							headers: {
								"x-ms-continuationtoken": "https://untrusted.example",
							},
						},
					)
				: undefined,
		);
		await expect(client.getOverview(22)).rejects.toThrow(/pagination/i);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(
			fetch.mock.calls.every(
				([url]) => new URL(url).origin === "https://dev.azure.com",
			),
		).toBe(true);
	});
});
