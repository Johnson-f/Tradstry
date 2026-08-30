import { expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { withDOM } from "@lexical/headless/dom";
import {
  $createTableNodeWithDimensions,
  type TableRowNode,
} from "@lexical/table";
import { NODES } from "@tradstry/notebook-core";
import { $getRoot } from "lexical";
import {
  $resizeTableColumn,
  $resizeTableRow,
  applyTableColumnWidths,
  clampTableSize,
} from "./table-resize";

function setup(
  run: (table: ReturnType<typeof $createTableNodeWithDimensions>) => void,
) {
  const editor = createHeadlessEditor({
    nodes: NODES,
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      const table = $createTableNodeWithDimensions(3, 3, true);
      $getRoot().append(table);
      run(table);
    },
    { discrete: true },
  );
  return editor;
}

test("column resize initializes widths once and preserves other columns", () => {
  setup((table) => {
    expect($resizeTableColumn(table.getKey(), 1, 250, [100, 120, 140])).toBe(
      true,
    );
    expect(table.getColWidths()).toEqual([100, 250, 140]);
    expect($resizeTableColumn(table.getKey(), 0, 180, [110, 110, 110])).toBe(
      true,
    );
    expect(table.getColWidths()).toEqual([180, 250, 140]);
  });
});

test("resizing clamps extreme sizes and rejects stale or invalid targets", () => {
  setup((table) => {
    expect(clampTableSize(0, "column")).toBe(64);
    expect(clampTableSize(5, "row")).toBe(36);
    expect(clampTableSize(99999, "row")).toBe(1200);
    expect($resizeTableColumn(table.getKey(), 0, 12, [100, 100, 100])).toBe(
      true,
    );
    expect(table.getColWidths()?.[0]).toBe(64);
    expect($resizeTableColumn(table.getKey(), 3, 100, [100, 100, 100])).toBe(
      false,
    );
    expect($resizeTableColumn(table.getKey(), 1, 100, [100, 100])).toBe(false);
    expect($resizeTableColumn(table.getKey(), 1, NaN, [100, 100, 100])).toBe(
      false,
    );
    table.remove();
    expect($resizeTableColumn(table.getKey(), 1, 100, [100, 100, 100])).toBe(
      false,
    );
  });
});

test("row heights belong to the requested table and round-trip with column widths", () => {
  const original = setup((table) => {
    const row = table.getFirstChild<TableRowNode>();
    if (!row) throw new Error("Missing row");
    expect($resizeTableRow(table.getKey(), row.getKey(), 96)).toBe(true);
    expect(row.getHeight()).toBe(96);
    expect($resizeTableRow(table.getKey(), table.getKey(), 96)).toBe(false);
    const other = $createTableNodeWithDimensions(1, 1);
    $getRoot().append(other);
    expect($resizeTableRow(other.getKey(), row.getKey(), 200)).toBe(false);
    $resizeTableColumn(table.getKey(), 2, 240, [100, 100, 100]);
  });
  const saved = original.getEditorState().toJSON();
  const reopened = createHeadlessEditor({
    nodes: NODES,
    onError(error) {
      throw error;
    },
  });
  reopened.setEditorState(reopened.parseEditorState(JSON.stringify(saved)));
  expect(reopened.getEditorState().toJSON()).toEqual(saved);
});

test("frame width follows resized columns and returns to automatic sizing on undo", () => {
  withDOM(({ document }) => {
    const table = document.createElement("table");
    const frame = document.createElement("div");
    applyTableColumnWidths(table, frame, [114, 111, 256]);
    expect(table.style.width).toBe("481px");
    expect(frame.style.width).toBe("483px");
    applyTableColumnWidths(table, frame, [80, 90, 100]);
    expect(frame.style.width).toBe("272px");
    applyTableColumnWidths(table, frame, undefined);
    expect(table.style.width).toBe("");
    expect(frame.style.width).toBe("");
    expect(table.style.tableLayout).toBe("");
  });
});

test("resizing a middle row leaves every other height and column width unchanged", () => {
  setup((table) => {
    const rows = table.getChildren<TableRowNode>();
    rows[0].setHeight(54);
    rows[2].setHeight(72);
    table.setColWidths([114, 111, 256]);
    expect($resizeTableRow(table.getKey(), rows[1].getKey(), 120)).toBe(true);
    expect(rows.map((row) => row.getHeight())).toEqual([54, 120, 72]);
    expect(table.getColWidths()).toEqual([114, 111, 256]);
    $resizeTableRow(table.getKey(), rows[1].getKey(), 40);
    expect(rows.map((row) => row.getHeight())).toEqual([54, 40, 72]);
  });
});
