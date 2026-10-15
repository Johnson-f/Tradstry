package journal_test

import (
	"fmt"
	"strings"
	"testing"

	"tradstry-mcp/mcptest"
)

type page struct {
	Matching   int    `json:"matching"`
	NextCursor string `json:"next_cursor"`
	Currency   string `json:"currency"`
	Trades     []struct {
		ID               string  `json:"id"`
		Symbol           string  `json:"symbol"`
		Currency         string  `json:"currency"`
		RealizedNet      string  `json:"realized_net"`
		Fees             *string `json:"fees"`
		FirstExecutionAt string  `json:"first_execution_at"`
		ExecutionCount   int     `json:"execution_count"`
		BoughtQuantity   string  `json:"bought_quantity"`
	} `json:"trades"`
}

func (p page) ids() []string {
	var ids []string
	for _, tr := range p.Trades {
		ids = append(ids, tr.ID)
	}
	return ids
}

func dated(id, opened, closed string) trade {
	t := newTrade(id, "AAPL", "closed", "unreviewed", closed)
	t["openDate"] = opened
	if closed == "" {
		t["lifecycleState"] = "open"
	}
	return t
}

func TestListTradesPagesThroughEveryMatch(t *testing.T) {
	s, api := start(t)
	api.trades = nil
	for i := 1; i <= 7; i++ {
		api.trades = append(api.trades, dated(fmt.Sprintf("t%d", i), fmt.Sprintf("2026-03-%02dT14:00:00Z", i), fmt.Sprintf("2026-03-%02dT15:00:00Z", i+10)))
	}
	session := s.Connect(t, nil)

	var seen []string
	args := map[string]any{"workspace_id": "ws1", "limit": 3}
	for pages := 0; ; pages++ {
		_, got := mcptest.Call[page](t, session, "list_trades", args)
		if got.Matching != 7 {
			t.Fatalf("page %d matching = %d, want the total across pages", pages, got.Matching)
		}
		seen = append(seen, got.ids()...)
		if got.NextCursor == "" {
			break
		}
		if pages > 5 {
			t.Fatal("cursor never ended")
		}
		args["cursor"] = got.NextCursor
	}
	if strings.Join(seen, ",") != "t7,t6,t5,t4,t3,t2,t1" {
		t.Errorf("pages gave %v", seen)
	}

	t.Run("a cursor only works with the filters that produced it", func(t *testing.T) {
		_, first := mcptest.Call[page](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "limit": 2})
		for name, other := range map[string]map[string]any{
			"another state":  {"state": "open"},
			"another sort":   {"sort": "closed"},
			"another window": {"opened_from": "2026-03-02"},
		} {
			args := map[string]any{"workspace_id": "ws1", "limit": 2, "cursor": first.NextCursor}
			for k, v := range other {
				args[k] = v
			}
			if result, _ := mcptest.Call[any](t, session, "list_trades", args); !result.IsError {
				t.Errorf("%s: cursor was accepted", name)
			}
		}
		if result, _ := mcptest.Call[any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "cursor": "garbage"}); !result.IsError {
			t.Error("a made-up cursor was accepted")
		}
	})
}

func TestDateFiltersAndSortUseTheSameDates(t *testing.T) {
	s, api := start(t)
	api.trades = []trade{
		dated("long-hold", "2026-03-03T14:00:00Z", "2026-03-23T15:00:00Z"),
		dated("early", "2026-03-01T14:00:00Z", "2026-03-02T15:00:00Z"),
		dated("late", "2026-03-10T14:00:00Z", "2026-03-11T15:00:00Z"),
		dated("still-open", "2026-03-15T14:00:00Z", ""),
	}
	session := s.Connect(t, nil)
	list := func(extra map[string]any) []string {
		args := map[string]any{"workspace_id": "ws1"}
		for k, v := range extra {
			args[k] = v
		}
		_, got := mcptest.Call[page](t, session, "list_trades", args)
		return got.ids()
	}
	join := func(ids []string) string { return strings.Join(ids, ",") }

	if got := join(list(nil)); got != "still-open,late,long-hold,early" {
		t.Errorf("sorted by opened = %s", got)
	}
	if got := join(list(map[string]any{"sort": "closed"})); got != "long-hold,late,early,still-open" {
		t.Errorf("sorted by closed = %s", got)
	}
	if got := join(list(map[string]any{"opened_from": "2026-03-03", "opened_to": "2026-03-10"})); got != "late,long-hold" {
		t.Errorf("opened window = %s", got)
	}
	if got := join(list(map[string]any{"closed_from": "2026-03-20"})); got != "long-hold" {
		t.Errorf("closed window = %s", got)
	}
	if got := join(list(map[string]any{"closed_to": "2026-03-11"})); got != "late,early" {
		t.Errorf("closed before = %s", got)
	}
	if result, _ := mcptest.Call[any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "opened_from": "March 3"}); !result.IsError {
		t.Error("a bad date was accepted")
	}
	if result, _ := mcptest.Call[any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "from": "2026-03-01"}); !result.IsError {
		t.Error("the old from filter still works")
	}
}

