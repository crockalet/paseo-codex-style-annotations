import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { startSideChat } from "./actions";
import { formatQuote, type QuoteSource } from "./format";
import { installSentQuotes } from "./sent-quotes";
import { installQuoteComposer } from "./quote-composer";
import type { ExternalOffer, ExternalSelection } from "./host-source-bridge";
import type { AnnotationPreferences } from "./annotation-preferences";
import type { AnnotationKind } from "../shared/preferences";
import type { StoreBinding } from "./host-draft-bridge";

/*
 * Web and desktop only. iOS and Android route selection through the platform
 * menu, which a plugin cannot extend.
 *
 * Plugins have no composer API and no portal, so this module drives the host
 * DOM directly. Every host selector it relies on is listed below; when a Paseo
 * release renames one, this list is the place to fix.
 *
 * The bar lives in a shadow root on `document.body`: the chat clips and
 * translates its content, and the host's global CSS would otherwise restyle the
 * bar. The comment field is the one exception. It is a light-DOM textarea slotted
 * into the shadow tree, because the host's keyboard shortcuts classify the
 * event target: a textarea reads as "editable", while anything inside a shadow
 * root reads as the shadow host, where Escape interrupts the agent and Space
 * toggles voice.
 */

// ---------------------------------------------------------------------------
// Host DOM contract (Paseo 0.10)

/** One chat transcript. Inactive tabs keep theirs mounted with `display: none`. */
const CHAT_SCROLL = '[data-testid="agent-chat-scroll"]';
/** The composer textarea. Every retained chat has one, visible or not. */
const COMPOSER = "textarea[data-composer-input]";
/** A split-view pane; its tab row names the agent whose chat it shows. */
const PANE = '[data-testid^="workspace-pane-"]';
const ACTIVE_AGENT_TAB = '[data-testid^="workspace-tab-agent_"][aria-selected="true"]';
const AGENT_TAB_PREFIX = "workspace-tab-agent_";
/** Markdown serialization hints the host puts on rendered assistant messages. */
const CODE_BLOCK = '[data-paseo-markdown-tag="pre"]';
const CODE_SPAN = '[data-paseo-markdown-tag="code"]';
const CODE_LANGUAGE_ATTRIBUTE = "data-paseo-markdown-language";
/** Monospace surfaces such as tool output. */
const CODE_SURFACE = "[data-pmono]";

// ---------------------------------------------------------------------------
// The DOM this module uses. The plugin typechecks without the DOM library.

interface DomRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface DomEvent {
  readonly type: string;
  readonly target: DomNode | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface DomKeyboardEvent extends DomEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
}

type DomListener = (event: DomEvent) => void;

interface DomEventTarget {
  addEventListener(type: string, listener: DomListener, capture?: boolean): void;
  removeEventListener(type: string, listener: DomListener, capture?: boolean): void;
  dispatchEvent(event: DomEvent): boolean;
}

interface DomNode extends DomEventTarget {
  readonly nodeType: number;
  readonly parentElement: DomElement | null;
  readonly isConnected: boolean;
}

interface DomStyle {
  setProperty(name: string, value: string, priority?: string): void;
  readonly color: string;
  readonly backgroundColor: string;
  readonly fontFamily: string;
}

interface DomElement extends DomNode {
  readonly style: DomStyle;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  textContent: string | null;
  innerHTML: string;
  hidden: boolean;
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild<Child extends DomNode>(child: Child): Child;
  contains(node: DomNode | null): boolean;
  remove(): void;
  getClientRects(): ArrayLike<DomRect>;
  attachShadow(init: { mode: "open" }): DomShadowRoot;
  focus(options?: { preventScroll?: boolean }): void;
}

interface DomSelect extends DomElement { value: string; disabled: boolean; }
interface DomButton extends DomElement {
  disabled: boolean;
}

interface DomShadowRoot {
  innerHTML: string;
  querySelector(selector: string): DomElement | null;
}

