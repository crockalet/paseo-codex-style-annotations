import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import { z } from "zod";
import { installQuoteComposer } from "../client/quote-composer";
import { readQuotes, type DraftHost } from "../client/host-draft-bridge";
import type { SourceHost, ExternalSelection, ExternalOffer } from "../client/host-source-bridge";
import { createAnnotationPreferences } from "../client/annotation-preferences";
import type { AnnotationPreferences } from "../client/annotation-preferences";
import type { StoreBinding } from "../client/host-draft-bridge";
import type { SettingsLanguage, SettingsLocale } from "../client/settings-language";
import { fingerprint } from "../client/external-origin";
import { nativeHost } from "./native-host";
import { setup, settle } from "./dom";

const bundled = build({ entryPoints: [new URL("../client/web.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", external: ["react-native", "./quote-composer"] });
async function selectionBar(host: DraftHost, sources?: SourceHost) {
  const result = await bundled;
  const module = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  compileFunction(result.outputFiles[0].text, ["require", "module", "exports"])((name: string) => {
    if (name === "react-native") return { Platform: { OS: "web" } };
    if (name === "./quote-composer") return { installQuoteComposer: (options: { preferences?: AnnotationPreferences } = {}) => installQuoteComposer({ ...options, discover: async () => host, ...(sources ? { discoverSources: async () => sources } : {}) }) };
    return nativeRequire(name);
  }, module, module.exports);
  return z.object({ installSelectionBar: z.custom<(client: { paseo: unknown; openPanel: (...args: unknown[]) => void }, preferences?: AnnotationPreferences, language?: SettingsLanguage) => () => void>((value) => typeof value === "function") }).parse(module.exports).installSelectionBar;
}

test("两文字入口立即添加、紧凑可选评论、连续输入，Enter/Esc/IME 不发送 Agent", async () => {
  const { host, resolveKeyboardFocusScope } = await nativeHost();
  const { dom, input, anchor, binding } = setup();
  const install = await selectionBar(host);
  let sent = 0;
  const cleanup = install({ paseo: { agents: { ref: () => ({ send: () => { sent += 1; } }) } }, openPanel: () => {} });
  const rect = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20, x: 100, y: 100, toJSON: () => ({}) };
  dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  dom.window.Range.prototype.getBoundingClientRect = () => rect;
  const range = dom.window.document.createRange();
  range.selectNodeContents(anchor);
  dom.window.getSelection()?.addRange(range);
  anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true }));
  await settle();
  const toolbar = dom.window.document.querySelector("[data-paseo-quote]");
  const shadow = toolbar?.shadowRoot;
  assert.deepEqual(Array.from(shadow?.querySelectorAll(".bar button") ?? []).map((button) => button.textContent), ["Add to chat", "Ask in side chat"]);
  assert.equal(shadow?.querySelector('[data-action="reply"],[data-action="send"],[data-action="copy"]'), null);
  const quote = shadow?.querySelector('[data-action="quote"]');
  if (!(quote instanceof dom.window.HTMLButtonElement)) throw new Error("Missing add action");
  quote.click();
  quote.click();
  const popup = dom.window.document.querySelector("[data-paseo-quote-editor]");
  const field = popup?.querySelector("textarea");
  if (!(field instanceof dom.window.HTMLTextAreaElement)) throw new Error("Missing optional comment field");
  assert.equal(field.placeholder, "添加可选评论...");
  assert.equal(field.rows, 1);
  assert.equal(popup?.getAttribute("style")?.includes("width: 294px"), true);
  assert.equal(dom.window.document.activeElement, field);
  field.value = "添加完成前输入";
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await settle();
  const key = host.key(binding.hostId, binding.agentId);
  assert.equal(readQuotes(host.read(key)).length, 1);
  assert.equal(readQuotes(host.read(key))[0].item.subtitle, "添加完成前输入");
  assert.equal(dom.window.document.activeElement, field);
  const nativeScopes: unknown[] = [];
  dom.window.addEventListener("keydown", (event) => nativeScopes.push(resolveKeyboardFocusScope({ target: event.target, commandCenterOpen: false })), true);
  const keydown = (key: string, options: KeyboardEventInit = {}) => {
    const event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...options });
    field.dispatchEvent(event);
    return event;
  };
  field.dispatchEvent(new dom.window.CompositionEvent("compositionstart", { bubbles: true }));
  assert.equal(keydown("Enter", { isComposing: true }).defaultPrevented, false);
  assert.equal(keydown("Escape", { keyCode: 229 }).defaultPrevented, false);
  assert.equal(popup?.isConnected, true);
  field.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true }));
  assert.equal(keydown("Enter", { shiftKey: true }).defaultPrevented, false);
  for (const text of ["最新", "最新连续输入", "最新连续输入\n最后一个字"]) {
    field.value = text;
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  }
  assert.equal(readQuotes(host.read(key))[0].item.subtitle, "最新连续输入\n最后一个字");
  assert.equal(keydown("Enter").defaultPrevented, true);
  await settle();
  assert.equal(popup?.isConnected, false);
  assert.equal(input.value, "");
  assert.equal(sent, 0);
  assert.deepEqual(nativeScopes, ["editable", "editable", "editable", "editable"]);
  cleanup();
  await host.flush();
  dom.window.close();
});

