"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TableNode } from "@lexical/table";
import {
  $getSelection,
  $setSelection,
  type NodeKey,
  SKIP_SCROLL_INTO_VIEW_TAG,
  setDOMUnmanaged,
} from "lexical";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { $getSelectedTable } from "./table-actions";
import { TableContextMenu } from "./table-context-menu";
import { attachTableMotion } from "./table-motion";
import { TableResizeControls } from "./table-resize-controls";

type TableMount = {
  key: NodeKey;
  wrapper: HTMLElement;
  table: HTMLTableElement;
  container: HTMLDivElement;
};

export function attachTableScrollArea(mount: TableMount, slot: HTMLElement) {
  // Only the shell is unmanaged; Lexical still owns every row, cell, and text node.
  setDOMUnmanaged(mount.wrapper);
  mount.wrapper.appendChild(mount.container);
  slot.appendChild(mount.table);
  return () => {
    if (mount.table.parentElement === slot)
      mount.wrapper.appendChild(mount.table);
    mount.container.remove();
  };
}

function ScrollableTable({ mount }: { mount: TableMount }) {
  const [editor] = useLexicalComposerContext();
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const detach = attachTableScrollArea(mount, slot);
    const stopMotion = attachTableMotion(mount.table);
    editor.update(
      () => {
        if ($getSelectedTable()?.getKey() === mount.key) {
          $setSelection($getSelection()?.clone() ?? null);
        }
      },
      { tag: SKIP_SCROLL_INTO_VIEW_TAG },
    );
    return () => {
      stopMotion();
      detach();
    };
  }, [editor, mount]);

  return (
    <TableContextMenu tableKey={mount.key}>
      <div
        className="w-full min-w-0 border border-border transition-[border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-foreground/20 focus-within:border-foreground/25 motion-reduce:transition-none"
        data-notebook-table-frame=""
      >
        <div className="relative">
          <div ref={slotRef} />
          <TableResizeControls
            table={mount.table}
            frame={mount.wrapper}
            tableKey={mount.key}
          />
        </div>
      </div>
    </TableContextMenu>
  );
}

export function TableScrollAreaPlugin() {
  const [editor] = useLexicalComposerContext();
  const [mounts, setMounts] = useState<TableMount[]>([]);

  useLayoutEffect(() => {
    const byKey = new Map<NodeKey, TableMount>();
    return editor.registerMutationListener(
      TableNode,
      (mutations) => {
        let changed = false;
        for (const [key, mutation] of mutations) {
          if (mutation === "destroyed") {
            changed = byKey.delete(key) || changed;
            continue;
          }
          const wrapper = editor.getElementByKey(key);
          if (
            !wrapper ||
            wrapper.tagName === "TABLE" ||
            byKey.get(key)?.wrapper === wrapper
          )
            continue;
          const table = wrapper.querySelector("table");
          if (!table) continue;
          const container = document.createElement("div");
          setDOMUnmanaged(container);
          byKey.set(key, { key, wrapper, table, container });
          changed = true;
        }
        if (changed) setMounts([...byKey.values()]);
      },
      { skipInitialization: false },
    );
  }, [editor]);

  return mounts.map((mount) =>
    createPortal(<ScrollableTable mount={mount} />, mount.container, mount.key),
  );
}
