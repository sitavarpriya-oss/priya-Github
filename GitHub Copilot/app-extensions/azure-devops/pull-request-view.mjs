import { createPullRequestCanvas } from "./pull-request-canvas.mjs";
import {
	parsePullRequestViewContext,
	resolveRepository,
	supportsPullRequestView,
} from "./pull-request-locator.mjs";
import { createPullRequestClient } from "./pull-requests.mjs";

export {
	parsePullRequestViewContext,
	resolveRepository,
	supportsPullRequestView,
} from "./pull-request-locator.mjs";

const unavailableAuthentication = {
	async getAccessToken() {
		throw new Error("Azure DevOps pull request authentication is unavailable.");
	},
};
const SUPPORTED_WRITE_ACTIONS = new Set([
	"edit",
	"comment",
	"reply",
	"edit-comment",
	"delete-comment",
	"thread-status",
	"vote",
	"reviewer",
	"draft",
	"complete",
	"abandon",
	"reactivate",
]);

export function createPullRequestView(
	authentication,
	reportCanvasAction,
	requestFix,
) {
	const admittedAuthentication =
		typeof authentication?.getAccessToken === "function"
			? authentication
			: unavailableAuthentication;
	const canvas = createPullRequestCanvas({
		authentication: admittedAuthentication,
		getAccess: async (binding, { signal, operation }) => {
			const operations = binding.authorizedActions ?? [];
			if (
				operations.length === 0 ||
				(operation !== undefined && !operations.includes(operation))
			)
				return null;
			const client = createPullRequestClient({
				repository: binding.repository,
				authentication: admittedAuthentication,
			});
			if (!(await client.hasPullRequestContributePermission({ signal })))
				return null;
			const viewerId = await client.getAuthenticatedUserId({ signal });
			return { viewerId, operations: [...operations] };
		},
		reportCanvasAction,
		requestFix,
		refreshIntervalMs: 60_000,
	});
	return {
		/**
		 * The bound workspace open. It is a provider capability, not the canvas
		 * contribution: only this path receives an account the host has authorized for
		 * the activation's Azure DevOps resource, and only this path resolves a
		 * repository binding from it.
		 */
		async open({ instanceId, input, accountId, authorizedActions }) {
			if (!supportsPullRequestView(input))
				throw new Error("This pull request context is not supported.");
			if (typeof accountId !== "string" || !accountId)
				throw new Error("An authorized Azure DevOps account is required.");
			const operations = normalizeAuthorizedActions(authorizedActions);
			const binding = await resolvePullRequestBinding(
				input.url,
				accountId,
				admittedAuthentication,
			);
			try {
				canvas.setBinding(instanceId, {
					...binding,
					authorizedActions: operations,
				});
				const opened = await canvas.open({ instanceId, input: {} });
				return { ...opened, title: `PR #${binding.pullRequestId}` };
			} catch (error) {
				canvas.discard(instanceId);
				throw error;
			}
		},
		/**
		 * The generic `pull-request` canvas contribution. A public locator carries no
		 * account authority, so this deliberately stays the unbound view the canvas has
		 * always opened; it must never inherit the bound opener above. Actions and close
		 * are shared because the host routes them through the registered canvas for
		 * bound instances too.
		 */
		canvas: {
			async open({ instanceId, input }) {
				if (!supportsPullRequestView(input))
					throw new Error("This pull request context is not supported.");
				canvas.setBinding(instanceId, null);
				return canvas.open({ instanceId, input: {} });
			},
			actions: canvas.actions,
			onClose: canvas.onClose,
		},
		reconcile: canvas.reconcile,
		dispose: canvas.dispose,
	};
}

/** @param {readonly string[] | undefined} actions */
function normalizeAuthorizedActions(actions = []) {
	if (
		!Array.isArray(actions) ||
		actions.some((action) => !SUPPORTED_WRITE_ACTIONS.has(action)) ||
		new Set(actions).size !== actions.length
	)
		throw new Error("Unsupported Azure DevOps pull request action grant.");
	return Object.freeze([...actions]);
}

async function resolvePullRequestBinding(urlValue, accountId, authentication) {
	const parsed = parsePullRequestViewContext({ url: urlValue });
	if (!parsed) throw new Error("This pull request context is not supported.");
	const data = await resolveRepository(parsed, { authentication, accountId });
	if (typeof data.project?.id !== "string")
		throw new Error("Azure DevOps returned an invalid repository.");
	return {
		repository: {
			organization: parsed.organization,
			project: data.project.id,
			repositoryId: data.id,
			accountId,
		},
		pullRequestId: parsed.pullRequestId,
	};
}
