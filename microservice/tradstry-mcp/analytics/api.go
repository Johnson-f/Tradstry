package analytics

import (
	"context"
	"time"

	"tradstry-mcp/graphql"
)

const (
	metricFields   = `tradeCount netProfit winRate expectancyDollars expectancyR profitFactor`
	coverageFields = `coverage { brokerTrades manualTrades manualWithoutFees openPositions needsReview possibleDuplicates }`
	groupFields    = `key metrics { ` + metricFields + ` }`

	contextQuery = `query AnalyticsContext($id: String!) {
  workspace(id: $id) { currency }
  journalFlowStatus(workspaceId: $id) { timezone }
}`
	namesQuery = `query AnalyticsNames($workspaceId: String!) {
  playbooks(workspaceId: $workspaceId) { id name }
  principles(workspaceId: $workspaceId) { id title }
}`
	performanceQuery = `query Performance($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
  advancedAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) {
    ` + coverageFields + `
    tradeCount netProfit winRate profitFactor averageGain averageLoss expectancyDollars
    maxDrawdownDollars currentDrawdownDollars longestWinStreak longestLossStreak currentStreak
    avgHoldWinnersSecs avgHoldLosersSecs expectancyR rTradeCount rTypedStopCount
    byDay { ` + groupFields + ` }
  }
}`
	dailyQuery = `query DailyPnl($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
  advancedAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) {
    ` + coverageFields + `
    tradeCount netProfit
    byDay { ` + groupFields + ` }
  }
}`
	mistakesQuery = `query MistakeCosts($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
  advancedAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) {
    ` + coverageFields + `
    tradeCount
    tagBreakdowns { categoryName role tags { ` + groupFields + ` } }
    byViolatedPrinciple { ` + groupFields + ` }
    discipline { mistakeCost flawedTradeCount }
    cleanVsFlawed { clean { ` + metricFields + ` } flawed { ` + metricFields + ` } }
  }
}`
)

// breakdownFields maps each breakdown the tools offer to the analytics field
// that holds it.
var breakdownFields = map[string]string{
	"symbol":        "bySymbol { " + groupFields + " }",
	"playbook":      "byPlaybook { " + groupFields + " }",
	"tag":           "tagBreakdowns { categoryName role tags { " + groupFields + " } }",
	"direction":     "byDirection { " + groupFields + " }",
	"holding_time":  "byHolding { " + groupFields + " }",
	"day_of_week":   "byDayOfWeek { " + groupFields + " }",
	"session":       "bySession { " + groupFields + " }",
	"position_size": "byPositionSize { " + groupFields + " }",
}

func breakdownQuery(dimension string) string {
	return `query Breakdown($workspaceId: String!, $timeFilter: AnalyticsTimeFilterInput!) {
  advancedAnalytics(workspaceId: $workspaceId, timeFilter: $timeFilter) { ` + coverageFields + ` tradeCount netProfit ` + breakdownFields[dimension] + ` }
}`
}

type metrics struct {
	TradeCount        int      `json:"tradeCount"`
	NetProfit         float64  `json:"netProfit"`
	WinRate           float64  `json:"winRate"`
	ExpectancyDollars float64  `json:"expectancyDollars"`
	ExpectancyR       *float64 `json:"expectancyR"`
	ProfitFactor      *float64 `json:"profitFactor"`
}

type group struct {
	Key     string  `json:"key"`
	Metrics metrics `json:"metrics"`
}

type category struct {
	CategoryName string  `json:"categoryName"`
	Role         *string `json:"role"`
	Tags         []group `json:"tags"`
}

