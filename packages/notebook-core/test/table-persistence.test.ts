import { expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  type TableRowNode,
} from "@lexical/table";
import {
  createBinding,
  type Provider,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import * as Y from "yjs";
import { DOC_ID, NAMESPACE } from "../src/contract";
import { MARKDOWN_TRANSFORMERS, NODES } from "../src/nodes";
import { jsonToUpdate } from "../src/seed";

function makeEditor() {
  return createHeadlessEditor({
    namespace: NAMESPACE,
    nodes: NODES,
    onError(error) {
      throw error;
    },
  });
}

test("table text, headers and formatting survive the saved Yjs update path", () => {
  const original = makeEditor();
  original.update(
    () => {
      const table = $createTableNodeWithDimensions(3, 4, {
        rows: true,
        columns: false,
      });
      table.setColWidths([180, 96, 240, 120]);
      table.getFirstChild<TableRowNode>()?.setHeight(88);
      $getRoot().append($createParagraphNode(), table, $createParagraphNode());
      const cell = table.getFirstChild<TableRowNode>()?.getFirstChild();
      if (!$isTableCellNode(cell)) throw new Error("Missing table cell");
      cell
        .clear()
        .append(
          $createParagraphNode().append(
            $createTextNode("Review | lesson").toggleFormat("bold"),
          ),
        );
    },
    { discrete: true },
  );
  const json = original.getEditorState().toJSON();
  const { update } = jsonToUpdate(JSON.stringify(json));
  const doc = new Y.Doc();
  const reopened = makeEditor();
  const provider: Provider = {
    awareness: {
      getLocalState: () => null,
      getStates: () => new Map(),
      on() {},
      off() {},
      setLocalState() {},
      setLocalStateField() {},
    },
    connect() {},
    disconnect() {},
    on() {},
    off() {},
  };
  const binding = createBinding(
    reopened,
    provider,
    DOC_ID,
    doc,
    new Map([[DOC_ID, doc]]),
  );
  binding.root
    .getSharedType()
    .observeDeep((events) =>
      syncYjsChangesToLexical(binding, provider, events, false),
    );
  Y.applyUpdate(doc, update);
  reopened.update(() => {}, { discrete: true });
  expect(reopened.getEditorState().toJSON()).toEqual(json);
  doc.destroy();
});

test("ordinary header tables survive markdown export and import", () => {
  const original = makeEditor();
  const markdown =
    "| Setup | Review |\n| --- | --- |\n| **Breakout** | Followed the plan |";
  original.update(
    () => $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS),
    { discrete: true },
  );
  const exported = original
    .getEditorState()
    .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS));
  const reopened = makeEditor();
  reopened.update(
    () => $convertFromMarkdownString(exported, MARKDOWN_TRANSFORMERS),
    { discrete: true },
  );
  expect(reopened.getEditorState().toJSON()).toEqual(
    original.getEditorState().toJSON(),
  );
});
