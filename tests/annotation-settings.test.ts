import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import { build } from "esbuild";
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import type { SettingsLanguage } from "../client/settings-language";
import { hostLanguage } from "./settings-language-fixture";
import type { SettingsState, PluginClientContext } from "@getpaseo/plugin/client";
import { annotationValuesSchema, preferences, type AnnotationValues } from "../shared/preferences";
import { createAnnotationPreferences } from "../client/annotation-preferences";
import { setup, settle } from "./dom";

const bundle = build({ entryPoints: [new URL("../client/annotation-settings.tsx", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react/jsx-runtime", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin"] });
async function settingsExports(useSettings: () => SettingsState<typeof annotationValuesSchema>) {
  const module = { exports: {} }, require = createRequire(import.meta.url), output = await bundle;
  compileFunction(output.outputFiles[0].text, ["require", "module", "exports"])((name: string) => {
    if (name === "@getpaseo/plugin/client") return { useSettings };
    if (name === "@getpaseo/plugin/client/ui") return {
      SettingsSection: ({ title, info, children }: { title: string; info: string; children: React.ReactNode }) => React.createElement("section", { "aria-label": title }, React.createElement("p", null, info), children),
      SettingsCard: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
      SettingsRow: ({ label, error }: { label: string; error?: string }) => React.createElement("p", null, label, error),
      SettingsSwitch: ({ label, value, disabled, onValueChange }: { label: string; value: boolean; disabled: boolean; onValueChange(value: boolean): void }) => React.createElement("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(event.target.checked) }),
      SettingsAction: ({ label, actionLabel, onPress, disabled }: { label: string; actionLabel: string; onPress(): void; disabled: boolean }) => React.createElement("button", { onClick: onPress, disabled, title: label }, actionLabel),
    };
    return require(name);
  }, module, module.exports);
  return z.object({ AnnotationSettings: z.custom<React.ComponentType<{ controller: ReturnType<typeof createAnnotationPreferences>; language?: SettingsLanguage }>>((value) => typeof value === "function") , installAnnotationSettings: z.custom<(client: Pick<PluginClientContext, "addSettingsScreen">, controller: ReturnType<typeof createAnnotationPreferences>, language?: SettingsLanguage) => () => void>((value) => typeof value === "function") }).parse(module.exports);
}

test("native Settings screen shows loading/error without default switches, keeps conflicts visible, and publishes only confirmed saves", async () => {
  const { dom } = setup();
  const controller = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse({ status: "ready", revision: "read", values: { file: false } }); } }); await controller.refresh();
  let stage: "loading" | "invalid" | "ready" = "loading", error: string | null = null, conflict = true, reloads = 0, values = annotationValuesSchema.parse({ file: false });
  const writes: Array<{ values: AnnotationValues; revision: string }> = [];
  const { AnnotationSettings: Component } = await settingsExports(() => {
    const [, rerender] = React.useState(0);
    const actions = { saving: false, saveError: error,
      async save(next: AnnotationValues, revision: string) { writes.push({ values: next, revision }); if (conflict) { error = "revision conflict"; rerender((x) => x + 1); return false; } values = next; error = null; rerender((x) => x + 1); return true; },
      async reset() { throw new Error("No implicit reset"); },
      async reload() { reloads++; stage = "ready"; error = null; rerender((x) => x + 1); },
    };
    if (stage === "loading") return { ...actions, status: "loading" };
    if (stage === "invalid") return { ...actions, status: "invalid", revision: "native-r1", error: "stored schema is newer" };
    return { ...actions, status: "ready", values, revision: "native-r1" };
  });
  const rootElement = document.createElement("div"); document.body.append(rootElement); const root = createRoot(rootElement);
  const render = async () => { root.render(React.createElement(Component, { controller })); await settle(); await settle(); };
  try {
    await render(); assert.equal(rootElement.querySelectorAll('input[type="checkbox"]').length, 0); assert.match(rootElement.textContent ?? "", /Loading annotation settings/);
    stage = "invalid"; await render(); assert.equal(rootElement.querySelectorAll('input[type="checkbox"]').length, 0); assert.match(rootElement.textContent ?? "", /stored schema is newer/); assert.equal(writes.length, 0);
    rootElement.querySelector("button")?.click(); await settle(); await settle(); assert.equal(reloads, 1);
    const switches = rootElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'); assert.equal(switches.length, 5); assert.equal(switches[1].checked, false);
    switches[1].click(); await settle(); await settle(); assert.match(rootElement.textContent ?? "", /revision conflict/); assert.equal(controller.enabled("file"), false); assert.equal(switches[1].checked, false); assert.equal(writes[0].revision, "native-r1");
    conflict = false; switches[1].click(); await settle(); await settle(); assert.equal(controller.enabled("file"), true); assert.deepEqual(Object.keys(writes[1].values).sort(), ["chat", "diff", "file", "markdown", "terminal"]);
  } finally { root.unmount(); controller.dispose(); dom.window.close(); }
  assert.equal(preferences.id, "annotation-kinds");
});

