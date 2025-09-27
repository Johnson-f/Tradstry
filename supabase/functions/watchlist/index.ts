import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };

// REDESIGNED: Watchlist item without price data
interface WatchlistItem {
  id: number;
  symbol: string;  // Ticker symbol as TEXT (not number)
  company_name?: string;
  // REMOVED: price, percent_change (use stock_quotes for real-time prices)
}

// Interface for company metadata fetching
interface CompanyMetadata {
  symbol: string;
  company_name?: string;
  source: 'finnhub' | 'alpha_vantage';
}

// Interface for Alpha Vantage company overview (for company names only)
interface AlphaVantageOverviewResponse {
  Symbol: string;
  Name: string;
  Description?: string;
}

// Interface for Finnhub company profile (for company names only)  
interface FinnhubCompanyProfile {
  ticker: string;
  name: string;
  country?: string;
  currency?: string;
  exchange?: string;
}

/**
 * Validate ticker symbol format and ensure proper text storage
 */
function validateAndFormatSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // Ensure symbol is stored as TEXT (not number) and properly formatted
  const symbolText = symbol.toString().toUpperCase().trim();
  
  // Validate that symbol looks like a ticker (letters/digits, reasonable length)
  if (!/^[A-Z0-9._-]{1,20}$/.test(symbolText)) {
    console.warn(`Invalid ticker symbol format: ${symbolText}`);
    return null;
  }
  
  return symbolText;
}

/**
 * Fetch company name from Alpha Vantage
 */
async function fetchAlphaVantageCompanyName(symbol: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data: AlphaVantageOverviewResponse = await response.json();
    
    return data.Name || null;
  } catch (error) {
    console.error(`Alpha Vantage company name error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company name from Finnhub  
 */
async function fetchFinnhubCompanyName(symbol: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Finnhub API error for ${symbol}: ${response.status}`);
      return null;
    }
    
    const data: FinnhubCompanyProfile = await response.json();
    
    // Check if response is empty (invalid symbol)
    if (!data || Object.keys(data).length === 0) {
      console.error(`Finnhub API returned empty data for ${symbol}`);
      return null;
    }
    
    return data.name || null;
  } catch (error) {
    console.error(`Finnhub company name error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get company name with fallback between providers
 */
async function getCompanyName(symbol: string, alphaVantageApiKey: string, finnhubApiKey: string): Promise<string | null> {
  // Try both providers in parallel for faster response
  const [alphaVantageResult, finnhubResult] = await Promise.allSettled([
    fetchAlphaVantageCompanyName(symbol, alphaVantageApiKey),
    fetchFinnhubCompanyName(symbol, finnhubApiKey)
  ]);

  // Prefer Alpha Vantage if available
  if (alphaVantageResult.status === 'fulfilled' && alphaVantageResult.value) {
    return alphaVantageResult.value;
  }

  // Fallback to Finnhub
  if (finnhubResult.status === 'fulfilled' && finnhubResult.value) {
    return finnhubResult.value;
  }

  console.warn(`Could not fetch company name for ${symbol} from either provider`);
  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    if (!alphaVantageApiKey && !finnhubApiKey) {
      throw new Error('At least one API key (Alpha Vantage or Finnhub) is required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting watchlist metadata update...');

    // Fetch all watchlist items that need company name updates (REDESIGNED: NO PRICE COLUMNS)
    const { data: watchlistItems, error: fetchError } = await supabase
      .from('watchlist_items')
      .select('id, symbol, company_name')
      .or('company_name.is.null,company_name.eq.')
      .order('symbol');

    if (fetchError) {
      console.error('Error fetching watchlist items:', fetchError);
      throw fetchError;
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No watchlist items need company name updates',
          updated_count: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log(`Found ${watchlistItems.length} watchlist items needing company name updates`);

    // Group items by symbol to avoid duplicate API calls
    const symbolGroups = new Map<string, WatchlistItem[]>();
    watchlistItems.forEach(item => {
      const formattedSymbol = validateAndFormatSymbol(item.symbol);
      if (formattedSymbol) {
        if (!symbolGroups.has(formattedSymbol)) {
          symbolGroups.set(formattedSymbol, []);
        }
        symbolGroups.get(formattedSymbol)!.push(item);
      } else {
        console.warn(`Skipping invalid symbol: ${item.symbol}`);
      }
    });

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    // Process each unique symbol
    for (const [symbol, items] of symbolGroups) {
      try {
        console.log(`Fetching company name for ${symbol}...`);
        
        // Get company name using dual provider approach (NO PRICE DATA)
        const companyName = await getCompanyName(symbol, alphaVantageApiKey || '', finnhubApiKey || '');
        
        if (companyName) {
          // Update all items with this symbol
          const itemIds = items.map(item => item.id);
          
          const { error: updateError } = await supabase
            .from('watchlist_items')
            .update({ 
              symbol: symbol, // Ensure properly formatted symbol is stored as TEXT
              company_name: companyName,
              updated_at: new Date().toISOString()
            })
            .in('id', itemIds);

          if (updateError) {
            console.error(`Error updating items for ${symbol}:`, updateError);
            errorCount += items.length;
            results.push({
              symbol,
              status: 'error',
              message: updateError.message,
              items_affected: items.length
            });
          } else {
            console.log(`Successfully updated ${items.length} items for ${symbol} with company name: ${companyName}`);
            successCount += items.length;
            results.push({
              symbol,
              status: 'success',
              company_name: companyName,
              items_affected: items.length
            });
          }
        } else {
          console.warn(`Could not fetch company name for ${symbol}`);
          errorCount += items.length;
          results.push({
            symbol,
            status: 'error',
            message: 'Could not fetch company name from any provider',
            items_affected: items.length
          });
        }

        // Add delay between requests to be respectful to APIs
        if (symbolGroups.size > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (symbolError) {
        console.error(`Error processing symbol ${symbol}:`, symbolError);
        errorCount += items.length;
        results.push({
          symbol,
          status: 'error',
          message: symbolError instanceof Error ? symbolError.message : 'Symbol processing failed',
          items_affected: items.length
        });
      }
    }

    const response = {
      success: true,
      message: 'Watchlist metadata update completed',
      summary: {
        total_items: watchlistItems.length,
        successful_updates: successCount,
        errors: errorCount,
        unique_symbols_processed: symbolGroups.size,
        timestamp: new Date().toISOString()
      },
      results: results.slice(0, 50) // Limit response size
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
        message: 'Internal server error in watchlist update'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});