import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { graphql } from '@/lib/client/backend'
import { useBrokerageStatus, useSyncStatus } from '@/lib/client/brokerage/brokerage'
import type { Decimal, LabelRef, OptionDetail, TradeAnnotation, TradeIssue, TradeSummary } from './trades-model'
import { loadAllTrades, type TradePage } from './trade-list'

const OPTION_FIELDS = 'underlying expiry right strike multiplier'
export const LABEL_REF = 'id kind name color archived'
const ANNOTATION_FIELDS = `id tradeId notes edges { ${LABEL_REF} } entryTactics { ${LABEL_REF} } tags { ${LABEL_REF} }
  mistakes { ${LABEL_REF} } initialStop plannedRisk version updatedAt orphaned`
export const TRADE_FIELDS = `id kind workspaceId parentId children instrumentKey assetClass symbol underlying
  option { ${OPTION_FIELDS} } direction status openedAt closedAt maxQuantity openQuantity avgEntry avgExit
  gross fees net income returnPct holdingSeconds fillCount nonEconomic related strategyLabel
  issues { code severity message instrumentKey fillKey tradeId } annotation { ${ANNOTATION_FIELDS} }
  rMultiple mark unrealized`

/** Every trade query lives under this key; any change refetches them all. */
export const TRADES_KEY = ['trades']

export function useInvalidateTrades() {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: TRADES_KEY }), [queryClient])
}

export interface TradeFilter {
  status?: string | null
  direction?: string | null
  symbol?: string | null
  edgeId?: string | null
  entryTacticId?: string | null
  tagId?: string | null
  mistakeId?: string | null
}

export type TradeSort = 'OPENED_DESC' | 'OPENED_ASC' | 'NET_DESC' | 'NET_ASC'

export function useTrades(workspaceId: string, filter: TradeFilter, sort: TradeSort) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId, 'list', filter, sort],
    queryFn: ({ signal }) => loadAllTrades(async (offset, limit) => {
      signal.throwIfAborted()
      const data = await graphql<{ trades: TradePage }>(
        `query Trades($w: ID!, $filter: TradeFilterInput!, $sort: TradeSort!, $offset: Int!, $limit: Int!) {
          trades(workspaceId: $w, filter: $filter, sort: $sort, offset: $offset, limit: $limit) { total items { ${TRADE_FIELDS} } }
        }`,
        { w: workspaceId, filter, sort, offset, limit },
      )
      return data.trades
    }),
    placeholderData: keepPreviousData,
  })
}

export interface TradeFill {
  key: string
  role: string
  executedAt: string
  quantity: Decimal
  price: Decimal
  fee: Decimal
  derived: boolean
  manual: boolean
}

export interface LotClosure {
  closedBy: string
  closedAt: string
  quantity: Decimal
  exitPrice: Decimal
  fee: Decimal
  gross: Decimal
  kind: string
  nonEconomic: boolean
  taxProceeds: Decimal | null
  taxCost: Decimal | null
  taxRealized: Decimal | null
  washDisallowed: Decimal | null
  washPermanent: boolean | null
  term: string | null
}

export interface TradeLot {
  id: string
  direction: string
  openedBy: string
  acquiredAt: string
  holdingFrom: string
  originalQuantity: Decimal
  quantity: Decimal
  costPerUnit: Decimal
  taxCostAdjustment: Decimal
  washBasisAdjustment: Decimal
  costKnown: boolean
  closures: LotClosure[]
}

export interface SuggestedStop {
  price: Decimal
  orderType: string
  placedAt: string
  status: string | null
}

export interface TradeDetail {
  trade: TradeSummary
  suggestedStop: SuggestedStop | null
  fills: TradeFill[]
  lots: TradeLot[]
  legs: TradeSummary[]
  parent: TradeSummary | null
  related: TradeSummary[]
}

export function useTrade(workspaceId: string, tradeId: string) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId, 'detail', tradeId],
    queryFn: () =>
      graphql<{ trade: TradeDetail | null }>(
        `query Trade($w: ID!, $id: ID!) { trade(workspaceId: $w, id: $id) {
          trade { ${TRADE_FIELDS} }
          suggestedStop { price orderType placedAt status }
          fills { key role executedAt quantity price fee derived manual }
          lots { id direction openedBy acquiredAt holdingFrom originalQuantity quantity costPerUnit taxCostAdjustment
            washBasisAdjustment costKnown closures { closedBy closedAt quantity exitPrice fee gross kind nonEconomic
            taxProceeds taxCost taxRealized washDisallowed washPermanent term } }
          legs { ${TRADE_FIELDS} } parent { ${TRADE_FIELDS} } related { ${TRADE_FIELDS} }
        } }`,
        { w: workspaceId, id: tradeId },
      ),
    select: (data) => data.trade,
  })
}

