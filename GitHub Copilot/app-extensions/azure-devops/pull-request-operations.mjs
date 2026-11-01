/**
 * Provider operations are caller-authorized. Possessing this client is not a host grant.
 * @typedef {import("./pull-requests.mjs").RequestOptions} RequestOptions
 * @typedef {import("./pull-requests.mjs").PullRequest} PullRequest
 * @typedef {import("./pull-requests.mjs").Thread} Thread
 * @typedef {import("./pull-requests.mjs").Comment} Comment
 * @typedef {import("./pull-requests.mjs").Reviewer} Reviewer
 * @typedef {{title?: string, description?: string, draft?: boolean, status?: "active" | "abandoned"}} UpdateInput
 * @typedef {{path: string, side: "original" | "modified", startLine: number, endLine: number, baseCommitId: string, sourceCommitId: string, iterationId: number, changeTrackingId: number}} InlineAnchor
 * @typedef {{content: string, anchor?: InlineAnchor}} ThreadInput
 * @typedef {{id: number, definitionId: number, name: string, status: string, result: string | null, sourceBranch: string, sourceVersion: string, url: string}} Build
 */
export function createPullRequestOperations({
	prPath,
	projectUrl,
	repositoryId,
	project,
	getChanges,
	readers,
	run,
	send,
}) {
	const threadPath = (id, threadId) =>
		`${prPath}/${positive(id)}/threads/${positive(threadId)}`;
	const reviewersPath = (id) => `${prPath}/${positive(id)}/reviewers`;
	const reviewerPath = (id, reviewerId) =>
		`${reviewersPath(id)}/${identity(reviewerId)}`;
	const expectId = (reader, id) => (data) => {
		const result = reader(data);
		if (String(result.id).toLowerCase() !== String(id).toLowerCase())
			invalid("Response identity mismatch");
		return result;
	};
	const expectReviewerList = (id) => (data) => {
		if (!Array.isArray(data) || data.length !== 1)
			invalid("Invalid reviewer response");
		return expectId(readers.reviewer, id)(data[0]);
	};
	const readBuild = (data) => {
		object(data);
		positive(data.id);
		object(data.project);
		const projectMatches = guid.test(project)
			? data.project.id?.toLowerCase() === project.toLowerCase()
			: data.project.name?.toLowerCase() === project.toLowerCase();
		if (
			!projectMatches ||
			data.repository?.id?.toLowerCase() !== repositoryId.toLowerCase() ||
			data.repository.type !== "TfsGit"
		)
			invalid("Build repository/project mismatch");
		const statuses = [
			"none",
			"inProgress",
			"completed",
			"cancelling",
			"postponed",
			"notStarted",
		];
		const results = [
			"none",
			"succeeded",
			"partiallySucceeded",
			"failed",
			"canceled",
		];
		if (
			typeof data.status !== "string" ||
			(data.result != null && typeof data.result !== "string")
		)
			invalid("Invalid build status");
		return {
			id: data.id,
			definitionId: positive(data.definition?.id),
			name: nonempty(data.definition?.name),
			status: statuses.includes(data.status) ? data.status : "unknown",
			result:
				data.result == null
					? null
					: results.includes(data.result)
						? data.result
						: "unknown",
			sourceBranch: nonempty(data.sourceBranch),
			sourceVersion: commitId(data.sourceVersion),
			url: `${projectUrl}/_build/results?buildId=${data.id}`,
		};
	};
	const operations = {
		/** @param {number} id @param {UpdateInput} input @param {RequestOptions} [options] @returns {Promise<PullRequest>} */
		async update(id, input, { signal } = {}) {
			positive(id);
			keys(input, ["title", "description", "draft", "status"]);
			const body = {};
			if (input.title !== undefined) body.title = nonempty(input.title);
			if (input.description !== undefined)
				body.description = string(input.description);
			if (input.draft !== undefined) body.isDraft = bool(input.draft);
			if (input.status !== undefined) {
				if (!["active", "abandoned"].includes(input.status))
					invalid(
						"Use complete with an explicit source commit and merge strategy to merge",
					);
				body.status = input.status;
			}
			if (!Object.keys(body).length) invalid("Empty PR update");
			return send("PATCH", `${prPath}/${id}`, body, signal, (data) =>
				readers.pullRequest(data, id),
			);
		},
		/** @param {number} id @param {ThreadInput} input @param {RequestOptions} [options] @returns {Promise<Thread>} */
		async createThread(id, input, { signal } = {}) {
			positive(id);
			const body = createThreadBody(input);
			const anchor =
				input.anchor === undefined ? undefined : readAnchor(input.anchor);
			return run(async () => {
				if (anchor) {
					const changes = await getChanges(id, { signal });
					const file = changes.files.find(
						(file) =>
							file.path === anchor.path &&
							file.changeTrackingId === anchor.changeTrackingId,
					);
					if (
						changes.selectedCommitId ||
						changes.iterationId !== anchor.iterationId ||
						changes.baseCommitId !== anchor.baseCommitId ||
						changes.sourceCommitId !== anchor.sourceCommitId ||
						!file ||
						(anchor.side === "original" &&
							file.changeType.split(", ").includes("add")) ||
						(anchor.side === "modified" &&
							file.changeType.split(", ").includes("delete"))
					)
						invalid(
							"The inline source revision changed; refresh before commenting",
						);
				}
				return send(
					"POST",
					`${prPath}/${id}/threads`,
					body,
					signal,
					readers.thread,
				);
			}, signal);
		},
		/** @param {number} id @param {number} threadId @param {string} content @param {RequestOptions} [options] @returns {Promise<Comment>} */
		async reply(id, threadId, content, { signal } = {}) {
			const path = threadPath(id, threadId);
			const text = nonempty(content);
			return run(async () => {
				const thread = await send(
					"GET",
					path,
					undefined,
					signal,
					expectId(readers.thread, threadId),
				);
				const parent =
					thread.comments.find((comment) => comment.parentCommentId === 0) ??
					thread.comments[0];
				if (!parent) invalid("Cannot reply to an empty thread");
				return send(
					"POST",
					`${path}/comments`,
					{ content: text, parentCommentId: parent.id, commentType: 1 },
					signal,
					readers.comment,
				);
			}, signal);
		},
		/** @param {number} id @param {number} threadId @param {number} commentId @param {string} content @param {RequestOptions} [options] @returns {Promise<Comment>} */
		async editComment(id, threadId, commentId, content, { signal } = {}) {
			return send(
				"PATCH",
				`${threadPath(id, threadId)}/comments/${positive(commentId)}`,
				{ content: nonempty(content) },
				signal,
				expectId(readers.comment, commentId),
			);
		},
		/** @param {number} id @param {number} threadId @param {number} commentId @param {RequestOptions} [options] @returns {Promise<null>} */
		async deleteComment(id, threadId, commentId, { signal } = {}) {
			return send(
				"DELETE",
				`${threadPath(id, threadId)}/comments/${positive(commentId)}`,
				undefined,
				signal,
				() => null,
			);
		},
		/** @param {number} id @param {number} threadId @param {"active" | "fixed" | "wontFix" | "closed" | "byDesign" | "pending"} status @param {RequestOptions} [options] @returns {Promise<Thread>} */
		async setThreadStatus(id, threadId, status, { signal } = {}) {
			const path = threadPath(id, threadId);
			if (
				![
					"active",
					"fixed",
					"wontFix",
					"closed",
					"byDesign",
					"pending",
				].includes(status)
			)
				invalid("Invalid thread status");
			return send(
				"PATCH",
				path,
				{ status },
				signal,
				expectId(readers.thread, threadId),
			);
		},
		/** @param {number} id @param {string} viewerId @param {-10 | -5 | 0 | 5 | 10} vote @param {RequestOptions} [options] @returns {Promise<Reviewer>} */
		async vote(id, viewerId, vote, { signal } = {}) {
			const path = reviewerPath(id, viewerId);
			if (![-10, -5, 0, 5, 10].includes(vote)) invalid("Invalid reviewer vote");
			return send(
				"PUT",
				path,
				{ id: viewerId, vote },
				signal,
				expectId(readers.reviewer, viewerId),
			);
		},
		/** @param {number} id @param {string} reviewerId @param {{isRequired?: boolean} | null} input @param {RequestOptions} [options] @returns {Promise<Reviewer | null>} */
		async setReviewer(id, reviewerId, input, { signal } = {}) {
			const path = reviewerPath(id, reviewerId);
			if (input === null)
				return send("DELETE", path, undefined, signal, () => null);
			keys(input, ["isRequired"]);
			if (input.isRequired !== undefined && bool(input.isRequired) === true)
				invalid("Adding required reviewers is not supported");
			const normalizedId = identity(reviewerId);
			try {
				return await send(
					"POST",
					reviewersPath(id),
					[{ id: normalizedId }],
					signal,
					expectReviewerList(normalizedId),
				);
			} catch (error) {
				if (error && typeof error === "object")
					error.operationStage = "add the reviewer";
				throw error;
			}
		},
		/** @param {number} id Build ID, not PR ID. @param {RequestOptions} [options] @returns {Promise<Build>} */
		async getBuild(id, { signal } = {}) {
			return send(
				"GET",
				`build/builds/${positive(id)}`,
				undefined,
				signal,
				expectId(readBuild, id),
			);
		},
		/** @param {number} id Build ID, not PR ID. @param {RequestOptions} [options] @returns {Promise<Build>} */
		async retryBuild(id, { signal } = {}) {
			positive(id);
			return run(async () => {
				const build = await operations.getBuild(id, { signal });
				if (build.status !== "completed")
					invalid("Only completed builds can be queued again");
				// Queue a new build with fetched definition/source; this does not rerun a policy.
				// https://learn.microsoft.com/rest/api/azure/devops/build/builds/queue?view=azure-devops-rest-7.1
				return send(
					"POST",
					"build/builds",
					{
						definition: { id: build.definitionId },
						sourceBranch: build.sourceBranch,
						sourceVersion: build.sourceVersion,
					},
					signal,
					(data) => {
						const queued = readBuild(data);
						if (
							queued.definitionId !== build.definitionId ||
							queued.sourceVersion !== build.sourceVersion ||
							queued.sourceBranch !== build.sourceBranch
						)
							invalid("Queued build source mismatch");
						return queued;
					},
				);
			}, signal);
		},
		/** @param {number} id Build ID, not PR ID. @param {RequestOptions} [options] @returns {Promise<Build>} */
		async cancelBuild(id, { signal } = {}) {
			positive(id);
			return run(async () => {
				const build = await operations.getBuild(id, { signal });
				if (!["inProgress", "notStarted", "postponed"].includes(build.status))
					invalid("Build is not cancellable");
				// https://learn.microsoft.com/rest/api/azure/devops/build/builds/update-build?view=azure-devops-rest-7.1
				return send(
					"PATCH",
					`build/builds/${id}`,
					{ status: "cancelling" },
					signal,
					expectId(readBuild, id),
				);
			}, signal);
		},
	};
	return operations;
}

