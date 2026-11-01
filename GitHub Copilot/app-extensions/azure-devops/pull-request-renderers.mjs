import Prism from "prismjs";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-c.js";
import "prismjs/components/prism-cpp.js";
import "prismjs/components/prism-csharp.js";
import "prismjs/components/prism-diff.js";
import "prismjs/components/prism-docker.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-java.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-objectivec.js";
import "prismjs/components/prism-powershell.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-ruby.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-swift.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-tsx.js";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { isHttpUrlWithHost } from "./http-url.mjs";

Prism.manual = true;

const NESTING_LIMIT_MESSAGE =
	"Nested Markdown exceeds the preview limit. Open the pull request in Azure DevOps to read the complete text.";
const MAX_HIGHLIGHT_CHARACTERS = 20_000;
const MAX_HIGHLIGHT_LINES = 500;
const MAX_MARKDOWN_HIGHLIGHT_CHARACTERS = 1_024;

const languageAliases = new Map([
	["c#", "csharp"],
	["c++", "cpp"],
	["cs", "csharp"],
	["dotnet", "csharp"],
	["golang", "go"],
	["html", "markup"],
	["js", "javascript"],
	["md", "markdown"],
	["objc", "objectivec"],
	["patch", "diff"],
	["ps1", "powershell"],
	["py", "python"],
	["rb", "ruby"],
	["shell", "bash"],
	["sh", "bash"],
	["text", "plaintext"],
	["ts", "typescript"],
	["xml", "markup"],
	["yml", "yaml"],
	["zsh", "bash"],
]);
const plainLanguages = new Set(["", "none", "plain", "plaintext", "txt"]);
const languageByExtension = new Map([
	[".bash", "bash"],
	[".c", "c"],
	[".cc", "cpp"],
	[".cjs", "javascript"],
	[".cpp", "cpp"],
	[".cs", "csharp"],
	[".csproj", "markup"],
	[".cts", "typescript"],
	[".css", "css"],
	[".dockerfile", "docker"],
	[".fsproj", "markup"],
	[".go", "go"],
	[".h", "c"],
	[".hpp", "cpp"],
	[".htm", "markup"],
	[".html", "markup"],
	[".java", "java"],
	[".js", "javascript"],
	[".json", "json"],
	[".jsonc", "json"],
	[".jsx", "jsx"],
	[".m", "objectivec"],
	[".markdown", "markdown"],
	[".md", "markdown"],
	[".mdx", "markdown"],
	[".mjs", "javascript"],
	[".mm", "objectivec"],
	[".mts", "typescript"],
	[".props", "markup"],
	[".ps1", "powershell"],
	[".psd1", "powershell"],
	[".psm1", "powershell"],
	[".py", "python"],
	[".rb", "ruby"],
	[".razor", "markup"],
	[".rs", "rust"],
	[".sh", "bash"],
	[".sql", "sql"],
	[".svg", "markup"],
	[".swift", "swift"],
	[".targets", "markup"],
	[".ts", "typescript"],
	[".tsx", "tsx"],
	[".vbproj", "markup"],
	[".xhtml", "markup"],
	[".xml", "markup"],
	[".yaml", "yaml"],
	[".yml", "yaml"],
	[".zsh", "bash"],
]);
const syntaxRoleByToken = new Map([
	["atrule", "keyword"],
	["attr-name", "variable"],
	["attr-value", "string"],
	["boolean", "constant"],
	["builtin", "constant"],
	["cdata", "comment"],
	["char", "string"],
	["class-name", "entity"],
	["comment", "comment"],
	["constant", "constant"],
	["deleted", "invalid"],
	["doctype", "comment"],
	["function", "entity"],
	["important", "keyword"],
	["inserted", "tag"],
	["keyword", "keyword"],
	["namespace", "entity"],
	["number", "constant"],
	["parameter", "variable"],
	["property", "constant"],
	["prolog", "comment"],
	["regex", "regexp"],
	["selector", "entity"],
	["string", "string"],
	["symbol", "constant"],
	["tag", "tag"],
	["variable", "variable"],
]);

function normalizeLanguage(value) {
	const language = String(value ?? "")
		.trim()
		.toLowerCase();
	if (plainLanguages.has(language)) return null;
	const normalized = languageAliases.get(language) ?? language;
	return typeof Prism.languages[normalized] === "object" ? normalized : null;
}

export function languageFromPath(value) {
	const path = String(value ?? "");
	const name = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
	if (name === "dockerfile" || name.endsWith(".dockerfile")) return "docker";
	const dot = name.lastIndexOf(".");
	return dot < 0
		? null
		: normalizeLanguage(languageByExtension.get(name.slice(dot)) ?? "");
}

