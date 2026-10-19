import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeExternal, encodeExternal, externalOriginSchema, fingerprint, type ExternalSnapshot } from "../client/external-origin";
import { makeQuote, mutateQuotes, readQuotes, writeQuoteComment, quoteAttachmentSchema, type DraftHost, type StoreBinding } from "../client/host-draft-bridge";
import { installQuoteComposer } from "../client/quote-composer";
import { resolveModuleIds } from "../client/host-draft-bridge";
import { resolveSemanticModuleIds, SOURCE_MODULE_SIGNATURES, type ExternalOffer } from "../client/host-source-bridge";
import { bundle, nativeHost } from "./native-host";
import { setup, settle } from "./dom";

const workspace = { serverId: "fixture-host", workspaceId: "workspace-one", workspaceKey: "fixture-host:workspace-one", root: "/work/fixture" };
const file = { requestedPath: "a.ts", absolutePath: "/work/fixture/a.ts", relativePath: "a.ts" };
async function snapshot(): Promise<ExternalSnapshot> {
  return { text: "\n  a\t\u00a0\r\n尾  \n", title: "a.ts:1-3", origin: { kind: "file", workspace, tabId: "file-tab", file, from: 1, to: 14, lineStart: 1, lineEnd: 3, version: await fingerprint("document") } };
}
function receiver(host: DraftHost, root: HTMLElement, agentId = "agent-one"): StoreBinding {
  return { kind: "store", hostId: "fixture-host", agentId, draftKey: host.key("fixture-host", agentId), anchor: root, pane: root, label: agentId,
    validate: () => window.location.pathname === "/h/fixture-host/workspace/workspace-one" };
}
function offer(snapshot: ExternalSnapshot, binding: StoreBinding): ExternalOffer {
  return { label: "file", selectionToken: {}, root: binding.anchor, snapshot: Promise.resolve(snapshot), recipients: [binding], preferred: binding, validForAdd: () => binding.anchor.isConnected,
    source: { valid: () => true, geometry: () => ({ kind: "unavailable" }), reveal: async () => ({ kind: "unavailable", reason: "fixture source gone" }) } };
}

test("external locator preserves exact selection separately from model text and rejects malformed/bounded metadata", async () => {
  const captured = await snapshot(), encoded = encodeExternal(captured, "https://app.paseo.test/h/fixture-host/workspace/workspace-one#old");
  assert.notEqual(encoded.text, captured.text);
  const decoded = decodeExternal(encoded); assert.equal(decoded.kind, "external");
  if (decoded.kind !== "external") throw new Error("Missing snapshot");
  assert.equal(decoded.snapshot.text, captured.text); assert.deepEqual(decoded.snapshot.origin, captured.origin);
  assert.equal(new URL(encoded.url).pathname, "/h/fixture-host/workspace/workspace-one");
  assert.equal(decodeExternal({ ...encoded, text: "replaced" }).kind, "invalid");
  assert.equal(decodeExternal({ ...encoded, url: encoded.url.replace("paseo-annotation=", "legacy=") }).kind, "legacy");
  assert.equal(decodeExternal({ ...encoded, url: `${encoded.url.split("#")[0]}#paseo-annotation=%broken` }).kind, "invalid");
  assert.equal(externalOriginSchema.safeParse({ ...captured.origin, kind: "markdown", lineStart: 10 }).success, false);
  assert.equal(externalOriginSchema.safeParse({ ...captured.origin, kind: "terminal", lineStart: 10 }).success, false);
  assert.throws(() => encodeExternal({ ...captured, origin: { ...captured.origin, workspace: { ...workspace, root: "x".repeat(20_000) } } }, encoded.url));
});

test("original installed bundle discovers source identities and rejects ambiguous private contracts", () => {
  const ids = resolveModuleIds(bundle, SOURCE_MODULE_SIGNATURES);
  assert.ok(Object.keys(ids).length >= 8);
  assert.ok(resolveModuleIds(bundle, { diff: ["DiffSurface"], editor: ["EditorView", "Decoration", "ViewPlugin"] }).diff);
  const signatures = { terminal: ["data-terminal-scrollbar-root", "onRendererReadyChange", "useDOMImperativeHandle"], runtime: ["TerminalEmulatorRuntime", "createTerminalResizeEvent", "encodeTerminalOutput", "window.__paseoTerminal"] };
  assert.ok(resolveSemanticModuleIds(bundle, signatures).terminal);
  assert.throws(() => resolveSemanticModuleIds(bundle + bundle, signatures), /无法验证/);
});

for (const pluginId of ["quote", "quote-notes"]) test(`${pluginId} native schema/store/persistence/converter retains external locator, exact raw text and comments`, async () => {
  const fixture = await nativeHost(), { dom, anchor } = setup(), binding = receiver(fixture.host, anchor), key = binding.draftKey;
  const captured = await snapshot(), encoded = encodeExternal(captured, window.location.href), created = makeQuote(encoded.text, captured.title, encoded.url), attachment = quoteAttachmentSchema.parse({ ...created, pluginId });
  const other = { kind: "workspace_file", path: "keep.md", selection: { kind: "whole_file" } };
  fixture.host.save(key, { text: "body", attachments: [other] });
  assert.equal((await mutateQuotes({ host: fixture.host, binding, change: { kind: "add", attachment } })).kind, "committed");
  assert.equal(writeQuoteComment({ host: fixture.host, ref: { binding, id: created.item.id }, comment: "comment\n尾  " }).kind, "committed");
  await fixture.host.flush();
  const restored = await nativeHost(fixture.storage); await restored.host.hydrate(key);
  const saved = readQuotes(restored.host.read(key))[0], decoded = decodeExternal(saved.item);
  assert.equal(decoded.kind, "external"); if (decoded.kind !== "external") throw new Error("Missing restored locator");
  assert.equal(decoded.snapshot.text, captured.text); assert.equal(decoded.comment, "comment\n尾  ");
  assert.equal(saved.item.url, encoded.url); assert.equal(saved.item.id, created.item.id); assert.equal(saved.pluginId, pluginId);
  assert.deepEqual(restored.host.read(key)?.attachments[0], other); assert.equal(restored.host.read(key)?.text, "body");
  const converted = fixture.converter(saved); assert.equal(Reflect.get(Object(converted), "text"), saved.item.text);
  assert.equal(JSON.stringify(converted).includes(encoded.url), true, "native sent attachment keeps source URL");
  await restored.host.flush(); dom.window.close();
});

