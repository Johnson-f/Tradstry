import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };
  
interface MoverData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  percent_change: number;
  mover_type: 'active' | 'gainer' | 'loser';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Starting market movers data fetch...')

    // API endpoints
    const endpoints = [
      { url: 'https://finance-query.onrender.com/v1/actives', type: 'active' as const },
      { url: 'https://finance-query.onrender.com/v1/gainers?count=25', type: 'gainer' as const },
      { url: 'https://finance-query.onrender.com/v1/losers?count=25', type: 'loser' as const }
    ]

    const allMoversData: MoverData[] = []
    const errors: string[] = []

    // Fetch data from all endpoints
    for (const endpoint of endpoints) {
      try {
        console.log(`Fetching ${endpoint.type} data from: ${endpoint.url}`)
        
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Tradistry-EdgeFunction/1.0'
          }
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`API Error for ${endpoint.type}: ${response.status} - ${errorText}`)
          errors.push(`${endpoint.type}: ${response.status} - ${errorText}`)
          continue
        }

        const data = await response.json()
        console.log(`Received ${endpoint.type} data:`, Object.keys(data).length, 'items')

        // Transform API response to our format
        const transformedData: MoverData[] = Object.entries(data).map(([symbol, moverData]: [string, {
          name?: string;
          price?: string | number;
          change?: string | number;
          percentChange?: string;
        }]) => {
          // Parse percentage change (remove % sign and convert to decimal)
          let percentChange = 0
          if (moverData.percentChange) {
            const percentStr = moverData.percentChange.toString().replace('%', '').replace('+', '')
            percentChange = parseFloat(percentStr) || 0
          }

          // Parse price and change
          const price = parseFloat(moverData.price?.toString() || '0') || 0
          const change = parseFloat(moverData.change?.toString().replace('+', '') || '0') || 0

          return {
            symbol: symbol.toUpperCase(),
            name: moverData.name || symbol,
            price,
            change,
            percent_change: percentChange,
            mover_type: endpoint.type
          }
        })

        allMoversData.push(...transformedData)

      } catch (error) {
        console.error(`Error fetching ${endpoint.type} data:`, error)
        errors.push(`${endpoint.type}: ${error.message}`)
      }
    }

    if (allMoversData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No data fetched from any endpoint',
          errors 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Total movers data to process: ${allMoversData.length}`)

    // Upsert data to database
    const upsertPromises = allMoversData.map(async (mover) => {
      try {
        // First, try to find existing record for today
        const { data: existingData, error: selectError } = await supabase
          .from('market_movers')
          .select('id')
          .eq('symbol', mover.symbol)
          .eq('mover_type', mover.mover_type)
          .eq('data_date', new Date().toISOString().split('T')[0])
          .single()

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error(`Error checking existing record for ${mover.symbol}:`, selectError)
          return { success: false, symbol: mover.symbol, error: selectError.message }
        }

        if (existingData) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('market_movers')
            .update({
              name: mover.name,
              price: mover.price,
              change: mover.change,
              percent_change: mover.percent_change,
              fetch_timestamp: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingData.id)

          if (updateError) {
            console.error(`Error updating ${mover.symbol}:`, updateError)
            return { success: false, symbol: mover.symbol, error: updateError.message }
          }

          return { success: true, symbol: mover.symbol, action: 'updated' }
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('market_movers')
            .insert({
              symbol: mover.symbol,
              name: mover.name,
              price: mover.price,
              change: mover.change,
              percent_change: mover.percent_change,
              mover_type: mover.mover_type,
              data_provider: 'finance_query',
              fetch_timestamp: new Date().toISOString(),
              data_date: new Date().toISOString().split('T')[0]
            })

          if (insertError) {
            console.error(`Error inserting ${mover.symbol}:`, insertError)
            return { success: false, symbol: mover.symbol, error: insertError.message }
          }

          return { success: true, symbol: mover.symbol, action: 'inserted' }
        }
      } catch (error) {
        console.error(`Unexpected error processing ${mover.symbol}:`, error)
        return { success: false, symbol: mover.symbol, error: error.message }
      }
    })

    const results = await Promise.all(upsertPromises)
    
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    
    const summary = {
      total_processed: results.length,
      successful: successful.length,
      failed: failed.length,
      inserted: successful.filter(r => r.action === 'inserted').length,
      updated: successful.filter(r => r.action === 'updated').length,
      api_errors: errors,
      failed_symbols: failed.map(f => ({ symbol: f.symbol, error: f.error }))
    }

    console.log('Processing summary:', summary)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Market movers data processed successfully',
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
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})