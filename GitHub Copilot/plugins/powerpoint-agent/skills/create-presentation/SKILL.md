---
name: create-presentation
description: Create a new PowerPoint presentation from a prompt with Office MCP and open the result in the PowerPoint canvas. Use when the user asks for a new deck, presentation, or slides and is not modifying an existing presentation.
---

# Create a PowerPoint presentation

Use the AugLoop Office MCP server to create the presentation, then open the
returned artifact in the `powerpoint-canvas` canvas.

## Rules

When `powerpoint_account_status` is available, check it before starting. If the
account is disconnected or requires reauthentication, invoke
`connect_powerpoint_account` and let the user complete sign-in. Never switch
accounts implicitly. The eval profile supplies authentication separately and
does not expose these interactive account tools.
If sign-in is already in progress, wait for that action rather than launching
another prompt or an Office mutation.
For first Connect, ask for a Microsoft 365 username in Copilot if the user has
not already supplied one, then pass it as `username`. Handle `username_required`
the same way. Never ask for passwords or MFA codes in Copilot: Microsoft WAM
owns those prompts. Never infer a username from GitHub, Windows, or filesystem
paths. Reauthentication uses the already pinned account without asking again.

1. Do not start a synchronous fallback. Recommend `/experimental on` and a
   host restart only for an explicit missing Tasks, elicitation, or MCP Apps
   capability. Report authentication, connection, and timeout errors as such.
   After an interrupted request or unconfirmed cancellation, artifact status
   is unknown; do not claim no file was created.
2. Call `generate_artifact` exactly once with:

   ```json
   {
     "appName": "PowerPoint",
     "taskDescription": "<the user's PowerPoint request>"
   }
   ```

3. Preserve the user's wording and intent in `taskDescription`. Include
   still-applicable user-authored constraints from earlier messages, but do not
   invent an outline, slide plan, copy, research, acceptance criteria, or
   implementation instructions.
4. Do not create the deck with local PowerPoint libraries, scripts, OOXML, or
   another artifact tool.
5. When the tool starts as a background agent, retain the returned agent ID.
   Wait for its completion notification, then call `read_agent` once with
   `wait: true` to retrieve the final result. Do not use `list_agents` to poll
   or rediscover it.
6. Never retry `generate_artifact` or switch mutation tools after submission.
   If the result is `interrupted` and includes a correlation ID, including
   `office_task_reauthentication_required`, call
   `resume_powerpoint_operation` with that ID. Resuming obtains fresh
   authorization, observes the existing Office task, and must not submit a new
   mutation. If resume also fails or the operation has expired, report the
   failure and correlation ID.
   A `structuredContent.templatePickerHandoff` result is a paused operation,
   not a failed creation. Call its `nextTool` with the supplied arguments,
   including `correlationId`, and wait for the app's explicit Confirm or Skip
   message. Continue using `resume_powerpoint_operation` with that same
   correlation ID and the confirmed `templateId`, or
   `skipTemplateSelection: true` for Skip. Do not call `generate_artifact`
   after template selection.
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
