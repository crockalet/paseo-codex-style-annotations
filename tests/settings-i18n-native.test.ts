import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { compileFunction } from "node:vm";
import { test } from "node:test";
import { z } from "zod";
import { resolveModuleIds } from "../client/host-draft-bridge";
import { createSettingsLanguage } from "../client/settings-language";
import { hostLanguage } from "./settings-language-fixture";
import { settle } from "./dom";

const bundleDirectory = "/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web";
const factorySchema = z.custom<(global: unknown, require: (id: number) => unknown, imports: (id: number) => unknown, importsAll: (id: number) => unknown, module: { exports: unknown }, exports: object, dependencies: number[]) => void>((value) => typeof value === "function");
const record = z.record(z.string(), z.unknown());
const callable = z.custom<(...args: unknown[]) => unknown>((value) => typeof value === "function");

test("installed bundle signature reaches the isolated app singleton and observes its real language events", async () => {
  const names = readdirSync(bundleDirectory).filter((name) => /^index-.*\.js$/.test(name));
  assert.equal(names.length, 1);
  const source = readFileSync(`${bundleDirectory}/${names[0]}`, "utf8");
  const chunks = source.split(/(?=__d\(function\()/);
  const ids = resolveModuleIds(source, { reactI18n: ["getI18n", "useTranslation", "I18nextProvider"] });
  const singleton = resolveModuleIds(chunks.filter((chunk) => chunk.includes(".initReactI18next")).join(""), { singleton: ["i18n"] });
  const factories = new Map<number, { factory: z.infer<typeof factorySchema>; dependencies: number[] }>();
  for (const chunk of chunks) {
    if (!chunk.startsWith("__d(function(")) continue;
    const end = chunk.match(/\},\d+,\[[\d,]*\]\);/);
    if (!end || end.index === undefined) continue;
    compileFunction(chunk.slice(0, end.index + end[0].length), ["__d"])((factory: unknown, id: unknown, dependencies: unknown) => {
      factories.set(z.number().parse(id), { factory: factorySchema.parse(factory), dependencies: z.array(z.number()).parse(dependencies) });
    });
  }
  const cache = new Map<number, { exports: object }>();
  const load = (id: number): unknown => {
    const cached = cache.get(id); if (cached) return cached.exports;
    const definition = factories.get(id); assert.ok(definition, `Native module ${id} exists`);
    const module = { exports: {} }; cache.set(id, module);
    definition.factory(globalThis, load, (dependency) => {
      const value = record.parse(load(dependency)); return value.__esModule ? value.default : value;
    }, load, module, module.exports, definition.dependencies);
    return module.exports;
  };
  const aggregate = z.object({ getI18n: callable }).parse(load(ids.reactI18n));
  assert.equal(aggregate.getI18n(), undefined);
  const host = hostLanguage();
  globalThis.fetch = async () => new Response(source);
  Object.defineProperty(globalThis, "__r", { configurable: true, value: load });
  const language = createSettingsLanguage();
  const events: string[] = [];
  language.subscribe(() => { events.push(language.getSnapshot()); });
  try {
    await settle(); assert.equal(language.getSnapshot(), "en");
    const singletonModule = load(singleton.singleton);
    const instance = z.object({ i18n: z.object({ language: z.string(), changeLanguage: callable }) }).parse(singletonModule).i18n;
    const actual = aggregate.getI18n(); assert.ok(actual); assert.equal(actual, record.parse(singletonModule).i18n);
    await new Promise((resolve) => setTimeout(resolve, 280));
    await instance.changeLanguage.call(actual, "zh-CN"); assert.equal(language.getSnapshot(), "zh");
    await instance.changeLanguage.call(actual, "en"); assert.equal(language.getSnapshot(), "en");
    await instance.changeLanguage.call(actual, "zh-CN"); assert.deepEqual(events, ["zh", "en", "zh"]);
    language.dispose(); await instance.changeLanguage.call(actual, "fr"); assert.deepEqual(events, ["zh", "en", "zh"]);
    assert.ok(cache.size < 60, `Only isolated i18n graph loaded (${cache.size} modules)`);
  } finally { language.dispose(); host.cleanup(); }
});
