import { expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableRowNode,
} from "@lexical/table";
import { NODES, NotebookImageNode } from "@tradstry/notebook-core";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $setSelection,
} from "lexical";
import {
  $appendTableDimension,
  $applyTableAction,
  $captureTableSelection,
  $deleteNotebookTable,
  $deleteTableDimensionAtCell,
  $getSelectedTable,
  $hasTableHeader,
  $insertNotebookTable,
  $restoreTableSelection,
} from "./table-actions";

function editor() {
  return createHeadlessEditor({
    nodes: NODES,
    onError: (error) => {
      throw error;
    },
  });
}

function inEditor(run: () => void) {
  const instance = editor();
  instance.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().append(paragraph);
      paragraph.select();
      run();
    },
    { discrete: true },
  );
  return instance;
}

test("inserts the selected dimensions with only a header row and a following paragraph", () => {
  inEditor(() => {
    expect($insertNotebookTable(3, 4, true)).toBe(true);
    const table = $getSelectedTable();
    expect(table?.getChildrenSize()).toBe(3);
    expect(table?.getFirstChild<TableRowNode>()?.getChildrenSize()).toBe(4);
    expect($hasTableHeader()).toBe(true);
    expect($getRoot().getLastChild()?.getType()).toBe("paragraph");
    const row = table?.getLastChild();
    const cell = $isTableRowNode(row) ? row.getFirstChild() : null;
    expect($isTableCellNode(cell) && cell.getHeaderStyles()).toBe(0);
    expect($insertNotebookTable(2, 2, false)).toBe(false);
  });
});

test("rejects invalid or excessive dimensions without changing the document", () => {
  inEditor(() => {
    for (const [rows, columns] of [
      [0, 2],
      [2, 0],
      [51, 2],
      [2, 13],
      [1.5, 2],
      [NaN, 2],
    ]) {
      expect($insertNotebookTable(rows, columns, false)).toBe(false);
    }
    expect($getRoot().getChildrenSize()).toBe(1);
  });
});

test("row, column and header actions edit the selected table", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, false);
    const table = $getSelectedTable();
    if (!table) throw new Error("Missing table");
    $applyTableAction("row-below");
    $applyTableAction("column-right");
    expect(table.getChildrenSize()).toBe(3);
    expect(table.getFirstChild<TableRowNode>()?.getChildrenSize()).toBe(3);
    $applyTableAction("toggle-header");
    expect($hasTableHeader()).toBe(true);
    $applyTableAction("toggle-header");
    expect($hasTableHeader()).toBe(false);
    $applyTableAction("delete-row");
    expect(table.getChildrenSize()).toBe(2);
    $applyTableAction("delete-column");
    expect(table.getFirstChild<TableRowNode>()?.getChildrenSize()).toBe(2);
    $applyTableAction("delete-table");
    expect($getRoot().getChildren().some($isTableNode)).toBe(false);
  });
});

test("direct table deletion targets the clicked table even when the cursor is elsewhere", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, false);
    const first = $getSelectedTable();
    if (!first) throw new Error("Missing first table");
    $getRoot().getLastChildOrThrow().selectEnd();
    $insertNotebookTable(3, 3, true);
    const second = $getSelectedTable();
    if (!second) throw new Error("Missing second table");
    const secondJSON = second.exportJSON();

    expect($deleteNotebookTable(first.getKey())).toBe(true);
    expect(first.isAttached()).toBe(false);
    expect(second.isAttached()).toBe(true);
    expect(second.exportJSON()).toEqual(secondJSON);
    expect($deleteNotebookTable(first.getKey())).toBe(false);
    expect($deleteNotebookTable($getRoot().getKey())).toBe(false);
  });
});

test("deleting the only table leaves a paragraph ready for typing", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, false);
    const table = $getSelectedTable();
    if (!table) throw new Error("Missing table");
    for (const node of $getRoot().getChildren()) {
      if (!node.is(table)) node.remove();
    }

    expect($deleteNotebookTable(table.getKey())).toBe(true);
    expect($getRoot().getChildrenSize()).toBe(1);
    const paragraph = $getRoot().getFirstChildOrThrow();
    expect(paragraph.getType()).toBe("paragraph");
    expect(
      $getSelection()?.getNodes().some((node) => node.is(paragraph)),
    ).toBe(true);
  });
});

test("deleting a final row or column leaves an editable document", () => {
  for (const action of ["delete-row", "delete-column"] as const) {
    inEditor(() => {
      $insertNotebookTable(1, 1, true);
      expect($applyTableAction(action)).toBe(true);
      expect($getRoot().getChildren().some($isTableNode)).toBe(false);
      expect($getRoot().getLastChild()?.getType()).toBe("paragraph");
    });
  }
});

test("saved selections cannot edit a table removed while a menu is open", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, true);
    const selection = $getSelection()?.clone() ?? null;
    expect($restoreTableSelection(selection)).toBe(true);
    $applyTableAction("delete-table");
    expect($restoreTableSelection(selection)).toBe(false);
    expect($applyTableAction("row-below")).toBe(false);
  });
});

