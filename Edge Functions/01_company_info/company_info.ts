/**
 * Supabase Edge Function: Company Info Multi-Provider Fetcher
 * 
 * This Edge Function fetches company information from 12 different market data providers,
 * combines the data to create comprehensive company profiles, and saves them to the database.
 * 
 * Providers used:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 * 7. Yahoo Finance
 * 8. API Ninjas
 * 9. Fiscal AI
 * 10. FRED (Federal Reserve Economic Data)
 * 11. Currents API
 * 12. NewsAPI
 */

// TODO: Create a trigger logic, that fetches comapny_info dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for company information
interface CompanyInfo {
  symbol: string;
  exchange_id?: number;
  name?: string;
  company_name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  employees?: number;
  revenue?: number;
  net_income?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  dividend_yield?: number;
  description?: string;
  website?: string;
  ceo?: string;
  headquarters?: string;
  founded?: string;
  phone?: string;
  email?: string;
  ipo_date?: string;
  currency?: string;
  fiscal_year_end?: string;
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    companyProfile?: string;
    companyOverview?: string;
    quote?: string;
  };
}

// Provider configurations
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      companyProfile: '/profile',
    }
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      companyOverview: '?function=OVERVIEW',
    }
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      companyProfile: '/stock/profile2',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v3',
    endpoints: {
      companyProfile: '/reference/tickers',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      companyProfile: '/profile',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/daily',
    endpoints: {
      companyProfile: '/meta',
    }
  },
  yahoo_finance: {
    name: 'Yahoo Finance',
    apiKey: Deno.env.get('YAHOO_FINANCE_API_KEY') || '',
    baseUrl: 'https://yfapi.net/v11/finance',
    endpoints: {
      quote: '/quoteSummary',
    }
  },
  api_ninjas: {
    name: 'API Ninjas',
    apiKey: Deno.env.get('API_NINJAS_KEY') || '',
    baseUrl: 'https://api.api-ninjas.com/v1',
    endpoints: {
      companyProfile: '/stockprice',
    }
  },
  fiscal: {
    name: 'Fiscal AI',
    apiKey: Deno.env.get('FISCAL_API_KEY') || '',
    baseUrl: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service',
    endpoints: {
      companyProfile: '/v1/accounting/od',
    }
  },
  fred: {
    name: 'Federal Reserve Economic Data',
    apiKey: Deno.env.get('FRED_API_KEY') || '',
    baseUrl: 'https://api.stlouisfed.org/fred',
    endpoints: {
      companyProfile: '/series/observations',
    }
  },
  currents_api: {
    name: 'Currents API',
    apiKey: Deno.env.get('CURRENTS_API_KEY') || '',
    baseUrl: 'https://api.currentsapi.services/v1',
    endpoints: {
      companyProfile: '/search',
    }
  },
  newsapi: {
    name: 'NewsAPI',
    apiKey: Deno.env.get('NEWSAPI_KEY') || '',
    baseUrl: 'https://newsapi.org/v2',
    endpoints: {
      companyProfile: '/everything',
    }
  }
};

/**
 * Fetch company data from Financial Modeling Prep
 */
