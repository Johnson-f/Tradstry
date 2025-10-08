"use client";

import EmbeddedAIChat from "@/components/dashboard/embedded-ai-chat";
import RecentChatsSheet from "@/components/dashboard/recent-chats-sheet";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function DashboardContent() {
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
              <Button variant="outline" size="sm">
                All Chats
              </Button>
            </RecentChatsSheet>
          </div>
        </div>
      </div>

      {/* Main content - Centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-5xl px-8">
          <EmbeddedAIChat defaultExpanded={true} className="mb-8" />
        </div>
      </div>
    </div>
  );
}
