/**
 * Supabase Edge Function: Stock Quotes Multi-Provider Fetcher
 * 
 * This Edge Function fetches real-time stock quotes from 12 different market data providers,
 * combines the data to create comprehensive quote records with deduplication,
 * and saves them to the database.
 * 
 * Providers used for stock quotes:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 * 7. Yahoo Finance
 * 8. API Ninjas
 * 9. Fiscal AI (if available)
 * 10. FRED (for indices/ETFs)
 * 11. Currents API (auxiliary data)
 * 12. NewsAPI (for sentiment correlation)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for stock quote data
interface StockQuote {
  symbol: string;
  exchange_id?: number;
  price?: number;
  change_amount?: number;
  change_percent?: number;
  volume?: number;
  open_price?: number;
  high_price?: number;
  low_price?: number;
  previous_close?: number;
  quote_timestamp: string; // ISO timestamp
  data_provider: string;
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

// Provider configurations for stock quotes
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      quote: '/quote',
      quotes: '/quote',
    },
    rateLimit: 300 // 300 per day for free tier
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      quote: '?function=GLOBAL_QUOTE',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      quote: '/quote',
    },
    rateLimit: 30 // 30 per second for free tier
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v2',
    endpoints: {
      quote: '/aggs/ticker',
      realtime: '/last/nbbo',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      quote: '/quote',
      realtime: '/price',
    },
    rateLimit: 8 // 8 per minute for free tier
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/iex',
    endpoints: {
      quote: '',
    },
    rateLimit: 500 // 500 per hour for free tier
  },
  yahoo_finance: {
    name: 'Yahoo Finance',
    apiKey: '', // No API key required for basic access
    baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    endpoints: {
      quote: '',
    },
    rateLimit: 1000 // Conservative estimate
  },
  api_ninjas: {
    name: 'API Ninjas',
    apiKey: Deno.env.get('API_NINJAS_KEY') || '',
    baseUrl: 'https://api.api-ninjas.com/v1',
    endpoints: {
      quote: '/stockprice',
    },
    rateLimit: 10000 // 10k per month for free tier
  }
};

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Fetch stock quote from Financial Modeling Prep
 */
