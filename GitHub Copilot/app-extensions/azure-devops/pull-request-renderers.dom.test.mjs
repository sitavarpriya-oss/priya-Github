import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	renderActivityThread,
	renderDiscussionThread,
} from "./pull-request-discussion-view.mjs";
import { renderCodeLines, renderMarkdown } from "./pull-request-renderers.mjs";

let container;

describe("Discussion status badges", () => {
	test.each(["general", "file", "empty"])(
		"omits unknown/missing status and preserves known badges in %s threads",
		(kind) => {
			const cases = [
				[undefined, null],
				[null, null],
				["unknown", null],
				["StatusUnknown", null],
				["future", null],
				["active", "Active"],
				["fixed", "Resolved"],
				["wontFix", "Won't fix"],
				["closed", "Closed"],
				["byDesign", "By design"],
				["pending", "Pending"],
			];
			for (const [status, label] of cases) {
				const row = document.createElement("li");
				const thread = {
					id: 1,
					status,
					path: kind === "file" ? "/file.txt" : null,
					comments:
						kind === "empty"
							? []
							: [
									{
										id: 1,
										content: "Keep discussion",
										author: { name: "Ada" },
										publishedAt: null,
									},
								],
				};
				const actions = {
					comment: vi.fn(),
					thread: vi.fn(),
					threadLink: vi.fn(),
				};
				renderDiscussionThread(row, thread, {
					reviewActions: actions,
					threadCodeView: { mount: vi.fn() },
				});
				expect(
					[...row.querySelectorAll(".comment-status")].map(
						(badge) => badge.textContent,
					),
				).toEqual(label ? [label] : []);
				expect(row.textContent).not.toMatch(
					/StatusUnknown|Status unknown|null|undefined/,
				);
				expect(row.textContent).toContain(
					kind === "empty" ? "No comments." : "Keep discussion",
				);
				expect(actions.thread).toHaveBeenCalledWith(
					expect.any(HTMLElement),
					thread,
				);
			}
		},
	);
});

test("renders ADO system comments as inert activity entries", () => {
	const row = document.createElement("li");
	renderActivityThread(row, {
		id: 9,
		status: "active",
		path: null,
		activityType: "ReviewersUpdate",
		comments: [
			{
				id: 1,
				content: "added Grace Hopper as a reviewer. <script>unsafe()</script>",
				author: { id: "author", name: "Ada" },
				publishedAt: "2026-09-10T11:00:00Z",
				commentType: "system",
			},
		],
	});
	expect(row.id).toBe("activity-9");
	expect(row.dataset.activityType).toBe("ReviewersUpdate");
	expect(row.querySelector(".activity-message")?.textContent).toBe(
		"Ada added Grace Hopper as a reviewer. ",
	);
	expect(row.querySelector("script")).toBeNull();
	expect(row.querySelector(".activity-icon")).not.toBeNull();
});

test.each([
	["Meo Zhang voted 10", "approved the pull request."],
	["Meo Zhang voted 5", "approved with suggestions."],
	["Meo Zhang voted 0", "reset their feedback."],
])(
	"uses ADO review language for live activity text %s",
	(content, expected) => {
		const row = document.createElement("li");
		renderActivityThread(row, {
			id: 10,
			status: "active",
			path: null,
			comments: [
				{
					id: 1,
					content,
					author: { id: "author", name: "Meo Zhang" },
					publishedAt: "2026-09-10T11:00:00Z",
					commentType: "system",
				},
			],
		});
		expect(row.querySelector(".activity-message")?.textContent).toBe(
			`Meo Zhang ${expected}`,
		);
	},
);

test("activity retains the author when deeply nested HTML reaches the preview limit", () => {
	const row = document.createElement("li");
	renderActivityThread(row, {
		id: 11,
		comments: [
			{
				id: 1,
				content: `${"<div>".repeat(5000)}Report${"</div>".repeat(5000)}`,
				author: { name: "Scan bot" },
				publishedAt: null,
				commentType: "system",
			},
		],
	});
	expect(row.querySelector(".activity-message strong")?.textContent).toBe(
		"Scan bot",
	);
	expect(row.textContent).toContain(
		"Nested Markdown exceeds the preview limit.",
	);
});

