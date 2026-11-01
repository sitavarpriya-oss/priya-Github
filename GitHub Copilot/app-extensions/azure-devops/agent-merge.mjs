import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	activeReviews,
	completePullRequest,
	evaluateMerge,
} from "./agent-merge-policy.mjs";
import {
	requireEvidence,
	sameRevision,
	sameSourceRevision,
} from "./agent-merge-reads.mjs";
import { mergeDetails } from "./merge-details.mjs";
import { mergeMethods } from "./merge-methods.mjs";
import {
	parsePullRequestViewContext,
	resolveRepository,
	supportsPullRequestView,
} from "./pull-request-locator.mjs";
import { createPullRequestClient } from "./pull-requests.mjs";

const skill = await readFile(
	new URL("./agent-merge-skill.md", import.meta.url),
	"utf8",
);
const MAX_FRAME_BODY = 12 * 1024;
const hash = (value) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

function bounded(value) {
	requireEvidence(
		bytes(value) < MAX_FRAME_BODY,
		"Agent merge response exceeds its bounded frame.",
	);
	return value;
}

function paginate(items, cursor, identity) {
	const digest = hash([identity, items]);
	let offset = 0;
	if (cursor != null) {
		requireEvidence(typeof cursor === "string" && cursor.length <= 128);
		const [expected, index] = cursor.split(":");
		requireEvidence(expected === digest && /^(0|[1-9][0-9]*)$/.test(index));
		offset = Number(index);
		requireEvidence(Number.isSafeInteger(offset) && offset < items.length);
	}
	const page = [];
	while (offset < items.length && bytes([...page, items[offset]]) < 8 * 1024) {
		page.push(items[offset++]);
	}
	requireEvidence(offset === items.length || page.length > 0);
	return {
		items: page,
		nextCursor: offset < items.length ? `${digest}:${offset}` : null,
	};
}

function chunks(text) {
	// Keep code points intact; each uses at most six JSON bytes.
	const characters = Array.from(text);
	const result = [];
	for (let i = 0; i < characters.length; i += 1000)
		result.push(characters.slice(i, i + 1000).join(""));
	return result.length ? result : [""];
}

