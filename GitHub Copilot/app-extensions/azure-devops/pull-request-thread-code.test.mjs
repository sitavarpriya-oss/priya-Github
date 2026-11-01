// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
	AzureDevOpsContentError,
	createPullRequestClient,
} from "./pull-requests.mjs";

const repository = {
	organization: "fabrikam",
	project: "Project & tools",
	repositoryId: "3411ebc1-d5aa-464f-9615-0b527bc66719",
	accountId: "selected-account",
};
const apiPath = `/fabrikam/Project%20%26%20tools/_apis/git/repositories/${repository.repositoryId}`;
const prPath = `${apiPath}/pullrequests/22`;
const baseCommitId = "a".repeat(40);
const sourceCommitId = "b".repeat(40);
const earlierCommitId = "c".repeat(40);
const newerCommitId = "d".repeat(40);
const position = (line) => ({ line, offset: 1 });
const range = (side, start, end = start) => ({
	[`${side}FileStart`]: position(start),
	[`${side}FileEnd`]: position(end),
});

function thread({ first = 0, second = 3, context = {}, prContext = {} } = {}) {
	return {
		id: 1,
		status: "active",
		path: "/file.txt",
		comments: [],
		threadContext: { filePath: "/file.txt", ...range("right", 2), ...context },
		pullRequestThreadContext: {
			changeTrackingId: 9,
			iterationContext: {
				firstComparingIteration: first,
				secondComparingIteration: second,
			},
			...prContext,
		},
	};
}

function iteration(id, source = sourceCommitId) {
	return {
		id,
		commonRefCommit: { commitId: baseCommitId },
		sourceRefCommit: { commitId: source },
		targetRefCommit: { commitId: "e".repeat(40) },
	};
}

function entry(overrides = {}) {
	return {
		changeId: 7,
		changeTrackingId: 9,
		changeType: "edit",
		item: { path: "/file.txt" },
		...overrides,
	};
}

function setup({
	original = "one\nold\nthree\nfour\nfive\nsix\nseven\n",
	modified = "one\nnew\nthree\nfour\nfive\nsix\nseven\n",
	change = entry(),
	iterations = [
		iteration(1, earlierCommitId),
		iteration(3),
		iteration(5, newerCommitId),
	],
	handler = () => undefined,
} = {}) {
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "private-token" }),
	};
	const fetch = vi.fn(async (input, init) => {
		const url = new URL(input);
		const result = await handler(url, init);
		if (result !== undefined)
			return result instanceof Response ? result : Response.json(result);
		if (url.pathname === `${prPath}/iterations`)
			return Response.json({ value: iterations });
		if (url.pathname === `${prPath}/iterations/3/changes`)
			return Response.json({ changeEntries: [change] });
		if (url.pathname === `${apiPath}/items`) {
			const commitId = url.searchParams.get("versionDescriptor.version");
			return Response.json({
				path: url.searchParams.get("path"),
				commitId,
				gitObjectType: "blob",
				contentMetadata: { isBinary: false },
				content: commitId === sourceCommitId ? modified : original,
			});
		}
		throw new Error(`Unexpected request: ${url.pathname}`);
	});
	return {
		client: createPullRequestClient({ repository, authentication, fetch }),
		authentication,
		fetch,
		requests: () => fetch.mock.calls.map(([input]) => new URL(input)),
		files: () =>
			fetch.mock.calls
				.map(([input]) => new URL(input))
				.filter((url) => url.pathname === `${apiPath}/items`)
				.map((url) => ({
					path: url.searchParams.get("path"),
					commit: url.searchParams.get("versionDescriptor.version"),
					versionType: url.searchParams.get("versionDescriptor.versionType"),
				})),
	};
}

