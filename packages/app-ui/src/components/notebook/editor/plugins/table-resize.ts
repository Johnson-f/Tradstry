import { $isTableNode, $isTableRowNode } from "@lexical/table";
import { $getNodeByKey, type NodeKey } from "lexical";

export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 1200;
export const MIN_ROW_HEIGHT = 36;
export const MAX_ROW_HEIGHT = 1200;

export function applyTableColumnWidths(
  table: HTMLTableElement,
  frame: HTMLElement,
  widths: readonly number[] | undefined,
) {
  const width = widths?.reduce((sum, value) => sum + value, 0);
  table.style.width = width ? `${width}px` : "";
  table.style.tableLayout = width ? "fixed" : "";
  frame.style.width = width ? `${width + 2}px` : "";
}

export function clampTableSize(value: number, dimension: "column" | "row") {
  const min = dimension === "column" ? MIN_COLUMN_WIDTH : MIN_ROW_HEIGHT;
  const max = dimension === "column" ? MAX_COLUMN_WIDTH : MAX_ROW_HEIGHT;
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function $resizeTableColumn(
  tableKey: NodeKey,
  index: number,
  width: number,
  measuredWidths: number[],
) {
  const table = $getNodeByKey(tableKey);
  if (!$isTableNode(table) || !table.isAttached() || !Number.isFinite(width))
    return false;
  const count = table.getColumnCount();
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= count ||
    measuredWidths.length !== count
  )
    return false;
  const saved = table.getColWidths();
  const widths = saved?.length === count ? [...saved] : [...measuredWidths];
  if (widths.some((value) => !Number.isFinite(value) || value <= 0))
    return false;
  widths[index] = clampTableSize(width, "column");
  table.setColWidths(widths);
  return true;
}

export function $resizeTableRow(
  tableKey: NodeKey,
  rowKey: NodeKey,
  height: number,
) {
  const table = $getNodeByKey(tableKey);
  const row = $getNodeByKey(rowKey);
  if (
    !$isTableNode(table) ||
    !table.isAttached() ||
    !$isTableRowNode(row) ||
    row.getParent()?.getKey() !== tableKey ||
    !Number.isFinite(height)
  )
    return false;
  row.setHeight(clampTableSize(height, "row"));
  return true;
}
