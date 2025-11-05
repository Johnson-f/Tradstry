"use client";

import { useParams } from "next/navigation";
import { MarketSearch } from "@/components/markets/market-search";
import { Button } from "@/components/ui/button";
import { ChevronRight, Share2, Star } from "lucide-react";
import Link from "next/link";
import { SymbolTabs } from "@/components/markets/symbols/tab";

export default function MarketsSymbolPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol || "").toString().toUpperCase();

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <Header />
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <SymbolTabs symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  );
}


// Function to render the header
function Header() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol || "").toString().toUpperCase();

  return (
    <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
      <div className="relative flex items-center justify-between">
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Link href="/app/markets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Markets
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{symbol || "Symbol"}</span>
        </div>

        {/* Center: Search (absolutely centered) */}
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-2xl">
          <MarketSearch />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Star className="h-4 w-4 mr-2" />
            Follow
          </Button>
          <Button variant="secondary" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}