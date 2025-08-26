"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/notepad/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import PlaygroundApp from "@/components/notepad/rich-editor/App";
import "@/components/notepad/rich-editor/index.css";

export default function NotepadPage() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="h-screen">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "250px",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
        
        {/* Fixed Editor Container that responds to sidebar */}
        <div className={`fixed top-0 bottom-0 right-0 flex flex-col transition-all duration-300 ${
          isCollapsed ? 'left-[130px]' : 'left-[550px]'
        }`}>
          <div className="flex-1 h-full">
            <PlaygroundApp noteId="default" />
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}