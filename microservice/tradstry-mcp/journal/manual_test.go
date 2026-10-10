package journal_test

import (
	"regexp"
	"strings"
	"testing"

	"tradstry-mcp/mcptest"
)

// createManual stores the trade the way the backend does; an AAPL trade
// overlaps the broker's t1, so it comes back held.
func (f *fakeAPI) createManual(input map[string]any) string {
	if f.manual == nil {
		f.manual = map[string]map[string]any{}
	}
	id := input["id"].(string)
	if existing, ok := f.manual[id]; ok {
		return data(map[string]any{"createJournalEntry": existing})
	}
	trade := map[string]any{"id": id, "workspaceId": input["workspaceId"], "symbol": input["symbol"], "tradeType": input["tradeType"],
		"openDate": input["openDate"], "closeDate": input["closeDate"], "entryPrice": input["entryPrice"], "exitPrice": input["exitPrice"],
		"positionSize": input["positionSize"], "contractMultiplier": 1, "fees": input["fees"], "status": "profit", "recordVersion": 1, "possibleDuplicates": []any{}}
	if input["symbol"] == "AAPL" {
		trade["possibleDuplicates"] = []any{"t1"}
	}
	f.manual[id] = trade
	return data(map[string]any{"createJournalEntry": trade})
}

func (f *fakeAPI) updateManual(id string, input map[string]any) string {
	if id == "t1" {
		return `{"data":null,"errors":[{"message":"JOURNAL_V2_REQUIRED: broker results are read-only"}]}`
	}
	trade := f.manual[id]
	if f.manualClashes > 0 {
		f.manualClashes--
		trade["recordVersion"] = trade["recordVersion"].(int) + 1
		return `{"data":null,"errors":[{"message":"CONFLICT: this trade changed on another device"}]}`
	}
	if input["expectedVersion"] != float64(trade["recordVersion"].(int)) {
		return `{"data":null,"errors":[{"message":"CONFLICT: this trade changed on another device"}]}`
	}
	for key, value := range input {
		if key == "fees" || key == "notes" {
			trade[key] = value
		}
	}
	if input["clearFees"] == true {
		trade["fees"] = nil
	}
	trade["recordVersion"] = trade["recordVersion"].(int) + 1
	return data(map[string]any{"updateJournalEntry": trade})
}

type manualResult struct {
	Message string `json:"message"`
	Trade   struct {
		ID                  string   `json:"id"`
		Fees                *float64 `json:"fees"`
		PossibleDuplicateOf []string `json:"possible_duplicate_of"`
	} `json:"trade"`
}

func addArgs(symbol string) map[string]any {
	return map[string]any{"workspace_id": "ws1", "symbol": symbol, "direction": "long",
		"opened_at": "2026-09-01T09:35:00-04:00", "closed_at": "2026-09-01T11:00:00-04:00",
		"entry_price": 10, "exit_price": 13, "quantity": 100, "stop": 9.5, "fees": 2}
}

func TestAddingAManualTradeIsSafeToRetry(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	result, first := mcptest.Call[manualResult](t, session, "add_manual_trade", addArgs("msft"))
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	sent := requests(s, "CreateManualTrade")[0].Variables["input"].(map[string]any)
	if sent["symbol"] != "MSFT" || sent["openDate"] != "2026-09-01T13:35:00Z" || sent["stopLoss"] != 9.5 || sent["fees"] != float64(2) || sent["tradeType"] != "long" {
		t.Errorf("sent %v", sent)
	}
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(sent["id"].(string)) {
		t.Errorf("id %v is not a UUID", sent["id"])
	}
	if first.Message != "Recorded." || first.Trade.Fees == nil {
		t.Errorf("first = %+v", first)
	}

	_, retried := mcptest.Call[manualResult](t, session, "add_manual_trade", addArgs("msft"))
	other := addArgs("msft")
	other["exit_price"] = 14
	_, different := mcptest.Call[manualResult](t, session, "add_manual_trade", other)
	if retried.Trade.ID != first.Trade.ID || different.Trade.ID == first.Trade.ID {
		t.Errorf("ids: first %s, retried %s, different %s", first.Trade.ID, retried.Trade.ID, different.Trade.ID)
	}
}

