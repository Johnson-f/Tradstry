"use client"
{/* Shared layout across the app pages */}
import { AppSidebar } from "@/components/app-sidebar";
import ThemeProvider from "@/components/theme-provider";
import { useUserInitialization } from "@/hooks/use-user-initialization";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { isInitialized, isInitializing, error } = useUserInitialization();
  const [showInitializationStatus, setShowInitializationStatus] = useState(false);
  const pathname = usePathname();
  const isNotebook = pathname?.startsWith("/app/notebook");

  // Show initialization status for a few seconds when initializing
  useEffect(() => {
    if (isInitializing) {
      setShowInitializationStatus(true);
    } else if (isInitialized || error) {
      // Hide status after 3 seconds when done
      const timer = setTimeout(() => {
        setShowInitializationStatus(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isInitializing, isInitialized, error]);

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        {!isNotebook && (
          <AppSidebar collapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
        )}
        <div
          className={`transition-all duration-500 ease-out ${
            isNotebook ? '' : isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          } ml-0`}
        >
          {/* User Initialization Status */}
          {showInitializationStatus && (
            <div className="fixed top-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-4 max-w-sm">
              {isInitializing && (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Setting up your account...</span>
                </div>
              )}
              {isInitialized && !isInitializing && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <div className="h-2 w-2 bg-green-600 rounded-full" />
                  <span>Account setup complete!</span>
                </div>
              )}
              {error && !isInitializing && (
                <div className="text-sm text-amber-600">
                  <p>Setup incomplete: {error}</p>
                  <p className="text-xs mt-1 text-muted-foreground">You can still use the app</p>
                </div>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    </ThemeProvider>
  );
}
