import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const origin = "http://ado-renderer.test";
const moduleUrl = `${origin}/assets/pull-request-renderers.js`;
const bundle = await readFile(
	new URL("./assets/pull-request-renderers.js", import.meta.url),
	"utf8",
);
const fixtureUrl = `${origin}/pull-request-renderers.browser.fixture.mjs`;
const fixture = await readFile(
	new URL("./pull-request-renderers.browser.fixture.mjs", import.meta.url),
	"utf8",
);

declare global {
	interface Window {
		adoRendererFixture: Pick<
			typeof import("./pull-request-renderers.mjs"),
			"renderMarkdown"
		>;
	}
}

test.beforeEach(async ({ page }) => {
	await page.route(`${origin}/**`, async (route) => {
		if (route.request().url() === moduleUrl) {
			await route.fulfill({ contentType: "text/javascript", body: bundle });
		} else if (route.request().url() === fixtureUrl) {
			await route.fulfill({ contentType: "text/javascript", body: fixture });
		} else {
			await route.fulfill({
				contentType: "text/html",
				body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="deferred-content"></div><div id="content"></div><script type="module" src="/pull-request-renderers.browser.fixture.mjs"></script></body></html>',
			});
		}
	});
	await page.goto(origin);
	await page.waitForFunction(() => Boolean(window.adoRendererFixture));
});

for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
	test(`loopback links use explicit popup activation for ${hostname}`, async ({
		page,
	}) => {
		const destination = `http://${hostname}:43210/reference`;
		await page
			.context()
			.route(destination, (route) =>
				route.fulfill({ body: "Local reference" }),
			);
		await page.evaluate((url) => {
			const open = window.open.bind(window);
			window.open = (...args) => {
				document.body.dataset.popupRequest = JSON.stringify(args);
				return open(...args);
			};
			window.adoRendererFixture.renderMarkdown(
				document.getElementById("content"),
				`<a href="${url}">Local reference</a>`,
			);
		}, destination);
		const link = page.getByRole("link", {
			name: "Local reference. Opens in a new browser tab.",
			exact: true,
		});
		for (const activation of ["click", "Enter"]) {
			await page.evaluate(() => {
				delete document.body.dataset.popupRequest;
			});
			const popupPromise = page.waitForEvent("popup");
			if (activation === "click") await link.click();
			else await link.press("Enter");
			const popup = await popupPromise;
			await expect(popup).toHaveURL(destination);
			expect(page.context().pages()).toHaveLength(2);
			expect(await popup.evaluate(() => window.opener === null)).toBe(true);
			await popup.close();
			await expect(page.locator("body")).toHaveAttribute(
				"data-popup-request",
				JSON.stringify([destination, "_blank", "noopener,noreferrer"]),
			);
			await expect(page).toHaveURL(`${origin}/`);
		}
	});
}

test("the shipped dependency-free module keeps untrusted Markdown inert", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).origin !== origin) requests.push(request.url());
	});
	await page.evaluate(() => {
		const { renderMarkdown } = window.adoRendererFixture;
		renderMarkdown(
			document.getElementById("content"),
			'# Safe\n\n[Open](https://example.com/docs) [Bad](javascript:alert%281%29)\n\n![pixel](https://remote.invalid/pixel)\n\n<img src="https://remote.invalid/raw" onerror="window.compromised=true">\n\n<script>window.compromised=true</script>\n\n- [x] Completed',
			{
				onLink: (href: string) => {
					document.body.dataset.opened = href;
				},
			},
		);
	});
	await expect(page.getByRole("heading", { name: "Safe" })).toBeVisible();
	await expect(page.locator("#content img, #content script")).toHaveCount(0);
	await expect(page.getByRole("checkbox")).toBeChecked();
	await page.getByRole("checkbox").focus();
	await page.keyboard.press("Space");
	await expect(page.getByRole("checkbox")).toBeChecked();
	expect(requests).toEqual([]);
	await page
		.context()
		.route("https://example.com/docs", (route) =>
			route.fulfill({ body: "Documentation" }),
		);
	await page
		.getByRole("link", {
			name: "Open. Opens in a new browser tab.",
			exact: true,
		})
		.focus();
	const popupPromise = page.waitForEvent("popup");
	await page.keyboard.press("Enter");
	const popup = await popupPromise;
	await expect(popup).toHaveURL("https://example.com/docs");
	await popup.close();
	await expect(page.locator("body")).toHaveAttribute(
		"data-opened",
		"https://example.com/docs",
	);
	expect(page.url()).toBe(`${origin}/`);
	expect(requests).toEqual([]);
	expect(await page.evaluate(() => "compromised" in window)).toBe(false);

	const lookalikeUrl = "http://ado-renderer.test.attacker.invalid/probe";
	await page.route(lookalikeUrl, (route) => route.fulfill({ body: "" }));
	await page.evaluate(async (url) => {
		await fetch(url, { mode: "no-cors" });
	}, lookalikeUrl);
	expect(requests).toEqual([lookalikeUrl]);
});

