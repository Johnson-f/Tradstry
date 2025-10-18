"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useCreateNote } from "@/lib/hooks/use-notebook";
import { toast } from "sonner";
import { format } from "date-fns";
import CalendarApp from "@/components/notebook/sidebar/Calendar";

export default function CalendarPage() {
  const router = useRouter();
  const { createNote } = useCreateNote();

  const handleDateSelect = async (selectedDate: Date) => {
    try {
      // Create a new note with the selected date as title
      const noteTitle = format(selectedDate, "MMMM dd, yyyy");
      
      const promise = createNote({ 
        title: noteTitle,
        content: `# ${noteTitle}\n\nNotes for ${format(selectedDate, "EEEE, MMMM dd, yyyy")}\n\n## Tasks\n\n## Notes\n\n## Ideas`
      }).then((note) => {
        if (note?.data?.id) {
          router.push(`/app/notebook/${note.data.id}`);
        }
      });

      toast.promise(promise, {
        loading: "Creating note for selected date...",
        success: "Note created successfully!",
        error: "Failed to create note.",
      });
    } catch (error) {
      console.error("Failed to create note for date:", error);
      toast.error("Failed to create note for selected date");
    }
  };

  return <CalendarApp onDateSelect={handleDateSelect} />;
}
