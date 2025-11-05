"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote } from "@/lib/hooks/use-market-data-service";

interface CompanyInfoProps {
  symbol: string;
  className?: string;
}

export function CompanyInfo({ symbol, className }: CompanyInfoProps) {
  const { quote: data, isLoading } = useQuote(symbol, !!symbol);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [] as { label: string; value: React.ReactNode }[];
    return [
      { label: "Symbol", value: data.symbol || symbol?.toUpperCase() },
      { label: "Market Cap", value: data.marketCap ?? "—" },
      { label: "IPO Date", value: "—" },
      { label: "CEO", value: "—" },
      { label: "Fulltime Employees", value: data.employees ?? "—" },
      { label: "Sector", value: data.sector ?? "—" },
      { label: "Industry", value: data.industry ?? "—" },
      { label: "Country", value: "—" },
      { label: "Exchange", value: "—" },
    ];
  }, [data, symbol]);

  return (
    <div className={cn("rounded-2xl border bg-card/50", className)}>
      <div className="p-5 sm:p-6">
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            <dl className="divide-y">
              {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-2 gap-4 py-3">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-right text-sm sm:text-base font-medium truncate">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            {data?.about ? (
              <div className="pt-2">
                <p className={cn("text-sm text-muted-foreground leading-6", !expanded && "line-clamp-5")}> 
                  {data.about}
                </p>
                {data.about.length > 220 && (
                  <Button variant="link" size="sm" className="px-0 mt-1" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show Less" : "Read More"}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-2 gap-4 py-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex justify-end">
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4">
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export default CompanyInfo;