test("open settings update English and Chinese copy and title while preserving an in-flight save", async () => {
  const host = hostLanguage("en");
  const controller = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse({ status: "ready", revision: "read", values: { file: false } }); } });
  await controller.refresh();
  let stage: "loading" | "invalid" | "ready" = "loading", mounts = 0, reloads = 0;
  let completeSave: (saved: boolean) => void = () => {};
  const { installAnnotationSettings } = await settingsExports(() => {
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { mounts++; }, []);
    const actions = {
      saving, saveError: "opaque conflict detail",
      async save(values: AnnotationValues, revision: string) {
        assert.equal(revision, "kept-revision"); assert.equal(values.file, true);
        setSaving(true);
        const saved = await new Promise<boolean>((resolve) => { completeSave = resolve; });
        setSaving(false); return saved;
      },
      async reset() { throw new Error("No implicit reset"); },
      async reload() { reloads++; },
    };
    if (stage === "loading") return { ...actions, status: "loading" };
    if (stage === "invalid") return { ...actions, status: "invalid", revision: "kept-revision", error: "opaque schema detail" };
    return { ...actions, status: "ready", revision: "kept-revision", values: annotationValuesSchema.parse({ file: false }) };
  });
  type Screen = Parameters<PluginClientContext["addSettingsScreen"]>[0];
  let screen: Screen | undefined;
  const subscribers = new Set<() => void>(), registrations: Screen[] = [];
  let removals = 0;
  const remove = installAnnotationSettings({ addSettingsScreen(next) {
    assert.equal(screen, undefined); screen = next; registrations.push(next); for (const listener of subscribers) listener();
    return () => { screen = undefined; removals++; for (const listener of subscribers) listener(); };
  } }, controller);
  const Host = () => {
    const current = React.useSyncExternalStore((listener) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; }, () => screen);
    return current ? React.createElement("main", null, React.createElement("h1", null, current.title), React.createElement(current.Component, { theme: { colors: { surface0: "#fff", surface1: "#fff", surface2: "#fff", border: "#888", foreground: "#000", foregroundMuted: "#555", accent: "#00f", accentForeground: "#fff", statusSuccess: "green", statusWarning: "orange", statusDanger: "red" } }, host: { id: "fixture", label: "Fixture" }, layout: { compact: false, platform: "web" } })) : null;
  };
  const element = document.createElement("div"); document.body.append(element); const root = createRoot(element);
  const render = async () => { root.render(React.createElement(Host)); await settle(); await settle(); };
  const labels = () => Array.from(element.querySelectorAll("input")).map((input) => input.getAttribute("aria-label"));
  try {
    await render(); assert.match(element.textContent ?? "", /Annotation types.*Only affects new annotations.*Loading annotation settings/);
    assert.equal(element.querySelector("button")?.disabled, true);
    host.change("fr"); host.change("de"); await settle(); assert.equal(registrations.length, 1);
    host.change("zh-CN"); await settle(); await settle();
    assert.match(element.textContent ?? "", /注释类型.*只影响新注释.*正在读取注释设置/);
    assert.equal(element.querySelector("section")?.getAttribute("aria-label"), "添加注释");
    stage = "invalid"; await render(); assert.match(element.textContent ?? "", /注释设置不可用opaque schema detail.*设置尚未保存opaque conflict detail.*重试读取/);
    assert.equal(element.querySelector("button")?.title, "重新读取已保存的设置");
    host.change("en"); await settle(); await settle();
    assert.match(element.textContent ?? "", /Annotation settings unavailableopaque schema detail.*Settings not savedopaque conflict detail.*Retry loading/);
    assert.equal(element.querySelector("button")?.title, "Reload saved settings");
    element.querySelector("button")?.click(); await settle(); assert.equal(reloads, 1);
    stage = "ready"; await render();
    assert.deepEqual(labels(), ["Chat selections", "Files and read-only code", "Diff selections", "Markdown preview", "Terminal output"]);
    const input = element.querySelectorAll("input")[1]; input.click(); await settle();
    assert.equal(input.disabled, true); assert.equal(controller.enabled("file"), false);
    host.change("zh_TW"); await settle(); await settle();
    assert.deepEqual(labels(), ["聊天选区", "文件与只读代码", "Diff 选区", "Markdown 预览", "终端输出"]);
    assert.equal(element.querySelectorAll("input")[1], input); assert.equal(input.disabled, true); assert.equal(mounts, 1);
    assert.equal(element.querySelector("h1")?.textContent, "注释类型");
    completeSave(true); await settle(); await settle(); assert.equal(controller.enabled("file"), true); assert.equal(input.disabled, false);
    const count = registrations.length;
    host.change("en"); host.change("zh"); await settle(); assert.equal(registrations.length, count);
    host.change("en"); remove(); await settle(); assert.equal(registrations.length, count); assert.equal(screen, undefined);
    remove(); assert.equal(removals, registrations.length); assert.equal(host.handlers.size, 0);
    assert.ok(registrations.every((entry) => entry.id === "annotation-kinds" && entry.Component === registrations[0].Component));
  } finally { root.unmount(); remove(); controller.dispose(); host.cleanup(); }
});


