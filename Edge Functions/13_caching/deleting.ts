import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('Starting cache deletion process...');

    // Get count of rows before deletion for logging
    const { count: initialCount, error: countError } = await supabase
      .from('caching')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.warn('Could not get initial count:', countError.message);
    }

    console.log(`Found ${initialCount || 'unknown number of'} rows to delete`);

    // Delete all rows from the caching table
    const { error: deleteError, count: deletedCount } = await supabase
      .from('caching')
      .delete()
      .neq('id', 0); // This condition will match all rows since id is never 0 (starts from 1)

    if (deleteError) {
      throw new Error(`Failed to delete cache data: ${deleteError.message}`);
    }

    const result = {
      success: true,
      message: 'All cache data deleted successfully',
      deletedCount: deletedCount || initialCount || 0,
      timestamp: new Date().toISOString(),
    };

    console.log('Cache deletion completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cache deletion failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});