/**
 * Supabase Edge Function: Historical Price Data Fetcher
 * 
 * This Edge Function fetches historical OHLCV price data with specific range/interval configurations,
 * fetches symbols from the stock_quotes table, checks for existing data to avoid refetching,
 * and saves data to the redesigned historical_prices table.
 * 
 * Data source: https://finance-query.onrender.com/v1/historical
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for historical price data
interface HistoricalPriceData {
  symbol: string;
  timestamp_utc: string;
  time_range: string;
  time_interval: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjusted_close?: number;
  data_provider: string;
}

interface RangeIntervalConfig {
  range: string;
  intervals: string[];
}

interface ExternalAPIResponse {
  [timestamp: string]: {
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose: number | null;
    volume: number;
  };
}

// Configuration for range/interval combinations
const RANGE_INTERVAL_CONFIG: RangeIntervalConfig[] = [
  { range: '1d', intervals: ['1m', '5m', '15m', '30m'] },
  { range: '5d', intervals: ['5m', '15m', '30m', '1h'] },
  { range: '1mo', intervals: ['30m', '1h', '4h', '1d'] },
  { range: '6mo', intervals: ['1h', '1d', '1mo'] },
  { range: 'ytd', intervals: ['1h', '1d', '1mo'] },
  { range: '1y', intervals: ['1h', '1d', '1mo'] },
  { range: '5y', intervals: ['1d', '1mo'] },
  { range: 'max', intervals: ['1mo'] },
];

/**
 * Fetch symbols from the stock_quotes table
 */
async function getSymbolsFromStockQuotes(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');

    if (error) {
      console.error('Error fetching symbols from stock_quotes:', error);
      // Return default symbols for fallback
      return ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX'];
    }

    if (!data || data.length === 0) {
      console.log('No symbols found in stock_quotes table, using default symbols');
      return ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX'];
    }

    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    console.log(`Found ${uniqueSymbols.length} unique symbols in stock_quotes table`);
    
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getSymbolsFromStockQuotes:', error);
    return ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
  }
}

/**
 * Check if data already exists for a symbol/range/interval combination
 */
async function checkExistingData(
  supabase: SupabaseClient, 
  symbol: string, 
  range: string, 
  interval: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('historical_prices')
      .select('id')
      .eq('symbol', symbol)
      .eq('time_range', range)
      .eq('time_interval', interval)
      .limit(1);

    if (error) {
      console.error(`Error checking existing data for ${symbol} ${range} ${interval}:`, error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error(`Error in checkExistingData for ${symbol} ${range} ${interval}:`, error);
    return false;
  }
}

/**
 * Map external API interval to our database interval
 */
function mapIntervalForAPI(interval: string): string {
  const intervalMap: { [key: string]: string } = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
    '1wk': '1wk',
    '1mo': '1mo'
  };
  
  return intervalMap[interval] || interval;
}

/**
 * Fetch historical data from finance-query.onrender.com API
 */
