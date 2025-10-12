"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit2, Trash2, Save, X, FileText, Calendar, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNotesDatabase } from "@/lib/drizzle/notes";
import TailwindAdvancedEditor from "@/components/journal/trade-notes/components/tailwind/advanced-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export function TradeNotesHistoryModal({
  open,
  onOpenChange,
  userId,
}: TradeNotesHistoryModalProps) {
  const { 
    isInitialized,
    getAllNotes, 
    updateNote, 
    deleteNote,
    duplicateNote,
    getStats 
  } = useNotesDatabase(userId);
  
  const [notes, setNotes] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load notes
  const loadNotes = async () => {
    if (!isInitialized) return;
    
    setLoading(true);
    try {
      const notesData = await getAllNotes({
        orderBy: 'updated_at',
        orderDirection: 'desc',
        limit: 50
      });
      setNotes(notesData);
    } catch (error) {
      console.error('Failed to load notes:', error);
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  // Load stats
  const loadStats = async () => {
    if (!isInitialized) return;
    
    try {
      const statsData = await getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  useEffect(() => {
    if (open && isInitialized) {
      loadNotes();
      loadStats();
    }
  }, [open, isInitialized]);

  const handleEdit = (note: any) => {
    setEditingNote({
      id: note.id,
      name: note.name,
      content: note.content || '',
    });
  };

  const handleSave = async () => {
    if (!editingNote) return;

    setIsUpdating(true);
    try {
      await updateNote(editingNote.id, {
        name: editingNote.name,
        content: editingNote.content,
      });
      toast.success("Note updated successfully");
      setEditingNote(null);
      await loadNotes();
      await loadStats();
    } catch (error) {
      toast.error("Failed to update note");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    setIsDeleting(noteId);
    try {
      await deleteNote(noteId);
      toast.success("Note deleted successfully");
      await loadNotes();
      await loadStats();
    } catch (error) {
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDuplicate = async (noteId: string) => {
    try {
      await duplicateNote(noteId);
      toast.success("Note duplicated successfully");
      await loadNotes();
      await loadStats();
    } catch (error) {
      toast.error("Failed to duplicate note");
    }
  };

  const handleCancel = () => {
    setEditingNote(null);
  };

  // Get word count from content
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

  if (!isInitialized) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading notes...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Trading Notes History
          </DialogTitle>
          <DialogDescription>
            View, edit, and manage all your trading notes
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Notes List */}
          <div className="w-80 flex flex-col">
            {/* Stats */}
            {stats && (
              <div className="flex gap-2 text-sm text-muted-foreground mb-4">
                <Badge variant="secondary">{stats.totalNotes} notes</Badge>
                <Badge variant="secondary">{stats.totalWords} words</Badge>
                {stats.lastUpdated && (
                  <Badge variant="outline">
                    Updated {formatDistanceToNow(new Date(stats.lastUpdated), { addSuffix: true })}
                  </Badge>
                )}
              </div>
            )}

            <ScrollArea className="flex-1">
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
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
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
            </ScrollArea>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col">
            {editingNote ? (
              <div className="flex-1 flex flex-col">
                {/* Editor Header */}
                <div className="border-b p-4 flex items-center justify-between">
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
                <div className="flex-1 p-4">
                  <TailwindAdvancedEditor />
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
        <AlertDialog open={!!isDeleting} onOpenChange={() => setIsDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Note</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this note? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => isDeleting && handleDelete(isDeleting)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