interface DomTextArea extends DomElement {
  value: string;
  placeholder: string;
  rows: number;
  readOnly: boolean;
  disabled: boolean;
  scrollTop: number;
  readonly scrollHeight: number;
  setSelectionRange(start: number, end: number): void;
}

interface DomRange {
  cloneRange(): DomRange;
  readonly startContainer: DomNode;
  readonly endContainer: DomNode;
  readonly commonAncestorContainer: DomNode;
  getClientRects(): ArrayLike<DomRect>;
  getBoundingClientRect(): DomRect;
}

interface DomSelection {
  readonly isCollapsed: boolean;
  readonly rangeCount: number;
  getRangeAt(index: number): DomRange;
  toString(): string;
}

interface DomDataTransfer {
  getData(format: string): string;
}

declare const window: DomEventTarget & {
  readonly innerWidth: number;
  readonly innerHeight: number;
  getSelection(): DomSelection | null;
  getComputedStyle(element: DomElement): DomStyle;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
};
declare const document: DomEventTarget & {
  readonly body: DomElement;
  readonly activeElement: DomElement | null;
  createElement(tag: "div" | "option"): DomElement;
  createElement(tag: "textarea"): DomTextArea;
  execCommand(command: "insertText", showUi: boolean, value: string): boolean;
};
declare const Event: new (type: string, init?: { bubbles?: boolean }) => DomEvent;
declare const DataTransfer: new () => DomDataTransfer;
declare const ClipboardEvent: new (
  type: string,
  init: { bubbles: boolean; cancelable: boolean; clipboardData: DomDataTransfer },
) => DomEvent;

const ELEMENT_NODE = 1;

// ---------------------------------------------------------------------------
// Reading a selection

interface Snapshot {
  range: DomRange;
  source: QuoteSource;
  /** Rendered text, for the preview. */
  preview: string;
  first: DomRect;
  last: DomRect;
  /** Where the selection's text is taken from; supplies the popup colors. */
  anchor: DomElement;
  composer: DomTextArea | null;
  agentId: string | null;
}

function elementOf(node: DomNode | null): DomElement | null {
  if (!node) return null;
  return node.nodeType === ELEMENT_NODE ? (node as DomElement) : node.parentElement;
}

/**
 * The live selection, or null unless it is non-empty and both of its ends sit
 * in the same chat transcript.
 */
function readSnapshot(ignore: DomElement): Snapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const preview = selection.toString().trim();
  if (!preview) return null;

  const range = selection.getRangeAt(0);
  const start = elementOf(range.startContainer);
  const end = elementOf(range.endContainer);
  if (!start || !end || ignore.contains(start)) return null;
  const transcript = start.closest(CHAT_SCROLL);
  if (!transcript || end.closest(CHAT_SCROLL) !== transcript) return null;

  const rects = range.getClientRects();
  const bounds = range.getBoundingClientRect();
  const first = rects.length > 0 ? rects[0]! : bounds;
  const last = rects.length > 0 ? rects[rects.length - 1]! : bounds;
  if (first.width === 0 && first.height === 0) return null;

  return {
    range: range.cloneRange(),
    source: readSource(selection, range, start),
    preview,
    first,
    last,
    anchor: start,
    composer: usableComposer(nearestUnique(transcript, COMPOSER) as DomTextArea | null),
    agentId: agentIdOf(nearestUnique(transcript, ACTIVE_AGENT_TAB)),
  };
}

/**
 * The first visible match walking up from `from`, stopping at its pane. Two
 * visible matches at the same level mean two chats share it: no answer beats a
 * wrong one.
 */
function nearestUnique(from: DomElement, selector: string): DomElement | null {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const visible = Array.from(node.querySelectorAll(selector)).filter(isVisible);
    if (visible.length === 1) return visible[0]!;
    if (visible.length > 1 || node.matches(PANE)) return null;
  }
  return null;
}

