"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import {
  Home,
  NotebookPen,
  ChartCandlestick,
  GraduationCap,
  Library,
  PieChart,
  ChartNoAxesColumnIncreasing,
  BrainCog,
  Wallet,
  Notebook,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useUserProfile } from "@/hooks/use-user-profile"
import { cn } from "@/lib/utils"

// Tradistry navigation data
const navItems = [
  { title: "Home", url: "/app", icon: Home },
  { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Journal", url: "/app/journal", icon: NotebookPen },
  { title: "Playbook", url: "/app/playbook", icon: Library },
  { title: "Notebook", url: "/app/notebook", icon: Notebook },
  { title: "Analytics", url: "/app/analytics", icon: PieChart },
  { title: "AI Reports", url: "/app/ai-reports", icon: ChartNoAxesColumnIncreasing },
  { title: "Mindset Lab", url: "/app/mindset", icon: BrainCog },
  { title: "Markets", url: "/app/markets", icon: ChartCandlestick },
  { title: "Brokerage", url: "/app/brokerage", icon: Wallet },
  { title: "Education", url: "/app/education", icon: GraduationCap },
]


export function AppSidebar({
  collapsed: externalCollapsed,
  onCollapsedChange,
  ...props
}: {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
} & React.ComponentProps<typeof Sidebar>) {
  const { firstName, email, loading } = useUserProfile()
  
  // Initialize collapsed state from localStorage immediately
  const [collapsed, setCollapsed] = useState(() => {
    // Check if we're in the browser (not SSR)
    if (typeof window !== 'undefined') {
      const savedCollapsed = localStorage.getItem('sidebar-collapsed')
      if (savedCollapsed !== null) {
        return JSON.parse(savedCollapsed)
      }
    }
    return false // Default to uncollapsed
  })
  const [mounted, setMounted] = useState(false)

  // Handle external collapsed prop changes
  useEffect(() => {
    setMounted(true)
    
    // If external collapsed prop is provided, use it and save to localStorage
    if (externalCollapsed !== undefined) {
      setCollapsed(externalCollapsed)
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(externalCollapsed))
      }
    }

    // Listen for sidebar toggle events from other components
    const handleSidebarToggle = (event: CustomEvent) => {
      const { collapsed: newCollapsed } = event.detail
      setCollapsed(newCollapsed)
    }

    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    }
  }, [externalCollapsed])

  // Handle collapse toggle
  const handleCollapsedChange = (newCollapsed: boolean) => {
    setCollapsed(newCollapsed)
    
    // Save to localStorage
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newCollapsed))
    
    // Call external handler if provided (for backward compatibility)
    onCollapsedChange?.(newCollapsed)
  }

  // Create user data object
  const userData = {
    name: loading ? "Loading..." : firstName || "Tradistry User",
    email: loading ? "..." : email || "user@tradistry.com",
    avatar: "/avatars/user.jpg", // You can update this to use actual user avatar
  }

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen shadow-xl flex flex-col justify-between transition-all duration-300 z-50 bg-[hsl(var(--sidebar-bg))]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Top Section */}
      <div>
        {/* Profile & Collapse Button */}
        <div className="flex items-center justify-between px-4 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            {!collapsed && (
              <div>
                <div className="text-foreground font-bold text-base leading-tight">
                  Tradistry
                </div>
                <div className="text-xs text-muted-foreground leading-tight">
                  Journal & Analytics
                </div>
              </div>
            )}
          </div>
          <button
            className="ml-2 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
            onClick={() => handleCollapsedChange(!collapsed)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="mt-6 px-2">
          <NavMain items={navItems} collapsed={collapsed} />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="px-2 pb-6">
        <NavUser user={userData} collapsed={collapsed} />
      </div>
    </aside>
  )
}
