/**
 * Supabase Edge Function: News Data Multi-Provider Fetcher
 * 
 * This Edge Function fetches news articles from 12 different market data providers,
 * combines the data to create comprehensive news records with deduplication,
 * and saves them to the database.
 * 
 * Providers used for news data:
 * 1. NewsAPI - General financial news
 * 2. NewsAPI AI - AI-powered news aggregation
 * 3. Currents API - Real-time global news
 * 4. MediaStack - Real-time news API
 * 5. GNews - Google News API
 * 6. Finnhub - Financial news and market sentiment
 * 7. Alpha Vantage - Market news and sentiment
 * 8. Financial Modeling Prep (FMP) - Financial news
 * 9. Polygon - Market news and events
 * 10. Twelve Data - Financial news
 * 11. Tiingo - Market news and analysis
 * 12. Yahoo Finance - Financial news and analysis
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// CORS headers for handling cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Types for news article data
interface NewsArticle {
  title: string;
  summary?: string;
  content?: string;
  url?: string;
  source?: string;
  published_at: string; // ISO timestamp
  author?: string;
  category?: string;
  sentiment?: number; // -1.0 to 1.0
  relevance_score?: number; // 0.0 to 1.0
  sentiment_confidence?: number;
  language?: string;
  word_count?: number;
  image_url?: string;
  tags?: string[];
  data_provider: string;
}

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  endpoints: {
    news?: string;
    company_news?: string;
    general_news?: string;
    search?: string;
  };
  rateLimit: number; // requests per minute
  categories: string[];
}

// Provider configurations for news data
const PROVIDERS: Record<string, ProviderConfig> = {
  newsapi: {
    name: 'NewsAPI',
    apiKey: Deno.env.get('NEWSAPI_KEY') || '',
    baseUrl: 'https://newsapi.org/v2',
    endpoints: {
      news: '/everything',
      general_news: '/top-headlines',
    },
    rateLimit: 1000, // 1000 per day for free tier
    categories: ['business', 'general', 'technology']
  },
  newsapi_ai: {
    name: 'NewsAPI AI',
    apiKey: Deno.env.get('NEWSAPI_AI_KEY') || '',
    baseUrl: 'https://api.newsapi.ai/api/v1',
    endpoints: {
      news: '/article/getArticles',
    },
    rateLimit: 10000, // 10k per month for free tier
    categories: ['business', 'finance']
  },
  currents_api: {
    name: 'Currents API',
    apiKey: Deno.env.get('CURRENTS_API_KEY') || '',
    baseUrl: 'https://api.currentsapi.services/v1',
    endpoints: {
      news: '/search',
      general_news: '/latest-news',
    },
    rateLimit: 600, // 600 per day for free tier
    categories: ['business', 'finance', 'technology']
  },
  mediastack: {
    name: 'MediaStack',
    apiKey: Deno.env.get('MEDIASTACK_API_KEY') || '',
    baseUrl: 'http://api.mediastack.com/v1',
    endpoints: {
      news: '/news',
    },
    rateLimit: 500, // 500 per month for free tier
    categories: ['business', 'technology']
  },
  gnews: {
    name: 'GNews',
    apiKey: Deno.env.get('GNEWS_API_KEY') || '',
    baseUrl: 'https://gnews.io/api/v4',
    endpoints: {
      news: '/search',
      general_news: '/top-headlines',
    },
    rateLimit: 100, // 100 per day for free tier
    categories: ['business', 'technology', 'general']
  },
  finnhub: {
    name: 'Finnhub',
    apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
    baseUrl: 'https://finnhub.io/api/v1',
    endpoints: {
      company_news: '/company-news',
      general_news: '/news',
    },
    rateLimit: 30, // 30 per second for free tier
    categories: ['general', 'forex', 'crypto', 'merger']
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
    baseUrl: 'https://www.alphavantage.co/query',
    endpoints: {
      news: '?function=NEWS_SENTIMENT',
    },
    rateLimit: 5, // 5 per minute for free tier
    categories: ['general']
  },
  fmp: {
    name: 'Financial Modeling Prep',
    apiKey: Deno.env.get('FMP_API_KEY') || '',
    baseUrl: 'https://financialmodelingprep.com/api/v3',
    endpoints: {
      general_news: '/stock_news',
      company_news: '/stock_news',
    },
    rateLimit: 250, // 250 per day for free tier
    categories: ['general', 'earnings']
  },
  polygon: {
    name: 'Polygon',
    apiKey: Deno.env.get('POLYGON_API_KEY') || '',
    baseUrl: 'https://api.polygon.io/v2',
    endpoints: {
      news: '/reference/news',
    },
    rateLimit: 5, // 5 per minute for free tier
    categories: ['general']
  },
  twelve_data: {
    name: 'Twelve Data',
    apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
    baseUrl: 'https://api.twelvedata.com',
    endpoints: {
      news: '/news',
    },
    rateLimit: 8, // 8 per minute for free tier
    categories: ['general']
  },
  tiingo: {
    name: 'Tiingo',
    apiKey: Deno.env.get('TIINGO_API_KEY') || '',
    baseUrl: 'https://api.tiingo.com/tiingo/news',
    endpoints: {
      news: '',
    },
    rateLimit: 500, // 500 per hour for free tier
    categories: ['general']
  },
  yahoo_finance: {
    name: 'Yahoo Finance',
    apiKey: '', // No API key required
    baseUrl: 'https://query2.finance.yahoo.com/v1/finance',
    endpoints: {
      news: '/search',
    },
    rateLimit: 1000, // Conservative estimate
    categories: ['general']
  }
};

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Calculate basic sentiment score from text content
 */
