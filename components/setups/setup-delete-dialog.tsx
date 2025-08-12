"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { SetupInDB } from '@/lib/types/setups';
import { setupsService } from '@/lib/services/setups-service';
import { toast } from 'sonner';

interface SetupDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: SetupInDB | null;
  onSetupDeleted: (setupId: number) => void;
}

export function SetupDeleteDialog({ open, onOpenChange, setup, onSetupDeleted }: SetupDeleteDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!setup) return;

    try {
      setLoading(true);
      await setupsService.deleteSetup(setup.id);
      onSetupDeleted(setup.id);
      toast.success('Setup deleted successfully!');
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting setup:', error);
      toast.error('Failed to delete setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!setup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Setup
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{setup.name}&quot;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete Setup'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 