type analytics struct {
	TradeCount             int        `json:"tradeCount"`
	NetProfit              float64    `json:"netProfit"`
	WinRate                float64    `json:"winRate"`
	ProfitFactor           *float64   `json:"profitFactor"`
	AverageGain            float64    `json:"averageGain"`
	AverageLoss            float64    `json:"averageLoss"`
	ExpectancyDollars      float64    `json:"expectancyDollars"`
	MaxDrawdownDollars     float64    `json:"maxDrawdownDollars"`
	CurrentDrawdownDollars float64    `json:"currentDrawdownDollars"`
	LongestWinStreak       int        `json:"longestWinStreak"`
	LongestLossStreak      int        `json:"longestLossStreak"`
	CurrentStreak          int        `json:"currentStreak"`
	AvgHoldWinnersSecs     *float64   `json:"avgHoldWinnersSecs"`
	AvgHoldLosersSecs      *float64   `json:"avgHoldLosersSecs"`
	ExpectancyR            *float64   `json:"expectancyR"`
	RTradeCount            int        `json:"rTradeCount"`
	RTypedStopCount        int        `json:"rTypedStopCount"`
	ByDay                  []group    `json:"byDay"`
	BySymbol               []group    `json:"bySymbol"`
	ByPlaybook             []group    `json:"byPlaybook"`
	ByDirection            []group    `json:"byDirection"`
	ByHolding              []group    `json:"byHolding"`
	ByDayOfWeek            []group    `json:"byDayOfWeek"`
	BySession              []group    `json:"bySession"`
	ByPositionSize         []group    `json:"byPositionSize"`
	ByViolatedPrinciple    []group    `json:"byViolatedPrinciple"`
	TagBreakdowns          []category `json:"tagBreakdowns"`
	Discipline             struct {
		MistakeCost      float64 `json:"mistakeCost"`
		FlawedTradeCount int     `json:"flawedTradeCount"`
	} `json:"discipline"`
	CleanVsFlawed struct {
		Clean  metrics `json:"clean"`
		Flawed metrics `json:"flawed"`
	} `json:"cleanVsFlawed"`
	Coverage struct {
		BrokerTrades       int `json:"brokerTrades"`
		ManualTrades       int `json:"manualTrades"`
		ManualWithoutFees  int `json:"manualWithoutFees"`
		OpenPositions      int `json:"openPositions"`
		NeedsReview        int `json:"needsReview"`
		PossibleDuplicates int `json:"possibleDuplicates"`
	} `json:"coverage"`
}

type workspaceContext struct {
	Currency string
	Location *time.Location
}

type named struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

type api struct {
	client *graphql.Client
}

func (a api) context(ctx context.Context, token, ws string) (workspaceContext, error) {
	var data struct {
		Workspace *struct {
			Currency string `json:"currency"`
		} `json:"workspace"`
		Status struct {
			Timezone string `json:"timezone"`
		} `json:"journalFlowStatus"`
	}
	if err := a.client.Do(ctx, token, contextQuery, map[string]any{"id": ws}, &data); err != nil {
		return workspaceContext{}, err
	}
	if data.Workspace == nil {
		return workspaceContext{}, errWorkspaceNotFound
	}
	// The backend counts trading days in the journal time zone, New York when unset.
	location, err := time.LoadLocation(data.Status.Timezone)
	if err != nil || data.Status.Timezone == "" {
		location, _ = time.LoadLocation("America/New_York")
	}
	return workspaceContext{Currency: data.Workspace.Currency, Location: location}, nil
}

func (a api) analytics(ctx context.Context, token, ws, query string, w window) (analytics, error) {
	var data struct {
		Analytics analytics `json:"advancedAnalytics"`
	}
	err := a.client.Do(ctx, token, query, map[string]any{"workspaceId": ws, "timeFilter": w.filter()}, &data)
	return data.Analytics, err
}

func (a api) names(ctx context.Context, token, ws string) (playbooks, principles map[string]string, err error) {
	var data struct {
		Playbooks  []named `json:"playbooks"`
		Principles []named `json:"principles"`
	}
	if err := a.client.Do(ctx, token, namesQuery, map[string]any{"workspaceId": ws}, &data); err != nil {
		return nil, nil, err
	}
	playbooks, principles = map[string]string{}, map[string]string{}
	for _, p := range data.Playbooks {
		playbooks[p.ID] = p.Name
	}
	for _, p := range data.Principles {
		principles[p.ID] = p.Title
	}
	return playbooks, principles, nil
}
