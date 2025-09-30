/**
 * Supabase Edge Function: Stock Quotes Symbol Tracker
 * 
 * This Edge Function tracks stock symbol metadata and maintains symbol registry
 * without storing price data. Price data is fetched from external APIs in real-time.
 * 
 * Providers used for symbol validation:
 * 1. Alpha Vantage
 * 2. Finnhub
 * 3. Polygon
 * 4. Twelve Data
 * 5. Tiingo
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// REDESIGNED: Stock quote metadata without price data
interface StockQuote {
  symbol: string;  // Ticker symbol as TEXT (not number)
  exchange_id?: number;
  quote_timestamp: string; // ISO timestamp
  data_provider: string;
  // NO PRICE FIELDS - use external APIs for real-time prices
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    quote?: string;
    quotes?: string;
    realtime?: string;
  };
  rateLimit: number; // requests per minute
}

// Provider configurations for symbol validation
const PROVIDERS: Record<string, ProviderConfig> = {
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      quote: '?function=SYMBOL_SEARCH',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      quote: '/search',
    },
    rateLimit: 30 // 30 per second for free tier
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v3',
    endpoints: {
      quote: '/reference/tickers',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      quote: '/symbol_search',
    },
    rateLimit: 8 // 8 per minute for free tier
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/utilities',
    endpoints: {
      quote: '/search',
    },
    rateLimit: 500 // 500 per hour for free tier
  }
};

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate symbol from Alpha Vantage
 */
async function validateFromAlphaVantage(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}&keywords=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data.bestMatches) return null;
    
    // Check if symbol exists in search results
    const matches = data.bestMatches;
    const symbolMatch = matches.find((match: any) => match['1. symbol'] === symbol);
    
    if (!symbolMatch) return null;
    
    return {
      symbol: symbol,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'alpha_vantage'
    };
  } catch (error) {
    console.error(`Alpha Vantage symbol validation error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Validate symbol from Finnhub
 */
async function validateFromFinnhub(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?q=${symbol}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.result || !Array.isArray(data.result) || data.result.length === 0) return null;
    
    // Check if exact symbol match exists
    const symbolMatch = data.result.find((result: any) => result.symbol === symbol);
    
    if (!symbolMatch) return null;
    
    return {
      symbol: symbol,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'finnhub'
    };
  } catch (error) {
    console.error(`Finnhub symbol validation error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Validate symbol from Polygon
 */
async function validateFromPolygon(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?ticker=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) return null;
    
    // Check if symbol exists in results
    const symbolMatch = data.results.find((result: any) => result.ticker === symbol);
    
    if (!symbolMatch) return null;
    
    return {
      symbol: symbol,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'polygon'
    };
  } catch (error) {
    console.error(`Polygon symbol validation error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Validate symbol from Twelve Data
 */
async function validateFromTwelveData(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) return null;
    
    // Check if symbol exists in search results
    const symbolMatch = data.data.find((result: any) => result.symbol === symbol);
    
    if (!symbolMatch) return null;
    
    return {
      symbol: symbol,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'twelve_data'
    };
  } catch (error) {
    console.error(`Twelve Data symbol validation error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Validate symbol from Tiingo
 */
async function validateFromTiingo(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?query=${symbol}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    // Check if exact symbol match exists
    const symbolMatch = data.find((result: any) => result.ticker === symbol);
    
    if (!symbolMatch) return null;
    
    return {
      symbol: symbol,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'tiingo'
    };
  } catch (error) {
    console.error(`Tiingo symbol validation error for ${symbol}:`, error);
    return null;
  }
}


/**
 * Combine symbol validation results from multiple providers
 */
function combineValidationData(dataArray: (StockQuote | null)[]): StockQuote | null {
  const validData = dataArray.filter(quote => quote !== null) as StockQuote[];
  
  if (validData.length === 0) return null;
  
  // Provider priority for symbol validation (highest to lowest)
  const providerPriority = {
    'finnhub': 5,        // Best for symbol search
    'alpha_vantage': 4,  // Good symbol search
    'polygon': 3,        // Good ticker reference
    'twelve_data': 2,    // Decent symbol search
    'tiingo': 1          // Basic symbol search
  };
  
  // Sort by provider priority (highest first)
  validData.sort((a, b) => {
    const aPriority = providerPriority[a.data_provider as keyof typeof providerPriority] || 0;
    const bPriority = providerPriority[b.data_provider as keyof typeof providerPriority] || 0;
    return bPriority - aPriority;
  });
  
  // Use the highest priority validation result
  const baseValidation = validData[0];
  const combined: StockQuote = {
    symbol: baseValidation.symbol,
    quote_timestamp: getCurrentTimestamp(),
    data_provider: validData.map(q => q.data_provider).join(', ')
  };
  
  // Use exchange_id from any provider that has it
  for (const validation of validData) {
    if (!combined.exchange_id && validation.exchange_id !== undefined) {
      combined.exchange_id = validation.exchange_id;
    }
  }
  
  return combined;
}

/**
 * Fetch existing symbols from the database
 */
async function getExistingSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    // Get symbols from stock_quotes table only
    const { data: quotesData, error: quotesError } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');
    
    if (!quotesError && quotesData && quotesData.length > 0) {
      const uniqueSymbols = [...new Set(quotesData.map((row: { symbol: string }) => row.symbol))];
      return uniqueSymbols;
    }
    
    // Return empty array if no existing symbols found - don't add new stocks
    console.log('No existing symbols found in stock_quotes table');
    return [];
    
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    return [];
  }
}

/**
 * Save/update stock symbol metadata to the database
 */
