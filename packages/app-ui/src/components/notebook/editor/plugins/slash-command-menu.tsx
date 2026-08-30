"use client";

import type { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { cn } from "@tradstry/app-ui/lib/utils";
import type { LexicalEditor } from "lexical";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSlashMenuPosition } from "./slash-menu-position";

export function SlashCommandMenu<
  T extends MenuOption & { group: string; description: string },
>({
  editor,
  options,
  selectedIndex,
  setHighlightedIndex,
  selectOption,
}: {
  editor: LexicalEditor;
  options: T[];
  selectedIndex: number | null;
  setHighlightedIndex: (index: number) => void;
  selectOption: (option: T) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<
    typeof getSlashMenuPosition
  > | null>(null);
  const groups = useMemo(() => {
    const result = new Map<string, { option: T; index: number }[]>();
    options.forEach((option, index) => {
      const items = result.get(option.group) ?? [];
      items.push({ option, index });
      result.set(option.group, items);
    });
    return [...result.entries()];
  }, [options]);

  useLayoutEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    const boundary = root.closest('[data-slot="scroll-area-viewport"]') ?? root;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const selection = doc.getSelection();
      if (!selection?.rangeCount || !root.contains(selection.anchorNode))
        return;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      const caret = range.getBoundingClientRect();
      const panel = boundary.getBoundingClientRect();
      const visual = win.visualViewport;
      const left = visual?.offsetLeft ?? 0;
      const top = visual?.offsetTop ?? 0;
      const bounds = {
        left: Math.max(left, panel.left),
        top: Math.max(top, panel.top),
        right: Math.min(left + (visual?.width ?? win.innerWidth), panel.right),
        bottom: Math.min(
          top + (visual?.height ?? win.innerHeight),
          panel.bottom,
        ),
      };
      if (caret.bottom < bounds.top || caret.top > bounds.bottom) {
        setPosition(null);
        return;
      }
      const naturalHeight =
        (contentRef.current?.scrollHeight ?? 384) +
        (headerRef.current?.offsetHeight ?? 28) +
        18;
      const next = getSlashMenuPosition(caret, bounds, naturalHeight);
      setPosition((previous) =>
        previous?.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.side === next.side
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = win.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(boundary);
    if (contentRef.current) observer.observe(contentRef.current);
    if (headerRef.current) observer.observe(headerRef.current);
    const unregister = editor.registerUpdateListener(schedule);
    doc.addEventListener("scroll", schedule, { capture: true, passive: true });
    doc.addEventListener("selectionchange", schedule);
    win.addEventListener("resize", schedule);
    win.visualViewport?.addEventListener("resize", schedule);
    win.visualViewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      unregister();
      observer.disconnect();
      win.cancelAnimationFrame(frame);
      doc.removeEventListener("scroll", schedule, true);
      doc.removeEventListener("selectionchange", schedule);
      win.removeEventListener("resize", schedule);
      win.visualViewport?.removeEventListener("resize", schedule);
      win.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [editor]);

  useLayoutEffect(() => {
    if (!position?.height) return;
    const viewport = viewportRef.current;
    const selected =
      selectedIndex !== null ? options[selectedIndex]?.ref?.current : null;
    if (!viewport || !selected) return;
    const item = selected.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    if (item.top < view.top) viewport.scrollTop -= view.top - item.top;
    else if (item.bottom > view.bottom)
      viewport.scrollTop += item.bottom - view.bottom;
  }, [options, selectedIndex, position?.height]);

  return (
    <div>
      <div
        data-slot="notebook-slash-menu"
        data-side={position?.side}
        className="fixed z-50 flex w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-border bg-popover p-2 shadow-2xl shadow-slate-900/10"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          width: position?.width,
          height: position?.height,
          visibility: position ? "visible" : "hidden",
        }}
      >
        <div ref={headerRef} className="shrink-0 px-2 pt-1 pb-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Slash Commands
          </p>
        </div>
        <ScrollArea
          viewportRef={viewportRef}
          className="min-h-0 flex-1"
          type="always"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div ref={contentRef} className="space-y-3 px-1 pb-1 pr-3">
            {groups.map(([group, items]) => (
              <div key={group} className="space-y-1">
                <p className="px-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {group}
                </p>
                {items.map(({ option, index }) => (
                  <button
                    key={option.key}
                    ref={option.setRefElement}
                    type="button"
                    id={`typeahead-item-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                    className={cn(
                      "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors",
                      selectedIndex === index
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-foreground hover:bg-accent",
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setHighlightedIndex(index);
                      selectOption(option);
                    }}
                  >
                    <span className="text-sm font-medium">{option.key}</span>
                    <span
                      className={cn(
                        "mt-0.5 text-xs",
                        selectedIndex === index
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
