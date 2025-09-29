/**
 * Supabase Edge Function: Economic Events Multi-Provider Fetcher
 * 
 * This Edge Function fetches economic calendar events from 12 different market data providers,
 * combines the data to create comprehensive economic event schedules with forecasts and actuals,
 * and saves them to the database. Fetches data for a 30-day period.
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

// TODO: Create a trigger logic, that fetches economic events dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for economic events information
interface EconomicEvent {
  event_id: string;
  country: string;
  event_name: string;
  event_period?: string;
  
  // Economic data points
  actual?: number;
  previous?: number;
  forecast?: number;
  unit?: string;
  
  // Event metadata
  importance?: number; // 1=Low, 2=Medium, 3=High
  event_timestamp: string;
  last_update?: string;
  description?: string;
  url?: string;
  
  // Additional categorization
  category?: string; // 'employment', 'inflation', 'GDP', etc.
  frequency?: string; // 'monthly', 'quarterly', 'annual', 'one-time'
  source?: string;
  currency?: string;
  
  // Impact and status
  market_impact?: string; // 'high', 'medium', 'low'
  status?: string; // 'scheduled', 'released', 'revised'
  revised?: boolean;
  
  // Provider info
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    economicCalendar?: string;
    economicEvents?: string;
    calendar?: string;
  };
}

// Provider configurations for economic events data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      economicCalendar: '/economic_calendar',
    }
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      economicEvents: '?function=REAL_GDP',
    }
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      calendar: '/calendar/economic',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v1',
    endpoints: {
      economicEvents: '/indicators',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      economicCalendar: '/economic_calendar',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/news',
    endpoints: {
      economicEvents: '/economic',
    }
  },
  fred: {
    name: 'Federal Reserve Economic Data',
    apiKey: Deno.env.get('FRED_API_KEY') || '',
    baseUrl: 'https://api.stlouisfed.org/fred',
    endpoints: {
      economicEvents: '/series/observations',
    }
  }
};

/**
 * Get date range for 30-day period (15 days before and after today)
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
 * Categorize economic events
 */
function categorizeEvent(eventName: string): { category: string; importance: number; marketImpact: string } {
  const name = eventName.toLowerCase();
  
  // High importance events
  if (name.includes('gdp') || name.includes('gross domestic product')) {
    return { category: 'gdp', importance: 3, marketImpact: 'high' };
  }
  if (name.includes('cpi') || name.includes('consumer price') || name.includes('inflation')) {
    return { category: 'inflation', importance: 3, marketImpact: 'high' };
  }
  if (name.includes('non-farm') || name.includes('nonfarm') || name.includes('payroll') || name.includes('unemployment')) {
    return { category: 'employment', importance: 3, marketImpact: 'high' };
  }
  if (name.includes('fed') || name.includes('federal funds') || name.includes('interest rate')) {
    return { category: 'monetary_policy', importance: 3, marketImpact: 'high' };
  }
  
  // Medium importance events
  if (name.includes('retail sales') || name.includes('consumer spending')) {
    return { category: 'consumer', importance: 2, marketImpact: 'medium' };
  }
  if (name.includes('industrial production') || name.includes('manufacturing')) {
    return { category: 'manufacturing', importance: 2, marketImpact: 'medium' };
  }
  if (name.includes('housing') || name.includes('home sales') || name.includes('building permits')) {
    return { category: 'housing', importance: 2, marketImpact: 'medium' };
  }
  
  // Default to low importance
  return { category: 'other', importance: 1, marketImpact: 'low' };
}

/**
 * Fetch economic events from Financial Modeling Prep
 */
