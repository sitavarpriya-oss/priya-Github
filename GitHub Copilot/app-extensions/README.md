# App-scoped extensions

The app owns admission, credentials, transport and lifetime. Packages own provider behavior and UI; they must not import app implementation or other packages.

| Location | Purpose |
| --- | --- |
| `src-tauri/app-extensions/` | Separate provider packages; [Azure DevOps](azure-devops/README.md) is the bundled implementation |
| `src-tauri/src/app_extensions/` | Native host, protocol, SDK and transport |
| `crates/extension-host/` | Provider-neutral extension protocol, package validation, merge contract and contribution lifetimes |
| `src/app-extensions/` | Frontend provider host integration (`lib/`, `hooks/`, `stores/`, `components/`), including repository pickers, merge presentation, Create from and provider review |
| `src/types/app-extensions.ts` | Provider-neutral frontend wire types; `src/types/extensions.ts` re-exports them for compatibility |

See [ownership rules](../../.github/instructions/app-extensions.instructions.md), [SDK types](../src/app_extensions/sdk/api.d.ts), [ADR 0052](../../docs/adr/0052-provider-neutral-app-scoped-extensions.md) and [ADR 0063](../../docs/adr/0063-host-provided-extension-api.md).

## Frontend host infrastructure

Frontend provider host integration lives under `src/app-extensions/`: `lib/` contains the provider PR client, passive PR views, account login, pull request canvas handoff, Create from selection validation, and repository-picker discovery, completion, and lifecycle; `hooks/` contains provider inventory, PR creation, display, review, and Create from discovery; `stores/` contains repository-picker state; `components/` contains their host dialogs, the inventory host, repository-picker UI and authorization, and merge presentation. Tests and stories remain alongside the implementation.

`lib/repositoryPickers.ts`, `stores/repositoryPickerStore.ts`, and
`components/repository-picker/` under that frontend host directory manage only
extension-provided repository pickers. Native GitHub selection stays in Quick
Open; local-folder, repository-URL, clone/destination, and Create-from workflows
retain their existing owners. Shared canvas rendering and the native repository
menu adapter also stay shared. App surfaces import picker modules directly from
their host-owned locations, without compatibility re-exports.

This is an organizational boundary, not a second runtime or a copy of native workflows. App surfaces import these modules at their integration points, while native workspace creation, shared PR composition and display helpers, generic canvas infrastructure, and shared UI primitives stay in the app. Provider-specific behavior remains in the extension package.

The account-selection store and dialog remain in shared `src/stores/` and
`src/components/`: provider PR flows and native WSL setup use the same picker.
Its provider-prefixed name does not make it app-extension-owned.

Provider-only PR display projections and repository-selection validation live
in `src/app-extensions/lib/providerPrDisplay.ts` and `repositorySelection.ts`.
The shared workspace PR display module retains native GitHub display and the
common display types. Picker discovery and dialog orchestration live in the
app-extension host alongside the selection parser; app callers import each
directly without a compatibility re-export.

Runtime registration and hosting lifetime are separate concerns. Explicitly
app-hosted runtime canvases use the app host adapter described in
[ADR 0064](../../docs/adr/0064-app-hosted-runtime-canvases.md); ordinary session
extension discovery, registration, and lifecycle retain their runtime owners.
The native canvas renderer serves both scopes and remains shared.

Frontend provider merge presentation lives in `src/app-extensions/components/`. Shared
host/frontend wire contracts live in the neutral `src/types/app-extensions.ts`
module; the app-extension subsystem re-exports them, not the other way around.
Native provider routing, contracts, SDK and transport live
in `src-tauri/src/app_extensions/`; `src-tauri/app-extensions/` remains the
separate package boundary. CLI agent/plugin types and connector definitions stay
in `src/types/extensions.ts`, which re-exports the shared wire contract types for
compatibility. Existing Agent merge import paths also re-export the host-owned
definitions so native callers need no bulk migration.

The provider merge drawer renders sanitized Markdown and supported HTML.
It keeps provider mentions literal and media inert, renders Mermaid fences as code,
and disables app-owned reference controls and their status subscriptions. Authored
links still use the app's safe link handling. Packages must preserve Markdown block
boundaries between plain-text attribution and authored discussion bodies in display evidence.
Worker evidence remains separate from that display formatting.

