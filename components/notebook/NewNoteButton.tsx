"use client";

import { useRouter } from "next/navigation";
import { useCreateNote } from "@/lib/hooks/use-notebook";

export default function NewNoteButton({ parentId }: { parentId?: string }) {
  const router = useRouter();
  const { createNote, isLoading } = useCreateNote();

  const onCreate = async () => {
    const res = await createNote({ title: "Untitled", parent_id: parentId });
    const id = (res?.data as Record<string, unknown>)?.id as string | undefined;
    if (id) router.push(`/app/notebook/${id}`);
  };

  return (
    <button
      onClick={onCreate}
      disabled={isLoading}
      className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
    >
      {isLoading ? "Creating..." : "New page"}
    </button>
  );
}