export function useOpenPositions(workspaceId: string) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId, 'open'],
    queryFn: () =>
      graphql<{ openPositions: TradeSummary[] }>(
        `query OpenPositions($w: ID!) { openPositions(workspaceId: $w) { ${TRADE_FIELDS} } }`,
        { w: workspaceId },
      ),
    select: (data) => data.openPositions,
  })
}

export interface AliasSuggestion {
  fromKey: string
  toKey: string
  fromSymbol: string
  toSymbol: string
  effectiveAt: string
  reason: string
}

export interface DecisionView {
  id: string
  kind: string
  createdAt: string
  status: 'applied' | 'stale' | 'conflict'
  code: string | null
  tradeIds: string[]
}

export interface OpeningPosition {
  id: string
  symbol: string
  instrumentKey: string
  option: OptionDetail | null
  quantity: Decimal
  costPerUnit: Decimal
  acquiredAt: string
  asOf: string
}

export interface TradeAttention {
  rebuiltAt: string | null
  issues: TradeIssue[]
  aliasSuggestions: AliasSuggestion[]
  strategySuggestions: Array<{ underlying: string; trades: TradeSummary[] }>
  decisions: DecisionView[]
  orphanedAnnotations: TradeAnnotation[]
  openingPositions: OpeningPosition[]
  unattributedIncome: Array<{ symbol: string; at: string; amount: Decimal }>
  aliases: Array<{ fromKey: string; toKey: string; effectiveAt: string }>
}

export function useTradeAttention(workspaceId: string) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId, 'attention'],
    queryFn: () =>
      graphql<{ tradeAttention: TradeAttention }>(
        `query TradeAttention($w: ID!) { tradeAttention(workspaceId: $w) {
          rebuiltAt issues { code severity message instrumentKey fillKey tradeId }
          aliasSuggestions { fromKey toKey fromSymbol toSymbol effectiveAt reason }
          strategySuggestions { underlying trades { ${TRADE_FIELDS} } }
          decisions { id kind createdAt status code tradeIds }
          orphanedAnnotations { ${ANNOTATION_FIELDS} }
          openingPositions { id symbol instrumentKey option { ${OPTION_FIELDS} } quantity costPerUnit acquiredAt asOf }
          unattributedIncome { symbol at amount }
          aliases { fromKey toKey effectiveAt }
        } }`,
        { w: workspaceId },
      ),
    select: (data) => data.tradeAttention,
  })
}

export interface Bucket {
  key: string
  trades: number
  wins: number
  losses: number
  net: Decimal
  winRate: Decimal | null
  labelId: string | null
  color: string | null
  expectancy: Decimal | null
  expectancyR: Decimal | null
}

export interface EdgeTacticCell {
  edge: LabelRef | null
  entryTactic: LabelRef | null
  trades: number
  wins: number
  losses: number
  net: Decimal
  winRate: Decimal | null
  expectancy: Decimal | null
}

export interface MistakeCost {
  mistake: LabelRef
  trades: number
  net: Decimal
  expectancyWith: Decimal | null
  expectancyWithout: Decimal | null
}

export interface TradeStats {
  trades: number
  wins: number
  losses: number
  breakeven: number
  winRate: Decimal | null
  net: Decimal
  grossProfit: Decimal
  grossLoss: Decimal
  averageWin: Decimal | null
  averageLoss: Decimal | null
  largestWin: Decimal | null
  largestLoss: Decimal | null
  profitFactor: Decimal | null
  expectancy: Decimal | null
  expectancyR: Decimal | null
  rTrades: number
  averageHoldSeconds: number | null
  maxDrawdown: Decimal
  currentDrawdown: Decimal
  longestWinStreak: number
  longestLossStreak: number
  currentStreak: number
  equity: Array<{ day: string; net: Decimal; cumulative: Decimal }>
  bySymbol: Bucket[]
  byDirection: Bucket[]
  byWeekday: Bucket[]
  byHour: Bucket[]
  byHold: Bucket[]
  byEdge: Bucket[]
  byEntryTactic: Bucket[]
  byTag: Bucket[]
  byMistake: Bucket[]
  edgeTactic: EdgeTacticCell[]
  mistakeCosts: MistakeCost[]
  untagged: number
}

const BUCKET = 'key trades wins losses net winRate labelId color expectancy expectancyR'

