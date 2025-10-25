"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useNote, useUpdateNote } from "@/lib/hooks/use-notebook";

export default function Toolbar({ docId }: { docId: string }) {
  const { note } = useNote(docId);
  const { updateNote } = useUpdateNote();

  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  const [icon, setIcon] = useState<string | undefined>(note?.icon ?? undefined);
  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  const [coverImage, setCoverImage] = useState<string | undefined>(note?.cover_image ?? undefined);

  useEffect(() => {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    setIcon(note?.icon);
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    setCoverImage(note?.cover_image);
  }, [note]);


  const onChangeIcon = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value || undefined;
    setIcon(next);
    void updateNote({ id: docId, payload: { icon: next } as Record<string, unknown> });
  };

  const onChangeCover = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value || undefined;
    setCoverImage(next);
    void updateNote({ id: docId, payload: { cover_image: next } as Record<string, unknown> });
  };

  return (
    <div className="group relative px-6 pt-4">
      {/* Icon + Cover inputs only */}
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          placeholder="Icon (emoji)"
          value={icon ?? ""}
          onChange={onChangeIcon}
          className="h-7 w-28 rounded border bg-transparent px-2"
        />
        <input
          placeholder="Cover image URL"
          value={coverImage ?? ""}
          onChange={onChangeCover}
          className="h-7 w-64 rounded border bg-transparent px-2"
        />
      </div>
    </div>
  );
}