async function fetchFromFMP(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}/${symbol}?apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const quote = data[0];
    return {
      symbol: symbol,
      price: quote.price ? parseFloat(quote.price) : undefined,
      change_amount: quote.change ? parseFloat(quote.change) : undefined,
      change_percent: quote.changesPercentage ? parseFloat(quote.changesPercentage) : undefined,
      volume: quote.volume ? parseInt(quote.volume) : undefined,
      open_price: quote.open ? parseFloat(quote.open) : undefined,
      high_price: quote.dayHigh ? parseFloat(quote.dayHigh) : undefined,
      low_price: quote.dayLow ? parseFloat(quote.dayLow) : undefined,
      previous_close: quote.previousClose ? parseFloat(quote.previousClose) : undefined,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'fmp'
    };
  } catch (error) {
    console.error(`FMP quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Alpha Vantage
 */
async function fetchFromAlphaVantage(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}&symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data['Global Quote']) return null;
    
    const quote = data['Global Quote'];
    return {
      symbol: symbol,
      price: parseFloat(quote['05. price']),
      change_amount: parseFloat(quote['09. change']),
      change_percent: parseFloat(quote['10. change percent'].replace('%', '')),
      volume: parseInt(quote['06. volume']),
      open_price: parseFloat(quote['02. open']),
      high_price: parseFloat(quote['03. high']),
      low_price: parseFloat(quote['04. low']),
      previous_close: parseFloat(quote['08. previous close']),
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'alpha_vantage'
    };
  } catch (error) {
    console.error(`Alpha Vantage quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Finnhub
 */
async function fetchFromFinnhub(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?symbol=${symbol}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.c) return null; // No current price
    
    return {
      symbol: symbol,
      price: data.c, // current price
      change_amount: data.d, // change
      change_percent: data.dp, // percent change
      open_price: data.o, // open price
      high_price: data.h, // high price
      low_price: data.l, // low price
      previous_close: data.pc, // previous close
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'finnhub'
    };
  } catch (error) {
    console.error(`Finnhub quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Polygon
 */
async function fetchFromPolygon(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    // Get yesterday's date for the aggregates endpoint
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const url = `${config.baseUrl}${config.endpoints.quote}/${symbol}/range/1/day/${dateStr}/${dateStr}?adjusted=true&sort=desc&limit=1&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) return null;
    
    const quote = data.results[0];
    return {
      symbol: symbol,
      price: quote.c, // close price (latest)
      open_price: quote.o, // open price
      high_price: quote.h, // high price  
      low_price: quote.l, // low price
      volume: quote.v, // volume
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'polygon'
    };
  } catch (error) {
    console.error(`Polygon quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Twelve Data
 */
async function fetchFromTwelveData(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.close) return null;
    
    return {
      symbol: symbol,
      price: parseFloat(data.close),
      change_amount: data.change ? parseFloat(data.change) : undefined,
      change_percent: data.percent_change ? parseFloat(data.percent_change) : undefined,
      volume: data.volume ? parseInt(data.volume) : undefined,
      open_price: data.open ? parseFloat(data.open) : undefined,
      high_price: data.high ? parseFloat(data.high) : undefined,
      low_price: data.low ? parseFloat(data.low) : undefined,
      previous_close: data.previous_close ? parseFloat(data.previous_close) : undefined,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'twelve_data'
    };
  } catch (error) {
    console.error(`Twelve Data quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Tiingo
 */
async function fetchFromTiingo(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}/${symbol}?token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const quote = data[0];
    return {
      symbol: symbol,
      price: quote.last,
      change_amount: quote.last && quote.prevClose ? quote.last - quote.prevClose : undefined,
      volume: quote.volume,
      open_price: quote.open,
      high_price: quote.high,
      low_price: quote.low,
      previous_close: quote.prevClose,
      quote_timestamp: quote.timestamp ? new Date(quote.timestamp).toISOString() : getCurrentTimestamp(),
      data_provider: 'tiingo'
    };
  } catch (error) {
    console.error(`Tiingo quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Yahoo Finance
 */
async function fetchFromYahooFinance(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.yahoo_finance;
  
  try {
    const url = `${config.baseUrl}/${symbol}?interval=1d&range=1d`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.chart || !data.chart.result || !data.chart.result[0]) return null;
    
    const result = data.chart.result[0];
    const meta = result.meta;
    
    return {
      symbol: symbol,
      price: meta.regularMarketPrice,
      change_amount: meta.regularMarketPrice && meta.previousClose ? 
        meta.regularMarketPrice - meta.previousClose : undefined,
      change_percent: meta.regularMarketPrice && meta.previousClose ? 
        ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : undefined,
      volume: meta.regularMarketVolume,
      open_price: meta.regularMarketOpen,
      high_price: meta.regularMarketDayHigh,
      low_price: meta.regularMarketDayLow,
      previous_close: meta.previousClose,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'yahoo_finance'
    };
  } catch (error) {
    console.error(`Yahoo Finance quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from API Ninjas
 */
async function fetchFromAPINinjas(symbol: string): Promise<StockQuote | null> {
  const config = PROVIDERS.api_ninjas;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.quote}?ticker=${symbol}`;
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': config.apiKey
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || !data.price) return null;
    
    return {
      symbol: symbol,
      price: data.price,
      quote_timestamp: getCurrentTimestamp(),
      data_provider: 'api_ninjas'
    };
  } catch (error) {
    console.error(`API Ninjas quote fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Combine and deduplicate stock quote data from multiple providers
 */
function combineQuoteData(dataArray: (StockQuote | null)[]): StockQuote | null {
  const validData = dataArray.filter(quote => quote !== null) as StockQuote[];
  
  if (validData.length === 0) return null;
  
  // Provider priority for quote data (highest to lowest)
  const providerPriority = {
    'finnhub': 8,        // Best for real-time quotes
    'alpha_vantage': 7,  // Reliable with good volume data
    'fmp': 6,            // Good comprehensive data
    'twelve_data': 5,    // Decent real-time data
    'tiingo': 4,         // Good for IEX data
    'polygon': 3,        // Good but often delayed for free tier
    'yahoo_finance': 2,  // Free but less reliable
    'api_ninjas': 1      // Basic price only
  };
  
  // Sort by provider priority (highest first)
  validData.sort((a, b) => {
    const aPriority = providerPriority[a.data_provider as keyof typeof providerPriority] || 0;
    const bPriority = providerPriority[b.data_provider as keyof typeof providerPriority] || 0;
    return bPriority - aPriority;
  });
  
  // Start with the highest priority quote as base
  const baseQuote = validData[0];
  const combined: StockQuote = {
    symbol: baseQuote.symbol,
    quote_timestamp: getCurrentTimestamp(),
    data_provider: validData.map(q => q.data_provider).join(', ')
  };
  
  // Merge data from all providers, preferring higher priority sources
  for (const quote of validData) {
    // Use the most reliable price (prefer real-time providers)
    if (!combined.price && quote.price !== undefined) {
      combined.price = quote.price;
    }
    
    // Use change data from the same provider that gave us the price if possible
    if (!combined.change_amount && quote.change_amount !== undefined) {
      combined.change_amount = quote.change_amount;
    }
    
    if (!combined.change_percent && quote.change_percent !== undefined) {
      combined.change_percent = quote.change_percent;
    }
    
    // Volume data (prefer providers with comprehensive volume)
    if (!combined.volume && quote.volume !== undefined) {
      combined.volume = quote.volume;
    }
    
    // OHLC data for the day
    if (!combined.open_price && quote.open_price !== undefined) {
      combined.open_price = quote.open_price;
    }
    
    if (!combined.high_price && quote.high_price !== undefined) {
      combined.high_price = quote.high_price;
    }
    
    if (!combined.low_price && quote.low_price !== undefined) {
      combined.low_price = quote.low_price;
    }
    
    if (!combined.previous_close && quote.previous_close !== undefined) {
      combined.previous_close = quote.previous_close;
    }
    
    // Exchange ID from any source
    if (!combined.exchange_id && quote.exchange_id !== undefined) {
      combined.exchange_id = quote.exchange_id;
    }
  }
  
  // Calculate missing change data if we have price and previous_close
  if (combined.price && combined.previous_close && !combined.change_amount) {
    combined.change_amount = combined.price - combined.previous_close;
  }
  
  if (combined.price && combined.previous_close && !combined.change_percent) {
    combined.change_percent = ((combined.price - combined.previous_close) / combined.previous_close) * 100;
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
 * Save stock quote data to the database using SQL upsert function
 */
async function saveStockQuoteData(supabase: SupabaseClient, quoteData: StockQuote[]): Promise<boolean> {
  if (quoteData.length === 0) return true;
  
  try {
    // Get existing records with their timestamps and data providers to preserve the conflict key
    const { data: existingRecords, error: checkError } = await supabase
      .from('stock_quotes')
      .select('symbol, quote_timestamp, data_provider')
      .in('symbol', quoteData.map(q => q.symbol));
    
    if (checkError) {
      console.error(`Error checking existing records:`, checkError);
      return false;
    }
    
    if (!existingRecords || existingRecords.length === 0) {
      console.log('No existing records found to update');
      return false;
    }
    
    // Create a map of existing records by symbol for quick lookup
    const existingRecordsMap = new Map<string, {quote_timestamp: string, data_provider: string}>();
    existingRecords.forEach((record: {symbol: string, quote_timestamp: string, data_provider: string}) => {
      // Use the most recent record for each symbol
      if (!existingRecordsMap.has(record.symbol)) {
        existingRecordsMap.set(record.symbol, {
          quote_timestamp: record.quote_timestamp,
          data_provider: record.data_provider
        });
      }
    });
    
    // Filter quote data to only include symbols that already exist
    const filteredQuoteData = quoteData.filter(quote => existingRecordsMap.has(quote.symbol));
    
    if (filteredQuoteData.length === 0) {
      console.log('No valid symbols to update after filtering');
      return false;
    }
    
    // Use SQL upsert function for each quote with existing timestamp and provider
    let successfulUpdates = 0;
    for (const quote of filteredQuoteData) {
      try {
        const existingRecord = existingRecordsMap.get(quote.symbol)!;
        
        const { data, error } = await supabase.rpc('upsert_stock_quote', {
          p_symbol: quote.symbol,
          p_quote_timestamp: existingRecord.quote_timestamp, // Use existing timestamp
          p_data_provider: existingRecord.data_provider, // Use existing provider
          p_exchange_code: null,
          p_exchange_name: null,
          p_exchange_country: null,
          p_exchange_timezone: null,
          p_price: quote.price,
          p_change_amount: quote.change_amount,
          p_change_percent: quote.change_percent,
          p_volume: quote.volume,
          p_open_price: quote.open_price,
          p_high_price: quote.high_price,
          p_low_price: quote.low_price,
          p_previous_close: quote.previous_close
        });
        
        if (error) {
          console.error(`Error upserting quote data for ${quote.symbol}:`, error);
        } else {
          successfulUpdates++;
          console.log(`Successfully updated ${quote.symbol} with ID: ${data}`);
        }
      } catch (upsertError) {
        console.error(`Error upserting symbol ${quote.symbol}:`, upsertError);
      }
    }
    
    if (successfulUpdates === 0) {
      console.log('No records were successfully updated');
      return false;
    }
    
    console.log(`Successfully updated ${successfulUpdates} out of ${filteredQuoteData.length} quote records`);
    return true;
  } catch (error) {
    console.error(`Error in saveStockQuoteData:`, error);
    return false;
  }
}

/**
 * Validate quote data for basic sanity checks
 */
function validateQuoteData(quote: StockQuote): boolean {
  // Basic validation checks
  if (!quote.symbol || !quote.quote_timestamp) return false;
  
  // Check if timestamp is valid
  const timestamp = new Date(quote.quote_timestamp);
  if (isNaN(timestamp.getTime())) return false;
  
  // Check if prices are reasonable (not negative)
  if (quote.price !== undefined && quote.price < 0) return false;
  if (quote.open_price !== undefined && quote.open_price < 0) return false;
  if (quote.high_price !== undefined && quote.high_price < 0) return false;
  if (quote.low_price !== undefined && quote.low_price < 0) return false;
  if (quote.previous_close !== undefined && quote.previous_close < 0) return false;
  if (quote.volume !== undefined && quote.volume < 0) return false;
  
  // Check if high >= low (if both exist)
  if (quote.high_price !== undefined && quote.low_price !== undefined && quote.high_price < quote.low_price) return false;
  
  // Check if OHLC prices are within reasonable range of each other
  const prices = [quote.open_price, quote.high_price, quote.low_price, quote.price, quote.previous_close]
    .filter(p => p !== undefined);
  if (prices.length > 1) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (maxPrice / minPrice > 5) return false; // Reject if price range is more than 5x
  }
  
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
    
    console.log('Starting stock quotes multi-provider fetch...');
    
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
            console.log(`Fetching quote data for ${symbol}...`);
            
            // Fetch data from all available providers for this symbol
            const providerPromises = [
              fetchFromFinnhub(symbol),
              fetchFromAlphaVantage(symbol),
              fetchFromFMP(symbol),
              fetchFromTwelveData(symbol),
              fetchFromTiingo(symbol),
              fetchFromPolygon(symbol),
              fetchFromYahooFinance(symbol),
              fetchFromAPINinjas(symbol),
            ];
            
            const providerResults = await Promise.allSettled(providerPromises);
            
            // Filter successful results
            const validResults = providerResults
              .map(result => result.status === 'fulfilled' ? result.value : null)
              .filter(result => result !== null);
            
            if (validResults.length > 0) {
              const combinedQuote = combineQuoteData(validResults);
              
              if (combinedQuote && validateQuoteData(combinedQuote)) {
                const saved = await saveStockQuoteData(supabaseClient, [combinedQuote]);
                
                if (saved) {
                  successCount++;
                  
                  results.push({
                    symbol,
                    status: 'success',
                    price: combinedQuote.price,
                    change: combinedQuote.change_amount,
                    change_percent: combinedQuote.change_percent,
                    providers_used: validResults.length,
                    data_sources: combinedQuote.data_provider
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
                  message: 'No valid quote data after validation'
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
      message: 'Stock quotes multi-provider fetch completed',
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
        message: 'Internal server error in stock quotes fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
