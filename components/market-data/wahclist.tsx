"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWatchlistsWithPrices, useWatchlistByIdWithPrices } from "@/lib/hooks/use-market-data";
import { marketDataService } from "@/lib/services/market-data-service";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X, TrendingUp, TrendingDown, Star } from "lucide-react";

// Convert price from backend (string or number) to number for calculations
const parsePrice = (price: string | number | undefined | null): number => {
  if (typeof price === 'number') return isNaN(price) ? 0 : price;
  if (typeof price === 'string') return parseFloat(price) || 0;
  return 0;
};
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRealtimeWatchlists, useRealtimeWatchlistItems } from "@/lib/hooks/useRealtimeUpdates";

interface WatchlistProps {
  className?: string;
}

export function Watchlist({ className }: WatchlistProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);

  const queryClient = useQueryClient();
  const { watchlistsWithPrices: watchlists, isLoading: watchlistsLoading, refetch: refetchWatchlists } = useWatchlistsWithPrices();
  const { watchlistWithPrices: watchlist, isLoading: watchlistLoading, refetch: refetchWatchlist } = useWatchlistByIdWithPrices(selectedWatchlistId || 0);

  // Enable realtime updates
  useRealtimeWatchlists(queryClient);
  useRealtimeWatchlistItems(queryClient, selectedWatchlistId || undefined);


  const handleDeleteWatchlist = async (id: number) => {
    try {
      const response = await marketDataService.deleteWatchlist(id);
      if (response.success) {
        toast.success("Watchlist deleted successfully");
        refetchWatchlists();
        if (selectedWatchlistId === id) {
          setSelectedWatchlistId(null);
        }
      }
    } catch (error) {
      toast.error("Failed to delete watchlist");
      console.error("Error deleting watchlist:", error);
    }
  };

  const handleAddItem = async () => {
    if (!newSymbol.trim() || !selectedWatchlistId) return;

    setIsAddingItem(true);
    try {
      const response = await marketDataService.addWatchlistItem({
        watchlist_id: selectedWatchlistId,
        symbol: newSymbol.toUpperCase(),
      });
      if (response.success) {
        toast.success("Symbol added to watchlist");
        setNewSymbol("");
        setIsAddItemDialogOpen(false);
        refetchWatchlist();
        // Invalidate watchlist queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['watchlist-with-prices', selectedWatchlistId] });
        queryClient.invalidateQueries({ queryKey: ['watchlist-items-with-prices', selectedWatchlistId] });
      }
    } catch (error) {
      toast.error("Failed to add symbol to watchlist");
      console.error("Error adding item:", error);
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    try {
      const response = await marketDataService.deleteWatchlistItem(itemId);
      if (response.success) {
        toast.success("Symbol removed from watchlist");
        refetchWatchlist();
        // Invalidate watchlist queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['watchlist-with-prices', selectedWatchlistId] });
        queryClient.invalidateQueries({ queryKey: ['watchlist-items-with-prices', selectedWatchlistId] });
      }
    } catch (error) {
      toast.error("Failed to remove symbol from watchlist");
      console.error("Error removing item:", error);
    }
  };

  const handleClearWatchlist = async () => {
    if (!selectedWatchlistId) return;

    try {
      const response = await marketDataService.clearWatchlist(selectedWatchlistId);
      if (response.success) {
        toast.success("Watchlist cleared successfully");
        refetchWatchlist();
        queryClient.invalidateQueries({ queryKey: ['watchlist-with-prices', selectedWatchlistId] });
        queryClient.invalidateQueries({ queryKey: ['watchlist-items-with-prices', selectedWatchlistId] });
      }
    } catch (error) {
      toast.error("Failed to clear watchlist");
      console.error("Error clearing watchlist:", error);
    }
  };

  return (
    <div className={cn("w-full", className)}>

      {/* Watchlist Selector */}
      <Card>
        <CardContent className="p-4">
          {watchlistsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : watchlists.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No watchlists yet. Create your first watchlist to get started.
            </p>
          ) : (
            <div className="grid gap-2">
              {watchlists.map((wl) => (
                <div
                  key={wl.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                    selectedWatchlistId === wl.id && "bg-primary/5 border-primary/20"
                  )}
                  onClick={() => setSelectedWatchlistId(wl.id)}
                >
                  <div className="flex items-center space-x-2">
                    <Star className={cn(
                      "h-4 w-4",
                      selectedWatchlistId === wl.id ? "text-primary fill-primary" : "text-muted-foreground"
                    )} />
                    <span className="font-medium">{wl.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWatchlist(wl.id);
                    }}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Watchlist Items */}
      {selectedWatchlistId && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium">
              {watchlist?.name || "Watchlist Items"}
            </h4>
            <div className="flex space-x-2">
              <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Symbol
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Symbol to Watchlist</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="symbol">Stock Symbol</Label>
                      <Input
                        id="symbol"
                        value={newSymbol}
                        onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                        placeholder="Enter symbol (e.g., AAPL)..."
                        onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setIsAddItemDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddItem} disabled={isAddingItem || !newSymbol.trim()}>
                        {isAddingItem ? "Adding..." : "Add Symbol"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              {watchlist?.items && watchlist.items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearWatchlist}
                  className="h-8 text-destructive hover:text-destructive"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
          <Card>
            <CardContent className="p-4">
              {watchlistLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-8 w-8 rounded" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !watchlist?.items || watchlist.items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No symbols in this watchlist yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">Add some symbols to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {watchlist.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {item.symbol.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {item.company_name || item.symbol}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.symbol}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          {item.price && (
                            <div className="font-medium text-sm">
                              ${(() => {
                                const priceValue = parsePrice(item.price);
                                return priceValue === 0 ? 'N/A' : priceValue.toFixed(2);
                              })()}
                            </div>
                          )}
                          {item.percent_change !== undefined && item.percent_change !== null && (
                            (() => {
                              // Parse percent_change string (e.g., "2.45%") to number
                              const percentChangeStr = item.percent_change?.toString() ?? '0';
                              const numPercentChange = parseFloat(percentChangeStr.replace('%', '')) || 0;
                              
                              return (
                                <div className={cn(
                                  "flex items-center justify-end space-x-1 text-xs",
                                  numPercentChange >= 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {numPercentChange >= 0 ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3" />
                                  )}
                                  <span>
                                    {numPercentChange >= 0 ? '+' : ''}{numPercentChange.toFixed(2)}%
                                  </span>
                                </div>
                              );
                            })()
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(item.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}