function canHighlight(code, language) {
	// Prism's Markdown grammar can take superlinear time on long unmatched
	// delimiters. Keep synchronous guest rendering responsive by using a much
	// smaller eligibility limit for that grammar.
	const characterLimit =
		language === "markdown"
			? MAX_MARKDOWN_HIGHLIGHT_CHARACTERS
			: MAX_HIGHLIGHT_CHARACTERS;
	if (code.length > characterLimit) return false;
	let lines = 1;
	for (let index = 0; index < code.length; index++) {
		if (code.charCodeAt(index) !== 10) continue;
		lines++;
		if (lines > MAX_HIGHLIGHT_LINES) return false;
	}
	return true;
}

function syntaxRole(types) {
	for (let index = types.length - 1; index >= 0; index--) {
		const role = syntaxRoleByToken.get(types[index]);
		if (role) return role;
	}
	return "default";
}

function appendText(lines, text, types) {
	const role = syntaxRole(types);
	let start = 0;
	for (let index = 0; index <= text.length; index++) {
		if (index !== text.length && text.charCodeAt(index) !== 10) continue;
		if (index > start) {
			const line = lines.at(-1);
			const value = text.slice(start, index);
			const previous = line.at(-1);
			if (previous?.role === role) previous.text += value;
			else line.push({ text: value, role });
		}
		if (index < text.length) lines.push([]);
		start = index + 1;
	}
}

function appendTokenStream(lines, stream, types = []) {
	if (typeof stream === "string") {
		appendText(lines, stream, types);
		return;
	}
	if (Array.isArray(stream)) {
		for (const token of stream) appendTokenStream(lines, token, types);
		return;
	}
	const aliases = Array.isArray(stream.alias)
		? stream.alias
		: stream.alias
			? [stream.alias]
			: [];
	appendTokenStream(lines, stream.content, [...types, stream.type, ...aliases]);
}

function highlightedLines(code, language) {
	const normalized = normalizeLanguage(language);
	if (!normalized || !canHighlight(code, normalized)) return null;
	const lines = [[]];
	try {
		appendTokenStream(lines, Prism.tokenize(code, Prism.languages[normalized]));
		return { language: normalized, lines };
	} catch {
		return { language: normalized, lines: null };
	}
}

function appendSegments(container, segments) {
	for (const segment of segments) {
		if (segment.role === "default") {
			container.append(container.ownerDocument.createTextNode(segment.text));
			continue;
		}
		container.append(
			element(
				container.ownerDocument,
				"span",
				`syntax-${segment.role}`,
				segment.text,
			),
		);
	}
}

function resetHighlightState(container, code) {
	container.textContent = code;
	delete container.dataset.syntaxHighlightError;
	delete container.dataset.syntaxHighlighted;
	delete container.dataset.syntaxLanguage;
}

export function renderCode(container, value, language) {
	const code = String(value ?? "");
	resetHighlightState(container, code);
	const highlighted = highlightedLines(code, language);
	if (!highlighted) return false;
	if (!highlighted.lines) {
		container.dataset.syntaxHighlightError = "true";
		return false;
	}
	container.replaceChildren();
	for (let index = 0; index < highlighted.lines.length; index++) {
		if (index) container.append(container.ownerDocument.createTextNode("\n"));
		appendSegments(container, highlighted.lines[index]);
	}
	container.dataset.syntaxHighlighted = "true";
	container.dataset.syntaxLanguage = highlighted.language;
	return true;
}

export function renderCodeLines(containers, rows, language) {
	if (containers.length !== rows.length)
		throw new TypeError(
			"Code line containers and rows must have equal length.",
		);
	const lines = rows.map((row) => String(row?.text ?? ""));
	for (let index = 0; index < containers.length; index++)
		resetHighlightState(containers[index], lines[index]);
	const normalized = normalizeLanguage(language);
	if (!normalized || !canHighlight(lines.join("\n"), normalized)) return false;
	const original = highlightedSourceLines(rows, "originalLine", normalized);
	const modified = highlightedSourceLines(rows, "modifiedLine", normalized);
	if (!original || !modified) {
		for (const container of containers)
			container.dataset.syntaxHighlightError = "true";
		return false;
	}
	for (let index = 0; index < containers.length; index++) {
		const container = containers[index];
		const row = rows[index];
		const segments =
			row?.kind === "delete"
				? original.get(index)
				: (modified.get(index) ?? original.get(index));
		if (!segments) {
			container.dataset.syntaxHighlightError = "true";
			continue;
		}
		container.replaceChildren();
		appendSegments(container, segments);
		container.dataset.syntaxHighlighted = "true";
		container.dataset.syntaxLanguage = normalized;
	}
	return containers.every(
		(container) => container.dataset.syntaxHighlighted === "true",
	);
}