test("评论保存失败保留文本并重试同 ID，完成按钮 Escape 的 native capture 为 editable", async () => {
  const { host, resolveKeyboardFocusScope } = await nativeHost();
  const { dom, anchor, binding } = setup();
  let fail = false;
  let failSession = false;
  const controlled: DraftHost = {
    ...host,
    hasAgent(hostId, agentId) { if (failSession) throw new Error("fixture session schema"); return host.hasAgent(hostId, agentId); },
    flush: async () => { if (fail) throw new Error("fixture disk"); await host.flush(); },
  };
  const cleanup = (await selectionBar(controlled))({ paseo: {}, openPanel: () => {} });
  const rect = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20, x: 100, y: 100, toJSON: () => ({}) };
  dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  dom.window.Range.prototype.getBoundingClientRect = () => rect;
  const range = dom.window.document.createRange();
  range.selectNodeContents(anchor);
  dom.window.getSelection()?.addRange(range);
  anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true }));
  await settle();
  const toolbar = dom.window.document.querySelector("[data-paseo-quote]");
  const add = toolbar?.shadowRoot?.querySelector('[data-action="quote"]');
  if (!(add instanceof dom.window.HTMLButtonElement)) throw new Error("Missing add action");
  add.click();
  await settle();
  const popup = dom.window.document.querySelector("[data-paseo-quote-editor]");
  const field = popup?.querySelector("textarea");
  if (!(field instanceof dom.window.HTMLTextAreaElement)) throw new Error("Missing comment field");
  const key = host.key(binding.hostId, binding.agentId);
  const id = readQuotes(host.read(key))[0].item.id;
  failSession = true;
  field.value = "会话接口失败的文本";
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await settle();
  assert.match(popup?.shadowRoot?.querySelector(".status")?.textContent ?? "", /fixture session schema/);
  assert.equal(field.value, "会话接口失败的文本");
  assert.equal(readQuotes(host.read(key))[0].item.subtitle, undefined);
  failSession = false;
  fail = true;
  field.value = "持久保存失败的文本";
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await settle();
  assert.match(popup?.shadowRoot?.querySelector(".status")?.textContent ?? "", /持久保存未确认/);
  assert.equal(field.value, "持久保存失败的文本");
  assert.equal(readQuotes(host.read(key))[0].item.id, id);
  fail = false;
  const retry = popup?.shadowRoot?.querySelector('[data-action="retry"]');
  if (!(retry instanceof dom.window.HTMLButtonElement)) throw new Error("Missing retry");
  retry.click();
  await settle();
  assert.equal(readQuotes(host.read(key)).length, 1);
  assert.equal(readQuotes(host.read(key))[0].item.id, id);
  const finish = popup?.shadowRoot?.querySelector('[data-action="finish"]');
  if (!(finish instanceof dom.window.HTMLButtonElement)) throw new Error("Missing finish action");
  let nativeScope: unknown;
  dom.window.addEventListener("keydown", (event) => { nativeScope = resolveKeyboardFocusScope({ target: event.target, commandCenterOpen: false }); }, true);
  finish.focus();
  finish.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
  assert.equal(nativeScope, "editable");
  await settle();
  assert.equal(readQuotes(host.read(key))[0].item.subtitle, "持久保存失败的文本");
  cleanup();
  await host.flush();
  dom.window.close();
});

