# Codex Style Annotations

Select text in a Paseo chat, file editor, Markdown preview, Diff, or terminal, attach it as an annotation, and add an optional comment.
Draft and sent annotations collapse into an **n 条注释** capsule. You can also ask about a
selection in a side chat.

![Codex Style Annotations illustrated preview using sample data](assets/preview.png)

The preview illustrates the chat interface with sample data. External sources and annotation-type settings are available in this source checkout; the published `v0.1.1` release contains chat annotations.

## Install

Codex Style Annotations requires Paseo 0.11.4 or later with native plugin Settings support.
Enable plugins in **Settings > Plugins**. Disable the original `quote` plugin before enabling
Codex Style Annotations. Running both is unsupported.

```bash
paseo plugin disable quote
paseo plugin add git:xzthemeofsss/paseo-quote-notes --ref v0.1.1
```

Skip the disable command if the original plugin is not installed. The new runtime ID is
`quote-notes`. Existing draft and sent attachments owned by `quote` remain readable.
Editing a legacy draft preserves its identity and metadata. New annotations use `quote-notes`.

## Add and edit annotations

Select text and click **Add to chat**. External selections show **Add to {chat}** and default to the most recently focused conversation in the same workspace. Use the arrow to choose another conversation. A file, Diff, or terminal can add an annotation without an open composer. The annotation appears immediately. Add a comment
in **添加可选评论...**, or leave it empty and edit it later. Adding an annotation does not
send a message. Send the draft with Paseo's normal message controls.

In the new comment field, **Enter**, **Esc**, or leaving the field saves the current comment.
**Shift+Enter** inserts a line break. IME composition does not confirm the comment.

Hover or focus the **n 条注释** capsule to read the summary. Click to pin it. Click **编辑**
or a numbered source marker to open the edit card. The card stages changes until you click
**保存**, **Cmd+Enter** on macOS, or **Ctrl+Enter** elsewhere. **Enter** inserts a line break.
**取消**, **Esc**, or clicking outside discards unsubmitted changes. The trash button removes
that annotation.

Saving and deleting lock the card until the operation settles. If persistence is unconfirmed,
the attempted operation remains available for retry. Dismissing the card after an attempt
does not undo that operation. Resolve write errors before reloading or disabling the plugin.
Unsaved retry text lives only in memory.

Click a summary entry to return to its source. Exact file highlighting requires the captured document to match, including unsaved edits. Otherwise the action reports that it opened the file without verifying the original position. Markdown preview selections have a path and rendered text, without source line numbers. Diff selections preserve the side, display path, renamed old path, source range, and comparison. Reopening a Diff reports that the original line position is unavailable. Terminal locations use buffer coordinates, never file lines. Terminal output, resize, buffer changes, closure, or reload can make exact terminal navigation unavailable.

Saved text and comments remain readable after source loss or reload. **原文位置不可用** does not prevent editing or removal. Quotes and comments persist in Paseo's native draft store.

## Choose annotation types

Open **Settings > Plugins > Codex Style Annotations > Annotation types**. Chat, file, Diff, Markdown preview, and terminal annotation switches default to on. Settings belong to the plugin installation on that host and apply to its authorized clients. Turning a type off prevents new annotations of that type. Saved annotations remain readable and editable. The chat switch keeps **在侧边聊天中提问** available.

Settings, the selection toolbar, and the side-question editor follow Paseo's English or Chinese language setting. Other languages use English. Other annotation popovers still use Chinese labels.

Settings load when the plugin starts. Each Add checks the saved settings again, so another client's changes apply before a new annotation is written. Read errors and invalid documents disable new annotation creation until the settings can be read. Use **重试读取** in the settings screen to recover. Failed saves and revision conflicts stay visible and preserve the saved values.

## Supported source selections

| Source | Captured text and limits |
| --- | --- |
| Chat | Existing rendered text and host Markdown serialization. Side chat remains available. |
| File editor and read-only code | Exact CodeMirror text, character range, file lines, and document fingerprint. One continuous selection. |
| Markdown preview | Exact rendered selection and file path, including rendered front matter. No inferred Markdown source lines. |
| Canvas Diff | Exact host selection for one continuous file and side in split or unified layout. Mixed files, mixed sides, hunk headers, and gaps are refused. Commit target and working comparison are retained. Working base refs are mutable and do not establish immutable Git revisions. |
| Terminal | Exact xterm text, terminal session, buffer kind, and buffer coordinates. Clipboard and terminal input are not used for capture. |

External side-chat and browser-page selections are not supported. Locator metadata is bounded; unusually long Diff ranges can be refused instead of losing source information.

## Read sent annotations

Click the sent **n 条注释** capsule, or press **Enter** or **Space**, to expand the complete
sent texts. **复制全文** copies an entry. **Esc** returns focus to the capsule, and clicking
outside closes it. Sent annotations are read only.

Paseo drops the separate comment metadata when sending. The expanded view keeps the complete
sent text, including the comment, without inferring a split. Validated pending messages use the same capsule before and after confirmation. Unsupported rows and rows shown before the native adapter is ready retain their native attachment cards. Disabling Codex Style Annotations
restores the native cards.

## Ask in a side chat

Select **在侧边聊天中提问**, enter a question, and press **Enter** or **Ask**. This creates a
child agent with the parent's provider, model, mode, and thinking level. The child receives
the selection, the source message when found, and up to eight recent main-chat turns.
The panel accepts follow-ups. **Open as tab** opens the child as a regular chat tab with the
full Paseo renderer.

## Data access and compatibility

Codex Style Annotations is trusted client code. It reads selections and their file, Diff, or terminal context, the same-workspace agent directory and drafts, sent message attachments, native annotation-type settings, and recent conversation text for side chats.
It stores annotations
in the existing native draft and writes to the clipboard when you choose to copy an entry.
When you send the draft, Paseo sends the quote and comment through your configured agent
provider. Asking in a side chat sends the selection, question, and recent context to that
provider. The plugin adds no external backend and installs no software at runtime.

The native draft, source-selection, and sent-message adapters inspect private app interfaces and fetch the app's
own JavaScript bundles from the same origin. These interfaces are not a stable plugin API.
Compatibility checks reject unknown contracts, and a Paseo update can require an adapter update.
The original chat UI was verified on macOS desktop with Paseo 0.11.4 in a dark theme. External capture is covered by isolated original-module browser checks against disk renderer 0.12.0-beta.3. These checks cover light and dark toolbars, compact layouts, language changes, and pending sent capsules. They do not establish the version or behavior of a running client. Complete browser clients and mobile clients have not been independently verified. Selection actions
target desktop and web clients. Mobile platforms use their system selection menu.

## Develop

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

The tests load the schema, store, persistence, converter, and keyboard focus resolver from the
installed macOS Paseo web bundle. Set `PASEO_BUNDLE` to another bundle path when needed. The
tests do not install the plugin or send agent messages. Runtime imports use Paseo's host
libraries, so installation needs no preparation command or runtime dependency install.

## Credits and license

Codex Style Annotations is a fork of
[paseo-quote by Chechulin Serhii](https://github.com/keefeere/paseo-quote).
It adds draft annotation editing, source markers, and sent annotation capsules. The original
[MIT license](LICENSE) and copyright notice are preserved.
