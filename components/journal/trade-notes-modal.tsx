"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, FileText, Save, X, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotes } from "@/lib/replicache/hooks/use-notes";
import TailwindAdvancedEditor from "@/components/journal/trade-notes/components/tailwind/advanced-editor";
import { formatDistanceToNow } from "date-fns";

interface TradeNotesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  tradeId?: number;
  tradeType?: "stock" | "option";
  tradeSymbol?: string;
}

export function TradeNotesModal({
  open,
  onOpenChange,
  userId,
  tradeId,
  tradeType,
  tradeSymbol,
}: TradeNotesModalProps) {
  const [noteName, setNoteName] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { createNote, updateNote, deleteNote, isInitialized, notes } = useNotes(userId);

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

  const handleCreateNote = async () => {
    if (!noteName.trim()) {
      toast.error("Please enter a note name");
      return;
    }

    if (!userId) {
      toast.error("User ID is missing");
      return;
    }

    setIsSaving(true);
    try {
      const newNote = await createNote({
        name: noteName.trim(),
        content: noteContent || ""
      });
      
      toast.success("Note created successfully");
      setNoteName("");
      setNoteContent("");
      setShowCreateForm(false);
      setSelectedNote(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      toast.error("Failed to create note");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectNote = (note: { id: string; name: string; content?: string }) => {
    setSelectedNote(note);
    setNoteContent(note.content || "");
    setShowCreateForm(false);
  };

  const handleUpdateNote = async () => {
    if (!selectedNote) return;

    setIsSaving(true);
    try {
      await updateNote(selectedNote.id, {
        name: selectedNote.name,
        content: noteContent,
      });
      toast.success("Note updated successfully");
    } catch (error) {
      console.error("Error updating note:", error);
      toast.error("Failed to update note");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setIsDeleting(noteId);
    try {
      await deleteNote(noteId);
      toast.success("Note deleted successfully");
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
        setNoteContent("");
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCancel = () => {
    setNoteName("");
    setNoteContent("");
    setShowCreateForm(false);
    setSelectedNote(null);
    onOpenChange(false);
  };

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
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Trading Notes</h2>
            {tradeSymbol && (
              <Badge variant="outline" className="ml-2">
                {tradeSymbol}
              </Badge>
            )}
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
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage your trading notes with rich text editing capabilities.
          </p>
          </div>

        <div className="flex flex-1 gap-4 px-6 pb-6 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 flex flex-col overflow-hidden">
            {/* Create New Note Button */}
            <div className="mb-5 shrink-0">
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="w-full"
                disabled={isSaving}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Note
              </Button>
          </div>

            {/* Create Form */}
            {showCreateForm && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/30 shrink-0">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="newNoteName">Note Name *</Label>
                    <Input
                      id="newNoteName"
                      value={noteName}
                      onChange={(e) => setNoteName(e.target.value)}
                      placeholder="Enter note name"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                <Button
                      onClick={handleCreateNote} 
                      disabled={isSaving || !noteName.trim()}
                  size="sm"
                      className="flex-1"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Creating..." : "Create"}
                </Button>
                <Button
                      onClick={() => {
                        setShowCreateForm(false);
                        setNoteName("");
                      }}
                      variant="outline"
                  size="sm"
                >
                      <X className="h-4 w-4" />
                </Button>
            </div>
          </div>
              </div>
            )}

            {/* Notes List */}
            <ScrollArea className="flex-1">
              <div className="pr-4">
                {!notes || notes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No notes found</p>
                    <p className="text-sm">Create your first note to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(notes || []).map((note: { id: string; name: string; content?: string; updatedAt: string }) => (
                  <div
                    key={note.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${
                        selectedNote?.id === note.id ? 'bg-accent border-primary' : 'border-border'
                      }`}
                      onClick={() => handleSelectNote(note)}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsDeleting(note.id);
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedNote ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Note Header */}
                <div className="border-b p-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <Input
                      value={selectedNote.name}
                      onChange={(e) => setSelectedNote({ ...selectedNote, name: e.target.value })}
                      className="font-semibold text-lg border-none shadow-none p-0 h-auto"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleUpdateNote} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={handleCancel} variant="outline">
                      <X className="h-4 w-4 mr-2" />
                      Close
                    </Button>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      <TailwindAdvancedEditor 
                        key={selectedNote?.id ? `note-${selectedNote.id}` : `empty-${Date.now()}`}
                        initialHtmlContent={selectedNote?.content ?? ''}
                        onContentChange={(content) => setNoteContent(content)}
                        onSave={(content) => {
                          if (selectedNote) {
                            handleUpdateNote();
                          }
                        }}
                        tradeNoteId={tradeId?.toString()}
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
                    Choose a note from the sidebar or create a new one.
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
                    onClick={() => isDeleting && handleDeleteNote(isDeleting)}
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