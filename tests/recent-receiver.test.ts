import assert from "node:assert/strict";
import { test } from "node:test";
import { createSourceHost, SOURCE_MODULE_SIGNATURES, type ExternalOffer } from "../client/host-source-bridge";
import { setup } from "./dom";

function fixture() {
  const { dom } = setup();
  const root = document.createElement("div"), preview = document.createElement("div");
  root.dataset.testid = "workspace-file-pane"; preview.dataset.testid = "markdown-preview-frame";
  preview.textContent = "first second first"; root.append(preview); document.body.append(root);
  const layoutListeners = new Set<() => void>(), sessionListeners = new Set<() => void>();
  const agents = new Map([ ["b", { workspaceId: "workspace-one", title: "B" }], ["a", { workspaceId: "workspace-one", title: "A" }], ["other", { workspaceId: "workspace-two", title: "Other" }] ]);
  const session = { agents, agentDetails: new Map(), workspaces: new Map([["workspace-one", {}], ["workspace-two", {}]]) };
  const sessionState = { sessions: { "fixture-host": session, "other-host": session } };
  const tabs = [{ tabId: "a-tab", target: { kind: "agent", agentId: "a" } }, { tabId: "b-tab", target: { kind: "agent", agentId: "b" } }, { tabId: "file", target: { kind: "file", path: "a.md" } }];
  const parents: Record<string, string> = { file: "b-tab" };
  const tree = { root: tabs, focusedPaneId: "main", parentTabIdByTabId: parents };
  let focusedTabId = "a-tab";
  const layoutState = { layoutByWorkspace: { "fixture-host:workspace-one": tree, "fixture-host:workspace-two": tree, "other-host:workspace-one": tree }, sheetsByWorkspace: {} };
  const context = { serverId: "fixture-host", workspaceId: "workspace-one", tabId: "file", target: tabs[2].target };
  const PaneProvider = () => {};
  const fiber = (props: unknown = {}) => ({ type: null as unknown, stateNode: null as unknown, memoizedProps: props, memoizedState: null, updateQueue: null, child: null as unknown, sibling: null, return: null as unknown });
  const current = fiber(), provider = fiber({ value: context }), leaf = fiber();
  current.stateNode = { current }; current.child = provider; provider.type = PaneProvider; provider.child = leaf; provider.return = current; leaf.stateNode = root; leaf.return = provider;
  Object.defineProperty(root, "__reactFiber$fixture", { value: leaf });
  const modules: Record<string, unknown> = {
    routes: { parseHostWorkspaceRouteFromPathname: (path: string) => { const parts = path.split("/"); return { serverId: parts[2], workspaceId: parts[4] }; } },
    workspaceIdentity: { resolveWorkspaceMapKeyByIdentity: ({ workspaceId }: { workspaceId: string }) => workspaceId.replace("alias-", "") },
    workspaceKey: { buildWorkspaceTabPersistenceKey: ({ serverId, workspaceId }: { serverId: string; workspaceId: string }) => `${serverId}:${workspaceId}` },
    workspaceSelectors: { selectWorkspaceDirectory: () => "/work" },
    layout: { collectAllTabs: (root: unknown) => root, findPaneById: (_root: unknown, paneId: string) => paneId === "main" ? { focusedTabId } : null, useWorkspaceLayoutStore: { getState: () => layoutState, subscribe: (fn: () => void) => { layoutListeners.add(fn); return () => layoutListeners.delete(fn); } } },
    sessions: { useSessionStore: { getState: () => sessionState, subscribe: (fn: () => void) => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); } } },
    pane: { PaneProvider }, keys: { buildDraftStoreKey: ({ serverId, agentId }: { serverId: string; agentId: string }) => `${serverId}:${agentId}` },
    paths: { resolveWorkspaceFilePaths: () => ({ absolutePath: "/work/a.md", relativePath: "a.md" }), normalizeWorkspaceFileLocation: () => {}, createWorkspaceFileTabTarget: () => {} },
  };
  const signatures = { ...SOURCE_MODULE_SIGNATURES, paths: ["normalizeWorkspaceFileLocation", "resolveWorkspaceFilePaths", "createWorkspaceFileTabTarget"] };
  const names = Object.keys(signatures), source = Object.entries(signatures).map(([name, exports], id) => `__d(function(g,r,i,a,m,e,d){${exports.map((key) => `e.${key}=function(){};`).join("")}},${id},[]);`).join("\n");
  const select = (from = 0, to = 5) => { const range = document.createRange(); range.setStart(preview.firstChild!, from); range.setEnd(preview.firstChild!, to); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); };
  select();
  const host = createSourceHost((id) => modules[names[id]], source);
  const capture = (): ExternalOffer => { const selected = host.capture(root); assert.equal(selected?.kind, "offer"); if (selected?.kind !== "offer") throw new Error("Missing offer"); return selected.offer; };
  const focus = (tabId: string) => { focusedTabId = tabId; for (const listener of layoutListeners) listener(); };
  const route = (serverId: string, workspaceId: string) => { context.serverId = serverId; context.workspaceId = workspaceId; dom.window.history.replaceState({}, "", `/h/${serverId}/workspace/${workspaceId}`); dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate")); };
  return { dom, host, root, preview, agents, tree, tabs, focus, capture, select, route, layoutListeners, sessionListeners, close: () => { host.dispose(); dom.window.close(); } };
}

