package analytics_test

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"tradstry-mcp/mcptest"
)

// fakeAPI answers the analytics operations for one workspace.
type fakeAPI struct {
	mu         sync.Mutex
	rTrades    int
	rTyped     int
	byPlaybook []any
}

func metric(trades int, net, win float64) map[string]any {
	return map[string]any{"tradeCount": trades, "netProfit": net, "winRate": win, "expectancyDollars": net / float64(trades), "expectancyR": nil, "profitFactor": nil}
}

func group(key string, trades int, net float64) map[string]any {
	return map[string]any{"key": key, "metrics": metric(trades, net, 50)}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case strings.Contains(req.Query, "AnalyticsContext"):
		if req.Variables["id"] == "missing" {
			return data(map[string]any{"workspace": nil, "journalFlowStatus": map[string]any{"timezone": "America/New_York"}})
		}
		return data(map[string]any{"workspace": map[string]any{"currency": "USD"}, "journalFlowStatus": map[string]any{"timezone": "America/New_York"}})
	case strings.Contains(req.Query, "AnalyticsTags"):
		return data(map[string]any{"tags": []any{map[string]any{"id": "tag1", "name": "FOMO"}}})
	case strings.Contains(req.Query, "AnalyticsNames"):
		return data(map[string]any{
			"playbooks":  []any{map[string]any{"id": "pb1", "name": "Breakout"}},
			"principles": []any{map[string]any{"id": "pr1", "title": "Wait for confirmation"}},
		})
	case strings.Contains(req.Query, "advancedAnalytics"):
		expectancyR := any(nil)
		if f.rTrades > 0 {
			expectancyR = 0.8
		}
		return data(map[string]any{"advancedAnalytics": map[string]any{
			"coverage":   map[string]any{"brokerTrades": 9, "manualTrades": 1, "manualWithoutFees": 1, "openPositions": 1, "needsReview": 3, "possibleDuplicates": 1},
			"tradeCount": 10, "netProfit": 1234.567, "winRate": 61.111, "profitFactor": nil,
			"averageGain": 300.4, "averageLoss": 150.2, "expectancyDollars": 123.4567,
			"maxDrawdownDollars": 400, "currentDrawdownDollars": 0, "longestWinStreak": 4, "longestLossStreak": 2, "currentStreak": -1,
			"avgHoldWinnersSecs": 5400.0, "avgHoldLosersSecs": nil, "expectancyR": expectancyR, "rTradeCount": f.rTrades, "rTypedStopCount": f.rTyped,
			"byDay":      []any{group("2026-09-02", 4, 900), group("2026-09-03", 6, 334.567)},
			"byPlaybook": f.byPlaybook,
			"bySession":  []any{group("morning", 10, 1234.567)},
			"tagBreakdowns": []any{
				map[string]any{"categoryName": "Mistakes", "role": "mistake", "tags": []any{group("FOMO", 3, -120), group("Chased entry", 2, -40)}},
				map[string]any{"categoryName": "Tactics", "role": "tactic", "tags": []any{group("Pullback", 5, 800)}},
			},
			"byViolatedPrinciple": []any{group("pr1", 2, -200), group("gone", 1, 10)},
			"discipline":          map[string]any{"mistakeCost": 310.5, "flawedTradeCount": 4},
			"cleanVsFlawed":       map[string]any{"clean": metric(6, 1500, 80), "flawed": metric(4, -265.433, 25)},
		}})
	}
	return `{"data":null,"errors":[{"message":"unexpected operation"}]}`
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

func start(t *testing.T, api *fakeAPI) *mcptest.Stack {
	return mcptest.Start(t, api.respond)
}

func requests(s *mcptest.Stack, operation string) []mcptest.Request {
	var found []mcptest.Request
	for _, req := range s.Requests() {
		if strings.Contains(req.Query, operation) {
			found = append(found, req)
		}
	}
	return found
}

type common struct {
	Period struct {
		From     string `json:"from"`
		To       string `json:"to"`
		Timezone string `json:"timezone"`
	} `json:"period"`
	Currency string `json:"currency"`
	Coverage struct {
		TradesCounted      int    `json:"trades_counted"`
		ManualTrades       int    `json:"manual_trades_included"`
		OpenNotCounted     int    `json:"open_positions_not_counted"`
		NeedsReview        int    `json:"trades_waiting_for_the_user"`
		PossibleDuplicates int    `json:"possible_duplicates"`
		Note               string `json:"note"`
	} `json:"coverage"`
}

