"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAIChat } from "@/hooks/use-ai-chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Plus, Calendar, MessageSquare, Home } from "lucide-react";
import Link from "next/link";

export default function DashboardContent() {
  const router = useRouter();
  const {
    sessions,
    loading,
    error,
    getSessions,
    clearError,
  } = useAIChat();

  useEffect(() => {
    getSessions({ limit: 20 });
  }, [getSessions]);

  const handleNewChat = () => {
    router.push("/protected/chat/new");
  };

  const handleViewAllChats = () => {
    router.push("/protected/chat");
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <Button onClick={handleNewChat}>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8 space-y-8">
            {/* Welcome Section */}
            <div className="text-center py-8">
              <h2 className="text-3xl font-bold mb-4">Welcome to Tradistry</h2>
              <p className="text-muted-foreground text-lg">
                Your AI-powered trading journal and analytics platform
              </p>
            </div>

            {/* Recent AI Chat Sessions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5" />
                  <h3 className="text-xl font-semibold">Recent AI Conversations</h3>
                </div>
                <Button variant="outline" onClick={handleViewAllChats}>
                  View All
                </Button>
              </div>

              {loading && sessions.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : error ? (
                <Card className="p-6">
                  <div className="text-center">
                    <p className="text-red-600 mb-4">{error}</p>
                    <Button onClick={clearError} variant="outline">
                      Try Again
                    </Button>
                  </div>
                </Card>
              ) : sessions.length === 0 ? (
                <Card className="p-8">
                  <div className="text-center">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h4 className="text-lg font-semibold mb-2">No conversations yet</h4>
                    <p className="text-muted-foreground mb-6">
                      Start your first conversation with AI about your trading data and strategies
                    </p>
                    <Button onClick={handleNewChat}>
                      <Plus className="h-4 w-4 mr-2" />
                      Start First Chat
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sessions.slice(0, 6).map((session) => (
                    <Link key={session.id} href={`/protected/chat/${session.id}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span className="truncate">
                              {session.title || "Untitled Chat"}
                            </span>
                            <Badge variant="secondary" className="ml-2">
                              {session.message_count || 0}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {new Date(session.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-4 w-4" />
                              <span>
                                {new Date(session.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <Badge variant="outline" className="text-xs">
                              Last updated {new Date(session.updated_at || session.created_at).toLocaleDateString()}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={handleNewChat}>
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-8 w-8 text-primary" />
                  <div>
                    <h4 className="font-semibold">AI Chat</h4>
                    <p className="text-sm text-muted-foreground">Ask AI about your trades</p>
                  </div>
                </div>
              </Card>
              
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
        </ScrollArea>
      </div>
    </div>
  );
}
