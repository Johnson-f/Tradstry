package journal_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

type previewed struct {
	PreviewID string `json:"preview_id"`
	Before    []struct {
		Trade string `json:"trade"`
	} `json:"before"`
	After []struct {
		Trade       string `json:"trade"`
		Quantity    string `json:"quantity"`
		RealizedNet string `json:"realized_net"`
	} `json:"after"`
	Summary string `json:"summary"`
}

type confirmed struct {
	Status            string `json:"status"`
	ConfirmationToken string `json:"confirmation_token"`
}

func TestMergingWholeTrades(t *testing.T) {
	s, _ := start(t)
	var asked string
	session := s.Connect(t, &mcp.ClientOptions{ElicitationHandler: func(_ context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
		asked = req.Params.Message
		return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, nil
	}})

	result, preview := mcptest.Call[previewed](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": []string{"t1", "t2"}})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input, _ := json.Marshal(requests(s, "previewJournalGrouping")[0].Variables["input"])
	want := `{"entryIds":["t1","t2"],"groups":[{"allocations":[{"quantity":"10","transactionId":"tx1"},{"quantity":"12.5","transactionId":"tx2"},{"quantity":"5","transactionId":"tx3"}],"entryId":"t1"}]}`
	if string(input) != want {
		t.Errorf("merge input = %s\nwant %s", input, want)
	}
	if preview.PreviewID != "pv-1" || len(preview.Before) != 2 || len(preview.After) != 1 || preview.After[0].Quantity != "27.5" ||
		!strings.Contains(preview.Summary, "Before: 2 trades") || !strings.Contains(preview.Summary, "AAPL long 27.5 (realized 95.5)") {
		t.Errorf("preview = %+v", preview)
	}
	if len(requests(s, "confirmJournalGrouping")) != 0 {
		t.Fatal("previewing applied the change")
	}

	_, applied := mcptest.Call[confirmed](t, session, "confirm_grouping_change", map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"})
	if applied.Status != "applied" || !strings.Contains(asked, preview.Summary) {
		t.Errorf("confirm = %+v; the user was asked %q", applied, asked)
	}
	if token := requests(s, "confirmJournalGrouping")[0].Variables["token"]; token != "pv-1" {
		t.Errorf("confirmed token = %v", token)
	}
	if result, _ := mcptest.Call[any](t, session, "confirm_grouping_change", map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"}); !result.IsError {
		t.Error("a used preview was applied again")
	}
}

func TestGroupingChangesNeedTheUsersApproval(t *testing.T) {
	t.Run("declined", func(t *testing.T) {
		s, _ := start(t)
		session := s.Connect(t, accept(false))
		mcptest.Call[any](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": []string{"t1", "t2"}})
		if _, out := mcptest.Call[confirmed](t, session, "confirm_grouping_change", map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"}); out.Status != "cancelled" {
			t.Errorf("confirm = %+v", out)
		}
		if len(requests(s, "confirmJournalGrouping")) != 0 {
			t.Error("a declined change was applied")
		}
	})
	t.Run("approved in the conversation", func(t *testing.T) {
		s, _ := start(t)
		session := s.Connect(t, nil)
		mcptest.Call[any](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": []string{"t1", "t2"}})
		args := map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"}
		_, first := mcptest.Call[confirmed](t, session, "confirm_grouping_change", args)
		if first.Status != "needs_confirmation" || len(requests(s, "confirmJournalGrouping")) != 0 {
			t.Fatalf("first = %+v", first)
		}
		args["confirmation_token"] = first.ConfirmationToken
		if _, second := mcptest.Call[confirmed](t, session, "confirm_grouping_change", args); second.Status != "applied" {
			t.Errorf("second = %+v", second)
		}
	})
	t.Run("unknown or foreign previews", func(t *testing.T) {
		s, _ := start(t)
		session := s.Connect(t, accept(true))
		mcptest.Call[any](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": []string{"t1", "t2"}})
		for _, args := range []map[string]any{
			{"workspace_id": "ws1", "preview_id": "pv-unknown"},
			{"workspace_id": "ws2", "preview_id": "pv-1"},
		} {
			if result, _ := mcptest.Call[any](t, session, "confirm_grouping_change", args); !result.IsError {
				t.Errorf("%v was applied", args)
			}
		}
	})
}

func TestAStalePreviewMustBeRedone(t *testing.T) {
	s, api := start(t)
	api.staleConfirm = true
	session := s.Connect(t, accept(true))
	mcptest.Call[any](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": []string{"t1", "t2"}})
	result, _ := mcptest.Call[any](t, session, "confirm_grouping_change", map[string]any{"workspace_id": "ws1", "preview_id": "pv-1"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "preview the change again") {
		t.Errorf("stale confirm: %q", mcptest.Text(result))
	}
}

func TestMergeNeedsTwoDifferentTrades(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)
	for _, ids := range [][]string{{"t1"}, {"t1", "t1"}} {
		if result, _ := mcptest.Call[any](t, session, "preview_merge", map[string]any{"workspace_id": "ws1", "trade_ids": ids}); !result.IsError {
			t.Errorf("%v was previewed", ids)
		}
	}
	if len(requests(s, "previewJournalGrouping")) != 0 {
		t.Error("an invalid merge reached the backend")
	}
}

func TestFixingADirectionAndUndoing(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	if result, _ := mcptest.Call[any](t, session, "preview_direction_fix", map[string]any{"workspace_id": "ws1", "trade_id": "t3", "direction": "short"}); result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input := requests(s, "previewJournalGrouping")[0].Variables["input"].(map[string]any)
	if input["direction"] != "short" || input["entryIds"].([]any)[0] != "t3" {
		t.Errorf("direction fix input = %v", input)
	}
	if result, _ := mcptest.Call[any](t, session, "preview_direction_fix", map[string]any{"workspace_id": "ws1", "trade_id": "t3", "direction": "sideways"}); !result.IsError {
		t.Error("an unknown direction was accepted")
	}

	_, undo := mcptest.Call[previewed](t, session, "preview_undo_grouping", map[string]any{"workspace_id": "ws1", "trade_id": "t1"})
	if operation := requests(s, "previewUndoJournalGrouping")[0].Variables["operationId"]; operation != "op-1" || undo.PreviewID != "pv-u" || len(undo.After) != 2 {
		t.Errorf("undo previewed %v: %+v", operation, undo)
	}
}

func TestSuggestions(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	_, listed := mcptest.Call[struct {
		Suggestions []struct {
			ID              string `json:"id"`
			ConfirmedBefore int    `json:"confirmed_before"`
		} `json:"suggestions"`
		NextOffset int `json:"next_offset"`
	}](t, session, "list_grouping_suggestions", map[string]any{"workspace_id": "ws1"})
	if len(listed.Suggestions) != 3 || listed.Suggestions[0].ConfirmedBefore != 2 || listed.NextOffset != 3 {
		t.Errorf("suggestions = %+v", listed)
	}

	_, split := mcptest.Call[previewed](t, session, "preview_suggestion", map[string]any{"workspace_id": "ws1", "suggestion_id": "sg1"})
	if split.PreviewID != "pv-s" || len(split.After) != 2 || split.After[1].Trade != "new" {
		t.Errorf("suggestion preview = %+v", split)
	}

	args := map[string]any{"workspace_id": "ws1", "suggestion_id": "sg1"}
	mcptest.Call[any](t, session, "dismiss_suggestion", args)
	mcptest.Call[any](t, session, "dismiss_suggestion", args)
	dismissed := requests(s, "dismissJournalSuggestion")
	if len(dismissed) != 2 || dismissed[0].Variables["mutationId"] != dismissed[1].Variables["mutationId"] {
		t.Error("dismissing the same suggestion twice must replay, not record two dismissals")
	}
}
