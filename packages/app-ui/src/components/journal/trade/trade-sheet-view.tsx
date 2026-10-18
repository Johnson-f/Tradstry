"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tradstry/app-ui/components/ui/tabs";
import { useJournalEntry } from "@tradstry/app-ui/hooks/journal";
import {
	useJournalStatus,
	useMoveReviewCursor,
	useRefreshJournal,
	useReviewSession,
	useSkipTradeReview,
	useTradeActions,
	useUnjoinActions,
	useUnskipTradeReview,
} from "@tradstry/app-ui/hooks/journal-review";
import type {
	ContinuationSuggestion,
	JournalTrade,
	SkipReason,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { DeleteTrades } from "../delete-trades";
import { EditTrades } from "../edit-trades";
import { SKIP_LABELS } from "../journal-display";
import {
	ContinuationDialog,
	DuplicateDialog,
	FixHistoryDialog,
	MergeWithDialog,
	suggestedStartingQuantity,
} from "../journal-dialogs";
import { GroupingDialog } from "../journal-grouping";
import { itemsForTrade } from "../journal-attention-model";
import { useJournalNavigation } from "../journal-navigation";
import { VIEW_PATHS } from "../journal-route";
import { nextPending, orderedItems } from "../journal-today-model";
import { useJournalAttention } from "../use-journal-attention";
import { defaultTab, footerStep } from "./footer-step";
import { HistoryTab } from "./history-tab";
import { NotesTab } from "./notes-tab";
import { ReviewTab } from "./review-tab";
import { TimelineTab } from "./timeline-tab";
import { TradeAlerts } from "./trade-alerts";
import { type TradeAlert, tradeAlerts } from "./trade-alerts-model";
import { TradeFooter } from "./trade-footer";
import { TradeHeader } from "./trade-header";
import { type MenuAction, TradeMenu } from "./trade-menu";
import type { DetailData, EditorTarget, SheetTab } from "./trade-types";
import { useTradeReview } from "./use-trade-review";

type Dialog =
	| { kind: "split" }
	| { kind: "merge-with" }
	| { kind: "merge"; other: JournalTrade }
	| { kind: "undo"; operationId: string }
	| { kind: "fix" }
	| { kind: "starting"; suggestedQuantity?: string }
	| { kind: "continuation"; suggestion: ContinuationSuggestion }
	| { kind: "duplicate" }
	| { kind: "edit" }
	| { kind: "delete" };

export function TradeSheetView({
	workspaceId,
	data,
	refetch,
	onClose,
	registerEscape,
}: {
	workspaceId: string;
	data: DetailData;
	refetch: () => Promise<DetailData | undefined>;
	onClose: () => void;
	registerEscape: (guard: ((event: Event) => void) | null) => void;
}) {
	const trade = data.journalTradeV2!;
	const nav = useJournalNavigation();
	const status = useJournalStatus(workspaceId);
	const refreshJournal = useRefreshJournal(workspaceId);
	const attention = useJournalAttention(workspaceId);
	const actions = useTradeActions(workspaceId, trade.id, !!trade.episodeId);
	const unjoin = useUnjoinActions(workspaceId);
	const skip = useSkipTradeReview(workspaceId);
	const unskip = useUnskipTradeReview(workspaceId);
	const move = useMoveReviewCursor(workspaceId);
	const session = useReviewSession(workspaceId, nav.queue?.date ?? null, !!nav.queue);
	const legacy = useJournalEntry(trade.sourceKind === "manual" ? trade.id : null);
	const [tab, setTab] = React.useState<SheetTab>(() => defaultTab(trade));
	const [editor, setEditor] = React.useState<EditorTarget | null>(null);
	const [dialog, setDialog] = React.useState<Dialog | null>(null);
	const [editingReview, setEditingReview] = React.useState(false);
	const [notice, setNotice] = React.useState<string | null>(null);
	const body = React.useRef<HTMLDivElement>(null);
	const timezone = status.data?.timezone;
	const readOnly = !!trade.retiredAt || !status.data?.enabled;

	const ordered = React.useMemo(() => orderedItems(session.data?.items ?? []), [session.data?.items]);
	const queueIndex = ordered.findIndex((item) => item.entryId === trade.id);
	const queueItem = ordered[queueIndex];
	const latestSession = React.useRef(session.data);
	latestSession.current = session.data;
	const go = (entryId: string) => {
		const current = latestSession.current;
		if (current)
			move.mutate({ sessionId: current.id, entryId, expectedVersion: current.version });
		nav.switchTrade(entryId);
	};
	const advance = () => {
		const next = nextPending(ordered, trade.id);
		if (next) go(next.entryId);
	};
	const refresh = async () => {
		await refreshJournal();
	};
	const review = useTradeReview({
		workspaceId,
		trade,
		data,
		sessionId: session.data?.id,
		refresh: refetch,
		onChanged: refresh,
		onReviewed: () => {
			toast.success(`${trade.symbol} reviewed`);
			setEditingReview(false);
			advance();
		},
	});

	const previousLegacy = React.useRef(legacy.data);
	React.useEffect(() => {
		if (previousLegacy.current === legacy.data) return;
		if (previousLegacy.current && legacy.data === null) {
			toast.success(`${trade.symbol} deleted`);
			onClose();
		}
		previousLegacy.current = legacy.data;
		void refresh();
	}, [legacy.data]);

	const executionIds = data.journalExecutionsV2.map((execution) => execution.transactionId);
	const scoped = itemsForTrade(attention.items, trade.id, executionIds);
	const alerts = tradeAlerts({
		trade,
		holdings: scoped.holdings.map((item) => item.mismatch),
		continuations: scoped.continuations.map((item) => item.suggestion),
		brokenJoins: actions.data?.brokenJoins ?? [],
	});
	const entryAction = actions.data?.actions.find((action) => action.kind === "entry");

	React.useEffect(() => {
		registerEscape((event) => {
			if (!editor) return;
			event.preventDefault();
			setEditor(null);
		});
		return () => registerEscape(null);
	}, [editor]);

	const closeDialog = () => setDialog(null);
	const act = (alert: TradeAlert) => {
		switch (alert.kind) {
			case "successor":
				return nav.switchTrade(alert.successorId);
			case "history":
				return setDialog({ kind: "fix" });
			case "duplicate":
				return setDialog({ kind: "duplicate" });
			case "holdings":
				return setDialog({
					kind: "starting",
					suggestedQuantity: suggestedStartingQuantity(alert.mismatch.held, alert.mismatch.imported),
				});
			case "continuation":
				return setDialog({ kind: "continuation", suggestion: alert.suggestion });
			case "join":
				return void unjoin
					.mutateAsync({ joinId: alert.joinId })
					.then(() => toast.success("Fills are separate again"))
					.catch((reason) => toast.error(reason instanceof Error ? reason.message : "Could not undo the combine"));
		}
	};
	const select = (action: MenuAction) => {
		switch (action) {
			case "split":
				return setDialog({ kind: "split" });
			case "merge":
				return setDialog({ kind: "merge-with" });
			case "starting":
				return setDialog({ kind: "starting" });
			case "fix":
				return setDialog({ kind: "fix" });
			case "edit":
				return setDialog({ kind: "edit" });
			case "delete":
				return setDialog({ kind: "delete" });
			case "copy":
				return void navigator.clipboard
					.writeText(`${window.location.origin}${VIEW_PATHS.trades}?trade=${encodeURIComponent(trade.id)}`)
					.then(() => toast.success("Link copied"))
					.catch(() => toast.error("Could not copy the link"));
		}
	};
	const skipTrade = async (reason: SkipReason) => {
		try {
			await skip.mutateAsync({ entryId: trade.id, reason, sessionId: session.data?.id ?? null });
			toast(`${trade.symbol} skipped · ${SKIP_LABELS[reason]}`, {
				action: { label: "Undo", onClick: () => void undoSkip() },
			});
			advance();
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : "Could not skip this review");
		}
	};
	const undoSkip = async () => {
		try {
			await unskip.mutateAsync({ entryId: trade.id });
			toast.success(`${trade.symbol} is back to review`);
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : "Could not undo the skip");
		}
	};
	const writeEntryNote = () => {
		setTab("timeline");
		if (entryAction) setEditor({ anchorExecutionId: entryAction.anchorExecutionId, kind: "note" });
	};
	const changeTab = (value: string) => {
		setTab(value as SheetTab);
		body.current?.scrollTo({ top: 0 });
	};
	const step = footerStep({ trade, tab, editingReview, readOnly });
	const queue =
		nav.queue && queueIndex >= 0 && session.data
			? {
					index: queueIndex,
					total: ordered.length,
					date: session.data.date,
					onPrevious: () => go(ordered[queueIndex - 1]!.entryId),
					onNext: () => go(ordered[queueIndex + 1]!.entryId),
				}
			: null;
	const error = review.error ?? notice;

	return (
		<Tabs value={tab} onValueChange={changeTab} className="min-h-0 flex-1 gap-0">
			<div className="shrink-0 space-y-3 border-b px-4 pt-4 pb-2 md:px-5">
				<TradeHeader
					trade={trade}
					timezone={timezone}
					hasReviewWork={review.hasReviewWork}
					skipReason={queueItem?.skipReason ?? null}
					queue={queue}
					onClose={onClose}
					menu={<TradeMenu trade={trade} readOnly={readOnly} onSelect={select} />}
				/>
				<TradeAlerts alerts={alerts} readOnly={readOnly} busy={unjoin.isPending} onAct={act} />
				<TabsList variant="line" aria-label="Trade sections">
					<TabsTrigger value="timeline">Timeline</TabsTrigger>
					<TabsTrigger value="review">Review</TabsTrigger>
					<TabsTrigger value="notes">Notes</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
				</TabsList>
			</div>
			<ScrollArea viewportRef={body} data-vaul-no-drag className="min-h-0 flex-1 px-4 py-4 md:px-5">
				{error && (
					<div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm">
						<p className="text-destructive">{error}</p>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								review.setError(null);
								setNotice(null);
							}}
						>
							Dismiss
						</Button>
					</div>
				)}
				<TabsContent value="timeline">
					<TimelineTab
						workspaceId={workspaceId}
						trade={trade}
						data={data}
						timezone={timezone}
						readOnly={readOnly}
						editor={editor}
						onEdit={setEditor}
						onChanged={refresh}
					/>
				</TabsContent>
				<TabsContent value="review">
					<ReviewTab
						workspaceId={workspaceId}
						trade={trade}
						data={data}
						review={review}
						timezone={timezone}
						readOnly={readOnly}
						locked={trade.reviewState === "reviewed" && !editingReview}
						onFixHistory={() => setDialog({ kind: "fix" })}
					/>
				</TabsContent>
				<TabsContent value="notes">
					<NotesTab
						workspaceId={workspaceId}
						entryId={trade.id}
						noteId={data.journalContextV2.noteId}
						readOnly={readOnly}
						refresh={refetch}
						onError={setNotice}
					/>
				</TabsContent>
				<TabsContent value="history">
					<HistoryTab
						trade={trade}
						data={data}
						readOnly={readOnly}
						onUndo={(operationId) => setDialog({ kind: "undo", operationId })}
					/>
				</TabsContent>
			</ScrollArea>
			<div className="flex shrink-0 items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
				<TradeFooter
					step={step}
					skipReason={queueItem?.skipReason ?? null}
					readOnlyReason={trade.retiredAt ? "This earlier grouping is kept as a record." : "Turn on your automatic journal to change this trade."}
					marking={review.marking}
					pendingReview={review.pendingReview}
					reviewAgainLabel={trade.reviewState === "outdated" ? "Review again" : "Update review"}
					canMark={!readOnly && (review.pendingReview || !!review.draft.value.takeaway.trim())}
					busy={skip.isPending || unskip.isPending}
					onFixHistory={() => setDialog({ kind: "fix" })}
					onWriteEntryNote={writeEntryNote}
					onWriteReview={() => changeTab("review")}
					onMarkReviewed={() => void review.markReviewed()}
					onEditReview={() => {
						setEditingReview(true);
						changeTab("review");
					}}
					onSkip={(reason) => void skipTrade(reason)}
					onUndoSkip={() => void undoSkip()}
				/>
			</div>
			{dialog?.kind === "split" && (
				<GroupingDialog
					open
					onOpenChange={(open) => !open && closeDialog()}
					workspaceId={workspaceId}
					entries={[trade]}
					mode="split"
					onDone={async () => {
						await refresh();
						toast.success(`Split into 2 ${trade.symbol} trades`);
					}}
				/>
			)}
			{dialog?.kind === "merge-with" && (
				<MergeWithDialog
					open
					onOpenChange={(open) => !open && closeDialog()}
					workspaceId={workspaceId}
					trade={trade}
					onPick={(other) => setDialog({ kind: "merge", other })}
				/>
			)}
			{dialog?.kind === "merge" && (
				<GroupingDialog
					open
					onOpenChange={(open) => !open && closeDialog()}
					workspaceId={workspaceId}
					entries={[trade, dialog.other]}
					mode="merge"
					onDone={async () => {
						await refresh();
						toast.success(`Merged into 1 ${trade.symbol} trade`);
					}}
				/>
			)}
			{dialog?.kind === "undo" && (
				<GroupingDialog
					open
					onOpenChange={(open) => !open && closeDialog()}
					workspaceId={workspaceId}
					entries={[trade]}
					mode="undo"
					operationId={dialog.operationId}
					onDone={async () => {
						await refresh();
						toast.success("Change undone");
					}}
				/>
			)}
			{dialog?.kind === "fix" && (
				<FixHistoryDialog open onOpenChange={(open) => !open && closeDialog()} workspaceId={workspaceId} entryId={trade.id} />
			)}
			{dialog?.kind === "starting" && (
				<FixHistoryDialog
					open
					onOpenChange={(open) => !open && closeDialog()}
					workspaceId={workspaceId}
					entryId={trade.id}
					startingOnly
					suggestedQuantity={dialog.suggestedQuantity}
				/>
			)}
			{dialog?.kind === "continuation" && (
				<ContinuationDialog open onOpenChange={(open) => !open && closeDialog()} workspaceId={workspaceId} suggestion={dialog.suggestion} />
			)}
			{dialog?.kind === "duplicate" && (
				<DuplicateDialog open onOpenChange={(open) => !open && closeDialog()} workspaceId={workspaceId} trade={trade} />
			)}
			{dialog?.kind === "edit" && legacy.data && (
				<EditTrades trade={legacy.data} open onOpenChange={(open) => !open && closeDialog()} />
			)}
			{dialog?.kind === "delete" && legacy.data && (
				<DeleteTrades trade={legacy.data} open onOpenChange={(open) => !open && closeDialog()} />
			)}
		</Tabs>
	);
}
