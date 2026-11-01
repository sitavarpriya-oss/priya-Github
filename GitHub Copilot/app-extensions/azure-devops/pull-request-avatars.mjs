import { waitWithCancellation } from "./request.mjs";

const MAX_BYTES = 256 * 1024;

/** Rebuild only observed ADO profile routes; never forward a response URL as authority. */
export function avatarUrl(value, organization) {
	const url = new URL(value);
	const base = `https://dev.azure.com/${encodeURIComponent(organization)}`;
	if (url.origin !== "https://dev.azure.com" || url.username || url.password)
		throw new Error("Profile photo URL is not allowed.");
	const graph = new URL(`${base}/_apis/GraphProfile/MemberAvatars/`).pathname;
	if (url.pathname.startsWith(graph)) {
		const descriptor = url.pathname.slice(graph.length);
		if (/^[a-zA-Z0-9._~-]{1,512}$/.test(descriptor))
			return `${base}/_apis/GraphProfile/MemberAvatars/${descriptor}`;
	}
	if (url.pathname === new URL(`${base}/_api/_common/identityImage`).pathname) {
		const id = url.searchParams.get("id");
		if (/^[a-f0-9-]{36}$/i.test(id ?? ""))
			return `${base}/_api/_common/identityImage?id=${encodeURIComponent(id)}&size=small`;
	}
	throw new Error("Profile photo URL is not allowed.");
}

/** @param {Response} response @param {AbortSignal} signal */
export async function readAvatar(response, signal) {
	const contentType = response.headers
		.get("content-type")
		?.split(";")[0]
		.trim()
		.toLowerCase();
	if (
		!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
			contentType,
		)
	) {
		await response.body?.cancel();
		throw new Error("Profile photo format is unsupported.");
	}
	if (Number(response.headers.get("content-length")) > MAX_BYTES) {
		await response.body?.cancel();
		throw new Error("Profile photo exceeds the size limit.");
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Profile photo is empty.");
	const chunks = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await waitWithCancellation(reader.read(), signal);
			if (done) break;
			length += value.length;
			if (length > MAX_BYTES)
				throw new Error("Profile photo exceeds the size limit.");
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
	const content = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		content.set(chunk, offset);
		offset += chunk.length;
	}
	const ascii = (start, end) =>
		new TextDecoder().decode(content.subarray(start, end));
	const matches = {
		"image/png": [137, 80, 78, 71, 13, 10, 26, 10].every(
			(byte, index) => content[index] === byte,
		),
		"image/jpeg":
			content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff,
		"image/gif": ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
		"image/webp": ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
	};
	if (!matches[contentType])
		throw new Error("Profile photo content is invalid.");
	return { content, contentType };
}

/** A binding owns this cache, including failed reads; photos never block overview delivery. */
export function createAvatarCache(load) {
	let lifetime = new AbortController();
	const cache = new Map();
	const queue = [];
	let active = 0;
	function drain() {
		while (active < 3 && queue.length) {
			const job = queue.shift();
			if (job.signal.aborted) continue;
			active++;
			waitWithCancellation(
				Promise.resolve().then(() => load(job.key, job.signal)),
				job.signal,
			)
				.then(job.resolve, job.reject)
				.finally(() => {
					active--;
					drain();
				});
		}
	}
	return {
		get(key) {
			const old = cache.get(key);
			if (old && old.expires > Date.now()) return old.promise;
			if (queue.length >= 64)
				return Promise.reject(new Error("Profile photo requests are busy."));
			const signal = AbortSignal.any([
				lifetime.signal,
				AbortSignal.timeout(30_000),
			]);
			const deferred = Promise.withResolvers();
			const promise = waitWithCancellation(deferred.promise, signal);
			const entry = { promise, expires: Infinity };
			cache.set(key, entry);
			promise.then(
				() => {
					entry.expires = Date.now() + 300_000;
				},
				() => {
					entry.expires = Date.now() + 30_000;
				},
			);
			if (cache.size > 128) {
				for (const [id, item] of cache) {
					if (item.expires !== Infinity) {
						cache.delete(id);
						break;
					}
				}
			}
			queue.push({ key, signal, ...deferred });
			drain();
			return promise;
		},
		clear() {
			lifetime.abort();
			lifetime = new AbortController();
			queue.length = 0;
			cache.clear();
		},
	};
}
