"use client";

import { useRouter, usePathname } from "next/navigation";
import React, { useMemo } from "react";
import { Item } from "@/components/notebook/sidebar/Item";
import { useCreateNote, useNotes } from "@/lib/hooks/use-notebook";
import { File } from "lucide-react";

export function DocumentList({ parentId, level = 0 }: { parentId?: string; level?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { notes, isLoading } = useNotes(parentId);
  const { createNote } = useCreateNote();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("notebook:expanded") || "{}");
    } catch {
      return {};
    }
  });

  const currentId = useMemo(() => {
    const parts = (pathname || "").split("/");
    return parts[parts.length - 1];
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="space-y-1 py-1">
        <div className="h-3 w-2/3 animate-pulse rounded bg-primary/5" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-primary/5" />
      </div>
    );
  }

  return (
    <div>
      {notes.map((n) => (
        <div key={n.id}>
          <Item
            id={n.id}
            label={n.title || "Untitled"}
            level={level}
            icon={File}
            active={currentId === n.id}
            expanded={!!expanded[n.id]}
            onToggle={() => {
              const next = { ...expanded, [n.id]: !expanded[n.id] };
              setExpanded(next);
              if (typeof window !== "undefined") localStorage.setItem("notebook:expanded", JSON.stringify(next));
            }}
            onClick={() => router.push(`/app/notebook/${n.id}`)}
            onAddChild={async () => {
              const res = await createNote({ title: "Untitled", parent_id: n.id });
              const id = (res?.data as Record<string, unknown>)?.id as string | undefined;
              if (id) router.push(`/app/notebook/${id}`);
            }}
            onRename={() => router.push(`/app/notebook/${n.id}`)}
          />
          {expanded[n.id] && (
            <div className="pl-3">
              <DocumentList parentId={n.id} level={level + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


