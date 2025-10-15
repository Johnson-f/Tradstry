/**
 * Playbook Create Dialog Component
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlaybooks } from '@/lib/replicache/hooks/use-playbooks';
import type { Playbook, PlaybookFormData } from '@/lib/replicache/schemas/playbook';
import { useUserProfile } from '@/hooks/use-user-profile';
import { toast } from 'sonner';

interface PlaybookCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaybookCreated: (playbook: Playbook) => void;
}

export function PlaybookCreateDialog({
  open,
  onOpenChange,
  onPlaybookCreated,
}: PlaybookCreateDialogProps) {
  const { userId } = useUserProfile();
  const { playbooks, createPlaybook } = usePlaybooks(userId);
  
  const [formData, setFormData] = useState<PlaybookFormData>({
    name: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Inline utility functions
  const validatePlaybookData = (data: PlaybookFormData): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Playbook name is required');
    }

    if (data.name && data.name.length > 100) {
      errors.push('Playbook name must be less than 100 characters');
    }

    if (data.description && data.description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const generateUniqueName = async (baseName: string): Promise<string> => {
    let name = baseName;
    let counter = 1;

    try {
      while (true) {
        const existingPlaybooks = (playbooks || []).filter(p => p.name === name);
        if (existingPlaybooks.length === 0) {
          break;
        }
        name = `${baseName} (${counter})`;
        counter++;
      }
    } catch (error) {
      console.warn('Error checking for existing playbook names, using base name:', error);
      return baseName;
    }

    return name;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validation = validatePlaybookData(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    setErrors([]);

    try {
      // Generate unique name if needed
      const uniqueName = await generateUniqueName(formData.name);
      
      const playbookData: PlaybookFormData = {
        ...formData,
        name: uniqueName,
      };

      const newPlaybook = await createPlaybook(playbookData);
      onPlaybookCreated(newPlaybook);
      
      // Reset form
      setFormData({ name: '', description: '' });
      onOpenChange(false);
      
      toast.success('Playbook created successfully');
    } catch (error) {
      console.error('Error creating playbook:', error);
      toast.error('Failed to create playbook');
      setErrors(['Failed to create playbook. Please try again.']);
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
      setFormData({ name: '', description: '' });
      setErrors([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Playbook</DialogTitle>
          <DialogDescription>
            Create a new trading setup playbook to organize your strategies.
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
              {isSubmitting ? 'Creating...' : 'Create Playbook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
