import type { SettingsLocale } from "./settings-language";

type ToolbarMessages = {
  selection: string;
  add: string;
  addTo: (name: string) => string;
  receiver: string;
  receiverFor: (name: string) => string;
  chooseReceiver: string;
  noReceiver: string;
  side: string;
  cancel: string;
  ask: string;
  question: string;
  questionPlaceholder: string;
  questionHint: string;
  settingsLoading: string;
  settingsError: (error: string) => string;
  disabled: string;
};

export const toolbarCopy: Record<SettingsLocale, ToolbarMessages> = {
  en: {
    selection: "Selected text",
    add: "Add to chat",
    addTo: (name) => `Add to ${name}`,
    receiver: "Change receiving chat",
    receiverFor: (name) => `Change receiving chat: ${name}`,
    chooseReceiver: "Choose receiving chat",
    noReceiver: "No receiving chat in this workspace",
    side: "Ask in side chat",
    cancel: "Cancel",
    ask: "Ask",
    question: "Side chat question",
    questionPlaceholder: "Ask about this in a side chat…",
    questionHint: "Enter · Ask     Shift+Enter · New line",
    settingsLoading: "Loading annotation settings…",
    settingsError: (error) => `Could not load annotation settings: ${error}`,
    disabled: "This annotation type is disabled. Enable it in plugin settings.",
  },
  zh: {
    selection: "选中文字",
    add: "添加到对话",
    addTo: (name) => `添加到 ${name} 对话`,
    receiver: "切换接收对话",
    receiverFor: (name) => `切换接收对话：${name}`,
    chooseReceiver: "选择接收对话",
    noReceiver: "没有同工作区的接收对话",
    side: "在侧边聊天中提问",
    cancel: "取消",
    ask: "提问",
    question: "侧边聊天问题",
    questionPlaceholder: "在侧边聊天中询问这段内容…",
    questionHint: "Enter · 提问     Shift+Enter · 换行",
    settingsLoading: "正在读取注释设置…",
    settingsError: (error) => `注释设置读取失败：${error}`,
    disabled: "此类注释已关闭，可在插件设置中开启",
  },
};
