package journal_test

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

type trade map[string]any

// fakeAPI keeps one workspace's journal in memory and answers the journal
// operations the way the Tradstry backend does.
type fakeAPI struct {
	mu            sync.Mutex
	enabled       bool
	trades        []trade
	context       map[string]any
	draft         map[string]any
	session       map[string]any
	conflictsLeft int
	staleConfirm  bool
	manual        map[string]map[string]any
	manualClashes int
}

func newFake() *fakeAPI {
	return &fakeAPI{
		enabled: true,
		trades: []trade{
			newTrade("t1", "AAPL", "closed", "unreviewed", "2026-10-08T15:00:00Z"),
			newTrade("t2", "NVDA", "closed", "reviewed", "2026-10-07T15:00:00Z"),
			newTrade("t3", "AAPL", "open", "unreviewed", ""),
		},
		context: map[string]any{"version": 3, "stopState": "price", "stopPrice": "180", "playbookId": nil, "notes": "Entered on the breakout", "tagIds": []any{"tag-fomo"}, "violatedPrincipleIds": []any{}},
		draft:   map[string]any{"version": 2, "takeaway": "", "choiceIds": []any{"entered_late"}, "planAdherence": nil},
		session: map[string]any{"id": "s1", "date": "2026-10-08", "queue": []any{"t1", "t2"}, "completed": []any{}, "cursorEntryId": "t1", "version": 1, "refreshAvailable": false},
	}
}

func newTrade(id, symbol, state, review, closed string) trade {
	t := trade{"id": id, "symbol": symbol, "direction": "long", "lifecycleState": state, "outcome": "profit", "reviewState": review,
		"openDate": "2026-10-06T14:00:00Z", "realizedNet": "125.5", "materializedRevision": 7, "tags": []any{}}
	if closed != "" {
		t["closeDate"] = closed
	}
	return t
}