func TestPerformanceReportsItsPeriodCurrencyAndCoverage(t *testing.T) {
	s := start(t, &fakeAPI{rTrades: 3, rTyped: 2})
	session := s.Connect(t, nil)

	result, out := mcptest.Call[struct {
		common
		NetProfit    float64               `json:"net_profit"`
		WinRate      float64               `json:"win_rate"`
		ProfitFactor *float64              `json:"profit_factor"`
		Expectancy   float64               `json:"expectancy"`
		HoldWinners  string                `json:"average_hold_winners"`
		HoldLosers   string                `json:"average_hold_losers"`
		BestDay      struct{ Date string } `json:"best_day"`
		WorstDay     struct{ Date string } `json:"worst_day"`
		R            string                `json:"r"`
	}](t, session, "get_performance", map[string]any{"workspace_id": "ws1", "month": "2026-09"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	filter := requests(s, "advancedAnalytics")[0].Variables["timeFilter"].(map[string]any)
	if filter["range"] != "CUSTOM" || filter["startDate"] != "2026-09-01T00:00:00-04:00" || filter["endDate"] != "2026-09-30T23:59:59.999999999-04:00" {
		t.Errorf("time filter = %v, want September in New York time", filter)
	}
	if out.Currency != "USD" || out.Period.From != "2026-09-01" || out.Period.To != "2026-09-30" || out.Period.Timezone != "America/New_York" {
		t.Errorf("period = %+v, currency %q", out.Period, out.Currency)
	}
	cv := out.Coverage
	if cv.TradesCounted != 10 || cv.ManualTrades != 1 || cv.OpenNotCounted != 1 || cv.NeedsReview != 3 || cv.PossibleDuplicates != 1 ||
		!strings.Contains(cv.Note, "Includes 1 manually entered trades. 1 of them have no fees entered, so their results are before fees") ||
		!strings.Contains(cv.Note, "1 manual trades may repeat a broker trade") || !strings.Contains(cv.Note, "resolve_possible_duplicate") ||
		!strings.Contains(cv.Note, "2 trades with missing or unclear history") {
		t.Errorf("coverage = %+v", cv)
	}
	if out.NetProfit != 1234.57 || out.WinRate != 61.1 || out.Expectancy != 123.46 || out.ProfitFactor != nil {
		t.Errorf("figures = %+v", out)
	}
	if out.HoldWinners != "1h30m0s" || out.HoldLosers != "" {
		t.Errorf("holds = %q / %q; an unknown hold must be left out", out.HoldWinners, out.HoldLosers)
	}
	if out.BestDay.Date != "2026-09-02" || out.WorstDay.Date != "2026-09-03" {
		t.Errorf("best %v worst %v", out.BestDay, out.WorstDay)
	}
	if !strings.Contains(out.R, "for 3 of 10 trades") || !strings.Contains(out.R, "2 of them use the stop typed with a manual trade") {
		t.Errorf("R = %q", out.R)
	}
}

func TestUnknownRIsSaidNotZeroed(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)
	_, out := mcptest.Call[struct {
		common
		R string `json:"r"`
	}](t, session, "get_performance", map[string]any{"workspace_id": "ws1", "period": "last_month"})
	if !strings.HasPrefix(out.R, "unknown") {
		t.Errorf("R = %q", out.R)
	}
	if out.Coverage.ManualTrades != 1 || !strings.Contains(out.Coverage.Note, "before fees") {
		t.Errorf("coverage = %+v; it must come from the analytics answer, journal on or off", out.Coverage)
	}
}

func TestDailyPnlStaysShort(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)
	for _, args := range []map[string]any{
		{"workspace_id": "ws1", "period": "all"},
		{"workspace_id": "ws1", "from": "2026-01-01", "to": "2026-06-30"},
	} {
		if result, _ := mcptest.Call[any](t, session, "get_daily_pnl", args); !result.IsError {
			t.Errorf("%v was answered", args)
		}
	}
	_, out := mcptest.Call[struct {
		common
		Days []struct {
			Name      string  `json:"name"`
			NetProfit float64 `json:"net_profit"`
		} `json:"days"`
	}](t, session, "get_daily_pnl", map[string]any{"workspace_id": "ws1", "month": "2026-09"})
	if len(out.Days) != 2 || out.Days[1].NetProfit != 334.57 {
		t.Errorf("days = %+v", out.Days)
	}
}

type breakdown struct {
	common
	Groups []struct {
		Name      string  `json:"name"`
		NetProfit float64 `json:"net_profit"`
	} `json:"groups"`
	CutShort  bool   `json:"cut_short"`
	AllGroups int    `json:"all_groups"`
	Note      string `json:"note"`
}

