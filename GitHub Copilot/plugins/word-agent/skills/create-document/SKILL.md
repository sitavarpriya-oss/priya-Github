---
name: create-document
description: Create a new Word document with Office Agent MCP, publish a result card, and open it in the Word canvas.
---

# Create a Word document

Use the plugin-provided `generate_word_document` tool. It invokes the Word
MCP through the plugin and automatically forwards the root Copilot conversation
and prior tool memory in request `_meta`; never reconstruct or add that
metadata yourself.

1. Call `word_account_status` before creating the document. If it reports
   `disconnected`, ask for the user's Microsoft 365 username if the user has not
   already supplied it, then call `connect_word_account` with that `username`.
   If it reports `reauthentication_required`, call `connect_word_account`
   without a username so Microsoft reauthenticates the pinned account. Never infer
   a username, switch accounts implicitly, or ask for passwords, consent
   responses, or MFA codes; Microsoft's native account provider owns those prompts.
2. If sign-in is already in progress, wait rather than starting another sign-in
   or document mutation. If authentication fails, report it and do not call the
   mutation tool.
3. Call `generate_word_document` exactly once with:

   ```json
   {
     "taskDescription": "<the user's document request in their own terms>"
   }
   ```

4. In `taskDescription`, preserve every requirement and later refinement in
   the user's own wording. Preserve requested facts, source constraints,
   sections, tone, formatting, and later refinements. Do not invent content or
   sources, inflate a brief request, or use placeholders. Let the Word
   capability own document structure, prose, layout, and formatting.
5. Do not create the document with local document libraries, scripts,
   OOXML, or another artifact tool.
6. Do not retry or switch mutation tools if task creation, execution, result
   retrieval, or the underlying mutation fails, times out, is cancelled, or
   returns no usable resource URL.
7. Success requires a completed task whose final result contains a usable
   HTTPS SharePoint or OneDrive URL.
8. Publish a persistent chat card by calling the `show_document_card` tool
   from the loaded Word UI MCP server with:

   ```json
   {
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>"
   }
   ```

   This is a document UI operation, not another artifact mutation.
9. Call `open_word_canvas` with:

   ```json
   {
     "instanceId": "word-document-view",
     "artifactUrl": "<returned resource URL>",
     "title": "<returned file name, when available>",
     "mode": "view"
   }
   ```

10. Return the file name and canonical resource URL. Do not call another
   artifact mutation tool after publishing the result.
