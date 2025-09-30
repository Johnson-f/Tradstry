/**
 * Supabase Edge Function: Delete Old News Data
 * 
 * This Edge Function deletes news articles older than 3 days from:
 * 1. news_articles table
 * 2. finance_news table
 * 
 * Features:
 * - Automatic cleanup of stale news data
 * - Cascading deletes for related records (news_stocks, finance_news_stocks)
 * - Detailed logging and statistics
 * - Safe error handling
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// Number of days to retain news data
const RETENTION_DAYS = 3

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    console.log('====================================')
    console.log('Delete Old News: Starting cleanup...')
    console.log('====================================')
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Calculate cutoff date (3 days ago)
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const cutoffDateISO = cutoffDate.toISOString()
    
    console.log(`Cutoff date: ${cutoffDateISO} (${RETENTION_DAYS} days ago)`)
    
    // Count records before deletion
    console.log('Counting records to be deleted...')
    
    const { count: newsArticlesCount, error: countNewsError } = await supabase
      .from('news_articles')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDateISO)
    
    if (countNewsError) {
      console.error('Error counting news_articles:', countNewsError)
      throw countNewsError
    }
    
    const { count: financeNewsCount, error: countFinanceError } = await supabase
      .from('finance_news')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDateISO)
    
    if (countFinanceError) {
      console.error('Error counting finance_news:', countFinanceError)
      throw countFinanceError
    }
    
    console.log(`Found ${newsArticlesCount || 0} news_articles to delete`)
    console.log(`Found ${financeNewsCount || 0} finance_news to delete`)
    
    // If nothing to delete, return early
    if ((newsArticlesCount || 0) === 0 && (financeNewsCount || 0) === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No old news data to delete',
          summary: {
            retention_days: RETENTION_DAYS,
            cutoff_date: cutoffDateISO,
            news_articles_deleted: 0,
            finance_news_deleted: 0,
            total_deleted: 0
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Delete from news_articles table
    console.log('Deleting from news_articles...')
    const { error: deleteNewsError } = await supabase
      .from('news_articles')
      .delete()
      .lt('created_at', cutoffDateISO)
    
    if (deleteNewsError) {
      console.error('Error deleting from news_articles:', deleteNewsError)
      throw deleteNewsError
    }
    
    console.log(`Successfully deleted ${newsArticlesCount || 0} records from news_articles`)
    
    // Delete from finance_news table
    console.log('Deleting from finance_news...')
    const { error: deleteFinanceError } = await supabase
      .from('finance_news')
      .delete()
      .lt('created_at', cutoffDateISO)
    
    if (deleteFinanceError) {
      console.error('Error deleting from finance_news:', deleteFinanceError)
      throw deleteFinanceError
    }
    
    console.log(`Successfully deleted ${financeNewsCount || 0} records from finance_news`)
    
    // Calculate totals
    const totalDeleted = (newsArticlesCount || 0) + (financeNewsCount || 0)
    
    const summary = {
      retention_days: RETENTION_DAYS,
      cutoff_date: cutoffDateISO,
      news_articles_deleted: newsArticlesCount || 0,
      finance_news_deleted: financeNewsCount || 0,
      total_deleted: totalDeleted,
      execution_time: new Date().toISOString()
    }
    
    console.log('Cleanup summary:', summary)
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully deleted ${totalDeleted} old news records`,
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
        message: 'Error deleting old news data',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})