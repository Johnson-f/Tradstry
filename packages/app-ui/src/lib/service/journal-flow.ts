import { GraphQLRequestError, type GraphQLFetcher } from "@tradstry/app-ui/lib/client";

export type JournalTrade = {
  id: string; workspaceId: string; sourceKind: string; episodeId: string | null;
  symbol: string; symbolName: string; direction: string; currency: string | null;
  openDate: string | null; closeDate: string | null; entryPrice: string | null;
  exitPrice: string | null; enteredQuantity: string | null; remainingQuantity: string | null;
  realizedNet: string | null; feesPaid: string | null; contractMultiplier: string;
  lifecycleState: "open" | "closed" | "incomplete"; reviewState: "unreviewed" | "in_progress" | "reviewed" | "outdated" | "skipped";
  outcome: "profit" | "loss" | "breakeven" | "unknown"; tags: { id: string; name: string; color: string | null }[];
  recordVersion: number; materializedRevision: number; issueCode: string | null;
  issueMessage: string | null; possibleDuplicates:string[]; retiredAt: string | null; successorId: string | null;
  startingPosition: boolean; firstExecutionAt: string | null; lastExecutionAt: string | null; executionCount: number;
  hasEntryNote: boolean; realizedR: string | null;
};
export type FlowStatus = { apiVersion: number; enabled: boolean; sourceRevision: number; projectionRevision: number; importState: string; lastError: string | null; timezone: string; changeCursor: string };
export type TradeContext = { notes: string | null; tagIds: string[]; violatedPrincipleIds: string[]; entryId: string; version: number; stopState: "unknown" | "none" | "price"; stopPrice: string | null; legacyStopPrice: string | null; playbookId: string | null; noteId: string | null; phase: string | null; recordedAt: string | null; claimedAt: string | null };
export type ReviewDraft = { entryId: string; version: number; takeaway: string; choiceIds: string[]; planAdherence: string | null };
export type SessionItem = { entryId: string; group: "exited" | "open" | "attention"; state: "reviewed" | "skipped" | "pending" | "none"; skipReason: SkipReason | null };
export type SkipReason = "too_small" | "mistake_fill" | "review_later";
export type ReviewSession = { id: string; date: string; timezone: string; queue: string[]; completed: string[]; cursorEntryId: string | null; version: number; refreshAvailable: boolean; items: SessionItem[]; reviewedCount: number; skippedCount: number; complete: boolean };
export type ExecutionHolder = { entryId: string | null; direction: string; openedAt: string; blocked: boolean; quantity: string };
export type Execution = { transactionId: string; role: string; side: string; quantity: string; price: string; fee: string | null; executedAt: string | null; precision: string; sourceQuantity: string; heldBy: ExecutionHolder[]; startingPosition: boolean };
export type ExitIssue = { transactionId: string; positionBefore: string; exitQuantity: string; shortBy: string };
export type GroupingInput = { direction?: string; entryIds: string[]; groups: { entryId: string | null; allocations: { transactionId: string; quantity: string }[] }[] };
export type PreviewGroup = { entryId: string; direction: string; remainingQuantity: string; enteredQuantity: string; feesPaid: string | null; realizedNet: string | null; allocations: { transactionId: string; role: string; quantity: string; price: string; fee: string | null; executedAt: string }[] };
export type GroupingPreview = { token: string; entryIds: string[]; realizedNet: (string | null)[]; beforeGroups: PreviewGroup[]; groups: PreviewGroup[] };
export type GroupingResult = { operationId: string; entryIds: string[] };
export type GroupingHistory = { id: string; kind: string; state: string; createdAt: string; entryIds:string[] };

export const TRADE_FIELDS = `id workspaceId sourceKind episodeId symbol symbolName direction currency openDate closeDate entryPrice exitPrice enteredQuantity remainingQuantity realizedNet feesPaid contractMultiplier lifecycleState outcome tags { id name color } reviewState recordVersion materializedRevision issueCode issueMessage possibleDuplicates retiredAt successorId startingPosition firstExecutionAt lastExecutionAt executionCount hasEntryNote realizedR`;
export const CONTEXT_FIELDS = `entryId version stopState stopPrice legacyStopPrice playbookId noteId phase recordedAt claimedAt notes tagIds violatedPrincipleIds`;
export const DRAFT_FIELDS = `entryId version takeaway choiceIds planAdherence`;
export const SESSION_FIELDS = `id date timezone queue completed cursorEntryId version refreshAvailable items { entryId group state skipReason } reviewedCount skippedCount complete`;
const PREVIEW_GROUP_FIELDS = `entryId direction remainingQuantity enteredQuantity feesPaid realizedNet allocations { transactionId role quantity price fee executedAt }`;
export const PREVIEW_FIELDS = `token entryIds realizedNet beforeGroups {${PREVIEW_GROUP_FIELDS}} groups {${PREVIEW_GROUP_FIELDS}}`;

