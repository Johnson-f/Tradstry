/**
 * Playbook Delete Dialog Component
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePlaybooks } from '@/lib/replicache/hooks/use-playbooks';
import type { Playbook } from '@/lib/replicache/schemas/playbook';
import { useUserProfile } from '@/hooks/use-user-profile';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface PlaybookDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbook: Playbook | null;
  onPlaybookDeleted: (playbookId: string) => void;
}

export function PlaybookDeleteDialog({
  open,
  onOpenChange,
  playbook,
  onPlaybookDeleted,
}: PlaybookDeleteDialogProps) {
  const { userId } = useUserProfile();
  const { deletePlaybook } = usePlaybooks(userId);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!playbook) return;
    
    setIsDeleting(true);
    setError(null);

    try {
      await deletePlaybook(playbook.id);
      onPlaybookDeleted(playbook.id);
      onOpenChange(false);
      toast.success('Playbook deleted successfully');
    } catch (error) {
      console.error('Error deleting playbook:', error);
      toast.error('Failed to delete playbook');
      setError('Failed to delete playbook. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setError(null);
      onOpenChange(false);
    }
  };

  if (!playbook) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Playbook
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{playbook.name}"? This action cannot be undone.
            Any trades associated with this playbook will have their associations removed.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Playbook Details:</h4>
            <p className="text-sm text-muted-foreground">
              <strong>Name:</strong> {playbook.name}
            </p>
            {playbook.description && (
              <p className="text-sm text-muted-foreground">
                <strong>Description:</strong> {playbook.description}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              <strong>Created:</strong> {new Date(playbook.createdAt).toLocaleDateString()}
            </p>
          </div>
          
          {error && (
            <div className="mt-4 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Playbook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
