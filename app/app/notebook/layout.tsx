"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { cn } from "@/lib/utils";
import Navigation from "@/components/notebook/sidebar/Navigation";
import NotebookNavbar from "@/components/notebook/Navbar";
import NewNoteButton from "@/components/notebook/NewNoteButton";

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full dark:bg-[#1F1F1F]">
      <Navigation />

      {/* Right side content with a slim notebook navbar on top */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <nav className="flex items-center justify-between border-b bg-background px-3 py-2 dark:bg-[#1F1F1F]">
          <div className="flex items-center gap-2">
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
        <main className="h-full overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}


