"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAIChat } from "@/hooks/use-ai-chat";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface Message {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
}

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

interface ChatRequest {
  message: string;
  context_limit: number;
  session_id?: string;
}

interface ChatResponse {
  session_id: string;
  message?: string;
  // Add other response fields as needed
}

interface EmbeddedAIChatProps {
  className?: string;
  defaultExpanded?: boolean;
}

// Constants
const QUICK_ACTIONS: QuickAction[] = [];

const CONTEXT_LIMIT = 10;
const MESSAGES_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 4000;

// Utility functions
const formatMessageTime = (timestamp: string): string => {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Components
const ChatMessage = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100",
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <p className="text-xs opacity-70 mt-2">
          {formatMessageTime(message.created_at)}
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
    <div className="bg-gray-700 rounded-lg px-4 py-3 max-w-[80%]">
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-100">
        {content}
        <span className="inline-block w-2 h-5 bg-blue-500 ml-1 animate-pulse" />
      </p>
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
  defaultExpanded = true,
}: EmbeddedAIChatProps) {
  // State
  const [message, setMessage] = useState("");
  const [isExpanded] = useState(defaultExpanded);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isMinimizing, setIsMinimizing] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const router = useRouter();
  const {
    messages,
    messagesLoading,
    messagesError,
    isChatting,
    isStreaming,
    streamingContent,
    streamingError,
    chatWithAI,
    chatWithAIStream,
    cancelStream,
    refetchMessages,
  } = useAIChat({
    sessionId: currentSessionId || undefined,
    messagesLimit: MESSAGES_LIMIT,
  });

  // Effects
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatting, isStreaming, streamingContent, scrollToBottom]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current && !isChatting) {
      inputRef.current.focus();
    }
  }, [isChatting]);

  // Handlers
  const handleSendMessage = useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || message.trim();

      if (!textToSend || textToSend.length > MAX_MESSAGE_LENGTH) {
        return;
      }

      try {
        const request: ChatRequest = {
          message: textToSend,
          context_limit: CONTEXT_LIMIT,
        };

        if (currentSessionId) {
          request.session_id = currentSessionId;
        }

        // Use streaming API
        await chatWithAIStream(request, (chunk) => {
          // Handle streaming chunks
          if (chunk.type === 'response_saved' && chunk.session_id) {
            // Set session ID if it's a new chat
            if (!currentSessionId) {
              setCurrentSessionId(chunk.session_id);
            }

            // Navigate to the full chat page with the session ID
            const sessionId = currentSessionId || chunk.session_id;
            if (sessionId) {
              // Start minimizing animation
              setIsMinimizing(true);

              // Navigate to full chat immediately (animation handled by CSS)
              router.push(`/protected/chat/${sessionId}`);
            }
          }
        });

        setMessage("");
      } catch (error) {
        console.error("Failed to send message:", error);
        // Error is handled by the streaming hook
      }
    },
    [message, currentSessionId, chatWithAIStream, router],
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
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleViewAllChats = useCallback(() => {
    router.push("/protected/chat");
  }, [router]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_MESSAGE_LENGTH) {
        setMessage(value);
      }
    },
    [],
  );

  // Validation
  const canSendMessage =
    !isChatting && !isStreaming && !isMinimizing && message.trim().length > 0;
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
        {hasMessages && (
          <section className="mb-6" aria-label="Chat messages">
            <ScrollArea className="h-[650px] px-6">
              <div className="space-y-4 py-4">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                {isChatting && !isStreaming && <LoadingMessage />}
                {isStreaming && streamingContent && (
                  <StreamingMessage content={streamingContent} />
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </section>
        )}

        {/* Input Section */}
        <section className="relative" aria-label="Message input">
          <div className="relative bg-gray-800 rounded-2xl border border-gray-700 focus-within:border-gray-600 transition-colors">
            <ScrollArea className="h-[120px]">
              <Textarea
                ref={inputRef}
                placeholder="How can I help you today?"
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                disabled={isChatting || isStreaming || isMinimizing}
                maxLength={MAX_MESSAGE_LENGTH}
                className="bg-transparent border-0 text-white placeholder:text-gray-400 px-4 py-4 text-base rounded-2xl focus:ring-0 focus-visible:ring-0 resize-none"
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
            <div className="absolute right-4 bottom-4 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewChat}
                disabled={isChatting || isStreaming || isMinimizing}
                className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full"
                aria-label="Start new chat"
              >
                <Plus className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                onClick={() => handleSendMessage()}
                disabled={!canSendMessage || isMinimizing}
                className="h-8 w-8 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 rounded-full transition-colors"
                aria-label="Send message"
              >
                {isChatting || isStreaming || isMinimizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
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
        {messagesError && (
          <ErrorDisplay error={messagesError} onRetry={refetchMessages} />
        )}
        {streamingError && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            <div className="flex items-center justify-center gap-2">
              <span>Streaming Error: {streamingError}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelStream}
                className="ml-2 text-red-300 hover:text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
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
