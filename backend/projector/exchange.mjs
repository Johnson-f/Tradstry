import { createHash } from "node:crypto";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  LINK,
} from "@lexical/markdown";
import {
  createBinding,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import {
  $createParagraphNode,
  $getRoot,
  $parseSerializedNode,
} from "lexical";
import * as Y from "yjs";
import {
  DOC_ID,
  LinkedTradeNode,
  MARKDOWN_TRANSFORMERS,
  NAMESPACE,
  NODES,
  NotebookImageNode,
  NotebookVideoNode,
  stripGhostText,
  TradeTableNode,
} from "./nodes.mjs";

// Tradstry Markdown: the shared transformers plus media, trade chips and trade
// tables. A block Markdown cannot carry faithfully is exported as a placeholder
// the caller must leave in place, so an export never drops content.

export class ExchangeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

const provider = {
  awareness: { getLocalState: () => null, getStates: () => [] },
};

const MEDIA_LINE = /^!\[((?:[^\]\\]|\\.)*)\]\(media:([0-9a-f]{64})\)[ \t]*$/;
const TRADE_REF = "\\[((?:[^\\]\\\\]|\\\\.)*)\\]\\(trade:([A-Za-z0-9_-]{1,128})\\)";
const TRADE_CHIP_IMPORT = new RegExp(TRADE_REF);
const TRADE_CHIP_TYPED = new RegExp(`${TRADE_REF}$`);
const TRADES_FENCE_START = /^```trades(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_END = /^```[ \t]*$/;
const FENCE_LINE = /^[ \t]*```/;
const KEEP_LINE = /^<!-- tradstry:keep b(\d+)(?: · [^\n]*?)? -->$/;
const KEEP_MENTION = /tradstry:keep/;

const escapeLabel = (text) =>
  String(text ?? "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/[\\[\]]/g, (c) => `\\${c}`);
const unescapeLabel = (text) => text.replace(/\\(.)/g, "$1");

/** What a conversion may reference, and how trades are labelled on export. */
class References {
  constructor(context = {}) {
    this.trades = new Map(Object.entries(context.trades ?? {}));
    this.media = new Map(Object.entries(context.media ?? {}));
    this.usedTrades = new Set();
    this.usedMedia = new Set();
  }

  /** Everything the current document already references stays referenceable. */
  adoptDocument(rootJson) {
    walk(rootJson, (node) => {
      if (node.type === "notebook-image" && !this.media.has(node.hash)) {
        this.media.set(node.hash, { type: "image", width: node.width, height: node.height });
      } else if (node.type === "notebook-video" && !this.media.has(node.hash)) {
        this.media.set(node.hash, { type: "video" });
      } else if (node.type === "linked-trade" && !this.trades.has(node.tradeId)) {
        this.trades.set(node.tradeId, null);
      } else if (node.type === "trade-table") {
        for (const id of node.tradeIds ?? []) if (!this.trades.has(id)) this.trades.set(id, null);
      }
    });
  }

  trade(id) {
    if (!this.trades.has(id)) throw new ExchangeError("INVALID_REFERENCE", `trade ${id}`);
    this.usedTrades.add(id);
    return id;
  }

  mediaInfo(hash) {
    const info = this.media.get(hash);
    if (!info) throw new ExchangeError("INVALID_REFERENCE", `media ${hash}`);
    this.usedMedia.add(hash);
    return info;
  }

  label(id) {
    return this.trades.get(id) || "trade";
  }
}

function exchangeTransformers(refs) {
  const media = {
    dependencies: [NotebookImageNode, NotebookVideoNode],
    export: (node) => {
      const type = node.getType();
      if (type !== "notebook-image" && type !== "notebook-video") return null;
      return `![${escapeLabel(node.__altText)}](media:${node.__hash})`;
    },
    regExp: MEDIA_LINE,
    replace: (parentNode, _children, match) => {
      const hash = match[2];
      const alt = unescapeLabel(match[1]);
      const info = refs.mediaInfo(hash);
      parentNode.replace(
        info.type === "video"
          ? new NotebookVideoNode(hash, alt)
          : new NotebookImageNode(hash, alt, info.width ?? 0, info.height ?? 0),
      );
    },
    type: "element",
  };

  const tradeChip = {
    dependencies: [LinkedTradeNode],
    export: (node) =>
      node.getType() === "linked-trade"
        ? `[${escapeLabel(refs.label(node.__tradeId))}](trade:${node.__tradeId})`
        : null,
    importRegExp: TRADE_CHIP_IMPORT,
    regExp: TRADE_CHIP_TYPED,
    replace: (textNode, match) => {
      textNode.replace(new LinkedTradeNode(refs.trade(match[2])));
    },
    trigger: ")",
    type: "text-match",
  };

  const tradeTable = {
    dependencies: [TradeTableNode],
    export: (node) => {
      if (node.getType() !== "trade-table") return null;
      const label = escapeLabel(node.__label).trim();
      return ["```trades" + (label ? ` ${label}` : ""), ...node.__tradeIds, "```"].join("\n");
    },
    regExpStart: TRADES_FENCE_START,
    regExpEnd: { optional: true, regExp: FENCE_END },
    replace: (rootNode, _children, startMatch, _endMatch, linesInBetween) => {
      const ids = linesInBetween
        .map((line) => line.trim())
        .filter(Boolean)
        .map((id) => refs.trade(id));
      rootNode.append(new TradeTableNode(ids, unescapeLabel((startMatch[1] ?? "").trim())));
    },
    type: "multiline-element",
  };

  // Order matters: the trades fence before the code fence it also matches, and
  // the trade chip before the generic link it also matches.
  const shared = MARKDOWN_TRANSFORMERS.filter((t) => t !== LINK);
  return [tradeTable, media, ...shared, tradeChip, LINK];
}

function walk(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function newEditor() {
  return createHeadlessEditor({
    namespace: NAMESPACE,
    nodes: NODES,
    onError: (e) => {
      throw e;
    },
  });
}

// Bold, italic, strikethrough, code, highlight. Underline, sub/superscript and
// case transforms have no Markdown and are tolerated losses.
const MARKDOWN_TEXT_FORMATS = 1 | 2 | 4 | 16 | 128;
const UNDERLINE = 8;

function textContent(node) {
  if (typeof node.text === "string") return node.text;
  if (node.type === "linebreak") return "\n";
  if (node.type === "tab") return "\t";
  return (node.children ?? []).map(textContent).join("");
}

/** The parts of a block Markdown can express, in a comparable shape. */
export function canonical(node) {
  switch (node.type) {
    case "text":
      return { type: "text", text: node.text, format: (node.format ?? 0) & MARKDOWN_TEXT_FORMATS };
    case "code":
      return { type: "code", language: node.language || null, text: textContent(node) };
    case "notebook-image":
    case "notebook-video":
      return { type: node.type, hash: node.hash, alt: node.altText ?? "" };
    case "linked-trade":
      return { type: "linked-trade", tradeId: node.tradeId };
    case "trade-table":
      return { type: "trade-table", tradeIds: node.tradeIds ?? [], label: (node.label ?? "").trim() };
    case "link":
    case "autolink":
      return { type: "link", url: node.url, children: canonicalChildren(node) };
    case "heading":
      return { type: "heading", tag: node.tag, children: canonicalChildren(node) };
    case "list":
      return { type: "list", listType: node.listType, start: node.start ?? 1, children: canonicalChildren(node) };
    case "listitem":
      return { type: "listitem", checked: node.checked === true, children: canonicalChildren(node) };
    case "tablecell":
      return {
        type: "tablecell",
        headerState: node.headerState ?? 0,
        colSpan: node.colSpan ?? 1,
        rowSpan: node.rowSpan ?? 1,
        children: canonicalChildren(node),
      };
    default:
      return node.children
        ? { type: node.type, children: canonicalChildren(node) }
        : { type: node.type };
  }
}

function canonicalChildren(node) {
  const out = [];
  for (const child of node.children ?? []) {
    if (child.type === "ghost-text") continue;
    const c = canonical(child);
    if (c.type === "text" && c.text === "") continue;
    const last = out[out.length - 1];
    if (c.type === "text" && last?.type === "text" && last.format === c.format) {
      last.text += c.text;
    } else {
      out.push(c);
    }
  }
  return out;
}

const sameShape = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function isEmptyParagraph(json) {
  return json.type === "paragraph" && canonicalChildren(json).length === 0;
}

/** Tolerated attributes a block holds that a rewrite of it would not keep. */
function formattingOf(json) {
  const found = new Set();
  walk(json, (node) => {
    if (node.type === "text" && ((node.format ?? 0) & UNDERLINE)) found.add("underline");
    if (node.type === "text" && node.style) found.add("text style");
    if (node.type === "tablecell" && node.backgroundColor) found.add("cell colour");
    if (node.type === "table" && Array.isArray(node.colWidths) && node.colWidths.length) {
      found.add("column widths");
    }
  });
  return found;
}

class Scratch {
  constructor(transformers) {
    this.transformers = transformers;
    this.editor = newEditor();
  }

  toMarkdown(blockJson) {
    let out = "";
    this.editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($parseSerializedNode(blockJson));
        out = $convertToMarkdownString(this.transformers);
      },
      { discrete: true },
    );
    return out;
  }

  toBlocks(markdown) {
    this.editor.update(
      () => {
        $convertFromMarkdownString(markdown, this.transformers);
      },
      { discrete: true },
    );
    return this.editor
      .getEditorState()
      .toJSON()
      .root.children.filter((child) => !isEmptyParagraph(child));
  }
}

function describe(json) {
  const preview = textContent(json).replace(/\s+/g, " ").replace(/-->/g, "→").trim();
  const name = json.type.replace(/^notebook-/, "");
  return preview ? `${name}: ${preview.slice(0, 40)}${preview.length > 40 ? "…" : ""}` : name;
}

/**
 * The document as Markdown blocks. Empty paragraphs are spacing, not content: they
 * are not shown and an edit leaves them where they are.
 */
function exportBlocks(rootJson, scratch) {
  const blocks = [];
  let visible = 0;
  rootJson.children.forEach((json, nodeIndex) => {
    if (isEmptyParagraph(json)) return;
    visible += 1;
    let markdown = null;
    try {
      const exported = scratch.toMarkdown(json);
      const reimported = scratch.toBlocks(exported);
      if (
        exported.trim() !== "" &&
        reimported.length === 1 &&
        sameShape(reimported[0], json) &&
        scratch.toMarkdown(reimported[0]) === exported
      ) {
        markdown = exported;
      }
    } catch (e) {
      if (!(e instanceof ExchangeError)) throw e;
    }
    const id = visible;
    blocks.push({
      nodeIndex,
      json,
      key: markdown ?? `keep:${id}`,
      markdown: markdown ?? `<!-- tradstry:keep b${id} · ${describe(json)} -->`,
      placeholder: markdown === null ? id : null,
    });
  });
  return blocks;
}

const joinBlocks = (blocks) => blocks.map((b) => b.markdown).join("\n\n");

/** Splits Markdown at blank lines outside fences. Each keep line stands alone. */
function chunks(markdown) {
  const out = [];
  let current = [];
  let inFence = false;
  const flush = () => {
    if (current.length) out.push(current.join("\n"));
    current = [];
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (!inFence && KEEP_MENTION.test(line)) {
      flush();
      out.push(line.trim());
      continue;
    }
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return out;
}

function parseBlocks(markdown, base, scratch) {
  const placeholders = new Map(base.filter((b) => b.placeholder !== null).map((b) => [b.placeholder, b]));
  const used = new Set();
  const blocks = [];
  for (const chunk of chunks(markdown)) {
    if (KEEP_MENTION.test(chunk)) {
      const match = chunk.match(KEEP_LINE);
      const id = match ? Number(match[1]) : null;
      const original = placeholders.get(id);
      if (!original || used.has(id)) {
        throw new ExchangeError(
          "PLACEHOLDER_CHANGED",
          "a <!-- tradstry:keep … --> line was altered, duplicated or invented; leave each one exactly as read, or delete it to remove that block",
        );
      }
      used.add(id);
      blocks.push({ json: original.json, key: original.key, markdown: original.markdown, placeholder: id });
      continue;
    }
    for (const json of scratch.toBlocks(chunk)) {
      const markdown = scratch.toMarkdown(json);
      blocks.push({ json, key: markdown, markdown, placeholder: null });
    }
  }
  return blocks;
}

/** Aligns two key lists: a sequence of keep / delete / insert steps. */
export function align(oldKeys, newKeys) {
  let start = 0;
  while (start < oldKeys.length && start < newKeys.length && oldKeys[start] === newKeys[start]) start++;
  let endOld = oldKeys.length;
  let endNew = newKeys.length;
  while (endOld > start && endNew > start && oldKeys[endOld - 1] === newKeys[endNew - 1]) {
    endOld--;
    endNew--;
  }

  const n = endOld - start;
  const m = endNew - start;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        oldKeys[start + i] === newKeys[start + j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const steps = [];
  for (let k = 0; k < start; k++) steps.push({ op: "keep", old: k, new: k });
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldKeys[start + i] === newKeys[start + j]) {
      steps.push({ op: "keep", old: start + i, new: start + j });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      steps.push({ op: "insert", new: start + j });
      j++;
    } else {
      steps.push({ op: "delete", old: start + i });
      i++;
    }
  }
  for (let k = 0; k < oldKeys.length - endOld; k++) {
    steps.push({ op: "keep", old: endOld + k, new: endNew + k });
  }
  return pairReplacements(steps);
}

/** Within each gap between kept blocks, pair deletes with inserts as replacements. */
function pairReplacements(steps) {
  const out = [];
  let deletes = [];
  let inserts = [];
  const flush = () => {
    const paired = Math.min(deletes.length, inserts.length);
    for (let k = 0; k < paired; k++) out.push({ op: "replace", old: deletes[k], new: inserts[k] });
    for (const old of deletes.slice(paired)) out.push({ op: "delete", old });
    for (const n of inserts.slice(paired)) out.push({ op: "insert", new: n });
    deletes = [];
    inserts = [];
  };
  for (const step of steps) {
    if (step.op === "delete") deletes.push(step.old);
    else if (step.op === "insert") inserts.push(step.new);
    else {
      flush();
      out.push(step);
    }
  }
  flush();
  return out;
}

function countOccurrences(text, needle) {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) count++;
  return count;
}

const preview = (text) => JSON.stringify(text.length > 60 ? `${text.slice(0, 60)}…` : text);

/** The whole note as it should read after `edit`, in Tradstry Markdown. */
function targetMarkdown(base, edit) {
  const current = joinBlocks(base);
  switch (edit?.kind) {
    case "rewrite":
      return edit.markdown;
    case "append":
      return current ? `${current}\n\n${edit.markdown}` : edit.markdown;
    case "replaceText": {
      if (!Array.isArray(edit.edits) || edit.edits.length === 0) {
        throw new ExchangeError("INVALID_EDIT", "replaceText needs at least one edit");
      }
      let text = current;
      for (const { old: oldText, new: newText } of edit.edits) {
        if (!oldText) throw new ExchangeError("INVALID_EDIT", "old text must not be empty");
        const count = countOccurrences(text, oldText);
        if (count === 0) throw new ExchangeError("TEXT_NOT_FOUND", preview(oldText));
        if (count > 1) {
          throw new ExchangeError("TEXT_AMBIGUOUS", `${preview(oldText)} appears ${count} times; include more surrounding text`);
        }
        text = text.replace(oldText, () => newText ?? "");
      }
      return text;
    }
    case "setTitle": {
      const title = String(edit.title ?? "").replace(/\s+/g, " ").trim();
      if (!title) throw new ExchangeError("INVALID_EDIT", "title must not be empty");
      const heading = `# ${title}`;
      const h1 = base.findIndex((b) => b.json.type === "heading" && b.json.tag === "h1");
      if (h1 === -1) return current ? `${heading}\n\n${current}` : heading;
      return joinBlocks(base.map((b, i) => (i === h1 ? { markdown: heading } : b)));
    }
    default:
      throw new ExchangeError("INVALID_EDIT", `unknown edit ${edit?.kind}`);
  }
}