test("选区按钮的 Escape 不打断 Agent，失焦和 Escape 完成后保留同一注释", async () => {
  const { host, resolveKeyboardFocusScope } = await nativeHost();
  const { dom, input, anchor, binding } = setup();
  const cleanup = (await selectionBar(host))({ paseo: {}, openPanel: () => {} });
  const rect = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20, x: 100, y: 100, toJSON: () => ({}) };
  dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  dom.window.Range.prototype.getBoundingClientRect = () => rect;
  const show = async () => {
    const range = dom.window.document.createRange();
    range.selectNodeContents(anchor);
    dom.window.getSelection()?.removeAllRanges();
    dom.window.getSelection()?.addRange(range);
    anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true }));
    await settle();
  };
  const nativeScopes: unknown[] = [];
  let interrupts = 0;
  dom.window.addEventListener("keydown", (event) => {
    const scope = resolveKeyboardFocusScope({ target: event.target, commandCenterOpen: false });
    nativeScopes.push(scope);
    if (event.key === "Escape" && (scope === "other" || scope === "message-input")) interrupts += 1;
  }, true);
  for (const action of ["quote", "side"]) {
    await show();
    const popup = dom.window.document.querySelector("[data-paseo-quote]");
    const button = popup?.shadowRoot?.querySelector(`[data-action="${action}"]`);
    if (!(button instanceof dom.window.HTMLButtonElement)) throw new Error("Missing selection action");
    button.focus();
    button.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    assert.equal(popup?.getAttribute("style")?.includes("display: none"), true);
  }
  for (const completion of ["blur", "Escape"]) {
    await show();
    const toolbar = dom.window.document.querySelector("[data-paseo-quote]");
    const add = toolbar?.shadowRoot?.querySelector('[data-action="quote"]');
    if (!(add instanceof dom.window.HTMLButtonElement)) throw new Error("Missing add action");
    add.click();
    await settle();
    const popup = dom.window.document.querySelector("[data-paseo-quote-editor]");
    const field = popup?.querySelector("textarea");
    if (!(field instanceof dom.window.HTMLTextAreaElement)) throw new Error("Missing comment field");
    const key = host.key(binding.hostId, binding.agentId);
    const quote = readQuotes(host.read(key)).at(-1);
    if (!quote) throw new Error("Missing added quote");
    field.value = `完成方式 ${completion}`;
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    if (completion === "blur") input.focus();
    else field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    await settle();
    assert.equal(popup?.isConnected, completion === "blur");
    assert.equal(readQuotes(host.read(key)).find((entry) => entry.item.id === quote.item.id)?.item.subtitle, `完成方式 ${completion}`);
  }
  assert.equal(interrupts, 0);
  assert.deepEqual(nativeScopes, ["editable", "editable", "editable"]);
  assert.equal(input.value, "");
  cleanup();
  await host.flush();
  dom.window.close();
});


