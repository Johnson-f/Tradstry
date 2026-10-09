package workspaces_test

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

type workspace struct {
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	Currency              string  `json:"currency"`
	AssetClass            string  `json:"assetClass"`
	RiskProfile           string  `json:"riskProfile"`
	Broker                *string `json:"broker"`
	TotalValue            float64 `json:"totalValue"`
	SnaptradeConnectionID *string `json:"snaptradeConnectionId"`
}

// fakeAPI keeps workspaces in memory and answers the workspace operations the
// way the Tradstry backend does.
type fakeAPI struct {
	mu         sync.Mutex
	workspaces []workspace
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	input, _ := req.Variables["input"].(map[string]any)
	switch {
	case strings.Contains(req.Query, "createWorkspace"):
		w := workspace{ID: fmt.Sprintf("ws%d", len(f.workspaces)+1), Currency: "USD", AssetClass: "mixed", RiskProfile: "moderate"}
		apply(&w, input)
		f.workspaces = append(f.workspaces, w)
		return data("createWorkspace", w)
	case strings.Contains(req.Query, "updateWorkspace"):
		i := f.index(req.Variables["id"])
		if i < 0 {
			return `{"data":null,"errors":[{"message":"Workspace not found"}]}`
		}
		apply(&f.workspaces[i], input)
		return data("updateWorkspace", f.workspaces[i])
	case strings.Contains(req.Query, "deleteWorkspace"):
		i := f.index(req.Variables["id"])
		if i >= 0 {
			f.workspaces = slices.Delete(f.workspaces, i, i+1)
		}
		return data("deleteWorkspace", i >= 0)
	default:
		return data("workspaces", f.workspaces)
	}
}

func (f *fakeAPI) index(id any) int {
	return slices.IndexFunc(f.workspaces, func(w workspace) bool { return w.ID == id })
}

func (f *fakeAPI) names() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var names []string
	for _, w := range f.workspaces {
		names = append(names, w.Name)
	}
	return names
}

func apply(w *workspace, input map[string]any) {
	for key, value := range input {
		s := value.(string)
		switch key {
		case "name":
			w.Name = s
		case "currency":
			w.Currency = s
		case "assetClass":
			w.AssetClass = s
		case "riskProfile":
			w.RiskProfile = s
		}
	}
}

func data(field string, value any) string {
	body, _ := json.Marshal(map[string]any{"data": map[string]any{field: value}})
	return string(body)
}

func start(t *testing.T, existing ...workspace) (*mcptest.Stack, *fakeAPI) {
	api := &fakeAPI{workspaces: existing}
	return mcptest.Start(t, api.respond), api
}

type view struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Currency           string   `json:"currency"`
	AssetClass         string   `json:"asset_class"`
	RiskProfile        string   `json:"risk_profile"`
	Broker             string   `json:"broker"`
	TotalValue         *float64 `json:"total_value"`
	BrokerageConnected bool     `json:"brokerage_connected"`
}

type deleteResult struct {
	Status            string `json:"status"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token"`
}

var (
	primary = workspace{ID: "ws1", Name: "Main", Currency: "USD", AssetClass: "stocks", RiskProfile: "moderate"}
	options = workspace{ID: "ws2", Name: "Options Account", Currency: "USD", AssetClass: "options", RiskProfile: "aggressive",
		Broker: new("Schwab"), TotalValue: 1250.5, SnaptradeConnectionID: new("conn1")}
)

func TestListWorkspacesActsAsTheCaller(t *testing.T) {
	s, _ := start(t, primary, options)
	session := s.Connect(t, nil)

	result, out := mcptest.Call[struct{ Workspaces []view }](t, session, "list_workspaces", nil)
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if got := s.Requests()[0].Authorization; !strings.HasPrefix(got, "Bearer ey") {
		t.Errorf("the Tradstry API received %q, want the caller's token", got)
	}
	if len(out.Workspaces) != 2 {
		t.Fatalf("workspaces = %+v", out.Workspaces)
	}
	if w := out.Workspaces[0]; w.TotalValue != nil || w.BrokerageConnected {
		t.Errorf("an unconnected workspace with no reported value = %+v", w)
	}
	if w := out.Workspaces[1]; w.Broker != "Schwab" || *w.TotalValue != 1250.5 || !w.BrokerageConnected {
		t.Errorf("connected workspace = %+v", w)
	}
}

