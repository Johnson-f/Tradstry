"use client"

import type React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStockPeersWithPrices } from "@/lib/hooks/use-market-data"
import { Users } from "lucide-react"
import type { StockPeerWithPrices } from "@/lib/types/market-data"
import { useQueryClient } from "@tanstack/react-query"
import { useRealtimeTable } from "@/lib/hooks/useRealtimeUpdates"
import { useSymbolNavigation } from "@/lib/hooks/use-symbol-navigation"
import Image from "next/image"
import { cn } from "@/lib/utils"

// Format functions
const formatPrice = (value: number | undefined | null): string => {
  const numValue = typeof value === "number" && !isNaN(value) ? value : 0
  return numValue.toFixed(2)
}

const formatPercentChange = (value: number | undefined | null): string => {
  const numValue = typeof value === "number" && !isNaN(value) ? value : 0
  return `${numValue.toFixed(2)}%`
}

// Convert price from backend (string or number) to number for calculations
const parsePrice = (price: string | number | undefined | null): number => {
  if (typeof price === "number") return isNaN(price) ? 0 : price
  if (typeof price === "string") return Number.parseFloat(price) || 0
  return 0
}

// Peer stock item component
interface PeerItemProps {
  peer: StockPeerWithPrices
  rank: number
  onClick?: () => void
}

const PeerItem: React.FC<PeerItemProps> = ({ peer, rank, onClick }) => {
  // Parse percent_change string (e.g., "2.45%") to number, fallback to 0
  const percentChangeStr = peer.percent_change ?? "0"
  const percentChange = Number.parseFloat(percentChangeStr.replace("%", "")) || 0
  const isPositive = percentChange >= 0

  // Parse price (can be string or number from backend) to number
  const priceValue = parsePrice(peer.price)

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {peer.logo ? (
            <Image
              src={peer.logo || "/placeholder.svg"}
              alt={`${peer.peer_symbol} logo`}
              width={40}
              height={40}
              className="object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = "none"
              }}
            />
          ) : (
            <div className="text-xs font-semibold text-muted-foreground">{peer.peer_symbol?.slice(0, 2)}</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-sm">{peer.peer_symbol}</h4>
        
        </div>
      </div>
    

      <div className="text-right flex-shrink-0 ml-4">
        <div className="font-medium text-sm">${formatPrice(priceValue)}</div>
        <div className={cn("text-xs font-medium", isPositive ? "text-green-600" : "text-red-600")}>
          {isPositive ? "+" : ""}
          {formatPercentChange(percentChange)}
        </div>
      </div>
    </div>
  )
}

// Loading skeleton
const PeerItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between px-4 py-3">
    <div className="flex items-center space-x-3 flex-1">
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
)

// Main component
interface PeersCardProps {
  symbol: string
  limit?: number
  className?: string
}

export const PeersCard: React.FC<PeersCardProps> = ({ symbol, limit = 25, className = "" }) => {
  const queryClient = useQueryClient()
  const { navigateToSymbol } = useSymbolNavigation()

  const handlePeerClick = (peerSymbol: string) => {
    navigateToSymbol(peerSymbol)
  }

  // Enable realtime updates for peers data
  useRealtimeTable("stock_peers", queryClient, ["stock-peers-with-prices", symbol])

  const { peersWithPrices, isLoading, error } = useStockPeersWithPrices(symbol, undefined, limit)

  if (error) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Stock Peers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load peer stocks: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Stock Peers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index}>
                <PeerItemSkeleton />
                {index < 7 && <Separator />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (peersWithPrices.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Stock Peers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No peer data available for {symbol} at the moment.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Stock Peers
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div>
            {peersWithPrices.map((peer, index) => (
              <div key={peer.peer_symbol}>
                <PeerItem 
                  peer={peer} 
                  rank={index + 1} 
                  onClick={() => handlePeerClick(peer.peer_symbol)} 
                />
                {index < peersWithPrices.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export default PeersCard