test("external toolbar defaults automatically, retains manual choice only for the same selection, and writes to a hidden draft", async () => {
  const { host } = await nativeHost(), { dom, anchor, binding } = setup();
  document.querySelector('[data-testid="message-input-root"]')?.remove();
  let receive: (selection: ExternalSelection) => void = () => {}, observations = 0;
  const sources: SourceHost = { capture: () => null, observe(listener) { receive = listener; observations++; return () => { observations--; }; }, reveal: async () => ({ kind: "unavailable", reason: "fixture" }), dispose() {} };
  const cleanup = (await selectionBar(host, sources))({ paseo: {}, openPanel() {} });
  try {
    await settle();
    const recipient = (agentId: string): StoreBinding => ({ kind: "store", hostId: binding.hostId, agentId, draftKey: host.key(binding.hostId, agentId), anchor, pane: binding.pane, label: agentId === "agent-one" ? "First chat" : "Second chat", validate: () => window.location.pathname === binding.workspacePath });
    const first = recipient("agent-one"), second = recipient("agent-two");
    const selected: ExternalOffer = { root: anchor, selectionToken: {}, label: "file", recipients: [first, second], preferred: first, validForAdd: () => true,
      snapshot: Promise.resolve({ text: "  exact selected text\t\n", title: "a.ts:2", origin: { kind: "file", workspace: { serverId: binding.hostId, workspaceId: "workspace-one", workspaceKey: "fixture-host:workspace-one", root: "/work" }, tabId: "file", file: { requestedPath: "a.ts", absolutePath: "/work/a.ts", relativePath: "a.ts" }, from: 4, to: 15, lineStart: 2, lineEnd: 2, version: await fingerprint("document") } }),
      source: { valid: () => true, geometry: () => ({ kind: "unavailable" }), reveal: async () => ({ kind: "unavailable", reason: "fixture" }) } };
    receive({ kind: "offer", offer: selected });
    const toolbar = document.querySelector('[data-paseo-quote]'), shadow = toolbar?.shadowRoot, add = shadow?.querySelector<HTMLButtonElement>('[data-action="quote"]'), chooser = shadow?.querySelector<HTMLSelectElement>('select[data-receiver]');
    assert.ok(add && chooser); assert.equal(add.disabled, false); assert.equal(chooser.value, "0"); assert.deepEqual(Array.from(chooser.options).map((option) => option.textContent), ["Choose receiving chat", "First chat", "Second chat"]);
    assert.equal(shadow?.querySelector<HTMLButtonElement>('[data-action="side"]')?.hidden, true);
    const publish = (offer: ExternalOffer) => receive({ kind: "offer", offer });
    const fresh = { ...selected, preferred: second };
    publish(fresh); assert.equal(chooser.value, "1", "automatic mode adopts the latest preferred receiver on recapture");
    chooser.value = "0"; chooser.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    publish(fresh); assert.equal(chooser.value, "0", "viewport publication retains manual choice");
    publish({ ...fresh }); assert.equal(chooser.value, "0", "same logical selection recapture retains manual choice");
    publish({ ...fresh, recipients: [second] }); assert.equal(chooser.value, "0", "removed manual recipient returns to automatic");
    publish({ ...fresh }); assert.equal(chooser.value, "1");
    chooser.value = "0"; chooser.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    publish({ ...fresh, selectionToken: {} }); assert.equal(chooser.value, "1", "new range in the same editor resets manual choice");
    publish({ ...fresh, selectionToken: {}, recipients: [], preferred: null }); assert.equal(add.disabled, true);
    const finalOffer = { ...fresh, selectionToken: {} }; publish(finalOffer); assert.equal(add.disabled, false); assert.equal(chooser.value, "1");
    anchor.textContent = "changed after toolbar focus"; add.click(); await settle(); await settle();
    assert.equal(readQuotes(host.read(first.draftKey)).length, 0); const quotes = readQuotes(host.read(second.draftKey)); assert.equal(quotes.length, 1); assert.equal(quotes[0].item.text.endsWith("  exact selected text\t\n"), true);
    receive({ kind: "offer", offer: finalOffer }); assert.equal(toolbar?.getAttribute("style")?.includes("display: none"), true, "viewport updates cannot reoffer an already consumed selection");
  } finally { cleanup(); assert.equal(observations, 0); await host.flush(); dom.window.close(); }
});


