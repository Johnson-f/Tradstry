import { NextRequest, NextResponse } from 'next/server';
import { getFullUrl, apiConfig } from '@/lib/config/api';

export async function POST(request: NextRequest) {
  const backendUrl = getFullUrl(apiConfig.endpoints.push.test);
  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        Authorization: request.headers.get('authorization') || '',
      },
    });
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Proxy error',
        message,
        target: backendUrl,
      },
      { status: 500 }
    );
  }
}