async function fetchHistoricalData(
  symbol: string, 
  range: string, 
  interval: string
): Promise<HistoricalPriceData[]> {
  try {
    const apiInterval = mapIntervalForAPI(interval);
    const url = `https://finance-query.onrender.com/v1/historical?symbol=${symbol}&range=${range}&interval=${apiInterval}`;
    
    console.log(`Fetching data from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`API request failed for ${symbol} ${range} ${interval}: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data: ExternalAPIResponse = await response.json();
    
    if (!data || typeof data !== 'object') {
      console.log(`No data returned for ${symbol} ${range} ${interval}`);
      return [];
    }
    
    // Convert response to our format
    const historicalData: HistoricalPriceData[] = [];
    
    for (const [timestamp, priceData] of Object.entries(data)) {
      // Parse timestamp - handle both date strings and datetime strings
      let timestampUtc: string;
      
      if (timestamp.includes(' ') || timestamp.includes('T')) {
        // Already has time component
        timestampUtc = new Date(timestamp).toISOString();
      } else {
        // Date only - add midnight time for daily data
        timestampUtc = new Date(timestamp + 'T00:00:00Z').toISOString();
      }
      
      historicalData.push({
        symbol: symbol,
        timestamp_utc: timestampUtc,
        time_range: range,
        time_interval: interval,
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        close: priceData.close,
        adjusted_close: priceData.adjClose,
        volume: priceData.volume,
        data_provider: 'finance_query_api'
      });
    }
    
    console.log(`Fetched ${historicalData.length} data points for ${symbol} ${range} ${interval}`);
    return historicalData;
    
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol} ${range} ${interval}:`, error);
    return [];
  }
}

/**
 * Validate price data
 */
function validatePriceData(data: HistoricalPriceData): boolean {
  // Basic validation checks
  if (!data.symbol || !data.timestamp_utc) return false;
  
  // Check if timestamp is valid
  const date = new Date(data.timestamp_utc);
  if (isNaN(date.getTime())) return false;
  
  // Check if prices are reasonable (not negative)
  if (data.open !== undefined && data.open < 0) return false;
  if (data.high !== undefined && data.high < 0) return false;
  if (data.low !== undefined && data.low < 0) return false;
  if (data.close !== undefined && data.close < 0) return false;
  if (data.volume !== undefined && data.volume < 0) return false;
  
  // Check if high >= low (if both exist)
  if (data.high !== undefined && data.low !== undefined && data.high < data.low) return false;
  
  return true;
}

/**
 * Save historical price data to database using upsert function
 */
async function saveHistoricalData(
  supabase: SupabaseClient, 
  historicalData: HistoricalPriceData[]
): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;
  
  for (const data of historicalData) {
    try {
      // Validate data before saving
      if (!validatePriceData(data)) {
        console.error(`Invalid price data for ${data.symbol} at ${data.timestamp_utc}`);
        failedCount++;
        continue;
      }
      
      const { error } = await supabase.rpc('upsert_historical_price', {
        p_symbol: data.symbol,
        p_timestamp_utc: data.timestamp_utc,
        p_time_range: data.time_range,
        p_time_interval: data.time_interval,
        p_data_provider: data.data_provider,
        p_exchange_code: null,
        p_exchange_name: null,
        p_exchange_country: null,
        p_exchange_timezone: null,
        p_open: data.open,
        p_high: data.high,
        p_low: data.low,
        p_close: data.close,
        p_adjusted_close: data.adjusted_close,
        p_volume: data.volume,
        p_dividend: null,
        p_split_ratio: 1.0
      });
      
      if (error) {
        console.error(`Error saving data for ${data.symbol} at ${data.timestamp_utc}:`, error);
        failedCount++;
      } else {
        successCount++;
      }
    } catch (error) {
      console.error(`Exception saving data for ${data.symbol}:`, error);
      failedCount++;
    }
  }
  
  return { success: successCount, failed: failedCount };
}

/**
 * Process a single symbol with all its range/interval combinations
 */
async function processSymbol(
  supabase: SupabaseClient,
  symbol: string,
  skipExisting: boolean = true
): Promise<{
  symbol: string;
  processed: number;
  skipped: number;
  saved: number;
  failed: number;
  details: any[];
}> {
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalSaved = 0;
  let totalFailed = 0;
  const details = [];
  
  console.log(`Processing symbol: ${symbol}`);
  
  for (const config of RANGE_INTERVAL_CONFIG) {
    for (const interval of config.intervals) {
      try {
        // Check if data already exists (if skipExisting is true)
        if (skipExisting) {
          const exists = await checkExistingData(supabase, symbol, config.range, interval);
          if (exists) {
            console.log(`Skipping ${symbol} ${config.range} ${interval} - data already exists`);
            totalSkipped++;
            details.push({
              range: config.range,
              interval: interval,
              status: 'skipped',
              reason: 'data_already_exists'
            });
            continue;
          }
        }
        
        // Fetch data from API
        const historicalData = await fetchHistoricalData(symbol, config.range, interval);
        
        if (historicalData.length === 0) {
          totalFailed++;
          details.push({
            range: config.range,
            interval: interval,
            status: 'failed',
            reason: 'no_data_from_api'
          });
          continue;
        }
        
        // Save to database
        const saveResult = await saveHistoricalData(supabase, historicalData);
        totalSaved += saveResult.success;
        totalFailed += saveResult.failed;
        totalProcessed++;
        
        details.push({
          range: config.range,
          interval: interval,
          status: 'completed',
          data_points: historicalData.length,
          saved: saveResult.success,
          failed: saveResult.failed
        });
        
        // Small delay between API calls to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing ${symbol} ${config.range} ${interval}:`, error);
        totalFailed++;
        details.push({
          range: config.range,
          interval: interval,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  return {
    symbol,
    processed: totalProcessed,
    skipped: totalSkipped,
    saved: totalSaved,
    failed: totalFailed,
    details
  };
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    console.log('Starting historical price data fetcher...');
    
    // Parse request parameters
    let requestedSymbols: string[] | null = null;
    let skipExisting = true;
    let maxSymbols = 10; // Limit for testing
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
        skipExisting = body.skipExisting !== false; // Default to true
        maxSymbols = body.maxSymbols || maxSymbols;
      } catch {
        // Continue with defaults if request body parsing fails
      }
    }
    
    // Get symbols to process
    const allSymbols = requestedSymbols || await getSymbolsFromStockQuotes(supabaseClient);
    
    if (allSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No symbols found to process',
          processed: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    // Limit symbols for processing (to avoid timeouts)
    const symbolsToProcess = allSymbols.slice(0, maxSymbols);
    
    console.log(`Processing ${symbolsToProcess.length} symbols out of ${allSymbols.length} available`);
    
    const results = [];
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalSaved = 0;
    let totalFailed = 0;
    
    // Process symbols one by one to avoid overwhelming the API
    for (const symbol of symbolsToProcess) {
      try {
        const result = await processSymbol(supabaseClient, symbol, skipExisting);
        results.push(result);
        
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        totalSaved += result.saved;
        totalFailed += result.failed;
        
        console.log(`Completed ${symbol}: processed=${result.processed}, skipped=${result.skipped}, saved=${result.saved}, failed=${result.failed}`);
        
        // Delay between symbols to be respectful to API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing symbol ${symbol}:`, error);
        results.push({
          symbol,
          processed: 0,
          skipped: 0,
          saved: 0,
          failed: 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        totalFailed++;
      }
    }
    
    const summary = {
      success: true,
      message: 'Historical price data fetch completed',
      total_symbols: symbolsToProcess.length,
      range_interval_combinations: RANGE_INTERVAL_CONFIG.length,
      summary: {
        processed: totalProcessed,
        skipped: totalSkipped,
        saved: totalSaved,
        failed: totalFailed
      },
      results: results,
      configuration: RANGE_INTERVAL_CONFIG
    };
    
    console.log('Historical price fetch completed:', summary.summary);
    
    return new Response(
      JSON.stringify(summary),
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
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
