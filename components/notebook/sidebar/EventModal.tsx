"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { useCreateReminder } from "@/lib/hooks/use-notebook";
import { toast } from "sonner";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date;
}

interface EventData {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  calendar: string;
}

export default function EventModal({ isOpen, onClose, selectedDate }: EventModalProps) {
  const { createReminder, isLoading, error } = useCreateReminder();
  
  const [eventData, setEventData] = useState<EventData>({
    title: "",
    startDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    endTime: "10:00",
    allDay: false,
    calendar: "Events"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!eventData.title.trim()) {
      toast.error("Please enter an event title");
      return;
    }

    try {
      // Convert date and time to ISO string for backend
      const startDateTime = new Date(`${eventData.startDate}T${eventData.allDay ? '00:00:00' : eventData.startTime + ':00'}`);
      const endDateTime = new Date(`${eventData.endDate}T${eventData.allDay ? '23:59:59' : eventData.endTime + ':00'}`);
      
      // Validate dates
      if (isNaN(startDateTime.getTime())) {
        throw new Error('Invalid start date');
      }
      if (isNaN(endDateTime.getTime())) {
        throw new Error('Invalid end date');
      }
      
      // Create reminder payload - the backend will automatically create calendar event
      const reminderPayload = {
        note_id: "temp-note-id", // You might want to create a note first or use a default
        title: eventData.title,
        description: eventData.allDay ? 'All day event' : `${eventData.startTime} - ${eventData.endTime}`,
        reminder_time: startDateTime.toISOString()
      };

      await createReminder(reminderPayload);
      toast.success("Event created successfully!");
      onClose();
    } catch (err) {
      console.error("Failed to create event:", err);
      toast.error("Failed to create event. Please try again.");
    }
  };

  const handleAllDayChange = (checked: boolean) => {
    setEventData(prev => ({
      ...prev,
      allDay: checked,
      startTime: checked ? "00:00" : "09:00",
      endTime: checked ? "23:59" : "10:00",
      endDate: checked ? prev.startDate : prev.endDate
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Create Event</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-md p-3 text-red-300 text-sm">
              {error.message || "Failed to create event"}
            </div>
          )}

          {/* Event Title */}
          <div>
            <Input
              placeholder="Event title"
              value={eventData.title}
              onChange={(e) => setEventData(prev => ({ ...prev, title: e.target.value }))}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
              disabled={isLoading}
            />
          </div>

          {/* Start Time */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-gray-300">
              <Clock className="w-4 h-4" />
              Start
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={eventData.startDate}
                  onChange={(e) => setEventData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="bg-gray-800 border-gray-600 text-white"
                  disabled={isLoading}
                />
              </div>
              {!eventData.allDay && (
                <div className="flex-1">
                  <Input
                    type="time"
                    value={eventData.startTime}
                    onChange={(e) => setEventData(prev => ({ ...prev, startTime: e.target.value }))}
                    className="bg-gray-800 border-gray-600 text-white"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          </div>

          {/* All Day Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="allDay"
              checked={eventData.allDay}
              onCheckedChange={handleAllDayChange}
              className="border-gray-600"
            />
            <Label htmlFor="allDay" className="text-gray-300">All day</Label>
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-gray-300">
              <Clock className="w-4 h-4" />
              End
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={eventData.endDate}
                  onChange={(e) => setEventData(prev => ({ ...prev, endDate: e.target.value }))}
                  className="bg-gray-800 border-gray-600 text-white"
                  disabled={isLoading}
                />
              </div>
              {!eventData.allDay && (
                <div className="flex-1">
                  <Input
                    type="time"
                    value={eventData.endTime}
                    onChange={(e) => setEventData(prev => ({ ...prev, endTime: e.target.value }))}
                    className="bg-gray-800 border-gray-600 text-white"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Calendar Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-gray-300">
              <Calendar className="w-4 h-4" />
              Calendar
            </Label>
            <Select value={eventData.calendar} onValueChange={(value) => setEventData(prev => ({ ...prev, calendar: value }))}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="Events">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    Events
                  </div>
                </SelectItem>
                <SelectItem value="Tasks">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded"></div>
                    Tasks
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-gray-800 border-gray-600 text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
