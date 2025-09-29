/**
 * Supabase Edge Function: Sequential Balance Sheet Data Fetcher
 * 
 * This Edge Function fetches balance sheet data in a specific sequence:
 * 1. First: Quarterly data for all stocks (last 5 years including current year)
 * 2. Then: Annual data for all stocks (last 5 years including current year)
 * 
 * Features:
 * - AUTOMATIC BATCHING: Intelligently finds and processes the next batch of stocks that need updating.
 * - RETRY MECHANISM: Retries failed fetches once to improve resilience against transient API errors.
 * - Sequential processing: All quarterly first, then all annual within the batch.
 * - 5-year coverage based on fiscal date year, not fixed calendar dates.
 * - Smart duplicate prevention - never fetches the same data twice.
 * - Validates and processes financial data in wide format.
 * - Handles API rate limiting and errors gracefully.
 * - Comprehensive progress tracking and reporting.
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

// Database record matching the wide table schema
interface BalanceSheetRecord {
  symbol: string;
  frequency: 'quarterly' | 'annual';
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
  frequency: 'quarterly' | 'annual';
  status: 'success' | 'error' | 'skipped' | 'no_data';
  message?: string;
  records_saved?: number;
  periods_found?: number;
  duplicate_periods_skipped?: number;
}

interface ProcessingSummary {
  phase: 'quarterly' | 'annual' | 'completed';
  symbols_processed: number;
  symbols_successful: number;
  symbols_skipped: number;
  symbols_with_errors: number;
  symbols_no_data: number;
  total_records_saved: number;
  total_periods_found: number;
  duplicate_periods_skipped: number;
  processing_time_seconds: number;
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

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  // Get all keys that are valid dates and not 'Breakdown'
  return Object.keys(firstItem)
    .filter(key => key !== 'Breakdown' && dateRegex.test(key))
    .sort().reverse();
}

/**
 * Get existing fiscal dates for a symbol and frequency to prevent duplicates
 */
async function getExistingFiscalDates(
  supabase: SupabaseClient,
  symbol: string,
  frequency: 'quarterly' | 'annual'
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('balance_sheet')
      .select('fiscal_date')
      .eq('symbol', symbol)
      .eq('frequency', frequency)
      .eq('data_provider', 'finance-query-api');
    
    if (error) {
      console.error(`Error fetching existing ${frequency} dates for ${symbol}:`, error);
      return new Set();
    }
    
    return new Set(data?.map((row: { fiscal_date: string }) => row.fiscal_date) || []);
  } catch (error) {
    console.error(`Error in getExistingFiscalDates for ${symbol} ${frequency}:`, error);
    return new Set();
  }
}

/**
 * Fetch balance sheet data from API
 */
