"use client";

import React from "react";
import PlaygroundApp from "./rich-editor/App";

interface NoteEditorProps {
  selectedNoteId?: string;
}

export default function NoteEditor({ selectedNoteId }: NoteEditorProps) {
  return (
    <div className="h-full w-full">
      <PlaygroundApp noteId={selectedNoteId} />
    </div>
  );
}
