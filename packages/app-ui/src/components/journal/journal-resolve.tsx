"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { DialogFooter } from "@tradstry/app-ui/components/ui/dialog";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	RadioGroup,
	RadioGroupItem,
} from "@tradstry/app-ui/components/ui/radio-group";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { GraphQLRequestError } from "@tradstry/app-ui/lib/client";
import { cn } from "@tradstry/app-ui/lib/utils";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import {
	calendarDate,
	executionTime,
	money,
	positionHistory,
	quantityMath,
	startOfDay,
	tradeDate,
} from "./journal-format";
import { ExecutionHeldBy } from "./journal-grouping";

type Direction = "long" | "short";
type Fix = "starting" | "merge" | "switch" | "keep";
type Outcome =
	| { kind: "grouping"; preview: flow.GroupingPreview }
	| { kind: "starting"; trades: flow.OpeningTrade[] };
type Pending = { kind: "grouping" | "starting"; command: flow.Command };

const opposite = (direction: Direction): Direction =>
	direction === "long" ? "short" : "long";

function messageOf(reason: unknown, fallback: string) {
	return reason instanceof Error ? reason.message : fallback;
}

function readPending(key: string): Pending | null {
	try {
		const value = localStorage.getItem(key);
		return value ? (JSON.parse(value) as Pending) : null;
	} catch {
		return null;
	}
}

function writePending(key: string, value: Pending | null) {
	try {
		if (value) localStorage.setItem(key, JSON.stringify(value));
		else localStorage.removeItem(key);
	} catch {
		// The confirmation still runs; only the retry after a reload is lost.
	}
}

