import { PickerInputError } from "./repository-picker-state.mjs";

const MAX_CANVAS_COMMAND_BYTES = 16 * 1024;

/** Shared guards for package-owned loopback canvases. */
export function canvasHeaders(response) {
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("X-Content-Type-Options", "nosniff");
	response.setHeader("Referrer-Policy", "no-referrer");
	response.setHeader(
		"Content-Security-Policy",
		"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
	);
}

export function allowedCanvasPost(request, origin) {
	return (
		request.method === "POST" &&
		request.headers.origin === origin &&
		request.headers["content-type"] === "application/json" &&
		!request.headers["transfer-encoding"] &&
		Number(request.headers["content-length"]) > 0 &&
		Number(request.headers["content-length"]) <= MAX_CANVAS_COMMAND_BYTES
	);
}

export async function canvasCommand(request) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > MAX_CANVAS_COMMAND_BYTES)
			throw new PickerInputError("Canvas request is too large.");
		chunks.push(chunk);
	}
	let command;
	try {
		command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new PickerInputError("Invalid canvas request.");
	}
	if (!command || typeof command !== "object" || Array.isArray(command))
		throw new PickerInputError("Invalid canvas request.");
	return command;
}
