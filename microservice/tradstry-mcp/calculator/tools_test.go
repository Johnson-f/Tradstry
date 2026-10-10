package calculator_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"tradstry-mcp/mcptest"
)

type fakeAPI struct {
	mu        sync.Mutex
	rule      map[string]any
	balance   any
	plans     []map[string]any
	history   []map[string]any
	planEdits []map[string]any
	deleted   []string
}

func newFake() *fakeAPI {
	return &fakeAPI{
		rule:    map[string]any{"accountBalance": 8000.0, "accountRisk": 1.0, "maxStopLossPct": 5.0},
		balance: 10000.0,
	}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := req.Variables
	input, _ := v["input"].(map[string]any)
	switch {
	case strings.Contains(req.Query, "CalculatorSettings"):
		var rule any
		if f.rule != nil {
			rule = f.rule
		}
		return data(map[string]any{"positionCalculatorRule": rule, "workspace": map[string]any{"totalValue": f.balance, "currency": "USD"}})
	case strings.Contains(req.Query, "upsertPositionCalculatorRule"):
		f.rule = map[string]any{"accountBalance": input["accountBalance"], "accountRisk": input["accountRisk"], "maxStopLossPct": input["maxStopLossPct"]}
		return data(map[string]any{"upsertPositionCalculatorRule": f.rule})
	case strings.Contains(req.Query, "createPositionCalculatorPlan"):
		var tranches []any
		for i, raw := range input["tranches"].([]any) {
			t := raw.(map[string]any)
			tranches = append(tranches, map[string]any{"id": fmt.Sprintf("tr%d", i+1), "percent": t["percent"], "shares": t["shares"],
				"targetPrice": t["targetPrice"], "status": "planned", "filledAt": nil})
		}
		p := map[string]any{"id": "plan1", "workspaceId": "ws1", "symbol": input["symbol"], "positionType": input["positionType"],
			"entryPrice": input["entryPrice"], "stopLoss": input["stopLoss"], "accountBalance": input["accountBalance"],
			"accountRisk": input["accountRisk"], "totalShares": input["totalShares"], "positionValue": input["positionValue"],
			"status": "active", "tranches": tranches, "notes": input["notes"], "instrumentJson": nil, "createdAt": "2026-10-10T00:00:00Z"}
		f.plans = append(f.plans, p)
		return data(map[string]any{"createPositionCalculatorPlan": p})
	case strings.Contains(req.Query, "updatePositionCalculatorPlan"):
		f.planEdits = append(f.planEdits, input)
		p := f.plans[0]
		if status, ok := input["status"]; ok {
			p["status"] = status
		}
		for _, raw := range asList(input["tranches"]) {
			change := raw.(map[string]any)
			for _, t := range p["tranches"].([]any) {
				tr := t.(map[string]any)
				if tr["id"] == change["id"] {
					for key, value := range change {
						tr[key] = value
					}
				}
			}
		}
		return data(map[string]any{"updatePositionCalculatorPlan": p})
	case strings.Contains(req.Query, "deletePositionCalculatorPlan"):
		f.deleted = append(f.deleted, fmt.Sprint(v["id"]))
		return data(map[string]any{"deletePositionCalculatorPlan": true})
	case strings.Contains(req.Query, "positionCalculatorPlans"):
		return data(map[string]any{"positionCalculatorPlans": f.plans})
	case strings.Contains(req.Query, "createPositionCalculatorHistory"):
		entry := map[string]any{"id": fmt.Sprintf("h%d", len(f.history)+1), "createdAt": "2026-10-10T00:00:00Z", "tranches": []any{}}
		for key, value := range input {
			if key != "tranches" && key != "workspaceId" {
				entry[key] = value
			}
		}
		if _, ok := entry["planId"]; !ok {
			entry["planId"] = nil
		}
		f.history = append(f.history, entry)
		return data(map[string]any{"createPositionCalculatorHistory": entry})
	case strings.Contains(req.Query, "positionCalculatorHistory"):
		return data(map[string]any{"positionCalculatorHistory": f.history})
	}
	return `{"data":null,"errors":[{"message":"unexpected"}]}`
}

func asList(v any) []any {
	list, _ := v.([]any)
	return list
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

type calculation struct {
	AccountBalance float64  `json:"account_balance"`
	BalanceSource  string   `json:"balance_source"`
	RiskBudget     float64  `json:"risk_budget"`
	TotalShares    float64  `json:"total_shares"`
	TotalRisk      float64  `json:"total_risk"`
	AccountPercent float64  `json:"account_percent"`
	Warnings       []string `json:"warnings"`
}

type planView struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Note    string `json:"note"`
	Entries []struct {
		Number int     `json:"number"`
		Price  float64 `json:"price"`
		Shares float64 `json:"shares"`
		Status string  `json:"status"`
	} `json:"entries"`
}