function useResolveTrade({
	workspaceId,
	trade,
	executions,
	timezone,
	startingOnly,
	suggestedQuantity,
}: {
	workspaceId: string;
	trade: flow.JournalTrade;
	executions: flow.Execution[];
	timezone?: string;
	startingOnly: boolean;
	suggestedQuantity?: string;
}) {
	const fetcher = useGraphQL();
	const platform = useTradstryPlatform();
	const owner = platform.user.email;
	const base = ["journal-flow", owner, workspaceId];
	const storageKey = `tradstry:journal-resolve:${owner}:${workspaceId}:${trade.id}`;

	const targets = useQuery({
		queryKey: [...base, "resolve-targets"],
		queryFn: () => flow.trades(fetcher, workspaceId),
	});
	const opening = useQuery({
		queryKey: [...base, "opening", trade.id],
		queryFn: () => flow.openingPosition(fetcher, workspaceId, trade.id),
	});

	const [order, setOrder] = React.useState<string[]>([]);
	const rows = React.useMemo(
		() =>
			executions
				.filter((fill) => !fill.startingPosition)
				.sort((a, b) => {
					if (a.executedAt !== b.executedAt) {
						if (!a.executedAt) return 1;
						if (!b.executedAt) return -1;
						return (
							new Date(a.executedAt).getTime() -
							new Date(b.executedAt).getTime()
						);
					}
					const left = order.indexOf(a.transactionId);
					const right = order.indexOf(b.transactionId);
					return (left < 0 ? 99999 : left) - (right < 0 ? 99999 : right);
				}),
		[executions, order],
	);
	const sameTime = (index: number, offset: number) =>
		!!rows[index]?.executedAt &&
		rows[index]?.executedAt === rows[index + offset]?.executedAt;
	const move = (index: number, offset: number) => {
		if (!sameTime(index, offset)) return;
		const ids = rows.map((fill) => fill.transactionId);
		[ids[index], ids[index + offset]] = [ids[index + offset]!, ids[index]!];
		setOrder(ids);
	};

	const guessed: Direction = rows[0]?.side.toUpperCase().startsWith("SELL")
		? "short"
		: "long";
	const history = positionHistory(rows, guessed);
	const switched = positionHistory(rows, opposite(guessed));

	const duplicates = startingOnly
		? []
		: (targets.data ?? []).filter((entry) =>
				trade.possibleDuplicates?.includes(entry.id),
			);
	// undefined until answered, null when the user says they are different trades.
	const [sameAs, setSameAs] = React.useState<string | null>();
	const unanswered = duplicates.length > 0 && sameAs === undefined;
	const eligibleTargets = (targets.data ?? []).filter(
		(entry) =>
			entry.id !== trade.id &&
			!(sameAs === null && duplicates.includes(entry)) &&
			((entry.episodeId &&
				entry.symbol === trade.symbol &&
				entry.lifecycleState === "open") ||
				duplicates.includes(entry)),
	);

	const firstDate = rows[0]?.executedAt
		? calendarDate(rows[0].executedAt, timezone)
		: "";
	const [fix, setFix] = React.useState<Fix>(
		startingOnly || history.deficit > 0 ? "starting" : "keep",
	);
	const [targetId, setTargetId] = React.useState("");
	const answerSameAs = (answer: string | null) => {
		setSameAs(answer);
		if (answer) {
			setFix("merge");
			setTargetId(answer);
		} else if (fix === "merge" && duplicates.some((entry) => entry.id === targetId)) {
			setFix(history.deficit > 0 ? "starting" : "keep");
			setTargetId("");
		}
	};
	const [starting, setStarting] = React.useState({
		direction: guessed as Direction,
		quantity: history.deficit > 0 ? String(history.deficit) : (suggestedQuantity ?? ""),
		averagePrice: "",
		date: firstDate,
	});
	const existing = opening.data;
	React.useEffect(() => {
		if (!existing) return;
		setStarting({
			direction: existing.direction === "short" ? "short" : "long",
			quantity: existing.quantity,
			averagePrice: existing.averagePrice,
			date: calendarDate(existing.asOf, timezone),
		});
		setFix("starting");
	}, [existing?.id, timezone]);

	const target = eligibleTargets.find((entry) => entry.id === targetId);
	const direction: Direction =
		fix === "merge" && (target?.direction === "short" || target?.direction === "long")
			? target.direction
			: fix === "switch"
				? opposite(guessed)
				: fix === "starting"
					? starting.direction
					: guessed;
	const shown = positionHistory(rows, direction);
	const startingInput: flow.OpeningPositionInput | null =
		Number(starting.quantity) > 0 &&
		Number(starting.averagePrice) > 0 &&
		/^\d{4}-\d{2}-\d{2}$/.test(starting.date)
			? {
					direction: starting.direction,
					quantity: starting.quantity.trim(),
					averagePrice: starting.averagePrice.trim(),
					asOf: startOfDay(starting.date, timezone),
				}
			: null;
	const blocked =
		fix === "keep"
			? history.deficit > 0
			: fix === "switch"
				? switched.deficit > 0
				: fix === "merge"
					? !target
					: !startingInput;

	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const [exitIssue, setExitIssue] = React.useState<flow.ExitIssue | null>(
		null,
	);
	const [error, setError] = React.useState<string | null>(null);
	const [previewing, setPreviewing] = React.useState(false);
	const [nonce, setNonce] = React.useState(0);
	const request = React.useRef(0);

	const groupingPreview = async () => {
		const sources = [{ entry: trade, executions: rows }];
		if (target)
			sources.push({
				entry: target,
				executions: (await flow.detail(fetcher, workspaceId, target.id))
					.journalExecutionsV2,
			});
		const totals = new Map<string, string>();
		for (const item of sources)
			for (const fill of item.executions)
				totals.set(
					fill.transactionId,
					quantityMath(totals.get(fill.transactionId) ?? "0", fill.quantity),
				);
		const ranked = rows.map((fill) => fill.transactionId);
		const allocations = [...totals]
			.filter(([, quantity]) => quantity !== "0")
			.sort(([a], [b]) => {
				const left = ranked.indexOf(a);
				const right = ranked.indexOf(b);
				return (left < 0 ? 99999 : left) - (right < 0 ? 99999 : right);
			})
			.map(([transactionId, quantity]) => ({ transactionId, quantity }));
		return flow.previewGrouping(
			fetcher,
			workspaceId,
			{
				direction,
				entryIds: sources.map((item) => item.entry.id),
				groups: [{ entryId: target?.id ?? trade.id, allocations }],
			},
			sameAs === null ? duplicates.map((entry) => entry.id) : [],
		);
	};

	const orderKey = order.join("|");
	const startingKey = JSON.stringify(startingInput);
	React.useEffect(() => {
		const id = ++request.current;
		setOutcome(null);
		setError(null);
		setExitIssue(null);
		setPreviewing(false);
		if (blocked || unanswered) return;
		const timer = setTimeout(async () => {
			setPreviewing(true);
			try {
				const next: Outcome =
					fix === "starting" && startingInput
						? {
								kind: "starting",
								trades: await flow.openingPreview(
									fetcher,
									workspaceId,
									trade.id,
									startingInput,
								),
							}
						: { kind: "grouping", preview: await groupingPreview() };
				if (id === request.current) setOutcome(next);
			} catch (reason) {
				if (id !== request.current) return;
				setExitIssue(flow.exitIssue(reason));
				setError(messageOf(reason, "Could not build the preview"));
			} finally {
				if (id === request.current) setPreviewing(false);
			}
		}, 400);
		return () => clearTimeout(timer);
	}, [fix, targetId, orderKey, startingKey, sameAs, unanswered, blocked, nonce]);

	const [pending, setPending] = React.useState<Pending | null>(() =>
		readPending(storageKey),
	);
	const [busy, setBusy] = React.useState(false);

	const run = async (next: Pending) => {
		setPending(next);
		writePending(storageKey, next);
		setBusy(true);
		setError(null);
		try {
			await flow.execute(fetcher, next.command);
			writePending(storageKey, null);
			setPending(null);
			return true;
		} catch (reason) {
			const message = messageOf(
				reason,
				"Confirmation is still pending. Retry to check its result.",
			);
			setError(message);
			// The server answered, so the command will not apply later; only a
			// lost response leaves it pending for a retry.
			if (reason instanceof GraphQLRequestError) {
				writePending(storageKey, null);
				setPending(null);
				setNonce((value) => value + 1);
			}
			return false;
		} finally {
			setBusy(false);
		}
	};

	const confirm = () => {
		if (pending) return run(pending);
		if (outcome?.kind === "grouping")
			return run({
				kind: "grouping",
				command: flow.command(
					flow.CONFIRM_GROUPING,
					"confirmJournalGrouping",
					{ workspaceId, token: outcome.preview.token },
					owner,
				),
			});
		if (outcome?.kind === "starting" && startingInput)
			return run({
				kind: "starting",
				command: flow.command(
					flow.SAVE_OPENING,
					"saveJournalOpeningPosition",
					{
						workspaceId,
						entryId: trade.id,
						input: startingInput,
						separateFrom:
							sameAs === null ? duplicates.map((entry) => entry.id) : [],
					},
					owner,
				),
			});
		return Promise.resolve(false);
	};

	const removeStarting = async () => {
		if (!existing) return false;
		return run({
			kind: "starting",
			command: flow.command(
				flow.REMOVE_OPENING,
				"removeJournalOpeningPosition",
				{ workspaceId, positionId: existing.id },
				owner,
			),
		});
	};

	const chooseStartingDirection = (next: Direction) => {
		const before = positionHistory(rows, starting.direction).deficit;
		const after = positionHistory(rows, next).deficit;
		setStarting({
			...starting,
			direction: next,
			quantity:
				!starting.quantity.trim() || starting.quantity === String(before)
					? after > 0
						? String(after)
						: ""
					: starting.quantity,
		});
	};

	return {
		rows,
		sameTime,
		move,
		guessed,
		history,
		switched,
		shown,
		direction,
		fix,
		setFix,
		targets,
		eligibleTargets,
		targetId,
		setTargetId,
		starting,
		setStarting,
		chooseStartingDirection,
		existing,
		duplicates,
		sameAs,
		answerSameAs,
		unanswered,
		blocked,
		outcome,
		previewing,
		exitIssue,
		error,
		pending,
		busy,
		confirm,
		removeStarting,
	};
}

