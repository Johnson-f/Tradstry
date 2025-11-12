/**
 * Supabase Edge Function: Earnings Calendar Fetcher
 * 
 * This Edge Function fetches earnings calendar data from StockTwits API,
 * transforms the data into a comprehensive earnings schedule format, and saves them to the database.
 * Accepts custom date ranges via POST request body.
 */

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

// Request body interface
interface RequestBody {
  fromDate?: string; // Optional: YYYY-MM-DD format
  toDate?: string;   // Optional: YYYY-MM-DD format
  returnRawData?: boolean; // Optional: Return raw StockTwits format instead of saving to DB
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
 * Validate and parse date string
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Get date range for earnings calendar
 * If dates are provided in request, use those. Otherwise, default to 1 month into the future.
 */
function getDateRange(requestBody?: RequestBody): { fromDate: string; toDate: string } {
  let fromDate: string;
  let toDate: string;
  
  if (requestBody?.fromDate && requestBody?.toDate) {
    // Validate provided dates
    if (!isValidDate(requestBody.fromDate) || !isValidDate(requestBody.toDate)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD format.');
    }
    
    fromDate = requestBody.fromDate;
    toDate = requestBody.toDate;
    
    // Ensure fromDate is before toDate
    if (new Date(fromDate) > new Date(toDate)) {
      throw new Error('fromDate must be before toDate');
    }
  } else {
    // Default: today to 1 month in the future
    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(today.getMonth() + 1);
    
    fromDate = today.toISOString().split('T')[0];
    toDate = oneMonthLater.toISOString().split('T')[0];
  }
  
  console.log(`Date range: ${fromDate} to ${toDate}`);
  
  return { fromDate, toDate };
}

/**
 * Fetch raw earnings calendar data from StockTwits API (preserves original structure)
 */
async function fetchRawStockTwitsData(fromDate: string, toDate: string): Promise<unknown> {
  try {
    const url = `${STOCKTWITS_CONFIG.baseUrl}${STOCKTWITS_CONFIG.endpoints.earningsCalendar}?date_from=${fromDate}&date_to=${toDate}`;
    console.log(`StockTwits: Fetching raw data from ${url}`);
    
    const response = await fetch(url);
    console.log(`StockTwits: Response status ${response.status}`);
    
    if (!response.ok) {
      console.log(`StockTwits: Response not ok: ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log('StockTwits: Raw response structure:', Object.keys(data));
    
    return data;
  } catch (error) {
    console.error(`StockTwits earnings calendar fetch error:`, error);
    return null;
  }
}

/**
 * Fetch earnings calendar data from StockTwits API and transform for database
 */
async function fetchFromStockTwits(fromDate: string, toDate: string): Promise<Partial<EarningsCalendar>[] | null> {
  try {
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
    
    return allEarningsData.map(earning => ({
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
    
    console.log('Starting earnings calendar multi-provider fetch...');
    
    // Parse request body or query parameters for custom dates
    let requestBody: RequestBody | undefined;
    try {
      if (req.method === 'POST') {
        const contentType = req.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          requestBody = await req.json();
        }
      } else if (req.method === 'GET') {
        // Parse query parameters for GET requests
        const url = new URL(req.url);
        const fromDateParam = url.searchParams.get('fromDate');
        const toDateParam = url.searchParams.get('toDate');
        const returnRawDataParam = url.searchParams.get('returnRawData');
        
        if (fromDateParam || toDateParam || returnRawDataParam) {
          requestBody = {
            fromDate: fromDateParam || undefined,
            toDate: toDateParam || undefined,
            returnRawData: returnRawDataParam === 'true'
          };
        }
      }
    } catch {
      console.log('No valid JSON body or query params provided, using default dates');
    }
    
    // Get date range (from request or use defaults)
    let fromDate: string;
    let toDate: string;
    
    try {
      const dateRange = getDateRange(requestBody);
      fromDate = dateRange.fromDate;
      toDate = dateRange.toDate;
    } catch (dateError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: (dateError as Error).message,
          message: 'Invalid date parameters'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    console.log(`Fetching earnings calendar data from ${fromDate} to ${toDate}`);
    
    // Check if returnRawData is requested
    const returnRawData = requestBody?.returnRawData === true;
    
    try {
      console.log('Fetching earnings calendar data from StockTwits...');
      
      if (returnRawData) {
        // Fetch raw data and return in requested format
        const rawData = await fetchRawStockTwitsData(fromDate, toDate);
        
        if (rawData && typeof rawData === 'object' && 'earnings' in rawData) {
          const earningsData = rawData as { earnings?: Record<string, { stocks?: Array<{
            symbol: string;
            time: string;
            title: string;
            importance: number;
            emoji?: string;
          }> }> };
          
          // Transform to requested format
          const formattedEarnings: Record<string, { stocks: Array<{
            importance: number;
            symbol: string;
            date: string;
            time: string;
            title: string;
            emoji?: string;
          }> }> = {};
          
          if (earningsData.earnings) {
            for (const [date, dateData] of Object.entries(earningsData.earnings)) {
              if (dateData?.stocks && Array.isArray(dateData.stocks)) {
                formattedEarnings[date] = {
                  stocks: dateData.stocks.map(stock => ({
                    importance: stock.importance,
                    symbol: stock.symbol,
                    date: date,
                    time: stock.time,
                    title: stock.title,
                    ...(stock.emoji && { emoji: stock.emoji })
                  }))
                };
              }
            }
          }
          
          const response = {
            date_from: fromDate,
            date_to: toDate,
            earnings: formattedEarnings
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
              message: 'StockTwits API returned no earnings data for the specified date range'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404
            }
          );
        }
      } else {
        // Original flow: fetch, transform, and save to database
        const stockTwitsData = await fetchFromStockTwits(fromDate, toDate);
        
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
                message: 'Earnings calendar fetch completed successfully',
                date_range: {
                  from: fromDate,
                  to: toDate
                },
                summary: {
                  total_symbols_found: processedSymbols.size,
                  total_earnings_records: combinedData.length
                },
                results: results.slice(0, 100) // Return up to 100 symbols
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
                  message: 'Failed to save earnings data to database'
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
                message: 'No valid earnings data found from StockTwits for the specified date range'
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
              message: 'StockTwits API returned no earnings data for the specified date range'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404
            }
          );
        }
      }
    } catch (error) {
      console.error('StockTwits earnings calendar fetch error:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `StockTwits API error: ${(error as Error).message}`
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