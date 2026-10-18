"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import { useTradeOutcome } from "@tradstry/app-ui/hooks/journal-review";
import type {
	JournalTrade,
	TradeOutcome,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { cn } from "@tradstry/app-ui/lib/utils";
import { netClass } from "../journal-badges";
import { formatR, money } from "../journal-format";

const R_UNAVAILABLE: Record<NonNullable<TradeOutcome["realizedRUnavailable"]>, string> = {
	position_still_open: "R shows once the trade has exited.",
	no_planned_stop: "R is unavailable without a planned entry stop.",
	stop_on_wrong_side: "Your stop is on the wrong side of your entry price, so R can’t be worked out.",
	fees_unknown: "Some fees are missing, so R can’t be worked out.",
};
const FLAGS: Record<TradeOutcome["flags"][number], string> = {
	no_entry_note: "No entry note was recorded.",
	entry_beyond_stop: "You entered beyond your planned stop.",
	exit_beyond_stop: "An exit landed beyond your planned stop.",
};
const BOUNDARY = {
	before_planned_stop: "Before your stop",
	at_or_near_planned_stop: "At or near your stop",
	beyond_planned_stop: "Beyond your stop",
} as const;
const ACTION_LABELS = { entry: "Entry", add: "Add", trim: "Trim", exit: "Exit" } as const;

function unavailableReason(trade: JournalTrade, outcome: TradeOutcome | null | undefined) {
	if (outcome?.realizedRUnavailable === "no_planned_stop" && outcome.flags.includes("no_entry_note"))
		return "No entry note was recorded, so R is unavailable.";
	if (outcome?.realizedRUnavailable) return R_UNAVAILABLE[outcome.realizedRUnavailable];
	return trade.lifecycleState === "open" ? R_UNAVAILABLE.position_still_open : null;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-[11px] text-muted-foreground">{label}</dt>
			<dd className={cn("mt-1 break-words text-sm font-medium tabular-nums", tone)}>{value}</dd>
		</div>
	);
}

export function ReviewResults({
	workspaceId,
	trade,
}: {
	workspaceId: string;
	trade: JournalTrade;
}) {
	const outcome = useTradeOutcome(workspaceId, trade.id, !!trade.episodeId);
	const data = outcome.data;
	const r = trade.realizedR ?? data?.realizedR ?? null;
	const reason = r === null ? unavailableReason(trade, data) : null;
	const landed = data?.actions.filter((action) => action.boundary) ?? [];
	const warnings = data?.flags.filter((flag) => flag !== "no_entry_note") ?? [];
	const resultNote = reason ?? (data?.flags.includes("no_entry_note") ? FLAGS.no_entry_note : null);
	return (
		<section aria-label="Results" className="space-y-3 border-b pb-5">
			<dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-[1fr_0.6fr_1.5fr_0.7fr]">
				<Metric label="Net P&L" value={money(trade.realizedNet, trade.currency)} tone={netClass(trade.realizedNet)} />
				<Metric label="R" value={formatR(r)} />
				<Metric
					label="Average entry → exit"
					value={`${money(trade.entryPrice, trade.currency)} → ${money(trade.exitPrice, trade.currency)}`}
				/>
				<Metric label="Fees" value={money(trade.feesPaid, trade.currency)} />
			</dl>
			{resultNote && <p className="text-[11px] leading-relaxed text-muted-foreground">{resultNote}</p>}
			{outcome.isError && (
				<div className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs">
					<span>The exits against your stop could not be loaded.</span>
					<Button size="sm" variant="outline" onClick={() => void outcome.refetch()}>Retry</Button>
				</div>
			)}
			{landed.length > 0 && (
				<Collapsible className="group/stops">
					<CollapsibleTrigger className="flex w-full items-center justify-between gap-3 py-1 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
						<span>Exits against your stop <span className="ml-1 tabular-nums">({landed.length})</span></span>
						<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} aria-hidden="true" className="size-3.5 shrink-0 group-data-[state=open]/stops:rotate-180" />
					</CollapsibleTrigger>
					<CollapsibleContent>
						<ul className="mt-2 divide-y">
							{landed.map((action) => (
								<li key={action.anchorExecutionId + action.kind} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs">
									<span className="tabular-nums">
										{ACTION_LABELS[action.kind]} · {action.quantity} at {money(action.price, trade.currency)}
									</span>
									<span className="text-muted-foreground">
										{action.boundary && BOUNDARY[action.boundary]}
										{action.distanceFromStopR && ` · ${formatR(action.distanceFromStopR)} from your stop`}
									</span>
								</li>
							))}
						</ul>
					</CollapsibleContent>
				</Collapsible>
			)}
			{warnings.length > 0 && (
				<ul className="space-y-1 border-l-2 border-amber-500/40 pl-3 text-xs text-amber-800 dark:text-amber-300">
					{warnings.map((flag) => <li key={flag}>{FLAGS[flag]}</li>)}
				</ul>
			)}
		</section>
	);
}
