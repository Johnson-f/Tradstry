/**
 * Playbook Edit Dialog Component
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlaybookService, playbookUtils } from '@/lib/services/playbook-service';
import type { Playbook, PlaybookFormData } from '@/lib/drizzle/playbook';
import { useUserProfile } from '@/hooks/use-user-profile';
import { toast } from 'sonner';

interface PlaybookEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbook: Playbook | null;
  onPlaybookUpdated: (playbook: Playbook) => void;
}

export function PlaybookEditDialog({
  open,
  onOpenChange,
  playbook,
  onPlaybookUpdated,
}: PlaybookEditDialogProps) {
  const { userId } = useUserProfile();
  const playbookService = usePlaybookService(userId);
  
  const [formData, setFormData] = useState<PlaybookFormData>({
    name: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Update form data when playbook changes
  useEffect(() => {
    if (playbook) {
      setFormData({
        name: playbook.name,
        description: playbook.description || '',
      });
    }
  }, [playbook]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!playbook) return;
    
    // Validate form data
    const validation = playbookUtils.validatePlaybookData(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    setErrors([]);

    try {
      const updatedPlaybook = await playbookService.updatePlaybook(playbook.id, formData);
      onPlaybookUpdated(updatedPlaybook);
      
      onOpenChange(false);
      toast.success('Playbook updated successfully');
    } catch (error) {
      console.error('Error updating playbook:', error);
      toast.error('Failed to update playbook');
      setErrors(['Failed to update playbook. Please try again.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof PlaybookFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setErrors([]);
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
          <DialogTitle>Edit Playbook</DialogTitle>
          <DialogDescription>
            Update the details of your trading setup playbook.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Bull Flag Breakout"
                disabled={isSubmitting}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe this trading setup..."
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            
            {errors.length > 0 && (
              <div className="text-sm text-destructive">
                {errors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Playbook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
