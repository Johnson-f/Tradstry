"use client";

import { TradstryMark } from "@tradstry/app-ui/components/logo";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { useChatStore } from "@tradstry/app-ui/hooks/chat";
import { useNotebookPanelStore } from "@tradstry/app-ui/hooks/notebook-panel";

export function ChatButton({ showLabel = false }: { showLabel?: boolean }) {
  const toggleOpen = useChatStore((s) => s.toggleOpen);
  const closeNotes = useNotebookPanelStore((s) => s.setOpen);
  const isOpen = useChatStore((s) => s.isOpen);

  function handleClick() {
    closeNotes(false);
    toggleOpen();
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={
            showLabel
              ? `h-8 gap-1.5 rounded-lg px-2.5 text-[0.7rem] text-muted-foreground shadow-none hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8 ${isOpen ? "bg-black/5 text-foreground dark:bg-white/8" : ""}`
              : isOpen
                ? "bg-muted text-foreground"
                : undefined
          }
          // Icon-only, so the name has to live somewhere a screen reader can reach.
          aria-label="Tradstry AI"
          aria-pressed={isOpen}
          onClick={handleClick}
        >
          <TradstryMark className="size-5" />
          {showLabel ? <span>Assistant</span> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Tradstry AI</TooltipContent>
    </Tooltip>
  );
}
