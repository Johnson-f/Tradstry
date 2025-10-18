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
  const [eventData, setEventData] = useState<EventData>({
    title: "",
    startDate: selectedDate ? format(selectedDate, "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy"),
    startTime: "09:00",
    endDate: selectedDate ? format(selectedDate, "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy"),
    endTime: "10:00",
    allDay: false,
    calendar: "Events"
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement event creation logic
    console.log("Creating event:", eventData);
    onClose();
  };

  const handleAllDayChange = (checked: boolean) => {
    setEventData(prev => ({
      ...prev,
      allDay: checked,
      startTime: checked ? "" : "09:00",
      endTime: checked ? "" : "10:00"
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Create Event</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event Title */}
          <div>
            <Input
              placeholder="Event title"
              value={eventData.title}
              onChange={(e) => setEventData(prev => ({ ...prev, title: e.target.value }))}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
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
                <Select value={eventData.startDate} onValueChange={(value) => setEventData(prev => ({ ...prev, startDate: value }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value={eventData.startDate}>{eventData.startDate}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!eventData.allDay && (
                <div className="flex-1">
                  <Select value={eventData.startTime} onValueChange={(value) => setEventData(prev => ({ ...prev, startTime: value }))}>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="09:00">09:00</SelectItem>
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="11:00">11:00</SelectItem>
                      <SelectItem value="12:00">12:00</SelectItem>
                      <SelectItem value="13:00">13:00</SelectItem>
                      <SelectItem value="14:00">14:00</SelectItem>
                      <SelectItem value="15:00">15:00</SelectItem>
                      <SelectItem value="16:00">16:00</SelectItem>
                      <SelectItem value="17:00">17:00</SelectItem>
                      <SelectItem value="18:00">18:00</SelectItem>
                    </SelectContent>
                  </Select>
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
                <Select value={eventData.endDate} onValueChange={(value) => setEventData(prev => ({ ...prev, endDate: value }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value={eventData.endDate}>{eventData.endDate}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!eventData.allDay && (
                <div className="flex-1">
                  <Select value={eventData.endTime} onValueChange={(value) => setEventData(prev => ({ ...prev, endTime: value }))}>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="11:00">11:00</SelectItem>
                      <SelectItem value="12:00">12:00</SelectItem>
                      <SelectItem value="13:00">13:00</SelectItem>
                      <SelectItem value="14:00">14:00</SelectItem>
                      <SelectItem value="15:00">15:00</SelectItem>
                      <SelectItem value="16:00">16:00</SelectItem>
                      <SelectItem value="17:00">17:00</SelectItem>
                      <SelectItem value="18:00">18:00</SelectItem>
                      <SelectItem value="19:00">19:00</SelectItem>
                    </SelectContent>
                  </Select>
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
            >
              Create event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
