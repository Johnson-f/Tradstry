/**
 * Supabase Edge Function: Stock Peers Data Fetcher - V2
 * 
 * MANUAL/CRON TRIGGERED ONLY - This function is designed to be triggered by:
 * - Cron job schedules (e.g., daily/weekly)
 * - Manual trigger from admin interface
 * - NOT automatic on user requests
 * 
 * Functionality:
 * - Fetches stock symbols from stock_quotes table
 * - Retrieves peer company data from finance-query API
 * - Stores symbol, name, logo (NO price data) in stock_peers table
 * - Matches redesigned table schema without price fields
 * 
 * Table Schema Match: stock_peers
 * - symbol: VARCHAR(20) - Ticker symbol as TEXT
 * - name: VARCHAR(255) - Company name
 * - logo: VARCHAR(500) - Logo URL
 * - peer_of: VARCHAR(20) - Symbol this is a peer of
 * - data_provider: VARCHAR(50) - Source provider
 * - fetch_timestamp, data_date: Timestamp tracking
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Interface for the API response from finance-query endpoint
interface PeerAPIResponse {
  symbol: string;
  name: string;
  price?: string;    // Ignored - not stored
  change?: string;   // Ignored - not stored  
  percentChange?: string; // Ignored - not stored
  logo: string;
}

// Interface for peer data storage - matches stock_peers table schema
interface StockPeerData {
  symbol: string;          // Ticker symbol as TEXT (not number)
  name: string;           // Company name
  logo: string;           // Logo URL for UI display
  peer_of: string;        // Symbol this is a peer of
  data_provider: string;  // Fixed: 'finance_query'
  fetch_timestamp?: string; // Auto-generated timestamp
  data_date?: string;     // Auto-generated date
}

// Interface for stock quote data from database
interface StockQuoteRecord {
  symbol: string;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Validate ticker symbol format (TEXT storage requirement)
 */
function isValidTickerSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  
  // Allow letters, numbers, periods, underscores, hyphens (1-20 chars)
  return /^[A-Z0-9._-]{1,20}$/.test(symbol.toUpperCase().trim());
}

/**
 * Transform API response to database format - NO PRICE DATA
 */
function transformToPeerData(apiData: PeerAPIResponse, peerOfSymbol: string): StockPeerData {
  const symbolText = apiData.symbol.toString().toUpperCase().trim();
  const peerOfText = peerOfSymbol.toString().toUpperCase().trim();
  
  // Validate ticker symbols
  if (!isValidTickerSymbol(symbolText)) {
    throw new Error(`Invalid peer symbol format: ${symbolText}`);
  }
  
  if (!isValidTickerSymbol(peerOfText)) {
    throw new Error(`Invalid peer_of symbol format: ${peerOfText}`);
  }

  return {
    symbol: symbolText,
    name: apiData.name || symbolText, // Fallback to symbol if name missing
    logo: apiData.logo || '',         // Empty string if no logo
    peer_of: peerOfText,
    data_provider: 'finance_query',
    fetch_timestamp: getCurrentTimestamp(),
    data_date: getCurrentDate()
  };
}

/**
 * Fetch stock symbols from stock_quotes table
 * These are the symbols we'll fetch peers for
 */
async function getStockSymbolsFromQuotes(supabase: SupabaseClient): Promise<string[]> {
  try {
    console.log('Fetching stock symbols from stock_quotes table...');
    
    const { data, error } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching stock symbols:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.warn('No stock symbols found in stock_quotes table');
      return [];
    }
    
    // Extract unique symbols and validate format
    const uniqueSymbols = [...new Set(
      data
        .map((row: StockQuoteRecord) => row.symbol)
        .filter(symbol => isValidTickerSymbol(symbol))
        .map(symbol => symbol.toUpperCase().trim())
    )];
    
    console.log(`Found ${uniqueSymbols.length} valid stock symbols to process`);
    return uniqueSymbols;
    
  } catch (error) {
    console.error('Error in getStockSymbolsFromQuotes:', error);
    throw error;
  }
}

