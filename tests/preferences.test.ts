import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createAnnotationPreferences } from "../client/annotation-preferences";
import { annotationValuesSchema, preferences, type AnnotationKind } from "../shared/preferences";
import { installQuoteComposer } from "../client/quote-composer";
import { readQuotes, type DraftHost, type StoreBinding } from "../client/host-draft-bridge";
import { fingerprint, type ExternalOrigin, type ExternalSnapshot } from "../client/external-origin";
import type { ExternalOffer } from "../client/host-source-bridge";
import { nativeHost } from "./native-host";
import { setup, settle } from "./dom";

function settingsFixture(initial: unknown = {}) {
  let document: unknown = { status: "ready", revision: "revision-1", values: initial }, fail = false;
  const methods: string[] = [];
  const client: Pick<PluginClientContext, "rpc"> = { async rpc(contract) { methods.push(contract.name); if (fail) throw new Error("fixture disconnected"); return contract.output.parse(document); } };
  return { client, methods, saved: () => structuredClone(document), set: (next: unknown) => { document = next; }, fail: (value: boolean) => { fail = value; } };
}
const kinds: AnnotationKind[] = ["chat", "file", "diff", "markdown", "terminal"];
async function source(kind: Exclude<AnnotationKind, "chat">): Promise<ExternalSnapshot> {
  const workspace = { serverId: "fixture-host", workspaceId: "workspace-one", workspaceKey: "fixture-host:workspace-one", root: "/work" }, file = { requestedPath: "a.ts", absolutePath: "/work/a.ts", relativePath: "a.ts" }, version = await fingerprint("source");
  const common = { workspace, tabId: "source", version };
  const origins: Record<Exclude<AnnotationKind, "chat">, ExternalOrigin> = {
    file: { ...common, kind: "file", file, from: 0, to: 4, lineStart: 1, lineEnd: 1 },
    markdown: { ...common, kind: "markdown", file },
    terminal: { ...common, kind: "terminal", terminalId: "term", cwd: "/work", streamKey: "fixture-host:/work:term", buffer: "normal", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, cols: 80, rows: 24 },
    diff: { ...common, kind: "diff", segment: { file, displayPath: "a.ts", oldPath: null, side: "new", lineStart: 1, lineEnd: 1, startColumn: 0, endColumn: 4, cells: [{ lineNumber: 1, hunkIndex: 0, lineIndex: 0, type: "add", from: 0, to: 4 }] }, revision: { kind: "commit", sha: "captured-sha" } },
  };
  return { text: "raw\t\n", title: "source", origin: origins[kind] };
}
function external(snapshot: ExternalSnapshot, binding: StoreBinding): ExternalOffer {
  return { selectionToken: {}, root: binding.anchor, label: "source", snapshot: Promise.resolve(snapshot), preferred: binding, recipients: [binding], validForAdd: () => binding.validate(), source: { valid: () => true, geometry: () => ({ kind: "unavailable" }), reveal: async () => ({ kind: "unavailable", reason: "fixture" }) } };
}

test("native host settings definition has five true defaults and loads persisted values without opening Settings", async () => {
  assert.equal(preferences.scope, "host"); assert.equal(preferences.version, 1);
  assert.deepEqual(annotationValuesSchema.parse({}), { chat: true, file: true, diff: true, markdown: true, terminal: true });
  const fixture = settingsFixture({ file: false, terminal: false }), first = createAnnotationPreferences(fixture.client);
  assert.equal(first.state().status, "loading"); await first.refresh(); assert.equal(first.enabled("file"), false); assert.equal(first.enabled("chat"), true); first.dispose();
  const reloaded = createAnnotationPreferences(fixture.client); await reloaded.refresh(); assert.equal(reloaded.enabled("terminal"), false); assert.equal(reloaded.enabled("markdown"), true); reloaded.dispose();
  assert.ok(fixture.methods.every((name) => name === "settings.annotation-kinds.read"));
});