test("disabling chat Add leaves the existing chat side-question action available", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup();
  const preferences = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse({ status: "ready", revision: "disabled-chat", values: { chat: false } }); } }); await preferences.refresh();
  const cleanup = (await selectionBar(host))({ paseo: {}, openPanel() {} }, preferences);
  try {
    const rect = new dom.window.DOMRect(100, 100, 100, 20); dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: () => rect }); dom.window.Range.prototype.getBoundingClientRect = () => rect;
    const range = document.createRange(); range.selectNodeContents(anchor); dom.window.getSelection()?.addRange(range); anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true })); await settle();
    const shadow = document.querySelector('[data-paseo-quote]')?.shadowRoot;
    assert.equal(shadow?.querySelector<HTMLButtonElement>('[data-action="quote"]')?.disabled, true);
    assert.equal(shadow?.querySelector<HTMLButtonElement>('[data-action="side"]')?.disabled, false);
    assert.match(shadow?.querySelector('.selection-status')?.textContent ?? "", /disabled/);
  } finally { cleanup(); preferences.dispose(); await host.flush(); dom.window.close(); }
});


function testLanguage(initial: SettingsLocale = "en") {
  let locale = initial, disposals = 0;
  const listeners = new Set<() => void>();
  const language: SettingsLanguage = {
    getSnapshot: () => locale,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposals++; },
  };
  return { language, listeners, get disposals() { return disposals; }, change(next: SettingsLocale) { locale = next; for (const listener of listeners) listener(); } };
}