export function useTradeStats(workspaceId: string | null, from: string | null) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId ?? 'all', 'stats', from],
    queryFn: () =>
      graphql<{ tradeStats: TradeStats }>(
        `query TradeStats($w: ID, $from: DateTime) { tradeStats(workspaceId: $w, from: $from) {
          trades wins losses breakeven winRate net grossProfit grossLoss averageWin averageLoss largestWin largestLoss
          profitFactor expectancy expectancyR rTrades averageHoldSeconds maxDrawdown currentDrawdown longestWinStreak
          longestLossStreak currentStreak equity { day net cumulative }
          bySymbol { ${BUCKET} } byDirection { ${BUCKET} } byWeekday { ${BUCKET} } byHour { ${BUCKET} }
          byHold { ${BUCKET} } byEdge { ${BUCKET} } byEntryTactic { ${BUCKET} } byTag { ${BUCKET} } byMistake { ${BUCKET} }
          edgeTactic { edge { ${LABEL_REF} } entryTactic { ${LABEL_REF} } trades wins losses net winRate expectancy }
          mistakeCosts { mistake { ${LABEL_REF} } trades net expectancyWith expectancyWithout }
          untagged
        } }`,
        { w: workspaceId, from },
      ),
    select: (data) => data.tradeStats,
    placeholderData: keepPreviousData,
  })
}

export interface ManualFill {
  id: string
  symbol: string
  assetClass: string
  option: OptionDetail | null
  side: string
  quantity: Decimal
  price: Decimal
  fee: Decimal
  intent: string | null
  executedAt: string
  note: string
  version: number
}

export function useManualFills(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId, 'manual-fills'],
    queryFn: () =>
      graphql<{ manualFills: ManualFill[] }>(
        `query ManualFills($w: ID!) { manualFills(workspaceId: $w) {
          id symbol assetClass option { ${OPTION_FIELDS} } side quantity price fee intent executedAt note version
        } }`,
        { w: workspaceId },
      ),
    select: (data) => data.manualFills,
    enabled,
  })
}

export interface TaxTotals {
  proceeds: Decimal
  cost: Decimal
  washDisallowed: Decimal
  gain: Decimal
}

export interface TaxRow {
  symbol: string
  workspaceId: string
  tradeId: string
  direction: string
  quantity: Decimal
  acquiredAt: string
  soldAt: string
  proceeds: Decimal
  cost: Decimal
  washDisallowed: Decimal
  washPermanent: boolean
  gain: Decimal
  term: 'short' | 'long'
  code: string | null
}

export interface TaxReport {
  year: number
  years: number[]
  shortTerm: TaxTotals
  longTerm: TaxTotals
  total: TaxTotals
  rows: TaxRow[]
}

const TOTALS = 'proceeds cost washDisallowed gain'

export function useTaxReport(year: number | null) {
  return useQuery({
    queryKey: [...TRADES_KEY, 'tax', year],
    queryFn: () =>
      graphql<{ taxReport: TaxReport }>(
        `query TaxReport($year: Int) { taxReport(year: $year) {
          year years shortTerm { ${TOTALS} } longTerm { ${TOTALS} } total { ${TOTALS} }
          rows { symbol workspaceId tradeId direction quantity acquiredAt soldAt proceeds cost washDisallowed washPermanent gain term code }
        } }`,
        { year },
      ),
    select: (data) => data.taxReport,
    placeholderData: keepPreviousData,
  })
}

function useTradeMutation<Variables, Result>(run: (variables: Variables) => Promise<Result>) {
  const invalidate = useInvalidateTrades()
  return useMutation({ mutationFn: run, onSuccess: () => invalidate() })
}

export function useAddManualFill(workspaceId: string) {
  return useTradeMutation((input: Record<string, unknown>) =>
    graphql<{ addManualFill: string }>(
      'mutation AddManualFill($w: ID!, $input: ManualFillInputObject!) { addManualFill(workspaceId: $w, input: $input) }',
      { w: workspaceId, input },
    ),
  )
}

export function useUpdateManualFill() {
  return useTradeMutation(({ id, version, input }: { id: string; version: number; input: Record<string, unknown> }) =>
    graphql(
      'mutation UpdateManualFill($id: ID!, $v: Int!, $input: ManualFillInputObject!) { updateManualFill(id: $id, expectedVersion: $v, input: $input) }',
      { id, v: version, input },
    ),
  )
}

export function useDeleteManualFill() {
  return useTradeMutation((id: string) =>
    graphql('mutation DeleteManualFill($id: ID!) { deleteManualFill(id: $id) }', { id }),
  )
}

export function useSetOpeningPosition(workspaceId: string) {
  return useTradeMutation((input: Record<string, unknown>) =>
    graphql(
      'mutation SetOpeningPosition($w: ID!, $input: OpeningPositionInput!) { setOpeningPosition(workspaceId: $w, input: $input) }',
      { w: workspaceId, input },
    ),
  )
}

