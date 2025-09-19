"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAIChat } from "@/hooks/use-ai-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;

  const {
    messages,
    messagesLoading: loading,
    messagesError: error,
    currentSession,
    isChatting,
    chatWithAI,
    refetchMessages,
  } = useAIChat({ 
    sessionId: chatId && chatId !== "new" && chatId !== "undefined" ? chatId : undefined 
  });

  const [message, setMessage] = useState("");

  const clearError = () => {
    refetchMessages();
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      const request: { message: string; context_limit: number; session_id?: string } = {
        message: message.trim(),
        context_limit: 10,
      };

      // Only include session_id for existing chats, not new ones
      if (chatId !== "new" && chatId !== "undefined") {
        request.session_id = chatId;
      }

      await chatWithAI.mutateAsync(request);
      setMessage("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading && !messages.length) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={clearError} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left side - Navigation breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/protected" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="font-semibold text-foreground">
              {currentSession?.title || "AI Chat"}
            </span>
          </div>
          
          {/* Right side - Chat info */}
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5" />
            {currentSession && (
              <Badge variant="secondary">
                {messages.length} messages
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation with AI</p>
                <p className="text-sm">Ask about your trading data, strategies, or analysis</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {chatWithAI.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Message Input */}
      <div className="border-t bg-background px-4 py-4 flex-shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={chatWithAI.isPending}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || chatWithAI.isPending}
            size="icon"
          >
            {chatWithAI.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
