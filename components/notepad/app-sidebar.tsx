"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { 
  ArchiveX, 
  Command, 
  Trash2, 
  Upload, 
  Users, 
  Star, 
  FileText, 
  Calendar, 
  Home, 
  Tag, 
  BookTemplate, 
  Plus, 
  MoreHorizontal, 
  RotateCcw, 
  X, 
  PanelLeft,
  Inbox,
  Send,
  PanelLeftClose
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
import { useNotes, useNotesByFolder, useFolders, useTemplates, useTagsWithCounts, useNotesByTag, useTrash, useRestoreNoteFromTrash, usePermanentDeleteNote } from "@/lib/hooks/use-notes"

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
  
  // Get current active folder or tag from pathname
  const getCurrentFolder = () => {
    if (pathname === '/protected/notepad') return 'home'
    const folderMatch = pathname.match(/\/protected\/notepad\/folder\/([^/]+)/)
    if (folderMatch) return folderMatch[1]
    const tagMatch = pathname.match(/\/protected\/notepad\/tag\/([^/]+)/)
    if (tagMatch) return `tag:${tagMatch[1]}`
    return 'home'
  }
  
  const activeSlug = getCurrentFolder()
  
  // Fetch folders from the backend
  const { data: folders, isLoading: foldersLoading } = useFolders()
  
  // Fetch data based on active folder
  const getNotesParams = () => {
    if (activeSlug === 'templates') {
      // Templates folder doesn't use notes
      return undefined
    } else if (activeSlug === 'home') {
      // For home folder, get all notes (not deleted)
      return { is_deleted: false }
    } else if (activeSlug === 'notes') {
      // For notes folder, get notes in the notes folder
      const notesFolder = folders?.find(f => f.slug === 'notes')
      return notesFolder ? { folder_id: notesFolder.id } : undefined
    } else if (activeSlug === 'favorites') {
      // For favorites, get favorite notes
      return { is_favorite: true }
    } else if (activeSlug === 'trash') {
      // For trash folder, don't use regular notes hook - use trash hook instead
      return undefined
    }
    // For other folders, get notes in that specific folder
    const currentFolder = folders?.find(f => f.slug === activeSlug)
    return currentFolder ? { folder_id: currentFolder.id } : undefined
  }
  
  const { data: notes, isLoading: notesLoading } = useNotes(getNotesParams())
  const { data: templates, isLoading: templatesLoading } = useTemplates()
  const { data: tags, isLoading: tagsLoading } = useTagsWithCounts()
  const { data: trashNotes, isLoading: trashLoading } = useTrash()
  
  // Get notes by tag if we're viewing a specific tag
  const currentTagId = activeSlug.startsWith('tag:') ? activeSlug.replace('tag:', '') : null
  const { data: tagNotes, isLoading: tagNotesLoading } = useNotesByTag(currentTagId || '')
  
  // Mutation hooks for trash operations
  const restoreNoteMutation = useRestoreNoteFromTrash()
  const permanentDeleteMutation = usePermanentDeleteNote()
  const [mails, setMails] = React.useState(data.mails)
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
              {activeSlug === 'tags' ? (
                // Tags view
                tagsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : tags && tags.length > 0 ? (
                  tags.map((tag) => {
                    const tagUrl = `/protected/notepad/tag/${tag.id}`
                    const isActiveTag = pathname === tagUrl
                    
                    return (
                      <button
                        key={tag.id}
                        onClick={() => router.push(tagUrl)}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight text-left last:border-b-0 transition-colors ${
                          isActiveTag ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: tag.color }}
                          ></div>
                          <span className="font-medium truncate flex-1">{tag.name}</span>
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {tag.note_count}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(tag.updated_at).toLocaleDateString()}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Tag className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      No tags created yet
                    </span>
                  </div>
                )
              ) : activeSlug.startsWith('tag:') ? (
                // Individual tag notes view
                tagNotesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : tagNotes && tagNotes.length > 0 ? (
                  tagNotes.map((note) => {
                    const noteUrl = `/protected/notepad/note/${note.id}`
                    const isActiveNote = pathname === noteUrl
                    
                    // Generate preview from content
                    const getPreview = (content: any) => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: any): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (node.text) return node.text
                        if (node.children && Array.isArray(node.children)) {
                          return node.children.map(extractText).join(' ')
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    return (
                      <button
                        key={note.id}
                        onClick={() => router.push(noteUrl)}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight text-left last:border-b-0 transition-colors ${
                          isActiveNote ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="font-medium truncate flex-1">{note.title}</span>
                          <div className="flex items-center gap-1">
                            {note.is_favorite && (
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            )}
                            {note.is_pinned && (
                              <div className="h-2 w-2 bg-primary rounded-full" />
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                        <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                          {getPreview(note.content)}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      No notes with this tag
                    </span>
                  </div>
                )
              ) : activeSlug === 'templates' ? (
                // Templates view
                templatesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : templates && templates.length > 0 ? (
                  templates.map((template) => {
                    const templateUrl = `/protected/notepad/template/${template.id}`
                    const isActiveTemplate = pathname === templateUrl
                    
                    // Generate preview from content
                    const getPreview = (content: any) => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: any): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (node.text) return node.text
                        if (node.children && Array.isArray(node.children)) {
                          return node.children.map(extractText).join(' ')
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    return (
                      <button
                        key={template.id}
                        onClick={() => router.push(templateUrl)}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight text-left last:border-b-0 transition-colors ${
                          isActiveTemplate ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="font-medium truncate flex-1">{template.name}</span>
                          <div className="flex items-center gap-1">
                            {template.is_system && (
                              <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                System
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(template.updated_at).toLocaleDateString()}
                        </span>
                        {template.description && (
                          <span className="text-xs text-muted-foreground italic">
                            {template.description}
                          </span>
                        )}
                        <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                          {getPreview(template.content)}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      No templates available
                    </span>
                  </div>
                )
              ) : activeSlug === 'trash' ? (
                // Trash view
                trashLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : trashNotes && trashNotes.length > 0 ? (
                  trashNotes.map((note) => {
                    const noteUrl = `/protected/notepad/note/${note.id}`
                    const isActiveNote = pathname === noteUrl
                    
                    // Generate preview from content
                    const getPreview = (content: any) => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: any): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (node.text) return node.text
                        if (node.children && Array.isArray(node.children)) {
                          return node.children.map(extractText).join(' ')
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    const handleRestore = (e: React.MouseEvent) => {
                      e.stopPropagation()
                      restoreNoteMutation.mutate({ noteId: note.id })
                    }
                    
                    const handlePermanentDelete = (e: React.MouseEvent) => {
                      e.stopPropagation()
                      if (confirm('Are you sure you want to permanently delete this note? This action cannot be undone.')) {
                        permanentDeleteMutation.mutate(note.id)
                      }
                    }
                    
                    return (
                      <div
                        key={note.id}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 transition-colors ${
                          isActiveNote ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <button
                            onClick={() => router.push(noteUrl)}
                            className="font-medium truncate flex-1 text-left"
                          >
                            {note.title}
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleRestore}
                              className="p-1 hover:bg-green-100 hover:text-green-700 rounded transition-colors"
                              title="Restore note"
                              disabled={restoreNoteMutation.isPending}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                            <button
                              onClick={handlePermanentDelete}
                              className="p-1 hover:bg-red-100 hover:text-red-700 rounded transition-colors"
                              title="Permanently delete"
                              disabled={permanentDeleteMutation.isPending}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Deleted: {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                        <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                          {getPreview(note.content)}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Trash2 className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      Trash is empty
                    </span>
                  </div>
                )
              ) : (
                // Notes view
                notesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sidebar-primary"></div>
                  </div>
                ) : notes && notes.length > 0 ? (
                  notes.map((note) => {
                    const noteUrl = `/protected/notepad/note/${note.id}`
                    const isActiveNote = pathname === noteUrl
                    
                    // Generate preview from content
                    const getPreview = (content: any) => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: any): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (node.text) return node.text
                        if (node.children && Array.isArray(node.children)) {
                          return node.children.map(extractText).join(' ')
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    return (
                      <button
                        key={note.id}
                        onClick={() => router.push(noteUrl)}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight text-left last:border-b-0 transition-colors ${
                          isActiveNote ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="font-medium truncate flex-1">{note.title}</span>
                          <div className="flex items-center gap-1">
                            {note.is_favorite && (
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            )}
                            {note.is_pinned && (
                              <div className="h-2 w-2 bg-primary rounded-full" />
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                        <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                          {getPreview(note.content)}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      No notes in this folder
                    </span>
                  </div>
                )
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  )
}