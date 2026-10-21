import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnnotationPreferences } from "../client/annotation-preferences";
import { decodeExternal, encodeExternal, type ExternalSnapshot } from "../client/external-origin";
import { decodeAnnotation } from "../client/format";
import { makeQuote, quoteAttachmentSchema, readQuotes } from "../client/host-draft-bridge";
import { text } from "../client/messages";

const zh = { getSnapshot: () => "zh" as const };
const origin: ExternalSnapshot["origin"] = {
  kind: "file",
  workspace: { serverId: "server", workspaceId: "workspace", workspaceKey: "key", root: "/repo" },
  tabId: "tab",
  file: { requestedPath: "src/a.ts", absolutePath: "/repo/src/a.ts", relativePath: "src/a.ts" },
  from: 0, to: 5, lineStart: 1, lineEnd: 1,
  version: { algorithm: "sha256", digest: "a".repeat(64) },
};
const snapshot: ExternalSnapshot = { text: "const", title: "src/a.ts:1-1", origin };
const sourceUrl = "https://paseo.sh/h/server/workspace/one";

test("English is the default and zh gives the Chinese text", () => {
  assert.equal(text().count(2), "2 annotations");
  assert.equal(text(zh).count(2), "2 条注释");
  assert.equal(text({ getSnapshot: () => "en" }).saved, "Saved");
  assert.equal(text(zh).saved, "已保存");
});

test("new quotes are written in the current locale", () => {
  const english = makeQuote("> a", "", sourceUrl);
  assert.equal(english.sourceTitle, "Quote");
  assert.equal(english.item.title, "Quote snippet");
  const chinese = makeQuote("> a", "", sourceUrl, zh);
  assert.equal(chinese.sourceTitle, "引用");
  assert.equal(chinese.item.title, "引用片段");
  assert.equal(decodeAnnotation({ text: "> a\n\n", subtitle: "" }).kind, "invalid");
  assert.match(String(Reflect.get(decodeAnnotation({ text: "> a", subtitle: "x" }), "reason")), /cannot be edited safely/);
  assert.match(String(Reflect.get(decodeAnnotation({ text: "> a", subtitle: "x" }, zh), "reason")), /无法安全编辑/);
});

test("drafts saved with the old Chinese source title still read and rewrite", () => {
  const legacy = { ...makeQuote("> a", "t", sourceUrl, zh), sourceTitle: "引用" };
  const current = makeQuote("> b", "t", sourceUrl);
  assert.deepEqual(readQuotes({ text: "", attachments: [legacy, current] }).map((quote) => quote.item.id), [legacy.item.id, current.item.id]);
  assert.equal(quoteAttachmentSchema.safeParse({ ...current, sourceTitle: "Other" }).success, false);
});

test("quote source prefix is written per locale and both prefixes parse back", () => {
  for (const [language, prefix] of [[undefined, "Quote source: "], [zh, "引用来源："]] as const) {
    const encoded = encodeExternal(snapshot, sourceUrl, language);
    assert.ok(encoded.text.startsWith(`${prefix}src/a.ts:1-1\n\n`));
    const decoded = decodeExternal({ url: encoded.url, text: encoded.text });
    assert.equal(decoded.kind, "external");
    if (decoded.kind === "external") {
      assert.equal(decoded.snapshot.title, "src/a.ts:1-1");
      assert.equal(decoded.snapshot.text, "const");
    }
  }
});

test("annotation settings messages follow the locale", async () => {
  const values = { chat: false, file: true, diff: true, markdown: true, terminal: true };
  const preferences = createAnnotationPreferences({ rpc: async () => ({ status: "ready", values, revision: "1" }) } as never);
  assert.deepEqual(await preferences.check("chat"), { allowed: false, reason: "Annotations are off for Chat selections. Turn them on in plugin settings." });
  assert.deepEqual(await preferences.check("chat", zh), { allowed: false, reason: "聊天选区注释已关闭，可在插件设置中开启。" });
  preferences.dispose();
});