function highlightedSourceLines(rows, coordinate, language) {
	const result = new Map();
	let segment = [];
	let previous = null;
	const flush = () => {
		if (!segment.length) return true;
		const highlighted = highlightedLines(
			segment.map(({ row }) => String(row.text ?? "")).join("\n"),
			language,
		);
		if (!highlighted?.lines || highlighted.lines.length !== segment.length)
			return false;
		for (let index = 0; index < segment.length; index++)
			result.set(segment[index].index, highlighted.lines[index]);
		segment = [];
		return true;
	};
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		const line = row?.[coordinate];
		if (!Number.isInteger(line)) continue;
		if (previous !== null && line !== previous + 1 && !flush()) return null;
		segment.push({ index, row });
		previous = line;
	}
	return flush() ? result : null;
}

function limitNesting() {
	return (tree) => {
		const pending = [{ node: tree, depth: 0 }];
		while (pending.length) {
			const { node, depth } = pending.pop();
			if (!node.children?.length) continue;
			if (depth >= 64) {
				node.children = [{ type: "text", value: NESTING_LIMIT_MESSAGE }];
				continue;
			}
			for (const child of node.children)
				pending.push({ node: child, depth: depth + 1 });
		}
	};
}

const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(limitNesting)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeRaw)
	.use(() => limitNesting())
	.use(rehypeSanitize, {
		...defaultSchema,
		attributes: {
			...defaultSchema.attributes,
			details: [...(defaultSchema.attributes?.details ?? []), "open"],
		},
	});

const markdownTags = new Set([
	"div",
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"ul",
	"ol",
	"li",
	"pre",
	"code",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"del",
	"br",
	"hr",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"sup",
	"sub",
	"details",
	"summary",
]);

