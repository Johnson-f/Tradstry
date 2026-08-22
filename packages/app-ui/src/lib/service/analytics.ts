import type { GraphQLFetcher } from "@tradstry/app-ui/lib/client";
import type {
  AdvancedAnalytics,
  AnalyticsTimeFilterInput,
  CalendarAnalytics,
  JournalAnalytics,
  TradingPerformance,
} from "@tradstry/app-ui/lib/types/analytics";

const TRADE_OUTCOME_FIELDS = `
  symbol
  symbolName
  amount
`;

const JOURNAL_ANALYTICS_FIELDS = `
  winRate
  cumulativeProfit
  averageRiskToReward
  averageGain
  averageLoss
  averageGainPct
  averageLossPct
  profitFactor
  biggestWin {
    ${TRADE_OUTCOME_FIELDS}
  }
  biggestLoss {
    ${TRADE_OUTCOME_FIELDS}
  }
  rangeStart
  rangeEnd
`;

const CALENDAR_DAY_FIELDS = `
  date
  profit
  tradeCount
  winRate
  winningTradeCount
  breakevenTradeCount
  losingTradeCount
`;

const TRADING_PERFORMANCE_FIELDS = `
  totalRealizedPnl
  grossProfit
  grossLoss
  averageWin
  averageLoss
  profitFactor
  winRate
  closedTradeCount
  winningTradeCount
  breakevenTradeCount
  losingTradeCount
  averageRealizedR
  riskDefinedTradeCount
  openPositionCount
  needsReviewCount
  peakRealizedPnl
  currentDrawdown
  maxDrawdown
  currentStreak
  longestLossStreak
  bestSymbol { key netPnl winRate tradeCount }
  worstSymbol { key netPnl winRate tradeCount }
  bestDay { key netPnl winRate tradeCount }
  worstDay { key netPnl winRate tradeCount }
  points {
    date
    dailyPnl
    cumulativePnl
    drawdown
    closedTradeCount
  }
`;

const CALENDAR_WEEK_FIELDS = `
  weekIndex
  weekStart
  weekEnd
  profit
  tradeCount
  tradingDays
  winRate
  winningTradeCount
  breakevenTradeCount
  losingTradeCount
`;

const CALENDAR_ANALYTICS_FIELDS = `
  year
  month
  monthProfit
  tradeCount
  tradingDays
  winRate
  winningTradeCount
  breakevenTradeCount
  losingTradeCount
  gridStart
  gridEnd
  days {
    ${CALENDAR_DAY_FIELDS}
  }
  weeks {
    ${CALENDAR_WEEK_FIELDS}
  }
`;

const JOURNAL_ANALYTICS_QUERY = `
  query JournalAnalytics($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
    journalAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) {
      ${JOURNAL_ANALYTICS_FIELDS}
    }
  }
`;

const CALENDAR_ANALYTICS_QUERY = `
  query CalendarAnalytics($workspaceId: String!, $year: Int!, $month: Int!) {
    calendarAnalytics(workspaceId: $workspaceId, year: $year, month: $month) {
      ${CALENDAR_ANALYTICS_FIELDS}
    }
  }
`;

const TRADING_PERFORMANCE_QUERY = `
  query TradingPerformance($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
    tradingPerformance(workspaceId: $workspaceId, timeFilter: $timeFilter) {
      ${TRADING_PERFORMANCE_FIELDS}
    }
  }
`;

const GROUP_METRICS_FIELDS = `
  tradeCount
  netProfit
  winRate
  expectancyDollars
  expectancyR
  profitFactor
`;

const DIMENSION_STAT_FIELDS = `
  key
  metrics { ${GROUP_METRICS_FIELDS} }
`;

const ADVANCED_ANALYTICS_FIELDS = `
  tradeCount
  netProfit
  winRate
  expectancyDollars
  expectancyR
  rTradeCount
  profitFactor
  sqn
  averageGain
  averageLoss
  averageGainPct
  averageLossPct
  maxDrawdownDollars
  maxDrawdownPct
  currentDrawdownDollars
  recoveryFactor
  longestDrawdownDays
  equityCurve { closeDate equity }
  startingEquity
  accountEquity
  avgPlannedR
  avgActualR
  rDistribution { label count }
  longestWinStreak
  longestLossStreak
  currentStreak
  avgHoldWinnersSecs
  avgHoldLosersSecs
  monthlyWinRateStdev
  tradesPerDay { avg max stdev }
  bySymbol { ${DIMENSION_STAT_FIELDS} }
  byDayOfWeek { ${DIMENSION_STAT_FIELDS} }
  bySession { ${DIMENSION_STAT_FIELDS} }
  byHolding { ${DIMENSION_STAT_FIELDS} }
  byDirection { ${DIMENSION_STAT_FIELDS} }
  byPositionSize { ${DIMENSION_STAT_FIELDS} }
  byPlaybook { ${DIMENSION_STAT_FIELDS} }
  byConviction { ${DIMENSION_STAT_FIELDS} }
  byMarketRegime { ${DIMENSION_STAT_FIELDS} }
  cleanVsFlawed {
    clean { ${GROUP_METRICS_FIELDS} }
    flawed { ${GROUP_METRICS_FIELDS} }
  }
  discipline {
    flawedTradeCount
    mistakeCost
    avgRuleAdherence
    avgConviction
    revengeTradeCount
    broke30MinCount
    tradesWithViolations
    totalViolations
  }
  tagBreakdowns {
    categoryName
    role
    tags { ${DIMENSION_STAT_FIELDS} }
  }
  rangeStart
  rangeEnd
`;

const ADVANCED_ANALYTICS_QUERY = `
  query AdvancedAnalytics($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
    advancedAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) {
      ${ADVANCED_ANALYTICS_FIELDS}
    }
  }
`;

export async function fetchAdvancedAnalytics(
  fetcher: GraphQLFetcher,
  workspaceId: string,
  timeFilter: AnalyticsTimeFilterInput,
): Promise<AdvancedAnalytics> {
  const data = await fetcher<{ advancedAnalytics: AdvancedAnalytics }>(
    ADVANCED_ANALYTICS_QUERY,
    { workspaceId, timeFilter },
  );
  return data.advancedAnalytics;
}

export async function fetchJournalAnalytics(
  fetcher: GraphQLFetcher,
  workspaceId: string,
  timeFilter: AnalyticsTimeFilterInput,
): Promise<JournalAnalytics> {
  const data = await fetcher<{ journalAnalytics: JournalAnalytics }>(
    JOURNAL_ANALYTICS_QUERY,
    { workspaceId, timeFilter },
  );
  return data.journalAnalytics;
}

export async function fetchTradingPerformance(
  fetcher: GraphQLFetcher,
  workspaceId: string,
  timeFilter: AnalyticsTimeFilterInput,
): Promise<TradingPerformance> {
  const data = await fetcher<{ tradingPerformance: TradingPerformance }>(
    TRADING_PERFORMANCE_QUERY,
    { workspaceId, timeFilter },
  );
  return data.tradingPerformance;
}

export async function fetchCalendarAnalytics(
  fetcher: GraphQLFetcher,
  workspaceId: string,
  year: number,
  month: number,
): Promise<CalendarAnalytics> {
  const data = await fetcher<{ calendarAnalytics: CalendarAnalytics }>(
    CALENDAR_ANALYTICS_QUERY,
    { workspaceId, year, month },
  );
  return data.calendarAnalytics;
}
