"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStockPeers, usePeerComparison } from "@/lib/hooks/use-market-data";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
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
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Peers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Failed to load peers data</p>
            <p className="text-sm text-red-500">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Peers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          // Loading skeletons
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
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
          ))
        ) : displayData.length === 0 ? (
          <div className="text-center py-8">
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
              <div
                key={peerSymbol || index}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50",
                  isMainStock && "bg-primary/5 border-primary/20"
                )}
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
                    ${price?.toFixed(2) || 'N/A'}
                  </div>
                  {percentChange !== undefined && (
                    <div className={cn(
                      "flex items-center justify-end space-x-1 text-xs",
                      percentChange >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {percentChange >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span>
                        {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Show More Button */}
        {!isLoading && displayData.length > 0 && displayData.length >= limit && (
          <div className="pt-2">
            <Button variant="ghost" size="sm" className="w-full">
              View All Peers
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}