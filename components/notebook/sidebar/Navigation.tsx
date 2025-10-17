"use client";

import React, { ElementRef, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { DocumentList } from "@/components/notebook/sidebar/DocumentList";
import TrashBox from "@/components/notebook/sidebar/TrashBox";

export default function Navigation() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const sidebarRef = useRef<ElementRef<"aside">>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isMobile);

  useEffect(() => {
    if (isMobile) collapse();
    else resetWidth();
  }, [isMobile]);

  const collapse = () => {
    if (sidebarRef.current) {
      setIsCollapsed(true);
      setIsResetting(true);
      sidebarRef.current.style.width = "0";
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  const resetWidth = () => {
    if (sidebarRef.current) {
      setIsCollapsed(false);
      setIsResetting(true);
      sidebarRef.current.style.width = isMobile ? "100%" : "240px";
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        "group/sidebar relative z-[300] flex h-full w-60 flex-col overflow-y-auto border-r bg-secondary",
        isResetting && "transition-all duration-300 ease-in-out",
        isMobile && "w-0"
      )}
    >
      <div className="p-2 text-xs text-muted-foreground">Notebook</div>
      <div className="pb-2">
        <DocumentList />
      </div>
      <div className="mt-auto border-t">
        <TrashBox />
      </div>
      <div className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-primary/10 opacity-0 transition group-hover/sidebar:opacity-100" />
    </aside>
  );
}