function revisionOf(doc) {
  return createHash("sha256").update(Y.encodeStateVector(doc)).digest("base64url").slice(0, 22);
}

function bindDocument(updates) {
  const editor = newEditor();
  const doc = new Y.Doc();
  const binding = createBinding(editor, provider, DOC_ID, doc, new Map([[DOC_ID, doc]]));
  binding.root
    .getSharedType()
    .observeDeep((events) => syncYjsChangesToLexical(binding, provider, events, false));
  for (const update of updates) Y.applyUpdate(doc, update);
  // Without a discrete pass the editor state stays empty despite the Y.Doc being full.
  editor.update(() => {}, { discrete: true });
  return { editor, doc, binding };
}

function recordChanges(editor, doc, binding) {
  const produced = [];
  doc.on("update", (bytes) => produced.push(bytes));
  // Registered only after hydration: earlier, replaying history into Lexical would
  // echo straight back into the Y.Doc and duplicate the document.
  editor.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      syncLexicalUpdateToYjs(
        binding,
        provider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      );
    },
  );
  return produced;
}

function rootJsonOf(editor) {
  return editor.getEditorState().toJSON().root;
}

function referencesIn(rootJson) {
  const media = new Set();
  const trades = new Set();
  walk(rootJson, (node) => {
    if (node.type === "notebook-image" || node.type === "notebook-video") media.add(node.hash);
    if (node.type === "linked-trade") trades.add(node.tradeId);
    if (node.type === "trade-table") for (const id of node.tradeIds ?? []) trades.add(id);
  });
  return { media: [...media], trades: [...trades] };
}

