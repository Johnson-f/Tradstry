import assert from "node:assert/strict";
import { test } from "node:test";
import { createHeadlessEditor } from "@lexical/headless";
import { createBinding, syncLexicalUpdateToYjs, syncYjsChangesToLexical } from "@lexical/yjs";
import { $getRoot } from "lexical";
import * as Y from "yjs";
import { mergeUpdateChain } from "../compact.mjs";
import { ExchangeError, editNote, exportNote, markdownToDocument } from "../exchange.mjs";
import { DOC_ID, NAMESPACE, NODES } from "../nodes.mjs";
import { updateToJson } from "../project.mjs";
import { jsonToUpdate } from "../seed.mjs";

const IMAGE = "a".repeat(64);
const VIDEO = "b".repeat(64);
const NEW_IMAGE = "c".repeat(64);
const context = {
  trades: { t1: "AAPL · 2026-10-03", t2: "MSFT · 2026-10-04" },
  media: { [IMAGE]: { type: "image", width: 640, height: 480 }, [VIDEO]: { type: "video" } },
};

const text = (t, format = 0, style = "") => ({
  type: "text", version: 1, text: t, format, detail: 0, mode: "normal", style,
});
const paragraph = (children, format = "") => ({
  type: "paragraph", version: 1, direction: "ltr", format, indent: 0, textFormat: 0, textStyle: "",
  children: typeof children === "string" ? [text(children)] : children,
});
const heading = (tag, t) => ({
  type: "heading", version: 1, tag, direction: "ltr", format: "", indent: 0, children: [text(t)],
});
const emptyParagraph = () => paragraph([]);
const image = (hash = IMAGE, width = 300, height = 200) => ({
  type: "notebook-image", version: 2, hash, altText: "chart", width, height,
});
const chip = (tradeId) => ({ type: "linked-trade", version: 1, tradeId });
const doc = (...children) =>
  JSON.stringify({ root: { type: "root", version: 1, direction: "ltr", format: "", indent: 0, children } });

const rootOf = (updates) => JSON.parse(updateToJson(updates)).root;
const seedOf = (json) => jsonToUpdate(json);

function edit(updates, change, extra = {}) {
  const result = editNote({ updates, edit: change, context, ...extra });
  return { result, updates: result.update ? [...updates, result.update] : updates };
}

/** Item ids of the live top-level blocks, which identify a block across edits. */
function blockIds(updates) {
  const d = new Y.Doc();
  for (const u of updates) Y.applyUpdate(d, u);
  const ids = [];
  for (let item = d.get("root", Y.XmlText)._start; item; item = item.right) {
    if (!item.deleted && item.content?.type) ids.push(`${item.id.client}:${item.id.clock}`);
  }
  return ids;
}

const RICH = doc(
  heading("h1", "FOMC playbook"),
  emptyParagraph(),
  paragraph([text("Wait for "), text("the statement", 8), text(" before entering.")], "center"),
  image(),
  paragraph([text("Last time: "), chip("t1"), text(" went well.")]),
  paragraph("Size down on surprise."),
  emptyParagraph(),
);

test("every Tradstry Markdown construct round-trips", () => {
  const markdown = [
    "# Title",
    "Some **bold**, *italic*, ~~struck~~, `code` and [a link](https://example.com).",
    "- [ ] check rates\n- [x] read statement",
    "- bullet\n    - nested",
    "3. third\n4. fourth",
    "> quoted\n> twice",
    "```js\nconst x = 1;\n\nx();\n```",
    "| Level | Note |\n| --- | --- |\n| 4200 | **support** |",
    "---",
    `![chart](media:${IMAGE})`,
    `![clip](media:${VIDEO})`,
    "Trade [AAPL · 2026-10-03](trade:t1) was clean.",
    "```trades Week of Oct 6\nt1\nt2\n```",
  ].join("\n\n");

  const { documentJson } = markdownToDocument({ markdown, context });
  const read = exportNote({ updates: [seedOf(documentJson)], context });
  assert.equal(read.placeholders, 0);
  assert.equal(read.markdown, markdown);
});

test("a note with formatting Markdown cannot show exports without placeholders", () => {
  const read = exportNote({ updates: [seedOf(RICH)], context });
  assert.equal(read.placeholders, 0);
  assert.equal(
    read.markdown,
    [
      "# FOMC playbook",
      "Wait for the statement before entering.",
      `![chart](media:${IMAGE})`,
      "Last time: [AAPL · 2026-10-03](trade:t1) went well.",
      "Size down on surprise.",
    ].join("\n\n"),
  );
});

test("rewriting a note with its own Markdown changes nothing", () => {
  const updates = [seedOf(RICH)];
  const read = exportNote({ updates, context });
  const { result } = edit(updates, { kind: "rewrite", markdown: read.markdown });
  assert.equal(result.update, null);
  assert.deepEqual(result.changes, { kept: 5, changed: 0, inserted: 0, removed: 0 });
  assert.equal(result.revision, read.revision);
});

