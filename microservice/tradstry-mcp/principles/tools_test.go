package principles_test

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"tradstry-mcp/mcptest"
)

type fakePrinciple struct {
	ID                       string  `json:"id"`
	Title                    string  `json:"title"`
	TheRule                  string  `json:"theRule"`
	Why                      string  `json:"why"`
	Intervention             *string `json:"intervention"`
	PlaybookID               *string `json:"playbookId"`
	EvidenceNoteID           *string `json:"evidenceNoteId"`
	EvidenceNoteTitle        *string `json:"evidenceNoteTitle"`
	IsActive                 bool    `json:"isActive"`
	ViolationCount           int     `json:"violationCount"`
	ViolatedCumulativeProfit float64 `json:"violatedCumulativeProfit"`
	ViolatedWinRate          float64 `json:"violatedWinRate"`
	WorkspaceID              string  `json:"workspaceId"`
}

type fakeAPI struct {
	mu         sync.Mutex
	principles []fakePrinciple
	reordered  []any
}

func newFake() *fakeAPI {
	return &fakeAPI{principles: []fakePrinciple{
		{ID: "p1", WorkspaceID: "ws1", Title: "No revenge trades", TheRule: "Stop after two losses", Why: "Tilt", IsActive: true,
			ViolationCount: 3, ViolatedCumulativeProfit: -420.5, ViolatedWinRate: 33.3},
		{ID: "p2", WorkspaceID: "ws1", Title: "Wait for the open", TheRule: "No trades before 9:45", Why: "Noise", IsActive: true},
		{ID: "p3", WorkspaceID: "ws1", Title: "Old rule", TheRule: "x", Why: "y", IsActive: false},
	}}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := req.Variables
	input, _ := v["input"].(map[string]any)
	switch {
	case strings.Contains(req.Query, "createPrinciple"):
		p := fakePrinciple{ID: "new", WorkspaceID: "ws1", Title: fmt.Sprint(input["title"]), TheRule: fmt.Sprint(input["theRule"]),
			Why: fmt.Sprint(input["why"]), IsActive: true}
		if id, ok := input["playbookId"].(string); ok {
			p.PlaybookID = &id
		}
		f.principles = append(f.principles, p)
		return data(map[string]any{"createPrinciple": p})
	case strings.Contains(req.Query, "updatePrinciple"):
		i := f.index(v["id"])
		if active, ok := input["isActive"].(bool); ok {
			f.principles[i].IsActive = active
		}
		if title, ok := input["title"].(string); ok {
			f.principles[i].Title = title
		}
		return data(map[string]any{"updatePrinciple": f.principles[i]})
	case strings.Contains(req.Query, "deletePrinciple"):
		i := f.index(v["id"])
		f.principles = slices.Delete(f.principles, i, i+1)
		return data(map[string]any{"deletePrinciple": true})
	case strings.Contains(req.Query, "reorderPrinciples"):
		f.reordered = v["ids"].([]any)
		return data(map[string]any{"reorderPrinciples": true})
	case strings.Contains(req.Query, "principle(id"):
		i := f.index(v["id"])
		if i < 0 {
			return data(map[string]any{"principle": nil})
		}
		return data(map[string]any{"principle": f.principles[i]})
	default:
		return data(map[string]any{
			"principles": f.principles,
			"playbooks":  []map[string]any{{"id": "pb1", "name": "Opening Range Breakout"}},
			"workspace":  map[string]any{"currency": "USD"},
		})
	}
}

