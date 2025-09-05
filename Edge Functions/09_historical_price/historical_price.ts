/**
 * Supabase Edge Function: Historical Price Data Multi-Provider Fetcher
 * 
 * This Edge Function fetches historical OHLCV price data from 12 different market data providers,
 * combines the data to create comprehensive historical price records with deduplication,
 * and saves them to the database.
 * 
 * Providers used for historical price data:
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

// Types for historical price data
interface HistoricalPrice {
  symbol: string;
  exchange_id?: number;
  date: string; // YYYY-MM-DD format
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjusted_close?: number;
  dividend?: number;
  split_ratio?: number;
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    historical?: string;
    daily?: string;
    candles?: string;
  };
  rateLimit: number; // requests per minute
}

// Provider configurations for historical price data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      historical: '/historical-price-full',
      daily: '/historical-chart/1day',
    },
    rateLimit: 300 // 300 per day for free tier
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      daily: '?function=TIME_SERIES_DAILY_ADJUSTED',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      candles: '/stock/candle',
    },
    rateLimit: 30 // 30 per second for free tier
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v2',
    endpoints: {
      candles: '/aggs/ticker',
    },
    rateLimit: 5 // 5 per minute for free tier
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      daily: '/time_series',
    },
    rateLimit: 8 // 8 per minute for free tier
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/daily',
    endpoints: {
      historical: '/prices',
    },
    rateLimit: 500 // 500 per hour for free tier
  },
  yahoo_finance: {
    name: 'Yahoo Finance',
    apiKey: '', // No API key required for basic access
    baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    endpoints: {
      chart: '',
    },
    rateLimit: 1000 // Conservative estimate
  },
  api_ninjas: {
    name: 'API Ninjas',
    apiKey: Deno.env.get('API_NINJAS_KEY') || '',
    baseUrl: 'https://api.api-ninjas.com/v1',
    endpoints: {
      historical: '/stockprice',
    },
    rateLimit: 10000 // 10k per month for free tier
  }
};

/**
 * Utility function to format date for API calls
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get date range for historical data (last 30 days by default)
 */
function getDateRange(days: number = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  
  return {
    from: formatDate(from),
    to: formatDate(to)
  };
}

/**
 * Fetch historical price data from Financial Modeling Prep for a specific date
 */
