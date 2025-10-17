"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ItemProps {
  id: string;
  label: string;
  active?: boolean;
  level?: number;
  expanded?: boolean;
  onClick?: () => void;
  onToggle?: () => void;
  onAddChild?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function Item({
  id,
  label,
  active,
  level = 0,
  expanded,
  onClick,
  onToggle,
  onAddChild,
  onRename,
  onArchive,
  onDelete,
}: ItemProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group flex w-full items-center"
    >
      {!!id && (
        <button
          aria-label="Toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="mx-1 h-4 w-4 rounded-sm text-muted-foreground/60 hover:bg-neutral-300 dark:hover:bg-neutral-600"
          style={{ marginLeft: level ? `${level * 12}px` : "0px" }}
        >
          <span className="inline-block text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
      )}

      <button
        onClick={onClick}
        role="treeitem"
        className={cn(
          "flex min-h-[1.5rem] flex-1 items-center truncate py-1 pr-3 text-left text-sm text-muted-foreground hover:bg-primary/5",
          active && "bg-primary/5 text-primary"
        )}
        aria-label={`Notebook item ${label}`}
      >
        <span className="truncate">{label}</span>
      </button>

      <div className={cn("ml-auto pr-2", hover ? "opacity-100" : "opacity-0")}> 
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded px-1 text-xs text-muted-foreground hover:bg-neutral-200 dark:hover:bg-neutral-700">
              •••
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44" align="end">
            <DropdownMenuItem onClick={onAddChild}>Add page</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}


