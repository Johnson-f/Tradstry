"use client";

import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@tradstry/app-ui/components/ui/select";
import { capture, EVENTS } from "@tradstry/app-ui/lib/analytics/events";
import { RANGE_PRESETS } from "@tradstry/app-ui/lib/range-presets";
import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";

export function DashboardRangeSelect({
  value,
  onValueChange,
}: {
  value: AnalyticsRange;
  onValueChange: (value: AnalyticsRange) => void;
}) {
  const selected =
    RANGE_PRESETS.find((option) => option.value === value) ?? RANGE_PRESETS[2];

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        capture(EVENTS.analyticsRangeChanged, { range: v });
        onValueChange(v as AnalyticsRange);
      }}
    >
      <SelectTrigger className="h-8 min-w-40 rounded-xl border-border/70 bg-background px-2.5 text-xs shadow-none hover:bg-muted/45 data-[state=open]:bg-muted/60">
        <HugeiconsIcon
          icon={Calendar01Icon}
          className="size-3.5 text-muted-foreground"
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {selected?.description ?? "Range"}
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.58rem] text-muted-foreground">
          {selected?.label}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        sideOffset={6}
        className="w-52 rounded-xl border border-border/75 p-1 shadow-[0_14px_32px_-20px_rgba(0,0,0,0.35)]"
      >
        {RANGE_PRESETS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="h-9 rounded-lg px-2.5 pr-8 data-[state=checked]:bg-accent"
          >
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="truncate font-medium">{option.description}</span>
              <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                {option.label}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
