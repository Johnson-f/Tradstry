"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Home, Menu } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { NoteCard } from "@/components/notebook/note-card";
import { useNotes, useFolderBySlug, useCreateNote } from "@/lib/hooks/use-notes";
import { Note } from "@/lib/types/notes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

export default function NotebookPage() {
  const [selectedNote, setSelectedNote] = useState<NoteWithPreview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const router = useRouter();
  // Using sonner toast
  const queryClient = useQueryClient();
  const createNoteMutation = useCreateNote();

  // Fetch home folder data and ALL notes (not limited to home folder)
  const { data: homeFolder } = useFolderBySlug('home');
  const { data: notes = [], isLoading: notesLoading, refetch } = useNotes({ 
    is_archived: false,
    include_deleted: false,
    sort_by: 'updated_at',
    sort_order: 'DESC',
  });

  // Create notes with preview and sort pinned notes first
  const notesWithPreview: NoteWithPreview[] = notes
    .sort((a: Note, b: Note) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
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

    try {
      const homeFolder = await queryClient.fetchQuery({
        queryKey: ['notes', 'folders', 'slug', 'home'],
        queryFn: () => useFolderBySlug('home'),
      });

      const response = await createNoteMutation.mutateAsync({
        folder_id: homeFolder?.id || '',
        title: newNoteTitle || 'Untitled Note',
        content: { text: newNoteContent },
        is_pinned: false,
        is_favorite: false,
        is_archived: false,
      });

      setIsCreateDialogOpen(false);
      setNewNoteTitle('');
      setNewNoteContent('');
      
      toast.success("Note created successfully");

      refetch();
      router.push(`/protected/notebook/notes/${response.note_id}`);
    } catch (error) {
      toast.error("Failed to create note. Please try again.");
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Navigation Sidebar */}
      <NotebookNavigation />
      
      {/* Desktop Notes Sidebar */}
      <div className={`hidden md:flex md:flex-col border-r transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-16'}`}>
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            {isSidebarOpen && (
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <Home className="h-4 w-4" />
                  <span>All Notes</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  View and manage all your notes
                </p>
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
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search all notes..."
                  className="w-full pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <Button 
                className="w-full justify-start gap-2 mb-6"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                New Note
              </Button>
            </>
          )}
        </div>
        
        {isSidebarOpen && (
          <ScrollArea className="flex-1 px-3">
            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📝</div>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `No notes found matching "${searchQuery}"`
                    : 'No notes yet'
                  }
                </p>
                {!searchQuery && (
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
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Home className="h-4 w-4" />
              <span>All Notes</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              View and manage all your notes
            </p>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search all notes..."
                className="w-full pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Button 
              className="w-full justify-start gap-2 mb-6"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Note
            </Button>
          </div>

          <ScrollArea className="flex-1 px-3">
            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted animate-pulse h-20" />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📝</div>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `No notes found matching "${searchQuery}"`
                    : 'No notes yet'
                  }
                </p>
                {!searchQuery && (
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
                Select a note from the sidebar or create a new one to get started.
              </p>
              <Button 
                className="mt-2"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Note
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Note Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Note</DialogTitle>
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