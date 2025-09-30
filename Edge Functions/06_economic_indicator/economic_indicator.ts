/**
 * Supabase Edge Function: Economic Indicators Multi-Provider Fetcher
 * 
 * This Edge Function fetches economic indicators from 12 different market data providers,
 * combines the data to create comprehensive economic indicators with historical values,
 * and saves them to the database. Fetches data for a 30-day period (15 days behind and 15 days ahead of current date).
 * 
 * Providers used:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 * 7. FRED (Federal Reserve Economic Data)
 * 8. Yahoo Finance
 * 9. API Ninjas
 * 10. Trading Economics
 * 11. World Bank
 * 12. OECD Data
 */

// TODO: Create a trigger logic, that fetches economic indicators dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for economic indicators information
interface EconomicIndicator {
  indicator_code: string;
  indicator_name: string;
  country: string;
  
  // Data values
  value?: number;
  previous_value?: number;
  change_value?: number;
  change_percent?: number;
  year_over_year_change?: number;
  
  // Period information
  period_date: string;
  period_type?: string; // 'monthly', 'quarterly', 'annual', 'weekly'
  frequency?: string;
  
  // Units and metadata
  unit?: string;
  currency?: string;
  seasonal_adjustment?: boolean;
  preliminary?: boolean;
  
  // Importance and impact
  importance_level?: number; // 1=Low, 2=Medium, 3=High
  market_impact?: string;
  consensus_estimate?: number;
  surprise?: number;
  
  // Release information
  release_date?: string;
  next_release_date?: string;
  source_agency?: string;
  
  // Status and updates
  status?: string; // 'preliminary', 'revised', 'final'
  last_revised?: string;
  revision_count?: number;
  
  // Provider info
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    gdp?: string;
    cpi?: string;
    unemployment?: string;
    interestRates?: string;
    indicators?: string;
  };
}

// Provider configurations for economic indicators data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v4',
    endpoints: {
      gdp: '/economic?name=GDP',
      cpi: '/economic?name=CPI',
      unemployment: '/economic?name=unemploymentRate',
    }
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      gdp: '?function=REAL_GDP',
      cpi: '?function=CPI',
      unemployment: '?function=UNEMPLOYMENT',
      interestRates: '?function=FEDERAL_FUNDS_RATE',
    }
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      indicators: '/economic/code',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v1',
    endpoints: {
      indicators: '/indicators',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      indicators: '/economic_indicators',
    }
  },
  fred: {
    name: 'Federal Reserve Economic Data',
    apiKey: Deno.env.get('FRED_API_KEY') || '',
    baseUrl: 'https://api.stlouisfed.org/fred',
    endpoints: {
      indicators: '/series/observations',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/economic',
    endpoints: {
      indicators: '/indicators',
    }
  }
};

/**
 * Get date range for 30-day period (15 days behind and 15 days ahead of current date)
 */
function getDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 15);
  
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 15);
  
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: toDate.toISOString().split('T')[0]
  };
}

/**
 * Standardize indicator codes and get metadata
 */
