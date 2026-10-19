import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { z } from "zod";
import { annotationLabels, annotationValuesSchema, preferences, type AnnotationKind, type AnnotationValues } from "../shared/preferences";

export type PreferenceState = { status: "loading" } | { status: "ready"; values: AnnotationValues } | { status: "error"; error: string };
export interface AnnotationPreferences {
  state(): PreferenceState;
  refresh(): Promise<void>;
  accept(values: AnnotationValues): void;
  enabled(kind: AnnotationKind): boolean;
  check(kind: AnnotationKind): Promise<{ allowed: true } | { allowed: false; reason: string }>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
const resultSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("ready"), values: annotationValuesSchema, revision: z.string() }), z.object({ status: z.literal("invalid"), error: z.string(), revision: z.string() })]);
export function createAnnotationPreferences(client: Pick<PluginClientContext, "rpc">): AnnotationPreferences {
  let state: PreferenceState = { status: "loading" }, pending: Promise<void> | null = null, generation = 0, disposed = false;
  const listeners = new Set<() => void>();
  const publish = (next: PreferenceState) => { if (!disposed) { state = next; for (const listener of listeners) listener(); } };
  const refresh = () => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    const revision = generation;
    pending = (async () => {
      try {
        const result = resultSchema.parse(await client.rpc(settingsRpc(preferences.id).read, {}));
        if (revision !== generation) return;
        publish(result.status === "ready" ? { status: "ready", values: result.values } : { status: "error", error: result.error });
      } catch (cause) { if (revision === generation) publish({ status: "error", error: cause instanceof Error ? cause.message : String(cause) }); }
    })().finally(() => { pending = null; });
    return pending;
  };
  const enabled = (kind: AnnotationKind) => !disposed && state.status === "ready" && state.values[kind];
  const controller: AnnotationPreferences = {
    state: () => state, refresh, enabled,
    accept(values) { generation++; publish({ status: "ready", values: annotationValuesSchema.parse(values) }); },
    async check(kind) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = generation; await refresh();
        if (before !== generation) continue;
        return enabled(kind) ? { allowed: true } : { allowed: false, reason: state.status === "error" ? `注释设置读取失败：${state.error}。请在插件设置中重试。` : state.status === "loading" ? "正在读取注释设置，请稍后重试。" : `${annotationLabels[kind]}注释已关闭，可在插件设置中开启。` };
      }
      return { allowed: false, reason: "注释设置正在变化，请重试。" };
    },
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; generation++; listeners.clear(); },
  };
  void refresh(); return controller;
}
