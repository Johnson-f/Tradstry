import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SymbolSaveRequest, SymbolSaveResponse } from '@/lib/types/market-data';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body: SymbolSaveRequest = await request.json();
    const symbol = body.symbol.toUpperCase();

    // First, check if symbol already exists
    const { data: existingSymbol } = await supabase
      .from('stock_quotes')
      .select('symbol')
      .eq('symbol', symbol)
      .limit(1)
      .single();

    if (existingSymbol) {
      const response: SymbolSaveResponse = {
        success: true,
        symbol: symbol,
        message: 'Symbol already exists in database',
      };
      return NextResponse.json(response);
    }

    // Fetch initial data for the symbol from external API
    let initialQuoteData = null;
    try {
      const quoteResponse = await fetch(
        `https://finance-query.onrender.com/v1/quotes?symbols=${symbol}`
      );
      
      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        initialQuoteData = quoteData[symbol];
      }
    } catch (apiError) {
      console.warn('Failed to fetch initial quote data for symbol:', symbol, apiError);
    }

    // Insert symbol into stock_quotes table with initial data (if available)
    const insertData = {
      symbol: symbol,
      price: initialQuoteData?.price || null,
      change_amount: initialQuoteData?.change || null,
      change_percent: initialQuoteData?.changePercent || null,
      volume: initialQuoteData?.volume || null,
      open_price: initialQuoteData?.open || null,
      high_price: initialQuoteData?.dayHigh || null,
      low_price: initialQuoteData?.dayLow || null,
      previous_close: initialQuoteData?.previousClose || null,
      quote_timestamp: new Date().toISOString(),
      data_provider: 'yahoo_finance',
    };

    const { data, error } = await supabase
      .from('stock_quotes')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Database error saving symbol:', error);
      return NextResponse.json(
        { 
          success: false, 
          symbol: symbol, 
          message: 'Failed to save symbol to database' 
        } as SymbolSaveResponse,
        { status: 500 }
      );
    }

    const response: SymbolSaveResponse = {
      success: true,
      symbol: symbol,
      message: initialQuoteData ? 'Symbol saved with initial data' : 'Symbol saved without initial data',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error saving symbol:', error);
    return NextResponse.json(
      { 
        success: false, 
        symbol: '', 
        message: 'Internal server error' 
      } as SymbolSaveResponse,
      { status: 500 }
    );
  }
}
