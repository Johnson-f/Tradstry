import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    console.log('Starting deletion of all market_movers data...')

    // Get count of records before deletion for logging
    const { count: beforeCount, error: countError } = await supabase
      .from('market_movers')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error getting record count:', countError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to get record count',
          error: countError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Found ${beforeCount} records to delete`)

    // Delete all records from market_movers table
    const { error: deleteError } = await supabase
      .from('market_movers')
      .delete()
      .neq('id', 0) // This condition will match all rows since id is never 0

    if (deleteError) {
      console.error('Error deleting records:', deleteError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to delete records',
          error: deleteError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify deletion by checking count after
    const { count: afterCount, error: verifyError } = await supabase
      .from('market_movers')
      .select('*', { count: 'exact', head: true })

    if (verifyError) {
      console.error('Error verifying deletion:', verifyError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Deletion completed but verification failed',
          error: verifyError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const deletedCount = (beforeCount || 0) - (afterCount || 0)

    console.log(`Successfully deleted ${deletedCount} records from market_movers table`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'All market movers data deleted successfully',
        summary: {
          records_before: beforeCount || 0,
          records_after: afterCount || 0,
          records_deleted: deletedCount,
          timestamp: new Date().toISOString()
        }
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
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})