function documentView(rootJson, scratch) {
  const blocks = exportBlocks(rootJson, scratch);
  return {
    markdown: joinBlocks(blocks),
    placeholders: blocks.filter((b) => b.placeholder !== null).length,
    blocks,
  };
}

const decodeUpdates = (updates) =>
  (updates ?? []).map((u) => (typeof u === "string" ? new Uint8Array(Buffer.from(u, "base64")) : u));

/** The note as the assistant reads it. */
export function exportNote({ updates, context }) {
  const decoded = decodeUpdates(updates);
  if (decoded.length === 0) throw new Error("exportNote: note has no updates");
  const { editor, doc } = bindDocument(decoded);
  const rootJson = rootJsonOf(editor);
  const refs = new References(context);
  refs.adoptDocument(rootJson);
  const view = documentView(rootJson, new Scratch(exchangeTransformers(refs)));
  return {
    markdown: view.markdown,
    placeholders: view.placeholders,
    revision: revisionOf(doc),
    references: referencesIn(rootJson),
  };
}

/** A new note's `document_json` from Tradstry Markdown. */
export function markdownToDocument({ markdown, context }) {
  const refs = new References(context);
  const scratch = new Scratch(exchangeTransformers(refs));
  if (KEEP_MENTION.test(markdown)) {
    throw new ExchangeError("PLACEHOLDER_CHANGED", "a new note cannot contain <!-- tradstry:keep … --> lines");
  }
  const children = chunks(markdown).flatMap((chunk) => scratch.toBlocks(chunk));
  const editor = newEditor();
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      for (const json of children) root.append($parseSerializedNode(json));
      if (root.getChildrenSize() === 0) root.append($createParagraphNode());
    },
    { discrete: true },
  );
  const rootJson = rootJsonOf(editor);
  return {
    documentJson: JSON.stringify({ root: rootJson }),
    references: referencesIn(rootJson),
  };
}

