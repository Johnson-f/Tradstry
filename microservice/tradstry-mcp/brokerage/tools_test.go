package brokerage_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

type workspace struct {
	ID                          string  `json:"id"`
	Name                        string  `json:"name"`
	Broker                      *string `json:"broker"`
	SnaptradeConnectionID       *string `json:"snaptradeConnectionId"`
	SnaptradeConnectionDisabled bool    `json:"snaptradeConnectionDisabled"`
	BrokerageSetupComplete      bool    `json:"brokerageSetupComplete"`
	SnaptradeAuthMode           string  `json:"snaptradeAuthMode"`
}

type attempt struct {
	Status    string  `json:"status"`
	ErrorCode *string `json:"errorCode"`
	Intent    string  `json:"intent"`
}

// fakeAPI answers the brokerage operations the way the Tradstry backend does,
// keeping workspaces in memory.
type fakeAPI struct {
	mu         sync.Mutex
	workspaces map[string]*workspace
	accounts   []map[string]any
	syncStatus string
	// attempts are SnapTrade OAuth attempts; tests settle them the way the
	// backend's OAuth callback would.
	attempts         map[string]*attempt
	oauthUnavailable bool
}

func (f *fakeAPI) settle(attemptID, status string, errorCode *string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.attempts[attemptID].Status = status
	f.attempts[attemptID].ErrorCode = errorCode
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	id, _ := req.Variables["workspaceId"].(string)
	switch {
	case strings.Contains(req.Query, "workspace(id"):
		return data("workspace", f.workspaces[req.Variables["id"].(string)])
	case strings.Contains(req.Query, "initiateBrokerageConnection"):
		return data("initiateBrokerageConnection", map[string]any{"redirectUrl": "https://connect.snaptrade.com/portal/abc"})
	case strings.Contains(req.Query, "completeBrokerageConnection"):
		connection := req.Variables["connectionId"].(string)
		f.workspaces[id].SnaptradeConnectionID = &connection
		f.workspaces[id].SnaptradeConnectionDisabled = false
		return data("completeBrokerageConnection", true)
	case strings.Contains(req.Query, "brokerageConnectionAccounts"):
		return data("brokerageConnectionAccounts", f.accounts)
	case strings.Contains(req.Query, "finalizeBrokerageSetup"):
		input := req.Variables["input"].(map[string]any)
		var ready []map[string]any
		for _, choice := range input["accounts"].([]any) {
			account := choice.(map[string]any)["snaptradeAccountId"].(string)
			ready = append(ready, map[string]any{"id": "ws-" + account, "name": "Account " + account})
		}
		return data("finalizeBrokerageSetup", ready)
	case strings.Contains(req.Query, "syncBrokerageData"):
		return data("syncBrokerageData", map[string]any{"status": f.syncStatus, "transactionsSynced": 12, "holdingsSynced": 3, "balancesSynced": 1})
	case strings.Contains(req.Query, "brokerageSyncOutcome"):
		return data("brokerageSyncOutcome", map[string]any{"status": "succeeded", "transactionsSynced": 12, "holdingsSynced": 3, "balancesSynced": 1})
	case strings.Contains(req.Query, "initiateSnaptradeOauth"):
		if f.oauthUnavailable {
			return `{"data":null,"errors":[{"message":"SnapTrade OAuth is not available for this app"}]}`
		}
		intent := "connect"
		if ws := f.workspaces[id]; ws.SnaptradeAuthMode == "oauth" && ws.SnaptradeConnectionID != nil {
			intent = "reauthorize"
		}
		attemptID := fmt.Sprintf("attempt-%d", len(f.attempts)+1)
		f.attempts[attemptID] = &attempt{Status: "pending", Intent: intent}
		return data("initiateSnaptradeOauth", map[string]any{"attemptId": attemptID, "authorizationUrl": "https://app.snaptrade.com/oauth/authorize?a=" + attemptID})
	case strings.Contains(req.Query, "snaptradeOauthStatus"):
		return data("snaptradeOauthStatus", f.attempts[req.Variables["attemptId"].(string)])
	case strings.Contains(req.Query, "snaptradeOauthAccounts"):
		return data("snaptradeOauthAccounts", f.accounts)
	case strings.Contains(req.Query, "finalizeSnaptradeOauthSetup"):
		return data("finalizeSnaptradeOauthSetup", []map[string]any{{"id": "ws1", "name": "Main"}})
	case strings.Contains(req.Query, "completeSnaptradeOauthReauthorization"):
		for _, ws := range f.workspaces {
			ws.SnaptradeConnectionDisabled = false
		}
		return data("completeSnaptradeOauthReauthorization", map[string]any{"id": "ws1"})
	case strings.Contains(req.Query, "disconnectBrokerage"):
		f.workspaces[id].SnaptradeConnectionID = nil
		return data("disconnectBrokerage", true)
	}
	return `{"data":null,"errors":[{"message":"unexpected operation"}]}`
}

