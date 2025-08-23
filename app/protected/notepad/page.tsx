"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/notepad/app-sidebar"
import {
  SidebarProvider,
} from "@/components/ui/sidebar"

export default function NotepadPage() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="h-screen overflow-hidden">
      <SidebarProvider
        style={{
          "--sidebar-width": "350px",
        } as React.CSSProperties}
      >
        <AppSidebar isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
        {/* Main Content Area - positioned to account for fixed sidebars */}
        <div className={`h-full bg-background overflow-y-auto transition-all duration-300 ${
          isCollapsed ? "ml-[calc(272px+48px)]" : "ml-[calc(272px+350px)]"
        }`}>
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="text-lg font-medium mb-2">Select an email</div>
              <div className="text-sm">Choose an email from the list to view its content</div>
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}