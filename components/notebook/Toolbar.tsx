"use client";

import { ChangeEvent, ElementRef, useEffect, useRef, useState } from "react";
import { useNote, useUpdateNote } from "@/lib/hooks/use-notebook";

export default function Toolbar({ docId }: { docId: string }) {
  const { note } = useNote(docId);
  const { updateNote } = useUpdateNote();

  const inputRef = useRef<ElementRef<"input">>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note?.title ?? "");
  const [icon, setIcon] = useState<string | undefined>(note?.icon ?? undefined);
  const [coverImage, setCoverImage] = useState<string | undefined>(note?.cover_image ?? undefined);

  useEffect(() => {
    setTitle(note?.title ?? "");
    setIcon((note as any)?.icon);
    setCoverImage((note as any)?.cover_image);
  }, [note]);

  const enable = () => {
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, inputRef.current.value.length);
    }, 0);
  };

  const disable = () => setIsEditing(false);

  const onChangeTitle = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTitle(next);
    void updateNote({ id: docId, payload: { title: next || "" } });
  };

  const onChangeIcon = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value || undefined;
    setIcon(next);
    void updateNote({ id: docId, payload: { icon: next } as any });
  };

  const onChangeCover = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value || undefined;
    setCoverImage(next);
    void updateNote({ id: docId, payload: { cover_image: next } as any });
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


