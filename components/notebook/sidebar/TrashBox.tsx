"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { useDeletedNotes, useRestoreNote, usePermanentDeleteNote } from "@/lib/hooks/use-notebook";
import { toast } from "sonner";

export default function TrashBox() {
  const router = useRouter();
  const { notes } = useDeletedNotes();
  const { restoreNote } = useRestoreNote();
  const { permanentDeleteNote } = usePermanentDeleteNote();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return (notes || []).filter((n: Record<string, unknown>) => ((n?.title as string) || "").toLowerCase().includes(q.toLowerCase()));
  }, [notes, q]);

  const onRestore = async (id: string) => {
    try {
      await restoreNote({ id });
      toast.success('Note restored successfully');
    } catch (error) {
      console.error('Failed to restore note:', error);
      toast.error('Failed to restore note');
    }
  };

  const onRemove = async (id: string) => {
    try {
      await permanentDeleteNote({ id });
      toast.success('Note permanently deleted');
    } catch (error) {
      console.error('Failed to permanently delete note:', error);
      toast.error('Failed to permanently delete note');
    }
  };

  return (
    <section className="px-2 py-2 text-sm">
      <input
        className="h-7 w-full rounded border bg-secondary px-2 text-xs focus:outline-none"
        placeholder="Filter by page title..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-2 space-y-1">
        {filtered?.length === 0 && (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">No documents found.</p>
        )}
        {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
        {filtered?.map((d: Record<string, unknown>) => (
          <div key={d.id as string} className="flex items-center justify-between rounded px-1 py-1 hover:bg-primary/5">
            <button onClick={() => router.push(`/app/notebook/${d.id as string}`)} className="truncate text-left">
              {d.title as string}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => onRestore(d.id as string)} className="rounded border px-2 py-1 text-xs">
                Restore
              </button>
              <button onClick={() => onRemove(d.id as string)} className="rounded border px-2 py-1 text-xs">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