Provider merge-method selection lives in the host-owned extension SDK,
`src-tauri/src/app_extensions/sdk/merge-methods.mjs`. Provider presentation uses
it directly, and packages consume it through `@github/copilot-app`. Runtime
staging embeds self-contained SDK files. Native GitHub method selection remains
unchanged and does not depend on the extension SDK; the provider drawer reuses
the native method picker rather than introducing another UI flow.

Completion preferences are workspace-owned, like Agent merge action settings.
They do not retain a separate PR identity. Existing provider target, generation,
revision and terminal-bookkeeping fences protect execution and reassociation;
fresh merge evidence filters saved methods and option IDs before use.
Provider projections feed the shared workspace merge eligibility and authoring
path, including local work, while provider availability remains an additional
gate. Manual drawer access does not require automation eligibility or support.

The frontend and private runtime share the pure completion-input matcher in
`sdk/pr-action-input.mjs`, but both boundaries still validate each request.
Rust independently enforces the same wire contract.

## Rust host organization

App-extension request handlers live in `src-tauri/src/app_extensions/handlers.rs`
and its sibling `handlers/` directory, with their existing tests alongside them.
The module adapts native request context to app-host operations for canvases,
repository pickers, Create from, provider PR UI, and provider PR sessions.
Native tools, workspace delivery, and resource subscriptions call this module at
their integration points. `handlers::app_extensions` remains a compatibility
re-export for the independently organized WebSocket dispatcher; it is not a
second implementation or an ownership boundary.

This is a mechanical source move, not an extraction of provider business logic
or native workflows. Shared `extension_canvas_webview`, native
`repository_picker_menu`, forge adapters, resource subscription scheduling, and
ordinary session/CLI extension discovery stay with their existing owners.
Provider-specific executable behavior remains in `src-tauri/app-extensions/<package>/`.

## Rust repository host adapter

`src-tauri/src/app_extensions/repository_clone.rs` owns provider-selected clone
authorization data, stable repository identity qualifiers, and repository-binding
reconciliation, including its per-project lock and conditional origin rollback.
Native clone allocation, checkout reuse, GitHub account selection, and project
creation remain in `project_handlers.rs` and call this adapter at their existing
integration points. The native workflow integration tests remain in
`project_handlers/tests.rs`, with their original names and assertions.

## Architecture checks

Run from the app root:

```text
bun run lint:app-extension-boundaries
bun run test:app-extension-boundaries
bun run typecheck:app-extensions
bun run test:browser-host -- src-tauri/app-extensions/azure-devops
```

Runtime dependencies must be package-owned or bundled; the app's install and tooling are permitted only by the [boundary policy](../../scripts/lib/appExtensionBoundaryPolicy.ts). Keep release assets and licenses inside the package, and test output outside it. Checks are guardrails, not a sandbox or proof of relocation. Browser tests do not prove native embedding or live authorization.

Provider PR-session checkout, reuse and recovery assertions run in the unit lane against a seeded host generation with production admission and revocation checks, without a bundled CLI. `app_extensions_e2e` exercises the same scenario through the private resolver transport and production handler.

## Admission and lifetime

`catalog.json` owns bundled admission, rollout flags and grants. Manifests declare `engines.github-app: ^0.2.0`, named activations and contributions; they cannot grant authority. External packages may live in immediate `$COPILOT_HOME/extensions/` subdirectories, but receive no app authentication or action-telemetry grants. Provider PR surfaces retain their host rollout gate.

Import `getHost` from `@github/copilot-app`, leaving it external when bundling. `activate()` registers contributions and returns a disposer. One private no-turn runtime belongs to each `(packageId, activationId)`; contributions share its generation, not a project or conversation.

Calls retain exact activation, generation, contribution and request identities. Callback errors do not discard valid registration; protocol failures, disconnects and host-call timeouts invalidate the generation. Recovery is explicit, not automatic. Process isolation is not a same-user security sandbox.

Plugin admission validation failures invalidate only the generation captured with that admission; a delayed failure from an older load must not revoke a replacement generation.

## Process authentication

The host owns sign-in, refresh, account validation and grants. Packages request a fresh operation-scoped token and perform provider HTTP themselves. Scoped callbacks omit `accountId`; unscoped calls use an opaque account reference from native enumeration. Pure recognition callbacks cannot authenticate. See the [session authentication runbook](../src/app_extensions/session_authentication/README.md) for session-owned extensions.

