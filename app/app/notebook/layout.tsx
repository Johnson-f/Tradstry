import NotebookLayoutClient from "./notebook-layout-client";
import React from "react";

// Disable static generation for notebook routes
export const dynamic = 'force-dynamic';

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return <NotebookLayoutClient>{children}</NotebookLayoutClient>;
}
