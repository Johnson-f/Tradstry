"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Home } from "lucide-react";
import Link from "next/link";
import EmbeddedAIChat from "@/components/dashboard/embedded-ai-chat";
import RecentChatsSheet from "@/components/dashboard/recent-chats-sheet";

export default function DashboardContent() {
  const router = useRouter();
  const { user } = useAuth();

  const handleNewChat = () => {
    router.push("/protected/chat/new");
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="h-5 w-5" />
            <h1 className="text-xl font-bold tracking-tight">Tradistry Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <RecentChatsSheet>
              <Button variant="outline" size="sm">
                All Chats
              </Button>
            </RecentChatsSheet>
            <Button onClick={handleNewChat} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>
        </div>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8 space-y-8">
            {/* AI Chat Section - Featured */}
            <div className="space-y-4">
              <EmbeddedAIChat 
                userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]} 
                defaultExpanded={true}
                className="mb-8"
              />
            </div>


            {/* Quick Actions */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold">Quick Actions</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
                {/* Removed AI Chat card since it's now embedded above */}
              
              <Link href="/protected/analytics">
                <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      📊
                    </div>
                    <div>
                      <h4 className="font-semibold">Analytics</h4>
                      <p className="text-sm text-muted-foreground">View trading insights</p>
                    </div>
                  </div>
                </Card>
              </Link>
              
              <Link href="/protected/ai-reports">
                <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                      📈
                    </div>
                    <div>
                      <h4 className="font-semibold">AI Reports</h4>
                      <p className="text-sm text-muted-foreground">Generated insights</p>
                    </div>
                  </div>
                </Card>
              </Link>
              
              <Link href="/protected/brokerage">
                <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      🔗
                    </div>
                    <div>
                      <h4 className="font-semibold">Brokerage</h4>
                      <p className="text-sm text-muted-foreground">Connect accounts</p>
                    </div>
                  </div>
                </Card>
              </Link>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
