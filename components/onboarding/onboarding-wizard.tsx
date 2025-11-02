"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { ProfileBasicsStep } from './onboarding-steps/profile-basics-step';
import { TradingExperienceStep } from './onboarding-steps/trading-experience-step';
import { AssetPreferencesStep } from './onboarding-steps/asset-preferences-step';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface OnboardingData {
  nickname: string;
  timezone: string;
  currency: string;
  profilePictureUuid: string | null;
  trading_experience_level: string;
  primary_trading_goal: string;
  trading_style: string;
  asset_types: string[];
}

const STEPS = [
  {
    id: 1,
    title: 'Profile Basics',
    description: 'Tell us about yourself',
  },
  {
    id: 2,
    title: 'Trading Experience',
    description: 'Help us understand your trading background',
  },
  {
    id: 3,
    title: 'Asset Preferences',
    description: 'What do you trade?',
  },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    nickname: '',
    timezone: 'UTC',
    currency: 'USD',
    profilePictureUuid: null,
    trading_experience_level: '',
    primary_trading_goal: '',
    trading_style: '',
    asset_types: [],
  });

  const updateData = (stepData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...stepData }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(
          data.nickname.trim() &&
          data.nickname.length <= 50 &&
          data.timezone &&
          data.currency
        );
      case 2:
        return !!(
          data.trading_experience_level &&
          data.primary_trading_goal &&
          data.trading_style
        );
      case 3:
        return data.asset_types.length > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error('Please complete all required fields');
      return;
    }

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) {
      toast.error('Please complete all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nickname: data.nickname,
          display_name: data.nickname,
          timezone: data.timezone,
          currency: data.currency,
          trading_experience_level: data.trading_experience_level,
          primary_trading_goal: data.primary_trading_goal,
          asset_types: JSON.stringify(data.asset_types),
          trading_style: data.trading_style,
          profile_picture_uuid: data.profilePictureUuid,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete onboarding');
      }

      toast.success('Onboarding completed successfully!');
      // Mark onboarding as complete in localStorage
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        localStorage.setItem(`onboarding-complete-${user.id}`, 'true');
      }
      router.push('/app');
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Welcome to Tradistry</CardTitle>
            <CardDescription>
              Let's set up your profile to get started
            </CardDescription>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Step {currentStep} of {STEPS.length}
              </span>
              <span className="font-medium">{STEPS[currentStep - 1].title}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="min-h-[400px]">
            {currentStep === 1 && (
              <ProfileBasicsStep
                data={{
                  nickname: data.nickname,
                  timezone: data.timezone,
                  currency: data.currency,
                  profilePictureUuid: data.profilePictureUuid,
                }}
                onChange={(stepData) => {
                  updateData({
                    nickname: stepData.nickname ?? data.nickname,
                    timezone: stepData.timezone ?? data.timezone,
                    currency: stepData.currency ?? data.currency,
                    profilePictureUuid: stepData.profilePictureUuid ?? data.profilePictureUuid,
                  });
                }}
              />
            )}

            {currentStep === 2 && (
              <TradingExperienceStep
                data={{
                  trading_experience_level: data.trading_experience_level,
                  primary_trading_goal: data.primary_trading_goal,
                  trading_style: data.trading_style,
                }}
                onChange={(stepData) => {
                  updateData({
                    trading_experience_level: stepData.trading_experience_level ?? data.trading_experience_level,
                    primary_trading_goal: stepData.primary_trading_goal ?? data.primary_trading_goal,
                    trading_style: stepData.trading_style ?? data.trading_style,
                  });
                }}
              />
            )}

            {currentStep === 3 && (
              <AssetPreferencesStep
                data={{
                  asset_types: data.asset_types,
                }}
                onChange={(stepData) => {
                  updateData({
                    asset_types: stepData.asset_types ?? data.asset_types,
                  });
                }}
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || submitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={submitting || !validateStep(currentStep)}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : currentStep === STEPS.length ? (
                'Complete'
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