test("an edit touches only its block; formatting, media and chips elsewhere survive", () => {
  const updates = [seedOf(RICH)];
  const before = rootOf(updates).children;
  const idsBefore = blockIds(updates);

  const { result, updates: after } = edit(updates, {
    kind: "replaceText",
    edits: [{ old: "Size down on surprise.", new: "Size down by half on a surprise." }],
  });
  assert.deepEqual(result.changes, { kept: 4, changed: 1, inserted: 0, removed: 0 });

  const children = rootOf(after).children;
  assert.equal(children.length, before.length);
  for (const i of [0, 1, 2, 3, 4, 6]) {
    assert.deepEqual(children[i], before[i], `block ${i} must be untouched`);
  }
  assert.equal(children[5].children[0].text, "Size down by half on a surprise.");
  assert.equal(children[2].format, "center");
  assert.equal(children[2].children[1].format, 8, "underline kept");
  assert.equal(children[3].width, 300, "image size kept");

  const idsAfter = blockIds(after);
  const survivors = idsBefore.filter((id) => idsAfter.includes(id));
  assert.equal(survivors.length, idsBefore.length - 1, "only the edited block was replaced in the CRDT");
});

test("a rewrite of an aligned, underlined block keeps alignment and reports the underline", () => {
  const { result, updates } = edit([seedOf(RICH)], {
    kind: "replaceText",
    edits: [{ old: "Wait for the statement", new: "Always wait for the statement" }],
  });
  const block = rootOf(updates).children[2];
  assert.equal(block.format, "center");
  assert.deepEqual(result.formattingLost, ["underline"]);
});

test("append lands after the last block and before trailing spacing", () => {
  const { updates } = edit([seedOf(RICH)], { kind: "append", markdown: "## Sizing\n\nHalf size." });
  const types = rootOf(updates).children.map((c) => c.type);
  assert.deepEqual(types.slice(-3), ["heading", "paragraph", "paragraph"]);
  assert.equal(rootOf(updates).children.at(-1).children.length, 0, "trailing empty paragraph stays last");
  assert.equal(rootOf(updates).children.at(-2).children[0].text, "Half size.");
});

test("deleting blocks removes the spacing stranded between them", () => {
  const json = doc(paragraph("keep"), paragraph("a"), emptyParagraph(), paragraph("b"), paragraph("end"));
  const { updates } = edit([seedOf(json)], { kind: "rewrite", markdown: "keep\n\nend" });
  assert.deepEqual(
    rootOf(updates).children.map((c) => c.children[0]?.text ?? ""),
    ["keep", "end"],
  );
});

test("setTitle replaces the first H1, or adds one", () => {
  const { updates } = edit([seedOf(RICH)], { kind: "setTitle", title: "Rate decisions" });
  assert.equal(rootOf(updates).children[0].children[0].text, "Rate decisions");

  const plain = [seedOf(doc(paragraph("body")))];
  const { updates: titled } = edit(plain, { kind: "setTitle", title: "New" });
  assert.deepEqual(rootOf(titled).children.map((c) => c.type), ["heading", "paragraph"]);
});

test("blocks Markdown cannot carry become placeholders that survive edits", () => {
  const merged = {
    type: "table", version: 1, direction: "ltr", format: "", indent: 0, colWidths: [100, 100],
    children: [{
      type: "tablerow", version: 1, direction: "ltr", format: "", indent: 0,
      children: [{
        type: "tablecell", version: 1, direction: "ltr", format: "", indent: 0,
        colSpan: 2, rowSpan: 1, headerState: 0, backgroundColor: null,
        children: [paragraph("merged cell")],
      }],
    }],
  };
  const updates = [seedOf(doc(paragraph("intro"), merged, paragraph("outro")))];
  const read = exportNote({ updates, context });
  assert.equal(read.placeholders, 1);
  assert.match(read.markdown, /^intro\n\n<!-- tradstry:keep b2 · table: merged cell -->\n\noutro$/);

  const { updates: edited } = edit(updates, {
    kind: "replaceText",
    edits: [{ old: "outro", new: "closing" }],
  });
  assert.deepEqual(rootOf(edited).children[1], rootOf(updates).children[1], "table untouched");

  assert.throws(
    () => edit(updates, { kind: "replaceText", edits: [{ old: "b2 · table", new: "b9 · table" }] }),
    (e) => e instanceof ExchangeError && e.code === "PLACEHOLDER_CHANGED",
  );

  const { updates: removed } = edit(updates, {
    kind: "rewrite",
    markdown: "intro\n\noutro",
  });
  assert.deepEqual(rootOf(removed).children.map((c) => c.type), ["paragraph", "paragraph"]);
});