func TestIncompleteTradesFallBackToTheirExecutions(t *testing.T) {
	s, api := start(t)
	odd := newTrade("odd", "TSLA", "incomplete", "unreviewed", "")
	delete(odd, "openDate")
	delete(odd, "realizedNet")
	odd["firstExecutionAt"], odd["lastExecutionAt"] = "2026-02-02T15:00:00Z", "2026-02-09T15:00:00Z"
	odd["executionCount"], odd["boughtQuantity"] = 2, "5"
	api.trades = []trade{dated("t1", "2026-03-01T14:00:00Z", "2026-03-02T15:00:00Z"), odd}
	session := s.Connect(t, nil)

	_, got := mcptest.Call[page](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "opened_to": "2026-02-28"})
	if got.Matching != 1 || got.Trades[0].ID != "odd" {
		t.Fatalf("opened window = %+v", got)
	}
	if tr := got.Trades[0]; tr.FirstExecutionAt != "2026-02-02T15:00:00Z" || tr.ExecutionCount != 2 || tr.BoughtQuantity != "5" {
		t.Errorf("execution details = %+v", tr)
	}
	_, got = mcptest.Call[page](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "state": "incomplete", "closed_from": "2026-02-09", "closed_to": "2026-02-09"})
	if got.Matching != 1 {
		t.Errorf("closed window for an incomplete trade = %+v", got)
	}
}

func TestMoneyIsRoundedAndNoiseIsLeftOut(t *testing.T) {
	s, api := start(t)
	noisy := dated("noisy", "2026-03-01T14:00:00Z", "2026-03-02T15:00:00Z")
	noisy["realizedNet"], noisy["feesPaid"], noisy["currency"] = "-3.0299999999999411", "1.005", "USD"
	free := dated("free", "2026-03-03T14:00:00Z", "2026-03-04T15:00:00Z")
	free["feesPaid"], free["currency"] = "0", "USD"
	free["entryPrice"] = "175.30000000000001"
	api.trades = []trade{noisy, free}
	session := s.Connect(t, nil)

	_, got := mcptest.Call[map[string]any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "fields": []string{"realized_net", "fees", "currency", "entry_price"}})
	trades := got["trades"].([]any)
	byID := map[string]map[string]any{}
	for _, tr := range trades {
		byID[tr.(map[string]any)["id"].(string)] = tr.(map[string]any)
	}
	if byID["noisy"]["realized_net"] != "-3.03" || byID["noisy"]["fees"] != "1.01" {
		t.Errorf("noisy = %v", byID["noisy"])
	}
	if _, has := byID["free"]["fees"]; has || byID["free"]["entry_price"] != "175.3" {
		t.Errorf("free = %v", byID["free"])
	}
	if got["currency"] != "USD" {
		t.Errorf("currency = %v", got["currency"])
	}
	for id, tr := range byID {
		if _, has := tr["currency"]; has {
			t.Errorf("%s repeats the shared currency", id)
		}
	}

	api.trades[1]["currency"] = "EUR"
	_, mixed := mcptest.Call[page](t, session, "list_trades", map[string]any{"workspace_id": "ws1"})
	if mixed.Currency != "" || mixed.Trades[0].Currency == "" || mixed.Trades[1].Currency == "" {
		t.Errorf("mixed currencies = %+v", mixed)
	}
}

func TestFieldsKeepOnlyWhatWasAsked(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	_, got := mcptest.Call[map[string]any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "limit": 1, "fields": []string{"Symbol", "state"}})
	trade := got["trades"].([]any)[0].(map[string]any)
	if len(trade) != 3 || trade["id"] == nil || trade["symbol"] == nil || trade["state"] == nil {
		t.Errorf("trade = %v", trade)
	}
	result, _ := mcptest.Call[any](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "fields": []string{"symbol", "profit"}})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "profit") {
		t.Errorf("unknown field: %q", mcptest.Text(result))
	}
}