export async function status(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalFlowStatus: FlowStatus }>(`query JournalFlowStatus($workspaceId:String!){journalFlowStatus(workspaceId:$workspaceId){apiVersion enabled sourceRevision projectionRevision importState lastError timezone changeCursor}}`, { workspaceId })).journalFlowStatus;
}
export async function trades(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalTradesV2: JournalTrade[] }>(`query JournalTradesV2($workspaceId:String!){journalTradesV2(workspaceId:$workspaceId){${TRADE_FIELDS}}}`, { workspaceId })).journalTradesV2;
}
export async function detail(fetcher: GraphQLFetcher, workspaceId: string, entryId: string) {
  return fetcher<{ journalTradeV2: JournalTrade | null; journalContextV2: TradeContext; journalReviewDraftV2: ReviewDraft; journalExecutionsV2: Execution[]; journalGroupingHistoryV2: GroupingHistory[]; journalReviewHistoryV2: {id:string;version:number;takeaway:string;choiceIds:string[];planAdherence:string|null;createdAt:string;entryRevision:number;contextRevision:number}[] }>(`query JournalDetailV2($workspaceId:String!,$entryId:String!){
    journalTradeV2(workspaceId:$workspaceId,entryId:$entryId){${TRADE_FIELDS}}
    journalContextV2(workspaceId:$workspaceId,entryId:$entryId){${CONTEXT_FIELDS}}
    journalReviewDraftV2(workspaceId:$workspaceId,entryId:$entryId){${DRAFT_FIELDS}}
    journalExecutionsV2(workspaceId:$workspaceId,entryId:$entryId){transactionId role side quantity price fee executedAt precision sourceQuantity heldBy{entryId direction openedAt blocked quantity} startingPosition}
    journalReviewHistoryV2(workspaceId:$workspaceId,entryId:$entryId){id version takeaway choiceIds planAdherence createdAt entryRevision contextRevision}
    journalGroupingHistoryV2(workspaceId:$workspaceId,entryId:$entryId){id kind state createdAt entryIds}
  }`, { workspaceId, entryId });
}

