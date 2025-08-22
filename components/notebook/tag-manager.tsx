"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Tag, X, Edit2, MoreVertical, MoreHorizontal, Trash2 } from "lucide-react";
import {
  useTagsWithCounts,
  useRenameTag,
  useGetOrCreateTag,
  useDeleteTag,
} from '@/lib/hooks/use-notes';
import { toast } from "sonner";
import { Tag as TagType } from "@/lib/types/notes";

interface TagManagerProps {
  onTagSelect?: (tag: TagType) => void;
  showCreateButton?: boolean;
}

export function TagManager({ onTagSelect, showCreateButton = true }: TagManagerProps) {
  const { data: tags = [], isLoading } = useTagsWithCounts();
  const createTagMutation = useGetOrCreateTag();
  const renameTagMutation = useRenameTag();
  const deleteTagMutation = useDeleteTag();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [editTagName, setEditTagName] = useState("");

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await createTagMutation.mutateAsync(newTagName);
      setIsCreateDialogOpen(false);
      setNewTagName("");
      toast.success("Tag created", {
        description: `Tag "${newTagName}" has been created successfully.`,
      });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to create tag. Please try again.",
      });
    }
  };

  const handleRenameTag = async () => {
    if (!editingTag || !editTagName.trim()) return;

    try {
      await renameTagMutation.mutateAsync({
        tagId: editingTag.id,
        newName: editTagName.trim(),
      });
      setIsEditDialogOpen(false);
      setEditingTag(null);
      setEditTagName("");
      toast.success("Tag renamed", {
        description: `Tag \"${editingTag.name}\" has been renamed to \"${editTagName}\".`,
      });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to rename tag. Please try again.",
      });
    }
  };

  const handleDelete = (tagId: string, tagName: string) => {
    if (confirm(`Are you sure you want to delete the tag \"${tagName}\"? This will remove it from all notes.`)) {
      deleteTagMutation.mutate(tagId, {
        onSuccess: () => {
          toast.success('Tag deleted successfully');
        },
        onError: (error) => {
          toast.error('Failed to delete tag');
          console.error('Error deleting tag:', error);
        },
      });
    }
  };

  const handleEditTag = (tag: TagType) => {
    setEditingTag(tag);
    setEditTagName(tag.name);
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showCreateButton && (
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          New Tag
        </Button>
      )}

      <div className="space-y-2">
        {tags.length === 0 ? (
          <div className="text-center py-8">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No tags yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first tag to organize your notes
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer group"
                onClick={() => onTagSelect?.(tag)}
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="secondary"
                    style={{ backgroundColor: tag.color || undefined }}
                  >
                    <Tag className="h-3 w-3 mr-1" />
                    {tag.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {tag.note_count || 0} notes
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleEditTag(tag)}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(tag.id, tag.name)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Tag Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
            <DialogDescription>
              Enter a name for your new tag. You can assign it to notes later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateTag();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              Create Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tag Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tag</DialogTitle>
            <DialogDescription>
              Enter a new name for the tag "{editingTag?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="New tag name"
              value={editTagName}
              onChange={(e) => setEditTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameTag();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameTag} disabled={!editTagName.trim()}>
              Rename Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
