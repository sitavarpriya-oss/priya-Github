// @vitest-environment node
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createPullRequestUi } from "./pr-ui.mjs";
import { resolveRepository } from "./pull-request-locator.mjs";
import {
	createPullRequestClient,
	isTemporaryReadError,
} from "./pull-requests.mjs";
import { createRepositoryPicker } from "./repository-picker.mjs";

test("creation contributes a normal coding turn with native final creation", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("./manifest.json", import.meta.url), "utf8"),
	);
	const action =
		manifest.activations[0].contributes.forgeProviders[0].prUiActions[0];
	expect(action.name).toBe("create");
	expect(action).not.toHaveProperty("creationPrompt");
	const { creationPrompt } = await createPullRequestUi().read(
		{
			originUrl: "https://dev.azure.com/org/project/_git/repo",
			...createInput,
		},
		{ authenticated: false },
	);
	for (const instruction of [
		/call `create_pull_request` after the current session's branch is ready/i,
		/requested draft value/i,
		/workspace-selected target/i,
	]) {
		expect(creationPrompt).toMatch(instruction);
	}
	expect(creationPrompt).not.toContain("create_extension_pull_request");
	expect(creationPrompt).not.toContain("creation_request");
	expect(creationPrompt.trim()).not.toBe("");
	expect(creationPrompt).toContain(
		"If the commit fails, stop and explain the blocker; do not push or create a PR.",
	);
	expect(creationPrompt).toContain(
		"verify that `origin` has local HEAD at the source branch's full ref",
	);
	expect(creationPrompt).toContain(
		"even when has_unpushed_commits is false or the branch tracks another remote",
	);
	expect(creationPrompt).toContain("git push origin HEAD:<sourceRef>");
	expect(creationPrompt).not.toContain(
		"push the branch to its upstream remote",
	);
	expect(creationPrompt).not.toContain("a writable target remote");
	expect(creationPrompt).toContain("## Writing a great PR description");
	expect(creationPrompt).toContain(
		".azuredevops/pull_request_template/branches",
	);
	expect(creationPrompt).toContain(
		"do not use `az repos pr create`, HTTP, or another creation route on tool failure",
	);
});

const repository = {
	organization: "fabrikam",
	project: "Project & tools",
	repositoryId: "3411ebc1-d5aa-464f-9615-0b527bc66719",
	accountId: "repository-account",
};
const sourceCommitId = "b60280bc6e62e2f880f1b63c1e24987664d3bda3";
const apiUrl =
	"https://dev.azure.com/fabrikam/Project%20%26%20tools/_apis/git/repositories/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequests";
const createInput = {
	title: "Add the feature",
	description: "Feature details",
	sourceRef: "refs/heads/feature",
	targetRef: "refs/heads/main",
};
const createContext = {
	originUrl: "https://dev.azure.com/fabrikam/Tools/_git/widgets",
	sourceRef: "refs/heads/feature/widget",
	targetRef: "refs/heads/main",
	title: "Add the widget",
	description: "Generated widget description",
};

function response(overrides = {}) {
	return {
		pullRequestId: 22,
		repository: { id: repository.repositoryId },
		title: createInput.title,
		description: createInput.description,
		status: "active",
		isDraft: false,
		sourceRefName: createInput.sourceRef,
		targetRefName: createInput.targetRef,
		lastMergeSourceCommit: { commitId: sourceCommitId },
		mergeStatus: "succeeded",
		...overrides,
	};
}

function setup(data = response(), binding = repository) {
	const authentication = {
		getAccessToken: vi.fn().mockResolvedValue({ accessToken: "test-token" }),
	};
	const fetch = vi.fn().mockImplementation(async () => Response.json(data));
	const client = createPullRequestClient({
		repository: binding,
		authentication,
		fetch,
	});
	return { client, authentication, fetch };
}

