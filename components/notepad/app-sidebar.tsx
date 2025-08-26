"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { 
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
  PanelLeftClose,
  Edit,
  Trash
} from "lucide-react"


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useNotes, useFolders, useTemplates, useTagsWithCounts as useTags, useNotesByTag as useTagNotes, useTrash, useRestoreNoteFromTrash, usePermanentDeleteNote, useCreateNote, useCreateTag, useDeleteNote, useUpdateNote, useDeleteTag, useRenameTag, useDeleteTemplate, useUpdateTemplate } from "@/lib/hooks/use-notes"
import { useRealtimeNotes } from "@/lib/hooks/useRealtimeUpdates"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

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


interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ isCollapsed = false, onToggleCollapse, ...props }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { setOpen } = useSidebar()
  
  // Set up real-time updates for notes
  const queryClient = useQueryClient()
  useRealtimeNotes(queryClient)
  
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
  
  const { data: notes, isLoading: notesLoading } = useNotes({
    folder_slug: activeSlug === 'home' ? undefined : activeSlug,
    limit: 50
  })
  const { data: templates, isLoading: templatesLoading } = useTemplates()
  const { data: tags, isLoading: tagsLoading } = useTags()
  const { data: tagNotes, isLoading: tagNotesLoading } = useTagNotes(
    activeSlug.startsWith('tag:') ? activeSlug.replace('tag:', '') : undefined
  )
  const { data: trashNotes, isLoading: trashLoading } = useTrash()
  
  // Get notes by tag if we're viewing a specific tag
  const currentTagId = activeSlug.startsWith('tag:') ? activeSlug.replace('tag:', '') : null
  
  // Mutation hooks for operations
  const restoreNoteMutation = useRestoreNoteFromTrash()
  const permanentDeleteMutation = usePermanentDeleteNote()
  const createNoteMutation = useCreateNote()
  const createTagMutation = useCreateTag()
  const deleteNoteMutation = useDeleteNote()
  const updateNoteMutation = useUpdateNote()
  const deleteTagMutation = useDeleteTag()
  const renameTagMutation = useRenameTag()
  const deleteTemplateMutation = useDeleteTemplate()
  const updateTemplateMutation = useUpdateTemplate()
  
  // State for popover forms
  const [newNoteTitle, setNewNoteTitle] = React.useState("")
  const [newTagName, setNewTagName] = React.useState("")
  const [newTemplateName, setNewTemplateName] = React.useState("")
  const [isNotePopoverOpen, setIsNotePopoverOpen] = React.useState(false)
  const [isTagPopoverOpen, setIsTagPopoverOpen] = React.useState(false)
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = React.useState(false)
  
  // State for edit forms
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null)
  const [editingTagId, setEditingTagId] = React.useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = React.useState<string | null>(null)
  const [editNoteTitle, setEditNoteTitle] = React.useState("")
  const [editTagName, setEditTagName] = React.useState("")
  const [editTemplateName, setEditTemplateName] = React.useState("")
  
  // State for delete confirmations
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [itemToDelete, setItemToDelete] = React.useState<{type: 'note' | 'tag' | 'template', id: string, name: string} | null>(null)
  
  const activeFolder = folders?.find(f => f.slug === activeSlug)

  // Handle form submissions
  const handleCreateNote = async () => {
    if (!newNoteTitle.trim()) return
    
    try {
      const currentFolder = folders?.find(f => f.slug === activeSlug)
      const folderId = currentFolder?.id || folders?.find(f => f.slug === 'home')?.id
      
      await createNoteMutation.mutateAsync({
        folder_id: folderId,
        title: newNoteTitle,
        content: { root: { children: [], direction: null, format: "", indent: 0, type: "root" } }
      })
      
      toast.success("Note created successfully!")
      setNewNoteTitle("")
      setIsNotePopoverOpen(false)
    } catch (error) {
      console.error('Failed to create note:', error)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    
    try {
      await createTagMutation.mutateAsync(newTagName)
      toast.success("Tag created successfully!")
      setNewTagName("")
      setIsTagPopoverOpen(false)
    } catch (error) {
      toast.error("Failed to create tag")
      console.error('Failed to create tag:', error)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return
    
    try {
      await updateTemplateMutation.mutateAsync({
        name: newTemplateName,
        description: "",
        content: { root: { children: [], direction: null, format: "", indent: 0, type: "root" } }
      })
      toast.success("Template created successfully!")
      setNewTemplateName("")
      setIsTemplatePopoverOpen(false)
    } catch (error) {
      toast.error("Failed to create template")
      console.error('Failed to create template:', error)
    }
  }

  // Handle edit operations
  const handleEditNote = async (noteId: string, newTitle: string) => {
    if (!newTitle.trim()) return
    
    try {
      await updateNoteMutation.mutateAsync({
        noteId,
        note: { title: newTitle }
      })
      toast.success("Note updated successfully!")
      setEditingNoteId(null)
      setEditNoteTitle("")
    } catch (error) {
      toast.error("Failed to update note")
      console.error('Failed to update note:', error)
    }
  }

  const handleEditTag = async (tagId: string, newName: string) => {
    if (!newName.trim()) return
    
    try {
      await renameTagMutation.mutateAsync({ tagId, newName })
      toast.success("Tag renamed successfully!")
      setEditingTagId(null)
      setEditTagName("")
    } catch (error) {
      toast.error("Failed to rename tag")
      console.error('Failed to rename tag:', error)
    }
  }

  const handleEditTemplate = async (templateId: string, newName: string) => {
    if (!newName.trim()) return
    
    try {
      await updateTemplateMutation.mutateAsync({ templateId, name: newName })
      toast.success("Template updated successfully!")
      setEditingTemplateId(null)
      setEditTemplateName("")
    } catch (error) {
      toast.error("Failed to update template")
      console.error('Failed to update template:', error)
    }
  }

  // Handle delete operations
  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return
    
    try {
      switch (itemToDelete.type) {
        case 'note':
          await deleteNoteMutation.mutateAsync({ noteId: itemToDelete.id })
          toast.success("Note deleted successfully!")
          break
        case 'tag':
          await deleteTagMutation.mutateAsync(itemToDelete.id)
          toast.success("Tag deleted successfully!")
          break
        case 'template':
          await deleteTemplateMutation.mutateAsync(itemToDelete.id)
          toast.success("Template deleted successfully!")
          break
      }
      setDeleteConfirmOpen(false)
      setItemToDelete(null)
    } catch (error) {
      toast.error(`Failed to delete ${itemToDelete.type}`)
      console.error(`Failed to delete ${itemToDelete.type}:`, error)
    }
  }

  const openDeleteConfirm = (type: 'note' | 'tag' | 'template', id: string, name: string) => {
    setItemToDelete({ type, id, name })
    setDeleteConfirmOpen(true)
  }

  const startEdit = (type: 'note' | 'tag' | 'template', id: string, currentName: string) => {
    switch (type) {
      case 'note':
        setEditingNoteId(id)
        setEditNoteTitle(currentName)
        break
      case 'tag':
        setEditingTagId(id)
        setEditTagName(currentName)
        break
      case 'template':
        setEditingTemplateId(id)
        setEditTemplateName(currentName)
        break
    }
  }

  // Determine what button to show based on active folder
  const getActionButton = () => {
    if (activeSlug === 'tags') {
      return (
        <Popover open={isTagPopoverOpen} onOpenChange={setIsTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Plus className="h-4 w-4 mr-1" />
              New Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <h4 className="font-medium">Create New Tag</h4>
              <Input
                placeholder="Tag name..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTag()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsTagPopoverOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateTag} disabled={!newTagName.trim() || createTagMutation.isPending}>
                  {createTagMutation.isPending ? 'Creating...' : 'Create Tag'}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )
    }
    
    if (activeSlug === 'templates') {
      return (
        <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Plus className="h-4 w-4 mr-1" />
              New Template
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <h4 className="font-medium">Create New Template</h4>
              <Input
                placeholder="Template name..."
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTemplate()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsTemplatePopoverOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateTemplate} disabled={!newTemplateName.trim() || updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )
    }
    
    // For home, notes, and other folders that can contain notes
    if (activeSlug === 'home' || activeSlug === 'notes' || (activeFolder && !['favorites', 'trash', 'tags', 'templates'].includes(activeSlug))) {
      return (
        <Popover open={isNotePopoverOpen} onOpenChange={setIsNotePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Plus className="h-4 w-4 mr-1" />
              New Note
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <h4 className="font-medium">Create New Note</h4>
              <Input
                placeholder="Note title..."
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateNote()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsNotePopoverOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateNote} disabled={!newNoteTitle.trim() || createNoteMutation.isPending}>
                  {createNoteMutation.isPending ? 'Creating...' : 'Create Note'}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )
    }
    
    return null
  }

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
              U
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
            {getActionButton()}
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
                      <div
                        key={tag.id}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 transition-colors ${
                          isActiveTag ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: tag.color }}
                          ></div>
                          {editingTagId === tag.id ? (
                            <Input
                              value={editTagName}
                              onChange={(e) => setEditTagName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleEditTag(tag.id, editTagName)
                                } else if (e.key === 'Escape') {
                                  setEditingTagId(null)
                                  setEditTagName("")
                                }
                              }}
                              onBlur={() => {
                                setEditingTagId(null)
                                setEditTagName("")
                              }}
                              className="h-6 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => router.push(tagUrl)}
                              className="font-medium truncate flex-1 text-left"
                            >
                              {tag.name}
                            </button>
                          )}
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {tag.note_count}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEdit('tag', tag.id, tag.name)}>
                                <Edit className="h-3 w-3 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => openDeleteConfirm('tag', tag.id, tag.name)}
                                className="text-destructive"
                              >
                                <Trash className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(tag.updated_at).toLocaleDateString()}
                        </span>
                      </div>
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
                    const getPreview = (content: Record<string, unknown> | null | undefined): string => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: unknown): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.text && typeof nodeObj.text === 'string') return nodeObj.text
                        }
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.children && Array.isArray(nodeObj.children)) {
                            return nodeObj.children.map(extractText).join(' ')
                          }
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
                      No notes in this tag
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
                    const getPreview = (content: Record<string, unknown> | null | undefined): string => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: unknown): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.text && typeof nodeObj.text === 'string') return nodeObj.text
                        }
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.children && Array.isArray(nodeObj.children)) {
                            return nodeObj.children.map(extractText).join(' ')
                          }
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    return (
                      <div
                        key={template.id}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 transition-colors ${
                          isActiveTemplate ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          {editingTemplateId === template.id ? (
                            <Input
                              value={editTemplateName}
                              onChange={(e) => setEditTemplateName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleEditTemplate(template.id, editTemplateName)
                                } else if (e.key === 'Escape') {
                                  setEditingTemplateId(null)
                                  setEditTemplateName("")
                                }
                              }}
                              onBlur={() => {
                                setEditingTemplateId(null)
                                setEditTemplateName("")
                              }}
                              className="h-6 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => router.push(templateUrl)}
                              className="font-medium truncate flex-1 text-left"
                            >
                              {template.name}
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            {template.is_system && (
                              <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                System
                              </div>
                            )}
                            {!template.is_system && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => startEdit('template', template.id, template.name)}>
                                    <Edit className="h-3 w-3 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => openDeleteConfirm('template', template.id, template.name)}
                                    className="text-destructive"
                                  >
                                    <Trash className="h-3 w-3 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                      </div>
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
                    const getPreview = (content: Record<string, unknown> | null | undefined): string => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: unknown): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.text && typeof nodeObj.text === 'string') return nodeObj.text
                        }
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.children && Array.isArray(nodeObj.children)) {
                            return nodeObj.children.map(extractText).join(' ')
                          }
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
                        permanentDeleteMutation.mutate({ noteId: note.id, permanent: true })
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
                    const getPreview = (content: Record<string, unknown> | null | undefined): string => {
                      if (!content || typeof content !== 'object') return 'No content'
                      // Extract text from Lexical JSON structure
                      const extractText = (node: unknown): string => {
                        if (!node) return ''
                        if (typeof node === 'string') return node
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.text && typeof nodeObj.text === 'string') return nodeObj.text
                        }
                        if (typeof node === 'object' && node !== null) {
                          const nodeObj = node as Record<string, unknown>
                          if (nodeObj.children && Array.isArray(nodeObj.children)) {
                            return nodeObj.children.map(extractText).join(' ')
                          }
                        }
                        return ''
                      }
                      const text = extractText(content)
                      return text.length > 100 ? text.substring(0, 100) + '...' : text || 'No content'
                    }
                    
                    return (
                      <div
                        key={note.id}
                        className={`w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 transition-colors ${
                          isActiveNote ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          {editingNoteId === note.id ? (
                            <Input
                              value={editNoteTitle}
                              onChange={(e) => setEditNoteTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleEditNote(note.id, editNoteTitle)
                                } else if (e.key === 'Escape') {
                                  setEditingNoteId(null)
                                  setEditNoteTitle("")
                                }
                              }}
                              onBlur={() => {
                                setEditingNoteId(null)
                                setEditNoteTitle("")
                              }}
                              className="h-6 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => router.push(noteUrl)}
                              className="font-medium truncate flex-1 text-left"
                            >
                              {note.title}
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            {note.is_favorite && (
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            )}
                            {note.is_pinned && (
                              <div className="h-2 w-2 bg-primary rounded-full" />
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startEdit('note', note.id, note.title)}>
                                  <Edit className="h-3 w-3 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => openDeleteConfirm('note', note.id, note.title)}
                                  className="text-destructive"
                                >
                                  <Trash className="h-3 w-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                        <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground whitespace-break-spaces">
                          {getPreview(note.content)}
                        </span>
                      </div>
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
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}