export function FixTradeHistory({
	workspaceId,
	trade,
	executions,
	timezone,
	startingOnly = false,
	suggestedQuantity,
	onClose,
	onDone,
}: {
	workspaceId: string;
	trade: flow.JournalTrade;
	executions: flow.Execution[];
	timezone?: string;
	startingOnly?: boolean;
	suggestedQuantity?: string;
	onClose: () => void;
	onDone: () => void | Promise<void>;
}) {
	const platform = useTradstryPlatform();
	const fix = useResolveTrade({
		workspaceId,
		trade,
		executions,
		timezone,
		startingOnly,
		suggestedQuantity,
	});
	const id = React.useId();
	const brokenId =
		fix.exitIssue?.transactionId ??
		(fix.shown.broken >= 0 ? fix.rows[fix.shown.broken]?.transactionId : null);
	const brokenRow = React.useRef<HTMLTableRowElement>(null);
	React.useEffect(() => {
		brokenRow.current?.scrollIntoView({ block: "nearest" });
	}, [brokenId]);

	const finish = async () => {
		if (await fix.confirm()) {
			await onDone();
			onClose();
		}
	};
	const remove = async () => {
		if (await fix.removeStarting()) {
			await onDone();
			onClose();
		}
	};

	const broken =
		fix.history.broken >= 0 ? fix.rows[fix.history.broken] : undefined;
	const step = fix.history.steps[fix.history.broken];
	const diagnosis = startingOnly
		? "What you held before your first imported execution. The first trades that sell it use it up."
		: broken && step
			? `This ${broken.side.toLowerCase()} of ${broken.quantity} on ${executionTime(broken, timezone)} is ${step.short} more than the ${step.before} held at that point. Your history probably started before the first imported execution.`
			: fix.history.steps.at(-1)?.position
				? `These executions leave ${fix.history.steps.at(-1)!.position} open as a ${fix.guessed} position. The position before them isn't known, so confirm how to calculate it.`
				: `These executions open and close a complete ${fix.guessed} position. The position before them isn't known, so confirm to calculate this trade.`;

	const choices: {
		value: Fix;
		label: string;
		hint: string;
		disabled?: string;
	}[] = [
		{
			value: "starting",
			label: "Add a starting position",
			hint: "You held shares before the first imported execution.",
		},
		...(fix.eligibleTargets.length
			? [
					{
						value: "merge" as const,
						label: "Merge into an existing trade",
						hint: "These executions continue a trade already in your journal.",
					},
				]
			: []),
		{
			value: "switch",
			label: `Treat as a ${opposite(fix.guessed)} position`,
			hint:
				opposite(fix.guessed) === "short"
					? "The sells opened a short position."
					: "The buys opened a long position.",
			disabled:
				fix.switched.deficit > 0
					? `Doesn't balance either: ${fix.switched.deficit} more closed than opened.`
					: undefined,
		},
		{
			value: "keep",
			label: "Keep as one trade",
			hint: `Group these broker executions as one ${fix.guessed} trade.`,
			disabled:
				fix.history.deficit > 0
					? `${fix.history.deficit} more closed than opened.`
					: undefined,
		},
	];

	const offered = startingOnly ? choices.slice(0, 1) : choices;

	return (
		<section
			aria-label={startingOnly ? "Starting position" : "Fix trade history"}
			className="flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:overscroll-contain lg:[&>[data-slot=scroll-area-viewport]>div]:h-full">
				<div className="grid min-h-0 lg:h-full lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
					<section
						aria-labelledby={`${id}-executions-heading`}
						className="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0"
					>
						<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
							<div className="flex items-center gap-2">
								<h2
									id={`${id}-executions-heading`}
									className="text-sm font-medium"
								>
									Broker executions
								</h2>
								<span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
									{fix.rows.length}
								</span>
							</div>
							<p className="text-[11px] text-muted-foreground">
								Running position ·{" "}
								<span className="capitalize">{fix.direction}</span>
							</p>
						</div>
						<ScrollArea
							orientation="both"
							className="min-h-0 lg:flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-72 lg:[&>[data-slot=scroll-area-viewport]]:overscroll-contain lg:[&>[data-slot=scroll-area-viewport]]:max-h-none"
						>
							<table className="w-full min-w-[520px] text-xs">
								<thead className="sticky top-0 z-10 bg-muted text-[11px] text-muted-foreground">
									<tr>
										<th className="px-4 py-2.5 text-left font-medium">Time</th>
										<th className="px-3 py-2.5 text-left font-medium">Side</th>
										<th className="px-3 py-2.5 text-right font-medium">
											Available
										</th>
										<th className="px-3 py-2.5 text-right font-medium">
											Price
										</th>
										<th className="px-4 py-2.5 text-right font-medium">
											Position
										</th>
									</tr>
								</thead>
								<tbody>
									{fix.rows.map((fill, index) => {
										const step = fix.shown.steps[index]!;
										const isBroken = fill.transactionId === brokenId;
										const reorder =
											fix.sameTime(index, -1) || fix.sameTime(index, 1);
										return (
											<tr
												key={fill.transactionId}
												ref={isBroken ? brokenRow : undefined}
												aria-invalid={isBroken || undefined}
												className="border-t border-border/60 hover:bg-muted/30 aria-invalid:bg-destructive/5"
											>
												<td className="px-4 py-3 text-xs text-muted-foreground">
													<div className="flex items-center gap-1">
														{executionTime(fill, timezone)}
														{reorder && (
															<span className="ml-1 flex">
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	aria-label={`Move execution ${index + 1} earlier`}
																	title="Move earlier within the same recorded time"
																	disabled={
																		fix.busy || !fix.sameTime(index, -1)
																	}
																	onClick={() => fix.move(index, -1)}
																>
																	<HugeiconsIcon
																		icon={ArrowUp01Icon}
																		className="size-3.5"
																		aria-hidden="true"
																	/>
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	aria-label={`Move execution ${index + 1} later`}
																	title="Move later within the same recorded time"
																	disabled={fix.busy || !fix.sameTime(index, 1)}
																	onClick={() => fix.move(index, 1)}
																>
																	<HugeiconsIcon
																		icon={ArrowDown01Icon}
																		className="size-3.5"
																		aria-hidden="true"
																	/>
																</Button>
															</span>
														)}
													</div>
												</td>
												<td className="px-3 py-3">
													<span
														className={cn(
															"rounded-md px-1.5 py-1 text-[10px] font-medium",
															fill.side.toUpperCase().startsWith("BUY")
																? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
																: fill.side.toUpperCase().startsWith("SELL")
																	? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
																	: "bg-muted text-muted-foreground",
														)}
													>
														{fill.side}
													</span>
												</td>
												<td
													className={cn(
														"px-3 py-3 text-right tabular-nums",
														Number(fill.quantity) === 0 &&
															"text-muted-foreground",
													)}
													title={"Broker quantity: " + fill.sourceQuantity}
												>
													{fill.quantity}
													<ExecutionHeldBy
														holders={fill.heldBy}
														timezone={timezone}
													/>
												</td>
												<td className="px-3 py-3 text-right tabular-nums">
													{money(fill.price, trade.currency)}
												</td>
												<td
													className={cn(
														"px-4 py-3 text-right font-medium tabular-nums",
														step.position < 0 && "text-destructive",
													)}
												>
													{step.position}
													{step.short > 0 && (
														<span className="mt-0.5 block text-[11px] font-normal">
															{step.short} short
														</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</ScrollArea>
						{!fix.rows.length && (
							<p className="shrink-0 px-5 py-5 text-center text-xs text-muted-foreground">
								No executions are available.
							</p>
						)}
					</section>

					<ScrollArea className="min-h-0 min-w-0 lg:h-full lg:[&>[data-slot=scroll-area-viewport]]:overscroll-contain">
						<div className="space-y-5 p-5">
							<div
								className={cn(
									"border-l-2 py-1 pl-3",
									startingOnly ? "border-border" : "border-amber-500/50",
								)}
							>
								<h2 className="text-xs font-medium">
									{startingOnly ? "What you held" : "What needs checking"}
								</h2>
								{!startingOnly && trade.issueMessage && (
									<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
										{trade.issueMessage}
									</p>
								)}
								<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
									{diagnosis}
								</p>
								{fix.existing && (
									<div className="mt-3 border-t pt-3 text-xs leading-relaxed">
										<p>
											Your starting position: {fix.existing.quantity}{" "}
											{fix.existing.direction} at{" "}
											{money(fix.existing.averagePrice, trade.currency)}, held
											at the start of {tradeDate(fix.existing.asOf, timezone)}.
											{fix.existing.olderHistory &&
												" Older broker history has since been imported, so it may already include these shares."}
										</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="mt-2"
											disabled={fix.busy}
											onClick={() => void remove()}
										>
											Remove starting position
										</Button>
									</div>
								)}
							</div>

							{fix.duplicates.length > 0 && (
								<fieldset className="space-y-2">
									<legend className="mb-2 text-sm font-medium">
										Did you already add this trade?
									</legend>
									<RadioGroup
										aria-label="Did you already add this trade?"
										value={
											fix.sameAs === undefined ? "" : (fix.sameAs ?? "different")
										}
										onValueChange={(value) =>
											fix.answerSameAs(value === "different" ? null : value)
										}
										className="gap-0 divide-y overflow-hidden rounded-lg border"
									>
										{fix.duplicates.map((entry) => (
											<Label
												key={entry.id}
												htmlFor={`${id}-same-${entry.id}`}
												className={cn(
													"flex cursor-pointer items-start gap-3 p-3 font-normal hover:bg-muted/40 focus-within:bg-muted/60",
													fix.sameAs === entry.id && "bg-muted/70",
												)}
											>
												<RadioGroupItem
													id={`${id}-same-${entry.id}`}
													value={entry.id}
													disabled={fix.busy}
													className="mt-0.5"
												/>
												<span className="min-w-0">
													<span className="block text-xs font-medium leading-relaxed">
														Yes, it's my {entry.symbol} trade from{" "}
														{tradeDate(entry.openDate, timezone)}
													</span>
													<span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
														The broker executions replace it. Your notes and
														review stay.
													</span>
												</span>
											</Label>
										))}
										<Label
											htmlFor={`${id}-same-different`}
											className={cn(
												"flex cursor-pointer items-start gap-3 p-3 font-normal hover:bg-muted/40 focus-within:bg-muted/60",
												fix.sameAs === null && "bg-muted/70",
											)}
										>
											<RadioGroupItem
												id={`${id}-same-different`}
												value="different"
												disabled={fix.busy}
												className="mt-0.5"
											/>
											<span className="min-w-0">
												<span className="block text-xs font-medium leading-relaxed">
													No, these are different trades
												</span>
												<span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
													Both stay in your journal, and you won't be asked
													again.
												</span>
											</span>
										</Label>
									</RadioGroup>
								</fieldset>
							)}

							{(startingOnly || !fix.duplicates.length || fix.sameAs === null) && (
								<fieldset className="space-y-2">
									{!startingOnly && (
										<legend className="mb-2 text-sm font-medium">
											Choose a fix
										</legend>
									)}
									{!startingOnly && (
										<>
											<RadioGroup
												aria-label="Choose a fix"
												value={fix.fix}
												onValueChange={(value) => fix.setFix(value as Fix)}
												className="gap-0 divide-y overflow-hidden rounded-lg border"
											>
												{offered.map((choice) => (
													<Label
														key={choice.value}
														htmlFor={`${id}-${choice.value}`}
														className={cn(
															"flex cursor-pointer items-start gap-3 p-3 font-normal hover:bg-muted/40 focus-within:bg-muted/60",
															fix.fix === choice.value && "bg-muted/70",
															choice.disabled && "cursor-not-allowed opacity-60",
														)}
													>
														<RadioGroupItem
															id={`${id}-${choice.value}`}
															value={choice.value}
															disabled={!!choice.disabled || fix.busy}
															className="mt-0.5"
														/>
														<span className="min-w-0">
															<span className="block text-xs font-medium leading-relaxed">
																{choice.label}
															</span>
															<span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
																{choice.disabled ?? choice.hint}
															</span>
														</span>
													</Label>
												))}
											</RadioGroup>
										</>
									)}
									<Button
										type="button"
										variant="link"
										size="sm"
										className="h-auto whitespace-normal px-0 text-left text-[11px] text-muted-foreground"
										onClick={() => platform.navigate("/dashboard/brokerage")}
									>
										Import missing history from your broker instead
									</Button>
								</fieldset>
							)}

							{fix.fix === "starting" && !fix.unanswered && (
								<div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3">
									<div className="col-span-2 space-y-1.5">
										<Label id={`${id}-starting-direction`}>Position</Label>
										<RadioGroup
											aria-labelledby={`${id}-starting-direction`}
											value={fix.starting.direction}
											onValueChange={(value) =>
												fix.chooseStartingDirection(value as Direction)
											}
											className="flex gap-4"
										>
											{(["long", "short"] as const).map((value) => (
												<Label
													key={value}
													htmlFor={`${id}-starting-${value}`}
													className="flex items-center gap-2 font-normal capitalize"
												>
													<RadioGroupItem
														id={`${id}-starting-${value}`}
														value={value}
													/>
													{value === "long"
														? "Long (shares held)"
														: "Short (shares owed)"}
												</Label>
											))}
										</RadioGroup>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor={`${id}-quantity`}>Quantity</Label>
										<Input
											id={`${id}-quantity`}
											inputMode="decimal"
											value={fix.starting.quantity}
											onChange={(event) =>
												fix.setStarting({
													...fix.starting,
													quantity: event.target.value,
												})
											}
										/>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor={`${id}-price`}>Average price</Label>
										<Input
											id={`${id}-price`}
											inputMode="decimal"
											placeholder="0.00"
											value={fix.starting.averagePrice}
											onChange={(event) =>
												fix.setStarting({
													...fix.starting,
													averagePrice: event.target.value,
												})
											}
										/>
									</div>
									<div className="col-span-2 space-y-1.5">
										<Label htmlFor={`${id}-date`}>Held at the start of</Label>
										<Input
											id={`${id}-date`}
											type="date"
											value={fix.starting.date}
											onChange={(event) =>
												fix.setStarting({
													...fix.starting,
													date: event.target.value,
												})
											}
										/>
										<p className="text-[11px] text-muted-foreground">
											{fix.shown.deficit > 0
												? `${fix.shown.deficit} is the smallest starting quantity that keeps your position from going negative.`
												: "Use the position shown on your broker statement for that day."}
										</p>
									</div>
								</div>
							)}

							{fix.fix === "merge" && !fix.sameAs && !fix.unanswered && (
								<div className="space-y-2 border-l-2 pl-3">
									<RadioGroup
										aria-label="Existing trade"
										value={fix.targetId}
										onValueChange={fix.setTargetId}
										className="gap-1"
									>
										{fix.eligibleTargets.map((entry) => (
											<Label
												key={entry.id}
												htmlFor={`${id}-target-${entry.id}`}
												className="flex cursor-pointer items-start gap-3 rounded-md p-2 font-normal hover:bg-muted/40"
											>
												<RadioGroupItem
													id={`${id}-target-${entry.id}`}
													value={entry.id}
													className="mt-0.5"
												/>
												<span className="min-w-0 text-xs">
													<span className="block text-sm font-medium capitalize">
														{entry.symbol} · {entry.direction}
													</span>
													<span className="mt-0.5 block text-muted-foreground tabular-nums">
														{[
															tradeDate(entry.openDate, timezone) +
																(entry.closeDate
																	? " – " + tradeDate(entry.closeDate, timezone)
																	: ""),
															entry.sourceKind === "manual"
																? "Journal entry"
																: entry.remainingQuantity &&
																	entry.remainingQuantity + " open",
															entry.realizedNet !== null &&
																money(entry.realizedNet, entry.currency),
														]
															.filter(Boolean)
															.join(" · ")}
													</span>
												</span>
											</Label>
										))}
									</RadioGroup>
								</div>
							)}

							<ResultCard
								fix={fix}
								currency={trade.currency}
								timezone={timezone}
							/>
						</div>
					</ScrollArea>
				</div>
			</ScrollArea>

			{fix.error && (
				<div className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-5 py-3">
					<ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-20">
						<p role="alert" className="text-xs text-destructive">
							{fix.error}
						</p>
					</ScrollArea>
				</div>
			)}

			<DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:justify-between">
				<Button
					type="button"
					variant="outline"
					size="lg"
					className="h-9 px-4"
					disabled={fix.busy}
					onClick={onClose}
				>
					Cancel
				</Button>
				<Button
					type="button"
					size="lg"
					className="h-9 px-4"
					disabled={fix.busy || (!fix.pending && !fix.outcome)}
					onClick={() => void finish()}
				>
					{fix.busy
						? "Applying…"
						: fix.pending
							? "Check confirmation"
							: fix.fix === "starting"
								? "Save starting position"
								: "Confirm fix"}
				</Button>
			</DialogFooter>
		</section>
	);
}

function ResultCard({
	fix,
	currency,
	timezone,
}: {
	fix: ReturnType<typeof useResolveTrade>;
	currency: string | null;
	timezone?: string;
}) {
	return (
		<section aria-live="polite" className="border-t pt-4">
			<h2 className="text-sm font-medium">Result preview</h2>
			{fix.pending ? (
				<p className="mt-2 text-xs text-muted-foreground">
					A confirmation may still be in progress. Check it before making
					another change.
				</p>
			) : fix.previewing ? (
				<div role="status" className="mt-3 space-y-2">
					<span className="sr-only">Calculating the result…</span>
					<Skeleton
						aria-hidden="true"
						className="h-10 w-full motion-reduce:animate-none"
					/>
					<Skeleton
						aria-hidden="true"
						className="h-10 w-full motion-reduce:animate-none"
					/>
				</div>
			) : fix.outcome?.kind === "starting" ? (
				<>
					<ul className="mt-3 divide-y rounded-lg border">
						{fix.outcome.trades.map((trade, index) => (
							<li
								key={trade.openedAt + index}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-xs"
							>
								<span>
									<span className="font-medium capitalize">
										{trade.direction}
									</span>{" "}
									<span className="text-muted-foreground">
										{tradeDate(trade.openedAt, timezone)}
										{trade.closedAt
											? " – " + tradeDate(trade.closedAt, timezone)
											: " · open"}
									</span>
									{trade.startingPosition && (
										<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
											Uses starting position
										</span>
									)}
								</span>
								<span className="tabular-nums">
									{trade.closedAt
										? money(trade.realizedNet, currency)
										: trade.remainingQuantity + " open"}
								</span>
							</li>
						))}
					</ul>
					<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
						Your history is rebuilt into these trades. This trade keeps its
						notes. Remove the starting position any time to undo.
					</p>
				</>
			) : fix.outcome?.kind === "grouping" ? (
				<>
					<ul className="mt-3 divide-y rounded-lg border">
						{fix.outcome.preview.groups.map((group) => (
							<li
								key={group.entryId}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-xs"
							>
								<span>
									<span className="font-medium capitalize">
										{group.direction}
									</span>{" "}
									<span className="text-muted-foreground">
										{group.remainingQuantity === "0"
											? "closed"
											: group.remainingQuantity + " open"}{" "}
										· {money(group.feesPaid, currency)} fees
									</span>
								</span>
								<span className="tabular-nums">
									{money(group.realizedNet, currency)}
								</span>
							</li>
						))}
					</ul>
					<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
						Broker records and notes are preserved. You can undo this from the
						trade's history.
					</p>
				</>
			) : (
				<p className="mt-2 text-xs text-muted-foreground">
					{fix.blocked
						? fix.fix === "starting"
							? "Enter the quantity, average price and date to see the result."
							: fix.fix === "merge"
								? "Choose the trade to merge into."
								: "This fix doesn't balance the history."
						: fix.unanswered
							? "Answer the question above to see the result."
							: "The result appears here."}
				</p>
			)}
		</section>
	);
}