/** Static provider callbacks. Native callback scope supplies the account and action authority. */
export function createAgentMerge(authentication) {
	async function bind(context) {
		const locator = parsePullRequestViewContext({ url: context?.url });
		requireEvidence(
			locator && typeof context.originUrl === "string",
			"Unsupported pull request context.",
		);
		const origin = new URL(context.originUrl);
		requireEvidence(
			!origin.search && !origin.hash && !origin.pathname.endsWith("/"),
		);
		const remote = parsePullRequestViewContext({
			url: `${context.originUrl.replace(/\.git$/, "")}/pullrequest/1`,
		});
		requireEvidence(
			remote &&
				remote.organization.toLowerCase() ===
					locator.organization.toLowerCase(),
			"Saved repository origin and pull request locator do not match.",
		);
		requireEvidence(
			typeof authentication?.getAccessToken === "function",
			"Native authentication is unavailable.",
		);
		// The host supplies this operation's saved repository account.
		const repository = await resolveRepository(locator, { authentication });
		requireEvidence(typeof repository.project?.id === "string");
		if (
			remote.project !== locator.project ||
			remote.repository !== locator.repository
		) {
			const saved = await resolveRepository(remote, { authentication });
			requireEvidence(
				saved.id.toLowerCase() === repository.id.toLowerCase() &&
					saved.project?.id?.toLowerCase() ===
						repository.project.id.toLowerCase(),
				"Saved repository origin and pull request locator resolve to different repositories.",
			);
		}
		const client = createPullRequestClient({
			repository: {
				organization: locator.organization,
				project: repository.project.id,
				repositoryId: repository.id,
			},
			authentication,
		});
		return { client, id: locator.pullRequestId };
	}

	async function load(context, expected, { reviewsOnly = false } = {}) {
		const binding = await bind(context);
		const snapshot = await binding.client.getAgentMergeEvidence(binding.id, {
			signal: AbortSignal.timeout(30_000),
			reviewsOnly,
		});
		if (expected)
			requireEvidence(
				sameRevision(expected, snapshot.revision),
				"Source or target revision changed; observe again before continuing.",
			);
		return { ...binding, snapshot };
	}

	return {
		skill,
		supports: supportsPullRequestView,

		async observe({ context }) {
			const { snapshot } = await load(context);
			const result = evaluateMerge(snapshot);
			const methods = mergeMethods(snapshot);
			return bounded({
				state: snapshot.normalized.state,
				revision: snapshot.revision,
				reviews: result.reviews.length > 0,
				checks: result.checks.length > 0,
				conflicts: result.conflicts,
				readyToComplete: result.completion.status === "ready",
				mergeDetails: mergeDetails(snapshot, result),
				...(methods.defaultMethod
					? { mergeMethod: methods.defaultMethod }
					: {}),
				fingerprint: hash([
					snapshot.revision,
					snapshot.normalized.state,
					result,
					methods,
				]),
			});
		},

		async readReviews({ context, expected, cursor }) {
			requireEvidence(
				sameRevision(expected, expected),
				"An expected revision is required.",
			);
			const { snapshot } = await load(context, expected, { reviewsOnly: true });
			const text = activeReviews(snapshot)
				.map(({ id, summary }) => `${id}\n${summary}`)
				.join("\n\n");
			const page = paginate(chunks(text), cursor, expected);
			return bounded({
				body: page.items.join(""),
				nextCursor: page.nextCursor,
			});
		},

		async replyToReview({ context, expected, feedbackId, body, resolve }) {
			let replied = false;
			try {
				requireEvidence(
					sameRevision(expected, expected),
					"An expected revision is required.",
				);
				requireEvidence(
					typeof body === "string" && body.trim() && bytes(body) < 8 * 1024,
				);
				requireEvidence(
					typeof feedbackId === "string" &&
						/^thread:[1-9][0-9]*$/.test(feedbackId),
				);
				const { client, id, snapshot } = await load(context, expected, {
					reviewsOnly: true,
				});
				requireEvidence(["open", "draft"].includes(snapshot.normalized.state));
				const threadId = Number(feedbackId.slice("thread:".length));
				const thread = snapshot.threads.find((item) => item.id === threadId);
				requireEvidence(thread && thread.comments.length > 0);
				if (["fixed", "wontFix", "closed", "byDesign"].includes(thread.status))
					return "Thread already resolved; no reply posted.";
				requireEvidence(
					activeReviews(snapshot).some((item) => item.id === feedbackId),
				);
				const root = thread.comments[0];
				const candidates = thread.comments.filter(
					(comment) =>
						comment.content === body &&
						comment.parentCommentId === root.id &&
						comment.commentType === "text" &&
						comment.author !== null,
				);
				let existing;
				if (candidates.length > 0) {
					const authorId = (
						await client.getCurrentUserId({
							signal: AbortSignal.timeout(30_000),
						})
					).toLowerCase();
					existing = candidates.find(
						(comment) => comment.author.id.toLowerCase() === authorId,
					);
				}
				const reply = existing ?? (await client.reply(id, threadId, body));
				requireEvidence(
					reply.content === body &&
						Number.isSafeInteger(reply.id) &&
						reply.parentCommentId > 0 &&
						reply.commentType === "text",
					"Reply acknowledgement was not confirmed.",
				);
				replied = true;
				const posted = existing ? "Existing reply reused" : "Reply posted";
				if (resolve === false) return `${posted}.`;
				// A changed head after the reply must not resolve feedback against another revision.
				const current = await load(context, expected, { reviewsOnly: true });
				requireEvidence(
					["open", "draft"].includes(current.snapshot.normalized.state),
				);
				const resolved = await client.setThreadStatus(id, threadId, "fixed");
				requireEvidence(
					resolved.status === "fixed",
					"Thread resolution was not confirmed.",
				);
				return `${posted} and thread resolved.`;
			} catch (error) {
				if (replied)
					throw new Error(
						"Reply was confirmed, but thread resolution was not confirmed. Do not post the reply again.",
					);
				throw error;
			}
		},

		async readCheckFailure({ context, expected, checkId, cursor }) {
			requireEvidence(
				sameRevision(expected, expected),
				"An expected revision is required.",
			);
			const { client, snapshot } = await load(context, expected);
			const result = evaluateMerge(snapshot);
			const checks =
				checkId == null
					? result.checks
					: result.checks.filter((item) => item.id === checkId);
			if (checkId == null && checks.length === 0) {
				requireEvidence(
					cursor == null,
					"Check results changed; read from the first page.",
				);
				return {
					body: "No failed required checks at this revision.",
					nextCursor: null,
				};
			}
			const digest = hash([expected, checks]);
			let index = 0;
			let pageCursor = cursor;
			if (checkId == null && cursor != null) {
				requireEvidence(typeof cursor === "string" && cursor.length <= 256);
				const parts = cursor.split("/");
				requireEvidence(
					parts.length === 3 &&
						parts[0] === digest &&
						/^(0|[1-9][0-9]*)$/.test(parts[1]),
				);
				index = Number(parts[1]);
				pageCursor = parts[2] || null;
			}
			const check = checks[index];
			requireEvidence(
				check,
				"This is not a failed required check at the expected revision.",
			);
			let text =
				"Azure DevOps did not supply a build ID. Build diagnostics are unavailable.";
			if (check.buildId !== null) {
				const options = { signal: AbortSignal.timeout(30_000) };
				const build = await client.getBuild(check.buildId, options);
				requireEvidence(
					build.definitionId === check.buildDefinitionId,
					"Build definition does not match the required policy.",
				);
				text = [
					`Build ${build.id}: ${build.status}, ${build.result ?? "no result"}.`,
					`Build source: ${build.sourceBranch} at ${build.sourceVersion}.`,
					await client.getAgentMergeBuildFailure(build.id, options),
				].join("\n");
			}
			const current = await load(context, expected);
			requireEvidence(
				evaluateMerge(current.snapshot).checks.some(
					(item) => hash(item) === hash(check),
				),
				"Check results changed; read from the first page.",
			);
			const page = paginate(
				chunks(`${check.id}\n${check.summary}\n${text}`),
				pageCursor,
				[expected, check.id],
			);
			let nextCursor = page.nextCursor;
			if (checkId == null) {
				nextCursor = page.nextCursor
					? `${digest}/${index}/${page.nextCursor}`
					: index + 1 < checks.length
						? `${digest}/${index + 1}/`
						: null;
			}
			return bounded({
				body: page.items.join(""),
				nextCursor,
			});
		},

		async complete({ context, expected, mergeMethod, postCompletionOptions }) {
			requireEvidence(
				sameRevision(expected, expected),
				"An expected revision is required.",
			);
			const { client, id, snapshot } = await load(context);
			requireEvidence(
				sameSourceRevision(expected, snapshot.revision),
				"Source revision or target ref changed; observe again before continuing.",
			);
			if (
				["merged", "closed"].includes(snapshot.normalized.state) ||
				snapshot.raw.autoCompleteSetBy ||
				snapshot.raw.completionQueueTime
			)
				return;
			await completePullRequest(
				client,
				id,
				snapshot,
				mergeMethod,
				postCompletionOptions,
			);
		},
	};
}
