"use client"
{/* Shared layout across the protected pages */}
import Sidebar from "@/components/sidebar";
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
        <Sidebar collapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
        <div 
          className={`transition-all duration-500 ease-out ${
            isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          } ml-0`}
        >
          <div className="flex-1 flex flex-col">
            <div className="flex-1">
              {children}
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
