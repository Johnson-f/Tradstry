"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@tradstry/app-ui/components/ui/tabs";
import { TradeFormField as Field, TradeFieldHelp } from "./trade-form-field";
import { TagPicker } from "./tag-picker";
import { PrinciplePicker } from "./principle-picker";
import { ArrowDown01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RiskOutcomePanel } from "@tradstry/app-ui/components/trade-review/risk-outcome";
import { useTagCategories, useAllTags } from "@tradstry/app-ui/hooks/tags";
import { usePrinciples } from "@tradstry/app-ui/hooks/principle";
import {
	usePositionCalculatorPlans,
	useTradeReviewInbox,
	useTradeReviewPreview,
	useConfirmTradeMatch,
} from "@tradstry/app-ui/hooks/position-calculator";
import type { TradeReviewMatchSuggestion } from "@tradstry/app-ui/lib/types/position-calculator";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { NotebookEditor } from "@tradstry/app-ui/components/notebook/editor";
import {
	useNotebookNote,
	useUploadNotebookMedia,
	useDeleteNotebookMedia,
} from "@tradstry/app-ui/hooks/notebook";
import { usePlaybooks } from "@tradstry/app-ui/hooks/playbook";
import { useJournalSave } from "@tradstry/app-ui/hooks/journal-flow-save";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { GroupingDialog } from "./journal-grouping";
import { money, tradeDate } from "./journal-format";
import { JournalSuggestions } from "./journal-suggestions";
import { JournalChart } from "./journal-chart";
import { EditTrades } from "./edit-trades";
import { DeleteTrades } from "./delete-trades";
import { useJournalEntry } from "@tradstry/app-ui/hooks/journal";

const STOP_PRICE_ERROR = "Enter a positive stop price, or choose Not recorded.";
const tagHelp: Record<string, string> = {
	mistakes: "Errors you made during this trade.",
	tactics: "Actions you used to manage this trade.",
	edges: "Advantages that supported this trade.",
};
function validateStop(value: { stopState: string; stopPrice: string | null }) {
	return value.stopState === "price" &&
		(!value.stopPrice ||
			!/^\d+(?:\.\d{1,28})?$/.test(value.stopPrice) ||
			Number(value.stopPrice) <= 0)
		? STOP_PRICE_ERROR
		: null;
}

type DetailData = Awaited<ReturnType<typeof flow.detail>>;
type Props = {
	workspaceId: string;
	entryId: string;
	sessionId?: string;
	embedded?: boolean;
	inDialog?: boolean;
	onBack?: () => void;
	onChanged: () => void | Promise<void>;
	onReviewed?: () => void | Promise<void>;
};

export function TradeDetail(props: Props) {
	const fetcher = useGraphQL();
	const platform = useTradstryPlatform();
	const detail = useQuery({
		queryKey: [
			"journal-flow",
			platform.user.email,
			props.workspaceId,
			"detail",
			props.entryId,
		],
		queryFn: () => flow.detail(fetcher, props.workspaceId, props.entryId),
		refetchInterval: 15_000,
	});
	if (detail.isLoading)
		return (
			<TradeDetailSkeleton
				embedded={props.embedded}
				inDialog={props.inDialog}
				review={!!props.sessionId}
				hasBack={!!props.onBack}
			/>
		);
	if (detail.isError || !detail.data?.journalTradeV2)
		return (
			<div className="p-8">
				<p>This trade could not be loaded.</p>
				<div className="mt-3 flex gap-2">
					<Button variant="outline" onClick={() => void detail.refetch()}>
						Retry
					</Button>
					{props.onBack && (
						<Button variant="ghost" onClick={props.onBack}>
							Back to trades
						</Button>
					)}
				</div>
			</div>
		);
	return (
		<TradeEditor
			{...props}
			data={detail.data}
			refresh={async () => (await detail.refetch()).data}
		/>
	);
}

