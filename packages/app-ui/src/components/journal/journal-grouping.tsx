"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@tradstry/app-ui/components/ui/toggle-group";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowUp01Icon,
	ArrowDown01Icon,
	Tick02Icon,
	Alert02Icon,
} from "@hugeicons/core-free-icons";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@tradstry/app-ui/components/ui/dialog";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { money, quantityMath, tradeDate } from "./journal-format";

export function GroupingDialog({
	open,
	onOpenChange,
	workspaceId,
	entries,
	mode,
	operationId,
	suggestionId,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	entries: flow.JournalTrade[];
	mode: "split" | "merge" | "undo" | "resolve";
	operationId?: string;
	suggestionId?: string;
	onDone: () => void | Promise<void>;
}) {
	const fetcher = useGraphQL();
	const platform = useTradstryPlatform();
	const selection = entries
		.map((entry) => entry.id)
		.sort()
		.join("|");
	const storageKey = `tradstry:journal-grouping:${platform.user.email}:${workspaceId}:${mode}:${operationId ?? suggestionId ?? selection}`;
	const [distinct, setDistinct] = React.useState(false);
	const [direction, setDirection] = React.useState("");
	const [targetId, setTargetId] = React.useState("");
	const [order, setOrder] = React.useState<string[]>([]);
	const targets = useQuery({
		queryKey: [
			"journal-flow",
			platform.user.email,
			workspaceId,
			"resolve-targets",
		],
		queryFn: () => flow.trades(fetcher, workspaceId),
		enabled: open && mode === "resolve",
	});
	const [quantities, setQuantities] = React.useState<Record<string, string>>(
		{},
	);
	const [preview, setPreview] = React.useState<flow.GroupingPreview | null>(
		null,
	);
	const [pending, setPending] = React.useState<flow.Command | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const executions = useQuery({
		queryKey: [
			"journal-flow",
			platform.user.email,
			workspaceId,
			"grouping-source",
			selection,
		],
		queryFn: async () =>
			Promise.all(
				entries.map(async (entry) => ({
					entry,
					executions: (await flow.detail(fetcher, workspaceId, entry.id))
						.journalExecutionsV2,
				})),
			),
		enabled: open && mode !== "undo" && entries.length > 0,
	});
	const duplicateId = React.useId();
	const eligibleTargets = (targets.data ?? []).filter(
		(entry) =>
			((entry.episodeId &&
				entry.symbol === entries[0]?.symbol &&
				entry.lifecycleState === "open") ||
				entries.some((selected) =>
					selected.possibleDuplicates?.includes(entry.id),
				)) &&
			!entries.some((selected) => selected.id === entry.id),
	);
	const selectedTarget = eligibleTargets.find((entry) => entry.id === targetId);
	const targetHasDirection =
		selectedTarget && ["long", "short"].includes(selectedTarget.direction);
	const chosenDirection = targetHasDirection
		? selectedTarget.direction
		: direction;
	const rows = [
		...(executions.data?.flatMap((item) => item.executions) ?? []),
	].sort((a, b) => {
		if (a.executedAt !== b.executedAt) {
			if (!a.executedAt) return 1;
			if (!b.executedAt) return -1;
			return (
				new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
			);
		}
		const ai = order.indexOf(a.transactionId),
			bi = order.indexOf(b.transactionId);
		return (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi);
	});
	const noAvailableQuantity =
		mode === "resolve" &&
		!!executions.data &&
		!executions.isError &&
		!rows.some((fill) => Number(fill.quantity) > 0);
	const needsDistinctConfirmation =
		mode === "resolve" &&
		entries.some((entry) => entry.possibleDuplicates?.length) &&
		!entries.some((entry) => entry.possibleDuplicates?.includes(targetId));
	const canMove = (index: number, offset: number) => {
		const current = rows[index],
			neighbor = rows[index + offset];
		return !!current?.executedAt && current.executedAt === neighbor?.executedAt;
	};
	const moveExecution = (index: number, offset: number) => {
		if (!canMove(index, offset)) return;
		const ids = rows.map((fill) => fill.transactionId);
		[ids[index], ids[index + offset]] = [ids[index + offset]!, ids[index]!];
		setOrder(ids);
	};
	const executionTime = (fill: flow.Execution) =>
		fill.executedAt && fill.precision === "timestamp"
			? new Intl.DateTimeFormat(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(new Date(fill.executedAt))
			: tradeDate(fill.executedAt);
	const previewDisabled =
		busy ||
		(mode !== "undo" &&
			(!executions.data || executions.isError || executions.isFetching)) ||
		(mode === "resolve" &&
			(noAvailableQuantity ||
				!["long", "short"].includes(chosenDirection) ||
				(needsDistinctConfirmation && !distinct) ||
				(!!targetId && !selectedTarget)));
	React.useEffect(() => {
		if (!open) return;
		setError(null);
		setBusy(false);
		setDistinct(false);
		setDirection("");
		setTargetId("");
		setOrder([]);
		setQuantities({});
		setPreview(null);
		setPending(null);
		let cancelled = false;
		try {
			const cached = localStorage.getItem(storageKey);
			if (cached) {
				const value = JSON.parse(cached) as {
					preview: flow.GroupingPreview;
					command: flow.Command;
				};
				setPreview(value.preview);
				setPending(value.command);
			} else if (suggestionId) {
				setBusy(true);
				void flow
					.previewSuggestion(fetcher, workspaceId, suggestionId)
					.then((value) => {
						if (cancelled) return;
						setPreview(value);
						const child = value.groups.find(
							(group) => !entries.some((entry) => entry.id === group.entryId),
						);
						if (child)
							setQuantities(
								Object.fromEntries(
									child.allocations.map((fill) => [
										fill.transactionId,
										fill.quantity,
									]),
								),
							);
					})
					.catch((reason) => {
						if (!cancelled)
							setError(
								reason instanceof Error
									? reason.message
									: "Suggestion unavailable",
							);
					})
					.finally(() => {
						if (!cancelled) setBusy(false);
					});
			}
		} catch {
			setError(
				"The previous preview could not be restored. Create a new preview.",
			);
		}
		return () => {
			cancelled = true;
		};
	}, [open, storageKey]);
	const makePreview = async () => {
		setBusy(true);
		setError(null);
		try {
			if (
				mode === "resolve" &&
				entries.some((entry) => entry.possibleDuplicates?.length) &&
				!entries.some((entry) =>
					entry.possibleDuplicates?.includes(targetId),
				) &&
				!distinct
			)
				throw new Error(
					"Compare the existing entries and confirm this is a separate trade first.",
				);
			if (mode === "undo") {
				if (!operationId) throw new Error("Choose a grouping change to undo.");
				setPreview(await flow.previewUndo(fetcher, workspaceId, operationId));
			} else {
				const loaded = executions.data;
				if (!loaded?.length)
					throw new Error("Wait for the executions to load.");
				if (noAvailableQuantity)
					throw new Error(
						"No quantity is available to assign. Refresh the executions or check your broker history.",
					);
				if (targetId && !selectedTarget)
					throw new Error("Choose an available target trade.");
				const target = targetId
					? targets.data?.find((entry) => entry.id === targetId)
					: undefined;
				const chosenDirection =
					target && ["long", "short"].includes(target.direction)
						? target.direction
						: direction;
				if (mode === "resolve" && !["long", "short"].includes(chosenDirection))
					throw new Error(
						"Choose long or short to confirm your position history.",
					);
				const sources = [...loaded];
				if (target)
					sources.push({
						entry: target,
						executions: (await flow.detail(fetcher, workspaceId, target.id))
							.journalExecutionsV2,
					});
				const totals = new Map<string, string>();
				for (const item of sources)
					for (const execution of item.executions)
						totals.set(
							execution.transactionId,
							quantityMath(
								totals.get(execution.transactionId) ?? "0",
								execution.quantity,
							),
						);
				const parent: { transactionId: string; quantity: string }[] = [];
				const child: { transactionId: string; quantity: string }[] = [];
				for (const [transactionId, total] of [...totals].sort(([a], [b]) => {
					const ai = order.indexOf(a),
						bi = order.indexOf(b);
					return (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi);
				})) {
					const amount =
						mode === "split" ? quantities[transactionId]?.trim() || "0" : "0";
					const remaining = quantityMath(total, amount, true);
					if (remaining !== "0")
						parent.push({ transactionId, quantity: remaining });
					if (amount !== "0" && Number(amount) > 0)
						child.push({ transactionId, quantity: amount });
				}
				if (mode === "split" && (!child.length || !parent.length))
					throw new Error(
						"Allocate some executions to a new trade and keep some in the original.",
					);
				const input = {
					direction: mode === "resolve" ? chosenDirection : undefined,
					entryIds: sources.map((item) => item.entry.id),
					groups: [
						{ entryId: target?.id ?? entries[0]!.id, allocations: parent },
						...(mode === "split"
							? [{ entryId: null, allocations: child }]
							: []),
					],
				};
				setPreview(
					suggestionId
						? await flow.previewSuggestion(
								fetcher,
								workspaceId,
								suggestionId,
								input,
							)
						: await flow.previewGrouping(fetcher, workspaceId, input),
				);
			}
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Could not build the preview",
			);
		} finally {
			setBusy(false);
		}
	};
	const confirm = async () => {
		if (!preview) return;
		const request =
			pending ??
			flow.command(
				flow.CONFIRM_GROUPING,
				"confirmJournalGrouping",
				{ workspaceId, token: preview.token },
				platform.user.email,
			);
		setPending(request);
		localStorage.setItem(
			storageKey,
			JSON.stringify({ preview, command: request }),
		);
		setBusy(true);
		setError(null);
		try {
			await flow.execute<flow.GroupingResult>(fetcher, request);
			localStorage.removeItem(storageKey);
			setPending(null);
			await onDone();
			onOpenChange(false);
		} catch (reason) {
			const message =
				reason instanceof Error
					? reason.message
					: "Confirmation is still pending. Retry to check its result.";
			setError(message);
			if (
				message.includes("REPREVIEW_REQUIRED") ||
				message.includes("PREVIEW_ALREADY_USED")
			) {
				localStorage.removeItem(storageKey);
				setPending(null);
				setPreview(null);
			}
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
				<DialogHeader className="shrink-0 border-b px-5 py-5 pr-14">
					<DialogTitle>
						{mode === "resolve"
							? "Resolve position history"
							: mode === "split"
								? "Separate a trading idea"
								: mode === "merge"
									? "Combine these trades"
									: "Undo grouping"}
					</DialogTitle>
					<DialogDescription className="mt-1 max-w-lg">
						{preview
							? "Review the resulting positions before confirming."
							: mode === "resolve"
								? "Choose where these executions belong, then preview the result."
								: mode === "split"
									? "Allocate quantities to a separate trade. Preview before applying."
									: mode === "merge"
										? "Combine the executions while keeping the first trade’s identity."
										: "Review the original grouping before restoring it."}
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[60dvh] [&>[data-slot=scroll-area-viewport]>div]:block!">
					<div className="space-y-5 p-5">
						{error && (
							<p
								role="alert"
								className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
							>
								{error}
							</p>
						)}
						{!preview && mode === "resolve" && (
							<>
								<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-3">
									<div className="min-w-0">
										<p className="text-sm font-semibold">
											{entries[0]?.symbol}
										</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{entries[0]?.symbolName}
										</p>
									</div>
									<span className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
										Needs attention
									</span>
								</div>
								{noAvailableQuantity ? (
									<div
										role="status"
										className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
									>
										<div className="flex items-start gap-2">
											<HugeiconsIcon
												icon={Alert02Icon}
												className="mt-0.5 size-4 shrink-0 text-amber-600"
												aria-hidden="true"
											/>
											<div>
												<p className="text-sm font-medium">
													No quantity available to assign
												</p>
												<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
													These records currently show zero available quantity.
													Refresh them or check the original broker history
													before continuing.
												</p>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="mt-3"
													disabled={executions.isFetching}
													onClick={() => void executions.refetch()}
												>
													{executions.isFetching
														? "Refreshing…"
														: "Refresh executions"}
												</Button>
											</div>
										</div>
									</div>
								) : (
									entries[0]?.issueMessage && (
										<p className="rounded-lg bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
											{entries[0].issueMessage}
										</p>
									)
								)}
								<div className="space-y-2">
									<Label htmlFor={duplicateId + "-target"}>
										Assign executions to
									</Label>
									<Select
										value={targetId || "__current__"}
										disabled={busy || noAvailableQuantity}
										onValueChange={(value) =>
											setTargetId(value === "__current__" ? "" : value)
										}
									>
										<SelectTrigger
											id={duplicateId + "-target"}
											className="h-10 w-full bg-background"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__current__">
												Keep as this trade
											</SelectItem>
											{eligibleTargets.map((entry) => (
												<SelectItem key={entry.id} value={entry.id}>
													{entry.symbol} · {entry.direction} ·{" "}
													{tradeDate(entry.openDate)} ·{" "}
													{entry.sourceKind === "manual"
														? "Existing journal entry"
														: entry.remainingQuantity + " remaining"}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{targets.isError ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => void targets.refetch()}
										>
											Retry loading existing trades
										</Button>
									) : (
										<p className="text-[11px] text-muted-foreground">
											{targets.isLoading
												? "Checking for matching trades…"
												: eligibleTargets.length
													? "Or attach them to an existing position or journal entry."
													: "No matching existing trades are available."}
										</p>
									)}
								</div>
								{!targetHasDirection ? (
									<div className="space-y-2">
										<Label id={duplicateId + "-direction"}>
											Position direction
										</Label>
										<ToggleGroup
											type="single"
											spacing={2}
											value={direction}
											disabled={busy || noAvailableQuantity}
											onValueChange={setDirection}
											aria-labelledby={duplicateId + "-direction"}
											className="grid w-full grid-cols-2 gap-3"
										>
											{[
												{
													value: "long",
													label: "Long",
													hint: "Buy → sell",
													icon: ArrowUp01Icon,
												},
												{
													value: "short",
													label: "Short",
													hint: "Sell → buy",
													icon: ArrowDown01Icon,
												},
											].map((choice) => (
												<ToggleGroupItem
													key={choice.value}
													value={choice.value}
													className={cn(
														"h-auto min-h-16 min-w-0 justify-start gap-3 rounded-lg border border-border px-3 py-3 text-left",
														choice.value === "long"
															? "data-[state=on]:border-emerald-500/40 data-[state=on]:bg-emerald-500/5 aria-pressed:bg-emerald-500/5"
															: "data-[state=on]:border-rose-500/40 data-[state=on]:bg-rose-500/5 aria-pressed:bg-rose-500/5",
													)}
												>
													<span
														className={cn(
															"hidden size-8 shrink-0 items-center justify-center rounded-md sm:flex",
															choice.value === "long"
																? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
																: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
														)}
													>
														<HugeiconsIcon
															icon={choice.icon}
															className="size-4"
															aria-hidden="true"
														/>
													</span>
													<span className="min-w-0">
														<span className="block text-sm font-medium">
															{choice.label}
														</span>
														<span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
															{choice.hint}
														</span>
													</span>
													<HugeiconsIcon
														icon={Tick02Icon}
														className={cn(
															"ml-auto size-4",
															direction !== choice.value && "invisible",
														)}
														aria-hidden="true"
													/>
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										Uses the existing trade’s{" "}
										<span className="font-medium text-foreground">
											{selectedTarget?.direction}
										</span>{" "}
										direction.
									</p>
								)}
							</>
						)}
						{preview ? (
							<>
								<div className="rounded-lg bg-muted/40 p-3">
									<h3 className="text-xs font-medium">Before this change</h3>
									{preview.beforeGroups.length ? (
										preview.beforeGroups.map((group) => (
											<p
												key={group.entryId}
												className="mt-1 text-xs text-muted-foreground"
											>
												{group.direction} · {group.remainingQuantity} remaining
												· {money(group.realizedNet, entries[0]?.currency)}{" "}
												realized
											</p>
										))
									) : (
										<p className="mt-1 text-xs text-muted-foreground">
											Unresolved execution history
										</p>
									)}
								</div>
								<div className="space-y-3">
									<h3 className="text-sm font-medium">After this change</h3>
									<div className="grid gap-3 sm:grid-cols-2">
										{preview.groups.map((group) => (
											<div
												key={group.entryId}
												className="rounded-lg border p-4"
											>
												<div className="flex items-center justify-between gap-2">
													<p className="text-xs font-medium">
														{entries.some((entry) => entry.id === group.entryId)
															? "Original trade"
															: mode === "undo"
																? "Restored trade"
																: selectedTarget?.id === group.entryId
																	? "Existing trade"
																	: "New trade"}
													</p>
													<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize">
														{group.direction}
													</span>
												</div>
												<p className="mt-3 text-xl font-semibold tabular-nums">
													{money(group.realizedNet, entries[0]?.currency)}
												</p>
												<p className="mt-0.5 text-[11px] text-muted-foreground">
													Realized net
												</p>
												<dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
													<div>
														<dt className="text-muted-foreground">Open quantity</dt>
														<dd className="mt-1 tabular-nums">
															{group.remainingQuantity}
														</dd>
													</div>
													<div>
														<dt className="text-muted-foreground">Fees</dt>
														<dd className="mt-1 tabular-nums">
															{money(group.feesPaid, entries[0]?.currency)}
														</dd>
													</div>
												</dl>
												<details className="mt-3 border-t pt-3">
													<summary className="cursor-pointer text-xs text-muted-foreground">
														View allocations ({group.allocations.length})
													</summary>
													<ul className="mt-3 space-y-2 text-xs">
														{group.allocations.map((fill) => (
															<li
																key={fill.transactionId}
																className="space-y-1"
															>
																<p className="text-muted-foreground">
																	{tradeDate(fill.executedAt)} · {fill.role}
																</p>
																<p className="tabular-nums">
																	{fill.quantity} at{" "}
																	{money(fill.price, entries[0]?.currency)} ·{" "}
																	{money(fill.fee, entries[0]?.currency)} fee
																</p>
															</li>
														))}
													</ul>
												</details>
											</div>
										))}
									</div>
								</div>
								<p className="text-xs leading-relaxed text-muted-foreground">
									Grouping changes can change each trade’s realized result.
									Broker records and existing notes are preserved. Affected
									reviews become outdated.
								</p>
							</>
						) : mode === "resolve" || mode === "split" ? (
							<section className="space-y-2" aria-label="Executions to group">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-medium">Executions</h3>
									{executions.data && (
										<span className="text-[11px] text-muted-foreground">
											{rows.length} records
										</span>
									)}
								</div>
								{executions.isLoading ? (
									<div
										role="status"
										className="space-y-2 rounded-lg border p-3"
									>
										<span className="sr-only">Loading executions…</span>
										{[0, 1, 2].map((key) => (
											<Skeleton
												key={key}
												aria-hidden="true"
												className="h-10 w-full motion-reduce:animate-none"
											/>
										))}
									</div>
								) : executions.isError ? (
									<div role="alert" className="rounded-lg border p-4 text-sm">
										<p>Executions could not be loaded.</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="mt-2"
											onClick={() => void executions.refetch()}
										>
											Retry
										</Button>
									</div>
								) : (
									<div className="overflow-hidden rounded-lg border">
										<ScrollArea orientation="horizontal">
											<table className="w-full min-w-[520px] text-sm">
												<thead className="bg-muted/40 text-[11px] text-muted-foreground">
													<tr>
														<th className="px-3 py-2.5 text-left font-medium">
															Date / time (local)
														</th>
														<th className="px-3 py-2.5 text-left font-medium">
															Side
														</th>
														<th className="px-3 py-2.5 text-right font-medium">
															Available
														</th>
														<th className="px-3 py-2.5 text-right font-medium">
															Price
														</th>
														<th className="px-3 py-2.5 text-right font-medium">
															{mode === "split" ? "New trade" : "Order"}
														</th>
													</tr>
												</thead>
												<tbody>
													{rows.map((fill, index) => (
														<tr
															key={fill.transactionId}
															className="border-t border-border/60"
														>
															<td className="px-3 py-3 text-xs text-muted-foreground">
																{executionTime(fill)}
															</td>
															<td className="px-3 py-3">
																<span
																	className={cn(
																		"rounded-md px-1.5 py-1 text-[10px] font-medium",
																		fill.side.startsWith("BUY")
																			? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
																			: fill.side.startsWith("SELL")
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
																title={
																	"Broker quantity: " + fill.sourceQuantity
																}
															>
																{fill.quantity}
															</td>
															<td className="px-3 py-3 text-right tabular-nums">
																{money(fill.price, entries[0]?.currency)}
															</td>
															<td className="px-3 py-3 text-right">
																{mode === "split" ? (
																	<Input
																		disabled={busy}
																		inputMode="decimal"
																		aria-label={
																			"New trade quantity for " +
																			fill.side +
																			" on " +
																			executionTime(fill)
																		}
																		value={quantities[fill.transactionId] ?? ""}
																		placeholder="0"
																		onChange={(event) =>
																			setQuantities({
																				...quantities,
																				[fill.transactionId]:
																					event.target.value,
																			})
																		}
																		className="ml-auto h-8 w-24 text-right"
																	/>
																) : (
																	<div className="flex justify-end gap-1">
																		<Button
																			type="button"
																			variant="ghost"
																			size="icon-sm"
																			aria-label={
																				"Move execution " + (index + 1) + " up"
																			}
																			title="Move earlier within the same recorded time"
																			disabled={
																				busy ||
																				noAvailableQuantity ||
																				!canMove(index, -1)
																			}
																			onClick={() => moveExecution(index, -1)}
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
																			aria-label={
																				"Move execution " +
																				(index + 1) +
																				" down"
																			}
																			title="Move later within the same recorded time"
																			disabled={
																				busy ||
																				noAvailableQuantity ||
																				!canMove(index, 1)
																			}
																			onClick={() => moveExecution(index, 1)}
																		>
																			<HugeiconsIcon
																				icon={ArrowDown01Icon}
																				className="size-3.5"
																				aria-hidden="true"
																			/>
																		</Button>
																	</div>
																)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</ScrollArea>
										{!rows.length && (
											<p className="px-3 py-5 text-center text-xs text-muted-foreground">
												No executions are available.
											</p>
										)}
									</div>
								)}
								{mode === "resolve" && (
									<p className="text-[11px] leading-relaxed text-muted-foreground">
										Only executions with the same recorded time can be
										reordered. Import missing earlier executions before
										confirming a position.
									</p>
								)}
							</section>
						) : (
							<div className="space-y-2">
								{entries.map((entry) => (
									<div
										key={entry.id}
										className="flex items-center justify-between rounded-lg border p-3"
									>
										<div>
											<p className="text-sm font-medium">{entry.symbol}</p>
											<p className="mt-0.5 text-xs capitalize text-muted-foreground">
												{entry.direction} · {tradeDate(entry.openDate)}
											</p>
										</div>
										<span className="text-sm tabular-nums">
											{money(entry.realizedNet, entry.currency)}
										</span>
									</div>
								))}
							</div>
						)}
						{needsDistinctConfirmation && !preview && (
							<div className="flex items-start gap-2 rounded-lg border p-3">
								<Checkbox
									id={duplicateId}
									checked={distinct}
									disabled={busy || noAvailableQuantity}
									onCheckedChange={(checked) => setDistinct(checked === true)}
								/>
								<Label
									htmlFor={duplicateId}
									className="text-xs leading-relaxed font-normal"
								>
									I compared the existing entries. These executions belong to a
									separate trade.
								</Label>
							</div>
						)}
					</div>
				</ScrollArea>
				<DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-4">
					{preview && !pending && (
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => setPreview(null)}
						>
							Adjust
						</Button>
					)}
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					{preview ? (
						<Button
							type="button"
							disabled={busy}
							onClick={() => void confirm()}
						>
							{busy
								? "Applying…"
								: pending
									? "Check confirmation"
									: "Confirm change"}
						</Button>
					) : (
						<Button
							type="button"
							disabled={previewDisabled}
							onClick={() => void makePreview()}
						>
							{busy ? "Preparing…" : "Preview change"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
