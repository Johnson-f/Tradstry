"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, MoreVertical, Clock, ArrowLeft } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { useFolderBySlug, useNotes } from "@/lib/hooks/use-notes";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
  const notesWithPreview = filteredNotes.map((note: any) => ({
    ...note,
    preview: note.content?.substring(0, 100) + (note.content?.length > 100 ? '...' : '') || 'No content',
  }));

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
      
      {/* Notes Sidebar */}
      <div className="w-80 border-r flex flex-col">
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
            <Button className="w-full justify-start gap-2 mb-6">
              <Plus className="h-4 w-4" />
              New Note
            </Button>
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
              <div className="text-4xl mb-2">📝</div>
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
                  onClick={() => setSelectedNote(note)}
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
      </div>

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
