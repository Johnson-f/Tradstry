/**
 * Supabase Edge Function: Earnings Data Multi-Provider Fetcher
 * 
 * This Edge Function fetches detailed earnings data from 12 different market data providers,
 * combines the data to create comprehensive earnings reports with financial metrics,
 * and saves them to the database.
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

// TODO: Create a trigger logic, that fetches earnings data dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for earnings data information
interface EarningsData {
  symbol: string;
  exchange_id?: number;
  fiscal_year: number;
  fiscal_quarter?: number;
  reported_date: string;
  report_type?: string; // 'annual', 'quarterly'
  
  // EPS data
  eps?: number;
  eps_estimated?: number;
  eps_surprise?: number;
  eps_surprise_percent?: number;
  
  // Revenue data
  revenue?: number;
  revenue_estimated?: number;
  revenue_surprise?: number;
  revenue_surprise_percent?: number;
  
  // Income statement data
  net_income?: number;
  gross_profit?: number;
  operating_income?: number;
  ebitda?: number;
  
  // Additional metrics
  operating_margin?: number;
  net_margin?: number;
  year_over_year_eps_growth?: number;
  year_over_year_revenue_growth?: number;
  
  // Management guidance
  guidance?: string;
  next_year_eps_guidance?: number;
  next_year_revenue_guidance?: number;
  
  // Conference call details
  conference_call_date?: string;
  transcript_url?: string;
  audio_url?: string;
  
  // Beat/Miss/Met status
  eps_beat_miss_met?: string; // 'beat', 'miss', 'met'
  revenue_beat_miss_met?: string; // 'beat', 'miss', 'met'
  
  // Provider info
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    earnings?: string;
    incomeStatement?: string;
    financials?: string;
  };
}

// Provider configurations for earnings data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      earnings: '/income-statement',
      incomeStatement: '/income-statement',
    }
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      earnings: '?function=EARNINGS',
    }
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      earnings: '/stock/earnings',
      financials: '/stock/financials-reported',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/vX',
    endpoints: {
      financials: '/reference/financials',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      earnings: '/earnings',
      financials: '/income_statement',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/fundamentals',
    endpoints: {
      earnings: '/statements',
    }
  }
};

/**
 * Fetch earnings data from Financial Modeling Prep
 */
