"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { money } from "../journal-format";

function timestamp(value: string | null, timezone?: string) {
	if (!value) return "Not recorded";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Not recorded";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: timezone,
	}).format(date);
}

export function BrokerDetails({
	trade,
	timezone,
}: {
	trade: JournalTrade;
	timezone?: string;
}) {
	const rows = [
		["Symbol", trade.symbol],
		["Symbol name", trade.symbolName || "—"],
		["Open date", timestamp(trade.openDate, timezone)],
		[
			"Close date",
			trade.closeDate
				? timestamp(trade.closeDate, timezone)
				: trade.lifecycleState === "open"
					? "Still open"
					: "Not recorded",
		],
		["Entry price", money(trade.entryPrice, trade.currency)],
		["Exit price", money(trade.exitPrice, trade.currency)],
		[
			Number(trade.contractMultiplier) !== 1 ? "Position size (contracts)" : "Position size",
			trade.enteredQuantity ?? "—",
		],
		["Trade type", trade.direction],
	];
	return (
		<Collapsible className="group border-t">
			<CollapsibleTrigger className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<span className="font-medium">
					Broker details
					<span className="ml-2 text-xs font-normal text-muted-foreground">
						Original dates, prices and position
					</span>
				</span>
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
					strokeWidth={1.8}
					aria-hidden="true"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<dl className="grid gap-x-6 gap-y-3 pb-3 sm:grid-cols-2">
					{rows.map(([label, value]) => (
						<div key={label} className="min-w-0">
							<dt className="text-[11px] text-muted-foreground">{label}</dt>
							<dd className="mt-0.5 break-words text-sm tabular-nums">{value}</dd>
						</div>
					))}
				</dl>
			</CollapsibleContent>
		</Collapsible>
	);
}