test("tables reopen with cell text, formatting, headers and dimensions intact", () => {
  const original = inEditor(() => {
    $insertNotebookTable(3, 2, true);
    const cell = $getSelectedTable()
      ?.getFirstChild<TableRowNode>()
      ?.getFirstChild();
    if (!$isTableCellNode(cell)) throw new Error("Missing cell");
    cell
      .clear()
      .append(
        $createParagraphNode().append(
          $createTextNode("Setup").toggleFormat("bold"),
        ),
      );
  });
  const json = original.getEditorState().toJSON();
  const reopened = editor();
  reopened.setEditorState(reopened.parseEditorState(JSON.stringify(json)));
  expect(reopened.getEditorState().toJSON()).toEqual(json);
});

test("a slash query selection remains usable after the empty query text is normalized away", () => {
  let saved: ReturnType<typeof $getSelection> = null;
  const instance = inEditor(() => {
    const text = $createTextNode("/table");
    const paragraph = $createParagraphNode().append(text);
    $getRoot().append(paragraph);
    text.selectStart();
    text.setTextContent("");
    saved = $captureTableSelection();
  });
  instance.update(
    () => {
      expect($restoreTableSelection(saved)).toBe(true);
      expect($insertNotebookTable(3, 3, true)).toBe(true);
    },
    { discrete: true },
  );
});

test("inserting after a selected image preserves the image", () => {
  inEditor(() => {
    const image = NotebookImageNode.importJSON({
      type: "notebook-image",
      version: 2,
      hash: "test",
      altText: "Chart",
      width: 640,
      height: 480,
    });
    $getRoot().append(image);
    const selection = $createNodeSelection();
    selection.add(image.getKey());
    $setSelection(selection);
    expect($restoreTableSelection($captureTableSelection())).toBe(true);
    expect($insertNotebookTable(2, 2, true)).toBe(true);
    expect(image.isAttached()).toBe(true);
    expect($isTableNode(image.getNextSibling())).toBe(true);
  });
});

test("edge buttons append at the end, regardless of the currently selected cell", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, true);
    const table = $getSelectedTable();
    if (!table) throw new Error("Missing table");
    const firstRow = table.getFirstChild<TableRowNode>();
    const firstCell = firstRow?.getFirstChild();
    if (!$isTableCellNode(firstCell)) throw new Error("Missing cell");
    firstCell
      .clear()
      .append($createParagraphNode().append($createTextNode("Keep me")));
    firstCell.selectStart();
    expect($appendTableDimension(table.getKey(), "row")).toBe(true);
    expect(table.getChildrenSize()).toBe(3);
    expect(table.getFirstChild()?.is(firstRow)).toBe(true);
    const lastCell = table.getLastChild<TableRowNode>()?.getFirstChild();
    expect($isTableCellNode(lastCell) && lastCell.getHeaderStyles()).toBe(0);
    firstCell.selectStart();
    expect($appendTableDimension(table.getKey(), "column")).toBe(true);
    expect(firstRow?.getChildrenSize()).toBe(3);
    expect(firstRow?.getFirstChild()?.is(firstCell)).toBe(true);
    expect(firstCell.getTextContent()).toBe("Keep me");
  });
});

test("an edge button targets its own table and safely ignores a removed table", () => {
  inEditor(() => {
    $insertNotebookTable(2, 2, false);
    const first = $getSelectedTable();
    if (!first) throw new Error("Missing first table");
    $getRoot().getLastChildOrThrow().selectEnd();
    $insertNotebookTable(3, 3, false);
    const second = $getSelectedTable();
    if (!second) throw new Error("Missing second table");
    expect($appendTableDimension(first.getKey(), "column")).toBe(true);
    expect(first.getFirstChild<TableRowNode>()?.getChildrenSize()).toBe(3);
    expect(second.getChildrenSize()).toBe(3);
    expect(second.getFirstChild<TableRowNode>()?.getChildrenSize()).toBe(3);
    first.remove();
    expect($appendTableDimension(first.getKey(), "row")).toBe(false);
  });
});

test("context-menu deletion removes the clicked row, not the previous cursor row", () => {
  inEditor(() => {
    $insertNotebookTable(3, 3, true);
    const table = $getSelectedTable();
    if (!table) throw new Error("Missing table");
    const first = table.getFirstChild<TableRowNode>();
    const last = table.getLastChild<TableRowNode>();
    const target = last?.getFirstChild();
    if (!first || !last || !target) throw new Error("Missing row");
    expect(
      $deleteTableDimensionAtCell(table.getKey(), target.getKey(), "row"),
    ).toBe(true);
    expect(table.getChildrenSize()).toBe(2);
    expect(first.isAttached()).toBe(true);
    expect(last.isAttached()).toBe(false);
  });
});

test("context-menu column deletion preserves remaining widths and row heights", () => {
  inEditor(() => {
    $insertNotebookTable(3, 3, true);
    const table = $getSelectedTable();
    if (!table) throw new Error("Missing table");
    table.setColWidths([100, 180, 240]);
    const row = table.getLastChild<TableRowNode>();
    row?.setHeight(96);
    const target = row?.getChildAtIndex(1);
    if (!row || !target) throw new Error("Missing cell");
    expect(
      $deleteTableDimensionAtCell(table.getKey(), target.getKey(), "column"),
    ).toBe(true);
    expect(table.getColWidths()).toEqual([100, 240]);
    expect(row.getChildrenSize()).toBe(2);
    expect(row.getHeight()).toBe(96);
    expect(
      $deleteTableDimensionAtCell(table.getKey(), target.getKey(), "row"),
    ).toBe(false);
  });
});