func TestBreakdownNamesGroupsAndKeepsTheWorst(t *testing.T) {
	s := start(t, &fakeAPI{byPlaybook: []any{group("pb1", 4, 900), group("none", 3, 50), group("pb-deleted", 3, -300)}})
	session := s.Connect(t, nil)

	_, out := mcptest.Call[breakdown](t, session, "get_breakdown", map[string]any{"workspace_id": "ws1", "month": "2026-09", "by": "playbook", "limit": 2})
	names := []string{}
	for _, g := range out.Groups {
		names = append(names, g.Name)
	}
	if strings.Join(names, ",") != "Breakout,a deleted playbook" || !out.CutShort || out.AllGroups != 3 {
		t.Errorf("groups = %v, cut short %v of %d", names, out.CutShort, out.AllGroups)
	}
	if !strings.Contains(requests(s, "advancedAnalytics")[0].Query, "byPlaybook") {
		t.Error("the breakdown asked for the wrong dimension")
	}

	_, sessions := mcptest.Call[breakdown](t, session, "get_breakdown", map[string]any{"workspace_id": "ws1", "month": "2026-09", "by": "session"})
	if !strings.Contains(sessions.Note, "New York") {
		t.Errorf("session note = %q", sessions.Note)
	}
	if result, _ := mcptest.Call[any](t, session, "get_breakdown", map[string]any{"workspace_id": "ws1", "by": "mood"}); !result.IsError {
		t.Error("an unknown breakdown was accepted")
	}
}

func TestMistakesAreRankedWorstFirst(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)
	_, out := mcptest.Call[struct {
		common
		Mistakes []struct {
			Kind      string  `json:"kind"`
			Name      string  `json:"name"`
			NetProfit float64 `json:"net_profit"`
		} `json:"mistakes"`
		Shortfall float64 `json:"shortfall_vs_clean_trades"`
		Note      string  `json:"note"`
	}](t, session, "get_mistake_costs", map[string]any{"workspace_id": "ws1", "month": "2026-09"})

	got := []string{}
	for _, m := range out.Mistakes {
		got = append(got, m.Kind+":"+m.Name)
	}
	want := "principle:Wait for confirmation,tag:FOMO,tag:Chased entry,principle:a deleted principle"
	if strings.Join(got, ",") != want {
		t.Errorf("mistakes = %v\nwant %s", got, want)
	}
	if out.Shortfall != 310.5 || !strings.Contains(out.Note, "not money lost because of it") {
		t.Errorf("shortfall %v, note %q", out.Shortfall, out.Note)
	}
}

func TestUnknownWorkspace(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)
	if result, _ := mcptest.Call[any](t, session, "get_performance", map[string]any{"workspace_id": "missing"}); !strings.Contains(mcptest.Text(result), "workspace not found") {
		t.Errorf("unknown workspace: %q", mcptest.Text(result))
	}
}

func TestAnalyticsForOnePlaybook(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)

	result, out := mcptest.Call[struct {
		common
		Playbook string `json:"playbook"`
	}](t, session, "get_performance", map[string]any{"workspace_id": "ws1", "month": "2026-09", "playbook": "breakout"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if got := requests(s, "advancedAnalytics")[0].Variables["playbookId"]; got != "pb1" {
		t.Errorf("playbookId sent = %v", got)
	}
	if out.Playbook != "Breakout" {
		t.Errorf("the answer must say which playbook it covers: %+v", out)
	}

	_, _ = mcptest.Call[any](t, session, "get_daily_pnl", map[string]any{"workspace_id": "ws1", "month": "2026-09"})
	if _, sent := requests(s, "advancedAnalytics")[1].Variables["playbookId"]; sent {
		t.Error("a playbook was sent although none was asked for")
	}
	result, _ = mcptest.Call[any](t, session, "get_breakdown", map[string]any{"workspace_id": "ws1", "by": "symbol", "playbook": "Scalping"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "Breakout") {
		t.Errorf("unknown playbook: %q", mcptest.Text(result))
	}
}

func TestAnalyticsForOneTag(t *testing.T) {
	s := start(t, &fakeAPI{})
	session := s.Connect(t, nil)

	result, out := mcptest.Call[struct {
		common
		Tag string `json:"tag"`
	}](t, session, "get_daily_pnl", map[string]any{"workspace_id": "ws1", "month": "2026-09", "tag": "fomo"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if got := requests(s, "advancedAnalytics")[0].Variables["tagId"]; got != "tag1" || out.Tag != "FOMO" {
		t.Errorf("tagId sent = %v, tag = %q", got, out.Tag)
	}
}
