import assert from "node:assert/strict";
import { test } from "node:test";
import { createSettingsLanguage } from "../client/settings-language";
import { settle } from "./dom";

import { hostLanguage, i18nSource } from "./settings-language-fixture";

test("language follows active host language, subscribes before reading, and only notifies normalized changes", async () => {
  const host = hostLanguage("en"); host.setDuringSubscribe("zh-TW");
  const language = createSettingsLanguage(); let notifications = 0;
  const unsubscribe = language.subscribe(() => { notifications++; });
  try {
    assert.equal(language.getSnapshot(), "en"); await settle();
    assert.equal(language.getSnapshot(), "zh"); assert.equal(notifications, 1);
    for (const value of ["zh", "ZH_hans", "zh-HK"]) { host.change(value); assert.equal(language.getSnapshot(), "zh"); }
    for (const value of ["fr", "de", "zhish", undefined, 42]) { host.change(value); assert.equal(language.getSnapshot(), "en"); }
    assert.equal(notifications, 2); assert.equal(host.fetches, 1);
    unsubscribe(); host.change("zh"); assert.equal(notifications, 2);
    language.dispose(); language.dispose(); assert.equal(host.handlers.size, 0);
    host.change("en"); assert.equal(language.getSnapshot(), "zh");
  } finally { language.dispose(); host.cleanup(); }
});

test("undefined singleton retries without refetching and cancels pending initialization on disposal", async () => {
  const host = hostLanguage(); host.setInstance(undefined);
  const language = createSettingsLanguage();
  try {
    await settle(); assert.equal(host.reads, 1);
    host.setInstance(host.instance); await new Promise((resolve) => setTimeout(resolve, 280));
    assert.equal(language.getSnapshot(), "zh"); assert.equal(host.fetches, 1); assert.equal(host.handlers.size, 1);
    language.dispose(); host.setInstance(undefined);
    const pending = createSettingsLanguage(); await settle(); const reads = host.reads;
    pending.dispose(); await new Promise((resolve) => setTimeout(resolve, 280));
    assert.equal(host.reads, reads); assert.equal(host.handlers.size, 0);
  } finally { language.dispose(); host.cleanup(); }
});

test("incompatible or failed discovery keeps English, and late fetch cannot attach after disposal", async () => {
  const host = hostLanguage();
  try {
    host.setInstance({ language: "zh", on: true, off() {} });
    const incompatible = createSettingsLanguage(); await settle();
    assert.equal(incompatible.getSnapshot(), "en"); assert.equal(host.handlers.size, 0); incompatible.dispose();
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("offline"); };
    const failed = createSettingsLanguage(); await settle(); await new Promise((resolve) => setTimeout(resolve, 280));
    assert.equal(failed.getSnapshot(), "en"); assert.equal(calls, 1); failed.dispose();
    host.setInstance(host.instance);
    let finish: (response: Response) => void = () => {};
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = (_url, options) => { signal = options?.signal; return new Promise((resolve) => { finish = resolve; }); };
    const pending = createSettingsLanguage(); pending.dispose(); assert.equal(signal?.aborted, true);
    finish(new Response(i18nSource)); await settle(); assert.equal(host.handlers.size, 0);
  } finally { host.cleanup(); }
});
