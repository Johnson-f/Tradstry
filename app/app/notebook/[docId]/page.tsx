"use client";

import { useParams } from "next/navigation";
import NotebookEditor from "@/components/notebook/Editor";
import Toolbar from "@/components/notebook/Toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NotebookDocPage() {
  const params = useParams();
  const docId = params?.docId as string;

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


