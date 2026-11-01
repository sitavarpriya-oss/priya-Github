# Azure DevOps app extension

**Work in progress.** The host-owned `azure_devops` flag defaults on for eligible staff and preserves manual preferences. Installation of the featured Azure DevOps plugin independently grants access when the hidden, default-off `azure_devops_plugin_activation` online experiment enrolls the user. Staff-first and public audiences are controlled by ExP, not a hard staff-only admission gate. Streamer Mode retains this public enrollment and Microsoft sign-in while removing staff-only access; remote disables still veto activation. The package provides repository discovery, clone handoff, Create from branch/PR, PR creation and status, a retained PR view, review submission and headless Agent merge. Full GitHub parity is not implemented.

Only HTTPS `dev.azure.com` origins are supported (username-only origins are normalized; passwords, queries and fragments are not). `remoteAliases` map `visualstudio.com` and SSH remotes to them. Authenticated operations require a Microsoft account.

Repository URL lookup recognizes the optional `/_git/_optimized/<repository>`
path on both `dev.azure.com` and `visualstudio.com`, including legacy
`DefaultCollection` paths. Legacy optimized remotes map to the same canonical
`dev.azure.com` repository as their non-optimized equivalents.

## Manual fixes

Manual completion and Agent merge use the same permitted merge-method ordering
and Azure DevOps saved strategy. Without a permitted saved strategy, both select
Squash commit when allowed, then fall back to no-fast-forward, rebase and
rebase-with-merge. The method menu retains Azure DevOps's display order; the
drawer has no separate default policy.

The PR canvas offers **Fix** per comment thread, **Fix unresolved comments** (up to 50), **Fix failing checks** (required builds) and **Resolve conflicts**. Each click queues one request in the workspace session through `host.pullRequests.requestFix`; it never enables Agent merge or completes the PR. A requested comment shows **Fix requested** until its status changes; checks and conflicts until the source commit (or, for conflicts, the merge status) changes. This state is in memory only; it clears if queuing fails and stays if the outcome is unknown. Results appear in chat.

Adding a local folder is separate from selecting an ADO repository in the picker.
A checkout with a secondary GitHub remote can acquire a native GitHub identity,
but session creation remains blocked if its `origin` cannot verify that identity.
When the `azure_devops` feature flag is enabled, the error explains the
GitHub identity requirement and the provider-picker recovery option. With that
feature disabled, existing error guidance is unchanged. Adding a local folder
does not create an ADO binding or add legacy-origin support to provider operations.

## Package contract

`manifest.json` declares `engines.github-app: ^0.2.0`, activation `app`, entry `app.mjs`, and provider `azure-devops` in package `com.microsoft.azure-devops`. It contributes metadata, Agent merge, PR-view recognition, native PR-session metadata and the `repository-picker`, `create-from` and `pull-request` canvases.

`activate()` imports `getHost` from `@github/copilot-app`, registers contributions and returns a disposer. `{catalog}` and `{repositoryDiscovery}` are test overrides. There is no CLI extension, guest authentication bridge or ambient credential discovery.

## Authentication boundary

The host exposes `listAccounts({resource})` and `getAccessToken({accountId?, resource})`. Account pickers show `secondaryLabel` (the UPN), never an id. Native code owns account validation, refresh and grants; the package requests a token per operation and performs ADO HTTP itself.

`request.mjs` sends bearer tokens only to `dev.azure.com`, `vssps.dev.azure.com` and `app.vssps.visualstudio.com`, and rejects redirects. Every outbound ADO HTTP request includes `User-Agent: ADOGithubApp`. JSON responses are limited to 2 MiB unless a read sets a stricter bound. Tokens never reach guests, completion payloads, URLs, logs, errors or storage.

## Repository picker

The picker searches all signed-in Microsoft accounts together. Each organization uses the oldest account that lists it; failing accounts are skipped. With no account, the picker offers **Open Account settings**.

