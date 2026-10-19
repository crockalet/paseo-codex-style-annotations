import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = require("esbuild");
const repo = fileURLToPath(new URL("..", import.meta.url));
const { chromium } = await import(pathToFileURL(process.env.PASEO_PLAYWRIGHT ?? require.resolve("playwright")).href);
const bundle = await build({ stdin: { contents: `export {installQuoteComposer} from './client/quote-composer'; export {makeQuote} from './client/host-draft-bridge'; export {encodeExternal} from './client/external-origin';`, resolveDir: repo }, bundle: true, write: false, format: "iife", globalName: "Summary" });
const browser = await chromium.launch({ executablePath: process.env.PASEO_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const results = [];
try {
  for (const theme of ["light", "dark"]) for (const width of [700, 280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const dark = theme === "dark";
    await page.route("http://localhost/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><style>body{margin:20px;background:${dark ? "#141414" : "#fff"};font-family:system-ui}#pane{width:min(600px,100%);height:840px}#card{display:flex;flex-direction:column;border:1px solid ${dark ? "#444" : "#ddd"};border-radius:12px;background:${dark ? "rgb(30,30,30)" : "rgb(250,250,250)"};width:100%;max-width:450px;margin-top:600px}textarea{font:12px system-ui;color:${dark ? "rgb(230,230,230)" : "rgb(45,45,45)"};background:transparent;height:60px}</style></head><body><div id="pane" data-testid="workspace-pane-one"><div data-testid="workspace-tab-agent_agent-one" aria-selected="true">Synthetic chat</div><div data-testid="agent-chat-scroll"><p>Synthetic source</p></div><div data-testid="message-input-root"><div><div id="card"><textarea data-composer-input></textarea></div></div></div></div></body></html>` }));
    await page.goto("http://localhost/h/fixture-host/workspace/workspace-one");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
      const terminalId = "7c368a6a-426f-49b4-91a1-28bdece757ab";
      const workspace = { serverId: "fixture-host", workspaceId: "workspace-one", workspaceKey: "fixture-host:workspace-one", root: "/synthetic" };
      const version = { algorithm: "sha256", digest: "0".repeat(64) };
      const terminal = { kind: "terminal", workspace, tabId: "terminal-one", terminalId, cwd: "/synthetic", streamKey: "fixture-stream", buffer: "normal", start: { x: 0, y: 4 }, end: { x: 30, y: 4 }, cols: 80, rows: 24, version };
      const path = "src/" + "long-directory/".repeat(8) + "selected-file.ts";
      const snapshots = [
        { text: "First terminal selection", title: `终端 ${terminalId} · 缓冲区 5-5`, origin: terminal },
        { text: "First buffer line\nLast buffer line", title: `终端 ${terminalId} · 缓冲区 5-8`, origin: { ...terminal, end: { x: 30, y: 7 } } },
        { text: "Selected file content", title: path, origin: { kind: "file", workspace, tabId: "file-one", file: { requestedPath: path, absolutePath: `/synthetic/${path}`, relativePath: path }, from: 0, to: 21, lineStart: 1, lineEnd: 1, version } },
      ];
      window.draft = { text: "Unsent draft", attachments: snapshots.map((snapshot) => {
        const quote = Summary.makeQuote("", snapshot.title, location.href);
        Object.assign(quote.item, { title: snapshot.title, ...Summary.encodeExternal(snapshot, location.href) });
        return quote;
      }).concat(Summary.makeQuote("> Ordinary chat quote", "Ordinary chat", location.href)) };
      window.initial = JSON.stringify(window.draft);
      window.writes = 0;
      const host = { key: (h, a) => `${h}:${a}`, hasAgent: () => true, hydrate: async () => {}, read: () => window.draft, save: () => { window.writes++; throw Error("Preview must not write drafts"); }, flush: async () => {}, subscribe: () => () => {}, validateAttachment: () => {} };
      window.plugin = Summary.installQuoteComposer({ discover: async () => host });
    });
    await page.waitForFunction(() => document.querySelector("[data-paseo-quote-chip]")?.shadowRoot?.querySelector("button"));
    await page.locator("[data-paseo-quote-chip]").getByRole("button").click();
    await page.waitForFunction(() => document.querySelector("[data-paseo-quote-preview]")?.shadowRoot?.querySelector(".entry-head"));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (process.env.PASEO_SUMMARY_SCREENSHOTS) {
      fs.mkdirSync(process.env.PASEO_SUMMARY_SCREENSHOTS, { recursive: true });
      await page.locator("[data-paseo-quote-preview]").screenshot({ path: `${process.env.PASEO_SUMMARY_SCREENSHOTS}/summary-${theme}-${width}.png` });
    }
    const result = await page.evaluate(() => {
      const popup = document.querySelector("[data-paseo-quote-preview]");
      const bounds = (element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const inspect = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { text: element.textContent, title: element.title, box: bounds(element), clipped: element.scrollWidth > element.clientWidth, lines: new Set([...range.getClientRects()].map((r) => Math.round(r.y))).size };
      };
      return { popup: bounds(popup), scale: visualViewport.scale, zoom: getComputedStyle(popup).zoom, rows: [...popup.shadowRoot.querySelectorAll(".entry")].map((row) => ({ label: inspect(row.querySelector(".entry-head span")), edit: inspect(row.querySelector(".edit")), remove: inspect(row.querySelector(".remove")), quote: row.querySelector("pre").textContent })), titles: window.draft.attachments.map((a) => a.item.title), unchanged: JSON.stringify(window.draft) === window.initial, writes: window.writes };
    });
    results.push({ theme, width, ...result });
    console.log(JSON.stringify(results.at(-1)));
    if (width === 700) assert.equal(result.popup.width, 294);
    assert(result.popup.width <= width - 16);
    assert(result.popup.x >= 0 && result.popup.x + result.popup.width <= width);
    assert.equal(result.scale, 1);
    assert.equal(result.zoom, "1");
    assert.equal(result.rows.length, 4);
    assert(result.unchanged);
    assert.equal(result.writes, 0);
    for (const [index, row] of result.rows.entries()) {
      assert.equal(row.edit.lines, 1, `${theme}/${width} row ${index + 1} edit must fit one text line`);
      assert.equal(row.remove.lines, 1, `${theme}/${width} row ${index + 1} remove must fit one text line`);
      assert.equal(row.label.lines, 1);
      assert(row.label.box.width > 0);
      assert(row.label.box.x + row.label.box.width <= row.edit.box.x);
      assert(row.edit.box.x + row.edit.box.width <= row.remove.box.x);
      assert(row.remove.box.x + row.remove.box.width <= result.popup.x + result.popup.width);
      assert(row.label.box.x >= result.popup.x);
      assert.equal(row.label.title, `${index + 1}. ${result.titles[index]}`);
    }
    assert.deepEqual(result.rows.map((r) => r.label.text), ["1. 终端 · 缓冲区 5", "2. 终端 · 缓冲区 5-8", `3. ${result.titles[2]}`, "4."]);
    assert(result.rows[2].label.clipped, "Long file metadata stays bounded without shortening stored title");
    assert.deepEqual(result.rows.map((r) => r.quote), ["First terminal selection", "First buffer line\nLast buffer line", "Selected file content", "> Ordinary chat quote"]);
    await page.locator("[data-paseo-quote-preview]").getByRole("button", { name: "编辑引用 1", exact: true }).click();
    await page.locator("[data-paseo-quote-editor] textarea").fill("Cancelled comment");
    await page.locator("[data-paseo-quote-editor]").getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.locator("[data-paseo-quote-editor]").count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ unchanged: JSON.stringify(window.draft) === window.initial, writes: window.writes })), { unchanged: true, writes: 0 });
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.plugin.dispose());
    await page.close();
  }
  console.log("Summary browser proof passed for light/dark and standard/narrow viewports.");
} finally {
  await browser.close();
}