func TestCreateWorkspaceLeavesUnsetFieldsToTheBackend(t *testing.T) {
	s, api := start(t, primary)
	session := s.Connect(t, nil)

	result, created := mcptest.Call[view](t, session, "create_workspace", map[string]any{
		"name": "  Options Account ", "asset_class": "options",
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	sent := s.Requests()[0].Variables["input"]
	if want := map[string]any{"name": "Options Account", "assetClass": "options"}; fmt.Sprint(sent) != fmt.Sprint(want) {
		t.Errorf("sent input %v, want %v", sent, want)
	}
	if created.Name != "Options Account" || created.Currency != "USD" || created.AssetClass != "options" {
		t.Errorf("created = %+v", created)
	}
	if names := api.names(); !slices.Equal(names, []string{"Main", "Options Account"}) {
		t.Errorf("workspaces = %v", names)
	}
}

func TestCreateWorkspaceRejectsValuesTheAppDoesNotOffer(t *testing.T) {
	s, _ := start(t, primary)
	session := s.Connect(t, nil)

	for _, args := range []map[string]any{
		{"name": "Crypto", "currency": "BTC"},
		{"name": "Crypto", "risk_profile": "yolo"},
		{"name": "Crypto", "asset_class": "bonds"},
		{"name": "   "},
		{},
	} {
		if result, _ := mcptest.Call[view](t, session, "create_workspace", args); !result.IsError {
			t.Errorf("%v was accepted", args)
		}
	}
	if len(s.Requests()) != 0 {
		t.Errorf("invalid input reached the Tradstry API: %+v", s.Requests())
	}
}

func TestUpdateWorkspaceSendsOnlyWhatChanges(t *testing.T) {
	s, _ := start(t, primary, options)
	session := s.Connect(t, nil)

	result, updated := mcptest.Call[view](t, session, "update_workspace", map[string]any{
		"workspace_id": "ws1", "risk_profile": "aggressive",
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	req := s.Requests()[0]
	if req.Variables["id"] != "ws1" || fmt.Sprint(req.Variables["input"]) != fmt.Sprint(map[string]any{"riskProfile": "aggressive"}) {
		t.Errorf("sent %v", req.Variables)
	}
	if updated.RiskProfile != "aggressive" || updated.Name != "Main" {
		t.Errorf("updated = %+v", updated)
	}

	if result, _ := mcptest.Call[view](t, session, "update_workspace", map[string]any{"workspace_id": "ws1"}); !result.IsError {
		t.Error("an update with nothing to change was accepted")
	}
	if result, _ := mcptest.Call[view](t, session, "update_workspace", map[string]any{"workspace_id": "nope", "name": "X"}); !strings.Contains(mcptest.Text(result), "Workspace not found") {
		t.Errorf("unknown workspace: %q", mcptest.Text(result))
	}
}

func elicitation(answer func(*mcp.ElicitRequest) *mcp.ElicitResult) *mcp.ClientOptions {
	return &mcp.ClientOptions{
		ElicitationHandler: func(_ context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
			return answer(req), nil
		},
	}
}

func TestDeleteAsksTheUserDirectlyWhenTheAppCan(t *testing.T) {
	s, api := start(t, primary, options)
	var asked string
	session := s.Connect(t, elicitation(func(req *mcp.ElicitRequest) *mcp.ElicitResult {
		asked = req.Params.Message
		return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}
	}))

	result, out := mcptest.Call[deleteResult](t, session, "delete_workspace", map[string]any{"workspace_id": "ws2"})
	if result.IsError || out.Status != "deleted" {
		t.Fatalf("result = %+v %q", out, mcptest.Text(result))
	}
	for _, want := range []string{`"Options Account"`, "journal entries", "brokerage connection", "cannot be undone"} {
		if !strings.Contains(asked, want) {
			t.Errorf("the user was asked %q, which does not mention %q", asked, want)
		}
	}
	if names := api.names(); !slices.Equal(names, []string{"Main"}) {
		t.Errorf("workspaces after delete = %v", names)
	}
}

func TestDeleteDoesNothingWhenTheUserSaysNo(t *testing.T) {
	answers := map[string]*mcp.ElicitResult{
		"declined":      {Action: "decline"},
		"cancelled":     {Action: "cancel"},
		"left unticked": {Action: "accept", Content: map[string]any{"confirm": false}},
	}
	for name, answer := range answers {
		t.Run(name, func(t *testing.T) {
			s, api := start(t, primary, options)
			session := s.Connect(t, elicitation(func(*mcp.ElicitRequest) *mcp.ElicitResult { return answer }))

			result, out := mcptest.Call[deleteResult](t, session, "delete_workspace", map[string]any{"workspace_id": "ws2"})
			if result.IsError || out.Status != "cancelled" {
				t.Errorf("result = %+v %q", out, mcptest.Text(result))
			}
			if len(api.names()) != 2 {
				t.Error("the workspace was deleted without confirmation")
			}
		})
	}
}

func TestDeleteWithoutPromptsNeedsTheTokenBackAfterTheUserAgrees(t *testing.T) {
	s, api := start(t, primary, options)
	session := s.Connect(t, nil)
	args := map[string]any{"workspace_id": "ws2"}

	result, first := mcptest.Call[deleteResult](t, session, "delete_workspace", args)
	if result.IsError || first.Status != "needs_confirmation" || first.ConfirmationToken == "" || !strings.Contains(first.Message, "cannot be undone") {
		t.Fatalf("first call = %+v %q", first, mcptest.Text(result))
	}

	args["confirmation_token"] = first.ConfirmationToken + "x"
	if _, forged := mcptest.Call[deleteResult](t, session, "delete_workspace", args); forged.Status != "needs_confirmation" {
		t.Errorf("a forged token gave %+v", forged)
	}
	otherWorkspace := map[string]any{"workspace_id": "ws1", "confirmation_token": first.ConfirmationToken}
	if _, reused := mcptest.Call[deleteResult](t, session, "delete_workspace", otherWorkspace); reused.Status != "needs_confirmation" {
		t.Errorf("a token for another workspace gave %+v", reused)
	}
	if len(api.names()) != 2 {
		t.Fatal("a workspace was deleted without a valid token")
	}

	args["confirmation_token"] = first.ConfirmationToken
	if _, confirmed := mcptest.Call[deleteResult](t, session, "delete_workspace", args); confirmed.Status != "deleted" {
		t.Errorf("confirmed call = %+v", confirmed)
	}
	if names := api.names(); !slices.Equal(names, []string{"Main"}) {
		t.Errorf("workspaces after delete = %v", names)
	}
}

func TestDeleteRefusesBeforeAskingWhenItCannotHappen(t *testing.T) {
	s, _ := start(t, primary)
	asked := false
	session := s.Connect(t, elicitation(func(*mcp.ElicitRequest) *mcp.ElicitResult {
		asked = true
		return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}
	}))

	for id, want := range map[string]string{"ws1": "only workspace", "nope": "not found"} {
		result, _ := mcptest.Call[deleteResult](t, session, "delete_workspace", map[string]any{"workspace_id": id})
		if !result.IsError || !strings.Contains(mcptest.Text(result), want) {
			t.Errorf("%s: %q", id, mcptest.Text(result))
		}
	}
	if asked {
		t.Error("the user was asked to confirm a deletion that cannot happen")
	}
}

func TestCallerWithoutATradstryAccountIsToldToSignUp(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string {
		return `{"data":null,"errors":[{"message":"ACCOUNT_REQUIRED","extensions":{"code":"ACCOUNT_REQUIRED"}}]}`
	})
	session := s.Connect(t, nil)

	result, _ := mcptest.Call[any](t, session, "list_workspaces", nil)
	if !result.IsError || !strings.Contains(mcptest.Text(result), "Sign up at tradstry.com") {
		t.Errorf("IsError = %v, text = %q", result.IsError, mcptest.Text(result))
	}
}

func TestToolsDescribeThemselvesForTheAssistant(t *testing.T) {
	s, _ := start(t)
	session := s.Connect(t, nil)

	listed, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	tools := map[string]*mcp.Tool{}
	for _, tool := range listed.Tools {
		tools[tool.Name] = tool
	}
	if len(tools) != 4 {
		t.Fatalf("tools = %v", tools)
	}
	if !tools["list_workspaces"].Annotations.ReadOnlyHint {
		t.Error("list_workspaces must be read-only")
	}
	if hint := tools["delete_workspace"].Annotations.DestructiveHint; hint == nil || !*hint {
		t.Error("delete_workspace must be marked destructive")
	}
	schema, _ := json.Marshal(tools["create_workspace"].InputSchema)
	for _, want := range []string{`"required":["name"]`, `"enum":["USD","EUR","GBP","JPY","CAD","AUD","CHF"]`, "defaults to USD"} {
		if !strings.Contains(string(schema), want) {
			t.Errorf("create_workspace schema lacks %s: %s", want, schema)
		}
	}
}
