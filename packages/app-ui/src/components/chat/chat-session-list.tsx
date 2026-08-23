"use client";

import {
  Add01Icon,
  Clock05Icon,
  Delete02Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import {
  useChatSessions,
  useChatStore,
  useCreateSession,
  useDeleteSession,
} from "@tradstry/app-ui/hooks/chat";
import { useState } from "react";

interface ChatSessionListProps {
  workspaceId: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ChatSessionList({ workspaceId }: ChatSessionListProps) {
  const { data: sessions = [] } = useChatSessions(workspaceId);
  const createSession = useCreateSession(workspaceId);
  const deleteSession = useDeleteSession(workspaceId);
  const { setActiveSession } = useChatStore();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isStarting = createSession.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Recent conversations
            </p>
            {sessions.length > 0 ? (
              <span className="text-[0.62rem] tabular-nums text-muted-foreground">
                {sessions.length}
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-[0.68rem] shadow-none"
            onClick={() => createSession.mutate()}
            disabled={isStarting || !workspaceId}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            New chat
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Message01Icon} className="size-5" />
              </span>
              <p className="mt-3 text-xs font-medium text-foreground">
                No conversations yet
              </p>
              <p className="mt-1 max-w-52 text-[0.68rem]/relaxed text-muted-foreground">
                Start a new chat and Tradstry AI will use this workspace as
                context.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="group relative flex items-center rounded-xl border border-transparent transition-colors hover:border-border/70 hover:bg-muted/45"
                >
                  <button
                    type="button"
                    onClick={() => setActiveSession(session.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2.5 text-left"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <HugeiconsIcon
                        icon={Message01Icon}
                        className="size-3.5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate pr-7 text-xs font-medium text-foreground">
                        {session.title ?? `Chat ${session.id.slice(0, 8)}`}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                        <HugeiconsIcon icon={Clock05Icon} className="size-3" />
                        {timeAgo(session.updatedAt || session.createdAt)}
                        <span aria-hidden>·</span>
                        Trading conversation
                      </span>
                    </span>
                  </button>

                  {/* Delete button — visible on hover */}
                  <Popover
                    open={confirmDeleteId === session.id}
                    onOpenChange={(open) =>
                      setConfirmDeleteId(open ? session.id : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(session.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                        aria-label="Delete chat"
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          className="size-3.5"
                        />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="end"
                      className="w-56 p-3"
                    >
                      <p className="text-sm font-medium">Delete this chat?</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This action cannot be undone.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteSession.isPending}
                          onClick={() => {
                            deleteSession.mutate(session.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
