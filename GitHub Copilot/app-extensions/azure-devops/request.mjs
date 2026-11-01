// @ts-check
/**
 * @typedef {{ getAccessToken(input: { accountId?: string, resource: "azure-devops" }): Promise<{ accessToken: string }> }} Authentication
 */

/** Default body bound, matching the former native transport's cap. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const TOKEN_ORIGINS = new Set([
	"https://dev.azure.com",
	"https://vssps.dev.azure.com",
	"https://app.vssps.visualstudio.com",
]);

/**
 * Read an approved process-only token without taking ownership of native refresh.
 * Omit the account inside host-scoped operations; the host supplies that
 * operation's exact account.
 * @param {Authentication} authentication
 * @param {string | undefined} accountId
 * @param {AbortSignal | undefined} signal
 */
export async function getAccessToken(authentication, accountId, signal) {
	signal?.throwIfAborted();
	const { accessToken } = await waitWithCancellation(
		authentication.getAccessToken(
			accountId === undefined
				? { resource: "azure-devops" }
				: { accountId, resource: "azure-devops" },
		),
		signal,
	);
	if (typeof accessToken !== "string" || !accessToken.trim()) {
		throw new TypeError("Invalid access token");
	}
	signal?.throwIfAborted();
	return accessToken;
}

/**
 * Attach a bearer token only for Azure DevOps service origins, without
 * following redirects that could carry it elsewhere.
 * @param {string} url
 * @param {{ method: string, headers: Record<string, string>, body?: string, signal?: AbortSignal }} init
 * @param {string} accessToken
 * @returns {RequestInit}
 */
export function bearerRequestInit(url, init, accessToken) {
	const parsed = new URL(url);
	if (!TOKEN_ORIGINS.has(parsed.origin) || parsed.username || parsed.password)
		throw new Error("Azure DevOps request URL is not allowed.");
	return {
		...init,
		redirect: "error",
		headers: {
			...init.headers,
			Authorization: `Bearer ${accessToken}`,
			"User-Agent": "ADOGithubApp",
		},
	};
}

/**
 * Cancel this caller's wait without cancelling shared host work.
 * @template T
 * @param {Promise<T>} pending
 * @param {AbortSignal | undefined} signal
 */
export async function waitWithCancellation(pending, signal) {
	if (!signal) return pending;
	/** @type {PromiseWithResolvers<never>} */
	const cancelled = Promise.withResolvers();
	const onAbort = () => cancelled.reject(signal.reason);
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) onAbort();
	try {
		return await Promise.race([cancelled.promise, pending]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}

/**
 * Parse a JSON body without buffering more than `maxBytes`, cancelling the
 * stream on overflow. Body transport failures remain TypeErrors; malformed
 * UTF-8 is reported through `invalid` and malformed JSON as a SyntaxError.
 * @param {Response} response
 * @param {number} maxBytes
 * @param {AbortSignal} signal
 * @param {{ tooLarge(): Error, invalid(): Error }} errors
 * @returns {Promise<unknown>}
 */
export async function readLimitedJson(response, maxBytes, signal, errors) {
	const reader = response.body?.getReader();
	if (!reader) throw errors.invalid();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const decode = (/** @type {Uint8Array | undefined} */ value) => {
		try {
			return decoder.decode(value, { stream: value !== undefined });
		} catch {
			throw errors.invalid();
		}
	};
	let bytes = 0;
	let json = "";
	try {
		if (Number(response.headers.get("content-length")) > maxBytes)
			throw errors.tooLarge();
		while (true) {
			signal.throwIfAborted();
			const { done, value } = await reader.read();
			signal.throwIfAborted();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) throw errors.tooLarge();
			json += decode(value);
		}
		return JSON.parse(json + decode(undefined));
	} finally {
		try {
			await reader.cancel();
		} catch {
			// A failed cleanup must not replace a parse, size, or abort error.
		}
		reader.releaseLock();
	}
}
