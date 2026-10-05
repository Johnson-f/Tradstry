import type { GraphQLFetcher } from "@tradstry/app-ui/lib/client";

export type JournalTrade = {
  id: string; workspaceId: string; sourceKind: string; episodeId: string | null;
  symbol: string; symbolName: string; direction: string; currency: string | null;
  openDate: string | null; closeDate: string | null; entryPrice: string | null;
  exitPrice: string | null; enteredQuantity: string | null; remainingQuantity: string | null;
  realizedNet: string | null; feesPaid: string | null; contractMultiplier: string;
  lifecycleState: "open" | "closed" | "incomplete"; reviewState: "unreviewed" | "reviewed" | "outdated";
  outcome: "profit" | "loss" | "breakeven" | "unknown"; tags: { id: string; name: string; color: string | null }[];
  recordVersion: number; materializedRevision: number; issueCode: string | null;
  issueMessage: string | null; possibleDuplicates:string[]; retiredAt: string | null; successorId: string | null;
};
export type FlowStatus = { apiVersion: number; enabled: boolean; sourceRevision: number; projectionRevision: number; importState: string; lastError: string | null; timezone: string; changeCursor: string };
export type TradeContext = { notes: string | null; tagIds: string[]; violatedPrincipleIds: string[]; entryId: string; version: number; stopState: "unknown" | "none" | "price"; stopPrice: string | null; legacyStopPrice: string | null; playbookId: string | null; noteId: string | null; phase: string | null; recordedAt: string | null; claimedAt: string | null };
export type ReviewDraft = { entryId: string; version: number; takeaway: string; choiceIds: string[]; planAdherence: string | null };
export type ReviewSession = { id: string; date: string; timezone: string; queue: string[]; completed: string[]; cursorEntryId: string | null; version: number; refreshAvailable: boolean };
export type Execution = { transactionId: string; role: string; side: string; quantity: string; price: string; fee: string | null; executedAt: string | null; precision: string; sourceQuantity: string };
export type GroupingInput = { direction?: string; entryIds: string[]; groups: { entryId: string | null; allocations: { transactionId: string; quantity: string }[] }[] };
export type PreviewGroup = { entryId: string; direction: string; remainingQuantity: string; enteredQuantity: string; feesPaid: string | null; realizedNet: string | null; allocations: { transactionId: string; role: string; quantity: string; price: string; fee: string | null; executedAt: string }[] };
export type GroupingPreview = { token: string; entryIds: string[]; realizedNet: (string | null)[]; beforeGroups: PreviewGroup[]; groups: PreviewGroup[] };
export type GroupingResult = { operationId: string; entryIds: string[] };
export type GroupingHistory = { id: string; kind: string; state: string; createdAt: string; entryIds:string[] };

export const TRADE_FIELDS = `id workspaceId sourceKind episodeId symbol symbolName direction currency openDate closeDate entryPrice exitPrice enteredQuantity remainingQuantity realizedNet feesPaid contractMultiplier lifecycleState outcome tags { id name color } reviewState recordVersion materializedRevision issueCode issueMessage possibleDuplicates retiredAt successorId`;
export const CONTEXT_FIELDS = `entryId version stopState stopPrice legacyStopPrice playbookId noteId phase recordedAt claimedAt notes tagIds violatedPrincipleIds`;
export const DRAFT_FIELDS = `entryId version takeaway choiceIds planAdherence`;
export const SESSION_FIELDS = `id date timezone queue completed cursorEntryId version refreshAvailable`;
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
    journalExecutionsV2(workspaceId:$workspaceId,entryId:$entryId){transactionId role side quantity price fee executedAt precision sourceQuantity}
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
export async function previewGrouping(fetcher: GraphQLFetcher, workspaceId: string, input: GroupingInput) {
  return (await fetcher<{ previewJournalGrouping: GroupingPreview }>(`mutation PreviewJournalGrouping($workspaceId:String!,$input:JournalGroupingInputV2!){previewJournalGrouping(workspaceId:$workspaceId,input:$input){${PREVIEW_FIELDS}}}`, { workspaceId, input })).previewJournalGrouping;
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
