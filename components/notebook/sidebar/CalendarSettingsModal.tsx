"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings2, RefreshCw, Trash2 } from "lucide-react";
import { useCalendarConnections } from "@/hooks/use-calendar-connections";
import { CalendarConnection } from "@/lib/types/calendar";

interface CalendarSettingsModalProps {
  children?: React.ReactNode;
}

export function CalendarSettingsModal({ children }: CalendarSettingsModalProps) {
  const { connections, loading, disconnect, syncConnection } = useCalendarConnections();

  const handleSync = async (connectionId: string) => {
    try {
      await syncConnection(connectionId);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await disconnect(connectionId);
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon">
            <Settings2 className="w-4 h-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Calendar Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-3">Connected Calendars</h3>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : connections.length === 0 ? (
              <div className="text-sm text-muted-foreground">No calendars connected</div>
            ) : (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      <div>
                        <div className="text-sm font-medium">Google Calendar</div>
                        <div className="text-xs text-muted-foreground">
                          Connected {new Date(connection.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => handleSync(connection.id)}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive"
                        onClick={() => handleDisconnect(connection.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Sync Settings</h3>
            <div className="text-xs text-muted-foreground">
              External calendars are automatically synced every hour. You can manually sync anytime using the refresh button.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
