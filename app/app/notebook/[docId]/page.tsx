"use client";

import { useParams } from "next/navigation";
import NotebookEditor from "@/components/notebook/Editor";
import Toolbar from "@/components/notebook/Toolbar";

export default function NotebookDocPage() {
  const params = useParams();
  const docId = params?.docId as string;

  return (
    <div className="h-full">
      <Toolbar docId={docId} />
      <NotebookEditor docId={docId} />
    </div>
  );
}


