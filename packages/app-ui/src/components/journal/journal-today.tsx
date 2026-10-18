"use client";

import {
	Calendar03Icon,
	ArrowDown01Icon,
	MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Calendar } from "@tradstry/app-ui/components/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
	useJournalTrades,
	useMoveReviewCursor,
	useRefreshReviewSession,
	useReviewSession,
	useSkipTradeReview,
	useUnskipTradeReview,
} from "@tradstry/app-ui/hooks/journal-review";
import type {
	JournalTrade,
	SessionItem,
	SkipReason,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { cn } from "@tradstry/app-ui/lib/utils";
import { netClass, ToneBadge } from "./journal-badges";
import { SKIP_LABELS } from "./journal-display";
import { calendarDate, dayLabel, formatR, money } from "./journal-format";
import { useJournalNavigation } from "./journal-navigation";
import { SkipMenuItems } from "./journal-skip-items";
import {
	dayBadge,
	groupedItems,
	isoToLocalDate,
	itemsToReview,
	latestTradingDay,
	localDateToIso,
	rowBadge,
	rowNote,
	tradingDays,
	unreviewedDays,
} from "./journal-today-model";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UNREVIEWED_DOT =
	"after:absolute after:bottom-0.5 after:left-1/2 after:z-20 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-amber-500";

function DayPicker({
	value,
	timezone,
	trades,
	onPick,
	onLatest,
}: {
	value: string;
	timezone?: string;
	trades: JournalTrade[];
	onPick: (date: string) => void;
	onLatest: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	const traded = [...tradingDays(trades, timezone)].map(isoToLocalDate);
	const unreviewed = [...unreviewedDays(trades, timezone)].map(isoToLocalDate);
	const today = calendarDate(new Date().toISOString(), timezone) === value;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="lg" aria-label={`Review day: ${dayLabel(value)}. Change day`}>
					<HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} aria-hidden="true" />
					{today ? `Today · ${dayLabel(value)}` : dayLabel(value)}
					<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					required
					selected={isoToLocalDate(value)}
					defaultMonth={isoToLocalDate(value)}
					onSelect={(date) => {
						onPick(localDateToIso(date));
						setOpen(false);
					}}
					modifiers={{ traded, unreviewed }}
					modifiersClassNames={{ traded: "font-semibold", unreviewed: UNREVIEWED_DOT }}
				/>
				<div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
						Not reviewed yet
					</span>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							onLatest();
							setOpen(false);
						}}
					>
						Latest day
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function TodayRow({
	item,
	trade,
	onOpen,
	onSkip,
	onUndoSkip,
}: {
	item: SessionItem;
	trade: JournalTrade | undefined;
	onOpen: (item: SessionItem, trigger: HTMLElement) => void;
	onSkip: (item: SessionItem, reason: SkipReason) => void;
	onUndoSkip: (item: SessionItem) => void;
}) {
	const exited = item.group === "exited";
	const symbol = trade?.symbol ?? "Trade";
	const rowButton = React.useRef<HTMLButtonElement>(null);
	return (
		<li className="flex items-center gap-1 px-1 hover:bg-muted/40">
			<button
				ref={rowButton}
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={(event) => onOpen(item, event.currentTarget)}
			>
				<span className="min-w-0 flex-1">
					<span className="text-sm font-semibold">{symbol}</span>{" "}
					<span className="text-xs capitalize text-muted-foreground">{trade?.direction}</span>
					{trade && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{rowNote(item, trade)}</span>}
				</span>
				{exited && trade && (
					<>
						<span className={cn("text-sm font-medium tabular-nums", netClass(trade.realizedNet))}>
							{money(trade.realizedNet, trade.currency)}
						</span>
						<span className="hidden w-12 text-right text-xs text-muted-foreground tabular-nums sm:block">
							{formatR(trade.realizedR)}
						</span>
					</>
				)}
				{trade && <ToneBadge spec={rowBadge(item, trade)} className="hidden sm:inline-flex" />}
			</button>
			{exited && item.state === "skipped" ? (
				<Button size="sm" variant="ghost" onClick={() => onUndoSkip(item)}>Undo</Button>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost" aria-label={`More for ${symbol}`}>
							<HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuItem onSelect={() => rowButton.current && onOpen(item, rowButton.current)}>
							Open trade
						</DropdownMenuItem>
						{exited && item.state === "pending" && (
							<>
								<DropdownMenuSeparator />
								<SkipMenuItems onSkip={(reason) => onSkip(item, reason)} />
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</li>
	);
}

export function JournalToday({
	workspaceId,
	timezone,
	dateParam,
}: {
	workspaceId: string;
	timezone?: string;
	dateParam: string | null;
}) {
	const nav = useJournalNavigation();
	const [date, setDate] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (dateParam && ISO_DAY.test(dateParam)) setDate(dateParam);
	}, [dateParam]);
	const session = useReviewSession(workspaceId, date);
	const trades = useJournalTrades(workspaceId);
	const move = useMoveReviewCursor(workspaceId);
	const refresh = useRefreshReviewSession(workspaceId);
	const skip = useSkipTradeReview(workspaceId);
	const unskip = useUnskipTradeReview(workspaceId);
	const data = session.data;
	const tradeFor = (entryId: string) => trades.data?.find((trade) => trade.id === entryId);

	if (session.isLoading)
		return (
			<div role="status" className="space-y-3">
				<span className="sr-only">Loading your daily review…</span>
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-40 w-full rounded-xl" />
			</div>
		);
	if (session.isError)
		return (
			<div className="p-8 text-center text-sm">
				<p>We couldn’t load your daily review.</p>
				<Button className="mt-3" variant="outline" onClick={() => void session.refetch()}>Retry</Button>
			</div>
		);
	if (!data)
		return (
			<p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
				No trading days yet. Your daily review appears once your executions sync.
			</p>
		);

	const groups = groupedItems(data.items);
	const pending = itemsToReview(data.items);
	const badge = dayBadge(data);
	const open = (item: SessionItem, trigger: HTMLElement) => {
		move.mutate({ sessionId: data.id, entryId: item.entryId, expectedVersion: data.version });
		nav.openTrade(item.entryId, { queue: { date }, trigger });
	};
	const skipItem = async (item: SessionItem, reason: SkipReason) => {
		const symbol = tradeFor(item.entryId)?.symbol ?? "Trade";
		try {
			await skip.mutateAsync({ entryId: item.entryId, reason, sessionId: data.id });
			toast(`${symbol} skipped · ${SKIP_LABELS[reason]}`, {
				action: { label: "Undo", onClick: () => void undoSkip(item) },
			});
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : "Could not skip this review");
		}
	};
	const undoSkip = async (item: SessionItem) => {
		const symbol = tradeFor(item.entryId)?.symbol ?? "Trade";
		try {
			await unskip.mutateAsync({ entryId: item.entryId });
			toast.success(`${symbol} is back to review`);
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : "Could not undo the skip");
		}
	};
	const latestKnown = latestTradingDay(trades.data ?? [], timezone);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<DayPicker
					value={data.date}
					timezone={timezone}
					trades={trades.data ?? []}
					onPick={setDate}
					onLatest={() => setDate(null)}
				/>
				<Badge role="status" className={cn(badge.complete ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
					{badge.text}
				</Badge>
				{data.refreshAvailable && (
					<Button
						variant="outline"
						disabled={refresh.isPending}
						onClick={() =>
							refresh.mutate(
								{ date: data.date, expectedVersion: data.version, refresh: true },
								{ onError: (failure) => toast.error(failure instanceof Error ? failure.message : "Could not update") },
							)
						}
					>
						New activity · Update
					</Button>
				)}
				<span className="flex-1" />
				{pending.length > 0 && (
					<Button onClick={(event) => open(pending[0]!, event.currentTarget)}>
						Start review · {pending.length}
					</Button>
				)}
			</div>
			{groups.length === 0 ? (
				<div className="rounded-xl border border-dashed p-8 text-center">
					<h2 className="text-sm font-medium">No trades on {dayLabel(data.date)}</h2>
					<p className="mt-1.5 text-xs text-muted-foreground">
						Pick another day, or jump to your latest trading day.
					</p>
					{date !== null && latestKnown && (
						<Button className="mt-3" variant="outline" onClick={() => setDate(null)}>Latest day</Button>
					)}
				</div>
			) : (
				groups.map((group) => (
					<section key={group.value} aria-label={group.label} className="space-y-2">
						<h2 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
							{group.label}
							<Badge variant="secondary">{group.items.length}</Badge>
						</h2>
						<ul className="divide-y rounded-xl border bg-card">
							{group.items.map((item) => (
								<TodayRow
									key={item.entryId}
									item={item}
									trade={tradeFor(item.entryId)}
									onOpen={open}
									onSkip={(target, reason) => void skipItem(target, reason)}
									onUndoSkip={(target) => void undoSkip(target)}
								/>
							))}
						</ul>
					</section>
				))
			)}
		</div>
	);
}