test("a stale revision is refused", () => {
  const updates = [seedOf(RICH)];
  const read = exportNote({ updates, context });
  const { updates: moved } = edit(updates, { kind: "append", markdown: "more" });
  assert.throws(
    () => editNote({ updates: moved, edit: { kind: "append", markdown: "x" }, expectedRevision: read.revision, context }),
    (e) => e instanceof ExchangeError && e.code === "CONFLICT",
  );
});

test("compaction changes neither the revision nor the Markdown", () => {
  let updates = [seedOf(RICH)];
  for (let i = 0; i < 5; i++) updates = edit(updates, { kind: "append", markdown: `line ${i}` }).updates;
  const before = exportNote({ updates, context });
  const after = exportNote({ updates: [mergeUpdateChain(updates)], context });
  assert.equal(after.revision, before.revision);
  assert.equal(after.markdown, before.markdown);
});

test("text edits must match exactly once", () => {
  const updates = [seedOf(doc(paragraph("same"), paragraph("same")))];
  assert.throws(
    () => edit(updates, { kind: "replaceText", edits: [{ old: "missing", new: "x" }] }),
    (e) => e.code === "TEXT_NOT_FOUND",
  );
  assert.throws(
    () => edit(updates, { kind: "replaceText", edits: [{ old: "same", new: "x" }] }),
    (e) => e.code === "TEXT_AMBIGUOUS",
  );
});

test("references must be known; new media takes its size from context", () => {
  const updates = [seedOf(RICH)];
  assert.throws(
    () => edit(updates, { kind: "append", markdown: `![x](media:${NEW_IMAGE})` }),
    (e) => e.code === "INVALID_REFERENCE",
  );
  assert.throws(
    () => edit(updates, { kind: "append", markdown: "[x](trade:unknown)" }),
    (e) => e.code === "INVALID_REFERENCE",
  );
  const added = editNote({
    updates,
    edit: { kind: "append", markdown: `![new chart](media:${NEW_IMAGE})` },
    context: { ...context, media: { ...context.media, [NEW_IMAGE]: { type: "image", width: 10, height: 20 } } },
  });
  const node = rootOf([...updates, added.update]).children.find((c) => c.hash === NEW_IMAGE);
  assert.deepEqual([node.width, node.height, node.altText], [10, 20, "new chart"]);
  assert.ok(added.references.media.includes(NEW_IMAGE));
});

const provider = { awareness: { getLocalState: () => null, getStates: () => [] } };
const REMOTE = Symbol("remote");

