package journal_test

import (
	"encoding/json"
	"strings"
	"testing"

	"tradstry-mcp/mcptest"
)

// startWithHeldTrades adds two manual trades waiting as possible duplicates.
func startWithHeldTrades(t *testing.T) *mcptest.Stack {
	s, api := start(t)
	api.trades = append(api.trades, heldTrade("m1", "t1"), heldTrade("m2", "t1", "t2"))
	return s
}

type resolved struct {
	Status            string     `json:"status"`
	Message           string     `json:"message"`
	Preview           *previewed `json:"preview"`
	ConfirmationToken string     `json:"confirmation_token"`
	Trade             *struct {
		State string `json:"state"`
	} `json:"trade"`
}

func TestListTradesShowsWhatAHeldTradeMayRepeat(t *testing.T) {
	s := startWithHeldTrades(t)
	session := s.Connect(t, nil)
	_, out := mcptest.Call[struct {
		Trades []struct {
			ID                  string   `json:"id"`
			PossibleDuplicateOf []string `json:"possible_duplicate_of"`
		} `json:"trades"`
	}](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "state": "incomplete"})
	if len(out.Trades) != 2 || strings.Join(out.Trades[0].PossibleDuplicateOf, ",")+"|"+strings.Join(out.Trades[1].PossibleDuplicateOf, ",") != "t1|t1,t2" {
		t.Errorf("trades = %+v", out.Trades)
	}
}

func TestSameTradePreviewsAMergeThatKeepsTheManualTrade(t *testing.T) {
	s := startWithHeldTrades(t)
	session := s.Connect(t, accept(true))

	result, out := mcptest.Call[resolved](t, session, "resolve_possible_duplicate", map[string]any{"workspace_id": "ws1", "trade_id": "m1", "answer": "same"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input, _ := json.Marshal(requests(s, "previewJournalGrouping")[0].Variables["input"])
	want := `{"entryIds":["t1","m1"],"groups":[{"allocations":[{"quantity":"10","transactionId":"tx1"},{"quantity":"10","transactionId":"tx2"}],"entryId":"m1"}]}`
	if string(input) != want {
		t.Errorf("merge input = %s\nwant %s", input, want)
	}
	if out.Status != "preview" || out.Preview == nil || out.Preview.PreviewID != "pv-1" || len(requests(s, "confirmJournalGrouping")) != 0 {
		t.Fatalf("resolve = %+v; a same answer must only preview", out)
	}
	_, applied := mcptest.Call[confirmed](t, session, "confirm_grouping_change", map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"})
	if applied.Status != "applied" {
		t.Errorf("confirm = %+v", applied)
	}
}

func TestSameTradeMustNameWhichBrokerTrade(t *testing.T) {
	s := startWithHeldTrades(t)
	session := s.Connect(t, nil)
	for _, args := range []map[string]any{
		{"workspace_id": "ws1", "trade_id": "m2", "answer": "same"},
		{"workspace_id": "ws1", "trade_id": "m2", "answer": "same", "broker_trade_id": "t3"},
	} {
		if result, _ := mcptest.Call[any](t, session, "resolve_possible_duplicate", args); !strings.Contains(mcptest.Text(result), "t1 t2") {
			t.Errorf("%v: %q", args, mcptest.Text(result))
		}
	}
	if result, _ := mcptest.Call[resolved](t, session, "resolve_possible_duplicate", map[string]any{"workspace_id": "ws1", "trade_id": "m2", "answer": "same", "broker_trade_id": "t2"}); result.IsError {
		t.Error(mcptest.Text(result))
	}
	if result, _ := mcptest.Call[any](t, session, "resolve_possible_duplicate", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "answer": "separate"}); !strings.Contains(mcptest.Text(result), "not waiting") {
		t.Errorf("a trade that is not held: %q", mcptest.Text(result))
	}
}

func TestKeepingATradeSeparateNeedsTheUser(t *testing.T) {
	s := startWithHeldTrades(t)
	args := map[string]any{"workspace_id": "ws1", "trade_id": "m1", "answer": "separate"}

	_, declined := mcptest.Call[resolved](t, s.Connect(t, accept(false)), "resolve_possible_duplicate", args)
	if declined.Status != "cancelled" || len(requests(s, "keepManualTradeSeparate")) != 0 {
		t.Fatalf("declined = %+v", declined)
	}

	plain := s.Connect(t, nil)
	_, asked := mcptest.Call[resolved](t, plain, "resolve_possible_duplicate", args)
	if asked.Status != "needs_confirmation" || asked.ConfirmationToken == "" || len(requests(s, "keepManualTradeSeparate")) != 0 {
		t.Fatalf("without elicitation = %+v", asked)
	}
	args["confirmation_token"] = asked.ConfirmationToken
	_, kept := mcptest.Call[resolved](t, plain, "resolve_possible_duplicate", args)
	if kept.Status != "kept_separate" || kept.Trade == nil || kept.Trade.State != "closed" {
		t.Fatalf("kept = %+v", kept)
	}
	sent := requests(s, "keepManualTradeSeparate")[0].Variables
	if sent["entryId"] != "m1" || sent["expectedVersion"] != float64(4) || sent["clientId"] != "tradstry-mcp" || sent["mutationId"] == "" {
		t.Errorf("sent %v", sent)
	}
}