function getIndicatorMetadata(code: string): { 
  standardCode: string; 
  name: string; 
  importance: number; 
  marketImpact: string; 
  unit: string; 
  frequency: string;
  periodType: string;
} {
  const codeUpper = code.toUpperCase();
  
  // GDP indicators
  if (codeUpper.includes('GDP') || codeUpper.includes('GROSS_DOMESTIC')) {
    return {
      standardCode: 'GDP',
      name: 'Gross Domestic Product',
      importance: 3,
      marketImpact: 'high',
      unit: 'B',
      frequency: 'quarterly',
      periodType: 'quarterly'
    };
  }
  
  // Inflation indicators
  if (codeUpper.includes('CPI') || codeUpper.includes('CONSUMER_PRICE') || codeUpper.includes('INFLATION')) {
    return {
      standardCode: 'CPI',
      name: 'Consumer Price Index',
      importance: 3,
      marketImpact: 'high',
      unit: 'Index',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Employment indicators
  if (codeUpper.includes('UNEMPLOYMENT') || codeUpper.includes('UNRATE') || codeUpper.includes('JOBLESS')) {
    return {
      standardCode: 'UNEMPLOYMENT',
      name: 'Unemployment Rate',
      importance: 3,
      marketImpact: 'high',
      unit: '%',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Interest rates
  if (codeUpper.includes('FEDERAL_FUNDS') || codeUpper.includes('FEDFUNDS') || codeUpper.includes('INTEREST_RATE')) {
    return {
      standardCode: 'FEDERAL_FUNDS_RATE',
      name: 'Federal Funds Rate',
      importance: 3,
      marketImpact: 'high',
      unit: '%',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Industrial production
  if (codeUpper.includes('INDUSTRIAL') || codeUpper.includes('PRODUCTION')) {
    return {
      standardCode: 'INDUSTRIAL_PRODUCTION',
      name: 'Industrial Production Index',
      importance: 2,
      marketImpact: 'medium',
      unit: 'Index',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Retail sales
  if (codeUpper.includes('RETAIL') || codeUpper.includes('SALES')) {
    return {
      standardCode: 'RETAIL_SALES',
      name: 'Retail Sales',
      importance: 2,
      marketImpact: 'medium',
      unit: '%',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Housing starts
  if (codeUpper.includes('HOUSING') || codeUpper.includes('STARTS')) {
    return {
      standardCode: 'HOUSING_STARTS',
      name: 'Housing Starts',
      importance: 2,
      marketImpact: 'medium',
      unit: 'K',
      frequency: 'monthly',
      periodType: 'monthly'
    };
  }
  
  // Default
  return {
    standardCode: code.toUpperCase(),
    name: code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    importance: 1,
    marketImpact: 'low',
    unit: 'Index',
    frequency: 'monthly',
    periodType: 'monthly'
  };
}

/**
 * Fetch economic indicators from Financial Modeling Prep
 */
async function fetchFromFMP(fromDate: string, toDate: string): Promise<Partial<EconomicIndicator>[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const indicators = ['GDP', 'CPI', 'unemploymentRate'];
    const allIndicators: Partial<EconomicIndicator>[] = [];
    
    for (const indicator of indicators) {
      try {
        const url = `${config.baseUrl}/economic?name=${indicator}&apikey=${config.apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!Array.isArray(data)) continue;
        
        // Filter data to only include items within the date range
        const filteredData = data.filter((item: any) => {
          const itemDate = new Date(item.date);
          const from = new Date(fromDate);
          const to = new Date(toDate);
          return itemDate >= from && itemDate <= to;
        });

        for (const item of filteredData.slice(0, 10)) { // Recent 10 data points within date range
          const metadata = getIndicatorMetadata(indicator);
          
          allIndicators.push({
            indicator_code: metadata.standardCode,
            indicator_name: metadata.name,
            country: 'US',
            value: parseFloat(item.value),
            period_date: item.date,
            period_type: metadata.periodType,
            frequency: metadata.frequency,
            unit: metadata.unit,
            currency: 'USD',
            seasonal_adjustment: true,
            preliminary: false,
            importance_level: metadata.importance,
            market_impact: metadata.marketImpact,
            release_date: item.date,
            source_agency: 'BEA/BLS',
            status: 'final',
            revision_count: 0,
            data_provider: 'fmp'
          });
        }
        
        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (indicatorError) {
        console.error(`Error fetching FMP ${indicator}:`, indicatorError);
        continue;
      }
    }
    
    return allIndicators.length > 0 ? allIndicators : null;
  } catch (error) {
    console.error(`FMP economic indicators fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic indicators from Alpha Vantage
 */
async function fetchFromAlphaVantage(fromDate: string, toDate: string): Promise<Partial<EconomicIndicator>[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    const functions = ['REAL_GDP', 'CPI', 'UNEMPLOYMENT', 'FEDERAL_FUNDS_RATE'];
    const allIndicators: Partial<EconomicIndicator>[] = [];
    
    for (const func of functions) {
      try {
        const url = `${config.baseUrl}?function=${func}&apikey=${config.apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (data.Note || data['Error Message']) continue;
        
        // Process the indicator data
        const dataKey = Object.keys(data).find(key => key.includes('data')) || Object.keys(data)[1];
        if (!data[dataKey]) continue;
        
        const recentData = Array.isArray(data[dataKey]) ? data[dataKey].slice(0, 10) : 
          Object.entries(data[dataKey]).slice(0, 10);
        
        // Filter data to only include items within the date range
        const filteredData = recentData.filter(([date]: [string, any]) => {
          const itemDate = new Date(date);
          const from = new Date(fromDate);
          const to = new Date(toDate);
          return itemDate >= from && itemDate <= to;
        });

        for (const [date, valueObj] of filteredData) {
          const value = typeof valueObj === 'object' ? (valueObj as any).value : valueObj;
          if (!value || value === '.') continue;
          
          const metadata = getIndicatorMetadata(func);
          
          allIndicators.push({
            indicator_code: metadata.standardCode,
            indicator_name: metadata.name,
            country: 'US',
            value: parseFloat(value),
            period_date: date,
            period_type: metadata.periodType,
            frequency: metadata.frequency,
            unit: metadata.unit,
            currency: 'USD',
            seasonal_adjustment: true,
            preliminary: false,
            importance_level: metadata.importance,
            market_impact: metadata.marketImpact,
            release_date: date,
            source_agency: func.includes('GDP') ? 'BEA' : func.includes('UNEMPLOYMENT') ? 'BLS' : 'Federal Reserve',
            status: 'final',
            revision_count: 0,
            data_provider: 'alpha_vantage'
          });
        }
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (funcError) {
        console.error(`Error fetching Alpha Vantage ${func}:`, funcError);
        continue;
      }
    }
    
    return allIndicators.length > 0 ? allIndicators : null;
  } catch (error) {
    console.error(`Alpha Vantage economic indicators fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic indicators from FRED (Federal Reserve Economic Data)
 */
async function fetchFromFRED(fromDate: string, toDate: string): Promise<Partial<EconomicIndicator>[] | null> {
  const config = PROVIDERS.fred;
  if (!config.apiKey) return null;
  
  try {
    // Key FRED economic series
    const series = [
      { id: 'GDP', name: 'Gross Domestic Product' },
      { id: 'CPIAUCSL', name: 'Consumer Price Index' },
      { id: 'UNRATE', name: 'Unemployment Rate' },
      { id: 'FEDFUNDS', name: 'Federal Funds Rate' },
      { id: 'INDPRO', name: 'Industrial Production Index' },
      { id: 'RSXFS', name: 'Retail Sales' },
      { id: 'HOUST', name: 'Housing Starts' }
    ];
    const allIndicators: Partial<EconomicIndicator>[] = [];
    
    for (const seriesInfo of series) {
      try {
        const url = `${config.baseUrl}/series/observations?series_id=${seriesInfo.id}&api_key=${config.apiKey}&file_type=json&limit=10`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!data.observations || !Array.isArray(data.observations)) continue;
        
        // Filter observations to only include those within the date range
        const filteredObs = data.observations.filter((obs: any) => {
          const obsDate = new Date(obs.date);
          const from = new Date(fromDate);
          const to = new Date(toDate);
          return obsDate >= from && obsDate <= to;
        });

        for (const obs of filteredObs) {
          if (obs.value === '.') continue; // Skip missing values
          
          const metadata = getIndicatorMetadata(seriesInfo.id);
          
          allIndicators.push({
            indicator_code: metadata.standardCode,
            indicator_name: metadata.name,
            country: 'US',
            value: parseFloat(obs.value),
            period_date: obs.date,
            period_type: metadata.periodType,
            frequency: metadata.frequency,
            unit: metadata.unit,
            currency: 'USD',
            seasonal_adjustment: true,
            preliminary: false,
            importance_level: metadata.importance,
            market_impact: metadata.marketImpact,
            release_date: obs.date,
            source_agency: 'Federal Reserve',
            status: 'final',
            revision_count: 0,
            data_provider: 'fred'
          });
        }
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (seriesError) {
        console.error(`Error fetching FRED series ${seriesInfo.id}:`, seriesError);
        continue;
      }
    }
    
    return allIndicators.length > 0 ? allIndicators : null;
  } catch (error) {
    console.error(`FRED economic indicators fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic indicators from Finnhub
 */
async function fetchFromFinnhub(fromDate: string, toDate: string): Promise<Partial<EconomicIndicator>[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    // Key economic indicators from Finnhub
    const codes = ['US-CPI', 'US-GDP', 'US-UNRATE', 'US-FEDRATE'];
    const allIndicators: Partial<EconomicIndicator>[] = [];
    
    for (const code of codes) {
      try {
        const url = `${config.baseUrl}/economic/code?code=${code}&token=${config.apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!data.code || !Array.isArray(data.data)) continue;
        
        // Filter data to only include items within the date range
        const filteredData = data.data.filter((item: any) => {
          const itemDate = new Date(item.period);
          const from = new Date(fromDate);
          const to = new Date(toDate);
          return itemDate >= from && itemDate <= to;
        });

        for (const item of filteredData.slice(0, 10)) {
          const indicatorCode = code.replace('US-', '');
          const metadata = getIndicatorMetadata(indicatorCode);
          
          allIndicators.push({
            indicator_code: metadata.standardCode,
            indicator_name: metadata.name,
            country: 'US',
            value: parseFloat(item.value),
            period_date: item.period,
            period_type: metadata.periodType,
            frequency: metadata.frequency,
            unit: metadata.unit,
            currency: 'USD',
            seasonal_adjustment: true,
            preliminary: false,
            importance_level: metadata.importance,
            market_impact: metadata.marketImpact,
            release_date: item.period,
            source_agency: 'Finnhub',
            status: 'final',
            revision_count: 0,
            data_provider: 'finnhub'
          });
        }
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (codeError) {
        console.error(`Error fetching Finnhub ${code}:`, codeError);
        continue;
      }
    }
    
    return allIndicators.length > 0 ? allIndicators : null;
  } catch (error) {
    console.error(`Finnhub economic indicators fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic indicators from Twelve Data
 */
async function fetchFromTwelveData(fromDate: string, toDate: string): Promise<Partial<EconomicIndicator>[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const indicators = ['GDP', 'CPI', 'UNEMPLOYMENT_RATE'];
    const allIndicators: Partial<EconomicIndicator>[] = [];
    
    for (const indicator of indicators) {
      try {
        const url = `${config.baseUrl}/economic_indicators?indicator=${indicator}&country=US&apikey=${config.apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (data.status === 'error' || !data.values || !Array.isArray(data.values)) continue;
        
        // Filter data to only include items within the date range
        const filteredData = data.values.filter((item: any) => {
          const itemDate = new Date(item.datetime);
          const from = new Date(fromDate);
          const to = new Date(toDate);
          return itemDate >= from && itemDate <= to;
        });

        for (const item of filteredData.slice(0, 10)) {
          const metadata = getIndicatorMetadata(indicator);
          
          allIndicators.push({
            indicator_code: metadata.standardCode,
            indicator_name: metadata.name,
            country: 'US',
            value: parseFloat(item.value),
            period_date: item.datetime,
            period_type: metadata.periodType,
            frequency: metadata.frequency,
            unit: metadata.unit,
            currency: 'USD',
            seasonal_adjustment: true,
            preliminary: false,
            importance_level: metadata.importance,
            market_impact: metadata.marketImpact,
            release_date: item.datetime,
            source_agency: 'Twelve Data',
            status: 'final',
            revision_count: 0,
            data_provider: 'twelve_data'
          });
        }
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 400));
      } catch (indicatorError) {
        console.error(`Error fetching Twelve Data ${indicator}:`, indicatorError);
        continue;
      }
    }
    
    return allIndicators.length > 0 ? allIndicators : null;
  } catch (error) {
    console.error(`Twelve Data economic indicators fetch error:`, error);
    return null;
  }
}

/**
 * Calculate change values and percentages
 */
function calculateChanges(currentValue: number, previousValue?: number): {
  changeValue?: number;
  changePercent?: number;
} {
  if (!previousValue || previousValue === 0) {
    return { changeValue: undefined, changePercent: undefined };
  }
  
  const changeValue = currentValue - previousValue;
  const changePercent = (changeValue / previousValue) * 100;
  
  return {
    changeValue: Math.round(changeValue * 10000) / 10000,
    changePercent: Math.round(changePercent * 100) / 100
  };
}

/**
 * Combine economic indicators from multiple providers
 */
function combineEconomicIndicators(dataArrays: (Partial<EconomicIndicator>[] | null)[]): EconomicIndicator[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<EconomicIndicator>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all indicators
  const allIndicators = validData.flat();
  
  // Group by indicator code, country, and date to merge duplicates
  const indicatorsMap = new Map<string, EconomicIndicator>();
  
  for (const indicator of allIndicators) {
    if (!indicator.indicator_code || !indicator.country || !indicator.period_date) continue;
    
    const key = `${indicator.indicator_code}-${indicator.country}-${indicator.period_date}`;
    
    if (indicatorsMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = indicatorsMap.get(key)!;
      const merged: EconomicIndicator = {
        ...existing,
        data_provider: `${existing.data_provider}, ${indicator.data_provider}`
      };
      
      // Merge other fields, preferring non-null values
      for (const [key, value] of Object.entries(indicator)) {
        if (value !== null && value !== undefined && value !== '' && 
            key !== 'data_provider' && 
            !merged[key as keyof EconomicIndicator]) {
          (merged as EconomicIndicator & Record<string, unknown>)[key] = value;
        }
      }
      
      indicatorsMap.set(key, merged);
    } else {
      // Create new record
      const newIndicator: EconomicIndicator = {
        indicator_code: indicator.indicator_code,
        indicator_name: indicator.indicator_name || indicator.indicator_code,
        country: indicator.country,
        value: indicator.value,
        previous_value: indicator.previous_value,
        change_value: indicator.change_value,
        change_percent: indicator.change_percent,
        year_over_year_change: indicator.year_over_year_change,
        period_date: indicator.period_date,
        period_type: indicator.period_type || 'monthly',
        frequency: indicator.frequency || 'monthly',
        unit: indicator.unit || 'Index',
        currency: indicator.currency || 'USD',
        seasonal_adjustment: indicator.seasonal_adjustment !== false,
        preliminary: indicator.preliminary || false,
        importance_level: indicator.importance_level || 1,
        market_impact: indicator.market_impact || 'low',
        consensus_estimate: indicator.consensus_estimate,
        surprise: indicator.surprise,
        release_date: indicator.release_date,
        next_release_date: indicator.next_release_date,
        source_agency: indicator.source_agency,
        status: indicator.status || 'final',
        last_revised: indicator.last_revised,
        revision_count: indicator.revision_count || 0,
        data_provider: indicator.data_provider || 'unknown'
      };
      
      indicatorsMap.set(key, newIndicator);
    }
  }
  
  // Sort indicators by date (most recent first) and calculate changes
  const sortedIndicators = Array.from(indicatorsMap.values())
    .sort((a, b) => new Date(b.period_date).getTime() - new Date(a.period_date).getTime());
  
  // Calculate change values where missing
  const indicatorGroups = new Map<string, EconomicIndicator[]>();
  
  for (const indicator of sortedIndicators) {
    const groupKey = `${indicator.indicator_code}-${indicator.country}`;
    if (!indicatorGroups.has(groupKey)) {
      indicatorGroups.set(groupKey, []);
    }
    indicatorGroups.get(groupKey)!.push(indicator);
  }
  
  // Calculate changes for each group
  for (const [, group] of indicatorGroups) {
    group.sort((a, b) => new Date(b.period_date).getTime() - new Date(a.period_date).getTime());
    
    for (let i = 0; i < group.length - 1; i++) {
      const current = group[i];
      const previous = group[i + 1];
      
      if (current.value && previous.value && !current.change_value && !current.change_percent) {
        const changes = calculateChanges(current.value, previous.value);
        current.change_value = changes.changeValue;
        current.change_percent = changes.changePercent;
        current.previous_value = previous.value;
      }
    }
  }
  
  return sortedIndicators;
}

/**
 * Save economic indicators data to the database
 */
async function saveEconomicIndicators(supabase: SupabaseClient, indicatorsData: EconomicIndicator[]): Promise<boolean> {
  if (indicatorsData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('economic_indicators')
      .upsert(indicatorsData, {
        onConflict: 'indicator_code,country,period_date,data_provider'
      });
    
    if (error) {
      console.error(`Error saving economic indicators data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveEconomicIndicators:`, error);
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
    
    console.log('Starting economic indicators multi-provider fetch for 30-day period (15 days behind and 15 days ahead)...');
    
    const { fromDate, toDate } = getDateRange();
    console.log(`Fetching economic indicators from ${fromDate} to ${toDate}`);
    
    let totalIndicators = 0;
    let successfulProviders = 0;
    let errorCount = 0;
    
    try {
      console.log('Fetching data from all providers...');
      
      // Fetch data from all providers with date range
      const providerPromises = [
        fetchFromFMP(fromDate, toDate),
        fetchFromAlphaVantage(fromDate, toDate),
        fetchFromFRED(fromDate, toDate),
        fetchFromFinnhub(fromDate, toDate),
        fetchFromTwelveData(fromDate, toDate),
      ];
      
      const providerResults = await Promise.allSettled(providerPromises);
      
      // Filter successful results
      const validResults = providerResults
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(result => result !== null);
      
      if (validResults.length > 0) {
        const combinedData = combineEconomicIndicators(validResults);
        
        if (combinedData.length > 0) {
          const saved = await saveEconomicIndicators(supabaseClient, combinedData);
          
          if (saved) {
            successfulProviders = validResults.length;
            totalIndicators = combinedData.length;
            
            console.log(`Successfully processed ${totalIndicators} economic indicators from ${successfulProviders} providers`);
          } else {
            errorCount = 1;
            console.error('Failed to save economic indicators to database');
          }
        } else {
          errorCount = 1;
          console.error('No valid economic indicators data found');
        }
      } else {
        errorCount = providerResults.length;
        console.error('No data from any provider');
      }
      
    } catch (error) {
      errorCount++;
      console.error('Error in main processing:', error);
    }
    
    const response = {
      success: totalIndicators > 0,
      message: 'Economic indicators multi-provider fetch completed',
      date_range: {
        from: fromDate,
        to: toDate
      },
      summary: {
        successful_providers: successfulProviders,
        total_indicators: totalIndicators,
        errors: errorCount
      },
      indicators: totalIndicators > 0 ? [
        'GDP', 'CPI', 'UNEMPLOYMENT', 'FEDERAL_FUNDS_RATE', 
        'INDUSTRIAL_PRODUCTION', 'RETAIL_SALES', 'HOUSING_STARTS'
      ] : [],
      countries: ['US'] // Main countries covered (can be expanded)
    };
    
    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: totalIndicators > 0 ? 200 : 404
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