test("store-only concurrent annotations/comments preserve latest draft body and unrelated/unknown fields", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup(), binding = receiver(host, anchor), key = binding.draftKey;
  document.querySelector('[data-testid="message-input-root"]')?.remove();
  let current = { text: "before", attachments: [] as unknown[], future: { keep: 1 } };
  const other = { kind: "workspace_file", path: "keep", selection: { kind: "whole_file" } };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const controlled: DraftHost = { ...host, hydrate: async () => gate, read: () => current, save: (_key, next) => { current = { ...next, future: { keep: 1 } }; }, flush: async () => {} };
  const a = makeQuote("first", "first", window.location.href), b = makeQuote("second", "second", window.location.href);
  const writes = [a, b].map((attachment) => mutateQuotes({ host: controlled, binding, change: { kind: "add", attachment } }));
  current = { text: "typed while hydrating", attachments: [other], future: { keep: 1 } }; release();
  assert.deepEqual((await Promise.all(writes)).map((x) => x.kind), ["committed", "committed"]);
  assert.equal(writeQuoteComment({ host: controlled, ref: { binding, id: a.item.id }, comment: "new comment" }).kind, "committed");
  assert.equal(current.text, "typed while hydrating"); assert.deepEqual(current.future, { keep: 1 }); assert.deepEqual(current.attachments[0], other);
  assert.equal(readQuotes(current).length, 2); assert.equal(readQuotes(current)[0].item.subtitle, "new comment");
  assert.equal(host.read(key), undefined); dom.window.close();
});

for (const change of ["route", "recipient", "source", "key"] as const) test(`store-only hydrate race ${change} refuses all writes to the frozen recipient`, async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup(), original = receiver(host, anchor), key = original.draftKey;
  let valid = true, sourceValid = true, release!: () => void, saves = 0;
  const binding: StoreBinding = { ...original, validate: () => valid && original.validate() };
  const controlled: DraftHost = { ...host, hydrate: async () => new Promise<void>((resolve) => { release = resolve; }), save: (target, draft) => { saves++; host.save(target, draft); } };
  const writing = mutateQuotes({ host: controlled, binding: change === "key" ? { ...binding, draftKey: "wrong" } : binding, change: { kind: "add", attachment: makeQuote("frozen", "frozen", window.location.href) }, isCurrent: () => sourceValid });
  if (change !== "key") {
    if (change === "route") dom.window.history.replaceState({}, "", "/h/fixture-host/workspace/different-workspace");
    if (change === "recipient") valid = false;
    if (change === "source") sourceValid = false;
    release();
  }
  assert.equal((await writing).kind, "not-written"); assert.equal(saves, 0); assert.equal(host.read(key), undefined);
  dom.window.close();
});

test("external Add owns one ID/promise without a composer and persists before optional comment", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup();
  document.querySelector('[data-testid="message-input-root"]')?.remove();
  const binding = receiver(host, anchor), selection = offer(await snapshot(), binding);
  let fail = true, saves = 0;
  const controlled: DraftHost = { ...host, save(key, value) { saves++; host.save(key, value); }, async flush() { if (fail) throw new Error("uncertain persistence"); await host.flush(); } };
  const plugin = installQuoteComposer({ discover: async () => controlled });
  try {
    const adding = plugin.addExternal(selection, binding), duplicate = plugin.addExternal(selection, binding);
    assert.equal(adding, duplicate); const field = document.querySelector<HTMLTextAreaElement>('[data-paseo-quote-editor] textarea'); assert.ok(field);
    field.value = "optional"; field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal((await adding).kind, "uncertain"); await settle();
    const quotes = readQuotes(host.read(binding.draftKey)); assert.equal(quotes.length, 1); assert.equal(quotes[0].item.subtitle, "optional"); assert.equal(decodeExternal(quotes[0].item).kind, "external");
    assert.equal(document.querySelector("textarea[data-composer-input]"), null); assert.equal(saves, 2, "one annotation save and one optional comment save");
    fail = false;
    const retry = document.querySelector('[data-paseo-quote-editor]')?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="retry"]'); retry?.click(); await settle();
    assert.equal(readQuotes(host.read(binding.draftKey)).length, 1);
  } finally { fail = false; plugin.dispose(); await host.flush(); dom.window.close(); }
});


test("invalid external provenance fails before delayed host discovery without an unhandled promise or draft write", async () => {
  const { host } = await nativeHost(), { dom, anchor } = setup(), binding = receiver(host, anchor), captured = await snapshot();
  let finish!: (host: DraftHost) => void;
  const plugin = installQuoteComposer({ discover: () => new Promise<DraftHost>((resolve) => { finish = resolve; }) });
  try {
    const writing = plugin.addExternal(offer({ ...captured, origin: { ...captured.origin, workspace: { ...workspace, root: "x".repeat(20_000) } } }, binding), binding);
    await settle(); await settle(); finish(host); assert.equal((await writing).kind, "not-written"); assert.equal(host.read(binding.draftKey), undefined);
  } finally { plugin.dispose(); dom.window.close(); }
});
