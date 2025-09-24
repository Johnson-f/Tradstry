/**
 * Supabase Edge Function: Quarterly Balance Sheet Data Fetcher
 * 
 * This Edge Function fetches quarterly balance sheet data from 
 * finance-query.onrender.com API for all stocks in the stock_quotes table.
 * It processes and saves quarterly data in wide format to prevent duplicates.
 * 
 * API Endpoint: https://finance-query.onrender.com/v1/financials/{symbol}?statement=balance&frequency=quarter
 * 
 * Features:
 * - Fetches ONLY quarterly balance sheets for symbols from stock_quotes table
 * - Comprehensive quarterly data fetching (past 6 years = 24 quarters)
 * - Prevents duplicate quarter fetching with intelligent existence checks
 * - Validates and processes financial data in wide format
 * - Handles API rate limiting and errors gracefully
 * - Smart logic: only fetches missing quarters to avoid redundant API calls
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for balance sheet data
interface FinancialDataPoint {
  Breakdown: string;
  [fiscalDate: string]: string; // Dynamic fiscal date keys like "2024-09-30"
}

interface BalanceSheetAPIResponse {
  symbol: string;
  statement_type: string;
  frequency: string;
  statement: {
    [key: string]: FinancialDataPoint;
  };
}

// Database record matching the wide table schema (quarterly only)
interface QuarterlyBalanceSheetRecord {
  symbol: string;
  frequency: 'quarterly'; // Always quarterly
  fiscal_date: string;
  
  // Assets
  total_assets?: number | null;
  total_current_assets?: number | null;
  cash_cash_equivalents_and_short_term_investments?: number | null;
  cash_and_cash_equivalents?: number | null;
  cash?: number | null;
  cash_equivalents?: number | null;
  other_short_term_investments?: number | null;
  receivables?: number | null;
  accounts_receivable?: number | null;
  other_receivables?: number | null;
  inventory?: number | null;
  other_current_assets?: number | null;
  total_non_current_assets?: number | null;
  net_ppe?: number | null;
  gross_ppe?: number | null;
  properties?: number | null;
  land_and_improvements?: number | null;
  machinery_furniture_equipment?: number | null;
  other_properties?: number | null;
  leases?: number | null;
  accumulated_depreciation?: number | null;
  investments_and_advances?: number | null;
  investment_in_financial_assets?: number | null;
  available_for_sale_securities?: number | null;
  other_investments?: number | null;
  non_current_deferred_assets?: number | null;
  non_current_deferred_taxes_assets?: number | null;
  other_non_current_assets?: number | null;
  net_tangible_assets?: number | null;
  tangible_book_value?: number | null;
  
  // Liabilities
  total_liabilities?: number | null;
  total_current_liabilities?: number | null;
  payables_and_accrued_expenses?: number | null;
  payables?: number | null;
  accounts_payable?: number | null;
  total_tax_payable?: number | null;
  income_tax_payable?: number | null;
  current_debt_and_capital_lease_obligation?: number | null;
  current_debt?: number | null;
  commercial_paper?: number | null;
  other_current_borrowings?: number | null;
  current_capital_lease_obligation?: number | null;
  current_deferred_liabilities?: number | null;
  current_deferred_revenue?: number | null;
  other_current_liabilities?: number | null;
  total_non_current_liabilities?: number | null;
  long_term_debt_and_capital_lease_obligation?: number | null;
  long_term_debt?: number | null;
  long_term_capital_lease_obligation?: number | null;
  trade_and_other_payables_non_current?: number | null;
  other_non_current_liabilities?: number | null;
  capital_lease_obligations?: number | null;
  total_debt?: number | null;
  net_debt?: number | null;
  
  // Equity
  total_equity?: number | null;
  stockholders_equity?: number | null;
  capital_stock?: number | null;
  common_stock?: number | null;
  retained_earnings?: number | null;
  gains_losses_not_affecting_retained_earnings?: number | null;
  other_equity_adjustments?: number | null;
  common_stock_equity?: number | null;
  shares_issued?: number | null;
  ordinary_shares_number?: number | null;
  treasury_shares_number?: number | null;
  
  // Other
  working_capital?: number | null;
  invested_capital?: number | null;
  total_capitalization?: number | null;
  
  // Metadata
  data_provider: string;
}

interface ProcessingResult {
  symbol: string;
  status: 'success' | 'error' | 'exists' | 'no_data';
  message?: string;
  records_processed?: number;
  quarters_fetched?: number;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse financial value from string, handling special cases
 */
