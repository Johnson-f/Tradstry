"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Menu, Star, Trash2, FileText, Tag, Clock } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { NoteCard } from "@/components/notebook/note-card";
import { TagManager } from "@/components/notebook/tag-manager";
import { TemplateManager } from "@/components/notebook/template-manager";
import { useNotes, useFolderBySlug, useCreateNote, useTrash, useFavorites } from "@/lib/hooks/use-notes";
import { Note, Template, Tag as TagType } from "@/lib/types/notes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface NoteWithPreview extends Note {
  preview: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function FolderNotebookPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();
  // Using sonner toast
  
  const [selectedNote, setSelectedNote] = useState<NoteWithPreview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const createNoteMutation = useCreateNote();

  // Fetch folder data
  const { data: folder, isLoading: folderLoading } = useFolderBySlug(slug);
  
  // Determine which data to fetch based on folder slug
  const isFavorites = slug === 'favorites';
  const isTrash = slug === 'trash';
  const isTemplates = slug === 'templates';
  const isTags = slug === 'tags';
  const isNotes = slug === 'notes';
  
  // Fetch appropriate data based on folder type
  const { data: folderNotes = [], isLoading: folderNotesLoading, refetch: refetchFolderNotes } = useNotes({ 
    folder_slug: isNotes ? slug : undefined,
    is_archived: false,
    include_deleted: false,
    sort_by: 'updated_at',
    sort_order: 'DESC',
  }, { enabled: !isFavorites && !isTrash && !isTemplates && !isTags });
  
  const { data: favoriteNotes = [], isLoading: favoritesLoading, refetch: refetchFavorites } = useFavorites(
    undefined,
    { enabled: isFavorites }
  );
  
  const { data: trashedNotes = [], isLoading: trashLoading, refetch: refetchTrash } = useTrash(
    undefined,
    { enabled: isTrash }
  );
  
  // Combine and determine which notes to show
  const notes = isFavorites ? favoriteNotes : isTrash ? trashedNotes : folderNotes;
  const notesLoading = isFavorites ? favoritesLoading : isTrash ? trashLoading : folderNotesLoading;
  const refetch = isFavorites ? refetchFavorites : isTrash ? refetchTrash : refetchFolderNotes;

  // Create notes with preview and sort pinned notes first
  const notesWithPreview: NoteWithPreview[] = notes
    .sort((a: Note, b: Note) => {
      if (!isTrash) {  // Don't sort by pin in trash
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .map((note: Note) => {
      let preview = 'No content';
      if (note.content) {
        if (typeof note.content === 'object') {
          const textContent = note.content.text || JSON.stringify(note.content);
          if (typeof textContent === 'string') {
            preview = textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '');
          }
        } else if (typeof note.content === 'string') {
          preview = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');
        }
      }
      return { ...note, preview };
    });

  // Filter notes based on search
  const filteredNotes = notesWithPreview.filter(note => {
    const searchLower = searchQuery.toLowerCase();
    return note.title?.toLowerCase().includes(searchLower) ||
           (typeof note.content === 'string' && note.content.toLowerCase().includes(searchLower)) ||
           (typeof note.content === 'object' && note.content?.text?.toLowerCase().includes(searchLower));
  });

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return;
    if (!folder) {
      toast.error("Folder not found.");
      return;
    }

    try {
      const response = await createNoteMutation.mutateAsync({
        folder_id: folder.id,
        title: newNoteTitle || 'Untitled Note',
        content: { text: newNoteContent },
        is_pinned: false,
        is_favorite: isFavorites,  // Auto-favorite if in favorites folder
        is_archived: false,
      });

      setIsCreateDialogOpen(false);
      setNewNoteTitle('');
      setNewNoteContent('');
      
      toast.success("Note created successfully");

      refetch();
      // Navigate to the new note
      router.push(`/protected/notebook/notes/${response.note_id}`);
    } catch (error) {
      toast.error("Failed to create note. Please try again.");
    }
  };

  const handleTemplateSelect = async (template: Template) => {
    setNewNoteTitle(template.name);
    setNewNoteContent(
      typeof template.content === 'string' 
        ? template.content 
        : template.content?.text || JSON.stringify(template.content)
    );
    setIsCreateDialogOpen(true);
  };

  const handleTagSelect = (tag: TagType) => {
    // Navigate to notes filtered by tag
    router.push(`/protected/notebook/tags/${tag.id}`);
  };

  // Determine folder icon
  const getFolderIcon = () => {
    switch (slug) {
      case 'favorites': return <Star className="h-4 w-4" />;
      case 'trash': return <Trash2 className="h-4 w-4" />;
      case 'templates': return <FileText className="h-4 w-4" />;
      case 'tags': return <Tag className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  // Set first note as selected when notes load
  useEffect(() => {
    if (!selectedNote && filteredNotes.length > 0 && !isTemplates && !isTags) {
      setSelectedNote(filteredNotes[0]);
    }
  }, [filteredNotes, selectedNote, isTemplates, isTags]);

  return (
    <div className="flex h-screen bg-background">
      {/* Navigation Sidebar */}
      <NotebookNavigation />
      
      {/* Desktop Notes Sidebar */}
      <div className={`hidden md:flex md:flex-col border-r transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-16'}`}>
        <div className="p-4">
          {/* Header with folder info */}
          <div className="flex items-center justify-between mb-4">
            {isSidebarOpen && (
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {getFolderIcon()}
                  <span>{folder?.name || slug}</span>
                </div>
                {folder?.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {folder.description}
                  </p>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="h-8 w-8"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {isSidebarOpen && (
            <>
              {/* Don't show search for tags and templates folders */}
              {!isTags && !isTemplates && (
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search notes..."
                    className="w-full pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              )}
              
              {/* Show appropriate action button based on folder type */}
              {!isFavorites && !isTrash && !isTags && !isTemplates && (
                <Button 
                  className="w-full justify-start gap-2 mb-6"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  New Note
                </Button>
              )}
            </>
          )}
        </div>
        
        {isSidebarOpen && (
          <ScrollArea className="flex-1 px-3">
            {isTemplates ? (
              <TemplateManager onTemplateSelect={handleTemplateSelect} />
            ) : isTags ? (
              <TagManager onTagSelect={handleTagSelect} />
            ) : notesLoading || folderLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">
                  {isTrash ? '🗑️' : isFavorites ? '⭐' : '📝'}
                </div>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `No notes found matching "${searchQuery}"`
                    : isTrash 
                    ? 'Trash is empty'
                    : isFavorites
                    ? 'No favorite notes yet'
                    : 'No notes in this folder yet'
                  }
                </p>
                {!searchQuery && !isTrash && !isFavorites && (
                  <Button 
                    className="mt-4" 
                    size="sm"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first note
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isSelected={selectedNote?.id === note.id}
                    isInTrash={isTrash}
                    onNoteDeleted={refetch}
                    onNoteUpdated={refetch}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      {/* Mobile Drawer */}
      <Drawer direction="left">
        <DrawerTrigger asChild>
          <div className="fixed left-4 top-4 z-40 md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </DrawerTrigger>
        <DrawerContent className="h-screen w-80 border-r flex flex-col">
          <div className="p-4">
            {/* Header with folder info */}
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              {getFolderIcon()}
              <span>{folder?.name || slug}</span>
            </div>
            {folder?.description && (
              <p className="text-xs text-muted-foreground mb-4">
                {folder.description}
              </p>
            )}

            {/* Don't show search for tags and templates folders */}
            {!isTags && !isTemplates && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search notes..."
                  className="w-full pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            
            {/* Show appropriate action button based on folder type */}
            {!isFavorites && !isTrash && !isTags && !isTemplates && (
              <Button 
                className="w-full justify-start gap-2 mb-6"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                New Note
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 px-3">
            {isTemplates ? (
              <TemplateManager onTemplateSelect={handleTemplateSelect} />
            ) : isTags ? (
              <TagManager onTagSelect={handleTagSelect} />
            ) : notesLoading || folderLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">
                  {isTrash ? '🗑️' : isFavorites ? '⭐' : '📝'}
                </div>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `No notes found matching "${searchQuery}"`
                    : isTrash 
                    ? 'Trash is empty'
                    : isFavorites
                    ? 'No favorite notes yet'
                    : 'No notes in this folder yet'
                  }
                </p>
                {!searchQuery && !isTrash && !isFavorites && (
                  <Button 
                    className="mt-4" 
                    size="sm"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first note
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isSelected={selectedNote?.id === note.id}
                    isInTrash={isTrash}
                    onNoteDeleted={refetch}
                    onNoteUpdated={refetch}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote && !isTemplates && !isTags ? (
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-3xl mx-auto">
              <div className="mb-2 text-sm text-muted-foreground">
                {formatDate(selectedNote.updated_at)}
              </div>
              <h1 className="text-3xl font-bold mb-8 focus:outline-none">
                {selectedNote.title || 'Untitled'}
              </h1>
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ 
                  __html: typeof selectedNote.content === 'string' 
                    ? selectedNote.content.replace(/\n/g, '<br>') 
                    : selectedNote.content?.text?.replace(/\n/g, '<br>') || ''
                }} />
              </div>
            </div>
          </div>
        ) : !isTemplates && !isTags ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium">No note selected</h3>
              <p className="text-muted-foreground">
                {isTrash 
                  ? "Select a note from the trash to preview it"
                  : isFavorites
                  ? "Select a favorite note to view it"
                  : "Select a note from the sidebar or create a new one to get started."
                }
              </p>
              {!isTrash && !isFavorites && (
                <Button 
                  className="mt-2"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Note
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                {isTemplates ? <FileText className="h-8 w-8 text-muted-foreground" /> : <Tag className="h-8 w-8 text-muted-foreground" />}
              </div>
              <h3 className="text-xl font-medium">
                {isTemplates ? "Manage Templates" : "Manage Tags"}
              </h3>
              <p className="text-muted-foreground">
                {isTemplates 
                  ? "Create and manage note templates from the sidebar"
                  : "Create and manage tags to organize your notes"
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Note Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Note</DialogTitle>
            <DialogDescription>
              {isTemplates && newNoteTitle ? `Creating note from template: ${newNoteTitle}` : "Start writing your new note"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Note title"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
            />
            <Textarea
              placeholder="Start writing your note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              rows={10}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateNote}
              disabled={!newNoteTitle.trim() && !newNoteContent.trim()}
            >
              Create Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