func (f *fakeAPI) index(id any) int {
	return slices.IndexFunc(f.principles, func(p fakePrinciple) bool { return p.ID == id })
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

type view struct {
	ID          string `json:"id"`
	Position    int    `json:"position"`
	Title       string `json:"title"`
	Playbook    string `json:"playbook"`
	Active      bool   `json:"active"`
	TimesBroken int    `json:"times_broken"`
	WhenBroken  *struct {
		Net      float64 `json:"net"`
		Currency string  `json:"currency"`
	} `json:"when_broken"`
}

type list struct {
	Principles []view `json:"principles"`
}

func TestListShowsActivePrinciplesInOrderWithWhatBreakingThemCost(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[list](t, session, "list_principles", map[string]any{"workspace_id": "ws1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if len(out.Principles) != 2 || out.Principles[0].Position != 1 || out.Principles[1].ID != "p2" {
		t.Fatalf("principles = %+v", out.Principles)
	}
	if b := out.Principles[0].WhenBroken; b == nil || b.Net != -420.5 || b.Currency != "USD" {
		t.Errorf("broken stats = %+v", b)
	}
	if out.Principles[1].WhenBroken != nil {
		t.Error("a principle never broken must not report results")
	}

	_, all := mcptest.Call[list](t, session, "list_principles", map[string]any{"workspace_id": "ws1", "include_inactive": true})
	if len(all.Principles) != 3 {
		t.Errorf("with inactive = %d", len(all.Principles))
	}
}

func TestCreateNeedsTheUsersWordsAndFindsPlaybooksByName(t *testing.T) {
	api := newFake()
	s := mcptest.Start(t, api.respond)
	session := s.Connect(t, nil)

	result, _ := mcptest.Call[view](t, session, "create_principle", map[string]any{"workspace_id": "ws1", "title": "Size down", "rule": "Half size after a loss", "why": "  "})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "ask the user") {
		t.Errorf("missing why: %q", mcptest.Text(result))
	}

	result, created := mcptest.Call[view](t, session, "create_principle", map[string]any{
		"workspace_id": "ws1", "title": "Size down", "rule": "Half size after a loss", "why": "Losses compound", "playbook": "opening range breakout",
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if created.Playbook != "Opening Range Breakout" {
		t.Errorf("created = %+v", created)
	}

	result, _ = mcptest.Call[view](t, session, "create_principle", map[string]any{
		"workspace_id": "ws1", "title": "x", "rule": "x", "why": "x", "playbook": "Scalping",
	})
	if !strings.Contains(mcptest.Text(result), "Opening Range Breakout") {
		t.Errorf("unknown playbook: %q", mcptest.Text(result))
	}
}

func TestMoveSendsTheWholeOrder(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[list](t, session, "move_principle", map[string]any{"workspace_id": "ws1", "principle_id": "p3", "position": 1})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if fmt.Sprint(api.reordered) != "[p3 p1 p2]" {
		t.Errorf("order sent = %v", api.reordered)
	}
	if out.Principles[0].ID != "p3" || out.Principles[0].Position != 1 {
		t.Errorf("result = %+v", out.Principles)
	}
}

func TestUpdateCanSwitchAPrincipleOff(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[view](t, session, "update_principle", map[string]any{"principle_id": "p1", "active": false})
	if result.IsError || out.Active || out.Position != 1 {
		t.Errorf("result = %+v %q", out, mcptest.Text(result))
	}
	if result, _ := mcptest.Call[view](t, session, "update_principle", map[string]any{"principle_id": "p1"}); !result.IsError {
		t.Error("an update with nothing to change was accepted")
	}
}

func TestDeleteSaysWhatIsLostAndWaitsForTheUser(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	args := map[string]any{"principle_id": "p1"}
	result, first := mcptest.Call[struct {
		Status            string `json:"status"`
		Message           string `json:"message"`
		ConfirmationToken string `json:"confirmation_token"`
	}](t, session, "delete_principle", args)
	if result.IsError || first.Status != "needs_confirmation" || !strings.Contains(first.Message, "3 broken trades") {
		t.Fatalf("first = %+v %q", first, mcptest.Text(result))
	}
	if api.index("p1") < 0 {
		t.Fatal("deleted before the user confirmed")
	}
	args["confirmation_token"] = first.ConfirmationToken
	_, done := mcptest.Call[struct {
		Status string `json:"status"`
	}](t, session, "delete_principle", args)
	if done.Status != "deleted" || api.index("p1") >= 0 {
		t.Errorf("confirmed = %+v", done)
	}
}
