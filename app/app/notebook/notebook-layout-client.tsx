"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Menu } from "lucide-react";

// Dynamically import components that might cause circular dependencies
const Navigation = dynamic(() => import("@/components/notebook/sidebar/Navigation"), {
  ssr: false,
  loading: () => <div className="w-60 border-r bg-background" />
});

const NotebookNavbar = dynamic(() => import("@/components/notebook/Navbar"), {
  ssr: false,
  loading: () => <div className="h-8 w-8" />
});

const NewNoteButton = dynamic(() => import("@/components/notebook/NewNoteButton"), {
  ssr: false,
  loading: () => <div className="h-8 w-20 animate-pulse bg-muted rounded" />
});

export default function NotebookLayoutClient({ children }: { children: React.ReactNode }) {
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
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <Menu className="h-4 w-4" />
                <span>Open Sidebar</span>
              </button>
            )}
            <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm">{pathname?.replace("/app/", "")}</span>
          </div>
          <div className="flex items-center gap-2">
            <NewNoteButton />
            <NotebookNavbar />
          </div>
        </nav>
        <div className="h-full" style={{ marginTop: '-64px', paddingTop: '64px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
