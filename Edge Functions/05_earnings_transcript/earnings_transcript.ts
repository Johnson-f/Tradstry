/**
 * Supabase Edge Function: Earnings Transcript Multi-Provider Fetcher
 * 
 * This Edge Function fetches earnings call transcripts from 12 different market data providers,
 * combines the data to create comprehensive transcript records with sentiment analysis,
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

// TODO: Create a trigger logic, that fetches transcript data dynamically based on user request on the frontend 

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for earnings transcript information
interface EarningsTranscript {
  symbol: string;
  exchange_id?: number;
  earnings_date: string;
  fiscal_quarter: string; // 'Q1', 'Q2', 'Q3', 'Q4'
  fiscal_year: number;
  
  // Transcript content
  transcript_title?: string;
  full_transcript: string;
  transcript_length?: number;
  transcript_language?: string;
  
  // Conference call details
  conference_call_date?: string;
  conference_call_duration?: string;
  audio_recording_url?: string;
  presentation_url?: string;
  
  // Financial results summary
  reported_eps?: number;
  reported_revenue?: number;
  guidance_eps?: number;
  guidance_revenue?: number;
  
  // Sentiment and analysis
  overall_sentiment?: number;
  confidence_score?: number;
  key_themes?: string[];
  risk_factors?: string[];
  
  // Provider info
  data_provider: string;
  transcript_quality?: string; // 'complete', 'partial', 'summary'
}

interface TranscriptParticipant {
  participant_name: string;
  participant_title?: string;
  participant_company?: string;
  participant_type?: string; // 'executive', 'analyst', 'other'
  speaking_time?: string;
  question_count?: number;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    transcript?: string;
    earnings?: string;
    transcripts?: string;
  };
}

// Provider configurations for earnings transcript data
const PROVIDERS: Record<string, ProviderConfig> = {
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v4',
    endpoints: {
      transcript: '/transcript',
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
      transcript: '/stock/transcripts',
    }
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v2',
    endpoints: {
      transcript: '/aggs/ticker',
    }
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      earnings: '/earnings',
    }
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/fundamentals',
    endpoints: {
      transcript: '/transcripts',
    }
  }
};

/**
 * Simple sentiment analysis function
 */
function analyzeSentiment(text: string): { sentiment: number; confidence: number; themes: string[]; risks: string[] } {
  if (!text || text.length === 0) {
    return { sentiment: 0, confidence: 0, themes: [], risks: [] };
  }
  
  const textLower = text.toLowerCase();
  
  // Simple positive/negative word counting
  const positiveWords = [
    'growth', 'increase', 'strong', 'excellent', 'optimistic', 'positive', 'beat', 'exceeded',
    'outperformed', 'successful', 'improved', 'expansion', 'opportunity', 'confident', 'solid',
    'robust', 'momentum', 'acceleration', 'breakthrough', 'record', 'outstanding'
  ];
  
  const negativeWords = [
    'decline', 'decrease', 'weak', 'poor', 'pessimistic', 'negative', 'miss', 'failed',
    'underperformed', 'disappointed', 'challenging', 'difficult', 'concern', 'risk', 'uncertainty',
    'volatility', 'headwind', 'pressure', 'slowdown', 'recession', 'crisis'
  ];
  
  // Count positive and negative words
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    const matches = textLower.match(new RegExp(word, 'g'));
    if (matches) positiveCount += matches.length;
  });
  
  negativeWords.forEach(word => {
    const matches = textLower.match(new RegExp(word, 'g'));
    if (matches) negativeCount += matches.length;
  });
  
  // Calculate sentiment score (-1 to 1)
  const totalWords = positiveCount + negativeCount;
  let sentiment = 0;
  let confidence = 0;
  
  if (totalWords > 0) {
    sentiment = (positiveCount - negativeCount) / totalWords;
    confidence = Math.min(totalWords / 50, 1); // More words = higher confidence, capped at 1
  }
  
  // Extract key themes (simple keyword matching)
  const themes: string[] = [];
  const themeKeywords = {
    'Revenue Growth': ['revenue', 'sales', 'income', 'growth'],
    'Market Expansion': ['market', 'expansion', 'international', 'global'],
    'Product Innovation': ['product', 'innovation', 'technology', 'development'],
    'Cost Management': ['cost', 'efficiency', 'margin', 'expense'],
    'Digital Transformation': ['digital', 'cloud', 'automation', 'ai', 'artificial intelligence'],
    'Guidance': ['guidance', 'outlook', 'forecast', 'projection']
  };
  
  Object.entries(themeKeywords).forEach(([theme, keywords]) => {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      themes.push(theme);
    }
  });
  
  // Extract risk factors
  const risks: string[] = [];
  const riskKeywords = {
    'Market Risk': ['market risk', 'economic uncertainty', 'recession'],
    'Competition': ['competition', 'competitive pressure', 'market share'],
    'Regulatory Risk': ['regulation', 'compliance', 'regulatory'],
    'Supply Chain': ['supply chain', 'logistics', 'inventory'],
    'Currency Risk': ['foreign exchange', 'currency', 'fx risk'],
    'Interest Rate Risk': ['interest rate', 'borrowing cost', 'debt']
  };
  
  Object.entries(riskKeywords).forEach(([risk, keywords]) => {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      risks.push(risk);
    }
  });
  
  return { sentiment, confidence, themes, risks };
}

