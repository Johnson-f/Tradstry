/**
 * Supabase Edge Function: Sequential Cash Flow Data Fetcher
 * 
 * This Edge Function fetches cash flow data in a specific sequence:
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

// Types for cash flow data
interface FinancialDataPoint {
  Breakdown: string;
  [fiscalDate: string]: string; // Dynamic fiscal date keys like "2024-09-30"
}

interface CashFlowAPIResponse {
  symbol: string;
  statement_type: string;
  frequency: string;
  statement: {
    [key: string]: FinancialDataPoint;
  };
}

// Database record matching the wide table schema
interface CashFlowRecord {
  symbol: string;
  frequency: 'quarterly' | 'annual';
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
 * Map API breakdown names to database column names for cash flow statements
 */
function getColumnNameFromBreakdown(breakdown: string): string | null {
  const mapping: { [key: string]: string } = {
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
    'Capital Expenditure': 'capital_expenditure',
    
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
      .from('cash_flow')
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
 * Fetch cash flow data from API
 */
async function fetchCashFlowData(
  symbol: string,
  frequency: 'quarterly' | 'annual'
): Promise<CashFlowRecord[] | null> {
  try {
    const apiFrequency = frequency === 'quarterly' ? 'quarterly' : 'annual';
    const url = `https://finance-query.onrender.com/v1/financials/${symbol}?statement=cashflow&frequency=${apiFrequency}`;
    
    console.log(`Fetching ${frequency} cash flow for ${symbol}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-SequentialCashFlowFetcher/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No ${frequency} cash flow found for ${symbol}`);
        return null;
      }
      console.error(`API error for ${symbol} ${frequency}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: CashFlowAPIResponse = await response.json();
    
    // Validate required fields
    if (!data || !data.statement || typeof data.statement !== 'object') {
      console.log(`Invalid ${frequency} cash flow data for ${symbol}`);
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
    const records: CashFlowRecord[] = [];
    
    for (const fiscalDate of fiscalDates) {
      const record: CashFlowRecord = {
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
    console.error(`Error fetching ${frequency} cash flow for ${symbol}:`, error);
    return null;
  }
}

/**
 * Filter records to only include target years and prevent duplicates
 */
function filterTargetRecords(
  records: CashFlowRecord[], 
  startYear: number,
  endYear: number,
  existingPeriods: Set<string>
): { recordsToSave: CashFlowRecord[]; duplicatesSkipped: number } {
  const recordsToSave: CashFlowRecord[] = [];
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
 * Save cash flow records to database with duplicate prevention
 */
async function saveCashFlowRecords(
  supabase: SupabaseClient,
  records: CashFlowRecord[]
): Promise<{ success: boolean; savedCount: number }> {
  if (records.length === 0) return { success: true, savedCount: 0 };
  
  try {
    // Use smaller batches for complex records
    const batchSize = 5;
    let totalSaved = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('cash_flow')
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
    console.error(`Error in saveCashFlowRecords:`, error);
    return { success: false, savedCount: 0 };
  }
}

/**
 * Validate cash flow records before saving
 */
function validateCashFlowRecords(records: CashFlowRecord[]): { isValid: boolean; error?: string } {
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
      record[key as keyof CashFlowRecord] !== null &&
      record[key as keyof CashFlowRecord] !== undefined
    );
    
    if (!hasFinancialData) {
      return { isValid: false, error: 'Record contains no financial data' };
    }
  }
  
  return { isValid: true };
}

/**
 * Process cash flow data for a single symbol and frequency
 */
async function processSymbolCashFlow(
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
    const apiRecords = await fetchCashFlowData(symbol, frequency);
    if (!apiRecords) {
      console.log(`🟡 ${symbol} ${frequency}: API did not return any data.`);
      return {
        symbol,
        frequency,
        status: 'no_data',
        message: `No ${frequency} cash flow data available from API`,
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
    const validation = validateCashFlowRecords(recordsToSave);
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
    const { success, savedCount } = await saveCashFlowRecords(supabase, recordsToSave);
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
    let result = await processSymbolCashFlow(supabase, symbol, frequency, startYear, endYear);

    // If the first attempt fails (e.g., transient network error or API hiccup), retry once.
    if (result.status === 'error' || result.status === 'no_data') {
        console.log(`⚠️ Initial fetch for ${symbol} ${frequency} failed with status: ${result.status}. Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        result = await processSymbolCashFlow(supabase, symbol, frequency, startYear, endYear);
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
🚀 STARTING SEQUENTIAL CASH FLOW FETCHER`);
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
            .from('cash_flow')
            .select('symbol')
            .in('symbol', allSymbols)
            .gt('updated_at', twentyFourHoursAgo);

        if (fetchError) {
            console.error("Warning: Could not fetch recently updated symbols. Processing first batch as fallback.", fetchError.message);
        }

        const recentlyUpdatedSymbols = new Set(recentlyUpdated?.map(r => r.symbol) || []);
        const symbolsNeedingUpdate = allSymbols.filter(s => !recentlyUpdatedSymbols.has(s));
        
        console.log(`Found ${allSymbols.length} total symbols. ${recentlyUpdatedSymbols.size} are up-to-date. ${symbolsNeedingUpdate.length} may need processing.`);

        const BATCH_SIZE = 1; // Process one stock at a time for cash flow statements
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
      message: 'Sequential cash flow data fetch completed for the batch.',
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
        message: 'Failed to process sequential cash flow data fetch',
        timestamp: getCurrentTimestamp()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});