test("server rendering uses stable English even when a client source has Chinese", async () => {
  const controller = createAnnotationPreferences({ async rpc() { throw new Error("No settings reads from render"); } });
  const { AnnotationSettings } = await settingsExports(() => ({ status: "loading", saving: false, saveError: null, async save() { return false; }, async reload() {}, async reset() { return false; } }));
  const language: SettingsLanguage = { getSnapshot: () => "zh", subscribe: () => () => {}, dispose() {} };
  try {
    const markup = renderToStaticMarkup(React.createElement(AnnotationSettings, { controller, language }));
    assert.match(markup, /Add annotations/); assert.match(markup, /Loading annotation settings/); assert.doesNotMatch(markup, /正在读取/);
  } finally { controller.dispose(); }
});


test("settings unsubscribes injected language without disposing its owner", async () => {
  const { dom } = setup();
  const controller = createAnnotationPreferences({ async rpc() { throw Error("No reads"); } });
  const { installAnnotationSettings } = await settingsExports(() => ({ status: "loading", saving: false, saveError: null, async save() { return false; }, async reload() {}, async reset() { return false; } }));
  const listeners = new Set<() => void>(); let disposals = 0, removals = 0;
  const language: SettingsLanguage = { getSnapshot: () => "zh", subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }, dispose() { disposals++; } };
  const remove = installAnnotationSettings({ addSettingsScreen(screen) { assert.equal(screen.title, "注释类型"); return () => { removals++; }; } }, controller, language);
  try { assert.equal(listeners.size, 1); remove(); remove(); assert.equal(listeners.size, 0); assert.equal(disposals, 0); assert.equal(removals, 1); }
  finally { remove(); controller.dispose(); dom.window.close(); }
});
