/**
 * Supabase Edge Function: Earnings Transcript Fetcher
 * 
 * This Edge Function fetches earnings call transcripts from finance-query.onrender.com API,
 * processes the data to match our database schema, and saves them to the earnings_transcripts table.
 * The function prevents duplicate fetching by checking existing records.
 * 
 * API Endpoint: https://finance-query.onrender.com/v1/earnings-transcript/{symbol}?quarter={quarter}&year={year}
 * 
 * Features:
 * - Fetches transcripts for symbols from stock_quotes table
 * - Prevents duplicate data fetching
 * - Validates and processes transcript data
 * - Handles API rate limiting and errors gracefully
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for earnings transcript data
interface TranscriptItem {
  symbol: string;
  quarter: string;
  year: number;
  date: string;
  transcript: string;
  participants: string[];
  metadata?: {
    source: string;
    retrieved_at: string;
    transcripts_id: number;
  };
}

interface EarningsTranscriptAPIResponse {
  symbol: string;
  transcripts: TranscriptItem[];
}

interface EarningsTranscriptAPI {
  symbol: string;
  quarter: string;
  year: number;
  date: string;
  transcript: string;
  participants: string[];
}

interface EarningsTranscriptDB {
  symbol: string;
  exchange_id?: number;
  quarter: string;
  year: number;
  date: string;
  transcript: string;
  participants: string[];
  transcript_length: number;
  transcript_language: string;
  source: string;
  retrieved_at: string;
}

interface ProcessingResult {
  symbol: string;
  quarter: string;
  year: number;
  status: 'success' | 'error' | 'exists' | 'no_data';
  message?: string;
  transcript_length?: number;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get the current quarter and year
 */
function getCurrentQuarterAndYear(): { quarter: string; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1; // getMonth() returns 0-11
  const year = now.getFullYear();
  
  let quarter: string;
  if (month >= 1 && month <= 3) {
    quarter = 'Q1';
  } else if (month >= 4 && month <= 6) {
    quarter = 'Q2';
  } else if (month >= 7 && month <= 9) {
    quarter = 'Q3';
  } else {
    quarter = 'Q4';
  }
  
  return { quarter, year };
}

/**
 * Get previous quarters for fetching historical data
 */
function getPreviousQuarters(count: number = 4): Array<{ quarter: string; year: number }> {
  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarterAndYear();
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const currentQuarterIndex = quarters.indexOf(currentQuarter);
  
  const result = [];
  let year = currentYear;
  let quarterIndex = currentQuarterIndex;
  
  for (let i = 0; i < count; i++) {
    result.push({ quarter: quarters[quarterIndex], year });
    
    quarterIndex--;
    if (quarterIndex < 0) {
      quarterIndex = 3;
      year--;
    }
  }
  
  return result;
}

/**
 * Get all quarters for the last N years (for new stocks)
 */
function getAllQuartersForYears(years: number = 5): Array<{ quarter: string; year: number }> {
  const currentYear = new Date().getFullYear();
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const result = [];
  
  for (let year = currentYear; year >= currentYear - years + 1; year--) {
    for (const quarter of quarters) {
      result.push({ quarter, year });
    }
  }
  
  return result.reverse(); // Return in chronological order
}

/**
 * Get current quarter only (for existing stocks)
 */
function getCurrentQuarterOnly(): Array<{ quarter: string; year: number }> {
  const { quarter, year } = getCurrentQuarterAndYear();
  return [{ quarter, year }];
}

/**
 * Fetch earnings transcript from finance-query API
 */
