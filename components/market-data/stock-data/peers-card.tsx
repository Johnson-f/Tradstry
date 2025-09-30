"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useStockPeersWithPrices } from "@/lib/hooks/use-market-data";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useSymbolNavigation } from "@/lib/hooks/use-symbol-navigation";

// Convert price from backend (string or number) to number for calculations
const parsePrice = (price: string | number | undefined | null): number => {
  if (typeof price === 'number') return isNaN(price) ? 0 : price;
  if (typeof price === 'string') return parseFloat(price) || 0;
  return 0;
};

interface PeersCardProps {
  symbol: string;
  dataDate?: string;
  limit?: number;
  className?: string;
}

export function PeersCard({ 
  symbol, 
  dataDate, 
  limit = 10, 
  className 
}: PeersCardProps) {
  const { peersWithPrices, isLoading, error } = useStockPeersWithPrices(symbol, dataDate, limit);
  const { navigateToSymbol } = useSymbolNavigation();

  const displayData = peersWithPrices;
  
  const handlePeerClick = (peerSymbol: string) => {
    navigateToSymbol(peerSymbol);
  };

  if (error) {
    return (
      <div className={cn("w-full", className)}>
        <h3 className="text-lg font-semibold mb-4">Peers</h3>
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">Failed to load peers data</p>
              <p className="text-sm text-red-500">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <h3 className="text-lg font-semibold mb-2">Peers</h3>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                {index < 5 && <Separator />}
              </div>
            ))
          ) : displayData.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-muted-foreground">No peers data available</p>
            </div>
          ) : (
            displayData.map((peer, index) => {
              // Using StockPeerWithPrices structure
              const peerSymbol = peer.peer_symbol;
              const peerName = peer.name || peer.peer_name; // Prefer API name over stored name
              const price = peer.price;
              const percentChange = peer.percent_change;
              const logo = peer.logo;

              return (
                <div key={peerSymbol || index}>
                  <div 
                    onClick={() => handlePeerClick(peerSymbol)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Company Logo */}
                      <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {logo ? (
                          <Image
                            src={logo}
                            alt={`${peerSymbol} logo`}
                            width={40}
                            height={40}
                            className="object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="text-xs font-semibold text-muted-foreground">
                            {peerSymbol?.slice(0, 2)}
                          </div>
                        )}
                      </div>

                      {/* Company Info */}
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate">
                          {peerName || peerSymbol}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {peerSymbol} • NASDAQ
                        </p>
                      </div>
                    </div>

                    {/* Price and Change */}
                    <div className="text-right">
                      <div className="font-medium text-sm">
                        {(() => {
                          const priceValue = parsePrice(price);
                          return priceValue === 0 ? 'N/A' : `$${priceValue.toFixed(2)}`;
                        })()}
                      </div>
                      {percentChange !== undefined && percentChange !== null && (
                        (() => {
                          // Parse percent_change string (e.g., "2.45%") to number
                          const percentChangeStr = percentChange?.toString() ?? '0';
                          const numPercentChange = parseFloat(percentChangeStr.replace('%', '')) || 0;
                          
                          return (
                            <div className={cn(
                              "text-xs font-medium",
                              numPercentChange >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {numPercentChange >= 0 ? '+' : ''}{numPercentChange.toFixed(2)}%
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                  {index < displayData.length - 1 && <Separator />}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}