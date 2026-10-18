import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { annotationLabels, annotationValuesSchema, preferences, type AnnotationKind } from "../shared/preferences";
import type { AnnotationPreferences } from "./annotation-preferences";

export function AnnotationSettings({ controller }: { controller: AnnotationPreferences }) {
  const settings = useSettings(preferences);
  const toggle = async (kind: AnnotationKind, value: boolean) => {
    if (settings.status !== "ready" || settings.saving) return;
    const next = { ...settings.values, [kind]: value };
    if (await settings.save(next, settings.revision)) controller.accept(next);
  };
  return <SettingsSection title="添加注释" info="只影响新注释。已保存的注释仍可查看、编辑和移除。聊天侧边提问继续可用。">
    <SettingsCard>
      {settings.status === "ready" ? annotationValuesSchema.keyof().options.map((key) => {
        return <SettingsSwitch key={key} label={annotationLabels[key]} value={settings.values[key]} disabled={settings.saving} onValueChange={(value) => { void toggle(key, value); }} />;
      }) : <SettingsRow label={settings.status === "loading" ? "正在读取注释设置…" : "注释设置不可用"} error={settings.status === "loading" ? undefined : settings.error} />}
      {settings.saveError ? <SettingsRow label="设置尚未保存" error={settings.saveError} /> : null}
      <SettingsAction label="重新读取已保存的设置" actionLabel="重试读取" disabled={settings.saving || settings.status === "loading"} onPress={() => { void settings.reload().then(() => controller.refresh()); }} />
    </SettingsCard>
  </SettingsSection>;
}