// heldTrade is a manual trade waiting because it may repeat broker trades.
func heldTrade(id string, duplicates ...string) trade {
	t := newTrade(id, "AAPL", "incomplete", "unreviewed", "2026-10-08T15:00:00Z")
	t["sourceKind"], t["recordVersion"], t["issueCode"] = "manual", 4, "possible_duplicate"
	t["issueMessage"], t["possibleDuplicates"] = "This trade overlaps a trade imported from your broker.", duplicates
	return t
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	input, _ := req.Variables["input"].(map[string]any)
	switch {
	case strings.Contains(req.Query, "journalFlowStatus"):
		return data(map[string]any{"journalFlowStatus": map[string]any{
			"enabled": f.enabled, "sourceRevision": 4, "projectionRevision": 4, "importState": "idle", "timezone": "America/New_York"}})
	case strings.Contains(req.Query, "prepareJournalFlow"):
		ready, attention, held := 7, 3, 0
		if req.Variables["flatBefore"] != nil {
			ready, attention, held = 8, 2, 2
		}
		return data(map[string]any{"prepareJournalFlow": map[string]any{
			"sourceRevision": 4, "brokerRecords": 40, "existingEntries": 5, "linkedEntries": 1, "overlappingEntries": 2, "heldByEarlierEntries": held,
			"readyTrades": ready, "attentionGroups": attention,
			"conflictingLinks": 0, "firstExecution": "2026-01-05T14:30:00Z", "timezone": "America/New_York"}})
	case strings.Contains(req.Query, "enableJournalFlow"):
		f.enabled = true
		return data(map[string]any{"enableJournalFlow": map[string]any{"enabled": true}})
	case strings.Contains(req.Query, "journalTradesV2"):
		return data(map[string]any{"journalTradesV2": f.trades})
	case strings.Contains(req.Query, "JournalNames"):
		return data(map[string]any{
			"tags":       []any{map[string]any{"id": "tag-fomo", "name": "FOMO"}, map[string]any{"id": "tag-a", "name": "A+ setup"}},
			"playbooks":  []any{map[string]any{"id": "pb-1", "name": "Breakout"}},
			"principles": []any{map[string]any{"id": "pr-1", "title": "Wait for confirmation"}},
		})
	case strings.Contains(req.Query, "JournalDetailV2"):
		var found trade
		for _, t := range f.trades {
			if t["id"] == req.Variables["entryId"] {
				found = t
			}
		}
		return data(map[string]any{
			"journalTradeV2": found, "journalContextV2": f.context, "journalReviewDraftV2": f.draft,
			"journalExecutionsV2":    []any{map[string]any{"role": "entry", "side": "BUY", "quantity": "10", "price": "175", "executedAt": "2026-10-06T14:00:00Z", "precision": "timestamp"}},
			"journalReviewHistoryV2": []any{},
		})
	case strings.Contains(req.Query, "saveJournalContext"):
		if f.conflictsLeft > 0 {
			f.conflictsLeft--
			f.context["notes"] = "Saved from another device"
			return `{"data":null,"errors":[{"message":"CONFLICT: context changed on another device"}]}`
		}
		for _, key := range []string{"stopState", "stopPrice", "playbookId", "notes", "tagIds", "violatedPrincipleIds"} {
			if value, ok := input[key]; ok && (value != nil || key == "stopPrice" || key == "playbookId") {
				f.context[key] = value
			}
		}
		return data(map[string]any{"saveJournalContext": f.context})
	case strings.Contains(req.Query, "saveJournalReviewDraft"):
		f.draft = map[string]any{"version": f.draft["version"].(int) + 1, "takeaway": input["takeaway"], "choiceIds": input["choiceIds"], "planAdherence": input["planAdherence"]}
		return data(map[string]any{"saveJournalReviewDraft": f.draft})
	case strings.Contains(req.Query, "markJournalTradeReviewed"):
		return data(map[string]any{"markJournalTradeReviewed": map[string]any{"version": 1, "takeaway": f.draft["takeaway"], "choiceIds": []any{}, "createdAt": "2026-10-09T12:00:00Z"}})
	case strings.Contains(req.Query, "query JournalExecutionsV2"):
		held := map[string][]any{
			"t1": {alloc("tx1", "10"), alloc("tx2", "10")},
			"t2": {alloc("tx3", "5"), alloc("tx2", "2.5")},
			"t3": {alloc("tx4", "7")},
		}
		return data(map[string]any{"journalExecutionsV2": held[req.Variables["entryId"].(string)]})
	case strings.Contains(req.Query, "previewJournalGrouping"):
		return data(map[string]any{"previewJournalGrouping": map[string]any{
			"token": "pv-1", "entryIds": input["entryIds"],
			"beforeGroups": []any{group("t1", "20", "125.5"), group("t2", "7.5", "-30")},
			"groups":       []any{group("t1", "27.5", "95.5")},
		}})
	case strings.Contains(req.Query, "previewJournalSuggestion"):
		return data(map[string]any{"previewJournalSuggestion": map[string]any{
			"token": "pv-s", "entryIds": []any{"t1"},
			"beforeGroups": []any{group("t1", "20", "125.5")},
			"groups":       []any{group("t1", "10", "60"), group("e-new", "10", "65.5")},
		}})
	case strings.Contains(req.Query, "journalGroupingHistoryV2"):
		return data(map[string]any{"journalGroupingHistoryV2": []any{
			map[string]any{"id": "op-2", "kind": "undo", "state": "undone", "createdAt": "2026-10-09T10:00:00Z"},
			map[string]any{"id": "op-1", "kind": "merge", "state": "committed", "createdAt": "2026-10-08T10:00:00Z"},
		}})
	case strings.Contains(req.Query, "previewUndoJournalGrouping"):
		return data(map[string]any{"previewUndoJournalGrouping": map[string]any{
			"token": "pv-u", "entryIds": []any{"t1", "t2"},
			"beforeGroups": []any{group("t1", "27.5", "95.5")},
			"groups":       []any{group("t1", "20", "125.5"), group("t2", "7.5", "-30")},
		}})
	case strings.Contains(req.Query, "confirmJournalGrouping"):
		if f.staleConfirm {
			return `{"data":null,"errors":[{"message":"REPREVIEW_REQUIRED: the preview expired or the trades changed"}]}`
		}
		return data(map[string]any{"confirmJournalGrouping": map[string]any{"operationId": "op-9", "entryIds": []any{"t1"}}})
	case strings.Contains(req.Query, "journalGroupingSuggestionsV2"):
		return data(map[string]any{"journalGroupingSuggestionsV2": []any{
			map[string]any{"id": "sg1", "entryId": "t1", "explanation": "Two AAPL exits look like separate trades", "previousConfirmations": 2},
			map[string]any{"id": "sg2", "entryId": "t2", "explanation": "x", "previousConfirmations": 0},
			map[string]any{"id": "sg3", "entryId": "t3", "explanation": "y", "previousConfirmations": 0},
		}})
	case strings.Contains(req.Query, "keepManualTradeSeparate"):
		for _, t := range f.trades {
			if t["id"] == req.Variables["entryId"] {
				t["lifecycleState"], t["issueCode"], t["possibleDuplicates"] = "closed", nil, []any{}
				return data(map[string]any{"keepManualTradeSeparate": t})
			}
		}
	case strings.Contains(req.Query, "CreateManualTrade"):
		return f.createManual(input)
	case strings.Contains(req.Query, "query ManualTrade"):
		if req.Variables["id"] == "t1" {
			return data(map[string]any{"journalEntry": map[string]any{"id": "t1", "workspaceId": "ws1", "symbol": "AAPL", "tradeType": "long", "openDate": "2026-10-06T14:00:00Z", "closeDate": "2026-10-08T15:00:00Z", "recordVersion": 3, "possibleDuplicates": []any{}}})
		}
		return data(map[string]any{"journalEntry": f.manual[req.Variables["id"].(string)]})
	case strings.Contains(req.Query, "UpdateManualTrade"):
		return f.updateManual(req.Variables["id"].(string), input)
	case strings.Contains(req.Query, "DeleteManualTrade"):
		delete(f.manual, req.Variables["id"].(string))
		return data(map[string]any{"deleteJournalEntry": true})
	case strings.Contains(req.Query, "dismissJournalSuggestion"):
		return data(map[string]any{"dismissJournalSuggestion": true})
	case strings.Contains(req.Query, "openJournalReviewSession"):
		return data(map[string]any{"openJournalReviewSession": f.session})
	case strings.Contains(req.Query, "moveJournalReviewCursor"):
		f.session["cursorEntryId"] = req.Variables["entryId"]
		f.session["version"] = f.session["version"].(int) + 1
		return data(map[string]any{"moveJournalReviewCursor": f.session["version"]})
	}
	return `{"data":null,"errors":[{"message":"unexpected operation"}]}`
}