function isVisible(element: DomElement): boolean {
  return element.getClientRects().length > 0;
}

function usableComposer(input: DomTextArea | null): DomTextArea | null {
  return input && !input.readOnly && !input.disabled ? input : null;
}

function agentIdOf(tab: DomElement | null): string | null {
  const testId = tab?.getAttribute("data-testid");
  return testId?.startsWith(AGENT_TAB_PREFIX) ? testId.slice(AGENT_TAB_PREFIX.length) || null : null;
}

function readSource(selection: DomSelection, range: DomRange, start: DomElement): QuoteSource {
  const common = elementOf(range.commonAncestorContainer);
  const block = common?.closest(CODE_BLOCK) ?? null;
  const inCode = Boolean(block || common?.closest(CODE_SPAN) || common?.closest(CODE_SURFACE));
  const code = inCode ? { language: block?.getAttribute(CODE_LANGUAGE_ATTRIBUTE) ?? null } : null;
  return { text: hostMarkdown(start) ?? selection.toString(), code };
}

/**
 * The selection as Markdown, from the host's own copy handler.
 *
 * Assistant messages carry a copy handler that turns the selection back into
 * Markdown: lists, tables, emphasis, and fences survive. A synthetic copy event
 * with a private DataTransfer runs that handler without touching the system
 * clipboard. Selections the handler does not own come back null.
 */
function hostMarkdown(target: DomElement): string | null {
  if (typeof ClipboardEvent === "undefined" || typeof DataTransfer === "undefined") return null;
  try {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData });
    target.dispatchEvent(event);
    if (!event.defaultPrevented) return null;
    const text = clipboardData.getData("text/plain");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Colors, read from the chat itself so the bar follows every theme

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

