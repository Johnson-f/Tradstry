/**
 * Supabase Edge Function: General News Multi-Provider Fetcher
 * 
 * Fetches general financial news from 4 providers:
 * 1. MediaStack - Real-time news API (https://mediastack.com/documentation)
 * 2. Currents API - Real-time global news (https://currentsapi.services/en/docs/)
 * 3. NewsAPI AI - AI-powered news (https://newsapi.ai/documentation)
 * 4. GNews - Google News API (https://docs.gnews.io/)
 * 
 * Features:
 * - Multi-provider fetching with parallel processing
 * - Duplicate detection by URL and title
 * - Sentiment analysis and stock symbol extraction
 * - Database-level duplicate prevention
 * - Comprehensive error handling
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface NewsArticle {
  title: string
  summary?: string
  content?: string
  url?: string
  source?: string
  published_at: string
  author?: string
  category?: string
  sentiment?: number
  relevance_score?: number
  sentiment_confidence?: number
  language?: string
  word_count?: number
  image_url?: string
  tags?: string[]
  data_provider: string
}

interface ProviderConfig {
  name: string
  apiKey: string
  baseUrl: string
  enabled: boolean
}

interface ProcessingResult {
  success: boolean
  url?: string
  title?: string
  error?: string
  action?: 'inserted' | 'duplicate'
}

// =====================================================
// PROVIDER CONFIGURATIONS
// =====================================================

const PROVIDERS: Record<string, ProviderConfig> = {
  mediastack: {
    name: 'MediaStack',
    apiKey: Deno.env.get('MEDIASTACK_API_KEY') || '',
    baseUrl: 'http://api.mediastack.com/v1',
    enabled: true
  },
  currents: {
    name: 'Currents API',
    apiKey: Deno.env.get('CURRENTS_API_KEY') || '',
    baseUrl: 'https://api.currentsapi.services/v1',
    enabled: true
  },
  newsapi_ai: {
    name: 'NewsAPI AI',
    apiKey: Deno.env.get('NEWSAPI_AI_KEY') || '',
    baseUrl: 'https://newsapi.ai/api/v1',
    enabled: true
  },
  gnews: {
    name: 'GNews',
    apiKey: Deno.env.get('GNEWS_API_KEY') || '',
    baseUrl: 'https://gnews.io/api/v4',
    enabled: true
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function getCurrentTimestamp(): string {
  return new Date().toISOString()
}

function calculateSentiment(text: string): { score: number; confidence: number } {
  if (!text) return { score: 0, confidence: 0 }
  
  const positiveWords = ['profit', 'gain', 'growth', 'increase', 'rise', 'up', 'bullish', 'strong', 'positive', 'beat', 'exceeded', 'outperform', 'rally', 'surge']
  const negativeWords = ['loss', 'decline', 'drop', 'fall', 'down', 'bearish', 'weak', 'negative', 'miss', 'underperform', 'crash', 'plunge', 'slump']
  
  const words = text.toLowerCase().split(/\s+/)
  let positiveCount = 0
  let negativeCount = 0
  
  words.forEach(word => {
    if (positiveWords.some(pos => word.includes(pos))) positiveCount++
    if (negativeWords.some(neg => word.includes(neg))) negativeCount++
  })
  
  const total = positiveCount + negativeCount
  if (total === 0) return { score: 0, confidence: 0 }
  
  const score = (positiveCount - negativeCount) / Math.max(words.length / 10, 1)
  const confidence = Math.min(total / Math.max(words.length / 20, 1), 1)
  
  return {
    score: Math.max(-1, Math.min(1, score)),
    confidence: Math.max(0, Math.min(1, confidence))
  }
}

function extractStockSymbols(text: string): string[] {
  if (!text) return []
  
  const symbolPattern = /\b[A-Z]{1,5}\b(?=\s|$|[^A-Z])/g
  const matches = text.match(symbolPattern) || []
  
  const falsePositives = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'WAS', 'ONE', 'OUR', 'HAD', 'BY', 'TO', 'IS', 'OF', 'IT', 'IN', 'BE', 'AT', 'ON', 'AS', 'DO', 'OR', 'AN', 'IF', 'NO', 'UP', 'SO', 'GO', 'US', 'CEO', 'CFO', 'CTO', 'USA', 'EUR', 'USD', 'API', 'IPO', 'ETF', 'SEC']
  
  return [...new Set(matches.filter(symbol => !falsePositives.includes(symbol)))]
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 100)
}

function calculateRelevance(text: string): number {
  if (!text) return 0.3
  
  const financialKeywords = ['stock', 'market', 'trading', 'earnings', 'revenue', 'profit', 'investor', 'investment', 'shares', 'equity', 'dividend', 'analyst', 'forecast']
  
  const textLower = text.toLowerCase()
  const matchCount = financialKeywords.filter(keyword => textLower.includes(keyword)).length
  
  return Math.min(0.3 + (matchCount * 0.1), 1.0)
}

// =====================================================
// PROVIDER FETCH FUNCTIONS
// =====================================================

async function fetchFromMediaStack(): Promise<NewsArticle[]> {
  const config = PROVIDERS.mediastack
  if (!config.apiKey || !config.enabled) {
    console.log('MediaStack: Skipping (API key not configured)')
    return []
  }
  
  try {
    console.log('MediaStack: Starting fetch...')
    
    const url = `${config.baseUrl}/news?access_key=${config.apiKey}&languages=en&categories=business,technology&limit=50&sort=published_desc`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.error(`MediaStack: API error ${response.status}`)
      return []
    }
    
    const data = await response.json()
    
    if (!data.data || !Array.isArray(data.data)) {
      console.error('MediaStack: Unexpected response format')
      return []
    }
    
    const articles: NewsArticle[] = data.data
      .filter((article: any) => article.title && article.title.trim().length > 0)
      .map((article: any) => {
        const combinedText = `${article.title} ${article.description || ''}`
        const sentiment = calculateSentiment(combinedText)
        const symbols = extractStockSymbols(combinedText)
        const relevance = calculateRelevance(combinedText)
        
        return {
          title: article.title,
          summary: article.description || undefined,
          url: article.url,
          source: article.source || 'MediaStack',
          published_at: article.published_at || getCurrentTimestamp(),
          author: article.author || undefined,
          category: article.category || 'business',
          sentiment: sentiment.score,
          sentiment_confidence: sentiment.confidence,
          relevance_score: relevance,
          language: article.language || 'en',
          word_count: combinedText.split(/\s+/).length,
          image_url: article.image || undefined,
          tags: symbols.length > 0 ? symbols : undefined,
          data_provider: 'mediastack'
        }
      })
    
    console.log(`MediaStack: Fetched ${articles.length} articles`)
    return articles
    
  } catch (error) {
    console.error('MediaStack: Fetch error:', error)
    return []
  }
}

async function fetchFromCurrents(): Promise<NewsArticle[]> {
  const config = PROVIDERS.currents
  if (!config.apiKey || !config.enabled) {
    console.log('Currents API: Skipping (API key not configured)')
    return []
  }
  
  try {
    console.log('Currents API: Starting fetch...')
    
    const url = `${config.baseUrl}/latest-news?apiKey=${config.apiKey}&language=en&category=business,technology`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.error(`Currents API: Error ${response.status}`)
      return []
    }
    
    const data = await response.json()
    
    if (!data.news || !Array.isArray(data.news)) {
      console.error('Currents API: Unexpected response format')
      return []
    }
    
    const articles: NewsArticle[] = data.news
      .filter((article: any) => article.title && article.title.trim().length > 0)
      .map((article: any) => {
        const combinedText = `${article.title} ${article.description || ''}`
        const sentiment = calculateSentiment(combinedText)
        const symbols = extractStockSymbols(combinedText)
        const relevance = calculateRelevance(combinedText)
        
        return {
          title: article.title,
          summary: article.description || undefined,
          url: article.url,
          source: article.author || 'Currents API',
          published_at: article.published || getCurrentTimestamp(),
          author: article.author || undefined,
          category: article.category?.[0] || 'business',
          sentiment: sentiment.score,
          sentiment_confidence: sentiment.confidence,
          relevance_score: relevance,
          language: article.language || 'en',
          word_count: combinedText.split(/\s+/).length,
          image_url: article.image || undefined,
          tags: symbols.length > 0 ? symbols : undefined,
          data_provider: 'currents'
        }
      })
    
    console.log(`Currents API: Fetched ${articles.length} articles`)
    return articles
    
  } catch (error) {
    console.error('Currents API: Fetch error:', error)
    return []
  }
}

async function fetchFromNewsAPIAI(): Promise<NewsArticle[]> {
  const config = PROVIDERS.newsapi_ai
  if (!config.apiKey || !config.enabled) {
    console.log('NewsAPI AI: Skipping (API key not configured)')
    return []
  }
  
  try {
    console.log('NewsAPI AI: Starting fetch...')
    
    const requestBody = {
      query: {
        $query: {
          $and: [
            { lang: 'eng' },
            { 
              $or: [
                { categoryUri: 'news/Business' },
                { categoryUri: 'news/Economy_Money_and_Finance' }
              ]
            }
          ]
        }
      },
      resultType: 'articles',
      articlesSortBy: 'date',
      articlesCount: 50,
      apiKey: config.apiKey
    }
    
    const response = await fetch(`${config.baseUrl}/article/getArticles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      console.error(`NewsAPI AI: API error ${response.status}`)
      return []
    }
    
    const data = await response.json()
    
    if (!data.articles?.results || !Array.isArray(data.articles.results)) {
      console.error('NewsAPI AI: Unexpected response format')
      return []
    }
    
    const articles: NewsArticle[] = data.articles.results
      .filter((article: any) => article.title && article.title.trim().length > 0)
      .map((article: any) => {
        const combinedText = `${article.title} ${article.body || ''}`
        const sentiment = calculateSentiment(combinedText)
        const symbols = extractStockSymbols(combinedText)
        const relevance = calculateRelevance(combinedText)
        
        return {
          title: article.title,
          summary: article.body ? article.body.substring(0, 250) + '...' : undefined,
          content: article.body || undefined,
          url: article.url,
          source: article.source?.title || 'NewsAPI AI',
          published_at: article.dateTime || getCurrentTimestamp(),
          author: article.authors?.[0]?.name || undefined,
          category: 'business',
          sentiment: article.sentiment || sentiment.score,
          sentiment_confidence: sentiment.confidence,
          relevance_score: article.relevance || relevance,
          language: 'en',
          word_count: combinedText.split(/\s+/).length,
          image_url: article.image || undefined,
          tags: symbols.length > 0 ? symbols : undefined,
          data_provider: 'newsapi_ai'
        }
      })
    
    console.log(`NewsAPI AI: Fetched ${articles.length} articles`)
    return articles
    
  } catch (error) {
    console.error('NewsAPI AI: Fetch error:', error)
    return []
  }
}

async function fetchFromGNews(): Promise<NewsArticle[]> {
  const config = PROVIDERS.gnews
  if (!config.apiKey || !config.enabled) {
    console.log('GNews: Skipping (API key not configured)')
    return []
  }
  
  try {
    console.log('GNews: Starting fetch...')
    
    const url = `${config.baseUrl}/top-headlines?category=business&lang=en&country=us&max=50&apikey=${config.apiKey}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.error(`GNews: Error ${response.status}`)
      return []
    }
    
    const data = await response.json()
    
    if (!data.articles || !Array.isArray(data.articles)) {
      console.error('GNews: Unexpected response format')
      return []
    }
    
    const articles: NewsArticle[] = data.articles
      .filter((article: any) => article.title && article.title.trim().length > 0)
      .map((article: any) => {
        const combinedText = `${article.title} ${article.description || ''} ${article.content || ''}`
        const sentiment = calculateSentiment(combinedText)
        const symbols = extractStockSymbols(combinedText)
        const relevance = calculateRelevance(combinedText)
        
        return {
          title: article.title,
          summary: article.description || undefined,
          content: article.content || undefined,
          url: article.url,
          source: article.source?.name || 'GNews',
          published_at: article.publishedAt || getCurrentTimestamp(),
          category: 'business',
          sentiment: sentiment.score,
          sentiment_confidence: sentiment.confidence,
          relevance_score: relevance,
          language: 'en',
          word_count: combinedText.split(/\s+/).length,
          image_url: article.image || undefined,
          tags: symbols.length > 0 ? symbols : undefined,
          data_provider: 'gnews'
        }
      })
    
    console.log(`GNews: Fetched ${articles.length} articles`)
    return articles
    
  } catch (error) {
    console.error('GNews: Fetch error:', error)
    return []
  }
}

// =====================================================
// DATA PROCESSING FUNCTIONS
// =====================================================

function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  if (articles.length === 0) return []
  
  const uniqueArticles = new Map<string, NewsArticle>()
  const seenTitles = new Set<string>()
  
  const providerPriority: Record<string, number> = {
    'newsapi_ai': 4,
    'gnews': 3,
    'currents': 2,
    'mediastack': 1
  }
  
  const sortedArticles = [...articles].sort((a, b) => {
    const aPriority = providerPriority[a.data_provider] || 0
    const bPriority = providerPriority[b.data_provider] || 0
    
    if (aPriority !== bPriority) return bPriority - aPriority
    
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  })
  
  for (const article of sortedArticles) {
    const normalizedTitle = normalizeTitle(article.title)
    
    if (article.url && uniqueArticles.has(article.url)) continue
    if (seenTitles.has(normalizedTitle)) continue
    
    const key = article.url || `title_${normalizedTitle}_${article.data_provider}`
    uniqueArticles.set(key, article)
    
    if (normalizedTitle.length > 0) {
      seenTitles.add(normalizedTitle)
    }
  }
  
  const result = Array.from(uniqueArticles.values())
  console.log(`Deduplication: ${articles.length} → ${result.length} unique articles`)
  
  return result
}

async function getExistingArticlesInfo(supabase: SupabaseClient): Promise<{
  existingUrls: Set<string>
  existingTitles: Set<string>
}> {
  try {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data, error } = await supabase
      .from('news_articles')
      .select('url, title')
      .gte('created_at', cutoffDate)
    
    if (error) {
      console.error('Error fetching existing articles:', error)
      return { existingUrls: new Set(), existingTitles: new Set() }
    }
    
    const existingUrls = new Set<string>()
    const existingTitles = new Set<string>()
    
    if (data && data.length > 0) {
      for (const article of data) {
        if (article.url) existingUrls.add(article.url)
        if (article.title) existingTitles.add(normalizeTitle(article.title))
      }
      
      console.log(`Found ${existingUrls.size} existing URLs and ${existingTitles.size} existing titles`)
    }
    
    return { existingUrls, existingTitles }
    
  } catch (error) {
    console.error('Error in getExistingArticlesInfo:', error)
    return { existingUrls: new Set(), existingTitles: new Set() }
  }
}

function filterNewArticles(
  articles: NewsArticle[],
  existingUrls: Set<string>,
  existingTitles: Set<string>
): NewsArticle[] {
  const newArticles = articles.filter(article => {
    if (article.url && existingUrls.has(article.url)) return false
    
    const normalizedTitle = normalizeTitle(article.title)
    if (existingTitles.has(normalizedTitle)) return false
    
    return true
  })
  
  console.log(`Filtering: ${articles.length} → ${newArticles.length} new articles`)
  
  return newArticles
}

async function saveArticlesToDatabase(
  supabase: SupabaseClient,
  articles: NewsArticle[]
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = []
  
  for (const article of articles) {
    try {
      const { error } = await supabase
        .from('news_articles')
        .insert({
          title: article.title,
          summary: article.summary,
          content: article.content,
          url: article.url,
          source: article.source,
          published_at: article.published_at,
          author: article.author,
          category: article.category,
          sentiment: article.sentiment,
          relevance_score: article.relevance_score,
          sentiment_confidence: article.sentiment_confidence,
          language: article.language,
          word_count: article.word_count,
          image_url: article.image_url,
          tags: article.tags,
          data_provider: article.data_provider
        })
      
      if (error) {
        if (error.code === '23505') {
          results.push({
            success: false,
            url: article.url,
            title: article.title,
            error: 'Duplicate',
            action: 'duplicate'
          })
        } else {
          console.error(`Error inserting "${article.title}":`, error)
          results.push({
            success: false,
            url: article.url,
            title: article.title,
            error: error.message
          })
        }
      } else {
        results.push({
          success: true,
          url: article.url,
          title: article.title,
          action: 'inserted'
        })
      }
      
    } catch (error) {
      console.error(`Unexpected error inserting "${article.title}":`, error)
      results.push({
        success: false,
        url: article.url,
        title: article.title,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  return results
}

// =====================================================
// MAIN EDGE FUNCTION HANDLER
// =====================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    console.log('====================================')
    console.log('General News Fetcher: Starting...')
    console.log('====================================')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Fetch from all providers in parallel
    console.log('Fetching from all providers...')
    const [mediastackArticles, currentsArticles, newsapiAIArticles, gnewsArticles] = await Promise.all([
      fetchFromMediaStack(),
      fetchFromCurrents(),
      fetchFromNewsAPIAI(),
      fetchFromGNews()
    ])
    
    // Combine all articles
    const allArticles = [
      ...mediastackArticles,
      ...currentsArticles,
      ...newsapiAIArticles,
      ...gnewsArticles
    ]
    
    console.log(`Total articles fetched: ${allArticles.length}`)
    
    if (allArticles.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No articles fetched from any provider',
          summary: {
            total_fetched: 0,
            providers: {
              mediastack: mediastackArticles.length,
              currents: currentsArticles.length,
              newsapi_ai: newsapiAIArticles.length,
              gnews: gnewsArticles.length
            }
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Deduplicate articles from different providers
    const uniqueArticles = deduplicateArticles(allArticles)
    
    // Get existing articles from database
    const { existingUrls, existingTitles } = await getExistingArticlesInfo(supabase)
    
    // Filter out articles that already exist
    const newArticles = filterNewArticles(uniqueArticles, existingUrls, existingTitles)
    
    if (newArticles.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No new articles to save (all already exist in database)',
          summary: {
            total_fetched: allArticles.length,
            after_dedup: uniqueArticles.length,
            new_articles: 0,
            already_in_db: uniqueArticles.length,
            providers: {
              mediastack: mediastackArticles.length,
              currents: currentsArticles.length,
              newsapi_ai: newsapiAIArticles.length,
              gnews: gnewsArticles.length
            }
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Save new articles to database
    console.log(`Saving ${newArticles.length} new articles to database...`)
    const results = await saveArticlesToDatabase(supabase, newArticles)
    
    // Calculate statistics
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    const duplicates = failed.filter(r => r.action === 'duplicate')
    
    const summary = {
      total_fetched: allArticles.length,
      after_dedup: uniqueArticles.length,
      new_articles: newArticles.length,
      successfully_saved: successful.length,
      duplicates: duplicates.length,
      errors: failed.filter(r => r.action !== 'duplicate').length,
      providers: {
        mediastack: mediastackArticles.length,
        currents: currentsArticles.length,
        newsapi_ai: newsapiAIArticles.length,
        gnews: gnewsArticles.length
      },
      failed_articles: failed.length > 0 ? failed.slice(0, 10).map(f => ({
        title: f.title?.substring(0, 50) + '...',
        error: f.error
      })) : undefined
    }
    
    console.log('Processing summary:', summary)
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${successful.length} articles`,
        summary
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Edge function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})