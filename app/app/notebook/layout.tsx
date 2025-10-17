"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { cn } from "@/lib/utils";
import Navigation from "@/components/notebook/sidebar/Navigation";
import NotebookNavbar from "@/components/notebook/Navbar";
import NewNoteButton from "@/components/notebook/NewNoteButton";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(240);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') setSidebarWidth(detail);
    };
    window.addEventListener('notebook:sidebar-width', handler as EventListener);
    return () => window.removeEventListener('notebook:sidebar-width', handler as EventListener);
  }, []);

  return (
    <div className="flex h-full dark:bg-[#1F1F1F]">
      <Navigation />

      {/* Right side content with a sticky notebook navbar on top */}
      <div
        className="flex h-full min-w-0 flex-1 flex-col"
        style={{ paddingLeft: sidebarWidth }}
      >
        <nav className="sticky top-0 z-[200] flex h-16 items-center justify-between border-b bg-background px-4 dark:bg-[#1F1F1F]">
          <div className="flex items-center gap-2">
            {sidebarWidth === 0 && (
              <button
                onClick={() => window.dispatchEvent(new Event('notebook:sidebar-open'))}
                className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Open Sidebar
              </button>
            )}
            <Link href="/app" className="text-sm text-muted-foreground hover:underline">
              ← Back to App
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm">{pathname?.replace("/app/", "")}</span>
          </div>
          <div className="flex items-center gap-2">
            <NewNoteButton />
            <NotebookNavbar />
          </div>
        </nav>
        <ScrollArea className="h-full pt-16">{children}</ScrollArea>
      </div>
    </div>
  );
}


