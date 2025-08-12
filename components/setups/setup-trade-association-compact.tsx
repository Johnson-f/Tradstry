'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { setupsService } from '@/lib/services/setups-service';
import { SetupTradeAssociation, SetupInDB } from '@/lib/types/setups';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface SetupTradeAssociationCompactProps {
  tradeId: number;
  tradeType: 'stock' | 'option';
  onSetupAdded?: () => void;
}

export function SetupTradeAssociationCompact({ tradeId, tradeType, onSetupAdded }: SetupTradeAssociationCompactProps) {
  const [selectedSetupId, setSelectedSetupId] = useState<string>('');
  const [confidenceRating, setConfidenceRating] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [setups, setSetups] = useState<SetupTradeAssociation[]>([]);
  const [availableSetups, setAvailableSetups] = useState<SetupInDB[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingSetups, setIsLoadingSetups] = useState(false);

  // Load available setups when component mounts
  useEffect(() => {
    if (isDialogOpen) {
      loadAvailableSetups();
      loadCurrentSetups();
    }
  }, [isDialogOpen]);

  const loadAvailableSetups = async () => {
    setIsLoadingSetups(true);
    try {
      const setups = await setupsService.getSetups();
      setAvailableSetups(setups);
    } catch (error) {
      console.error('Error loading available setups:', error);
      toast.error('Failed to load available setups');
    } finally {
      setIsLoadingSetups(false);
    }
  };

  const loadCurrentSetups = async () => {
    try {
      if (tradeType === 'stock') {
        const stockSetups = await setupsService.getSetupsForStock(tradeId);
        setSetups(stockSetups);
      } else {
        const optionSetups = await setupsService.getSetupsForOption(tradeId);
        setSetups(optionSetups);
      }
    } catch (error) {
      console.error('Error loading current setups:', error);
    }
  };

  const handleAddSetup = async () => {
    if (!selectedSetupId || selectedSetupId === 'loading' || selectedSetupId === 'none') {
      toast.error('Please select a valid setup');
      return;
    }

    setIsLoading(true);
    try {
      if (tradeType === 'stock') {
        await setupsService.addSetupToStock(
          tradeId,
          parseInt(selectedSetupId),
          confidenceRating ? parseInt(confidenceRating) : undefined,
          notes || undefined
        );
      } else {
        await setupsService.addSetupToOption(
          tradeId,
          parseInt(selectedSetupId),
          confidenceRating ? parseInt(confidenceRating) : undefined,
          notes || undefined
        );
      }

      toast.success('Setup added successfully');
      setSelectedSetupId('');
      setConfidenceRating('');
      setNotes('');
      setIsDialogOpen(false);
      onSetupAdded?.();
      loadCurrentSetups();
    } catch (error) {
      console.error('Error adding setup:', error);
      toast.error('Failed to add setup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  // Filter out setups that are already associated with this trade
  const availableSetupsForTrade = availableSetups.filter(
    setup => !setups.some(existingSetup => existingSetup.setup_id === setup.id)
  );

  return (
    <div className="flex items-center gap-2">
      {/* Show existing setups as badges */}
      {setups.slice(0, 2).map((setup) => (
        <Badge key={setup.setup_id} variant="secondary" className="text-xs">
          {setup.setup_name}
        </Badge>
      ))}
      
      {/* Show count if more than 2 setups */}
      {setups.length > 2 && (
        <Badge variant="outline" className="text-xs">
          +{setups.length - 2}
        </Badge>
      )}

      {/* Add Setup Dialog */}
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Setup to {tradeType === 'stock' ? 'Stock' : 'Option'} Trade</DialogTitle>
            <DialogDescription>
              Select a setup pattern that applies to this trade.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="setupSelect">Setup Pattern</Label>
                <Select value={selectedSetupId} onValueChange={setSelectedSetupId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingSetups ? "Loading setups..." : "Select a setup"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingSetups ? (
                      <SelectItem value="loading" disabled>Loading setups...</SelectItem>
                    ) : availableSetupsForTrade.length === 0 ? (
                      <SelectItem value="none" disabled>No setups available</SelectItem>
                    ) : (
                      availableSetupsForTrade.map((setup) => (
                        <SelectItem key={setup.id} value={setup.id.toString()}>
                          <div className="flex flex-col">
                            <span className="font-medium">{setup.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {setup.category} • {setup.description ? setup.description.substring(0, 30) + '...' : 'No description'}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {availableSetupsForTrade.length === 0 && !isLoadingSetups && (
                  <p className="text-xs text-muted-foreground">
                    No setups available. Create some setups first in the Setups section.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confidenceRating">Confidence Rating</Label>
                <Select value={confidenceRating} onValueChange={setConfidenceRating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Low</SelectItem>
                    <SelectItem value="2">2 - Below Average</SelectItem>
                    <SelectItem value="3">3 - Average</SelectItem>
                    <SelectItem value="4">4 - Above Average</SelectItem>
                    <SelectItem value="5">5 - High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes about why this setup applies to this trade"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Show existing setups */}
            {setups.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Current Setups</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {setups.map((setup) => (
                    <div key={setup.setup_id} className="p-2 border rounded-lg text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{setup.setup_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {setup.setup_category}
                            {setup.confidence_rating && ` • ${setup.confidence_rating}/5`}
                          </p>
                          {setup.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {setup.notes}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(setup.created_at).toLocaleDateString()}
                        </p>
                      </div>
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
              onClick={handleAddSetup} 
              disabled={isLoading || !selectedSetupId || selectedSetupId === 'loading' || selectedSetupId === 'none' || availableSetupsForTrade.length === 0}
            >
              {isLoading ? 'Adding...' : 'Add Setup'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 