function calculateSentiment(text: string): { score: number; confidence: number } {
  if (!text) return { score: 0, confidence: 0 };
  
  const positiveWords = ['profit', 'gain', 'growth', 'increase', 'rise', 'up', 'bullish', 'strong', 'positive', 'beat', 'exceeded', 'outperform'];
  const negativeWords = ['loss', 'decline', 'drop', 'fall', 'down', 'bearish', 'weak', 'negative', 'miss', 'underperform', 'crash', 'plunge'];
  
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (positiveWords.some(pos => word.includes(pos))) positiveCount++;
    if (negativeWords.some(neg => word.includes(neg))) negativeCount++;
  });
  
  const total = positiveCount + negativeCount;
  if (total === 0) return { score: 0, confidence: 0 };
  
  const score = (positiveCount - negativeCount) / Math.max(words.length / 10, 1);
  const confidence = Math.min(total / Math.max(words.length / 20, 1), 1);
  
  return {
    score: Math.max(-1, Math.min(1, score)),
    confidence: Math.max(0, Math.min(1, confidence))
  };
}

/**
 * Extract stock symbols mentioned in text
 */
function extractStockSymbols(text: string): string[] {
  if (!text) return [];
  
  // Common stock symbol patterns
  const symbolPattern = /\b[A-Z]{1,5}\b(?=\s|$|[^A-Z])/g;
  const matches = text.match(symbolPattern) || [];
  
  // Filter out common false positives
  const falsePositives = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BY', 'TO', 'IS', 'OF', 'IT', 'IN', 'BE', 'HE', 'HIS', 'AT', 'ON', 'AS', 'DO', 'OR', 'AN', 'IF', 'NO', 'UP', 'SO', 'MY', 'ME', 'WE', 'GO', 'US', 'AM', 'OH'];
  
  return [...new Set(matches.filter(symbol => !falsePositives.includes(symbol)))];
}

/**
 * Fetch news from NewsAPI
 */