test("settings read failures and invalid documents fail closed without writes or reset; recovery and disposal are explicit", async () => {
  const fixture = settingsFixture({ file: false }), controller = createAnnotationPreferences(fixture.client); await controller.refresh();
  const saved = fixture.saved(); fixture.fail(true); const failed = await controller.check("chat"); assert.equal(failed.allowed, false); assert.equal(controller.state().status, "error"); assert.deepEqual(fixture.saved(), saved);
  fixture.fail(false); fixture.set({ status: "invalid", revision: "newer", error: "newer schema" }); assert.equal((await controller.check("file")).allowed, false); assert.equal(controller.state().status, "error");
  fixture.set({ status: "ready", revision: "recovered", values: {} }); await controller.refresh(); assert.equal(controller.enabled("file"), true);
  let notifications = 0; controller.subscribe(() => { notifications++; }); controller.dispose(); controller.accept(annotationValuesSchema.parse({})); await controller.refresh(); assert.equal(notifications, 0); assert.equal(controller.enabled("chat"), false);
  assert.ok(fixture.methods.every((name) => name.endsWith(".read")));
});

test("a late read cannot replace the immediate confirmed Settings save", async () => {
  let resolve!: (value: unknown) => void;
  const client: Pick<PluginClientContext, "rpc"> = { async rpc(contract) { return contract.output.parse(await new Promise((done) => { resolve = done; })); } };
  const controller = createAnnotationPreferences(client), loading = controller.refresh();
  controller.accept(annotationValuesSchema.parse({ chat: false })); resolve({ status: "ready", revision: "old", values: {} }); await loading;
  assert.equal(controller.enabled("chat"), false); controller.dispose();
});

for (const kind of kinds) test(`${kind} switch gates only new annotations and keeps saved annotations editable`, async () => {
  const { host } = await nativeHost(), { dom, anchor, input, binding } = setup(), fixture = settingsFixture(), controller = createAnnotationPreferences(fixture.client);
  await controller.refresh();
  const receiver: StoreBinding = { kind: "store", hostId: binding.hostId, agentId: binding.agentId, draftKey: host.key(binding.hostId, binding.agentId), anchor, pane: binding.pane, label: "Original receiver", validate: () => window.location.pathname === binding.workspacePath };
  const plugin = installQuoteComposer({ discover: async () => host, preferences: controller });
  try {
    const add = async () => kind === "chat" ? plugin.add({ composer: input, anchor, agentId: binding.agentId, formattedText: "> frozen", preview: "frozen" }) : plugin.addExternal(external(await source(kind), receiver), receiver);
    const created = await add(); assert.equal(created.kind, "committed"); if (created.kind !== "committed") throw new Error("missing quote");
    const key = receiver.draftKey, before = host.read(key);
    fixture.set({ status: "ready", revision: "disabled", values: { [kind]: false } }); await controller.refresh();
    assert.deepEqual(host.read(key), before);
    const refused = await add(); assert.equal(refused.kind, "not-written"); assert.equal(readQuotes(host.read(key)).length, 1);
    assert.equal((await plugin.setComment(created.ref, "still editable")).kind, "committed"); assert.equal(readQuotes(host.read(key))[0].item.subtitle, "still editable");
    for (const other of kinds.filter((value) => value !== kind)) assert.equal(controller.enabled(other), true);
  } finally { plugin.dispose(); controller.dispose(); await host.flush(); dom.window.close(); }
});

test("disabling a kind while native draft hydration waits refuses the frozen Add without changing drafts", async () => {
  const { host } = await nativeHost(), { dom, anchor, binding } = setup(), fixture = settingsFixture(), controller = createAnnotationPreferences(fixture.client); await controller.refresh();
  let release!: () => void, saves = 0;
  const controlled: DraftHost = { ...host, hydrate: async () => new Promise<void>((resolve) => { release = resolve; }), save(key, value) { saves++; host.save(key, value); } };
  const receiver: StoreBinding = { kind: "store", hostId: binding.hostId, agentId: binding.agentId, draftKey: host.key(binding.hostId, binding.agentId), label: "frozen", anchor, pane: binding.pane, validate: () => true };
  const plugin = installQuoteComposer({ discover: async () => controlled, preferences: controller });
  try {
    const adding = plugin.addExternal(external(await source("file"), receiver), receiver); await settle(); assert.equal(typeof release, "function");
    controller.accept(annotationValuesSchema.parse({ file: false })); release(); assert.equal((await adding).kind, "not-written"); assert.equal(saves, 0); assert.equal(host.read(receiver.draftKey), undefined);
  } finally { plugin.dispose(); controller.dispose(); dom.window.close(); }
});