Search is case-insensitive and matches partial names or `organization/project/repository` segments:

- Without a project segment, it lists the first 100 repositories of the matching organization. A search with no `/` also searches up to 10 organizations whose names start with it, sharing the 100-result limit.
- With a project segment, it streams that project's complete catalog and shows the first 100 matches.
- A complete path first tries one addressed lookup and puts the exact repository first.
- Exact organization and project names beat partial matches.
- Complete repository URLs on `dev.azure.com` or `{organization}.visualstudio.com` resolve to one canonical `organization/project/repository` result in the app-hosted picker. The user selects that result before the host completes the handoff; partial organization or project URLs scope the searchable results.

Searches debounce 300 ms, serialize upstream reads and give each read 30 seconds. Results are cached per open picker. There is no pagination, background enumeration or automatic retry; failures stay visible with Retry. `auth_required` keeps recovery inline: the picker names the failing Microsoft account. Open Account settings, update authorization for that account, then retry the current picker.

If an entered repository URL requires a missing Microsoft account, the picker
offers the same inline Account settings recovery even before initial discovery
settles. Completion stays unavailable until the account requirement is cleared.
The entered URL is retained for retry; an account-change notification re-resolves
an app-hosted URL result. The package also exposes the existing host
`accountAuthorization: { accountReference: null }` contract, without adding native
dialog controls.

Confirmed values contain only `{id, name}` per level, plus the account. Native code validates and authorizes the clone; selection success is not clone success.

The app-hosted dialog follows the native GitHub single-select interaction: click
or press Enter on a repository row to continue, without a second **Select
repository** action. The host still calls the package confirmation action, so
the live document/revision handshake and stale-selection rejection remain in
force.

Its shell follows the GitHub repository page in Quick Open: a headerless
640-by-400 dialog, a full-width search input, a **Repositories** group, the same
highlighted-row fill and keyboard rail, and the same trailing Return icon.
Rows use the same direct action model: click or Enter immediately hands the
repository to the host without showing an intermediate selected checkmark.
Up and Down wrap through results, while Home and End jump to the first and last
repository. The search remains optional and announces its path/URL input format.
Escape retains the native dialog behavior. Azure DevOps has no
local-environment row or repository creation contribution, so those GitHub-only
actions are omitted.

