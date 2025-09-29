/**
 * Supabase Edge Function: Comprehensive Holders Data Fetcher
 * 
 * Purpose: Fetches comprehensive holder information for stocks from multiple API endpoints
 * and stores it in the PostgreSQL holders table with intelligent data management.
 * 
 * Features:
 * - Fetches 5 types of holder data: institutional, mutualfund, insider_transactions, insider_purchases, insider_roster
 * - Multi-endpoint API integration with https://finance-query.onrender.com/v1/holders/{symbol}?holder_type={type}
 * - Smart data management: Only fetches missing or stale data to avoid redundant API calls
 * - Comprehensive field mapping from API responses to database columns
 * - Batch processing with rate limiting for large-scale data updates
 * - Robust error handling and logging for production reliability
 * - CORS support for cross-origin requests
 * 
 * Database: holders table (20_Holders.sql)
 * API: finance-query.onrender.com holders endpoints
 * 
 * Holder Types Supported:
 * 1. institutional - Major institutional investors and their holdings
 * 2. mutualfund - Mutual fund and ETF holders
 * 3. insider_transactions - Recent insider buy/sell transactions
 * 4. insider_purchases - Summary of insider purchase activity
 * 5. insider_roster - Current insider positions and ownership
 * 
 * Usage:
 * GET /holders - Fetch for all symbols in stock_quotes table
 * POST /holders - Fetch for specific symbols with options:
 *   - symbols: string[] - Specific symbols to fetch
 *   - holderTypes: string[] - Specific holder types to fetch
 *   - forceRefresh: boolean - Force refresh all data
 *   - maxSymbols: number - Limit number of symbols to process
 *   - refreshThresholdDays: number - Days before data is considered stale (default: 7)
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
 * Holder types supported by the API and database
 */
type HolderType = 'institutional' | 'mutualfund' | 'insider_transactions' | 'insider_purchases' | 'insider_roster';

/**
 * TypeScript interface matching the holders database table structure
 * Accommodates all holder types with flexible field usage
 */
interface HolderRecord {
  symbol: string;
  holder_type: HolderType;
  
  // Common holder information (used by institutional, mutualfund, insider_transactions, insider_roster)
  holder_name?: string | null;
  shares?: number | null;
  value?: number | null; // Value in cents
  date_reported?: string | null; // ISO timestamp
  
  // Insider-specific fields (insider_transactions, insider_roster)
  insider_position?: string | null;
  transaction_type?: string | null;
  ownership_type?: string | null; // 'D' for Direct, 'I' for Indirect
  
  // Insider roster specific fields
  most_recent_transaction?: string | null;
  latest_transaction_date?: string | null; // ISO timestamp
  shares_owned_directly?: number | null;
  shares_owned_indirectly?: number | null;
  position_direct_date?: string | null; // ISO timestamp
  
  // Insider purchases summary fields (for insider_purchases type)
  summary_period?: string | null; // e.g., '6m'
  purchases_shares?: number | null;
  purchases_transactions?: number | null;
  sales_shares?: number | null;
  sales_transactions?: number | null;
  net_shares?: number | null;
  net_transactions?: number | null;
  total_insider_shares?: number | null;
  net_percent_insider_shares?: number | null;
  buy_percent_insider_shares?: number | null;
  sell_percent_insider_shares?: number | null;
  
  // Metadata
  data_source: string;
}

/**
 * API response structures for different holder types
 */
interface InstitutionalHolder {
  holder: string;
  shares: number;
  date_reported: string;
  percent_out?: number | null;
  value: number;
}

interface MutualFundHolder {
  holder: string;
  shares: number;
  date_reported: string;
  percent_out?: number | null;
  value: number;
}

interface InsiderTransaction {
  start_date: string;
  insider: string;
  position: string;
  transaction: string;
  shares: number;
  value: number | null;
  ownership: string; // 'D' or 'I'
}

