import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { graphql } from '@/lib/client/backend'
import { LABEL_REF, TRADES_KEY } from '@/lib/client/trades/trades'
import type { Decimal, LabelRef } from '@/lib/client/trades/trades-model'

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

export interface EquityPoint {
  /** A New York trading day, `YYYY-MM-DD`. */
  day: string
  net: Decimal
  cumulative: Decimal
  trades: number
  wins: number
  losses: number
}

/** Trading days grouped by how many trades closed on them. */
export interface DayLoad {
  key: string
  days: number
  trades: number
  net: Decimal
  averageDay: Decimal | null
  winRate: Decimal | null
}

/** Results by what the trader recorded about their behavior; unrecorded trades are left out. */
export interface BehaviorStats {
  recorded: number
  averageConviction: Decimal | null
  averageRuleAdherence: Decimal | null
  byConviction: Bucket[]
  byMarketRegime: Bucket[]
  byPlanned: Bucket[]
  byRevenge: Bucket[]
  byThirtyMinuteRule: Bucket[]
  byRuleAdherence: Bucket[]
}

export interface PlanStats {
  /** Closed trades linked to a plan. */
  fromPlan: number
  /** Plans made in the period that were skipped. */
  skipped: number
  byPlan: Bucket[]
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
  averageWinPct: Decimal | null
  averageLossPct: Decimal | null
  largestWin: Decimal | null
  largestLoss: Decimal | null
  profitFactor: Decimal | null
  expectancy: Decimal | null
  expectancyR: Decimal | null
  rTrades: number
  sqn: Decimal | null
  recoveryFactor: Decimal | null
  averageHoldSeconds: number | null
  averageWinHoldSeconds: number | null
  averageLossHoldSeconds: number | null
  maxDrawdown: Decimal
  currentDrawdown: Decimal
  longestWinStreak: number
  longestLossStreak: number
  currentStreak: number
  equity: EquityPoint[]
  bySymbol: Bucket[]
  byDirection: Bucket[]
  byWeekday: Bucket[]
  byHour: Bucket[]
  bySession: Bucket[]
  byMonth: Bucket[]
  byHold: Bucket[]
  bySize: Bucket[]
  rDistribution: Bucket[]
  byEdge: Bucket[]
  byEntryTactic: Bucket[]
  byTag: Bucket[]
  byMistake: Bucket[]
  edgeTactic: EdgeTacticCell[]
  mistakeCosts: MistakeCost[]
  byDiscipline: Bucket[]
  byPreviousTrade: Bucket[]
  tradesPerDay: DayLoad[]
  behavior: BehaviorStats
  plans: PlanStats
  untagged: number
}

const BUCKET = 'key trades wins losses net winRate labelId color expectancy expectancyR'

/** Closed-trade statistics for a workspace, or every workspace when it is null. */
export function useTradeStats(workspaceId: string | null, from: string | null, to: string | null = null) {
  return useQuery({
    queryKey: [...TRADES_KEY, workspaceId ?? 'all', 'stats', from, to],
    queryFn: () =>
      graphql<{ tradeStats: TradeStats }>(
        `query TradeStats($w: ID, $from: DateTime, $to: DateTime) { tradeStats(workspaceId: $w, from: $from, to: $to) {
          trades wins losses breakeven winRate net grossProfit grossLoss averageWin averageLoss averageWinPct
          averageLossPct largestWin largestLoss profitFactor expectancy expectancyR rTrades sqn recoveryFactor
          averageHoldSeconds averageWinHoldSeconds averageLossHoldSeconds maxDrawdown currentDrawdown longestWinStreak
          longestLossStreak currentStreak equity { day net cumulative trades wins losses }
          bySymbol { ${BUCKET} } byDirection { ${BUCKET} } byWeekday { ${BUCKET} } byHour { ${BUCKET} }
          bySession { ${BUCKET} } byMonth { ${BUCKET} } byHold { ${BUCKET} } bySize { ${BUCKET} }
          rDistribution { ${BUCKET} } byEdge { ${BUCKET} } byEntryTactic { ${BUCKET} } byTag { ${BUCKET} }
          byMistake { ${BUCKET} } byDiscipline { ${BUCKET} } byPreviousTrade { ${BUCKET} }
          edgeTactic { edge { ${LABEL_REF} } entryTactic { ${LABEL_REF} } trades wins losses net winRate expectancy }
          mistakeCosts { mistake { ${LABEL_REF} } trades net expectancyWith expectancyWithout }
          tradesPerDay { key days trades net averageDay winRate }
          behavior { recorded averageConviction averageRuleAdherence byConviction { ${BUCKET} }
            byMarketRegime { ${BUCKET} } byPlanned { ${BUCKET} } byRevenge { ${BUCKET} }
            byThirtyMinuteRule { ${BUCKET} } byRuleAdherence { ${BUCKET} } }
          plans { fromPlan skipped byPlan { ${BUCKET} } }
          untagged
        } }`,
        { w: workspaceId, from, to },
      ),
    select: (data) => data.tradeStats,
    placeholderData: keepPreviousData,
  })
}