func data(field string, value any) string {
	body, _ := json.Marshal(map[string]any{"data": map[string]any{field: value}})
	return string(body)
}

func start(t *testing.T, workspaces ...*workspace) (*mcptest.Stack, *fakeAPI) {
	api := &fakeAPI{workspaces: map[string]*workspace{}, attempts: map[string]*attempt{}, syncStatus: "completed", accounts: []map[string]any{
		{"id": "acc-1", "name": "Individual", "institutionName": "Schwab", "current": false},
		{"id": "acc-2", "name": "Roth IRA", "institutionName": "Schwab", "current": false},
	}}
	for _, w := range workspaces {
		api.workspaces[w.ID] = w
	}
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

// returnFromSnapTrade plays the browser that SnapTrade redirects back to the
// return address it was given, with the outcome appended.
func returnFromSnapTrade(t *testing.T, s *mcptest.Stack, outcome url.Values) (int, string) {
	t.Helper()
	initiated := requests(s, "initiateBrokerageConnection")
	redirect := initiated[len(initiated)-1].Variables["customRedirect"].(string)
	target, err := url.Parse(redirect)
	if err != nil {
		t.Fatal(err)
	}
	query := target.Query()
	for key, values := range outcome {
		query[key] = values
	}
	target.RawQuery = query.Encode()
	resp, err := http.Get(target.String())
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

type finishResult struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	Accounts []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"accounts"`
}

func newWorkspace(id string) *workspace {
	return &workspace{ID: id, Name: "Main"}
}

func TestConnectingABrokerEndToEnd(t *testing.T) {
	s, api := start(t, newWorkspace("ws1"))
	session := s.Connect(t, nil)
	args := map[string]any{"workspace_id": "ws1"}

	result, link := mcptest.Call[struct{ URL string }](t, session, "connect_brokerage", args)
	if result.IsError || link.URL != "https://connect.snaptrade.com/portal/abc" {
		t.Fatalf("connect = %+v %q", link, mcptest.Text(result))
	}
	initiate := requests(s, "initiateBrokerageConnection")[0].Variables
	if !strings.HasPrefix(initiate["customRedirect"].(string), s.URL+"/brokerage/connected?state=") || initiate["reconnect"] != false {
		t.Errorf("initiate variables = %v", initiate)
	}

	if _, waiting := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args); waiting.Status != "waiting" {
		t.Errorf("before the user returns: %+v", waiting)
	}

	code, page := returnFromSnapTrade(t, s, url.Values{"status": {"SUCCESS"}, "connection_id": {"conn-1"}})
	if code != http.StatusOK || !strings.Contains(page, "go back to your chat") {
		t.Errorf("landing page %d: %s", code, page)
	}

	_, finished := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args)
	if finished.Status != "choose_accounts" || len(finished.Accounts) != 2 {
		t.Fatalf("finish = %+v", finished)
	}
	completed := requests(s, "completeBrokerageConnection")
	if len(completed) != 1 || completed[0].Variables["connectionId"] != "conn-1" || completed[0].Variables["workspaceId"] != "ws1" {
		t.Errorf("complete calls = %+v", completed)
	}
	if result, _ := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args); !result.IsError {
		t.Error("a finished connection was finished twice")
	}

	result, setUp := mcptest.Call[struct {
		Workspaces []struct {
			WorkspaceID string `json:"workspace_id"`
			Sync        *struct {
				Status             string `json:"status"`
				TransactionsSynced int    `json:"transactionsSynced"`
			} `json:"sync"`
		}
	}](t, session, "set_up_brokerage_accounts", map[string]any{
		"workspace_id":       "ws1",
		"primary_account_id": "acc-1",
		"accounts": []map[string]any{
			{"account_id": "acc-1", "history": "one_year"},
			{"account_id": "acc-2", "history": "custom", "custom_start_date": "2025-01-01"},
		},
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	input := requests(s, "finalizeBrokerageSetup")[0].Variables["input"]
	want := `{"accounts":[{"policy":{"mode":"one_year"},"snaptradeAccountId":"acc-1"},{"policy":{"customStartDate":"2025-01-01","mode":"custom"},"snaptradeAccountId":"acc-2"}],"primarySnaptradeAccountId":"acc-1","workspaceId":"ws1"}`
	if got, _ := json.Marshal(input); string(got) != want {
		t.Errorf("finalize input = %s", got)
	}
	if len(setUp.Workspaces) != 2 || setUp.Workspaces[1].Sync == nil || setUp.Workspaces[1].Sync.TransactionsSynced != 12 {
		t.Errorf("set up = %+v", setUp)
	}
	if synced := requests(s, "syncBrokerageData"); len(synced) != 2 {
		t.Errorf("synced %d workspaces, want 2", len(synced))
	}
	if *api.workspaces["ws1"].SnaptradeConnectionID != "conn-1" {
		t.Error("the connection was not stored")
	}
}

func TestPortalOutcomesThatDoNotConnect(t *testing.T) {
	for name, tc := range map[string]struct {
		outcome url.Values
		status  string
		mention string
	}{
		"user left":     {url.Values{"status": {"ABANDONED"}}, "cancelled", "left SnapTrade"},
		"broker failed": {url.Values{"status": {"ERROR"}, "error_code": {"INVALID_CREDENTIALS"}}, "failed", "INVALID_CREDENTIALS"},
		"no connection": {url.Values{"status": {"SUCCESS"}}, "failed", "did not connect"},
	} {
		t.Run(name, func(t *testing.T) {
			s, _ := start(t, newWorkspace("ws1"))
			session := s.Connect(t, nil)
			mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1"})
			returnFromSnapTrade(t, s, tc.outcome)

			_, finished := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", map[string]any{"workspace_id": "ws1"})
			if finished.Status != tc.status || !strings.Contains(finished.Message, tc.mention) {
				t.Errorf("finish = %+v", finished)
			}
			if len(requests(s, "completeBrokerageConnection")) != 0 {
				t.Error("a connection that did not succeed was completed")
			}
		})
	}
}

func TestAnUnknownReturnLinkIsRefused(t *testing.T) {
	s, _ := start(t)
	resp, err := http.Get(s.URL + "/brokerage/connected?state=forged&status=SUCCESS&connection_id=conn-x")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

func TestAConnectionIsOnlyFinishedForItsOwnWorkspace(t *testing.T) {
	s, _ := start(t, newWorkspace("ws1"), newWorkspace("ws2"))
	session := s.Connect(t, nil)
	mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1"})
	returnFromSnapTrade(t, s, url.Values{"status": {"SUCCESS"}, "connection_id": {"conn-1"}})

	if result, _ := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", map[string]any{"workspace_id": "ws2"}); !result.IsError {
		t.Error("another workspace finished ws1's connection")
	}
	if len(requests(s, "completeBrokerageConnection")) != 0 {
		t.Error("the connection was attached to the wrong workspace")
	}
}

func TestReconnectingABrokenLinkAndRefusingAWorkingOne(t *testing.T) {
	connection := "conn-1"
	broken := &workspace{ID: "ws1", Name: "Main", SnaptradeConnectionID: &connection, SnaptradeConnectionDisabled: true}
	working := &workspace{ID: "ws2", Name: "IRA", SnaptradeConnectionID: &connection}
	s, _ := start(t, broken, working)
	session := s.Connect(t, nil)

	if result, _ := mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1"}); result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if reconnect := requests(s, "initiateBrokerageConnection")[0].Variables["reconnect"]; reconnect != true {
		t.Errorf("reconnect = %v, want true for a disabled link", reconnect)
	}
	result, _ := mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws2"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "already connected") {
		t.Errorf("connecting a working link: %q", mcptest.Text(result))
	}
	if len(requests(s, "initiateBrokerageConnection")) != 1 {
		t.Error("a portal was opened for an already connected workspace")
	}
}

func TestSetUpRejectsChoicesBeforeCallingTradstry(t *testing.T) {
	s, _ := start(t, newWorkspace("ws1"))
	session := s.Connect(t, nil)
	for name, accounts := range map[string][]map[string]any{
		"primary not chosen":   {{"account_id": "acc-2", "history": "all"}},
		"custom without date":  {{"account_id": "acc-1", "history": "custom"}},
		"custom with bad date": {{"account_id": "acc-1", "history": "custom", "custom_start_date": "01/01/2025"}},
		"unknown history":      {{"account_id": "acc-1", "history": "forever"}},
	} {
		result, _ := mcptest.Call[any](t, session, "set_up_brokerage_accounts", map[string]any{
			"workspace_id": "ws1", "primary_account_id": "acc-1", "accounts": accounts,
		})
		if !result.IsError {
			t.Errorf("%s was accepted", name)
		}
	}
	if len(requests(s, "finalizeBrokerageSetup")) != 0 {
		t.Error("invalid choices reached the Tradstry API")
	}
}

func TestDisconnectAsksTheUserFirst(t *testing.T) {
	for _, tc := range []struct {
		answer       *mcp.ElicitResult
		status       string
		disconnected bool
	}{
		{&mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, "disconnected", true},
		{&mcp.ElicitResult{Action: "decline"}, "cancelled", false},
	} {
		t.Run(tc.status, func(t *testing.T) {
			connection := "conn-1"
			schwab := "Schwab"
			s, api := start(t, &workspace{ID: "ws1", Name: "Main", Broker: &schwab, SnaptradeConnectionID: &connection})
			var asked string
			session := s.Connect(t, &mcp.ClientOptions{
				ElicitationHandler: func(_ context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
					asked = req.Params.Message
					return tc.answer, nil
				},
			})

			_, out := mcptest.Call[struct{ Status string }](t, session, "disconnect_brokerage", map[string]any{"workspace_id": "ws1"})
			if out.Status != tc.status {
				t.Errorf("status = %q", out.Status)
			}
			if !strings.Contains(asked, "Schwab") || !strings.Contains(asked, "already imported stay") {
				t.Errorf("the user was asked %q", asked)
			}
			if gone := api.workspaces["ws1"].SnaptradeConnectionID == nil; gone != tc.disconnected {
				t.Errorf("disconnected = %v", gone)
			}
		})
	}
}

func TestDisconnectingAnUnconnectedWorkspaceAsksNothing(t *testing.T) {
	s, _ := start(t, newWorkspace("ws1"))
	asked := false
	session := s.Connect(t, &mcp.ClientOptions{
		ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
			asked = true
			return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, nil
		},
	})
	if result, _ := mcptest.Call[any](t, session, "disconnect_brokerage", map[string]any{"workspace_id": "ws1"}); !result.IsError || asked {
		t.Errorf("IsError = %v, asked = %v", result.IsError, asked)
	}
}

func TestStatusAndSync(t *testing.T) {
	connection := "conn-1"
	s, api := start(t, &workspace{ID: "ws1", Name: "Main", SnaptradeConnectionID: &connection, SnaptradeConnectionDisabled: true})
	session := s.Connect(t, nil)

	_, status := mcptest.Call[struct {
		Connected      bool `json:"connected"`
		NeedsReconnect bool `json:"needs_reconnect"`
		LastSync       *struct {
			Status string `json:"status"`
		} `json:"last_sync"`
	}](t, session, "get_brokerage_status", map[string]any{"workspace_id": "ws1"})
	if !status.Connected || !status.NeedsReconnect || status.LastSync == nil || status.LastSync.Status != "succeeded" {
		t.Errorf("status = %+v", status)
	}

	api.mu.Lock()
	api.syncStatus = "queued"
	api.mu.Unlock()
	_, synced := mcptest.Call[struct{ Status string }](t, session, "sync_brokerage", map[string]any{"workspace_id": "ws1"})
	if synced.Status != "queued" {
		t.Errorf("sync = %+v", synced)
	}
	if result, _ := mcptest.Call[any](t, session, "get_brokerage_status", map[string]any{"workspace_id": "nope"}); !strings.Contains(mcptest.Text(result), "not found") {
		t.Errorf("unknown workspace: %q", mcptest.Text(result))
	}
}

func TestConnectingWithASnapTradeAccount(t *testing.T) {
	s, api := start(t, newWorkspace("ws1"))
	session := s.Connect(t, nil)
	args := map[string]any{"workspace_id": "ws1"}

	_, link := mcptest.Call[struct{ URL string }](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1", "method": "snaptrade_account"})
	if link.URL != "https://app.snaptrade.com/oauth/authorize?a=attempt-1" {
		t.Fatalf("link = %q", link.URL)
	}
	if platform := requests(s, "initiateSnaptradeOauth")[0].Variables["platform"]; platform != "mcp" {
		t.Errorf("platform = %v, want mcp so SnapTrade returns the browser to the MCP server", platform)
	}
	if len(requests(s, "initiateBrokerageConnection")) != 0 {
		t.Error("the connection portal was opened for a SnapTrade account sign-in")
	}

	if _, waiting := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args); waiting.Status != "waiting" {
		t.Errorf("before approval: %+v", waiting)
	}

	api.settle("attempt-1", "authorized", nil)
	resp, err := http.Get(s.URL + "/brokerage/snaptrade-authorized?attempt=attempt-1&status=authorized")
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(page), "go back to your chat") {
		t.Errorf("landing page %d: %s", resp.StatusCode, page)
	}

	if _, finished := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args); finished.Status != "choose_accounts" || len(finished.Accounts) != 2 {
		t.Fatalf("finish = %+v", finished)
	}
	if _, listed := mcptest.Call[finishResult](t, session, "list_brokerage_accounts", args); len(listed.Accounts) != 2 || len(requests(s, "brokerageConnectionAccounts")) != 0 {
		t.Errorf("before set-up, accounts must come from the OAuth attempt: %+v", listed)
	}

	result, _ := mcptest.Call[any](t, session, "set_up_brokerage_accounts", map[string]any{
		"workspace_id": "ws1", "primary_account_id": "acc-1",
		"accounts": []map[string]any{{"account_id": "acc-1", "history": "all"}},
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	finalized := requests(s, "finalizeSnaptradeOauthSetup")
	if len(finalized) != 1 || finalized[0].Variables["attemptId"] != "attempt-1" || len(requests(s, "finalizeBrokerageSetup")) != 0 {
		t.Errorf("finalized through %+v", finalized)
	}
	if len(requests(s, "syncBrokerageData")) != 1 {
		t.Error("the first sync did not run")
	}
	if result, _ := mcptest.Call[any](t, session, "finish_brokerage_connection", args); !result.IsError {
		t.Error("a finished sign-in could be finished again")
	}
}

func TestSnapTradeSignInsThatDoNotConnect(t *testing.T) {
	code := "token_exchange_failed"
	for _, tc := range []struct {
		status, want, mention string
		errorCode             *string
	}{
		{"denied", "cancelled", "did not approve", nil},
		{"failed", "failed", "token_exchange_failed", &code},
		{"expired", "failed", "expired", nil},
	} {
		t.Run(tc.status, func(t *testing.T) {
			s, api := start(t, newWorkspace("ws1"))
			session := s.Connect(t, nil)
			mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1", "method": "snaptrade_account"})
			api.settle("attempt-1", tc.status, tc.errorCode)

			_, finished := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", map[string]any{"workspace_id": "ws1"})
			if finished.Status != tc.want || !strings.Contains(finished.Message, tc.mention) {
				t.Errorf("finish = %+v", finished)
			}
			if len(requests(s, "snaptradeOauthAccounts")) != 0 {
				t.Error("accounts were read for a sign-in that did not connect")
			}
		})
	}
}

func TestABrokenSnapTradeAccountLinkIsRepairedTheSameWay(t *testing.T) {
	connection := "conn-1"
	s, api := start(t, &workspace{ID: "ws1", Name: "Main", SnaptradeConnectionID: &connection, SnaptradeConnectionDisabled: true, SnaptradeAuthMode: "oauth"})
	session := s.Connect(t, nil)
	args := map[string]any{"workspace_id": "ws1"}

	if result, _ := mcptest.Call[any](t, session, "connect_brokerage", args); result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if len(requests(s, "initiateBrokerageConnection")) != 0 || len(requests(s, "initiateSnaptradeOauth")) != 1 {
		t.Fatal("a SnapTrade account link must be repaired through SnapTrade sign-in, not the portal")
	}
	api.settle("attempt-1", "authorized", nil)
	if _, finished := mcptest.Call[finishResult](t, session, "finish_brokerage_connection", args); finished.Status != "connected" {
		t.Errorf("finish = %+v", finished)
	}
	if len(requests(s, "completeSnaptradeOauthReauthorization")) != 1 || api.workspaces["ws1"].SnaptradeConnectionDisabled {
		t.Error("the link was not repaired")
	}
}

func TestSnapTradeAccountSignInCanBeUnavailable(t *testing.T) {
	s, api := start(t, newWorkspace("ws1"))
	api.oauthUnavailable = true
	session := s.Connect(t, nil)

	result, _ := mcptest.Call[any](t, session, "connect_brokerage", map[string]any{"workspace_id": "ws1", "method": "snaptrade_account"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "broker_login") {
		t.Errorf("unavailable sign-in: %q", mcptest.Text(result))
	}
	if result, _ := mcptest.Call[any](t, session, "finish_brokerage_connection", map[string]any{"workspace_id": "ws1"}); !result.IsError {
		t.Error("a sign-in that never started left something to finish")
	}
}
