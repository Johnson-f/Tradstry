import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };
  
interface MoverData {
  symbol: string;  // Ticker symbol as TEXT (not number)
  name: string;
  rank_position: number; // Position in leaderboard (1st, 2nd, etc.)
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
        console.log(`Received ${endpoint.type} data structure:`, typeof data, Array.isArray(data) ? `array with ${data.length} items` : `object with keys: ${Object.keys(data)}`)
        console.log(`Sample data:`, data[0] || Object.values(data)[0])

        // Transform API response to our format - REDESIGNED: NO PRICE DATA
        let transformedData: MoverData[] = []
        
        if (Array.isArray(data)) {
          // If data is an array of objects with symbol field
          transformedData = data.map((moverData: {
            symbol?: string;
            name?: string;
            price?: string | number;
            change?: string | number;
            percentChange?: string;
          }, index) => {
            // Extract symbol from the object
            const symbolText = (moverData.symbol || '').toString().toUpperCase().trim()
            
            // Validate that symbol looks like a ticker (letters/digits, reasonable length)
            if (!/^[A-Z0-9._-]{1,20}$/.test(symbolText)) {
              console.warn(`Invalid ticker symbol format: ${symbolText}`)
            }

            return {
              symbol: symbolText,  // Store as TEXT ticker symbol
              name: moverData.name || symbolText,
              rank_position: index + 1,  // Position in leaderboard (1st, 2nd, etc.)
              mover_type: endpoint.type
            }
          })
        } else if (typeof data === 'object' && data !== null) {
          // If data is an object with symbol keys
          transformedData = Object.entries(data).map(([symbol, moverData]: [string, {
            name?: string;
            price?: string | number;
            change?: string | number;
            percentChange?: string;
          }], index) => {
            // Ensure symbol is stored as TEXT (not number) and properly formatted
            const symbolText = symbol.toString().toUpperCase().trim()
            
            // Validate that symbol looks like a ticker (letters/digits, reasonable length)
            if (!/^[A-Z0-9._-]{1,20}$/.test(symbolText)) {
              console.warn(`Invalid ticker symbol format: ${symbolText}`)
            }

            return {
              symbol: symbolText,  // Store as TEXT ticker symbol
              name: moverData.name || symbolText,
              rank_position: index + 1,  // Position in leaderboard (1st, 2nd, etc.)
              mover_type: endpoint.type
            }
          })
        } else {
          console.error(`Unexpected data format for ${endpoint.type}:`, typeof data)
          continue
        }

        // Filter out invalid symbols before adding to our data
        const validData = transformedData.filter(item => {
          if (!item.symbol || item.symbol.length === 0) {
            console.warn(`Skipping entry with empty symbol:`, item)
            return false
          }
          if (/^\d+$/.test(item.symbol)) {
            console.warn(`Skipping numeric symbol: ${item.symbol}`)
            return false
          }
          return true
        })
        
        console.log(`Filtered ${transformedData.length} items to ${validData.length} valid entries for ${endpoint.type}`)
        allMoversData.push(...validData)

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
          // Update existing record - REDESIGNED: NO PRICE DATA
          const { error: updateError } = await supabase
            .from('market_movers')
            .update({
              name: mover.name,
              rank_position: mover.rank_position,
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
          // Insert new record - REDESIGNED: NO PRICE DATA
          const { error: insertError } = await supabase
            .from('market_movers')
            .insert({
              symbol: mover.symbol,  // Ticker symbol stored as TEXT
              name: mover.name,
              rank_position: mover.rank_position,
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