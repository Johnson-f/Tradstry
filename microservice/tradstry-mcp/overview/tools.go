package overview

import (
	"cmp"
	"context"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
)

const concurrency = 4

type tools struct {
	api api
}

func Register(server *mcp.Server, client *graphql.Client) {
	t := &tools{api: api{client: client}}
	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_overview",
		Title: "Overview",
		Description: "Get an overview of the user's whole Tradstry account in one call: every workspace (broker account, portfolio) with its ID, " +
			"broker connection and last sync, whether the automatic journal is on and up to date, and its journal trade counts " +
			"(open, closed, incomplete, closed and unreviewed). Call this first to orient, before list_workspaces, list_trades or the analytics tools.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.overview)
}

type lastSync struct {
	Status string `json:"status"`
	At     string `json:"at,omitempty" jsonschema:"when the last successful sync finished"`
	Error  string `json:"error,omitempty"`
}

type brokerageView struct {
	Broker         string    `json:"broker,omitempty"`
	Connected      bool      `json:"connected"`
	NeedsReconnect bool      `json:"needs_reconnect,omitempty" jsonschema:"the broker link stopped working; reconnect with connect_brokerage"`
	SetupComplete  bool      `json:"setup_complete,omitempty" jsonschema:"false while a connected broker still needs its accounts chosen with set_up_brokerage_accounts"`
	LastSync       *lastSync `json:"last_sync,omitempty" jsonschema:"absent when the workspace has never synced"`
}

type tradeCounts struct {
	Open             int `json:"open"`
	Closed           int `json:"closed"`
	Incomplete       int `json:"incomplete" jsonschema:"history missing, so results are unknown"`
	ClosedUnreviewed int `json:"closed_unreviewed"`
}

type journalView struct {
	Automatic bool        `json:"automatic" jsonschema:"whether the automatic journal is on; trades below are readable either way"`
	UpToDate  bool        `json:"up_to_date" jsonschema:"on and caught up with the latest broker sync, so the counts are complete"`
	Error     string      `json:"error,omitempty"`
	Trades    tradeCounts `json:"trades"`
}

type workspaceView struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Currency  string        `json:"currency"`
	Brokerage brokerageView `json:"brokerage"`
	Journal   *journalView  `json:"journal,omitempty" jsonschema:"absent when it could not be read; see error"`
	Error     string        `json:"error,omitempty" jsonschema:"why part of this workspace could not be read"`
}

type output struct {
	Workspaces []workspaceView `json:"workspaces"`
}

func (t *tools) overview(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, output, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, output{}, err
	}
	all, err := t.api.workspaces(ctx, caller.Token)
	if err != nil {
		return nil, output{}, graphql.ForUser(err)
	}

	out := output{Workspaces: make([]workspaceView, len(all))}
	slots := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	for i, ws := range all {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			out.Workspaces[i] = t.describe(ctx, caller.Token, ws)
		}()
	}
	wg.Wait()
	return nil, out, nil
}

func (t *tools) describe(ctx context.Context, token string, ws workspace) workspaceView {
	view := workspaceView{ID: ws.ID, Name: ws.Name, Currency: ws.Currency, Brokerage: brokerageView{
		Connected:      ws.SnaptradeConnectionID != nil,
		NeedsReconnect: ws.SnaptradeConnectionID != nil && ws.SnaptradeConnectionDisabled,
		SetupComplete:  ws.BrokerageSetupComplete,
	}}
	if ws.Broker != nil {
		view.Brokerage.Broker = *ws.Broker
	}

	var wg sync.WaitGroup
	var syncErr error
	if view.Brokerage.Connected {
		wg.Go(func() {
			var outcome *syncOutcome
			outcome, syncErr = t.api.lastSync(ctx, token, ws.ID)
			view.Brokerage.LastSync = syncView(outcome)
		})
	}
	j, journalErr := t.api.journal(ctx, token, ws.ID)
	wg.Wait()

	if journalErr == nil {
		view.Journal = journalOf(j)
	}
	if err := cmp.Or(journalErr, syncErr); err != nil {
		view.Error = graphql.ForUser(err).Error()
	}
	return view
}

func syncView(o *syncOutcome) *lastSync {
	if o == nil {
		return nil
	}
	v := &lastSync{Status: o.Status}
	if o.SucceededAt != nil {
		v.At = *o.SucceededAt
	}
	if o.Error != nil {
		v.Error = *o.Error
	}
	return v
}

func journalOf(j journal) *journalView {
	s := j.Status
	v := &journalView{
		Automatic: s.Enabled,
		UpToDate:  s.Enabled && s.ImportState == "idle" && s.ProjectionRevision >= s.SourceRevision,
	}
	if s.LastError != nil {
		v.Error = *s.LastError
	}
	for _, tr := range j.Trades {
		switch tr.LifecycleState {
		case "open":
			v.Trades.Open++
		case "closed":
			v.Trades.Closed++
			if tr.ReviewState == "unreviewed" {
				v.Trades.ClosedUnreviewed++
			}
		case "incomplete":
			v.Trades.Incomplete++
		}
	}
	return v
}
