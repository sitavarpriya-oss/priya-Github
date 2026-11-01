import { waitWithCancellation } from "./request.mjs";

const MAX_ERROR_BYTES = 4096;
const ERROR_TIMEOUT_MS = 1000;
const ERROR_TYPES = new Set([
	"ArgumentException",
	"ArgumentNullException",
	"ArgumentOutOfRangeException",
	"InvalidOperationException",
	"GitPullRequestCommentThreadContextException",
	"GitPullRequestCommentPositionException",
	"VssServiceException",
]);
const PARAMETERS = new Set([
	"commentThread",
	"threadContext",
	"pullRequestThreadContext",
	"changeTrackingId",
	"iterationContext",
	"firstComparingIteration",
	"secondComparingIteration",
	"filePath",
	"leftFileStart",
	"leftFileEnd",
	"rightFileStart",
	"rightFileEnd",
	"line",
	"offset",
	"content",
	"pullRequestToCreate",
	"pullRequestToCreate.sourceRefName",
	"pullRequestToCreate.targetRefName",
	"sourceRefName",
	"targetRefName",
]);
/** @type {Map<string, "invalid_branch_ref" | "active_pull_request_exists">} */
const CREATION_REASONS = new Map([
	["TF401398", "invalid_branch_ref"],
	["TF401179", "active_pull_request_exists"],
]);

export class AzureDevOpsHttpError extends Error {
	/** @param {number} status */
	constructor(status) {
		super(`Azure DevOps PR request failed (HTTP ${status}).`);
		this.name = "AzureDevOpsHttpError";
		this.status = status;
		/** @type {string | undefined} */
		this.operationStage = undefined;
		/** @type {string | undefined} */
		this.serviceErrorType = undefined;
		/** @type {number | undefined} */
		this.serviceErrorCode = undefined;
		/** @type {string | undefined} */
		this.parameter = undefined;
		/** @type {"invalid_source_ref" | "invalid_target_ref" | "invalid_branch_ref" | "active_pull_request_exists" | undefined} */
		this.reason = undefined;
	}
}

/**
 * Retain only allowlisted service metadata, never the server's free-form
 * message, stack, inner exception, or response body.
 * @param {Response} response
 * @param {AbortSignal} requestSignal
 */
export async function readPullRequestHttpError(response, requestSignal) {
	const error = new AzureDevOpsHttpError(response.status);
	/** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
	let reader;
	const signal = AbortSignal.any([
		requestSignal,
		AbortSignal.timeout(ERROR_TIMEOUT_MS),
	]);
	try {
		reader = response.body?.getReader();
		if (!reader) return error;
		if (Number(response.headers.get("content-length")) > MAX_ERROR_BYTES)
			return error;
		const decoder = new TextDecoder("utf-8", { fatal: true });
		let text = "";
		let bytes = 0;
		while (true) {
			signal.throwIfAborted();
			const { done, value } = await waitWithCancellation(reader.read(), signal);
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_ERROR_BYTES) return error;
			text += decoder.decode(value, { stream: true });
		}
		const body = JSON.parse(text + decoder.decode());
		if (!body || typeof body !== "object" || Array.isArray(body)) return error;
		if (ERROR_TYPES.has(body.typeKey)) error.serviceErrorType = body.typeKey;
		if (
			Number.isInteger(body.errorCode) &&
			body.errorCode >= 0 &&
			body.errorCode <= 2_147_483_647
		)
			error.serviceErrorCode = body.errorCode;
		const message = typeof body.message === "string" ? body.message : undefined;
		const parameter = message
			? /(?:^|\r?\n)Parameter name: ([A-Za-z]+(?:\.[A-Za-z]+)*)\.?\s*$/.exec(
					message,
				)?.[1]
			: undefined;
		if (parameter && PARAMETERS.has(parameter)) error.parameter = parameter;
		if (parameter?.endsWith("sourceRefName"))
			error.reason = "invalid_source_ref";
		else if (parameter?.endsWith("targetRefName"))
			error.reason = "invalid_target_ref";
		else if (message) {
			const code = /^(TF[0-9]{6})(?::|\b)/.exec(message)?.[1];
			error.reason = CREATION_REASONS.get(code);
		}
	} catch {
		// Optional diagnostics must not mask the already-confirmed HTTP failure.
	} finally {
		try {
			await waitWithCancellation(reader?.cancel() ?? Promise.resolve(), signal);
		} catch {
			// Cleanup cannot replace the HTTP status or keep the operation waiting.
		}
		reader?.releaseLock();
	}
	return error;
}

/**
 * @param {unknown} error
 * @returns {{kind: "http", status: number, serviceErrorType?: string, serviceErrorCode?: number, parameter?: string, reason?: "invalid_source_ref" | "invalid_target_ref" | "invalid_branch_ref" | "active_pull_request_exists"} | undefined}
 */
export function pullRequestCreationErrorDetails(error) {
	if (
		!(error instanceof AzureDevOpsHttpError) ||
		!Number.isInteger(error.status) ||
		error.status < 400 ||
		error.status > 599
	)
		return undefined;
	return {
		kind: "http",
		status: error.status,
		...(error.serviceErrorType
			? { serviceErrorType: error.serviceErrorType }
			: {}),
		...(error.serviceErrorCode !== undefined
			? { serviceErrorCode: error.serviceErrorCode }
			: {}),
		...(error.parameter ? { parameter: error.parameter } : {}),
		...(error.reason ? { reason: error.reason } : {}),
	};
}
