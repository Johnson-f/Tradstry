/**
 * Supabase Edge Function: Stock Symbol Tracker
 * 
 * This Edge Function manages stock symbol validation and tracking.
 * REDESIGNED: No price data - ticker symbols stored as TEXT, focused on metadata only.
 * Real-time prices should come from external APIs used directly by frontend.
 * 
 * Purpose: Track which symbols are being used across the platform and validate ticker formats.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// REDESIGNED: Stock quote metadata without price data
interface StockSymbolRecord {
  symbol: string;  // Ticker symbol as TEXT (not number)
  exchange_id?: number;
  quote_timestamp: string; // ISO timestamp
  data_provider: string;
  // REMOVED: All price fields - use external APIs for real-time prices
}

// Interface for symbol validation request
interface SymbolValidationRequest {
  symbols: string[];
  data_provider?: string;
}

/**
 * Validate ticker symbol format and ensure proper text storage
 */
function validateAndFormatSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // Ensure symbol is stored as TEXT (not number) and properly formatted
  const symbolText = symbol.toString().toUpperCase().trim();
  
  // Validate that symbol looks like a ticker (letters/digits, reasonable length)
  if (!/^[A-Z0-9._-]{1,20}$/.test(symbolText)) {
    console.warn(`Invalid ticker symbol format: ${symbolText}`);
    return null;
  }
  
  return symbolText;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Save symbol tracking records to database
 */
async function saveSymbolRecords(
  supabase: SupabaseClient, 
  symbols: string[], 
  dataProvider: string = 'platform'
): Promise<{ success: number; errors: number }> {
  if (symbols.length === 0) return { success: 0, errors: 0 };
  
  let successCount = 0;
  let errorCount = 0;
  const timestamp = getCurrentTimestamp();
  
  // Process each symbol individually to handle validation
  for (const symbol of symbols) {
    try {
      const formattedSymbol = validateAndFormatSymbol(symbol);
      if (!formattedSymbol) {
        console.warn(`Skipping invalid symbol: ${symbol}`);
        errorCount++;
        continue;
      }

      const symbolRecord: StockSymbolRecord = {
        symbol: formattedSymbol,
        quote_timestamp: timestamp,
        data_provider: dataProvider
      };
      
      const { error } = await supabase
        .from('stock_quotes')
        .upsert(
          symbolRecord,
          {
            onConflict: 'symbol,quote_timestamp,data_provider'
          }
        );
      
      if (error) {
        console.error(`Error upserting symbol ${formattedSymbol}:`, error);
        errorCount++;
      } else {
        console.log(`Successfully tracked symbol: ${formattedSymbol}`);
        successCount++;
      }
    } catch (upsertError) {
      console.error(`Error processing symbol ${symbol}:`, upsertError);
      errorCount++;
    }
  }
  
  return { success: successCount, errors: errorCount };
}

/**
 * Get all tracked symbols from various platform sources
 */
async function getTrackedSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    // Get symbols from watchlists
    const { data: watchlistSymbols, error: watchlistError } = await supabase
      .from('watchlist_items')
      .select('symbol');
    
    if (watchlistError) {
      console.error('Error fetching watchlist symbols:', watchlistError);
    }

    // Get symbols from market movers  
    const { data: moverSymbols, error: moverError } = await supabase
      .from('market_movers')
      .select('symbol');
    
    if (moverError) {
      console.error('Error fetching mover symbols:', moverError);
    }

    // Get symbols from peers
    const { data: peerSymbols, error: peerError } = await supabase
      .from('stock_peers')
      .select('symbol');
    
    if (peerError) {
      console.error('Error fetching peer symbols:', peerError);
    }

    // Combine and deduplicate symbols
    const allSymbols: string[] = [];
    
    if (watchlistSymbols) {
      allSymbols.push(...watchlistSymbols.map(item => item.symbol));
    }
    
    if (moverSymbols) {
      allSymbols.push(...moverSymbols.map(item => item.symbol));
    }
    
    if (peerSymbols) {
      allSymbols.push(...peerSymbols.map(item => item.symbol));
    }

    // Return unique, validated symbols
    const uniqueSymbols = [...new Set(allSymbols)];
    const validatedSymbols = uniqueSymbols
      .map(symbol => validateAndFormatSymbol(symbol))
      .filter((symbol): symbol is string => symbol !== null);

    console.log(`Found ${validatedSymbols.length} unique symbols to track`);
    return validatedSymbols;
    
  } catch (error) {
    console.error('Error in getTrackedSymbols:', error);
    return [];
  }
}

/**
 * Main Edge Function handler
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting stock symbol tracking...');
    
    // Parse request body for specific symbols (optional)
    let requestedSymbols: string[] | null = null;
    let dataProvider = 'platform';
    
    if (req.method === 'POST') {
      try {
        const body: SymbolValidationRequest = await req.json();
        requestedSymbols = body.symbols;
        dataProvider = body.data_provider || 'platform';
      } catch {
        // Continue with platform symbols if request body parsing fails
      }
    }

    // Get symbols to process
    const symbolsToProcess = requestedSymbols || await getTrackedSymbols(supabase);
    
    if (symbolsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No symbols found to track',
          tracked_count: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log(`Processing ${symbolsToProcess.length} symbols for tracking`);

    // Save symbol tracking records (NO PRICE DATA)
    const saveResults = await saveSymbolRecords(supabase, symbolsToProcess, dataProvider);

    // Get current tracking statistics
    const { data: trackingStats, error: statsError } = await supabase
      .from('stock_quotes')
      .select('symbol, data_provider, quote_timestamp')
      .order('quote_timestamp', { ascending: false })
      .limit(10);

    if (statsError) {
      console.error('Error fetching tracking stats:', statsError);
    }

    const response = {
      success: true,
      message: 'Stock symbol tracking completed',
      summary: {
        symbols_processed: symbolsToProcess.length,
        symbols_tracked: saveResults.success,
        errors: saveResults.errors,
        data_provider: dataProvider,
        timestamp: getCurrentTimestamp()
      },
      recent_tracking: trackingStats?.slice(0, 10) || [],
      note: 'This service tracks symbol metadata only. Use external APIs for real-time prices.'
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Internal server error in stock symbol tracking'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
