"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTopGainersWithPrices, useTopLosersWithPrices, useMostActiveWithPrices } from "@/lib/hooks/use-market-data"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"
import type { MarketMoverWithPrices } from "@/lib/types/market-data"
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

// Stock item component
interface StockItemProps {
  stock: MarketMoverWithPrices
  onClick?: () => void
}

const StockItem: React.FC<StockItemProps> = ({ stock, onClick }) => {
  // Parse percent_change string (e.g., "2.45%") to number, fallback to 0
  const percentChangeStr = stock.percent_change ?? "0"
  const percentChange = Number.parseFloat(percentChangeStr.replace("%", "")) || 0
  const isPositive = percentChange >= 0

  // Parse price (can be string or number from backend) to number
  const priceValue = parsePrice(stock.price)

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {stock.logo ? (
            <Image
              src={stock.logo || "/placeholder.svg"}
              alt={`${stock.symbol} logo`}
              width={40}
              height={40}
              className="object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = "none"
              }}
            />
          ) : (
            <div className="text-xs font-semibold text-muted-foreground">{stock.symbol?.slice(0, 2)}</div>
          )}
        </div>

        <div className="min-w-0">
          <h4 className="font-medium text-sm truncate">{stock.symbol}</h4>
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
const StockItemSkeleton: React.FC = () => (
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

// Tab content component
interface TabContentProps {
  stocks: MarketMoverWithPrices[]
  isLoading: boolean
  error: Error | null
  type: "gainers" | "losers" | "actives"
  onStockClick: (symbol: string) => void
}

const TabContent: React.FC<TabContentProps> = ({ stocks, isLoading, error, type, onStockClick }) => {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load {type}: {error.message}
        </AlertDescription>
      </Alert>
    )
  }

  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index}>
            <StockItemSkeleton />
            {index < 9 && <Separator />}
          </div>
        ))}
      </div>
    )
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No {type} data available at the moment.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[400px]">
      <div>
        {stocks.map((stock, index) => (
          <div key={stock.symbol}>
            <StockItem stock={stock} onClick={() => onStockClick(stock.symbol)} />
            {index < stocks.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// Main component
export const ActiveCard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("gainers")
  const queryClient = useQueryClient()
  const { navigateToSymbol } = useSymbolNavigation()

  const handleStockClick = (symbol: string) => {
    navigateToSymbol(symbol)
  }

  useRealtimeTable("market_movers", queryClient, ["market-movers", "gainers-with-prices"])
  useRealtimeTable("market_movers", queryClient, ["market-movers", "losers-with-prices"])
  useRealtimeTable("market_movers", queryClient, ["market-movers", "most-active-with-prices"])

  const { gainers, isLoading: gainersLoading, error: gainersError } = useTopGainersWithPrices({ limit: 25 })
  const { losers, isLoading: losersLoading, error: losersError } = useTopLosersWithPrices({ limit: 25 })
  const { mostActive: actives, isLoading: activesLoading, error: activesError } = useMostActiveWithPrices({ limit: 25 })

  return (
    <Card className="w-full max-w-4xl">
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="p-4 pb-0">
            <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <TabsTrigger
                value="gainers"
                className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-green-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-green-400"
              >
                <TrendingUp className="w-3 h-3" />
                <span>Gainers</span>
              </TabsTrigger>
              <TabsTrigger
                value="losers"
                className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-red-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-red-400"
              >
                <TrendingDown className="w-3 h-3" />
                <span>Losers</span>
              </TabsTrigger>
              <TabsTrigger
                value="actives"
                className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-blue-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-blue-400"
              >
                <Activity className="w-3 h-3" />
                <span>Active</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="mt-4">
            <TabsContent value="gainers" className="mt-0">
              <TabContent
                stocks={gainers}
                isLoading={gainersLoading}
                error={gainersError}
                type="gainers"
                onStockClick={handleStockClick}
              />
            </TabsContent>

            <TabsContent value="losers" className="mt-0">
              <TabContent
                stocks={losers}
                isLoading={losersLoading}
                error={losersError}
                type="losers"
                onStockClick={handleStockClick}
              />
            </TabsContent>

            <TabsContent value="actives" className="mt-0">
              <TabContent
                stocks={actives}
                isLoading={activesLoading}
                error={activesError}
                type="actives"
                onStockClick={handleStockClick}
              />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default ActiveCard
