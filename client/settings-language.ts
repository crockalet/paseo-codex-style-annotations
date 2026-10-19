import { z } from "zod";
import { resolveModuleIds } from "./host-draft-bridge";

export type SettingsLocale = "en" | "zh";
export type SettingsLanguage = {
  getSnapshot(): SettingsLocale;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

const callable = z.custom<(...args: unknown[]) => unknown>((value) => typeof value === "function");
const moduleSchema = z.object({ getI18n: callable });
const instanceSchema = z.object({ on: callable, off: callable });
const signatures = { reactI18n: ["getI18n", "useTranslation", "I18nextProvider"] };
export const englishSettingsLocale = (): SettingsLocale => "en";

async function discoverI18n(signal: AbortSignal): Promise<() => unknown> {
  const runtime = z.object({ __r: callable }).parse(globalThis);
  const base = new URL(window.location.href);
  for (const script of Array.from(document.scripts)) {
    if (!script.src) continue;
    const url = new URL(script.src, base);
    if (url.origin !== base.origin) continue;
    const response = await fetch(url.href, { signal });
    if (!response.ok) continue;
    const source = await response.text();
    if (signal.aborted) throw new Error("Settings language discovery disposed");
    if (!source.includes("getI18n")) continue;
    const ids = resolveModuleIds(source, signatures);
    const module = runtime.__r(ids.reactI18n);
    const { getI18n } = moduleSchema.parse(module);
    return () => getI18n.call(module);
  }
  throw new Error("Host settings language unavailable");
}

export function createSettingsLanguage(): SettingsLanguage {
  const abort = new AbortController();
  const listeners = new Set<() => void>();
  let locale: SettingsLocale = "en";
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detach: (() => void) | undefined;
  let attempts = 0;
  const attach = (getI18n: () => unknown) => {
    if (disposed) return;
    const instance = getI18n();
    if (instance === undefined) {
      const delay = attempts === 0 ? 250 : attempts === 1 ? 1_000 : 5_000;
      attempts++;
      timer = setTimeout(() => { try { attach(getI18n); } catch {} }, delay);
      return;
    }
    const { on, off } = instanceSchema.parse(instance);
    const update = () => {
      if (disposed) return;
      const language = Reflect.get(Object(instance), "language");
      const next = typeof language === "string" && /^zh(?:[-_]|$)/i.test(language) ? "zh" : "en";
      if (next === locale) return;
      locale = next;
      for (const listener of listeners) listener();
    };
    detach = () => { off.call(instance, "languageChanged", update); };
    on.call(instance, "languageChanged", update);
    update();
  };
  void discoverI18n(abort.signal).then((getI18n) => { attach(getI18n); }).catch(() => {});
  return {
    getSnapshot: () => locale,
    subscribe(listener) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      clearTimeout(timer);
      detach?.();
      listeners.clear();
    },
  };
}
