"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Edit2, Trash2, Save, X, FileText, Calendar, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNotes } from "@/lib/replicache/hooks/use-notes";
import TailwindAdvancedEditor from "@/components/journal/trade-notes/components/tailwind/advanced-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TradeNotesHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

interface EditingNote {
  id: string;
  name: string;
  content: string;
}

// Helper function to get word count from content
const getWordCount = (content: string) => {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    const text = JSON.stringify(parsed);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  } catch {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }
};

export function TradeNotesHistoryModal({
  open,
  onOpenChange,
  userId,
}: TradeNotesHistoryModalProps) {
  const { 
    notes: allNotes,
    updateNote, 
    deleteNote,
    createNote,
    isInitialized 
  } = useNotes(userId);
  
  // Compute stats from notes
  const notes = allNotes || [];
  const stats = {
    totalNotes: notes.length,
    totalWords: notes.reduce((sum, note) => sum + getWordCount(note.content || ''), 0),
    lastUpdated: notes.length > 0 ? notes[0]?.updatedAt : null
  };
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Notes are automatically loaded via Replicache subscription

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onOpenChange]);

  const handleEdit = (note: any) => {
    setEditingNote({
      id: note.id,
      name: note.name,
      content: note.content || '',
    });
    setNoteContent(note.content || '');
  };

  const handleSave = async () => {
    if (!editingNote) return;

    setIsUpdating(true);
    try {
      await updateNote(editingNote.id, {
        name: editingNote.name,
        content: noteContent,
      });
      toast.success("Note updated successfully");
      setEditingNote(null);
      setNoteContent("");
      // Replicache will automatically update via subscription
    } catch (error) {
      toast.error("Failed to update note");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      toast.success("Note deleted successfully");
      if (editingNote?.id === noteId) {
        setEditingNote(null);
        setNoteContent("");
      }
      // Replicache will automatically update via subscription
    } catch (error) {
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDuplicate = async (noteId: string) => {
    try {
      const originalNote = notes.find(n => n.id === noteId);
      if (!originalNote) {
        toast.error("Note not found");
        return;
      }
      
      await createNote({
        userId,
        name: `${originalNote.name} (Copy)`,
        content: originalNote.content,
      });
      toast.success("Note duplicated successfully");
      // Replicache will automatically update via subscription
    } catch (error) {
      toast.error("Failed to duplicate note");
    }
  };

  const handleCancel = () => {
    setEditingNote(null);
    setNoteContent("");
  };

  if (!open) return null;

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-background border rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading notes...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="bg-background border rounded-lg w-[98vw] h-[98vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Trading Notes History</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                View, edit, and manage all your trading notes
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-4 px-6 pb-6 overflow-hidden">
          {/* Notes List Sidebar */}
          <div className="w-80 flex flex-col overflow-hidden">
            {/* Stats */}
            {stats && (
              <div className="flex gap-2 text-sm text-muted-foreground mb-4 shrink-0 flex-wrap">
                <Badge variant="secondary">{stats.totalNotes} notes</Badge>
                <Badge variant="secondary">{stats.totalWords} words</Badge>
                {stats.lastUpdated && (
                  <Badge variant="outline">
                    Updated {formatDistanceToNow(new Date(stats.lastUpdated), { addSuffix: true })}
                  </Badge>
                )}
              </div>
            )}

            {/* Notes List */}
            <ScrollArea className="flex-1">
              <div className="pr-4">
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="p-3 border rounded-lg">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No notes found</p>
                    <p className="text-sm">
                      Start creating notes to see them here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${
                          editingNote?.id === note.id ? 'bg-accent border-primary' : 'border-border'
                        }`}
                        onClick={() => handleEdit(note)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{note.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</span>
                              {note.content && (
                                <>
                                  <span>•</span>
                                  <span>{getWordCount(note.content)} words</span>
                                </>
                              )}
                            </div>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={(e) => e.stopPropagation()}
                                className="h-6 w-6 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(note.id);
                              }}>
                                <FileText className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsDeleting(note.id);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Vertical Separator */}
          <Separator orientation="vertical" className="h-full" />

          {/* Editor Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {editingNote ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Editor Header */}
                <div className="border-b p-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <Input
                      value={editingNote.name}
                      onChange={(e) => setEditingNote({ ...editingNote, name: e.target.value })}
                      className="font-semibold text-lg border-none shadow-none p-0 h-auto"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={isUpdating}>
                      <Save className="h-4 w-4 mr-2" />
                      {isUpdating ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={handleCancel} variant="outline">
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      <TailwindAdvancedEditor 
                        key={editingNote?.id ? `note-${editingNote.id}` : `empty-${Date.now()}`}
                        initialHtmlContent={editingNote?.content ?? ''}
                        onContentChange={(content) => setNoteContent(content)}
                        onSave={(content) => {
                          if (editingNote) {
                            handleSave();
                          }
                        }}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">
                    Select a note to start editing
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a note from the sidebar to begin editing.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {isDeleting && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center">
            <div className="bg-background border rounded-lg p-6 max-w-md w-full mx-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Delete Note</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Are you sure you want to delete this note? This action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleting(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => isDeleting && handleDelete(isDeleting)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}