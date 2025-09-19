"use client";

import { useState } from "react";
import Link from "next/link";
import { useAIChat } from "@/hooks/use-ai-chat";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Calendar, MessageSquare, MoreHorizontal } from "lucide-react";

interface RecentChatsSheetProps {
  children: React.ReactNode;
}

export default function RecentChatsSheet({ children }: RecentChatsSheetProps) {
  const [open, setOpen] = useState(false);
  const {
    sessions,
    sessionsLoading: loading,
    sessionsError: error,
    refetchSessions,
  } = useAIChat({ 
    sessionsParams: { limit: 20 } 
  });

  const clearError = () => {
    refetchSessions();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[500px]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Recents
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-100px)] pr-4">
          <div className="space-y-3">
            {loading && sessions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <p className="text-red-600 text-sm mb-4">{error}</p>
                <Button onClick={clearError} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h4 className="font-semibold mb-2">No conversations yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Start your first conversation with AI
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <Link key={session.id} href={`/protected/chat/${session.id}`}>
                  <div 
                    className="group p-4 rounded-lg bg-card hover:bg-accent/50 border cursor-pointer transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-sm leading-tight flex-1 mr-2 truncate">
                        {session.title || "Untitled Chat"}
                      </h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="secondary" className="text-xs">
                          {session.message_count || 0}
                        </Badge>
                        <MoreHorizontal className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(session.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>{new Date(session.created_at).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}</span>
                      </div>
                    </div>
                    
                    {session.updated_at && session.updated_at !== session.created_at && (
                      <div className="mt-2">
                        <Badge variant="outline" className="text-xs">
                          Updated {new Date(session.updated_at).toLocaleDateString()}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
