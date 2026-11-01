const MAX_BYTES = 2 * 1024 * 1024;
const sha = /^[a-f0-9]{40}$/i;
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function requireEvidence(
	value,
	reason = "Azure DevOps evidence is incomplete or inconsistent.",
) {
	if (!value) throw new Error(reason);
}

export function revisionOf(pr) {
	const revision = {
		sourceRef: pr.sourceRefName,
		targetRef: pr.targetRefName,
		sourceCommit: pr.lastMergeSourceCommit?.commitId,
		targetCommit: pr.lastMergeTargetCommit?.commitId,
	};
	requireEvidence(
		[revision.sourceRef, revision.targetRef].every(
			(ref) =>
				typeof ref === "string" &&
				ref.startsWith("refs/heads/") &&
				ref.length > "refs/heads/".length &&
				[...ref].every((character) => character.charCodeAt(0) > 32),
		) &&
			[revision.sourceCommit, revision.targetCommit].every(
				(commit) => typeof commit === "string" && sha.test(commit),
			),
	);
	revision.sourceCommit = revision.sourceCommit.toLowerCase();
	revision.targetCommit = revision.targetCommit.toLowerCase();
	return revision;
}

export function sameSourceRevision(left, right) {
	return ["sourceRef", "targetRef", "sourceCommit"].every(
		(key) => typeof left?.[key] === "string" && left[key] === right?.[key],
	);
}

export function sameRevision(left, right) {
	return (
		sameSourceRevision(left, right) &&
		typeof left?.targetCommit === "string" &&
		left.targetCommit === right?.targetCommit
	);
}