async function fetchBalanceSheetData(
  symbol: string,
  frequency: 'quarterly' | 'annual'
): Promise<BalanceSheetRecord[] | null> {
  try {
    const apiFrequency = frequency === 'quarterly' ? 'quarterly' : 'annual';
    const url = `https://finance-query.onrender.com/v1/financials/${symbol}?statement=balance&frequency=${apiFrequency}`;
    
    console.log(`Fetching ${frequency} balance sheet for ${symbol}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-SequentialBalanceSheetFetcher/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No ${frequency} balance sheet found for ${symbol}`);
        return null;
      }
      console.error(`API error for ${symbol} ${frequency}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: BalanceSheetAPIResponse = await response.json();
    
    // Validate required fields
    if (!data || !data.statement || typeof data.statement !== 'object') {
      console.log(`Invalid ${frequency} balance sheet data for ${symbol}`);
      return null;
    }
    
    // Extract fiscal dates from the first item
    const fiscalDates = extractFiscalDates(data.statement);
    if (fiscalDates.length === 0) {
      console.log(`No fiscal dates found for ${symbol} ${frequency} data`);
      return null;
    }
    
    console.log(`Found ${fiscalDates.length} ${frequency} periods for ${symbol} from API.`);
    
    // Transform API data to wide-format database records
    const records: BalanceSheetRecord[] = [];
    
    for (const fiscalDate of fiscalDates) {
      const record: BalanceSheetRecord = {
        symbol: symbol.toUpperCase(),
        frequency: frequency,
        fiscal_date: fiscalDate,
        data_provider: 'finance-query-api'
      };
      let hasAnyData = false;

      // Process each breakdown item and map to appropriate column
      for (const [itemKey, item] of Object.entries(data.statement)) {
        const breakdown = item.Breakdown;
        if (!breakdown) continue;
        
        const columnName = getColumnNameFromBreakdown(breakdown);
        if (!columnName) continue;
        
        const valueStr = item[fiscalDate];
        const value = parseFinancialValue(valueStr);
        
        if (value !== null) {
            hasAnyData = true;
        }
        (record as any)[columnName] = value;
      }

      // Only add the record if it contains at least one piece of financial data.
      // This prevents validation errors for records that are just empty shells.
      if (hasAnyData) {
        records.push(record);
      } else {
        console.log(`🟡 Skipping fiscal date ${fiscalDate} for ${symbol} ${frequency} because it contained no valid financial data.`);
      }
    }
    
    return records;
    
  } catch (error) {
    console.error(`Error fetching ${frequency} balance sheet for ${symbol}:`, error);
    return null;
  }
}

/**
 * Filter records to only include target years and prevent duplicates
 */
function filterTargetRecords(
  records: BalanceSheetRecord[], 
  startYear: number,
  endYear: number,
  existingPeriods: Set<string>
): { recordsToSave: BalanceSheetRecord[]; duplicatesSkipped: number } {
  const recordsToSave: BalanceSheetRecord[] = [];
  let duplicatesSkipped = 0;
  
  for (const record of records) {
    // Ensure fiscal_date is valid before parsing
    if (!record.fiscal_date || typeof record.fiscal_date !== 'string') {
        continue;
    }
      
    const recordYear = new Date(record.fiscal_date).getFullYear();

    // Check if the record is within our target year range
    if (recordYear < startYear || recordYear > endYear) {
      continue; // Skip periods outside our target year range
    }
    
    // Check if we already have this data (duplicate prevention)
    if (existingPeriods.has(record.fiscal_date)) {
      duplicatesSkipped++;
      continue;
    }
    
    recordsToSave.push(record);
  }
  
  return { recordsToSave, duplicatesSkipped };
}

/**
 * Save balance sheet records to database with duplicate prevention
 */
async function saveBalanceSheetRecords(
  supabase: SupabaseClient,
  records: BalanceSheetRecord[]
): Promise<{ success: boolean; savedCount: number }> {
  if (records.length === 0) return { success: true, savedCount: 0 };
  
  try {
    // Use smaller batches for complex records
    const batchSize = 5;
    let totalSaved = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('balance_sheet')
        .upsert(batch, {
          onConflict: 'symbol,frequency,fiscal_date,data_provider',
          ignoreDuplicates: false // Always update to ensure we have latest data
        })
        .select('id');
      
      if (error) {
        console.error(`Error saving ${records[0].frequency} batch for ${records[0].symbol}:`, error);
        continue;
      }
      
      const batchSavedCount = data?.length || 0;
      totalSaved += batchSavedCount;
      
      console.log(`Saved ${batchSavedCount}/${batch.length} ${records[0].frequency} records for ${records[0].symbol}`);
    }
    
    console.log(`✅ Total saved: ${totalSaved}/${records.length} ${records[0].frequency} records for ${records[0].symbol}`);
    return { success: totalSaved > 0, savedCount: totalSaved };
    
  } catch (error) {
    console.error(`Error in saveBalanceSheetRecords:`, error);
    return { success: false, savedCount: 0 };
  }
}

/**
 * Validate balance sheet records before saving
 */
function validateBalanceSheetRecords(records: BalanceSheetRecord[]): { isValid: boolean; error?: string } {
  if (!Array.isArray(records) || records.length === 0) {
    return { isValid: false, error: 'No records to validate' };
  }
  
  for (const record of records) {
    if (!record.symbol || !['quarterly', 'annual'].includes(record.frequency) || !record.fiscal_date || !record.data_provider) {
      return { isValid: false, error: 'Missing required fields in record' };
    }
    
    // Validate fiscal_date format
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
      record[key as keyof BalanceSheetRecord] !== null &&
      record[key as keyof BalanceSheetRecord] !== undefined
    );
    
    if (!hasFinancialData) {
      return { isValid: false, error: 'Record contains no financial data' };
    }
  }
  
  return { isValid: true };
}

/**
 * Process balance sheet data for a single symbol and frequency
 */
async function processSymbolBalanceSheet(
  supabase: SupabaseClient,
  symbol: string,
  frequency: 'quarterly' | 'annual',
  startYear: number,
  endYear: number
): Promise<ProcessingResult> {
  try {
    console.log(`
📊 Processing ${symbol} (${frequency})...`);
    
    // Get existing data to identify duplicates in the API response
    const existingPeriods = await getExistingFiscalDates(supabase, symbol, frequency);
    
    console.log(`🎯 ${symbol} ${frequency}: Checking for new data for years ${startYear}-${endYear}. ${existingPeriods.size} periods already exist in the database.`);
    
    // Always fetch data from API to ensure data is up-to-date
    const apiRecords = await fetchBalanceSheetData(symbol, frequency);
    if (!apiRecords) {
      console.log(`🟡 ${symbol} ${frequency}: API did not return any data.`);
      return {
        symbol,
        frequency,
        status: 'no_data',
        message: `No ${frequency} balance sheet data available from API`,
        records_saved: 0,
        periods_found: 0,
        duplicate_periods_skipped: 0
      };
    }
    
    console.log(`ℹ️ ${symbol} ${frequency}: API returned ${apiRecords.length} periods. Now filtering...`);
    
    // Filter to only include records for target years and identify duplicates
    const { recordsToSave, duplicatesSkipped } = filterTargetRecords(
      apiRecords, 
      startYear,
      endYear,
      existingPeriods
    );
    
    if (recordsToSave.length === 0) {
      const reason = apiRecords.length > 0 ? 
        `all ${apiRecords.length} records returned by API were either duplicates (${duplicatesSkipped}) or outside the target year range.` :
        `the API returned no records.`;
      console.log(`🟡 ${symbol} ${frequency}: No new records to save. Reason: ${reason}`);
      return {
        symbol,
        frequency,
        status: 'skipped',
        message: `No new ${frequency} periods to save because ${reason}`,
        records_saved: 0,
        periods_found: apiRecords.length,
        duplicate_periods_skipped: duplicatesSkipped
      };
    }
    
    console.log(`ℹ️ ${symbol} ${frequency}: After filtering, ${recordsToSave.length} records will be saved.`);

    // Validate records before saving
    const validation = validateBalanceSheetRecords(recordsToSave);
    if (!validation.isValid) {
      console.error(`🔴 ${symbol} ${frequency}: Data validation failed: ${validation.error}`);
      return {
        symbol,
        frequency,
        status: 'error',
        message: `Invalid ${frequency} data: ${validation.error}`,
        records_saved: 0,
        periods_found: apiRecords.length,
        duplicate_periods_skipped: duplicatesSkipped
      };
    }
    
    // Save to database using upsert
    const { success, savedCount } = await saveBalanceSheetRecords(supabase, recordsToSave);
    if (!success && savedCount < recordsToSave.length) {
      console.error(`🔴 ${symbol} ${frequency}: Failed to save all records to database.`);
      return {
        symbol,
        frequency,
        status: 'error',
        message: `Failed to save all ${frequency} records to database`,
        records_saved: savedCount,
        periods_found: apiRecords.length,
        duplicate_periods_skipped: duplicatesSkipped
      };
    }
    
    console.log(`✅ ${symbol} ${frequency}: Saved/updated ${savedCount} periods`);
    
    return {
      symbol,
      frequency,
      status: 'success',
      message: `Successfully saved/updated ${savedCount} ${frequency} periods`,
      records_saved: savedCount,
      periods_found: apiRecords.length,
      duplicate_periods_skipped: duplicatesSkipped
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error processing ${symbol} ${frequency}:`, error);
    
    return {
      symbol,
      frequency,
      status: 'error',
      message: errorMessage,
      records_saved: 0,
      periods_found: 0,
      duplicate_periods_skipped: 0
    };
  }
}