/**
 * Extract financial metrics from transcript text
 */
function extractFinancialMetrics(text: string): { eps?: number; revenue?: number; guidanceEps?: number; guidanceRevenue?: number } {
  const textLower = text.toLowerCase();
  
  // Simple regex patterns for extracting financial numbers
  const epsRegex = /(?:earnings per share|eps)[\s\w]*?(?:of\s+)?\$?(\d+\.?\d*)/gi;
  const revenueRegex = /revenue[\s\w]*?(?:of\s+)?\$?(\d+(?:\.\d+)?)\s*(?:billion|million|b|m)/gi;
  const guidanceRegex = /(?:guidance|expect|project)[\s\w]*?(?:eps|earnings per share)[\s\w]*?\$?(\d+\.?\d*)/gi;
  const revenueGuidanceRegex = /(?:guidance|expect|project)[\s\w]*?revenue[\s\w]*?\$?(\d+(?:\.\d+)?)\s*(?:billion|million|b|m)/gi;
  
  let eps: number | undefined;
  let revenue: number | undefined;
  let guidanceEps: number | undefined;
  let guidanceRevenue: number | undefined;
  
  // Extract EPS
  const epsMatch = epsRegex.exec(textLower);
  if (epsMatch) {
    eps = parseFloat(epsMatch[1]);
  }
  
  // Extract Revenue
  const revenueMatch = revenueRegex.exec(textLower);
  if (revenueMatch) {
    const value = parseFloat(revenueMatch[1]);
    const unit = revenueMatch[0].toLowerCase();
    revenue = unit.includes('billion') || unit.includes('b') ? value * 1000000000 : value * 1000000;
  }
  
  // Extract Guidance EPS
  const guidanceMatch = guidanceRegex.exec(textLower);
  if (guidanceMatch) {
    guidanceEps = parseFloat(guidanceMatch[1]);
  }
  
  // Extract Revenue Guidance
  const revenueGuidanceMatch = revenueGuidanceRegex.exec(textLower);
  if (revenueGuidanceMatch) {
    const value = parseFloat(revenueGuidanceMatch[1]);
    const unit = revenueGuidanceMatch[0].toLowerCase();
    guidanceRevenue = unit.includes('billion') || unit.includes('b') ? value * 1000000000 : value * 1000000;
  }
  
  return { eps, revenue, guidanceEps, guidanceRevenue };
}

/**
 * Fetch earnings transcript data from Financial Modeling Prep
 */
