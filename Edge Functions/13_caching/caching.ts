import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };

interface HistoricalDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoricalResponse {
  [symbol: string]: HistoricalDataPoint[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('Starting cache update process...');

    // Check if we need to clean old data (9 AM EST on trading days)
    await cleanOldDataIfNeeded(supabase);

    // Get unique symbols from stock_quotes table
    const { data: symbolsData, error: symbolsError } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');

    if (symbolsError) {
      throw new Error(`Failed to fetch symbols: ${symbolsError.message}`);
    }

    if (!symbolsData || symbolsData.length === 0) {
      console.log('No symbols found in stock_quotes table');
      return new Response(
        JSON.stringify({ success: true, message: 'No symbols to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unique symbols
    const uniqueSymbols = [...new Set(symbolsData.map(row => row.symbol))];
    console.log(`Processing ${uniqueSymbols.length} unique symbols:`, uniqueSymbols);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process symbols in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            await processSymbol(supabase, symbol);
            successCount++;
            console.log(`✓ Successfully processed ${symbol}`);
          } catch (error) {
            errorCount++;
            const errorMsg = `Failed to process ${symbol}: ${error.message}`;
            errors.push(errorMsg);
            console.error(`✗ ${errorMsg}`);
          }
        })
      );

      // Small delay between batches to be respectful to the API
      if (i + batchSize < uniqueSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const result = {
      success: true,
      processed: uniqueSymbols.length,
      successCount,
      errorCount,
      timestamp: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('Cache update completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cache update failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function getMarketOpenTime(currentTime: Date): Date {
  // Convert to Eastern Time to get market timezone
  const easternTime = new Date(currentTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // If it's a weekend, get the previous Friday's market open
  const marketDate = new Date(easternTime);
  if (dayOfWeek === 0) { // Sunday
    marketDate.setDate(marketDate.getDate() - 2); // Go to Friday
  } else if (dayOfWeek === 6) { // Saturday
    marketDate.setDate(marketDate.getDate() - 1); // Go to Friday
  }
  
  // Set to 9:30 AM Eastern (market open)
  marketDate.setHours(9, 30, 0, 0);
  
  // Convert back to UTC for consistency
  const utcMarketOpen = new Date(marketDate.toLocaleString("en-US", { timeZone: "UTC" }));
  
  return utcMarketOpen;
}

async function processSymbol(supabase: ReturnType<typeof createClient>, symbol: string) {
  console.log(`Fetching historical data for ${symbol}...`);

  // Get the last cached timestamp for this symbol to avoid duplicates
  const { data: lastCacheData, error: lastCacheError } = await supabase
    .from('caching')
    .select('period_start')
    .eq('symbol', symbol)
    .eq('period_type', '1min')
    .eq('data_provider', 'finance_query')
    .order('period_start', { ascending: false })
    .limit(1);

  if (lastCacheError) {
    console.warn(`Warning: Could not check last cache timestamp for ${symbol}: ${lastCacheError.message}`);
  }

  // Calculate the start time for fetching data
  let startTime: Date;
  const now = new Date();
  
  if (lastCacheData && lastCacheData.length > 0) {
    // Subsequent runs: Start from 1 minute after the last cached data to avoid overlaps
    startTime = new Date(lastCacheData[0].period_start);
    startTime.setMinutes(startTime.getMinutes() + 1);
    console.log(`Last cached data for ${symbol} at: ${lastCacheData[0].period_start}, fetching from: ${startTime.toISOString()}`);
  } else {
    // First run: Fetch from market open of current trading day
    startTime = getMarketOpenTime(now);
    console.log(`No cached data for ${symbol} (first run), fetching from market open: ${startTime.toISOString()}`);
  }

  // Don't fetch if start time is in the future or too recent (less than 2 minutes ago)
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
  if (startTime > twoMinutesAgo) {
    console.log(`No new data to fetch for ${symbol} - last cache is recent enough`);
    return;
  }

  // Fetch historical data from finance-query API (using original format since API doesn't support start/end)
  const apiUrl = `https://finance-query.onrender.com/v1/historical?symbol=${symbol}&range=1d&interval=1m&epoch=true`;
  
  console.log(`Fetching 1-day data for ${symbol}, will filter to only new data points`);
  
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`Raw API response structure for ${symbol}:`, Object.keys(data).slice(0, 5)); // Show first 5 keys

  // The API returns data in format: { "timestamp": { "open": ..., "high": ..., "low": ..., "close": ..., "volume": ... } }
  let historicalData: HistoricalDataPoint[] = [];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Convert timestamp-based object structure to array
    for (const [timestampStr, candle] of Object.entries(data)) {
      const timestamp = parseInt(timestampStr);
      
      if (!isNaN(timestamp) && candle && typeof candle === 'object') {
        const candleData = candle as any;
        
        // Map the API response fields to our expected structure
        historicalData.push({
          timestamp: timestamp,
          open: candleData.open || 0,
          high: candleData.high || 0,
          low: candleData.low || 0,
          close: candleData.close || candleData.adjClose || 0, // Use close or adjClose
          volume: candleData.volume || 0
        });
      }
    }
    
    // Sort by timestamp to ensure chronological order
    historicalData.sort((a, b) => a.timestamp - b.timestamp);
  }

  if (historicalData.length === 0) {
    console.log(`No new data available for ${symbol} in the specified time range`);
    return; // Don't throw error, just return - this is normal when no new data is available
  }

  console.log(`Received ${historicalData.length} new data points for ${symbol}`);

  // Filter out data points that already exist or are too old
  const filteredData = [];
  const currentCacheTimestamp = new Date().toISOString();
  const cutoffTime = lastCacheData && lastCacheData.length > 0 
    ? new Date(lastCacheData[0].period_start) 
    : startTime; // Use market open time for first runs
  
  // Get all existing timestamps for this symbol in one query for efficiency
  const { data: existingTimestamps, error: timestampError } = await supabase
    .from('caching')
    .select('period_start')
    .eq('symbol', symbol)
    .eq('period_type', '1min')
    .eq('data_provider', 'finance_query')
    .gte('period_start', cutoffTime.toISOString());

  if (timestampError) {
    console.warn(`Warning: Could not fetch existing timestamps for ${symbol}: ${timestampError.message}`);
  }

  const existingTimestampSet = new Set(
    existingTimestamps?.map((row: { period_start: string }) => row.period_start) || []
  );
  
  for (const point of historicalData) {
    const periodStart = new Date(point.timestamp * 1000);
    const periodStartISO = periodStart.toISOString();
    
    // Only include data points that are newer than our cutoff and don't already exist
    if (periodStart > cutoffTime && !existingTimestampSet.has(periodStartISO)) {
      filteredData.push(point);
    }
  }

  if (filteredData.length === 0) {
    console.log(`All data points for ${symbol} already exist in cache`);
    return;
  }

  // Prepare data for insertion
  const cacheEntries = filteredData.map((point: HistoricalDataPoint) => {
    const periodStart = new Date(point.timestamp * 1000);
    const periodEnd = new Date(periodStart.getTime() + 60000); // Add 1 minute

    return {
      symbol: symbol,
      open: point.open,
      high: point.high,
      low: point.low,
      adjclose: point.close,
      volume: point.volume,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      period_type: '1min',
      data_provider: 'finance_query',
      cache_timestamp: currentCacheTimestamp,
    };
  });

  // Insert new data only (no upsert needed since we've already filtered)
  const { error: insertError } = await supabase
    .from('caching')
    .insert(cacheEntries);

  if (insertError) {
    throw new Error(`Database insert failed: ${insertError.message}`);
  }

  console.log(`✓ Inserted ${cacheEntries.length} new cache entries for ${symbol}`);
}

async function cleanOldDataIfNeeded(supabase: ReturnType<typeof createClient>) {
  const now = new Date();
  
  // Convert to Eastern Time
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Check if it's a trading day (Monday to Friday)
  const isTradingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  
  // Check if it's 9 AM Eastern (within a 1-minute window)
  const isCleanupTime = hour === 9 && minute === 0;

  if (isTradingDay && isCleanupTime) {
    console.log('🧹 Cleaning old cache data at 9 AM Eastern on trading day...');
    
    try {
      // Delete data older than 24 hours
      const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const { error: deleteError, count } = await supabase
        .from('caching')
        .delete()
        .lt('cache_timestamp', cutoffTime.toISOString());

      if (deleteError) {
        console.error('Failed to clean old cache data:', deleteError.message);
      } else {
        console.log(`✓ Cleaned ${count || 0} old cache entries`);
      }
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  } else {
    console.log(`Cleanup not needed - Current time: ${easternTime.toISOString()}, Trading day: ${isTradingDay}, Cleanup time: ${isCleanupTime}`);
  }
}