test("compact bilingual receiver action preserves manual routing, frozen text, native picker focus and snapshot errors", async () => {
  const { host } = await nativeHost(), { dom, anchor, binding } = setup(), locale = testLanguage();
  let receive: (selection: ExternalSelection) => void = () => {};
  const sources: SourceHost = { capture: () => null, observe(listener) { receive = listener; return () => {}; }, reveal: async () => ({ kind: "unavailable", reason: "fixture" }), dispose() {} };
  const preferences = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse({ status: "ready", revision: "ready", values: {} }); } });
  await preferences.refresh();
  const cleanup = (await selectionBar(host, sources))({ paseo: {}, openPanel() {} }, preferences, locale.language);
  try {
    await settle();
    const recipient = (agentId: string, label: string): StoreBinding => ({ kind: "store", hostId: binding.hostId, agentId, draftKey: host.key(binding.hostId, agentId), anchor, pane: binding.pane, label, validate: () => true });
    const first = recipient("agent-one", "<First & chat>"), second = recipient("agent-two", "Second chat");
    const snapshot = { text: "frozen exact selection", title: "a.ts:2", origin: { kind: "file" as const, workspace: { serverId: binding.hostId, workspaceId: "workspace-one", workspaceKey: "fixture-host:workspace-one", root: "/work" }, tabId: "file", file: { requestedPath: "a.ts", absolutePath: "/work/a.ts", relativePath: "a.ts" }, from: 4, to: 15, lineStart: 2, lineEnd: 2, version: await fingerprint("document") } };
    const offer: ExternalOffer = { root: anchor, selectionToken: {}, label: "file", recipients: [first, second], preferred: second, validForAdd: () => true, snapshot: Promise.resolve(snapshot), source: { valid: () => true, geometry: () => ({ kind: "unavailable" }), reveal: async () => ({ kind: "unavailable", reason: "fixture" }) } };
    receive({ kind: "offer", offer }); await settle();
    const shadow = document.querySelector('[data-paseo-quote]')?.shadowRoot;
    const add = shadow?.querySelector<HTMLButtonElement>('[data-action="quote"]'), chooser = shadow?.querySelector<HTMLSelectElement>('select[data-receiver]');
    assert.ok(add && chooser);
    assert.equal(shadow?.querySelector('.source-label'), null);
    assert.equal(add.textContent, "Add to Second chat");
    chooser.value = "0"; chooser.dispatchEvent(new dom.window.Event("change", { bubbles: true })); chooser.focus();
    locale.change("zh");
    assert.equal(add.textContent, "添加到 <First & chat> 对话"); assert.equal(add.title, add.textContent); assert.equal(add.getAttribute("aria-label"), add.textContent);
    assert.equal(chooser.getAttribute("aria-label"), "切换接收对话：<First & chat>");
    assert.equal(shadow?.querySelector('[role="toolbar"]')?.getAttribute("aria-label"), "选中文字");
    assert.equal(shadow?.activeElement, chooser); assert.equal(chooser.value, "0"); assert.equal(add.querySelector("First"), null);
    const mouse = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }); chooser.dispatchEvent(mouse); assert.equal(mouse.defaultPrevented, false);
    receive({ kind: "offer", offer: { ...offer } }); locale.change("en"); await settle();
    assert.equal(chooser.value, "0"); assert.equal(add.textContent, "Add to <First & chat>");
    anchor.textContent = "changed since capture"; add.click(); await settle(); await settle();
    assert.equal(readQuotes(host.read(first.draftKey)).at(-1)?.item.text.endsWith(snapshot.text), true);
    assert.equal(readQuotes(host.read(second.draftKey)).length, 0);
    let rejectSnapshot: (cause: Error) => void = () => {};
    receive({ kind: "offer", offer: { ...offer, selectionToken: {}, snapshot: new Promise((_, reject) => { rejectSnapshot = reject; }) } });
    rejectSnapshot(new Error("opaque snapshot 原始错误")); await settle();
    assert.equal(add.disabled, true); assert.equal(shadow?.querySelector('.selection-status')?.textContent, "opaque snapshot 原始错误");
    locale.change("zh"); await preferences.refresh(); locale.change("en");
    assert.equal(add.disabled, true); assert.equal(shadow?.querySelector('.selection-status')?.textContent, "opaque snapshot 原始错误");
    receive({ kind: "offer", offer: { ...offer, selectionToken: {}, recipients: [], preferred: null } }); await settle();
    assert.equal(shadow?.querySelector('.selection-status')?.textContent, "No receiving chat in this workspace");
    locale.change("zh"); assert.equal(shadow?.querySelector('.selection-status')?.textContent, "没有同工作区的接收对话"); assert.equal(add.disabled, true);
  } finally { cleanup(); assert.equal(locale.listeners.size, 0); assert.equal(locale.disposals, 0); preferences.dispose(); await host.flush(); dom.window.close(); }
});

