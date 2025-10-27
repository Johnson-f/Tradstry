"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotebookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Notebook error:", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Something went wrong!</h2>
        <p className="text-muted-foreground max-w-md">
          There was an error loading the notebook. This might be due to a temporary issue.
        </p>
        {error.message && (
          <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded mt-2">
            {error.message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.href = "/app"}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}