async function fetchFromFMP(symbol: string): Promise<Partial<EarningsTranscript>[] | null> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.transcript}/${symbol}?year=2024&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    
    return data.slice(0, 4).map((transcript: any) => {
      const earningsDate = new Date(transcript.date);
      const fiscalYear = earningsDate.getFullYear();
      const fiscalQuarter = `Q${Math.ceil((earningsDate.getMonth() + 1) / 3)}`;
      
      // Analyze sentiment and extract metrics
      const fullTranscript = transcript.content || '';
      const analysis = analyzeSentiment(fullTranscript);
      const metrics = extractFinancialMetrics(fullTranscript);
      
      return {
        symbol: symbol,
        earnings_date: transcript.date,
        fiscal_quarter: fiscalQuarter,
        fiscal_year: fiscalYear,
        transcript_title: `${symbol} ${fiscalQuarter} ${fiscalYear} Earnings Call`,
        full_transcript: fullTranscript,
        transcript_length: fullTranscript.length,
        transcript_language: 'en',
        conference_call_date: transcript.date,
        reported_eps: metrics.eps,
        reported_revenue: metrics.revenue,
        guidance_eps: metrics.guidanceEps,
        guidance_revenue: metrics.guidanceRevenue,
        overall_sentiment: analysis.sentiment,
        confidence_score: analysis.confidence,
        key_themes: analysis.themes,
        risk_factors: analysis.risks,
        data_provider: 'fmp',
        transcript_quality: 'complete'
      };
    });
  } catch (error) {
    console.error(`FMP transcript fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings transcript data from Finnhub
 */
async function fetchFromFinnhub(symbol: string): Promise<Partial<EarningsTranscript>[] | null> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return null;
  
  try {
    const url = `${config.baseUrl}${config.endpoints.transcript}?symbol=${symbol}&token=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.transcript || !Array.isArray(data.transcript)) return null;
    
    return data.transcript.slice(0, 4).map((transcript: any) => {
      const earningsDate = new Date(transcript.quarter);
      const fiscalYear = transcript.year || earningsDate.getFullYear();
      const fiscalQuarter = transcript.quarter || `Q${Math.ceil((earningsDate.getMonth() + 1) / 3)}`;
      
      // Combine all transcript sections
      let fullTranscript = '';
      if (transcript.transcript && Array.isArray(transcript.transcript)) {
        fullTranscript = transcript.transcript.map((section: any) => section.transcript || '').join('\n\n');
      }
      
      const analysis = analyzeSentiment(fullTranscript);
      const metrics = extractFinancialMetrics(fullTranscript);
      
      return {
        symbol: symbol,
        earnings_date: transcript.quarter,
        fiscal_quarter: fiscalQuarter,
        fiscal_year: fiscalYear,
        transcript_title: `${symbol} ${fiscalQuarter} ${fiscalYear} Earnings Call`,
        full_transcript: fullTranscript,
        transcript_length: fullTranscript.length,
        transcript_language: 'en',
        reported_eps: metrics.eps,
        reported_revenue: metrics.revenue,
        guidance_eps: metrics.guidanceEps,
        guidance_revenue: metrics.guidanceRevenue,
        overall_sentiment: analysis.sentiment,
        confidence_score: analysis.confidence,
        key_themes: analysis.themes,
        risk_factors: analysis.risks,
        data_provider: 'finnhub',
        transcript_quality: 'complete'
      };
    });
  } catch (error) {
    console.error(`Finnhub transcript fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings transcript data from Alpha Vantage (limited transcript support)
 */
async function fetchFromAlphaVantage(symbol: string): Promise<Partial<EarningsTranscript>[] | null> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return null;
  
  try {
    // Alpha Vantage doesn't have direct transcript API, but we can create basic records from earnings data
    const url = `${config.baseUrl}${config.endpoints.earnings}&symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.Note || data['Error Message'] || !data.quarterlyEarnings) return null;
    
    return data.quarterlyEarnings.slice(0, 4).map((earning: any) => {
      const earningsDate = new Date(earning.reportedDate);
      const fiscalDate = new Date(earning.fiscalDateEnding);
      const fiscalYear = fiscalDate.getFullYear();
      const fiscalQuarter = `Q${Math.ceil((fiscalDate.getMonth() + 1) / 3)}`;
      
      // Create a basic transcript summary from available data
      const basicTranscript = `${symbol} reported earnings for ${fiscalQuarter} ${fiscalYear}. ` +
        `Reported EPS: ${earning.reportedEPS || 'N/A'}, Estimated EPS: ${earning.estimatedEPS || 'N/A'}. ` +
        `${earning.surprise && earning.surprise !== '0' ? 
          (parseFloat(earning.surprise) > 0 ? 'Beat expectations.' : 'Missed expectations.') : 
          'Met expectations.'}`;
      
      const analysis = analyzeSentiment(basicTranscript);
      
      return {
        symbol: symbol,
        earnings_date: earning.reportedDate,
        fiscal_quarter: fiscalQuarter,
        fiscal_year: fiscalYear,
        transcript_title: `${symbol} ${fiscalQuarter} ${fiscalYear} Earnings Summary`,
        full_transcript: basicTranscript,
        transcript_length: basicTranscript.length,
        transcript_language: 'en',
        reported_eps: earning.reportedEPS ? parseFloat(earning.reportedEPS) : undefined,
        overall_sentiment: analysis.sentiment,
        confidence_score: 0.3, // Lower confidence for basic summary
        key_themes: analysis.themes,
        risk_factors: analysis.risks,
        data_provider: 'alpha_vantage',
        transcript_quality: 'summary'
      };
    });
  } catch (error) {
    console.error(`Alpha Vantage transcript fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch earnings transcript data from Twelve Data
 */
async function fetchFromTwelveData(symbol: string): Promise<Partial<EarningsTranscript>[] | null> {
  const config = PROVIDERS.twelve_data;
  if (!config.apiKey) return null;
  
  try {
    // Twelve Data has limited transcript support, using earnings data as base
    const url = `${config.baseUrl}${config.endpoints.earnings}?symbol=${symbol}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === 'error' || !data.earnings || !Array.isArray(data.earnings)) return null;
    
    return data.earnings.slice(0, 4).map((earning: any) => {
      const earningsDate = new Date(earning.date);
      const fiscalYear = earningsDate.getFullYear();
      const fiscalQuarter = `Q${Math.ceil((earningsDate.getMonth() + 1) / 3)}`;
      
      // Create basic transcript from earnings data
      const basicTranscript = `${symbol} earnings call for ${fiscalQuarter} ${fiscalYear}. ` +
        `EPS: ${earning.eps || 'N/A'}, Estimated EPS: ${earning.eps_estimate || 'N/A'}.`;
      
      const analysis = analyzeSentiment(basicTranscript);
      
      return {
        symbol: symbol,
        earnings_date: earning.date,
        fiscal_quarter: fiscalQuarter,
        fiscal_year: fiscalYear,
        transcript_title: `${symbol} ${fiscalQuarter} ${fiscalYear} Earnings Summary`,
        full_transcript: basicTranscript,
        transcript_length: basicTranscript.length,
        transcript_language: 'en',
        reported_eps: earning.eps ? parseFloat(earning.eps) : undefined,
        overall_sentiment: analysis.sentiment,
        confidence_score: 0.3,
        key_themes: analysis.themes,
        risk_factors: analysis.risks,
        data_provider: 'twelve_data',
        transcript_quality: 'summary'
      };
    });
  } catch (error) {
    console.error(`Twelve Data transcript fetch error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Combine earnings transcript data from multiple providers
 */
function combineTranscriptData(dataArrays: (Partial<EarningsTranscript>[] | null)[]): EarningsTranscript[] {
  const validData = dataArrays.filter(data => data !== null) as Partial<EarningsTranscript>[][];
  
  if (validData.length === 0) return [];
  
  // Flatten all transcript records
  const allTranscripts = validData.flat();
  
  // Group by symbol, fiscal_year, and fiscal_quarter to merge duplicates
  const transcriptMap = new Map<string, EarningsTranscript>();
  
  for (const transcript of allTranscripts) {
    if (!transcript.symbol || !transcript.fiscal_year || !transcript.fiscal_quarter || !transcript.full_transcript) continue;
    
    const key = `${transcript.symbol}-${transcript.fiscal_year}-${transcript.fiscal_quarter}`;
    
    if (transcriptMap.has(key)) {
      // Merge with existing record, preferring more complete transcripts
      const existing = transcriptMap.get(key)!;
      const merged: EarningsTranscript = {
        symbol: transcript.symbol,
        earnings_date: transcript.earnings_date || existing.earnings_date,
        fiscal_quarter: transcript.fiscal_quarter,
        fiscal_year: transcript.fiscal_year,
        full_transcript: '', // Will be set below
        data_provider: `${existing.data_provider}, ${transcript.data_provider}`
      };
      
      // Choose the longest/most complete transcript
      if (transcript.full_transcript.length > existing.full_transcript.length) {
        merged.full_transcript = transcript.full_transcript;
        merged.transcript_length = transcript.transcript_length;
        merged.transcript_quality = transcript.transcript_quality || 'complete';
      } else {
        merged.full_transcript = existing.full_transcript;
        merged.transcript_length = existing.transcript_length;
        merged.transcript_quality = existing.transcript_quality || 'complete';
      }
      
      // Merge other fields, preferring non-null values
      for (const [key, value] of Object.entries(transcript)) {
        if (value !== null && value !== undefined && value !== '' && 
            key !== 'data_provider' && key !== 'full_transcript' && 
            !merged[key as keyof EarningsTranscript]) {
          (merged as EarningsTranscript & Record<string, unknown>)[key] = value;
        }
      }
      
      // Average sentiment scores if both exist
      if (transcript.overall_sentiment !== undefined && existing.overall_sentiment !== undefined) {
        merged.overall_sentiment = (transcript.overall_sentiment + existing.overall_sentiment) / 2;
      } else {
        merged.overall_sentiment = transcript.overall_sentiment || existing.overall_sentiment;
      }
      
      // Combine themes and risks (remove duplicates)
      if (transcript.key_themes && existing.key_themes) {
        merged.key_themes = [...new Set([...existing.key_themes, ...transcript.key_themes])];
      } else {
        merged.key_themes = transcript.key_themes || existing.key_themes;
      }
      
      if (transcript.risk_factors && existing.risk_factors) {
        merged.risk_factors = [...new Set([...existing.risk_factors, ...transcript.risk_factors])];
      } else {
        merged.risk_factors = transcript.risk_factors || existing.risk_factors;
      }
      
      transcriptMap.set(key, merged);
    } else {
      // Create new record
      const newTranscript: EarningsTranscript = {
        symbol: transcript.symbol,
        exchange_id: transcript.exchange_id,
        earnings_date: transcript.earnings_date || new Date().toISOString().split('T')[0],
        fiscal_quarter: transcript.fiscal_quarter,
        fiscal_year: transcript.fiscal_year,
        transcript_title: transcript.transcript_title,
        full_transcript: transcript.full_transcript,
        transcript_length: transcript.transcript_length || transcript.full_transcript.length,
        transcript_language: transcript.transcript_language || 'en',
        conference_call_date: transcript.conference_call_date,
        conference_call_duration: transcript.conference_call_duration,
        audio_recording_url: transcript.audio_recording_url,
        presentation_url: transcript.presentation_url,
        reported_eps: transcript.reported_eps,
        reported_revenue: transcript.reported_revenue,
        guidance_eps: transcript.guidance_eps,
        guidance_revenue: transcript.guidance_revenue,
        overall_sentiment: transcript.overall_sentiment,
        confidence_score: transcript.confidence_score,
        key_themes: transcript.key_themes,
        risk_factors: transcript.risk_factors,
        data_provider: transcript.data_provider || 'unknown',
        transcript_quality: transcript.transcript_quality || 'complete'
      };
      
      transcriptMap.set(key, newTranscript);
    }
  }
  
  return Array.from(transcriptMap.values());
}

/**
 * Fetch existing symbols from the database
 */
async function getExistingSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('earnings_transcripts')
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
 * Save earnings transcript data to the database
 */
async function saveTranscriptData(supabase: SupabaseClient, transcriptData: EarningsTranscript[]): Promise<boolean> {
  if (transcriptData.length === 0) return true;
  
  try {
    const { error } = await supabase
      .from('earnings_transcripts')
      .upsert(transcriptData, {
        onConflict: 'symbol,fiscal_year,fiscal_quarter,data_provider'
      });
    
    if (error) {
      console.error(`Error saving transcript data:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveTranscriptData:`, error);
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
    
    console.log('Starting earnings transcript multi-provider fetch...');
    
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
    let totalTranscripts = 0;
    
    // Process symbols in very small batches (transcripts are large)
    const batchSize = 3;
    const results = [];
    
    for (let i = 0; i < existingSymbols.length; i += batchSize) {
      const batch = existingSymbols.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(existingSymbols.length / batchSize)}`);
        
        // Process each symbol individually (transcript APIs are symbol-specific)
        for (const symbol of batch) {
          try {
            console.log(`Fetching transcript data for ${symbol}...`);
            
            // Fetch data from available providers
            const providerPromises = [
              fetchFromFMP(symbol),
              fetchFromFinnhub(symbol),
              fetchFromAlphaVantage(symbol),
              fetchFromTwelveData(symbol),
            ];
            
            const providerResults = await Promise.allSettled(providerPromises);
            
            // Filter successful results
            const validResults = providerResults
              .map(result => result.status === 'fulfilled' ? result.value : null)
              .filter(result => result !== null);
            
            if (validResults.length > 0) {
              const combinedData = combineTranscriptData(validResults);
              
              if (combinedData.length > 0) {
                const saved = await saveTranscriptData(supabaseClient, combinedData);
                
                if (saved) {
                  successCount++;
                  totalTranscripts += combinedData.length;
                  
                  results.push({
                    symbol,
                    status: 'success',
                    transcript_records: combinedData.length,
                    providers: validResults.length,
                    total_characters: combinedData.reduce((sum, t) => sum + (t.transcript_length || 0), 0)
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
                  message: 'No valid transcript data found'
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
            
            // Longer delay between symbols due to transcript size
            await new Promise(resolve => setTimeout(resolve, 1000));
            
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
      
      // Longer delay between batches for transcript processing
      if (i + batchSize < existingSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    const response = {
      success: true,
      message: 'Earnings transcript multi-provider fetch completed',
      summary: {
        total_symbols: existingSymbols.length,
        processed: processedCount,
        successful: successCount,
        errors: errorCount,
        total_transcript_records: totalTranscripts
      },
      results: results.slice(0, 30) // Limit response size due to potentially large transcript data
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


