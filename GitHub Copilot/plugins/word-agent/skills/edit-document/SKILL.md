---
name: edit-document
description: Edit an existing Word document with Office Agent MCP, publish a result card, and open it in the Word canvas. Use for SharePoint, OneDrive, or local .docx documents.
---

# Edit a Word document

Use the plugin-provided `edit_word_document` tool. It invokes the Word MCP
through the plugin and automatically forwards the root Copilot conversation
and prior tool memory in request `_meta`; never reconstruct or add that
metadata yourself.

## Resolve the document

Call `word_account_status` before uploading or editing. If it reports
`disconnected`, ask for the user's Microsoft 365 username if the user has not
already supplied it, then call `connect_word_account` with that `username`.
If it reports `reauthentication_required`, call `connect_word_account` without
a username so Microsoft reauthenticates the pinned account. Never infer a
username, switch accounts implicitly, or ask for passwords, consent responses,
or MFA codes; Microsoft's native account provider owns those prompts. If sign-in is already in
progress, wait rather than starting another sign-in, upload, or mutation.

- Use an HTTPS SharePoint or OneDrive document URL verbatim as `artifactUrl`.
- For a local `.docx`, call `upload_word_document` once with the absolute
  user-supplied path. Use its `webUrl` as `artifactUrl`. The tool uploads a
  uniquely named copy to the pinned account's OneDrive and does not modify the
  local document or expose access tokens.
- If upload, authentication, or URL resolution fails, report the failure and
  do not call `edit_artifact`.
- Do not replay an upload after an ambiguous connection failure; a OneDrive
  copy may already exist. Only the plugin retries an explicit Graph 401 once.

## Apply the edit

1. Call `edit_word_document` exactly once with:

   ```json
   {
     "artifactUrl": "<resolved source URL>",
     "taskDescription": "<the user's requested changes in their own terms>"
   }
   ```

2. In `taskDescription`, preserve every requested change and later refinement
   in the user's own wording, including what must not change. Do not restate
   the document, repeat grounded data, inflate a brief request into a template,
   invent values or sources, or use placeholders.
3. Do not edit the document with local document libraries, scripts, OOXML,
   or another artifact tool.
4. Do not retry or switch mutation tools after an ambiguous or failed mutation.
5. Success requires a completed task whose final result contains a usable
   HTTPS SharePoint or OneDrive URL.
6. Publish a persistent chat card by calling the `show_document_card` tool
   from the loaded Word UI MCP server with:

   ```json
   {
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>"
   }
   ```

   This is a document UI operation, not another artifact mutation.
7. Call `open_word_canvas` with:

   ```json
   {
     "instanceId": "word-document-view",
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>",
     "mode": "view"
   }
   ```

8. Return the file name and canonical resource URL. Do not call another
   artifact mutation tool after publishing the result.