test("side question locale refresh preserves text, focus, pending controls and opaque error", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup(), locale = testLanguage();
  let fail: (cause: Error) => void = () => {}, sends = 0;
  const cleanup = (await selectionBar(host))({ paseo: { agents: { ref: () => ({ refresh: () => new Promise((_, reject) => { fail = reject; }), timeline: { refetch: async () => ({ entries: [] }) }, send() { sends++; } }) } }, openPanel() { throw Error("Unexpected panel"); } }, undefined, locale.language);
  try {
    const rect = new dom.window.DOMRect(100, 100, 100, 20); dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: () => rect }); dom.window.Range.prototype.getBoundingClientRect = () => rect;
    const range = document.createRange(); range.selectNodeContents(anchor); dom.window.getSelection()?.addRange(range); anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true })); await settle();
    const shadow = document.querySelector('[data-paseo-quote]')?.shadowRoot;
    const side = shadow?.querySelector<HTMLButtonElement>('[data-action="side"]'), ask = shadow?.querySelector<HTMLButtonElement>('[data-action="ask"]'), cancel = shadow?.querySelector<HTMLButtonElement>('[data-action="cancel"]');
    assert.ok(side && ask && cancel); side.click();
    const field = document.querySelector<HTMLTextAreaElement>('[data-paseo-sidechat-question]'); assert.ok(field);
    assert.equal(field.placeholder, "Ask about this in a side chat…"); field.value = "my unsent side question"; field.setSelectionRange(3, 8);
    locale.change("zh");
    assert.equal(field.value, "my unsent side question"); assert.equal(document.activeElement, field); assert.equal(field.selectionStart, 3); assert.equal(field.selectionEnd, 8);
    assert.equal(field.getAttribute("aria-label"), "侧边聊天问题"); assert.equal(field.placeholder, "在侧边聊天中询问这段内容…"); assert.equal(ask.textContent, "提问"); assert.equal(cancel.textContent, "取消");
    assert.match(shadow?.querySelector('.status')?.textContent ?? "", /换行/);
    ask.click(); locale.change("en"); assert.equal(ask.disabled, true); assert.equal(cancel.disabled, true); assert.equal(field.readOnly, true); assert.equal(field.value, "my unsent side question"); assert.equal(document.activeElement, field);
    fail(new Error("opaque side 原始错误")); await settle();
    assert.equal(ask.disabled, false); assert.equal(field.readOnly, false); assert.equal(shadow?.querySelector('.status')?.textContent, "opaque side 原始错误");
    locale.change("zh"); assert.equal(shadow?.querySelector('.status')?.textContent, "opaque side 原始错误"); assert.equal(field.value, "my unsent side question"); assert.equal(document.activeElement, field); assert.equal(sends, 0);
  } finally { cleanup(); assert.equal(locale.listeners.size, 0); assert.equal(locale.disposals, 0); await host.flush(); dom.window.close(); }
});


test("toolbar localizes loading, policy and settings failure statuses without translating raw errors", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup(), locale = testLanguage();
  let completeRead: (value: unknown) => void = () => {};
  const preferences = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse(await new Promise<unknown>((resolve) => { completeRead = resolve; })); } });
  const cleanup = (await selectionBar(host))({ paseo: {}, openPanel() {} }, preferences, locale.language);
  try {
    const rect = new dom.window.DOMRect(100, 100, 100, 20); dom.window.Range.prototype.getClientRects = () => Object.assign([rect], { item: () => rect }); dom.window.Range.prototype.getBoundingClientRect = () => rect;
    const range = document.createRange(); range.selectNodeContents(anchor); dom.window.getSelection()?.addRange(range); anchor.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true })); await settle();
    const shadow = document.querySelector('[data-paseo-quote]')?.shadowRoot, status = shadow?.querySelector<HTMLElement>('.selection-status'), add = shadow?.querySelector<HTMLButtonElement>('[data-action="quote"]');
    assert.ok(status && add); assert.equal(status.textContent, "Loading annotation settings…"); assert.equal(add.disabled, true);
    locale.change("zh"); assert.equal(status.textContent, "正在读取注释设置…");
    completeRead({ status: "invalid", revision: "fixture", error: "opaque settings 原始错误" }); await settle();
    assert.equal(status.textContent, "注释设置读取失败：opaque settings 原始错误");
    locale.change("en"); assert.equal(status.textContent, "Could not load annotation settings: opaque settings 原始错误"); assert.equal(add.disabled, true);
    preferences.accept({ chat: false, file: true, diff: true, markdown: true, terminal: true });
    assert.equal(status.textContent, "This annotation type is disabled. Enable it in plugin settings.");
    locale.change("zh"); assert.equal(status.textContent, "此类注释已关闭，可在插件设置中开启"); assert.equal(add.disabled, true);
    preferences.accept({ chat: true, file: true, diff: true, markdown: true, terminal: true }); assert.equal(status.hidden, true); assert.equal(add.disabled, false);
  } finally { cleanup(); preferences.dispose(); await host.flush(); dom.window.close(); }
});