export function TradeDetailSkeleton({
	embedded,
	inDialog,
	review,
	hasBack,
}: {
	embedded?: boolean;
	review: boolean;
	inDialog?: boolean;
	hasBack: boolean;
}) {
	return (
		<div
			role="status"
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
				!embedded && "p-3 md:p-5",
			)}
		>
			<span className="sr-only">Loading trade…</span>
			<div
				aria-hidden="true"
				className="flex min-h-0 flex-1 flex-col gap-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
			>
				<div
					className={cn(
						"flex shrink-0 items-start justify-between gap-4",
						inDialog && "pr-10",
					)}
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2.5">
							{hasBack && <Skeleton className="size-8 shrink-0" />}
							<Skeleton className="h-7 w-72 max-w-[70%]" />
							<Skeleton className="h-6 w-12" />
						</div>
						<Skeleton className="mt-2 h-3 w-80 max-w-[85%]" />
					</div>
					<div className="hidden gap-2 sm:flex">
						<Skeleton className="h-6 w-20" />
						<Skeleton className="h-6 w-20" />
					</div>
				</div>
				<div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-3 xl:grid-cols-5">
					{Array.from({ length: 5 }, (_, index) => (
						<div
							key={index}
							className={cn(
								"space-y-2 border-border/60 px-5 py-4 xl:border-r xl:last:border-r-0",
								index === 0 && "col-span-2 sm:col-span-1",
							)}
						>
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-7 w-24" />
						</div>
					))}
				</div>
				<div className="flex w-fit shrink-0 gap-2 rounded-lg bg-muted/30 p-1">
					{[76, 62, 56, 64].map((width) => (
						<Skeleton key={width} className="h-7" style={{ width }} />
					))}
				</div>
				{review ? (
					<div className="grid min-h-0 flex-1 gap-6 overflow-hidden xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
						<div className="space-y-5">
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-3 w-64 max-w-full" />
							<Skeleton className="h-32 w-full rounded-lg" />
							<Skeleton className="h-24 w-full rounded-lg" />
							<div className="grid grid-cols-3 gap-3">
								<Skeleton className="h-8" />
								<Skeleton className="h-8" />
								<Skeleton className="h-8" />
							</div>
						</div>
						<div className="space-y-5">
							<Skeleton className="h-5 w-28" />
							{[0, 1, 2].map((key) => (
								<div key={key} className="space-y-2">
									<Skeleton className="h-3 w-24" />
									<Skeleton className="h-9 w-full" />
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
						<div className="space-y-4 rounded-xl border p-4">
							<div className="flex justify-between">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-7 w-20" />
							</div>
							<Skeleton className="h-3 w-44" />
							<Skeleton className="h-48 w-full rounded-lg" />
						</div>
						<div className="space-y-4 rounded-xl border p-4">
							<Skeleton className="h-4 w-28" />
							{[0, 1, 2].map((key) => (
								<Skeleton key={key} className="h-8 w-full" />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function SaveStatus({ state }: { state: string }) {
	return (
		<span
			aria-live="polite"
			className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					state === "saved"
						? "bg-emerald-500"
						: state === "failed" || state === "conflict"
							? "bg-rose-500"
							: "bg-amber-500",
					state === "saving" && "motion-safe:animate-pulse",
				)}
			/>
			{{
				saved: "Saved",
				saving: "Saving…",
				pending: "Editing",
				conflict: "Conflict",
				failed: "Save failed",
			}[state] ?? state}
		</span>
	);
}

function TradeEditor({
	data,
	refresh,
	...props
}: Props & {
	data: DetailData;
	refresh: () => Promise<DetailData | undefined>;
}) {
	const trade = data.journalTradeV2!;
	const fetcher = useGraphQL();
	const platform = useTradstryPlatform();
	const cache = useQueryClient();
	const owner = platform.user.email;
	const base = ["journal-flow", owner, props.workspaceId];
	const playbooks = usePlaybooks();
	const tagCategories = useTagCategories();
	const allTags = useAllTags();
	const principles = usePrinciples(props.workspaceId);
	const plans = usePositionCalculatorPlans();
	const reviewInbox = useTradeReviewInbox(!!trade.episodeId);
	const confirmPlan = useConfirmTradeMatch();
	const status = useQuery({
		queryKey: [...base, "status"],
		queryFn: () => flow.status(fetcher, props.workspaceId),
	});
	const [error, setError] = React.useState<string | null>(null);
	const [activeTab, setActiveTab] = React.useState(
		props.sessionId ? "review" : "overview",
	);
	const contentViewport = React.useRef<HTMLDivElement>(null);
	const [marking, setMarking] = React.useState(false);
	const [creatingNote, setCreatingNote] = React.useState(false);
	const [grouping, setGrouping] = React.useState<
		"split" | "undo" | "resolve" | null
	>(null);
	const [undoId, setUndoId] = React.useState<string | undefined>();
	const [stopTouched, setStopTouched] = React.useState(false);
	const reviewId = React.useId();
	const stopInputRef = React.useRef<HTMLInputElement>(null);
	const stopErrorId = React.useId();
	const readOnly = !!trade.retiredAt || !status.data?.enabled;
	const context = useJournalSave({
		storageKey: `tradstry:journal-context:${owner}:${props.workspaceId}:${trade.id}`,
		owner,
		initial: {
			stopState: data.journalContextV2.stopState,
			stopPrice: data.journalContextV2.stopPrice,
			playbookId: data.journalContextV2.playbookId,
			claimedAt: data.journalContextV2.claimedAt,
			notes: data.journalContextV2.notes ?? "",
			tagIds: data.journalContextV2.tagIds ?? [],
			violatedPrincipleIds: data.journalContextV2.violatedPrincipleIds ?? [],
		},
		version: data.journalContextV2.version,
		query: flow.SAVE_CONTEXT,
		field: "saveJournalContext",
		variables: { workspaceId: props.workspaceId },
		validate: validateStop,
		toInput: (value, version) => ({
			entryId: trade.id,
			expectedVersion: version,
			...value,
		}),
	});
	const draft = useJournalSave({
		storageKey: `tradstry:journal-review:${owner}:${props.workspaceId}:${trade.id}`,
		owner,
		initial: {
			takeaway: data.journalReviewDraftV2.takeaway,
			choiceIds: data.journalReviewDraftV2.choiceIds,
			planAdherence: data.journalReviewDraftV2.planAdherence,
		},
		version: data.journalReviewDraftV2.version,
		query: flow.SAVE_DRAFT,
		field: "saveJournalReviewDraft",
		variables: { workspaceId: props.workspaceId },
		toInput: (value, version) => ({
			entryId: trade.id,
			expectedVersion: version,
			...value,
		}),
	});
	const reviewItem = reviewInbox.data?.find(
		(item) => item.episodeId === trade.episodeId,
	);
	const suggestions = React.useMemo(() => {
		try {
			return JSON.parse(
				reviewItem?.suggestionsJson ?? "[]",
			) as TradeReviewMatchSuggestion[];
		} catch {
			return [];
		}
	}, [reviewItem?.suggestionsJson]);
	const eligibleIds = new Set([
		...suggestions.map((item) => item.planId),
		...(reviewItem?.confirmedPlanId ? [reviewItem.confirmedPlanId] : []),
	]);
	const eligiblePlans = (plans.data ?? []).filter((plan) =>
		eligibleIds.has(plan.id),
	);
	const selectedPlan = eligiblePlans.find(
		(plan) => plan.id === reviewItem?.confirmedPlanId,
	);
	const planPreview = useTradeReviewPreview(
		trade.episodeId ?? undefined,
		selectedPlan?.id,
	);
	const selectedTags =
		context.value.tagIds ?? data.journalContextV2.tagIds ?? [];
	const selectedPrinciples =
		context.value.violatedPrincipleIds ??
		data.journalContextV2.violatedPrincipleIds ??
		[];
	const stopError = validateStop(context.value);
	const markerKey = `tradstry:journal-mark:${owner}:${props.workspaceId}:${trade.id}`;
	const [pendingReview, setPendingReview] = React.useState(() => {
		try {
			return !!localStorage.getItem(markerKey);
		} catch {
			return false;
		}
	});
	const markReviewed = async () => {
		if (!pendingReview && stopError) {
			setStopTouched(true);
			requestAnimationFrame(() => stopInputRef.current?.focus());
			return;
		}
		setMarking(true);
		setError(null);
		try {
			const cached = localStorage.getItem(markerKey);
			let request: flow.Command;
			if (cached) request = JSON.parse(cached) as flow.Command;
			else {
				const [contextVersion, draftVersion] = await Promise.all([
					context.flush(),
					draft.flush(),
				]);
				request = flow.command(
					flow.MARK_REVIEWED,
					"markJournalTradeReviewed",
					{
						workspaceId: props.workspaceId,
						input: {
							entryId: trade.id,
							expectedEntryRevision: trade.materializedRevision,
							expectedContextVersion: contextVersion,
							expectedDraftVersion: draftVersion,
							sessionId: props.sessionId ?? null,
						},
					},
					owner,
				);
				localStorage.setItem(markerKey, JSON.stringify(request));
				setPendingReview(true);
			}
			await flow.execute(fetcher, request);
			localStorage.removeItem(markerKey);
			setPendingReview(false);
			await props.onChanged();
			await refresh();
			await props.onReviewed?.();
		} catch (reason) {
			const message =
				reason instanceof Error
					? reason.message
					: "Your review has not been confirmed. Retry to check its status.";
			if (message === STOP_PRICE_ERROR) {
				setStopTouched(true);
				requestAnimationFrame(() => stopInputRef.current?.focus());
			} else {
				setError(message);
			}
			if (
				message.includes("CONFLICT") ||
				message.includes("REPREVIEW_REQUIRED")
			) {
				localStorage.removeItem(markerKey);
				setPendingReview(false);
				await refresh();
			}
		} finally {
			setMarking(false);
		}
	};
	const openNotes = async () => {
		setCreatingNote(true);
		setError(null);
		const key = `tradstry:journal-note:${owner}:${props.workspaceId}:${trade.id}`;
		try {
			const stored = localStorage.getItem(key);
			const request = stored
				? (JSON.parse(stored) as flow.Command)
				: flow.command(
						flow.ENSURE_NOTE,
						"ensureJournalContextNote",
						{ workspaceId: props.workspaceId, entryId: trade.id },
						owner,
					);
			localStorage.setItem(key, JSON.stringify(request));
			await flow.execute<string>(fetcher, request);
			localStorage.removeItem(key);
			await cache.invalidateQueries({ queryKey: ["notebook"] });
			await refresh();
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Could not open your notes",
			);
		} finally {
			setCreatingNote(false);
		}
	};
	const retryReview = React.useRef(markReviewed);
	retryReview.current = markReviewed;
	React.useEffect(() => {
		if (!pendingReview) return;
		const retry = () => {
			void retryReview.current();
		};
		window.addEventListener("online", retry);
		return () => window.removeEventListener("online", retry);
	}, [pendingReview]);
	const result = trade.realizedNet === null ? null : Number(trade.realizedNet);
	const resultTone =
		result !== null && result > 0
			? "text-emerald-700 dark:text-emerald-400"
			: result !== null && result < 0
				? "text-rose-700 dark:text-rose-400"
				: "text-foreground";
	const optionSymbol = /^[A-Z0-9.]+\s*\d{6}[CP]\d{8}$/.test(trade.symbol);
	const title =
		optionSymbol && trade.symbolName ? trade.symbolName : trade.symbol;
	const subtitle = optionSymbol ? trade.symbol : trade.symbolName;
	const resolveConflict = async (kind: "context" | "draft") => {
		const latest = await refresh();
		if (!latest) return;
		if (kind === "context")
			context.useLatestVersion(latest.journalContextV2.version);
		else draft.useLatestVersion(latest.journalReviewDraftV2.version);
	};
	const reviewHint =
		trade.lifecycleState !== "closed"
			? "Finish your review after the trade closes."
			: trade.reviewState === "outdated"
				? "The results or context changed. Take another look before confirming."
				: trade.reviewState === "reviewed"
					? "Your review is saved. Confirm again after making changes."
					: draft.value.takeaway.trim()
						? "Ready to review. Your lesson will be saved with this trade."
						: "Write a lesson to complete your review.";
	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col",
				!props.embedded && "p-3 md:p-5",
			)}
		>
			<header className={cn("shrink-0 pb-4", props.inDialog && "pr-10")}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2.5">
							{props.onBack && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Back to trades"
									title="Back to trades"
									className="size-8 text-muted-foreground"
									onClick={props.onBack}
								>
									<HugeiconsIcon
										icon={ArrowLeft01Icon}
										className="size-5"
										strokeWidth={1.8}
										aria-hidden="true"
									/>
								</Button>
							)}
							<h1 className="break-words text-xl font-semibold tracking-tight">
								{title}
							</h1>
							<span
								className={cn(
									"rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
									trade.direction === "long"
										? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
										: trade.direction === "short"
											? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
											: "border-border bg-muted text-muted-foreground",
								)}
							>
								{trade.direction}
							</span>
						</div>
						<p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
							{!props.embedded && (
								<>
									<span>{subtitle}</span>
									<span aria-hidden="true">·</span>
								</>
							)}
							<span>
								{tradeDate(trade.openDate, status.data?.timezone)}
								{trade.closeDate &&
									" → " + tradeDate(trade.closeDate, status.data?.timezone)}
							</span>
						</p>
					</div>
					<div className="flex items-center gap-2 pt-1 text-xs">
						<span className="rounded-md bg-muted px-2.5 py-1">
							{trade.retiredAt
								? "Previous grouping"
								: trade.lifecycleState === "incomplete"
									? "Needs attention"
									: trade.lifecycleState === "open"
										? "Open position"
										: "Closed trade"}
						</span>
						<span
							className={cn(
								"rounded-md px-2.5 py-1",
								trade.reviewState === "reviewed"
									? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
									: "text-muted-foreground",
							)}
						>
							{trade.reviewState === "reviewed"
								? "Reviewed"
								: trade.reviewState === "outdated"
									? "Review changed results"
									: "Not reviewed"}
						</span>
					</div>
				</div>
			</header>
			{trade.sourceKind === "manual" && (
				<ManualTradeActions entryId={trade.id} onChanged={props.onChanged} />
			)}
			<section
				aria-label="Trade summary"
				className="grid shrink-0 grid-cols-3 overflow-hidden rounded-lg border bg-muted/15 sm:grid-cols-5"
			>
				<div
					className={cn(
						"border-r px-3 py-3 md:px-4",
						result !== null && result < 0
							? "bg-rose-500/5"
							: result !== null && result > 0
								? "bg-emerald-500/5"
								: "bg-muted/30",
					)}
				>
					<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
						{trade.sourceKind === "manual" ? "Recorded P&L" : "Realized net"}
						<TradeFieldHelp
							label={
								trade.sourceKind === "manual" ? "Recorded P&L" : "Realized net"
							}
							description={
								trade.sourceKind === "manual"
									? "The profit or loss recorded for this trade."
									: "Profit or loss from closed quantities, after fees."
							}
						/>
					</p>
					<p
						className={cn(
							"mt-1 text-xl font-semibold tracking-tight tabular-nums",
							resultTone,
						)}
					>
						{money(trade.realizedNet, trade.currency)}
					</p>
				</div>
				{[
					[
						"Average entry",
						money(trade.entryPrice, trade.currency),
						"The average price you entered at.",
					],
					[
						"Average exit",
						money(trade.exitPrice, trade.currency),
						"The average price you exited at.",
					],
					[
						"Open quantity",
						trade.remainingQuantity ?? "—",
						"The quantity still held in this trade.",
					],
					[
						"Fees paid",
						money(trade.feesPaid, trade.currency),
						"Total fees recorded for this trade.",
					],
				].map(([label, value, description]) => (
					<div
						key={label}
						className="border-border/60 px-3 py-3 md:px-4 sm:border-r sm:last:border-r-0"
					>
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							{label}
							<TradeFieldHelp label={label} description={description} />
						</p>
						<p className="mt-1 text-base font-medium tabular-nums">{value}</p>
					</div>
				))}
			</section>
			<Tabs
				value={activeTab}
				onValueChange={(value) => {
					setActiveTab(value);
					contentViewport.current?.scrollTo({ top: 0, left: 0 });
				}}
				className="min-h-0 min-w-0 flex-1 gap-3 pt-4"
			>
				<TabsList
					aria-label="Trade details"
					className="shrink-0"
				>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="review">Review</TabsTrigger>
					<TabsTrigger value="notes">Notes</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
				</TabsList>
				<ScrollArea
					viewportRef={contentViewport}
					className={cn(
						"min-h-0 min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!",
						props.embedded ? "-mr-[29px] md:-mr-[41px]" : "-mr-3 md:-mr-5",
					)}
				>
					<div
						className={cn(
							"space-y-4 pb-6",
							props.embedded ? "pr-[41px] md:pr-[53px]" : "pr-5 md:pr-7",
						)}
					>
						{error && (
							<div
								role="alert"
								className="flex items-start justify-between gap-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm"
							>
								<p className="text-destructive">{error}</p>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setError(null)}
								>
									Dismiss
								</Button>
							</div>
						)}
						{trade.retiredAt && (
							<div className="rounded-lg bg-muted px-4 py-3 text-sm">
								This earlier grouping and its notes are preserved.
								{trade.successorId && (
									<Button
										size="sm"
										variant="link"
										onClick={() =>
											platform.navigate(
												"/dashboard/journal/" +
													encodeURIComponent(trade.successorId!),
											)
										}
									>
										Open current trade
									</Button>
								)}
							</div>
						)}
						{trade.issueMessage && (
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
								<p className="min-w-0 flex-1 text-amber-800 dark:text-amber-300">
									{trade.issueMessage}
								</p>
								{!readOnly && trade.lifecycleState === "incomplete" && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setGrouping("resolve")}
									>
										Resolve history
									</Button>
								)}
							</div>
						)}
						{!!trade.possibleDuplicates?.length && (
							<div className="rounded-lg border border-amber-500/20 px-4 py-3 text-sm">
								<p>
									Compare these existing entries before recording a separate
									trade.
								</p>
								{trade.possibleDuplicates.map((id) => (
									<Button
										key={id}
										variant="link"
										size="sm"
										onClick={() =>
											platform.navigate(
												"/dashboard/journal/" + encodeURIComponent(id),
											)
										}
									>
										View existing {trade.symbol} entry
									</Button>
								))}
							</div>
						)}
						<TabsContent
							value="overview"
							forceMount
							className="m-0 space-y-4 data-[state=inactive]:hidden"
						>
							<JournalChart
								workspaceId={props.workspaceId}
								entryId={trade.id}
								revision={trade.materializedRevision}
							/>
							<section className="overflow-hidden rounded-xl border bg-card">
								<div className="flex items-center justify-between gap-3 border-b px-4 py-3">
									<div className="flex items-center gap-2">
										<h2 className="text-sm font-semibold">Executions</h2>
										<span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
											{data.journalExecutionsV2.length}
										</span>
									</div>
									{trade.episodeId &&
										!readOnly &&
										trade.lifecycleState !== "incomplete" && (
											<Button
												size="sm"
												variant="outline"
												onClick={() => setGrouping("split")}
											>
												Split trade
											</Button>
										)}
								</div>
								<ScrollArea orientation="horizontal">
									<table className="w-full min-w-[480px] text-sm">
										<thead className="bg-muted/30 text-[11px] text-muted-foreground">
											<tr>
												{["Time", "Side", "Quantity", "Price", "Fee"].map(
													(label, index) => (
														<th
															key={label}
															className={cn(
																"px-4 py-2.5 font-medium",
																index < 2 ? "text-left" : "text-right",
															)}
														>
															{label}
														</th>
													),
												)}
											</tr>
										</thead>
										<tbody>
											{data.journalExecutionsV2.map((execution, index) => (
												<tr
													key={
														execution.transactionId +
														":" +
														execution.role +
														":" +
														index
													}
													className="border-t border-border/60 hover:bg-muted/30"
												>
													<td className="px-4 py-3 text-xs text-muted-foreground">
														{execution.executedAt
															? execution.precision === "timestamp"
																? new Intl.DateTimeFormat(undefined, {
																		dateStyle: "medium",
																		timeStyle: "short",
																		timeZone: status.data?.timezone,
																	}).format(new Date(execution.executedAt))
																: tradeDate(execution.executedAt) +
																	" · time unavailable"
															: "Date unavailable"}
													</td>
													<td className="px-4 py-3">
														<span
															className={cn(
																"rounded-md px-2 py-1 text-[11px] font-medium",
																execution.side.startsWith("BUY")
																	? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
																	: execution.side.startsWith("SELL")
																		? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
																		: "bg-muted text-muted-foreground",
															)}
														>
															{execution.side}
														</span>
													</td>
													<td className="px-4 py-3 text-right tabular-nums">
														{execution.quantity}
													</td>
													<td className="px-4 py-3 text-right tabular-nums">
														{money(execution.price, trade.currency)}
													</td>
													<td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
														{money(execution.fee, trade.currency)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</ScrollArea>
								{!data.journalExecutionsV2.length && (
									<p className="p-4 text-sm text-muted-foreground">
										This manually recorded trade has no linked broker
										executions.
									</p>
								)}
							</section>
							{!readOnly && trade.episodeId && (
								<JournalSuggestions
									workspaceId={props.workspaceId}
									trade={trade}
									onChanged={props.onChanged}
								/>
							)}
						</TabsContent>
						<TabsContent
							value="review"
							forceMount
							className="m-0 data-[state=inactive]:hidden"
						>
							<section className="space-y-6 pt-2">
								<div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)] xl:gap-8">
									<div className="min-w-0 space-y-4">
										<div className="flex items-start justify-between gap-3">
											<div>
												<h2 className="text-base font-semibold tracking-tight">
													Reflection
												</h2>
												<p className="mt-1 text-xs text-muted-foreground">
													What is worth remembering about this trade?
												</p>
											</div>
											<SaveStatus state={draft.state} />
										</div>
										<section
											className="space-y-4 border-b border-border/60 pb-4"
											aria-label="Trade tags"
										>
											<h3 className="text-xs font-medium text-muted-foreground">
												Tags
											</h3>
											<div className="grid gap-3 sm:grid-cols-3">
												{(tagCategories.data ?? []).map((category) => {
													const categoryIds = new Set(
														(allTags.data ?? [])
															.filter((tag) => tag.categoryId === category.id)
															.map((tag) => tag.id),
													);
													return (
														<Field
															key={category.id}
															label={category.name}
															description={
																tagHelp[category.name.toLowerCase()] ??
																"Labels to organize and review this trade."
															}
														>
															<fieldset
																disabled={
																	readOnly ||
																	allTags.isLoading ||
																	allTags.isError
																}
															>
																<TagPicker
																	category={category}
																	selectedTagIds={selectedTags.filter((id) =>
																		categoryIds.has(id),
																	)}
																	className="w-full"
																	onChange={(ids) => {
																		if (!readOnly)
																			context.update({
																				...context.value,
																				tagIds: [
																					...selectedTags.filter(
																						(id) => !categoryIds.has(id),
																					),
																					...ids,
																				],
																			});
																	}}
																/>
															</fieldset>
														</Field>
													);
												})}
											</div>
											{(tagCategories.isError || allTags.isError) && (
												<Button
													size="sm"
													variant="outline"
													onClick={() => {
														void tagCategories.refetch();
														void allTags.refetch();
													}}
												>
													Retry loading tags
												</Button>
											)}
										</section>
										<Field
											label="Lesson"
											description="What you’ll repeat or change next time."
											htmlFor={reviewId + "-lesson"}
										>
											<textarea
												id={reviewId + "-lesson"}
												disabled={readOnly}
												value={draft.value.takeaway}
												onChange={(event) =>
													draft.update({
														...draft.value,
														takeaway: event.target.value,
													})
												}
												onBlur={() => void draft.flush().catch(() => {})}
												placeholder="What will you repeat or change next time?"
												maxLength={4000}
												rows={3}
												className="min-h-28 w-full resize-none rounded-lg border border-input bg-muted/15 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
											/>
										</Field>
										<Field
											label="Additional context · optional"
											description="What influenced this trade."
											htmlFor={reviewId + "-notes"}
										>
											<textarea
												id={reviewId + "-notes"}
												disabled={readOnly}
												value={
													context.value.notes ??
													data.journalContextV2.notes ??
													""
												}
												onChange={(event) =>
													context.update({
														...context.value,
														notes: event.target.value,
													})
												}
												onBlur={() => void context.flush().catch(() => {})}
												placeholder="What influenced the execution?"
												rows={2}
												className="min-h-20 w-full resize-none rounded-lg border border-input bg-muted/15 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
											/>
										</Field>
									</div>
									<aside
										className="min-w-0 space-y-4 border-t border-border/60 pt-6 xl:border-t-0 xl:border-l xl:pl-8 xl:pt-0 [&_[data-slot=select-trigger]]:h-9 [&_[data-slot=select-trigger]]:rounded-lg [&_[data-slot=select-trigger]]:bg-background"
										aria-label="Trade setup and risk"
									>
										<div className="flex items-center justify-between gap-3">
											<h2 className="text-base font-semibold tracking-tight">
												Setup & risk
											</h2>
											<SaveStatus state={context.state} />
										</div>
										<Field
											label="Playbook"
											description="The trading strategy you used."
										>
											<Select
												disabled={readOnly || playbooks.isLoading}
												value={context.value.playbookId ?? "__none__"}
												onValueChange={(value) => {
													const playbookId =
														value === "__none__" ? null : value;
													context.update({
														...context.value,
														playbookId,
														violatedPrincipleIds: selectedPrinciples.filter(
															(id) => {
																const principle = principles.data?.find(
																	(item) => item.id === id,
																);
																return (
																	!principle ||
																	principle.playbookId === null ||
																	principle.playbookId === playbookId
																);
															},
														),
													});
												}}
											>
												<SelectTrigger aria-label="Playbook" className="w-full">
													<SelectValue placeholder="No playbook" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">No playbook</SelectItem>
													{playbooks.data?.map((playbook) => (
														<SelectItem key={playbook.id} value={playbook.id}>
															{playbook.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										{trade.episodeId && (
											<Field
												label="Position plan"
												description="A saved Position Calculator plan to compare with this trade."
											>
												<Select
													disabled={
														readOnly ||
														confirmPlan.isPending ||
														reviewInbox.isLoading ||
														plans.isLoading
													}
													value={reviewItem?.confirmedPlanId ?? "__none__"}
													onValueChange={async (planId) => {
														if (planId === "__none__") return;
														try {
															await confirmPlan.mutateAsync({
																episodeId: trade.episodeId!,
																planId,
															});
															await props.onChanged();
														} catch (reason) {
															setError(
																reason instanceof Error
																	? reason.message
																	: "Could not match this plan",
															);
														}
													}}
												>
													<SelectTrigger
														aria-label="Position plan"
														className="w-full"
													>
														<SelectValue placeholder="No matching plan" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem
															value="__none__"
															disabled={!!reviewItem?.confirmedPlanId}
														>
															No matching plan
														</SelectItem>
														{eligiblePlans.map((plan) => (
															<SelectItem key={plan.id} value={plan.id}>
																{plan.symbol} · {plan.positionType} ·{" "}
																{money(String(plan.stopLoss), trade.currency)}{" "}
																stop
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<p className="text-[11px] text-muted-foreground">
													{reviewItem?.confirmedPlanId
														? "Confirmed match. Choose another eligible plan to correct it."
														: "Only eligible saved plans appear here."}
												</p>
												{reviewInbox.isError && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => void reviewInbox.refetch()}
													>
														Retry loading plans
													</Button>
												)}
											</Field>
										)}
										{selectedPlan && (
											<Field
												label="Plan adherence"
												description="How closely you followed your plan."
											>
												<Select
													disabled={readOnly}
													value={draft.value.planAdherence ?? "__unset__"}
													onValueChange={(value) =>
														draft.update({
															...draft.value,
															planAdherence:
																value === "__unset__" ? null : value,
														})
													}
												>
													<SelectTrigger
														aria-label="Plan adherence"
														className="w-full"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="__unset__">
															Not answered
														</SelectItem>
														<SelectItem value="yes">
															Followed the plan
														</SelectItem>
														<SelectItem value="partly">
															Partially followed
														</SelectItem>
														<SelectItem value="no">
															Deviated from the plan
														</SelectItem>
														<SelectItem value="no_plan">No plan</SelectItem>
													</SelectContent>
												</Select>
											</Field>
										)}
										<Field
											label="Stop Loss"
											description="Your planned exit price to limit losses; no order is placed."
											htmlFor={reviewId + "-stop"}
										>
											<div className="grid grid-cols-2 gap-2">
												<Select
													disabled={readOnly}
													value={context.value.stopState}
													onValueChange={(value) => {
														const stopState = value as
															| "unknown"
															| "none"
															| "price";
														setStopTouched(false);
														context.update({
															...context.value,
															stopState,
															stopPrice:
																stopState === "price"
																	? context.value.stopPrice
																	: null,
														});
													}}
												>
													<SelectTrigger
														aria-label="Stop loss status"
														className="w-full"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="unknown">
															Not recorded
														</SelectItem>
														<SelectItem value="price">Stop loss</SelectItem>
														<SelectItem value="none">No stop loss</SelectItem>
													</SelectContent>
												</Select>
												{context.value.stopState === "price" ? (
													<Input
														id={reviewId + "-stop"}
														ref={stopInputRef}
														disabled={readOnly}
														inputMode="decimal"
														placeholder="Price"
														aria-invalid={stopTouched && !!stopError}
														aria-describedby={
															stopTouched && stopError ? stopErrorId : undefined
														}
														value={context.value.stopPrice ?? ""}
														onChange={(event) =>
															context.update({
																...context.value,
																stopPrice: event.target.value || null,
															})
														}
														onBlur={() => {
															setStopTouched(true);
															void context.flush().catch(() => {});
														}}
													/>
												) : (
													<span className="flex items-center text-xs text-muted-foreground">
														{context.value.stopState === "none"
															? "No stop used"
															: "Stop is unknown"}
													</span>
												)}
											</div>
											{stopTouched && stopError && (
												<p
													id={stopErrorId}
													role="alert"
													className="text-xs text-destructive"
												>
													{stopError}
												</p>
											)}
											<p className="text-[11px] text-muted-foreground">
												{data.journalContextV2.phase === "retrospective" ||
												trade.lifecycleState === "closed"
													? "Added after the trade; original plan stays separate."
													: "Changes are timestamped when saved."}
											</p>
											{data.journalContextV2.legacyStopPrice &&
												!data.journalContextV2.recordedAt && (
													<p className="text-xs text-muted-foreground">
														Historical stop:{" "}
														{money(
															data.journalContextV2.legacyStopPrice,
															trade.currency,
														)}
														. Its recording time is unknown.
													</p>
												)}
										</Field>
										<div className="border-t border-border/60 pt-4">
											<Field
												label="Principles broken"
												description="Trading rules you broke on this trade."
												className="self-start"
											>
												<fieldset disabled={readOnly}>
													<PrinciplePicker
														workspaceId={props.workspaceId}
														selectedPlaybookId={context.value.playbookId}
														value={selectedPrinciples}
														className="w-full data-[slot=empty]:min-h-0 data-[slot=empty]:rounded-none data-[slot=empty]:border-0 data-[slot=empty]:bg-transparent data-[slot=empty]:p-0"
														onChange={(violatedPrincipleIds) => {
															if (!readOnly)
																context.update({
																	...context.value,
																	violatedPrincipleIds,
																});
														}}
													/>
												</fieldset>
											</Field>
										</div>
									</aside>
								</div>
								<div className="space-y-2">
									<SaveFeedback
										error={
											context.error === STOP_PRICE_ERROR ? null : context.error
										}
										state={context.state}
										onRetry={() => context.flush()}
										onResolve={() => resolveConflict("context")}
									/>
									<SaveFeedback
										error={draft.error}
										state={draft.state}
										onRetry={() => draft.flush()}
										onResolve={() => resolveConflict("draft")}
									/>
								</div>
								{selectedPlan && (
									<div className="min-w-0">
										<RiskOutcomePanel
											calculation={planPreview.data}
											loading={planPreview.isLoading}
										/>
										{planPreview.isError && (
											<p className="mt-2 text-xs text-destructive">
												Could not calculate the plan comparison.
											</p>
										)}
									</div>
								)}
								<details className="group border-t border-border/60">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
										<span className="font-medium">
											Broker details{" "}
											<span className="ml-2 text-xs font-normal text-muted-foreground">
												Original dates, prices and position
											</span>
										</span>
										<HugeiconsIcon
											icon={ArrowDown01Icon}
											className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
											strokeWidth={1.8}
											aria-hidden="true"
										/>
									</summary>
									<dl className="grid gap-x-6 gap-y-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">
										{[
											[
												"Symbol",
												trade.symbol,
												"The ticker of the asset you traded.",
											],
											[
												"Symbol name",
												trade.symbolName || "—",
												"The full name of the traded asset.",
											],
											[
												"Open date",
												tradeTimestamp(trade.openDate, status.data?.timezone),
												"When this trade first opened.",
											],
											[
												"Close date",
												trade.closeDate
													? tradeTimestamp(
															trade.closeDate,
															status.data?.timezone,
														)
													: trade.lifecycleState === "open"
														? "Still open"
														: "Not recorded",
												"When the remaining position was fully closed.",
											],
											[
												"Entry price",
												money(trade.entryPrice, trade.currency),
												"The average price you entered at.",
											],
											[
												"Exit price",
												money(trade.exitPrice, trade.currency),
												"The average price you exited at.",
											],
											[
												Number(trade.contractMultiplier) !== 1
													? "Position size (contracts)"
													: "Position size",
												trade.enteredQuantity ?? "—",
												"The total quantity entered in this trade.",
											],
											[
												"Trade type",
												trade.direction,
												"Long buys first; short sells first.",
											],
										].map(([label, value, description]) => (
											<div key={label} className="min-w-0">
												<dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
													{label}
													<TradeFieldHelp
														label={label}
														description={description}
													/>
												</dt>
												<dd className="mt-1 break-words text-sm tabular-nums">
													{value}
												</dd>
											</div>
										))}
									</dl>
								</details>
							</section>
						</TabsContent>
						<TabsContent
							value="notes"
							forceMount
							className="m-0 data-[state=inactive]:hidden"
						>
							<section className="overflow-hidden rounded-xl border bg-card">
								<div className="flex items-center justify-between border-b px-4 py-3">
									<h2 className="text-sm font-semibold">Notes & screenshots</h2>
									{!data.journalContextV2.noteId && (
										<Button
											size="sm"
											variant="outline"
											disabled={readOnly || creatingNote}
											onClick={() => void openNotes()}
										>
											{creatingNote ? "Opening…" : "Add notes"}
										</Button>
									)}
								</div>
								{data.journalContextV2.noteId ? (
									<ContextNotebook noteId={data.journalContextV2.noteId} />
								) : (
									<div className="px-4 py-6">
										<p className="text-sm text-muted-foreground">
											Keep the reasoning behind this trade.
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											Add notes, chart screenshots, or anything you want to
											remember.
										</p>
									</div>
								)}
							</section>
						</TabsContent>
						<TabsContent
							value="history"
							forceMount
							className="m-0 space-y-4 data-[state=inactive]:hidden"
						>
							{!!data.journalReviewHistoryV2?.length && (
								<details open className="rounded-xl border px-4 py-3">
									<summary className="cursor-pointer text-sm font-medium">
										Review history{" "}
										<span className="ml-1 text-xs text-muted-foreground">
											{data.journalReviewHistoryV2.length}
										</span>
									</summary>
									<div className="mt-3 space-y-3">
										{data.journalReviewHistoryV2.map((review) => (
											<article
												key={review.id}
												className="border-t pt-3 text-sm"
											>
												<p className="text-xs text-muted-foreground">
													Review {review.version} ·{" "}
													{tradeDate(review.createdAt)}
													{review.entryRevision !== trade.materializedRevision
														? " · earlier results"
														: ""}
												</p>
												<p className="mt-2 whitespace-pre-wrap">
													{review.takeaway ||
														"Completed in the previous journal. Original reflection is preserved in your data export."}
												</p>
												{review.choiceIds.length > 0 && (
													<p className="mt-2 text-xs text-muted-foreground">
														{review.choiceIds.join(" · ")}
													</p>
												)}
											</article>
										))}
									</div>
								</details>
							)}
							{!!data.journalGroupingHistoryV2.length && (
								<details open className="rounded-xl border px-4 py-3">
									<summary className="cursor-pointer text-sm font-medium">
										Grouping history
									</summary>
									<div className="mt-3 space-y-2">
										{data.journalGroupingHistoryV2.map((operation) => (
											<div
												key={operation.id}
												className="flex flex-wrap items-center gap-2 border-t py-3 text-sm"
											>
												<span className="mr-auto capitalize">
													{operation.kind} · {tradeDate(operation.createdAt)}
													{operation.state === "undone" ? " · undone" : ""}
												</span>
												{operation.entryIds
													?.filter((id) => id !== trade.id)
													.map((id) => (
														<Button
															key={id}
															size="sm"
															variant="link"
															onClick={() =>
																platform.navigate(
																	"/dashboard/journal/" +
																		encodeURIComponent(id),
																)
															}
														>
															Related trade
														</Button>
													))}
												{operation.state === "committed" && !readOnly && (
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															setUndoId(operation.id);
															setGrouping("undo");
														}}
													>
														Preview undo
													</Button>
												)}
											</div>
										))}
									</div>
								</details>
							)}
							{!data.journalReviewHistoryV2?.length &&
								!data.journalGroupingHistoryV2.length && (
									<div className="rounded-xl border px-6 py-12 text-center">
										<h2 className="text-sm font-medium">No history yet</h2>
										<p className="mt-2 text-sm text-muted-foreground">
											Saved reviews and grouping changes will appear here.
										</p>
									</div>
								)}
						</TabsContent>
					</div>
				</ScrollArea>
				{activeTab === "review" && (
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-card pt-3">
						<p className="text-xs text-muted-foreground">{reviewHint}</p>
						<Button
							className="ml-auto h-9 rounded-lg px-5"
							disabled={
								readOnly ||
								marking ||
								confirmPlan.isPending ||
								trade.lifecycleState !== "closed" ||
								(!pendingReview && !draft.value.takeaway.trim())
							}
							onClick={() => void markReviewed()}
						>
							{marking
								? "Saving…"
								: pendingReview
									? "Check pending review"
									: trade.reviewState === "reviewed"
										? "Update review"
										: "Mark reviewed"}
						</Button>
					</div>
				)}
			</Tabs>
			<GroupingDialog
				open={grouping !== null}
				onOpenChange={(open) => {
					if (!open) setGrouping(null);
				}}
				workspaceId={props.workspaceId}
				entries={[trade]}
				mode={grouping ?? "split"}
				operationId={undoId}
				onDone={async () => {
					await cache.invalidateQueries({ queryKey: base });
					await props.onChanged();
					await refresh();
				}}
			/>
		</div>
	);
}

function SaveFeedback({
	error,
	state,
	onRetry,
	onResolve,
}: {
	error: string | null;
	state: string;
	onRetry: () => Promise<unknown>;
	onResolve: () => Promise<void>;
}) {
	if (!error) return null;
	return (
		<div role="alert" className="rounded-lg bg-destructive/5 p-3 text-xs">
			<p className="text-destructive">{error}</p>
			<div className="mt-2 flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={() => void onRetry().catch(() => {})}
				>
					Retry saving
				</Button>
				{state === "conflict" && (
					<Button
						size="sm"
						variant="outline"
						onClick={() => void onResolve().catch(() => {})}
					>
						Keep my changes
					</Button>
				)}
			</div>
		</div>
	);
}

function ContextNotebook({ noteId }: { noteId: string }) {
	const note = useNotebookNote(noteId);
	const upload = useUploadNotebookMedia();
	const remove = useDeleteNotebookMedia();
	if (note.isLoading)
		return (
			<div role="status" className="min-h-64 p-4">
				<span className="sr-only">Loading notes…</span>
				<div
					aria-hidden="true"
					className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
				>
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</div>
		);
	if (note.isError || !note.data)
		return (
			<Button variant="ghost" onClick={() => void note.refetch()}>
				Retry loading notes
			</Button>
		);
	const document = note.data;
	return (
		<div className="min-h-64 p-3">
			<NotebookEditor
				key={noteId}
				noteId={noteId}
				images={document.images}
				onNeedMediaRefresh={() => void note.refetch()}
				onUploadMedia={async (file, hash, idempotencyKey, signal) => {
					return upload.mutateAsync({
						noteId,
						hash,
						idempotencyKey,
						file,
						signal,
					});
				}}
				onDeleteImage={async (hash) => {
					await remove.mutateAsync({ noteId, hash });
				}}
			/>
		</div>
	);
}

function ManualTradeActions({
	entryId,
	onChanged,
}: {
	entryId: string;
	onChanged: () => void | Promise<void>;
}) {
	const legacy = useJournalEntry(entryId);
	const platform = useTradstryPlatform();
	const previous = React.useRef(legacy.data);
	const callback = React.useRef(onChanged);
	callback.current = onChanged;
	React.useEffect(() => {
		if (previous.current !== legacy.data) {
			if (previous.current && legacy.data === null)
				platform.navigate("/dashboard/journal");
			previous.current = legacy.data;
			void callback.current();
		}
	}, [legacy.data]);
	return legacy.data ? (
		<div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
			<span>Manually recorded trade</span>
			<EditTrades trade={legacy.data} />
			<DeleteTrades trade={legacy.data} />
		</div>
	) : null;
}

function tradeTimestamp(value: string | null, timezone?: string) {
	if (!value) return "Not recorded";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Not recorded";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: timezone,
	}).format(date);
}
