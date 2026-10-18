# Codex Style Chat Annotations

Codex Style Chat Annotations turns selected Paseo chat text into annotations with
optional comments. Draft and sent annotations collapse into an **n 条注释** capsule.
A numbered marker links a draft
annotation to its source while that source remains available. You can edit or delete draft
annotations, expand complete sent texts, and copy an entry.

The selection menu also offers **在侧边聊天中提问**. Asking creates a child agent with the
parent's provider, model, mode, and thinking level. It receives the selection, the source
message when found, and up to eight recent main-chat turns. You can continue in the side panel
or open the child as a regular chat tab.

## Setup and support

Paseo 0.11.2 or later is required. Disable the original `quote` plugin before enabling
Codex Style Chat Annotations. Running both is unsupported.
Existing `quote` draft and sent attachments remain readable, and editing a legacy draft
preserves its identity. New annotations use `quote-notes`.
No additional account or token is required. Annotation controls currently use Chinese labels,
and side chat controls include English.

The annotation UI was verified on macOS desktop with Paseo 0.11.4 in a dark theme. Light themes,
browser clients, and mobile clients have not been independently verified. Selection actions
target desktop and web clients. Mobile platforms use their system selection menu.

## Data access and limits

The plugin runs as trusted code in the Paseo app. It reads selections, the active agent and
draft, sent attachments, and recent conversation text for side chats. Quotes and saved
comments use Paseo's native draft store. Adding an annotation does not send a message.
When you send the draft, Paseo sends the quote and comment through your configured agent
provider. Asking in a side chat sends the selection, question, and recent context to that
provider. Copying an entry writes its text to the clipboard.

The plugin fetches the app's own JavaScript bundles from the same origin to check its native
adapters. It adds no external backend and installs no software at runtime. The adapters use
private app interfaces, so a Paseo update can require a compatibility update.

Source positions reset after a reload or source replacement. Saved quotes remain editable,
but navigation to an unavailable source is disabled. Sent annotations keep their complete
text because Paseo no longer retains the separate comment metadata after sending. Resolve
unconfirmed write errors before reloading or disabling the plugin. Retry text is held only
in memory. Disabling Codex Style Chat Annotations restores native attachment cards
without deleting saved quotes.
