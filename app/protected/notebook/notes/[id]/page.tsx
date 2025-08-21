"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MoreVertical, Heart, Pin, Archive, Trash2 } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { notesService } from "@/lib/services/notes-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface NotePageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Note {
  id: string;
  title: string;
  content: Record<string, any>;
  folder_id: string;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
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

export default function NotePage({ params }: NotePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  // Fetch note data
  const { data: note, isLoading, error } = useQuery({
    queryKey: ['note', id],
    queryFn: async () => {
      const response = await notesService.getNote(id);
      return response;
    },
  });

  // Update local state when note data is loaded
  useEffect(() => {
    if (note) {
      setTitle(note.title || 'Untitled');
      setContent(note.content?.text || '');
    }
  }, [note]);

  const handleSave = async () => {
    if (!note) return;
    
    try {
      await notesService.updateNote(id, {
        title: title,
        content: { text: content },
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['note', id] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleToggleFavorite = async () => {
    if (!note) return;
    
    try {
      await notesService.toggleNoteFavorite(id);
      queryClient.invalidateQueries({ queryKey: ['note', id] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading note...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl">📄</div>
            <h3 className="text-xl font-medium">Note not found</h3>
            <p className="text-muted-foreground">
              The note could not be found or may have been deleted.
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
      <NotebookNavigation />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/protected/notebook">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              {formatDate(note.updated_at)}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleToggleFavorite}>
              <Heart className={`h-4 w-4 ${note.is_favorite ? 'fill-current text-red-500' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <Pin className={`h-4 w-4 ${note.is_pinned ? 'fill-current' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-8 max-w-4xl mx-auto">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-3xl font-bold mb-8 w-full bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground"
              placeholder="Note title..."
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-[60vh] bg-transparent border-none outline-none focus:ring-0 resize-none text-base leading-relaxed placeholder:text-muted-foreground"
              placeholder="Start writing..."
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