describe("immutable Azure DevOps discussion code previews", () => {
	test("shares in-flight and completed reads within a batch while keeping each snippet's own range", async () => {
		const content = Array.from(
			{ length: 40 },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		const fixture = setup({ original: content, modified: content });
		const { signal } = new AbortController();
		const lines = [2, 15, 30];
		const results = await Promise.all(
			lines.map((line) =>
				fixture.client.getThreadCode(
					22,
					thread({ context: range("right", line) }),
					{ signal },
				),
			),
		);
		for (const [index, result] of results.entries()) {
			expect(result.rows.some((row) => row.modifiedLine === lines[index])).toBe(
				true,
			);
			expect(result.rows.length).toBeLessThanOrEqual(7);
			expect(result).toMatchObject({ baseCommitId, sourceCommitId });
		}
		await fixture.client.getThreadCode(22, thread(), { signal });
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/iterations")),
		).toHaveLength(1);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/changes")),
		).toHaveLength(1);
		expect(fixture.files()).toHaveLength(2);
	});

	test("shares comparison mapping but not file content between different files", async () => {
		const fixture = setup({
			handler: (url) =>
				url.pathname.endsWith("/changes")
					? {
							changeEntries: [
								entry(),
								entry({ changeTrackingId: 10, item: { path: "/second.txt" } }),
							],
						}
					: undefined,
		});
		const { signal } = new AbortController();
		const results = await Promise.all([
			fixture.client.getThreadCode(22, thread(), { signal }),
			fixture.client.getThreadCode(
				22,
				thread({
					context: { filePath: "/second.txt" },
					prContext: { changeTrackingId: 10 },
				}),
				{ signal },
			),
		]);
		expect(results.map((result) => result.path)).toEqual([
			"/file.txt",
			"/second.txt",
		]);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/changes")),
		).toHaveLength(1);
		expect(fixture.files()).toHaveLength(4);
		expect(
			new Set(fixture.files().map((file) => `${file.path}:${file.commit}`))
				.size,
		).toBe(4);
	});

	test("shares source content but keeps different comparison baselines distinct", async () => {
		const fixture = setup();
		const { signal } = new AbortController();
		const results = await Promise.all([
			fixture.client.getThreadCode(22, thread(), { signal }),
			fixture.client.getThreadCode(22, thread({ first: 1 }), { signal }),
		]);
		expect(results.map((result) => result.baseCommitId)).toEqual([
			baseCommitId,
			earlierCommitId,
		]);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/iterations")),
		).toHaveLength(1);
		expect(
			fixture
				.requests()
				.filter((url) => url.pathname.endsWith("/changes"))
				.map((url) => url.searchParams.get("$compareTo")),
		).toEqual(["0", "1"]);
		expect(
			fixture
				.files()
				.map((file) => file.commit)
				.sort(),
		).toEqual([baseCommitId, sourceCommitId, earlierCommitId].sort());
	});

	test.each(["different signals", "no signal"])(
		"does not reuse a previous batch with %s",
		async (kind) => {
			const fixture = setup();
			for (let call = 0; call < 2; call++) {
				await fixture.client.getThreadCode(22, thread(), {
					signal:
						kind === "no signal" ? undefined : new AbortController().signal,
				});
			}
			expect(fixture.requests()).toHaveLength(8);
			expect(fixture.files()).toHaveLength(4);
		},
	);

	test("keeps batch reads bound to their client even when callers share a signal", async () => {
		const first = setup();
		const second = setup({ modified: "one\nother client\n" });
		const { signal } = new AbortController();
		const results = await Promise.all([
			first.client.getThreadCode(22, thread(), { signal }),
			second.client.getThreadCode(22, thread(), { signal }),
		]);
		expect(results[0].rows.some((row) => row.text === "new")).toBe(true);
		expect(results[1].rows.some((row) => row.text === "other client")).toBe(
			true,
		);
		expect(first.requests()).toHaveLength(4);
		expect(second.requests()).toHaveLength(4);
	});

	test("never reuses another PR's iteration or change metadata in the same signal scope", async () => {
		const otherPr = `${apiPath}/pullrequests/23`;
		const fixture = setup({
			handler: (url) => {
				if (url.pathname === `${otherPr}/iterations`)
					return { value: [iteration(3, newerCommitId)] };
				if (url.pathname === `${otherPr}/iterations/3/changes`)
					return { changeEntries: [entry()] };
			},
		});
		const { signal } = new AbortController();
		const first = await fixture.client.getThreadCode(22, thread(), { signal });
		const second = await fixture.client.getThreadCode(23, thread(), { signal });
		expect(first.sourceCommitId).toBe(sourceCommitId);
		expect(second.sourceCommitId).toBe(newerCommitId);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/iterations")),
		).toHaveLength(2);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/changes")),
		).toHaveLength(2);
		expect(fixture.files()).toHaveLength(3);
	});

	test("shares failures only within their batch and lets the next batch retry", async () => {
		let fileReads = 0;
		const fixture = setup({
			handler: (url) => {
				if (url.pathname.endsWith("/items") && fileReads++ === 0)
					return new Response("private-token", { status: 503 });
			},
		});
		const { signal } = new AbortController();
		const results = await Promise.allSettled(
			Array.from({ length: 3 }, () =>
				fixture.client.getThreadCode(22, thread(), { signal }),
			),
		);
		expect(
			results.every(
				(result) =>
					result.status === "rejected" &&
					result.reason.name === "AzureDevOpsHttpError" &&
					result.reason.status === 503,
			),
		).toBe(true);
		expect(fixture.files()).toHaveLength(1);
		await expect(
			fixture.client.getThreadCode(22, thread(), {
				signal: new AbortController().signal,
			}),
		).resolves.toMatchObject({ baseCommitId, sourceCommitId });
		expect(fixture.files()).toHaveLength(3);
	});

	test("cancels every waiter on a shared file read and does not poison the next batch", async () => {
		const started = Promise.withResolvers();
		let fileReads = 0;
		const fixture = setup({
			handler: (url, init) => {
				if (!url.pathname.endsWith("/items") || fileReads++ > 0)
					return undefined;
				started.resolve();
				return new Promise((_resolve, reject) => {
					init.signal.addEventListener(
						"abort",
						() => reject(init.signal.reason),
						{ once: true },
					);
				});
			},
		});
		const controller = new AbortController();
		const results = Promise.allSettled(
			Array.from({ length: 3 }, () =>
				fixture.client.getThreadCode(22, thread(), {
					signal: controller.signal,
				}),
			),
		);
		await started.promise;
		controller.abort();
		expect(
			(await results).every(
				(result) =>
					result.status === "rejected" && result.reason.name === "AbortError",
			),
		).toBe(true);
		expect(fixture.files()).toHaveLength(1);
		await expect(
			fixture.client.getThreadCode(22, thread(), {
				signal: new AbortController().signal,
			}),
		).resolves.toMatchObject({ baseCommitId, sourceCommitId });
	});

	test.each([
		{ first: 0, base: baseCommitId, compareTo: "0" },
		{ first: 3, base: baseCommitId, compareTo: "0" },
		{ first: 1, base: earlierCommitId, compareTo: "1" },
		{ first: 5, base: newerCommitId, compareTo: "5" },
	])(
		"uses exact historical commits with first iteration $first",
		async ({ first, base, compareTo }) => {
			const fixture = setup();
			expect(fixture.fetch).not.toHaveBeenCalled();
			const result = await fixture.client.getThreadCode(22, thread({ first }));
			expect(result).toEqual({
				path: "/file.txt",
				originalPath: null,
				baseCommitId: base,
				sourceCommitId,
				iterationId: 3,
				rows: [
					{ kind: "context", text: "one", originalLine: 1, modifiedLine: 1 },
					{ kind: "delete", text: "old", originalLine: 2, modifiedLine: null },
					{ kind: "add", text: "new", originalLine: null, modifiedLine: 2 },
					{ kind: "context", text: "three", originalLine: 3, modifiedLine: 3 },
					{ kind: "context", text: "four", originalLine: 4, modifiedLine: 4 },
					{ kind: "context", text: "five", originalLine: 5, modifiedLine: 5 },
				],
				truncated: false,
			});
			expect(fixture.files()).toEqual([
				{ path: "/file.txt", commit: base, versionType: "commit" },
				{ path: "/file.txt", commit: sourceCommitId, versionType: "commit" },
			]);
			const requests = fixture.requests();
			expect(requests).toHaveLength(4);
			expect(requests[1].searchParams.get("$compareTo")).toBe(compareTo);
			expect(
				requests.every((url) => url.origin === "https://dev.azure.com"),
			).toBe(true);
			expect(Object.isFrozen(result)).toBe(true);
			expect(Object.isFrozen(result.rows)).toBe(true);
			expect(result.rows.every(Object.isFrozen)).toBe(true);
			expect(fixture.authentication.getAccessToken).toHaveBeenCalledWith({
				accountId: repository.accountId,
				resource: "azure-devops",
			});
		},
	);

	test("uses current positions and tracking iterations when tracking first is positive", async () => {
		const fixture = setup();
		const result = await fixture.client.getThreadCode(
			22,
			thread({
				first: 0,
				second: 1,
				prContext: {
					trackingCriteria: {
						firstComparingIteration: 1,
						secondComparingIteration: 3,
						origFilePath: "/obsolete.txt",
						origRightFileStart: position(999),
						origRightFileEnd: position(1000),
					},
				},
			}),
		);
		expect(result.baseCommitId).toBe(earlierCommitId);
		expect(result.rows).toContainEqual({
			kind: "add",
			text: "new",
			originalLine: null,
			modifiedLine: 2,
		});
		expect(fixture.requests()[1].searchParams.get("$compareTo")).toBe("1");
	});

	test("uses original positions/path and original iteration context when tracking first is zero", async () => {
		const fixture = setup();
		const result = await fixture.client.getThreadCode(
			22,
			thread({
				context: { filePath: "/current.txt", ...range("right", 999) },
				prContext: {
					trackingCriteria: {
						firstComparingIteration: 0,
						secondComparingIteration: 5,
						origFilePath: "/file.txt",
						origRightFileStart: position(2),
						origRightFileEnd: position(2),
					},
				},
			}),
		);
		expect(result.iterationId).toBe(3);
		expect(result.path).toBe("/file.txt");
		expect(result.rows.some((row) => row.modifiedLine === 2)).toBe(true);
	});

	test.each(["/before.txt", "/after.txt"])(
		"maps a rename's original path with thread path %s",
		async (path) => {
			const fixture = setup({
				change: entry({
					changeType: "rename, edit",
					item: { path: "/after.txt" },
					originalPath: "/before.txt",
				}),
			});
			const result = await fixture.client.getThreadCode(
				22,
				thread({ context: { filePath: path } }),
			);
			expect(result.originalPath).toBe("/before.txt");
			expect(result.path).toBe("/after.txt");
			expect(fixture.files().map((file) => file.path)).toEqual([
				"/before.txt",
				"/after.txt",
			]);
		},
	);

	test.each(["add", "delete"])(
		"does not read the absent side of %s files",
		async (type) => {
			const fixture = setup({ change: entry({ changeType: type }) });
			const context =
				type === "delete"
					? {
							rightFileStart: undefined,
							rightFileEnd: undefined,
							...range("left", 2),
						}
					: {};
			const result = await fixture.client.getThreadCode(
				22,
				thread({ context }),
			);
			expect(fixture.files()).toEqual([
				{
					path: "/file.txt",
					commit: type === "add" ? sourceCommitId : baseCommitId,
					versionType: "commit",
				},
			]);
			expect(result.rows.every((row) => row.kind === type)).toBe(true);
			expect(
				result.rows.some(
					(row) => row[type === "add" ? "modifiedLine" : "originalLine"] === 2,
				),
			).toBe(true);
		},
	);

	test.each([true, false])(
		"loads code when a deleted file has no current path (selected: %s)",
		async (selected) => {
			const fixture = setup({
				handler: (url) =>
					url.pathname.endsWith("/changes")
						? {
								changeEntries: [
									entry({
										changeTrackingId: selected ? 9 : 10,
										changeType: "delete",
										item: { path: null },
										originalPath: "/deleted.txt",
									}),
									...(selected ? [] : [entry()]),
								],
							}
						: undefined,
			});
			const result = await fixture.client.getThreadCode(
				22,
				thread({
					context: selected
						? {
								filePath: "/deleted.txt",
								rightFileStart: undefined,
								rightFileEnd: undefined,
								...range("left", 2),
							}
						: {},
				}),
			);
			expect(result.path).toBe(selected ? "/deleted.txt" : "/file.txt");
			expect(result.rows).toContainEqual({
				kind: "delete",
				text: "old",
				originalLine: 2,
				modifiedLine: null,
			});
			expect(fixture.files()).toHaveLength(selected ? 1 : 2);
			expect(fixture.files()[0].commit).toBe(baseCommitId);
		},
	);

	test("preserves shifted coordinates and both disjoint ranges without unrelated middle lines", async () => {
		const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
		const fixture = setup({
			original: `${lines.join("\n")}\n`,
			modified: `inserted\n${lines.join("\n")}\n`,
		});
		const result = await fixture.client.getThreadCode(
			22,
			thread({
				context: { ...range("left", 10, 11), ...range("right", 50, 51) },
			}),
		);
		expect(result.rows).toHaveLength(16);
		expect(result.rows).toContainEqual({
			kind: "context",
			text: "line 10",
			originalLine: 10,
			modifiedLine: 11,
		});
		expect(result.rows).toContainEqual({
			kind: "context",
			text: "line 49",
			originalLine: 49,
			modifiedLine: 50,
		});
		expect(result.rows.some((row) => row.originalLine === 30)).toBe(false);
		expect(result.truncated).toBe(false);
	});

	test("supports original-only positions and unchanged files", async () => {
		const fixture = setup({ original: "one\ntwo\n", modified: "one\ntwo\n" });
		const result = await fixture.client.getThreadCode(
			22,
			thread({
				context: {
					rightFileStart: undefined,
					rightFileEnd: undefined,
					...range("left", 2),
				},
			}),
		);
		expect(result.rows).toEqual([
			{ kind: "context", text: "one", originalLine: 1, modifiedLine: 1 },
			{ kind: "context", text: "two", originalLine: 2, modifiedLine: 2 },
		]);
	});

	test("keeps the other side of a multiline replacement when a range ends inside it", async () => {
		const fixture = setup({
			original: "one\nold 1\nold 2\nold 3\nold 4\nold 5\nlast\n",
			modified: "one\nnew 1\nnew 2\nnew 3\nnew 4\nnew 5\nlast\n",
		});
		const result = await fixture.client.getThreadCode(
			22,
			thread({
				context: {
					rightFileStart: undefined,
					rightFileEnd: undefined,
					...range("left", 1, 6),
				},
			}),
		);
		expect(result.rows.filter((row) => row.kind === "add")).toHaveLength(5);
		expect(result.rows.at(-1)).toMatchObject({ text: "last", kind: "context" });
		expect(result.truncated).toBe(false);
	});

	test("keeps a selected line visible when an oversized replacement requires truncation", async () => {
		const fixture = setup({
			original: `${Array.from({ length: 100 }, (_, i) => `old ${i}`).join("\n")}\n`,
			modified: `${Array.from({ length: 100 }, (_, i) => `new ${i}`).join("\n")}\n`,
		});
		const result = await fixture.client.getThreadCode(
			22,
			thread({ context: range("right", 99) }),
		);
		expect(result.rows).toHaveLength(40);
		expect(result.rows).toContainEqual({
			kind: "add",
			text: "new 98",
			originalLine: null,
			modifiedLine: 99,
		});
		expect(result.truncated).toBe(true);
	});

	test("loads paginated iteration and file mappings without choosing the first unrelated file", async () => {
		const fixture = setup({
			handler: (url) => {
				if (url.pathname.endsWith("/iterations")) {
					return url.searchParams.has("continuationToken")
						? { value: [iteration(3)] }
						: Response.json(
								{ value: [iteration(1, earlierCommitId)] },
								{ headers: { "x-ms-continuationtoken": "next" } },
							);
				}
				if (url.pathname.endsWith("/changes")) {
					return url.searchParams.get("$skip") === "0"
						? {
								changeEntries: [entry({ changeTrackingId: 8 })],
								nextSkip: 1,
								nextTop: 100,
							}
						: { changeEntries: [entry()], nextSkip: 0, nextTop: 0 };
				}
			},
		});
		expect(
			(await fixture.client.getThreadCode(22, thread({ first: 1 })))
				.baseCommitId,
		).toBe(earlierCommitId);
		expect(
			fixture.requests().filter((url) => url.pathname.endsWith("/changes")),
		).toHaveLength(2);
	});

	test.each([
		["general thread", { threadContext: undefined }],
		["file-level thread", { threadContext: { filePath: "/file.txt" } }],
		[
			"missing comparison",
			{ pullRequestThreadContext: { changeTrackingId: 9 } },
		],
		[
			"missing tracking ID",
			{
				pullRequestThreadContext: {
					iterationContext: {
						firstComparingIteration: 0,
						secondComparingIteration: 3,
					},
				},
			},
		],
		[
			"no historical iteration",
			{
				pullRequestThreadContext: {
					changeTrackingId: 9,
					iterationContext: {
						firstComparingIteration: 0,
						secondComparingIteration: 0,
					},
				},
			},
		],
		[
			"partial range",
			{ threadContext: { filePath: "/file.txt", rightFileStart: position(2) } },
		],
		[
			"reversed range",
			{ threadContext: { filePath: "/file.txt", ...range("right", 3, 2) } },
		],
		[
			"invalid path",
			{ threadContext: { filePath: "file.txt", ...range("right", 2) } },
		],
	])(
		"rejects %s without fetching or inventing an anchor",
		async (_name, overrides) => {
			const fixture = setup();
			await expect(
				fixture.client.getThreadCode(22, {
					...thread(),
					anchor: {
						path: "/file.txt",
						side: "modified",
						startLine: 2,
						endLine: 2,
						iterationId: 3,
						changeTrackingId: 9,
					},
					...overrides,
				}),
			).rejects.toBeInstanceOf(AzureDevOpsContentError);
			expect(fixture.fetch).not.toHaveBeenCalled();
		},
	);

	test.each([
		["missing source iteration", { iterations: [iteration(5)] }],
		[
			"missing common commit",
			{ iterations: [{ ...iteration(3), commonRefCommit: undefined }] },
		],
		["invalid source commit", { iterations: [iteration(3, "main")] }],
		[
			"duplicate iteration",
			{ iterations: [iteration(3), iteration(3, newerCommitId)] },
		],
		["unmatched change ID", { change: entry({ changeTrackingId: 10 }) }],
		["mismatched path", { change: entry({ item: { path: "/other.txt" } }) }],
		[
			"rename missing original path",
			{ change: entry({ changeType: "rename" }) },
		],
		["unsupported type", { change: entry({ changeType: "branch" }) }],
		["inconsistent type", { change: entry({ changeType: "add, delete" }) }],
		[
			"unexpected original path",
			{ change: entry({ originalPath: "/other.txt" }) },
		],
	])("fails explicitly for %s without file fallback", async (_name, input) => {
		const fixture = setup(input);
		await expect(
			fixture.client.getThreadCode(22, thread()),
		).rejects.toBeInstanceOf(AzureDevOpsContentError);
		expect(fixture.files()).toEqual([]);
	});

	test("does not substitute a common commit for a missing earlier source revision", async () => {
		const fixture = setup({ iterations: [iteration(3)] });
		await expect(
			fixture.client.getThreadCode(22, thread({ first: 1 })),
		).rejects.toMatchObject({ code: "thread-code-unavailable" });
		expect(fixture.files()).toEqual([]);
	});

	test.each([
		{ changeEntries: [entry(), entry()] },
		{ changeEntries: [entry()], nextSkip: 1, nextTop: 0 },
		{ changeEntries: [entry()], nextSkip: 0, nextTop: 100 },
	])("rejects ambiguous mappings and invalid pagination %j", async (page) => {
		const fixture = setup({
			handler: (url) => (url.pathname.endsWith("/changes") ? page : undefined),
		});
		await expect(
			fixture.client.getThreadCode(22, thread()),
		).rejects.toBeInstanceOf(AzureDevOpsContentError);
		expect(fixture.files()).toEqual([]);
	});

	test("rejects anchors against empty files instead of fabricating a snippet", async () => {
		const fixture = setup({ original: "", modified: "" });
		await expect(
			fixture.client.getThreadCode(22, thread()),
		).rejects.toMatchObject({ code: "thread-code-unavailable" });
	});

	test.each(["add", "delete"])(
		"rejects a selected range on the absent side of %s",
		async (type) => {
			const fixture = setup({ change: entry({ changeType: type }) });
			await expect(
				fixture.client.getThreadCode(
					22,
					thread({ context: { ...range("left", 2) } }),
				),
			).rejects.toBeInstanceOf(AzureDevOpsContentError);
			expect(fixture.files()).toEqual([]);
		},
	);

	test.each([404, 403, 500])(
		"preserves safe HTTP %s errors without revision fallbacks",
		async (status) => {
			const fixture = setup({
				handler: (url) =>
					url.pathname.endsWith("/items")
						? new Response("private-token", { status })
						: undefined,
			});
			await expect(
				fixture.client.getThreadCode(22, thread()),
			).rejects.toMatchObject({
				name: "AzureDevOpsHttpError",
				status,
				message: `Azure DevOps PR request failed (HTTP ${status}).`,
			});
			expect(fixture.files()).toHaveLength(1);
		},
	);

	test.each([
		{ contentMetadata: { isBinary: true } },
		{ path: "/other.txt" },
		{ commitId: newerCommitId },
		{ content: "a\0b" },
		{ gitObjectType: "tree" },
	])("rejects binary or mismatched file data %j", async (overrides) => {
		const fixture = setup({
			handler: (url) =>
				url.pathname.endsWith("/items")
					? {
							path: url.searchParams.get("path"),
							commitId: url.searchParams.get("versionDescriptor.version"),
							gitObjectType: "blob",
							contentMetadata: { isBinary: false },
							content: "one\ntwo\n",
							...overrides,
						}
					: undefined,
		});
		await expect(
			fixture.client.getThreadCode(22, thread()),
		).rejects.toBeInstanceOf(AzureDevOpsContentError);
	});

	test.each([
		["selected start past EOF", { context: range("right", 100) }],
		["selected end past EOF", { context: range("right", 2, 100) }],
		["original past EOF", { context: range("left", 100) }],
	])(
		"fails for %s rather than returning nearby content",
		async (_name, options) => {
			const fixture = setup();
			await expect(
				fixture.client.getThreadCode(22, thread(options)),
			).rejects.toMatchObject({ code: "thread-code-unavailable" });
		},
	);

	test.each([
		["byte limit", "é".repeat(600_000)],
		["character limit", "x".repeat(1_000_001)],
		["line limit", "x\n".repeat(50_001)],
		[
			"edit limit",
			Array.from({ length: 2_100 }, (_, i) => `new ${i}\n`).join(""),
		],
	])("fails explicitly at the %s", async (_name, modified) => {
		const fixture = setup({ modified });
		await expect(
			fixture.client.getThreadCode(22, thread()),
		).rejects.toMatchObject({ code: "too-large" });
	});

	test("bounds rows and text and reports truncation instead of silently losing selected content", async () => {
		const content = Array.from(
			{ length: 100 },
			(_, i) => `${i + 1} ${"x".repeat(1_500)}`,
		).join("\n");
		const fixture = setup({ original: content, modified: content });
		const result = await fixture.client.getThreadCode(
			22,
			thread({ context: range("right", 10, 90) }),
		);
		expect(result.rows).toHaveLength(40);
		expect(result.rows.every((row) => row.text.length <= 1_000)).toBe(true);
		expect(result.truncated).toBe(true);
	});

	test("marks a clipped long line as truncated even when the row count fits", async () => {
		const content = `one\n${"x".repeat(1_001)}\n`;
		const fixture = setup({ original: content, modified: content });
		const result = await fixture.client.getThreadCode(22, thread());
		expect(result.rows).toHaveLength(2);
		expect(result.rows[1].text).toHaveLength(1_000);
		expect(result.truncated).toBe(true);
	});

	test("never borrows a response repository or URL for fork content", async () => {
		const fixture = setup({
			iterations: [
				{
					...iteration(3),
					sourceRefCommit: {
						commitId: sourceCommitId,
						repository: { id: "different-repository" },
						url: "https://untrusted.example/commit",
					},
				},
			],
			change: entry({
				item: {
					path: "/file.txt",
					repository: { id: "different-repository" },
					url: "https://untrusted.example/item",
				},
			}),
		});
		await fixture.client.getThreadCode(22, thread());
		expect(
			fixture.requests().every((url) => url.pathname.startsWith(apiPath)),
		).toBe(true);
	});

	test("sanitizes network and malformed JSON failures", async () => {
		for (const fail of [
			() => {
				throw new Error("private-token");
			},
			() => new Response("private-token"),
		]) {
			const fixture = setup({ handler: fail });
			await expect(
				fixture.client.getThreadCode(22, thread()),
			).rejects.toMatchObject({
				name: "AzureDevOpsContentError",
				code: "request-failed",
				message: "Azure DevOps PR content request failed.",
			});
		}
	});

	test("cancels while waiting on shared token loading without requesting files", async () => {
		const fixture = setup();
		const started = Promise.withResolvers();
		fixture.authentication.getAccessToken.mockImplementation(() => {
			started.resolve();
			return new Promise(() => {});
		});
		const controller = new AbortController();
		const pending = fixture.client.getThreadCode(22, thread(), {
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await started.promise;
		controller.abort();
		await rejected;
		expect(fixture.fetch).not.toHaveBeenCalled();
	});

	test("an already cancelled call never loads content", async () => {
		const fixture = setup();
		const controller = new AbortController();
		controller.abort("private-token");
		await expect(
			fixture.client.getThreadCode(22, thread(), { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fixture.authentication.getAccessToken).not.toHaveBeenCalled();
		expect(fixture.fetch).not.toHaveBeenCalled();
	});

	test("cancels an in-flight file read rather than returning a fallback", async () => {
		const started = Promise.withResolvers();
		const fixture = setup({
			handler: (url, init) => {
				if (!url.pathname.endsWith("/items")) return undefined;
				started.resolve();
				return new Promise((_resolve, reject) => {
					init.signal.addEventListener(
						"abort",
						() => reject(init.signal.reason),
						{ once: true },
					);
				});
			},
		});
		const controller = new AbortController();
		const pending = fixture.client.getThreadCode(22, thread(), {
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await started.promise;
		controller.abort();
		await rejected;
		expect(fixture.files()).toHaveLength(1);
	});
});
