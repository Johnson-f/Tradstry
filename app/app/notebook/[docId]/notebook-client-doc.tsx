"use client";

import dynamic from "next/dynamic";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

// Dynamically import heavy components to avoid circular dependencies
const NotebookEditor = dynamic(() => import("@/components/notebook/Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
});

const Toolbar = dynamic(() => import("@/components/notebook/Toolbar"), {
  ssr: false,
  loading: () => <div className="h-12 border-b bg-background" />
});

interface NotebookDocClientProps {
  docId: string;
}

export default function NotebookDocClient({ docId }: NotebookDocClientProps) {
  return (
    <ScrollArea className="h-full">
      <div className="h-full">
        <Toolbar docId={docId} />
        <div className="h-[calc(100vh-8rem)]">
          <NotebookEditor docId={docId} />
        </div>
      </div>
    </ScrollArea>
  );
}
