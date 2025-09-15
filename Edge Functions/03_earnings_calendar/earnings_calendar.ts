/**
 * Supabase Edge Function: Earnings Calendar Multi-Provider Fetcher
 * 
 * This Edge Function fetches earnings calendar data from multiple market data providers,
 * combines the data to create comprehensive earnings schedules, and saves them to the database.
 * Fetches data for 1 month into the future for stocks available in the stock_quotes table.
 * 
 * Providers used:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 */

// TODO: Create a trigger logic, that fetches earnings calendar dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for earnings calendar information
interface EarningsCalendar {
  symbol: string;
  exchange_id?: number;
  earnings_date: string;
  time_of_day?: string; // 'amc', 'bmo', 'dmh'
  eps?: number;
  eps_estimated?: number;
  eps_surprise?: number;
  eps_surprise_percent?: number;
  revenue?: number;
  revenue_estimated?: number;
  revenue_surprise?: number;
  revenue_surprise_percent?: number;
  fiscal_date_ending?: string;
  fiscal_year: number;
  fiscal_quarter?: number;
  market_cap_at_time?: number;
  sector?: string;
  industry?: string;
  conference_call_date?: string;
  conference_call_time?: string;
  webcast_url?: string;
  transcript_available?: boolean;
  status?: string;
  last_updated?: string;
  update_source?: string;
  data_provider: string;
  logo?: string;
}

// Types for logo API response
interface LogoApiResponse {
  symbol: string;
  name: string;
  price: string;
  preMarketPrice: string;
  afterHoursPrice: string;
  change: string;
  percentChange: string;
  logo: string;
}


// StockTwits API configuration for earnings calendar data
const STOCKTWITS_CONFIG = {
  name: 'StockTwits',
  baseUrl: 'https://api.stocktwits.com/api/2',
  endpoints: {
    earningsCalendar: '/discover/earnings_calendar',
  }
};

/**
 * Get date range for earnings calendar - 1 month into the future
 */
function getDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  
  // Start from today
  const fromDate = new Date(today);
  
  // Go 1 month into the future
  const toDate = new Date(today);
  toDate.setMonth(today.getMonth() + 1);
  
  const fromStr = fromDate.toISOString().split('T')[0];
  const toStr = toDate.toISOString().split('T')[0];
  
  console.log(`Date range: ${fromStr} to ${toStr}`);
  
  return {
    fromDate: fromStr,
    toDate: toStr
  };
}

/**
 * Fetch earnings calendar data from StockTwits API
 */
