import { Loader2 } from "lucide-react";

export default function NotebookLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading notebook...</p>
      </div>
    </div>
  );
}