async function fetchFromNewsAPI(symbols: string[] = [], category: string = 'business'): Promise<NewsArticle[]> {
  const config = PROVIDERS.newsapi;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch general business news
    const generalUrl = `${config.baseUrl}${config.endpoints.general_news}?category=${category}&language=en&pageSize=50&apiKey=${config.apiKey}`;
    const generalResponse = await fetch(generalUrl);
    
    if (generalResponse.ok) {
      const generalData = await generalResponse.json();
      if (generalData.status === 'ok' && generalData.articles) {
        for (const article of generalData.articles) {
          if (article.title && article.title !== '[Removed]') {
            const content = article.content || article.description || '';
            const sentiment = calculateSentiment(content + ' ' + article.title);
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
            
            articles.push({
              title: article.title,
              summary: article.description,
              content: article.content,
              url: article.url,
              source: article.source?.name,
              published_at: article.publishedAt || getCurrentTimestamp(),
              author: article.author,
              category: 'business',
              sentiment: sentiment.score,
              sentiment_confidence: sentiment.confidence,
              relevance_score: mentionedSymbols.length > 0 ? 0.8 : 0.5,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.urlToImage,
              tags: mentionedSymbols,
              data_provider: 'newsapi'
            });
          }
        }
      }
    }
    
    // Fetch symbol-specific news if symbols provided
    if (symbols.length > 0) {
      const symbolQuery = symbols.slice(0, 5).join(' OR '); // Limit to avoid long URLs
      const symbolUrl = `${config.baseUrl}${config.endpoints.news}?q=${encodeURIComponent(symbolQuery)}&language=en&sortBy=publishedAt&pageSize=50&apiKey=${config.apiKey}`;
      const symbolResponse = await fetch(symbolUrl);
      
      if (symbolResponse.ok) {
        const symbolData = await symbolResponse.json();
        if (symbolData.status === 'ok' && symbolData.articles) {
          for (const article of symbolData.articles) {
            if (article.title && article.title !== '[Removed]') {
              const content = article.content || article.description || '';
              const sentiment = calculateSentiment(content + ' ' + article.title);
              const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
              
              articles.push({
                title: article.title,
                summary: article.description,
                content: article.content,
                url: article.url,
                source: article.source?.name,
                published_at: article.publishedAt || getCurrentTimestamp(),
                author: article.author,
                category: 'general',
                sentiment: sentiment.score,
                sentiment_confidence: sentiment.confidence,
                relevance_score: mentionedSymbols.length > 0 ? 0.9 : 0.6,
                language: 'en',
                word_count: content.split(' ').length,
                image_url: article.urlToImage,
                tags: mentionedSymbols,
                data_provider: 'newsapi'
              });
            }
          }
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`NewsAPI fetch error:`, error);
    return [];
  }
}

/**
 * Fetch news from Finnhub
 */
async function fetchFromFinnhub(symbols: string[] = []): Promise<NewsArticle[]> {
  const config = PROVIDERS.finnhub;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch general market news
    const generalUrl = `${config.baseUrl}${config.endpoints.general_news}?category=general&token=${config.apiKey}`;
    const generalResponse = await fetch(generalUrl);
    
    if (generalResponse.ok) {
      const generalData = await generalResponse.json();
      if (Array.isArray(generalData)) {
        for (const article of generalData.slice(0, 50)) {
          if (article.headline) {
            const content = article.summary || '';
            const sentiment = calculateSentiment(content + ' ' + article.headline);
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.headline);
            
            articles.push({
              title: article.headline,
              summary: article.summary,
              url: article.url,
              source: article.source || 'Finnhub',
              published_at: article.datetime ? new Date(article.datetime * 1000).toISOString() : getCurrentTimestamp(),
              category: 'general',
              sentiment: sentiment.score,
              sentiment_confidence: sentiment.confidence,
              relevance_score: mentionedSymbols.length > 0 ? 0.8 : 0.6,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.image,
              tags: mentionedSymbols,
              data_provider: 'finnhub'
            });
          }
        }
      }
    }
    
    // Fetch company-specific news
    for (const symbol of symbols.slice(0, 10)) { // Limit to avoid rate limits
      try {
        const companyUrl = `${config.baseUrl}${config.endpoints.company_news}?symbol=${symbol}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&token=${config.apiKey}`;
        const companyResponse = await fetch(companyUrl);
        
        if (companyResponse.ok) {
          const companyData = await companyResponse.json();
          if (Array.isArray(companyData)) {
            for (const article of companyData.slice(0, 20)) {
              if (article.headline) {
                const content = article.summary || '';
                const sentiment = calculateSentiment(content + ' ' + article.headline);
                
                articles.push({
                  title: article.headline,
                  summary: article.summary,
                  url: article.url,
                  source: article.source || 'Finnhub',
                  published_at: article.datetime ? new Date(article.datetime * 1000).toISOString() : getCurrentTimestamp(),
                  category: 'general',
                  sentiment: sentiment.score,
                  sentiment_confidence: sentiment.confidence,
                  relevance_score: 0.9, // High relevance for symbol-specific news
                  language: 'en',
                  word_count: content.split(' ').length,
                  image_url: article.image,
                  tags: [symbol],
                  data_provider: 'finnhub'
                });
              }
            }
          }
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (symbolError) {
        console.error(`Finnhub symbol ${symbol} error:`, symbolError);
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`Finnhub fetch error:`, error);
    return [];
  }
}

/**
 * Fetch news from Financial Modeling Prep (FMP)
 */
async function fetchFromFMP(symbols: string[] = []): Promise<NewsArticle[]> {
  const config = PROVIDERS.fmp;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch general stock news
    const generalUrl = `${config.baseUrl}${config.endpoints.general_news}?limit=50&apikey=${config.apiKey}`;
    const generalResponse = await fetch(generalUrl);
    
    if (generalResponse.ok) {
      const generalData = await generalResponse.json();
      if (Array.isArray(generalData)) {
        for (const article of generalData) {
          if (article.title) {
            const content = article.text || '';
            const sentiment = calculateSentiment(content + ' ' + article.title);
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
            
            articles.push({
              title: article.title,
              summary: article.text ? article.text.substring(0, 200) + '...' : undefined,
              content: article.text,
              url: article.url,
              source: article.site || 'FMP',
              published_at: article.publishedDate || getCurrentTimestamp(),
              category: 'general',
              sentiment: sentiment.score,
              sentiment_confidence: sentiment.confidence,
              relevance_score: mentionedSymbols.length > 0 ? 0.8 : 0.5,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.image,
              tags: mentionedSymbols,
              data_provider: 'fmp'
            });
          }
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`FMP fetch error:`, error);
    return [];
  }
}

/**
 * Fetch news from Alpha Vantage
 */
async function fetchFromAlphaVantage(symbols: string[] = []): Promise<NewsArticle[]> {
  const config = PROVIDERS.alpha_vantage;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch general news sentiment
    const url = `${config.baseUrl}${config.endpoints.news}&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.feed && Array.isArray(data.feed)) {
        for (const article of data.feed.slice(0, 50)) {
          if (article.title) {
            const content = article.summary || '';
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
            
            articles.push({
              title: article.title,
              summary: article.summary,
              url: article.url,
              source: article.source || 'Alpha Vantage',
              published_at: article.time_published || getCurrentTimestamp(),
              author: article.authors?.join(', '),
              category: 'general',
              sentiment: article.overall_sentiment_score ? parseFloat(article.overall_sentiment_score) : undefined,
              sentiment_confidence: article.overall_sentiment_label === 'Neutral' ? 0.5 : 0.8,
              relevance_score: article.relevance_score ? parseFloat(article.relevance_score) : 0.5,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.banner_image,
              tags: mentionedSymbols,
              data_provider: 'alpha_vantage'
            });
          }
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`Alpha Vantage fetch error:`, error);
    return [];
  }
}

/**
 * Fetch news from Polygon
 */
async function fetchFromPolygon(symbols: string[] = []): Promise<NewsArticle[]> {
  const config = PROVIDERS.polygon;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch general market news
    const url = `${config.baseUrl}${config.endpoints.news}?limit=50&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        for (const article of data.results) {
          if (article.title) {
            const content = article.description || '';
            const sentiment = calculateSentiment(content + ' ' + article.title);
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
            
            articles.push({
              title: article.title,
              summary: article.description,
              url: article.article_url,
              source: article.publisher?.name || 'Polygon',
              published_at: article.published_utc || getCurrentTimestamp(),
              author: article.author,
              category: 'general',
              sentiment: sentiment.score,
              sentiment_confidence: sentiment.confidence,
              relevance_score: mentionedSymbols.length > 0 ? 0.8 : 0.5,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.image_url,
              tags: mentionedSymbols,
              data_provider: 'polygon'
            });
          }
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`Polygon fetch error:`, error);
    return [];
  }
}

/**
 * Fetch news from GNews
 */
async function fetchFromGNews(): Promise<NewsArticle[]> {
  const config = PROVIDERS.gnews;
  if (!config.apiKey) return [];
  
  try {
    const articles: NewsArticle[] = [];
    
    // Fetch business news
    const url = `${config.baseUrl}${config.endpoints.general_news}?category=business&lang=en&country=us&max=50&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.articles && Array.isArray(data.articles)) {
        for (const article of data.articles) {
          if (article.title) {
            const content = article.description || article.content || '';
            const sentiment = calculateSentiment(content + ' ' + article.title);
            const mentionedSymbols = extractStockSymbols(content + ' ' + article.title);
            
            articles.push({
              title: article.title,
              summary: article.description,
              content: article.content,
              url: article.url,
              source: article.source?.name,
              published_at: article.publishedAt || getCurrentTimestamp(),
              category: 'business',
              sentiment: sentiment.score,
              sentiment_confidence: sentiment.confidence,
              relevance_score: mentionedSymbols.length > 0 ? 0.8 : 0.5,
              language: 'en',
              word_count: content.split(' ').length,
              image_url: article.image,
              tags: mentionedSymbols,
              data_provider: 'gnews'
            });
          }
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error(`GNews fetch error:`, error);
    return [];
  }
}

/**
 * Combine and deduplicate news articles from multiple providers
 */
function combineNewsData(dataArray: NewsArticle[]): NewsArticle[] {
  if (dataArray.length === 0) return [];
  
  // Create a map to track unique articles by URL and title
  const uniqueArticles = new Map<string, NewsArticle>();
  const seenTitles = new Set<string>();
  
  // Provider priority for news data (highest to lowest)
  const providerPriority = {
    'alpha_vantage': 9,  // Professional sentiment analysis
    'finnhub': 8,        // Real-time financial news
    'fmp': 7,           // Comprehensive financial data
    'polygon': 6,        // Market-focused news
    'newsapi': 5,        // Wide news coverage
    'gnews': 4,         // Google News aggregation
    'newsapi_ai': 3,    // AI-powered aggregation
    'currents_api': 2,   // Real-time global news
    'mediastack': 1,     // General news API
  };
  
  // Sort articles by provider priority and published date
  const sortedArticles = dataArray.sort((a, b) => {
    const aPriority = providerPriority[a.data_provider as keyof typeof providerPriority] || 0;
    const bPriority = providerPriority[b.data_provider as keyof typeof providerPriority] || 0;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority; // Higher priority first
    }
    
    // If same priority, sort by published date (newer first)
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });
  
  for (const article of sortedArticles) {
    // Create unique key based on URL or title
    const urlKey = article.url ? new URL(article.url).pathname : null;
    const titleKey = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    
    // Check for duplicates
    let isDuplicate = false;
    
    if (urlKey && uniqueArticles.has(urlKey)) {
      isDuplicate = true;
    } else if (seenTitles.has(titleKey)) {
      isDuplicate = true;
    }
    
    if (!isDuplicate) {
      // Add to unique collection
      const key = urlKey || titleKey;
      uniqueArticles.set(key, article);
      seenTitles.add(titleKey);
    }
  }
  
  // Convert back to array and limit to prevent overwhelming the database
  return Array.from(uniqueArticles.values()).slice(0, 200);
}

/**
 * Fetch existing symbols from the database
 */
async function getExistingSymbols(supabase: SupabaseClient): Promise<string[]> {
  try {
    // Get symbols from stocks table
    const { data, error } = await supabase
      .from('stocks')
      .select('symbol')
      .order('symbol');
    
    if (error) {
      console.error('Error fetching symbols:', error);
      return [];
    }
    
    if (data && data.length > 0) {
      const uniqueSymbols = [...new Set(data.map((row: { symbol: string }) => row.symbol))];
      console.log(`Found ${uniqueSymbols.length} existing symbols`);
      return uniqueSymbols;
    }
    
    console.log('No existing symbols found');
    return [];
    
  } catch (error) {
    console.error('Error in getExistingSymbols:', error);
    return [];
  }
}

/**
 * Get existing articles from database to avoid duplicates and recent fetches
 */
async function getExistingArticlesInfo(supabase: SupabaseClient, hoursBack: number = 24): Promise<{
  existingUrls: Set<string>;
  existingTitles: Set<string>;
  recentProviderFetches: Map<string, Date>;
}> {
  try {
    // Get articles from the last specified hours to avoid recent duplicates
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('news_articles')
      .select('url, title, data_provider, created_at')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching existing articles:', error);
      return {
        existingUrls: new Set(),
        existingTitles: new Set(),
        recentProviderFetches: new Map()
      };
    }
    
    const existingUrls = new Set<string>();
    const existingTitles = new Set<string>();
    const recentProviderFetches = new Map<string, Date>();
    
    if (data && data.length > 0) {
      for (const article of data) {
        // Track existing URLs
        if (article.url) {
          existingUrls.add(article.url);
        }
        
        // Track existing titles (normalized)
        if (article.title) {
          const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
          existingTitles.add(normalizedTitle);
        }
        
        // Track most recent fetch per provider
        if (article.data_provider && article.created_at) {
          const providerDate = new Date(article.created_at);
          const currentDate = recentProviderFetches.get(article.data_provider);
          if (!currentDate || providerDate > currentDate) {
            recentProviderFetches.set(article.data_provider, providerDate);
          }
        }
      }
      
      console.log(`Found ${existingUrls.size} existing URLs, ${existingTitles.size} existing titles, ${recentProviderFetches.size} recent provider fetches`);
    }
    
    return {
      existingUrls,
      existingTitles,
      recentProviderFetches
    };
    
  } catch (error) {
    console.error('Error in getExistingArticlesInfo:', error);
    return {
      existingUrls: new Set(),
      existingTitles: new Set(),
      recentProviderFetches: new Map()
    };
  }
}

/**
 * Check if provider was recently fetched (within specified hours)
 */
function wasRecentlyFetched(provider: string, recentFetches: Map<string, Date>, hoursLimit: number = 2): boolean {
  const lastFetch = recentFetches.get(provider);
  if (!lastFetch) return false;
  
  const hoursAgo = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);
  return hoursAgo < hoursLimit;
}

/**
 * Filter out articles that already exist in database
 */
function filterExistingArticles(
  articles: NewsArticle[], 
  existingUrls: Set<string>, 
  existingTitles: Set<string>
): NewsArticle[] {
  return articles.filter(article => {
    // Check URL
    if (article.url && existingUrls.has(article.url)) {
      return false;
    }
    
    // Check normalized title
    const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    if (existingTitles.has(normalizedTitle)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Save news articles to the database
 */
async function saveNewsData(supabase: SupabaseClient, articles: NewsArticle[]): Promise<boolean> {
  if (articles.length === 0) return true;
  
  try {
    let successfulInserts = 0;
    let errorCount = 0;
    
    // Insert articles in batches to avoid overwhelming the database
    const batchSize = 10;
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      for (const article of batch) {
        try {
          // Insert article using conflict resolution (ON CONFLICT DO NOTHING for URLs)
          const { data, error } = await supabase
            .from('news_articles')
            .insert({
              title: article.title,
              summary: article.summary,
              content: article.content,
              url: article.url,
              source: article.source,
              published_at: article.published_at,
              author: article.author,
              category: article.category || 'general',
              sentiment: article.sentiment,
              relevance_score: article.relevance_score,
              sentiment_confidence: article.sentiment_confidence,
              language: article.language || 'en',
              word_count: article.word_count,
              image_url: article.image_url,
              tags: article.tags,
              data_provider: article.data_provider
            })
            .select('id')
            .single();
          
          if (error) {
            if (error.code === '23505') { // Unique violation - article already exists
              console.log(`Article already exists: ${article.title.substring(0, 50)}...`);
            } else {
              console.error(`Error inserting article "${article.title.substring(0, 50)}...":`, error);
              errorCount++;
            }
          } else {
            successfulInserts++;
            console.log(`Inserted article: ${article.title.substring(0, 50)}... (ID: ${data?.id})`);
          }
          
        } catch (insertError) {
          console.error(`Error inserting article "${article.title.substring(0, 50)}...":`, insertError);
          errorCount++;
        }
      }
      
      // Small delay between batches
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`News save summary: ${successfulInserts} successful, ${errorCount} errors`);
    return successfulInserts > 0;
    
  } catch (error) {
    console.error('Error in saveNewsData:', error);
    return false;
  }
}

/**
 * Validate news article data
 */
function validateNewsData(article: NewsArticle): boolean {
  // Basic validation checks
  if (!article.title || !article.published_at || !article.data_provider) return false;
  
  // Check if published date is valid
  const publishedDate = new Date(article.published_at);
  if (isNaN(publishedDate.getTime())) return false;
  
  // Check if published date is not too far in the future
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (publishedDate > oneWeekFromNow) return false;
  
  // Check sentiment values are in valid range
  if (article.sentiment !== undefined && (article.sentiment < -1 || article.sentiment > 1)) return false;
  if (article.relevance_score !== undefined && (article.relevance_score < 0 || article.relevance_score > 1)) return false;
  if (article.sentiment_confidence !== undefined && (article.sentiment_confidence < 0 || article.sentiment_confidence > 1)) return false;
  
  // Check title length
  if (article.title.length > 500) return false;
  
  return true;
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
    
    console.log('Starting news data multi-provider fetch...');
    
    // Parse request body for any specific parameters (optional)
    let fetchGeneral = true;
    let requestedSymbols: string[] | null = null;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        fetchGeneral = body.fetchGeneral ?? true;
        requestedSymbols = body.symbols;
      } catch {
        // Continue with defaults if request body parsing fails
      }
    }
    
    // Get existing symbols and articles info to avoid duplicates
    const existingSymbols = requestedSymbols || await getExistingSymbols(supabaseClient);
    const existingArticlesInfo = await getExistingArticlesInfo(supabaseClient, 24); // Check last 24 hours
    
    console.log(`Fetching news data. Symbols: ${existingSymbols.length}, General: ${fetchGeneral}`);
    console.log(`Existing articles filter: ${existingArticlesInfo.existingUrls.size} URLs, ${existingArticlesInfo.existingTitles.size} titles`);
    
    let allArticles: NewsArticle[] = [];
    let providerResults: Record<string, string> = {};
    const skippedProviders: string[] = [];
    
    // Check provider fetch frequency limits (2 hours minimum between fetches)
    const providerFetchLimit = 2; // hours
    
    // Fetch from all providers concurrently with controlled parallelism
    const providerPromises = [];
    
    if (fetchGeneral) {
      // Check each provider and only fetch if not recently fetched
      
      if (!wasRecentlyFetched('newsapi', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromNewsAPI(existingSymbols.slice(0, 10), 'business').then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['newsapi'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('newsapi');
      }
      
      if (!wasRecentlyFetched('finnhub', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromFinnhub(existingSymbols.slice(0, 10)).then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['finnhub'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('finnhub');
      }
      
      if (!wasRecentlyFetched('fmp', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromFMP(existingSymbols.slice(0, 10)).then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['fmp'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('fmp');
      }
      
      if (!wasRecentlyFetched('alpha_vantage', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromAlphaVantage(existingSymbols.slice(0, 10)).then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['alpha_vantage'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('alpha_vantage');
      }
      
      if (!wasRecentlyFetched('polygon', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromPolygon(existingSymbols.slice(0, 10)).then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['polygon'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('polygon');
      }
      
      if (!wasRecentlyFetched('gnews', existingArticlesInfo.recentProviderFetches, providerFetchLimit)) {
        providerPromises.push(
          fetchFromGNews().then(articles => {
            const filteredArticles = filterExistingArticles(articles, existingArticlesInfo.existingUrls, existingArticlesInfo.existingTitles);
            providerResults['gnews'] = `${filteredArticles.length}/${articles.length}`;
            return filteredArticles;
          })
        );
      } else {
        skippedProviders.push('gnews');
      }
    }
    
    // Execute all provider fetches
    const providerResults_array = await Promise.allSettled(providerPromises);
    
    // Collect all successful results
    for (const result of providerResults_array) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allArticles.push(...result.value);
      } else if (result.status === 'rejected') {
        console.error('Provider fetch error:', result.reason);
      }
    }
    
    console.log(`Raw articles fetched: ${allArticles.length}`);
    console.log(`Providers skipped (recently fetched): ${skippedProviders.join(', ')}`);
    
    // Combine and deduplicate articles (additional deduplication layer)
    const combinedArticles = combineNewsData(allArticles);
    console.log(`After deduplication: ${combinedArticles.length}`);
    
    // Validate articles
    const validArticles = combinedArticles.filter(validateNewsData);
    console.log(`After validation: ${validArticles.length}`);
    
    // Final filter to ensure no existing articles slip through
    const finalFilteredArticles = filterExistingArticles(
      validArticles, 
      existingArticlesInfo.existingUrls, 
      existingArticlesInfo.existingTitles
    );
    console.log(`After final existing filter: ${finalFilteredArticles.length}`);
    
    // Save to database
    const saveSuccess = await saveNewsData(supabaseClient, finalFilteredArticles);
    
    const response = {
      success: true,
      message: 'News data multi-provider fetch completed',
      summary: {
        total_articles_fetched: allArticles.length,
        after_deduplication: combinedArticles.length,
        after_validation: validArticles.length,
        after_existing_filter: finalFilteredArticles.length,
        save_success: saveSuccess,
        providers_used: Object.keys(providerResults).length,
        providers_skipped: skippedProviders.length,
        provider_results: providerResults,
        skipped_providers: skippedProviders,
        symbols_processed: existingSymbols.length,
        existing_articles_checked: existingArticlesInfo.existingUrls.size + existingArticlesInfo.existingTitles.size,
        timestamp: getCurrentTimestamp()
      },
      sample_articles: validArticles.slice(0, 5).map(article => ({
        title: article.title,
        source: article.source,
        published_at: article.published_at,
        sentiment: article.sentiment,
        relevance_score: article.relevance_score,
        data_provider: article.data_provider
      }))
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
        message: 'Internal server error in news data fetch'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