async function fetchEarningsTranscript(
  symbol: string, 
  quarter: string, 
  year: number
): Promise<EarningsTranscriptAPI | null> {
  try {
    const url = `https://finance-query.onrender.com/v1/earnings-transcript/${symbol}?quarter=${quarter}&year=${year}`;
    console.log(`Fetching transcript for ${symbol} ${quarter} ${year} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tradistry-EdgeFunction/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No transcript found for ${symbol} ${quarter} ${year}`);
        return null;
      }
      console.error(`API error for ${symbol} ${quarter} ${year}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: EarningsTranscriptAPIResponse = await response.json();
    
    // Log the received data structure for debugging
    console.log(`API response for ${symbol} ${quarter} ${year}:`, {
      hasSymbol: !!data.symbol,
      hasTranscripts: !!data.transcripts,
      transcriptsCount: Array.isArray(data.transcripts) ? data.transcripts.length : 0,
      transcriptsType: typeof data.transcripts
    });
    
    // Validate required fields - API returns transcripts array
    if (!data || !data.transcripts || !Array.isArray(data.transcripts) || data.transcripts.length === 0) {
      console.log(`No transcript data found for ${symbol} ${quarter} ${year}`);
      return null;
    }
    
    // Find the matching transcript for the requested quarter and year
    const matchingTranscript = data.transcripts.find(t => 
      t.quarter === quarter && t.year === year
    );
    
    if (!matchingTranscript) {
      console.log(`No matching transcript found for ${symbol} ${quarter} ${year}`);
      return null;
    }
    
    // Log the matching transcript details
    console.log(`Found matching transcript for ${symbol} ${quarter} ${year}:`, {
      hasTranscript: !!matchingTranscript.transcript,
      transcriptLength: matchingTranscript.transcript ? matchingTranscript.transcript.length : 0,
      hasParticipants: !!matchingTranscript.participants,
      participantsCount: Array.isArray(matchingTranscript.participants) ? matchingTranscript.participants.length : 0
    });
    
    return {
      symbol: matchingTranscript.symbol || symbol,
      quarter: matchingTranscript.quarter || quarter,
      year: matchingTranscript.year || year,
      date: matchingTranscript.date,
      transcript: matchingTranscript.transcript,
      participants: Array.isArray(matchingTranscript.participants) ? matchingTranscript.participants : []
    };
    
  } catch (error) {
    console.error(`Error fetching transcript for ${symbol} ${quarter} ${year}:`, error);
    return null;
  }
}

/**
 * Check if transcript already exists in database
 */
async function transcriptExists(
  supabase: SupabaseClient,
  symbol: string,
  quarter: string,
  year: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('earnings_transcripts')
      .select('id')
      .eq('symbol', symbol)
      .eq('quarter', quarter)
      .eq('year', year)
      .eq('source', 'finance-query-api')
      .limit(1);
    
    if (error) {
      console.error(`Error checking existing transcript for ${symbol} ${quarter} ${year}:`, error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error(`Error in transcriptExists for ${symbol} ${quarter} ${year}:`, error);
    return false;
  }
}

/**
 * Check if a stock is new (has no existing transcript data)
 */
async function isNewStock(supabase: SupabaseClient, symbol: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('earnings_transcripts')
      .select('id')
      .eq('symbol', symbol)
      .eq('source', 'finance-query-api')
      .limit(1);
    
    if (error) {
      console.error(`Error checking if ${symbol} is new stock:`, error);
      return true; // Assume new stock if error occurs
    }
    
    return !data || data.length === 0;
  } catch (error) {
    console.error(`Error in isNewStock for ${symbol}:`, error);
    return true; // Assume new stock if error occurs
  }
}

/**
 * Get existing transcript quarters for a symbol
 */
async function getExistingTranscriptQuarters(
  supabase: SupabaseClient, 
  symbol: string
): Promise<Array<{ quarter: string; year: number }>> {
  try {
    const { data, error } = await supabase
      .from('earnings_transcripts')
      .select('quarter, year')
      .eq('symbol', symbol)
      .eq('source', 'finance-query-api')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false });
    
    if (error) {
      console.error(`Error getting existing quarters for ${symbol}:`, error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error(`Error in getExistingTranscriptQuarters for ${symbol}:`, error);
    return [];
  }
}

/**
 * Determine which quarters to fetch for a symbol based on whether it's new or existing
 */
async function getQuartersToFetch(
  supabase: SupabaseClient,
  symbol: string
): Promise<Array<{ quarter: string; year: number }>> {
  const stockIsNew = await isNewStock(supabase, symbol);
  
  if (stockIsNew) {
    // New stock: fetch all quarters for last 5 years
    console.log(`${symbol} is a new stock - fetching 5 years of historical data`);
    return getAllQuartersForYears(5);
  } else {
    // Existing stock: only fetch current quarter if not already exists
    console.log(`${symbol} is an existing stock - checking for current quarter data`);
    const currentQuarters = getCurrentQuarterOnly();
    const existingQuarters = await getExistingTranscriptQuarters(supabase, symbol);
    
    // Filter out quarters that already exist
    const quartersToFetch = currentQuarters.filter(current => 
      !existingQuarters.some(existing => 
        existing.quarter === current.quarter && existing.year === current.year
      )
    );
    
    if (quartersToFetch.length === 0) {
      console.log(`${symbol} current quarter data already exists - nothing to fetch`);
    } else {
      console.log(`${symbol} needs current quarter data: ${quartersToFetch.map(q => `${q.quarter} ${q.year}`).join(', ')}`);
    }
    
    return quartersToFetch;
  }
}

/**
 * Save earnings transcript to database
 */
async function saveEarningsTranscript(
  supabase: SupabaseClient,
  transcriptData: EarningsTranscriptAPI
): Promise<boolean> {
  try {
    // Prepare data for database insertion
    const dbData: Partial<EarningsTranscriptDB> = {
      symbol: transcriptData.symbol.toUpperCase(),
      quarter: transcriptData.quarter,
      year: transcriptData.year,
      date: transcriptData.date,
      transcript: transcriptData.transcript,
      participants: transcriptData.participants,
      transcript_length: transcriptData.transcript.length,
      transcript_language: 'en',
      source: 'finance-query-api',
      retrieved_at: getCurrentTimestamp()
    };
    
    // Insert the transcript data
    const { data, error } = await supabase
      .from('earnings_transcripts')
      .insert([dbData])
      .select('id');
    
    if (error) {
      console.error(`Error saving transcript for ${transcriptData.symbol} ${transcriptData.quarter} ${transcriptData.year}:`, error);
      return false;
    }
    
    if (data && data.length > 0) {
      console.log(`Successfully saved transcript for ${transcriptData.symbol} ${transcriptData.quarter} ${transcriptData.year} with ID: ${data[0].id}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error in saveEarningsTranscript for ${transcriptData.symbol}:`, error);
    return false;
  }
}

/**
 * Get symbols from stock_quotes table
 */
async function getSymbolsFromStockQuotes(supabase: SupabaseClient): Promise<string[]> {
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
    
    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    console.log(`Found ${uniqueSymbols.length} unique symbols in stock_quotes table`);
    
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getSymbolsFromStockQuotes:', error);
    return [];
  }
}

/**
 * Validate transcript data with detailed error reporting
 */
function validateTranscriptData(transcript: EarningsTranscriptAPI): { isValid: boolean; error?: string } {
  // Check required fields
  if (!transcript.symbol) {
    return { isValid: false, error: 'Missing symbol' };
  }
  
  if (!transcript.quarter) {
    return { isValid: false, error: 'Missing quarter' };
  }
  
  if (!transcript.year) {
    return { isValid: false, error: 'Missing year' };
  }
  
  if (!transcript.transcript) {
    return { isValid: false, error: 'Missing transcript content' };
  }
  
  // Validate quarter format
  if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(transcript.quarter)) {
    return { isValid: false, error: `Invalid quarter format: ${transcript.quarter}` };
  }
  
  // Validate year (reasonable range) - Allow future quarters for upcoming earnings
  const currentYear = new Date().getFullYear();
  if (transcript.year < 2000 || transcript.year > currentYear + 2) {
    return { isValid: false, error: `Year out of range: ${transcript.year}` };
  }
  
  // Validate transcript length (should have meaningful content) - More lenient
  if (transcript.transcript.length < 50) {
    return { isValid: false, error: `Transcript too short: ${transcript.transcript.length} characters` };
  }
  
  // Validate participants array - More lenient, allow empty arrays
  if (!Array.isArray(transcript.participants)) {
    return { isValid: false, error: `Participants is not an array: ${typeof transcript.participants}` };
  }
  
  return { isValid: true };
}

/**
 * Process earnings transcript for a specific symbol and quarter
 */
async function processEarningsTranscript(
  supabase: SupabaseClient,
  symbol: string,
  quarter: string,
  year: number
): Promise<ProcessingResult> {
  try {
    // Check if transcript already exists
    const exists = await transcriptExists(supabase, symbol, quarter, year);
    if (exists) {
      return {
        symbol,
        quarter,
        year,
        status: 'exists',
        message: 'Transcript already exists in database'
      };
    }
    
    // Fetch transcript from API
    const transcriptData = await fetchEarningsTranscript(symbol, quarter, year);
    if (!transcriptData) {
      return {
        symbol,
        quarter,
        year,
        status: 'no_data',
        message: 'No transcript data available from API'
      };
    }
    
    // Validate transcript data
    const validation = validateTranscriptData(transcriptData);
    if (!validation.isValid) {
      return {
        symbol,
        quarter,
        year,
        status: 'error',
        message: `Invalid transcript data: ${validation.error}`
      };
    }
    
    // Save to database
    const saved = await saveEarningsTranscript(supabase, transcriptData);
    if (!saved) {
      return {
        symbol,
        quarter,
        year,
        status: 'error',
        message: 'Failed to save transcript to database'
      };
    }
    
    return {
      symbol,
      quarter,
      year,
      status: 'success',
      transcript_length: transcriptData.transcript.length
    };
    
  } catch (error) {
    console.error(`Error processing transcript for ${symbol} ${quarter} ${year}:`, error);
    return {
      symbol,
      quarter,
      year,
      status: 'error',
      message: error.message
    };
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
    
    console.log('Starting earnings transcript fetch...');
    
    // Parse request body for specific parameters
    let requestedSymbols: string[] | null = null;
    let requestedQuarters: Array<{ quarter: string; year: number }> | null = null;
    let forceHistoricalFetch: boolean = false;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedSymbols = body.symbols;
        requestedQuarters = body.quarters;
        forceHistoricalFetch = body.forceHistoricalFetch || false;
      } catch {
        // Continue with default behavior if request body parsing fails
      }
    }
    
    // Get symbols to process
    const symbolsToProcess = requestedSymbols || await getSymbolsFromStockQuotes(supabaseClient);
    
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
    
    console.log(`Found ${symbolsToProcess.length} symbols to process`);
    
    let processedCount = 0;
    let successCount = 0;
    let existsCount = 0;
    let errorCount = 0;
    let noDataCount = 0;
    const results: ProcessingResult[] = [];
    
    // Process symbols in batches to respect rate limits
    const batchSize = 3; // Conservative batch size for API calls
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(symbolsToProcess.length / batchSize)}`);
        
        // Process each symbol in the batch
        for (const symbol of batch) {
          console.log(`Processing transcripts for ${symbol}...`);
          
          // Determine quarters to fetch based on stock status (new vs existing)
          let quartersToProcess: Array<{ quarter: string; year: number }>;
          
          if (requestedQuarters) {
            // Use explicitly requested quarters
            quartersToProcess = requestedQuarters;
            console.log(`Using requested quarters for ${symbol}:`, quartersToProcess);
          } else if (forceHistoricalFetch) {
            // Force historical fetch for all symbols
            quartersToProcess = getAllQuartersForYears(5);
            console.log(`Force historical fetch for ${symbol} - fetching 5 years`);
          } else {
            // Smart logic: new stocks get 5 years, existing stocks get current quarter only
            quartersToProcess = await getQuartersToFetch(supabaseClient, symbol);
          }
          
          if (quartersToProcess.length === 0) {
            console.log(`No quarters to process for ${symbol} - skipping`);
            continue;
          }
          
          console.log(`Processing ${quartersToProcess.length} quarters for ${symbol}`);
          
          // Process each quarter for this symbol
          for (const { quarter, year } of quartersToProcess) {
            const result = await processEarningsTranscript(supabaseClient, symbol, quarter, year);
            
            results.push(result);
            processedCount++;
            
            switch (result.status) {
              case 'success':
                successCount++;
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
            
            // Small delay between API calls to be respectful
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Delay between symbols
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errorCount += batch.length;
        console.error(`Error processing batch:`, error);
        
        for (const symbol of batch) {
          results.push({
            symbol,
            quarter: 'unknown',
            year: 0,
            status: 'error',
            message: `Batch processing error: ${errorMessage}`
          });
        }
      }
      
      // Delay between batches to respect rate limits
      if (i + batchSize < symbolsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const response = {
      success: true,
      message: 'Earnings transcript fetch completed',
      summary: {
        total_symbols: symbolsToProcess.length,
        total_requests: processedCount,
        successful: successCount,
        already_exists: existsCount,
        no_data: noDataCount,
        errors: errorCount,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        message: 'Internal server error in earnings transcript fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
