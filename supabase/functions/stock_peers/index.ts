/**
 * Supabase Edge Function: Stock Peers Fetcher
 * 
 * This Edge Function fetches stock symbols from the stock_quotes table,
 * retrieves peer company data from the finance-query API,
 * and updates the stock_peers table with the latest peer information.
 * 
 * Designed to run periodically to keep peer data fresh.
 * Updates existing records instead of creating duplicates.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Interface for the API response from finance-query similar endpoint
interface PeerResponse {
  symbol: string;
  name: string;
  price: string;
  change: string;
  percentChange: string;
  logo: string;
}

// Interface for peer data to be saved - REDESIGNED: NO PRICE DATA
interface PeerData {
  symbol: string;  // Ticker symbol as TEXT (not number)
  name: string;
  logo: string;
  peer_of: string;
  data_provider: string;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse percentage string to decimal (e.g., "+1.76%" -> 1.76)
 * Clamps values to prevent database overflow for DECIMAL(8,4) fields
 */
function parsePercentage(percentStr: string): number | undefined {
  if (!percentStr) return undefined;
  
  const cleanStr = percentStr.replace(/[+%,]/g, '');
  const parsed = parseFloat(cleanStr);
  if (isNaN(parsed)) return undefined;
  
  // Clamp to prevent DECIMAL(8,4) overflow (max value: 9999.9999)
  return Math.max(-9999.9999, Math.min(9999.9999, parsed));
}

/**
 * Transform API response to peer data - REDESIGNED: NO PRICE DATA
 */
function transformToPeerData(apiData: PeerResponse, peerOf: string): PeerData {
  try {
    // Ensure symbol is stored as TEXT (not number) and properly formatted
    const symbolText = apiData.symbol.toString().toUpperCase().trim();
    
    // Validate that symbol looks like a ticker (letters/digits, reasonable length)
    if (!/^[A-Z0-9._-]{1,20}$/.test(symbolText)) {
      console.warn(`Invalid ticker symbol format: ${symbolText}`);
    }

    return {
      symbol: symbolText,  // Store as TEXT ticker symbol
      name: apiData.name || symbolText,
      logo: apiData.logo || '',
      peer_of: peerOf.toUpperCase().trim(),
      data_provider: 'finance-query'
    };
  } catch (error) {
    console.error(`Error transforming peer data for ${apiData.symbol}:`, error);
    throw error;
  }
}

/**
 * Fetch existing symbols from the stock_quotes table
 */
async function getExistingSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching existing symbols:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log('No existing symbols found in stock_quotes table');
      return [];
    }
    
    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    console.log(`Found ${uniqueSymbols.length} unique symbols in stock_quotes table`);
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    return [];
  }
}

/**
 * Fetch peer data from the finance-query API
 */
