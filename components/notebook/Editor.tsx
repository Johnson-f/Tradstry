"use client";

import { useNote, useUpdateNote } from "@/lib/hooks/use-notebook";
import BlockEditor from "@/components/notebook/BlockEditor";

export default function NotebookEditor({ docId }: { docId: string }) {
  const { note, isLoading } = useNote(docId);
  const { updateNote } = useUpdateNote();

  if (isLoading || !note) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  const onChange = (content: string) => {
    void updateNote({ id: docId, payload: { content } });
  };

  return (
    <div className="pb-40">
      <BlockEditor onChange={onChange} initialContent={note.content ?? ""} />
    </div>
  );
}