/**
 * Applies `edit` to a CRDT note, changing only the blocks that differ. Returns the
 * incremental Yjs update to append (null when nothing changed) and the result.
 */
export function editNote({ updates, edit, expectedRevision, context }) {
  const decoded = decodeUpdates(updates);
  if (decoded.length === 0) throw new Error("editNote: note has no updates");
  const { editor, doc, binding } = bindDocument(decoded);
  const baseRevision = revisionOf(doc);
  if (expectedRevision && expectedRevision !== baseRevision) {
    throw new ExchangeError("CONFLICT", "the note changed since it was read; read it again");
  }

  const baseRoot = rootJsonOf(editor);
  const refs = new References(context);
  refs.adoptDocument(baseRoot);
  const scratch = new Scratch(exchangeTransformers(refs));
  const base = exportBlocks(baseRoot, scratch);
  const target = parseBlocks(targetMarkdown(base, edit), base, scratch);
  const steps = align(
    base.map((b) => b.key),
    target.map((b) => b.key),
  );

  const changes = { kept: 0, changed: 0, inserted: 0, removed: 0 };
  const formattingLost = new Set();
  const deleted = new Set();
  for (const step of steps) {
    if (step.op === "keep") changes.kept++;
    if (step.op === "replace") changes.changed++;
    if (step.op === "insert") changes.inserted++;
    if (step.op === "delete") {
      changes.removed++;
      deleted.add(step.old);
    }
  }

  const produced = recordChanges(editor, doc, binding);
  if (changes.changed + changes.inserted + changes.removed > 0) {
    editor.update(
      () => {
        const root = $getRoot();
        const nodes = root.getChildren();
        const nodeOf = (blockIndex) => nodes[base[blockIndex].nodeIndex];

        // Spacing between two blocks that are both going away goes with them.
        const visibleAt = new Map(base.map((b, i) => [b.nodeIndex, i]));
        const strandedSpacing = [];
        let previous = null;
        nodes.forEach((node, nodeIndex) => {
          if (visibleAt.has(nodeIndex)) {
            previous = visibleAt.get(nodeIndex);
            return;
          }
          if (previous === null || !deleted.has(previous)) return;
          const next = base.findIndex((b) => b.nodeIndex > nodeIndex);
          if (next !== -1 && deleted.has(next)) strandedSpacing.push(node);
        });

        let cursor = null;
        const place = (node) => {
          if (cursor) cursor.insertAfter(node);
          else if (root.getFirstChild()) root.getFirstChild().insertBefore(node);
          else root.append(node);
          cursor = node;
        };

        for (const step of steps) {
          if (step.op === "keep") {
            cursor = nodeOf(step.old);
          } else if (step.op === "delete") {
            nodeOf(step.old).remove();
          } else if (step.op === "insert") {
            place($parseSerializedNode(target[step.new].json));
          } else {
            const old = base[step.old];
            const replacement = $parseSerializedNode(carryAttributes(old.json, target[step.new].json));
            for (const lost of formattingOf(old.json)) formattingLost.add(lost);
            nodeOf(step.old).replace(replacement);
            cursor = replacement;
          }
        }
        for (const node of strandedSpacing) node.remove();
        if (root.getChildrenSize() === 0) root.append($createParagraphNode());
      },
      { discrete: true },
    );
  }

  const afterRoot = rootJsonOf(editor);
  const after = documentView(afterRoot, scratch);
  return {
    update: produced.length ? Y.mergeUpdates(produced) : null,
    baseRevision,
    revision: revisionOf(doc),
    markdown: after.markdown,
    placeholders: after.placeholders,
    documentJson: JSON.stringify(stripGhostText({ root: afterRoot })),
    changes,
    formattingLost: [...formattingLost],
    references: referencesIn(afterRoot),
  };
}

