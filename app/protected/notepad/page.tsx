"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/notepad/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import PlaygroundApp from "@/components/notepad/rich-editor/App";
import "@/components/notepad/rich-editor/custom-overrides.css";

export default function NotepadPage() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="h-screen overflow-hidden">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "350px",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
        {/* Main Content Area - positioned to account for fixed sidebars */}
        <div
          className={`h-full bg-background overflow-y-auto transition-all duration-300 ${
            isCollapsed ? "ml-[calc(272px+48px)]" : "ml-[calc(272px+350px)]"
          }`}
        >
          {/* Header Section */}
          
          {/* Editor Container */}
          <div className="w-full px-6 py-8">
             <div className="bg-white">
               <PlaygroundApp />
             </div>
           </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
