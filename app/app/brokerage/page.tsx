"use client";

import { MergeTrades } from '@/components/brokerage/merge-trades';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function MergeTradesPage() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Brokerage</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Select and merge brokerage transactions into stock or option trades
            </p>
          </div>
        </div>
      </div>

      {/* Main content - Scrollable area with shadcn ScrollArea */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8">
            <MergeTrades />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

