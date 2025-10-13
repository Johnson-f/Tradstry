'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { setupsService } from '@/lib/services/setups-service';
import { SetupTradeAssociation, SetupInDB } from '@/lib/types/setups';
import { toast } from 'sonner';

interface SetupTradeAssociationProps {
  tradeId: number;
  tradeType: 'stock' | 'option';
  onSetupAdded?: () => void;
}

export function SetupTradeAssociation({ tradeId, tradeType, onSetupAdded }: SetupTradeAssociationProps) {
  const [selectedSetupId, setSelectedSetupId] = useState<string>('');
  const [confidenceRating, setConfidenceRating] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [setups, setSetups] = useState<SetupTradeAssociation[]>([]);
  const [availableSetups, setAvailableSetups] = useState<SetupInDB[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoadingSetups, setIsLoadingSetups] = useState(false);

  // Load available setups when form is shown
  useEffect(() => {
    if (showForm) {
      loadAvailableSetups();
      loadSetups();
    }
  }, [showForm]);

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
      setShowForm(false);
      onSetupAdded?.();
      loadSetups();
    } catch (error) {
      console.error('Error adding setup:', error);
      toast.error('Failed to add setup');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSetups = async () => {
    try {
      if (tradeType === 'stock') {
        const stockSetups = await setupsService.getSetupsForStock(tradeId);
        setSetups(stockSetups);
      } else {
        const optionSetups = await setupsService.getSetupsForOption(tradeId);
        setSetups(optionSetups);
      }
    } catch (error) {
      console.error('Error loading setups:', error);
    }
  };

  const handleShowForm = () => {
    setShowForm(true);
  };

  // Filter out setups that are already associated with this trade
  const availableSetupsForTrade = availableSetups.filter(
    setup => !setups.some(existingSetup => existingSetup.setup_id === setup.id)
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Setup Associations</CardTitle>
        <CardDescription>
          Manage setups associated with this {tradeType} trade
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showForm ? (
          <Button onClick={handleShowForm} variant="outline">
            Add Setup
          </Button>
        ) : (
          <div className="space-y-4">
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

            <div className="flex space-x-2">
              <Button 
                onClick={handleAddSetup} 
                disabled={isLoading || !selectedSetupId || selectedSetupId === 'loading' || selectedSetupId === 'none' || availableSetupsForTrade.length === 0}
              >
                {isLoading ? 'Adding...' : 'Add Setup'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowForm(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {setups.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Associated Setups</h4>
            <div className="space-y-2">
              {setups.map((setup) => (
                <div key={setup.setup_id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{setup.setup_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Category: {setup.setup_category}
                      </p>
                      {setup.confidence_rating && (
                        <p className="text-sm text-muted-foreground">
                          Confidence: {setup.confidence_rating}/5
                        </p>
                      )}
                      {setup.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
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
      </CardContent>
    </Card>
  );
} 