# Quote for Paseo

Select text in an agent chat to show two actions, **添加到对话** and **在侧边聊天中提问**.
This local edition requires Paseo 0.11.2 or later.

## Add a quote and an optional comment

**添加到对话** immediately adds the selection as a native text attachment. The message box
shows an **n 条注释** chip inside its bordered card. A 294 px editor above the selection lets you **添加可选评论...**.
You can leave the comment empty and add it later.

Typing updates the same attachment. **Enter** and **Esc** finish editing and request a native
draft flush. Leaving the field also saves its current text. **Shift+Enter** inserts a line break. IME composition does
not confirm the comment. These actions keep the quote and never send a message to the agent.
Send the draft with Paseo's normal message controls.

Hover or focus **n 条注释** for a compact numbered summary; click to pin it. **编辑** or a source
marker opens a multiline edit card. Typing and moving focus do not save changes.
**保存** or **Cmd+Enter** on macOS and **Ctrl+Enter** elsewhere saves the comment, including an
empty comment. **取消**, **Esc**, or clicking outside discards unsubmitted changes.
The trash button deletes that quote. Saving and deleting lock the card until the operation
settles. An unconfirmed result keeps the exact attempted operation available for retry.
After an attempt, **取消** dismisses the card without undoing that operation.
Removing a quote keeps the remaining summary rows in place. Click a
quote to reveal its exact source. Highlights and numbered source markers follow the selected
text as the pane moves. The quote text is read only. Quotes and saved comments return from Paseo's native draft after a
reload. Source positions are transient: after reload or source replacement, **原文位置不可用**
disables navigation while editing and removal still work. Moving a source offscreen keeps the
same comment field beside the composer until the source returns. Your message body and other attachments stay separate from the annotations.

Each quote belongs to its original chat and host, including split panes. Changing the chat
closes the card and discards unsubmitted edits. A comment from a failed write remains available
from the original chat's summary while the plugin stays active. A persistence failure also keeps the text available while the plugin remains active.
The editor does not claim that this text is saved until the native flush succeeds.

## Sent annotations

Sent quotes show the same **n 条注释** capsule above the native message. Click it, or press
**Enter** or **Space**, to read numbered complete sent texts and **复制全文**. **Esc** returns
focus to the capsule; clicking outside closes it. Sent annotations are read only. The native
message body, images, files, copy control, and token statistics keep their behavior.

Paseo drops the separate comment metadata when sending. The expanded sent text therefore
keeps the entire original text verbatim, including any saved comment, without guessing a split.
The plugin replaces native quote cards only when committed message props and exact native
attachment frames agree. Unsupported or pending rows keep the native cards. Disabling the
plugin restores those cards.

## Ask in a side chat

**在侧边聊天中提问** opens the existing side chat question field. **Enter** or **Ask** creates
a child agent with the same provider, model, mode, and thinking level. Its panel opens on the
right and accepts follow-ups. **Open as tab** turns it into a regular chat tab. Paseo archives
it with its parent.

A side chat is a fresh session. It receives the quote, the source message when found, and the
last eight turns of the main conversation. The panel renders code blocks and quotes with a
simple Markdown renderer. Open it as a tab for the full renderer.

## Keyboard reference

| Where | Key or action | Effect |
| --- | --- | --- |
| New comment field | Enter or Esc | Finish editing, keep the quote, and flush the comment |
| New comment field | Blur | Save the current comment |
| Existing edit card | Enter | Insert a line break |
| Existing edit card | Cmd+Enter or Ctrl+Enter | Save the current comment |
| Existing edit card | Esc, Cancel, or outside click | Discard unsubmitted edits |
| Side chat field | Enter | Ask in a side chat |
| Side chat field | Esc | Close the question field |
| Either field | Shift+Enter | Insert a line break |
| Quote summary | Tab | Move between source, edit, and remove controls |

Esc in the main chat keeps Paseo's normal interrupt behavior. Comment fields and their popup
controls use an editable focus scope so they do not trigger that shortcut.

## Install

Enable plugins under **Settings → Plugins**, then install this checkout.

```bash
paseo plugin install /absolute/path/to/this/local-edition --id quote
```

Based on [paseo-quote by Chechulin Serhii](https://github.com/keefeere/paseo-quote).
Plugins are trusted code. This plugin runs in the app and has no daemon-side code.

## Compatibility and persistence

- Desktop and web apps only. iOS and Android use the system selection menu.
- The chip uses private message-box markup and native draft interfaces. Before writing, the
  plugin checks the running bundle's exports, draft schema, comment field, and text conversion.
  If the contract changes, it shows the error. It does not duplicate an uncertain attachment
  or insert the comment into the message body. A later Paseo release may need an adapter update.
- The native draft is the only persistent annotation store. Each attachment keeps its complete
  quote and comment in `item.text`. A non-empty `item.subtitle` contains only the comment.
  Paseo's converter sends the complete `item.text` once.
- Existing attachments without `subtitle` keep their entire text as the original quote.
  A subtitle that is not an exact suffix of the full text disables comment editing and keeps
  the content intact.
- Draft delivery and persistence follow Paseo's native behavior. The plugin does not add
  synchronization between app windows or replace the message editor. Text from a failed write
  is retained in memory for retry, so resolve the error before reloading or disabling the plugin.
- Disabling the plugin restores the ordinary attachment pills without deleting saved quotes.

## Develop

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"
paseo plugin reload quote
```

The tests load the native schema, store, persistence, converter, and keyboard focus resolver
from the unique installed macOS Paseo web bundle. Set `PASEO_BUNDLE` explicitly when using
a different installation or when multiple bundles exist. Selection tests bundle the actual web module and
replace platform discovery with an isolated native draft fixture. They do not install the
plugin or send messages.

On the Linux AppImage, `paseo` treats an existing absolute directory argument as "open project".
Use the parent-and-subpath form for a local install.

```bash
paseo plugin install "$(dirname "$PWD"):$(basename "$PWD")"
```

## License

MIT