export type Command = { query: string; variables: Record<string, unknown>; field: string; clientId: string; mutationId: string };
export function command(query: string, field: string, variables: Record<string, unknown>, owner: string): Command {
  const key = `tradstry:journal-client:${owner}`;
  let clientId = localStorage.getItem(key);
  if (!clientId) { clientId = crypto.randomUUID(); localStorage.setItem(key, clientId); }
  return { query, field, variables, clientId, mutationId: crypto.randomUUID() };
}
export async function execute<T>(fetcher: GraphQLFetcher, request: Command): Promise<T> {
  const data = await fetcher<Record<string, T>>(request.query, { ...request.variables, clientId: request.clientId, mutationId: request.mutationId });
  return data[request.field]!;
}
export const SAVE_CONTEXT = `mutation SaveJournalContext($workspaceId:String!,$input:JournalContextInputV2!,$clientId:String!,$mutationId:String!){saveJournalContext(workspaceId:$workspaceId,input:$input,clientId:$clientId,mutationId:$mutationId){${CONTEXT_FIELDS}}}`;
export const SAVE_DRAFT = `mutation SaveJournalReviewDraft($workspaceId:String!,$input:JournalReviewDraftInputV2!,$clientId:String!,$mutationId:String!){saveJournalReviewDraft(workspaceId:$workspaceId,input:$input,clientId:$clientId,mutationId:$mutationId){${DRAFT_FIELDS}}}`;
export const MARK_REVIEWED = `mutation MarkJournalTradeReviewed($workspaceId:String!,$input:JournalFinalizeReviewInputV2!,$clientId:String!,$mutationId:String!){markJournalTradeReviewed(workspaceId:$workspaceId,input:$input,clientId:$clientId,mutationId:$mutationId){id entryId version entryRevision contextRevision takeaway choiceIds planAdherence createdAt}}`;
export const ENSURE_NOTE = `mutation EnsureJournalContextNote($workspaceId:String!,$entryId:String!,$clientId:String!,$mutationId:String!){ensureJournalContextNote(workspaceId:$workspaceId,entryId:$entryId,clientId:$clientId,mutationId:$mutationId)}`;
export const OPEN_SESSION = `mutation OpenJournalReviewSession($workspaceId:String!,$date:String,$refresh:Boolean!,$expectedVersion:Int,$clientId:String!,$mutationId:String!){openJournalReviewSession(workspaceId:$workspaceId,date:$date,refresh:$refresh,expectedVersion:$expectedVersion,clientId:$clientId,mutationId:$mutationId){${SESSION_FIELDS}}}`;
export const MOVE_CURSOR = `mutation MoveJournalReviewCursor($workspaceId:String!,$sessionId:String!,$entryId:String!,$expectedVersion:Int!,$clientId:String!,$mutationId:String!){moveJournalReviewCursor(workspaceId:$workspaceId,sessionId:$sessionId,entryId:$entryId,expectedVersion:$expectedVersion,clientId:$clientId,mutationId:$mutationId)}`;
export async function previewGrouping(fetcher: GraphQLFetcher, workspaceId: string, input: GroupingInput, separateFrom: string[] = []) {
  return (await fetcher<{ previewJournalGrouping: GroupingPreview }>(`mutation PreviewJournalGrouping($workspaceId:String!,$input:JournalGroupingInputV2!,$separateFrom:[String!]!=[]){previewJournalGrouping(workspaceId:$workspaceId,input:$input,separateFrom:$separateFrom){${PREVIEW_FIELDS}}}`, { workspaceId, input, separateFrom })).previewJournalGrouping;
}
export async function previewUndo(fetcher: GraphQLFetcher, workspaceId: string, operationId: string) {
  return (await fetcher<{ previewUndoJournalGrouping: GroupingPreview }>(`mutation PreviewUndoJournalGrouping($workspaceId:String!,$operationId:String!){previewUndoJournalGrouping(workspaceId:$workspaceId,operationId:$operationId){${PREVIEW_FIELDS}}}`, { workspaceId, operationId })).previewUndoJournalGrouping;
}
export type Suggestion = { id: string; entryId: string; explanation: string; previousConfirmations: number };
export async function suggestions(fetcher: GraphQLFetcher, workspaceId: string, entryId: string | null = null, offset = 0) {
  return (await fetcher<{ journalGroupingSuggestionsV2: Suggestion[] }>(`query JournalSuggestionsV2($workspaceId:String!,$entryId:String,$offset:Int!){journalGroupingSuggestionsV2(workspaceId:$workspaceId,entryId:$entryId,offset:$offset){id entryId explanation previousConfirmations}}`, { workspaceId, entryId, offset })).journalGroupingSuggestionsV2;
}
export async function previewSuggestion(fetcher: GraphQLFetcher, workspaceId: string, suggestionId: string, adjustment: GroupingInput | null = null) {
  return (await fetcher<{ previewJournalSuggestion: GroupingPreview }>(`mutation PreviewJournalSuggestion($workspaceId:String!,$suggestionId:String!,$adjustment:JournalGroupingInputV2){previewJournalSuggestion(workspaceId:$workspaceId,suggestionId:$suggestionId,adjustment:$adjustment){${PREVIEW_FIELDS}}}`, { workspaceId, suggestionId, adjustment })).previewJournalSuggestion;
}
export const KEEP_SEPARATE = `mutation KeepManualTradeSeparate($workspaceId:String!,$entryId:String!,$expectedVersion:Int!,$clientId:String!,$mutationId:String!){keepManualTradeSeparate(workspaceId:$workspaceId,entryId:$entryId,expectedVersion:$expectedVersion,clientId:$clientId,mutationId:$mutationId){${TRADE_FIELDS}}}`;
export const DISMISS_SUGGESTION = `mutation DismissJournalSuggestion($workspaceId:String!,$suggestionId:String!,$clientId:String!,$mutationId:String!){dismissJournalSuggestion(workspaceId:$workspaceId,suggestionId:$suggestionId,clientId:$clientId,mutationId:$mutationId)}`;
export const RESET_LEARNING = `mutation ResetJournalLearning($workspaceId:String!,$clientId:String!,$mutationId:String!){resetJournalLearning(workspaceId:$workspaceId,clientId:$clientId,mutationId:$mutationId)}`;
export type Preparation = { sourceRevision: number; brokerRecords: number; existingEntries: number; linkedEntries: number; readyTrades: number; attentionGroups: number; conflictingLinks: number; firstExecution: string | null; timezone: string; enabled: boolean };
export async function prepare(fetcher: GraphQLFetcher, workspaceId: string, flatBefore: string | null) {
  return (await fetcher<{ prepareJournalFlow: Preparation }>(`query PrepareJournalFlow($workspaceId:String!,$flatBefore:String){prepareJournalFlow(workspaceId:$workspaceId,flatBefore:$flatBefore){sourceRevision brokerRecords existingEntries linkedEntries readyTrades attentionGroups conflictingLinks firstExecution timezone enabled}}`, { workspaceId, flatBefore })).prepareJournalFlow;
}
export const ENABLE_FLOW = `mutation EnableJournalFlow($workspaceId:String!,$expectedRevision:Int!,$flatBefore:String,$timezone:String!,$clientId:String!,$mutationId:String!){enableJournalFlow(workspaceId:$workspaceId,expectedRevision:$expectedRevision,flatBefore:$flatBefore,timezone:$timezone,clientId:$clientId,mutationId:$mutationId){enabled sourceRevision queued}}`;
export type TradeChart = {
  availability: string; message: string | null; seriesKind: string; symbol: string; provider: string | null;
  interval: string; priceBasis: string; currency: string | null; timezone: string; start: number; end: number;
  bars: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];
  markers: { transactionId: string; timestamp: number | null; precision: string; side: string; price: string; quantity: string }[];
};
export async function chart(fetcher: GraphQLFetcher, workspaceId: string, entryId: string, from: number | null, to: number | null) {
  return (await fetcher<{ journalTradeChartV2: TradeChart }>(`query JournalChartV2($workspaceId:String!,$entryId:String!,$from:Int,$to:Int){journalTradeChartV2(workspaceId:$workspaceId,entryId:$entryId,from:$from,to:$to){availability message seriesKind symbol provider interval priceBasis currency timezone start end bars{timestamp open high low close volume} markers{transactionId timestamp precision side price quantity}}}`, { workspaceId, entryId, from, to })).journalTradeChartV2;
}
export const CONFIRM_GROUPING = `mutation ConfirmJournalGrouping($workspaceId:String!,$token:String!,$clientId:String!,$mutationId:String!){confirmJournalGrouping(workspaceId:$workspaceId,token:$token,clientId:$clientId,mutationId:$mutationId){operationId entryIds}}`;
export function exitIssue(reason: unknown): ExitIssue | null {
  if (!(reason instanceof GraphQLRequestError) || reason.code !== "EXIT_EXCEEDS_POSITION") return null;
  const { transactionId, positionBefore, exitQuantity, shortBy } = reason.extensions;
  return [transactionId, positionBefore, exitQuantity, shortBy].every((value) => typeof value === "string")
    ? { transactionId, positionBefore, exitQuantity, shortBy } as ExitIssue
    : null;
}
export type OpeningPositionInput = { direction: string; quantity: string; averagePrice: string; asOf: string };
export type OpeningPosition = { id: string; direction: string; quantity: string; averagePrice: string; asOf: string; olderHistory: boolean };
export type OpeningTrade = { direction: string; openedAt: string; closedAt: string | null; enteredQuantity: string; remainingQuantity: string; realizedNet: string | null; feesPaid: string | null; startingPosition: boolean };
const OPENING_FIELDS = `id direction quantity averagePrice asOf olderHistory`;
export async function openingPosition(fetcher: GraphQLFetcher, workspaceId: string, entryId: string) {
  return (await fetcher<{ journalOpeningPositionV2: OpeningPosition | null }>(`query JournalOpeningPositionV2($workspaceId:String!,$entryId:String!){journalOpeningPositionV2(workspaceId:$workspaceId,entryId:$entryId){${OPENING_FIELDS}}}`, { workspaceId, entryId })).journalOpeningPositionV2;
}
export async function openingPreview(fetcher: GraphQLFetcher, workspaceId: string, entryId: string, input: OpeningPositionInput) {
  return (await fetcher<{ journalOpeningPreviewV2: { trades: OpeningTrade[] } }>(`query JournalOpeningPreviewV2($workspaceId:String!,$entryId:String!,$input:JournalOpeningPositionInputV2!){journalOpeningPreviewV2(workspaceId:$workspaceId,entryId:$entryId,input:$input){trades{direction openedAt closedAt enteredQuantity remainingQuantity realizedNet feesPaid startingPosition}}}`, { workspaceId, entryId, input })).journalOpeningPreviewV2.trades;
}
export const SAVE_OPENING = `mutation SaveJournalOpeningPosition($workspaceId:String!,$entryId:String!,$input:JournalOpeningPositionInputV2!,$separateFrom:[String!]!=[],$clientId:String!,$mutationId:String!){saveJournalOpeningPosition(workspaceId:$workspaceId,entryId:$entryId,input:$input,separateFrom:$separateFrom,clientId:$clientId,mutationId:$mutationId){${OPENING_FIELDS}}}`;
export const REMOVE_OPENING = `mutation RemoveJournalOpeningPosition($workspaceId:String!,$positionId:String!,$clientId:String!,$mutationId:String!){removeJournalOpeningPosition(workspaceId:$workspaceId,positionId:$positionId,clientId:$clientId,mutationId:$mutationId)}`;