func TestExportTradesReturnsCSV(t *testing.T) {
	s, api := start(t)
	api.trades = []trade{
		dated("a", "2026-03-01T14:00:00Z", "2026-03-02T15:00:00Z"),
		dated("b", "2026-03-05T14:00:00Z", "2026-03-06T15:00:00Z"),
	}
	api.trades[1]["realizedNet"] = "-3.0299999999999411"
	session := s.Connect(t, nil)

	result, out := mcptest.Call[struct {
		Matching  int      `json:"matching"`
		Exported  int      `json:"exported"`
		Truncated bool     `json:"truncated"`
		Columns   []string `json:"columns"`
	}](t, session, "export_trades", map[string]any{"workspace_id": "ws1", "opened_from": "2026-03-01", "fields": []string{"symbol", "realized_net"}})
	lines := strings.Split(strings.TrimSpace(mcptest.Text(result)), "\n")
	if out.Matching != 2 || out.Exported != 2 || out.Truncated || len(lines) != 3 ||
		lines[0] != "id,symbol,realized_net" || lines[1] != "b,AAPL,-3.03" || lines[2] != "a,AAPL,125.50" {
		t.Errorf("out = %+v, csv = %q", out, lines)
	}
	if result, _ := mcptest.Call[any](t, session, "export_trades", map[string]any{"workspace_id": "ws1", "fields": []string{"nope"}}); !result.IsError {
		t.Error("an unknown field was accepted")
	}
}

func TestExportTradesSaysWhenItIsCapped(t *testing.T) {
	s, api := start(t)
	api.trades = nil
	for i := range 5001 {
		api.trades = append(api.trades, dated(fmt.Sprintf("t%d", i), "2026-03-01T14:00:00Z", "2026-03-02T15:00:00Z"))
	}
	session := s.Connect(t, nil)
	result, out := mcptest.Call[struct {
		Matching  int    `json:"matching"`
		Exported  int    `json:"exported"`
		Truncated bool   `json:"truncated"`
		Note      string `json:"note"`
	}](t, session, "export_trades", map[string]any{"workspace_id": "ws1", "fields": []string{"symbol"}})
	if out.Matching != 5001 || out.Exported != 5000 || !out.Truncated || !strings.Contains(out.Note, "5000 of 5001") ||
		strings.Count(mcptest.Text(result), "\n") != 5001 {
		t.Errorf("out = %+v", out)
	}
}

func TestStatusStatesTheWholeOutcomeOfStarting(t *testing.T) {
	s, api := start(t)
	api.enabled = false
	session := s.Connect(t, nil)

	_, out := mcptest.Call[struct {
		Earlier struct {
			Count             int `json:"count"`
			LinkedToBroker    int `json:"linked_to_broker"`
			OverlappingBroker int `json:"overlapping_broker_history"`
		} `json:"earlier_entries"`
		IfFlat    preview `json:"if_account_was_flat"`
		IfNotFlat preview `json:"if_not_flat"`
	}](t, session, "get_journal_status", map[string]any{"workspace_id": "ws1"})
	if out.Earlier.Count != 5 || out.Earlier.LinkedToBroker != 1 || out.Earlier.OverlappingBroker != 2 {
		t.Errorf("earlier entries = %+v", out.Earlier)
	}
	if out.IfNotFlat.TotalAfter != 15 || out.IfNotFlat.ReadyTrades != 7 || out.IfNotFlat.NeedsAttention != 3 ||
		!strings.Contains(out.IfNotFlat.Outcome, "The 5 earlier entries stay") || !strings.Contains(out.IfNotFlat.Outcome, "holds 15 trades") {
		t.Errorf("if not flat = %+v", out.IfNotFlat)
	}
	if out.IfFlat.TotalAfter != 15 || out.IfFlat.HeldByEarlier != 2 || !strings.Contains(out.IfFlat.Outcome, "2 broker trades are held back") {
		t.Errorf("if flat = %+v", out.IfFlat)
	}

	_, started := mcptest.Call[struct{ Message string }](t, session, "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "no"})
	if !strings.Contains(started.Message, "7 new trades") || !strings.Contains(started.Message, "5 earlier manual entries") {
		t.Errorf("start message = %q", started.Message)
	}
}

type preview struct {
	ReadyTrades    int    `json:"ready_trades"`
	NeedsAttention int    `json:"needs_attention"`
	HeldByEarlier  int    `json:"held_by_earlier_entries"`
	TotalAfter     int    `json:"total_trades_after"`
	Outcome        string `json:"outcome"`
}
