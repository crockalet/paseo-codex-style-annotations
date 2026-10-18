# Codex Style Chat Annotations

Codex Style Chat Annotations turns selected chat, file, Markdown preview, Diff, and terminal text into annotations with optional comments. Draft and sent annotations collapse into an **n 条注释** capsule.
A numbered marker links a draft
annotation to its source while that source remains available. You can edit or delete draft
annotations, expand complete sent texts, and copy an entry.

The selection menu also offers **在侧边聊天中提问**. Asking creates a child agent with the
parent's provider, model, mode, and thinking level. It receives the selection, the source
message when found, and up to eight recent main-chat turns. You can continue in the side panel
or open the child as a regular chat tab.

## Setup and support

Paseo 0.11.4 or later with native plugin Settings support is required. Disable the original `quote` plugin before enabling
Codex Style Chat Annotations. Running both is unsupported.
Existing `quote` draft and sent attachments remain readable, and editing a legacy draft
preserves its identity. New annotations use `quote-notes`.
In the plugin's **注释类型** settings, enable or disable chat, file, Diff, Markdown preview, and terminal annotations separately. All five start enabled. The settings belong to that host installation. Turning a type off affects new annotations. Saved annotations remain readable and editable, and chat side questions remain available. Settings load at startup and are checked again before Add. Read failures and save conflicts are visible and do not reset saved values.
No additional account or token is required. Annotation controls currently use Chinese labels,
and side chat controls include English.

The chat UI was verified on macOS desktop with Paseo 0.11.4 in a dark theme. External capture has isolated original-module browser coverage against disk renderer 0.12.0-beta.3; the loaded client must also pass its compatibility checks. Light themes,
browser clients, and mobile clients have not been independently verified. Selection actions
target desktop and web clients. Mobile platforms use their system selection menu.

## Data access and limits

The plugin runs as trusted code in the Paseo app. It reads selections and their file, Diff, or terminal context, same-workspace agents and drafts, sent attachments, native annotation-type settings, and recent conversation text for side chats. Quotes and saved
comments use Paseo's native draft store. Adding an annotation does not send a message.
When you send the draft, Paseo sends the quote and comment through your configured agent
provider. Asking in a side chat sends the selection, question, and recent context to that
provider. Copying an entry writes its text to the clipboard.

The plugin fetches the app's own JavaScript bundles from the same origin to check its native
adapters. It adds no external backend and installs no software at runtime. The adapters use
private app interfaces, so a Paseo update can require a compatibility update.

External selections name the receiving chat, with an explicit choice when several same-workspace chats are available. Adding from a source does not require an open composer. File selections retain exact text, document fingerprints, and ranges. Markdown retains rendered text and a file path without inferred source lines. Diff captures one continuous file and side; mixed files, sides, hunk headers, and gaps are refused. Working comparison refs are retained as mutable refs, without claiming immutable Git revisions. Terminal positions are buffer coordinates. Capture does not use clipboard or terminal input.

Saved text remains readable after source closure or reload. Exact file highlighting requires matching document content. Otherwise navigation reports a file-only or Diff-only open, or an unavailable position. Terminal output or resizing invalidates exact terminal reveal. External side-chat and browser-page selections are not supported. Saved quotes remain editable when their source is unavailable. Sent annotations keep their complete
text because Paseo no longer retains the separate comment metadata after sending. Resolve
unconfirmed write errors before reloading or disabling the plugin. Retry text is held only
in memory. Disabling Codex Style Chat Annotations restores native attachment cards
without deleting saved quotes.
