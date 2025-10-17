"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { useNotes, useUpdateNote, useDeleteNote } from "@/lib/hooks/use-notebook";

export default function TrashBox() {
  const router = useRouter();
  const { notes } = useNotes("trash");
  const { updateNote } = useUpdateNote();
  const { deleteNote } = useDeleteNote();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return (notes || []).filter((n: any) => (n?.is_archived || n?.is_deleted) && (n?.title || "").toLowerCase().includes(q.toLowerCase()));
  }, [notes, q]);

  const onRestore = async (id: string) => {
    await updateNote({ id, payload: { is_archived: false } as any });
  };

  const onRemove = async (id: string) => {
    await deleteNote({ id });
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
        {filtered?.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between rounded px-1 py-1 hover:bg-primary/5">
            <button onClick={() => router.push(`/app/notebook/${d.id}`)} className="truncate text-left">
              {d.title}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => onRestore(d.id)} className="rounded border px-2 py-1 text-xs">
                Restore
              </button>
              <button onClick={() => onRemove(d.id)} className="rounded border px-2 py-1 text-xs">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