test("the shipped module highlights fenced code without changing its text", async ({
	page,
}) => {
	await page.evaluate(() => {
		window.adoRendererFixture.renderMarkdown(
			document.getElementById("content"),
			'```ts\nconst value: string = "<script>safe text</script>";\n```',
		);
	});
	const code = page.locator("#content pre code");
	await expect(code).toHaveAttribute("data-syntax-highlighted", "true");
	await expect(code).toHaveAttribute("data-syntax-language", "typescript");
	await expect(code.locator(".syntax-keyword")).toHaveText("const");
	await expect(code.locator(".syntax-string")).toHaveText(
		'"<script>safe text</script>"',
	);
	await expect(code).toHaveText(
		'const value: string = "<script>safe text</script>";',
	);
	await expect(page.locator("#content script")).toHaveCount(0);
});

test("Prism's deferred callback leaves bounded renderer output unchanged", async ({
	page,
}) => {
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
	const code = page.locator("#deferred-content pre code");
	await expect(code).toHaveCount(2);
	await expect(code.nth(0)).toHaveAttribute("data-syntax-highlighted", "true");
	await expect(code.nth(0).locator(".syntax-keyword")).toHaveText("const");
	await expect(code.nth(0).locator(".token")).toHaveCount(0);
	await expect(code.nth(1)).not.toHaveAttribute(
		"data-syntax-highlighted",
		"true",
	);
	await expect(code.nth(1).locator("span")).toHaveCount(0);
	await expect(code.nth(1)).toContainText("const oversized: number = 1;");
});

test("costly Markdown fences fall back before the general size limit", async ({
	page,
}) => {
	const shortMarkdown = "[".repeat(1_000);
	const costlyMarkdown = "[".repeat(19_000);
	const oversizedTypeScript = "a".repeat(20_001);
	await page.evaluate(
		({ shortMarkdown, costlyMarkdown, oversizedTypeScript }) => {
			const fence = (language: string, code: string) =>
				`\`\`\`${language}\n${code}\n\`\`\``;
			window.adoRendererFixture.renderMarkdown(
				document.getElementById("content"),
				[
					fence("md", shortMarkdown),
					...Array(4).fill(fence("md", costlyMarkdown)),
					fence("txt", costlyMarkdown),
					fence("ts", oversizedTypeScript),
				].join("\n\n"),
			);
		},
		{ shortMarkdown, costlyMarkdown, oversizedTypeScript },
	);
	const code = page.locator("#content pre code");
	await expect(code).toHaveCount(7);
	await expect(code.nth(0)).toHaveAttribute("data-syntax-highlighted", "true");
	await expect(code.nth(0)).toHaveAttribute("data-syntax-language", "markdown");
	for (let index = 1; index < 7; index++) {
		await expect(code.nth(index)).not.toHaveAttribute(
			"data-syntax-highlighted",
			"true",
		);
		await expect(code.nth(index).locator("span")).toHaveCount(0);
	}
	expect(await code.nth(1).textContent()).toBe(`${costlyMarkdown}\n`);
	expect(await code.nth(5).textContent()).toBe(`${costlyMarkdown}\n`);
	expect(await code.nth(6).textContent()).toBe(`${oversizedTypeScript}\n`);
});
