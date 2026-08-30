"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $findCellNode, $findTableNode } from "@lexical/table";
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  type NodeKey,
} from "lexical";
import { ContextMenu } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import {
  $deleteNotebookTable,
  $deleteTableDimensionAtCell,
} from "./table-actions";

export function TableContextMenu({
  tableKey,
  children,
}: {
  tableKey: NodeKey;
  children: ReactNode;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [open, setOpen] = useState(false);
  const cellKey = useRef<NodeKey | null>(null);

  const rememberCell = (target: EventTarget | null) => {
    cellKey.current = editor.getEditorState().read(
      () => {
        const domCell =
          target instanceof Element ? target.closest("td, th") : null;
        const selection = $getSelection();
        const node = domCell
          ? $getNearestNodeFromDOMNode(domCell)
          : $isRangeSelection(selection)
            ? selection.anchor.getNode()
            : null;
        const cell = node ? $findCellNode(node) : null;
        return cell && $findTableNode(cell)?.getKey() === tableKey
          ? cell.getKey()
          : null;
      },
      { editor },
    );
  };

  const remove = (dimension: "row" | "column") => {
    const target = cellKey.current;
    if (!target || !editor.isEditable()) return;
    editor.update(
      () => {
        $deleteTableDimensionAtCell(tableKey, target, dimension);
      },
      { tag: HISTORY_PUSH_TAG },
    );
  };

  return (
    <ContextMenu.Root
      open={open && editable}
      onOpenChange={(next) => setOpen(next && cellKey.current !== null)}
    >
      <ContextMenu.Trigger
        asChild
        disabled={!editable}
        onContextMenu={(event) => rememberCell(event.target)}
        onPointerDownCapture={(event) => rememberCell(event.target)}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Table cell actions"
          className="z-50 min-w-44 origin-(--radix-context-menu-content-transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-100 motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            editor.focus();
          }}
        >
          <ContextMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">
            Table cell
          </ContextMenu.Label>
          <ContextMenu.Item
            onSelect={() => remove("row")}
            className="flex min-h-8 cursor-default items-center rounded-md px-2 text-xs text-destructive outline-none select-none focus:bg-destructive/10"
          >
            Delete row
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => remove("column")}
            className="flex min-h-8 cursor-default items-center rounded-md px-2 text-xs text-destructive outline-none select-none focus:bg-destructive/10"
          >
            Delete column
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item
            onSelect={() => {
              editor.update(
                () => {
                  if (editor.isEditable()) $deleteNotebookTable(tableKey);
                },
                { tag: HISTORY_PUSH_TAG },
              );
            }}
            className="flex min-h-8 cursor-default items-center rounded-md px-2 text-xs text-destructive outline-none select-none focus:bg-destructive/10"
          >
            Delete table
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
