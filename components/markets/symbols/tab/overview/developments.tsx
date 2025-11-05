"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { useNews } from "@/lib/hooks/use-market-data-service";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface DevelopmentsProps {
  symbol: string;
  className?: string;
}

export function Developments({ symbol, className }: DevelopmentsProps) {
  const { news, isLoading } = useNews({ symbol, limit: 3 }, !!symbol);

  const items = useMemo(() => (news || []).slice(0, 3), [news]);

  if (isLoading) return <Loading className={className} />;

  if (!items.length) {
    return (
      <div className={cn("rounded-2xl border bg-card/50 p-6", className)}>
        <div className="text-sm text-muted-foreground">No recent developments.</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border bg-card/50", className)}>
      <div className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Developments</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {items.map((n) => (
            <a
              key={`${n.time}-${n.link}`}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border bg-card/60 hover:bg-muted/40 transition-colors p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {n.img ? (
                  <div className="h-5 w-5 rounded overflow-hidden bg-muted flex-shrink-0">
                    <Image src={n.img} alt={n.source || "source"} width={20} height={20} unoptimized />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded bg-muted flex-shrink-0" />
                )}
                <span>{timeAgo(n.time)}</span>
              </div>
              <div className="text-base font-semibold leading-snug line-clamp-2">{n.title}</div>
              {n.source && (
                <div className="text-xs text-muted-foreground">{n.source}</div>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card/50 p-6", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(isoOrDate: string | Date) {
  try {
    const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    const now = new Date();
    const diff = Math.max(0, now.getTime() - date.getTime());
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

export default Developments;