function parseFinancialValue(value: string): number | null {
  if (!value || value === '*' || value === 'N/A' || value === '') {
    return null;
  }
  
  const numericValue = parseFloat(value);
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Map API breakdown names to database column names for balance sheet
 */
function getColumnNameFromBreakdown(breakdown: string): string | null {
  const mapping: { [key: string]: string } = {
    // Assets
    'Total Assets': 'total_assets',
    'Total Current Assets': 'total_current_assets',
    'Cash, Cash Equivalents & Short Term Investments': 'cash_cash_equivalents_and_short_term_investments',
    'Cash And Cash Equivalents': 'cash_and_cash_equivalents',
    'Cash': 'cash',
    'Cash Equivalents': 'cash_equivalents',
    'Other Short Term Investments': 'other_short_term_investments',
    'Receivables': 'receivables',
    'Accounts Receivable': 'accounts_receivable',
    'Other Receivables': 'other_receivables',
    'Inventory': 'inventory',
    'Other Current Assets': 'other_current_assets',
    'Total Non Current Assets': 'total_non_current_assets',
    'Net PPE': 'net_ppe',
    'Gross PPE': 'gross_ppe',
    'Properties': 'properties',
    'Land And Improvements': 'land_and_improvements',
    'Machinery Furniture Equipment': 'machinery_furniture_equipment',
    'Other Properties': 'other_properties',
    'Leases': 'leases',
    'Accumulated Depreciation': 'accumulated_depreciation',
    'Investments And Advances': 'investments_and_advances',
    'Investment In Financial Assets': 'investment_in_financial_assets',
    'Available For Sale Securities': 'available_for_sale_securities',
    'Other Investments': 'other_investments',
    'Non Current Deferred Assets': 'non_current_deferred_assets',
    'Non Current Deferred Taxes Assets': 'non_current_deferred_taxes_assets',
    'Other Non Current Assets': 'other_non_current_assets',
    'Net Tangible Assets': 'net_tangible_assets',
    'Tangible Book Value': 'tangible_book_value',
    
    // Liabilities
    'Total Liabilities': 'total_liabilities',
    'Total Current Liabilities': 'total_current_liabilities',
    'Payables And Accrued Expenses': 'payables_and_accrued_expenses',
    'Payables': 'payables',
    'Accounts Payable': 'accounts_payable',
    'Total Tax Payable': 'total_tax_payable',
    'Income Tax Payable': 'income_tax_payable',
    'Current Debt And Capital Lease Obligation': 'current_debt_and_capital_lease_obligation',
    'Current Debt': 'current_debt',
    'Commercial Paper': 'commercial_paper',
    'Other Current Borrowings': 'other_current_borrowings',
    'Current Capital Lease Obligation': 'current_capital_lease_obligation',
    'Current Deferred Liabilities': 'current_deferred_liabilities',
    'Current Deferred Revenue': 'current_deferred_revenue',
    'Other Current Liabilities': 'other_current_liabilities',
    'Total Non Current Liabilities': 'total_non_current_liabilities',
    'Long Term Debt And Capital Lease Obligation': 'long_term_debt_and_capital_lease_obligation',
    'Long Term Debt': 'long_term_debt',
    'Long Term Capital Lease Obligation': 'long_term_capital_lease_obligation',
    'Trade And Other Payables Non Current': 'trade_and_other_payables_non_current',
    'Other Non Current Liabilities': 'other_non_current_liabilities',
    'Capital Lease Obligations': 'capital_lease_obligations',
    'Total Debt': 'total_debt',
    'Net Debt': 'net_debt',
    
    // Equity
    'Total Equity': 'total_equity',
    'Stockholders Equity': 'stockholders_equity',
    'Capital Stock': 'capital_stock',
    'Common Stock': 'common_stock',
    'Retained Earnings': 'retained_earnings',
    'Gains Losses Not Affecting Retained Earnings': 'gains_losses_not_affecting_retained_earnings',
    'Other Equity Adjustments': 'other_equity_adjustments',
    'Common Stock Equity': 'common_stock_equity',
    'Shares Issued': 'shares_issued',
    'Ordinary Shares Number': 'ordinary_shares_number',
    'Treasury Shares Number': 'treasury_shares_number',
    
    // Other
    'Working Capital': 'working_capital',
    'Invested Capital': 'invested_capital',
    'Total Capitalization': 'total_capitalization'
  };
  
  return mapping[breakdown] || null;
}

/**
 * Extract fiscal dates from the API response
 */
function extractFiscalDates(statement: { [key: string]: FinancialDataPoint }): string[] {
  const firstItem = Object.values(statement)[0];
  if (!firstItem) return [];
  
  // Get all keys except 'Breakdown'
  return Object.keys(firstItem).filter(key => key !== 'Breakdown').sort().reverse();
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
  records: QuarterlyBalanceSheetRecord[],
  expectedQuarters: Array<{ quarter: string; year: number; fiscalDate: string }>,
  isRecentData: boolean = false
): QuarterlyBalanceSheetRecord[] {
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
      .from('balance_sheet')
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
      .from('balance_sheet')
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
 * Fetch quarterly balance sheet from finance-query API
 */
async function fetchQuarterlyBalanceSheet(
  symbol: string
): Promise<QuarterlyBalanceSheetRecord[] | null> {
  try {
    const url = `https://finance-query.onrender.com/v1/financials/${symbol}?statement=balance&frequency=quarterly`;
    console.log(`Fetching quarterly balance sheet for ${symbol} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-QuarterlyFetcher/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No quarterly balance sheet found for ${symbol}`);
        return null;
      }
      console.error(`API error for ${symbol}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: BalanceSheetAPIResponse = await response.json();
    
    // Validate required fields
    if (!data || !data.statement || typeof data.statement !== 'object') {
      console.log(`Invalid quarterly balance sheet data for ${symbol}`);
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
    const records: QuarterlyBalanceSheetRecord[] = [];
    
    for (const fiscalDate of fiscalDates) {
      const record: QuarterlyBalanceSheetRecord = {
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
    console.error(`Error fetching quarterly balance sheet for ${symbol}:`, error);
    return null;
  }
}

/**
 * Save quarterly balance sheet records to database
 */
async function saveQuarterlyBalanceSheetData(
  supabase: SupabaseClient,
  records: QuarterlyBalanceSheetRecord[]
): Promise<{ success: boolean; savedCount: number }> {
  if (records.length === 0) return { success: true, savedCount: 0 };
  
  try {
    // Insert records in smaller batches since each record has many columns
    const batchSize = 8;
    let successfulInserts = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('balance_sheet')
        .upsert(batch, {
          onConflict: 'symbol,frequency,fiscal_date,data_provider',
          ignoreDuplicates: false
        })
        .select('id');
      
      if (error) {
        console.error(`Error saving quarterly balance sheet batch for ${records[0].symbol}:`, error);
        console.error(`Batch size: ${batch.length}, First record fiscal_date: ${batch[0]?.fiscal_date}`);
        continue;
      }
      
      if (data) {
        successfulInserts += data.length;
        console.log(`Successfully saved batch of ${data.length} quarterly records for ${records[0].symbol}`);
      }
    }
    
    console.log(`Successfully saved ${successfulInserts} out of ${records.length} quarterly records for ${records[0].symbol}`);
    return { success: successfulInserts > 0, savedCount: successfulInserts };
  } catch (error) {
    console.error(`Error in saveQuarterlyBalanceSheetData:`, error);
    return { success: false, savedCount: 0 };
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
    const symbols = data.map((row: { symbol: string }) => row.symbol);
    const uniqueSymbols = [...new Set(symbols)]
      .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 10) // Basic symbol validation
      .map(symbol => symbol.toUpperCase());
      
    console.log(`Found ${uniqueSymbols.length} active symbols in stock_quotes table`);
    
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getActiveSymbolsFromStockQuotes:', error);
    return [];
  }
}

/**
 * Validate quarterly balance sheet records
 */
function validateQuarterlyRecords(records: QuarterlyBalanceSheetRecord[]): { isValid: boolean; error?: string } {
  if (!Array.isArray(records) || records.length === 0) {
    return { isValid: false, error: 'No quarterly records to validate' };
  }
  
  for (const record of records) {
    if (!record.symbol || record.frequency !== 'quarterly' || !record.fiscal_date || !record.data_provider) {
      return { isValid: false, error: 'Missing required fields in quarterly record' };
    }
    
    // Validate fiscal_date format (should be YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(record.fiscal_date)) {
      return { isValid: false, error: `Invalid fiscal_date format: ${record.fiscal_date}` };
    }
    
    // Check if record has at least some financial data
    const hasFinancialData = Object.keys(record).some(key => 
      key !== 'symbol' && 
      key !== 'frequency' && 
      key !== 'fiscal_date' && 
      key !== 'data_provider' && 
      record[key as keyof QuarterlyBalanceSheetRecord] !== null &&
      record[key as keyof QuarterlyBalanceSheetRecord] !== undefined
    );
    
    if (!hasFinancialData) {
      return { isValid: false, error: 'Quarterly record contains no financial data' };
    }
  }
  
  return { isValid: true };
}

/**
 * Process quarterly balance sheet for a specific symbol with latest data priority
 */
async function processQuarterlyBalanceSheet(
  supabase: SupabaseClient,
  symbol: string,
  options: {
    forceRefresh?: boolean;
    prioritizeRecent?: boolean;
    fetchOnlyRecent?: boolean;
  } = {}
): Promise<ProcessingResult> {
  try {
    const { forceRefresh = false, prioritizeRecent = true, fetchOnlyRecent = false } = options;
    
    console.log(`Processing quarterly balance sheet for ${symbol}...`);
    
    // Determine what quarters to fetch
    let quartersToFetch: Array<{ quarter: string; year: number; fiscalDate: string }> = [];
    
    if (forceRefresh) {
      quartersToFetch = generateHistoricalQuarters(6);
      console.log(`${symbol}: Force refresh - fetching all ${quartersToFetch.length} quarters`);
    } else if (fetchOnlyRecent) {
      quartersToFetch = getRecentQuarters();
      const existingDates = await getExistingQuarterlyDates(supabase, symbol);
      quartersToFetch = quartersToFetch.filter(q => !existingDates.has(q.fiscalDate));
      console.log(`${symbol}: Fetching only recent missing quarters: ${quartersToFetch.length}`);
    } else {
      quartersToFetch = await getMissingQuarters(supabase, symbol, prioritizeRecent);
    }
    
    if (quartersToFetch.length === 0) {
      return {
        symbol,
        status: 'exists',
        message: 'All quarterly data is up to date',
        quarters_fetched: 0
      };
    }
    
    // Fetch quarterly data from API
    const records = await fetchQuarterlyBalanceSheet(symbol);
    if (!records) {
      return {
        symbol,
        status: 'no_data',
        message: 'No quarterly balance sheet data available from API'
      };
    }
    
    // Determine if we're dealing with recent data
    const currentYear = new Date().getFullYear();
    const hasRecentQuarters = quartersToFetch.some(q => q.year >= currentYear - 1);
    
    // Filter records to only include the quarters we want to fetch
    const recordsToSave = filterRecordsForExpectedQuarters(
      records, 
      quartersToFetch, 
      hasRecentQuarters
    );
    
    console.log(`${symbol}: Filtered ${records.length} API records to ${recordsToSave.length} target records`);
    
    if (recordsToSave.length === 0) {
      return {
        symbol,
        status: 'no_data',
        message: 'No matching quarterly periods found in API response'
      };
    }
    
    // Validate records
    const validation = validateQuarterlyRecords(recordsToSave);
    if (!validation.isValid) {
      return {
        symbol,
        status: 'error',
        message: `Invalid quarterly data: ${validation.error}`
      };
    }
    
    // Save to database
    const { success, savedCount } = await saveQuarterlyBalanceSheetData(supabase, recordsToSave);
    if (!success) {
      return {
        symbol,
        status: 'error',
        message: 'Failed to save quarterly data to database'
      };
    }
    
    // Log the fiscal dates that were saved
    const savedDates = recordsToSave.map(r => r.fiscal_date).sort().reverse();
    console.log(`${symbol}: Saved quarters for dates: ${savedDates.slice(0, 4).join(', ')}`);
    
    return {
      symbol,
      status: 'success',
      records_processed: savedCount,
      quarters_fetched: savedCount,
      message: hasRecentQuarters ? 'Recent quarterly data updated' : 'Historical quarterly data updated'
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing quarterly balance sheet for ${symbol}:`, error);
    return {
      symbol,
      status: 'error',
      message: errorMessage
    };
  }
}

/**
 * Main Edge Function handler - Focused on quarterly balance sheet data fetching
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
    
    console.log('Starting quarterly balance sheet data fetch...');
    
    // Parse request body for specific parameters
    let requestedSymbols: string[] | null = null;
    let forceRefresh: boolean = false;
    let maxSymbols: number | null = null;
    let prioritizeRecent: boolean = true;
    let fetchOnlyRecent: boolean = false;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
        forceRefresh = body.forceRefresh || false;
        maxSymbols = body.maxSymbols;
        prioritizeRecent = body.prioritizeRecent !== false; // Default to true
        fetchOnlyRecent = body.fetchOnlyRecent || false;
      } catch {
        // Continue with default behavior if request body parsing fails
      }
    }
    
    // Get symbols to process from stock_quotes table
    const allSymbols = requestedSymbols || await getActiveSymbolsFromStockQuotes(supabaseClient);
    
    if (allSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No symbols found in stock_quotes table to process',
          processed: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    // Limit number of symbols if specified
    const symbolsToProcess = maxSymbols ? allSymbols.slice(0, maxSymbols) : allSymbols;
    
    console.log(`Processing ${symbolsToProcess.length} symbols for quarterly balance sheet data (out of ${allSymbols.length} total)`);
    
    let processedCount = 0;
    let successCount = 0;
    let existsCount = 0;
    let errorCount = 0;
    let noDataCount = 0;
    let totalQuartersFetched = 0;
    const results: ProcessingResult[] = [];
    
    // Process symbols in small batches to respect API rate limits
    const batchSize = 1; // Process one at a time for quarterly data to avoid overwhelming the API
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(symbolsToProcess.length / batchSize)}`);
        
        // Process each symbol in the batch
        for (const symbol of batch) {
          const result = await processQuarterlyBalanceSheet(supabaseClient, symbol, {
            forceRefresh,
            prioritizeRecent,
            fetchOnlyRecent
          });
          
          results.push(result);
          processedCount++;
          
          switch (result.status) {
            case 'success':
              successCount++;
              totalQuartersFetched += result.quarters_fetched || 0;
              break;
            case 'exists':
              existsCount++;
              break;
            case 'error':
              errorCount++;
              break;
            case 'no_data':
              noDataCount++;
              break;
          }
          
          // Log progress every 10 symbols
          if (processedCount % 10 === 0) {
            console.log(`Progress: ${processedCount}/${symbolsToProcess.length} symbols processed`);
          }
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errorCount += batch.length;
        console.error(`Error processing batch:`, error);
        
        for (const symbol of batch) {
          results.push({
            symbol,
            status: 'error',
            message: `Batch processing error: ${errorMessage}`
          });
          processedCount++;
        }
      }
      
      // Delay between symbols to respect API rate limits (quarterly data is more intensive)
      if (i + batchSize < symbolsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
      }
    }
    
    const response = {
      success: true,
      message: 'Quarterly balance sheet data fetch completed',
      summary: {
        total_symbols_available: allSymbols.length,
        symbols_processed: processedCount,
        successful: successCount,
        already_exists: existsCount,
        no_data: noDataCount,
        errors: errorCount,
        total_quarters_fetched: totalQuartersFetched,
        force_refresh: forceRefresh,
        prioritize_recent: prioritizeRecent,
        fetch_only_recent: fetchOnlyRecent,
        timestamp: getCurrentTimestamp()
      },
      results: results.slice(-50) // Show last 50 results to avoid large responses
    };
    
    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error) {
    console.error('Error in main handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: 'Failed to process quarterly balance sheet data',
        timestamp: getCurrentTimestamp()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