async function fetchFromStockTwits(symbolsToFilter: string[]): Promise<Partial<EarningsCalendar>[] | null> {
  try {
    const { fromDate, toDate } = getDateRange();
    const url = `${STOCKTWITS_CONFIG.baseUrl}${STOCKTWITS_CONFIG.endpoints.earningsCalendar}?date_from=${fromDate}&date_to=${toDate}`;
    console.log(`StockTwits: Fetching from ${url}`);
    
    const response = await fetch(url);
    console.log(`StockTwits: Response status ${response.status}`);
    
    if (!response.ok) {
      console.log(`StockTwits: Response not ok: ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log('StockTwits: Raw response structure:', Object.keys(data));
    
    // StockTwits API returns data nested by dates
    const allEarningsData: Array<{
      symbol: string;
      earnings_date: string;
      time: string;
      title: string;
      importance: number;
    }> = [];
    
    if (data.earnings && typeof data.earnings === 'object') {
      // Extract stocks from each date
      for (const [date, dateData] of Object.entries(data.earnings)) {
        const typedDateData = dateData as { stocks?: Array<{
          symbol: string;
          time: string;
          title: string;
          importance: number;
        }> };
        
        if (typedDateData?.stocks && Array.isArray(typedDateData.stocks)) {
          const dateStocks = typedDateData.stocks.map(stock => ({
            ...stock,
            earnings_date: date
          }));
          allEarningsData.push(...dateStocks);
        }
      }
    } else {
      console.log('StockTwits: Unexpected data structure - no earnings object found');
      return null;
    }
    
    console.log(`StockTwits: Found ${allEarningsData.length} total earnings records`);
    
    // Get all unique symbols from earnings data
    const allEarningsSymbols = [...new Set(allEarningsData.map(earning => earning.symbol).filter(Boolean))];
    console.log(`StockTwits: Found ${allEarningsSymbols.length} unique symbols with earnings`);
    
    // Filter for symbols that are either in our stock_quotes table OR are reporting earnings
    const relevantEarnings = allEarningsData.filter(earning => {
      const symbol = earning.symbol;
      return symbol && (symbolsToFilter.includes(symbol) || allEarningsSymbols.includes(symbol));
    });
    
    console.log(`StockTwits: Filtered to ${relevantEarnings.length} relevant earnings records`);
    
    if (relevantEarnings.length === 0) {
      console.log(`StockTwits: Sample available symbols:`, allEarningsSymbols.slice(0, 10));
    }
    
    return relevantEarnings.map(earning => ({
      symbol: earning.symbol,
      earnings_date: earning.earnings_date,
      time_of_day: parseTimeOfDay(earning.time),
      eps: undefined, // StockTwits doesn't provide EPS data in this endpoint
      eps_estimated: undefined,
      revenue: undefined, // StockTwits doesn't provide revenue data in this endpoint
      revenue_estimated: undefined,
      fiscal_year: new Date(earning.earnings_date).getFullYear(),
      fiscal_quarter: Math.ceil((new Date(earning.earnings_date).getMonth() + 1) / 3),
      status: 'scheduled',
      market_cap_at_time: undefined,
      sector: undefined,
      industry: undefined,
      conference_call_date: undefined,
      conference_call_time: earning.time,
      webcast_url: undefined,
      transcript_available: false,
      last_updated: new Date().toISOString(),
      update_source: 'stocktwits_api',
      data_provider: 'stocktwits'
    }));
    
  } catch (error) {
    console.error(`StockTwits earnings calendar fetch error:`, error);
    return null;
  }
}

/**
 * Parse time string to determine time of day
 */
function parseTimeOfDay(timeStr: string): string {
  if (!timeStr) return 'unknown';
  
  const hour = parseInt(timeStr.split(':')[0]);
  
  if (hour >= 16) return 'amc'; // After market close
  if (hour <= 9) return 'bmo';  // Before market open  
  return 'dmh'; // During market hours
}



/**
 * Combine earnings calendar data from multiple providers
 */
function combineEarningsData(dataArrays: (Partial<EarningsCalendar>[] | null)[]): EarningsCalendar[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<EarningsCalendar>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all earnings records
  const allEarnings = validData.flat();
  
  // Group by symbol, fiscal_year, and fiscal_quarter to merge duplicates
  const earningsMap = new Map<string, EarningsCalendar>();
  
  for (const earning of allEarnings) {
    if (!earning.symbol || !earning.earnings_date || !earning.fiscal_year) continue;
    
    const key = `${earning.symbol}-${earning.fiscal_year}-${earning.fiscal_quarter || 'unknown'}`;
    
    if (earningsMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = earningsMap.get(key)!;
      const merged: EarningsCalendar = {
        symbol: earning.symbol,
        earnings_date: earning.earnings_date,
        fiscal_year: earning.fiscal_year,
        data_provider: `${existing.data_provider}, ${earning.data_provider}`
      };
      
      // Merge other fields, preferring non-null/non-empty values
      for (const [key, value] of Object.entries(earning)) {
        if (value !== null && value !== undefined && value !== '') {
          if (key !== 'data_provider' && !merged[key as keyof EarningsCalendar]) {
            (merged as EarningsCalendar & Record<string, unknown>)[key] = value;
          }
        }
      }
      
      // Calculate surprise percentages if we have both actual and estimated
      if (merged.eps && merged.eps_estimated && !merged.eps_surprise_percent) {
        merged.eps_surprise = merged.eps - merged.eps_estimated;
        merged.eps_surprise_percent = (merged.eps_surprise / merged.eps_estimated) * 100;
      }
      
      if (merged.revenue && merged.revenue_estimated && !merged.revenue_surprise_percent) {
        merged.revenue_surprise = merged.revenue - merged.revenue_estimated;
        merged.revenue_surprise_percent = (merged.revenue_surprise / merged.revenue_estimated) * 100;
      }
      
      earningsMap.set(key, merged);
    } else {
      // Create new record
      const newEarning: EarningsCalendar = {
        symbol: earning.symbol,
        exchange_id: earning.exchange_id,
        earnings_date: earning.earnings_date,
        time_of_day: earning.time_of_day,
        eps: earning.eps,
        eps_estimated: earning.eps_estimated,
        eps_surprise: earning.eps_surprise,
        eps_surprise_percent: earning.eps_surprise_percent,
        revenue: earning.revenue,
        revenue_estimated: earning.revenue_estimated,
        revenue_surprise: earning.revenue_surprise,
        revenue_surprise_percent: earning.revenue_surprise_percent,
        fiscal_date_ending: earning.fiscal_date_ending,
        fiscal_year: earning.fiscal_year,
        fiscal_quarter: earning.fiscal_quarter,
        market_cap_at_time: earning.market_cap_at_time,
        sector: earning.sector,
        industry: earning.industry,
        conference_call_date: earning.conference_call_date,
        conference_call_time: earning.conference_call_time,
        webcast_url: earning.webcast_url,
        transcript_available: earning.transcript_available || false,
        status: earning.status || 'scheduled',
        last_updated: new Date().toISOString(),
        update_source: 'multi_provider_fetch',
        data_provider: earning.data_provider || 'unknown'
      };
      
      // Calculate surprise percentages if we have both actual and estimated
      if (newEarning.eps && newEarning.eps_estimated && !newEarning.eps_surprise_percent) {
        newEarning.eps_surprise = newEarning.eps - newEarning.eps_estimated;
        newEarning.eps_surprise_percent = (newEarning.eps_surprise / newEarning.eps_estimated) * 100;
      }
      
      if (newEarning.revenue && newEarning.revenue_estimated && !newEarning.revenue_surprise_percent) {
        newEarning.revenue_surprise = newEarning.revenue - newEarning.revenue_estimated;
        newEarning.revenue_surprise_percent = (newEarning.revenue_surprise / newEarning.revenue_estimated) * 100;
      }
      
      earningsMap.set(key, newEarning);
    }
  }
  
  return Array.from(earningsMap.values());
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
 * Fetch symbols from earnings calendar that need logos
 */
async function getEarningsSymbolsNeedingLogos(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('earnings_calendar')
      .select('symbol')
      .or('logo.is.null,logo.eq.""')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching earnings symbols needing logos:', error);
      return [];
    }
    
    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    console.log(`Found ${uniqueSymbols.length} earnings symbols needing logos`);
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getEarningsSymbolsNeedingLogos:', error);
    return [];
  }
}

/**
 * Fetch logos from finance-query API
 */
async function fetchLogosFromAPI(symbols: string[]): Promise<Map<string, string>> {
  const logoMap = new Map<string, string>();
  
  if (symbols.length === 0) {
    return logoMap;
  }
  
  try {
    // Process symbols in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    
    console.log(`Processing ${batches.length} batches of symbols for logo fetching`);
    
    for (const batch of batches) {
      try {
        const symbolsParam = batch.join(',');
        const url = `https://finance-query.onrender.com/v1/simple-quotes?symbols=${symbolsParam}`;
        
        console.log(`Fetching logos for batch: ${symbolsParam}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`Logo API request failed for batch ${symbolsParam}: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const data: LogoApiResponse[] = await response.json();
        
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item.symbol && item.logo) {
              logoMap.set(item.symbol.toUpperCase(), item.logo);
            }
          });
        }
        
        // Add a small delay between requests to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (batchError) {
        console.error(`Error processing logo batch ${batch.join(',')}:`, batchError);
        continue;
      }
    }
    
    console.log(`Successfully fetched ${logoMap.size} logos from API`);
    return logoMap;
    
  } catch (error) {
    console.error('Error in fetchLogosFromAPI:', error);
    return logoMap;
  }
}