export function useDeleteOpeningPosition() {
  return useTradeMutation((id: string) =>
    graphql('mutation DeleteOpeningPosition($id: ID!) { deleteOpeningPosition(id: $id) }', { id }),
  )
}

export function useAnswerAlias() {
  return useTradeMutation(
    ({ suggestion, confirm }: { suggestion: Pick<AliasSuggestion, 'fromKey' | 'toKey' | 'effectiveAt'>; confirm: boolean }) =>
      confirm
        ? graphql('mutation ConfirmAlias($f: String!, $t: String!, $at: DateTime!) { confirmAlias(fromKey: $f, toKey: $t, effectiveAt: $at) }', {
            f: suggestion.fromKey,
            t: suggestion.toKey,
            at: suggestion.effectiveAt,
          })
        : graphql('mutation RejectAlias($f: String!, $t: String!) { rejectAlias(fromKey: $f, toKey: $t) }', {
            f: suggestion.fromKey,
            t: suggestion.toKey,
          }),
  )
}

export function useRemoveAlias() {
  return useTradeMutation(({ fromKey, toKey }: { fromKey: string; toKey: string }) =>
    graphql('mutation RemoveAlias($f: String!, $t: String!) { removeAlias(fromKey: $f, toKey: $t) }', { f: fromKey, t: toKey }),
  )
}

export interface DecisionInput {
  kind: 'merge' | 'split' | 'combine_legs'
  tradeIds?: string[]
  tradeId?: string
  atFill?: string
  label?: string
}

export interface DecisionPreview {
  status: 'applied' | 'stale' | 'conflict'
  code: string | null
  trades: Array<{
    id: string
    kind: string
    symbol: string
    direction: string | null
    status: string
    openedAt: string
    closedAt: string | null
    fillCount: number
    net: Decimal | null
  }>
}

export function previewDecision(workspaceId: string, decision: DecisionInput) {
  return graphql<{ previewTradeDecision: DecisionPreview }>(
    `mutation PreviewDecision($w: ID!, $d: TradeDecisionInput!) { previewTradeDecision(workspaceId: $w, decision: $d) {
      status code trades { id kind symbol direction status openedAt closedAt fillCount net }
    } }`,
    { w: workspaceId, d: decision },
  ).then((data) => data.previewTradeDecision)
}

export function useApplyDecision(workspaceId: string) {
  return useTradeMutation((decision: DecisionInput) =>
    graphql<{ applyTradeDecision: { decisionId: string; tradeIds: string[] } }>(
      'mutation ApplyDecision($w: ID!, $d: TradeDecisionInput!) { applyTradeDecision(workspaceId: $w, decision: $d) { decisionId tradeIds } }',
      { w: workspaceId, d: decision },
    ).then((data) => data.applyTradeDecision),
  )
}

export function useUndoDecision() {
  return useTradeMutation((id: string) =>
    graphql('mutation UndoDecision($id: ID!) { undoTradeDecision(id: $id) }', { id }),
  )
}

export function useSaveAnnotation(workspaceId: string, tradeId: string) {
  const invalidate = useInvalidateTrades()
  return useMutation({
    networkMode: 'always',
    onSuccess: () => invalidate(),
    mutationFn: ({ version, input }: { version: number | null; input: Record<string, unknown> }) =>
      graphql<{ saveTradeAnnotation: TradeAnnotation }>(
        `mutation SaveAnnotation($w: ID!, $t: ID!, $v: Int, $input: TradeAnnotationInput!) {
          saveTradeAnnotation(workspaceId: $w, tradeId: $t, expectedVersion: $v, input: $input) { ${ANNOTATION_FIELDS} }
        }`,
        { w: workspaceId, t: tradeId, v: version, input },
      ).then((data) => data.saveTradeAnnotation),
  })
}

export function useReassignAnnotation() {
  return useTradeMutation(({ id, tradeId }: { id: string; tradeId: string }) =>
    graphql('mutation ReassignAnnotation($id: ID!, $t: ID!) { reassignTradeAnnotation(id: $id, tradeId: $t) }', { id, t: tradeId }),
  )
}

export function useDeleteAnnotation() {
  return useTradeMutation((id: string) =>
    graphql('mutation DeleteAnnotation($id: ID!) { deleteTradeAnnotation(id: $id) }', { id }),
  )
}

/** Whether fills are entered by hand here; undefined while loading. */
export function useIsManualWorkspace(workspaceId: string): boolean | undefined {
  const status = useBrokerageStatus()
  const available = status.data?.available === true
  const sync = useSyncStatus(workspaceId, available)
  if (status.isPending) return undefined
  if (!available) return true
  if (sync.isPending) return undefined
  return sync.data === null
}
