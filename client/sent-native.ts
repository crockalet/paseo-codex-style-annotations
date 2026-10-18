import { z } from "zod";
import { resolveModuleIds } from "./host-draft-bridge";

export const SENT_MODULES = {
  message: ["UserMessage", "AssistantMessage", "MessageOuterSpacingProvider", "STREAM_METADATA_FONT_SIZE"],
  attachment: ["AttachmentPill", "AttachmentFrame", "AttachmentLabel", "AttachmentThumbnail"],
};
const callable = z.custom<(...args: unknown[]) => unknown>((value) => typeof value === "function");
const memo = z.object({ $$typeof: z.custom<symbol>((value) => value === Symbol.for("react.memo")), type: callable });
const reference = z.custom<object>((value) => typeof value === "object" && value !== null);

export type SentNative = Readonly<{ user: object; frame: unknown; label: unknown }>;

export function inspectSentNative(message: unknown, attachment: unknown): SentNative {
  const messageModule = z.object({ UserMessage: reference, AssistantMessage: z.unknown(),
    MessageOuterSpacingProvider: callable, STREAM_METADATA_FONT_SIZE: z.number() }).parse(message);
  const user = memo.parse(messageModule.UserMessage);
  const pills = z.object({ AttachmentFrame: callable, AttachmentLabel: callable, AttachmentPill: callable, AttachmentThumbnail: callable }).parse(attachment);
  const signatures: [Function, string[]][] = [
    [user.type, ["serverId", "agentId", "messageId", "message", "images", "attachments", "isPending", "user-message", "user-message-trailing-row"]],
    [pills.AttachmentFrame, ["onPress", "accessibilityLabel", "testID", "children"]],
    [pills.AttachmentLabel, ["icon", "title", "subtitle"]],
  ];
  if (!signatures.every(([component, terms]) => terms.every((term) => Function.prototype.toString.call(component).includes(term)))) {
    throw new Error("Paseo 原生消息组件已变化，保留原生附件。");
  }
  return { user: messageModule.UserMessage, frame: pills.AttachmentFrame, label: pills.AttachmentLabel };
}

export async function discoverSentNative(signal: AbortSignal): Promise<SentNative> {
  const requireModule = callable.parse(Reflect.get(globalThis, "__r"));
  const base = new URL(window.location.href);
  for (const script of document.scripts) {
    if (!script.src) continue;
    const url = new URL(script.src, base);
    if (url.protocol !== base.protocol || url.host !== base.host) continue;
    const response = await fetch(url.href, { signal });
    if (!response.ok) continue;
    const source = await response.text();
    if (signal.aborted) throw new Error("引用插件已关闭。");
    if (!source.includes("MessageOuterSpacingProvider")) continue;
    const ids = resolveModuleIds(source, SENT_MODULES);
    return inspectSentNative(requireModule(ids.message), requireModule(ids.attachment));
  }
  throw new Error("未找到 Paseo 原生消息组件，保留原生附件。");
}
