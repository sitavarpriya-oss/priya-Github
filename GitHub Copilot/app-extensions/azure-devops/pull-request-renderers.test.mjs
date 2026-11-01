// @vitest-environment node
import { describe, expect, test } from "vitest";
import { buildRenderers } from "./build-renderers.mjs";
import { createDiff } from "./pull-request-diff.mjs";
import { sanitizeExternalUrl } from "./pull-request-renderers.mjs";

const rows = (diff) => diff.hunks.flatMap((hunk) => hunk.rows);
const coordinates = (diff) =>
	rows(diff).map(({ kind, text, originalLine, modifiedLine }) => [
		kind,
		text,
		originalLine,
		modifiedLine,
	]);

test("shipped browser module and dependency notices reproduce from the source", async () => {
	const sizes = await buildRenderers({ check: true });
	expect(sizes.bundleBytes).toBeGreaterThan(0);
	expect(sizes.bundleBytes).toBeLessThan(425_000);
	expect(sizes.licenseBytes).toBeGreaterThan(0);
});

test("the shipped diff model runs without a browser document", async () => {
	const { createDiff: bundledDiff } = await import(
		"./assets/pull-request-diff.js"
	);
	expect(coordinates(bundledDiff("old\n", "new\n"))).toEqual([
		["delete", "old", 1, null],
		["add", "new", null, 1],
	]);
	expect(typeof globalThis.document).toBe("undefined");
});

test("external destinations enforce the package-local HTTP URL policy", () => {
	for (const href of [
		undefined,
		null,
		"",
		"/path",
		"#hash",
		"//example.com",
		"javascript:alert(1)",
		"data:text/html,unsafe",
		"file:///private",
		"blob:https://example.com/id",
		"https://%65xample.com",
		"https://user:password@example.com/path",
		"https://user@example.com/path",
		"https://:password@example.com/path",
		"https://example.com/\npath",
		"https://example.com/has space",
		'https://example.com/"quote',
		"https://example.com/\u0085path",
		"https://example.com/\u007fpath",
		"https://example.com/\tpath",
		"https://%31%32%37.0.0.1/",
		"https:/example.com",
		"https:example.com",
		"https://",
	]) {
		expect(sanitizeExternalUrl(href)).toBeUndefined();
	}
	expect(
		sanitizeExternalUrl("https://dev.azure.com/org/project?view=results"),
	).toBe("https://dev.azure.com/org/project?view=results");
	expect(sanitizeExternalUrl("HTTP://example.com/path")).toBe(
		"HTTP://example.com/path",
	);
});

