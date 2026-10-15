package overview_test

import (
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"

	"tradstry-mcp/mcptest"
)

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

func trades(states ...[2]string) []any {
	out := []any{}
	for _, s := range states {
		out = append(out, map[string]any{"lifecycleState": s[0], "reviewState": s[1]})
	}
	return out
}

type view struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Error     string `json:"error"`
	Brokerage struct {
		Broker         string `json:"broker"`
		Connected      bool   `json:"connected"`
		NeedsReconnect bool   `json:"needs_reconnect"`
		LastSync       *struct {
			Status string `json:"status"`
			At     string `json:"at"`
		} `json:"last_sync"`
	} `json:"brokerage"`
	Journal *struct {
		Automatic bool `json:"automatic"`
		UpToDate  bool `json:"up_to_date"`
		Trades    struct {
			Open             int `json:"open"`
			Closed           int `json:"closed"`
			Incomplete       int `json:"incomplete"`
			ClosedUnreviewed int `json:"closed_unreviewed"`
		} `json:"trades"`
	} `json:"journal"`
}

func respond(syncCalls *atomic.Int32) func(mcptest.Request) string {
	return func(req mcptest.Request) string {
		switch {
		case strings.Contains(req.Query, "OverviewWorkspaces"):
			return data(map[string]any{"workspaces": []any{
				map[string]any{"id": "ws1", "name": "Main", "currency": "USD", "broker": "Alpaca", "snaptradeConnectionId": "c1", "snaptradeConnectionDisabled": true, "brokerageSetupComplete": true},
				map[string]any{"id": "ws2", "name": "Manual", "currency": "EUR", "broker": nil, "snaptradeConnectionId": nil, "snaptradeConnectionDisabled": false, "brokerageSetupComplete": false},
				map[string]any{"id": "ws3", "name": "Broken", "currency": "USD", "broker": nil, "snaptradeConnectionId": nil, "snaptradeConnectionDisabled": false, "brokerageSetupComplete": false},
			}})
		case strings.Contains(req.Query, "OverviewSync"):
			syncCalls.Add(1)
			return data(map[string]any{"brokerageSyncOutcome": map[string]any{"status": "succeeded", "error": nil, "finishedAt": "2026-10-14T10:00:05Z", "succeededAt": "2026-10-14T10:00:00Z"}})
		case strings.Contains(req.Query, "OverviewJournal"):
			switch req.Variables["workspaceId"] {
			case "ws1":
				return data(map[string]any{
					"journalFlowStatus": map[string]any{"enabled": true, "sourceRevision": 4, "projectionRevision": 4, "importState": "idle", "lastError": nil},
					"journalTradesV2": trades([2]string{"open", "unreviewed"}, [2]string{"closed", "unreviewed"}, [2]string{"closed", "reviewed"},
						[2]string{"closed", "outdated"}, [2]string{"incomplete", "unreviewed"}),
				})
			case "ws2":
				return data(map[string]any{
					"journalFlowStatus": map[string]any{"enabled": false, "sourceRevision": 0, "projectionRevision": 0, "importState": "idle", "lastError": nil},
					"journalTradesV2":   trades([2]string{"closed", "unreviewed"}),
				})
			}
			return `{"data":null,"errors":[{"message":"Workspace not found","extensions":{"code":"NOT_FOUND"}}]}`
		}
		return `{"data":null,"errors":[{"message":"unexpected operation"}]}`
	}
}

func TestOverviewSummarisesEveryWorkspaceInOneCall(t *testing.T) {
	var syncCalls atomic.Int32
	session := mcptest.Start(t, respond(&syncCalls)).Connect(t, nil)

	result, out := mcptest.Call[struct{ Workspaces []view }](t, session, "get_overview", nil)
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if len(out.Workspaces) != 3 || out.Workspaces[0].ID != "ws1" || out.Workspaces[1].ID != "ws2" {
		t.Fatalf("workspaces = %+v", out.Workspaces)
	}

	main := out.Workspaces[0]
	if !main.Brokerage.Connected || !main.Brokerage.NeedsReconnect || main.Brokerage.Broker != "Alpaca" ||
		main.Brokerage.LastSync == nil || main.Brokerage.LastSync.At != "2026-10-14T10:00:00Z" {
		t.Errorf("brokerage = %+v", main.Brokerage)
	}
	if j := main.Journal; j == nil || !j.Automatic || !j.UpToDate || j.Trades.Open != 1 || j.Trades.Closed != 3 || j.Trades.Incomplete != 1 || j.Trades.ClosedUnreviewed != 1 {
		t.Errorf("journal = %+v", j)
	}

	manual := out.Workspaces[1]
	if manual.Brokerage.Connected || manual.Brokerage.LastSync != nil {
		t.Errorf("manual brokerage = %+v", manual.Brokerage)
	}
	if j := manual.Journal; j == nil || j.Automatic || j.UpToDate || j.Trades.Closed != 1 {
		t.Errorf("a journal that is off still reports its trades: %+v", j)
	}
	if syncCalls.Load() != 1 {
		t.Errorf("sync queried %d times, want once, for the connected workspace only", syncCalls.Load())
	}

	broken := out.Workspaces[2]
	if broken.Journal != nil || broken.Error == "" {
		t.Errorf("one workspace failing must be reported without failing the rest: %+v", broken)
	}
}