async function fetchFromFMP(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.incomeStatement}/${symbol}?period=quarter&limit=8&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    
    return data.map((earning: any) => {
      const reportedDate = new Date(earning.date);
      const fiscalYear = reportedDate.getFullYear();
      const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
      
      return {
        symbol: symbol,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
        reported_date: earning.date,
        report_type: 'quarterly',
        
        // Financial metrics from FMP
        revenue: earning.revenue ? parseInt(earning.revenue) : undefined,
        net_income: earning.netIncome ? parseInt(earning.netIncome) : undefined,
        gross_profit: earning.grossProfit ? parseInt(earning.grossProfit) : undefined,
        operating_income: earning.operatingIncome ? parseInt(earning.operatingIncome) : undefined,
        ebitda: earning.ebitda ? parseInt(earning.ebitda) : undefined,
        
        // Calculate margins
        operating_margin: earning.revenue && earning.operatingIncome ? 
          (earning.operatingIncome / earning.revenue) : undefined,
        net_margin: earning.revenue && earning.netIncome ? 
          (earning.netIncome / earning.revenue) : undefined,
          
        // EPS calculation (basic)
        eps: earning.eps ? parseFloat(earning.eps) : undefined,
        
        data_provider: 'fmp'
      };
    });
  } catch (error) {
    console.error(`FMP earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings data from Alpha Vantage
 */
async function fetchFromAlphaVantage(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.earnings}&symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data.quarterlyEarnings) return null;
    
    return data.quarterlyEarnings.slice(0, 8).map((earning: any) => {
      const reportedDate = new Date(earning.reportedDate);
      const fiscalDate = new Date(earning.fiscalDateEnding);
      const fiscalYear = fiscalDate.getFullYear();
      const fiscalQuarter = Math.ceil((fiscalDate.getMonth() + 1) / 3);
      
      return {
        symbol: symbol,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
        reported_date: earning.reportedDate,
        report_type: 'quarterly',
        
        eps: earning.reportedEPS ? parseFloat(earning.reportedEPS) : undefined,
        eps_estimated: earning.estimatedEPS ? parseFloat(earning.estimatedEPS) : undefined,
        eps_surprise: earning.surprise ? parseFloat(earning.surprise) : undefined,
        eps_surprise_percent: earning.surprisePercentage ? parseFloat(earning.surprisePercentage) : undefined,
        
        // Determine beat/miss/met status for EPS
        eps_beat_miss_met: earning.surprise && earning.surprise !== '0' ? 
          (parseFloat(earning.surprise) > 0 ? 'beat' : 'miss') : 'met',
        
        data_provider: 'alpha_vantage'
      };
    });
  } catch (error) {
    console.error(`Alpha Vantage earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings data from Finnhub
 */
async function fetchFromFinnhub(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    // Fetch both earnings and financials data
    const [earningsResponse, financialsResponse] = await Promise.all([
      fetch(`${config.baseUrl}${config.endpoints.earnings}?symbol=${symbol}&token=${config.apiKey}`),
      fetch(`${config.baseUrl}${config.endpoints.financials}?symbol=${symbol}&freq=quarterly&token=${config.apiKey}`)
    ]);
    
    const earningsData = earningsResponse.ok ? await earningsResponse.json() : null;
    const financialsData = financialsResponse.ok ? await financialsResponse.json() : null;
    
    const results: Partial<EarningsData>[] = [];
    
    // Process earnings data
    if (earningsData && Array.isArray(earningsData)) {
      earningsData.slice(0, 8).forEach((earning: any) => {
        const reportedDate = new Date(earning.period);
        const fiscalYear = reportedDate.getFullYear();
        const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
        
        results.push({
          symbol: symbol,
          fiscal_year: fiscalYear,
          fiscal_quarter: fiscalQuarter,
          reported_date: earning.period,
          report_type: 'quarterly',
          
          eps: earning.actual ? parseFloat(earning.actual) : undefined,
          eps_estimated: earning.estimate ? parseFloat(earning.estimate) : undefined,
          
          data_provider: 'finnhub'
        });
      });
    }
    
    // Process financials data
    if (financialsData && financialsData.data && Array.isArray(financialsData.data)) {
      financialsData.data.slice(0, 8).forEach((financial: any) => {
        if (financial.report && financial.report.ic) {
          const ic = financial.report.ic;
          const reportedDate = financial.endDate;
          const fiscalYear = new Date(reportedDate).getFullYear();
          const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
          
          // Find matching earnings record or create new one
          let existingRecord = results.find(r => 
            r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter
          );
          
          if (!existingRecord) {
            existingRecord = {
              symbol: symbol,
              fiscal_year: fiscalYear,
              fiscal_quarter: fiscalQuarter,
              reported_date: reportedDate,
              report_type: 'quarterly',
              data_provider: 'finnhub'
            };
            results.push(existingRecord);
          }
          
          // Add financial data
          existingRecord.revenue = ic.find((item: any) => item.concept === 'Revenues')?.value;
          existingRecord.net_income = ic.find((item: any) => item.concept === 'NetIncomeLoss')?.value;
          existingRecord.gross_profit = ic.find((item: any) => item.concept === 'GrossProfit')?.value;
          existingRecord.operating_income = ic.find((item: any) => item.concept === 'OperatingIncomeLoss')?.value;
        }
      });
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`Finnhub earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings data from Twelve Data
 */
async function fetchFromTwelveData(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    // Fetch both earnings and income statement data
    const [earningsResponse, incomeResponse] = await Promise.all([
      fetch(`${config.baseUrl}${config.endpoints.earnings}?symbol=${symbol}&apikey=${config.apiKey}`),
      fetch(`${config.baseUrl}${config.endpoints.financials}?symbol=${symbol}&period=quarterly&apikey=${config.apiKey}`)
    ]);
    
    const earningsData = earningsResponse.ok ? await earningsResponse.json() : null;
    const incomeData = incomeResponse.ok ? await incomeResponse.json() : null;
    
    const results: Partial<EarningsData>[] = [];
    
    // Process earnings data
    if (earningsData && earningsData.earnings && Array.isArray(earningsData.earnings)) {
      earningsData.earnings.slice(0, 8).forEach((earning: any) => {
        const reportedDate = new Date(earning.date);
        const fiscalYear = reportedDate.getFullYear();
        const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
        
        results.push({
          symbol: symbol,
          fiscal_year: fiscalYear,
          fiscal_quarter: fiscalQuarter,
          reported_date: earning.date,
          report_type: 'quarterly',
          
          eps: earning.eps ? parseFloat(earning.eps) : undefined,
          eps_estimated: earning.eps_estimate ? parseFloat(earning.eps_estimate) : undefined,
          
          data_provider: 'twelve_data'
        });
      });
    }
    
    // Process income statement data
    if (incomeData && incomeData.income_statement && Array.isArray(incomeData.income_statement)) {
      incomeData.income_statement.slice(0, 8).forEach((income: any) => {
        const reportedDate = income.fiscal_date;
        const fiscalYear = new Date(reportedDate).getFullYear();
        const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
        
        // Find matching earnings record or create new one
        let existingRecord = results.find(r => 
          r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter
        );
        
        if (!existingRecord) {
          existingRecord = {
            symbol: symbol,
            fiscal_year: fiscalYear,
            fiscal_quarter: fiscalQuarter,
            reported_date: reportedDate,
            report_type: 'quarterly',
            data_provider: 'twelve_data'
          };
          results.push(existingRecord);
        }
        
        // Add financial metrics
        existingRecord.revenue = income.revenues ? parseInt(income.revenues) : undefined;
        existingRecord.net_income = income.net_income ? parseInt(income.net_income) : undefined;
        existingRecord.gross_profit = income.gross_profit ? parseInt(income.gross_profit) : undefined;
        existingRecord.operating_income = income.operating_income ? parseInt(income.operating_income) : undefined;
        existingRecord.ebitda = income.ebitda ? parseInt(income.ebitda) : undefined;
      });
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`Twelve Data earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings data from Tiingo
 */
async function fetchFromTiingo(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.tiingo;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}/${symbol}${config.endpoints.earnings}?token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    return data.slice(0, 8).map((earning: any) => {
      const reportedDate = earning.date;
      const fiscalYear = new Date(reportedDate).getFullYear();
      const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
      
      return {
        symbol: symbol,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
        reported_date: reportedDate,
        report_type: 'quarterly',
        
        revenue: earning.revenue ? parseInt(earning.revenue) : undefined,
        net_income: earning.netIncome ? parseInt(earning.netIncome) : undefined,
        gross_profit: earning.grossProfit ? parseInt(earning.grossProfit) : undefined,
        operating_income: earning.operatingIncome ? parseInt(earning.operatingIncome) : undefined,
        
        data_provider: 'tiingo'
      };
    });
  } catch (error) {
    console.error(`Tiingo earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings data from Polygon
 */
async function fetchFromPolygon(symbol: string): Promise<Partial<EarningsData>[] | null> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.financials}?ticker=${symbol}&timeframe=quarterly&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) return null;
    
    return data.results.slice(0, 8).map((financial: any) => {
      const fiscalYear = financial.fiscal_year;
      const fiscalQuarter = financial.fiscal_period;
      const reportedDate = financial.end_date;
      
      return {
        symbol: symbol,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter === 'FY' ? undefined : parseInt(fiscalQuarter.replace('Q', '')),
        reported_date: reportedDate,
        report_type: fiscalQuarter === 'FY' ? 'annual' : 'quarterly',
        
        revenue: financial.financials?.income_statement?.revenues?.value,
        net_income: financial.financials?.income_statement?.net_income_loss?.value,
        gross_profit: financial.financials?.income_statement?.gross_profit?.value,
        operating_income: financial.financials?.income_statement?.operating_income_loss?.value,
        
        data_provider: 'polygon'
      };
    });
  } catch (error) {
    console.error(`Polygon earnings data fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Combine earnings data from multiple providers
 */
function combineEarningsData(dataArrays: (Partial<EarningsData>[] | null)[]): EarningsData[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<EarningsData>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all earnings records
  const allEarnings = validData.flat();
  
  // Group by symbol, fiscal_year, and fiscal_quarter to merge duplicates
  const earningsMap = new Map<string, EarningsData>();
  
  for (const earning of allEarnings) {
    if (!earning.symbol || !earning.fiscal_year || !earning.reported_date) continue;
    
    const key = `${earning.symbol}-${earning.fiscal_year}-${earning.fiscal_quarter || 'annual'}`;
    
    if (earningsMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = earningsMap.get(key)!;
      const merged: EarningsData = {
        symbol: earning.symbol,
        fiscal_year: earning.fiscal_year,
        reported_date: earning.reported_date,
        data_provider: `${existing.data_provider}, ${earning.data_provider}`
      };
      
      // Merge other fields, preferring non-null/non-empty values
      for (const [key, value] of Object.entries(earning)) {
        if (value !== null && value !== undefined && value !== '') {
          if (key !== 'data_provider' && !merged[key as keyof EarningsData]) {
            (merged as EarningsData & Record<string, unknown>)[key] = value;
          }
        }
      }
      
      // Calculate surprise percentages and beat/miss/met status
      if (merged.eps && merged.eps_estimated) {
        if (!merged.eps_surprise) {
          merged.eps_surprise = merged.eps - merged.eps_estimated;
        }
        if (!merged.eps_surprise_percent && merged.eps_estimated !== 0) {
          merged.eps_surprise_percent = (merged.eps_surprise / merged.eps_estimated) * 100;
        }
        if (!merged.eps_beat_miss_met) {
          merged.eps_beat_miss_met = merged.eps_surprise > 0 ? 'beat' : 
                                   merged.eps_surprise < 0 ? 'miss' : 'met';
        }
      }
      
      if (merged.revenue && merged.revenue_estimated) {
        if (!merged.revenue_surprise) {
          merged.revenue_surprise = merged.revenue - merged.revenue_estimated;
        }
        if (!merged.revenue_surprise_percent && merged.revenue_estimated !== 0) {
          merged.revenue_surprise_percent = (merged.revenue_surprise / merged.revenue_estimated) * 100;
        }
        if (!merged.revenue_beat_miss_met) {
          merged.revenue_beat_miss_met = merged.revenue_surprise > 0 ? 'beat' : 
                                       merged.revenue_surprise < 0 ? 'miss' : 'met';
        }
      }
      
      // Calculate margins
      if (merged.revenue) {
        if (merged.operating_income && !merged.operating_margin) {
          merged.operating_margin = merged.operating_income / merged.revenue;
        }
        if (merged.net_income && !merged.net_margin) {
          merged.net_margin = merged.net_income / merged.revenue;
        }
      }
      
      earningsMap.set(key, merged);
    } else {
      // Create new record
      const newEarning: EarningsData = {
        symbol: earning.symbol,
        exchange_id: earning.exchange_id,
        fiscal_year: earning.fiscal_year,
        fiscal_quarter: earning.fiscal_quarter,
        reported_date: earning.reported_date,
        report_type: earning.report_type || 'quarterly',
        
        eps: earning.eps,
        eps_estimated: earning.eps_estimated,
        eps_surprise: earning.eps_surprise,
        eps_surprise_percent: earning.eps_surprise_percent,
        
        revenue: earning.revenue,
        revenue_estimated: earning.revenue_estimated,
        revenue_surprise: earning.revenue_surprise,
        revenue_surprise_percent: earning.revenue_surprise_percent,
        
        net_income: earning.net_income,
        gross_profit: earning.gross_profit,
        operating_income: earning.operating_income,
        ebitda: earning.ebitda,
        
        operating_margin: earning.operating_margin,
        net_margin: earning.net_margin,
        year_over_year_eps_growth: earning.year_over_year_eps_growth,
        year_over_year_revenue_growth: earning.year_over_year_revenue_growth,
        
        guidance: earning.guidance,
        next_year_eps_guidance: earning.next_year_eps_guidance,
        next_year_revenue_guidance: earning.next_year_revenue_guidance,
        
        conference_call_date: earning.conference_call_date,
        transcript_url: earning.transcript_url,
        audio_url: earning.audio_url,
        
        eps_beat_miss_met: earning.eps_beat_miss_met,
        revenue_beat_miss_met: earning.revenue_beat_miss_met,
        
        data_provider: earning.data_provider || 'unknown'
      };
      
      // Calculate derived metrics
      if (newEarning.eps && newEarning.eps_estimated) {
        if (!newEarning.eps_surprise) {
          newEarning.eps_surprise = newEarning.eps - newEarning.eps_estimated;
        }
        if (!newEarning.eps_surprise_percent && newEarning.eps_estimated !== 0) {
          newEarning.eps_surprise_percent = (newEarning.eps_surprise / newEarning.eps_estimated) * 100;
        }
        if (!newEarning.eps_beat_miss_met) {
          newEarning.eps_beat_miss_met = newEarning.eps_surprise > 0 ? 'beat' : 
                                       newEarning.eps_surprise < 0 ? 'miss' : 'met';
        }
      }
      
      if (newEarning.revenue && newEarning.revenue_estimated) {
        if (!newEarning.revenue_surprise) {
          newEarning.revenue_surprise = newEarning.revenue - newEarning.revenue_estimated;
        }
        if (!newEarning.revenue_surprise_percent && newEarning.revenue_estimated !== 0) {
          newEarning.revenue_surprise_percent = (newEarning.revenue_surprise / newEarning.revenue_estimated) * 100;
        }
        if (!newEarning.revenue_beat_miss_met) {
          newEarning.revenue_beat_miss_met = newEarning.revenue_surprise > 0 ? 'beat' : 
                                           newEarning.revenue_surprise < 0 ? 'miss' : 'met';
        }
      }
      
      // Calculate margins
      if (newEarning.revenue) {
        if (newEarning.operating_income && !newEarning.operating_margin) {
          newEarning.operating_margin = newEarning.operating_income / newEarning.revenue;
        }
        if (newEarning.net_income && !newEarning.net_margin) {
          newEarning.net_margin = newEarning.net_income / newEarning.revenue;
        }
      }
      
      earningsMap.set(key, newEarning);
    }
  }
  
  return Array.from(earningsMap.values());
}

/**
 * Fetch existing symbols from the database
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
 * Save earnings data to the database
 */
async function saveEarningsData(supabase: SupabaseClient, earningsData: EarningsData[]): Promise<boolean> {
  if (earningsData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('earnings_data')
      .upsert(earningsData, {
        onConflict: 'symbol,fiscal_year,fiscal_quarter,data_provider'
      });
    
    if (error) {
      console.error(`Error saving earnings data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveEarningsData:`, error);
    return false;
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
    
    console.log('Starting earnings data multi-provider fetch...');
    
    // Get existing symbols from the database
    const existingSymbols = await getExistingSymbols(supabaseClient);
    
    if (existingSymbols.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No existing symbols found in database',
          processed: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    console.log(`Found ${existingSymbols.length} existing symbols to process`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let totalEarnings = 0;
    
    // Process symbols in batches
    const batchSize = 5; // Smaller batches for financial data
    const results = [];
    
    for (let i = 0; i < existingSymbols.length; i += batchSize) {
      const batch = existingSymbols.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(existingSymbols.length / batchSize)}`);
        
        // Process each symbol individually (most earnings APIs are symbol-specific)
        for (const symbol of batch) {
          try {
            console.log(`Fetching earnings data for ${symbol}...`);
            
            // Fetch data from all providers for this symbol
            const providerPromises = [
              fetchFromFMP(symbol),
              fetchFromAlphaVantage(symbol),
              fetchFromFinnhub(symbol),
              fetchFromTwelveData(symbol),
              fetchFromTiingo(symbol),
              fetchFromPolygon(symbol),
            ];
            
            const providerResults = await Promise.allSettled(providerPromises);
            
            // Filter successful results
            const validResults = providerResults
              .map(result => result.status === 'fulfilled' ? result.value : null)
              .filter(result => result !== null);
            
            if (validResults.length > 0) {
              const combinedData = combineEarningsData(validResults);
              
              if (combinedData.length > 0) {
                const saved = await saveEarningsData(supabaseClient, combinedData);
                
                if (saved) {
                  successCount++;
                  totalEarnings += combinedData.length;
                  
                  results.push({
                    symbol,
                    status: 'success',
                    earnings_records: combinedData.length,
                    providers: validResults.length
                  });
                } else {
                  errorCount++;
                  results.push({
                    symbol,
                    status: 'error',
                    message: 'Failed to save to database'
                  });
                }
              } else {
                errorCount++;
                results.push({
                  symbol,
                  status: 'error',
                  message: 'No valid earnings data found'
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
            
            // Small delay between symbols to be respectful to APIs
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (symbolError) {
            errorCount++;
            console.error(`Error processing symbol ${symbol}:`, symbolError);
            results.push({
              symbol,
              status: 'error',
              message: symbolError.message
            });
          }
        }
        
      } catch (error) {
        errorCount += batch.length;
        console.error(`Error processing batch:`, error);
        for (const symbol of batch) {
          results.push({
            symbol,
            status: 'error',
            message: error.message
          });
        }
      }
      
      // Delay between batches to respect rate limits
      if (i + batchSize < existingSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const response = {
      success: true,
      message: 'Earnings data multi-provider fetch completed',
      summary: {
        total_symbols: existingSymbols.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount,
        total_earnings_records: totalEarnings
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
        error: error.message,
        message: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