/**
 * Fetch peer data from finance-query API for a specific symbol
 */
async function fetchPeerDataFromAPI(symbol: string): Promise<PeerAPIResponse[]> {
  const url = `https://finance-query.onrender.com/v1/similar?symbol=${symbol}`;
  
  try {
    console.log(`Fetching peers for ${symbol} from API...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-EdgeFunction/1.0'
      }
    });
    
    if (!response.ok) {
      const statusText = response.statusText || 'Unknown error';
      console.error(`API request failed for ${symbol}: ${response.status} ${statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error(`Invalid API response for ${symbol} - expected array:`, data);
      return [];
    }
    
    console.log(`Successfully fetched ${data.length} peers for ${symbol}`);
    return data;
    
  } catch (error) {
    console.error(`Network error fetching peers for ${symbol}:`, error);
    return [];
  }
}

/**
 * Save peer data to stock_peers table using upsert
 * Matches table schema exactly
 */
async function savePeerDataToDatabase(
  supabase: SupabaseClient, 
  peerDataList: StockPeerData[]
): Promise<{ success: number; errors: number; details: any[] }> {
  
  if (peerDataList.length === 0) {
    return { success: 0, errors: 0, details: [] };
  }
  
  let successCount = 0;
  let errorCount = 0;
  const details: any[] = [];
  
  console.log(`Saving ${peerDataList.length} peer records to database...`);
  
  // Process peers individually to handle conflicts gracefully
  for (const peerData of peerDataList) {
    try {
      const { error } = await supabase
        .from('stock_peers')
        .upsert(peerData, {
          onConflict: 'symbol,peer_of,data_provider', // Match unique constraint
          ignoreDuplicates: false // Update existing records
        });
      
      if (error) {
        console.error(`Database error for ${peerData.symbol} (peer of ${peerData.peer_of}):`, error);
        errorCount++;
        details.push({
          symbol: peerData.symbol,
          peer_of: peerData.peer_of,
          status: 'error',
          message: error.message
        });
      } else {
        successCount++;
        details.push({
          symbol: peerData.symbol,
          peer_of: peerData.peer_of,
          status: 'success'
        });
      }
      
    } catch (upsertError) {
      console.error(`Unexpected error saving ${peerData.symbol}:`, upsertError);
      errorCount++;
      details.push({
        symbol: peerData.symbol,
        peer_of: peerData.peer_of,
        status: 'error',
        message: upsertError instanceof Error ? upsertError.message : 'Unknown error'
      });
    }
  }
  
  console.log(`Database save completed: ${successCount} success, ${errorCount} errors`);
  return { success: successCount, errors: errorCount, details };
}

/**
 * Process a single stock symbol: fetch peers and save to database
 */
async function processStockSymbol(
  supabase: SupabaseClient, 
  symbol: string
): Promise<{ 
  symbol: string; 
  peers_fetched: number; 
  peers_saved: number; 
  errors: number; 
  status: string 
}> {
  
  try {
    console.log(`\n--- Processing ${symbol} ---`);
    
    // Fetch peer data from API
    const apiPeerData = await fetchPeerDataFromAPI(symbol);
    
    if (apiPeerData.length === 0) {
      console.log(`No peers found for ${symbol}`);
      return {
        symbol,
        peers_fetched: 0,
        peers_saved: 0,
        errors: 0,
        status: 'no_peers_found'
      };
    }
    
    // Transform API data to database format
    const validPeerData: StockPeerData[] = [];
    let transformErrors = 0;
    
    for (const apiPeer of apiPeerData) {
      try {
        const transformedPeer = transformToPeerData(apiPeer, symbol);
        validPeerData.push(transformedPeer);
      } catch (transformError) {
        console.error(`Transform error for ${apiPeer.symbol}:`, transformError);
        transformErrors++;
      }
    }
    
    if (validPeerData.length === 0) {
      console.log(`No valid peer data after transformation for ${symbol}`);
      return {
        symbol,
        peers_fetched: apiPeerData.length,
        peers_saved: 0,
        errors: transformErrors,
        status: 'transform_failed'
      };
    }
    
    // Save to database
    const saveResults = await savePeerDataToDatabase(supabase, validPeerData);
    
    return {
      symbol,
      peers_fetched: apiPeerData.length,
      peers_saved: saveResults.success,
      errors: transformErrors + saveResults.errors,
      status: saveResults.success > 0 ? 'success' : 'save_failed'
    };
    
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error);
    return {
      symbol,
      peers_fetched: 0,
      peers_saved: 0,
      errors: 1,
      status: 'processing_failed'
    };
  }
}

