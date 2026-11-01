// @vitest-environment node
import { expect, test, vi } from "vitest";
import {
	AzureDevOpsHttpError,
	pullRequestCreationErrorDetails,
	readPullRequestHttpError,
} from "./pull-request-http-error.mjs";

const signal = () => new AbortController().signal;

test("retains allowlisted rejection metadata, not private response content", async () => {
	const error = await readPullRequestHttpError(
		Response.json(
			{
				typeKey: "ArgumentOutOfRangeException",
				errorCode: 42,
				message: "Private /repository/file content.\r\nParameter name: line",
				typeName: "Private type name",
				innerException: { message: "Private credential" },
			},
			{ status: 400 },
		),
		signal(),
	);
	expect(error).toBeInstanceOf(AzureDevOpsHttpError);
	expect(error).toMatchObject({
		status: 400,
		serviceErrorType: "ArgumentOutOfRangeException",
		serviceErrorCode: 42,
		parameter: "line",
		message: "Azure DevOps PR request failed (HTTP 400).",
	});
	expect(JSON.stringify(error)).not.toMatch(/Private|repository|credential/);
});

test("retains only allowlisted pull request creation diagnostics", async () => {
	const error = await readPullRequestHttpError(
		Response.json(
			{
				typeKey: "ArgumentException",
				errorCode: 42,
				message:
					"Private https://dev.azure.com/org/project/_git/repo?token=secret\r\nParameter name: pullRequestToCreate.targetRefName",
				innerException: { message: "Private credential" },
			},
			{ status: 400 },
		),
		signal(),
	);
	const details = pullRequestCreationErrorDetails(error);
	expect(details).toEqual({
		kind: "http",
		status: 400,
		serviceErrorType: "ArgumentException",
		serviceErrorCode: 42,
		parameter: "pullRequestToCreate.targetRefName",
		reason: "invalid_target_ref",
	});
	expect(JSON.stringify(details)).not.toMatch(
		/Private|dev\.azure|token|credential|:\/\//,
	);
});

test.each([
	["TF401398: Private source and target branch details", "invalid_branch_ref"],
	[
		"TF401179: Private existing pull request details",
		"active_pull_request_exists",
	],
])(
	"maps known ADO creation errors without retaining their text",
	async (message, reason) => {
		const error = await readPullRequestHttpError(
			Response.json({ errorCode: 0, message }, { status: 400 }),
			signal(),
		);
		expect(pullRequestCreationErrorDetails(error)).toEqual({
			kind: "http",
			status: 400,
			serviceErrorCode: 0,
			reason,
		});
		expect(JSON.stringify(error)).not.toContain("Private");
	},
);

test("does not classify arbitrary failures as safe creation diagnostics", () => {
	expect(
		pullRequestCreationErrorDetails(
			new Error("Private https://dev.azure.com/repository?token=secret"),
		),
	).toBeUndefined();
});

test.each([
	{
		typeKey: "PrivateRepositoryException",
		errorCode: -1,
		message: "Parameter name: secret",
	},
	{
		typeKey: "ArgumentException",
		errorCode: "42",
		message: "content Parameter name: line",
	},
	{ typeKey: {}, errorCode: 2 ** 32, message: { secret: "value" } },
	null,
	[],
])("does not retain arbitrary server metadata: %j", async (body) => {
	const error = await readPullRequestHttpError(
		Response.json(body, { status: 400 }),
		signal(),
	);
	expect(error.status).toBe(400);
	expect(error.serviceErrorCode).toBeUndefined();
	expect(error.parameter).toBeUndefined();
	expect(error.reason).toBeUndefined();
	expect(JSON.stringify(error)).not.toMatch(/PrivateRepository|secret|value/);
});

test.each([
	"invalid JSON",
	JSON.stringify({ typeKey: "ArgumentException", message: "x".repeat(4096) }),
])(
	"preserves the HTTP failure for malformed or oversized diagnostics",
	async (body) => {
		const error = await readPullRequestHttpError(
			new Response(body, { status: 400 }),
			signal(),
		);
		expect(error.status).toBe(400);
		expect(error.serviceErrorType).toBeUndefined();
	},
);

test("cancels an oversized streaming body", async () => {
	const cancel = vi.fn();
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(4097));
		},
		cancel,
	});
	const error = await readPullRequestHttpError(
		new Response(body, { status: 400 }),
		signal(),
	);
	expect(error.status).toBe(400);
	expect(cancel).toHaveBeenCalledOnce();
});

test("a stalled diagnostic body has its own bounded wait and is cancelled", async () => {
	const cancel = vi.fn();
	const error = await readPullRequestHttpError(
		new Response(new ReadableStream({ cancel }), { status: 400 }),
		signal(),
	);
	expect(error.status).toBe(400);
	expect(cancel).toHaveBeenCalledOnce();
});

test("request cancellation does not mask an already-confirmed HTTP rejection", async () => {
	const controller = new AbortController();
	const cancel = vi.fn();
	const pending = readPullRequestHttpError(
		new Response(new ReadableStream({ cancel }), { status: 403 }),
		controller.signal,
	);
	controller.abort();
	const error = await pending;
	expect(error.status).toBe(403);
	expect(cancel).toHaveBeenCalledOnce();
});

test("an unavailable diagnostic body does not replace the known HTTP status", async () => {
	const response = Response.json({ message: "private" }, { status: 400 });
	const reader = response.body.getReader();
	try {
		const error = await readPullRequestHttpError(response, signal());
		expect(error.status).toBe(400);
		expect(error.serviceErrorType).toBeUndefined();
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
});

test("a diagnostic cleanup failure does not mask the HTTP rejection", async () => {
	const response = new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(4097));
			},
			cancel() {
				return Promise.reject(new Error("Private cleanup failure"));
			},
		}),
		{ status: 400 },
	);
	const error = await readPullRequestHttpError(response, signal());
	expect(error.status).toBe(400);
	expect(JSON.stringify(error)).not.toContain("Private");
});