describe("associated PR reads have no demo bypass", () => {
	const context = {
		...createContext,
		originUrl: "https://dev.azure.com/mseng/Personal/_git/merlynop-skills",
		associatedUri:
			"https://dev.azure.com/mseng/Personal/_git/merlynop-skills/pullrequest/42",
	};

	test("requires authentication even for the former demo PR", async () => {
		const authenticatedFetch = vi.fn();
		const state = await createPullRequestUi(authenticatedFetch).read(context, {
			authenticated: false,
		});
		expect(state).toEqual({
			status: "unavailable",
			error:
				"Sign in with the repository account to refresh this pull request.",
			contributions: [],
		});
		expect(authenticatedFetch).not.toHaveBeenCalled();
	});

	test("propagates the real lookup failure instead of inventing an open PR", async () => {
		const authenticatedFetch = vi.fn(async ({ url }) =>
			url.includes("/pullrequests/")
				? new Response(null, { status: 404 })
				: Response.json({
						id: repository.repositoryId,
						name: "merlynop-skills",
					}),
		);
		const { authentication } = stubOperationFetch(authenticatedFetch);
		await expect(
			createPullRequestUi(authentication).read(context),
		).rejects.toThrow();
		expect(authenticatedFetch).toHaveBeenCalledTimes(2);
		expect(authenticatedFetch.mock.calls[1][0]).toMatchObject({
			url: `https://dev.azure.com/mseng/Personal/_apis/git/repositories/${repository.repositoryId}/pullrequests/42?api-version=7.1`,
			init: expect.objectContaining({ method: "GET" }),
		});
	});

	test("reads the real closed state without advertising review decisions", async () => {
		const authenticatedFetch = vi.fn(async ({ url }) =>
			url.includes("/pullrequests/")
				? Response.json(response({ pullRequestId: 42, status: "abandoned" }))
				: Response.json({
						id: repository.repositoryId,
						name: "merlynop-skills",
					}),
		);
		const { authentication } = stubOperationFetch(authenticatedFetch);
		const ui = createPullRequestUi(authentication);
		const state = await ui.read(context);
		expect(state.status).toBe("ready");
		expect(state.contributions[0]).toMatchObject({
			kind: "badge",
			number: 42,
			state: "closed",
		});
		expect(state.review).toBeUndefined();
		expect(ui.actions.map((action) => action.name)).toEqual([
			"create",
			"submit-review",
			"set-draft",
			"complete",
		]);
		expect(authenticatedFetch).toHaveBeenCalledTimes(2);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * PR UI uses the global fetch with an operation-scoped token, so route it to a
 * handler that sees only package-visible request fields.
 */
function stubOperationFetch(handler) {
	const authentication = {
		getAccessToken: vi.fn(async (input) => {
			expect(input).toEqual({ resource: "azure-devops" });
			return { accessToken: "test-token" };
		}),
	};
	const fetch = vi.fn(async (input, { headers, ...init }) => {
		const { Authorization, ...visibleHeaders } = headers;
		expect(Authorization).toBe(`Bearer ${"test-token"}`);
		expect(init.redirect).toBe("error");
		expect(headers["User-Agent"]).toBe("ADOGithubApp");
		return handler({
			url: String(input),
			init: { ...init, headers: visibleHeaders },
		});
	});
	vi.stubGlobal("fetch", fetch);
	return { authentication, fetch };
}

test.each([false, true])(
	"creates the requested draft state through the existing PR client",
	async (draft) => {
		const requests = [];
		const { authentication } = stubOperationFetch(async ({ url, init }) => {
			requests.push({
				origin: new URL(url).origin,
				url,
				method: init.method,
				body: init.body ? JSON.parse(init.body) : undefined,
			});
			if (init.method === "GET") {
				return Response.json({
					id: "3411ebc1-d5aa-464f-9615-0b527bc66719",
					name: "widgets",
				});
			}
			return Response.json({
				pullRequestId: 42,
				repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719" },
				title: createContext.title,
				description: createContext.description,
				sourceRefName: createContext.sourceRef,
				targetRefName: createContext.targetRef,
				isDraft: draft,
				status: "active",
				mergeStatus: "notSet",
			});
		});

		await expect(
			createPullRequestUi(authentication).actions[0].handler(
				{ draft },
				createContext,
			),
		).resolves.toEqual({
			status: "ready",
			error: null,
			review: {
				actionId: "submit-review",
				defaultOptionId: "comment",
				options: [
					{
						id: "comment",
						label: "Comment",
						description: "Publish comments without changing your vote",
					},
					{
						id: "approve",
						label: "Approve",
						description: "Approve this pull request",
					},
					{
						id: "approve-with-suggestions",
						label: "Approve with suggestions",
						description: "Approve with suggestions for the author",
					},
					{
						id: "wait-for-author",
						label: "Wait for author",
						description: "Ask the author to make changes",
					},
					{
						id: "reject",
						label: "Reject",
						description: "Reject this pull request",
					},
				].filter((option) => !draft || option.id === "comment"),
			},
			contributions: [
				{
					kind: "badge",
					slot: "pr.status",
					id: "pull-request",
					number: 42,
					state: draft ? "draft" : "open",
					url: "https://dev.azure.com/fabrikam/Tools/_git/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequest/42",
				},
				{
					kind: "button",
					slot: draft ? "pr.publish" : "pr.mark-draft",
					id: draft ? "publish" : "mark-draft",
					label: draft ? "Publish" : "Mark as draft",
					action: { actionId: "set-draft", input: { draft: !draft } },
				},
			],
		});
		expect(requests).toHaveLength(2);
		expect(authentication.getAccessToken).toHaveBeenCalledTimes(2);
		expect(requests[0]).toMatchObject({
			origin: "https://dev.azure.com",
			method: "GET",
			body: undefined,
		});
		expect(requests[1]).toMatchObject({
			origin: "https://dev.azure.com",
			method: "POST",
			body: {
				title: createContext.title,
				description: createContext.description,
				sourceRefName: createContext.sourceRef,
				targetRefName: createContext.targetRef,
				isDraft: draft,
			},
		});
	},
);

test.each([
	"https://example.com/fabrikam/Tools/_git/widgets",
	"https://fabrikam.visualstudio.com/Tools/_git/widgets",
	"https://dev.azure.com/fabrikam/Tools/_git/widgets/extra",
	"https://user@dev.azure.com/fabrikam/Tools/_git/widgets",
])("rejects unsupported repository origin %s", async (originUrl) => {
	const { authentication, fetch } = stubOperationFetch(vi.fn());
	await expect(
		createPullRequestUi(authentication).actions[0].handler(
			{ draft: false },
			{ ...createContext, originUrl },
		),
	).rejects.toThrow("Unsupported Azure DevOps repository origin");
	expect(authentication.getAccessToken).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});

describe("Azure DevOps pull request client", () => {
	describe("pre-write authorization", () => {
		function setupWrite(
			beforeWrite,
			handler = async () => Response.json(response()),
		) {
			const fetch = vi.fn(handler);
			const authentication = {
				getAccessToken: vi.fn(async () => ({ accessToken: "test-token" })),
			};
			const markMutationDispatched = vi.fn();
			const client = createPullRequestClient({
				repository,
				authentication,
				fetch,
				beforeWrite,
				markMutationDispatched,
			});
			return { client, fetch, authentication, markMutationDispatched };
		}

		test.each([new Error("Write denied"), "Write denied"])(
			"preserves authorization failure without dispatch: %s",
			async (denial) => {
				const writes = [
					(client) => client.create(createInput),
					(client) => client.update(22, { title: "Updated" }),
					(client) => client.vote(22, repository.repositoryId, 5),
					(client) => client.setReviewer(22, repository.repositoryId, null),
				];
				for (const write of writes) {
					const beforeWrite = vi.fn(async () => {
						throw denial;
					});
					const { client, fetch, markMutationDispatched } =
						setupWrite(beforeWrite);
					await expect(write(client)).rejects.toBe(denial);
					expect(beforeWrite).toHaveBeenCalledOnce();
					expect(fetch).not.toHaveBeenCalled();
					expect(markMutationDispatched).not.toHaveBeenCalled();
				}
			},
		);

		test.each(["cancel", "timeout"])(
			"allows reads during pending authorization and prevents late writes after %s",
			async (ending) => {
				const pending = Promise.withResolvers();
				const entered = Promise.withResolvers();
				const controller = new AbortController();
				const timeout = new AbortController();
				const timeoutSpy = vi
					.spyOn(AbortSignal, "timeout")
					.mockReturnValue(timeout.signal);
				const beforeWrite = vi.fn(async () => {
					entered.resolve();
					await pending.promise;
				});
				const { client, fetch, markMutationDispatched } =
					setupWrite(beforeWrite);
				try {
					const result = client.create(createInput, {
						signal: controller.signal,
					});
					const reason = new DOMException(
						"Stopped",
						ending === "cancel" ? "AbortError" : "TimeoutError",
					);
					const rejection = expect(result).rejects.toBe(reason);
					await entered.promise;
					await expect(client.get(22)).resolves.toMatchObject({ id: 22 });
					await expect(client.get(22)).resolves.toMatchObject({ id: 22 });
					(ending === "cancel" ? controller : timeout).abort(reason);
					await rejection;
					pending.resolve();
					await setImmediate();
					expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual([
						"GET",
						"GET",
					]);
					expect(beforeWrite).toHaveBeenCalledOnce();
					expect(markMutationDispatched).not.toHaveBeenCalled();
					expect(timeoutSpy).toHaveBeenCalledWith(30_000);
				} finally {
					pending.resolve();
					timeoutSpy.mockRestore();
				}
			},
		);

		test("awaits permission before transport and marks dispatch separately", async () => {
			const order = [];
			const pending = Promise.withResolvers();
			const entered = Promise.withResolvers();
			const { client, fetch, authentication, markMutationDispatched } =
				setupWrite(
					async () => {
						order.push("authorize");
						entered.resolve();
						await pending.promise;
					},
					async () => {
						order.push("transport");
						return Response.json(response());
					},
				);
			markMutationDispatched.mockImplementation(() => order.push("dispatched"));
			const result = client.create(createInput);
			await entered.promise;
			const callsWhilePending = fetch.mock.calls.length;
			pending.resolve();
			await result;
			expect(callsWhilePending).toBe(0);
			// Without native dispatch evidence, invoking fetch is the dispatch boundary.
			expect(order).toEqual(["authorize", "dispatched", "transport"]);
			expect(markMutationDispatched).toHaveBeenCalledOnce();
			expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
				accountId: repository.accountId,
				resource: "azure-devops",
			});
			expect(fetch).toHaveBeenCalledExactlyOnceWith(
				`${apiUrl}?api-version=7.1`,
				expect.objectContaining({ method: "POST", redirect: "error" }),
			);
		});
	});

	test.each([
		["success", false, 1],
		["transport error", false, 1],
		["token denied", false, 0],
		["success", true, 1],
		["transport error", true, 1],
		["token denied", true, 0],
	])(
		"marks %s with cancellation=%s only once fetch is invoked",
		async (outcome, cancel, marks) => {
			const controller = new AbortController();
			const cancellation = new DOMException("Stopped", "AbortError");
			const failure =
				outcome === "token denied"
					? Object.assign(new Error("Authentication denied"), {
							code: "denied",
						})
					: new TypeError("Connection lost");
			const markMutationDispatched = vi.fn();
			const beforeWrite = vi.fn(async () => {});
			const authentication = {
				getAccessToken: vi.fn(async () => {
					if (outcome !== "token denied") return { accessToken: "test-token" };
					if (cancel) controller.abort(cancellation);
					throw failure;
				}),
			};
			const fetch = vi.fn(async () => {
				if (cancel) controller.abort(cancellation);
				if (outcome !== "success") throw failure;
				return Response.json(response());
			});
			const client = createPullRequestClient({
				repository,
				authentication,
				fetch,
				beforeWrite,
				markMutationDispatched,
			});
			const result = client.create(createInput, { signal: controller.signal });
			if (cancel) await expect(result).rejects.toBe(cancellation);
			else if (outcome === "success")
				await expect(result).resolves.toMatchObject({ id: 22 });
			else await expect(result).rejects.toBe(failure);
			const dispatched = outcome !== "token denied";
			expect(beforeWrite).toHaveBeenCalledTimes(dispatched ? 1 : 0);
			expect(fetch).toHaveBeenCalledTimes(dispatched ? 1 : 0);
			expect(markMutationDispatched).toHaveBeenCalledTimes(marks);
		},
	);

	test("requests the host-scoped operation account when the binding omits one", async () => {
		const { accountId: _accountId, ...hostScoped } = repository;
		const { client, authentication, fetch } = setup(response(), hostScoped);

		await client.get(22);

		expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
			resource: "azure-devops",
		});
		expect(fetch).toHaveBeenCalledOnce();
	});

	test("surfaces denied authentication without a request or token in the error", async () => {
		const { client, authentication, fetch } = setup();
		const denied = Object.assign(new Error("Authentication denied"), {
			code: "denied",
		});
		authentication.getAccessToken.mockRejectedValue(denied);

		await expect(client.get(22)).rejects.toBe(denied);
		await expect(client.create(createInput)).rejects.toBe(denied);
		expect(fetch).not.toHaveBeenCalled();
		expect(isTemporaryReadError(denied)).toBe(false);
	});

	test.each(["timeout", "busy"])(
		"treats a %s token failure as a temporary read error",
		(code) => {
			expect(
				isTemporaryReadError(
					Object.assign(new Error(`Authentication ${code}`), { code }),
				),
			).toBe(true);
		},
	);

	test("requests profile photos with the bearer token only from Azure DevOps", async () => {
		const { client, authentication, fetch } = setup();
		fetch.mockImplementation(
			async () =>
				new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
					headers: { "content-type": "image/png" },
				}),
		);
		const avatar =
			"https://dev.azure.com/fabrikam/_apis/GraphProfile/MemberAvatars/aad.descriptor";

		await expect(
			client.getAvatar("https://evil.example/fabrikam/_apis/x"),
		).rejects.toThrow("Profile photo URL is not allowed.");
		expect(authentication.getAccessToken).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();

		const data = await client.getAvatar(avatar);
		expect(JSON.stringify(data)).not.toContain("test-token");
		const [[url, init]] = fetch.mock.calls;
		expect(url).toBe(avatar);
		expect(init).toMatchObject({
			method: "GET",
			redirect: "error",
			headers: { Accept: "image/png,image/jpeg,image/gif,image/webp" },
		});
		expect(init).not.toHaveProperty("responseType");
	});

	test("checks write authorization after token acquisition and immediately before transport", async () => {
		const order = [];
		const authentication = {
			getAccessToken: vi.fn(async () => {
				order.push("token");
				return { accessToken: "test-token" };
			}),
		};
		const beforeWrite = vi.fn(async () => {
			order.push("authorize");
		});
		const nativeFetch = vi.fn(async () => {
			order.push("fetch");
			return Response.json(response());
		});
		vi.stubGlobal("fetch", nativeFetch);
		try {
			const client = createPullRequestClient({
				repository,
				authentication,
				beforeWrite,
			});

			await client.create(createInput);
		} finally {
			vi.unstubAllGlobals();
		}

		expect(order).toEqual(["token", "authorize", "fetch"]);
		expect(beforeWrite).toHaveBeenCalledOnce();
	});

	test("uses the selected native account for process-owned requests", async () => {
		const authentication = {
			getAccessToken: vi.fn().mockResolvedValue({ accessToken: "test-token" }),
		};
		const nativeFetch = vi.fn().mockResolvedValue(Response.json(response()));
		vi.stubGlobal("fetch", nativeFetch);
		try {
			const client = createPullRequestClient({
				repository,
				authentication,
			});

			await client.get(22);
		} finally {
			vi.unstubAllGlobals();
		}

		expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
			accountId: repository.accountId,
			resource: "azure-devops",
		});
		expect(nativeFetch).toHaveBeenCalledExactlyOnceWith(
			`${apiUrl}/22?api-version=7.1`,
			expect.objectContaining({
				method: "GET",
				redirect: "error",
				headers: {
					Accept: "application/json",
					"User-Agent": "ADOGithubApp",
					Authorization: "Bearer test-token",
				},
			}),
		);
	});

	test("defers unavailable authentication until the first request", async () => {
		const fetch = vi.fn();
		const client = createPullRequestClient({ repository, fetch });

		await expect(client.get(22)).rejects.toThrow(
			"Azure DevOps pull request authentication is unavailable.",
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([false, true])("creates a PR with draft=%s", async (draft) => {
		const { client, authentication, fetch } = setup(
			response({ isDraft: draft }),
		);

		const pr = await client.create({ ...createInput, draft });

		expect(authentication.getAccessToken).toHaveBeenCalledExactlyOnceWith({
			accountId: repository.accountId,
			resource: "azure-devops",
		});
		expect(fetch).toHaveBeenCalledExactlyOnceWith(
			`${apiUrl}?api-version=7.1`,
			expect.objectContaining({
				method: "POST",
				redirect: "error",
				headers: {
					Accept: "application/json",
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
					"User-Agent": "ADOGithubApp",
				},
				body: JSON.stringify({
					title: createInput.title,
					description: createInput.description,
					sourceRefName: createInput.sourceRef,
					targetRefName: createInput.targetRef,
					isDraft: draft,
				}),
			}),
		);
		expect(pr).toEqual({
			id: 22,
			repositoryId: repository.repositoryId,
			title: createInput.title,
			description: createInput.description,
			state: draft ? "draft" : "open",
			sourceRef: createInput.sourceRef,
			targetRef: createInput.targetRef,
			sourceCommitId,
			mergeStatus: "succeeded",
			url: "https://dev.azure.com/fabrikam/Project%20%26%20tools/_git/3411ebc1-d5aa-464f-9615-0b527bc66719/pullrequest/22",
		});
		expect(JSON.stringify(pr)).not.toContain("test-token");
	});

	test("uses normal creation and an empty description when omitted", async () => {
		const { client, fetch } = setup();
		const { description: _description, ...input } = createInput;

		await client.create(input);

		expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
			description: "",
			isDraft: false,
		});
	});

	test("blocks embedded frames in the trusted repository picker", async () => {
		const picker = createRepositoryPicker(() => undefined);

		try {
			const { url } = await picker.open({
				instanceId: "00000000-0000-0000-0000-000000000001",
			});
			const response = await fetch(url);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-security-policy")).toContain(
				"frame-src 'none'",
			);
		} finally {
			await picker.dispose();
		}
	});

	test.each([
		["active", false, "succeeded", "open"],
		["active", true, "succeeded", "draft"],
		["active", false, "queued", "open"],
		["active", false, "conflicts", "open"],
		["active", false, "rejectedByPolicy", "open"],
		["completed", false, "succeeded", "merged"],
		["completed", true, "succeeded", "merged"],
		["abandoned", false, "notSet", "closed"],
		["abandoned", true, "notSet", "closed"],
	])(
		"maps %s / draft=%s / merge=%s to %s",
		async (status, isDraft, mergeStatus, state) => {
			const { client, fetch } = setup(
				response({ status, isDraft, mergeStatus }),
			);

			expect(await client.get(22)).toMatchObject({ state, mergeStatus });
			expect(fetch).toHaveBeenCalledWith(
				`${apiUrl}/22?api-version=7.1`,
				expect.objectContaining({ method: "GET", body: undefined }),
			);
		},
	);

	test("handles optional fields without inventing a source commit", async () => {
		const { client } = setup(
			response({
				description: undefined,
				isDraft: undefined,
				lastMergeSourceCommit: undefined,
				mergeStatus: undefined,
			}),
		);

		expect(await client.get(22)).toMatchObject({
			state: "open",
			description: null,
			sourceCommitId: null,
			mergeStatus: null,
		});
	});

	test.each([
		["squash", undefined],
		["squash", null],
		["squash", ""],
		["squash", "Fix the current behavior.\n\nKeep existing settings."],
		["noFastForward", undefined],
		["rebase", undefined],
		["rebaseMerge", undefined],
	])(
		"requests completion with strategy %s, description %s, and source commit",
		async (mergeStrategy, description) => {
			const { client, fetch } = setup(response({ status: "completed" }));

			expect(
				await client.complete(22, {
					sourceCommitId,
					mergeStrategy,
					title: "PR title",
					description,
				}),
			).toMatchObject({
				state: "merged",
			});
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith(
				`${apiUrl}/22?api-version=7.1`,
				expect.objectContaining({
					method: "PATCH",
					body: JSON.stringify({
						status: "completed",
						lastMergeSourceCommit: { commitId: sourceCommitId },
						completionOptions: {
							mergeStrategy,
							...(mergeStrategy === "squash"
								? {
										mergeCommitMessage: `Merged PR 22: PR title${description ? `\n\n${description}` : ""}`,
									}
								: {}),
							deleteSourceBranch: false,
							bypassPolicy: false,
							transitionWorkItems: false,
						},
					}),
				}),
			);
		},
	);

	test("forwards selected post-completion options and never forwards policy bypass", async () => {
		const { client, fetch } = setup(response({ status: "completed" }));

		await client.complete(22, {
			sourceCommitId,
			mergeStrategy: "squash",
			title: "PR title",
			deleteSourceBranch: true,
			bypassPolicy: true,
			transitionWorkItems: true,
		});

		expect(JSON.parse(fetch.mock.calls[0][1].body).completionOptions).toEqual({
			mergeStrategy: "squash",
			mergeCommitMessage: "Merged PR 22: PR title",
			deleteSourceBranch: true,
			bypassPolicy: false,
			transitionWorkItems: true,
		});
	});

	test("limits the squash merge commit message to 4,000 characters", async () => {
		const { client, fetch } = setup(response({ status: "completed" }));
		const description = "d".repeat(4000);

		await client.complete(22, {
			sourceCommitId,
			mergeStrategy: "squash",
			title: "PR title",
			description,
		});

		expect(
			JSON.parse(fetch.mock.calls[0][1].body).completionOptions
				.mergeCommitMessage,
		).toBe(`Merged PR 22: PR title\n\n${"d".repeat(3973)}...`);
	});

	test("does not split a surrogate pair when it limits the squash merge commit message", async () => {
		const { client, fetch } = setup(response({ status: "completed" }));

		await client.complete(22, {
			sourceCommitId,
			mergeStrategy: "squash",
			title: "PR title",
			description: `${"d".repeat(3972)}😀${"d".repeat(10)}`,
		});

		expect(
			JSON.parse(fetch.mock.calls[0][1].body).completionOptions
				.mergeCommitMessage,
		).toBe(`Merged PR 22: PR title\n\n${"d".repeat(3972)}...`);
	});

	test("does not report a queued completion as merged", async () => {
		const { client } = setup(
			response({ status: "active", mergeStatus: "queued" }),
		);

		expect(
			await client.complete(22, {
				sourceCommitId,
				mergeStrategy: "squash",
				title: "PR title",
			}),
		).toMatchObject({
			state: "open",
			mergeStatus: "queued",
		});
	});

	test("abandons the exact PR without sending completion options", async () => {
		const { client, fetch } = setup(response({ status: "abandoned" }));

		expect(await client.abandon(22)).toMatchObject({ state: "closed" });
		expect(fetch).toHaveBeenCalledWith(
			`${apiUrl}/22?api-version=7.1`,
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ status: "abandoned" }),
			}),
		);
	});

	test.each([400, 401, 403, 404, 409, 429, 500])(
		"reports HTTP %s without retrying a mutation or exposing the response body",
		async (status) => {
			const { client, fetch } = setup();
			fetch.mockResolvedValue(
				new Response("private server details: test-token", { status }),
			);

			await expect(client.create(createInput)).rejects.toMatchObject({
				name: "AzureDevOpsHttpError",
				status,
				message: `Azure DevOps PR request failed (HTTP ${status}).`,
			});
			expect(fetch).toHaveBeenCalledTimes(1);
		},
	);

	test("propagates network failures without retrying", async () => {
		const { client, fetch } = setup();
		const networkError = new TypeError("Connection lost");
		fetch.mockRejectedValueOnce(networkError);
		await expect(client.abandon(22)).rejects.toBe(networkError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test("releases the response stream on HTTP failure", async () => {
		const { client, fetch } = setup();
		const cancel = vi.fn();
		fetch.mockResolvedValueOnce(
			new Response(new ReadableStream({ cancel }), { status: 403 }),
		);

		await expect(client.get(22)).rejects.toMatchObject({ status: 403 });
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	test("bounds unbounded reads at 2 MiB and releases the stream", async () => {
		const { client, fetch } = setup();
		const cancel = vi.fn();
		const chunk = new Uint8Array(512 * 1024).fill(0x20);
		let pulls = 0;
		fetch.mockResolvedValueOnce(
			new Response(
				new ReadableStream({
					pull(controller) {
						pulls += 1;
						controller.enqueue(chunk);
					},
					cancel,
				}),
			),
		);

		await expect(client.get(22)).rejects.toMatchObject({
			name: "AzureDevOpsContentError",
			code: "too-large",
		});
		expect(cancel).toHaveBeenCalledOnce();
		expect(pulls).toBeLessThanOrEqual(6);
	});

	test("rejects an oversized declared length before reading the body", async () => {
		const { client, fetch } = setup();
		fetch.mockResolvedValueOnce(
			new Response("{}", {
				headers: { "content-length": String(2 * 1024 * 1024 + 1) },
			}),
		);

		await expect(client.get(22)).rejects.toMatchObject({ code: "too-large" });
	});

	test("classifies body transport failures, not malformed UTF-8, as network", async () => {
		const { client, fetch } = setup();
		const lost = new TypeError("Connection lost");
		fetch.mockResolvedValueOnce(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.error(lost);
					},
				}),
			),
		);
		const transport = await client.get(22).catch((error) => error);
		expect(transport).toMatchObject({ code: "network", original: lost });
		expect(isTemporaryReadError(transport)).toBe(true);

		fetch.mockResolvedValueOnce(new Response(new Uint8Array([0x7b, 0xff])));
		const malformed = await client.get(22).catch((error) => error);
		expect(malformed).toMatchObject({ code: "invalid-response" });
		expect(isTemporaryReadError(malformed)).toBe(false);
	});

	test.each([
		[
			"Agent merge evidence",
			(client) => client.getAgentMergeEvidence(22),
			(error, lost) =>
				expect(error).toMatchObject({ code: "network", original: lost }),
		],
		[
			"file content",
			(client) =>
				client.getFileDiff(
					{
						baseCommitId: "a".repeat(40),
						sourceCommitId: sourceCommitId,
						files: [{ path: "/added.txt", changeType: "add" }],
					},
					0,
				),
			(error, lost) =>
				expect(error).toMatchObject({
					code: "request-failed",
					cause: { code: "network", original: lost },
				}),
		],
	])(
		"classifies %s body transport failures as temporary network errors",
		async (_, read, expectNetwork) => {
			const { client, fetch } = setup();
			const lost = new TypeError("Connection lost");
			fetch.mockResolvedValueOnce(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode("{"));
							controller.error(lost);
						},
					}),
				),
			);

			const error = await read(client).catch((caught) => caught);
			expectNetwork(error, lost);
			expect(isTemporaryReadError(error)).toBe(true);
			expect(String(error.message)).not.toContain("test-token");
			expect(fetch).toHaveBeenCalledOnce();
		},
	);

	test("keeps malformed UTF-8 invalid on bounded file content reads", async () => {
		const { client, fetch } = setup();
		fetch.mockResolvedValueOnce(new Response(new Uint8Array([0x7b, 0xff])));

		const error = await client
			.getFileDiff(
				{
					baseCommitId: "a".repeat(40),
					sourceCommitId: sourceCommitId,
					files: [{ path: "/added.txt", changeType: "add" }],
				},
				0,
			)
			.catch((caught) => caught);
		expect(error).toMatchObject({ code: "invalid-response" });
		expect(isTemporaryReadError(error)).toBe(false);
	});

	test("starts the request deadline before token acquisition", async () => {
		const { client, authentication, fetch } = setup();
		const deadline = new AbortController();
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(deadline.signal);
		try {
			authentication.getAccessToken.mockReturnValue(new Promise(() => {}));
			const result = client.get(22);
			await setImmediate();
			expect(timeout).toHaveBeenCalledOnce();
			expect(authentication.getAccessToken).toHaveBeenCalledOnce();

			deadline.abort(new DOMException("Deadline", "TimeoutError"));
			await expect(result).rejects.toMatchObject({ name: "TimeoutError" });
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			timeout.mockRestore();
		}
	});

	test("bounds repository lookup responses before resolving the repository", async () => {
		const cancel = vi.fn();
		const fetch = vi.fn(
			async () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.enqueue(new Uint8Array(1024 * 1024).fill(0x20));
						},
						cancel,
					}),
				),
		);

		await expect(
			resolveRepository(
				{ organization: "fabrikam", project: "Tools", repository: "widgets" },
				{
					authentication: {
						getAccessToken: async () => ({ accessToken: "test-token" }),
					},
					fetch,
				},
			),
		).rejects.toThrow("Azure DevOps repository lookup response is too large.");
		expect(cancel).toHaveBeenCalledOnce();
	});

	test.each(["already failed", "cleanup rejects"])(
		"preserves HTTP status when the response stream %s",
		async (failure) => {
			const { client, fetch } = setup();
			const cleanupError = new Error("Response stream failed");
			const stream = new ReadableStream({
				start(controller) {
					if (failure === "already failed") controller.error(cleanupError);
				},
				cancel() {
					return Promise.reject(cleanupError);
				},
			});
			fetch.mockResolvedValueOnce(new Response(stream, { status: 403 }));

			await expect(client.get(22)).rejects.toMatchObject({
				name: "AzureDevOpsHttpError",
				status: 403,
				message: "Azure DevOps PR request failed (HTTP 403).",
			});
			expect(fetch).toHaveBeenCalledTimes(1);
		},
	);

	test("keeps the same PR number in two repositories separate", async () => {
		const other = {
			...repository,
			organization: "contoso",
			repositoryId: "a7573007-bbb3-4341-b726-0c4148a07853",
			accountId: "other-account",
		};
		const first = setup();
		const second = setup(
			response({ repository: { id: other.repositoryId } }),
			other,
		);

		const results = await Promise.all([
			first.client.get(22),
			second.client.get(22),
		]);

		expect(results.map(({ repositoryId }) => repositoryId)).toEqual([
			repository.repositoryId,
			other.repositoryId,
		]);
		expect(second.fetch.mock.calls[0][0]).toBe(
			`https://dev.azure.com/contoso/Project%20%26%20tools/_apis/git/repositories/${other.repositoryId}/pullrequests/22?api-version=7.1`,
		);
	});

	test("passes cancellation to fetch and skips already-cancelled requests", async () => {
		const { client, fetch } = setup();
		const controller = new AbortController();
		await client.get(22, { signal: controller.signal });
		controller.abort();

		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		await expect(
			client.get(22, { signal: controller.signal }),
		).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test("does not return a result after cancellation", async () => {
		const { client, fetch } = setup();
		const controller = new AbortController();
		fetch.mockImplementationOnce(async () => {
			controller.abort();
			return Response.json(response());
		});

		await expect(
			client.get(22, { signal: controller.signal }),
		).rejects.toMatchObject({
			name: "AbortError",
		});
	});

	test.each([undefined, null, 0, -1, 1.5, Number.NaN, "22"])(
		"requires an exact PR ID for read and update: %s",
		async (id) => {
			const { client, fetch } = setup();
			await expect(client.get(id)).rejects.toThrow("pull request ID");
			await expect(client.abandon(id)).rejects.toThrow("pull request ID");
			await expect(
				client.complete(id, {
					sourceCommitId,
					mergeStrategy: "squash",
					title: "PR title",
				}),
			).rejects.toThrow("pull request ID");
			expect(fetch).not.toHaveBeenCalled();
		},
	);

	test.each([
		{ organization: ".." },
		{ project: "../another-project" },
		{ repositoryId: "" },
		{ accountId: "" },
	])("rejects an invalid repository binding: %j", (override) => {
		expect(() => setup(response(), { ...repository, ...override })).toThrow();
	});

	test("rejects invalid mutation inputs before requesting credentials", async () => {
		const { client, fetch } = setup();
		await expect(
			client.create({ ...createInput, title: " " }),
		).rejects.toThrow();
		await expect(
			client.create({ ...createInput, sourceRef: "feature" }),
		).rejects.toThrow();
		await expect(
			client.create({ ...createInput, draft: "false" }),
		).rejects.toThrow();
		await expect(client.get(-1)).rejects.toThrow();
		await expect(
			client.complete(22, { mergeStrategy: "squash" }),
		).rejects.toThrow();
		await expect(
			client.complete(22, { sourceCommitId, mergeStrategy: "unknown" }),
		).rejects.toThrow();
		await expect(
			client.complete(22, {
				sourceCommitId,
				mergeStrategy: "squash",
				title: "PR title",
				deleteSourceBranch: "false",
			}),
		).rejects.toThrow();
		await expect(
			client.complete(22, {
				sourceCommitId,
				mergeStrategy: "squash",
				title: "PR title",
				transitionWorkItems: "false",
			}),
		).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		null,
		{},
		response({ status: "future-status" }),
		response({ isDraft: "false" }),
		response({ pullRequestId: 23 }),
		response({ repository: { id: "other-repository" } }),
		response({ title: 123 }),
	])("rejects an invalid or mismatched response: %j", async (data) => {
		const { client } = setup(data);
		await expect(client.get(22)).rejects.toThrow();
	});

	test.each(["description", "mergeStatus"])(
		"names an invalid %s field without exposing its contents",
		async (field) => {
			const { client } = setup(
				response({ [field]: { privateDetails: "sensitive server data" } }),
			);

			await expect(client.get(22)).rejects.toMatchObject({
				name: "TypeError",
				message: `Invalid PR response field: ${field}`,
			});
		},
	);

	test("keeps unknown status contents out of errors", async () => {
		const { client } = setup(
			response({ status: "unexpected\nsensitive server data" }),
		);

		await expect(client.get(22)).rejects.toMatchObject({
			name: "TypeError",
			message: "Unknown Azure DevOps pull request status",
		});
	});
});