/** Alignment, indent and direction survive a same-type rewrite; so do table widths. */
function carryAttributes(oldJson, newJson) {
  if (oldJson.type !== newJson.type) return newJson;
  const carried = { ...newJson };
  for (const key of ["format", "indent", "direction"]) {
    if (key in oldJson) carried[key] = oldJson[key];
  }
  if (
    newJson.type === "table" &&
    Array.isArray(oldJson.colWidths) &&
    oldJson.colWidths.length === (newJson.children?.[0]?.children?.length ?? -1)
  ) {
    carried.colWidths = oldJson.colWidths;
  }
  return carried;
}

async function main() {
  const chunksIn = [];
  for await (const chunk of process.stdin) chunksIn.push(chunk);
  const input = JSON.parse(Buffer.concat(chunksIn).toString("utf8"));
  try {
    if (input.op === "export") {
      process.stdout.write(JSON.stringify(exportNote(input)));
    } else if (input.op === "create") {
      process.stdout.write(JSON.stringify(markdownToDocument(input)));
    } else if (input.op === "edit") {
      const result = editNote(input);
      process.stdout.write(
        JSON.stringify({
          ...result,
          update: result.update ? Buffer.from(result.update).toString("base64") : null,
        }),
      );
    } else {
      throw new Error(`exchange.mjs: unknown op ${input.op}`);
    }
  } catch (e) {
    if (!(e instanceof ExchangeError)) throw e;
    process.stdout.write(JSON.stringify({ error: { code: e.code, message: e.message } }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(String(e?.stack ?? e) + "\n");
    process.exit(1);
  });
}

