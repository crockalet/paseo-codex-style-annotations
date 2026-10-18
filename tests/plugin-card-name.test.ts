import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import manifest from "../paseo-plugin.json";
import { installPluginCardName } from "../client/plugin-card-name";

function card(id = manifest.id, name = id) {
  return `<div data-testid="plugin-row-${id}"><div><div><div dir="auto">${name}</div><div><div dir="auto">Running</div></div></div><div><div dir="auto">Description ${id}</div><div dir="auto">Local source ${id}</div></div><div role="alert" dir="auto">Error ${id}</div></div><div><div aria-label="${id} Running"><button role="switch" aria-label="${id}: Disable">Enabled</button><button aria-label="${id} actions">Actions</button></div></div></div>`;
}

function fixture(html = card()) {
  const prior = Reflect.get(globalThis, "document");
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;
  Object.assign(globalThis, { document: doc });
  const disposers: (() => void)[] = [];
  return { doc, dom, install() {
    const dispose = installPluginCardName();
    disposers.push(dispose);
    return dispose;
  }, title() {
    const node = doc.querySelector(`[data-testid="plugin-row-${manifest.id}"] > div > div > div[dir="auto"]`)?.firstChild;
    assert.ok(node instanceof dom.window.Text);
    return node;
  }, close() {
    disposers.forEach((dispose) => dispose());
    Object.assign(globalThis, { document: prior });
    dom.window.close();
  } };
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("own native title changes visibly and accessibly while all other DOM and actions survive", () => {
  const f = fixture(card() + card("another-plugin"));
  try {
    const before = f.doc.body.innerHTML;
    const text = f.title();
    const title = text.parentElement;
    const controls = f.doc.querySelector("button");
    let clicks = 0;
    controls?.addEventListener("click", () => clicks++);
    const dispose = f.install();
    assert.equal(f.title(), text);
    assert.equal(title?.textContent, manifest.name);
    controls?.click();
    assert.equal(clicks, 1);
    assert.equal(f.doc.body.innerHTML.replace(manifest.name, manifest.id), before);
    dispose(); dispose();
    assert.equal(f.doc.body.innerHTML, before);
  } finally { f.close(); }
});

test("status changes, host slug rerenders, and card remounts retain the display name", async () => {
  const f = fixture();
  try {
    f.install();
    const badge = f.title().parentElement?.nextElementSibling;
    assert.ok(badge);
    badge.innerHTML = '<div dir="auto">Stopped</div>';
    await settle();
    assert.equal(f.title().data, manifest.name);
    assert.equal(badge.textContent, "Stopped");
    f.title().data = manifest.id;
    await settle();
    assert.equal(f.title().data, manifest.name);
    f.doc.body.innerHTML = "";
    await settle();
    f.doc.body.innerHTML = card();
    await settle();
    assert.equal(f.title().data, manifest.name);
  } finally { f.close(); }
});

test("native and foreign titles are never claimed or restored", async () => {
  for (const name of [manifest.name, "Host native name"]) {
    const f = fixture(card(manifest.id, name));
    try {
      const dispose = f.install();
      await settle();
      dispose();
      assert.equal(f.title().data, name);
    } finally { f.close(); }
  }
});

test("foreign title edits survive observation and immediate teardown, including same-byte writes", async () => {
  for (const name of [manifest.name, "Updated native title"]) {
    for (const flush of [false, true]) {
      const f = fixture();
      try {
        const dispose = f.install();
        f.title().data = name;
        if (flush) await settle();
        dispose();
        assert.equal(f.title().data, name);
      } finally { f.close(); }
    }
  }
});

test("native replacement text nodes keep ownership even when their bytes match", async () => {
  const f = fixture();
  try {
    const dispose = f.install();
    const title = f.title().parentElement;
    assert.ok(title);
    title.replaceChildren(f.doc.createTextNode(manifest.name));
    await settle();
    dispose();
    assert.equal(f.title().data, manifest.name);
  } finally { f.close(); }
});

test("duplicate cards abstain and restore an existing substitution until uniqueness returns", async () => {
  const f = fixture(card() + card());
  try {
    const dispose = f.install();
    assert.equal(f.title().data, manifest.id);
    f.doc.body.lastElementChild?.remove();
    await settle();
    assert.equal(f.title().data, manifest.name);
    f.doc.body.insertAdjacentHTML("beforeend", card());
    await settle();
    assert.equal(f.title().data, manifest.id);
    dispose();
  } finally { f.close(); }
});

test("unknown title structures remain untouched", () => {
  for (const html of [card().replace('dir="auto">quote-notes</div>', 'dir="auto"><span>quote-notes</span></div>'),
    card().replace('dir="auto">quote-notes</div>', 'dir="auto">quote-<!--split-->notes</div>'),
    '<div data-testid="plugin-row-quote-notes"><div dir="auto">quote-notes</div></div>']) {
    const f = fixture(html);
    try {
      const before = f.doc.body.innerHTML;
      f.install()();
      assert.equal(f.doc.body.innerHTML, before);
    } finally { f.close(); }
  }
});

test("overlapping installations share ownership and the last teardown stops later remounts", async () => {
  const f = fixture();
  try {
    const first = f.install(), second = f.install();
    first(); first();
    assert.equal(f.title().data, manifest.name);
    second();
    assert.equal(f.title().data, manifest.id);
    f.doc.body.innerHTML = card();
    await settle();
    assert.equal(f.title().data, manifest.id);
  } finally { f.close(); }
});

test("no document or observer capability is harmless", () => {
  const prior = Reflect.get(globalThis, "document");
  try {
    Reflect.deleteProperty(globalThis, "document");
    installPluginCardName()();
    Object.assign(globalThis, { document: { defaultView: null } });
    installPluginCardName()();
  } finally { Object.assign(globalThis, { document: prior }); }
});