async function fetchFromFMP(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.companyProfile}/${symbol}?apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const company = data[0];
    
    return {
      symbol: company.symbol,
      name: company.companyName,
      company_name: company.companyName,
      exchange: company.exchangeShortName,
      sector: company.sector,
      industry: company.industry,
      market_cap: company.mktCap,
      employees: company.fullTimeEmployees,
      description: company.description,
      website: company.website,
      ceo: company.ceo,
      headquarters: `${company.city}, ${company.state}, ${company.country}`,
      currency: company.currency,
      pe_ratio: company.pe,
      pb_ratio: company.priceToBookRatio,
      dividend_yield: company.dividendYield,
      ipo_date: company.ipoDate,
      data_provider: 'fmp'
    };
  } catch (error) {
    console.error(`FMP fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company data from Alpha Vantage
 */
async function fetchFromAlphaVantage(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.companyOverview}&symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message']) return null;
    
    return {
      symbol: data.Symbol,
      name: data.Name,
      company_name: data.Name,
      exchange: data.Exchange,
      sector: data.Sector,
      industry: data.Industry,
      market_cap: parseFloat(data.MarketCapitalization) || undefined,
      employees: parseInt(data.FullTimeEmployees) || undefined,
      revenue: parseFloat(data.RevenueTTM) || undefined,
      net_income: parseFloat(data.QuarterlyEarningsGrowthYOY) || undefined,
      pe_ratio: parseFloat(data.PERatio) || undefined,
      pb_ratio: parseFloat(data.PriceToBookRatio) || undefined,
      dividend_yield: parseFloat(data.DividendYield) || undefined,
      description: data.Description,
      headquarters: data.Address,
      fiscal_year_end: data.FiscalYearEnd,
      data_provider: 'alpha_vantage'
    };
  } catch (error) {
    console.error(`Alpha Vantage fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company data from Finnhub
 */
async function fetchFromFinnhub(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.companyProfile}?symbol=${symbol}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.name) return null;
    
    return {
      symbol: symbol,
      name: data.name,
      company_name: data.name,
      exchange: data.exchange,
      sector: data.finnhubIndustry,
      industry: data.finnhubIndustry,
      market_cap: data.marketCapitalization * 1000000, // Convert to actual value
      website: data.weburl,
      headquarters: `${data.city}, ${data.state}, ${data.country}`,
      founded: data.ipo,
      phone: data.phone,
      ipo_date: data.ipo,
      currency: data.currency,
      data_provider: 'finnhub'
    };
  } catch (error) {
    console.error(`Finnhub fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company data from Polygon
 */
async function fetchFromPolygon(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.companyProfile}/${symbol}?apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results) return null;
    
    const company = data.results;
    
    return {
      symbol: company.ticker,
      name: company.name,
      company_name: company.name,
      market_cap: company.market_cap,
      description: company.description,
      website: company.homepage_url,
      headquarters: `${company.address?.city || ''}, ${company.address?.state || ''}`,
      phone: company.phone_number,
      employees: company.total_employees,
      data_provider: 'polygon'
    };
  } catch (error) {
    console.error(`Polygon fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company data from Twelve Data
 */
async function fetchFromTwelveData(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.companyProfile}?symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === 'error') return null;
    
    return {
      symbol: data.symbol,
      name: data.name,
      company_name: data.name,
      exchange: data.exchange,
      sector: data.sector,
      industry: data.industry,
      employees: data.employees,
      description: data.description,
      website: data.website,
      ceo: data.ceo,
      headquarters: data.headquarters,
      founded: data.founded,
      data_provider: 'twelve_data'
    };
  } catch (error) {
    console.error(`Twelve Data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch company data from Tiingo
 */
async function fetchFromTiingo(symbol: string): Promise<Partial<CompanyInfo> | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}/${symbol}${config.endpoints.companyProfile}?token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.ticker) return null;
    
    return {
      symbol: data.ticker,
      name: data.name,
      company_name: data.name,
      description: data.description,
      exchange: data.exchangeCode,
      data_provider: 'tiingo'
    };
  } catch (error) {
    console.error(`Tiingo fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Combine data from multiple providers into a single comprehensive company profile
 */
function combineCompanyData(dataArray: (Partial<CompanyInfo> | null)[]): CompanyInfo | null {
  const validData = dataArray.filter(data => data !== null) as Partial<CompanyInfo>[];
  
  if (validData.length === 0) return null;
  
  // Use the first valid entry as base and merge others
  const combined: CompanyInfo = {
    symbol: '',
    data_provider: 'combined'
  };
  
  // Merge all data, prioritizing non-null/non-empty values
  for (const data of validData) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        if (key === 'data_provider') {
          // Combine provider names
          if (combined.data_provider === 'combined') {
            combined.data_provider = value as string;
          } else {
            combined.data_provider += `, ${value}`;
          }
        } else {
          // For other fields, use the first non-empty value or merge if appropriate
          if (!combined[key as keyof CompanyInfo]) {
            (combined as CompanyInfo & Record<string, unknown>)[key] = value;
          }
        }
      }
    }
  }
  
  return combined.symbol ? combined : null;
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
    
    // Get unique symbols
    const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
    return uniqueSymbols;
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    return [];
  }
}

/**
 * Get symbols that already have company info in the database
 */
async function getExistingCompanyInfoSymbols(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('company_info')
      .select('symbol')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching existing company info symbols:', error);
      return new Set();
    }
    
    // Return as Set for fast lookup
    const existingSymbols = new Set<string>(data.map((row: { symbol: string }) => row.symbol));
    return existingSymbols;
  } catch (error) {
    console.error('Error in getExistingCompanyInfoSymbols:', error);
    return new Set();
  }
}

/**
 * Filter symbols to only include those without existing company info
 */
function filterSymbolsWithoutCompanyInfo(allSymbols: string[], existingCompanyInfoSymbols: Set<string>): string[] {
  return allSymbols.filter(symbol => !existingCompanyInfoSymbols.has(symbol));
}

/**
 * Save company data to the database
 */
