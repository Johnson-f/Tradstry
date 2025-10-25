import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Plus } from "lucide-react";

export const dynamic = 'force-dynamic';

export default function NotebookHomePage() {
  return (
    <ScrollArea className="h-full">
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-6 dark:bg-primary/20">
              <FileText className="h-16 w-16 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome to Notebook
            </h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto">
              Select a note from the sidebar or create a new one to get started with your trading journal.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Plus className="h-4 w-4" />
            <span>Click the + icon in the sidebar to create your first note</span>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
