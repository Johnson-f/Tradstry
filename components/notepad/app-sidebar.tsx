"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { 
  ArchiveX, 
  Command, 
  File, 
  Inbox, 
  Send, 
  Trash2, 
  PanelLeftClose, 
  PanelLeft,
  Home,
  Star,
  FileText,
  Calendar,
  BookTemplate,
  Tag,
  Upload,
  Users
} from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { useFolders } from "@/lib/hooks/use-notes"

// Folder icon mapping based on slug
const getFolderIcon = (slug: string) => {
  const iconMap: Record<string, React.ComponentType> = {
    'home': Home,
    'favorites': Star,
    'notes': FileText,
    'calendar': Calendar,
    'templates': BookTemplate,
    'tags': Tag,
    'files': Upload,
    'trash': Trash2,
    'shared-with-me': Users,
  };
  return iconMap[slug] || File;
};

// This is sample data for mails/notes
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  mails: [
    {
      name: "William Smith",
      email: "williamsmith@example.com",
      subject: "Meeting Tomorrow",
      date: "09:34 AM",
      teaser:
        "Hi team, just a reminder about our meeting tomorrow at 10 AM.\nPlease come prepared with your project updates.",
    },
    {
      name: "Alice Smith",
      email: "alicesmith@example.com",
      subject: "Re: Project Update",
      date: "Yesterday",
      teaser:
        "Thanks for the update. The progress looks great so far.\nLet's schedule a call to discuss the next steps.",
    },
    {
      name: "Bob Johnson",
      email: "bobjohnson@example.com",
      subject: "Weekend Plans",
      date: "2 days ago",
      teaser:
        "Hey everyone! I'm thinking of organizing a team outing this weekend.\nWould you be interested in a hiking trip or a beach day?",
    },
    {
      name: "Emily Davis",
      email: "emilydavis@example.com",
      subject: "Re: Question about Budget",
      date: "2 days ago",
      teaser:
        "I've reviewed the budget numbers you sent over.\nCan we set up a quick call to discuss some potential adjustments?",
    },
    {
      name: "Michael Wilson",
      email: "michaelwilson@example.com",
      subject: "Important Announcement",
      date: "1 week ago",
      teaser:
        "Please join us for an all-hands meeting this Friday at 3 PM.\nWe have some exciting news to share about the company's future.",
    },
    {
      name: "Sarah Brown",
      email: "sarahbrown@example.com",
      subject: "Re: Feedback on Proposal",
      date: "1 week ago",
      teaser:
        "Thank you for sending over the proposal. I've reviewed it and have some thoughts.\nCould we schedule a meeting to discuss my feedback in detail?",
    },
    {
      name: "David Lee",
      email: "davidlee@example.com",
      subject: "New Project Idea",
      date: "1 week ago",
      teaser:
        "I've been brainstorming and came up with an interesting project concept.\nDo you have time this week to discuss its potential impact and feasibility?",
    },
    {
      name: "Olivia Wilson",
      email: "oliviawilson@example.com",
      subject: "Vacation Plans",
      date: "1 week ago",
      teaser:
        "Just a heads up that I'll be taking a two-week vacation next month.\nI'll make sure all my projects are up to date before I leave.",
    },
    {
      name: "James Martin",
      email: "jamesmartin@example.com",
      subject: "Re: Conference Registration",
      date: "1 week ago",
      teaser:
        "I've completed the registration for the upcoming tech conference.\nLet me know if you need any additional information from my end.",
    },
    {
      name: "Sophia White",
      email: "sophiawhite@example.com",
      subject: "Team Dinner",
      date: "1 week ago",
      teaser:
        "To celebrate our recent project success, I'd like to organize a team dinner.\nAre you available next Friday evening? Please let me know your preferences.",
    },
  ],
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ isCollapsed = false, onToggleCollapse, ...props }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { setOpen } = useSidebar()
  
  // Fetch folders from the backend
  const { data: folders, isLoading: foldersLoading } = useFolders()
  const [mails, setMails] = React.useState(data.mails)
  
  // Get current active folder from pathname
  const getCurrentFolder = () => {
    if (pathname === '/protected/notepad') return 'home'
    const match = pathname.match(/\/protected\/notepad\/folder\/([^/]+)/)
    return match ? match[1] : 'home'
  }
  
  const activeSlug = getCurrentFolder()
  const activeFolder = folders?.find(f => f.slug === activeSlug)

  return (
    <div className={`flex h-screen fixed top-0 left-68 z-40 transition-all duration-300 ${
      isCollapsed ? "w-12" : "w-[350px]"
    }`}>
      {/* First sidebar - Navigation Icons */}
      <Sidebar
        collapsible="none"
        className="!w-[calc(var(--sidebar-width-icon)_+_1px)] border-r h-screen overflow-hidden"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0 justify-center">
                <a href="#" className="flex justify-center">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <Command className="size-4" />
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="px-0">
              <SidebarMenu>
                {foldersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : (
                  folders?.map((folder) => {
                    const IconComponent = getFolderIcon(folder.slug)
                    const isActive = activeSlug === folder.slug
                    const folderUrl = folder.slug === 'home' 
                      ? '/protected/notepad' 
                      : `/protected/notepad/folder/${folder.slug}`
                    
                    return (
                      <SidebarMenuItem key={folder.slug}>
                        <SidebarMenuButton
                          tooltip={{
                            children: (
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{folder.name}</span>
                                {folder.description && (
                                  <span className="text-xs text-muted-foreground">
                                    {folder.description}
                                  </span>
                                )}
                              </div>
                            ),
                            hidden: false,
                          }}
                          onClick={() => {
                            router.push(folderUrl)
                            const mail = data.mails.sort(() => Math.random() - 0.5)
                            setMails(
                              mail.slice(
                                0,
                                Math.max(5, Math.floor(Math.random() * 10) + 1)
                              )
                            )
                            setOpen(true)
                          }}
                          isActive={isActive}
                          className="justify-center px-2"
                        >
                          <IconComponent className="h-4 w-4" />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors"
              aria-label="Toggle sidebar"
            >
              {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              {data.user.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Second sidebar - Mail List */}
      <Sidebar collapsible="none" className={`flex-1 border-r h-screen overflow-hidden transition-all duration-300 ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}>
        <SidebarHeader className="gap-3.5 border-b p-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-foreground text-base font-medium">
              {activeFolder?.name || 'Home'}
            </div>
            <Label className="flex items-center gap-2 text-sm">
              <span>Unreads</span>
              <Switch className="shadow-none" />
            </Label>
          </div>
          <SidebarInput placeholder="Type to search..." />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              {mails.map((mail) => (
                <a
                  href="#"
                  key={mail.email}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-medium">{mail.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{mail.date}</span>
                  </div>
                  <span className="font-medium">{mail.subject}</span>
                  <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                    {mail.teaser}
                  </span>
                </a>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  )
}