async function fetchFromFMP(): Promise<Partial<EconomicEvent>[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const { fromDate, toDate } = getDateRange();
    const url = `${config.baseUrl}${config.endpoints.economicCalendar}?from=${fromDate}&to=${toDate}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    
    return data.map((event: any) => {
      const eventInfo = categorizeEvent(event.event || '');
      
      return {
        event_id: `fmp_${event.date}_${event.event?.replace(/\s+/g, '_')}`,
        country: event.country || 'US',
        event_name: event.event,
        event_period: event.period,
        actual: event.actual ? parseFloat(event.actual) : undefined,
        previous: event.previous ? parseFloat(event.previous) : undefined,
        forecast: event.estimate ? parseFloat(event.estimate) : undefined,
        unit: event.unit || '%',
        importance: eventInfo.importance,
        event_timestamp: event.date,
        last_update: new Date().toISOString(),
        description: event.event,
        category: eventInfo.category,
        frequency: 'monthly',
        source: 'FMP',
        currency: 'USD',
        market_impact: eventInfo.marketImpact,
        status: new Date(event.date) > new Date() ? 'scheduled' : 'released',
        revised: false,
        data_provider: 'fmp'
      };
    });
  } catch (error) {
    console.error(`FMP economic events fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic events from Finnhub
 */
async function fetchFromFinnhub(): Promise<Partial<EconomicEvent>[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const { fromDate, toDate } = getDateRange();
    const url = `${config.baseUrl}${config.endpoints.calendar}?from=${fromDate}&to=${toDate}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.economicCalendar || !Array.isArray(data.economicCalendar)) return null;
    
    return data.economicCalendar.map((event: any) => {
      const eventInfo = categorizeEvent(event.event || '');
      
      return {
        event_id: `finnhub_${event.time}_${event.event?.replace(/\s+/g, '_')}`,
        country: event.country || 'US',
        event_name: event.event,
        event_period: event.period,
        actual: event.actual ? parseFloat(event.actual) : undefined,
        previous: event.prev ? parseFloat(event.prev) : undefined,
        forecast: event.estimate ? parseFloat(event.estimate) : undefined,
        unit: event.unit || '%',
        importance: event.impact === 'high' ? 3 : event.impact === 'medium' ? 2 : 1,
        event_timestamp: event.time,
        last_update: new Date().toISOString(),
        description: event.event,
        category: eventInfo.category,
        frequency: 'monthly',
        source: 'Finnhub',
        currency: 'USD',
        market_impact: event.impact || eventInfo.marketImpact,
        status: new Date(event.time) > new Date() ? 'scheduled' : 'released',
        revised: false,
        data_provider: 'finnhub'
      };
    });
  } catch (error) {
    console.error(`Finnhub economic events fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic events from Alpha Vantage
 */
async function fetchFromAlphaVantage(): Promise<Partial<EconomicEvent>[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    // Alpha Vantage has various economic indicators, fetch a few key ones
    const indicators = ['REAL_GDP', 'CPI', 'UNEMPLOYMENT', 'FEDERAL_FUNDS_RATE'];
    const allEvents: Partial<EconomicEvent>[] = [];
    
    for (const indicator of indicators) {
      try {
        const url = `${config.baseUrl}?function=${indicator}&apikey=${config.apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (data.Note || data['Error Message']) continue;
        
        // Process the indicator data
        const dataKey = Object.keys(data).find(key => key.includes('data')) || Object.keys(data)[1];
        if (!data[dataKey]) continue;
        
        const recentData = Array.isArray(data[dataKey]) ? data[dataKey].slice(0, 5) : 
          Object.entries(data[dataKey]).slice(0, 5);
        
        for (const [date, value] of recentData) {
          const eventInfo = categorizeEvent(indicator);
          
          allEvents.push({
            event_id: `alpha_vantage_${indicator}_${date}`,
            country: 'US',
            event_name: indicator.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            event_period: date,
            actual: typeof value === 'object' ? parseFloat((value as any).value) : parseFloat(value as string),
            previous: undefined,
            forecast: undefined,
            unit: indicator.includes('RATE') ? '%' : indicator.includes('GDP') ? 'B' : '%',
            importance: eventInfo.importance,
            event_timestamp: date,
            last_update: new Date().toISOString(),
            description: `${indicator} economic indicator`,
            category: eventInfo.category,
            frequency: 'quarterly',
            source: 'Alpha Vantage',
            currency: 'USD',
            market_impact: eventInfo.marketImpact,
            status: 'released',
            revised: false,
            data_provider: 'alpha_vantage'
          });
        }
        
        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (indicatorError) {
        console.error(`Error fetching ${indicator}:`, indicatorError);
        continue;
      }
    }
    
    return allEvents.length > 0 ? allEvents : null;
  } catch (error) {
    console.error(`Alpha Vantage economic events fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic events from Twelve Data
 */
async function fetchFromTwelveData(): Promise<Partial<EconomicEvent>[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.economicCalendar}?country=US&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === 'error' || !data.events || !Array.isArray(data.events)) return null;
    
    const { fromDate, toDate } = getDateRange();
    const from = new Date(fromDate);
    const to = new Date(toDate);
    
    // Filter events within our date range
    const filteredEvents = data.events.filter((event: any) => {
      const eventDate = new Date(event.date);
      return eventDate >= from && eventDate <= to;
    });
    
    return filteredEvents.map((event: any) => {
      const eventInfo = categorizeEvent(event.name || '');
      
      return {
        event_id: `twelve_data_${event.date}_${event.name?.replace(/\s+/g, '_')}`,
        country: event.country || 'US',
        event_name: event.name,
        event_period: event.period,
        actual: event.actual ? parseFloat(event.actual) : undefined,
        previous: event.previous ? parseFloat(event.previous) : undefined,
        forecast: event.forecast ? parseFloat(event.forecast) : undefined,
        unit: event.unit || '%',
        importance: event.importance === 'high' ? 3 : event.importance === 'medium' ? 2 : 1,
        event_timestamp: event.date,
        last_update: new Date().toISOString(),
        description: event.name,
        category: eventInfo.category,
        frequency: 'monthly',
        source: 'Twelve Data',
        currency: 'USD',
        market_impact: event.importance || eventInfo.marketImpact,
        status: new Date(event.date) > new Date() ? 'scheduled' : 'released',
        revised: false,
        data_provider: 'twelve_data'
      };
    });
  } catch (error) {
    console.error(`Twelve Data economic events fetch error:`, error);
    return null;
  }
}

/**
 * Fetch economic events from FRED (Federal Reserve Economic Data)
 */
async function fetchFromFRED(): Promise<Partial<EconomicEvent>[] | null> {
  const config = PROVIDERS.fred;
  if (!config.apiKey) return null;
  
  try {
    // Key FRED economic series
    const series = ['GDP', 'CPIAUCSL', 'UNRATE', 'FEDFUNDS'];
    const allEvents: Partial<EconomicEvent>[] = [];
    
    for (const seriesId of series) {
      try {
        const url = `${config.baseUrl}${config.endpoints.economicEvents}?series_id=${seriesId}&api_key=${config.apiKey}&file_type=json&limit=5`;
        const response = await fetch(url);
        
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!data.observations || !Array.isArray(data.observations)) continue;
        
        for (const obs of data.observations) {
          if (obs.value === '.') continue; // Skip missing values
          
          const eventInfo = categorizeEvent(seriesId);
          const seriesName = seriesId === 'GDP' ? 'Gross Domestic Product' :
                           seriesId === 'CPIAUCSL' ? 'Consumer Price Index' :
                           seriesId === 'UNRATE' ? 'Unemployment Rate' :
                           seriesId === 'FEDFUNDS' ? 'Federal Funds Rate' : seriesId;
          
          allEvents.push({
            event_id: `fred_${seriesId}_${obs.date}`,
            country: 'US',
            event_name: seriesName,
            event_period: obs.date,
            actual: parseFloat(obs.value),
            previous: undefined,
            forecast: undefined,
            unit: seriesId.includes('RATE') || seriesId === 'UNRATE' ? '%' : 
                  seriesId === 'GDP' ? 'B' : 'Index',
            importance: eventInfo.importance,
            event_timestamp: obs.date,
            last_update: new Date().toISOString(),
            description: `${seriesName} from Federal Reserve Economic Data`,
            category: eventInfo.category,
            frequency: seriesId === 'GDP' ? 'quarterly' : 'monthly',
            source: 'Federal Reserve',
            currency: 'USD',
            market_impact: eventInfo.marketImpact,
            status: 'released',
            revised: false,
            data_provider: 'fred'
          });
        }
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (seriesError) {
        console.error(`Error fetching FRED series ${seriesId}:`, seriesError);
        continue;
      }
    }
    
    return allEvents.length > 0 ? allEvents : null;
  } catch (error) {
    console.error(`FRED economic events fetch error:`, error);
    return null;
  }
}

/**
 * Combine economic events from multiple providers
 */
function combineEconomicEvents(dataArrays: (Partial<EconomicEvent>[] | null)[]): EconomicEvent[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<EconomicEvent>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all events
  const allEvents = validData.flat();
  
  // Group by event name, country, and date to merge duplicates
  const eventsMap = new Map<string, EconomicEvent>();
  
  for (const event of allEvents) {
    if (!event.event_name || !event.country || !event.event_timestamp) continue;
    
    const key = `${event.event_name.toLowerCase()}-${event.country}-${event.event_timestamp.split('T')[0]}`;
    
    if (eventsMap.has(key)) {
      // Merge with existing record, preferring non-null values
      const existing = eventsMap.get(key)!;
      const merged: EconomicEvent = {
        event_id: existing.event_id, // Keep first event_id
        country: event.country,
        event_name: event.event_name,
        event_timestamp: event.event_timestamp,
        data_provider: `${existing.data_provider}, ${event.data_provider}`
      };
      
      // Merge other fields, preferring non-null values
      for (const [key, value] of Object.entries(event)) {
        if (value !== null && value !== undefined && value !== '' && 
            key !== 'data_provider' && key !== 'event_id' && 
            !merged[key as keyof EconomicEvent]) {
          (merged as EconomicEvent & Record<string, unknown>)[key] = value;
        }
      }
      
      // Update last_update to most recent
      merged.last_update = new Date().toISOString();
      
      eventsMap.set(key, merged);
    } else {
      // Create new record
      const newEvent: EconomicEvent = {
        event_id: event.event_id || `${event.data_provider}_${Date.now()}`,
        country: event.country,
        event_name: event.event_name,
        event_period: event.event_period,
        actual: event.actual,
        previous: event.previous,
        forecast: event.forecast,
        unit: event.unit,
        importance: event.importance || 1,
        event_timestamp: event.event_timestamp,
        last_update: event.last_update || new Date().toISOString(),
        description: event.description,
        url: event.url,
        category: event.category || 'other',
        frequency: event.frequency || 'monthly',
        source: event.source,
        currency: event.currency || 'USD',
        market_impact: event.market_impact || 'low',
        status: event.status || 'scheduled',
        revised: event.revised || false,
        data_provider: event.data_provider || 'unknown'
      };
      
      eventsMap.set(key, newEvent);
    }
  }
  
  return Array.from(eventsMap.values());
}

/**
 * Save economic events data to the database
 */
async function saveEconomicEvents(supabase: SupabaseClient, eventsData: EconomicEvent[]): Promise<boolean> {
  if (eventsData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('economic_events')
      .upsert(eventsData, {
        onConflict: 'event_id,data_provider'
      });
    
    if (error) {
      console.error(`Error saving economic events data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveEconomicEvents:`, error);
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
    
    console.log('Starting economic events multi-provider fetch for 30-day period...');
    
    const { fromDate, toDate } = getDateRange();
    console.log(`Fetching economic events from ${fromDate} to ${toDate}`);
    
    let totalEvents = 0;
    let successfulProviders = 0;
    let errorCount = 0;
    
    try {
      console.log('Fetching data from all providers...');
      
      // Fetch data from all providers
      const providerPromises = [
        fetchFromFMP(),
        fetchFromFinnhub(),
        fetchFromAlphaVantage(),
        fetchFromTwelveData(),
        fetchFromFRED(),
      ];
      
      const providerResults = await Promise.allSettled(providerPromises);
      
      // Filter successful results
      const validResults = providerResults
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(result => result !== null);
      
      if (validResults.length > 0) {
        const combinedData = combineEconomicEvents(validResults);
        
        if (combinedData.length > 0) {
          const saved = await saveEconomicEvents(supabaseClient, combinedData);
          
          if (saved) {
            successfulProviders = validResults.length;
            totalEvents = combinedData.length;
            
            console.log(`Successfully processed ${totalEvents} economic events from ${successfulProviders} providers`);
          } else {
            errorCount = 1;
            console.error('Failed to save economic events to database');
          }
        } else {
          errorCount = 1;
          console.error('No valid economic events data found');
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
      success: totalEvents > 0,
      message: 'Economic events multi-provider fetch completed',
      date_range: {
        from: fromDate,
        to: toDate
      },
      summary: {
        successful_providers: successfulProviders,
        total_events: totalEvents,
        errors: errorCount
      },
      categories: totalEvents > 0 ? [
        'gdp', 'inflation', 'employment', 'monetary_policy', 
        'consumer', 'manufacturing', 'housing', 'other'
      ] : [],
      countries: ['US', 'EU', 'GB', 'JP'] // Main countries covered
    };
    
    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: totalEvents > 0 ? 200 : 404
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