describe("canvas diff model", () => {
	test("includes the complete file by default, not just the changed region", () => {
		const originalLines = Array.from(
			{ length: 620 },
			(_, i) => `line ${i + 1}`,
		);
		const modifiedLines = [...originalLines];
		modifiedLines[310] = "changed line";
		const diff = createDiff(
			`${originalLines.join("\n")}\n`,
			`${modifiedLines.join("\n")}\n`,
		);
		expect(diff.hunks).toHaveLength(1);
		expect(rows(diff)[0]).toMatchObject({
			kind: "context",
			text: "line 1",
			originalLine: 1,
			modifiedLine: 1,
		});
		expect(rows(diff).at(-1)).toMatchObject({
			kind: "context",
			text: "line 620",
			originalLine: 620,
			modifiedLine: 620,
		});
		expect(
			rows(diff)
				.filter((row) => row.originalLine !== null)
				.map((row) => row.originalText ?? row.text),
		).toEqual(originalLines);
		expect(
			rows(diff)
				.filter((row) => row.modifiedLine !== null)
				.map((row) => row.text),
		).toEqual(modifiedLines);
		expect(diff).toMatchObject({ additions: 1, deletions: 1 });
	});

	test("keeps unchanged file content and its final-newline state", () => {
		const diff = createDiff("same\r\nlast", "same\r\nlast");
		expect(diff.status).toBe("unchanged");
		expect(coordinates(diff)).toEqual([
			["context", "same", 1, 1],
			["context", "last", 2, 2],
		]);
		expect(rows(diff).at(-1)).toMatchObject({
			originalNoNewline: true,
			modifiedNoNewline: true,
		});
	});

	test("uses contextual hunks with stable, independent side coordinates", () => {
		const original = "a\nb\nc\nd\ne\nf\ng\n";
		const modified = "a\nnew\nc\nd\ne\nanother\ng\n";
		const diff = createDiff(original, modified, { context: 1 });
		expect(diff).toMatchObject({
			status: "changed",
			additions: 2,
			deletions: 2,
			originalLineCount: 7,
			modifiedLineCount: 7,
		});
		expect(diff.hunks).toHaveLength(2);
		expect(coordinates(diff)).toEqual([
			["context", "a", 1, 1],
			["delete", "b", 2, null],
			["add", "new", null, 2],
			["context", "c", 3, 3],
			["context", "e", 5, 5],
			["delete", "f", 6, null],
			["add", "another", null, 6],
			["context", "g", 7, 7],
		]);
		expect(createDiff(original, modified, { context: 1 })).toEqual(diff);
		expect(new Set(rows(diff).map((row) => row.id)).size).toBe(
			rows(diff).length,
		);
	});

	test("does not classify shifted unchanged lines as replacements", () => {
		expect(coordinates(createDiff("a\nb\nc\n", "new\na\nb\nc\n"))).toEqual([
			["add", "new", null, 1],
			["context", "a", 1, 2],
			["context", "b", 2, 3],
			["context", "c", 3, 4],
		]);
	});

	test("represents empty, no-change, added and deleted files honestly", () => {
		expect(createDiff("", "")).toMatchObject({
			status: "empty",
			hunks: [],
			originalLineCount: 0,
			modifiedLineCount: 0,
		});
		expect(createDiff("same\n", "same\n")).toMatchObject({
			status: "unchanged",
			hunks: [
				{
					rows: [
						{ kind: "context", text: "same", originalLine: 1, modifiedLine: 1 },
					],
				},
			],
		});
		expect(coordinates(createDiff("", "one\n\nthree"))).toEqual([
			["add", "one", null, 1],
			["add", "", null, 2],
			["add", "three", null, 3],
		]);
		expect(coordinates(createDiff("one\n", ""))).toEqual([
			["delete", "one", 1, null],
		]);
	});

	test("retains missing final newlines and never counts their marker as a line", () => {
		const diff = createDiff("one\n", "one");
		expect(diff.originalLineCount).toBe(1);
		expect(diff.modifiedLineCount).toBe(1);
		expect(rows(diff)).toHaveLength(2);
		expect(rows(diff)[1]).toMatchObject({
			kind: "add",
			modifiedLine: 1,
			modifiedNoNewline: true,
			originalNoNewline: false,
		});
	});

	test("handles CRLF, repeated lines, blank lines and whitespace options", () => {
		expect(
			coordinates(createDiff("a\r\n\r\na\r\n", "a\r\nb\r\na\r\n")),
		).toEqual([
			["context", "a", 1, 1],
			["delete", "", 2, null],
			["add", "b", null, 2],
			["context", "a", 3, 3],
		]);
		expect(createDiff("  a  \n", "a\n").status).toBe("changed");
		expect(
			createDiff("  a  \n", "a\n", { ignoreWhitespace: true }).status,
		).toBe("unchanged");
	});

	test("zero context omits unchanged rows and reports accurate hunk ranges", () => {
		const diff = createDiff("a\nb\nc\n", "a\nx\nc\n", { context: 0 });
		expect(diff.hunks[0]).toMatchObject({
			originalStart: 2,
			originalLines: 1,
			modifiedStart: 2,
			modifiedLines: 1,
		});
		expect(rows(diff).map((row) => row.kind)).toEqual(["delete", "add"]);
	});

	test("bounds input and edit-distance work rather than inventing a diff", () => {
		expect(createDiff("x".repeat(1_000_001), "new")).toMatchObject({
			status: "too-large",
			hunks: [],
			additions: null,
			deletions: null,
		});
		const original = Array.from({ length: 1500 }, (_, i) => `old ${i}\n`).join(
			"",
		);
		const modified = Array.from({ length: 1500 }, (_, i) => `new ${i}\n`).join(
			"",
		);
		expect(createDiff(original, modified)).toMatchObject({
			status: "too-large",
			hunks: [],
		});
	});
});
