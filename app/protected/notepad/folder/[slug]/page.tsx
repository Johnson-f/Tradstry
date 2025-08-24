"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppSidebar } from "@/components/notepad/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import PlaygroundApp from "@/components/notepad/rich-editor/App";
import { useFolderBySlug } from "@/lib/hooks/use-notes";
import "@/components/notepad/rich-editor/index.css";

export default function FolderPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const { data: folder, isLoading, error } = useFolderBySlug(slug);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !folder) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Folder Not Found</h1>
          <p className="text-muted-foreground">The folder "{slug}" could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "300px",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
        
        {/* Fixed Editor Container that responds to sidebar */}
        <div className={`fixed top-0 bottom-0 right-0 flex flex-col transition-all duration-300 ${
          isCollapsed ? 'left-[130px]' : 'left-[400px]'
        }`}>
          <div className="flex-1 h-full">
            <PlaygroundApp folderSlug={slug} />
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
