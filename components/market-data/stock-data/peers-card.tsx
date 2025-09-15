"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useStockPeers, usePeerComparison } from "@/lib/hooks/use-market-data";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PeersCardProps {
  symbol: string;
  dataDate?: string;
  limit?: number;
  showComparison?: boolean;
  className?: string;
}

export function PeersCard({ 
  symbol, 
  dataDate, 
  limit = 10, 
  showComparison = false,
  className 
}: PeersCardProps) {
  const { peers, isLoading, error } = useStockPeers(symbol, dataDate, limit);
  const { comparison } = usePeerComparison(symbol, dataDate, limit);

  const displayData = showComparison ? comparison : peers;

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
              const peerSymbol = showComparison ? peer.symbol : peer.peer_symbol;
              const peerName = showComparison ? peer.name : peer.peer_name;
              const price = peer.price;
              const percentChange = peer.percent_change;
              const logo = peer.logo;
              const isMainStock = showComparison ? peer.is_main_stock : false;

              return (
                <div key={peerSymbol || index}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
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
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-sm truncate">
                            {peerName || peerSymbol}
                          </h4>
                          {isMainStock && (
                            <Badge variant="secondary" className="text-xs">
                              Main
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {peerSymbol} • NASDAQ
                        </p>
                      </div>
                    </div>

                    {/* Price and Change */}
                    <div className="text-right">
                      <div className="font-medium text-sm">
                        {(() => {
                          if (price === undefined || price === null) return 'N/A';
                          const numPrice = typeof price === 'number' ? price : parseFloat(String(price));
                          return isNaN(numPrice) ? 'N/A' : `$${numPrice.toFixed(2)}`;
                        })()}
                      </div>
                      {percentChange !== undefined && percentChange !== null && (
                        (() => {
                          const numPercentChange = typeof percentChange === 'number' ? percentChange : parseFloat(String(percentChange));
                          if (isNaN(numPercentChange)) return null;
                          
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