REST 7.1 references: [Profiles](https://learn.microsoft.com/en-us/rest/api/azure/devops/profile/profiles/get?view=azure-devops-rest-7.1), [Accounts](https://learn.microsoft.com/en-us/rest/api/azure/devops/account/accounts/list?view=azure-devops-rest-7.1), [Projects](https://learn.microsoft.com/en-us/rest/api/azure/devops/core/projects/list?view=azure-devops-rest-7.1), [Repositories](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/repositories/list?view=azure-devops-rest-7.1). Test fixtures fictionalize [Microsoft REST examples](https://github.com/MicrosoftDocs/vsts-rest-api-specs/tree/c7e66d986b369dce462d04c02288a6c26c155002/specification).

## Create from branch or pull request

The `create-from` canvas takes `{ originUrl, accountId? }` and offers Branches and Pull requests tabs, sorted newest first and limited to 200 visible matches. Draft PRs are offered; fork PRs are not. A host-supplied `accountId` locks the account.

Search accepts up to 4096 characters, including full PR URLs. Longer input stays
editable and shows an inline validation message instead of being silently
truncated. Shortening it resumes search without reloading; invalid searches clear
the current selection and do not read Azure DevOps. Pasted control characters
also show recoverable inline feedback; removing them resumes search.

Completion is host-owned through `dialogCompletion`. The guest flushes edits, the package re-reads the selection, and changed heads, closed PRs, missing branches or forks reject it. Branch completion is `{ branchName }` and creates a new worktree from it. PR completion is `{ pullRequest: { number, accountId } }`; the host revalidates it and uses the native PR-session engine with a fresh review branch at the validated source SHA.

## Dialog completion

| Action | Contract |
| --- | --- |
| `dialog-state({afterRevision})` | Monotonic `{revision, ready, disabledReason}`; waits up to one second |
| `confirm-selection({})` | `{status: "completed", value}` or `{status: "rejected", message}` |

Confirmation has a 20-second deadline and requires the live guest to acknowledge exact revision tokens. Guests receive no app IPC or tokens.

## Pull request client

`pull-requests.mjs` targets Node 24 and Azure DevOps Services REST 7.1. `createPullRequestClient({repository, authentication})` provides create/read, overview, immutable changes and diffs, metadata and lifecycle updates, discussion writes, votes and reviewers, builds and completion. Every request gets a fresh token, times out after 30 seconds and is never retried; cancellation after dispatch does not prove rollback.

When PR creation receives an HTTP rejection after dispatch, the agent-visible
failure contains only the HTTP status and allowlisted service type, numeric code,
and parameter metadata. A 4xx response is a confirmed rejection and permits a
corrected retry; 5xx and transport failures retain unknown-write reconciliation.
Provider messages, response bodies, URLs, credentials, and other payload data
remain private.

Stable ADO creation codes are mapped to authored causes instead of forwarding
their messages. The initial allowlist covers `TF401398` (invalid, missing, or
non-branch refs), `TF401179` (an active PR already exists), and explicit
`sourceRefName` / `targetRefName` parameter failures.

States map active to open or draft, completed to merged and abandoned to closed. Queued completion is not merged.

## Linked PR view

The host supplies a saved PR URI, account and catalog-owned action grant; the package resolves and binds them before reading. Generic canvas opens receive no write authority. The package intersects the host grant with the bound identity and live repository **Contribute to pull requests** permission on load and immediately before every write. Authorization failures keep the PR readable but remove direct write controls.

Production reuses the existing metadata, discussion, vote, reviewer and lifecycle operations:

- Title and description editing use the shared `edit` operation.
- General comments post directly to Azure DevOps and refresh the discussion. Opening Reply replaces that thread's action row with the existing Markdown composer and Cancel, Reply and Reply and resolve controls. Cancel (or Escape) restores the original actions; Reply posts in the existing thread without changing its status. Reply and resolve posts first, then resolves using the existing status operation, and is available only with both write grants. A failed reply keeps its draft and never resolves the thread. If posting succeeds but resolution cannot be confirmed, the composer closes to avoid reposting and reports how to check the thread and retry Resolve. Resolve/Reopen and the existing ADO status menu remain available outside the composer. Editing and deletion are limited to the bound viewer's own loaded comments. Add, reply and edit forms share the safe Markdown renderer and compact edit/preview control.
- Active PRs expose review votes without a separate canvas lifecycle menu. The app-owned **Merge pull request** drawer owns manual completion and Mark as draft or Publish. It uses the same strict merge evidence and method-selection policy as Agent merge, exposes Azure DevOps's policy-permitted **Merge (no fast-forward)**, **Squash commit**, **Rebase and fast-forward**, and **Semi-linear merge** strategies, preserves a still-permitted workspace choice, and keeps strategy selection available while the merge action is blocked. The drawer exposes workspace-owned **Delete source branch after merging** and **Complete associated work items after merging** choices; the first deletes the pull request's source branch, not its changes or target branch. Manual and Agent merge completion share those choices; unavailable or unknown evidence keeps completion unavailable. Abandoned PRs expose one standalone Reactivate action. The canvas does not expose Abandon or an external Azure DevOps link.
- Reviewer search can add optional reviewers through ADO's identity-only collection endpoint and remove existing reviewers. Required reviewer creation and role changes remain unavailable because ADO exposes no documented safe operation for them.

Terminal states hide inapplicable controls.

[Manual Fix requests](#manual-fixes) remain separate: they only queue workspace work and never enable Agent merge or complete the PR. The view renders details, checks, reviewers, description and discussion with sanitized Markdown, refreshes every 60 seconds, and keeps last-good data on transient errors. Opening from the workspace badge reuses a retained instance while the binding still matches; disconnected or timed-out opens fall back to the browser for that click.

The footer is hidden during healthy operation. Read failures, partial failures,
cancellation and unconfirmed actions expose recovery feedback and **Refresh**;
unbound or disconnected views instead explain how to reopen the PR. Cancel stays
available during reads, and permissions remain enforced without an Access
disclosure. The canvas locally adapts GitHub's copy tooltip and dismissible error
toast presentation, without app UI imports or a host notification bridge.
Edit-conflict guidance, thread-link copies and build confirmations use transient
non-error notices rather than the footer. Only user-triggered failures create
error toasts; automatic read failures update the footer. A successful read
dismisses only its matching read-failure toast. Unconfirmed action warnings remain
until an accepted user-requested Refresh successfully reloads both the PR and a
fresh overview; another write or a failed recovery attempt requires a new Refresh.
A later unconfirmed Fix or failed review-state save replaces older recovery
guidance. A mutation's HTTP follow-up retains a detailed SSE warning observed for
that mutation; without a new SSE result, its failure replaces older guidance.
Clipboard failures retain the manual-copy field. A hover-only copy tooltip hides
on Escape without preventing the focused editor or popup from dismissing.

Language-tagged Markdown fences and supported discussion code previews use the host's GitHub syntax color roles. Unsupported languages and oversized blocks remain readable as plain text.

Comment content follows GitHub PR prose typography, heading hierarchy and paragraph/list spacing using the shared theme tokens. Code retains the canvas's package-local monospace stack and compact inline-code treatment. Authored `<details>`/`<summary>` sections use GitHub's native disclosure interaction: collapsed by default, expandable with a click, Enter or Space, including nested sections. Explicitly authored `<details open>` remains open, as on GitHub. Disclosure content passes through the existing Markdown sanitizer; arbitrary attributes and embedded active content remain inert.

Opening a description disclosure expands the description preview so the revealed report is not clipped. Wide tables and nonwrapping code blocks remain keyboard-scrollable within their own labelled regions. Standalone links retain underlines because the canvas does not receive the app's Show underlines preference.

System-comment activity uses the same safe Markdown/HTML renderer as discussion comments. Mixed bot reports retain readable tables, text and links without displaying raw tags or running embedded content. Comment headings use level 5 below the activity entry's level-4 heading. Review-vote wording, author names and timestamps remain unchanged.
Saved-PR observation publishes badges, authorship and the matching management/review controls
under the same observing account. Create is not a projection: origin-only,
unauthenticated discovery returns the declared Create/Create draft actions without
HTTP. Current local work controls eligibility, and any saved PR link blocks Create,
including closed, merged, missing, or unavailable projections. Click-time preflight
validates current refs and the repository account before returning creation guidance.

The package refreshes associated badges at a random interval of 1-3 minutes
after each completed pass, with at most four concurrent workspace reads. App focus,
visibility, and session selection do not trigger associated-PR reads or reset the
polling deadline; there is no foreground catch-up. Polling continues for closed or
merged associations. External state changes appear on the next successful pass, not as
immediate provider push notifications.
In development builds, **Tools > Enable Azure DevOps extension fast poll** changes
the associated-PR interval to 30–45 seconds for 20 minutes, then automatically
restores the normal interval. This activation-local override does not survive an
extension restart, trigger a foreground catch-up, or change Create PR evaluation.
Create refresh does not change projection inventory or polling.
Create PR's saved-link commit and Create from PR enroll linked workspaces through
the same inventory path. New associations are read immediately, not at the next
poll. Unchanged jobs and polling deadlines survive replacement inventories;
workspace deletion cancels its job, and empty inventory or activation disposal
retires all observation. Failed primary PR reads publish nothing; successful PR
reads retain their badge and controls when optional checks report a warning.
Observations spanning a PR UI mutation and unrelated inventory reconciliation
cannot overwrite its completed result;
the next scheduled pass supplies fresh state. Without
an Azure DevOps account, a recognized saved PR link publishes display-only
association metadata without HTTP reads, live badge state, or action authority.
Failure diagnostics contain only opaque workspace identity, lane, account-attempt
ordinal and allowlisted error category, not account identities, PR URLs or response text.
Existing hints do not detect user inactivity, so idle-based stopping, adaptive backoff, stale
warnings, and re-authentication UI remain follow-up work.

Explicit merge-details requests use the current saved PR association and scoped
account without requiring a repository binding or Git inspection. That
associated-only read cannot grant replacement Create PR controls.


Run the fixture canvas from this directory. The `--import` hook resolves `@github/copilot-app` to the app SDK:

```sh
node --import 'data:text/javascript,import{register}from"node:module";import{pathToFileURL}from"node:url";register("../../src/app_extensions/sdk/resolver.mjs",pathToFileURL("./"))' pull-request-preview.mjs
```

It uses production code against local responses.

## Review submission

`submit-review` accepts `{ decision, body, inlineComments, sourceCommitId? }`. Comment is the default and does not change the vote; Approve, Approve with suggestions, Wait for author and Reject set votes `10`, `5`, `-5` and `-10`. Draft PRs accept comments only.

All input, inline locations and the 12 KiB per-request body cap are validated before any write. Inline threads use offset 1 (ADO rejects 0). Submission is not atomic: threads post sequentially, then the vote. Failures report how many writes succeeded and never retry automatically.

## Headless Agent merge

The provider declares `agentMerge: true` and registers `agent-merge.mjs` with static [skill text](agent-merge-skill.md) (at most 8192 bytes).

| Callback | Behavior |
| --- | --- |
| `supports` | Credential-free URL recognition |
| `observe` | State, refs, review/check/conflict flags, readiness and `mergeDetails` |
| `readReviews` | Paged unresolved feedback |
| `replyToReview` | Post or reuse a matching reply, verify, then resolve unless `resolve` is `false` |
| `readCheckFailure` | Failed required builds and log excerpts |
| `complete` | Permitted strategy and advertised post-completion choices at a pinned source commit |

Readiness requires a succeeded merge status, resolved discussion and satisfied required policies. ADO owns policy applicability; policy type IDs, not display names, identify checks and merge strategies. The package never bypasses policies or auto-completes; it deletes branches or transitions work items only when the host supplies currently advertised user choices. Unknown write outcomes must be reconciled by observing again.

## Telemetry

Picker and PR canvases use the existing `canvas_extension.action_started`/`.action_finished` contract. No account, organization, repository, PR, query, URL, content or credential data is collected.

## Lifetime

The [shared host](../README.md) owns one generation per activation. Revocation or process exit invalidates pending work. Instances are not restored after restart.

## Tests

Package tests own provider behavior; host tests cover activation, transport and lifecycle without importing package internals. Tests do not contact live ADO. From the app root:

```text
bun run test:frontend -- src-tauri/app-extensions/azure-devops
bun run test:browser-host -- src-tauri/app-extensions/azure-devops
bun run typecheck:app-extensions
bun run lint:app-extension-boundaries
node src-tauri/app-extensions/azure-devops/build-renderers.mjs --check
```

## Upstream reuse

The picker adapts DOM/combobox behavior from [`microsoft/azure-devops-copilot-plugin` at `8f30ba3`](https://github.com/microsoft/azure-devops-copilot-plugin/blob/8f30ba3210758239be19e2143943e0830f07601a/extensions/azure-devops/ui/connection-view.mjs). Its MIT notice is in `THIRD_PARTY_NOTICES.txt`.

## Scope

The package owns ADO clients, discovery, PR semantics and canvas content. The app owns Git, bindings, credentials and shared indicators. Missing access, unsupported remotes and absent PRs stay explicit; there are no guessed accounts or fixture fallbacks.
