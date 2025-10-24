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
import { MessageRole } from "@/lib/types/ai-chat";

// Type for optimistic messages
interface OptimisticMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  isOptimistic?: boolean;
}

// Streaming Message Component
const StreamingMessage = ({ content }: { content: string }) => (
  <div className="flex justify-start">
    <div className="bg-muted rounded-lg px-4 py-2 max-w-[70%]">
      <p className="text-sm whitespace-pre-wrap">
        {content}
        <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
      </p>
    </div>
  </div>
);

export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;

  const {
    sessions,
    currentSession,
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    sendStreamingMessage,
    createSession,
    loadSession,
    clearError,
  } = useAIChat();

  // State
  const [message, setMessage] = useState("");
  const [userScrolled, setUserScrolled] = useState(false);
  const [lastScrollHeight, setLastScrollHeight] = useState(0);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Constants
  const CONTEXT_LIMIT = 10;
  const MAX_MESSAGE_LENGTH = 4000;

  // Load session when chatId changes
  useEffect(() => {
    if (chatId && chatId !== "new" && chatId !== "undefined") {
      loadSession(chatId);
    }
  }, [chatId, loadSession]);

  // Combine real messages with optimistic messages
  const allMessages = [...messages, ...optimisticMessages];

  // Enhanced scrolling function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth", force: boolean = false) => {
    // Don't auto-scroll if user has manually scrolled up, unless forced
    if (!force && userScrolled && !isStreaming) {
      return;
    }

    if (messagesEndRef.current) {
      // Clear any existing timeout
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }

      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ 
            behavior, 
            block: "end",
            inline: "nearest" 
          });
        }
      });
    }
  }, [userScrolled, isStreaming]);

  // Detect user scroll to disable auto-scroll temporarily
  const handleScroll = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
    
    // Update user scrolled state
    if (!isAtBottom && !isStreaming) {
      setUserScrolled(true);
    } else if (isAtBottom) {
      setUserScrolled(false);
    }

    setLastScrollHeight(scrollHeight);
  }, [isStreaming]);

  // Enhanced auto-scroll during streaming with better throttling
  useEffect(() => {
    if (isStreaming) {
      // Clear any existing timeout
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }

      // Use a shorter throttle during streaming for more responsive scrolling
      autoScrollTimeoutRef.current = setTimeout(() => {
        scrollToBottom("smooth", true); // Force scroll during streaming
      }, 16); // ~60fps for smooth streaming

      return () => {
        if (autoScrollTimeoutRef.current) {
          clearTimeout(autoScrollTimeoutRef.current);
        }
      };
    }
  }, [isStreaming, scrollToBottom]);

  // Auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setUserScrolled(false); // Reset user scroll state when streaming starts
      scrollToBottom("smooth", true);
    }
  }, [isStreaming, scrollToBottom]);

  // Regular scroll for message updates (non-streaming)
  useEffect(() => {
    if (!isStreaming && !userScrolled) {
      scrollToBottom("auto");
    }
  }, [allMessages, isLoading, isStreaming, userScrolled, scrollToBottom]);

  // Handle content height changes during streaming
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || !isStreaming) return;

    const observer = new ResizeObserver(() => {
      if (isStreaming && !userScrolled) {
        scrollToBottom("smooth", true);
      }
    });

    // Observe the messages container for height changes
    if (messagesContainerRef.current) {
      observer.observe(messagesContainerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isStreaming, userScrolled, scrollToBottom]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current && !isLoading && !isStreaming) {
      inputRef.current.focus();
    }
  }, [isLoading, isStreaming]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, []);

  // Clear optimistic messages when real messages are updated
  useEffect(() => {
    // If we have real messages and optimistic messages, clear optimistic ones
    // This happens when the server responds with the actual saved messages
    if (messages.length > 0 && optimisticMessages.length > 0 && !isStreaming) {
      setOptimisticMessages([]);
    }
  }, [messages, optimisticMessages.length, isStreaming]);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || message.trim().length > MAX_MESSAGE_LENGTH) return;

    const userMessage = message.trim();
    
    try {
      // Reset scroll state when sending a new message
      setUserScrolled(false);

      // Immediately add the user message to optimistic messages
      const optimisticUserMessage: OptimisticMessage = {
        id: `optimistic-${Date.now()}`,
        content: userMessage,
        role: 'user',
        created_at: new Date().toISOString(),
        isOptimistic: true
      };

      setOptimisticMessages(prev => [...prev, optimisticUserMessage]);
      
      // Clear the input immediately
      setMessage("");

      // Determine session ID
      let sessionId = chatId;
      if (chatId === "new" || chatId === "undefined") {
        // Create new session
        sessionId = await createSession("New Chat");
      }

      // Use streaming API for better UX
      await sendStreamingMessage(userMessage, sessionId);
      
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove the optimistic message on error
      setOptimisticMessages(prev => prev.filter(msg => msg.content !== userMessage));
      // Restore the message in the input
      setMessage(userMessage);
    }
  }, [message, chatId, createSession, sendStreamingMessage]);

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
    setUserScrolled(false);
    setOptimisticMessages([]); // Clear optimistic messages
    window.location.href = "/app/chat/new";
  }, []);

  const canSendMessage = !isLoading && !isStreaming && message.trim().length > 0;

  if (isLoading && !allMessages.length) {
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
            <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
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
            <Link href="/app" className="hover:text-foreground transition-colors">
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
                {allMessages.length} messages
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea 
          className="h-full" 
          ref={scrollAreaRef}
          onScrollCapture={handleScroll}
        >
          <div className="p-4 space-y-4" ref={messagesContainerRef}>
            {allMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation with AI</p>
                <p className="text-sm">Ask about your trading data, strategies, or analysis</p>
              </div>
            ) : (
              allMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-4 py-2",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                      // Add slight opacity to optimistic messages
                      msg.isOptimistic && "opacity-70"
                    )}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {(() => {
                        try {
                          const date = new Date(msg.created_at);
                          if (isNaN(date.getTime())) {
                            return "Invalid Date";
                          }
                          return date.toLocaleTimeString();
                        } catch (error) {
                          console.error("Error formatting timestamp:", msg.created_at, error);
                          return "Invalid Date";
                        }
                      })()}
                    </p>
                    {msg.isOptimistic && (
                      <div className="flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin opacity-50" />
                        <span className="text-xs opacity-50">Sending...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && !isStreaming && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Show scroll indicator when user has scrolled up during streaming */}
            {userScrolled && isStreaming && (
              <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUserScrolled(false);
                    scrollToBottom("smooth", true);
                  }}
                  className="bg-primary/90 border-primary/20 text-primary-foreground hover:bg-primary shadow-lg backdrop-blur-sm"
                >
                  New messages ↓
                </Button>
              </div>
            )}
            
            {/* Invisible div to mark the end of messages */}
            <div ref={messagesEndRef} className="h-1" data-messages-end />
          </div>
        </ScrollArea>
      </div>

      {/* Message Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="relative bg-gray-900 rounded-2xl border border-gray-600 transition-all duration-200 max-w-2xl mx-auto">
          <ScrollArea className="h-[100px]">
            <Textarea
              ref={inputRef}
              placeholder="How can I help you today?"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              disabled={isLoading || isStreaming}
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
              disabled={isLoading || isStreaming}
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
              {isLoading || isStreaming ? (
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