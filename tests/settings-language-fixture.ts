import assert from "node:assert/strict";
import { setup } from "./dom";

export const i18nSource = '__d(function(g,r,i,a,m,e,d){e.getI18n=1;e.useTranslation=1;e.I18nextProvider=1;},42,[]);';

export function hostLanguage(initial: unknown = "zh-CN") {
  const { dom } = setup();
  const fetchBefore = globalThis.fetch;
  const requireBefore = Object.getOwnPropertyDescriptor(globalThis, "__r");
  const handlers = new Set<() => void>();
  let reads = 0, fetches = 0, current: unknown;
  let duringSubscribe: unknown;
  const instance = {
    language: initial,
    on(event: string, listener: () => void) { assert.equal(event, "languageChanged"); handlers.add(listener); if (duringSubscribe !== undefined) this.language = duringSubscribe; },
    off(event: string, listener: () => void) { assert.equal(event, "languageChanged"); handlers.delete(listener); },
  };
  current = instance;
  document.head.innerHTML = '<script src="https://other.test/untrusted.js"></script><script src="/app.js"></script>';
  Object.defineProperty(globalThis, "__r", { configurable: true, value: (id: number) => { assert.equal(id, 42); return { getI18n() { reads++; return current; } }; } });
  globalThis.fetch = async (url) => { assert.equal(url, "https://app.paseo.test/app.js"); fetches++; return new Response(i18nSource); };
  return {
    instance, handlers,
    setInstance(value: unknown) { current = value; },
    setDuringSubscribe(value: unknown) { duringSubscribe = value; },
    change(value: unknown) { instance.language = value; for (const handler of handlers) handler(); },
    get reads() { return reads; }, get fetches() { return fetches; },
    cleanup() { globalThis.fetch = fetchBefore; if (requireBefore) Object.defineProperty(globalThis, "__r", requireBefore); else Reflect.deleteProperty(globalThis, "__r"); dom.window.close(); },
  };
}
