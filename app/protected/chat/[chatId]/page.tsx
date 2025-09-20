"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAIChat } from "@/hooks/use-ai-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageCircle, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Constants
  const CONTEXT_LIMIT = 10;
  const MAX_MESSAGE_LENGTH = 4000;

  const clearError = () => {
    refetchMessages();
  };

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || message.trim().length > MAX_MESSAGE_LENGTH) return;

    try {
      const request: { message: string; context_limit: number; session_id?: string } = {
        message: message.trim(),
        context_limit: CONTEXT_LIMIT,
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
  }, [message, chatId, chatWithAI]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_MESSAGE_LENGTH) {
      setMessage(value);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    // This would navigate to a new chat
    window.location.href = "/protected/chat/new";
  }, []);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current && !isChatting) {
      inputRef.current.focus();
    }
  }, [isChatting]);

  const canSendMessage = !isChatting && message.trim().length > 0;

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
            {isChatting && (
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
      <div className=" px-4  flex-shrink-0">
        <div className="relative bg-gray-900 rounded-2xl border border-gray-600  transition-all duration-200 max-w-2xl mx-auto">
          <ScrollArea className="h-[100px]">
            <Textarea
              ref={inputRef}
              placeholder="How can I help you today?"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              disabled={isChatting}
              maxLength={MAX_MESSAGE_LENGTH}
              className="bg-transparent border-0 text-white placeholder:text-gray-300 px-6 py-5 text-base rounded-2xl focus:ring-0 focus-visible:ring-0 resize-none font-medium"
              aria-label="Type your message"
              rows={6}
            />
          </ScrollArea>

          {/* Character count */}
          {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
            <div className="absolute right-24 bottom-4 text-xs text-gray-400">
              {message.length}/{MAX_MESSAGE_LENGTH}
            </div>
          )}

          {/* Controls */}
          <div className="absolute right-6 bottom-5 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewChat}
              disabled={isChatting}
              className="h-10 w-10 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-all duration-200"
              aria-label="Start new chat"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!canSendMessage}
              className="h-10 w-10 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
              aria-label="Send message"
            >
              {isChatting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
