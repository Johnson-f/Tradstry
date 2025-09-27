/**
 * Supabase Edge Function: Company Info Fetcher - REDESIGNED
 * 
 * FUNDAMENTAL DATA ONLY - NO real-time prices
 * Fetches stock symbols from the stock_quotes table,
 * retrieves FUNDAMENTAL company data from the finance-query API,
 * and updates the company_info table with non-price information.
 * 
 * Real-time prices should come from stock_quotes or historical_prices tables.
 * Designed to run less frequently (daily) since fundamental data changes slowly.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Interface for the API response (all fields optional except core ones)
interface FinanceQuoteResponse {
  symbol: string;
  name: string;
  price: string;
  change: string;
  percentChange: string;
  open: string;
  high: string;
  low: string;
  yearHigh: string;
  yearLow: string;
  volume: string | number;
  avgVolume: string | number;
  
  // Stock-specific fields (optional)
  marketCap?: string;
  beta?: string;
  earningsDate?: string;
  sector?: string;
  industry?: string;
  dividend?: string;
  yield?: string;
  exDividend?: string;
  lastDividend?: string;
  pe?: string;
  
  // ETF-specific fields (optional)
  netAssets?: string;
  nav?: string;
  category?: string;
  
  // Common optional fields
  about?: string;
  employees?: string;
  fiveDaysReturn?: string;
  oneMonthReturn?: string;
  threeMonthReturn?: string;
  sixMonthReturn?: string;
  ytdReturn?: string;
  yearReturn?: string;
  threeYearReturn?: string;
  fiveYearReturn?: string;
  tenYearReturn?: string;
  maxReturn?: string;
  logo?: string;
}

// Interface for company info data to be saved - SELECTIVE REAL-TIME DATA
interface CompanyInfoData {
  symbol: string;
  name?: string;
  company_name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  about?: string;
  employees?: number;
  logo?: string;
  
  // Daily price data (kept for trading analysis)
  open?: number;
  high?: number;
  low?: number;
  year_high?: number;
  year_low?: number;
  
  // Volume and trading metrics
  volume?: number;
  avg_volume?: number;
  
  // Financial ratios and metrics
  market_cap?: number;
  beta?: number;
  pe_ratio?: number;
  
  // Dividend information
  dividend?: number;
  yield?: number;
  ex_dividend?: string;
  last_dividend?: number;
  
  // Fund-specific metrics
  net_assets?: number;
  nav?: number;
  
  // Corporate events
  earnings_date?: string;
  
  // Performance returns
  five_day_return?: number;
  one_month_return?: number;
  three_month_return?: number;
  six_month_return?: number;
  ytd_return?: number;
  year_return?: number;
  five_year_return?: number;
  ten_year_return?: number;
  max_return?: number;
  
  data_provider: string;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse percentage string to decimal (e.g., "+64.82%" -> 64.82)
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
 * Parse number string with possible suffixes (e.g., "7.11B" -> 7110000000)
 * Returns integer for BIGINT fields in database
 */
function parseNumberWithSuffix(numStr: string | undefined): number | undefined {
  if (!numStr) return undefined;
  
  const cleanStr = numStr.toString().replace(/[+,]/g, '');
  
  // Handle suffixes
  if (cleanStr.includes('B')) {
    const num = parseFloat(cleanStr.replace('B', ''));
    return isNaN(num) ? undefined : Math.round(num * 1000000000);
  } else if (cleanStr.includes('M')) {
    const num = parseFloat(cleanStr.replace('M', ''));
    return isNaN(num) ? undefined : Math.round(num * 1000000);
  } else if (cleanStr.includes('K')) {
    const num = parseFloat(cleanStr.replace('K', ''));
    return isNaN(num) ? undefined : Math.round(num * 1000);
  } else {
    const num = parseFloat(cleanStr);
    return isNaN(num) ? undefined : Math.round(num);
  }
}

/**
 * Parse date string to ISO date format
 */
function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

/**
 * Transform API response to company info data
 */
