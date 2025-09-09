import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SymbolCheckResponse } from '@/lib/types/market-data';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const supabase = createClient();
    const symbol = params.symbol.toUpperCase();

    // Check if symbol exists in stock_quotes table
    const { data, error } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .eq('symbol', symbol)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Database error checking symbol:', error);
      return NextResponse.json(
        { error: 'Failed to check symbol in database' },
        { status: 500 }
      );
    }

    const response: SymbolCheckResponse = {
      exists: !!data,
      symbol: symbol,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error checking symbol:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
