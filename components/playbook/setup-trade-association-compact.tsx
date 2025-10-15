'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { usePlaybookService } from '@/lib/services/playbook-service';
import type { Playbook } from '@/lib/replicache/schemas/playbook';
import { useUserProfile } from '@/hooks/use-user-profile';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

interface PlaybookTradeAssociationCompactProps {
  tradeId: number;
  tradeType: 'stock' | 'option';
  onPlaybookAdded?: () => void;
}

export function SetupTradeAssociationCompact({ tradeId, tradeType, onPlaybookAdded }: PlaybookTradeAssociationCompactProps) {
  const { userId } = useUserProfile();
  const { 
    isInitialized, 
    getPlaybooksForTrade, 
    getAllPlaybooks, 
    tagTrade, 
    untagTrade 
  } = usePlaybookService(userId);

  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [availablePlaybooks, setAvailablePlaybooks] = useState<Playbook[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingPlaybooks, setIsLoadingPlaybooks] = useState(false);

  const loadCurrentPlaybooks = useCallback(async () => {
    if (!isInitialized) return;
    try {
      const currentPlaybooks = await getPlaybooksForTrade(tradeId, tradeType);
      setPlaybooks(currentPlaybooks);
    } catch (error) {
      console.error('Error loading current playbooks:', error);
    }
  }, [isInitialized, getPlaybooksForTrade, tradeId, tradeType]);

  const loadAvailablePlaybooks = useCallback(async () => {
    if (!isInitialized) return;
    setIsLoadingPlaybooks(true);
    try {
      const allPlaybooks = await getAllPlaybooks();
      setAvailablePlaybooks(allPlaybooks);
    } catch (error) {
      console.error('Error loading available playbooks:', error);
      toast.error('Failed to load available playbooks');
    } finally {
      setIsLoadingPlaybooks(false);
    }
  }, [isInitialized, getAllPlaybooks]);

  useEffect(() => {
    loadCurrentPlaybooks();
  }, [loadCurrentPlaybooks]);

  useEffect(() => {
    if (isDialogOpen) {
      loadAvailablePlaybooks();
      loadCurrentPlaybooks();
    }
  }, [isDialogOpen, loadAvailablePlaybooks, loadCurrentPlaybooks]);

  const handleAddPlaybook = async () => {
    if (!selectedPlaybookId || selectedPlaybookId === 'loading' || selectedPlaybookId === 'none') {
      toast.error('Please select a valid playbook');
      return;
    }

    setIsLoading(true);
    try {
      await tagTrade({
        tradeId,
        tradeType,
        setupId: selectedPlaybookId,
      });

      toast.success('Playbook added successfully');
      setSelectedPlaybookId('');
      setIsDialogOpen(false);
      onPlaybookAdded?.();
      loadCurrentPlaybooks();
    } catch (error) {
      console.error('Error adding playbook:', error);
      toast.error('Failed to add playbook');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePlaybook = async (playbookId: string) => {
    try {
      await untagTrade(tradeId, playbookId, tradeType);
      toast.success('Playbook removed successfully');
      loadCurrentPlaybooks();
    } catch (error) {
      console.error('Error removing playbook:', error);
      toast.error('Failed to remove playbook');
    }
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const availablePlaybooksForTrade = availablePlaybooks.filter(
    playbook => !playbooks.some(existingPlaybook => existingPlaybook.id === playbook.id)
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {playbooks.slice(0, 2).map((playbook) => (
        <Badge key={playbook.id} variant="secondary" className="text-xs">
          {playbook.name}
          <button
            onClick={() => handleRemovePlaybook(playbook.id)}
            className="ml-1.5 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      
      {playbooks.length > 2 && (
        <Badge variant="outline" className="text-xs">
          +{playbooks.length - 2}
        </Badge>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleOpenDialog}
            className="h-6 w-6 p-0"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Playbook to {tradeType === 'stock' ? 'Stock' : 'Option'} Trade</DialogTitle>
            <DialogDescription>
              Select a playbook that applies to this trade.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="playbookSelect">Playbook</Label>
              <Select value={selectedPlaybookId} onValueChange={setSelectedPlaybookId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingPlaybooks ? "Loading playbooks..." : "Select a playbook"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingPlaybooks ? (
                    <SelectItem value="loading" disabled>Loading playbooks...</SelectItem>
                  ) : availablePlaybooksForTrade.length === 0 ? (
                    <SelectItem value="none" disabled>No playbooks available</SelectItem>
                  ) : (
                    availablePlaybooksForTrade.map((playbook) => (
                      <SelectItem key={playbook.id} value={playbook.id}>
                        <span className="font-medium">{playbook.name}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {availablePlaybooksForTrade.length === 0 && !isLoadingPlaybooks && (
                <p className="text-xs text-muted-foreground">
                  No playbooks available. Create some in the Playbook section.
                </p>
              )}
            </div>

            {playbooks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Current Playbooks</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {playbooks.map((playbook) => (
                    <div key={playbook.id} className="p-2 border rounded-lg text-sm flex justify-between items-center">
                      <p className="font-medium">{playbook.name}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePlaybook(playbook.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddPlaybook} 
              disabled={isLoading || !selectedPlaybookId || selectedPlaybookId === 'loading' || selectedPlaybookId === 'none' || availablePlaybooksForTrade.length === 0}
            >
              {isLoading ? 'Adding...' : 'Add Playbook'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
