"use client";

import { useParams } from "next/navigation";
import { useNote, useUpdateNote } from "@/lib/hooks/use-notebook";
import { useRef, useState, ChangeEvent } from "react";

export default function NotebookNavbar() {
  const params = useParams();
  const docId = params?.docId as string | undefined;
  const { note } = useNote(docId || "");
  const { updateNote } = useUpdateNote();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note?.title ?? "Untitled");

  const enable = () => {
    if (!docId) return;
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, inputRef.current.value.length);
    }, 0);
  };

  const disable = () => setIsEditing(false);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    if (!docId) return;
    void updateNote({ id: docId, payload: { title: e.target.value || "Untitled" } });
  };

  return (
    <div className="flex items-center gap-x-2">
      {isEditing ? (
        <input
          ref={inputRef}
          onBlur={disable}
          onChange={onChange}
          value={title}
          className="h-7 rounded border bg-transparent px-2 text-sm focus:outline-none"
        />
      ) : (
        <button onClick={enable} className="text-sm text-foreground/90">
          {note?.title ?? "Untitled"}
        </button>
      )}
    </div>
  );
}


