"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  MoreVertical, 
  Clock, 
  Edit, 
  Trash2, 
  Star, 
  StarOff,
  Pin,
  PinOff,
  RotateCcw,
  Trash,
  Copy
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeleteNote, useUpdateNote, useToggleNoteFavorite, useMoveNoteToTrash, useRestoreNoteFromTrash } from "@/lib/hooks/use-notes";
import { Note } from "@/lib/types/notes";
import { toast } from "sonner";

interface NoteCardProps {
  note: Note & { preview?: string };
  isSelected?: boolean;
  showFolderActions?: boolean;
  isInTrash?: boolean;
  onNoteDeleted?: () => void;
  onNoteUpdated?: () => void;
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

export function NoteCard({ 
  note, 
  isSelected = false, 
  showFolderActions = true,
  isInTrash = false,
  onNoteDeleted,
  onNoteUpdated
}: NoteCardProps) {
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(
    typeof note.content === 'string' 
      ? note.content 
      : note.content?.text || JSON.stringify(note.content || {})
  );

  const deleteNoteMutation = useDeleteNote();
  const updateNoteMutation = useUpdateNote();
  const toggleFavoriteMutation = useToggleNoteFavorite();
  const moveToTrashMutation = useMoveNoteToTrash();
  const restoreFromTrashMutation = useRestoreNoteFromTrash();

  const handleEdit = async () => {
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        note: {
          title: editTitle,
          content: { text: editContent }
        }
      });
      
      setIsEditDialogOpen(false);
      toast.success("Note updated", {
        description: "Your note has been updated successfully.",
      });
      
      if (onNoteUpdated) {
        onNoteUpdated();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update note. Please try again.",
      });
    }
  };

  const handleDelete = async (permanent: boolean = false) => {
    try {
      if (isInTrash && permanent) {
        await deleteNoteMutation.mutateAsync({
          noteId: note.id,
          permanent: true
        });
        toast.success("Note deleted permanently", {
          description: "The note has been permanently deleted.",
        });
      } else {
        await moveToTrashMutation.mutateAsync(note.id);
        toast.success("Note moved to trash", {
          description: "You can restore it from the trash folder.",
        });
      }
      
      setIsDeleteDialogOpen(false);
      
      if (onNoteDeleted) {
        onNoteDeleted();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to delete note. Please try again.",
      });
    }
  };

  const handleRestore = async () => {
    try {
      await restoreFromTrashMutation.mutateAsync({
        noteId: note.id,
        targetFolderId: note.folder_id
      });
      
      toast.success("Note restored", {
        description: "The note has been restored from trash.",
      });
      
      if (onNoteUpdated) {
        onNoteUpdated();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to restore note. Please try again.",
      });
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await toggleFavoriteMutation.mutateAsync(note.id);
      
      toast.success(note.is_favorite ? "Removed from favorites" : "Added to favorites", {
        description: note.is_favorite 
          ? "Note removed from favorites." 
          : "Note added to favorites.",
      });
      
      if (onNoteUpdated) {
        onNoteUpdated();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update favorite status. Please try again.",
      });
    }
  };

  const handleTogglePin = async () => {
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        note: {
          is_pinned: !note.is_pinned
        }
      });
      
      toast.success(note.is_pinned ? "Unpinned" : "Pinned", {
        description: note.is_pinned 
          ? "Note unpinned." 
          : "Note pinned to top.",
      });
      
      if (onNoteUpdated) {
        onNoteUpdated();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update pin status. Please try again.",
      });
    }
  };

  const handleDuplicate = async () => {
    try {
      const { id, ...noteData } = note;
      await updateNoteMutation.mutateAsync({
        noteId: crypto.randomUUID(),
        note: {
          ...noteData,
          title: `${noteData.title} (Copy)`,
        }
      });
      
      toast.success("Note duplicated", {
        description: "A copy of the note has been created.",
      });
      
      if (onNoteUpdated) {
        onNoteUpdated();
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to duplicate note. Please try again.",
      });
    }
  };

  return (
    <>
      <div 
        className={`p-3 rounded-lg cursor-pointer transition-colors group ${
          isSelected ? 'bg-accent' : 'hover:bg-muted/50'
        }`}
        onClick={() => !isInTrash && router.push(`/protected/notebook/notes/${note.id}`)}
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-medium truncate flex-1">
            {note.is_pinned && <Pin className="inline h-3 w-3 mr-1" />}
            {note.title || 'Untitled'}
          </h3>
          {showFolderActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isInTrash ? (
                  <>
                    <DropdownMenuItem onClick={handleRestore}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="text-destructive"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Delete Permanently
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDuplicate}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleToggleFavorite}>
                      {note.is_favorite ? (
                        <>
                          <StarOff className="mr-2 h-4 w-4" />
                          Remove from Favorites
                        </>
                      ) : (
                        <>
                          <Star className="mr-2 h-4 w-4" />
                          Add to Favorites
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleTogglePin}>
                      {note.is_pinned ? (
                        <>
                          <PinOff className="mr-2 h-4 w-4" />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-4 w-4" />
                          Pin to Top
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Move to Trash
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
          {note.preview || 'No content'}
        </p>
        <div className="flex items-center text-xs text-muted-foreground">
          <Clock className="h-3 w-3 mr-1" />
          {formatDate(note.updated_at)}
          {note.is_favorite && <Star className="h-3 w-3 ml-2 fill-current" />}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                placeholder="Note title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Textarea
                placeholder="Note content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isInTrash ? "Delete Note Permanently" : "Move to Trash"}
            </DialogTitle>
            <DialogDescription>
              {isInTrash 
                ? "This action cannot be undone. The note will be permanently deleted."
                : "The note will be moved to trash. You can restore it later from the trash folder."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleDelete(isInTrash)}
            >
              {isInTrash ? "Delete Permanently" : "Move to Trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
