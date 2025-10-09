"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Settings,
  Moon,
  Sun,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// Removed SidebarProvider dependencies since we're using custom implementation
import { createClient } from "@/lib/supabase/client"
import { SettingsDialog } from "./settings-dialog"

export function NavUser({
  user,
  collapsed = false,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  collapsed?: boolean
}) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  
  // Simple mobile detection (alternative to useSidebar hook)
  const [isMobile, setIsMobile] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  React.useEffect(() => {
    setMounted(true)
    
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  // Generate initials from user name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-3 rounded-lg cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full px-3 py-2 ${
            collapsed ? "justify-center gap-0 w-10 h-10 p-0" : ""
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(user.name)}
          </div>
          {!collapsed && (
            <>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto w-4 h-4" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
              {getInitials(user.name)}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck className="mr-2 h-4 w-4" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleThemeToggle}>
            {mounted && (theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            ))}
            {mounted ? (theme === "dark" ? "Light Mode" : "Dark Mode") : "Theme"}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </DropdownMenu>
  )
}
