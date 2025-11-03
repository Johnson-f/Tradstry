import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiConfig, getFullUrl } from '@/lib/config/api';

export interface OnboardingRequest {
  nickname: string;
  display_name?: string;
  timezone: string;
  currency: string;
  trading_experience_level: string;
  primary_trading_goal: string;
  asset_types: string; // JSON string array
  trading_style: string;
  profile_picture_uuid?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: OnboardingRequest = await request.json();

    // Validate required fields
    if (!body.nickname || !body.timezone || !body.currency || !body.trading_experience_level || !body.primary_trading_goal || !body.asset_types || !body.trading_style) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get auth token for backend request
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    // Call backend API to update profile
    const backendUrl = getFullUrl(apiConfig.endpoints.user.profile(user.id));
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        nickname: body.nickname,
        display_name: body.display_name || body.nickname,
        timezone: body.timezone,
        currency: body.currency,
        trading_experience_level: body.trading_experience_level,
        primary_trading_goal: body.primary_trading_goal,
        asset_types: body.asset_types,
        trading_style: body.trading_style,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || 'Failed to update profile' },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error during onboarding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

