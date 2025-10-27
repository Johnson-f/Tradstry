"use client";

import dynamic from "next/dynamic";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

// Dynamically import heavy components with error handling
const NotebookEditor = dynamic(
  () => import("@/components/notebook/Editor").catch((err) => {
    console.error("Failed to load NotebookEditor:", err);
    return {
      default: () => (
        <div className="flex h-full items-center justify-center text-red-500">
          Failed to load editor. Please refresh the page.
        </div>
      ),
    };
  }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const Toolbar = dynamic(
  () => import("@/components/notebook/Toolbar").catch((err) => {
    console.error("Failed to load Toolbar:", err);
    return { default: () => <div className="h-12 border-b bg-background" /> };
  }),
  {
    ssr: false,
    loading: () => <div className="h-12 border-b bg-background animate-pulse" />,
  }
);

interface NotebookDocClientProps {
  docId: string;
}

export default function NotebookDocClient({ docId }: NotebookDocClientProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="h-full">
        <Suspense fallback={<div className="h-12 border-b bg-background animate-pulse" />}>
          <Toolbar docId={docId} />
        </Suspense>
        <div className="h-[calc(100vh-8rem)]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <NotebookEditor docId={docId} />
          </Suspense>
        </div>
      </div>
    </ScrollArea>
  );
}