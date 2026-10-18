"use client";

import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import type { JournalTrade, SkipReason } from "@tradstry/app-ui/lib/service/journal-flow";
import { cn } from "@tradstry/app-ui/lib/utils";
import { DirectionBadge, netClass, ToneBadge } from "../journal-badges";
import { reviewBadge, stateBadge } from "../journal-display";
import { dayLabel, formatR, money, tradeSpan } from "../journal-format";

export type QueuePosition = {
	index: number;
	total: number;
	date: string;
	onPrevious: () => void;
	onNext: () => void;
};

const OPTION_SYMBOL = /^[A-Z0-9.]+\s*\d{6}[CP]\d{8}$/;

function QueueBar({ queue }: { queue: QueuePosition }) {
	return (
		<div className="flex items-center gap-1 text-xs text-muted-foreground">
			<Button size="icon-sm" variant="ghost" aria-label="Previous trade" disabled={queue.index === 0} onClick={queue.onPrevious}>
				<HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
			</Button>
			<span className="tabular-nums" aria-live="polite">{queue.index + 1} of {queue.total}</span>
			<Button size="icon-sm" variant="ghost" aria-label="Next trade" disabled={queue.index === queue.total - 1} onClick={queue.onNext}>
				<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" />
			</Button>
			<span>· Daily review · {dayLabel(queue.date)}</span>
		</div>
	);
}

export function TradeHeader({
	trade,
	timezone,
	hasReviewWork,
	skipReason,
	queue,
	menu,
	onClose,
}: {
	trade: JournalTrade;
	timezone?: string;
	hasReviewWork: boolean;
	skipReason: SkipReason | null;
	queue: QueuePosition | null;
	menu: React.ReactNode;
	onClose: () => void;
}) {
	const option = OPTION_SYMBOL.test(trade.symbol);
	const title = option && trade.symbolName ? trade.symbolName : trade.symbol;
	const subtitle = option ? trade.symbol : trade.symbolName;
	const review =
		trade.reviewState === "unreviewed" && hasReviewWork && trade.lifecycleState === "closed"
			? { text: "Review in progress", tone: "info" as const }
			: reviewBadge(trade, skipReason);
	const r = trade.realizedR !== null ? formatR(trade.realizedR) : trade.lifecycleState === "closed" ? "R unavailable" : "";
	return (
		<div className="space-y-2">
			{queue && <QueueBar queue={queue} />}
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<h2 className="break-words text-xl font-semibold tracking-tight">{title}</h2>
						<DirectionBadge direction={trade.direction} />
						<ToneBadge spec={stateBadge(trade)} />
						<ToneBadge spec={review} />
						{trade.sourceKind === "manual" && <Badge variant="secondary">Manual</Badge>}
						{trade.startingPosition && (
							<Badge variant="outline" title="Includes a starting position you entered">Starting position</Badge>
						)}
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{[subtitle, tradeSpan(trade, timezone)].filter(Boolean).join(" · ")}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className={cn("text-lg font-semibold tabular-nums", netClass(trade.realizedNet))}>
						{money(trade.realizedNet, trade.currency)}
					</p>
					<p className="text-xs text-muted-foreground tabular-nums">{r}</p>
				</div>
				{menu}
				<Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
					<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}