/** Strict automation reads reuse the PR client's token-authenticated transport, not its UI's optional sections. */
export function createAgentMergeReads({
	requestJson,
	list: readList,
	repositoryPath,
	prPath,
	repositoryId,
	project,
	organizationUrl,
	readPullRequest,
	readThread,
}) {
	async function get(path, signal, query = {}) {
		return requestJson("GET", path, undefined, signal, query, "7.1", MAX_BYTES);
	}

	function list(path, signal, query = {}, offsets = false) {
		return readList(path, signal, query, offsets, undefined, {
			maxBytes: MAX_BYTES,
			maxPages: 20,
		});
	}

	async function pullRequest(id, signal) {
		const { data } = await get(`${prPath}/${id}`, signal);
		const normalized = readPullRequest(data, id);
		requireEvidence(
			guid.test(project) &&
				data.repository?.project?.id?.toLowerCase() === project.toLowerCase(),
		);
		return { raw: data, normalized, revision: revisionOf(data) };
	}

	function decisionState({ raw, normalized }) {
		requireEvidence(Array.isArray(raw.reviewers));
		return JSON.stringify({
			state: normalized.state,
			mergeStatus: raw.mergeStatus,
			autoComplete: Boolean(raw.autoCompleteSetBy),
			completionQueueTime: raw.completionQueueTime,
			mergeStrategy: raw.completionOptions?.mergeStrategy,
			reviewers: raw.reviewers.map(({ id, vote, isRequired }) => ({
				id,
				vote,
				isRequired,
			})),
		});
	}

	async function refs(revision, signal) {
		const current = { ...revision };
		for (const [name, key] of [
			[revision.sourceRef, "sourceCommit"],
			[revision.targetRef, "targetCommit"],
		]) {
			const values = await list(`${repositoryPath}/refs`, signal, {
				filter: name.slice("refs/".length),
			});
			const matches = values.filter((ref) => ref.name === name);
			requireEvidence(
				matches.length === 1 &&
					typeof matches[0].objectId === "string" &&
					sha.test(matches[0].objectId),
				"The source or target branch revision is unavailable.",
			);
			current[key] = matches[0].objectId.toLowerCase();
		}
		return current;
	}

	async function mergePolicies(id, targetRef, signal) {
		return {
			policies: await list("git/policy/configurations", signal, {
				repositoryId,
				refName: targetRef,
			}),
			evaluations: await list(
				"policy/evaluations",
				signal,
				{
					artifactId: `vstfs:///CodeReview/CodeReviewId/${project}/${id}`,
					includeNotApplicable: "true",
				},
				true,
			),
		};
	}

	async function threads(id, signal) {
		return (await list(`${prPath}/${id}/threads`, signal))
			.filter((thread) => thread.isDeleted !== true)
			.map(readThread);
	}

	return {
		/**
		 * The bound account's Azure DevOps identity, used for review votes.
		 * @param {import("./pull-requests.mjs").RequestOptions} [options]
		 */
		async getAuthenticatedUserId({ signal } = {}) {
			requireEvidence(
				typeof organizationUrl === "string" &&
					organizationUrl.startsWith("https://"),
			);
			const { data } = await requestJson(
				"GET",
				"connectionData",
				undefined,
				signal,
				{},
				undefined,
				64 * 1024,
				undefined,
				`${organizationUrl}/_apis/connectionData`,
			);
			const id = data?.authenticatedUser?.id;
			requireEvidence(
				typeof id === "string" && guid.test(id),
				"The bound account identity is unavailable.",
			);
			return id.toLowerCase();
		},

		/** @param {number} id @param {import("./pull-requests.mjs").RequestOptions & {reviewsOnly?: boolean}} [options] */
		async getAgentMergeEvidence(id, { signal, reviewsOnly = false } = {}) {
			requireEvidence(Number.isSafeInteger(id) && id > 0);
			const first = await pullRequest(id, signal);
			const snapshot = {
				...first,
				policies: [],
				evaluations: [],
				threads: [],
			};
			if (["merged", "closed"].includes(first.normalized.state))
				return snapshot;
			snapshot.revision = await refs(first.revision, signal);
			if (!reviewsOnly)
				Object.assign(
					snapshot,
					await mergePolicies(id, first.revision.targetRef, signal),
				);
			snapshot.threads = await threads(id, signal);
			const last = await pullRequest(id, signal);
			const matchesRevision = reviewsOnly ? sameRevision : sameSourceRevision;
			requireEvidence(
				matchesRevision(first.revision, last.revision) &&
					decisionState(first) === decisionState(last),
				"Pull request changed while collecting evidence; refresh before continuing.",
			);
			const current = await refs(snapshot.revision, signal);
			requireEvidence(
				matchesRevision(snapshot.revision, current),
				"The source or target branch changed while collecting evidence; refresh before continuing.",
			);
			snapshot.normalized = last.normalized;
			snapshot.revision = current;
			return snapshot;
		},

		/** Display-only readiness evidence. It omits the race re-reads that guard completion, which uses getAgentMergeEvidence. @param {number} id @param {import("./pull-requests.mjs").RequestOptions} [options] */
		async getMergeReadinessEvidence(id, { signal } = {}) {
			requireEvidence(Number.isSafeInteger(id) && id > 0 && guid.test(project));
			const pr = await pullRequest(id, signal);
			return {
				...pr,
				...(await mergePolicies(id, pr.revision.targetRef, signal)),
				threads: await threads(id, signal),
			};
		},

		/** Only the reads that mergeMethods uses: the PR, its target branch policies and evaluations. @param {number} id @param {import("./pull-requests.mjs").RequestOptions} [options] */
		async getMergePolicyEvidence(id, { signal } = {}) {
			requireEvidence(Number.isSafeInteger(id) && id > 0);
			const { raw, revision } = await pullRequest(id, signal);
			return { raw, ...(await mergePolicies(id, revision.targetRef, signal)) };
		},

		/** @param {number} buildId @param {import("./pull-requests.mjs").RequestOptions} [options] */
		async getAgentMergeBuildFailure(buildId, { signal } = {}) {
			requireEvidence(Number.isSafeInteger(buildId) && buildId > 0);
			const { data } = await get(`build/builds/${buildId}/timeline`, signal);
			requireEvidence(
				Array.isArray(data?.records) && data.records.length <= 2000,
			);
			const lines = [];
			for (const record of data.records) {
				if (!["failed", "canceled", "abandoned"].includes(record.result))
					continue;
				lines.push(String(record.name ?? "Build task"));
				for (const issue of record.issues ?? []) {
					requireEvidence(typeof issue.message === "string");
					lines.push(issue.message);
				}
				if (record.log?.id === undefined) continue;
				requireEvidence(
					Number.isSafeInteger(record.log.id) && record.log.id > 0,
				);
				// Only package-constructed URLs are followed; task-supplied log URLs are ignored.
				const response = await get(
					`build/builds/${buildId}/logs/${record.log.id}`,
					signal,
					{
						startLine: "0",
						endLine: "199",
						$format: "json",
					},
				);
				const log = response.data;
				requireEvidence(
					Array.isArray(log?.value) &&
						log.count === log.value.length &&
						log.value.length <= 200 &&
						log.value.every((line) => typeof line === "string"),
				);
				lines.push(...log.value);
				if (log.value.length === 200)
					lines.push("[Log excerpt limited to the first 200 lines.]");
				if (lines.join("\n").length > 256 * 1024)
					throw new Error("Build diagnostics exceed the bounded read limit.");
			}
			return (
				lines.join("\n") ||
				"No failed task details were returned by Azure DevOps."
			);
		},
	};
}