/**
 * Add delay between API requests to be respectful
 */
async function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Main Edge Function Handler
 * ONLY accepts POST requests (manual/cron trigger only)
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  // ONLY allow POST - this prevents accidental GET requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Method not allowed',
        message: 'This function only accepts POST requests (manual/cron trigger only)',
        allowed_methods: ['POST']
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405
      }
    );
  }
  
  const startTime = Date.now();
  
  try {
    console.log('=== STOCK PEERS FETCH STARTED ===');
    console.log('Timestamp:', getCurrentTimestamp());
    
    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    // Parse request body for optional configuration
    let specificSymbols: string[] | null = null;
    let batchSize = 10; // Process 10 symbols at a time
    let delayBetweenRequests = 1000; // 1 second delay
    
    try {
      const requestBody = await req.json();
      specificSymbols = requestBody.symbols;
      batchSize = requestBody.batch_size || batchSize;
      delayBetweenRequests = requestBody.delay_ms || delayBetweenRequests;
    } catch {
      // Continue with defaults if body parsing fails
      console.log('Using default processing parameters');
    }
    
    // Get stock symbols to process
    const stockSymbols = specificSymbols || await getStockSymbolsFromQuotes(supabaseClient);
    
    if (stockSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No stock symbols found to process',
          processed_symbols: 0,
          timestamp: getCurrentTimestamp()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    console.log(`Starting to process ${stockSymbols.length} stock symbols...`);
    
    // Process symbols in batches
    const results = [];
    let totalProcessed = 0;
    let totalPeersSaved = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < stockSymbols.length; i += batchSize) {
      const batch = stockSymbols.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(stockSymbols.length / batchSize)}`);
      
      for (const symbol of batch) {
        const result = await processStockSymbol(supabaseClient, symbol);
        results.push(result);
        
        totalProcessed++;
        totalPeersSaved += result.peers_saved;
        totalErrors += result.errors;
        
        // Add delay between requests (except for the last one)
        if (totalProcessed < stockSymbols.length) {
          await delay(delayBetweenRequests);
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    const response = {
      success: true,
      message: 'Stock peers fetch completed successfully',
      summary: {
        total_symbols_requested: stockSymbols.length,
        symbols_processed: totalProcessed,
        total_peers_saved: totalPeersSaved,
        total_errors: totalErrors,
        processing_time_ms: processingTime,
        api_endpoint: 'https://finance-query.onrender.com/v1/similar',
        data_provider: 'finance_query',
        timestamp: getCurrentTimestamp()
      },
      results: results.slice(0, 100), // Limit response size for large batches
      config: {
        batch_size: batchSize,
        delay_between_requests_ms: delayBetweenRequests,
        trigger_type: 'manual_or_cron'
      }
    };
    
    console.log('=== STOCK PEERS FETCH COMPLETED ===');
    console.log(`Processed: ${totalProcessed}, Saved: ${totalPeersSaved}, Errors: ${totalErrors}`);
    console.log(`Processing time: ${processingTime}ms`);
    
    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== EDGE FUNCTION ERROR ===');
    console.error('Error:', error);
    console.error(`Processing time before error: ${processingTime}ms`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Internal server error during stock peers fetch',
        processing_time_ms: processingTime,
        timestamp: getCurrentTimestamp()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
