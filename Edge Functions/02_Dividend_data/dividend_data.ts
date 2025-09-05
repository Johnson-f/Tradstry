/**
 * Supabase Edge Function: Dividend Data Multi-Provider Fetcher
 * 
 * This Edge Function fetches dividend data from 12 different market data providers,
 * combines the data to create comprehensive dividend profiles, and saves them to the database.
 * 
 * Providers used:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 * 7. Yahoo Finance
 * 8. API Ninjas
 * 9. Fiscal AI
 * 10. FRED (Federal Reserve Economic Data)
 * 11. Currents API
 * 12. NewsAPI
 */

// TODO: Create a trigger logic, that fetches comapny_info dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for dividend information
interface DividendData {
  symbol: string;
  exchange_id?: number;
  declaration_date?: string;
  ex_dividend_date: string;
  record_date?: string;
  payment_date?: string;
  dividend_amount: number;
  dividend_type?: string;
  currency?: string;
  frequency?: string;
  dividend_status?: string;
  dividend_yield?: number;
  payout_ratio?: number;
  consecutive_years?: number;
  qualified_dividend?: boolean;
  tax_rate?: number;
  fiscal_year?: number;
  fiscal_quarter?: number;
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    dividendHistory?: string;
    dividendCalendar?: string;
    dividends?: string;
  };
}

// Provider configurations for dividend data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      dividendHistory: '/historical-price-full/stock_dividend',
    }
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      dividends: '?function=DIVIDENDS',
    }
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      dividends: '/stock/dividend',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v3',
    endpoints: {
      dividends: '/reference/dividends',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      dividends: '/dividends',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/fundamentals',
    endpoints: {
      dividends: '/dividends',
    }
  }
};

/**
 * Fetch dividend data from Financial Modeling Prep with date range
 */
