"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $isTableNode, $isTableRowNode } from "@lexical/table";
import {
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type NodeKey,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  $resizeTableColumn,
  $resizeTableRow,
  applyTableColumnWidths,
  clampTableSize,
} from "./table-resize";

type Handle = { key: string; index: number; offset: number; size: number };
type Layout = {
  columns: Handle[];
  rows: Handle[];
  width: number;
  height: number;
};
type Drag = {
  pointerId: number;
  dimension: "column" | "row";
  handle: Handle;
  start: number;
  scale: number;
  value: number;
  widths: number[];
  row: HTMLTableRowElement | null;
  restore: () => void;
};

export function TableResizeControls({
  table,
  frame,
  tableKey,
}: {
  table: HTMLTableElement;
  frame: HTMLElement;
  tableKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [layout, setLayout] = useState<Layout>({
    columns: [],
    rows: [],
    width: 0,
    height: 0,
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const scheduleRef = useRef(() => {});

  const commit = useCallback(
    (
      dimension: "column" | "row",
      handle: Handle,
      size: number,
      widths: number[],
    ) => {
      editor.update(
        () => {
          if (!editor.isEditable()) return;
          if (dimension === "column")
            $resizeTableColumn(tableKey, handle.index, size, widths);
          else $resizeTableRow(tableKey, handle.key, size);
        },
        {
          tag: [
            HISTORY_PUSH_TAG,
            SKIP_DOM_SELECTION_TAG,
            SKIP_SCROLL_INTO_VIEW_TAG,
          ],
        },
      );
    },
    [editor, tableKey],
  );

  const finish = useCallback(
    (save: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      drag.restore();
      setDragging(null);
      if (save && drag.value !== Math.round(drag.handle.size)) {
        commit(drag.dimension, drag.handle, drag.value, drag.widths);
      }
      scheduleRef.current();
    },
    [commit],
  );

  useEffect(() => {
    let animationFrame = 0;
    const measure = () => {
      animationFrame = 0;
      if (!table.isConnected) return;
      const model = editor.getEditorState().read(() => {
        const node = $getNodeByKey(tableKey);
        return $isTableNode(node)
          ? {
              widths: node.getColWidths(),
              count: node.getColumnCount(),
              rows: node
                .getChildren()
                .filter($isTableRowNode)
                .map((row) => row.getKey()),
            }
          : null;
      });
      if (!model) return;
      const drag = dragRef.current;
      if (
        drag &&
        (model.count !== drag.widths.length ||
          (drag.dimension === "row" &&
            model.rows[drag.handle.index] !== drag.handle.key))
      ) {
        finish(false);
      }
      if (!dragRef.current) {
        applyTableColumnWidths(table, frame, model.widths);
      }
      const bounds = table.getBoundingClientRect();
      const scaleX = bounds.width / table.offsetWidth || 1;
      const scaleY = bounds.height / table.offsetHeight || 1;
      const columns = [...table.querySelectorAll("colgroup > col")].map(
        (column, index) => {
          const rect = column.getBoundingClientRect();
          return {
            key: `column-${index}`,
            index,
            offset: (rect.right - bounds.left) / scaleX,
            size: rect.width / scaleX,
          };
        },
      );
      const rows = [...table.rows]
        .map((row, index) => {
          const rect = row.getBoundingClientRect();
          return {
            key: model.rows[index],
            index,
            offset: (rect.bottom - bounds.top) / scaleY,
            size: rect.height / scaleY,
          };
        })
        .filter((row) => row.key !== undefined);
      setLayout({
        columns,
        rows,
        width: table.offsetWidth,
        height: table.offsetHeight,
      });
    };
    const schedule = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(measure);
    };
    scheduleRef.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    const unregister = editor.registerUpdateListener(schedule);
    schedule();
    return () => {
      scheduleRef.current = () => {};
      unregister();
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      finish(false);
    };
  }, [editor, table, frame, tableKey, finish]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) {
        event.preventDefault();
        finish(false);
      }
    };
    const cancel = () => finish(false);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", cancel);
    };
  }, [finish]);

  useEffect(() => {
    if (!editable) finish(false);
  }, [editable, finish]);

  const start = (
    event: PointerEvent<HTMLButtonElement>,
    dimension: "column" | "row",
    handle: Handle,
  ) => {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    finish(false);
    const width = table.style.width;
    const frameWidth = frame.style.width;
    const tableLayout = table.style.tableLayout;
    const columns = [
      ...table.querySelectorAll<HTMLTableColElement>("colgroup > col"),
    ];
    const columnStyles = columns.map((column) => column.style.width);
    const row = dimension === "row" ? table.rows[handle.index] : null;
    const rowHeight = row?.style.height ?? "";
    const cursor = document.body.style.cursor;
    const selection = document.body.style.userSelect;
    const rect = table.getBoundingClientRect();
    const handleMove = (pointer: globalThis.PointerEvent) => move(pointer);
    const handleUp = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === dragRef.current?.pointerId) finish(true);
    };
    const handleCancel = () => finish(false);
    dragRef.current = {
      pointerId: event.pointerId,
      dimension,
      handle,
      start: dimension === "column" ? event.clientX : event.clientY,
      scale:
        dimension === "column"
          ? rect.width / table.offsetWidth || 1
          : rect.height / table.offsetHeight || 1,
      value: Math.round(handle.size),
      widths: layout.columns.map((column) => column.size),
      row,
      restore: () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
        if (dimension === "column") {
          table.style.width = width;
          frame.style.width = frameWidth;
          table.style.tableLayout = tableLayout;
          columns.forEach((column, index) => {
            column.style.width = columnStyles[index];
          });
        } else if (row) {
          row.style.height = rowHeight;
        }
        document.body.style.cursor = cursor;
        document.body.style.userSelect = selection;
      },
    };
    document.body.style.cursor =
      dimension === "column" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    setDragging(handle.key);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  };

  const move = (event: globalThis.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      table.querySelectorAll("colgroup > col").length !== drag.widths.length
    ) {
      finish(false);
      return;
    }
    event.preventDefault();
    const current = drag.dimension === "column" ? event.clientX : event.clientY;
    drag.value = clampTableSize(
      drag.handle.size + (current - drag.start) / drag.scale,
      drag.dimension,
    );
    if (drag.dimension === "column") {
      const widths = drag.widths.map((width, index) =>
        index === drag.handle.index ? drag.value : width,
      );
      applyTableColumnWidths(table, frame, widths);
      table
        .querySelectorAll<HTMLTableColElement>("colgroup > col")
        .forEach((column, index) => {
          column.style.width = `${widths[index]}px`;
        });
    } else {
      if (!drag.row?.isConnected) {
        finish(false);
        return;
      }
      drag.row.style.height = `${drag.value}px`;
    }
    scheduleRef.current();
  };

  const keyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    dimension: "column" | "row",
    handle: Handle,
  ) => {
    const decrease = dimension === "column" ? "ArrowLeft" : "ArrowUp";
    const increase = dimension === "column" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrease && event.key !== increase) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.shiftKey ? 32 : 8) * (event.key === increase ? 1 : -1);
    commit(
      dimension,
      handle,
      handle.size + delta,
      layout.columns.map((column) => column.size),
    );
  };

  if (!editable) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {(["column", "row"] as const).flatMap((dimension) =>
        (dimension === "column" ? layout.columns : layout.rows).map(
          (handle) => {
            const isColumn = dimension === "column";
            const extent = isColumn ? layout.width : layout.height;
            const handleStart = Math.max(0, Math.min(handle.offset - 4, extent - 8));
            const guide =
              Math.max(0, Math.min(handle.offset - 1, extent - 2)) - handleStart;

            return (
              <button
                key={handle.key}
                type="button"
                aria-label={`Resize ${dimension} ${handle.index + 1}`}
                title={`Drag to resize ${dimension}. Use arrow keys for fine adjustment.`}
                className={`group/resize pointer-events-auto absolute touch-none border-0 bg-transparent p-0 focus-visible:outline-none ${isColumn ? "cursor-col-resize" : "cursor-row-resize"}`}
                style={
                  isColumn
                    ? {
                        left: handleStart,
                        top: 0,
                        width: 8,
                        height: layout.height,
                      }
                    : {
                        left: 0,
                        top: handleStart,
                        width: layout.width,
                        height: 8,
                      }
                }
                onPointerDown={(event) => start(event, dimension, handle)}
                onKeyDown={(event) => keyboard(event, dimension, handle)}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute rounded-full bg-sky-500/70 dark:bg-sky-400/80 ${dragging === handle.key ? "opacity-100" : dragging ? "opacity-0" : "opacity-0 group-focus-visible/resize:opacity-100"}`}
                  style={
                    isColumn
                      ? { left: guide, top: 0, width: 2, height: "100%" }
                      : { left: 0, top: guide, width: "100%", height: 2 }
                  }
                />
              </button>
            );
          },
        ),
      )}
    </div>
  );
}
