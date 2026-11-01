import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
	allowedCanvasPost,
	canvasCommand,
	canvasHeaders,
} from "./canvas-loopback.mjs";
import {
	createCreateFromApi,
	guid,
	hasControlCharacters,
	repositoryOrigin,
} from "./create-from-api.mjs";
import { createCreateFromState } from "./create-from-state.mjs";
import { PickerInputError } from "./repository-picker-state.mjs";

const html = await readFile(
	new URL("./create-from.html", import.meta.url),
	"utf8",
);
const assets = new Map(
	await Promise.all(
		[
			new URL("./create-from-view.mjs", import.meta.url),
			new URL("./canvas-guest-view.mjs", import.meta.url),
			new URL("./github-ui-icons.mjs", import.meta.url),
			new URL("./repository-picker-state.mjs", import.meta.url),
			new URL("./repository-url.mjs", import.meta.url),
			new URL("./repository-picker.css", import.meta.url),
			new URL("./create-from.css", import.meta.url),
		].map(
			async (url) =>
				/** @type {[string, Buffer]} */ ([
					`/${url.pathname.split("/").at(-1)}`,
					await readFile(url),
				]),
		),
	),
);

export function createCreateFromCanvas(authentication) {
	const instances = new Map();
	let server;
	let started;
	let origin;
	let disposed = false;
	function instance(id) {
		const value = instances.get(id);
		if (!value || disposed)
			throw new PickerInputError("Canvas instance is closed.", 404);
		return value;
	}
	async function handle(request, response) {
		canvasHeaders(response);
		if (disposed || request.headers.host !== new URL(origin).host)
			throw new PickerInputError("Canvas is unavailable.", 403);
		const url = new URL(request.url, origin);
		if (request.method === "GET" && assets.has(url.pathname)) {
			response.setHeader(
				"Content-Type",
				url.pathname.endsWith(".css")
					? "text/css; charset=utf-8"
					: "text/javascript; charset=utf-8",
			);
			response.end(assets.get(url.pathname));
			return;
		}
		const match =
			/^\/(canvases|instances)\/([0-9a-f-]{36})(\/confirmation)?$/.exec(
				url.pathname,
			);
		if (!match) throw new PickerInputError("Canvas not found.", 404);
		const entry = instance(match[2]);
		if (match[1] === "canvases" && request.method === "GET" && !match[3]) {
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.end(
				html
					.replace("PICKER_DOCUMENT", entry.state.document())
					.replace("REPOSITORY_NAME", () =>
						entry.repositoryName.replace(
							/[&<>"]/g,
							(character) => `&#${character.charCodeAt(0)};`,
						),
					),
			);
			return;
		}
		if (match[1] !== "instances")
			throw new PickerInputError("Method not allowed.", 405);
		let value;
		if (request.method === "GET" && !match[3])
			value = entry.state.readDocument(request.headers["x-picker-document"]);
		else if (allowedCanvasPost(request, origin)) {
			const command = await canvasCommand(request);
			if (instances.get(match[2]) !== entry || disposed)
				throw new PickerInputError("Canvas instance is closed.", 404);
			value = match[3]
				? await entry.state.acknowledge(
						command,
						request.headers["x-picker-document"],
					)
				: entry.state.change(command, request.headers["x-picker-document"]);
		} else throw new PickerInputError("Canvas request is not allowed.", 403);
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.end(JSON.stringify(value));
	}
	async function start() {
		server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
			handle(request, response).catch((failure) => {
				if (response.destroyed) return;
				response.writeHead(
					failure instanceof PickerInputError ? failure.status : 500,
					{ "Content-Type": "application/json; charset=utf-8" },
				);
				response.end(
					JSON.stringify({
						error:
							failure instanceof PickerInputError
								? failure.message
								: "The picker request failed. Reload and try again.",
					}),
				);
			});
		});
		server.requestTimeout = 5000;
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		origin = `http://127.0.0.1:${server.address().port}`;
	}
	return {
		async open({ instanceId, input, completionOwner = "host" }) {
			if (disposed) throw new Error("Canvas activation is closed.");
			if (!/^[0-9a-f-]{36}$/i.test(instanceId) || completionOwner !== "host")
				throw new Error("Create from requires host-owned dialog completion.");
			if (
				!input ||
				typeof input !== "object" ||
				Array.isArray(input) ||
				Object.keys(input).some(
					(key) => !["originUrl", "accountId"].includes(key),
				) ||
				!Object.hasOwn(input, "originUrl")
			)
				throw new Error("Create from requires a repository origin.");
			if (
				Object.hasOwn(input, "accountId") &&
				(typeof input.accountId !== "string" ||
					!input.accountId.trim() ||
					input.accountId.length > 512 ||
					hasControlCharacters(input.accountId))
			)
				throw new Error("Create from requires a valid project-bound account.");
			const boundAccountId = input.accountId ?? null;
			const source = repositoryOrigin(input.originUrl);
			const originUrl = source.url;
			started ??= start();
			await started;
			if (disposed) throw new Error("Canvas activation is closed.");
			if (instances.has(instanceId)) {
				if (
					instance(instanceId).originUrl !== originUrl ||
					instance(instanceId).boundAccountId !== boundAccountId
				)
					throw new Error(
						"This picker is bound to a different repository or account.",
					);
			} else {
				const state = createCreateFromState(
					createCreateFromApi(authentication, originUrl),
					boundAccountId,
				);
				instances.set(instanceId, {
					state,
					originUrl,
					boundAccountId,
					repositoryName: guid.test(source.repository) ? "" : source.repository,
				});
			}
			return {
				title: "Create from Azure DevOps",
				url: `${origin}/canvases/${instanceId}`,
			};
		},
		actions: [
			{
				name: "dialog-state",
				handler: ({ instanceId, input }) =>
					instance(instanceId).state.observe(input.afterRevision),
			},
			{
				name: "confirm-selection",
				handler: ({ instanceId }) => instance(instanceId).state.confirm(),
			},
		],
		async onClose({ instanceId }) {
			instances.get(instanceId)?.state.close();
			instances.delete(instanceId);
		},
		async dispose() {
			disposed = true;
			for (const entry of instances.values()) entry.state.close();
			instances.clear();
			if (!started) return;
			await started;
			await new Promise((resolve, reject) => {
				server.close((failure) =>
					failure ? reject(failure) : resolve(undefined),
				);
				server.closeAllConnections();
			});
		},
	};
}
