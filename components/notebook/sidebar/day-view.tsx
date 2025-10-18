"use client";

import React from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DayViewProps {
  selectedDate: Date;
  onDateSelect?: (date: Date) => void;
}

interface Event {
  id: string;
  title: string;
  time: string;
  type: 'event' | 'task';
}

function DayView({ selectedDate, onDateSelect }: DayViewProps) {
  // Mock events data - in a real app, this would come from your data source
  const mockEvents: Event[] = [
    {
      id: '1',
      title: 'Morning Standup',
      time: '09:00',
      type: 'event'
    },
    {
      id: '2',
      title: 'Review Trading Journal',
      time: '10:30',
      type: 'task'
    },
    {
      id: '3',
      title: 'Market Analysis Meeting',
      time: '14:00',
      type: 'event'
    }
  ];

  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });

  const getEventsForTimeSlot = (timeSlot: string) => {
    return mockEvents.filter(event => event.time.startsWith(timeSlot.split(':')[0]));
  };

  return (
    <div className="flex h-full">
      {/* Time Column */}
      <div className="w-20 border-r border-border">
        <div className="h-16 border-b border-border flex items-center justify-center text-sm font-medium text-muted-foreground">
          Time
        </div>
        {timeSlots.map((timeSlot) => (
          <div
            key={timeSlot}
            className="h-16 border-b border-border flex items-center justify-center text-xs text-muted-foreground"
          >
            {timeSlot}
          </div>
        ))}
      </div>

      {/* Events Column */}
      <div className="flex-1">
        <div className="h-16 border-b border-border flex items-center justify-between px-4">
          <h3 className="text-sm font-medium">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h3>
          <Button 
            size="sm" 
            className="gap-2"
            onClick={() => onDateSelect?.(selectedDate)}
          >
            <Plus className="w-4 h-4" />
            Create Note
          </Button>
        </div>

        {/* Events Grid */}
        <div className="relative">
          {timeSlots.map((timeSlot) => {
            const events = getEventsForTimeSlot(timeSlot);
            return (
              <div
                key={timeSlot}
                className="h-16 border-b border-border relative hover:bg-accent/5"
              >
                {events.map((event) => (
                  <Card
                    key={event.id}
                    className={cn(
                      "absolute left-2 right-2 top-1 cursor-pointer transition-colors",
                      event.type === 'event' ? "bg-green-50 border-green-200 hover:bg-green-100" : "bg-purple-50 border-purple-200 hover:bg-purple-100"
                    )}
                  >
                    <CardContent className="p-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{event.time}</p>
                        </div>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          event.type === 'event' ? "bg-green-500" : "bg-purple-500"
                        )} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DayView;
