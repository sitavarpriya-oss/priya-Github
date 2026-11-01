export const CREATION_PROMPT = `# Pull Request Creation

The user wants to open a pull request for the current session. Use the context block appended
to this prompt for the current branch, target branch, and requested draft value.
Resolve omitted change-summary, upstream, and Git-status fields from the live repository.

Do NOT delegate this to a subagent. You must perform all steps yourself in the main conversation context because only the main agent has access to the \`create_pull_request\` tool.

The user likes the state of the code.
The user requested a PR.

If upstream_branch is "none", there is no upstream branch yet.

This is the app-managed Azure DevOps creation flow. Do not use \`az repos pr create\`, HTTP, or another creation route if the native tool fails.

Follow this direct workflow:

1. Use what you already learned earlier in this session and the appended prompt context as your primary source of truth for what changed and why.
2. Check live Git status in this workspace on its execution host before deciding whether to commit; the appended counts and status are advisory and may be stale. Zero branch commits or changed files does not mean the working tree is clean. If there are uncommitted changes, inspect only those changes, only as much as needed to write an accurate commit message, then commit them. Follow any instructions the user gave you about commit messages. If the commit fails, stop and explain the blocker; do not push or create a PR.
3. Before calling \`create_pull_request\`, verify that \`origin\` has local HEAD at the source branch's full ref (sourceRef), even when has_unpushed_commits is false or the branch tracks another remote. Compare \`git rev-parse HEAD\` with \`git ls-remote origin <sourceRef>\`, replacing <sourceRef> with the current source ref such as refs/heads/feature. If the remote ref is missing or differs, use \`git push origin HEAD:<sourceRef>\`, then verify the remote SHA again. An up-to-date upstream on another remote or under another branch name is not sufficient. Preserve any existing upstream configuration. Use configured Git credentials; app Microsoft sign-in alone does not provide Git push authentication. Do not force-push, extract app credentials, change origin, or publish to a different repository. If origin is unavailable, verification fails, or push fails, stop and explain the blocker; do not create a PR.
4. If you need a quick summary of the final branch diff before writing the PR, prefer \`get_changes_overview\`.
5. Read targeted file diffs only when what you already know from this session, the appended prompt context, and \`get_changes_overview\` are still not enough. Avoid broad or redundant full-repo diff commands unless something is unclear.
6. Check for a default \`pull_request_template.md\` or named templates in a \`PULL_REQUEST_TEMPLATE/\` directory under the repository root, \`docs/\`, or \`.github/\`. Also check ADO templates under \`.azuredevops/\`, including \`.azuredevops/pull_request_template.md\` and \`.azuredevops/pull_request_template/branches\`. Select the template appropriate for the change, read it, and use its structure for the PR body.
7. Call \`create_pull_request\` after the current session's branch is ready. Do not use it for another repository, head branch, or session:
   - title: concise title under 80 characters
   - body: a nonempty Markdown description following the guidelines below, at most 8192 UTF-8 bytes
   - draft: the requested draft value
   The tool selects the current session's repository, head, and repository account automatically. Normally omit \`base_branch\` to preserve the workspace-selected target, including a stacked parent. Supply it only when the user or established session context identifies a different intended target. Never guess \`main\` or the repository default because creation failed. \`maintainerCanModify\` is GitHub-only.
8. Diagnose failures before retrying. If PR creation may have succeeded, check for the existing PR before another creation attempt. A reported remote success with local linking/ref-persistence failure is not a reason to create again; report the existing PR and the synchronization blocker. Ask the user when the intended target or safe recovery is unclear. Ordinary failures do not authorize CLI fallback; do not use \`az repos pr create\`, HTTP, or another creation route on tool failure.
9. If the user supplied a source work item, include its repository-supported Azure DevOps work-item reference in the PR body. Do not invent a work-item association.
10. After \`create_pull_request\` succeeds, the UI already renders a confirmation widget with the PR link. Do NOT echo the PR number, URL, or a "PR opened: <url>" line in your reply. Keep the closing message minimal (or empty) so the widget stands on its own.

## Writing a great PR description

If you found an appropriate PR template in step 6, you **MUST** use it for the PR body. If a section is not applicable, leave it empty or write "N/A". **DO NOT** remove or skip sections from the template. Apply the writing principles below within each section.

If no appropriate PR template was found, write a freeform description following these principles:

1. **Lead with the "why".** Open with 1-2 sentences explaining the motivation: what problem
   exists, what user need prompted this, or what opportunity this captures. A reviewer who
   understands *why* a change exists can evaluate *how* it was done much faster.

2. **Summarize the approach, not the file list.** Describe the key design decisions and how
   the pieces fit together. "Adds a cache layer in front of the API client so repeated
   fetches during render don't hit the network" is far more useful than "Modified api.ts
   and cache.ts." Think about what a teammate would need to know in a 30-second skim.

3. **Call out anything surprising or non-obvious.** Mention trade-offs, temporary workarounds,
   migration considerations, or areas where you'd appreciate careful review. This builds
   trust with reviewers and prevents misunderstandings.

4. **Use markdown structure for readability.** For larger PRs, use short paragraphs or a
   brief bulleted list to break up the description. Keep it scannable; dense walls of
   text get skimmed past.

5. **Keep the length proportional to the change.** A one-line fix needs one sentence.
   A multi-file feature deserves a short paragraph or two. Never pad with filler.

6. **Prefer plain ASCII punctuation in PR text.** Avoid em dashes, en dashes, and
   smart quotes when simple ASCII punctuation works. This reduces the chance of mangled
   text when content is posted through CLI flows.

## Embedding visuals (optional)

When visuals would genuinely help reviewers understand the changes, such as architecture diagrams,
before/after UI screenshots, or short video recordings, use the repository's supported Azure DevOps
attachment workflow. Do not use GitHub's user-attachments API for an ADO repository.

Only do this when visuals add real value. Don't generate media for trivial or text-only changes.
`;
