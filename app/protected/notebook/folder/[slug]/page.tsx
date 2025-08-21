"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, MoreVertical, Clock, ArrowLeft, Menu } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { useFolderBySlug, useNotes } from "@/lib/hooks/use-notes";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Drawer, 
  DrawerContent, 
  DrawerTrigger 
} from "@/components/ui/drawer";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { notesService } from "@/lib/services/notes-service";
import { useQueryClient } from "@tanstack/react-query";

type Note = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  preview: string;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface FolderPageProps {
  params: {
    slug: string;
  };
}

export default function FolderPage({ params }: FolderPageProps) {
  const { slug } = params;
  const router = useRouter();
  const [selectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  
  const queryClient = useQueryClient();
  
  const handleCreateNote = async () => {
    if (!newNoteTitle.trim() || !folder) return;
    
    try {
      const noteData = {
        folder_id: folder.id,
        title: newNoteTitle,
        content: {},
        is_pinned: false,
        is_favorite: false,
        is_archived: false,
      };
      
      const response = await notesService.createNote(noteData);
      
      // Close dialog and reset title
      setIsDialogOpen(false);
      setNewNoteTitle('');
      
      // Navigate to the new note
      router.push(`/protected/notebook/notes/${response.note_id}`);
      
      // Invalidate and refetch notes
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    } catch (error) {
      console.error('Error creating note:', error);
    }
  };

  // Fetch folder details
  const { data: folder, isLoading: folderLoading, error: folderError } = useFolderBySlug(slug);
  
  // Fetch notes for this folder
  const { data: notes = [], isLoading: notesLoading } = useNotes({ 
    folder_slug: slug,
    is_archived: false,
    include_deleted: false,
    sort_by: 'updated_at',
    sort_order: 'DESC',
  });

  // Filter notes based on search
  const filteredNotes = notes.filter((note: any) =>
    note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Create preview for notes
  const notesWithPreview = filteredNotes.map((note: any) => {
    let preview = 'No content';
    
    if (note.content) {
      // Handle case where content is an object
      if (typeof note.content === 'object') {
        const textContent = note.content.text || JSON.stringify(note.content);
        if (typeof textContent === 'string') {
          preview = textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '');
        }
      } else if (typeof note.content === 'string') {
        // Handle case where content is a string
        preview = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');
      }
    }
    
    return {
      ...note,
      preview,
    };
  });

  if (folderLoading) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading folder...</p>
          </div>
        </div>
      </div>
    );
  }

  if (folderError || !folder) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl">📁</div>
            <h3 className="text-xl font-medium">Folder not found</h3>
            <p className="text-muted-foreground">
              The folder "{slug}" could not be found.
            </p>
            <Button asChild>
              <Link href="/protected/notebook">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Notebook
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Navigation Sidebar */}
      <NotebookNavigation />
      
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex md:flex-col border-r transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-16'}`}>
        <div className="p-4">
          {/* Folder Header */}
          <div className="flex justify-between items-center">
            {isSidebarOpen && (
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{folder.name}</h2>
                {folder.description && (
                  <p className="text-sm text-muted-foreground mt-1">{folder.description}</p>
                )}
              </div>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {isSidebarOpen && (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={`Search in ${folder.name}...`}
                  className="w-full pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* New Note Button */}
              {folder.slug !== 'trash' && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full justify-start gap-2 mb-6">
                      <Plus className="h-4 w-4" />
                      New Note
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Note</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Note title"
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                      />
                      <Button 
                        onClick={handleCreateNote}
                        disabled={!newNoteTitle.trim()}
                      >
                        Create Note
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
        
        {isSidebarOpen && (
          <>
            {/* Notes List */}
            <ScrollArea className="flex-1 px-3">
              {notesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                  ))}
                </div>
              ) : notesWithPreview.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchQuery 
                      ? `No notes found matching "${searchQuery}"`
                      : `No notes in ${folder.name} yet`
                    }
                  </p>
                  {!searchQuery && folder.slug !== 'trash' && (
                    <Button className="mt-4" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first note
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {notesWithPreview.map((note) => (
                    <div 
                      key={note.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                        selectedNote?.id === note.id ? 'bg-accent' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => router.push(`/protected/notebook/notes/${note.id}`)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-medium truncate">{note.title || 'Untitled'}</h3>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                        {note.preview}
                      </p>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatDate(note.updated_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
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
        <DrawerContent className="h-screen w-80 border-r flex flex-col data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0">
          <div className="p-4">
            {/* Folder Header */}
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{folder.name}</h2>
              {folder.description && (
                <p className="text-sm text-muted-foreground mt-1">{folder.description}</p>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder={`Search in ${folder.name}...`}
                className="w-full pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* New Note Button */}
            {folder.slug !== 'trash' && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full justify-start gap-2 mb-6">
                    <Plus className="h-4 w-4" />
                    New Note
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Note</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Note title"
                      value={newNoteTitle}
                      onChange={(e) => setNewNoteTitle(e.target.value)}
                    />
                    <Button 
                      onClick={handleCreateNote}
                      disabled={!newNoteTitle.trim()}
                    >
                      Create Note
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          {/* Notes List */}
          <ScrollArea className="flex-1 px-3">
            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                ))}
              </div>
            ) : notesWithPreview.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `No notes found matching "${searchQuery}"`
                    : `No notes in ${folder.name} yet`
                  }
                </p>
                {!searchQuery && folder.slug !== 'trash' && (
                  <Button className="mt-4" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first note
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {notesWithPreview.map((note) => (
                  <div 
                    key={note.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                      selectedNote?.id === note.id ? 'bg-accent' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => router.push(`/protected/notebook/notes/${note.id}`)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-medium truncate">{note.title || 'Untitled'}</h3>
                      <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                      {note.preview}
                    </p>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDate(note.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-3xl mx-auto">
              <div className="mb-2 text-sm text-muted-foreground">
                {formatDate(selectedNote.updated_at)}
              </div>
              <h1 className="text-3xl font-bold mb-8 focus:outline-none" contentEditable>
                {selectedNote.title || 'Untitled'}
              </h1>
              <div 
                className="prose dark:prose-invert max-w-none min-h-[60vh] focus:outline-none" 
                contentEditable
                dangerouslySetInnerHTML={{ __html: selectedNote.content || 'Start writing...' }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium">No note selected</h3>
              <p className="text-muted-foreground">
                Select a note from {folder.name} to get started{folder.slug !== 'trash' ? ' or create a new one' : ''}.
              </p>
              {folder.slug !== 'trash' && (
                <Button className="mt-2">
                  <Plus className="mr-2 h-4 w-4" />
                  New Note
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
