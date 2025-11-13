"use client";

import EmbeddedAIChat from "@/components/dashboard/embedded-ai-chat";
import RecentChatsSheet from "@/components/dashboard/recent-chats-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";
import { useAIChat } from "@/hooks/use-ai-chat";
import { getTimeBasedGreeting } from "@/lib/utils/greetings";
import { useUserProfile } from "@/hooks/use-user-profile";

export default function DashboardContent() {
  const { totalSessionsCount, isLoading } = useAIChat();

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="h-5 w-5" />
            <h1 className="text-xl font-bold tracking-tight">HOME</h1>
          </div>
          <div className="flex items-center gap-2">
            <RecentChatsSheet>
              <Button variant="outline" size="sm" className="relative">
                All Chats
                {!isLoading && totalSessionsCount > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {totalSessionsCount}
                  </Badge>
                )}
              </Button>
            </RecentChatsSheet>
          </div>
        </div>
      </div>

      {/* Main content - Centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-5xl px-8 space-y-6">
          <DashboardGreeting />
          <EmbeddedAIChat defaultExpanded={true} className="mb-8" />
        </div>
      </div>
    </div>
  );
}

function DashboardGreeting() {
  const { firstName, loading, email } = useUserProfile();
  const { timeGreeting, casualGreeting, tradingReminder, marketStatus } = getTimeBasedGreeting();
  
  if (loading) {
    return (
      <div className="space-y-2 text-center">
        <div className="h-8 w-64 bg-muted rounded animate-pulse mx-auto"></div>
        <div className="h-4 w-96 bg-muted rounded animate-pulse mx-auto"></div>
        <div className="h-4 w-80 bg-muted rounded animate-pulse mx-auto"></div>
      </div>
    );
  }

  // Get display name - prefer first name, fall back to email username
  const displayName = firstName || (email ? email.split('@')[0] : '');

  return (
    <div className="space-y-3 text-center">
      <div>
        <h1 className="text-2xl font-semibold">
          {timeGreeting}{displayName ? `, ${displayName}` : ''}!
        </h1>
        {!firstName && email && (
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back! Update your profile to personalize your experience.
          </p>
        )}
      </div>
      
      <div className="flex flex-col gap-2">
        <p className="text-base text-foreground/80">
          {casualGreeting}
        </p>
        <p className="text-sm text-muted-foreground italic">
          💡 {tradingReminder}
        </p>
        <p className="text-xs text-muted-foreground/80 font-medium">
          📊 {marketStatus}
        </p>
      </div>
    </div>
  );
}
