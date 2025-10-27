"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateNote } from "@/lib/hooks/use-notebook";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

interface CalendarAppProps {
  onCreateNote: (date: Date) => void;
}

// Dynamically import calendar to avoid SSR issues
const CalendarApp = dynamic<CalendarAppProps>(
  () => import("@/components/notebook/sidebar/Calendar"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
);

export default function CalendarPageClient() {
  const router = useRouter();
  const { createNote } = useCreateNote();

  const handleCreateNote = async (selectedDate: Date) => {
    try {
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

  return <CalendarApp onCreateNote={handleCreateNote} />;
}
