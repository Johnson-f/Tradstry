import { NextRequest, NextResponse } from 'next/server';
import { getFullUrl, apiConfig } from '@/lib/config/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getFullUrl(apiConfig.endpoints.push.subscribe);
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // pass through bearer
        Authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify(body),
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}


