import { AsyncResource } from "node:async_hooks";
import { getHost } from "@github/copilot-app";
import { createAgentMerge } from "./agent-merge.mjs";
import { createCreateFromCanvas } from "./create-from.mjs";
import { createCreateFromApi } from "./create-from-api.mjs";
import { createPullRequestUi } from "./pr-ui.mjs";
import { createPullRequestProjectionObserver } from "./pull-request-projection-observer.mjs";
import {
	createPullRequestView,
	supportsPullRequestView,
} from "./pull-request-view.mjs";
import {
	createNativeRepositoryCatalog,
	createRepositoryCatalog,
} from "./repository-catalog.mjs";
import { createRepositoryPicker } from "./repository-picker.mjs";
import { createCloneDescriptor } from "./repository-selection.mjs";

/**
 * @typedef {object} ActivationOptions
 * @property {ReturnType<typeof createRepositoryCatalog> | undefined} [catalog]
 * @property {{accountId: string, authentication: import("./request.mjs").Authentication, fetch?: typeof globalThis.fetch} | undefined} [repositoryDiscovery]
 */

/** @param {ActivationOptions} [options] */
export default async function activate({ catalog, repositoryDiscovery } = {}) {
	const host = /** @type {import("@github/copilot-app").AppHost} */ (getHost());
	const {
		accountId,
		authentication = host.authentication,
		fetch,
	} = repositoryDiscovery ?? {};
	const pullRequestView = createPullRequestView(
		host.authentication,
		host.reportCanvasAction,
		host.pullRequests?.requestFix,
	);
	const mutationRevisions = new Map();
	// Canvas refreshes must not inherit a PR action's authentication scope.
	const prUi = createPullRequestUi(
		host.authentication,
		AsyncResource.bind(pullRequestView.reconcile),
		mutationRevisions,
		host.pullRequests?.createPullRequestError,
	);
	const pullRequestProjectionObserver = createPullRequestProjectionObserver(
		host.authentication,
		mutationRevisions,
	);
	const createFrom = createCreateFromCanvas(host.authentication);
	let releaseProvider;
	try {
		releaseProvider = await host.registerProvider("azure-devops", {
			describe,
			async prSession({ originUrl, number }) {
				return createCreateFromApi(host.authentication, originUrl).resolve(
					number,
					AbortSignal.timeout(15_000),
				);
			},
			agentMerge: createAgentMerge(host.authentication),
			prUi,
			pullRequestProjectionObserver,
			pullRequestView: {
				supports: supportsPullRequestView,
				open: pullRequestView.open,
			},
		});
	} catch (error) {
		pullRequestProjectionObserver.dispose();
		prUi.dispose();
		await pullRequestView.dispose();
		await createFrom.dispose();
		throw error;
	}
	const picker = withCloneDescriptor(
		createRepositoryPicker(
			(telemetry) =>
				catalog ??
				(repositoryDiscovery
					? createRepositoryCatalog({
							accountId,
							authentication,
							fetch,
							telemetry,
						})
					: host.authentication
						? createNativeRepositoryCatalog(
								host.authentication,
								undefined,
								telemetry,
							)
						: undefined),
			host.reportCanvasAction,
			(selection) => {
				if (selection.account) createCloneDescriptor(selection);
			},
		),
	);
	const releases = [];
	try {
		releases.push(await host.registerCanvas("repository-picker", picker));
		// The canvas contribution stays the unbound view. The account-bound open is a
		// separate provider capability above, so a public locator never reaches it.
		releases.push(
			await host.registerCanvas("pull-request", pullRequestView.canvas),
		);
		releases.push(await host.registerCanvas("create-from", createFrom));
	} catch (error) {
		pullRequestProjectionObserver.dispose();
		prUi.dispose();
		for (const release of releases.reverse()) release();
		releaseProvider();
		await picker.dispose();
		await pullRequestView.dispose();
		await createFrom.dispose();
		throw error;
	}
	return async () => {
		pullRequestProjectionObserver.dispose();
		prUi.dispose();
		for (const release of releases.reverse()) release();
		releaseProvider();
		await picker.dispose();
		await pullRequestView.dispose();
		await createFrom.dispose();
	};
}

/** @param {ReturnType<typeof createRepositoryPicker>} picker */
function withCloneDescriptor(picker) {
	const hostOwnedInstances = new Set();
	return {
		...picker,
		async open(input) {
			const opened = await picker.open(input);
			if (input.completionOwner === "host") {
				hostOwnedInstances.add(input.instanceId);
			} else if (input.completionOwner === "guest") {
				hostOwnedInstances.delete(input.instanceId);
			}
			return opened;
		},
		actions: picker.actions.map((action) =>
			action.name === "confirm-selection"
				? {
						...action,
						async handler(input) {
							const projectCompletion = hostOwnedInstances.has(
								input.instanceId,
							);
							const result = await action.handler(input);
							return result.status === "completed" &&
								projectCompletion &&
								result.value &&
								typeof result.value === "object" &&
								!Array.isArray(result.value) &&
								Object.hasOwn(result.value, "account")
								? { ...result, value: createCloneDescriptor(result.value) }
								: result;
						},
					}
				: action,
		),
		async onClose(input) {
			hostOwnedInstances.delete(input.instanceId);
			return picker.onClose(input);
		},
		async dispose() {
			hostOwnedInstances.clear();
			return picker.dispose();
		},
	};
}

async function describe() {
	return {
		displayName: "Azure DevOps",
		description:
			"Browse Azure DevOps repositories, choose branches or open pull requests, and review saved pull requests with your Microsoft account.",
		capabilities: ["provider.describe"],
	};
}
