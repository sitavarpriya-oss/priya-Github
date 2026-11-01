import { renderMarkdown } from "./assets/pull-request-renderers.js";

const deferred = document.getElementById("deferred-content");
renderMarkdown(
	deferred,
	`\
\`\`\`ts
const highlighted: number = 1;
\`\`\`

\`\`\`ts
${"const oversized: number = 1;\n".repeat(1_000)}\
\`\`\``,
);

window.adoRendererFixture = { renderMarkdown };
