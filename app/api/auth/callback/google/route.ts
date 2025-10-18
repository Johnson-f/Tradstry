// app/api/auth/callback/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiConfig, getFullUrl } from '@/lib/config/api';

export async function GET(request: NextRequest) {
  console.log('=== OAuth Callback Started ===');
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  console.log('Query params:', { code: code?.substring(0, 20) + '...', error });
  
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/app/notebook/calendar?error=oauth_failed', request.url));
  }
  
  if (!code) {
    console.error('No authorization code received');
    return NextResponse.redirect(new URL('/app/notebook/calendar?error=no_code', request.url));
  }
  
  try {
    // Get the user's session
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('No user session found');
      return NextResponse.redirect(new URL('/app/notebook/calendar?error=not_authenticated', request.url));
    }
    
    // Server-side environment variables
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing Google OAuth credentials');
      return NextResponse.redirect(new URL('/app/notebook/calendar?error=missing_config', request.url));
    }
    
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback/google`;
    
    console.log('Exchanging code for tokens...', { redirectUri });
    
    // Exchange code for tokens via backend
    const response = await fetch(getFullUrl(apiConfig.endpoints.notebook.calendar.oauthGoogle), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      throw new Error(`Token exchange failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Token exchange successful:', data);
    
    return NextResponse.redirect(new URL('/app/notebook/calendar?success=google_connected', request.url));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/app/notebook/calendar?error=exchange_failed', request.url));
  }
}