"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAIChat } from "@/hooks/use-ai-chat";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

// Types
interface Message {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
  message_type?: string; // Add optional message_type field
}

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

interface EmbeddedAIChatProps {
  className?: string;
  defaultExpanded?: boolean;
}

// Constants
const QUICK_ACTIONS: QuickAction[] = [];

const MAX_MESSAGE_LENGTH = 4000;

// Utility functions
const formatMessageTime = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting timestamp:", timestamp, error);
    return "Invalid Date";
  }
};

// Components
const ChatMessage = ({ message }: { message: Message }) => {
  // Check for both 'user' role and 'user_question' message type
  const isUser = message.role === "user" || message.message_type === "user_question";
  
  // Debug logging to see what we're getting
  console.log('ChatMessage:', { role: message.role, message_type: message.message_type, isUser, content: message.content.substring(0, 50) + '...' });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3 mb-2",
          isUser 
            ? "bg-blue-600 text-white ml-4" 
            : "bg-gray-700 text-gray-100 mr-4",
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <p className="text-xs opacity-70 mt-2">
          {formatMessageTime(message.created_at)}
          {/* Debug info */}
          <span className="ml-2 text-xs opacity-50">
            ({message.role}/{message.message_type})
          </span>
        </p>
      </div>
    </div>
  );
};

const LoadingMessage = () => (
  <div className="flex justify-start">
    <div className="bg-gray-700 rounded-lg px-4 py-3 max-w-[80%]">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-gray-300">AI is thinking...</span>
      </div>
    </div>
  </div>
);

const StreamingMessage = ({ content }: { content: string }) => (
  <div className="flex justify-start">
    <div className="bg-gray-700 rounded-lg px-4 py-3 max-w-[80%] mr-4">
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-100">
        {content}
        <span className="inline-block w-2 h-5 bg-orange-500 ml-1 animate-pulse" />
      </p>
      <div className="flex items-center mt-2 text-xs text-gray-400">
        <div className="flex space-x-1">
          <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce"></div>
          <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
        <span className="ml-2">AI is typing...</span>
      </div>
    </div>
  </div>
);

const QuickActionButton = ({
  action,
  onAction,
}: {
  action: QuickAction;
  onAction: (prompt: string) => void;
}) => (
  <Button
    variant="outline"
    onClick={() => onAction(action.prompt)}
    className="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white rounded-full px-4 py-2 text-sm transition-colors"
  >
    <action.icon className="h-4 w-4 mr-2" />
    {action.label}
  </Button>
);

