"use client";

import React, { ElementRef, useEffect, useRef, useState, useCallback } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { DocumentList } from "@/components/notebook/sidebar/DocumentList";
import { Item } from "@/components/notebook/sidebar/Item";
import TrashBox from "@/components/notebook/sidebar/TrashBox";
import { useSearch } from "@/components/notebook/hooks/useSearch";
import { useSettings } from "@/components/notebook/hooks/useSettings";
import { useCreateNote } from "@/lib/hooks/use-notebook";

import {
  ChevronsLeft,
  MenuIcon,
  Plus,
  Search,
  Settings,
  Trash,
  Calendar,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const Navigation = () => {
  const search = useSearch();
  const settings = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { createNote } = useCreateNote();

  const isResizingRef = useRef(false);
  const sidebarRef = useRef<ElementRef<"aside">>(null);
  const navbarRef = useRef<ElementRef<"div">>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isMobile);

  useEffect(() => {
    if (isMobile) {
      collapse();
    } else {
      resetWidth();
    }
  }, [isMobile, resetWidth]);

  useEffect(() => {
    if (isMobile) {
      collapse();
    }
  }, [pathname, isMobile, resetWidth]);

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    let newWidth = e.clientX;

    if (newWidth < 240) newWidth = 240;
    if (newWidth > 480) newWidth = 480;

    if (sidebarRef.current && navbarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
      navbarRef.current.style.setProperty("left", `${newWidth}px`);
      navbarRef.current.style.setProperty(
        "width",
        `calc(100% - ${newWidth}px)`,
      );
      // Notify layout about current sidebar width
      window.dispatchEvent(new CustomEvent("notebook:sidebar-width", { detail: newWidth }));
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const resetWidth = useCallback(() => {
    if (sidebarRef.current && navbarRef.current) {
      setIsCollapsed(false);
      setIsResetting(true);

      const width = isMobile ? 0 : 240;
      sidebarRef.current.style.width = isMobile ? "100%" : "240px";
      navbarRef.current.style.removeProperty("width");
      navbarRef.current.style.setProperty(
        "width",
        isMobile ? "0" : "calc(100%-240px)",
      );
      navbarRef.current.style.setProperty("left", isMobile ? "100%" : "240px");
      // Notify layout
      window.dispatchEvent(new CustomEvent("notebook:sidebar-width", { detail: width }));
      setTimeout(() => setIsResetting(false), 300);
    }
  }, [isMobile]);

  const collapse = () => {
    if (sidebarRef.current && navbarRef.current) {
      setIsCollapsed(true);
      setIsResetting(true);

      sidebarRef.current.style.width = "0";
      navbarRef.current.style.setProperty("width", "100%");
      navbarRef.current.style.setProperty("left", "0");
      // Notify layout
      window.dispatchEvent(new CustomEvent("notebook:sidebar-width", { detail: 0 }));
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  // Listen for global request to open/expand the sidebar
  useEffect(() => {
    const openHandler = () => {
      resetWidth();
    };
    window.addEventListener("notebook:sidebar-open", openHandler);
    return () => window.removeEventListener("notebook:sidebar-open", openHandler);
  }, [resetWidth]);

  const handleCreate = () => {
    const promise = createNote({ title: "Untitled" }).then((note) => {
      if (note?.data?.id) {
        router.push(`/app/notebook/${note.data.id}`);
      }
    });

    toast.promise(promise, {
      loading: "Creating a new note....",
      success: "New note created.",
      error: "Failed to create a note.",
    });
  };

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-[20] flex h-screen w-60 flex-col overflow-hidden bg-secondary",
          isResetting && "transition-all duration-300 ease-in-out",
          isMobile && "w-0",
        )}
      >
        <div
          onClick={collapse}
          role="button"
          className={cn(
            "absolute right-2 top-3 h-6 w-6 rounded-sm text-muted-foreground opacity-0 transition hover:bg-neutral-300 group-hover/sidebar:opacity-100 dark:hover:bg-neutral-600",
            isMobile && "opacity-100",
          )}
        >
          <ChevronsLeft className="h-6 w-6" />
        </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mt-6">
            <Item label="Search" icon={Search} isSearch onClick={search.onOpen} />
            <div className="mt-3">
            <Item label="Settings" icon={Settings} onClick={settings.onOpen} />
            </div>
            <div className="mt-3">
            <Item onClick={handleCreate} label="New page" icon={Plus} />
            </div>
          </div>
          {/* Scrollable documents list */}
          <div className="mt-20 flex-1">
            <ScrollArea className="max-h-[calc(100vh-200px)] pr-2">
              <DocumentList />
            </ScrollArea>
            <Item onClick={handleCreate} icon={Plus} label="Add a page" />
          </div>
        </div>
        <div className="border-t p-2 space-y-2">
          <Item 
            label="Calendar" 
            icon={Calendar} 
            onClick={() => router.push('/app/notebook/calendar')}
          />
          <Popover>
            <PopoverTrigger className="w-full">
              <Item label="Trash" icon={Trash} />
            </PopoverTrigger>
            <PopoverContent
              side={isMobile ? "bottom" : "right"}
              className="w-72 p-0"
            >
              <TrashBox />
            </PopoverContent>
          </Popover>
        </div>
        <div
          onMouseDown={handleMouseDown}
          onClick={resetWidth}
          className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-primary/10 opacity-0 transition group-hover/sidebar:opacity-100"
        ></div>
      </aside>
      <div
        ref={navbarRef}
        className={cn(
          "absolute left-60 top-0 z-[10] w-[calc(100%-240px)]",
          isResetting && "transition-all duration-300 ease-in-out",
          isMobile && "left-0 w-full",
        )}
      >
        {!!params.docId ? (
          <nav
            className={cn(
              "w-full bg-transparent px-3 py-2",
              !isCollapsed && "p-0",
            )}
          >
            {isCollapsed && (
              <MenuIcon
                onClick={resetWidth}
                role="button"
                className="h-6 w-6 text-muted-foreground"
              />
            )}
          </nav>
        ) : (
          <nav
            className={cn(
              "w-full bg-transparent px-3 py-2",
              !isCollapsed && "p-0",
            )}
          >
            {isCollapsed && (
              <MenuIcon
                onClick={resetWidth}
                role="button"
                className="h-6 w-6 text-muted-foreground"
              />
            )}
          </nav>
        )}
      </div>
    </>
  );
};

export default Navigation;


