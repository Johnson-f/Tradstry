import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findTableNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $isTableSelection,
  TableCellHeaderStates,
} from "@lexical/table";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type BaseSelection,
  createCommand,
  type NodeKey,
} from "lexical";

export const OPEN_TABLE_PICKER_COMMAND =
  createCommand<void>("OPEN_TABLE_PICKER");
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;

export type TableAction =
  | "row-above"
  | "row-below"
  | "column-left"
  | "column-right"
  | "delete-row"
  | "delete-column"
  | "toggle-header"
  | "delete-table";

export function $captureTableSelection(selection = $getSelection()) {
  const saved = selection?.clone() ?? null;
  if ($isNodeSelection(saved)) {
    const nodes = saved.getNodes();
    const lastNode = nodes[nodes.length - 1];
    const parent = lastNode?.getParent();
    if (!parent) return null;
    const insertion = $createRangeSelection();
    const offset = lastNode.getIndexWithinParent() + 1;
    insertion.anchor.set(parent.getKey(), offset, "element");
    insertion.focus.set(parent.getKey(), offset, "element");
    return insertion;
  }
  if ($isRangeSelection(saved)) {
    for (const point of [saved.anchor, saved.focus]) {
      const node = point.getNode();
      if ($isTextNode(node) && node.getTextContentSize() === 0) {
        // Clearing /table removes its text node during normalization; the paragraph survives.
        const parent = node.getParent();
        if (parent)
          point.set(parent.getKey(), node.getIndexWithinParent(), "element");
      }
    }
  }
  return saved;
}

export function $restoreTableSelection(
  selection: BaseSelection | null,
): boolean {
  if (!$isRangeSelection(selection) && !$isTableSelection(selection))
    return false;
  const anchor = $getNodeByKey(selection.anchor.key);
  const focus = $getNodeByKey(selection.focus.key);
  if (!anchor?.isAttached() || !focus?.isAttached()) return false;
  const restored = selection.clone();
  if ($isRangeSelection(restored)) {
    for (const point of [restored.anchor, restored.focus]) {
      const node = point.getNode();
      const size = $isElementNode(node)
        ? node.getChildrenSize()
        : node.getTextContentSize();
      point.offset = Math.min(point.offset, size);
    }
  }
  $setSelection(restored);
  return true;
}

export function $getSelectedTable() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) && !$isTableSelection(selection))
    return null;
  const table = $findTableNode(selection.anchor.getNode());
  const focusTable = $findTableNode(selection.focus.getNode());
  return table && focusTable?.is(table) ? table : null;
}

export function $hasTableHeader() {
  const row = $getSelectedTable()?.getFirstChild();
  return (
    $isTableRowNode(row) &&
    row
      .getChildren()
      .every(
        (cell) =>
          $isTableCellNode(cell) &&
          cell.hasHeaderState(TableCellHeaderStates.ROW),
      )
  );
}

export function $insertNotebookTable(
  rows: number,
  columns: number,
  header: boolean,
) {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    rows > MAX_TABLE_ROWS ||
    columns < 1 ||
    columns > MAX_TABLE_COLUMNS
  )
    return false;
  const selection = $getSelection();
  if ($isTableSelection(selection)) return false;
  if (
    $isRangeSelection(selection) &&
    ($findTableNode(selection.anchor.getNode()) ||
      $findTableNode(selection.focus.getNode()))
  )
    return false;

  const table = $createTableNodeWithDimensions(rows, columns, {
    rows: header,
    columns: false,
  });
  $insertNodeToNearestRoot(table);
  if ($getRoot().getLastChild()?.is(table))
    table.insertAfter($createParagraphNode());
  const firstRow = table.getFirstChild();
  const firstCell = $isTableRowNode(firstRow) ? firstRow.getFirstChild() : null;
  if ($isTableCellNode(firstCell)) firstCell.selectStart();
  return true;
}

export function $applyTableAction(action: TableAction) {
  const table = $getSelectedTable();
  if (!table) return false;

  switch (action) {
    case "row-above":
    case "row-below":
      $insertTableRowAtSelection(action === "row-below");
      break;
    case "column-left":
    case "column-right":
      $insertTableColumnAtSelection(action === "column-right");
      break;
    case "delete-row":
      $deleteTableRowAtSelection();
      break;
    case "delete-column":
      $deleteTableColumnAtSelection();
      break;
    case "toggle-header": {
      const header = !$hasTableHeader();
      const row = table.getFirstChild();
      if ($isTableRowNode(row)) {
        for (const cell of row.getChildren()) {
          if ($isTableCellNode(cell))
            cell.setHeaderStyles(
              header
                ? TableCellHeaderStates.ROW
                : TableCellHeaderStates.NO_STATUS,
              TableCellHeaderStates.ROW,
            );
        }
      }
      break;
    }
    case "delete-table":
      return $deleteNotebookTable(table.getKey());
  }
  return true;
}

export function $deleteNotebookTable(tableKey: NodeKey) {
  const table = $getNodeByKey(tableKey);
  if (!$isTableNode(table) || !table.isAttached()) return false;
  if (!table.getNextSibling()) table.insertAfter($createParagraphNode());
  table.selectNext();
  table.remove();
  return true;
}

export function $appendTableDimension(
  tableKey: NodeKey,
  dimension: "row" | "column",
) {
  const table = $getNodeByKey(tableKey);
  if (!$isTableNode(table) || !table.isAttached()) return false;
  const [grid] = $computeTableMapSkipCellCheck(table, null, null);
  const edge =
    dimension === "row"
      ? grid[grid.length - 1]?.[0]
      : grid[0]?.[grid[0].length - 1];
  if (!edge) return false;
  edge.cell.selectStart();
  if (dimension === "row") {
    const row = $insertTableRowAtSelection(true);
    const cell = row?.getFirstChild();
    if ($isTableCellNode(cell)) cell.selectStart();
  } else {
    $insertTableColumnAtSelection(true)?.selectStart();
  }
  return true;
}

export function $deleteTableDimensionAtCell(
  tableKey: NodeKey,
  cellKey: NodeKey,
  dimension: "row" | "column",
) {
  const cell = $getNodeByKey(cellKey);
  if (
    !$isTableCellNode(cell) ||
    !cell.isAttached() ||
    $findTableNode(cell)?.getKey() !== tableKey
  )
    return false;
  cell.selectStart();
  return $applyTableAction(
    dimension === "row" ? "delete-row" : "delete-column",
  );
}