func TestAddedTradesSayWhatTheyLack(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	noFees := addArgs("MSFT")
	delete(noFees, "fees")
	if _, out := mcptest.Call[manualResult](t, session, "add_manual_trade", noFees); !strings.Contains(out.Message, "before fees") {
		t.Errorf("without fees: %q", out.Message)
	}
	_, held := mcptest.Call[manualResult](t, session, "add_manual_trade", addArgs("AAPL"))
	if !strings.Contains(held.Message, "resolve_possible_duplicate") || strings.Join(held.Trade.PossibleDuplicateOf, ",") != "t1" {
		t.Errorf("held = %+v", held)
	}

	local := addArgs("MSFT")
	local["opened_at"] = "2026-09-01 09:35"
	if result, _ := mcptest.Call[any](t, session, "add_manual_trade", local); !strings.Contains(mcptest.Text(result), "RFC 3339") {
		t.Errorf("a time without its offset: %q", mcptest.Text(result))
	}
	backwards := addArgs("MSFT")
	backwards["closed_at"] = "2026-09-01T09:00:00-04:00"
	if result, _ := mcptest.Call[any](t, session, "add_manual_trade", backwards); !result.IsError {
		t.Error("a trade closed before it opened was sent")
	}
	if n := len(requests(s, "CreateManualTrade")); n != 2 {
		t.Errorf("%d trades sent; invalid ones must not be", n)
	}
}

func TestEditingSendsOnlyTheCorrectionAndTheVersionItRead(t *testing.T) {
	s, api := start(t)
	session := s.Connect(t, nil)
	_, added := mcptest.Call[manualResult](t, session, "add_manual_trade", addArgs("MSFT"))
	api.manualClashes = 1

	result, edited := mcptest.Call[manualResult](t, session, "update_manual_trade", map[string]any{"workspace_id": "ws1", "trade_id": added.Trade.ID, "fees": 3.5})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	updates := requests(s, "UpdateManualTrade")
	if len(updates) != 2 {
		t.Fatalf("%d updates; one retry on top of the other save is expected", len(updates))
	}
	if sent := updates[1].Variables["input"].(map[string]any); len(sent) != 2 || sent["fees"] != 3.5 || sent["expectedVersion"] != float64(2) {
		t.Errorf("sent %v", sent)
	}
	if edited.Trade.Fees == nil || *edited.Trade.Fees != 3.5 {
		t.Errorf("edited = %+v", edited)
	}

	_, unknown := mcptest.Call[manualResult](t, session, "update_manual_trade", map[string]any{"workspace_id": "ws1", "trade_id": added.Trade.ID, "fees_unknown": true})
	if unknown.Trade.Fees != nil || !strings.Contains(unknown.Message, "before fees") {
		t.Errorf("unknown = %+v", unknown)
	}

	for args, want := range map[string]map[string]any{
		"broker trade": {"workspace_id": "ws1", "trade_id": "t1", "fees": 1},
		"not found":    {"workspace_id": "ws2", "trade_id": added.Trade.ID, "fees": 1},
		"say what":     {"workspace_id": "ws1", "trade_id": added.Trade.ID},
	} {
		if result, _ := mcptest.Call[any](t, session, "update_manual_trade", want); !strings.Contains(mcptest.Text(result), args) {
			t.Errorf("%s: %q", args, mcptest.Text(result))
		}
	}
}

func TestDeletingAManualTradeNeedsTheUser(t *testing.T) {
	s, _ := start(t)
	plain := s.Connect(t, nil)
	_, added := mcptest.Call[manualResult](t, plain, "add_manual_trade", addArgs("MSFT"))
	args := map[string]any{"workspace_id": "ws1", "trade_id": added.Trade.ID}

	_, declined := mcptest.Call[resolved](t, s.Connect(t, accept(false)), "delete_manual_trade", args)
	if declined.Status != "cancelled" || len(requests(s, "DeleteManualTrade")) != 0 {
		t.Fatalf("declined = %+v", declined)
	}
	_, asked := mcptest.Call[resolved](t, plain, "delete_manual_trade", args)
	if asked.Status != "needs_confirmation" || len(requests(s, "DeleteManualTrade")) != 0 {
		t.Fatalf("asked = %+v", asked)
	}
	args["confirmation_token"] = asked.ConfirmationToken
	if _, deleted := mcptest.Call[resolved](t, plain, "delete_manual_trade", args); deleted.Status != "deleted" {
		t.Errorf("deleted = %+v", deleted)
	}
}