func alloc(transaction, quantity string) map[string]any {
	return map[string]any{"transactionId": transaction, "quantity": quantity}
}

func group(entry, quantity, realized string) map[string]any {
	return map[string]any{"entryId": entry, "direction": "long", "enteredQuantity": quantity, "remainingQuantity": "0",
		"realizedNet": realized, "feesPaid": "1", "allocations": []any{map[string]any{"executedAt": "2026-10-06T14:00:00Z"}}}
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

func start(t *testing.T) (*mcptest.Stack, *fakeAPI) {
	api := newFake()
	return mcptest.Start(t, api.respond), api
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

func accept(confirmed bool) *mcp.ClientOptions {
	return &mcp.ClientOptions{ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
		if !confirmed {
			return &mcp.ElicitResult{Action: "decline"}, nil
		}
		return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, nil
	}}
}

func TestStatusShowsWhatTheFlatAnswerChanges(t *testing.T) {
	s, api := start(t)
	api.enabled = false
	session := s.Connect(t, nil)

	_, out := mcptest.Call[struct {
		Enabled bool `json:"enabled"`
		IfFlat  struct {
			ReadyTrades int `json:"ready_trades"`
		} `json:"if_account_was_flat"`
		IfNotFlat struct {
			ReadyTrades    int `json:"ready_trades"`
			NeedsAttention int `json:"needs_attention"`
		} `json:"if_not_flat"`
	}](t, session, "get_journal_status", map[string]any{"workspace_id": "ws1"})
	if out.Enabled || out.IfFlat.ReadyTrades != 8 || out.IfNotFlat.ReadyTrades != 7 || out.IfNotFlat.NeedsAttention != 3 {
		t.Errorf("status = %+v", out)
	}
}

func TestStartingTheJournal(t *testing.T) {
	t.Run("an enabled journal can receive a confirmed opening-history correction", func(t *testing.T) {
		s, api := start(t)
		api.enabled = true
		_, out := mcptest.Call[struct{ Status string }](t, s.Connect(t, accept(true)), "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "yes"})
		if out.Status != "ready" || len(requests(s, "enableJournalFlow")) != 1 {
			t.Fatalf("correction = %+v", out)
		}
	})
	t.Run("uncertain history on an enabled journal stays unchanged", func(t *testing.T) {
		s, api := start(t)
		api.enabled = true
		_, out := mcptest.Call[struct{ Status string }](t, s.Connect(t, nil), "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "not_sure"})
		if out.Status != "unchanged" || len(requests(s, "enableJournalFlow")) != 0 {
			t.Fatalf("uncertain correction = %+v", out)
		}
	})
	t.Run("a confirmed flat start", func(t *testing.T) {
		s, api := start(t)
		api.enabled = false
		session := s.Connect(t, accept(true))
		_, out := mcptest.Call[struct{ Status string }](t, session, "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "yes"})
		if out.Status != "ready" {
			t.Fatalf("start = %+v", out)
		}
		enable := requests(s, "enableJournalFlow")[0].Variables
		if enable["flatBefore"] != "2026-01-05T14:30:00Z" || enable["expectedRevision"] != float64(4) || enable["timezone"] != "America/New_York" {
			t.Errorf("enable variables = %v", enable)
		}
	})
	t.Run("a declined flat start enables nothing", func(t *testing.T) {
		s, api := start(t)
		api.enabled = false
		session := s.Connect(t, accept(false))
		_, out := mcptest.Call[struct{ Status string }](t, session, "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "yes"})
		if out.Status != "cancelled" || len(requests(s, "enableJournalFlow")) != 0 {
			t.Errorf("start = %+v", out)
		}
	})
	t.Run("without prompts a flat start needs the user's confirmation code", func(t *testing.T) {
		s, api := start(t)
		api.enabled = false
		session := s.Connect(t, nil)
		args := map[string]any{"workspace_id": "ws1", "account_was_flat": "yes"}
		_, first := mcptest.Call[struct {
			Status            string `json:"status"`
			ConfirmationToken string `json:"confirmation_token"`
		}](t, session, "start_journal", args)
		if first.Status != "needs_confirmation" || len(requests(s, "enableJournalFlow")) != 0 {
			t.Fatalf("first = %+v", first)
		}
		args["confirmation_token"] = first.ConfirmationToken
		if _, second := mcptest.Call[struct{ Status string }](t, session, "start_journal", args); second.Status != "ready" {
			t.Errorf("second = %+v", second)
		}
	})
	t.Run("not flat needs no confirmation and claims nothing", func(t *testing.T) {
		s, api := start(t)
		api.enabled = false
		asked := false
		session := s.Connect(t, &mcp.ClientOptions{ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
			asked = true
			return &mcp.ElicitResult{Action: "decline"}, nil
		}})
		_, out := mcptest.Call[struct{ Status string }](t, session, "start_journal", map[string]any{"workspace_id": "ws1", "account_was_flat": "not_sure", "timezone": "Europe/London"})
		enable := requests(s, "enableJournalFlow")[0].Variables
		if out.Status != "ready" || asked || enable["flatBefore"] != nil || enable["timezone"] != "Europe/London" {
			t.Errorf("start = %+v, asked = %v, enable = %v", out, asked, enable)
		}
	})
	t.Run("bad answers are refused before anything changes", func(t *testing.T) {
		s, api := start(t)
		api.enabled = false
		session := s.Connect(t, nil)
		for _, args := range []map[string]any{
			{"workspace_id": "ws1", "account_was_flat": "probably"},
			{"workspace_id": "ws1", "account_was_flat": "no", "timezone": "Mars/Olympus"},
			{"workspace_id": "ws1"},
		} {
			if result, _ := mcptest.Call[any](t, session, "start_journal", args); !result.IsError {
				t.Errorf("%v was accepted", args)
			}
		}
		if len(requests(s, "enableJournalFlow")) != 0 {
			t.Error("the journal was enabled")
		}
	})
}

func TestListTradesFiltersAndCounts(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	type listed struct {
		Matching int `json:"matching"`
		Trades   []struct {
			ID     string `json:"id"`
			Review string `json:"review"`
		} `json:"trades"`
		Journal struct {
			Open     int `json:"open"`
			Closed   int `json:"closed"`
			ToReview int `json:"closed_unreviewed"`
		} `json:"journal"`
	}

	_, all := mcptest.Call[listed](t, session, "list_trades", map[string]any{"workspace_id": "ws1"})
	if all.Matching != 3 || all.Journal.Open != 1 || all.Journal.Closed != 2 || all.Journal.ToReview != 1 {
		t.Errorf("all = %+v", all)
	}
	_, todo := mcptest.Call[listed](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "state": "closed", "review": "unreviewed"})
	if todo.Matching != 1 || todo.Trades[0].ID != "t1" {
		t.Errorf("to review = %+v", todo)
	}
	_, dated := mcptest.Call[listed](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "symbol": "aapl", "closed_from": "2026-10-08", "limit": 1})
	if dated.Matching != 1 || len(dated.Trades) != 1 || dated.Trades[0].ID != "t1" {
		t.Errorf("dated = %+v", dated)
	}
}

func TestTradesCanBeReadWithTheJournalOff(t *testing.T) {
	s, api := start(t)
	api.enabled = false
	session := s.Connect(t, nil)

	_, listed := mcptest.Call[struct {
		Matching int    `json:"matching"`
		Note     string `json:"note"`
	}](t, session, "list_trades", map[string]any{"workspace_id": "ws1"})
	if listed.Matching != 3 || !strings.Contains(listed.Note, "start_journal") {
		t.Errorf("list with the journal off = %+v", listed)
	}

	_, detail := mcptest.Call[struct {
		Trade struct {
			Symbol string `json:"symbol"`
		} `json:"trade"`
		Note string `json:"note"`
	}](t, session, "get_trade", map[string]any{"workspace_id": "ws1", "trade_id": "t1"})
	if detail.Trade.Symbol != "AAPL" || !strings.Contains(detail.Note, "start_journal") {
		t.Errorf("trade with the journal off = %+v", detail)
	}
}

func TestTradesCannotChangeWithTheJournalOff(t *testing.T) {
	s, api := start(t)
	api.enabled = false
	session := s.Connect(t, nil)
	result, _ := mcptest.Call[any](t, session, "update_trade_context", map[string]any{
		"workspace_id": "ws1", "trade_id": "t1", "append_notes": "late entry",
	})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "start_journal") {
		t.Errorf("edit with the journal off: %q", mcptest.Text(result))
	}
	if len(requests(s, "saveJournalContext")) != 0 {
		t.Error("the context was saved with the journal off")
	}
}

func TestGetTradeNamesItsContext(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	_, out := mcptest.Call[struct {
		Trade struct {
			Symbol      string `json:"symbol"`
			RealizedNet string `json:"realized_net"`
		} `json:"trade"`
		Executions []any `json:"executions"`
		Context    struct {
			Stop string   `json:"stop"`
			Tags []string `json:"tags"`
		} `json:"context"`
		Draft struct {
			QuickChoices []string `json:"quick_choices"`
		} `json:"review_draft"`
	}](t, session, "get_trade", map[string]any{"workspace_id": "ws1", "trade_id": "t1"})
	if out.Trade.Symbol != "AAPL" || out.Trade.RealizedNet != "125.50" || len(out.Executions) != 1 ||
		out.Context.Stop != "180" || !slices.Equal(out.Context.Tags, []string{"FOMO"}) || out.Draft.QuickChoices[0] != "entered_late" {
		t.Errorf("trade = %+v", out)
	}
}

func TestUpdateContextChangesOnlyWhatWasSaid(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	result, _ := mcptest.Call[any](t, session, "update_trade_context", map[string]any{
		"workspace_id": "ws1", "trade_id": "t1", "add_tags": []string{"a+ SETUP"}, "append_notes": "Took profit too early",
		"playbook": "breakout", "stop": "$178.50",
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input := requests(s, "saveJournalContext")[0].Variables["input"].(map[string]any)
	if got := input["tagIds"]; !slices.Equal(toStrings(got), []string{"tag-fomo", "tag-a"}) {
		t.Errorf("tags sent = %v, want the existing tag kept", got)
	}
	if input["notes"] != "Entered on the breakout\n\nTook profit too early" || input["playbookId"] != "pb-1" ||
		input["stopState"] != "price" || input["stopPrice"] != "178.50" || input["expectedVersion"] != float64(3) {
		t.Errorf("input = %v", input)
	}
	if _, untouched := input["violatedPrincipleIds"]; untouched {
		t.Error("principles were sent although the user did not mention them")
	}
}

func TestUpdateContextRefusesWhatItCannotMatch(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	for _, args := range []map[string]any{
		{"workspace_id": "ws1", "trade_id": "t1", "add_tags": []string{"Revenge"}},
		{"workspace_id": "ws1", "trade_id": "t1", "playbook": "Scalping"},
		{"workspace_id": "ws1", "trade_id": "t1", "stop": "0"},
		{"workspace_id": "ws1", "trade_id": "t1", "stop": "tight"},
		{"workspace_id": "ws1", "trade_id": "t1", "claimed_at": "this morning", "notes": "x"},
		{"workspace_id": "ws1", "trade_id": "t1"},
	} {
		result, _ := mcptest.Call[any](t, session, "update_trade_context", args)
		if !result.IsError {
			t.Errorf("%v was accepted", args)
		}
	}
	if result, _ := mcptest.Call[any](t, session, "update_trade_context", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "add_tags": []string{"Revenge"}}); !strings.Contains(mcptest.Text(result), "FOMO") {
		t.Errorf("an unknown tag should list the available ones: %q", mcptest.Text(result))
	}
	if len(requests(s, "saveJournalContext")) != 0 {
		t.Error("an invalid change reached the backend")
	}
}

func TestUpdateContextRetriesOnceOnTopOfAnotherDevicesSave(t *testing.T) {
	s, api := start(t)
	api.conflictsLeft = 1
	session := s.Connect(t, nil)
	result, _ := mcptest.Call[any](t, session, "update_trade_context", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "append_notes": "Second thought"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	saves := requests(s, "saveJournalContext")
	if len(saves) != 2 || saves[0].Variables["mutationId"] == saves[1].Variables["mutationId"] {
		t.Fatalf("saves = %d; the retry needs its own mutation ID", len(saves))
	}
	if notes := saves[1].Variables["input"].(map[string]any)["notes"]; notes != "Saved from another device\n\nSecond thought" {
		t.Errorf("retry notes = %q, want the other device's save kept", notes)
	}
}

func TestAWriteAgainstChangedStateGetsANewMutationID(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	args := map[string]any{"workspace_id": "ws1", "trade_id": "t1", "plan_followed": "partly"}
	mcptest.Call[any](t, session, "save_trade_review", args)
	// The fake bumps the draft version, so repeating the request is a new write.
	first := requests(s, "saveJournalReviewDraft")[0].Variables["mutationId"]
	mcptest.Call[any](t, session, "save_trade_review", args)
	if second := requests(s, "saveJournalReviewDraft")[1].Variables["mutationId"]; second == first {
		t.Error("a write against changed state reused the earlier mutation ID")
	}
}

func TestSaveReviewKeepsWhatIsNotChanged(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	result, _ := mcptest.Call[any](t, session, "save_trade_review", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "takeaway": "Trust the plan"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "takeaway_source") {
		t.Errorf("a takeaway without its source: %q", mcptest.Text(result))
	}
	result, draft := mcptest.Call[struct {
		Takeaway     string   `json:"takeaway"`
		QuickChoices []string `json:"quick_choices"`
		PlanFollowed string   `json:"plan_followed"`
	}](t, session, "save_trade_review", map[string]any{
		"workspace_id": "ws1", "trade_id": "t1", "takeaway": "Trust the plan", "takeaway_source": "user_wrote", "plan_followed": "partly",
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if draft.Takeaway != "Trust the plan" || !slices.Equal(draft.QuickChoices, []string{"entered_late"}) || draft.PlanFollowed != "partly" {
		t.Errorf("draft = %+v", draft)
	}
	if result, _ := mcptest.Call[any](t, session, "save_trade_review", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "quick_choices": []string{"felt_lucky"}}); !result.IsError {
		t.Error("an unknown quick choice was accepted")
	}
}

func TestMarkReviewedSendsTheVersionsItRead(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	if result, _ := mcptest.Call[any](t, session, "mark_trade_reviewed", map[string]any{"workspace_id": "ws1", "trade_id": "t1", "session_id": "s1"}); result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input := requests(s, "markJournalTradeReviewed")[0].Variables["input"].(map[string]any)
	if input["expectedEntryRevision"] != float64(7) || input["expectedContextVersion"] != float64(3) ||
		input["expectedDraftVersion"] != float64(2) || input["sessionId"] != "s1" {
		t.Errorf("input = %v", input)
	}
}

func TestNextTradeWalksTheSession(t *testing.T) {
	s, api := start(t)
	session := s.Connect(t, nil)
	type next struct {
		Status    string `json:"status"`
		SessionID string `json:"session_id"`
		Total     int    `json:"total"`
		Trade     *struct {
			Trade struct {
				ID string `json:"id"`
			} `json:"trade"`
		} `json:"trade"`
	}

	_, first := mcptest.Call[next](t, session, "next_trade_to_review", map[string]any{"workspace_id": "ws1"})
	if first.Status != "next" || first.SessionID != "s1" || first.Total != 2 || first.Trade.Trade.ID != "t1" {
		t.Fatalf("first = %+v", first)
	}
	_, skipped := mcptest.Call[next](t, session, "next_trade_to_review", map[string]any{"workspace_id": "ws1", "skip": true})
	if skipped.Trade == nil || skipped.Trade.Trade.ID != "t2" {
		t.Errorf("after skipping = %+v", skipped)
	}
	if moved := requests(s, "moveJournalReviewCursor")[0].Variables; moved["entryId"] != "t2" || moved["expectedVersion"] != float64(1) {
		t.Errorf("cursor move = %v", moved)
	}

	api.mu.Lock()
	api.session["completed"] = []any{"t1", "t2"}
	api.mu.Unlock()
	if _, done := mcptest.Call[next](t, session, "next_trade_to_review", map[string]any{"workspace_id": "ws1"}); done.Status != "done" {
		t.Errorf("done = %+v", done)
	}
}

func toStrings(value any) []string {
	var out []string
	for _, v := range value.([]any) {
		out = append(out, v.(string))
	}
	return out
}

func TestListTradesForOnePlaybook(t *testing.T) {
	s, api := start(t)
	api.trades[0]["playbookId"] = "pb-1"
	session := s.Connect(t, nil)
	type listed struct {
		Matching int `json:"matching"`
		Trades   []struct {
			ID       string `json:"id"`
			Playbook string `json:"playbook"`
		} `json:"trades"`
	}

	result, out := mcptest.Call[listed](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "playbook": "breakout"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if out.Matching != 1 || out.Trades[0].ID != api.trades[0]["id"] || out.Trades[0].Playbook != "Breakout" {
		t.Errorf("listed = %+v", out)
	}
	result, _ = mcptest.Call[listed](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "playbook": "Scalping"})
	if !strings.Contains(mcptest.Text(result), "the playbooks are: Breakout") {
		t.Errorf("unknown playbook: %q", mcptest.Text(result))
	}
}

func TestListTradesWithOneTag(t *testing.T) {
	s, api := start(t)
	api.trades[0]["tags"] = []any{map[string]any{"id": "tag-fomo", "name": "FOMO"}}
	session := s.Connect(t, nil)
	result, out := mcptest.Call[struct {
		Matching int `json:"matching"`
	}](t, session, "list_trades", map[string]any{"workspace_id": "ws1", "tag": "fomo"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	_, all := mcptest.Call[struct {
		Matching int `json:"matching"`
	}](t, session, "list_trades", map[string]any{"workspace_id": "ws1"})
	if out.Matching != 1 || all.Matching != 3 {
		t.Errorf("FOMO trades = %d of %d", out.Matching, all.Matching)
	}
}