Send tokens only to provider origins, reject redirects, and never expose them through guests, URLs, logs, tools, durable state or subprocesses. Revocation prevents future issuance; it cannot recall delivered tokens. Model identity and Git credentials remain separate.

| Boundary | Limit |
| --- | --- |
| Pending authentication calls | 16 per connection |
| Native request / JavaScript deadline | 25 / 30 seconds |
| Credential loading | 16 concurrent; 60 seconds |
| Ordinary private protocol frame | 16 KiB including newline, in both directions |
| Projection inventory / update batch frame | 16 MiB including newline; other message types retain the ordinary limit |

Projection-specific transport and account-reference rules are consolidated in
[ADR 0080: Protocol changes](../../docs/adr/0080-extension-projections-for-non-github-workspaces.md#protocol-changes).

Failures use fixed codes: `denied`, `account_unavailable`, `auth_required`, `credential_unavailable`, `busy`, `timeout`, `response_too_large`. A timeout does not imply a write occurred; an uncertain dispatched write requires reconciliation, never automatic replay.

PR creation actions may use `host.pullRequests.createPullRequestError` to attach
bounded HTTP status and allowlisted service metadata to a dispatched failure.
The private cause remains inside the extension process; native code authors the
recovery copy. Confirmed 4xx rejections remain retryable, while 5xx and transport
failures keep the write fenced as unknown. Provider response bodies, URLs,
credentials, and arbitrary error text never cross the boundary.

Account removal deletes repository bindings for that account. Git credential resolution repairs bindings whose account row no longer exists and continues through unbound Git authentication without recloning. Invalid or expired credentials on an existing account neither unlink its repository nor select another account. Unlinking removes the whole provider binding; saved workspaces, sessions and canonical PR links remain. A moved checkout without saved GitHub repository metadata cannot be reverified and must be removed and re-added.

## Shared PR UI

Providers declare `prUiActions` and register matching `prUi: {read, actions}` handlers. The host validates schemas, current workspace/account scope and generation before dispatch. Buttons, badges, canonical URI, errors and pending state form one revisioned snapshot. Persisted badges are display only, never authority.

For saved PRs, extension-owned projections replace binding-backed recognition
and read-triggered acquisition; ordinary linked reads consume the authorized
cache. Create remains separate origin-only capability discovery plus local
eligibility and click-time preflight. Any saved PR link blocks provider Create.
See [ADR 0080](../../docs/adr/0080-extension-projections-for-non-github-workspaces.md)
for ownership and lifecycle decisions, and its
[Protocol changes](../../docs/adr/0080-extension-projections-for-non-github-workspaces.md#protocol-changes)
section for inventory, validation, delivery, read requests, and development controls.

Associated operations use the current projection's generation, saved URI and
observing account, validated against the activation's admitted authentication
resource. The saved URI is not a clone origin or an account-host selector.
Create and bound repository reads retain clone-origin admission.

Bound-provider selection uses canonical URI, then created PR URL, then source PR URL. Unsupported or unavailable bound providers fail instead of falling back to GitHub. Reads and actions must retain the exact provider, account, repository and PR identity.

Drawer-only `mergeDetails` contains bounded readiness evidence, not authorization. Optional `mergeMethods` references advertised completion actions; the shared picker dispatches the selected action through existing preflight. Optional `postCompletionOptions` advertises bounded provider-owned boolean choices. The app stores the selected method and option IDs on the workspace, augments only completion actions, and passes only choices still advertised by fresh Agent merge evidence. Completion rechecks current evidence and pins the source. Unknown write outcomes remain fenced across generation changes. Configured review actions use the same `pr.actions` dispatch and preflight without a duplicate button contribution; only the configured action ID and an advertised review decision are available.

Badges may include `checksSummary` (`total`, `success`, `failure`, `pending`; categories sum to `total`). Counts describe current CI observations, not merge authority, and are not persisted. The sidebar shows them only for open PRs with a connected, ready, error-free provider view. Optional checks have a 30-second budget from provider read entry, including required lookups; exhausting it skips checks with an error and never extends the native operation deadline. Unavailable checks omit the summary without discarding PR identity.

### PR creation

`create_pull_request` routes bound local branch/worktree sessions to their provider; unbound projects use GitHub. The agent commits and pushes first. Native preflight validates account/repository scope, working-tree state and remote HEAD. Explicit `base_branch` must match a reused PR; existing PRs are never silently retargeted.

Successful creation returns the ordinary PR card result and persists the canonical link. Creation does not automatically open a canvas. Account selection, navigation and final dispatch retain scope checks.

## Agent merge automation

Declare `agentMerge: true` and register nonblank `skill` text (at most 8192 UTF-8 bytes) plus every callback below. The app owns scheduling and live action permissions; providers supply observations and remote operations.

| Callback | Contract |
| --- | --- |
| `supports` | Credential-free recognition |
| `observe` | Revision, state, work flags, readiness and optional merge evidence/method |
| `readReviews`, `readCheckFailure` | Bounded `{body, nextCursor?}` pages |
| `replyToReview` | Revalidate `expected`; skip resolved threads; post or reuse the bound author's matching reply; resolve unless `resolve` is `false`; return confirmation text |
| `complete` | Revalidate revision and permitted method; skip queued/terminal PRs |

Partial failure reports the confirmed reply; it must not invite reposting. Observe again after writes: callback success is not terminal confirmation. Authenticated callbacks use the bound account. Callback deadlines are 60 seconds; support lookup including activation has 120 seconds.

Temporary connection, generation, runtime and timeout interruptions preserve enablement: the next tick revalidates the saved PR, binding, account and authority, then selects a current runtime. Authority loss blocks. Unknown write outcomes require reconciliation; no write is replayed. Drawer Refresh reads current details without changing settings or cadence. `read_agent_merge_state` without `target` can replace stale read-only prompt context and returns the current generation; exact-target reads stay pinned, and other tools reject obsolete generations.

The workspace header shows the Agent merge button and settings caret only for open PRs, without changing Create PR eligibility or saved enablement. A terminal state closes open Agent merge UI and invalidates pending support checks. Neither control enables automation.

App-owned activations get `host.pullRequests.requestFix({instanceId, fix, guidance})`, where `fix` is `{kind: "discussion", threadId}`, `{kind: "discussions", threadIds}` (up to 50), `{kind: "checks"}` or `{kind: "conflicts"}`, and `guidance` is provider-specific read and guardrail text. The host checks the canvas's workspace PR and queues one prompt in that workspace's session, built with provider templates in `pull_request_fixes/prompts/`. Drift tests compare them with the native Fix prompt builders. It resolves `"accepted"` once handed to that session, rejects if not, and resolves `"unknown"` after 150 s without a reply; do not retry an unknown outcome automatically. Later delivery errors appear in the session.

Ordinary bound-session reads/replies do not require Agent merge and cannot complete the PR. Legacy Agent-merge Reply requires live enablement and `addressReviews`. Default GitHub tool schemas remain unchanged; provider variants are advertised only in bound sessions. Historical `PRRT_...` replies retain GitHub routing and its normal argument, target and account validation.

Fix prompts carry an exact `target` (source, URL, provider generation and binding revision) to copy into provider read/reply tools. Native validation checks the selected Source/Created slot or canonical association, deriving workspace and repository from native state without substituting the default PR. This is a revalidated locator, not a permission grant. Calls without `target` retain default selection and Agent merge authorization. `target` is advertised only for admitted providers.

## App-owned canvases

Register `host.registerCanvas(id, {open, actions, onClose})`. Open returns a loopback URL, not proof of document readiness. Instances are retained, memory-only handles fenced by generation/incarnation. Navigation hides ready views; close or activation loss retires them. Guests receive no privileged IPC.

Transient reservations expire after 60 seconds until claimed. Cleanup covers cancellation, abandoned opens, owner-window navigation and generation loss without closing retained siblings.

Development-only app-hosted runtime canvases use a separate explicit-open gate and private runtime; they do not gain conversation context or credentials. See [ADR 0064](../../docs/adr/0064-app-hosted-runtime-canvases.md).

**Open in new window** moves an open runtime canvas into its own chromeless window (`open_app_canvas_window`) under that gate or `multi_window`. The window presents one canvas instance: closing either closes the other, and showing a popped-out canvas again focuses its window. Canvas windows keep no saved geometry, and native guest labels include the window label so each window owns its own webview.

### App-owned PR controls

The workspace PR view places its Agent merge button in app-owned chrome above
the canvas. It uses the existing drawer and support check, with the exact
workspace, provider, account, and PR context retained by the app. The package
receives no command binding and does not request the drawer. Leaving the PR tab
closes the drawer; merged and closed PRs hide its entry point. Opening the drawer
does not enable automation.

## Opt-in dialog completion

Declare distinct `dialogCompletion: {stateAction, confirmAction}` handlers. State accepts `{afterRevision}` and returns `{revision, ready, disabledReason}`; confirmation accepts `{}` and returns `{status: "completed", value}` or `{status: "rejected", message}`. Revisions are monotonic; readiness is not permission.

The host owns buttons/focus and keeps one bounded state observation, suspended during confirmation. The package must settle live guest edits/writes before confirming and reject stale document/request/revision acknowledgements. Cancellation never waits for confirmation. See [ADR 0053](../../docs/adr/0053-app-scoped-canvas-hosting.md) and the SDK types for schemas.

Repository pickers declare `repositoryPickerCanvas` with exact HTTPS clone origins. Optional `remoteAliases` map other remote URLs to a clone origin and never receive app credentials. Clone handoff requires explicit confirmation. Optional account recovery invokes native sign-in only after an explicit user action; success refreshes discovery without replaying selection or mutation.

## Create from an existing repository

Declare `createFromCanvas: {"canvasId": "choose-source"}`; the canvas must share the activation, require the provider and declare dialog completion. Its clone-origin declaration is the admission boundary; discovery neither activates a package nor reads a forge API. `app_extension_project_create_from` resolves a local project's Git origin and persisted binding and returns the admitted targets, feature flag, credential-free origin and bound account ID. Unsupported repositories return nothing, and changed origins never borrow an old binding. The entry point is gated by `azure_devops`; GitHub and unsupported projects keep the native dialog.

The dialog reserves a host-completed transient canvas. The package owns account selection, repository reads, search and selection revalidation; the app rechecks the live project before native handoff, and dismissal or revocation cancels it. Branch completion supplies `{branchName, baseBranch?, name?}` for ordinary native worktree creation. Existing-PR completion supplies `{pullRequest: {number, accountId}}`. `create_worktree_workspace` no longer accepts a source-PR seed; persisted source-PR records remain readable but authorize no handoff.

For that handoff, a provider may register read-only `prSession({originUrl, number})` returning `repository`, `repositoryId`, `number`, `title`, `url`, `baseRef`, `headRef`, `headCommit` and `draft`. The host checks declaration, origin and bounds, scopes the token to the selected account, correlates the response and rechecks admission. The resolver deadline is 60 seconds; the handoff, including display hydration, is bounded to 95 seconds with connection-scoped PR-open cancellation. Initialization has a ten-minute pre-ready deadline; setup scripts keep their native lifetime.

Extension adapters delegate the native PR engine's locking, host-keyed reuse, records and projection. The provider adapter selects a fresh review branch and fetches an immutable source SHA without a GitHub pull-ref fallback; ordinary initialization is unchanged. Admission fences cover initialization writes, progress and final delivery. Healthy reused checkouts keep user edits; unsafe or unrelated directories are refused. Recovery coalesces pending materialization, revalidates under the native exclusive guard, uses `cleanup: false`, never overwrites a changed review branch, and replaces a missing diverged or legacy checkout atomically with a fresh branch. URL-shaped source identities never enter GitHub-only recovery. Nothing here creates or modifies a remote PR.

## Pull request views

Declare `pullRequestView: {canvasId, open?: true}`. Credential-free `supports({url})` recognizes the locator; bound workspace opening is a separate opt-in receiving validated account authority. Generic canvas open does not gain that authority.

Bound openers may receive catalog-owned `pullRequestViewActions` for their exact activation/provider. The host sends those action names only on the account-bound open; external packages and generic canvas opens receive none. Packages must intersect that app-policy grant with live provider authorization and recheck before every write.

Bound views reuse only matching workspace, account, provider and canvas scope. Recovery revalidates the saved association; late results cannot attach after cancellation or replacement. Only the canonical URL persists across restart. Temporary transport failure may fall back to opening that URL externally; denial or changed scope must not.

## Telemetry

Host-granted `reportCanvasAction` records bounded action labels, outcomes and timing. Never include content, identities, URLs, credentials or raw errors. Telemetry failure must not retry a business operation.