interface InsiderRoster {
  insider: string;
  position: string;
  most_recent_transaction?: string;
  latest_transaction_date?: string;
  shares_owned_directly?: number;
  shares_owned_indirectly?: number;
  position_direct_date?: string;
}

interface InsiderPurchases {
  summary_period: string;
  purchases_shares: number;
  purchases_transactions: number;
  sales_shares: number;
  sales_transactions: number;
  net_shares: number;
  net_transactions: number;
  total_insider_shares: number;
  net_percent_insider_shares: number;
  buy_percent_insider_shares: number;
  sell_percent_insider_shares: number;
}

/**
 * API response structure from finance-query.onrender.com
 */
interface HoldersAPIResponse {
  symbol: string;
  holder_type: HolderType;
  major_breakdown?: any;
  institutional_holders?: InstitutionalHolder[] | null;
  mutualfund_holders?: MutualFundHolder[] | null;
  insider_transactions?: InsiderTransaction[] | null;
  insider_purchases?: InsiderPurchases | null;
  insider_roster?: InsiderRoster[] | null;
}

/**
 * Processing result for each symbol and holder type combination
 */
interface ProcessingResult {
  symbol: string;
  holder_type: HolderType;
  status: 'success' | 'exists' | 'no_data' | 'error';
  message?: string;
  records_processed?: number;
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
 * Parse financial value to cents (multiply by 100 to avoid floating point issues)
 * Returns null for invalid values
 */
function parseValueToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || isNaN(value)) {
    return null;
  }
  return Math.round(value); // API already returns values in cents
}

/**
 * Parse shares value, handling null and invalid values
 */
function parseShares(shares: number | null | undefined): number | null {
  if (shares === null || shares === undefined || isNaN(shares)) {
    return null;
  }
  return Math.round(shares);
}

/**
 * Parse percentage value (convert to decimal, e.g., 5.5% -> 0.055)
 */
function parsePercentage(percent: number | null | undefined): number | null {
  if (percent === null || percent === undefined || isNaN(percent)) {
    return null;
  }
  return percent / 100; // Convert percentage to decimal
}

/**
 * Parse and validate date string to ISO format
 */
function parseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch (error) {
    console.error('Error parsing date:', dateStr, error);
    return null;
  }
}

/**
 * Clean and validate holder name
 */