function transformToCompanyInfo(apiData: FinanceQuoteResponse): CompanyInfoData {
  try {
    return {
      symbol: apiData.symbol,
      name: apiData.name || undefined,
      company_name: apiData.name || undefined,
      sector: apiData.sector || undefined,
      industry: apiData.industry || undefined,
      about: apiData.about || undefined,
      employees: apiData.employees ? parseInt(apiData.employees) : undefined,
      logo: apiData.logo || undefined,
      
      // Daily price data (kept for trading analysis)
      open: parseFloat(apiData.open) || undefined,
      high: parseFloat(apiData.high) || undefined,
      low: parseFloat(apiData.low) || undefined,
      year_high: parseFloat(apiData.yearHigh) || undefined,
      year_low: parseFloat(apiData.yearLow) || undefined,
      
      // Volume and trading metrics
      volume: parseNumberWithSuffix(apiData.volume?.toString()),
      avg_volume: parseNumberWithSuffix(apiData.avgVolume?.toString()),
      market_cap: apiData.marketCap ? parseNumberWithSuffix(apiData.marketCap) : (apiData.netAssets ? parseNumberWithSuffix(apiData.netAssets) : undefined),
      beta: apiData.beta ? parseFloat(apiData.beta) : undefined,
      pe_ratio: apiData.pe ? parseFloat(apiData.pe) : undefined,
      
      // Dividend data (for stocks)
      dividend: apiData.dividend ? parseFloat(apiData.dividend) : undefined,
      yield: apiData.yield ? parsePercentage(apiData.yield) : undefined,
      ex_dividend: apiData.exDividend ? parseDate(apiData.exDividend) : undefined,
      last_dividend: apiData.lastDividend ? parseFloat(apiData.lastDividend) : undefined,
      
      // ETF-specific data (ensure integer for BIGINT field)
      net_assets: apiData.netAssets ? parseNumberWithSuffix(apiData.netAssets) : undefined,
      nav: apiData.nav ? parseFloat(apiData.nav) : undefined,
      
      // Dates
      earnings_date: apiData.earningsDate ? parseDate(apiData.earningsDate) : undefined,
      
      // Performance returns
      five_day_return: apiData.fiveDaysReturn ? parsePercentage(apiData.fiveDaysReturn) : undefined,
      one_month_return: apiData.oneMonthReturn ? parsePercentage(apiData.oneMonthReturn) : undefined,
      three_month_return: apiData.threeMonthReturn ? parsePercentage(apiData.threeMonthReturn) : undefined,
      six_month_return: apiData.sixMonthReturn ? parsePercentage(apiData.sixMonthReturn) : undefined,
      ytd_return: apiData.ytdReturn ? parsePercentage(apiData.ytdReturn) : undefined,
      year_return: apiData.yearReturn ? parsePercentage(apiData.yearReturn) : undefined,
      five_year_return: apiData.fiveYearReturn ? parsePercentage(apiData.fiveYearReturn) : undefined,
      ten_year_return: apiData.tenYearReturn ? parsePercentage(apiData.tenYearReturn) : undefined,
      max_return: apiData.maxReturn ? parsePercentage(apiData.maxReturn) : undefined,
      
      data_provider: 'finance-query'
    };
  } catch (error) {
    console.error(`Error transforming data for ${apiData.symbol}:`, error);
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
 * Fetch company data from the finance-query API
 */
async function fetchCompanyData(symbols: string[]): Promise<FinanceQuoteResponse[]> {
  if (symbols.length === 0) return [];
  
  try {
    // Join symbols with comma for the API call
    const symbolsParam = symbols.join(',');
    const url = `https://finance-query.onrender.com/v1/quotes?symbols=${symbolsParam}`;
    
    console.log(`Fetching data for ${symbols.length} symbols from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`API request failed with status: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('API response is not an array:', data);
      return [];
    }
    
    console.log(`Successfully fetched data for ${data.length} symbols`);
    return data;
  } catch (error) {
    console.error('Error fetching company data:', error);
    return [];
  }
}

/**
 * Save company info data to the database using upsert
 */
async function saveCompanyInfoData(supabase: SupabaseClient, companyData: CompanyInfoData[]): Promise<{ success: number; errors: number }> {
  if (companyData.length === 0) return { success: 0, errors: 0 };
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process each company individually to handle potential conflicts
  for (const company of companyData) {
    try {
      const { error } = await supabase
        .from('company_info')
        .upsert(
          {
            ...company,
            updated_at: getCurrentTimestamp()
          },
          {
            onConflict: 'symbol,data_provider'
          }
        );
      
      if (error) {
        console.error(`Error upserting company data for ${company.symbol}:`, error);
        errorCount++;
      } else {
        console.log(`Successfully upserted company data for ${company.symbol}`);
        successCount++;
      }
    } catch (upsertError) {
      console.error(`Error processing company ${company.symbol}:`, upsertError);
      errorCount++;
    }
  }
  
  return { success: successCount, errors: errorCount };
}

/**
 * Validate company data for basic sanity checks
 */
function validateCompanyData(company: CompanyInfoData): boolean {
  // Basic validation checks
  if (!company.symbol) return false;
  
  // Check if prices are reasonable (not negative)
  if (company.open !== undefined && company.open < 0) return false;
  if (company.high !== undefined && company.high < 0) return false;
  if (company.low !== undefined && company.low < 0) return false;
  if (company.year_high !== undefined && company.year_high < 0) return false;
  if (company.year_low !== undefined && company.year_low < 0) return false;
  if (company.volume !== undefined && company.volume < 0) return false;
  if (company.avg_volume !== undefined && company.avg_volume < 0) return false;
  
  // Check if high >= low (if both exist)
  if (company.high !== undefined && company.low !== undefined && company.high < company.low) return false;
  
  // Check if year_high >= year_low (if both exist)
  if (company.year_high !== undefined && company.year_low !== undefined && company.year_high < company.year_low) return false;
  
  // Check if dividend is reasonable (not negative)
  if (company.dividend !== undefined && company.dividend < 0) return false;
  
  return true;
}

/**
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
    
    console.log('Starting company quotes fetch...');
    
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
    
    console.log(`Processing ${symbolsToProcess.length} symbols`);
    
    // Process symbols in batches to avoid overwhelming the API
    const batchSize = 50; // API can handle multiple symbols in one request
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    const results = [];
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(symbolsToProcess.length / batchSize)}`);
        
        // Fetch data from the API
        const apiData = await fetchCompanyData(batch);
        
        if (apiData.length === 0) {
          console.log(`No data returned for batch ${Math.floor(i / batchSize) + 1}`);
          totalErrors += batch.length;
          
          // Add error results for all symbols in this batch
          batch.forEach(symbol => {
            results.push({
              symbol,
              status: 'error',
              message: 'No data returned from API'
            });
          });
          
          continue;
        }
        
        // Transform API data to company info format
        const companyData: CompanyInfoData[] = [];
        const batchResults: any[] = [];
        
        for (const apiItem of apiData) {
          try {
            const transformed = transformToCompanyInfo(apiItem);
            
            if (validateCompanyData(transformed)) {
              companyData.push(transformed);
              batchResults.push({
                symbol: transformed.symbol,
                status: 'success',
                open: transformed.open,
                high: transformed.high,
                low: transformed.low,
                volume: transformed.volume,
                year_high: transformed.year_high,
                year_low: transformed.year_low,
                avg_volume: transformed.avg_volume,
                market_cap: transformed.market_cap
              });
            } else {
              batchResults.push({
                symbol: apiItem.symbol,
                status: 'error',
                message: 'Data validation failed'
              });
            }
          } catch (transformError) {
            console.error(`Error transforming data for ${apiItem.symbol}:`, transformError);
            batchResults.push({
              symbol: apiItem.symbol,
              status: 'error',
              message: 'Data transformation failed'
            });
          }
        }
        
        // Save valid company data to database
        if (companyData.length > 0) {
          const saveResults = await saveCompanyInfoData(supabaseClient, companyData);
          totalSuccess += saveResults.success;
          totalErrors += saveResults.errors;
          
          // Update results with save status
          batchResults.forEach(result => {
            if (result.status === 'success') {
              const wasSuccessfullySaved = companyData.some(c => c.symbol === result.symbol);
              if (!wasSuccessfullySaved) {
                result.status = 'error';
                result.message = 'Failed to save to database';
              }
            }
          });
        }
        
        results.push(...batchResults);
        totalProcessed += batch.length;
        
        // Add delay between batches to be respectful to the API
        if (i + batchSize < symbolsToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError);
        totalErrors += batch.length;
        
        // Add error results for all symbols in this batch
        batch.forEach(symbol => {
          results.push({
            symbol,
            status: 'error',
            message: batchError instanceof Error ? batchError.message : 'Batch processing failed'
          });
        });
      }
    }
    
    const response = {
      success: true,
      message: 'Company quotes fetch completed',
      summary: {
        total_symbols: symbolsToProcess.length,
        processed: totalProcessed,
        successful: totalSuccess,
        errors: totalErrors,
        api_endpoint: 'https://finance-query.onrender.com/v1/quotes',
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
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Internal server error in company quotes fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
