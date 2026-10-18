"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	RadioGroup,
	RadioGroupItem,
} from "@tradstry/app-ui/components/ui/radio-group";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
	useAnswerContinuation,
	useJournalStatus,
	useJournalTrades,
	useRefreshJournal,
	useTradeDetail,
} from "@tradstry/app-ui/hooks/journal-review";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { JournalDialogContent } from "./journal-dialog";
import { money, quantityMath, tradeDate } from "./journal-format";
import { useJournalNavigation } from "./journal-navigation";
import { FixTradeHistory } from "./journal-resolve";
import { mergeCandidates } from "./trade/merge-candidates";

type DialogState = { open: boolean; onOpenChange: (open: boolean) => void };

export function suggestedStartingQuantity(held: string, imported: string) {
	try {
		return quantityMath(held, imported, true);
	} catch {
		return undefined;
	}
}

export function FixHistoryDialog({
	workspaceId,
	entryId,
	startingOnly = false,
	suggestedQuantity,
	open,
	onOpenChange,
}: DialogState & {
	workspaceId: string;
	entryId: string;
	startingOnly?: boolean;
	suggestedQuantity?: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<JournalDialogContent className="sm:max-w-5xl">
				{open && (
					<FixHistoryBody
						workspaceId={workspaceId}
						entryId={entryId}
						startingOnly={startingOnly}
						suggestedQuantity={suggestedQuantity}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</JournalDialogContent>
		</Dialog>
	);
}

function FixHistoryBody({
	workspaceId,
	entryId,
	startingOnly,
	suggestedQuantity,
	onClose,
}: {
	workspaceId: string;
	entryId: string;
	startingOnly: boolean;
	suggestedQuantity?: string;
	onClose: () => void;
}) {
	const detail = useTradeDetail(workspaceId, entryId);
	const status = useJournalStatus(workspaceId);
	const refresh = useRefreshJournal(workspaceId);
	const trade = detail.data?.journalTradeV2;
	const title = startingOnly ? "Starting position" : "Fix history";
	if (!trade)
		return (
			<>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{detail.isError ? "This trade could not be loaded." : "Loading the executions…"}
					</DialogDescription>
				</DialogHeader>
				{detail.isError ? (
					<Button variant="outline" className="w-fit" onClick={() => void detail.refetch()}>Retry</Button>
				) : (
					<Skeleton className="h-40 w-full motion-reduce:animate-none" />
				)}
			</>
		);
	return (
		<>
			<DialogHeader>
				<DialogTitle>{title} · {trade.symbol}</DialogTitle>
				<DialogDescription>
					{startingOnly
						? "What you held before your first imported execution. It’s used up by the first trades that sell it."
						: "The executions don’t add up yet. Choose what really happened."}
				</DialogDescription>
			</DialogHeader>
			<FixTradeHistory
				workspaceId={workspaceId}
				trade={trade}
				executions={detail.data!.journalExecutionsV2}
				timezone={status.data?.timezone}
				startingOnly={startingOnly}
				suggestedQuantity={suggestedQuantity}
				onClose={onClose}
				onDone={async () => {
					await refresh();
					toast.success(startingOnly ? "Starting position saved" : "History fixed");
				}}
			/>
		</>
	);
}

export function ContinuationDialog({
	workspaceId,
	suggestion,
	open,
	onOpenChange,
}: DialogState & {
	workspaceId: string;
	suggestion: flow.ContinuationSuggestion;
}) {
	const answer = useAnswerContinuation(workspaceId);
	const timezone = useJournalStatus(workspaceId).data?.timezone;
	const [error, setError] = React.useState<string | null>(null);
	const reply = async (samePosition: boolean) => {
		setError(null);
		try {
			await answer.mutateAsync({
				executionId: suggestion.executionId,
				openingExecutionId: suggestion.openingExecutionId,
				samePosition,
			});
			toast.success(
				samePosition
					? `${suggestion.fromSymbol} and ${suggestion.toSymbol} are one position`
					: `Kept ${suggestion.fromSymbol} and ${suggestion.toSymbol} apart`,
			);
			onOpenChange(false);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not save your answer");
		}
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<JournalDialogContent>
				<DialogHeader>
					<DialogTitle>Same position?</DialogTitle>
					<DialogDescription>
						Only you can say whether these are one holding. Nothing changes until you answer.
					</DialogDescription>
				</DialogHeader>
				<ul className="divide-y rounded-xl border text-sm">
					<li className="flex items-center justify-between gap-3 px-3 py-2.5">
						<span><strong>{suggestion.fromSymbol}</strong> <span className="text-muted-foreground">left open · {suggestion.quantity}</span></span>
					</li>
					<li className="flex items-center justify-between gap-3 px-3 py-2.5">
						<span><strong>{suggestion.toSymbol}</strong> <span className="text-muted-foreground">sells {suggestion.quantity} · {tradeDate(suggestion.executedAt, timezone)}</span></span>
					</li>
				</ul>
				<p className="text-xs text-muted-foreground">{suggestion.explanation}</p>
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
				<DialogFooter>
					<Button variant="outline" disabled={answer.isPending} onClick={() => void reply(false)}>Not the same</Button>
					<Button disabled={answer.isPending} onClick={() => void reply(true)}>Same position</Button>
				</DialogFooter>
			</JournalDialogContent>
		</Dialog>
	);
}

export function DuplicateDialog({
	workspaceId,
	trade,
	open,
	onOpenChange,
}: DialogState & { workspaceId: string; trade: flow.JournalTrade }) {
	const fetcher = useGraphQL();
	const owner = useTradstryPlatform().user.email;
	const { switchTrade } = useJournalNavigation();
	const trades = useJournalTrades(workspaceId);
	const timezone = useJournalStatus(workspaceId).data?.timezone;
	const refresh = useRefreshJournal(workspaceId);
	const [confirming, setConfirming] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const blocking = trade.issueCode === "possible_duplicate";
	const keepSeparate = async () => {
		setSaving(true);
		setError(null);
		try {
			await flow.execute(
				fetcher,
				flow.command(
					flow.KEEP_SEPARATE,
					"keepManualTradeSeparate",
					{ workspaceId, entryId: trade.id, expectedVersion: trade.recordVersion },
					owner,
				),
			);
			await refresh();
			toast.success("Kept as a separate trade");
			onOpenChange(false);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not keep this trade separate");
		} finally {
			setSaving(false);
		}
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<JournalDialogContent>
				<DialogHeader>
					<DialogTitle>Possible duplicate · {trade.symbol}</DialogTitle>
					<DialogDescription>
						{blocking
							? "This trade is left out of your totals until you decide. If it is the broker trade below, merge them; if you made both trades, keep it separate."
							: "Compare these existing entries before recording a separate trade."}
					</DialogDescription>
				</DialogHeader>
				<ul className="divide-y rounded-xl border">
					{(trade.possibleDuplicates ?? []).map((id) => {
						const duplicate = trades.data?.find((entry) => entry.id === id);
						return (
							<li key={id}>
								<button
									type="button"
									className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/40"
									onClick={() => {
										onOpenChange(false);
										switchTrade(id);
									}}
								>
									<span className="font-medium">
										{trade.symbol}
										{duplicate && <span className="ml-2 font-normal capitalize text-muted-foreground">{duplicate.direction}</span>}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums">
										{duplicate
											? [
													tradeDate(duplicate.openDate, timezone) + (duplicate.closeDate ? ` – ${tradeDate(duplicate.closeDate, timezone)}` : ""),
													duplicate.enteredQuantity && `Qty ${duplicate.enteredQuantity}`,
													duplicate.realizedNet !== null && money(duplicate.realizedNet, duplicate.currency),
												].filter(Boolean).join(" · ")
											: trades.isLoading ? "Loading…" : "Existing entry"}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
				<DialogFooter>
					<Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Close</Button>
					{blocking &&
						(confirming ? (
							<>
								<span className="self-center text-xs text-muted-foreground">Both trades will count in every total.</span>
								<Button disabled={saving} onClick={() => void keepSeparate()}>Yes, I made both trades</Button>
							</>
						) : (
							<Button onClick={() => setConfirming(true)}>Keep as a separate trade</Button>
						))}
				</DialogFooter>
			</JournalDialogContent>
		</Dialog>
	);
}

export function MergeWithDialog({
	workspaceId,
	trade,
	open,
	onOpenChange,
	onPick,
}: DialogState & {
	workspaceId: string;
	trade: flow.JournalTrade;
	onPick: (other: flow.JournalTrade) => void;
}) {
	const trades = useJournalTrades(workspaceId);
	const timezone = useJournalStatus(workspaceId).data?.timezone;
	const [pickedId, setPickedId] = React.useState("");
	const others = mergeCandidates(trade, trades.data ?? []);
	const picked = others.find((other) => other.id === pickedId);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<JournalDialogContent>
				<DialogHeader>
					<DialogTitle>Merge {trade.symbol} with…</DialogTitle>
					<DialogDescription>Only trades with the same instrument and direction can be merged.</DialogDescription>
				</DialogHeader>
				{others.length ? (
					<RadioGroup aria-label="Trade to merge with" value={pickedId} onValueChange={setPickedId} className="gap-1">
						{others.map((other) => (
							<Label
								key={other.id}
								htmlFor={`merge-with-${other.id}`}
								className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal"
							>
								<RadioGroupItem id={`merge-with-${other.id}`} value={other.id} />
								<span className="min-w-0 flex-1 text-sm">
									{other.symbol} · {tradeDate(other.closeDate ?? other.openDate, timezone)}
									<span className="block text-xs text-muted-foreground">
										{other.lifecycleState === "open" ? "Open" : "Closed"}
									</span>
								</span>
								<span className="text-sm tabular-nums">{money(other.realizedNet, other.currency)}</span>
							</Label>
						))}
					</RadioGroup>
				) : (
					<p className="text-sm text-muted-foreground">
						No other {trade.symbol} {trade.direction} trades to merge with.
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button disabled={!picked} onClick={() => picked && onPick(picked)}>Continue</Button>
				</DialogFooter>
			</JournalDialogContent>
		</Dialog>
	);
}