export type ActionNote = { id: string; kind: "plan" | "hindsight"; parentId: string | null; anchorExecutionId: string; anchorRole: string; reason: string; stopPrice: string | null; targetPrice: string | null; locked: boolean; writtenLate: boolean; orphaned: boolean; version: number; createdAt: string; updatedAt: string };
export type TradeAction = { kind: "entry" | "add" | "trim" | "exit"; role: string; anchorExecutionId: string; executionIds: string[]; quantity: string; price: string; fee: string; firstExecutedAt: string; lastExecutedAt: string; positionAfter: string; joinId: string | null; notes: ActionNote[] };
export type TradeActions = { entryId: string; direction: string | null; closed: boolean; actions: TradeAction[]; suggestedJoins: string[][]; brokenJoins: string[] };
export type ActionNoteInput = { entryId: string; anchorExecutionId: string; anchorRole: string; expectedVersion: number | null; reason: string; stopPrice: string | null; targetPrice: string | null };
export type StopBoundary = "before_planned_stop" | "at_or_near_planned_stop" | "beyond_planned_stop";
export type OutcomeAction = { anchorExecutionId: string; kind: TradeAction["kind"]; quantity: string; price: string; plannedStop: string | null; plannedTarget: string | null; distanceFromStopR: string | null; boundary: StopBoundary | null };
export type RUnavailable = "position_still_open" | "no_planned_stop" | "stop_on_wrong_side" | "fees_unknown";
export type TradeOutcome = { plannedStop: string | null; stopSource: "entry_note" | "trade_context" | "none"; enteredQuantity: string; entryPrice: string; exitPrice: string | null; fees: string; realizedNet: string | null; initialRisk: string | null; realizedR: string | null; realizedRUnavailable: RUnavailable | null; actions: OutcomeAction[]; flags: ("no_entry_note" | "entry_beyond_stop" | "exit_beyond_stop")[] };
export type HoldingsMismatch = { instrumentKey: string; symbol: string; held: string; imported: string; message: string; entryId: string | null };
export type BrokenJoin = { joinId: string; entryId: string; symbol: string; executionIds: string[] };
export type ContinuationSuggestion = { fromSymbol: string; toSymbol: string; quantity: string; executionId: string; openingExecutionId: string; executedAt: string; explanation: string };

