/**
 * Supabase Edge Function: Cash Flow Data Fetcher
 * 
 * Purpose: Fetches quarterly cash flow statement data for companies from finance-query API
 * and stores it in the PostgreSQL cash_flow table with intelligent data management.
 * 
 * Features:
 * - Fetches quarterly cash flow data from https://finance-query.onrender.com/v1/financials/{symbol}?statement=cashflow&frequency=quarterly
 * - Maps API response fields to database columns (Operating, Investing, Financing cash flows)
 * - Handles all cash flow categories: Operating activities, Investing activities, Financing activities, and Summary metrics
 * - Smart quarter detection: Only fetches missing quarters to avoid redundant API calls
 * - Recent data prioritization: Prioritizes recent quarters and refreshes stale data (>7 days old)
 * - Batch processing with rate limiting for large-scale data updates
 * - Comprehensive error handling and logging for production reliability
 * - CORS support for cross-origin requests
 * 
 * Database: cash_flow table (cash_flow.sql)
 * API: finance-query.onrender.com API
 * 
 * Usage:
 * GET /cash-flow - Fetch for all symbols in stock_quotes table
 * POST /cash-flow - Fetch for specific symbols with options:
 *   - symbols: string[] - Specific symbols to fetch
 *   - forceRefresh: boolean - Force refresh all data
 *   - maxSymbols: number - Limit number of symbols to process
 *   - prioritizeRecent: boolean - Prioritize recent quarters (default: true)
 *   - fetchOnlyRecent: boolean - Only fetch recent missing quarters
 */

// Supabase imports
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'


// CORS headers for cross-origin requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };

// =====================================================
// TYPE DEFINITIONS
// =====================================================

/**
 * TypeScript interface matching the cash_flow database table structure
 * Maps exactly to all columns in the cash_flow.sql table
 */
interface QuarterlyCashFlowRecord {
  symbol: string;
  frequency: 'quarterly';
  fiscal_date: string;
  
  // Operating Cash Flow
  operating_cash_flow?: number | null;
  net_income_from_continuing_operations?: number | null;
  depreciation_and_amortization?: number | null;
  deferred_income_tax?: number | null;
  stock_based_compensation?: number | null;
  other_non_cash_items?: number | null;
  change_in_working_capital?: number | null;
  change_in_receivables?: number | null;
  change_in_inventory?: number | null;
  change_in_payables_and_accrued_expense?: number | null;
  change_in_other_current_assets?: number | null;
  change_in_other_current_liabilities?: number | null;
  change_in_other_working_capital?: number | null;
  
  // Investing Cash Flow
  investing_cash_flow?: number | null;
  net_investment_purchase_and_sale?: number | null;
  purchase_of_investment?: number | null;
  sale_of_investment?: number | null;
  net_ppe_purchase_and_sale?: number | null;
  purchase_of_ppe?: number | null;
  net_business_purchase_and_sale?: number | null;
  purchase_of_business?: number | null;
  net_other_investing_changes?: number | null;
  capital_expenditure?: number | null;
  
  // Financing Cash Flow
  financing_cash_flow?: number | null;
  net_issuance_payments_of_debt?: number | null;
  net_long_term_debt_issuance?: number | null;
  long_term_debt_issuance?: number | null;
  long_term_debt_payments?: number | null;
  net_short_term_debt_issuance?: number | null;
  short_term_debt_issuance?: number | null;
  short_term_debt_payments?: number | null;
  net_common_stock_issuance?: number | null;
  common_stock_issuance?: number | null;
  common_stock_payments?: number | null;
  cash_dividends_paid?: number | null;
  net_other_financing_charges?: number | null;
  issuance_of_capital_stock?: number | null;
  issuance_of_debt?: number | null;
  repayment_of_debt?: number | null;
  repurchase_of_capital_stock?: number | null;
  
  // Summary
  end_cash_position?: number | null;
  changes_in_cash?: number | null;
  beginning_cash_position?: number | null;
  free_cash_flow?: number | null;
  
  // Supplemental Data
  income_tax_paid_supplemental_data?: number | null;
  interest_paid_supplemental_data?: number | null;
  
