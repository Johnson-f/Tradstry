"use client";

import { Loading01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradstryMark } from "@tradstry/app-ui/components/logo";
import { redactInternalIds } from "@tradstry/app-ui/lib/types/chat";

interface ChatStreamMessageProps {
  content: string;
  isStreaming: boolean;
}

function cleanContent(text: string): string {
  return redactInternalIds(text)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/[—–]/g, "-")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\|[-\s|:]+\|$/gm, "")
    .replace(/\|/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ChatStreamMessage({
  content,
  isStreaming,
}: ChatStreamMessageProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
        <TradstryMark className="size-3.5" />
      </span>
      <div className="min-w-0 max-w-[calc(100%-2.25rem)]">
        {content ? (
          <div className="whitespace-pre-wrap text-xs/relaxed text-foreground">
            {cleanContent(content)}
            {isStreaming && (
              <span className="ml-0.5 inline-block animate-pulse">&#9612;</span>
            )}
          </div>
        ) : (
          <div className="py-1 text-xs/relaxed">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HugeiconsIcon
                icon={Loading01Icon}
                className="size-3 animate-spin"
              />
              Thinking...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
