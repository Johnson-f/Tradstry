"use client"
{/* Shared layout across the app pages */}
import { AppSidebar } from "@/components/app-sidebar";
import ThemeProvider from "@/components/theme-provider";
import { useState } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <AppSidebar collapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
        <div 
          className={`transition-all duration-500 ease-out ${
            isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          } ml-0`}
        >
          {children}
        </div>
      </div>
    </ThemeProvider>
  );
}