/** @param {ThreadInput} input */
export function createThreadBody(input) {
	keys(input, ["content", "anchor"]);
	const body = {
		comments: [
			{ parentCommentId: 0, content: nonempty(input.content), commentType: 1 },
		],
		status: 1,
	};
	if (input.anchor !== undefined) {
		const anchor = readAnchor(input.anchor);
		const apiSide = anchor.side === "original" ? "left" : "right";
		body.threadContext = {
			filePath: anchor.path,
			// ADO rejects offset 0 despite the REST reference's older description.
			// https://developercommunity.visualstudio.com/t/10598424
			[`${apiSide}FileStart`]: { line: anchor.startLine, offset: 1 },
			[`${apiSide}FileEnd`]: { line: anchor.endLine, offset: 1 },
		};
		// Equal iterations mean common commit vs source (not iteration 0).
		// https://learn.microsoft.com/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1
		body.pullRequestThreadContext = {
			changeTrackingId: anchor.changeTrackingId,
			iterationContext: {
				firstComparingIteration: anchor.iterationId,
				secondComparingIteration: anchor.iterationId,
			},
		};
	}
	return body;
}

const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function invalid(message) {
	throw new TypeError(message);
}
function object(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		invalid("Expected an object");
	return value;
}
function keys(value, allowed) {
	object(value);
	if (Object.keys(value).some((key) => !allowed.includes(key)))
		invalid("Unsupported operation field");
}
function string(value) {
	if (typeof value !== "string") invalid("Expected text");
	return value;
}
function nonempty(value) {
	if (!string(value).trim()) invalid("Expected nonempty text");
	return value;
}
function bool(value) {
	if (typeof value !== "boolean") invalid("Expected boolean");
	return value;
}
function positive(value) {
	if (!Number.isSafeInteger(value) || value <= 0)
		invalid("Expected positive integer ID or line");
	return value;
}
function identity(value) {
	if (!guid.test(string(value)))
		invalid("Expected an Azure DevOps identity GUID");
	return value;
}
function commitId(value) {
	if (!/^[a-f0-9]{40}$/i.test(string(value)))
		invalid("Expected an immutable commit ID");
	return value.toLowerCase();
}
function readAnchor(value) {
	keys(value, [
		"path",
		"side",
		"startLine",
		"endLine",
		"baseCommitId",
		"sourceCommitId",
		"iterationId",
		"changeTrackingId",
	]);
	const path = nonempty(value.path);
	if (!path.startsWith("/") || /[\0\\]/.test(path))
		invalid("Invalid anchor path");
	if (!["original", "modified"].includes(value.side))
		invalid("Invalid anchor side");
	const anchor = {
		path,
		side: value.side,
		startLine: positive(value.startLine),
		endLine: positive(value.endLine),
		baseCommitId: commitId(value.baseCommitId),
		sourceCommitId: commitId(value.sourceCommitId),
		iterationId: positive(value.iterationId),
		changeTrackingId: positive(value.changeTrackingId),
	};
	if (anchor.endLine < anchor.startLine) invalid("Invalid anchor range");
	return anchor;
}

export function safeDetailUrl(value, projectUrl) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		const project = new URL(projectUrl);
		if (
			url.protocol !== "https:" ||
			url.origin !== project.origin ||
			url.username ||
			url.password ||
			!url.pathname
				.toLowerCase()
				.startsWith(`${project.pathname.toLowerCase()}/`)
		)
			return undefined;
		// Do not forward authentication tokens carried by arbitrary query strings.
		if (
			[...url.searchParams.keys()].some(
				(key) => !["buildId", "view", "definitionId"].includes(key),
			)
		)
			return undefined;
		url.hash = "";
		return url.href;
	} catch {
		return undefined;
	}
}
