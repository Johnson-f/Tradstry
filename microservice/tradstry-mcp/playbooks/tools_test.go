package playbooks_test

import (
	"encoding/json"
	"fmt"
	"maps"
	"strings"
	"sync"
	"testing"

	"tradstry-mcp/mcptest"
)

type fakeAPI struct {
	mu         sync.Mutex
	playbooks  map[string]map[string]any
	principles []map[string]any
	deleted    []string
	applied    map[string]any
}

func newFake() *fakeAPI {
	return &fakeAPI{
		playbooks: map[string]map[string]any{
			"pb1": {"id": "pb1", "workspaceId": "ws1", "name": "Opening Range Breakout", "edgeName": "Early momentum",
				"entryRules": "Break of the 5-minute range", "exitRules": "2R or close below VWAP", "positionSizingRules": "1% risk",
				"additionalRules": nil, "availability": "all", "workspaceIds": []string{},
				"winRate": 55.0, "cumulativeProfit": 1250.0, "averageGain": 300.0, "averageLoss": -150.0, "tradeCount": 12},
			"pb2": {"id": "pb2", "workspaceId": "ws1", "name": "Fade", "edgeName": "Overextension",
				"entryRules": "x", "exitRules": "y", "positionSizingRules": "z", "additionalRules": nil,
				"availability": "all", "workspaceIds": []string{}, "winRate": 0.0, "cumulativeProfit": 0.0,
				"averageGain": 0.0, "averageLoss": 0.0, "tradeCount": 0},
		},
		principles: []map[string]any{{"title": "Respect the range", "playbookId": "pb1"}},
	}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := req.Variables
	input, _ := v["input"].(map[string]any)
	workspaces := []map[string]any{{"id": "ws1", "name": "Main", "currency": "USD"}, {"id": "ws2", "name": "Options", "currency": "USD"}}
	switch {
	case strings.Contains(req.Query, "createPlaybook"):
		p := map[string]any{"id": "pb3", "workspaceId": input["workspaceId"], "name": input["name"], "edgeName": input["edgeName"],
			"entryRules": input["entryRules"], "exitRules": input["exitRules"], "positionSizingRules": input["positionSizingRules"],
			"additionalRules": input["additionalRules"], "availability": "all", "workspaceIds": []string{},
			"winRate": 0.0, "cumulativeProfit": 0.0, "averageGain": 0.0, "averageLoss": 0.0, "tradeCount": 0}
		f.playbooks["pb3"] = p
		return data(map[string]any{"createPlaybook": p})
	case strings.Contains(req.Query, "updatePlaybook"):
		p := f.playbooks[fmt.Sprint(v["id"])]
		maps.Copy(p, input)
		return data(map[string]any{"updatePlaybook": p})
	case strings.Contains(req.Query, "setPlaybookApplicability"):
		f.applied = input
		p := f.playbooks[fmt.Sprint(v["id"])]
		p["availability"], p["workspaceIds"] = input["availability"], input["workspaceIds"]
		return data(map[string]any{"setPlaybookApplicability": p})
	case strings.Contains(req.Query, "deletePlaybook"):
		f.deleted = append(f.deleted, fmt.Sprint(v["id"]))
		return data(map[string]any{"deletePlaybook": true})
	case strings.Contains(req.Query, "principles("):
		return data(map[string]any{"principles": f.principles})
	case strings.Contains(req.Query, "playbook(id"):
		p, ok := f.playbooks[fmt.Sprint(v["id"])]
		if !ok {
			return data(map[string]any{"playbook": nil, "workspaces": workspaces})
		}
		return data(map[string]any{"playbook": p, "workspaces": workspaces})
	default:
		return data(map[string]any{"playbooks": []any{f.playbooks["pb1"], f.playbooks["pb2"]}, "workspaces": workspaces})
	}
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

type view struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	EntryRules  string   `json:"entry_rules"`
	AvailableIn []string `json:"available_in"`
	Results     *struct {
		Trades   int     `json:"trades"`
		Net      float64 `json:"net"`
		Currency string  `json:"currency"`
	} `json:"results"`
}

type deleteResult struct {
	Status            string `json:"status"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token"`
}

func TestListAndGetShowResultsOnlyOnceTraded(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[struct{ Playbooks []view }](t, session, "list_playbooks", map[string]any{"workspace_id": "ws1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if r := out.Playbooks[0].Results; r == nil || r.Trades != 12 || r.Currency != "USD" {
		t.Errorf("results = %+v", r)
	}
	if out.Playbooks[1].Results != nil {
		t.Error("an untraded playbook must not report results")
	}

	result, got := mcptest.Call[view](t, session, "get_playbook", map[string]any{"playbook_id": "pb1"})
	if result.IsError || got.EntryRules != "Break of the 5-minute range" || got.AvailableIn[0] != "All workspaces" {
		t.Errorf("get = %+v %q", got, mcptest.Text(result))
	}
	result, _ = mcptest.Call[view](t, session, "get_playbook", map[string]any{"playbook_id": "nope"})
	if !strings.Contains(mcptest.Text(result), "list_playbooks") {
		t.Errorf("unknown playbook: %q", mcptest.Text(result))
	}
}

func TestCreateNeedsEveryRuleFromTheUser(t *testing.T) {
	api := newFake()
	s := mcptest.Start(t, api.respond)
	session := s.Connect(t, nil)

	args := map[string]any{"workspace_id": "ws1", "name": "Gap and go", "edge": "Overnight news", "entry_rules": "Hold above the open",
		"exit_rules": "  ", "position_sizing_rules": ""}
	result, _ := mcptest.Call[view](t, session, "create_playbook", args)
	if !result.IsError || !strings.Contains(mcptest.Text(result), "exit rules, position sizing rules") {
		t.Errorf("missing rules: %q", mcptest.Text(result))
	}

	args["exit_rules"], args["position_sizing_rules"] = "Lose the open", "0.5% risk"
	result, created := mcptest.Call[view](t, session, "create_playbook", args)
	if result.IsError || created.Name != "Gap and go" {
		t.Errorf("created = %+v %q", created, mcptest.Text(result))
	}
}

func TestSetWorkspacesChoosesWhereAPlaybookIsUsed(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[view](t, session, "set_playbook_workspaces", map[string]any{"playbook_id": "pb2", "workspace_ids": []string{"ws2"}})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if api.applied["availability"] != "selected" || fmt.Sprint(out.AvailableIn) != "[Options]" {
		t.Errorf("applied %v, available in %v", api.applied, out.AvailableIn)
	}
	if result, _ := mcptest.Call[view](t, session, "set_playbook_workspaces", map[string]any{"playbook_id": "pb2"}); !result.IsError {
		t.Error("neither all nor workspace_ids was accepted")
	}
}

func TestDeleteIsRefusedWhilePrinciplesBelongToIt(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[deleteResult](t, session, "delete_playbook", map[string]any{"playbook_id": "pb1"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "Respect the range") {
		t.Errorf("result = %q", mcptest.Text(result))
	}

	args := map[string]any{"playbook_id": "pb2"}
	result, first := mcptest.Call[deleteResult](t, session, "delete_playbook", args)
	if result.IsError || first.Status != "needs_confirmation" || len(api.deleted) != 0 {
		t.Fatalf("first = %+v %q", first, mcptest.Text(result))
	}
	args["confirmation_token"] = first.ConfirmationToken
	if _, done := mcptest.Call[deleteResult](t, session, "delete_playbook", args); done.Status != "deleted" || fmt.Sprint(api.deleted) != "[pb2]" {
		t.Errorf("confirmed = %+v, deleted %v", done, api.deleted)
	}
}