func TestCalculateUsesTheBrokerBalanceAndWarnsOnAWideStop(t *testing.T) {
	api := newFake()
	s := mcptest.Start(t, api.respond)
	session := s.Connect(t, nil)

	result, out := mcptest.Call[calculation](t, session, "calculate_position", map[string]any{
		"workspace_id": "ws1", "direction": "long", "entry_price": 50, "stop": 48,
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if out.BalanceSource != "broker" || out.RiskBudget != 100 || out.TotalShares != 50 || out.AccountPercent != 25 || len(out.Warnings) != 0 {
		t.Errorf("calculation = %+v", out)
	}
	for _, r := range s.Requests() {
		if strings.Contains(r.Query, "mutation") {
			t.Error("calculate_position saved something")
		}
	}

	api.balance = nil
	_, wide := mcptest.Call[calculation](t, session, "calculate_position", map[string]any{
		"workspace_id": "ws1", "direction": "long", "entry_price": 50, "stop": 45,
	})
	if wide.BalanceSource != "saved rule" || len(wide.Warnings) != 1 || !strings.Contains(wide.Warnings[0], "5% maximum") {
		t.Errorf("wide stop = %+v", wide)
	}
}

func TestCalculateAsksForWhatItCannotKnow(t *testing.T) {
	api := newFake()
	api.rule, api.balance = nil, nil
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[calculation](t, session, "calculate_position", map[string]any{"workspace_id": "ws1", "direction": "long", "entry_price": 50, "stop": 48})
	if !strings.Contains(mcptest.Text(result), "ask the user for their account balance") {
		t.Errorf("no balance: %q", mcptest.Text(result))
	}
	result, _ = mcptest.Call[calculation](t, session, "calculate_position", map[string]any{"workspace_id": "ws1", "direction": "long", "entry_price": 50, "stop": 52, "account_balance": 5000, "risk_percent": 1})
	if !strings.Contains(mcptest.Text(result), "must be below") {
		t.Errorf("stop above a long: %q", mcptest.Text(result))
	}
}

func TestSaveCalculationRecordsTheServersNumbers(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[calculation](t, session, "save_calculation", map[string]any{
		"workspace_id": "ws1", "symbol": "aapl", "direction": "short", "entry_price": 50, "stop": 53,
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	h := api.history[0]
	if h["symbol"] != "AAPL" || h["shares"] != 33.33 || h["positionType"] != "short" {
		t.Errorf("history = %v", h)
	}
}

func TestAPlanCompletesIntoHistoryWhenEveryEntryIsSettled(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, plan := mcptest.Call[planView](t, session, "create_position_plan", map[string]any{
		"workspace_id": "ws1", "symbol": "NVDA", "direction": "long", "stop": 90, "account_balance": 20000, "risk_percent": 1,
		"entries": []map[string]any{{"price": 100, "risk_share_percent": 50}, {"price": 95, "risk_share_percent": 50}},
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if len(plan.Entries) != 2 || plan.Entries[0].Shares != 10 || plan.Entries[1].Shares != 20 {
		t.Fatalf("plan = %+v", plan)
	}

	_, partial := mcptest.Call[planView](t, session, "update_position_plan", map[string]any{
		"workspace_id": "ws1", "plan_id": plan.ID, "entries": []map[string]any{{"number": 1, "status": "filled", "fill_price": 101}},
	})
	if partial.Status != "active" || partial.Entries[0].Shares != 9.09 || len(api.history) != 0 {
		t.Errorf("after the first fill = %+v, history %v", partial, api.history)
	}

	_, done := mcptest.Call[planView](t, session, "update_position_plan", map[string]any{
		"workspace_id": "ws1", "plan_id": plan.ID, "entries": []map[string]any{{"number": 2, "status": "skipped"}},
	})
	if done.Status != "completed" || len(api.history) != 1 || api.history[0]["planId"] != "plan1" || api.history[0]["shares"] != 9.09 {
		t.Errorf("completed = %+v, history %v", done, api.history)
	}
	result, _ = mcptest.Call[planView](t, session, "update_position_plan", map[string]any{"workspace_id": "ws1", "plan_id": plan.ID, "cancel": true})
	if !strings.Contains(mcptest.Text(result), "already completed") {
		t.Errorf("update a completed plan: %q", mcptest.Text(result))
	}
}

func TestAPlanWithNothingFilledIsCancelled(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)
	_, plan := mcptest.Call[planView](t, session, "create_position_plan", map[string]any{
		"workspace_id": "ws1", "symbol": "AMD", "direction": "long", "entry_price": 150, "stop": 145,
	})
	_, out := mcptest.Call[planView](t, session, "update_position_plan", map[string]any{
		"workspace_id": "ws1", "plan_id": plan.ID, "entries": []map[string]any{{"number": 1, "status": "skipped"}},
	})
	if out.Status != "cancelled" || len(api.history) != 0 {
		t.Errorf("result = %+v", out)
	}
}

func TestRiskRulesMergeAndDeletesWaitForTheUser(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	_, rules := mcptest.Call[struct {
		RiskPercent    float64 `json:"risk_percent"`
		MaxStopPercent float64 `json:"max_stop_percent"`
	}](t, session, "set_risk_rules", map[string]any{"workspace_id": "ws1", "risk_percent": 0.5})
	if rules.RiskPercent != 0.5 || rules.MaxStopPercent != 5 {
		t.Errorf("rules = %+v", rules)
	}

	_, plan := mcptest.Call[planView](t, session, "create_position_plan", map[string]any{
		"workspace_id": "ws1", "symbol": "AMD", "direction": "long", "entry_price": 150, "stop": 145,
	})
	_, first := mcptest.Call[struct {
		Status string `json:"status"`
	}](t, session, "delete_position_plan", map[string]any{"workspace_id": "ws1", "plan_id": plan.ID})
	if first.Status != "needs_confirmation" || len(api.deleted) != 0 {
		t.Errorf("delete = %+v, deleted %v", first, api.deleted)
	}
}