  // Metadata
  data_provider: string;
}

/**
 * API response structure from finance-query.onrender.com
 */
interface CashFlowAPIResponse {
  symbol: string;
  statement_type: 'cashflow';
  frequency: 'quarterly';
  statement: {
    [key: string]: {
      Breakdown: string;
      [date: string]: string; // Fiscal dates as keys with string values
    };
  };
}

/**
 * Processing result for each symbol
 */
interface ProcessingResult {
  symbol: string;
  status: 'success' | 'exists' | 'no_data' | 'error';
  message?: string;
  records_processed?: number;
  quarters_fetched?: number;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse financial value strings to numbers
 * Handles: "123456789.0", "*", null, undefined, "0.0"
 */
function parseFinancialValue(value: string | null | undefined): number | null {
  if (!value || value === '*' || value === 'null' || value === 'undefined') {
    return null;
  }
  
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract fiscal dates from API response statement object
 * Returns dates in chronological order (oldest first)
 */
function extractFiscalDates(statement: any): string[] {
  if (!statement || typeof statement !== 'object') return [];
  
  const firstItem = Object.values(statement)[0] as any;
  if (!firstItem) return [];
  
  // Get all keys that look like dates (YYYY-MM-DD format)
  const dateKeys = Object.keys(firstItem)
    .filter(key => key !== 'Breakdown' && /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort(); // Sort chronologically
  
  return dateKeys;
}

/**
 * Map API breakdown field names to database column names
 * This handles the specific cash flow field mappings from the API
 */
function getColumnNameFromBreakdown(breakdown: string): string | null {
  // Create comprehensive mapping from API "Breakdown" field to database column
  const fieldMappings: { [key: string]: string } = {
    // Operating Cash Flow
    'Operating Cash Flow': 'operating_cash_flow',
    'Cash Flow from Continuing Operating Activities': 'operating_cash_flow',
    'Net Income from Continuing Operations': 'net_income_from_continuing_operations',
    'Depreciation Amortization Depletion': 'depreciation_and_amortization',
    'Depreciation & Amortization': 'depreciation_and_amortization',
    'Deferred Tax': 'deferred_income_tax',
    'Deferred Income Tax': 'deferred_income_tax',
    'Stock Based Compensation': 'stock_based_compensation',
    'Other Non-Cash Items': 'other_non_cash_items',
    'Change In Working Capital': 'change_in_working_capital',
    'Change in Receivables': 'change_in_receivables',
    'Changes in Account Receivables': 'change_in_receivables',
    'Change in Inventory': 'change_in_inventory',
    'Change in Payables And Accrued Expense': 'change_in_payables_and_accrued_expense',
    'Change in Payable': 'change_in_payables_and_accrued_expense',
    'Change in Account Payable': 'change_in_payables_and_accrued_expense',
    'Change in Other Current Assets': 'change_in_other_current_assets',
    'Change in Other Current Liabilities': 'change_in_other_current_liabilities',
    'Change in Other Working Capital': 'change_in_other_working_capital',
    
    // Investing Cash Flow
    'Investing Cash Flow': 'investing_cash_flow',
    'Cash Flow from Continuing Investing Activities': 'investing_cash_flow',
    'Net Investment Purchase And Sale': 'net_investment_purchase_and_sale',
    'Purchase of Investment': 'purchase_of_investment',
    'Sale of Investment': 'sale_of_investment',
    'Net PPE Purchase And Sale': 'net_ppe_purchase_and_sale',
    'Purchase of PPE': 'purchase_of_ppe',
    'Net Business Purchase And Sale': 'net_business_purchase_and_sale',
    'Purchase of Business': 'purchase_of_business',
    'Net Other Investing Changes': 'net_other_investing_changes',
    'Capital Expenditure (CapEx)': 'capital_expenditure',
    
    // Financing Cash Flow
    'Financing Cash Flow': 'financing_cash_flow',
    'Cash Flow from Continuing Financing Activities': 'financing_cash_flow',
    'Net Issuance Payments of Debt': 'net_issuance_payments_of_debt',
    'Net Long Term Debt Issuance': 'net_long_term_debt_issuance',
    'Long Term Debt Issuance': 'long_term_debt_issuance',
    'Long Term Debt Payments': 'long_term_debt_payments',
    'Net Short Term Debt Issuance': 'net_short_term_debt_issuance',
    'Short Term Debt Issuance': 'short_term_debt_issuance',
    'Short Term Debt Payments': 'short_term_debt_payments',
    'Net Common Stock Issuance': 'net_common_stock_issuance',
    'Common Stock Payments': 'common_stock_payments',
    'Cash Dividends Paid': 'cash_dividends_paid',
    'Common Stock Dividend Paid': 'cash_dividends_paid',
    'Net Other Financing Charges': 'net_other_financing_charges',
    'Issuance of Debt': 'issuance_of_debt',
    'Repayment of Debt': 'repayment_of_debt',
    'Repurchase of Capital Stock': 'repurchase_of_capital_stock',
    
    // Summary
    'End Cash Position': 'end_cash_position',
    'Changes in Cash': 'changes_in_cash',
    'Beginning Cash Position': 'beginning_cash_position',
    'Free Cash Flow': 'free_cash_flow',
    
    // Supplemental Data
    'Income Tax Paid Supplemental Data': 'income_tax_paid_supplemental_data',
    'Interest Paid Supplemental Data': 'interest_paid_supplemental_data'
  };
  
  return fieldMappings[breakdown] || null;
}

/**
 * Generate list of quarters for the past N years, prioritizing recent quarters
 */
function generateHistoricalQuarters(years: number = 6): Array<{ quarter: string; year: number; fiscalDate: string }> {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const currentYear = new Date().getFullYear();
  const result = [];
  
  for (let year = currentYear; year >= currentYear - years + 1; year--) {
    for (const quarter of quarters) {
      const fiscalDate = getQuarterEndDate(quarter, year);
      result.push({ quarter, year, fiscalDate });
    }
  }
  
  return result; // Return in reverse chronological order (newest first for priority fetching)
}

/**
 * Get recent quarters that should be checked for updates (last 5 years)
 */
function getRecentQuarters(): Array<{ quarter: string; year: number; fiscalDate: string }> {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const currentYear = new Date().getFullYear();
  const result = [];
  
  // Get last 5 years of quarters
  for (let year = currentYear; year >= currentYear - 4; year--) {
    for (const quarter of quarters) {
      const fiscalDate = getQuarterEndDate(quarter, year);
      result.push({ quarter, year, fiscalDate });
    }
  }
  
  return result; // Recent quarters in reverse chronological order
}

/**
 * Get approximate fiscal quarter end date
 */
function getQuarterEndDate(quarter: string, year: number): string {
  const quarterEndMap: { [key: string]: string } = {
    'Q1': `${year}-03-31`,
    'Q2': `${year}-06-30`, 
    'Q3': `${year}-09-30`,
    'Q4': `${year}-12-31`
  };
  
  return quarterEndMap[quarter] || `${year}-12-31`;
}

/**
 * Filter API records to match expected quarters, with flexible date matching for latest reports
 */
function filterRecordsForExpectedQuarters(
  records: QuarterlyCashFlowRecord[],
  expectedQuarters: Array<{ quarter: string; year: number; fiscalDate: string }>,
  isRecentData: boolean = false
): QuarterlyCashFlowRecord[] {
  if (expectedQuarters.length === 0) return records;
  
  const expectedDates = new Set(expectedQuarters.map(q => q.fiscalDate));
  
  return records.filter(record => {
    // Direct match
    if (expectedDates.has(record.fiscal_date)) {
      return true;
    }
    
    // For recent data, be more flexible with date matching
    if (isRecentData) {
      return Array.from(expectedDates).some(date => {
        const recordDate = new Date(record.fiscal_date);
        const expectedDate = new Date(date);
        const diffDays = Math.abs(recordDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 30; // Allow 30 days difference for recent data
      });
    }
    
    // For historical data, be less flexible
    return Array.from(expectedDates).some(date => {
      const recordDate = new Date(record.fiscal_date);
      const expectedDate = new Date(date);
      const diffDays = Math.abs(recordDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7; // Allow 7 days difference for historical data
    });
  });
}

/**
 * Check which quarterly fiscal dates already exist in database
 */
async function getExistingQuarterlyDates(
  supabase: SupabaseClient,
  symbol: string
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('cash_flow')
      .select('fiscal_date')
      .eq('symbol', symbol)
      .eq('frequency', 'quarterly')
      .eq('data_provider', 'finance-query-api');
    
    if (error) {
      console.error(`Error fetching existing quarterly dates for ${symbol}:`, error);
      return new Set();
    }
    
    return new Set(data?.map((row: { fiscal_date: string }) => row.fiscal_date) || []);
  } catch (error) {
    console.error(`Error in getExistingQuarterlyDates for ${symbol}:`, error);
    return new Set();
  }
}

/**
 * Get missing quarters that need to be fetched, prioritizing recent quarters
 */
async function getMissingQuarters(
  supabase: SupabaseClient,
  symbol: string,
  prioritizeRecent: boolean = true
): Promise<Array<{ quarter: string; year: number; fiscalDate: string }>> {
  const historicalQuarters = generateHistoricalQuarters(6);
  const existingDates = await getExistingQuarterlyDates(supabase, symbol);
  
  let missingQuarters = historicalQuarters.filter(q => !existingDates.has(q.fiscalDate));
  
  // If prioritizing recent, check if we need to refresh recent quarters
  if (prioritizeRecent) {
    const recentQuarters = getRecentQuarters();
    const missingRecentQuarters = recentQuarters.filter(q => !existingDates.has(q.fiscalDate));
    
    // If we have recent missing quarters, prioritize them
    if (missingRecentQuarters.length > 0) {
      console.log(`${symbol}: Prioritizing ${missingRecentQuarters.length} recent quarters`);
      return missingRecentQuarters;
    }
    
    // If no recent quarters are missing, check if we should refresh the most recent existing ones
    // This handles cases where companies report updated/restated data
    const mostRecentExisting = Array.from(existingDates)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .slice(0, 4); // Check last 4 quarters
      
    if (mostRecentExisting.length > 0) {
      const shouldRefreshRecent = await shouldRefreshRecentData(supabase, symbol, mostRecentExisting[0]);
      if (shouldRefreshRecent) {
        // Add the most recent quarters for refresh
        const quartersToRefresh = recentQuarters.filter(q => 
          mostRecentExisting.includes(q.fiscalDate)
        ).slice(0, 2); // Refresh last 2 quarters
        
        console.log(`${symbol}: Adding ${quartersToRefresh.length} recent quarters for refresh`);
        missingQuarters = [...quartersToRefresh, ...missingQuarters];
      }
    }
  }
  
  console.log(`${symbol}: ${existingDates.size} quarters exist, ${missingQuarters.length} to fetch out of ${historicalQuarters.length} total`);
  
  return missingQuarters;
}

/**
 * Check if recent data should be refreshed (older than 7 days)
 */
async function shouldRefreshRecentData(
  supabase: SupabaseClient,
  symbol: string,
  mostRecentFiscalDate: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('cash_flow')
      .select('created_at')
      .eq('symbol', symbol)
      .eq('frequency', 'quarterly')
      .eq('fiscal_date', mostRecentFiscalDate)
      .eq('data_provider', 'finance-query-api')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) {
      return true; // Refresh if we can't determine when it was last updated
    }
    
    const lastUpdated = new Date(data[0].created_at);
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    
    // Refresh if data is older than 7 days
    const shouldRefresh = daysSinceUpdate > 7;
    
    if (shouldRefresh) {
      console.log(`${symbol}: Recent data is ${Math.floor(daysSinceUpdate)} days old, refreshing`);
    }
    
    return shouldRefresh;
  } catch (error) {
    console.error(`Error checking refresh need for ${symbol}:`, error);
    return false;
  }
}

/**
 * Fetch quarterly cash flow from finance-query API
 */
async function fetchQuarterlyCashFlow(
  symbol: string
): Promise<QuarterlyCashFlowRecord[] | null> {
  try {
    const url = `https://finance-query.onrender.com/v1/financials/${symbol}?statement=cashflow&frequency=quarterly`;
    console.log(`Fetching quarterly cash flow for ${symbol} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-QuarterlyFetcher/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No quarterly cash flow found for ${symbol}`);
        return null;
      }
      console.error(`API error for ${symbol}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: CashFlowAPIResponse = await response.json();
    
    // Validate required fields
    if (!data || !data.statement || typeof data.statement !== 'object') {
      console.log(`Invalid quarterly cash flow data for ${symbol}`);
      return null;
    }
    
    // Extract fiscal dates from the first item
    const fiscalDates = extractFiscalDates(data.statement);
    if (fiscalDates.length === 0) {
      console.log(`No fiscal dates found for ${symbol} quarterly data`);
      return null;
    }
    
    console.log(`Processing ${symbol} quarterly data with ${fiscalDates.length} fiscal periods`);
    
    // Transform API data to wide-format database records (one record per fiscal date)
    const records: QuarterlyCashFlowRecord[] = [];
    
    for (const fiscalDate of fiscalDates) {
      const record: QuarterlyCashFlowRecord = {
        symbol: symbol.toUpperCase(),
        frequency: 'quarterly',
        fiscal_date: fiscalDate,
        data_provider: 'finance-query-api'
      };
      
      // Process each breakdown item and map to appropriate column
      for (const [itemKey, item] of Object.entries(data.statement)) {
        const breakdown = item.Breakdown;
        if (!breakdown) continue;
        
        const columnName = getColumnNameFromBreakdown(breakdown);
        if (!columnName) {
          // Uncomment for debugging unmapped fields
          // console.log(`Unmapped breakdown: "${breakdown}" - skipping`);
          continue;
        }
        
        const valueStr = item[fiscalDate];
        const value = parseFinancialValue(valueStr);
        
        // Dynamically assign value to the appropriate column
        (record as any)[columnName] = value;
      }
      
      records.push(record);
    }
    
    console.log(`Transformed ${records.length} quarterly records for ${symbol}`);
    return records;
    
  } catch (error) {
    console.error(`Error fetching quarterly cash flow for ${symbol}:`, error);
    return null;
  }
}

/**
 * Save quarterly cash flow data to Supabase (with upsert for conflict resolution)
 */
async function saveQuarterlyCashFlowData(
  supabase: SupabaseClient,
  records: QuarterlyCashFlowRecord[]
): Promise<{ success: boolean; message: string; savedCount: number }> {
  if (records.length === 0) {
    return { success: true, message: 'No records to save', savedCount: 0 };
  }
  
  try {
    console.log(`Saving ${records.length} cash flow records to database`);
    
    const { data, error } = await supabase
      .from('cash_flow')
      .upsert(records, {
        onConflict: 'symbol,frequency,fiscal_date,data_provider',
        ignoreDuplicates: false
      })
      .select('id');
    
    if (error) {
      console.error('Database error saving cash flow data:', error);
      return { 
        success: false, 
        message: `Database error: ${error.message}`, 
        savedCount: 0 
      };
    }
    
    const savedCount = data ? data.length : records.length;
    console.log(`Successfully saved ${savedCount} cash flow records`);
    
    return { 
      success: true, 
      message: `Saved ${savedCount} records`, 
      savedCount 
    };
    
  } catch (error) {
    console.error('Error saving cash flow data:', error);
    return { 
      success: false, 
      message: `Save error: ${error}`, 
      savedCount: 0 
    };
  }
}

/**
 * Get active symbols from stock_quotes table
 */
async function getActiveSymbolsFromStockQuotes(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching symbols from stock_quotes:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log('No symbols found in stock_quotes table');
      return [];
    }
    
    // Get unique symbols and filter out any invalid ones
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))]
      .filter(symbol => symbol && symbol.length > 0 && symbol.length <= 10) // Basic symbol validation
      .map(symbol => symbol.toUpperCase());
      
    console.log(`Found ${uniqueSymbols.length} symbols in stock_quotes table for cash flow processing`);
    
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getActiveSymbolsFromStockQuotes:', error);
    return [];
  }
}

/**
 * Validate quarterly cash flow records before processing
 */
function validateQuarterlyCashFlowRecords(records: QuarterlyCashFlowRecord[]): {
  valid: QuarterlyCashFlowRecord[];
  invalid: { record: Partial<QuarterlyCashFlowRecord>; reason: string }[];
} {
  const valid: QuarterlyCashFlowRecord[] = [];
  const invalid: { record: Partial<QuarterlyCashFlowRecord>; reason: string }[] = [];
  
  for (const record of records) {
    // Check required fields
    if (!record.symbol || record.symbol.trim().length === 0) {
      invalid.push({ record, reason: 'Missing or empty symbol' });
      continue;
    }
    
    if (!record.fiscal_date || !/^\d{4}-\d{2}-\d{2}$/.test(record.fiscal_date)) {
      invalid.push({ record, reason: 'Invalid fiscal_date format (expected YYYY-MM-DD)' });
      continue;
    }
    
    if (record.frequency !== 'quarterly') {
      invalid.push({ record, reason: 'Invalid frequency (expected "quarterly")' });
      continue;
    }
    
    if (!record.data_provider || record.data_provider.trim().length === 0) {
      invalid.push({ record, reason: 'Missing data_provider' });
      continue;
    }
    
    // Validate fiscal date is not in the future
    const fiscalDate = new Date(record.fiscal_date);
    const today = new Date();
    const oneYearFromNow = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    if (fiscalDate > oneYearFromNow) {
      invalid.push({ record, reason: 'Fiscal date is too far in the future' });
      continue;
    }
    
    // Validate that at least one financial field has a value
    const hasFinancialData = [
      'operating_cash_flow', 'investing_cash_flow', 'financing_cash_flow',
      'free_cash_flow', 'end_cash_position', 'changes_in_cash'
    ].some(field => {
      const value = (record as any)[field];
      return value !== null && value !== undefined && !isNaN(Number(value));
    });
    
    if (!hasFinancialData) {
      invalid.push({ record, reason: 'No valid financial data found' });
      continue;
    }
    
    valid.push(record);
  }
  
  return { valid, invalid };
}

/**
 * Process quarterly cash flow for a single symbol
 */
async function processQuarterlyCashFlow(
  supabase: SupabaseClient,
  symbol: string,
  options: {
    forceRefresh?: boolean;
    prioritizeRecent?: boolean;
    maxQuarters?: number;
    fetchOnlyRecent?: boolean;
  } = {}
): Promise<ProcessingResult> {
  try {
    console.log(`\n=== Processing quarterly cash flow for ${symbol} ===`);
    
    // Determine quarters to fetch
    let quartersToFetch: Array<{ quarter: string; year: number; fiscalDate: string }>;
    
    if (options.forceRefresh) {
      // Force refresh: get recent quarters regardless of existence
      quartersToFetch = getRecentQuarters().slice(0, options.maxQuarters || 8);
      console.log(`${symbol}: Force refresh mode, fetching ${quartersToFetch.length} recent quarters`);
    } else if (options.fetchOnlyRecent) {
      // Only fetch recent missing quarters
      const recentQuarters = getRecentQuarters();
      const existingDates = await getExistingQuarterlyDates(supabase, symbol);
      quartersToFetch = recentQuarters
        .filter(q => !existingDates.has(q.fiscalDate))
        .slice(0, options.maxQuarters || 4);
      console.log(`${symbol}: Recent-only mode, ${quartersToFetch.length} quarters needed`);
    } else {
      // Normal mode: get missing quarters with priority logic
      quartersToFetch = await getMissingQuarters(supabase, symbol, options.prioritizeRecent);
      if (options.maxQuarters && quartersToFetch.length > options.maxQuarters) {
        quartersToFetch = quartersToFetch.slice(0, options.maxQuarters);
        console.log(`${symbol}: Limited to ${options.maxQuarters} quarters`);
      }
    }
    
    if (quartersToFetch.length === 0) {
      console.log(`${symbol}: No quarters to fetch`);
      return {
        symbol,
        status: 'exists',
        message: 'All quarterly data already exists',
        records_processed: 0,
        quarters_fetched: 0
      };
    }
    
    // Fetch data from API
    const apiRecords = await fetchQuarterlyCashFlow(symbol);
    
    if (!apiRecords || apiRecords.length === 0) {
      console.log(`${symbol}: No quarterly cash flow data available from API`);
      return {
        symbol,
        status: 'no_data',
        message: 'No quarterly cash flow data available from API',
        records_processed: 0,
        quarters_fetched: 0
      };
    }
    
    // Filter records to only include the quarters we want
    const isRecentFetch = options.forceRefresh || options.fetchOnlyRecent || 
                         (options.prioritizeRecent && quartersToFetch.some(q => {
                           const date = new Date(q.fiscalDate);
                           const cutoff = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
                           return date > cutoff;
                         }));
    
    const filteredRecords = filterRecordsForExpectedQuarters(apiRecords, quartersToFetch, isRecentFetch);
    
    if (filteredRecords.length === 0) {
      console.log(`${symbol}: No matching records found for expected quarters`);
      return {
        symbol,
        status: 'no_data',
        message: 'No matching quarterly data found for expected periods',
        records_processed: 0,
        quarters_fetched: 0
      };
    }
    
    // Validate records
    const { valid: validRecords, invalid: invalidRecords } = validateQuarterlyCashFlowRecords(filteredRecords);
    
    if (invalidRecords.length > 0) {
      console.log(`${symbol}: ${invalidRecords.length} invalid records filtered out:`, 
                 invalidRecords.map(r => r.reason));
    }
    
    if (validRecords.length === 0) {
      console.log(`${symbol}: No valid records after validation`);
      return {
        symbol,
        status: 'error',
        message: 'No valid quarterly records after validation',
        records_processed: 0,
        quarters_fetched: 0
      };
    }
    
    // Save to database
    const saveResult = await saveQuarterlyCashFlowData(supabase, validRecords);
    
    if (!saveResult.success) {
      console.error(`${symbol}: Failed to save quarterly data:`, saveResult.message);
      return {
        symbol,
        status: 'error',
        message: `Save failed: ${saveResult.message}`,
        records_processed: 0,
        quarters_fetched: 0
      };
    }
    
    console.log(`${symbol}: Successfully processed ${validRecords.length} quarterly records`);
    
    return {
      symbol,
      status: 'success',
      message: `Processed ${validRecords.length} quarterly records`,
      records_processed: saveResult.savedCount,
      quarters_fetched: quartersToFetch.length
    };
    
  } catch (error) {
    console.error(`Error processing quarterly cash flow for ${symbol}:`, error);
    return {
      symbol,
      status: 'error',
      message: `Processing error: ${error}`,
      records_processed: 0,
      quarters_fetched: 0
    };
  }
}

// =====================================================
// MAIN EDGE FUNCTION HANDLER
// =====================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Initialize Supabase client
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const startTime = Date.now();
    console.log('\n=== Cash Flow Edge Function Started ===');
    console.log(`Request method: ${req.method}`);
    console.log(`Request URL: ${req.url}`);

    // Parse request parameters
    let requestBody: any = {};
    let symbols: string[] = [];
    let maxSymbols: number = 10; // Default limit for batch processing
    let forceRefresh: boolean = false;
    let prioritizeRecent: boolean = true; // Default to prioritizing recent quarters
    let maxQuarters: number | undefined = undefined;
    let fetchOnlyRecent: boolean = false;

    // Parse request body for POST requests
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
        symbols = requestBody.symbols || [];
        maxSymbols = requestBody.maxSymbols || maxSymbols;
        forceRefresh = requestBody.forceRefresh || false;
        prioritizeRecent = requestBody.prioritizeRecent !== undefined ? requestBody.prioritizeRecent : true;
        maxQuarters = requestBody.maxQuarters;
        fetchOnlyRecent = requestBody.fetchOnlyRecent || false;
      } catch (error) {
        console.error('Error parsing request body:', error);
        return new Response(
          JSON.stringify({
            error: 'Invalid JSON in request body',
            message: error instanceof Error ? error.message : 'Unknown error'
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Handle query parameters for GET requests
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const symbolsParam = url.searchParams.get('symbols');
      if (symbolsParam) {
        symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
      }
      maxSymbols = parseInt(url.searchParams.get('maxSymbols') || String(maxSymbols), 10);
      forceRefresh = url.searchParams.get('forceRefresh') === 'true';
      prioritizeRecent = url.searchParams.get('prioritizeRecent') !== 'false'; // Default true
      fetchOnlyRecent = url.searchParams.get('fetchOnlyRecent') === 'true';
      
      const maxQuartersParam = url.searchParams.get('maxQuarters');
      if (maxQuartersParam) {
        maxQuarters = parseInt(maxQuartersParam, 10);
      }
    }

    // Get symbols to process
    if (symbols.length === 0) {
      console.log('No specific symbols provided, fetching from stock_quotes...');
      symbols = await getActiveSymbolsFromStockQuotes(supabaseClient);
    }

    // Limit symbols for batch processing
    if (symbols.length > maxSymbols) {
      console.log(`Limiting symbols from ${symbols.length} to ${maxSymbols} for this batch`);
      symbols = symbols.slice(0, maxSymbols);
    }

    if (symbols.length === 0) {
      console.log('No symbols to process');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No symbols to process',
          results: [],
          summary: {
            total: 0,
            successful: 0,
            exists: 0,
            no_data: 0,
            errors: 0,
            processing_time_seconds: 0
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Processing ${symbols.length} symbols:`, symbols.join(', '));
    console.log(`Options: forceRefresh=${forceRefresh}, prioritizeRecent=${prioritizeRecent}, fetchOnlyRecent=${fetchOnlyRecent}, maxQuarters=${maxQuarters}`);

    // Process all symbols (with batch processing for rate limiting)
    const results: ProcessingResult[] = [];
    const batchSize = 3; // Process 3 symbols concurrently to avoid overwhelming the API
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      console.log(`\n--- Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}: ${batch.join(', ')} ---`);
      
      const batchPromises = batch.map(symbol => 
        processQuarterlyCashFlow(supabaseClient, symbol, {
          forceRefresh,
          prioritizeRecent,
          maxQuarters,
          fetchOnlyRecent
        })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results from batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const symbol = batch[j];
          console.error(`Batch processing failed for ${symbol}:`, result.reason);
          results.push({
            symbol,
            status: 'error',
            message: `Batch processing failed: ${result.reason}`,
            records_processed: 0,
            quarters_fetched: 0
          });
        }
      }
      
      // Rate limiting between batches
      if (i + batchSize < symbols.length) {
        console.log('Waiting 2 seconds between batches for rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Calculate summary statistics
    const summary = {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      exists: results.filter(r => r.status === 'exists').length,
      no_data: results.filter(r => r.status === 'no_data').length,
      errors: results.filter(r => r.status === 'error').length,
      total_records_processed: results.reduce((sum, r) => sum + (r.records_processed || 0), 0),
      total_quarters_fetched: results.reduce((sum, r) => sum + (r.quarters_fetched || 0), 0),
      processing_time_seconds: Math.round((Date.now() - startTime) / 1000)
    };

    console.log('\n=== Cash Flow Processing Complete ===');
    console.log(`Summary: ${summary.successful} successful, ${summary.exists} exists, ${summary.no_data} no_data, ${summary.errors} errors`);
    console.log(`Total records processed: ${summary.total_records_processed}`);
    console.log(`Total quarters fetched: ${summary.total_quarters_fetched}`);
    console.log(`Processing time: ${summary.processing_time_seconds} seconds`);

    // Return response
    const response = {
      success: true,
      message: `Processed ${results.length} symbols`,
      results,
      summary,
      processing_options: {
        forceRefresh,
        prioritizeRecent,
        fetchOnlyRecent,
        maxQuarters,
        maxSymbols
      }
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Edge function error:', error);
    
    const errorResponse = {
      success: false,
      error: 'Edge function execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