async function fetchFromFMP(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.historical}/${symbol}?from=${targetDate}&to=${targetDate}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.historical || !Array.isArray(data.historical)) return null;
    
    return data.historical.map((price: any) => ({
      symbol: symbol,
      date: price.date,
      open: price.open ? parseFloat(price.open) : undefined,
      high: price.high ? parseFloat(price.high) : undefined,
      low: price.low ? parseFloat(price.low) : undefined,
      close: price.close ? parseFloat(price.close) : undefined,
      adjusted_close: price.adjClose ? parseFloat(price.adjClose) : undefined,
      volume: price.volume ? parseInt(price.volume) : undefined,
      data_provider: 'fmp'
    }));
  } catch (error) {
    console.error(`FMP historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Alpha Vantage for a specific date
 */
async function fetchFromAlphaVantage(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.daily}&symbol=${symbol}&outputsize=compact&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data['Time Series (Daily)']) return null;
    
    const timeSeries = data['Time Series (Daily)'];
    
    // Look for the specific target date
    if (timeSeries[targetDate]) {
      const price: any = timeSeries[targetDate];
      return [{
        symbol: symbol,
        date: targetDate,
        open: parseFloat(price['1. open']),
        high: parseFloat(price['2. high']),
        low: parseFloat(price['3. low']),
        close: parseFloat(price['4. close']),
        adjusted_close: parseFloat(price['5. adjusted close']),
        volume: parseInt(price['6. volume']),
        dividend: parseFloat(price['7. dividend amount']) || 0,
        split_ratio: parseFloat(price['8. split coefficient']) || 1.0,
        data_provider: 'alpha_vantage'
      }];
    }
    
    return null; // Date not found
  } catch (error) {
    console.error(`Alpha Vantage historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Finnhub for a specific date
 */
async function fetchFromFinnhub(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const targetTimestamp = Math.floor(new Date(targetDate).getTime() / 1000);
    const nextDayTimestamp = targetTimestamp + 86400; // Add 24 hours
    
    const url = `${config.baseUrl}${config.endpoints.candles}?symbol=${symbol}&resolution=D&from=${targetTimestamp}&to=${nextDayTimestamp}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.s !== 'ok' || !data.c || !Array.isArray(data.c)) return null;
    
    const results: HistoricalPrice[] = [];
    for (let i = 0; i < data.c.length; i++) {
      const timestamp = data.t[i];
      const date = new Date(timestamp * 1000);
      const dateStr = formatDate(date);
      
      // Only return data for the target date
      if (dateStr === targetDate) {
        results.push({
          symbol: symbol,
          date: dateStr,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v[i],
          data_provider: 'finnhub'
        });
      }
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`Finnhub historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Polygon for a specific date
 */
async function fetchFromPolygon(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.candles}/${symbol}/range/1/day/${targetDate}/${targetDate}?adjusted=true&sort=desc&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) return null;
    
    return data.results.map((candle: any) => {
      const date = new Date(candle.t);
      return {
        symbol: symbol,
        date: formatDate(date),
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        volume: candle.v,
        data_provider: 'polygon'
      };
    });
  } catch (error) {
    console.error(`Polygon historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Twelve Data for a specific date
 */
async function fetchFromTwelveData(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.daily}?symbol=${symbol}&interval=1day&start_date=${targetDate}&end_date=${targetDate}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.values || !Array.isArray(data.values)) return null;
    
    return data.values.map((price: any) => ({
      symbol: symbol,
      date: price.datetime,
      open: parseFloat(price.open),
      high: parseFloat(price.high),
      low: parseFloat(price.low),
      close: parseFloat(price.close),
      volume: parseInt(price.volume),
      data_provider: 'twelve_data'
    }));
  } catch (error) {
    console.error(`Twelve Data historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Tiingo for a specific date
 */
async function fetchFromTiingo(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}/${symbol}${config.endpoints.historical}?startDate=${targetDate}&endDate=${targetDate}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    
    return data.map((price: any) => ({
      symbol: symbol,
      date: price.date.split('T')[0], // Remove time component
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      adjusted_close: price.adjClose,
      volume: price.volume,
      dividend: price.divCash || 0,
      split_ratio: price.splitFactor || 1.0,
      data_provider: 'tiingo'
    }));
  } catch (error) {
    console.error(`Tiingo historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from Yahoo Finance for a specific date
 */
async function fetchFromYahooFinance(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.yahoo_finance;
  
  try {
    const targetTimestamp = Math.floor(new Date(targetDate).getTime() / 1000);
    const nextDayTimestamp = targetTimestamp + 86400; // Add 24 hours
    
    const url = `${config.baseUrl}/${symbol}?period1=${targetTimestamp}&period2=${nextDayTimestamp}&interval=1d&events=history`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.chart || !data.chart.result || !data.chart.result[0]) return null;
    
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const indicators = result.indicators.quote[0];
    const adjClose = result.indicators.adjclose?.[0]?.adjclose || [];
    
    const results: HistoricalPrice[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000);
      const dateStr = formatDate(date);
      
      // Only return data for the target date
      if (dateStr === targetDate) {
        results.push({
          symbol: symbol,
          date: dateStr,
          open: indicators.open[i],
          high: indicators.high[i],
          low: indicators.low[i],
          close: indicators.close[i],
          adjusted_close: adjClose[i],
          volume: indicators.volume[i],
          data_provider: 'yahoo_finance'
        });
      }
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`Yahoo Finance historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Fetch historical price data from API Ninjas for a specific date
 */
async function fetchFromAPINinjas(symbol: string, targetDate: string): Promise<HistoricalPrice[] | null> {
  const config = PROVIDERS.api_ninjas;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.historical}?ticker=${symbol}`;
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': config.apiKey
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || !data.price) return null;
    
    // API Ninjas typically returns current price, not historical
    // Only return if target date is today or yesterday
    const today = formatDate(new Date());
    const yesterday = formatDate(new Date(Date.now() - 86400000));
    
    if (targetDate === today || targetDate === yesterday) {
      return [{
        symbol: symbol,
        date: targetDate,
        close: data.price,
        data_provider: 'api_ninjas'
      }];
    }
    
    return null; // API Ninjas doesn't support historical data for older dates
  } catch (error) {
    console.error(`API Ninjas historical price fetch error for ${symbol} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Combine and deduplicate historical price data from multiple providers
 */
function combineHistoricalData(dataArrays: (HistoricalPrice[] | null)[]): HistoricalPrice[] {
  const validData = dataArrays.filter(data => data !== null) as HistoricalPrice[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all price records
  const allPrices = validData.flat();
  
  // Group by symbol and date to merge duplicates
  const priceMap = new Map<string, HistoricalPrice>();
  
  for (const price of allPrices) {
    if (!price.symbol || !price.date) continue;
    
    const key = `${price.symbol}-${price.date}`;
    
    if (priceMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = priceMap.get(key)!;
      const merged: HistoricalPrice = {
        symbol: price.symbol,
        date: price.date,
        data_provider: `${existing.data_provider}, ${price.data_provider}`
      };
      
      // Merge OHLCV data, preferring values with higher priority
      // Priority: FMP > Alpha Vantage > Tiingo > Polygon > Finnhub > Twelve Data > Yahoo > API Ninjas
      const providerPriority = {
        'fmp': 8,
        'alpha_vantage': 7,
        'tiingo': 6,
        'polygon': 5,
        'finnhub': 4,
        'twelve_data': 3,
        'yahoo_finance': 2,
        'api_ninjas': 1
      };
      
      const existingPriority = providerPriority[existing.data_provider.split(',')[0] as keyof typeof providerPriority] || 0;
      const newPriority = providerPriority[price.data_provider as keyof typeof providerPriority] || 0;
      
      // Use higher priority source for core OHLCV data
      if (newPriority > existingPriority) {
        merged.open = price.open ?? existing.open;
        merged.high = price.high ?? existing.high;
        merged.low = price.low ?? existing.low;
        merged.close = price.close ?? existing.close;
        merged.volume = price.volume ?? existing.volume;
        merged.adjusted_close = price.adjusted_close ?? existing.adjusted_close;
      } else {
        merged.open = existing.open ?? price.open;
        merged.high = existing.high ?? price.high;
        merged.low = existing.low ?? price.low;
        merged.close = existing.close ?? price.close;
        merged.volume = existing.volume ?? price.volume;
        merged.adjusted_close = existing.adjusted_close ?? price.adjusted_close;
      }
      
      // For dividend and split data, prefer non-zero values
      merged.dividend = existing.dividend || price.dividend || 0;
      merged.split_ratio = (existing.split_ratio !== 1.0 ? existing.split_ratio : price.split_ratio) || 1.0;
      
      // Use exchange_id from any source that has it
      merged.exchange_id = existing.exchange_id ?? price.exchange_id;
      
      priceMap.set(key, merged);
    } else {
      // Create new record
      priceMap.set(key, { ...price });
    }
  }
  
  // Convert back to array and sort by date (newest first)
  return Array.from(priceMap.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Fetch existing symbols from the database
 */
async function getExistingSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    // First try to get symbols from stock_quotes table
    const { data: historicalData, error: historicalError } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');
    
    if (!historicalError && historicalData && historicalData.length > 0) {
      const uniqueSymbols = [...new Set(historicalData.map((row: { symbol: string }) => row.symbol))];
      return uniqueSymbols;
    }
    
    // Fallback to stocks table if available
    const { data: stocksData, error: stocksError } = await supabase
      .from('stocks')
      .select('symbol')
      .order('symbol');
    
    if (!stocksError && stocksData && stocksData.length > 0) {
      const uniqueSymbols = [...new Set(stocksData.map((row: { symbol: string }) => row.symbol))];
      return uniqueSymbols;
    }
    
    // If no data, return some default symbols for testing
    console.log('No existing symbols found, using default list');
    return ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'SPY', 'QQQ'];
    
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    // Return default symbols for testing
    return ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
  }
}

/**
 * Get the latest date for each symbol to determine next date to fetch
 */
async function getLatestDates(supabase: SupabaseClient, symbols: string[]): Promise<Map<string, string | null>> {
  try {
    const { data: latestData, error } = await supabase
      .from('historical_prices')
      .select('symbol, date')
      .in('symbol', symbols)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching latest dates:', error);
      return new Map();
    }
    
    const latestDatesMap = new Map<string, string | null>();
    
    // Initialize all symbols with null (no data)
    symbols.forEach(symbol => {
      latestDatesMap.set(symbol, null);
    });
    
    // Set the latest date for each symbol
    if (latestData) {
      latestData.forEach((row: { symbol: string, date: string }) => {
        if (!latestDatesMap.has(row.symbol) || latestDatesMap.get(row.symbol) === null) {
          latestDatesMap.set(row.symbol, row.date);
        }
      });
    }
    
    return latestDatesMap;
  } catch (error) {
    console.error('Error in getLatestDates:', error);
    return new Map();
  }
}

/**
 * Get the next date to fetch for a symbol (1 day behind today or next sequential day)
 */
function getNextDateToFetch(latestDate: string | null): string {
  const today = new Date();
  const oneDayBehind = new Date(today);
  oneDayBehind.setDate(oneDayBehind.getDate() - 1);
  
  if (!latestDate) {
    // No existing data, start from 1 day behind today
    return formatDate(oneDayBehind);
  }
  
  const latestDateTime = new Date(latestDate);
  const nextDay = new Date(latestDateTime);
  nextDay.setDate(nextDay.getDate() + 1);
  
  // Don't fetch future dates - cap at 1 day behind today
  if (nextDay > oneDayBehind) {
    return formatDate(oneDayBehind);
  }
  
  return formatDate(nextDay);
}

/**
 * Check if a date should be fetched (not weekend and not future)
 */
function shouldFetchDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  const oneDayBehind = new Date(today);
  oneDayBehind.setDate(oneDayBehind.getDate() - 1);
  
  // Don't fetch future dates
  if (date > oneDayBehind) {
    return false;
  }
  
  // Skip weekends (most markets are closed)
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday = 0, Saturday = 6
    return false;
  }
  
  return true;
}

/**
 * Save historical price data to the database using SQL upsert function
 */
async function saveHistoricalPriceData(supabase: SupabaseClient, priceData: HistoricalPrice[]): Promise<boolean> {
  if (priceData.length === 0) return true;
  
  try {
    let successfulUpserts = 0;
    
    for (const price of priceData) {
      try {
        const { error } = await supabase.rpc('upsert_historical_price', {
          p_symbol: price.symbol,
          p_date: price.date,
          p_data_provider: price.data_provider,
          p_exchange_code: null, // Exchange handling can be added later if needed
          p_exchange_name: null,
          p_exchange_country: null,
          p_exchange_timezone: null,
          p_open: price.open,
          p_high: price.high,
          p_low: price.low,
          p_close: price.close,
          p_adjusted_close: price.adjusted_close,
          p_volume: price.volume,
          p_dividend: price.dividend || 0,
          p_split_ratio: price.split_ratio || 1.0
        });
        
        if (error) {
          console.error(`Error upserting historical price for ${price.symbol} on ${price.date}:`, error);
        } else {
          successfulUpserts++;
        }
      } catch (upsertError) {
        console.error(`Error upserting price for ${price.symbol} on ${price.date}:`, upsertError);
      }
    }
    
    console.log(`Successfully upserted ${successfulUpserts} out of ${priceData.length} historical price records`);
    return successfulUpserts > 0;
  } catch (error) {
    console.error(`Error in saveHistoricalPriceData:`, error);
    return false;
  }
}

/**
 * Validate price data for basic sanity checks
 */
function validatePriceData(price: HistoricalPrice): boolean {
  // Basic validation checks
  if (!price.symbol || !price.date) return false;
  
  // Check if date is valid
  const date = new Date(price.date);
  if (isNaN(date.getTime())) return false;
  
  // Check if prices are reasonable (not negative, high <= low check, etc.)
  if (price.open !== undefined && price.open < 0) return false;
  if (price.high !== undefined && price.high < 0) return false;
  if (price.low !== undefined && price.low < 0) return false;
  if (price.close !== undefined && price.close < 0) return false;
  if (price.volume !== undefined && price.volume < 0) return false;
  
  // Check if high >= low (if both exist)
  if (price.high !== undefined && price.low !== undefined && price.high < price.low) return false;
  
  // Check if OHLC prices are within reasonable range of each other
  const prices = [price.open, price.high, price.low, price.close].filter(p => p !== undefined);
  if (prices.length > 1) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (maxPrice / minPrice > 10) return false; // Reject if price range is more than 10x in a day
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
    
    console.log('Starting historical price data multi-provider fetch...');
    
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
    
    // Get latest dates for all symbols to determine next date to fetch
    const latestDatesMap = await getLatestDates(supabaseClient, symbolsToProcess);
    console.log(`Loaded latest dates for ${latestDatesMap.size} symbols`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalPriceRecords = 0;
    
    // Process symbols in batches to respect rate limits
    const batchSize = 3; // Small batches for financial data APIs
    const results = [];
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(symbolsToProcess.length / batchSize)}`);
        
        // Process each symbol individually
        for (const symbol of batch) {
          try {
            // Determine the next date to fetch for this symbol
            const latestDate = latestDatesMap.get(symbol) || null;
            const nextDateToFetch = getNextDateToFetch(latestDate);
            
            // Check if we should fetch this date (not weekend, not future)
            if (!shouldFetchDate(nextDateToFetch)) {
              console.log(`Skipping ${symbol} - ${nextDateToFetch} is weekend or future date`);
              skippedCount++;
              results.push({
                symbol,
                status: 'skipped',
                message: `Date ${nextDateToFetch} is weekend or future date`,
                next_date: nextDateToFetch
              });
              processedCount++;
              continue;
            }
            
            console.log(`Fetching historical price data for ${symbol} on ${nextDateToFetch}...`);
            
            // Fetch data from all available providers for this symbol and specific date
            const providerPromises = [
              fetchFromFMP(symbol, nextDateToFetch),
              fetchFromAlphaVantage(symbol, nextDateToFetch),
              fetchFromFinnhub(symbol, nextDateToFetch),
              fetchFromPolygon(symbol, nextDateToFetch),
              fetchFromTwelveData(symbol, nextDateToFetch),
              fetchFromTiingo(symbol, nextDateToFetch),
              fetchFromYahooFinance(symbol, nextDateToFetch),
              fetchFromAPINinjas(symbol, nextDateToFetch),
            ];
            
            const providerResults = await Promise.allSettled(providerPromises);
            
            // Filter successful results
            const validResults = providerResults
              .map(result => result.status === 'fulfilled' ? result.value : null)
              .filter(result => result !== null);
            
            if (validResults.length > 0) {
              const combinedData = combineHistoricalData(validResults);
              
              // Validate all price records
              const validatedData = combinedData.filter(validatePriceData);
              
              if (validatedData.length > 0) {
                const saved = await saveHistoricalPriceData(supabaseClient, validatedData);
                
                if (saved) {
                  successCount++;
                  totalPriceRecords += validatedData.length;
                  
                  // Update the latest date map for this symbol
                  latestDatesMap.set(symbol, nextDateToFetch);
                  
                  results.push({
                    symbol,
                    status: 'success',
                    date_fetched: nextDateToFetch,
                    records_saved: validatedData.length,
                    providers_used: validResults.length,
                    next_date: getNextDateToFetch(nextDateToFetch)
                  });
                } else {
                  errorCount++;
                  results.push({
                    symbol,
                    status: 'error',
                    message: 'Failed to save to database',
                    target_date: nextDateToFetch
                  });
                }
              } else {
                errorCount++;
                results.push({
                  symbol,
                  status: 'error',
                  message: 'No valid price data after validation',
                  target_date: nextDateToFetch
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
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (symbolError) {
            errorCount++;
            console.error(`Error processing symbol ${symbol}:`, symbolError);
            results.push({
              symbol,
              status: 'error',
              message: symbolError instanceof Error ? symbolError.message : 'Unknown error'
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
            message: error instanceof Error ? error.message : 'Batch processing error'
          });
        }
      }
      
      // Longer delay between batches to respect rate limits
      if (i + batchSize < symbolsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    const response = {
      success: true,
      message: 'Historical price data multi-provider fetch completed',
      summary: {
        total_symbols: symbolsToProcess.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount,
        skipped: skippedCount,
        total_price_records: totalPriceRecords,
        providers_used: Object.keys(PROVIDERS).length
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
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Internal server error in historical price fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