/**
 * Update earnings calendar records with logos
 */
async function updateEarningsWithLogos(supabase: SupabaseClient, logoMap: Map<string, string>): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;
  
  if (logoMap.size === 0) {
    return { updated, errors };
  }
  
  try {
    // Update records one by one to handle potential conflicts gracefully
    for (const [symbol, logo] of logoMap.entries()) {
      try {
        const { error } = await supabase
          .from('earnings_calendar')
          .update({ logo })
          .eq('symbol', symbol)
          .or('logo.is.null,logo.eq.""');
        
        if (error) {
          console.error(`Error updating logo for ${symbol}:`, error);
          errors++;
        } else {
          updated++;
        }
      } catch (updateError) {
        console.error(`Error updating logo for ${symbol}:`, updateError);
        errors++;
      }
    }
    
    console.log(`Logo update completed: ${updated} updated, ${errors} errors`);
    return { updated, errors };
    
  } catch (error) {
    console.error('Error in updateEarningsWithLogos:', error);
    return { updated, errors };
  }
}

/**
 * Save earnings calendar data to the database
 */
async function saveEarningsData(supabase: SupabaseClient, earningsData: EarningsCalendar[]): Promise<boolean> {
  if (earningsData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('earnings_calendar')
      .upsert(earningsData, {
        onConflict: 'symbol,fiscal_year,fiscal_quarter,data_provider'
      });
    
    if (error) {
      console.error(`Error saving earnings calendar data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveEarningsData:`, error);
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
    
    console.log('Starting earnings calendar multi-provider fetch for 3-month future period...');
    
    // Get existing symbols from the database
    const existingSymbols = await getExistingSymbols(supabaseClient);
    
    // Also fetch logos for earnings calendar symbols that need them
    console.log('Fetching logos for earnings calendar symbols...');
    const earningsSymbolsNeedingLogos = await getEarningsSymbolsNeedingLogos(supabaseClient);
    let logoUpdateResult = { updated: 0, errors: 0 };
    
    if (earningsSymbolsNeedingLogos.length > 0) {
      const logoMap = await fetchLogosFromAPI(earningsSymbolsNeedingLogos);
      logoUpdateResult = await updateEarningsWithLogos(supabaseClient, logoMap);
      console.log(`Logo update result: ${logoUpdateResult.updated} updated, ${logoUpdateResult.errors} errors`);
    }
    
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
    const { fromDate, toDate } = getDateRange();
    console.log(`Fetching earnings calendar data from ${fromDate} to ${toDate}`);
    
    try {
      console.log('Fetching earnings calendar data from StockTwits...');
      
      // Fetch earnings data from StockTwits API
      const stockTwitsData = await fetchFromStockTwits(existingSymbols);
      
      if (stockTwitsData && stockTwitsData.length > 0) {
        const combinedData = combineEarningsData([stockTwitsData]);
        
        if (combinedData.length > 0) {
          const saved = await saveEarningsData(supabaseClient, combinedData);
          
          if (saved) {
            // Group results by symbol for reporting
            const symbolCounts = new Map<string, number>();
            const processedSymbols = new Set<string>();
            
            combinedData.forEach(earning => {
              symbolCounts.set(earning.symbol, (symbolCounts.get(earning.symbol) || 0) + 1);
              processedSymbols.add(earning.symbol);
            });
            
            const results = Array.from(processedSymbols).map(symbol => ({
              symbol,
              status: 'success' as const,
              earnings_records: symbolCounts.get(symbol) || 0
            }));
            
            const response = {
              success: true,
              message: 'Earnings calendar StockTwits fetch completed',
              date_range: {
                from: fromDate,
                to: toDate
              },
              summary: {
                total_symbols: existingSymbols.length,
                processed: processedSymbols.size,
                successful: processedSymbols.size,
                errors: 0,
                total_earnings_records: combinedData.length,
                logos_updated: earningsSymbolsNeedingLogos.length > 0 ? logoUpdateResult?.updated || 0 : 0
              },
              results: results.slice(0, 50)
            };
            
            return new Response(
              JSON.stringify(response),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
              }
            );
          } else {
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: 'Failed to save earnings data to database',
                summary: {
                  total_symbols: existingSymbols.length,
                  processed: 0,
                  successful: 0,
                  errors: 1,
                  total_earnings_records: 0
                }
              }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
              }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: 'No valid earnings data found from StockTwits',
              summary: {
                total_symbols: existingSymbols.length,
                processed: 0,
                successful: 0,
                errors: 1,
                total_earnings_records: 0
              }
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404
            }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'StockTwits API returned no earnings data',
            summary: {
              total_symbols: existingSymbols.length,
              processed: 0,
              successful: 0,
              errors: 1,
              total_earnings_records: 0
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404
          }
        );
      }
    } catch (error) {
      console.error('StockTwits earnings calendar fetch error:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `StockTwits API error: ${(error as Error).message}`,
          summary: {
            total_symbols: existingSymbols.length,
            processed: 0,
            successful: 0,
            errors: 1,
            total_earnings_records: 0
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message,
        message: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