test.each(["Markdown", "HTML"])(
	"places all %s activity headings below the entry heading",
	(format) => {
		const row = document.createElement("li");
		const content = Array.from({ length: 6 }, (_, index) => {
			const level = index + 1;
			return format === "Markdown"
				? `${"#".repeat(level)} Heading ${level} [reference](https://example.com/report)`
				: `<h${level}>Heading ${level} <a href="https://example.com/report">reference</a></h${level}>`;
		}).join("\n\n");
		renderActivityThread(row, {
			id: 12,
			comments: [
				{
					id: 1,
					content,
					author: { name: "Scan bot" },
					publishedAt: null,
					commentType: "system",
				},
			],
		});
		expect(
			[...row.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
				(heading) => heading.tagName,
			),
		).toEqual(["H4", ...Array(6).fill("H5")]);
		expect(
			[...row.querySelectorAll("h5")].map((heading) => heading.textContent),
		).toEqual(
			Array.from({ length: 6 }, (_, index) => `Heading ${index + 1} reference`),
		);
		expect(row.querySelectorAll("h5 a")).toHaveLength(6);
		expect(row.querySelector(".activity-message strong")?.textContent).toBe(
			"Scan bot",
		);
	},
);

beforeEach(() => {
	document.body.replaceChildren();
	container = document.createElement("div");
	document.body.append(container);
});

