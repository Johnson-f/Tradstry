"use client";

import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { JournalTable } from "./journal-table";

export function Journal() {
  const activeWorkspace = useActiveWorkspace();

  return (
    <div className="flex flex-col">
      <JournalTable key={activeWorkspace?.id ?? "no-workspace"} />
    </div>
  );
}