async function saveCompanyData(supabase: SupabaseClient, companyData: CompanyInfo): Promise<{ success: boolean; error?: string }> {
  try {
    // Log the data being saved for debugging
    console.log(`Attempting to save company data for ${companyData.symbol}:`, {
      symbol: companyData.symbol,
      name: companyData.name,
      data_provider: companyData.data_provider,
      fieldCount: Object.keys(companyData).length,
      market_cap: companyData.market_cap,
      market_cap_type: typeof companyData.market_cap
    });
    
    // Clean the data - remove undefined values and ensure required fields
    const cleanedData = {
      symbol: companyData.symbol || '',
      data_provider: companyData.data_provider || 'unknown'
    };
    
    // Handle numeric fields that should be integers (bigint in database)
    const integerFields = ['market_cap', 'employees', 'revenue', 'net_income'];
    
    // Process all fields with proper type conversion
    for (const [key, value] of Object.entries(companyData)) {
      if (value !== undefined && value !== null && value !== '') {
        if (integerFields.includes(key) && typeof value === 'number') {
          // Convert to integer for bigint fields
          cleanedData[key as keyof CompanyInfo] = Math.floor(value) as any;
        } else if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          // Handle other numeric fields
          cleanedData[key as keyof CompanyInfo] = value as any;
        } else if (typeof value === 'string' && value.trim() !== '') {
          // Handle string fields
          cleanedData[key as keyof CompanyInfo] = value.trim() as any;
        } else if (typeof value === 'boolean') {
          // Handle boolean fields
          cleanedData[key as keyof CompanyInfo] = value as any;
        }
      }
    }
    
    // Ensure we have required fields
    if (!cleanedData.symbol) {
      console.error('Missing required field: symbol');
      return { success: false, error: 'Missing required field: symbol' };
    }
    
    const { error } = await supabase
      .from('company_info')
      .upsert(cleanedData, {
        onConflict: 'symbol,data_provider'
      });
    
    if (error) {
      console.error(`Database error saving data for ${companyData.symbol}:`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return { success: false, error: `Database error: ${error.message}` };
    }
    
    console.log(`Successfully saved company data for ${companyData.symbol}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Exception in saveCompanyData for ${companyData.symbol}:`, error);
    return { success: false, error: `Exception: ${errorMsg}` };
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
    
    console.log('Starting company info multi-provider fetch...');
    
    // Get all symbols from stock_quotes table
    const allSymbols = await getExistingSymbols(supabaseClient);
    
    if (allSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No symbols found in stock_quotes table',
          processed: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    // Get symbols that already have company info
    const existingCompanyInfoSymbols = await getExistingCompanyInfoSymbols(supabaseClient);
    
    // Filter to only symbols without company info
    const symbolsToProcess = filterSymbolsWithoutCompanyInfo(allSymbols, existingCompanyInfoSymbols);
    
    console.log(`Found ${allSymbols.length} total symbols, ${existingCompanyInfoSymbols.size} already have company info`);
    console.log(`Processing ${symbolsToProcess.length} symbols that need company info`);
    
    if (symbolsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All symbols already have company info',
          summary: {
            total_symbols: allSymbols.length,
            already_processed: existingCompanyInfoSymbols.size,
            new_symbols: 0,
            processed: 0,
            successful: 0,
            errors: 0
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Process symbols in batches to avoid overwhelming the providers
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
      const batch = symbolsToProcess.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          console.log(`Processing symbol: ${symbol}`);
          
          // Fetch data from all providers concurrently (with some delay to respect rate limits)
          const promises = [
            fetchFromFMP(symbol),
            fetchFromAlphaVantage(symbol),
            fetchFromFinnhub(symbol),
            fetchFromPolygon(symbol),
            fetchFromTwelveData(symbol),
            fetchFromTiingo(symbol),
          ];
          
          const providerResults = await Promise.allSettled(promises);
          const validResults = providerResults
            .map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(result => result !== null);
          
          if (validResults.length > 0) {
            const combinedData = combineCompanyData(validResults);
            
            if (combinedData) {
              const saveResult = await saveCompanyData(supabaseClient, combinedData);
              
              if (saveResult.success) {
                successCount++;
                results.push({
                  symbol,
                  status: 'success',
                  providers_used: validResults.length,
                  data_sources: combinedData.data_provider
                });
              } else {
                errorCount++;
                results.push({
                  symbol,
                  status: 'error',
                  message: `Failed to save to database: ${saveResult.error}`
                });
              }
            } else {
              errorCount++;
              results.push({
                symbol,
                status: 'error',
                message: 'No valid combined data'
              });
            }
          } else {
            errorCount++;
            results.push({
              symbol,
              status: 'error',
              message: 'No data from any provider'
            });
          }
          
          processedCount++;
          
          // Small delay between symbols to respect rate limits
          if (processedCount % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing symbol ${symbol}:`, error);
          results.push({
            symbol,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Delay between batches
      if (i + batchSize < symbolsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const response = {
      success: true,
      message: 'Company info multi-provider fetch completed',
      summary: {
        total_symbols: allSymbols.length,
        already_have_info: existingCompanyInfoSymbols.size,
        new_symbols: symbolsToProcess.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount
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
        message: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
