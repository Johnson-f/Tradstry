"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Star, StarOff, Tag, Calendar, Image } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useCreateTradeNote,
  useTradeNotesByTrade,
} from "@/lib/hooks/use-trade-notes";
import {
  TradeNoteCreate,
  TradeNoteInDB,
} from "@/lib/services/trade-notes-service";

interface TradeNotesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeId: number;
  tradeType: "stock" | "option";
  tradeSymbol?: string;
}

export function TradeNotesModal({
  open,
  onOpenChange,
  tradeId,
  tradeType,
  tradeSymbol,
}: TradeNotesModalProps) {
  const [formData, setFormData] = useState<Partial<TradeNoteCreate>>({
    trade_id: tradeId,
    trade_type: tradeType,
    title: "",
    content: "",
    tags: [],
    rating: undefined,
    phase: undefined,
    image_id: undefined,
  });
  const [newTag, setNewTag] = useState("");

  const createMutation = useCreateTradeNote();
  const { data: existingNotes = [], isLoading: notesLoading } = useTradeNotesByTrade(tradeId, tradeType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title?.trim() || !formData.content?.trim()) {
      toast.error("Please fill in both title and content");
      return;
    }

    try {
      const noteData: TradeNoteCreate = {
        trade_id: tradeId,
        trade_type: tradeType,
        title: formData.title.trim(),
        content: formData.content.trim(),
        tags: formData.tags,
        rating: formData.rating,
        phase: formData.phase,
        image_id: formData.image_id,
      };

      await createMutation.mutateAsync(noteData);
      toast.success("Trade note created successfully");
      
      // Reset form
      setFormData({
        trade_id: tradeId,
        trade_type: tradeType,
        title: "",
        content: "",
        tags: [],
        rating: undefined,
        phase: undefined,
        image_id: undefined,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating trade note:", error);
      toast.error("Failed to create trade note");
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), newTag.trim()],
      });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((tag) => tag !== tagToRemove) || [],
    });
  };

  const handleRatingClick = (rating: number) => {
    setFormData({
      ...formData,
      rating: formData.rating === rating ? undefined : rating,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Trade Note
            {tradeSymbol && (
              <Badge variant="outline" className="ml-2">
                {tradeSymbol}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Add a note for this {tradeType} trade. You can include your reasoning, observations, or lessons learned.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title || ""}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Enter a title for your note"
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={formData.content || ""}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Write your trade note here..."
              rows={4}
              required
            />
          </div>

          {/* Phase */}
          <div className="space-y-2">
            <Label htmlFor="phase">Trade Phase</Label>
            <Select
              value={formData.phase || ""}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  phase: value as "planning" | "execution" | "reflection",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select trade phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Planning
                  </div>
                </SelectItem>
                <SelectItem value="execution">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Execution
                  </div>
                </SelectItem>
                <SelectItem value="reflection">
                  <div className="flex items-center gap-2">
                    <StarOff className="h-4 w-4" />
                    Reflection
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRatingClick(rating)}
                  className="p-1"
                >
                  <Star
                    className={`h-5 w-5 ${
                      formData.rating && formData.rating >= rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </Button>
              ))}
              {formData.rating && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, rating: undefined })}
                  className="ml-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button type="button" onClick={handleAddTag} size="sm">
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Note"}
            </Button>
          </DialogFooter>
        </form>

        {/* Existing Notes */}
        {existingNotes.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Existing Notes ({existingNotes.length})
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {existingNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="text-sm font-medium">{note.title}</h5>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {note.content}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {note.phase && (
                            <Badge variant="outline" className="text-xs">
                              {note.phase}
                            </Badge>
                          )}
                          {note.rating && (
                            <div className="flex items-center gap-1">
                              {[...Array(note.rating)].map((_, i) => (
                                <Star
                                  key={i}
                                  className="h-3 w-3 fill-yellow-400 text-yellow-400"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
