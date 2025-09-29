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
    const data: FinnhubCompanyProfile = await response.json();
    
    return data.name || null;
  } catch (error) {
    console.error(`Finnhub company name error for ${symbol}:`, error);
    return null;
  }
}
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY')!;
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey || !alphaVantageApiKey || !finnhubApiKey) {
      throw new Error('Missing required environment variables');
    }

    // Function to fetch company overview from Alpha Vantage
    const fetchAlphaVantageCompanyName = async (symbol: string): Promise<string | null> => {
      try {
        const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
        const response = await fetch(overviewUrl);
        const data: AlphaVantageOverviewResponse = await response.json();
        
        return data.Name || null;
      } catch (error) {
        console.error(`Alpha Vantage company name error for ${symbol}:`, error);
        return null;
      }
    };

    // Function to fetch quote data from Alpha Vantage
    const fetchAlphaVantageQuote = async (symbol: string): Promise<StockQuoteData | null> => {
      try {
        // Fetch both quote and company name in parallel
        const [quoteResponse, companyName] = await Promise.allSettled([
          fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageApiKey}`),
          fetchAlphaVantageCompanyName(symbol)
        ]);

        if (quoteResponse.status !== 'fulfilled') {
          return null;
        }

        const data: AlphaVantageResponse = await quoteResponse.value.json();

        if (data["Error Message"] || data["Note"] || !data["Global Quote"]) {
          return null;
        }

        const quote = data["Global Quote"];
        return {
          price: parseFloat(quote["05. price"]),
          percent_change: parseFloat(quote["10. change percent"].replace('%', '')),
          company_name: companyName.status === 'fulfilled' ? companyName.value : undefined,
          source: 'alphavantage'
        };
      } catch (error) {
        console.error(`Alpha Vantage error for ${symbol}:`, error);
        return null;
      }
    };

    // Function to fetch company profile from Finnhub
    const fetchFinnhubCompanyName = async (symbol: string): Promise<string | null> => {
      try {
        const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${finnhubApiKey}`;
        const response = await fetch(profileUrl);
        const data: FinnhubCompanyProfile = await response.json();
        
        return data.name || null;
      } catch (error) {
        console.error(`Finnhub company name error for ${symbol}:`, error);
        return null;
      }
    };

    // Function to fetch quote data from Finnhub
    const fetchFinnhubQuote = async (symbol: string): Promise<StockQuoteData | null> => {
      try {
        // Fetch both quote and company name in parallel
        const [quoteResponse, companyName] = await Promise.allSettled([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`),
          fetchFinnhubCompanyName(symbol)
        ]);

        if (quoteResponse.status !== 'fulfilled') {
          return null;
        }

        const data: FinnhubQuote = await quoteResponse.value.json();

        if (!data.c || data.c === 0) {
          return null;
        }

        return {
          price: data.c,
          percent_change: data.dp,
          company_name: companyName.status === 'fulfilled' ? companyName.value : undefined,
          source: 'finnhub'
        };
      } catch (error) {
        console.error(`Finnhub error for ${symbol}:`, error);
        return null;
      }
    };

    // Function to get quote data with fallback
    const getQuoteData = async (symbol: string): Promise<StockQuoteData | null> => {
      // Try both providers in parallel
      const [alphaVantageData, finnhubData] = await Promise.allSettled([
        fetchAlphaVantageQuote(symbol),
        fetchFinnhubQuote(symbol)
      ]);

      // Prefer Alpha Vantage if available
      if (alphaVantageData.status === 'fulfilled' && alphaVantageData.value) {
        return alphaVantageData.value;
      }

      // Fallback to Finnhub
      if (finnhubData.status === 'fulfilled' && finnhubData.value) {
        return finnhubData.value;
      }

      return null;
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all unique symbols from watchlist_items
    const { data: watchlistItems, error: fetchError } = await supabase
      .from('watchlist_items')
      .select('id, symbol, company_name, price, percent_change')
      .order('symbol');

    if (fetchError) {
      console.error('Error fetching watchlist items:', fetchError);
      throw fetchError;
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No watchlist items to update',
          updated_count: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Group items by symbol to avoid duplicate API calls
    const symbolGroups = new Map<string, WatchlistItem[]>();
    watchlistItems.forEach(item => {
      if (!symbolGroups.has(item.symbol)) {
        symbolGroups.set(item.symbol, []);
      }
      symbolGroups.get(item.symbol)!.push(item);
    });

    const updatePromises: Promise<any>[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each unique symbol
    for (const [symbol, items] of symbolGroups) {
      try {
        // Get quote data using dual provider approach
        const quoteData = await getQuoteData(symbol);

        if (!quoteData) {
          console.error(`No quote data available for ${symbol} from any provider`);
          errorCount++;
          continue;
        }

        console.log(`Successfully fetched data for ${symbol} from ${quoteData.source}`);

        // Update all items with this symbol
        for (const item of items) {
          const updateData: any = {
            price: quoteData.price,
            percent_change: quoteData.percent_change,
            updated_at: new Date().toISOString()
          };

          // Only update company_name if we have it and it's different from current
          if (quoteData.company_name && quoteData.company_name !== item.company_name) {
            updateData.company_name = quoteData.company_name;
          }

          const updatePromise = supabase
            .from('watchlist_items')
            .update(updateData)
            .eq('id', item.id);

          updatePromises.push(updatePromise);
        }

        successCount++;
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between calls
        
      } catch (error) {
        console.error(`Error processing symbol ${symbol}:`, error);
        errorCount++;
      }
    }

    // Execute all updates
    const updateResults = await Promise.allSettled(updatePromises);
    let updatedItemsCount = 0;

    updateResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        updatedItemsCount++;
      } else {
        console.error(`Update failed for item:`, result);
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Watchlist update completed',
        symbols_processed: symbolGroups.size,
        symbols_successful: successCount,
        symbols_failed: errorCount,
        items_updated: updatedItemsCount,
        total_items: watchlistItems.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Watchlist update error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});