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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit2, Trash2, Save, X, FileText, Star } from "lucide-react";
import { toast } from "sonner";
import { useTradeNotesManagement } from "@/lib/hooks/use-trade-notes";
import {
  TradeNoteInDB,
  TradeNoteUpdate,
  TradePhase,
} from "@/lib/services/trade-notes-service";

interface TradeNotesHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditingNote extends TradeNoteUpdate {
  id: number;
}

export function TradeNotesHistoryModal({
  open,
  onOpenChange,
}: TradeNotesHistoryModalProps) {
  const { notes, isLoading, error, updateNote, deleteNote, refetch } =
    useTradeNotesManagement();
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const handleEdit = (note: TradeNoteInDB) => {
    setEditingNote({
      id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      rating: note.rating,
      phase: note.phase,
    });
  };

  const handleSave = async () => {
    if (!editingNote) return;

    setIsUpdating(true);
    try {
      await updateNote(editingNote.id, {
        title: editingNote.title,
        content: editingNote.content,
        tags: editingNote.tags,
        rating: editingNote.rating,
        phase: editingNote.phase,
      });
      toast.success("Note updated successfully");
      setEditingNote(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update note");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    setIsDeleting(noteId);
    try {
      await deleteNote(noteId);
      toast.success("Note deleted successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCancel = () => {
    setEditingNote(null);
  };

  const getPhaseColor = (phase: TradePhase | null) => {
    switch (phase) {
      case TradePhase.PRE_ENTRY:
        return "bg-blue-50 text-blue-700 border-blue-200";
      case TradePhase.ENTRY:
        return "bg-green-50 text-green-700 border-green-200";
      case TradePhase.MANAGEMENT:
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case TradePhase.EXIT:
        return "bg-red-50 text-red-700 border-red-200";
      case TradePhase.POST_ANALYSIS:
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getRatingStars = (rating: number | null) => {
    if (!rating) return null;
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
      />
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Trade Notes History
          </DialogTitle>
          <DialogDescription>
            View, edit, and manage all your trade notes
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              Error loading notes: {error.message}
            </div>
          ) : !notes || notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No trade notes found</p>
              <p className="text-sm">
                Start adding notes to your trades to see them here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <Card key={note.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        {editingNote?.id === note.id ? (
                          <Input
                            value={editingNote.title}
                            onChange={(e) =>
                              setEditingNote({
                                ...editingNote,
                                title: e.target.value,
                              })
                            }
                            className="font-semibold"
                            placeholder="Note title"
                          />
                        ) : (
                          <CardTitle className="text-lg">
                            {note.title}
                          </CardTitle>
                        )}

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{note.trade_symbol}</span>
                          <span>•</span>
                          <span className="capitalize">{note.trade_type}</span>
                          <span>•</span>
                          <span>
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {note.phase && (
                            <Badge
                              variant="outline"
                              className={getPhaseColor(note.phase)}
                            >
                              {note.phase.replace("_", " ")}
                            </Badge>
                          )}

                          {note.rating && (
                            <div className="flex items-center gap-1">
                              {getRatingStars(note.rating)}
                            </div>
                          )}

                          {note.tags && note.tags.length > 0 && (
                            <div className="flex gap-1">
                              {note.tags.map((tag, index) => (
                                <Badge
                                  key={index}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {editingNote?.id === note.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={handleSave}
                              disabled={isUpdating}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancel}
                              disabled={isUpdating}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(note)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(note.id)}
                              disabled={isDeleting === note.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {editingNote?.id === note.id ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="content">Content</Label>
                          <Textarea
                            id="content"
                            value={editingNote.content}
                            onChange={(e) =>
                              setEditingNote({
                                ...editingNote,
                                content: e.target.value,
                              })
                            }
                            rows={4}
                            placeholder="Note content"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="phase">Phase</Label>
                            <Select
                              value={editingNote.phase || ""}
                              onValueChange={(value) =>
                                setEditingNote({
                                  ...editingNote,
                                  phase: value as TradePhase,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select phase" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={TradePhase.PRE_ENTRY}>
                                  Pre Entry
                                </SelectItem>
                                <SelectItem value={TradePhase.ENTRY}>
                                  Entry
                                </SelectItem>
                                <SelectItem value={TradePhase.MANAGEMENT}>
                                  Management
                                </SelectItem>
                                <SelectItem value={TradePhase.EXIT}>
                                  Exit
                                </SelectItem>
                                <SelectItem value={TradePhase.POST_ANALYSIS}>
                                  Post Analysis
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="rating">Rating</Label>
                            <Select
                              value={editingNote.rating?.toString() || ""}
                              onValueChange={(value) =>
                                setEditingNote({
                                  ...editingNote,
                                  rating: value ? parseInt(value) : null,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select rating" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 Star</SelectItem>
                                <SelectItem value="2">2 Stars</SelectItem>
                                <SelectItem value="3">3 Stars</SelectItem>
                                <SelectItem value="4">4 Stars</SelectItem>
                                <SelectItem value="5">5 Stars</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="tags">Tags (comma separated)</Label>
                          <Input
                            id="tags"
                            value={editingNote.tags?.join(", ") || ""}
                            onChange={(e) =>
                              setEditingNote({
                                ...editingNote,
                                tags: e.target.value
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="tag1, tag2, tag3"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">
                        {note.content}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
