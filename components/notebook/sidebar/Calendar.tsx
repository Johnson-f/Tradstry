"use client"

import { useState } from "react"
import { Plus, Search, Settings2, ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import MiniCalendar from "./mini-calendar"
import DayView from "./day-view"
import EventModal from "./EventModal"
import { format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from "date-fns"
import { useCalendarConnections } from "@/hooks/use-calendar-connections"
import { useExternalEvents } from "@/hooks/use-external-events"
import { CalendarSettingsModal } from "./CalendarSettingsModal"

interface CalendarAppProps {
  onCreateNote?: (date: Date) => void
}

export default function CalendarApp({ onCreateNote }: CalendarAppProps) {
  const [selectedDate, setSelectedDate] = useState(new Date(2025, 9, 25)) // October 25, 2025
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day")
  const [isEventModalOpen, setIsEventModalOpen] = useState(false)

  // Calendar connections and external events
  const {
    connections,
    loading: connectionsLoading,
    connectGoogle,
    disconnect,
    syncConnection,
  } = useCalendarConnections()
  const { events: externalEvents, loading: eventsLoading } = useExternalEvents(selectedDate)

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
  }

  const handleCreateNote = () => {
    onCreateNote?.(selectedDate)
  }

  const handleNewEvent = () => {
    setIsEventModalOpen(true)
  }

  const handleCloseEventModal = () => {
    setIsEventModalOpen(false)
  }

  const handleConnectGoogle = async () => {
    await connectGoogle()
  }

  const handleDisconnect = async (connectionId: string) => {
    await disconnect(connectionId)
  }

  const handleSync = async (connectionId: string) => {
    await syncConnection(connectionId)
  }

  // Navigation functions
  const handlePrevious = () => {
    switch (viewMode) {
      case "day":
        setSelectedDate(subDays(selectedDate, 1))
        break
      case "week":
        setSelectedDate(subWeeks(selectedDate, 1))
        break
      case "month":
        setSelectedDate(subMonths(selectedDate, 1))
        break
    }
  }

  const handleNext = () => {
    switch (viewMode) {
      case "day":
        setSelectedDate(addDays(selectedDate, 1))
        break
      case "week":
        setSelectedDate(addWeeks(selectedDate, 1))
        break
      case "month":
        setSelectedDate(addMonths(selectedDate, 1))
        break
    }
  }

  const handleViewModeChange = (mode: "day" | "week" | "month") => {
    setViewMode(mode);
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  return (
    <div className="h-full bg-background text-foreground">
      {/* Fixed Header */}
      <header className="border-b border-border bg-background px-8 py-4 flex items-center justify-between fixed top-16 left-64 right-0 z-10">
        <div className="flex items-center gap-4">
          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrevious}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
          </div>
          
          {/* Date Display */}
          <h2 className="text-lg font-semibold">
            {viewMode === "week" 
              ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "d MMM")} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "d MMM yyyy")}`
              : viewMode === "month"
              ? format(selectedDate, "MMMM yyyy")
              : format(selectedDate, "EEEE d MMMM yyyy")
            }
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={handleNewEvent}>
            <Plus className="w-4 h-4" />
            New Event
          </Button>
          <Button variant="ghost" size="icon">
            <Search className="w-4 h-4" />
          </Button>
          <CalendarSettingsModal>
            <Button variant="ghost" size="icon">
              <Settings2 className="w-4 h-4" />
            </Button>
          </CalendarSettingsModal>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {viewMode === "day" && <Calendar className="w-4 h-4" />}
                {viewMode === "week" && <CalendarRange className="w-4 h-4" />}
                {viewMode === "month" && <CalendarDays className="w-4 h-4" />}
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setViewMode("day")} className="gap-2">
                <Calendar className="w-4 h-4" />
                Day
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("week")} className="gap-2">
                <CalendarRange className="w-4 h-4" />
                Week
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("month")} className="gap-2">
                <CalendarDays className="w-4 h-4" />
                Month
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content with Header Offset */}
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-background sticky top-16 h-screen overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6 space-y-6">
              <h1 className="text-2xl font-bold">Calendar</h1>

              {/* Mini Calendar */}
              <MiniCalendar selectedDate={selectedDate} onDateSelect={handleDateSelect} />

              {/* Calendar Legend */}
              <div className="pt-8 border-t border-border">
                <h3 className="text-sm font-semibold mb-4">Evernote calendar</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Events</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-sm">Tasks</span>
                  </div>
                </div>
              </div>

              {/* Connect Calendar */}
              <div className="pt-8 border-t border-border">
                <h3 className="text-sm font-semibold mb-4">Connect calendar</h3>
                <div className="space-y-3">
                  {/* Connected Google Calendar */}
                  {connections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between p-2 rounded-md bg-accent/20">
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
                        <span className="text-sm">Google Calendar</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSync(connection.id)}
                        >
                          Sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive"
                          onClick={() => handleDisconnect(connection.id)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Connect Google Button */}
                  {connections.length === 0 && (
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-sm"
                      onClick={handleConnectGoogle}
                      disabled={connectionsLoading}
                    >
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
                      <span>Google</span>
                      <Plus className="w-4 h-4 ml-auto" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col pt-16">
          {/* Day View */}
          <div className="flex-1 overflow-hidden">
            <DayView 
              selectedDate={selectedDate} 
              onCreateNote={handleCreateNote} 
              externalEvents={externalEvents} 
              viewMode={viewMode} 
              onDateSelect={handleDateSelect}
              onViewModeChange={handleViewModeChange}
            />
          </div>
        </main>
      </div>

      {/* Event Modal */}
      <EventModal isOpen={isEventModalOpen} onClose={handleCloseEventModal} selectedDate={selectedDate} />
    </div>
  )
}