async function saveStockSymbolData(supabase: SupabaseClient, symbolData: StockQuote[]): Promise<boolean> {
  if (symbolData.length === 0) return true;
  
  try {
    // Use direct insert/update for symbol metadata (no pricing data)
    let successfulUpdates = 0;
    
    for (const symbol of symbolData) {
      try {
        // Check if symbol already exists
        const { data: existingRecord } = await supabase
          .from('stock_quotes')
          .select('id')
          .eq('symbol', symbol.symbol)
          .single();
        
        if (existingRecord) {
          // Update existing record with new metadata
          const { error: updateError } = await supabase
            .from('stock_quotes')
            .update({
              quote_timestamp: symbol.quote_timestamp,
              data_provider: symbol.data_provider,
              updated_at: getCurrentTimestamp()
            })
            .eq('symbol', symbol.symbol);
          
          if (updateError) {
            console.error(`Error updating symbol ${symbol.symbol}:`, updateError);
          } else {
            successfulUpdates++;
            console.log(`Successfully updated symbol metadata for ${symbol.symbol}`);
          }
        } else {
          // Insert new symbol record
          const { error: insertError } = await supabase
            .from('stock_quotes')
            .insert({
              symbol: symbol.symbol,
              exchange_id: symbol.exchange_id,
              quote_timestamp: symbol.quote_timestamp,
              data_provider: symbol.data_provider
            });
          
          if (insertError) {
            console.error(`Error inserting symbol ${symbol.symbol}:`, insertError);
          } else {
            successfulUpdates++;
            console.log(`Successfully inserted new symbol ${symbol.symbol}`);
          }
        }
      } catch (symbolError) {
        console.error(`Error processing symbol ${symbol.symbol}:`, symbolError);
      }
    }
    
    if (successfulUpdates === 0) {
      console.log('No records were successfully processed');
      return false;
    }
    
    console.log(`Successfully processed ${successfulUpdates} out of ${symbolData.length} symbol records`);
    return true;
  } catch (error) {
    console.error(`Error in saveStockSymbolData:`, error);
    return false;
  }
}

/**
 * Validate symbol data for basic sanity checks
 */
function validateSymbolData(symbolData: StockQuote): boolean {
  // Basic validation checks
  if (!symbolData.symbol || !symbolData.quote_timestamp) return false;
  
  // Validate ticker symbol format (letters, numbers, dots, hyphens only)
  const symbolRegex = /^[A-Z0-9._-]{1,20}$/;
  if (!symbolRegex.test(symbolData.symbol)) return false;
  
  // Check if timestamp is valid
  const timestamp = new Date(symbolData.quote_timestamp);
  if (isNaN(timestamp.getTime())) return false;
  
  // Validate data provider is specified
  if (!symbolData.data_provider || symbolData.data_provider.length === 0) return false;
  
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
    
    console.log('Starting stock symbol validation and tracking...');
    
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
    
    console.log(`Found ${symbolsToProcess.length} symbols to process`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process symbols in batches to respect rate limits
    const batchSize = 5; // Quotes are faster than historical data
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(symbolsToProcess.length / batchSize)}`);
        
        // Process each symbol individually
        for (const symbol of batch) {
          try {
            console.log(`Validating symbol ${symbol}...`);
            
            // Validate symbol from available providers
            const providerPromises = [
              validateFromFinnhub(symbol),
              validateFromAlphaVantage(symbol),
              validateFromPolygon(symbol),
              validateFromTwelveData(symbol),
              validateFromTiingo(symbol),
            ];
            
            const providerResults = await Promise.allSettled(providerPromises);
            
            // Filter successful results
            const validResults = providerResults
              .map(result => result.status === 'fulfilled' ? result.value : null)
              .filter(result => result !== null);
            
            if (validResults.length > 0) {
              const combinedValidation = combineValidationData(validResults);
              
              if (combinedValidation && validateSymbolData(combinedValidation)) {
                const saved = await saveStockSymbolData(supabaseClient, [combinedValidation]);
                
                if (saved) {
                  successCount++;
                  
                  results.push({
                    symbol,
                    status: 'success',
                    providers_used: validResults.length,
                    data_sources: combinedValidation.data_provider,
                    last_updated: combinedValidation.quote_timestamp
                  });
                } else {
                  errorCount++;
                  results.push({
                    symbol,
                    status: 'error',
                    message: 'Failed to save to database'
                  });
                }
              } else {
                errorCount++;
                results.push({
                  symbol,
                  status: 'error',
                  message: 'Invalid symbol data after validation'
                });
              }
            } else {
              errorCount++;
              results.push({
                symbol,
                status: 'error',
                message: 'No data from any provider'
              });
            }
            
            processedCount++;
            
            // Small delay between symbols to be respectful to APIs
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (symbolError) {
            errorCount++;
            console.error(`Error processing symbol ${symbol}:`, symbolError);
            results.push({
              symbol,
              status: 'error',
              message: symbolError.message
            });
          }
        }
        
      } catch (error) {
        errorCount += batch.length;
        console.error(`Error processing batch:`, error);
        for (const symbol of batch) {
          results.push({
            symbol,
            status: 'error',
            message: error.message
          });
        }
      }
      
      // Delay between batches to respect rate limits
      if (i + batchSize < symbolsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const response = {
      success: true,
      message: 'Stock symbol validation and tracking completed',
      summary: {
        total_symbols: symbolsToProcess.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount,
        providers_available: Object.keys(PROVIDERS).length,
        timestamp: getCurrentTimestamp()
      },
      results: results.slice(0, 100) // Limit response size
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
        error: error.message,
        message: 'Internal server error in stock symbol validation'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
