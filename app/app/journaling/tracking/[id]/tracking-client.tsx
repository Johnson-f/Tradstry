'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStock } from '@/lib/hooks/use-stocks';
import { useOption } from '@/lib/hooks/use-options';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Stats from '@/components/journaling/tracking/tabs/stats';
import type { Stock } from '@/lib/types/stocks';
import type { OptionTrade } from '@/lib/types/options';

interface TradeTrackingClientProps {
  params: Promise<{ id: string }>;
}

function parseTradeId(id: string): { type: 'stock' | 'option'; numericId: number } | null {
  const match = id.match(/^(stock|option)-(\d+)$/);
  if (!match) return null;
  
  const [, type, numericIdStr] = match;
  const numericId = parseInt(numericIdStr, 10);
  
  if (isNaN(numericId) || numericId <= 0) return null;
  
  return { type: type as 'stock' | 'option', numericId };
}

function formatEntryDate(entryDate: string): string {
  if (!entryDate) return '';
  
  try {
    const date = new Date(entryDate);
    if (isNaN(date.getTime())) return '';
    
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Format: M/DD/YYYY (month without leading zero, day with leading zero)
    return `${month}/${day.toString().padStart(2, '0')}/${year}`;
  } catch {
    return '';
  }
}

export default function TradeTrackingClient({ params }: TradeTrackingClientProps) {
  const router = useRouter();
  const [resolvedParams, setResolvedParams] = React.useState<{ id: string } | null>(null);
  const [parsedId, setParsedId] = React.useState<{ type: 'stock' | 'option'; numericId: number } | null>(null);

  React.useEffect(() => {
    void params.then(setResolvedParams);
  }, [params]);

  React.useEffect(() => {
    if (resolvedParams) {
      const parsed = parseTradeId(resolvedParams.id);
      setParsedId(parsed);
    }
  }, [resolvedParams]);

  const stockQuery = useStock(parsedId?.numericId ?? 0, parsedId?.type === 'stock' && parsedId !== null);
  const optionQuery = useOption(parsedId?.numericId ?? 0, parsedId?.type === 'option' && parsedId !== null);

  const isLoading = parsedId === null || (parsedId.type === 'stock' ? stockQuery.isLoading : optionQuery.isLoading);
  const error = parsedId === null 
    ? new Error('Invalid trade ID format')
    : (parsedId.type === 'stock' ? stockQuery.error : optionQuery.error);
  const trade = parsedId?.type === 'stock' ? stockQuery.data : optionQuery.data;

  if (!resolvedParams) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/journaling')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Tracking</h1>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (!parsedId) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/journaling')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Tracking</h1>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8">
              <p className="text-muted-foreground">
                The trade ID format is invalid. Expected format: <code className="bg-muted px-1 py-0.5 rounded">stock-123</code> or <code className="bg-muted px-1 py-0.5 rounded">option-456</code>
              </p>
              <Button
                className="mt-4"
                onClick={() => router.push('/app/journaling')}
              >
                Back to Journaling
              </Button>
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/journaling')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Tracking</h1>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/journaling')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Tracking</h1>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8">
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : 'The requested trade could not be found.'}
              </p>
              <Button
                className="mt-4"
                onClick={() => router.push('/app/journaling')}
              >
                Back to Journaling
              </Button>
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  const symbol = parsedId.type === 'stock' ? (trade as Stock).symbol : (trade as OptionTrade).symbol;
  const entryDate = parsedId.type === 'stock' ? (trade as Stock).entryDate : (trade as OptionTrade).entryDate;
  const formattedDate = formatEntryDate(entryDate);

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/app/journaling')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Tracking</h1>
        </div>
      </div>
      
      {/* Secondary Header - Symbol and Entry Date */}
      <div className="w-full border-b bg-background px-8 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{symbol}</span>
          {formattedDate && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{formattedDate}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Main content - Two column layout */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 grid grid-cols-12 gap-6">
            {/* Left Column - Stats Panel (approximately 1/3 width) */}
            <div className="col-span-12 lg:col-span-4 xl:col-span-3">
              <Stats 
                tradeId={parsedId.numericId}
                tradeType={parsedId.type}
                trade={trade}
              />
            </div>
            
            {/* Right Column - Chart & Notes Panel (approximately 2/3 width) */}
            <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-6">
              {/* Chart Section - Placeholder for now */}
              <div className="bg-background border rounded-lg h-[500px] flex items-center justify-center">
                <p className="text-muted-foreground">Chart view - to be implemented</p>
              </div>
              
              {/* Trade Notes Section - Placeholder for now */}
              <div className="bg-background border rounded-lg h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground">Trade notes - to be implemented</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

