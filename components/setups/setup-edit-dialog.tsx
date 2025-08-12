"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { SetupInDB, SetupUpdate, SetupCategory } from '@/lib/types/setups';
import { setupsService } from '@/lib/services/setups-service';
import { toast } from 'sonner';

interface SetupEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: SetupInDB | null;
  onSetupUpdated: (setup: SetupInDB) => void;
}

export function SetupEditDialog({ open, onOpenChange, setup, onSetupUpdated }: SetupEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<SetupUpdate>>({
    name: '',
    description: '',
    category: 'Breakout',
    is_active: true,
    tags: [],
    setup_conditions: {}
  });
  const [newTag, setNewTag] = useState('');

  // Initialize form data when setup changes
  useEffect(() => {
    if (setup) {
      setFormData({
        name: setup.name,
        description: setup.description || '',
        category: setup.category,
        is_active: setup.is_active,
        tags: [...setup.tags],
        setup_conditions: { ...setup.setup_conditions }
      });
      setNewTag('');
    }
  }, [setup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!setup || !formData.name || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const updatedSetup = await setupsService.updateSetup(setup.id, formData as SetupUpdate);
      onSetupUpdated(updatedSetup);
      toast.success('Setup updated successfully!');
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating setup:', error);
      toast.error('Failed to update setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  if (!setup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Trading Setup</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Setup Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Breakout Strategy, Earnings Play"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe your trading setup, entry/exit criteria, etc."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as SetupCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Breakout">Breakout</SelectItem>
                    <SelectItem value="Pullback">Pullback</SelectItem>
                    <SelectItem value="Reversal">Reversal</SelectItem>
                    <SelectItem value="Continuation">Continuation</SelectItem>
                    <SelectItem value="Range">Range</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="is_active">Active Setup</Label>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <Label>Tags</Label>
            <div className="flex items-center space-x-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add a tag and press Enter"
                className="flex-1"
              />
              <Button type="button" onClick={addTag} size="sm" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Setup Conditions */}
          <div className="space-y-3">
            <Label>Setup Conditions (Optional)</Label>
            <Textarea
              value={JSON.stringify(formData.setup_conditions, null, 2)}
              onChange={(e) => {
                try {
                  const conditions = JSON.parse(e.target.value);
                  setFormData(prev => ({ ...prev, setup_conditions: conditions }));
                } catch {
                  // Allow invalid JSON while typing
                }
              }}
              placeholder='{"volume_threshold": 1.5, "breakout_confirmation": "close_above_resistance"}'
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter setup conditions as JSON. This can include technical indicators, price levels, volume requirements, etc.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Setup'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 