/**
 * Process all symbols for a specific frequency sequentially
 */
async function processFrequencyPhase(
  supabase: SupabaseClient,
  symbols: string[],
  frequency: 'quarterly' | 'annual',
  startYear: number,
  endYear: number
): Promise<{ results: ProcessingResult[]; summary: ProcessingSummary }> {
  const startTime = Date.now();
  const symbolsToProcess = symbols;
  const results: ProcessingResult[] = [];
  
  console.log(`
🚀 Starting ${frequency.toUpperCase()} PHASE for ${symbolsToProcess.length} symbols`);
  console.log(`📅 Target Years: ${startYear} - ${endYear}`);
  
  let processedCount = 0;
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let noDataCount = 0;
  let totalRecordsSaved = 0;
  let totalPeriodsFound = 0;
  let totalDuplicatesSkipped = 0;
  
  // Process symbols one by one with rate limiting
  for (const symbol of symbolsToProcess) {
    let result = await processSymbolBalanceSheet(supabase, symbol, frequency, startYear, endYear);

    // If the first attempt fails (e.g., transient network error or API hiccup), retry once.
    if (result.status === 'error' || result.status === 'no_data') {
        console.log(`⚠️ Initial fetch for ${symbol} ${frequency} failed with status: ${result.status}. Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        result = await processSymbolBalanceSheet(supabase, symbol, frequency, startYear, endYear);
        if (result.status === 'success') {
            console.log(`✅ Retry for ${symbol} ${frequency} was successful.`);
        }
    }

    results.push(result);
    
    // Update counters
    processedCount++;
    totalRecordsSaved += result.records_saved || 0;
    totalPeriodsFound += result.periods_found || 0;
    totalDuplicatesSkipped += result.duplicate_periods_skipped || 0;
    
    switch (result.status) {
      case 'success': successCount++; break;
      case 'skipped': skippedCount++; break;
      case 'error': errorCount++; break;
      case 'no_data': noDataCount++; break;
    }
    
    // Progress logging
    if (processedCount % 10 === 0 || processedCount === symbolsToProcess.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`
📈 ${frequency.toUpperCase()} PROGRESS: ${processedCount}/${symbolsToProcess.length} symbols`);
      console.log(`   ✅ Success: ${successCount} | ⏭️ Skipped: ${skippedCount} | ❌ Error: ${errorCount} | 📭 No Data: ${noDataCount}`);
      console.log(`   💾 Records Saved: ${totalRecordsSaved} | ⏰ Elapsed: ${elapsed.toFixed(1)}s`);
    }
    
    // Rate limiting - wait between symbols
    if (processedCount < symbolsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  const processingTimeSeconds = (Date.now() - startTime) / 1000;
  
  const summary: ProcessingSummary = {
    phase: frequency,
    symbols_processed: processedCount,
    symbols_successful: successCount,
    symbols_skipped: skippedCount,
    symbols_with_errors: errorCount,
    symbols_no_data: noDataCount,
    total_records_saved: totalRecordsSaved,
    total_periods_found: totalPeriodsFound,
    duplicate_periods_skipped: totalDuplicatesSkipped,
    processing_time_seconds: processingTimeSeconds
  };
  
  console.log(`
🎉 ${frequency.toUpperCase()} PHASE COMPLETED in ${processingTimeSeconds.toFixed(1)}s`);
  console.log(`   📊 ${successCount}/${processedCount} symbols processed successfully`);
  console.log(`   💾 ${totalRecordsSaved} new records saved`);
  console.log(`   ⏭️ ${totalDuplicatesSkipped} duplicates prevented`);
  
  return { results, summary };
}

/**
 * Get active symbols from stock_quotes table
 */
async function getActiveSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    console.log('🔍 Fetching all symbols from stock_quotes table using pagination...');
    const allSymbols = new Set<string>();
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while(hasMore) {
        const { data, error } = await supabase
            .from('stock_quotes')
            .select('symbol')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error(`Error fetching symbols from stock_quotes (page ${page}):`, error);
            break; 
        }

        if (data && data.length > 0) {
            data.forEach(row => {
                if (row.symbol) {
                    allSymbols.add(row.symbol);
                }
            });
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    
    if (allSymbols.size === 0) {
      console.log('No symbols found in stock_quotes table');
      return [];
    }
    
    const uniqueSymbols = [...allSymbols];

    // Filter out invalid symbols and log them
    const validationRegex = /^[A-Z0-9.-]+$/;
    const validSymbols = uniqueSymbols
      .filter((symbol): symbol is string => {
        const isValid = typeof symbol === 'string' && 
                        symbol.length > 0 && 
                        symbol.length <= 10 &&
                        validationRegex.test(symbol.toUpperCase());
        if (!isValid) {
            console.log(`⚠️ Filtering out invalid symbol: "${symbol}"`);
        }
        return isValid;
      })
      .map(symbol => symbol.toUpperCase());
      
    console.log(`✅ Found ${validSymbols.length} valid symbols in stock_quotes table after pagination and filtering.`);
    
    return validSymbols;
  } catch (error) {
    console.error('Error in getActiveSymbols:', error);
    return [];
  }
}

/**
 * Main Edge Function handler - Sequential processing: Quarterly first, then Annual
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
    
    console.log(`
🚀 STARTING SEQUENTIAL BALANCE SHEET FETCHER`);
    console.log(`📅 Time: ${getCurrentTimestamp()}`);
    console.log(`🎯 Strategy: Automatic batch processing to avoid timeouts. Quarterly First → Then Annual.`);
    
    // Parse request parameters
    let requestedSymbols: string[] | null = null;
    let maxSymbols: number | null = null;
    let skipQuarterly: boolean = false;
    let skipAnnual: boolean = false;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
        maxSymbols = body.maxSymbols;
        skipQuarterly = body.skipQuarterly || false;
        skipAnnual = body.skipAnnual || false;
      } catch {
        // Continue with defaults if parsing fails
      }
    }
    
    // Get symbols to process
    const allSymbols = await getActiveSymbols(supabaseClient);
    
    if (allSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No symbols found to process',
          timestamp: getCurrentTimestamp()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    // --- AUTOMATIC BATCHING LOGIC ---
    let symbolsToProcess: string[];
    let remainingSymbolsForNextRun: string[] = [];

    // Case 1: User provides a specific list of symbols to process.
    if (requestedSymbols && requestedSymbols.length > 0) {
        console.log(`Processing a specific list of ${requestedSymbols.length} symbols provided by the user.`);
        symbolsToProcess = maxSymbols ? requestedSymbols.slice(0, maxSymbols) : requestedSymbols;
    } 
    // Case 2: User does not provide a list. Automatically determine the next batch.
    else {
        console.log("No specific symbols requested. Automatically determining next batch...");

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentlyUpdated, error: fetchError } = await supabaseClient
            .from('balance_sheet')
            .select('symbol')
            .in('symbol', allSymbols)
            .gt('updated_at', twentyFourHoursAgo);

        if (fetchError) {
            console.error("Warning: Could not fetch recently updated symbols. Processing first batch as fallback.", fetchError.message);
        }

        const recentlyUpdatedSymbols = new Set(recentlyUpdated?.map(r => r.symbol) || []);
        const symbolsNeedingUpdate = allSymbols.filter(s => !recentlyUpdatedSymbols.has(s));
        
        console.log(`Found ${allSymbols.length} total symbols. ${recentlyUpdatedSymbols.size} are up-to-date. ${symbolsNeedingUpdate.length} may need processing.`);

        const BATCH_SIZE = 3;
        const limit = maxSymbols ? maxSymbols : BATCH_SIZE;
        
        symbolsToProcess = symbolsNeedingUpdate.slice(0, limit);
        remainingSymbolsForNextRun = symbolsNeedingUpdate.slice(limit);
    }
    
    if (symbolsToProcess.length === 0) {
        console.log('✅ All symbols appear to be up-to-date. Nothing to process in this run.');
        return new Response(JSON.stringify({ success: true, message: 'All symbols are up-to-date.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    console.log(`
📈 Processing ${symbolsToProcess.length} symbols in this batch: [${symbolsToProcess.join(', ')}]`);
    if (remainingSymbolsForNextRun.length > 0) {
        console.log(`💡 ${remainingSymbolsForNextRun.length} more symbols will be processed in subsequent runs.`);
    }
    // --- END BATCHING LOGIC ---
    
    // Define target year range (last 5 years including current year)
    const endYear = new Date().getFullYear();
    const startYear = endYear - 4;
    
    console.log(`📊 Target Year Range: ${startYear} - ${endYear}`);
    
    const overallStartTime = Date.now();
    const results: ProcessingResult[] = [];
    const summaries: ProcessingSummary[] = [];
    
    // PHASE 1: QUARTERLY DATA
    if (!skipQuarterly) {
      console.log(`
${'='.repeat(60)}`);
      console.log(`🔄 PHASE 1: QUARTERLY DATA PROCESSING`);
      console.log(`${'='.repeat(60)}`);
      
      const quarterlyPhase = await processFrequencyPhase(
        supabaseClient,
        symbolsToProcess,
        'quarterly',
        startYear,
        endYear
      );
      
      results.push(...quarterlyPhase.results);
      summaries.push(quarterlyPhase.summary);
    } else {
      console.log(`
⏭️ SKIPPING QUARTERLY PHASE (skipQuarterly = true)`);
    }
    
    // PHASE 2: ANNUAL DATA
    if (!skipAnnual) {
      console.log(`
${'='.repeat(60)}`);
      console.log(`🔄 PHASE 2: ANNUAL DATA PROCESSING`);
      console.log(`${'='.repeat(60)}`);
      
      const annualPhase = await processFrequencyPhase(
        supabaseClient,
        symbolsToProcess,
        'annual',
        startYear,
        endYear
      );
      
      results.push(...annualPhase.results);
      summaries.push(annualPhase.summary);
    } else {
      console.log(`
⏭️ SKIPPING ANNUAL PHASE (skipAnnual = true)`);
    }
    
    // Calculate overall statistics
    const overallProcessingTime = (Date.now() - overallStartTime) / 1000;
    const quarterlyResults = results.filter(r => r.frequency === 'quarterly');
    const annualResults = results.filter(r => r.frequency === 'annual');
    
    const totalRecordsSaved = summaries.reduce((sum, s) => sum + s.total_records_saved, 0);
    const totalDuplicatesSkipped = summaries.reduce((sum, s) => sum + s.duplicate_periods_skipped, 0);
    const totalSuccessful = summaries.reduce((sum, s) => sum + s.symbols_successful, 0);
    const totalErrors = summaries.reduce((sum, s) => sum + s.symbols_with_errors, 0);
    
    console.log(`
${'='.repeat(60)}`);
    console.log(`🎉 SEQUENTIAL PROCESSING COMPLETED`);
    console.log(`${'='.repeat(60)}`);
    console.log(`⏰ Total Time: ${overallProcessingTime.toFixed(1)} seconds`);
    console.log(`💾 Records Saved: ${totalRecordsSaved}`);
    console.log(`⏭️ Duplicates Prevented: ${totalDuplicatesSkipped}`);
    console.log(`✅ Successful: ${totalSuccessful} | ❌ Errors: ${totalErrors}`);
    
    // Build comprehensive response
    const response = {
      success: true,
      message: 'Sequential balance sheet data fetch completed for the batch.',
      processing_strategy: 'automatic_batching',
      overall_summary: {
        total_symbols_in_system: allSymbols.length,
        symbols_processed_in_batch: symbolsToProcess.length,
        symbols_remaining_for_future_runs: remainingSymbolsForNextRun.length,
        total_processing_time_seconds: overallProcessingTime,
        total_records_saved: totalRecordsSaved,
        total_duplicates_prevented: totalDuplicatesSkipped,
        total_successful_operations: totalSuccessful,
        total_errors: totalErrors,
        phases_completed: summaries.length,
        target_coverage: {
          start_year: startYear,
          end_year: endYear
        },
      },
      phase_summaries: summaries.map(summary => ({
        ...summary,
        success_rate: summary.symbols_processed > 0 ? 
          ((summary.symbols_successful / summary.symbols_processed) * 100).toFixed(1) + '%' : '0%',
        avg_processing_time_per_symbol: summary.symbols_processed > 0 ?
          (summary.processing_time_seconds / summary.symbols_processed).toFixed(2) + 's' : '0s'
      })),
      detailed_results: {
        quarterly: {
          count: quarterlyResults.length,
          successful: quarterlyResults.filter(r => r.status === 'success').length,
          skipped: quarterlyResults.filter(r => r.status === 'skipped').length,
          errors: quarterlyResults.filter(r => r.status === 'error').length,
          no_data: quarterlyResults.filter(r => r.status === 'no_data').length,
          records_saved: quarterlyResults.reduce((sum, r) => sum + (r.records_saved || 0), 0)
        },
        annual: {
          count: annualResults.length,
          successful: annualResults.filter(r => r.status === 'success').length,
          skipped: annualResults.filter(r => r.status === 'skipped').length,
          errors: annualResults.filter(r => r.status === 'error').length,
          no_data: annualResults.filter(r => r.status === 'no_data').length,
          records_saved: annualResults.reduce((sum, r) => sum + (r.records_saved || 0), 0)
        }
      },
      sample_results: results.slice(-20), // Last 20 results for debugging
      timestamp: getCurrentTimestamp(),
    };
    
    return new Response(
      JSON.stringify(response, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error) {
    console.error('❌ Error in main handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: 'Failed to process sequential balance sheet data fetch',
        timestamp: getCurrentTimestamp()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});