"use client";

import React, { useState, useEffect, useRef } from "react";
import { format, startOfWeek, endOfWeek, addDays, isSameDay, startOfMonth, endOfMonth, getWeek, isSameMonth, isToday as isTodayDate } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExternalCalendarEvent } from "@/lib/types/calendar";

interface DayViewProps {
  selectedDate: Date;
  onCreateNote?: () => void;
  externalEvents?: ExternalCalendarEvent[];
  viewMode?: "day" | "week" | "month";
  onDateSelect?: (date: Date) => void;
  onViewModeChange?: (mode: "day" | "week" | "month") => void;
}

interface Event {
  id: string;
  title: string;
  time: string;
  type: 'event' | 'task';
  isExternal?: boolean;
}

function DayView({ selectedDate, onCreateNote, externalEvents = [], viewMode = "day", onDateSelect, onViewModeChange }: DayViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);
  const eventsGridRef = useRef<HTMLDivElement>(null);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Check if the selected date is today
  const isToday = currentTime.toDateString() === selectedDate.toDateString();

  // Calculate week dates
  const getWeekDates = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday start
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const weekDates = getWeekDates();

  // Calculate month dates
  const getMonthDates = () => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    const startWeek = startOfWeek(start, { weekStartsOn: 1 });
    const endWeek = endOfWeek(end, { weekStartsOn: 1 });
    
    const dates = [];
    let current = startWeek;
    
    while (current <= endWeek) {
      dates.push(new Date(current));
      current = addDays(current, 1);
    }
    
    return dates;
  };

  const monthDates = getMonthDates();

  // Calculate current time position (0-23 hours)
  const getCurrentTimePosition = () => {
    if (!isToday) return null;
    
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const percentage = (totalMinutes / (24 * 60)) * 100;
    
    return percentage;
  };

  // Auto-scroll to current time when page loads or when navigating to today
  useEffect(() => {
    if (isToday && !hasAutoScrolled && eventsGridRef.current) {
      const scrollToCurrentTime = () => {
        const hours = currentTime.getHours();
        const minutes = currentTime.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        
        // Calculate scroll position (each hour slot is 64px high)
        const scrollPosition = (totalMinutes / 60) * 64;
        
        // Scroll to current time with some offset to center it
        eventsGridRef.current?.scrollTo({
          top: Math.max(0, scrollPosition - 200), // Offset to show some context above
          behavior: 'smooth'
        });
        
        setHasAutoScrolled(true);
      };

      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(scrollToCurrentTime, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isToday, hasAutoScrolled, currentTime, viewMode]);

  // Reset auto-scroll flag when date changes
  useEffect(() => {
    setHasAutoScrolled(false);
  }, [selectedDate]);

  // Auto-scroll when page becomes visible (user focuses on tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isToday && eventsGridRef.current) {
        const hours = currentTime.getHours();
        const minutes = currentTime.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        const scrollPosition = (totalMinutes / 60) * 64;
        
        eventsGridRef.current.scrollTo({
          top: Math.max(0, scrollPosition - 200),
          behavior: 'smooth'
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isToday, currentTime, viewMode]);

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

  // Convert external events to display format
  const externalEventsFormatted: Event[] = externalEvents.map(event => ({
    id: event.id,
    title: event.title,
    time: format(new Date(event.start_time), 'HH:mm'),
    type: 'event' as const,
    isExternal: true
  }));

  // Combine local and external events
  const allEvents = [...mockEvents, ...externalEventsFormatted];

  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });

  const getEventsForTimeSlot = (timeSlot: string, date?: Date) => {
    if (viewMode === "week" && date) {
      // For week view, filter events by date and time
      return allEvents.filter(event => {
        const eventDate = new Date(event.time);
        return isSameDay(eventDate, date) && event.time.startsWith(timeSlot.split(':')[0]);
      });
    }
    // For day view, filter by time only
    return allEvents.filter(event => event.time.startsWith(timeSlot.split(':')[0]));
  };

  if (viewMode === "week") {
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

        {/* Week Grid */}
        <div className="flex-1">
          {/* Week Header */}
          <div className="h-16 border-b border-border flex">
            {weekDates.map((date) => (
              <div
                key={date.toISOString()}
                className={cn(
                  "flex-1 border-r border-border flex flex-col items-center justify-center",
                  isSameDay(date, selectedDate) && "bg-accent/20"
                )}
              >
                <div className="text-xs text-muted-foreground">
                  {format(date, "EEE")}
                </div>
                <div className="text-sm font-medium">
                  {format(date, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* Week Events Grid */}
          <div ref={eventsGridRef} className="relative overflow-y-auto flex-1">
            {/* Current Time Indicator - Week View */}
            {isToday && getCurrentTimePosition() !== null && (
              <div
                className="absolute z-10 pointer-events-none"
                style={{ 
                  top: `${getCurrentTimePosition()}%`,
                  left: `${weekDates.findIndex(date => isSameDay(date, currentTime)) * (100 / 7)}%`,
                  width: `${100 / 7}%`
                }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <div className="flex-1 h-0.5 bg-red-500"></div>
                </div>
              </div>
            )}

            {timeSlots.map((timeSlot) => (
              <div key={timeSlot} className="h-16 border-b border-border flex">
                {weekDates.map((date) => (
                  <div
                    key={`${timeSlot}-${date.toISOString()}`}
                    className="flex-1 border-r border-border relative hover:bg-accent/5"
                  >
                    {getEventsForTimeSlot(timeSlot, date).map((event) => (
                      <Card
                        key={event.id}
                        className={cn(
                          "absolute left-1 right-1 top-1 cursor-pointer transition-colors",
                          event.type === 'event' ? "bg-green-50 border-green-200 hover:bg-green-100" : "bg-purple-50 border-purple-200 hover:bg-purple-100"
                        )}
                      >
                        <CardContent className="p-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-medium truncate">{event.title}</p>
                                {event.isExternal && (
                                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{event.time}</p>
                            </div>
                            <div className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              event.type === 'event' ? "bg-green-500" : "bg-purple-500"
                            )} />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "month") {
    // Group dates by weeks for month view
    const weeks = [];
    for (let i = 0; i < monthDates.length; i += 7) {
      weeks.push(monthDates.slice(i, i + 7));
    }

    return (
      <div className="flex h-full">
        {/* Week Numbers Column */}
        <div className="w-16 border-r border-border">
          <div className="h-16 border-b border-border flex items-center justify-center text-sm font-medium text-muted-foreground">
            Week
          </div>
          {weeks.map((week, index) => (
            <div
              key={index}
              className="h-24 border-b border-border flex items-center justify-center text-xs text-muted-foreground"
            >
              {getWeek(week[0], { weekStartsOn: 1 })}
            </div>
          ))}
        </div>

        {/* Month Grid */}
        <div className="flex-1 flex flex-col">
          {/* Month Header */}
          <div className="h-16 border-b border-border flex">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div
                key={day}
                className="flex-1 border-r border-border flex items-center justify-center text-sm font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Month Calendar Grid */}
          <div className="flex-1 overflow-y-auto">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="h-24 border-b border-border flex">
                {week.map((date, dayIndex) => {
                  const isCurrentMonth = isSameMonth(date, selectedDate);
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isTodayDate(date);
                  const dayEvents = allEvents.filter(event => {
                    // For month view, show events that occur on this date
                    // This is a simplified approach - in a real app you'd have proper date matching
                    const eventDate = new Date(event.time);
                    return isSameDay(eventDate, date);
                  });

                  return (
                    <div
                      key={`${weekIndex}-${dayIndex}`}
                      className={cn(
                        "flex-1 border-r border-border relative hover:bg-accent/5 cursor-pointer",
                        !isCurrentMonth && "text-muted-foreground/50",
                        isSelected && "bg-accent/20",
                        isToday && "bg-blue-500/20 text-white"
                      )}
                      onClick={() => {
                        onDateSelect?.(date);
                        onViewModeChange?.("day");
                      }}
                    >
                      <div className="p-2">
                        <div className="text-sm font-medium">
                          {format(date, 'd')}
                        </div>
                        
                        {/* Event Indicators */}
                        <div className="flex gap-1 mt-1">
                          {dayEvents.slice(0, 3).map((event, eventIndex) => (
                            <div
                              key={eventIndex}
                              className={cn(
                                "w-2 h-2 rounded-full",
                                event.type === 'event' ? "bg-green-500" : "bg-purple-500"
                              )}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{dayEvents.length - 3}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Day View (original implementation)
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
            onClick={onCreateNote}
          >
            <Plus className="w-4 h-4" />
            Create Note
          </Button>
        </div>

        {/* Events Grid */}
        <div ref={eventsGridRef} className="relative overflow-y-auto flex-1">
          {/* Current Time Indicator */}
          {isToday && getCurrentTimePosition() !== null && (
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ top: `${getCurrentTimePosition()}%` }}
            >
              <div className="flex items-center">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <div className="flex-1 h-0.5 bg-red-500"></div>
              </div>
            </div>
          )}

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
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium">{event.title}</p>
                            {event.isExternal && (
                              <div className="flex items-center gap-1">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
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
                              </div>
                            )}
                          </div>
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
