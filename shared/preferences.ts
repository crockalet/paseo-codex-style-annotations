import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const annotationValuesSchema = z.object({
  chat: z.boolean().default(true),
  file: z.boolean().default(true),
  diff: z.boolean().default(true),
  markdown: z.boolean().default(true),
  terminal: z.boolean().default(true),
}).strict();
export type AnnotationValues = z.infer<typeof annotationValuesSchema>;
export type AnnotationKind = keyof AnnotationValues;
export const annotationLabels: Record<AnnotationKind, string> = { chat: "聊天选区", file: "文件与只读代码", diff: "Diff 选区", markdown: "Markdown 预览", terminal: "终端输出" };
export const preferences = defineSettings({ id: "annotation-kinds", scope: "host", version: 1, schema: annotationValuesSchema });