function cleanHolderName(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  
  // Clean up the name - remove extra whitespace and limit length
  const cleaned = name.trim().substring(0, 500);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Clean and validate insider position
 */
function cleanInsiderPosition(position: string | null | undefined): string | null {
  if (!position || typeof position !== 'string') return null;
  
  const cleaned = position.trim().substring(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Clean and validate transaction type
 */
function cleanTransactionType(transaction: string | null | undefined): string | null {
  if (!transaction || typeof transaction !== 'string') return null;
  
  const cleaned = transaction.trim().substring(0, 50);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Validate ownership type (should be 'D' or 'I')
 */
function validateOwnershipType(ownership: string | null | undefined): string | null {
  if (!ownership || typeof ownership !== 'string') return null;
  
  const cleaned = ownership.trim().toUpperCase();
  return (cleaned === 'D' || cleaned === 'I') ? cleaned : null;
}

// =====================================================
// DATA FETCHING AND TRANSFORMATION FUNCTIONS
// =====================================================

/**
 * Fetch holders data from finance-query API for a specific holder type
 */
async function fetchHoldersData(
  symbol: string,
  holderType: HolderType
): Promise<HoldersAPIResponse | null> {
  try {
    const url = `https://finance-query.onrender.com/v1/holders/${symbol}?holder_type=${holderType}`;
    console.log(`Fetching ${holderType} holders for ${symbol} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-HoldersFetcher/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No ${holderType} holders found for ${symbol}`);
        return null;
      }
      console.error(`API error for ${symbol} ${holderType}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: HoldersAPIResponse = await response.json();
    
    // Validate required fields
    if (!data || !data.symbol || !data.holder_type) {
      console.log(`Invalid ${holderType} holders data for ${symbol}`);
      return null;
    }
    
    console.log(`Successfully fetched ${holderType} holders data for ${symbol}`);
    return data;
    
  } catch (error) {
    console.error(`Error fetching ${holderType} holders for ${symbol}:`, error);
    return null;
  }
}

/**
 * Transform institutional holders API data to database records
 */
function transformInstitutionalHolders(
  symbol: string,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  if (!apiData.institutional_holders || apiData.institutional_holders.length === 0) {
    return [];
  }
  
  return apiData.institutional_holders.map(holder => ({
    symbol: symbol.toUpperCase(),
    holder_type: 'institutional' as HolderType,
    holder_name: cleanHolderName(holder.holder),
    shares: parseShares(holder.shares),
    value: parseValueToCents(holder.value),
    date_reported: parseDate(holder.date_reported),
    data_source: 'finance_api'
  }));
}

/**
 * Transform mutual fund holders API data to database records
 */
function transformMutualFundHolders(
  symbol: string,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  if (!apiData.mutualfund_holders || apiData.mutualfund_holders.length === 0) {
    return [];
  }
  
  return apiData.mutualfund_holders.map(holder => ({
    symbol: symbol.toUpperCase(),
    holder_type: 'mutualfund' as HolderType,
    holder_name: cleanHolderName(holder.holder),
    shares: parseShares(holder.shares),
    value: parseValueToCents(holder.value),
    date_reported: parseDate(holder.date_reported),
    data_source: 'finance_api'
  }));
}

/**
 * Transform insider transactions API data to database records
 */
function transformInsiderTransactions(
  symbol: string,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  if (!apiData.insider_transactions || apiData.insider_transactions.length === 0) {
    return [];
  }
  
  return apiData.insider_transactions.map(transaction => ({
    symbol: symbol.toUpperCase(),
    holder_type: 'insider_transactions' as HolderType,
    holder_name: cleanHolderName(transaction.insider),
    shares: parseShares(transaction.shares),
    value: parseValueToCents(transaction.value),
    date_reported: parseDate(transaction.start_date),
    insider_position: cleanInsiderPosition(transaction.position),
    transaction_type: cleanTransactionType(transaction.transaction),
    ownership_type: validateOwnershipType(transaction.ownership),
    data_source: 'finance_api'
  }));
}

/**
 * Transform insider roster API data to database records
 */
function transformInsiderRoster(
  symbol: string,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  if (!apiData.insider_roster || apiData.insider_roster.length === 0) {
    return [];
  }
  
  return apiData.insider_roster.map(insider => ({
    symbol: symbol.toUpperCase(),
    holder_type: 'insider_roster' as HolderType,
    holder_name: cleanHolderName(insider.insider),
    insider_position: cleanInsiderPosition(insider.position),
    most_recent_transaction: insider.most_recent_transaction || null,
    latest_transaction_date: parseDate(insider.latest_transaction_date),
    shares_owned_directly: parseShares(insider.shares_owned_directly),
    shares_owned_indirectly: parseShares(insider.shares_owned_indirectly),
    position_direct_date: parseDate(insider.position_direct_date),
    data_source: 'finance_api'
  }));
}

/**
 * Transform insider purchases summary API data to database record
 */
function transformInsiderPurchases(
  symbol: string,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  if (!apiData.insider_purchases) {
    return [];
  }
  
  const purchases = apiData.insider_purchases;
  
  return [{
    symbol: symbol.toUpperCase(),
    holder_type: 'insider_purchases' as HolderType,
    summary_period: purchases.summary_period || '6m',
    purchases_shares: parseShares(purchases.purchases_shares),
    purchases_transactions: purchases.purchases_transactions || null,
    sales_shares: parseShares(purchases.sales_shares),
    sales_transactions: purchases.sales_transactions || null,
    net_shares: parseShares(purchases.net_shares),
    net_transactions: purchases.net_transactions || null,
    total_insider_shares: parseShares(purchases.total_insider_shares),
    net_percent_insider_shares: parsePercentage(purchases.net_percent_insider_shares),
    buy_percent_insider_shares: parsePercentage(purchases.buy_percent_insider_shares),
    sell_percent_insider_shares: parsePercentage(purchases.sell_percent_insider_shares),
    data_source: 'finance_api'
  }];
}

/**
 * Transform API response to database records based on holder type
 */
function transformHoldersData(
  symbol: string,
  holderType: HolderType,
  apiData: HoldersAPIResponse
): HolderRecord[] {
  switch (holderType) {
    case 'institutional':
      return transformInstitutionalHolders(symbol, apiData);
    case 'mutualfund':
      return transformMutualFundHolders(symbol, apiData);
    case 'insider_transactions':
      return transformInsiderTransactions(symbol, apiData);
    case 'insider_roster':
      return transformInsiderRoster(symbol, apiData);
    case 'insider_purchases':
      return transformInsiderPurchases(symbol, apiData);
    default:
      console.error(`Unknown holder type: ${holderType}`);
      return [];
  }
}

/**
 * Check if holder data exists and is recent for a symbol and holder type
 */
async function shouldRefreshHolderData(
  supabase: SupabaseClient,
  symbol: string,
  holderType: HolderType,
  refreshThresholdDays: number = 7
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('holders')
      .select('created_at')
      .eq('symbol', symbol)
      .eq('holder_type', holderType)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error(`Error checking existing data for ${symbol} ${holderType}:`, error);
      return true; // Refresh if we can't determine
    }
    
    if (!data || data.length === 0) {
      console.log(`No existing ${holderType} data for ${symbol}, needs refresh`);
      return true; // No data exists, need to fetch
    }
    
    const lastUpdated = new Date(data[0].created_at);
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    
    const shouldRefresh = daysSinceUpdate > refreshThresholdDays;
    
    if (shouldRefresh) {
      console.log(`${symbol} ${holderType} data is ${Math.floor(daysSinceUpdate)} days old, refreshing`);
    } else {
      console.log(`${symbol} ${holderType} data is ${Math.floor(daysSinceUpdate)} days old, skipping`);
    }
    
    return shouldRefresh;
  } catch (error) {
    console.error(`Error in shouldRefreshHolderData for ${symbol} ${holderType}:`, error);
    return true; // Refresh on error
  }
}

/**
 * Get active symbols from stock_quotes table (matching other Edge Functions)
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
      .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 10) // Basic symbol validation
      .map(symbol => symbol.toUpperCase());
      
    console.log(`Found ${uniqueSymbols.length} symbols in stock_quotes table for holders processing`);
    
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getActiveSymbolsFromStockQuotes:', error);
    return [];
  }
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Validate holder records before saving to database
 */
function validateHolderRecords(records: HolderRecord[]): {
  valid: HolderRecord[];
  invalid: { record: Partial<HolderRecord>; reason: string }[];
} {
  const valid: HolderRecord[] = [];
  const invalid: { record: Partial<HolderRecord>; reason: string }[] = [];
  
  for (const record of records) {
    // Check required fields
    if (!record.symbol || record.symbol.trim().length === 0) {
      invalid.push({ record, reason: 'Missing or empty symbol' });
      continue;
    }
    
    if (!record.holder_type) {
      invalid.push({ record, reason: 'Missing holder_type' });
      continue;
    }
    
    const validHolderTypes: HolderType[] = ['institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster'];
    if (!validHolderTypes.includes(record.holder_type)) {
      invalid.push({ record, reason: `Invalid holder_type: ${record.holder_type}` });
      continue;
    }
    
    if (!record.data_source || record.data_source.trim().length === 0) {
      invalid.push({ record, reason: 'Missing data_source' });
      continue;
    }
    
    // Type-specific validation
    if (['institutional', 'mutualfund', 'insider_transactions', 'insider_roster'].includes(record.holder_type)) {
      if (!record.holder_name || record.holder_name.trim().length === 0) {
        invalid.push({ record, reason: `Missing holder_name for ${record.holder_type}` });
        continue;
      }
    }
    
    // Validate insider purchases has required summary data
    if (record.holder_type === 'insider_purchases') {
      const hasRequiredSummaryData = record.purchases_shares !== null || 
                                    record.sales_shares !== null || 
                                    record.net_shares !== null;
      if (!hasRequiredSummaryData) {
        invalid.push({ record, reason: 'Missing required summary data for insider_purchases' });
        continue;
      }
    }
    
    // Validate that institutional/mutualfund have shares or value
    if (['institutional', 'mutualfund'].includes(record.holder_type)) {
      const hasFinancialData = record.shares !== null || record.value !== null;
      if (!hasFinancialData) {
        invalid.push({ record, reason: `Missing shares or value data for ${record.holder_type}` });
        continue;
      }
    }
    
    valid.push(record);
  }
  
  return { valid, invalid };
}

/**
 * Clear existing holder data for a symbol and holder type before inserting new data
 */
async function clearExistingHolderData(
  supabase: SupabaseClient,
  symbol: string,
  holderType: HolderType
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Clearing existing ${holderType} data for ${symbol}`);
    
    const { error } = await supabase
      .from('holders')
      .delete()
      .eq('symbol', symbol)
      .eq('holder_type', holderType);
    
    if (error) {
      console.error(`Error clearing existing ${holderType} data for ${symbol}:`, error);
      return { success: false, message: `Clear error: ${error.message}` };
    }
    
    console.log(`Successfully cleared existing ${holderType} data for ${symbol}`);
    return { success: true, message: 'Existing data cleared' };
    
  } catch (error) {
    console.error(`Error in clearExistingHolderData for ${symbol} ${holderType}:`, error);
    return { success: false, message: `Clear error: ${error}` };
  }
}

/**
 * Save holder records to database
 */
async function saveHolderRecords(
  supabase: SupabaseClient,
  records: HolderRecord[]
): Promise<{ success: boolean; message: string; savedCount: number }> {
  if (records.length === 0) {
    return { success: true, message: 'No records to save', savedCount: 0 };
  }
  
  try {
    console.log(`Saving ${records.length} holder records to database`);
    
    const { data, error } = await supabase
      .from('holders')
      .insert(records)
      .select('id');
    
    if (error) {
      console.error('Database error saving holder data:', error);
      return { 
        success: false, 
        message: `Database error: ${error.message}`, 
        savedCount: 0 
      };
    }
    
    const savedCount = data ? data.length : records.length;
    console.log(`Successfully saved ${savedCount} holder records`);
    
    return { 
      success: true, 
      message: `Saved ${savedCount} records`, 
      savedCount 
    };
    
  } catch (error) {
    console.error('Error saving holder data:', error);
    return { 
      success: false, 
      message: `Save error: ${error}`, 
      savedCount: 0 
    };
  }
}

/**
 * Process holders data for a single symbol and holder type
 */
async function processHoldersForSymbolAndType(
  supabase: SupabaseClient,
  symbol: string,
  holderType: HolderType,
  options: {
    forceRefresh?: boolean;
    refreshThresholdDays?: number;
  } = {}
): Promise<ProcessingResult> {
  try {
    const { forceRefresh = false, refreshThresholdDays = 7 } = options;
    
    console.log(`\n=== Processing ${holderType} holders for ${symbol} ===`);
    
    // Check if we need to refresh this data
    if (!forceRefresh) {
      const needsRefresh = await shouldRefreshHolderData(supabase, symbol, holderType, refreshThresholdDays);
      if (!needsRefresh) {
        return {
          symbol,
          holder_type: holderType,
          status: 'exists',
          message: `${holderType} data is recent, skipped`,
          records_processed: 0
        };
      }
    }
    
    // Fetch data from API
    const apiData = await fetchHoldersData(symbol, holderType);
    
    if (!apiData) {
      return {
        symbol,
        holder_type: holderType,
        status: 'no_data',
        message: `No ${holderType} data available from API`,
        records_processed: 0
      };
    }
    
    // Transform API data to database records
    const transformedRecords = transformHoldersData(symbol, holderType, apiData);
    
    if (transformedRecords.length === 0) {
      return {
        symbol,
        holder_type: holderType,
        status: 'no_data',
        message: `No ${holderType} records after transformation`,
        records_processed: 0
      };
    }
    
    // Validate records
    const { valid: validRecords, invalid: invalidRecords } = validateHolderRecords(transformedRecords);
    
    if (invalidRecords.length > 0) {
      console.log(`${symbol} ${holderType}: ${invalidRecords.length} invalid records filtered out:`, 
                 invalidRecords.map(r => r.reason));
    }
    
    if (validRecords.length === 0) {
      return {
        symbol,
        holder_type: holderType,
        status: 'error',
        message: `No valid ${holderType} records after validation`,
        records_processed: 0
      };
    }
    
    // Clear existing data for this symbol and holder type
    const clearResult = await clearExistingHolderData(supabase, symbol, holderType);
    if (!clearResult.success) {
      return {
        symbol,
        holder_type: holderType,
        status: 'error',
        message: `Failed to clear existing data: ${clearResult.message}`,
        records_processed: 0
      };
    }
    
    // Save new data
    const saveResult = await saveHolderRecords(supabase, validRecords);
    
    if (!saveResult.success) {
      return {
        symbol,
        holder_type: holderType,
        status: 'error',
        message: `Save failed: ${saveResult.message}`,
        records_processed: 0
      };
    }
    
    console.log(`${symbol} ${holderType}: Successfully processed ${validRecords.length} records`);
    
    return {
      symbol,
      holder_type: holderType,
      status: 'success',
      message: `Processed ${validRecords.length} ${holderType} records`,
      records_processed: saveResult.savedCount
    };
    
  } catch (error) {
    console.error(`Error processing ${holderType} holders for ${symbol}:`, error);
    return {
      symbol,
      holder_type: holderType,
      status: 'error',
      message: `Processing error: ${error}`,
      records_processed: 0
    };
  }
}

/**
 * Process all holder types for a single symbol
 */
async function processAllHoldersForSymbol(
  supabase: SupabaseClient,
  symbol: string,
  holderTypes: HolderType[],
  options: {
    forceRefresh?: boolean;
    refreshThresholdDays?: number;
  } = {}
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];
  
  console.log(`\n=== Processing all holder types for ${symbol} ===`);
  console.log(`Holder types: ${holderTypes.join(', ')}`);
  
  // Process each holder type sequentially to avoid overwhelming the API
  for (const holderType of holderTypes) {
    const result = await processHoldersForSymbolAndType(supabase, symbol, holderType, options);
    results.push(result);
    
    // Add small delay between requests to be respectful to the API
    if (holderTypes.indexOf(holderType) < holderTypes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }
  
  return results;
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
    console.log('\n=== Holders Edge Function Started ===');
    console.log(`Request method: ${req.method}`);
    console.log(`Request URL: ${req.url}`);

    // Parse request parameters
    let requestBody: any = {};
    let symbols: string[] = [];
    let holderTypes: HolderType[] = ['institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster'];
    let maxSymbols: number = 5; // Conservative default for holders data
    let forceRefresh: boolean = false;
    let refreshThresholdDays: number = 7;

    // Parse request body for POST requests
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
        symbols = requestBody.symbols || [];
        holderTypes = requestBody.holderTypes || holderTypes;
        maxSymbols = requestBody.maxSymbols || maxSymbols;
        forceRefresh = requestBody.forceRefresh || false;
        refreshThresholdDays = requestBody.refreshThresholdDays || refreshThresholdDays;
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
      
      const holderTypesParam = url.searchParams.get('holderTypes');
      if (holderTypesParam) {
        holderTypes = holderTypesParam.split(',').map(s => s.trim()) as HolderType[];
      }
      
      maxSymbols = parseInt(url.searchParams.get('maxSymbols') || String(maxSymbols), 10);
      forceRefresh = url.searchParams.get('forceRefresh') === 'true';
      refreshThresholdDays = parseInt(url.searchParams.get('refreshThresholdDays') || String(refreshThresholdDays), 10);
    }

    // Validate holder types
    const validHolderTypes: HolderType[] = ['institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster'];
    holderTypes = holderTypes.filter(type => validHolderTypes.includes(type));
    
    if (holderTypes.length === 0) {
      holderTypes = validHolderTypes; // Default to all types if none valid
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
            total_symbols: 0,
            total_holder_types: 0,
            successful: 0,
            exists: 0,
            no_data: 0,
            errors: 0,
            total_records_processed: 0,
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
    console.log(`Holder types: ${holderTypes.join(', ')}`);
    console.log(`Options: forceRefresh=${forceRefresh}, refreshThresholdDays=${refreshThresholdDays}`);

    // Process all symbols with batch processing for rate limiting
    const allResults: ProcessingResult[] = [];
    const batchSize = 2; // Process 2 symbols concurrently for holders data
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      console.log(`\n--- Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}: ${batch.join(', ')} ---`);
      
      const batchPromises = batch.map(symbol => 
        processAllHoldersForSymbol(supabaseClient, symbol, holderTypes, {
          forceRefresh,
          refreshThresholdDays
        })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results from batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        } else {
          const symbol = batch[j];
          console.error(`Batch processing failed for ${symbol}:`, result.reason);
          // Add error results for all holder types for this symbol
          for (const holderType of holderTypes) {
            allResults.push({
              symbol,
              holder_type: holderType,
              status: 'error',
              message: `Batch processing failed: ${result.reason}`,
              records_processed: 0
            });
          }
        }
      }
      
      // Rate limiting between batches
      if (i + batchSize < symbols.length) {
        console.log('Waiting 3 seconds between batches for rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Calculate summary statistics
    const summary = {
      total_symbols: symbols.length,
      total_holder_types: holderTypes.length,
      total_combinations: symbols.length * holderTypes.length,
      successful: allResults.filter(r => r.status === 'success').length,
      exists: allResults.filter(r => r.status === 'exists').length,
      no_data: allResults.filter(r => r.status === 'no_data').length,
      errors: allResults.filter(r => r.status === 'error').length,
      total_records_processed: allResults.reduce((sum, r) => sum + (r.records_processed || 0), 0),
      processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
      holder_types_processed: holderTypes
    };

    console.log('\n=== Holders Processing Complete ===');
    console.log(`Summary: ${summary.successful} successful, ${summary.exists} exists, ${summary.no_data} no_data, ${summary.errors} errors`);
    console.log(`Total records processed: ${summary.total_records_processed}`);
    console.log(`Processing time: ${summary.processing_time_seconds} seconds`);

    // Group results by symbol for better readability
    const resultsBySymbol: { [symbol: string]: ProcessingResult[] } = {};
    for (const result of allResults) {
      if (!resultsBySymbol[result.symbol]) {
        resultsBySymbol[result.symbol] = [];
      }
      resultsBySymbol[result.symbol].push(result);
    }

    // Return response
    const response = {
      success: true,
      message: `Processed ${symbols.length} symbols with ${holderTypes.length} holder types each`,
      results: allResults,
      results_by_symbol: resultsBySymbol,
      summary,
      processing_options: {
        symbols_requested: symbols,
        holder_types: holderTypes,
        forceRefresh,
        refreshThresholdDays,
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