const ErrorDisplay = ({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) => (
  <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
    <div className="flex items-center justify-center gap-2">
      <span>Error: {error.message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="ml-2 text-red-300 hover:text-white"
      >
        Retry
      </Button>
    </div>
  </div>
);

// Main component
export default function EmbeddedAIChat({
  className,
}: EmbeddedAIChatProps) {
  // State
  const [message, setMessage] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hooks
  const router = useRouter();
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    createSession,
    loadSession,
    clearError,
  } = useAIChat();

  // Load session when currentSessionId changes
  useEffect(() => {
    if (currentSessionId) {
      loadSession(currentSessionId);
    }
  }, [currentSessionId, loadSession]);

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

    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
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
  }, [messages, isLoading, isStreaming, userScrolled, scrollToBottom]);

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
    if (inputRef.current && !isLoading) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, []);

  // Handlers
  const handleSendMessage = useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || message.trim();

      if (!textToSend || textToSend.length > MAX_MESSAGE_LENGTH) {
        return;
      }

      try {
        // Reset scroll state when sending a new message
        setUserScrolled(false);

        // Clear the input immediately - message goes directly to chat page
        setMessage("");
        
        // Start minimizing animation for new chats (when no current session)
        if (!currentSessionId) {
          setIsMinimizing(true);
        }

        // For existing sessions, redirect immediately without waiting
        if (currentSessionId) {
          console.log('Existing session, redirecting to continue conversation:', currentSessionId);
          router.push(`/app/chat/${currentSessionId}`);
          return;
        }

        // For new chats, create session and redirect
        console.log('Creating new chat session...');
        const sessionId = await createSession("New Chat");
        
        // Save user message to localStorage so it appears immediately on the chat page
        try {
          const storageKey = `ai_chat:${sessionId}:messages`;
          const existingRaw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
          const existingMessages: unknown = existingRaw ? JSON.parse(existingRaw) : [];

          const isArray = Array.isArray(existingMessages);
          const messagesArray = isArray ? (existingMessages as unknown[]) : [];

          const generatedId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `local-${Date.now()}`;

          const localMessage = {
            id: generatedId,
            session_id: sessionId,
            content: textToSend,
            message_type: "user_question",
            role: "user",
            created_at: new Date().toISOString(),
          };

          messagesArray.push(localMessage);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, JSON.stringify(messagesArray));
          }
        } catch (e) {
          // Non-fatal: if localStorage is unavailable, continue without blocking UX
          console.error("Failed to persist message locally", e);
        }
        
        // Set session ID for state management
        setCurrentSessionId(sessionId);

        // Redirect immediately - the AI response will stream on the chat page
        router.push(`/app/chat/${sessionId}`);
        
      } catch (error) {
        console.error("Failed to send message:", error);
        setIsMinimizing(false); // Reset minimizing state on error
        // Error is handled by the hook
      }
    },
    [message, currentSessionId, createSession, router],
  );

  const handleQuickAction = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage],
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setMessage("");
    setUserScrolled(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_MESSAGE_LENGTH) {
        setMessage(value);
      }
    },
    [],
  );

  // Validation
  const canSendMessage =
    !isLoading && !isStreaming && !isMinimizing && message.trim().length > 0;
  const hasMessages = messages.length > 0;

  return (
    <div
      className={cn(
        "w-full max-w-4xl mx-auto transition-all duration-700 ease-in-out",
        "h-[200px]", // Increased overall height
        isMinimizing && "transform translate-y-full opacity-0 scale-95",
        className,
      )}
    >
      {/* Header */}
      <header className="py-4 px-6"></header>

      {/* Main Chat Area */}
      <main className="px-6 pb-8">
        {/* Messages */}
        {(hasMessages || isLoading || isStreaming) && (
          <section className="mb-6" aria-label="Chat messages">
            <ScrollArea 
              className="h-[650px] px-6" 
              ref={scrollAreaRef}
              onScrollCapture={handleScroll}
            >
              <div className="space-y-4 py-4" ref={messagesContainerRef}>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                {isLoading && !isStreaming && <LoadingMessage />}
                {isStreaming && (
                  <StreamingMessage content="AI is responding..." />
                )}
                {/* Invisible div to mark the end of messages */}
                <div ref={messagesEndRef} className="h-1" data-messages-end />
              </div>
            </ScrollArea>
            
            {/* Show scroll indicator when user has scrolled up during streaming */}
            {userScrolled && isStreaming && (
              <div className="flex justify-center mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUserScrolled(false);
                    scrollToBottom("smooth", true);
                  }}
                  className="bg-orange-500/20 border-orange-500/30 text-orange-300 hover:bg-orange-500/30 text-xs"
                >
                  New messages ↓
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Input Section */}
        <section className="relative" aria-label="Message input">
          <InputGroup className="bg-gray-800 border-gray-700 focus-within:border-gray-600">
            <InputGroupTextarea
                ref={inputRef}
              placeholder="Ask, Search or Chat..."
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                disabled={isLoading || isStreaming || isMinimizing}
                maxLength={MAX_MESSAGE_LENGTH}
              className="text-white placeholder:text-gray-400"
                aria-label="Type your message"
            />

            <InputGroupAddon align="block-end">
              <InputGroupButton
                variant="outline"
                className="rounded-full"
                size="icon-xs"
                onClick={handleNewChat}
                disabled={isLoading || isStreaming || isMinimizing}
                aria-label="Start new chat"
              >
                <Plus />
              </InputGroupButton>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <InputGroupButton variant="ghost">Auto</InputGroupButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="[--radius:0.95rem]"
                >
                  <DropdownMenuItem>Auto</DropdownMenuItem>
                  <DropdownMenuItem>Agent</DropdownMenuItem>
                  <DropdownMenuItem>Manual</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Character count */}
              {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
                <InputGroupText className="ml-auto">
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </InputGroupText>
              )}

              <Separator orientation="vertical" className="!h-4" />

              <InputGroupButton
                variant="default"
                className="rounded-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600"
                size="icon-xs"
                onClick={() => handleSendMessage()}
                disabled={!canSendMessage || isMinimizing}
                aria-label="Send message"
              >
                {isLoading || isStreaming || isMinimizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp />
                )}
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </section>

        {/* Quick Actions */}
        {!hasMessages && QUICK_ACTIONS.length > 0 && (
          <section
            className="flex flex-wrap justify-center gap-3 mt-8"
            aria-label="Quick actions"
          >
            {QUICK_ACTIONS.map((action, index) => (
              <QuickActionButton
                key={index}
                action={action}
                onAction={handleQuickAction}
              />
            ))}
          </section>
        )}

        {/* Error Display */}
        {error && (
          // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
          <ErrorDisplay error={error} onRetry={clearError} />
        )}

        {/* Minimizing Status */}
        {isMinimizing && (
          <div className="flex justify-center items-center mt-4 p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-300 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>Redirecting to full chat...</span>
          </div>
        )}

        {/* Message Count */}
        {hasMessages && (
          <div className="flex justify-center mt-4">
            <Badge
              variant="secondary"
              className="bg-gray-800 text-gray-400 border border-gray-700"
            >
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}
      </main>
    </div>
  );
}