function client(updates) {
  const editor = createHeadlessEditor({ namespace: NAMESPACE, nodes: NODES, onError: (e) => { throw e; } });
  const d = new Y.Doc();
  const binding = createBinding(editor, provider, DOC_ID, d, new Map([[DOC_ID, d]]));
  binding.root.getSharedType().observeDeep((events, tx) => {
    if (tx.origin !== binding) syncYjsChangesToLexical(binding, provider, events, false);
  });
  editor.registerUpdateListener(({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
    if (!tags.has("skip-collab")) {
      syncLexicalUpdateToYjs(binding, provider, prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags);
    }
  });
  const outbox = [];
  d.on("update", (update, origin) => {
    if (origin !== REMOTE) outbox.push(update);
  });
  for (const u of updates) Y.applyUpdate(d, u, REMOTE);
  editor.update(() => {}, { discrete: true });
  return {
    outbox,
    type(index, next) {
      editor.update(() => $getRoot().getChildren()[index].getFirstChild().setTextContent(next), { discrete: true });
    },
  };
}

test("a user typing in another block and an assistant edit both survive, in either order", () => {
  const seed = seedOf(doc(paragraph("first"), paragraph("second"), paragraph("third")));
  const web = client([seed]);
  web.type(0, "first, typed on the web");
  const { result } = edit([seed], { kind: "replaceText", edits: [{ old: "third", new: "third, from chat" }] });

  for (const order of [[...web.outbox, result.update], [result.update, ...web.outbox]]) {
    const texts = rootOf([seed, ...order]).children.map((c) => c.children[0].text);
    assert.deepEqual(texts, ["first, typed on the web", "second", "third, from chat"]);
  }
});

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// Hostile documents put formatting on bare spaces, press formatted runs together
// and scatter Markdown punctuation; realistic ones format whole words.
function generatedDocument(random, hostile) {
  const pick = (xs) => xs[Math.floor(random() * xs.length)];
  const words = hostile
    ? ["entry", "stop", "*", "_x_", "a|b", "`tick`", "[x]", "#1", "> q", "price", "   ", "\\", "→"]
    : ["entry", "stop", "AAPL", "4,200", "risk", "half-size", "plan", "VWAP", "(late)", "→", "50%", "a|b"];
  const run = () => Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(words)).join(" ");
  const inline = () => {
    const parts = [];
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const roll = random();
      if (roll < 0.15) parts.push(chip(pick(["t1", "t2"])));
      else if (roll < 0.25 && (hostile || (i > 0 && i < count - 1))) parts.push({ type: "linebreak", version: 1 });
      else if (hostile) parts.push(text(run(), pick([0, 1, 2, 8, 16, 1 | 2, 4])));
      else parts.push(text(pick(words), pick([0, 1, 2, 4, 8, 16])), text(` ${run()}`));
      if (!hostile && i < count - 1 && parts.at(-1).type !== "linebreak") parts.push(text(" "));
    }
    return parts;
  };
  // A nested list lives in a list item of its own, as the editor builds it.
  const listItem = (children) => ({
    type: "listitem", version: 1, direction: "ltr", format: "", indent: 0, value: 1, children,
  });
  // Markdown nests by indentation within one list, so a sublist of another type
  // cannot be written; hostile documents still generate those.
  const list = (depth = 0, parentType = null) => {
    const listType = parentType && !hostile ? parentType : pick(["bullet", "number", "check"]);
    const items = [];
    for (let i = 0; i < 1 + Math.floor(random() * 3); i++) {
      items.push({ ...listItem(inline()), ...(listType === "check" ? { checked: random() < 0.5 } : {}) });
      if (depth < 1 && random() < 0.3) items.push(listItem([list(depth + 1, listType)]));
    }
    return {
      type: "list", version: 1, direction: "ltr", format: "", indent: 0, listType, start: 1,
      tag: listType === "number" ? "ol" : "ul", children: items,
    };
  };
  const blocks = [
    () => paragraph(inline(), pick(["", "center", "right"])),
    () => heading(pick(["h1", "h2", "h3"]), run()),
    () => list(),
    () => ({ type: "quote", version: 1, direction: "ltr", format: "", indent: 0, children: inline() }),
    () => ({ type: "code", version: 1, direction: "ltr", format: "", indent: 0, language: pick(["js", null]), children: [text(`${run()}\n\n    ${run()}`)] }),
    () => image(),
    () => ({ type: "horizontalrule", version: 1 }),
    () => emptyParagraph(),
    () => ({ type: "trade-table", version: 1, tradeIds: ["t1", "t2"], label: run() }),
  ];
  return doc(...Array.from({ length: 2 + Math.floor(random() * 8) }, () => pick(blocks)()));
}

function assertLossless(json, label) {
  const updates = [seedOf(json)];
  const before = rootOf(updates);
  const read = exportNote({ updates, context });
  const { result } = edit(updates, { kind: "rewrite", markdown: read.markdown });
  assert.equal(result.update, null, `${label}: rewriting its own export must change nothing\n${read.markdown}`);
  assert.deepEqual(rootOf(updates), before);
  return { placeholders: read.placeholders, blocks: read.markdown.split("\n\n").length };
}

test("hostile documents export losslessly: every block round-trips or is kept as a placeholder", () => {
  const random = rng(42);
  for (let i = 0; i < 150; i++) assertLossless(generatedDocument(random, true), `hostile ${i}`);
});

test("realistic documents export losslessly and almost never need a placeholder", () => {
  const random = rng(7);
  let placeholders = 0;
  let blocks = 0;
  for (let i = 0; i < 300; i++) {
    const counts = assertLossless(generatedDocument(random, false), `realistic ${i}`);
    placeholders += counts.placeholders;
    blocks += counts.blocks;
  }
  assert.ok(placeholders / blocks < 0.02, `too many placeholders: ${placeholders} of ${blocks}`);
});

test("in generated documents, editing any one block leaves every other block untouched", () => {
  const random = rng(11);
  let checked = 0;
  for (let i = 0; i < 200; i++) {
    const updates = [seedOf(generatedDocument(random, false))];
    const before = rootOf(updates).children;
    const read = exportNote({ updates, context });
    const blocks = read.markdown.split("\n\n").filter((b) => !b.includes("```") && !b.startsWith("<!--"));
    const unique = blocks.filter((b) => read.markdown.split(b).length === 2);
    if (unique.length === 0) continue;
    const target = unique[Math.floor(random() * unique.length)];

    const { result, updates: after } = edit(updates, {
      kind: "replaceText",
      edits: [{ old: target, new: "Edited from chat." }],
    });
    const children = rootOf(after).children;
    assert.equal(result.changes.changed, 1, `document ${i}`);
    assert.equal(children.length, before.length, `document ${i}`);
    const differing = children.filter((child, k) => JSON.stringify(child) !== JSON.stringify(before[k]));
    assert.equal(differing.length, 1, `document ${i}: only the edited block may change`);
    checked++;
  }
  assert.ok(checked > 150, `only ${checked} documents had an editable block`);
});
