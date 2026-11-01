---
name: edit-presentation
description: Edit an existing PowerPoint presentation from a prompt and a SharePoint, OneDrive, or local .pptx source, then open it in the PowerPoint canvas. Use whenever the user wants to change an existing deck, template, presentation URL, or .pptx file.
---

# Edit a PowerPoint presentation

Use the AugLoop Office MCP server to edit the existing presentation, then open
the returned artifact in the `powerpoint-canvas` canvas.

## Resolve the source

When `powerpoint_account_status` is available, check it before uploading or
editing. If disconnected or reauthentication is required, invoke
`connect_powerpoint_account` and let the user complete sign-in. Never switch
accounts implicitly. Eval supplies its own authentication.
If sign-in is already in progress, wait for it rather than starting another
prompt, upload, or mutation.
For first Connect, ask for a Microsoft 365 username in Copilot if the user has
not already supplied one, then pass it as `username`. Handle `username_required`
the same way. Never ask for passwords or MFA codes in Copilot: Microsoft WAM
owns those prompts. Never infer a username from GitHub, Windows, or filesystem
paths. Reauthentication uses the already pinned account without asking again.

- For an HTTPS SharePoint or OneDrive presentation URL, use that URL as
  `artifactUrl`.
- For a local `.pptx`, call `upload_powerpoint_presentation` once with the
  absolute path the user supplied:

  ```json
  { "path": "<absolute local .pptx path>" }
  ```

  Use the returned `webUrl` as `artifactUrl`. The tool uploads a uniquely named
  copy to the signed-in user's OneDrive (Office's Copilot files folder); Office
  stores it with its own authority. It never modifies the local file or returns
  access tokens. Uploads are limited to ZIP-based `.pptx` files up to 12 MB. Do not
  upload with shell commands, scripts, or another tool.
- If upload, authentication, or URL resolution fails, report that failure
  verbatim and do not call `edit_artifact`. A failure that says the file was
  already saved must not be retried.
- Do not replay an upload after an ambiguous failure; a OneDrive copy may
  already exist. Ask the user to check OneDrive and quote the upload reference.
- Never invent an artifact URL and never replace an edit request with a newly
  generated presentation.

## Edit

1. Do not start a synchronous fallback. Recommend `/experimental on` and a
   host restart only for an explicit missing Tasks, elicitation, or MCP Apps
   capability. Report authentication, connection, and timeout errors as such.
   After an interrupted request or unconfirmed cancellation, artifact status
   is unknown; do not claim no file was created or changed.
2. Call `edit_artifact` exactly once with:

   ```json
   {
     "appName": "PowerPoint",
     "artifactUrl": "<resolved source URL>",
     "taskDescription": "<the user's edit request>"
   }
   ```

3. Preserve the user's wording, constraints, filenames, URLs, and slide
   references in `taskDescription`. Do not invent an edit plan, new slide copy,
   research, acceptance criteria, or implementation instructions.
4. Do not edit the deck with local PowerPoint libraries, scripts, OOXML, or
   another artifact tool.
5. When the tool starts as a background agent, retain the returned agent ID.
   Wait for its completion notification, then call `read_agent` once with
   `wait: true` to retrieve the final result. Do not use `list_agents` to poll
   or rediscover it.
6. Never retry `edit_artifact` or switch mutation tools after submission. If
   the result is `interrupted` and includes a correlation ID, including
   `office_task_reauthentication_required`, call
   `resume_powerpoint_operation` with that ID. Resuming obtains fresh
   authorization, observes the existing Office task, and must not submit a new
   mutation. If resume also fails or the operation has expired, report the
   failure and correlation ID.
7. Success requires
   `structuredContent.powerpointWorkflow.status` to be `completed`. Use its
   `artifactUrl` and `title`. Keep `correlationId` internal on success. If the
   typed workflow result is absent or failed, report the tool failure and do
   not parse another URL from prose. Explain Office's reason when the error
   gives one, in the user's language and without internal service names,
   protocol terms, or raw diagnostics. Include the correlation ID when one is
   available on a failed, cancelled, or interrupted result.
8. Publish a persistent chat card by calling
   the `show_presentation_card` tool from the loaded PowerPoint MCP server with:

   ```json
   {
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>"
   }
   ```

   This is a presentation UI operation, not another artifact mutation.
9. Then call `open_powerpoint_canvas` with:

   ```json
   {
     "instanceId": "powerpoint-presentation-view",
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>",
     "mode": "view"
   }
   ```

   The plugin also opens the returned presentation automatically; this call
   focuses the same canvas. Both modes are the editable PowerPoint editor:
   `view` hides the header and ribbon and `edit` shows them. Do not describe
   the canvas as read-only.

10. Return the file name and canonical resource URL. When
    `powerpointWorkflow.choices` is present, also say what the user picked in
    PowerPoint's questions (for example, "Style: Deep Ocean Gradient"); the
    question form is gone by then. If the result contains a `Sources:` Markdown
    block, end your reply with that complete block, copied exactly, even when
    the user did not ask for sources. It lists what the presentation was built
    from. Never invent, edit, or reconstruct a source or its link. Do not call
    another artifact mutation tool after the canvas opens.
