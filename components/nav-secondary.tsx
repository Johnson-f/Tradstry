"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { type LucideIcon, Moon, Sun } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Import the SettingsDialog component
import { SettingsDialog } from "./settings-dialog"

export function NavSecondary({
  items,
  collapsed = false,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    action?: string
  }[]
  collapsed?: boolean
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const handleItemClick = (item: any) => {
    if (item.action === "settings") {
      setSettingsOpen(true)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {/* Theme Toggle Button */}
        <button
          onClick={handleThemeToggle}
          className={`flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors w-full px-3 py-2 ${
            collapsed ? "justify-center gap-0 w-10 h-10 p-0" : ""
          }`}
        >
          {mounted &&
            (theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            ))}
          {!collapsed && mounted && (
            <span className="text-sm">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </button>
        
        {/* Other Items */}
        {items.map((item) => (
          <button
            key={item.title}
            onClick={() => handleItemClick(item)}
            className={`flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors w-full px-3 py-2 ${
              collapsed ? "justify-center gap-0 w-10 h-10 p-0" : ""
            }`}
          >
            <item.icon className="w-5 h-5" />
            {!collapsed && <span className="text-sm flex-1">{item.title}</span>}
          </button>
        ))}
      </div>
      
      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