async function fetchFromFMP(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.dividendHistory}/${symbol}?from=${dateRange.from}&to=${dateRange.to}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.historical || !Array.isArray(data.historical)) return null;
    
    // Filter to only include dividends within our date range
    const filteredDividends = data.historical.filter((dividend: { date: string }) => {
      const divDate = new Date(dividend.date);
      const fromDate = new Date(dateRange.from);
      const toDate = new Date(dateRange.to);
      return divDate >= fromDate && divDate <= toDate;
    });
    
    return filteredDividends.map((dividend: any) => ({
      symbol: symbol,
      declaration_date: dividend.declarationDate,
      ex_dividend_date: dividend.date,
      record_date: dividend.recordDate,
      payment_date: dividend.paymentDate,
      dividend_amount: parseFloat(dividend.dividend) || 0,
      dividend_type: 'regular',
      currency: 'USD',
      data_provider: 'fmp'
    }));
  } catch (error) {
    console.error(`FMP dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch dividend data from Alpha Vantage with date range
 */
async function fetchFromAlphaVantage(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.dividends}&symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data['Time Series (Daily)']) return null;
    
    const dividends = [];
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    for (const [date, dividend] of Object.entries(data['Time Series (Daily)']) as [string, any][]) {
      if (dividend['7. dividend amount']) {
        const divDate = new Date(date);
        // Only include dividends within our date range
        if (divDate >= fromDate && divDate <= toDate) {
          dividends.push({
            symbol: symbol,
            ex_dividend_date: date,
            dividend_amount: parseFloat(dividend['7. dividend amount']) || 0,
            dividend_type: 'regular',
            currency: 'USD',
            data_provider: 'alpha_vantage'
          });
        }
      }
    }
    
    return dividends.length > 0 ? dividends : null;
  } catch (error) {
    console.error(`Alpha Vantage dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch dividend data from Finnhub with date range
 */
async function fetchFromFinnhub(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.dividends}?symbol=${symbol}&from=${dateRange.from}&to=${dateRange.to}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    // Filter to only include dividends within our date range
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const filteredData = data.filter((dividend: any) => {
      const divDate = new Date(dividend.exDate || dividend.date);
      return divDate >= fromDate && divDate <= toDate;
    });
    
    return filteredData.map((dividend: any) => ({
      symbol: symbol,
      ex_dividend_date: dividend.exDate || dividend.date,
      payment_date: dividend.payDate,
      dividend_amount: parseFloat(dividend.amount) || 0,
      currency: dividend.currency || 'USD',
      qualified_dividend: dividend.qualified || true,
      data_provider: 'finnhub'
    }));
  } catch (error) {
    console.error(`Finnhub dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch dividend data from Polygon with date range
 */
async function fetchFromPolygon(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.dividends}?ticker=${symbol}&ex_dividend_date.gte=${dateRange.from}&ex_dividend_date.lte=${dateRange.to}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) return null;
    
    return data.results.map((dividend: any) => ({
      symbol: symbol,
      declaration_date: dividend.declaration_date,
      ex_dividend_date: dividend.ex_dividend_date,
      record_date: dividend.record_date,
      payment_date: dividend.pay_date,
      dividend_amount: parseFloat(dividend.cash_amount) || 0,
      dividend_type: dividend.dividend_type || 'regular',
      frequency: dividend.frequency,
      data_provider: 'polygon'
    }));
  } catch (error) {
    console.error(`Polygon dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch dividend data from Twelve Data with date range
 */
async function fetchFromTwelveData(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.dividends}?symbol=${symbol}&start_date=${dateRange.from}&end_date=${dateRange.to}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === 'error' || !data.dividends || !Array.isArray(data.dividends)) return null;
    
    return data.dividends.map((dividend: any) => ({
      symbol: symbol,
      ex_dividend_date: dividend.ex_date,
      dividend_amount: parseFloat(dividend.amount) || 0,
      dividend_type: dividend.type || 'regular',
      currency: dividend.currency || 'USD',
      data_provider: 'twelve_data'
    }));
  } catch (error) {
    console.error(`Twelve Data dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch dividend data from Tiingo with date range
 */
async function fetchFromTiingo(symbol: string, dateRange: { from: string; to: string }): Promise<Partial<DividendData>[] | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}/${symbol}${config.endpoints.dividends}?startDate=${dateRange.from}&endDate=${dateRange.to}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    // Filter to only include dividends within our date range
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const filteredData = data.filter((dividend: any) => {
      const divDate = new Date(dividend.exDate);
      return divDate >= fromDate && divDate <= toDate;
    });
    
    return filteredData.map((dividend: any) => ({
      symbol: symbol,
      declaration_date: dividend.declareDate,
      ex_dividend_date: dividend.exDate,
      payment_date: dividend.payDate,
      dividend_amount: parseFloat(dividend.divCash) || 0,
      currency: 'USD',
      data_provider: 'tiingo'
    }));
  } catch (error) {
    console.error(`Tiingo dividend fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Combine dividend data from multiple providers
 */
function combineDividendData(dataArrays: (Partial<DividendData>[] | null)[]): DividendData[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<DividendData>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all dividend records
  const allDividends = validData.flat();
  
  // Group by symbol and ex_dividend_date to merge duplicates
  const dividendMap = new Map<string, DividendData>();
  
  for (const dividend of allDividends) {
    if (!dividend.symbol || !dividend.ex_dividend_date || !dividend.dividend_amount) continue;
    
    const key = `${dividend.symbol}-${dividend.ex_dividend_date}`;
    
    if (dividendMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = dividendMap.get(key)!;
      const merged: DividendData = {
        symbol: dividend.symbol,
        ex_dividend_date: dividend.ex_dividend_date,
        dividend_amount: dividend.dividend_amount,
        data_provider: `${existing.data_provider}, ${dividend.data_provider}`
      };
      
      // Merge other fields, preferring non-null/non-empty values
      for (const [key, value] of Object.entries(dividend)) {
        if (value !== null && value !== undefined && value !== '') {
          if (key !== 'data_provider' && !merged[key as keyof DividendData]) {
            (merged as DividendData & Record<string, unknown>)[key] = value;
          }
        }
      }
      
      dividendMap.set(key, merged);
    } else {
      // Create new record
      dividendMap.set(key, {
        symbol: dividend.symbol,
        ex_dividend_date: dividend.ex_dividend_date,
        dividend_amount: dividend.dividend_amount,
        declaration_date: dividend.declaration_date,
        record_date: dividend.record_date,
        payment_date: dividend.payment_date,
        dividend_type: dividend.dividend_type || 'regular',
        currency: dividend.currency || 'USD',
        frequency: dividend.frequency,
        dividend_status: dividend.dividend_status || 'active',
        dividend_yield: dividend.dividend_yield,
        payout_ratio: dividend.payout_ratio,
        consecutive_years: dividend.consecutive_years,
        qualified_dividend: dividend.qualified_dividend ?? true,
        tax_rate: dividend.tax_rate,
        fiscal_year: dividend.fiscal_year,
        fiscal_quarter: dividend.fiscal_quarter,
        data_provider: dividend.data_provider || 'unknown'
      });
    }
  }
  
  return Array.from(dividendMap.values());
}

/**
 * Fetch existing symbols from the database
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
    
    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    return [];
  }
}

/**
 * Get the latest dividend date for each symbol to determine the data collection range
 */
async function getLatestDividendDates(supabase: SupabaseClient, symbols: string[]): Promise<Map<string, string | null>> {
  try {
    const { data: latestData, error } = await supabase
      .from('dividend_data')
      .select('symbol, ex_dividend_date')
      .in('symbol', symbols)
      .order('ex_dividend_date', { ascending: false });
    
    if (error) {
      console.error('Error fetching latest dividend dates:', error);
      return new Map();
    }
    
    const latestDatesMap = new Map<string, string | null>();
    
    // Initialize all symbols with null (no data)
    symbols.forEach(symbol => {
      latestDatesMap.set(symbol, null);
    });
    
    // Set the latest date for each symbol
    if (latestData) {
      latestData.forEach((row: { symbol: string, ex_dividend_date: string }) => {
        if (!latestDatesMap.has(row.symbol) || latestDatesMap.get(row.symbol) === null) {
          latestDatesMap.set(row.symbol, row.ex_dividend_date);
        }
      });
    }
    
    return latestDatesMap;
  } catch (error) {
    console.error('Error in getLatestDividendDates:', error);
    return new Map();
  }
}

/**
 * Get date range for dividend fetching (from latest existing date or 5 years back)
 */
function getDividendDateRange(latestDate: string | null): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  
  if (!latestDate) {
    // No existing data, fetch 5 years of historical data
    const fiveYearsAgo = new Date(today);
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    return {
      from: fiveYearsAgo.toISOString().split('T')[0],
      to: to
    };
  }
  
  // Existing data found, fetch from the day after the latest date
  const fromDate = new Date(latestDate);
  fromDate.setDate(fromDate.getDate() + 1);
  
  return {
    from: fromDate.toISOString().split('T')[0],
    to: to
  };
}

/**
 * Check if we should fetch dividend data for a symbol (has new date range)
 */
function shouldFetchDividendData(latestDate: string | null): boolean {
  if (!latestDate) return true; // No existing data, should fetch
  
  const today = new Date();
  const latestDateTime = new Date(latestDate);
  const daysDiff = Math.floor((today.getTime() - latestDateTime.getTime()) / (1000 * 60 * 60 * 24));
  
  // Fetch if latest data is more than 1 day old
  return daysDiff > 1;
}

/**
 * Save dividend data to the database
 */
async function saveDividendData(supabase: SupabaseClient, dividendData: DividendData[]): Promise<boolean> {
  if (dividendData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('dividend_data')
      .upsert(dividendData, {
        onConflict: 'symbol,ex_dividend_date,data_provider'
      });
    
    if (error) {
      console.error(`Error saving dividend data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveDividendData:`, error);
    return false;
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    console.log('Starting dividend data multi-provider fetch...');
    
    // Get existing symbols from the database
    const existingSymbols = await getExistingSymbols(supabaseClient);
    
    if (existingSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No existing symbols found in database',
          processed: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    console.log(`Found ${existingSymbols.length} existing symbols to process`);
    
    // Get latest dividend dates for all symbols
    const latestDividendDates = await getLatestDividendDates(supabaseClient, existingSymbols);
    console.log(`Loaded latest dividend dates for ${latestDividendDates.size} symbols`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalDividends = 0;
    
    // Process symbols in batches to avoid overwhelming the providers
    const batchSize = 5; // Smaller batch for dividend data due to larger response sizes
    const results = [];
    
    for (let i = 0; i < existingSymbols.length; i += batchSize) {
      const batch = existingSymbols.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          // Check if we should fetch dividend data for this symbol
          const latestDate = latestDividendDates.get(symbol);
          
          if (!shouldFetchDividendData(latestDate)) {
            console.log(`Skipping ${symbol} - dividend data is up to date (latest: ${latestDate})`);
            skippedCount++;
            results.push({
              symbol,
              status: 'skipped',
              message: 'Dividend data is up to date',
              latest_date: latestDate
            });
            processedCount++;
            continue;
          }
          
          // Get date range for this symbol
          const dateRange = getDividendDateRange(latestDate);
          console.log(`Processing dividends for symbol: ${symbol} (${dateRange.from} to ${dateRange.to})`);
          
          // Fetch data from all providers concurrently with date range
          const promises = [
            fetchFromFMP(symbol, dateRange),
            fetchFromAlphaVantage(symbol, dateRange),
            fetchFromFinnhub(symbol, dateRange),
            fetchFromPolygon(symbol, dateRange),
            fetchFromTwelveData(symbol, dateRange),
            fetchFromTiingo(symbol, dateRange),
          ];
          
          const providerResults = await Promise.allSettled(promises);
          const validResults = providerResults
            .map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(result => result !== null);
          
          if (validResults.length > 0) {
            const combinedData = combineDividendData(validResults);
            
            if (combinedData.length > 0) {
              const saved = await saveDividendData(supabaseClient, combinedData);
              
              if (saved) {
                successCount++;
                totalDividends += combinedData.length;
                
                // Update the latest date for this symbol
                const latestDivDate = combinedData.length > 0 
                  ? Math.max(...combinedData.map(d => new Date(d.ex_dividend_date).getTime()))
                  : null;
                
                if (latestDivDate) {
                  latestDividendDates.set(symbol, new Date(latestDivDate).toISOString().split('T')[0]);
                }
                
                results.push({
                  symbol,
                  status: 'success',
                  dividend_records: combinedData.length,
                  providers_used: validResults.length,
                  date_range: {
                    from: dateRange.from,
                    to: dateRange.to
                  },
                  new_dividends: combinedData.length > 0 ? {
                    oldest: new Date(Math.min(...combinedData.map(d => new Date(d.ex_dividend_date).getTime()))).toISOString().split('T')[0],
                    newest: new Date(Math.max(...combinedData.map(d => new Date(d.ex_dividend_date).getTime()))).toISOString().split('T')[0]
                  } : null
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
              // No new dividend data found in the date range
              results.push({
                symbol,
                status: 'success',
                message: 'No new dividends in date range',
                dividend_records: 0,
                date_range: {
                  from: dateRange.from,
                  to: dateRange.to
                }
              });
            }
          } else {
            errorCount++;
            results.push({
              symbol,
              status: 'error',
              message: 'No data from any provider',
              date_range: {
                from: dateRange.from,
                to: dateRange.to
              }
            });
          }
          
          processedCount++;
          
          // Delay between symbols to respect rate limits
          if (processedCount % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing dividend data for ${symbol}:`, error);
          results.push({
            symbol,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Delay between batches
      if (i + batchSize < existingSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const response = {
      success: true,
      message: 'Dividend data multi-provider fetch completed',
      summary: {
        total_symbols: existingSymbols.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount,
        skipped: skippedCount,
        total_dividend_records: totalDividends
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
        message: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
