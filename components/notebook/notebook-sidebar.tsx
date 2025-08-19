"use client"

import * as React from "react"
import { BookOpen, FileText, Home, Search, Settings, Star, Trash2, Folder, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"

// Sample data
const data = {
  user: {
    name: "John Doe",
    email: "john@example.com",
    avatar: "/avatars/default-avatar.png",
  },
  navMain: [
    {
      title: "Home",
      url: "/protected/notebook",
      icon: Home,
      isActive: true,
    },
    {
      title: "All Notes",
      url: "#",
      icon: FileText,
      isActive: false,
    },
    {
      title: "Favorites",
      url: "#",
      icon: Star,
      isActive: false,
    },
    {
      title: "Trash",
      url: "#",
      icon: Trash2,
      isActive: false,
    }
  ]
}

export function NotebookSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isOpen } = useSidebar()

  return (
    <Sidebar 
      className="group relative z-10 flex h-full w-64 flex-col border-r bg-background transition-[width] duration-300 ease-in-out" 
      {...props}
    >
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold">Notebook</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3">
        <div className="mb-4">
          <Button className="w-full justify-start gap-2" size="sm">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>

        <div className="relative mb-4">
          <Input 
            placeholder="Search notes..." 
            className="h-8 pl-8"
          />
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.navMain.map((item) => (
                <SidebarMenuItem key={item.title} isActive={item.isActive}>
                  <SidebarMenuButton asChild>
                    <a 
                      href={item.url} 
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-6">
          <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">Collections</div>
          <div className="space-y-1">
            {['Personal', 'Work', 'Ideas'].map((collection) => (
              <Button
                key={collection}
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 px-2 text-sm font-normal"
              >
                <Folder className="h-4 w-4" />
                {collection}
              </Button>
            ))}
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="p-4 pt-0">
        <Separator className="my-2" />
        <div className="flex items-center gap-2 p-2 hover:bg-accent rounded-md cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-medium text-primary">
              {data.user.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{data.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{data.user.email}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