function css([r, g, b]: Rgba, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function mix(a: Rgba, b: Rgba, amount: number): Rgba {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function applyPalette(host: DomElement, anchor: DomElement): void {
  const style = window.getComputedStyle(anchor);
  const candidate: Rgba = parseColor(style.color) ?? [220, 220, 220, 1];
  let background: Rgba | null = null;
  for (let node: DomElement | null = anchor; node && !background; node = node.parentElement) {
    const color = parseColor(window.getComputedStyle(node).backgroundColor);
    if (color && color[3] > 0.95) background = color;
  }
  background ??= luminance(candidate) > 0.5 ? [24, 24, 27, 1] : [250, 250, 250, 1];
  const relativeLuminance = ([r, g, b]: Rgba): number => {
    const linear = (channel: number): number => {
      const value = Math.round(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const contrast = (a: Rgba, b: Rgba): number => {
    const first = relativeLuminance(a), second = relativeLuminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  const black: Rgba = [0, 0, 0, 1], white: Rgba = [255, 255, 255, 1];
  const neutral = (surface: Rgba): Rgba => contrast(black, surface) >= contrast(white, surface) ? black : white;
  let foreground = candidate[3] > 0.95 && contrast(candidate, background) >= 4.5 ? candidate : neutral(background);
  const dark = luminance(background) < 0.5;
  let surface = mix(background, foreground, dark ? 0.07 : 0.025);
  if (contrast(foreground, surface) < 4.5) {
    foreground = neutral(background);
    surface = mix(background, foreground, dark ? 0.07 : 0.025);
    if (contrast(foreground, surface) < 4.5) surface = background;
  }
  const mutedCandidate = mix(surface, foreground, 0.68);
  const muted = contrast(mutedCandidate, surface) >= 4.5 ? mutedCandidate : foreground;

  const tokens: Array<[string, string]> = [
    ["--pq-fg", css(foreground)],
    ["--pq-muted", css(muted)],
    ["--pq-disabled", css(muted)],
    ["--pq-scheme", neutral(surface) === white ? "dark" : "light"],
    ["--pq-faint", css(foreground, 0.42)],
    ["--pq-border", css(foreground, dark ? 0.16 : 0.14)],
    ["--pq-hover", css(foreground, 0.09)],
    ["--pq-bg", css(surface)],
    ["--pq-field", css(background)],
    ["--pq-primary-fg", css(background)],
    ["--pq-danger", dark ? "#f87171" : "#dc2626"],
    ["--pq-shadow", dark ? "0 12px 32px rgba(0, 0, 0, 0.5)" : "0 12px 32px rgba(0, 0, 0, 0.16)"],
    ["--pq-font", style.fontFamily || "system-ui, sans-serif"],
  ];
  for (const [name, value] of tokens) host.style.setProperty(name, value);
}

const STYLE = `
:host{all:initial}*{box-sizing:border-box}
.panel{font-family:var(--pq-font);font-size:13px;line-height:18px;color:var(--pq-fg);background:var(--pq-bg);color-scheme:var(--pq-scheme);border:1px solid var(--pq-border);border-radius:10px;box-shadow:var(--pq-shadow);user-select:none;-webkit-user-select:none}
.bar{display:flex;align-items:center;gap:2px;padding:3px}
button{appearance:none;display:inline-flex;align-items:center;gap:6px;margin:0;padding:5px 9px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}
button:hover:not(:disabled){background:var(--pq-hover)}button:disabled{opacity:1;color:var(--pq-disabled);background:transparent;cursor:default}button[hidden]{display:none}
.editor{display:none;width:min(300px,calc(100vw - 16px));padding:4px}
.panel[data-mode="side"] .bar{display:none}
.panel[data-mode="side"] .editor{display:block}
.panel[data-mode="side"] .editor{width:min(400px,calc(100vw - 16px));padding:10px}
.quote{display:none;max-height:54px;overflow:hidden;padding-left:9px;border-left:2px solid var(--pq-border);color:var(--pq-muted);white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px}
.panel[data-mode="side"] .quote{display:block}
.footer{display:flex;align-items:center;justify-content:flex-end;gap:2px}.status{flex:1 1 auto;font-size:11px;color:var(--pq-muted);overflow-wrap:anywhere;padding:0 5px}.status:empty{display:none}
.primary{background:var(--pq-fg);color:var(--pq-primary-fg)}
.source-label,.selection-status{max-width:240px;overflow:hidden;text-overflow:ellipsis;font-size:11px;padding:0 5px;color:var(--pq-muted)}select{font:inherit;color:var(--pq-fg);background:var(--pq-bg);border:1px solid var(--pq-border);border-radius:6px;max-width:180px;padding:3px}option{color:var(--pq-fg);background:var(--pq-bg)} [hidden]{display:none!important}
`;
const MARKUP = `
<style>${STYLE}</style>
<div class="panel" data-mode="bar" contenteditable="false">
 <div class="bar" role="toolbar" aria-label="选中文字">
  <span class="source-label" hidden></span><select data-receiver aria-label="接收对话" hidden></select><span class="selection-status" role="status" hidden></span>
  <button data-action="quote">添加到对话</button>
  <button data-action="side">在侧边聊天中提问</button>
 </div>
 <div class="editor">
  <div class="quote"></div><slot name="input"></slot>
  <div class="footer"><span class="status" role="status"></span><button data-action="cancel">Cancel</button><button data-action="ask" class="primary">Ask</button></div>
 </div>
</div>`;

type ReceiverChoice =
 | { mode: "automatic"; binding: StoreBinding | null }
 | { mode: "manual"; binding: StoreBinding | null };

type Interaction =
 | { kind: "hidden" }
 | { kind: "external"; selection: NonNullable<ExternalSelection>; choice: ReceiverChoice }
 | { kind: "selection"; snapshot: Snapshot }
 | { kind: "side"; snapshot: Snapshot; status: "editing" | "sending" };
const GAP = 8;
function clamp(value: number, min: number, max: number): number {
 return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Installs the selection bar. Returns cleanup; a no-op off the web. */
export function installSelectionBar(client: PluginClientContext, preferences?: AnnotationPreferences): () => void {
 if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
 const quotes = installQuoteComposer({ preferences });
 const removeSentQuotes = installSentQuotes();
 const host = document.createElement("div");
 host.setAttribute("data-paseo-quote", "");
 host.setAttribute("contenteditable", "true");
 host.setAttribute("aria-readonly", "true");
 for (const [property, value] of [["position", "fixed"], ["top", "0"], ["left", "0"], ["z-index", "2147483000"], ["display", "none"], ["margin", "0"], ["padding", "0"]] as const) host.style.setProperty(property, value, "important");
 const shadow = host.attachShadow({ mode: "open" });
 shadow.innerHTML = MARKUP;
 const panel = shadow.querySelector(".panel")!;
 const quotePreview = shadow.querySelector(".quote")!;
 const status = shadow.querySelector(".status")!;
 const sourceLabel = shadow.querySelector(".source-label")!;
 const selectionStatus = shadow.querySelector(".selection-status")!;
 const receiver = shadow.querySelector("select[data-receiver]") as DomSelect;
 const button = (action: string) => shadow.querySelector(`[data-action="${action}"]`) as DomButton;
 const field = document.createElement("textarea");
 field.setAttribute("slot", "input");
 field.setAttribute("data-paseo-sidechat-question", "");
 field.setAttribute("spellcheck", "true");
 for (const [property, value] of [
  ["all", "unset"], ["display", "block"], ["box-sizing", "border-box"], ["width", "100%"], ["min-height", "32px"], ["max-height", "160px"],
  ["padding", "6px 9px"], ["border", "0"], ["border-radius", "7px"], ["background", "transparent"], ["color", "var(--pq-fg)"],
  ["font-family", "var(--pq-font)"], ["font-size", "13px"], ["line-height", "20px"], ["white-space", "pre-wrap"], ["overflow-wrap", "anywhere"],
  ["overflow-y", "auto"], ["resize", "none"], ["user-select", "text"], ["-webkit-user-select", "text"], ["cursor", "text"],
 ] as const) field.style.setProperty(property, value, "important");
 host.appendChild(field);
 document.body.appendChild(host);
 let interaction: Interaction = { kind: "hidden" };
 let pending = 0;
 let disposed = false;
 let composing = false;
 let consumedOffer: ExternalOffer | null = null;
 let externalKind: AnnotationKind | null = null;

 const place = (anchor: DomRect, prefer: "above" | "below") => {
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, GAP, window.innerWidth - width - GAP);
  const above = anchor.top - height - GAP;
  const below = anchor.bottom + GAP;
  const fitsAbove = above >= GAP;
  const fitsBelow = below + height <= window.innerHeight - GAP;
  const top = prefer === "above" ? fitsAbove || !fitsBelow ? above : below : fitsBelow || !fitsAbove ? below : above;
  host.style.setProperty("left", `${Math.round(left)}px`, "important");
  host.style.setProperty("top", `${Math.round(clamp(top, GAP, window.innerHeight - height - GAP))}px`, "important");
 };
 const hide = () => { interaction = { kind: "hidden" }; host.style.setProperty("display", "none", "important"); };
 const showBar = (snapshot: Snapshot) => {
  interaction = { kind: "selection", snapshot };
  sourceLabel.hidden = true; selectionStatus.hidden = true; receiver.hidden = true; button("side").hidden = false;
  panel.setAttribute("data-mode", "bar");
  host.setAttribute("contenteditable", "true");
  button("quote").disabled = !snapshot.composer || !snapshot.agentId;
  button("side").disabled = !snapshot.agentId;
  applyPalette(host, snapshot.anchor);
  host.style.setProperty("display", "block", "important");
  place(snapshot.first, "above");
  updatePolicy(); void preferences?.refresh();
 };
 const showExternal = (selection: NonNullable<ExternalSelection>) => {
  if (interaction.kind === "side") return;
  const previous = interaction.kind === "external" && interaction.selection.kind === "offer" && selection.kind === "offer" && interaction.selection.offer.selectionToken === selection.offer.selectionToken ? interaction.choice : null;
  const candidates = selection.kind === "offer" ? selection.offer.recipients : [];
  const manual = previous?.mode === "manual" && previous.binding ? candidates.find((item) => item.hostId === previous.binding?.hostId && item.agentId === previous.binding?.agentId && item.draftKey === previous.binding?.draftKey && item.validate()) : null;
  const choice: ReceiverChoice = previous?.mode === "manual" && (!previous.binding || manual)
   ? { mode: "manual", binding: manual ?? null }
   : { mode: "automatic", binding: selection.kind === "offer" ? selection.offer.preferred : null };
  const recipient = choice.binding;
  const sameOffer = interaction.kind === "external" && interaction.selection.kind === "offer" && selection.kind === "offer" && interaction.selection.offer === selection.offer;
  interaction = { kind: "external", selection, choice };
  if (!sameOffer) externalKind = null;
  panel.setAttribute("data-mode", "bar"); button("side").hidden = true; sourceLabel.hidden = false;
  sourceLabel.textContent = selection.kind === "offer" ? selection.offer.label === "file" ? "文件原文" : selection.offer.label === "commit_diff" || selection.offer.label === "working_diff" || selection.offer.label === "changes_tree" ? "Diff 原文" : "终端输出" : "原文选择";
  selectionStatus.hidden = selection.kind === "offer" && candidates.length > 0;
  selectionStatus.textContent = selection.kind === "unavailable" ? selection.reason : candidates.length ? "" : "没有同工作区的接收对话";
  receiver.hidden = !candidates.length; receiver.innerHTML = "";
  const placeholder = document.createElement("option"); placeholder.setAttribute("value", ""); placeholder.textContent = "选择接收对话"; receiver.appendChild(placeholder);
  candidates.forEach((candidate, i) => { const option = document.createElement("option"); option.setAttribute("value", String(i)); option.textContent = candidate.label; receiver.appendChild(option); });
  receiver.value = recipient ? String(candidates.indexOf(recipient)) : ""; button("quote").disabled = !recipient;
  const root = selection.kind === "offer" ? selection.offer.root : selection.root;
  applyPalette(host, root as unknown as DomElement); host.style.setProperty("display", "block", "important");
  const geometry = selection.kind === "offer" ? selection.offer.source.geometry() : null;
  place(geometry?.kind === "visible" ? geometry.rects[0] : root.getBoundingClientRect(), "above");
  updatePolicy();
  if (selection.kind === "offer" && !sameOffer) {
   void selection.offer.snapshot.then((snapshot) => { if (interaction.kind === "external" && interaction.selection === selection) { externalKind = snapshot.origin.kind; sourceLabel.textContent = ({ file: "文件原文", markdown: "Markdown 预览", diff: "Diff 原文", terminal: "终端输出" })[snapshot.origin.kind]; updatePolicy(); } }).catch((cause) => { if (interaction.kind === "external" && interaction.selection === selection) { selectionStatus.hidden = false; selectionStatus.textContent = cause instanceof Error ? cause.message : String(cause); button("quote").disabled = true; } });
   void preferences?.refresh();
  }
 };
 const changeReceiver: DomListener = () => {
  if (interaction.kind !== "external" || interaction.selection.kind !== "offer") return;
  interaction = { ...interaction, choice: { mode: "manual", binding: receiver.value === "" ? null : interaction.selection.offer.recipients[Number(receiver.value)] ?? null } };
  button("quote").disabled = !interaction.choice.binding; updatePolicy();
 };
 receiver.addEventListener("change", changeReceiver);
 const updatePolicy = () => {
  if (!preferences || interaction.kind === "hidden" || interaction.kind === "side") return;
  const kind = interaction.kind === "selection" ? "chat" : externalKind;
  const state = preferences.state();
  const enabled = kind !== null && preferences.enabled(kind);
  if (!enabled) button("quote").disabled = true;
  const problem = state.status === "error" ? `注释设置读取失败：${state.error}` : state.status === "loading" ? "正在读取注释设置…" : kind && !enabled ? "此类注释已关闭，可在插件设置中开启" : "";
  if (problem) { selectionStatus.textContent = problem; selectionStatus.hidden = false; }
  else if (interaction.kind === "selection") { selectionStatus.hidden = true; button("quote").disabled = !interaction.snapshot.composer || !interaction.snapshot.agentId; }
  else if (interaction.selection.kind === "offer") { selectionStatus.hidden = interaction.selection.offer.recipients.length > 0; button("quote").disabled = !interaction.choice.binding || !enabled; }
 };
 const stopPolicy = preferences?.subscribe(updatePolicy) ?? (() => {});
 const stopExternal = quotes.observeExternal((selection) => {
  if (disposed || interaction.kind === "side") return;
  if (selection?.kind === "offer" && selection.offer === consumedOffer) return;
  if (selection) showExternal(selection); else if (interaction.kind === "external") hide();
 });
 const quote = () => {
  if (interaction.kind === "external") {
   const current = interaction;
   if (current.selection.kind !== "offer" || !current.choice.binding) return;
   consumedOffer = current.selection.offer; hide(); void quotes.addExternal(current.selection.offer, current.choice.binding); return;
  }
  if (interaction.kind !== "selection") return;
  const snapshot = interaction.snapshot;
  if (!snapshot.composer || !snapshot.agentId) return;
  hide();
  void quotes.add({ composer: snapshot.composer, anchor: snapshot.anchor, agentId: snapshot.agentId, formattedText: formatQuote(snapshot.source), preview: snapshot.preview, sourceRange: snapshot.range, openComment: true, focusComposer: false });
 };
 const openSide = () => {
  if (interaction.kind !== "selection") return;
  const snapshot = interaction.snapshot;
  interaction = { kind: "side", snapshot, status: "editing" };
  panel.setAttribute("data-mode", "side");
  host.setAttribute("contenteditable", "true");
  quotePreview.textContent = snapshot.preview;
  field.value = "";
  field.rows = 3;
  field.placeholder = "Ask about this in a side chat…";
  field.setAttribute("aria-label", "Side chat question");
  field.readOnly = false;
  status.textContent = "Enter · Ask     Shift+Enter · New line";
  button("ask").disabled = false;
  button("cancel").disabled = false;
  place(snapshot.last, "below");
  field.focus({ preventScroll: true });
 };
 const askSide = () => {
  if (interaction.kind !== "side" || interaction.status !== "editing" || !interaction.snapshot.agentId || !field.value.trim()) return;
  const current = interaction;
  const agentId = current.snapshot.agentId;
  if (!agentId) return;
  interaction = { ...current, status: "sending" };
  field.readOnly = true;
  button("ask").disabled = true;
  button("cancel").disabled = true;
  void startSideChat(client.paseo, { agentId, quote: formatQuote(current.snapshot.source), question: field.value }).then((side) => {
   if (disposed) return;
   client.openPanel("side-chat", { workspaceId: side.workspaceId, agentId: side.agentId, location: "explorer" });
   hide();
  }).catch((cause: unknown) => {
   if (disposed) return;
   interaction = current;
   field.readOnly = false;
   button("ask").disabled = false;
   button("cancel").disabled = false;
   status.textContent = cause instanceof Error ? cause.message : String(cause);
  });
 };
 const actions: Record<string, () => void> = { quote, side: openSide, cancel: hide, ask: askSide };
 const onPanelPointerDown: DomListener = (event) => { if (event.target !== field && event.target !== receiver) event.preventDefault(); };
 const onPanelClick: DomListener = (event) => {
  const target = elementOf(event.target)?.closest("button[data-action]") as DomButton | null;
  const action = target?.getAttribute("data-action");
  if (action && !target!.disabled) actions[action]?.();
 };
 panel.addEventListener("mousedown", onPanelPointerDown);
 panel.addEventListener("click", onPanelClick);
 const onBeforeInput: DomListener = (event) => { if (event.target !== field) event.preventDefault(); event.stopPropagation(); };
 host.addEventListener("beforeinput", onBeforeInput, true);
 const onFieldKeyDown: DomListener = (raw) => {
  const event = raw as DomKeyboardEvent;
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key !== "Escape" && (event.key !== "Enter" || event.shiftKey || event.altKey)) return;
  event.preventDefault();
  event.stopPropagation();
  if (interaction.kind === "side") { if (event.key === "Escape" && interaction.status === "editing") hide(); else if (event.key === "Enter") askSide(); }
 };
 const onHostKeyDown: DomListener = (raw) => {
  const event = raw as DomKeyboardEvent;
  if (event.target === field || composing || event.isComposing || event.keyCode === 229 || event.key !== "Escape") return;
  if (interaction.kind === "selection" || interaction.kind === "external") { event.preventDefault(); event.stopPropagation(); hide(); }
 };
 const onCompositionStart: DomListener = () => { composing = true; };
 const onCompositionEnd: DomListener = () => { composing = false; };
 field.addEventListener("keydown", onFieldKeyDown);
 field.addEventListener("compositionstart", onCompositionStart);
 field.addEventListener("compositionend", onCompositionEnd);
 host.addEventListener("keydown", onHostKeyDown, true);
 const sync = () => {
  pending = 0;
  if (interaction.kind === "side") return;
  const next = readSnapshot(host);
  if (next) showBar(next); else if (interaction.kind === "selection") hide();
 };
 const schedule = () => { if (!pending) pending = window.setTimeout(sync, 0); };
 const inside = (event: DomEvent) => event.target !== null && host.contains(event.target);
 const onPointerDown: DomListener = (event) => {
  if (inside(event) || interaction.kind === "hidden") return;
  if (interaction.kind === "side" && (interaction.status === "sending" || field.value.trim())) return;
  hide();
 };
 const onPointerUp: DomListener = (event) => { if (!inside(event)) schedule(); };
 const onKeyUp: DomListener = (raw) => { const event = raw as DomKeyboardEvent; if (event.shiftKey && !inside(event)) schedule(); };
 const onSelectionChange: DomListener = () => { if (interaction.kind === "selection" && window.getSelection()?.isCollapsed !== false) hide(); };
 const onViewportChange: DomListener = () => { if (interaction.kind === "selection") schedule(); };
 document.addEventListener("pointerdown", onPointerDown, true);
 document.addEventListener("pointerup", onPointerUp, true);
 document.addEventListener("keyup", onKeyUp, true);
 document.addEventListener("selectionchange", onSelectionChange);
 window.addEventListener("scroll", onViewportChange, true);
 window.addEventListener("resize", onViewportChange);
 return () => {
  disposed = true;
  stopPolicy(); stopExternal(); receiver.removeEventListener("change", changeReceiver); quotes.dispose();
  removeSentQuotes();
  window.clearTimeout(pending);
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("pointerup", onPointerUp, true);
  document.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("selectionchange", onSelectionChange);
  window.removeEventListener("scroll", onViewportChange, true);
  window.removeEventListener("resize", onViewportChange);
  panel.removeEventListener("mousedown", onPanelPointerDown);
  panel.removeEventListener("click", onPanelClick);
  field.removeEventListener("keydown", onFieldKeyDown);
  field.removeEventListener("compositionstart", onCompositionStart);
  field.removeEventListener("compositionend", onCompositionEnd);
  host.removeEventListener("beforeinput", onBeforeInput, true);
  host.removeEventListener("keydown", onHostKeyDown, true);
  host.remove();
 };
}