function element(document, tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function* markdownLeaves(node, ancestors = []) {
	if (node.type === "text") {
		yield { node, ancestors };
	} else if (node.type === "element" || node.type === "root") {
		if (!node.children?.length) {
			yield { node, ancestors };
		} else {
			const parents = node.type === "root" ? ancestors : [...ancestors, node];
			for (const child of node.children) yield* markdownLeaves(child, parents);
		}
	}
}

function taskLabel(ancestors) {
	const item = ancestors.findLast((node) => node.tagName === "li");
	if (!item) return "Task (read-only)";
	let text = "";
	for (const leaf of markdownLeaves(item)) {
		if (leaf.node.type === "text") text += leaf.node.value;
		if (text.length > 180) break;
	}
	return `${text.trim().slice(0, 180) || "Task"} (read-only)`;
}

export function sanitizeExternalUrl(href) {
	return typeof href === "string" && isHttpUrlWithHost(href) ? href : undefined;
}

function markdownElement(document, node, ancestors, onLink, listNumbers) {
	if (node.type === "text") return document.createTextNode(node.value);
	const properties = node.properties ?? {};
	if (node.tagName === "img") {
		const alt = String(properties.alt || "No description");
		return element(
			document,
			"span",
			"markdown-image-placeholder",
			`[Image: ${alt.slice(0, 1024)}${alt.length > 1024 ? "… (alt text shortened)" : ""} — remote image not loaded]`,
		);
	}
	if (node.tagName === "input" && properties.type === "checkbox") {
		if (ancestors.some((node) => node.tagName === "a"))
			return element(document, "span", "", properties.checked ? "[x]" : "[ ]");
		const checkbox = element(document, "input", "markdown-task-checkbox");
		checkbox.type = "checkbox";
		checkbox.checked = properties.checked === true;
		checkbox.readOnly = true;
		checkbox.setAttribute("aria-disabled", "true");
		checkbox.setAttribute("aria-label", taskLabel(ancestors));
		checkbox.addEventListener("click", (event) => event.preventDefault());
		return checkbox;
	}
	if (node.tagName === "a") {
		const href = sanitizeExternalUrl(properties.href);
		if (href) {
			const link = element(document, "a", "markdown-link");
			link.href = href;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.addEventListener("click", (event) => {
				if (
					!event.isTrusted ||
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				)
					return;
				// WKWebView can drop anchor popups, and the host's automatic
				// workaround skips loopback URLs. Explicit opens reach its policy.
				event.preventDefault();
				document.defaultView.open(href, "_blank", "noopener,noreferrer");
			});
			if (typeof onLink === "function")
				link.addEventListener("click", () => onLink(href));
			return link;
		}
		return element(document, "span", "markdown-link-text");
	}
	const result = element(
		document,
		markdownTags.has(node.tagName) ? node.tagName : "span",
	);
	if (
		node.tagName === "details" &&
		Object.hasOwn(properties, "open") &&
		properties.open !== false
	) {
		result.setAttribute("open", "");
	}
	if (node.tagName === "pre") {
		result.tabIndex = 0;
		result.setAttribute("role", "group");
		result.setAttribute("aria-label", "Code");
	}
	if (node.tagName === "ol" && Number.isSafeInteger(properties.start)) {
		result.start = properties.start;
	}
	if (node.tagName === "li" && ancestors.at(-1)?.tagName === "ol") {
		const list = ancestors.at(-1);
		if (!listNumbers.has(node)) {
			let number = list.properties?.start ?? 1;
			for (const item of list.children) {
				if (item.tagName === "li") listNumbers.set(item, number++);
			}
		}
		result.value = listNumbers.get(node);
	}
	if (node.tagName === "th") result.scope = "col";
	if (["left", "center", "right"].includes(properties.align)) {
		result.dataset.align = properties.align;
	}
	if (node.tagName === "code") {
		result.className = (properties.className ?? [])
			.filter((name) => /^language-[\w+#-]{1,80}$/.test(name))
			.join(" ");
	}
	if (
		node.tagName === "li" &&
		properties.className?.includes("task-list-item")
	) {
		result.className = "task-list-item";
	}
	return result;
}

/**
 * Parse and sanitize the document before constructing DOM nodes. Images are inert alt
 * placeholders; safe links use the canvas host's external-browser anchor path.
 * onLink observes activation without replacing native link behavior.
 * @param {HTMLElement} container
 * @param {unknown} markdown
 * @param {{onLink?: (url: string) => void}} [options]
 */
export function renderMarkdown(container, markdown, { onLink } = {}) {
	const source = String(markdown ?? "");
	container.dataset.selectable = "true";
	let tree;
	try {
		tree = markdownProcessor.runSync(markdownProcessor.parse(source));
	} catch (error) {
		// Raw HTML can exceed the parser's stack before it yields an AST to bound.
		if (!(error instanceof RangeError)) throw error;
		container.replaceChildren(
			element(
				container.ownerDocument,
				"p",
				"markdown-limit",
				NESTING_LIMIT_MESSAGE,
			),
		);
		return;
	}
	const listNumbers = new WeakMap();
	const content = element(container.ownerDocument, "div", "markdown-body");
	container.replaceChildren(content);
	let previousAncestors = [];
	let parents = [content];
	for (const { node, ancestors } of markdownLeaves(tree)) {
		let shared = 0;
		while (
			shared < ancestors.length &&
			ancestors[shared] === previousAncestors[shared]
		)
			shared++;
		parents = parents.slice(0, shared + 1);
		for (let i = shared; i < ancestors.length; i++) {
			const parent = markdownElement(
				content.ownerDocument,
				ancestors[i],
				ancestors.slice(0, i),
				onLink,
				listNumbers,
			);
			parents.at(-1).append(parent);
			parents.push(parent);
		}
		parents
			.at(-1)
			.append(
				markdownElement(
					content.ownerDocument,
					node,
					ancestors,
					onLink,
					listNumbers,
				),
			);
		previousAncestors = ancestors;
	}
	for (const table of content.querySelectorAll("table")) {
		const scroll = element(
			content.ownerDocument,
			"div",
			"markdown-table-scroll",
		);
		scroll.tabIndex = 0;
		scroll.setAttribute("role", "group");
		scroll.setAttribute("aria-label", "Scrollable table");
		table.replaceWith(scroll);
		scroll.append(table);
	}
	for (const link of content.querySelectorAll("a")) {
		if (!link.textContent.trim()) link.textContent = "Open link";
		link.setAttribute(
			"aria-label",
			`${link.textContent}. Opens in a new browser tab.`,
		);
	}
	for (const code of content.querySelectorAll("pre > code")) {
		if (!(code instanceof HTMLElement)) continue;
		const languageClass = [...code.classList].find((name) =>
			name.startsWith("language-"),
		);
		if (languageClass)
			renderCode(
				code,
				code.textContent,
				languageClass.slice("language-".length),
			);
	}
}
