// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { getHost } from "@github/copilot-app";
import { expect, onTestFinished, test, vi } from "vitest";
import activate from "./app.mjs";
import { createPullRequestUi } from "./pr-ui.mjs";
import { createPullRequestView } from "./pull-request-view.mjs";

vi.mock("@github/copilot-app", () => ({ getHost: vi.fn() }));
vi.mock("./pr-ui.mjs", () => ({
	createPullRequestUi: vi.fn(() => ({ dispose() {} })),
}));
vi.mock("./pull-request-view.mjs", () => ({
	createPullRequestView: vi.fn(),
	supportsPullRequestView: () => false,
}));

test("canvas reconciliation runs outside the PR action's async scope", async () => {
	const operation = new AsyncLocalStorage();
	const scopes = [];
	vi.mocked(createPullRequestView).mockReturnValue({
		open: vi.fn(),
		dispose: vi.fn(),
		reconcile: (...args) => scopes.push({ args, scope: operation.getStore() }),
	});
	vi.mocked(getHost).mockReturnValue({
		owner: "app",
		authentication: {},
		registerProvider: async () => () => {},
		registerCanvas: async () => () => {},
	});
	onTestFinished(await activate());
	const pullRequestChanged = vi.mocked(createPullRequestUi).mock.calls[0][1];

	operation.run({ id: "pr-action" }, () =>
		pullRequestChanged({ pullRequestId: 17 }, true),
	);

	expect(scopes).toEqual([
		{ args: [{ pullRequestId: 17 }, true], scope: undefined },
	]);
});
