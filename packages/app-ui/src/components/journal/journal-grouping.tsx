"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
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
import { executionTime, money, quantityMath, tradeDate } from "./journal-format";

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
	mode: "split" | "merge" | "undo";
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
	const [quantities, setQuantities] = React.useState<Record<string, string>>(
		{},
	);
	const [preview, setPreview] = React.useState<flow.GroupingPreview | null>(
		null,
	);
	const [pending, setPending] = React.useState<flow.Command | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [exitIssue, setExitIssue] = React.useState<flow.ExitIssue | null>(
		null,
	);
	const status = useQuery({
		queryKey: ["journal-flow", platform.user.email, workspaceId, "status"],
		queryFn: () => flow.status(fetcher, workspaceId),
		enabled: open,
	});
	const timezone = status.data?.timezone;
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
	const rows = [
		...(executions.data?.flatMap((item) => item.executions) ?? []),
	].sort((a, b) => {
		if (a.executedAt === b.executedAt) return 0;
		if (!a.executedAt) return 1;
		if (!b.executedAt) return -1;
		return new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
	});
	const brokenRow = React.useRef<HTMLTableRowElement>(null);
	React.useEffect(() => {
		brokenRow.current?.scrollIntoView({ block: "nearest" });
	}, [exitIssue]);
	const previewDisabled =
		busy ||
		(mode !== "undo" &&
			(!executions.data || executions.isError || executions.isFetching));
	React.useEffect(() => {
		if (!open) return;
		setError(null);
		setExitIssue(null);
		setBusy(false);
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
		setExitIssue(null);
		try {
			if (mode === "undo") {
				if (!operationId) throw new Error("Choose a grouping change to undo.");
				setPreview(await flow.previewUndo(fetcher, workspaceId, operationId));
			} else {
				const loaded = executions.data;
				if (!loaded?.length)
					throw new Error("Wait for the executions to load.");
				const totals = new Map<string, string>();
				for (const item of loaded)
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
				for (const [transactionId, total] of totals) {
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
					entryIds: loaded.map((item) => item.entry.id),
					groups: [
						{ entryId: entries[0]!.id, allocations: parent },
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
			const issue = flow.exitIssue(reason);
			const exit = rows.find(
				(fill) => fill.transactionId === issue?.transactionId,
			);
			setExitIssue(issue);
			setError(
				issue && exit
					? `This ${exit.side.toLowerCase()} of ${issue.exitQuantity} on ${executionTime(exit, timezone)} is ${issue.shortBy} more than the ${issue.positionBefore} held at that point.`
					: reason instanceof Error
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
						{mode === "split"
							? "Separate a trading idea"
							: mode === "merge"
								? "Combine these trades"
								: "Undo grouping"}
					</DialogTitle>
					<DialogDescription className="mt-1 max-w-lg">
						{preview
							? "Review the resulting positions before confirming."
							: mode === "split"
								? "Allocate quantities to a separate trade. Preview before applying."
								: mode === "merge"
									? "Combine the executions while keeping the first trade’s identity."
									: "Review the original grouping before restoring it."}
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[60dvh]">
					<div className="space-y-5 p-5">
						{error && (
							<p
								role="alert"
								className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
							>
								{error}
							</p>
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
						) : mode === "split" ? (
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
															Date / time
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
															New trade
														</th>
													</tr>
												</thead>
												<tbody>
													{rows.map((fill) => (
														<tr
															key={fill.transactionId}
															ref={
																fill.transactionId === exitIssue?.transactionId
																	? brokenRow
																	: undefined
															}
															aria-invalid={
																fill.transactionId === exitIssue?.transactionId ||
																undefined
															}
															className="border-t border-border/60 aria-invalid:bg-destructive/5"
														>
															<td className="px-3 py-3 text-xs text-muted-foreground">
																{executionTime(fill, timezone)}
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
																<ExecutionHeldBy
																	holders={fill.heldBy}
																	timezone={timezone}
																/>
															</td>
															<td className="px-3 py-3 text-right tabular-nums">
																{money(fill.price, entries[0]?.currency)}
															</td>
															<td className="px-3 py-3 text-right">
																<Input
																	disabled={busy}
																	inputMode="decimal"
																	aria-label={
																		"New trade quantity for " +
																		fill.side +
																		" on " +
																		executionTime(fill, timezone)
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

export function ExecutionHeldBy({
	holders,
	timezone,
}: {
	holders: flow.ExecutionHolder[];
	timezone?: string;
}) {
	const platform = useTradstryPlatform();
	if (!holders.length) return null;
	return (
		<ul className="mt-1 space-y-0.5 text-[11px] font-normal text-muted-foreground">
			{holders.map((holder, index) => {
				const label = `${holder.quantity} in ${holder.blocked ? "a blocked " : "a "}${holder.direction} trade from ${tradeDate(holder.openedAt, timezone)}`;
				return (
					<li key={(holder.entryId ?? "record") + index}>
						{holder.entryId ? (
							<button
								type="button"
								className="underline-offset-2 hover:text-foreground hover:underline"
								onClick={() =>
									platform.navigate(
										"/dashboard/journal/" +
											encodeURIComponent(holder.entryId!),
									)
								}
							>
								{label}
							</button>
						) : (
							label
						)}
					</li>
				);
			})}
		</ul>
	);
}