test("eager native pane focus seeds MRU, external focus and background activity retain it", () => {
  const f = fixture();
  try {
    f.focus("file"); assert.equal(f.capture().preferred?.agentId, "a", "focus is sampled before the first selection");
    f.focus("a-tab"); f.focus("b-tab"); f.focus("file"); assert.equal(f.capture().preferred?.agentId, "b");
    f.agents.set("a", { workspaceId: "workspace-one", title: "new background activity" });
    for (const listener of f.sessionListeners) listener();
    for (const listener of f.layoutListeners) listener();
    assert.equal(f.capture().preferred?.agentId, "b");
    f.tabs.splice(1, 1); assert.equal(f.capture().preferred?.agentId, "b", "closed tab remains directory-valid");
    f.agents.delete("b"); assert.equal(f.capture().preferred?.agentId, "a", "removed agent is skipped");
  } finally { f.close(); }
});

test("history isolates canonical workspace and host, including route reentry without layout mutation", () => {
  const f = fixture();
  try {
    f.focus("b-tab"); f.focus("file");
    f.route("fixture-host", "workspace-two"); assert.equal(f.capture().preferred?.agentId, "other");
    f.route("other-host", "workspace-one"); assert.equal(f.capture().preferred?.agentId, "b", "parent is fallback, not leaked history");
    delete f.tree.parentTabIdByTabId.file;
    assert.equal(f.capture().preferred?.agentId, "a", "other host uses stable fallback");
    f.route("fixture-host", "workspace-one"); assert.equal(f.capture().preferred?.agentId, "b");
    f.focus("a-tab"); f.route("other-host", "workspace-one"); f.focus("file");
    assert.equal(f.capture().preferred?.agentId, "a", "route entry seeds focused agent without a layout notification");
    f.route("fixture-host", "alias-workspace-one"); assert.equal(f.capture().preferred?.agentId, "a");
  } finally { f.close(); }
});

test("no-history parent and stable fallback remain useful; zero candidates disables receiver", () => {
  const f = fixture();
  try {
    f.focus("file"); f.route("other-host", "workspace-one");
    assert.equal(f.capture().preferred?.agentId, "b");
    delete f.tree.parentTabIdByTabId.file;
    assert.deepEqual(f.capture().recipients.map((candidate) => candidate.agentId), ["a", "b"]);
    assert.equal(f.capture().preferred?.agentId, "a");
    f.agents.delete("a"); assert.equal(f.capture().preferred?.agentId, "b");
    const captured = f.capture(); f.agents.set("b", { workspaceId: "workspace-two", title: "moved" });
    assert.equal(captured.preferred?.validate(), false);
    assert.equal(f.capture().preferred, null); assert.equal(f.capture().recipients.length, 0);
  } finally { f.close(); }
});

test("logical Markdown selection survives recapture but changes for range, content, source and workspace", () => {
  const f = fixture();
  try {
    const first = f.capture(); assert.equal(f.capture().selectionToken, first.selectionToken);
    f.select(6, 12); const second = f.capture(); assert.notEqual(second.selectionToken, first.selectionToken);
    assert.equal(f.capture().selectionToken, second.selectionToken);
    f.preview.firstChild!.textContent = "FIRST second first"; f.select(6, 12); const changed = f.capture();
    assert.notEqual(changed.selectionToken, second.selectionToken);
    f.route("other-host", "workspace-one"); assert.notEqual(f.capture().selectionToken, changed.selectionToken);
    f.host.dispose(); assert.equal(f.layoutListeners.size, 0); assert.equal(f.sessionListeners.size, 0); assert.equal(f.host.capture(f.root), null);
  } finally { f.close(); }
});
