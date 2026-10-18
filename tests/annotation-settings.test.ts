import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import { build } from "esbuild";
import React from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import type { SettingsState } from "@getpaseo/plugin/client";
import { annotationValuesSchema, preferences, type AnnotationValues } from "../shared/preferences";
import { createAnnotationPreferences } from "../client/annotation-preferences";
import { setup, settle } from "./dom";

const bundle = build({ entryPoints: [new URL("../client/annotation-settings.tsx", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react/jsx-runtime", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin"] });
async function settingsComponent(useSettings: () => SettingsState<typeof annotationValuesSchema>) {
  const module = { exports: {} }, require = createRequire(import.meta.url), output = await bundle;
  compileFunction(output.outputFiles[0].text, ["require", "module", "exports"])((name: string) => {
    if (name === "@getpaseo/plugin/client") return { useSettings };
    if (name === "@getpaseo/plugin/client/ui") return {
      SettingsSection: ({ title, children }: { title: string; children: React.ReactNode }) => React.createElement("section", { "aria-label": title }, children),
      SettingsCard: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
      SettingsRow: ({ label, error }: { label: string; error?: string }) => React.createElement("p", null, label, error),
      SettingsSwitch: ({ label, value, disabled, onValueChange }: { label: string; value: boolean; disabled: boolean; onValueChange(value: boolean): void }) => React.createElement("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(event.target.checked) }),
      SettingsAction: ({ actionLabel, onPress, disabled }: { actionLabel: string; onPress(): void; disabled: boolean }) => React.createElement("button", { onClick: onPress, disabled }, actionLabel),
    };
    return require(name);
  }, module, module.exports);
  return z.object({ AnnotationSettings: z.custom<React.ComponentType<{ controller: ReturnType<typeof createAnnotationPreferences> }>>((value) => typeof value === "function") }).parse(module.exports).AnnotationSettings;
}

test("native Settings screen shows loading/error without default switches, keeps conflicts visible, and publishes only confirmed saves", async () => {
  const { dom } = setup();
  const controller = createAnnotationPreferences({ async rpc(contract) { return contract.output.parse({ status: "ready", revision: "read", values: { file: false } }); } }); await controller.refresh();
  let stage: "loading" | "invalid" | "ready" = "loading", error: string | null = null, conflict = true, reloads = 0, values = annotationValuesSchema.parse({ file: false });
  const writes: Array<{ values: AnnotationValues; revision: string }> = [];
  const Component = await settingsComponent(() => {
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
    await render(); assert.equal(rootElement.querySelectorAll('input[type="checkbox"]').length, 0); assert.match(rootElement.textContent ?? "", /正在读取/);
    stage = "invalid"; await render(); assert.equal(rootElement.querySelectorAll('input[type="checkbox"]').length, 0); assert.match(rootElement.textContent ?? "", /stored schema is newer/); assert.equal(writes.length, 0);
    rootElement.querySelector("button")?.click(); await settle(); await settle(); assert.equal(reloads, 1);
    const switches = rootElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'); assert.equal(switches.length, 5); assert.equal(switches[1].checked, false);
    switches[1].click(); await settle(); await settle(); assert.match(rootElement.textContent ?? "", /revision conflict/); assert.equal(controller.enabled("file"), false); assert.equal(switches[1].checked, false); assert.equal(writes[0].revision, "native-r1");
    conflict = false; switches[1].click(); await settle(); await settle(); assert.equal(controller.enabled("file"), true); assert.deepEqual(Object.keys(writes[1].values).sort(), ["chat", "diff", "file", "markdown", "terminal"]);
  } finally { root.unmount(); controller.dispose(); dom.window.close(); }
  assert.equal(preferences.id, "annotation-kinds");
});
