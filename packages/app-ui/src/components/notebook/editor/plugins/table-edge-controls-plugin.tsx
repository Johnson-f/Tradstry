"use client";

import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $isTableNode } from "@lexical/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { $getRoot, HISTORY_PUSH_TAG, type NodeKey } from "lexical";
import { useEffect, useRef, useState } from "react";
import { $appendTableDimension, $deleteNotebookTable } from "./table-actions";

type TablePosition = {
  key: NodeKey;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function TableEdgeControlsPlugin() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<TablePosition[]>([]);

  useEffect(() => {
    if (!editable) return;
    let frame = 0;
    let root: HTMLElement | null = null;
    const observed = new Set<Element>();
    const measure = () => {
      frame = 0;
      const overlay = overlayRef.current;
      if (!root || !overlay) return;
      const origin = overlay.getBoundingClientRect();
      const keys = editor.getEditorState().read(() =>
        $getRoot()
          .getChildren()
          .filter($isTableNode)
          .map((table) => table.getKey()),
      );
      const elements = new Set<Element>([root]);
      const next: TablePosition[] = [];
      for (const key of keys) {
        const element = editor.getElementByKey(key);
        if (!element) continue;
        elements.add(element);
        const rect = element.getBoundingClientRect();
        next.push({
          key,
          left: rect.left - origin.left,
          top: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
        });
      }
      for (const element of observed) {
        if (!elements.has(element)) {
          observer.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of elements) {
        if (!observed.has(element)) {
          observer.observe(element);
          observed.add(element);
        }
      }
      setPositions((previous) =>
        previous.length === next.length &&
        previous.every(
          (position, index) =>
            position.key === next[index].key &&
            position.left === next[index].left &&
            position.top === next[index].top &&
            position.width === next[index].width &&
            position.height === next[index].height,
        )
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    const unregisterRoot = editor.registerRootListener((element, previous) => {
      previous?.removeEventListener("load", schedule, true);
      root = element;
      element?.addEventListener("load", schedule, true);
      schedule();
    });
    const unregisterUpdate = editor.registerUpdateListener(schedule);
    window.addEventListener("resize", schedule);
    return () => {
      unregisterRoot();
      unregisterUpdate();
      root?.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor, editable]);

  if (!editable) return null;

  const append = (key: NodeKey, dimension: "row" | "column") => {
    editor.update(
      () => {
        if (editor.isEditable()) $appendTableDimension(key, dimension);
      },
      { tag: HISTORY_PUSH_TAG },
    );
  };

  const buttonClass =
    "group/table-control pointer-events-auto absolute flex items-center justify-center rounded-md bg-muted/70 text-muted-foreground opacity-0 transition-[color,background-color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:transition-none motion-reduce:transition-none";
  const iconClass =
    "size-4 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/table-control:scale-110 group-active/table-control:scale-90 group-focus-visible/table-control:transform-none group-focus-visible/table-control:transition-none motion-reduce:transform-none motion-reduce:transition-none";

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0">
      {positions.map((position, index) => (
        <fieldset
          className="m-0 border-0 p-0"
          aria-label={`Table ${index + 1} controls`}
          key={position.key}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Delete table"
                className="group/table-control pointer-events-auto absolute flex size-7 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:transition-none motion-reduce:transition-none"
                style={{ left: position.left - 36, top: position.top }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  editor.update(
                    () => {
                      if (editor.isEditable())
                        $deleteNotebookTable(position.key);
                    },
                    { tag: HISTORY_PUSH_TAG },
                  );
                  editor.focus();
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} className={iconClass} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="motion-reduce:animate-none">
              Delete table
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            aria-label="Add row"
            title="Add row"
            className={buttonClass}
            style={{
              left: position.left,
              top: position.top + position.height + 4,
              width: position.width,
              height: 24,
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => append(position.key, "row")}
          >
            <HugeiconsIcon icon={Add01Icon} className={iconClass} />
          </button>
          <button
            type="button"
            aria-label="Add column"
            title="Add column"
            className={buttonClass}
            style={{
              left: position.left + position.width + 4,
              top: position.top,
              width: 24,
              height: position.height,
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => append(position.key, "column")}
          >
            <HugeiconsIcon icon={Add01Icon} className={iconClass} />
          </button>
        </fieldset>
      ))}
    </div>
  );
}