const NOTE_FIELDS = `id kind parentId anchorExecutionId anchorRole reason stopPrice targetPrice locked writtenLate orphaned version createdAt updatedAt`;
export async function tradeActions(fetcher: GraphQLFetcher, workspaceId: string, entryId: string) {
  return (await fetcher<{ journalTradeActionsV2: TradeActions }>(`query JournalTradeActionsV2($workspaceId:String!,$entryId:String!){journalTradeActionsV2(workspaceId:$workspaceId,entryId:$entryId){entryId direction closed suggestedJoins brokenJoins actions{kind role anchorExecutionId executionIds quantity price fee firstExecutedAt lastExecutedAt positionAfter joinId notes{${NOTE_FIELDS}}}}}`, { workspaceId, entryId })).journalTradeActionsV2;
}
export async function tradeOutcome(fetcher: GraphQLFetcher, workspaceId: string, entryId: string) {
  return (await fetcher<{ journalTradeOutcomeV2: TradeOutcome | null }>(`query JournalTradeOutcomeV2($workspaceId:String!,$entryId:String!){journalTradeOutcomeV2(workspaceId:$workspaceId,entryId:$entryId){plannedStop stopSource enteredQuantity entryPrice exitPrice fees realizedNet initialRisk realizedR realizedRUnavailable flags actions{anchorExecutionId kind quantity price plannedStop plannedTarget distanceFromStopR boundary}}}`, { workspaceId, entryId })).journalTradeOutcomeV2;
}
export async function holdingsMismatches(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalHoldingsMismatchesV2: HoldingsMismatch[] }>(`query JournalHoldingsMismatchesV2($workspaceId:String!){journalHoldingsMismatchesV2(workspaceId:$workspaceId){instrumentKey symbol held imported message entryId}}`, { workspaceId })).journalHoldingsMismatchesV2;
}
export async function continuationSuggestions(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalContinuationSuggestionsV2: ContinuationSuggestion[] }>(`query JournalContinuationSuggestionsV2($workspaceId:String!){journalContinuationSuggestionsV2(workspaceId:$workspaceId){fromSymbol toSymbol quantity executionId openingExecutionId executedAt explanation}}`, { workspaceId })).journalContinuationSuggestionsV2;
}
export async function orphanedNotes(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalOrphanedNotesV2: ActionNote[] }>(`query JournalOrphanedNotesV2($workspaceId:String!){journalOrphanedNotesV2(workspaceId:$workspaceId){${NOTE_FIELDS}}}`, { workspaceId })).journalOrphanedNotesV2;
}
export async function brokenJoins(fetcher: GraphQLFetcher, workspaceId: string) {
  return (await fetcher<{ journalBrokenJoinsV2: BrokenJoin[] }>(`query JournalBrokenJoinsV2($workspaceId:String!){journalBrokenJoinsV2(workspaceId:$workspaceId){joinId entryId symbol executionIds}}`, { workspaceId })).journalBrokenJoinsV2;
}
export const KEEP_ORPHANED_NOTE = `mutation KeepJournalOrphanedNote($workspaceId:String!,$noteId:String!,$clientId:String!,$mutationId:String!){keepJournalOrphanedNote(workspaceId:$workspaceId,noteId:$noteId,clientId:$clientId,mutationId:$mutationId)}`;
export const SAVE_ACTION_NOTE = `mutation SaveJournalActionNote($workspaceId:String!,$input:JournalActionNoteInputV2!,$clientId:String!,$mutationId:String!){saveJournalActionNote(workspaceId:$workspaceId,input:$input,clientId:$clientId,mutationId:$mutationId){${NOTE_FIELDS}}}`;
export const ADD_HINDSIGHT_NOTE = `mutation AddJournalHindsightNote($workspaceId:String!,$parentId:String!,$reason:String!,$clientId:String!,$mutationId:String!){addJournalHindsightNote(workspaceId:$workspaceId,parentId:$parentId,reason:$reason,clientId:$clientId,mutationId:$mutationId){${NOTE_FIELDS}}}`;
export const JOIN_ACTIONS = `mutation JoinJournalActions($workspaceId:String!,$entryId:String!,$executionIds:[String!]!,$clientId:String!,$mutationId:String!){joinJournalActions(workspaceId:$workspaceId,entryId:$entryId,executionIds:$executionIds,clientId:$clientId,mutationId:$mutationId)}`;
export const UNJOIN_ACTIONS = `mutation UnjoinJournalActions($workspaceId:String!,$joinId:String!,$clientId:String!,$mutationId:String!){unjoinJournalActions(workspaceId:$workspaceId,joinId:$joinId,clientId:$clientId,mutationId:$mutationId)}`;
export const ANSWER_CONTINUATION = `mutation AnswerJournalContinuation($workspaceId:String!,$executionId:String!,$openingExecutionId:String!,$samePosition:Boolean!,$clientId:String!,$mutationId:String!){answerJournalContinuation(workspaceId:$workspaceId,executionId:$executionId,openingExecutionId:$openingExecutionId,samePosition:$samePosition,clientId:$clientId,mutationId:$mutationId)}`;
export const SKIP_REVIEW = `mutation SkipJournalTradeReview($workspaceId:String!,$entryId:String!,$reason:String!,$sessionId:String,$clientId:String!,$mutationId:String!){skipJournalTradeReview(workspaceId:$workspaceId,entryId:$entryId,reason:$reason,sessionId:$sessionId,clientId:$clientId,mutationId:$mutationId)}`;
export const UNSKIP_REVIEW = `mutation UnskipJournalTradeReview($workspaceId:String!,$entryId:String!,$clientId:String!,$mutationId:String!){unskipJournalTradeReview(workspaceId:$workspaceId,entryId:$entryId,clientId:$clientId,mutationId:$mutationId)}`;
