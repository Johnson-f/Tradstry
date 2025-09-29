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
 * 
 * TRIGGER POLICY: MANUAL/CRON ONLY - Does not auto-trigger
 * - Only executes when manually invoked or triggered by scheduled cron jobs
 * - No database triggers or automatic execution
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
  expenseRatio?: string;
  
  // Common optional fields
  about?: string;
  employees?: string;
  eps?: string;
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
  ipoDate?: string;
  currency?: string;
  fiscalYearEnd?: string;
}

// Interface for company info data to be saved - MATCHES DATABASE SCHEMA EXACTLY
interface CompanyInfoData {
  symbol: string;
  exchange_id?: number;
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
  eps?: number;  // NEW: Earnings per share
  
  // Dividend information
  dividend?: number;
  yield?: number;
  ex_dividend?: string;
  last_dividend?: number;
  
  // Fund-specific metrics
  net_assets?: number;
  nav?: number;
  expense_ratio?: number;  // NEW: Annual expense ratio
  
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
  
  // Additional metadata (NEW)
  ipo_date?: string;
  currency?: string;
  fiscal_year_end?: string;
  
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
 * Parse decimal with specific precision limits to match database constraints
 */
function parseDecimalWithPrecision(value: string | number | undefined, maxDigits: number, decimals: number): number | undefined {
  if (!value) return undefined;
  
  const parsed = parseFloat(value.toString());
  if (isNaN(parsed)) return undefined;
  
  // Calculate max value based on precision (e.g., DECIMAL(15,4) max is 99999999999.9999)
  const maxValue = Math.pow(10, maxDigits - decimals) - Math.pow(10, -decimals);
  const minValue = -maxValue;
  
  // Clamp and round to specified decimal places
  const clamped = Math.max(minValue, Math.min(maxValue, parsed));
  return Math.round(clamped * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Parse string with length validation to match VARCHAR constraints
 */
function parseStringWithLength(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.toString().trim();
  if (trimmed.length === 0) return undefined;
  
  return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
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
      
      // String fields with VARCHAR length constraints
      name: parseStringWithLength(apiData.name, 255),
      company_name: parseStringWithLength(apiData.name, 255), // Often same as name
      exchange: parseStringWithLength(apiData.exchange, 50),
      sector: parseStringWithLength(apiData.sector, 100),
      industry: parseStringWithLength(apiData.industry, 100),
      about: apiData.about || undefined, // TEXT field - no length limit
      logo: parseStringWithLength(apiData.logo, 500),
      
      // Integer fields
      employees: apiData.employees ? parseInt(apiData.employees) : undefined,
      
      // Daily price data - DECIMAL(15,4)
      open: parseDecimalWithPrecision(apiData.open, 15, 4),
      high: parseDecimalWithPrecision(apiData.high, 15, 4),
      low: parseDecimalWithPrecision(apiData.low, 15, 4),
      year_high: parseDecimalWithPrecision(apiData.yearHigh, 15, 4),
      year_low: parseDecimalWithPrecision(apiData.yearLow, 15, 4),
      
      // Volume and trading metrics - BIGINT
      volume: parseNumberWithSuffix(apiData.volume?.toString()),
      avg_volume: parseNumberWithSuffix(apiData.avgVolume?.toString()),
      
      // Financial ratios and metrics
      market_cap: apiData.marketCap ? parseNumberWithSuffix(apiData.marketCap) : (apiData.netAssets ? parseNumberWithSuffix(apiData.netAssets) : undefined), // BIGINT
      beta: parseDecimalWithPrecision(apiData.beta, 8, 4), // DECIMAL(8,4)
      pe_ratio: parseDecimalWithPrecision(apiData.pe, 10, 2), // DECIMAL(10,2)
      eps: parseDecimalWithPrecision(apiData.eps, 10, 4), // DECIMAL(10,4)
      
      // Dividend information
      dividend: parseDecimalWithPrecision(apiData.dividend, 10, 4), // DECIMAL(10,4)
      yield: parseDecimalWithPrecision(apiData.yield?.replace('%', ''), 7, 4), // DECIMAL(7,4)
      ex_dividend: apiData.exDividend ? parseDate(apiData.exDividend) : undefined,
      last_dividend: parseDecimalWithPrecision(apiData.lastDividend, 10, 4), // DECIMAL(10,4)
      
      // Fund-specific metrics
      net_assets: apiData.netAssets ? parseNumberWithSuffix(apiData.netAssets) : undefined, // BIGINT
      nav: parseDecimalWithPrecision(apiData.nav, 15, 4), // DECIMAL(15,4)
      expense_ratio: parseDecimalWithPrecision(apiData.expenseRatio?.replace('%', ''), 7, 4), // DECIMAL(7,4)
      
      // Dates
      earnings_date: apiData.earningsDate ? parseDate(apiData.earningsDate) : undefined,
      ipo_date: apiData.ipoDate ? parseDate(apiData.ipoDate) : undefined,
      
      // Additional metadata
      currency: parseStringWithLength(apiData.currency || 'USD', 3), // VARCHAR(3)
      fiscal_year_end: parseStringWithLength(apiData.fiscalYearEnd, 10), // VARCHAR(10)
      
      // Performance returns - all DECIMAL(8,4)
      five_day_return: parseDecimalWithPrecision(apiData.fiveDaysReturn?.replace('%', ''), 8, 4),
      one_month_return: parseDecimalWithPrecision(apiData.oneMonthReturn?.replace('%', ''), 8, 4),
      three_month_return: parseDecimalWithPrecision(apiData.threeMonthReturn?.replace('%', ''), 8, 4),
      six_month_return: parseDecimalWithPrecision(apiData.sixMonthReturn?.replace('%', ''), 8, 4),
      ytd_return: parseDecimalWithPrecision(apiData.ytdReturn?.replace('%', ''), 8, 4),
      year_return: parseDecimalWithPrecision(apiData.yearReturn?.replace('%', ''), 8, 4),
      five_year_return: parseDecimalWithPrecision(apiData.fiveYearReturn?.replace('%', ''), 8, 4),
      ten_year_return: parseDecimalWithPrecision(apiData.tenYearReturn?.replace('%', ''), 8, 4),
      max_return: parseDecimalWithPrecision(apiData.maxReturn?.replace('%', ''), 8, 4),
      
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
 * Enhanced validation for new database fields
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
  
  // Check financial metrics
  if (company.dividend !== undefined && company.dividend < 0) return false;
  if (company.eps !== undefined && isNaN(company.eps)) return false;
  if (company.pe_ratio !== undefined && company.pe_ratio < 0) return false;
  if (company.beta !== undefined && isNaN(company.beta)) return false;
  if (company.market_cap !== undefined && company.market_cap < 0) return false;
  if (company.net_assets !== undefined && company.net_assets < 0) return false;
  if (company.nav !== undefined && company.nav < 0) return false;
  if (company.expense_ratio !== undefined && (company.expense_ratio < 0 || company.expense_ratio > 100)) return false;
  
  // Validate string length constraints (matching VARCHAR limits)
  if (company.name && company.name.length > 255) return false;
  if (company.company_name && company.company_name.length > 255) return false;
  if (company.exchange && company.exchange.length > 50) return false;
  if (company.sector && company.sector.length > 100) return false;
  if (company.industry && company.industry.length > 100) return false;
  if (company.logo && company.logo.length > 500) return false;
  
  // Validate currency format (3-letter ISO code)
  if (company.currency && (!/^[A-Z]{3}$/.test(company.currency) || company.currency.length !== 3)) return false;
  
  // Validate fiscal year end format (VARCHAR(10) - could be MM-DD or other formats)
  if (company.fiscal_year_end && company.fiscal_year_end.length > 10) return false;
  
  // Validate employee count (INTEGER constraint)
  if (company.employees !== undefined && (company.employees < 0 || !Number.isInteger(company.employees))) return false;
  
  // Validate decimal precision constraints
  // DECIMAL(15,4) fields: open, high, low, year_high, year_low, nav
  const decimal15_4_fields = ['open', 'high', 'low', 'year_high', 'year_low', 'nav'] as const;
  for (const field of decimal15_4_fields) {
    const value = company[field];
    if (value !== undefined && (Math.abs(value) >= 100000000000 || !Number.isFinite(value))) return false;
  }
  
  // DECIMAL(10,4) fields: eps, dividend, last_dividend
  const decimal10_4_fields = ['eps', 'dividend', 'last_dividend'] as const;
  for (const field of decimal10_4_fields) {
    const value = company[field];
    if (value !== undefined && (Math.abs(value) >= 1000000 || !Number.isFinite(value))) return false;
  }
  
  // DECIMAL(10,2) fields: pe_ratio
  if (company.pe_ratio !== undefined && (Math.abs(company.pe_ratio) >= 100000000 || !Number.isFinite(company.pe_ratio))) return false;
  
  // DECIMAL(8,4) fields: beta and all performance returns
  const decimal8_4_fields = ['beta', 'five_day_return', 'one_month_return', 'three_month_return', 'six_month_return', 'ytd_return', 'year_return', 'five_year_return', 'ten_year_return', 'max_return'] as const;
  for (const field of decimal8_4_fields) {
    const value = company[field];
    if (value !== undefined && (Math.abs(value) >= 10000 || !Number.isFinite(value))) return false;
  }
  
  // DECIMAL(7,4) fields: yield, expense_ratio
  const decimal7_4_fields = ['yield', 'expense_ratio'] as const;
  for (const field of decimal7_4_fields) {
    const value = company[field];
    if (value !== undefined && (Math.abs(value) >= 1000 || !Number.isFinite(value))) return false;
  }
  
  return true;
}

/**
 * Main Edge Function Handler
 * 
 * EXECUTION POLICY: MANUAL/CRON ONLY
 * - Does not auto-trigger from database changes
 * - Only executes when manually invoked or via scheduled cron jobs
 * - Supports both GET and POST methods for flexibility
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
    
    console.log('Starting company quotes fetch - MANUAL/CRON EXECUTION ONLY...');
    
    // Parse request body for any specific symbols (optional)
    let requestedSymbols: string[] | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
        console.log(`Manual execution with ${requestedSymbols?.length || 0} requested symbols`);
      } catch {
        // Continue with existing symbols if request body parsing fails
        console.log('No specific symbols requested, using all symbols from stock_quotes');
      }
    } else {
      console.log('GET request - processing all symbols from stock_quotes table');
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
                market_cap: transformed.market_cap,
                eps: transformed.eps,
                pe_ratio: transformed.pe_ratio,
                currency: transformed.currency
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
