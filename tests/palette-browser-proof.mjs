import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { build, transform } = require("esbuild");
const { chromium } = await import(pathToFileURL(process.env.PASEO_PLAYWRIGHT ?? require.resolve("playwright")).href);
const repo = fileURLToPath(new URL("..", import.meta.url));
const bundleDirectory = "/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web";
const bundles = fs.readdirSync(bundleDirectory).filter((name) => /^index-.*\.js$/.test(name));
if (!process.env.PASEO_BUNDLE && bundles.length !== 1) throw Error("Set PASEO_BUNDLE to the intended installed bundle");
const source = fs.readFileSync(process.env.PASEO_BUNDLE ?? `${bundleDirectory}/${bundles[0]}`, "utf8");
const registry = source.split(/(?=__d\(function\()/).flatMap((chunk) => {
  if (!chunk.startsWith("__d(function(")) return [];
  const end = chunk.match(/\},\d+,\[[\d,]*\]\);/);
  return end && end.index !== undefined ? [chunk.slice(0, end.index + end[0].length)] : [];
}).join("\n");
const bridge = await build({ stdin: { contents: `export {resolveModuleIds} from './client/host-draft-bridge'; export {SOURCE_MODULE_SIGNATURES} from './client/host-source-bridge';`, resolveDir: repo }, bundle: true, write: false, format: "iife", globalName: "Bridge" });
const web = fs.readFileSync(new URL("../client/web.ts", import.meta.url), "utf8");
const palette = await transform(web.slice(web.indexOf("type Rgba ="), web.indexOf("const MARKUP =")) + "\nwindow.paletteProbe = {applyPalette, STYLE};", { loader: "ts" });
const browser = await chromium.launch({ executablePath: process.env.PASEO_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-gpu"] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1080 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://localhost/")) return route.abort();
    return route.fulfill({ contentType: url.endsWith("/bundle.js") ? "text/javascript" : "text/html", body: url.endsWith("/bundle.js") ? registry : '<!doctype html><html><head><style>body{margin:16px;font:14px system-ui}#terminal{height:150px;display:flex;flex-direction:column}#cases{display:grid;grid-template-columns:1fr 1fr;gap:12px}section{padding:12px;border:1px solid #aaa;border-radius:8px}h2{margin:0 0 8px;font-size:13px}</style></head><body><h1>Annotation toolbar contrast</h1><div id="terminal"></div><main id="cases"></main><script src="/bundle.js"><\/script></body></html>' });
  });
  await page.addInitScript(() => {
    const registry = new Map(), cache = new Map(), overrides = new Map();
    window.__d = (factory, id, deps) => registry.set(id, { factory, deps });
    window.__r = (id) => {
      if (overrides.has(id)) return overrides.get(id);
      if (cache.has(id)) return cache.get(id).exports;
      const record = registry.get(id);
      if (!record) throw Error(`Unregistered ${id}`);
      const module = { exports: {} };
      cache.set(id, module);
      record.factory(window, window.__r, undefined, undefined, module, module.exports, record.deps);
      return module.exports;
    };
    window.__overrides = overrides;
  });
  await page.goto("http://localhost/h/fixture-host/workspace/workspace-one");
  await page.addScriptTag({ content: bridge.outputFiles[0].text });
  await page.evaluate((source) => {
    const r = window.__r, o = window.__overrides, ids = Bridge.resolveModuleIds(source, Bridge.SOURCE_MODULE_SIGNATURES);
    const React = r(37), DOM = r(388), wrap = ({ children }) => React.createElement(React.Fragment, null, children);
    const never = () => { throw Error("Forbidden fixture boundary"); };
    const View = ({ children, style, testID }) => React.createElement("div", { "data-testid": testID, style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, ...Array.isArray(style) ? Object.assign({}, ...style) : style } }, children);
    const sessionState = { sessions: {}, setFocusedTerminalId() {} };
    const sessions = Object.assign((selector) => selector(sessionState), { getState: () => sessionState, subscribe: () => () => {} });
    o.set(ids.sessions, { useSessionStore: sessions });
    o.set(3659, { useSessionStore: sessions });
    o.set(857, { useTranslation: () => ({ t: (text) => text }) });
    o.set(4809, { DomOverlayScrollbar: () => null });
    o.set(4546, { ContextMenu: wrap, ContextMenuTrigger: wrap, ContextMenuContent: () => null, ContextMenuItem: () => null, ContextMenuSeparator: () => null });
    o.set(897, { useToast: () => ({ copied: never, error: never }) });
    o.set(729, { useDOMImperativeHandle: r(731).useDOMImperativeHandle });
    o.set(5176, {});
    o.set(3924, { openExternalUrl: never });
    o.set(4036, { focusWithRetries() {} });
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
    o.set(902, { __esModule: true, default: { View }, useAnimatedReaction() {}, runOnJS: (fn) => fn });
    const theme = { colors: new Proxy({ terminal: {} }, { get: (target, key) => target[key] ?? "#ddd" }), spacing: new Proxy({}, { get: () => 4 }), fontSize: { sm: 12, base: 14 }, fontWeight: { medium: "500" }, borderRadius: { md: 6 } };
    o.set(58, { useUnistyles: () => ({ theme }), StyleSheet: { create: (fn) => typeof fn === "function" ? fn(theme) : fn, absoluteFillObject: { position: "absolute", inset: 0 } } });
    o.set(1221, {});
    o.set(3767, { useHostRuntimeClient: () => ({ sendTerminalInput: never }), useHostRuntimeIsConnected: () => true });
    o.set(4790, { useKeyboardShiftStyle: () => ({ shift: { value: 0 }, style: {} }) });
    o.set(5057, { useAppActivelyVisible: () => true });
    o.set(4047, { usePanelStore: (selector) => selector({ mobilePanel: { target: "agent" }, showMobileAgentList: never }) });
    o.set(4473, { useBlockMobilePanelOpenGestures() {} });
    o.set(5174, { toXtermTheme: () => ({}) });
    o.set(5193, {});
    o.set(1220, { useIsCompactFormFactor: () => false });
    o.set(884, { isNative: false, isWeb: true });
    o.set(887, { useAppSettings: () => ({ settings: { monoFontFamily: "monospace", terminalScrollbackLines: 100, codeFontSize: 14 } }) });
    o.set(4219, { classifyForResolution: never, fetchDaemonResolution: never });
    o.set(5172, { TerminalStreamController: class { dispose() {} setTerminal() {} } });
    const PaneProvider = r(ids.pane).PaneProvider;
    DOM.createRoot(document.getElementById("terminal")).render(React.createElement(PaneProvider, { value: { serverId: "fixture-host", workspaceId: "workspace-one", tabId: "terminal-one", target: { kind: "terminal", terminalId: "terminal-one" } } }, React.createElement(r(5162).TerminalPane, { serverId: "fixture-host", cwd: "/work/fixture", terminalId: "terminal-one", isWorkspaceFocused: false, isPaneFocused: false, onOpenFileExplorer: never, onOpenWorkspaceFile: never })));
  }, source);
  await page.waitForSelector('[data-testid="terminal-surface"] .xterm');
  await page.addScriptTag({ content: palette.code });
  const results = await page.evaluate(() => {
    const anchor = document.querySelector('[data-testid="terminal-surface"]');
    const parent = (element) => element.parentElement ?? element.getRootNode().host;
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g).map(Number);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const over = (top, bottom) => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      return alpha ? [0, 1, 2].map((index) => (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha).concat(alpha) : [0, 0, 0, 0];
    };
    const paint = (element, pixel) => {
      for (let node = element; node; node = parent(node)) {
        const style = getComputedStyle(node);
        pixel = over(pixel, parse(style.backgroundColor));
        pixel[3] *= Number(style.opacity);
      }
      return over(pixel, [255, 255, 255, 1]);
    };
    const luminance = (color) => color.slice(0, 3).map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const read = (element) => {
      const style = getComputedStyle(element), foreground = paint(element, parse(style.color)), background = paint(element, [0, 0, 0, 0]);
      const light = luminance(foreground), dark = luminance(background);
      return { color: style.color, background: style.backgroundColor, opacity: style.opacity, colorScheme: style.colorScheme, cursor: style.cursor, disabled: element.disabled ?? false, contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) };
    };
    const scenarios = [
      { name: "Native terminal default" },
      { name: "Dark inherited black", background: "#111111", foreground: "#000000" },
      { name: "Light inherited white", background: "#fafafa", foreground: "#ffffff" },
      { name: "Dark valid theme", background: "#111111", foreground: "#d9e6ff", preserved: "rgb(217, 230, 255)" },
      { name: "Light valid theme", background: "#fafafa", foreground: "#223344", preserved: "rgb(34, 51, 68)" },
      { name: "Middle gray", background: "#777777", foreground: "#000000" },
      { name: "Alpha candidate", background: "#111111", foreground: "rgba(255,255,255,.1)" },
      { name: "Borderline theme", background: "#111111", foreground: "#7c7c7c" },
    ];
    return scenarios.map((scenario) => {
      if (scenario.background) anchor.style.backgroundColor = scenario.background;
      if (scenario.foreground) anchor.style.color = scenario.foreground;
      const section = document.createElement("section"), title = document.createElement("h2"), host = document.createElement("div");
      title.textContent = scenario.name;
      section.append(title, host);
      document.getElementById("cases").append(section);
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${paletteProbe.STYLE}</style><div class="panel"><div class="bar"><span class="source-label">终端输出</span><select aria-label="接收对话"><option>First chat</option><option>Second chat</option></select><button>Add</button><button disabled>Disabled</button></div><div class="bar"><span class="selection-status">没有接收对话</span><span class="status">Status</span><button class="primary">Ask</button><button class="primary" disabled>Ask</button></div></div>`;
      paletteProbe.applyPalette(host, anchor);
      return { name: scenario.name, preserved: scenario.preserved, anchor: read(anchor), elements: Object.fromEntries([".panel", ".source-label", ".selection-status", ".status", "select", "option", "button", "button:disabled", ".primary", ".primary:disabled"].map((selector) => [selector, read(shadow.querySelector(selector))])) };
    });
  });
  const artifacts = process.env.PASEO_PALETTE_ARTIFACTS;
  if (artifacts) {
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(`${artifacts}/computed.json`, JSON.stringify({ errors, results }, null, 2));
    await page.screenshot({ path: `${artifacts}/toolbar.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], "native TerminalPane fixture renders without errors");
  assert.equal(results[0].anchor.color, "rgb(0, 0, 0)", "native terminal supplies the inherited black trigger");
  assert.equal(results[0].anchor.background, "rgb(11, 11, 11)", "native terminal supplies the dark background");
  for (const scenario of results) {
    for (const [selector, element] of Object.entries(scenario.elements)) {
      assert.ok(element.contrast >= 4.5, `${scenario.name} ${selector} effective text contrast ${element.contrast.toFixed(2)} is below 4.5`);
      if (selector.includes(":disabled")) {
        assert.equal(element.disabled, true, "native disabled semantics remain");
        assert.equal(element.cursor, "default", "disabled cursor remains");
      }
    }
    if (scenario.preserved) assert.equal(scenario.elements[".panel"].color, scenario.preserved, "readable theme foreground is preserved");
    const scheme = scenario.name.startsWith("Light") ? "light" : scenario.name === "Middle gray" ? "light" : "dark";
    assert.equal(scenario.elements.select.colorScheme, scheme, `${scenario.name} select uses the matching native color scheme`);
  }
  console.log(`PASS ${results.length} native-terminal palette scenarios, ${results.length * 10} effective contrast checks`);
} finally {
  await browser.close();
}