describe("safe canvas Markdown", () => {
	test.each(["", '=""', '="true"', '="1"', '="false"'])(
		"treats authored open%s as a boolean presence attribute",
		(value) => {
			renderMarkdown(
				container,
				`<details open${value}><summary>Report</summary>Results</details>`,
			);
			expect(container.querySelector("details")?.open).toBe(true);
		},
	);

	test("preserves native disclosures and an explicitly authored open state", () => {
		renderMarkdown(
			container,
			"<details><summary><strong>Build report</strong></summary>\n\n## Results\n\nReport content.\n\n<details open><summary>Compiler log</summary>\n\n```ts\nconst passed: boolean = true;\n```\n\n</details>\n\n</details>\n\nAfter the report.",
		);
		const details = [...container.querySelectorAll("details")];
		expect(details).toHaveLength(2);
		expect(details[0].open).toBe(false);
		expect(details[1].open).toBe(true);
		expect(details[0].querySelector("summary strong")?.textContent).toBe(
			"Build report",
		);
		expect(details[0].querySelector("h2")?.textContent).toBe("Results");
		expect(details[0].contains(details[1])).toBe(true);
		expect(details[1].querySelector("code")?.dataset.syntaxHighlighted).toBe(
			"true",
		);
		expect(container.querySelector(".markdown-body > p")?.textContent).toBe(
			"After the report.",
		);
	});

	test("keeps disclosure attributes and embedded active content inert", () => {
		const onLink = vi.fn();
		renderMarkdown(
			container,
			'<details open name="reports" ontoggle="bad()" style="color:red"><summary onclick="bad()" tabindex="9">Report</summary><script>bad()</script><img src="https://untrusted.example/pixel" onerror="bad()"><a href="javascript:bad()">Unsafe</a><a href="https://example.com/report">Read report</a></details>',
			{ onLink },
		);
		expect(container.querySelector("details")?.open).toBe(true);
		expect(
			container.querySelectorAll(
				"[name],[ontoggle],[onclick],[style],[tabindex],script,img,[src],[onerror]",
			),
		).toHaveLength(0);
		const link = container.querySelector("details a");
		expect(container.querySelectorAll("[href]")).toHaveLength(1);
		link.click();
		expect(onLink).toHaveBeenCalledExactlyOnceWith(
			"https://example.com/report",
		);
	});

	test("renders GFM structure, inert HTML, fenced code and read-only tasks", () => {
		renderMarkdown(
			container,
			'# Heading\n\n> Quote\n\n- [x] Complete\n- [ ] Pending\n\n| A | B |\n| - | - |\n| one | two |\n\n```ts\nconst value: string = "<script>bad()</script>";\n```\n\n<script>bad()</script>\n\n**bold** and ~~gone~~',
		);
		expect(container.querySelector("h1")?.textContent).toBe("Heading");
		expect(container.querySelector("blockquote")?.textContent).toContain(
			"Quote",
		);
		expect(container.querySelectorAll("th")).toHaveLength(2);
		const code = container.querySelector("pre code");
		expect(code?.textContent).toBe(
			'const value: string = "<script>bad()</script>";\n',
		);
		expect(code?.dataset.syntaxHighlighted).toBe("true");
		expect(code?.dataset.syntaxLanguage).toBe("typescript");
		expect(code?.querySelector(".syntax-keyword")?.textContent).toBe("const");
		expect(code?.querySelector(".syntax-string")?.textContent).toBe(
			'"<script>bad()</script>"',
		);
		expect(container.querySelector("strong")?.textContent).toBe("bold");
		expect(container.querySelector("del")?.textContent).toBe("gone");
		expect(container.querySelectorAll("script, iframe, style")).toHaveLength(0);
		const tasks = [...container.querySelectorAll('input[type="checkbox"]')];
		expect(tasks).toHaveLength(2);
		expect(tasks[0].checked).toBe(true);
		tasks[0].click();
		expect(tasks[0].checked).toBe(true);
		expect(tasks[0].getAttribute("aria-disabled")).toBe("true");
		expect(tasks[0].getAttribute("aria-label")).toContain("Complete");
	});

	test("keeps details disclosures collapsible", () => {
		renderMarkdown(
			container,
			'<details><summary>Details</summary>\n\nHidden **result**\n</details>\n\n<details open ontoggle="bad()"><summary>Open</summary>Shown</details>',
		);
		const [closed, open] = container.querySelectorAll("details");
		expect(closed.open).toBe(false);
		expect(closed.querySelector("summary")?.textContent).toBe("Details");
		expect(closed.querySelector("strong")?.textContent).toBe("result");
		expect(open.open).toBe(true);
		expect(open.hasAttribute("ontoggle")).toBe(false);
	});

	test("loads TypeScript before TSX so type annotations stay highlighted", () => {
		renderMarkdown(
			container,
			"```tsx\nconst View = ({ value }: { value: number }) => <span>{value}</span>;\n```",
		);
		const code = container.querySelector("pre code");
		expect(code?.dataset.syntaxLanguage).toBe("tsx");
		expect(
			[...code.querySelectorAll(".syntax-constant")].map(
				(token) => token.textContent,
			),
		).toContain("number");
	});

	test("loads YAML before Markdown so front matter is highlighted", () => {
		renderMarkdown(
			container,
			"```md\n---\ntitle: Example\n---\n# Heading\n```",
		);
		const code = container.querySelector("pre code");
		expect(code?.dataset.syntaxLanguage).toBe("markdown");
		expect(
			[...code.querySelectorAll(".syntax-keyword")].map(
				(token) => token.textContent,
			),
		).toContain("title");
	});

	test.each([
		["c#", "csharp", 'public class Example { string value = "ok"; }', "class"],
		["c++", "cpp", "int main() { return 0; }", "return"],
	])(
		"preserves the %s Markdown language alias",
		(alias, language, source, keyword) => {
			renderMarkdown(container, `\`\`\`${alias}\n${source}\n\`\`\``);
			const code = container.querySelector("pre code");
			expect(code?.dataset.syntaxLanguage).toBe(language);
			expect(
				[...code.querySelectorAll(".syntax-keyword")].map(
					(token) => token.textContent,
				),
			).toContain(keyword);
		},
	);

	test("tokenizes deleted and added lines as separate source streams", () => {
		const rows = [
			{
				kind: "delete",
				text: "const oldValue = `",
				originalLine: 1,
				modifiedLine: null,
			},
			{
				kind: "add",
				text: "const value: number = 1;",
				originalLine: null,
				modifiedLine: 1,
			},
			{
				kind: "context",
				text: "tail`;",
				originalLine: 2,
				modifiedLine: 2,
			},
		];
		const cells = rows.map(() => document.createElement("code"));
		expect(renderCodeLines(cells, rows, "typescript")).toBe(true);
		expect(cells[1].querySelector(".syntax-keyword")?.textContent).toBe(
			"const",
		);
		expect(
			[...cells[1].querySelectorAll(".syntax-constant")].map(
				(token) => token.textContent,
			),
		).toContain("number");
	});

	test("resets grammar state between disjoint preview ranges", () => {
		const rows = [
			{
				kind: "context",
				text: "const message = `",
				originalLine: 1,
				modifiedLine: 1,
			},
			{
				kind: "context",
				text: "still inside the template",
				originalLine: 2,
				modifiedLine: 2,
			},
			{
				kind: "context",
				text: "const later: number = 2;",
				originalLine: 20,
				modifiedLine: 20,
			},
		];
		const cells = rows.map(() => document.createElement("code"));
		expect(renderCodeLines(cells, rows, "typescript")).toBe(true);
		expect(cells[2].querySelector(".syntax-keyword")?.textContent).toBe(
			"const",
		);
		expect(
			[...cells[2].querySelectorAll(".syntax-constant")].map(
				(token) => token.textContent,
			),
		).toContain("number");
	});

	test("external links use safe browser anchors with optional callbacks", () => {
		const markdown =
			"[Safe **link**](https://example.com/path) [Bad](javascript:alert%281%29) [Relative](/path) [Hash](#id) [Data](data:text/html,bad) [Encoded](https://%65xample.com)";
		renderMarkdown(container, markdown);
		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com/path");
		expect(link?.target).toBe("_blank");
		expect(link?.rel).toBe("noopener noreferrer");
		expect(link?.getAttribute("aria-label")).toBe(
			"Safe link. Opens in a new browser tab.",
		);
		expect(container.querySelectorAll("a,button")).toHaveLength(1);
		const onLink = vi.fn();
		renderMarkdown(container, markdown, { onLink });
		const links = container.querySelectorAll("a.markdown-link");
		expect(links).toHaveLength(1);
		expect(links[0].textContent).toBe("Safe link");
		expect(container.querySelectorAll("[href]")).toHaveLength(1);
		links[0].click();
		expect(onLink).toHaveBeenCalledExactlyOnceWith("https://example.com/path");
	});

	test("never activates remote images, raw HTML attributes or script URLs", () => {
		renderMarkdown(
			container,
			'![remote alt](https://untrusted.example/pixel.png)\n\n<img src="https://untrusted.example/raw.png" onerror="bad()">\n\n<a href="javascript:bad()">raw</a>',
			{ onLink: vi.fn() },
		);
		expect(
			container.querySelectorAll("img, [src], [srcset], [onerror], a"),
		).toHaveLength(0);
		expect(container.textContent).toContain("remote alt");
	});

	test.each(["", "   "])("gives blank link label %j a usable name", (label) => {
		renderMarkdown(container, `[${label}](https://example.com/path)`);
		const link = container.querySelector("a");
		expect(link?.textContent).toBe("Open link");
		expect(link?.getAttribute("aria-label")).toBe(
			"Open link. Opens in a new browser tab.",
		);
	});

	test.each([
		"https://user:password@example.com/path",
		"https://user@example.com/path",
		"https://:password@example.com/path",
	])("keeps credential-bearing link %s inert", (url) => {
		renderMarkdown(container, `[Reference](${url})`);
		expect(container.textContent).toBe("Reference");
		expect(container.querySelectorAll("a,button,[href]")).toHaveLength(0);
	});

	test("renders long comments continuously without splitting Markdown syntax", () => {
		const code = "const value = 'literal';\n".repeat(4000);
		renderMarkdown(container, `# Start\n\n\`\`\`js\n${code}\`\`\`\n\n**End**`);
		const block = container.querySelector("pre code");
		expect(block).not.toBeNull();
		expect(block.textContent).toBe(code);
		expect(block.dataset.syntaxHighlighted).toBeUndefined();
		expect(container.querySelector("[data-render-next]")).toBeNull();
		expect(container.querySelector("strong")?.textContent).toBe("End");
	});

	test.each([
		["HTML", 256],
		["HTML", 5000],
		["Markdown", 256],
		["Markdown", 5000],
	])(
		"bounds %s at %i levels and keeps the renderer usable",
		(format, depth) => {
			const nested =
				format === "HTML"
					? `${"<div>".repeat(depth)}Nested text${"</div>".repeat(depth)}`
					: `${"> ".repeat(depth)}Nested text`;
			renderMarkdown(container, `# Before\n\n${nested}\n\n# After`);
			expect(container.textContent).toContain(
				"Nested Markdown exceeds the preview limit.",
			);
			expect(container.querySelectorAll("*").length).toBeLessThan(100);
			if (depth === 256 || format === "Markdown") {
				expect(container.querySelector("h1")?.textContent).toBe("Before");
				expect(container.querySelector("h1:last-child")?.textContent).toBe(
					"After",
				);
			}
			renderMarkdown(container, "# Next comment");
			expect(container.querySelector("h1")?.textContent).toBe("Next comment");
		},
	);

	test("re-rendering replaces old content and links", () => {
		const onLink = vi.fn();
		renderMarkdown(container, "[Old](https://example.com)", { onLink });
		renderMarkdown(container, "New");
		expect(container.textContent).toBe("New");
		expect(container.querySelectorAll("a,button")).toHaveLength(0);
	});

	test("keeps all ordered-list items and their numbering", () => {
		renderMarkdown(
			container,
			Array.from({ length: 800 }, (_, i) => `${i + 5}. Entry ${i + 5}`).join(
				"\n",
			),
		);
		const items = container.querySelectorAll("ol > li");
		expect(items).toHaveLength(800);
		expect(items[0].value).toBe(5);
		expect(items[799].value).toBe(804);
	});

	test("keeps many small nodes continuous and remote-image alt text bounded", () => {
		renderMarkdown(container, "[small](https://example.com) ".repeat(3000), {
			onLink: vi.fn(),
		});
		expect(container.querySelectorAll("a.markdown-link")).toHaveLength(3000);
		expect(container.querySelector("[data-render-next]")).toBeNull();
		renderMarkdown(
			container,
			`![${"a".repeat(100_000)}](https://example.com/pixel)`,
		);
		expect(container.textContent.length).toBeLessThan(2000);
	});

	test("renders mixed ADO HTML and Markdown while removing active content", () => {
		const onLink = vi.fn();
		renderMarkdown(
			container,
			'**Markdown** with <strong>HTML</strong>.\n\n<div><p>ADO text</p><ul><li>First</li><li><code>value</code></li></ul><a href="https://example.com/review">Review</a></div>\n\n- Markdown list\n\n<script>bad()</script><iframe src="https://evil.example"></iframe><style>body{display:none}</style><img src=x onerror=bad()><a href="javascript:bad()">Bad link</a>',
			{ onLink },
		);
		expect(
			[...container.querySelectorAll("strong")].map((node) => node.textContent),
		).toEqual(["Markdown", "HTML"]);
		expect(container.querySelectorAll("li")).toHaveLength(3);
		expect(container.querySelector("code").textContent).toBe("value");
		expect(
			container.querySelectorAll("script,iframe,style,[src],[onerror]"),
		).toHaveLength(0);
		expect(container.querySelectorAll("[href]")).toHaveLength(1);
		const link = container.querySelector("a.markdown-link");
		expect(link.getAttribute("href")).toBe("https://example.com/review");
		expect(link.textContent).toBe("Review");
		link.click();
		expect(onLink).toHaveBeenCalledExactlyOnceWith(
			"https://example.com/review",
		);
	});
});