async function fetchPeerData(symbol: string): Promise<PeerResponse[]> {
  try {
    const url = `https://finance-query.onrender.com/v1/similar?symbol=${symbol}`;
    
    console.log(`Fetching peer data for ${symbol} from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`API request failed for ${symbol} with status: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error(`API response for ${symbol} is not an array:`, data);
      return [];
    }
    
    console.log(`Successfully fetched ${data.length} peers for ${symbol}`);
    return data;
  } catch (error) {
    console.error(`Error fetching peer data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Save peer data to the database using upsert
 */
async function savePeerData(supabase: SupabaseClient, peerData: PeerData[]): Promise<{ success: number; errors: number }> {
  if (peerData.length === 0) return { success: 0, errors: 0 };
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process each peer individually to handle potential conflicts
  for (const peer of peerData) {
    try {
      const { error } = await supabase
        .from('stock_peers')
        .upsert(
          {
            ...peer,
            updated_at: getCurrentTimestamp()
          },
          {
            onConflict: 'symbol,peer_of,data_provider'
          }
        );
      
      if (error) {
        console.error(`Error upserting peer data for ${peer.symbol} (peer of ${peer.peer_of}):`, error);
        errorCount++;
      } else {
        console.log(`Successfully upserted peer data for ${peer.symbol} (peer of ${peer.peer_of})`);
        successCount++;
      }
    } catch (upsertError) {
      console.error(`Error processing peer ${peer.symbol}:`, upsertError);
      errorCount++;
    }
  }
  
  return { success: successCount, errors: errorCount };
}

/**
 * Validate peer data for basic sanity checks - REDESIGNED: NO PRICE VALIDATION
 */
function validatePeerData(peer: PeerData): boolean {
  // Basic validation checks
  if (!peer.symbol || !peer.peer_of) return false;
  
  // Validate ticker symbol format
  if (!/^[A-Z0-9._-]{1,20}$/.test(peer.symbol)) return false;
  if (!/^[A-Z0-9._-]{1,20}$/.test(peer.peer_of)) return false;
  
  return true;
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
    
    console.log('Starting stock peers fetch...');
    
    // Parse request body for any specific symbols (optional)
    let requestedSymbols: string[] | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
      } catch {
        // Continue with existing symbols if request body parsing fails
      }
    }
    
    // Get symbols to process
    const symbolsToProcess = requestedSymbols || await getExistingSymbols(supabaseClient);
    
    if (symbolsToProcess.length === 0) {
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
    
    console.log(`Processing peers for ${symbolsToProcess.length} symbols`);
    
    // Process symbols individually (API doesn't support batch requests for peers)
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    const results = [];
    
    for (const symbol of symbolsToProcess) {
      try {
        console.log(`Processing peers for ${symbol}`);
        
        // Fetch peer data from the API
        const apiData = await fetchPeerData(symbol);
        
        if (apiData.length === 0) {
          console.log(`No peer data returned for ${symbol}`);
          totalErrors++;
          
          results.push({
            symbol,
            status: 'error',
            message: 'No peer data returned from API'
          });
          
          continue;
        }
        
        // Transform API data to peer format
        const peerData: PeerData[] = [];
        const symbolResults: any[] = [];
        
        for (const apiItem of apiData) {
          try {
            const transformed = transformToPeerData(apiItem, symbol);
            
            if (validatePeerData(transformed)) {
              peerData.push(transformed);
              symbolResults.push({
                peer_symbol: transformed.symbol,
                peer_of: symbol,
                status: 'success',
                price: transformed.price,
                change: transformed.change,
                percent_change: transformed.percent_change
              });
            } else {
              symbolResults.push({
                peer_symbol: apiItem.symbol,
                peer_of: symbol,
                status: 'error',
                message: 'Data validation failed'
              });
            }
          } catch (transformError) {
            console.error(`Error transforming peer data for ${apiItem.symbol}:`, transformError);
            symbolResults.push({
              peer_symbol: apiItem.symbol,
              peer_of: symbol,
              status: 'error',
              message: 'Data transformation failed'
            });
          }
        }
        
        // Save valid peer data to database
        if (peerData.length > 0) {
          const saveResults = await savePeerData(supabaseClient, peerData);
          totalSuccess += saveResults.success;
          totalErrors += saveResults.errors;
          
          // Update results with save status
          symbolResults.forEach(result => {
            if (result.status === 'success') {
              const wasSuccessfullySaved = peerData.some(p => p.symbol === result.peer_symbol);
              if (!wasSuccessfullySaved) {
                result.status = 'error';
                result.message = 'Failed to save to database';
              }
            }
          });
        }
        
        results.push({
          symbol,
          peers_found: apiData.length,
          peers_saved: peerData.length,
          peers: symbolResults.slice(0, 10) // Limit response size
        });
        
        totalProcessed++;
        
        // Add delay between requests to be respectful to the API
        if (totalProcessed < symbolsToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (symbolError) {
        console.error(`Error processing symbol ${symbol}:`, symbolError);
        totalErrors++;
        
        results.push({
          symbol,
          status: 'error',
          message: symbolError instanceof Error ? symbolError.message : 'Symbol processing failed'
        });
      }
    }
    
    const response = {
      success: true,
      message: 'Stock peers fetch completed',
      summary: {
        total_symbols: symbolsToProcess.length,
        processed: totalProcessed,
        successful_peers: totalSuccess,
        errors: totalErrors,
        api_endpoint: 'https://finance-query.onrender.com/v1/similar',
        timestamp: getCurrentTimestamp()
      },
      results: results.slice(0, 50) // Limit response size
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
        message: 'Internal server error in stock peers fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});