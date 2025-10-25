"use client";

import { useNote, useUpdateNote } from "@/lib/hooks/use-notebook";
import BlockEditor from "@/components/notebook/BlockEditor";
import { Spinner } from "@/components/ui/spinner";

export default function NotebookEditor({ docId }: { docId: string }) {
  const { note, isLoading } = useNote(docId);
  const { updateNote } = useUpdateNote();

  if (isLoading || !note) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
        <Spinner size="md" />
      </div>
    );
  }

  const onChange = (content: string) => {
    void updateNote({ id: docId, payload: { content } });
  };

  const onTitleChange = (title: string) => {
    if (!title || title === note.title) return;
    void updateNote({ id: docId, payload: { title } });
  };

  return (
    <div className="pb-40">
      <BlockEditor onChange={onChange} onTitleChange={onTitleChange} initialContent={note.content ?? ""} docId={docId} />
    </div>
  );
}


