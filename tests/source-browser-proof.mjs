import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const require2 = createRequire(new URL("../package.json", import.meta.url));
const { build } = require2("esbuild");
const playwright = process.env.PASEO_PLAYWRIGHT ?? require2.resolve("playwright");
const { chromium } = await import(pathToFileURL(playwright).href);
const repo = fileURLToPath(new URL("..", import.meta.url));
const bundleDirectory = "/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web";
const candidates = fs.readdirSync(bundleDirectory).filter((name) => /^index-.*\.js$/.test(name));
if (!process.env.PASEO_BUNDLE && candidates.length !== 1) throw Error("Set PASEO_BUNDLE to the intended installed bundle");
const bundlePath = process.env.PASEO_BUNDLE ?? `${bundleDirectory}/${candidates[0]}`;
const source = fs.readFileSync(bundlePath, "utf8");
const registry = source.split(/(?=__d\(function\()/).flatMap((c) => {
  if (!c.startsWith("__d(function(")) return [];
  const end = c.match(/\},\d+,\[[\d,]*\]\);/);
  return end && end.index !== void 0 ? [c.slice(0, end.index + end[0].length)] : [];
}).join("\n");
const output = await build({ stdin: { contents: `export * from '${repo}/client/host-source-bridge'; export {resolveModuleIds,createDraftHost} from '${repo}/client/host-draft-bridge'; export {installQuoteComposer} from '${repo}/client/quote-composer'; export {decodeExternal} from '${repo}/client/external-origin';`, resolveDir: repo }, bundle: true, write: false, format: "iife", globalName: "Bridge" });
const browser = await chromium.launch({ executablePath: process.env.PASEO_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-gpu"] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1e3 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("http://localhost/**", (route) => route.fulfill({ contentType: route.request().url().endsWith("/bundle.js") ? "text/javascript" : "text/html", body: route.request().url().endsWith("/bundle.js") ? registry : '<!doctype html><html><head><style>html,body{margin:0}#fixture{display:flex;flex-wrap:wrap}.panel{width:600px;height:350px;display:flex;flex-direction:column}.panel>div{flex:1;min-height:0;display:flex;flex-direction:column}[data-testid="workspace-file-pane"]{height:200px}[data-testid="file-source-editor"]{height:180px}</style></head><body><main id="fixture"><div class="panel" id="diff-one"></div><div class="panel" id="diff-two"></div><div class="panel" id="file"></div><div class="panel" id="markdown"></div><div class="panel" id="terminal-one"></div><div class="panel" id="terminal-two"></div></main><script src="/bundle.js"><\/script></body></html>' }));
  await page.addInitScript(() => {
    const registry2 = /* @__PURE__ */ new Map(), cache = /* @__PURE__ */ new Map(), overrides = /* @__PURE__ */ new Map();
    window.__d = (factory, id, deps) => registry2.set(id, { factory, deps });
    window.__r = (id) => {
      if (overrides.has(id)) return overrides.get(id);
      if (cache.has(id)) return cache.get(id).exports;
      const rec = registry2.get(id);
      if (!rec) throw Error(`Unregistered ${id}`);
      const mod = { exports: {} };
      cache.set(id, mod);
      rec.factory(window, window.__r, void 0, void 0, mod, mod.exports, rec.deps);
      return mod.exports;
    };
    window.__registry = registry2;
    window.__overrides = overrides;
  });
  await page.goto("http://localhost/h/fixture-host/workspace/workspace-one");
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.evaluate((source2) => {
    window.__source = source2;
    window.__ids = Bridge.resolveModuleIds(source2, Bridge.SOURCE_MODULE_SIGNATURES);
  }, source);
  await page.evaluate(() => {
    const r = window.__r, o = window.__overrides, ids = window.__ids, React = r(37), DOM = r(388), View = ({ children, style, testID, ...props }) => React.createElement("div", { "data-testid": testID, style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, ...Array.isArray(style) ? Object.assign({}, ...style) : style } }, children), wrap = (p) => React.createElement(React.Fragment, null, p.children), never = () => {
      throw Error("Forbidden fixture boundary");
    };
    const session = { agents: /* @__PURE__ */ new Map([["agent-one", { workspaceId: "workspace-one", title: "First chat" }], ["agent-two", { workspaceId: "workspace-one", title: "Second chat" }], ["foreign-agent", { workspaceId: "workspace-two", title: "Wrong workspace" }]]), agentDetails: /* @__PURE__ */ new Map(), workspaces: /* @__PURE__ */ new Map([["workspace-one", { id: "workspace-one", workspaceDirectory: "/work/fixture" }], ["workspace-two", { id: "workspace-two", workspaceDirectory: "/other" }]]), serverInfo: { features: {} } };
    const sessionState = { sessions: { "fixture-host": session }, setFocusedTerminalId: () => {
    } }, listeners = /* @__PURE__ */ new Set(), sessionStore = Object.assign((selector) => selector(sessionState), { getState: () => sessionState, subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    } });
    const tabs = ["diff-one", "diff-two", "file", "markdown", "terminal-one", "terminal-two"].map((id) => ({ tabId: id, target: id.startsWith("diff") ? { kind: "commit_diff", sha: "commit-" + id } : id.startsWith("terminal") ? { kind: "terminal", terminalId: id } : { kind: "file", path: id === "markdown" ? "readme.md" : "src/a.ts" } }));
    const layoutState = { layoutByWorkspace: { "fixture-host:workspace-one": { root: tabs, parentTabIdByTabId: {} } }, sheetsByWorkspace: {} };
    o.set(ids.sessions, { useSessionStore: sessionStore });
    o.set(3659, { useSessionStore: sessionStore });
    o.set(ids.layout, { useWorkspaceLayoutStore: { getState: () => layoutState, subscribe: () => () => {
    } }, collectAllTabs: (root) => root, findPaneById: () => null });
    o.set(ids.keys, { buildDraftStoreKey: ({ serverId, agentId }) => serverId + ":" + agentId });
    o.set(ids.workspaceSelectors, { selectWorkspaceDirectory: (state, server, workspace) => state.sessions[server].workspaces.get(workspace)?.workspaceDirectory });
    const openIds = Bridge.resolveModuleIds(window.__source, { opener: ["openWorkspaceTargetAtLocation", "openWorkspaceTargetBeside"] });
    o.set(openIds.opener, { openWorkspaceTargetAtLocation: (options) => {
      window.__test.opened.push(options);
      return "opened-tab";
    } });
    o.set(857, { useTranslation: () => ({ t: (s) => s }) });
    o.set(4809, { DomOverlayScrollbar: () => null });
    o.set(4546, { ContextMenu: wrap, ContextMenuTrigger: wrap, ContextMenuContent: () => null, ContextMenuItem: () => null, ContextMenuSeparator: () => null });
    o.set(897, { useToast: () => ({ copied: never, error: never }) });
    o.set(4699, { InlineReviewAddButton: () => null, InlineReviewThread: () => null });
    o.set(4573, { copyToClipboard: never });
    o.set(5027, { DocumentFileHeader: ({ file: file2 }) => React.createElement("span", null, file2.path) });
    o.set(729, { useDOMImperativeHandle: r(731).useDOMImperativeHandle });
    o.set(5176, {});
    o.set(3924, { openExternalUrl: never });
    o.set(4036, { focusWithRetries: () => {
    } });
    o.set(5192, { isTerminalFileDrag: () => false, isTerminalDragLeaveOutside: never, extractTerminalDropPaths: never, prepareDroppedPathsForTerminal: never });
    o.set(885, { getDesktopHost: never });
    for (const id of [429, 236, 148]) o.set(id, {});
    o.set(899, { View });
    o.set(900, { Text: ({ children }) => React.createElement("span", null, children) });
    o.set(901, { Pressable: View });
    o.set(5163, { TerminalFind: () => null });
    o.set(3222, { LoadingSpinner: () => null });
    o.set(3951, { useRetainedPanelActive: () => true });
    o.set(4131, { hasStringAsync: never, getStringAsync: never, setStringAsync: never });
    o.set(902, { __esModule: true, default: { View }, useAnimatedReaction: () => {
    }, runOnJS: (fn) => fn });
    const theme = { colors: new Proxy({ terminal: {} }, { get: (target, key) => target[key] ?? "#ddd" }), spacing: new Proxy({}, { get: () => 4 }), fontSize: { sm: 12, base: 14 }, fontWeight: { medium: "500" }, borderRadius: { md: 6 } };
    o.set(58, { useUnistyles: () => ({ theme }), StyleSheet: { create: (fn) => typeof fn === "function" ? fn(theme) : fn, absoluteFillObject: { position: "absolute", inset: 0 } } });
    o.set(1221, {});
    o.set(3767, { useHostRuntimeClient: () => ({ sendTerminalInput: (id, data) => window.__test.inputs.push({ id, data }) }), useHostRuntimeIsConnected: () => true });
    o.set(4790, { useKeyboardShiftStyle: () => ({ shift: { value: 0 }, style: {} }) });
    o.set(5057, { useAppActivelyVisible: () => true });
    o.set(4047, { usePanelStore: (selector) => selector({ mobilePanel: { target: "agent" }, showMobileAgentList: () => {
    } }) });
    o.set(4473, { useBlockMobilePanelOpenGestures: () => {
    } });
    o.set(5174, { toXtermTheme: () => ({}) });
    o.set(5193, {});
    o.set(1220, { useIsCompactFormFactor: () => false });
    o.set(884, { isNative: false, isWeb: true });
    o.set(887, { useAppSettings: () => ({ settings: { monoFontFamily: "monospace", terminalScrollbackLines: 100, codeFontSize: 14 } }) });
    o.set(4219, { classifyForResolution: never, fetchDaemonResolution: never });
    o.set(5172, { TerminalStreamController: class {
      dispose() {
      }
      setTerminal() {
      }
    } });
    window.__test = { roots: [], views: [], diffProps: {}, diffRoots: {}, clipboard: 0, inputs: [], opened: [], tabs, layoutState, session, sessionState };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText() {
      window.__test.clipboard++;
      never();
    }, readText() {
      window.__test.clipboard++;
      never();
    } } });
    const PaneProvider = r(ids.pane).PaneProvider, Surface = r(5026).DiffSurface, Cache = r(5044).DiffDocumentWorkspaceCacheProvider;
    const palette = Object.fromEntries(["surface", "headerSurface", "headerActiveSurface", "headerBorder", "border", "foreground", "foregroundMuted", "addition", "deletion", "additionBackground", "deletionBackground", "emptyBackground", "selection", "statusSuccess", "statusDanger", "statusWarning"].map((k) => [k, k === "foreground" ? "#222" : "#eee"]));
    palette.syntax = {};
    const makeFile = (path) => ({ path, oldPath: "old/" + path, status: "ok", isNew: false, isDeleted: false, additions: 1, deletions: 1, hunks: [{ oldStart: 10, oldCount: 3, newStart: 20, newCount: 3, lines: [{ type: "header", content: "@@ -10,3 +20,3 @@" }, { type: "context", content: "alpha" }, { type: "remove", content: "old beta" }, { type: "add", content: "new beta" }, { type: "context", content: "gamma" }] }] });
    const cmIds = Bridge.resolveModuleIds(window.__source, { view: ["EditorView", "Decoration", "ViewPlugin"], state: ["EditorState", "EditorSelection", "StateField"] }), EditorView = r(cmIds.view).EditorView, EditorState = r(cmIds.state).EditorState;
    function CodeFixture() {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const view = new EditorView({ parent: ref.current, state: EditorState.create({ doc: "one\n  second	line\nthird\n", selection: { anchor: 4, head: 18 }, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false)] }) });
        window.__test.views.push(view);
        return () => view.destroy();
      }, []);
      return React.createElement("div", { "data-testid": "workspace-file-pane" }, React.createElement("div", { "data-testid": "file-source-editor", ref }));
    }
    for (const tab of tabs) {
      const root = DOM.createRoot(document.getElementById(tab.tabId)), context = { serverId: "fixture-host", workspaceId: "workspace-one", tabId: tab.tabId, target: tab.target };
      let child;
      if (tab.tabId.startsWith("diff")) {
        const props = { files: [makeFile(tab.tabId + "/a.ts"), makeFile(tab.tabId + "/b.ts")], collapsedFilePaths: /* @__PURE__ */ new Set(), displayPreferences: { layout: "split", wrapLines: false, codeFontSize: 14, monoFontFamily: "monospace" }, palette, headerTypography: { family: "sans-serif", size: 12, statSize: 11 }, mode: { kind: "commit" }, onToggleFile: never, onSelectPath: never, selectedPath: null };
        window.__test.diffProps[tab.tabId] = props;
        window.__test.diffRoots[tab.tabId] = root;
        child = React.createElement(Cache, null, React.createElement(Surface, props));
      } else if (tab.tabId.startsWith("terminal")) child = React.createElement(r(5162).TerminalPane, { serverId: "fixture-host", cwd: "/work/fixture", terminalId: tab.tabId, isWorkspaceFocused: false, isPaneFocused: false, onOpenFileExplorer: never, onOpenWorkspaceFile: never });
      else if (tab.tabId === "file") child = React.createElement(CodeFixture);
      else child = React.createElement("div", { "data-testid": "workspace-file-pane" }, React.createElement("div", { "data-testid": "markdown-preview-frame" }, React.createElement("table", null, React.createElement("tbody", null, React.createElement("tr", null, React.createElement("td", null, "title"), React.createElement("td", null, "Rendered front matter")))), React.createElement("p", null, "Markdown selected  text\n\u5C3E  ")));
      root.render(React.createElement(PaneProvider, { value: context }, child));
      window.__test.roots.push(root);
    }
    Object.assign(o.get(58), { withUnistyles: (component) => component });
    theme.fontFamily = { ui: "sans-serif" };
    const empty = () => null, ui = new Proxy({}, { get: () => empty });
    for (const id of [4695, 4697, 4571, 1221, 5208, 5210, 5211, 3944, 5156, 4770, 3953, 5216, 5217, 4096, 4013, 4015, 3221, 4230, 5220, 5223, 4564, 5002]) o.set(id, ui);
    o.set(630, { useSafeAreaInsets: () => ({ bottom: 0 }) });
    o.set(4693, { floatingActionsClearance: () => 0 });
    o.set(4698, { defaultChangesState: { treeVisible: false, collapsedFilePaths: [], collapsedFolderPaths: [], commitsCollapsed: true, treeWidth: 200 } });
    o.set(5048, { useChangesPreferences: () => ({ preferences: { layout: "split", wrapLines: false, hideWhitespace: true, inlineDiff: true }, updatePreferences: () => {
    } }) });
    o.set(4121, { useCheckoutPrStatusQuery: () => ({ status: null, githubFeaturesEnabled: false, forge: null, authState: null, payloadError: null }), selectPrHintFromStatus: () => null });
    o.set(4089, { useIsLocalDaemon: () => false });
    o.set(4585, { useDesktopOpenTargets: () => ({ targets: [] }), openDesktopTarget: never });
    o.set(4115, { useCheckoutGitActionsStore: (selector) => selector({ refresh: never, getStatus: () => "idle", discardChanges: never }) });
    o.set(4097, { useGitActions: () => ({ gitActions: [], branchLabel: "fixture" }) });
    o.set(3778, { confirmDialog: never });
    o.set(4480, { PaneContentToolbar: wrap, ToolbarButton: empty, ToolbarControls: wrap, paneContentToolbarTrailingPadding: () => 0, paneContentToolbarIconButtonStyle: () => ({}), paneContentToolbarIconSize: () => 14 });
    o.set(3861, {});
    const actions = { commentsByTarget: /* @__PURE__ */ new Map(), editor: null, sheetEditor: null, onStartComment: () => {
    }, onChangeEditorBody: () => {
    } }, feedback = { clearance: 0, model: null, state: null }, workingFiles = [makeFile("working/a.ts")], query = { files: workingFiles, payloadError: null, diffTooLarge: false, isLoading: false };
    Object.assign(o.get(4699), { ReviewFeedbackAction: empty, ReviewCommentSheet: empty, buildReviewDraftKey: () => "fixture-review", useInlineReviewController: () => actions, useReviewAttachmentSnapshot: () => null, useReviewFeedback: () => feedback });
    o.set(5222, { useCheckoutDiffQuery: () => query });
    o.set(4116, { useCheckoutStatusQuery: () => ({ status: { isGit: true, isDirty: true, baseRef: "refs/heads/main", currentBranch: "fixture-topic" }, isLoading: false, isError: false, error: null }) });
    o.set(4119, { useWorkingDiffComparison: () => ({ comparison: "base", selectComparison: () => {
    } }) });
    const workingHook = r(5221);
    o.set(5221, { ...workingHook, usePublishWorkingDiffAttachment: () => {
    } });
    o.set(5024, { DiffDocument: (props) => React.createElement(Cache, null, React.createElement(Surface, { ...props, palette, headerTypography: { family: "sans-serif", size: 12, statSize: 11 }, collapsedFilePaths: /* @__PURE__ */ new Set(), onToggleFile: never, onSelectPath: never, selectedPath: null })) });
    const layoutStore = Object.assign((selector) => selector({ openTab: never }), { getState: () => layoutState, subscribe: () => () => {
    } });
    o.set(ids.layout, { ...o.get(ids.layout), useWorkspaceLayoutStore: layoutStore });
    const working2 = document.createElement("div");
    working2.id = "working";
    working2.className = "panel";
    document.getElementById("fixture").append(working2);
    const workingTab = { tabId: "working", target: { kind: "working_diff" } };
    tabs.push(workingTab);
    const workingRoot = DOM.createRoot(working2);
    workingRoot.render(React.createElement(PaneProvider, { value: { serverId: "fixture-host", workspaceId: "workspace-one", tabId: "working", target: workingTab.target } }, React.createElement(r(4692).ChangesSurface, { serverId: "fixture-host", workspaceId: "workspace-one", cwd: "/work/fixture", enabled: true, presentation: "diff" })));
    window.__test.roots.push(workingRoot);
    window.__test.rerenderDiff = (id, layout) => {
      const props = { ...window.__test.diffProps[id], displayPreferences: { ...window.__test.diffProps[id].displayPreferences, layout } }, tab = tabs.find((tab2) => tab2.tabId === id);
      window.__test.diffRoots[id].render(React.createElement(PaneProvider, { value: { serverId: "fixture-host", workspaceId: "workspace-one", tabId: id, target: tab.target } }, React.createElement(Cache, null, React.createElement(Surface, props))));
    };
    window.__host = Bridge.createSourceHost(window.__r, window.__source);
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="git-diff-canvas-root"]').length === 3 && document.querySelectorAll(".xterm").length === 2 && window.__test.views.length === 1 && !!document.querySelector('#working [data-testid="git-diff-canvas-root"]'));
  const file = await page.evaluate(async () => {
    const root = document.querySelector('#file [data-testid="workspace-file-pane"]'), result2 = window.__host.capture(root);
    if (result2?.kind !== "offer") return result2;
    const snapshot = await result2.offer.snapshot;
    window.__test.fileOffer = result2.offer;
    return { snapshot, preferred: result2.offer.preferred?.agentId ?? null, recipients: result2.offer.recipients.map((x) => x.agentId), valid: result2.offer.validForAdd(), geometry: result2.offer.source.geometry().kind };
  });
  assert.equal(file.snapshot.text, "  second	line\n");
  assert.deepEqual(file.recipients, ["agent-one", "agent-two"]);
  assert.equal(file.preferred, null);
  assert.equal(file.snapshot.origin.lineEnd, 2);
  const markdown = await page.evaluate(async () => {
    const text = document.querySelector("#markdown p").firstChild, range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const result2 = window.__host.capture(text.parentElement);
    if (result2?.kind !== "offer") return result2;
    return { snapshot: await result2.offer.snapshot };
  });
  assert.equal(markdown.snapshot.text, "Markdown selected  text\n\u5C3E  ");
  assert.equal(markdown.snapshot.origin.kind, "markdown");
  assert.equal(Object.hasOwn(markdown.snapshot.origin, "lineStart"), false);
  const terminal = await page.evaluate(async () => {
    function binding(id) {
      const root = document.querySelector(`#${id} [data-testid="terminal-surface"]`), entry = Bridge.currentFibers(root).find(({ fiber }) => fiber.type === __r(5175).default);
      for (let h = entry.fiber.memoizedState; h; h = h.next) {
        const runtime = h.memoizedState?.current;
        if (runtime instanceof __r(5177).TerminalEmulatorRuntime && root.contains(runtime.terminal?.element)) return { root, runtime, terminal: runtime.terminal };
      }
      throw Error("missing runtime");
    }
    const a = binding("terminal-one"), b = binding("terminal-two");
    await new Promise((resolve) => a.terminal.write("alpha\r\nbeta\u754C\r\ngamma", resolve));
    await new Promise((resolve) => b.terminal.write("second terminal", resolve));
    const deliveries = [];
    const stop = window.__host.observe((value) => deliveries.push(value));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    a.terminal.select(1, 0, 4);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const beforeStop = deliveries.length;
    stop();
    a.terminal.clearSelection();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cleaned = deliveries.length === beforeStop && beforeStop > 0;
    a.terminal.select(1, 0, 4);
    b.terminal.select(0, 0, 6);
    const offers = [window.__host.capture(a.root), window.__host.capture(b.root)];
    window.__test.termBinding = a;
    window.__test.termOffer = offers[0].offer;
    const snapshots = await Promise.all(offers.map((x) => x.kind === "offer" ? x.offer.snapshot : x));
    const revealed = await offers[0].offer.source.reveal();
    await new Promise((resolve) => a.terminal.write("\r\nchanged", resolve));
    const stale = await offers[0].offer.source.reveal();
    return { snapshots, revealed, stale, cleaned, globalIsB: window.__paseoTerminal === b.terminal };
  });
  assert.equal(terminal.snapshots[0].text, "lpha");
  assert.equal(terminal.snapshots[1].text, "second");
  assert.equal(terminal.globalIsB, true);
  assert.equal(terminal.cleaned, true);
  assert.equal(terminal.revealed.kind, "highlighted");
  assert.equal(terminal.stale.kind, "unavailable");
  await page.evaluate(() => {
    window.__diffBinding = (id) => {
      const root = document.querySelector(`#${id} [data-testid="git-diff-canvas-root"]`), entry = Bridge.currentFibers(root).find(({ fiber }) => fiber.type === __r(5026).DiffSurface);
      const hooks = [];
      for (let h = entry.fiber.memoizedState; h; h = h.next) hooks.push(h.memoizedState);
      for (let i = 0; i + 10 < hooks.length; i++) {
        const refs = hooks.slice(i, i + 11);
        if (refs.every((r) => r && typeof r === "object" && Object.hasOwn(r, "current")) && refs[0].current === root && refs[5].current === refs[6].current) return { root, model: refs[5].current, scroll: refs[4].current };
      }
      throw Error("missing diff refs");
    };
    window.__point = (id, fileIndex, rowInFile, cellIndex, offset) => {
      const b = window.__diffBinding(id), file2 = b.model.files[fileIndex], row = b.model.rows[file2.rowStart + rowInFile], cell = row.cells[cellIndex], rect = b.root.getBoundingClientRect(), fragment = cell.fragments.find((f) => f.start <= offset && offset <= f.end) || cell.fragments.at(-1), before = fragment.graphemes.filter((g) => g.end <= offset).reduce((n, g) => n + g.width, 0);
      return { x: rect.left + cellIndex * b.model.viewportWidth / row.cells.length + file2.gutterWidth + 8 + before + 0.05, y: rect.top + row.top + fragment.top + b.model.lineHeight / 2 - b.scroll.scrollTop };
    };
  });
  const drag = async (id, a, b) => {
    await page.locator("#" + id).scrollIntoViewIfNeeded();
    const from = await page.evaluate((p) => window.__point(...p), [id, ...a]), to = await page.evaluate((p) => window.__point(...p), [id, ...b]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    return page.evaluate(async (id2) => {
      const result2 = window.__host.capture(window.__diffBinding(id2).root);
      if (result2?.kind !== "offer") return result2;
      window.__test.diffOffer = result2.offer;
      return { kind: "offer", snapshot: await result2.offer.snapshot, valid: result2.offer.validForAdd(), geometry: result2.offer.source.geometry().kind };
    }, id);
  };
  const working = await drag("working", [0, 1, 1, 0], [0, 2, 1, 3]);
  assert.equal(working.snapshot.origin.revision.kind, "working");
  assert.equal(working.snapshot.origin.revision.mode, "base");
  assert.equal(working.snapshot.origin.revision.baseRef, "refs/heads/main");
  assert.equal(working.snapshot.origin.revision.ignoreWhitespace, true);
  const old = await drag("diff-one", [0, 1, 0, 1], [0, 3, 0, 4]), right = await drag("diff-two", [0, 1, 1, 0], [0, 2, 1, 3]), mixed = await drag("diff-one", [0, 1, 0, 0], [0, 2, 1, 3]);
  assert.equal(old.snapshot.text, "lpha\nold beta\ngamm");
  assert.equal(old.snapshot.origin.segment.file.requestedPath, "old/diff-one/a.ts");
  assert.equal(right.snapshot.text, "alpha\nnew");
  assert.equal(mixed.kind, "unavailable");
  assert.match(mixed.reason, /两侧/);
  const reversed = await drag("diff-one", [0, 3, 0, 4], [0, 1, 0, 1]);
  assert.equal(reversed.snapshot.text, old.snapshot.text);
  const mixedFiles = await drag("diff-one", [0, 1, 1, 0], [1, 1, 1, 3]);
  assert.equal(mixedFiles.kind, "unavailable");
  assert.match(mixedFiles.reason, /跨文件/);
  const boundary = await drag("diff-two", [0, 1, 1, 0], [0, 2, 1, 0]);
  assert.equal(boundary.snapshot.text, "alpha\n");
  assert.equal(boundary.snapshot.origin.segment.lineEnd, 20);
  await page.evaluate(() => window.__test.rerenderDiff("diff-one", "unified"));
  await page.waitForFunction(() => window.__diffBinding("diff-one").model.layout === "unified");
  const unified = await drag("diff-one", [0, 2, 0, 0], [0, 2, 0, 3]);
  assert.equal(unified.snapshot.text, "old");
  assert.equal(unified.snapshot.origin.segment.side, "old");
  const final = await page.evaluate(async () => {
    const source2 = await window.__test.fileOffer.snapshot, opened = await window.__host.reveal({ ...source2, origin: { ...source2.origin, version: { ...source2.origin.version, digest: "0".repeat(64) } } });
    history.replaceState({}, "", "/h/fixture-host/workspace/workspace-two");
    const validAfterWorkspaceSwitch = window.__test.fileOffer.validForAdd(), receiverAfterWorkspaceSwitch = window.__test.fileOffer.recipients[0].validate();
    window.__host.dispose();
    window.__test.roots.forEach((root) => root.unmount());
    return { opened, validAfterWorkspaceSwitch, receiverAfterWorkspaceSwitch, clipboard: window.__test.clipboard, inputs: window.__test.inputs, remaining: document.querySelectorAll('.xterm,.cm-editor,[data-testid="git-diff-canvas-root"]').length };
  });
  assert.equal(final.opened.kind, "opened");
  assert.equal(final.validAfterWorkspaceSwitch, false);
  assert.equal(final.receiverAfterWorkspaceSwitch, false);
  assert.equal(final.clipboard, 0);
  assert.equal(final.remaining, 0);
  assert.deepEqual(final.inputs, []);
  assert.deepEqual(errors, []);
  const result = { passed: true, file, markdown, terminal, working, old, right, mixed, reversed, mixedFiles, boundary, unified, final };
  fs.writeFileSync(process.env.PASEO_SOURCE_PROOF ?? "/tmp/paseo-external-source-browser-proof.json", JSON.stringify({ ...result, bundlePath }, null, 2));
  console.log(JSON.stringify({ passed: true, final }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
