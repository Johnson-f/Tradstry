package brokerage

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
)

// A sync fetches the account's whole history from the broker, which can take minutes.
const syncTimeout = 5 * time.Minute

type (
	history string
	method  string
)

var enums = map[reflect.Type]*jsonschema.Schema{
	reflect.TypeFor[history](): {Type: "string", Enum: []any{"one_year", "two_years", "all", "custom"}},
	reflect.TypeFor[method]():  {Type: "string", Enum: []any{"broker_login", "snaptrade_account"}},
}

type workspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type connectInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Method      method `json:"method,omitempty" jsonschema:"broker_login (the default) signs in to the broker through SnapTrade; snaptrade_account uses an existing SnapTrade Personal account, only when the user says they have one"`
}

type connectOutput struct {
	URL     string `json:"url" jsonschema:"SnapTrade link the user must open in a browser"`
	Message string `json:"message"`
}

type accountView struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Institution         string `json:"institution,omitempty"`
	LinkedWorkspaceName string `json:"linked_workspace_name,omitempty" jsonschema:"set when another workspace already imports this account"`
	Current             bool   `json:"current" jsonschema:"true when this workspace already imports this account"`
}

type finishOutput struct {
	Status   string        `json:"status" jsonschema:"waiting, choose_accounts, connected, no_accounts, cancelled or failed"`
	Message  string        `json:"message"`
	Accounts []accountView `json:"accounts,omitempty"`
}

type accountChoice struct {
	AccountID       string  `json:"account_id" jsonschema:"ID from the accounts list"`
	History         history `json:"history" jsonschema:"how far back to import trades"`
	CustomStartDate string  `json:"custom_start_date,omitempty" jsonschema:"YYYY-MM-DD; required when history is custom"`
}

type setUpInput struct {
	WorkspaceID      string          `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	PrimaryAccountID string          `json:"primary_account_id" jsonschema:"the account this workspace imports; any other chosen accounts get workspaces of their own"`
	Accounts         []accountChoice `json:"accounts" jsonschema:"every account to import, including the primary one"`
}

type workspaceSync struct {
	WorkspaceID string      `json:"workspace_id"`
	Name        string      `json:"name"`
	Sync        *syncResult `json:"sync,omitempty"`
	SyncError   string      `json:"sync_error,omitempty"`
}

type setUpOutput struct {
	Workspaces []workspaceSync `json:"workspaces"`
}

type syncOutput struct {
	Status             string `json:"status" jsonschema:"queued means a sync for this workspace is already running"`
	TransactionsSynced int    `json:"transactions_synced"`
	HoldingsSynced     int    `json:"holdings_synced"`
	BalancesSynced     int    `json:"balances_synced"`
}

type statusOutput struct {
	Connected      bool         `json:"connected"`
	NeedsReconnect bool         `json:"needs_reconnect"`
	SetupComplete  bool         `json:"setup_complete" jsonschema:"false until the accounts to import are chosen"`
	Broker         string       `json:"broker,omitempty"`
	LastSync       *syncOutcome `json:"last_sync,omitempty"`
}

type disconnectInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed to disconnect"`
}

type disconnectOutput struct {
	Status            string `json:"status" jsonschema:"disconnected, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

type tools struct {
	api       api
	visits    *visits
	confirmer *confirm.Confirmer
	publicURL string
}

// Register adds the brokerage tools to server and returns the handler for the
// pages SnapTrade sends the browser back to, which the caller mounts at RoutePrefix.
func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer, publicURL string) http.Handler {
	t := &tools{api: api{client: client}, visits: newVisits(), confirmer: confirmer, publicURL: publicURL}

	mcp.AddTool(server, &mcp.Tool{
		Name:  "connect_brokerage",
		Title: "Connect brokerage",
		Description: "Start connecting a broker to a workspace, or reconnect one whose link stopped working. " +
			"Returns a SnapTrade link the user opens in their browser to sign in to their broker. " +
			"When they say they are done, call finish_brokerage_connection.",
		InputSchema: inputSchema[connectInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(true)},
	}, t.connect)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "finish_brokerage_connection",
		Title: "Finish brokerage connection",
		Description: "Complete a connection after the user returns from the SnapTrade link. " +
			"Usually returns the broker's accounts so the user can choose what to import with set_up_brokerage_accounts.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(true)},
	}, t.finish)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_brokerage_accounts",
		Title:       "List brokerage accounts",
		Description: "List the accounts at the broker connected to a workspace, and which workspace imports each.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(true)},
	}, t.listAccounts)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "set_up_brokerage_accounts",
		Title: "Set up brokerage accounts",
		Description: "Choose which broker accounts to import and how much trade history, then run the first sync. " +
			"Ask the user for both; do not choose for them.",
		InputSchema: inputSchema[setUpInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(true)},
	}, t.setUp)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "sync_brokerage",
		Title:       "Sync brokerage",
		Description: "Import the latest trades, holdings and balances from the workspace's broker. Can take a few minutes.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(true)},
	}, t.sync)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_brokerage_status",
		Title:       "Brokerage status",
		Description: "Whether a workspace's broker is connected, needs reconnecting or needs accounts chosen, and how the last sync went.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.status)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "disconnect_brokerage",
		Title: "Disconnect brokerage",
		Description: "Disconnect a workspace's broker so it stops syncing. Trades already imported stay. The user must confirm first: " +
			"either the app asks them directly, or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(true)},
	}, t.disconnect)

	return t.visits.routes()
}

// RoutePrefix covers the pages SnapTrade returns the browser to.
const RoutePrefix = "/brokerage/"

func inputSchema[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](&jsonschema.ForOptions{TypeSchemas: enums})
	if err != nil {
		panic(err)
	}
	return schema
}

func (t *tools) findWorkspace(ctx context.Context, token, id string) (*workspace, error) {
	found, err := t.api.workspace(ctx, token, id)
	if err != nil {
		return nil, graphql.ForUser(err)
	}
	if found == nil {
		return nil, errors.New("workspace not found; call list_workspaces for valid IDs")
	}
	return found, nil
}

func (t *tools) connect(ctx context.Context, req *mcp.CallToolRequest, in connectInput) (*mcp.CallToolResult, connectOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, connectOutput{}, err
	}
	ws, err := t.findWorkspace(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, connectOutput{}, err
	}
	reconnect := ws.SnaptradeConnectionID != nil && ws.SnaptradeConnectionDisabled
	if ws.SnaptradeConnectionID != nil && !reconnect {
		return nil, connectOutput{}, fmt.Errorf("workspace %q is already connected to a broker; disconnect it first to connect a different one", ws.Name)
	}

	// A broken link is repaired the same way it was made.
	oauth := in.Method == "snaptrade_account"
	if reconnect {
		oauth = ws.SnaptradeAuthMode == "oauth"
	}
	if oauth {
		return t.connectOAuth(ctx, caller, ws)
	}

	state := t.visits.start(caller.Subject, ws.ID, "")
	redirect := t.publicURL + portalLandingPath + "?" + url.Values{"state": {state}}.Encode()
	portal, err := t.api.initiate(ctx, caller.Token, ws.ID, redirect, reconnect)
	if err != nil {
		t.visits.forget(state)
		return nil, connectOutput{}, graphql.ForUser(err)
	}
	return nil, connectOutput{
		URL: portal,
		Message: "Give the user this link to open in their browser. It expires in a few minutes. " +
			"After they sign in to their broker they land on a Tradstry page telling them to come back; then call finish_brokerage_connection.",
	}, nil
}

func (t *tools) connectOAuth(ctx context.Context, caller oauth.Caller, ws *workspace) (*mcp.CallToolResult, connectOutput, error) {
	started, err := t.api.initiateOAuth(ctx, caller.Token, ws.ID)
	var apiErr *graphql.Error
	if errors.As(err, &apiErr) && strings.Contains(apiErr.Error(), "SnapTrade OAuth is not") {
		return nil, connectOutput{}, errors.New("signing in with a SnapTrade account is not available here; use method broker_login")
	}
	if err != nil {
		return nil, connectOutput{}, graphql.ForUser(err)
	}
	t.visits.start(caller.Subject, ws.ID, started.AttemptID)
	return nil, connectOutput{
		URL: started.AuthorizationURL,
		Message: "Give the user this link to open in their browser. It expires in 10 minutes. " +
			"They sign in to SnapTrade and approve Tradstry, then land on a Tradstry page telling them to come back; then call finish_brokerage_connection.",
	}, nil
}

func (t *tools) finish(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, finishOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, finishOutput{}, err
	}
	v, ok := t.visits.latest(caller.Subject, in.WorkspaceID)
	if !ok {
		return nil, finishOutput{}, errors.New("no connection is in progress for this workspace; call connect_brokerage first (links last 30 minutes)")
	}
	if v.attemptID != "" {
		return t.finishOAuth(ctx, caller, v)
	}
	switch {
	case !v.landed:
		return nil, finishOutput{Status: "waiting", Message: "The user has not come back from the SnapTrade link yet. Ask them to finish there, then try again."}, nil
	case v.status == "ABANDONED":
		t.visits.forget(v.state)
		return nil, finishOutput{Status: "cancelled", Message: "The user left SnapTrade without connecting. Nothing changed."}, nil
	case v.status != "SUCCESS" || v.connectionID == "":
		t.visits.forget(v.state)
		message := "SnapTrade did not connect the broker."
		if v.errorCode != "" {
			message += " It reported: " + v.errorCode + "."
		}
		return nil, finishOutput{Status: "failed", Message: message + " The user can try again with connect_brokerage."}, nil
	}

	if err := t.api.complete(ctx, caller.Token, in.WorkspaceID, v.connectionID); err != nil {
		return nil, finishOutput{}, graphql.ForUser(err)
	}
	t.visits.forget(v.state)

	accounts, err := t.api.accounts(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, finishOutput{}, graphql.ForUser(err)
	}
	return nil, accountsFound(accounts), nil
}

// finishOAuth reads the outcome the backend recorded for a SnapTrade OAuth
// attempt. A first connection keeps its visit until set_up_brokerage_accounts,
// which finalizes through the same attempt.
func (t *tools) finishOAuth(ctx context.Context, caller oauth.Caller, v visit) (*mcp.CallToolResult, finishOutput, error) {
	status, err := t.api.oauthStatus(ctx, caller.Token, v.attemptID)
	if err != nil {
		return nil, finishOutput{}, graphql.ForUser(err)
	}
	switch {
	case status == nil:
		t.visits.forget(v.state)
		return nil, finishOutput{Status: "failed", Message: "SnapTrade no longer has this sign-in. The user can try again with connect_brokerage."}, nil
	case status.Status == "pending" || status.Status == "processing":
		return nil, finishOutput{Status: "waiting", Message: "The user has not finished approving Tradstry in SnapTrade yet. Ask them to finish there, then try again."}, nil
	case status.Status == "denied":
		t.visits.forget(v.state)
		return nil, finishOutput{Status: "cancelled", Message: "The user did not approve Tradstry in SnapTrade. Nothing changed."}, nil
	case status.Status != "authorized":
		t.visits.forget(v.state)
		message := "SnapTrade did not connect the account (" + status.Status + ")."
		if status.ErrorCode != nil {
			message = "SnapTrade did not connect the account: " + *status.ErrorCode + "."
		}
		return nil, finishOutput{Status: "failed", Message: message + " The user can try again with connect_brokerage."}, nil
	}

	if status.Intent == "reauthorize" {
		if err := t.api.reauthorize(ctx, caller.Token, v.attemptID); err != nil {
			return nil, finishOutput{}, graphql.ForUser(err)
		}
		t.visits.forget(v.state)
		return nil, finishOutput{Status: "connected", Message: "Reconnected. Call sync_brokerage to import the latest trades."}, nil
	}
	accounts, err := t.api.oauthAccounts(ctx, caller.Token, v.attemptID)
	if err != nil {
		return nil, finishOutput{}, graphql.ForUser(err)
	}
	return nil, accountsFound(accounts), nil
}

func accountsFound(accounts []account) finishOutput {
	views := accountViews(accounts)
	switch {
	case slices.ContainsFunc(accounts, func(a account) bool { return a.Current }):
		return finishOutput{Status: "connected", Message: "Connected. Call sync_brokerage to import the latest trades.", Accounts: views}
	case len(accounts) == 0:
		return finishOutput{Status: "no_accounts", Message: "Connected, but the broker has not reported any accounts yet. Wait a minute, then call list_brokerage_accounts."}
	}
	return finishOutput{
		Status:   "choose_accounts",
		Message:  "Connected. Ask the user which accounts to import and how far back (one year, two years, everything, or from a date), then call set_up_brokerage_accounts.",
		Accounts: views,
	}
}

// pendingOAuth returns an OAuth visit that set_up_brokerage_accounts has not finalized.
func (t *tools) pendingOAuth(subject, workspaceID string) (visit, bool) {
	v, ok := t.visits.latest(subject, workspaceID)
	return v, ok && v.attemptID != ""
}

func accountViews(accounts []account) []accountView {
	views := make([]accountView, 0, len(accounts))
	for _, a := range accounts {
		view := accountView{ID: a.ID, Name: a.Name, Current: a.Current}
		if a.InstitutionName != nil {
			view.Institution = *a.InstitutionName
		}
		if a.LinkedWorkspaceName != nil {
			view.LinkedWorkspaceName = *a.LinkedWorkspaceName
		}
		views = append(views, view)
	}
	return views
}

func (t *tools) listAccounts(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, finishOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, finishOutput{}, err
	}
	var accounts []account
	if v, ok := t.pendingOAuth(caller.Subject, in.WorkspaceID); ok {
		accounts, err = t.api.oauthAccounts(ctx, caller.Token, v.attemptID)
	} else {
		accounts, err = t.api.accounts(ctx, caller.Token, in.WorkspaceID)
	}
	if err != nil {
		return nil, finishOutput{}, graphql.ForUser(err)
	}
	return nil, finishOutput{Status: "listed", Accounts: accountViews(accounts)}, nil
}

func (t *tools) setUp(ctx context.Context, req *mcp.CallToolRequest, in setUpInput) (*mcp.CallToolResult, setUpOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, setUpOutput{}, err
	}
	if !slices.ContainsFunc(in.Accounts, func(c accountChoice) bool { return c.AccountID == in.PrimaryAccountID }) {
		return nil, setUpOutput{}, errors.New("primary_account_id must be one of the chosen accounts")
	}
	choices := make([]map[string]any, 0, len(in.Accounts))
	for _, choice := range in.Accounts {
		policy := map[string]any{"mode": string(choice.History)}
		if choice.History == "custom" {
			if _, err := time.Parse(time.DateOnly, choice.CustomStartDate); err != nil {
				return nil, setUpOutput{}, fmt.Errorf("account %s: custom history needs custom_start_date as YYYY-MM-DD", choice.AccountID)
			}
			policy["customStartDate"] = choice.CustomStartDate
		}
		choices = append(choices, map[string]any{"snaptradeAccountId": choice.AccountID, "policy": policy})
	}

	input := map[string]any{
		"workspaceId":               in.WorkspaceID,
		"primarySnaptradeAccountId": in.PrimaryAccountID,
		"accounts":                  choices,
	}
	var ready []configured
	oauth, viaOAuth := t.pendingOAuth(caller.Subject, in.WorkspaceID)
	if viaOAuth {
		ready, err = t.api.finalizeOAuth(ctx, caller.Token, oauth.attemptID, input)
	} else {
		ready, err = t.api.finalize(ctx, caller.Token, input)
	}
	if err != nil {
		return nil, setUpOutput{}, graphql.ForUser(err)
	}
	if viaOAuth {
		t.visits.forget(oauth.state)
	}

	out := setUpOutput{Workspaces: make([]workspaceSync, 0, len(ready))}
	for _, ws := range ready {
		entry := workspaceSync{WorkspaceID: ws.ID, Name: ws.Name}
		syncCtx, cancel := context.WithTimeout(ctx, syncTimeout)
		result, err := t.api.sync(syncCtx, caller.Token, ws.ID)
		cancel()
		if err != nil {
			entry.SyncError = graphql.ForUser(err).Error()
		} else {
			entry.Sync = &result
		}
		out.Workspaces = append(out.Workspaces, entry)
	}
	return nil, out, nil
}

func (t *tools) sync(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, syncOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, syncOutput{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, syncTimeout)
	defer cancel()
	result, err := t.api.sync(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, syncOutput{}, graphql.ForUser(err)
	}
	return nil, syncOutput(result), nil
}

func (t *tools) status(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, statusOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, statusOutput{}, err
	}
	ws, err := t.findWorkspace(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, statusOutput{}, err
	}
	out := statusOutput{
		Connected:      ws.SnaptradeConnectionID != nil,
		NeedsReconnect: ws.SnaptradeConnectionID != nil && ws.SnaptradeConnectionDisabled,
		SetupComplete:  ws.BrokerageSetupComplete,
	}
	if ws.Broker != nil {
		out.Broker = *ws.Broker
	}
	if out.LastSync, err = t.api.outcome(ctx, caller.Token, ws.ID); err != nil {
		return nil, statusOutput{}, graphql.ForUser(err)
	}
	return nil, out, nil
}

func (t *tools) disconnect(ctx context.Context, req *mcp.CallToolRequest, in disconnectInput) (*mcp.CallToolResult, disconnectOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, disconnectOutput{}, err
	}
	ws, err := t.findWorkspace(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, disconnectOutput{}, err
	}
	if ws.SnaptradeConnectionID == nil {
		return nil, disconnectOutput{}, fmt.Errorf("workspace %q has no broker connected", ws.Name)
	}

	broker := "the broker"
	if ws.Broker != nil && *ws.Broker != "" {
		broker = *ws.Broker
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:   "disconnect_brokerage",
		Target: ws.ID,
		Question: fmt.Sprintf("Disconnect %s from the workspace %q? Tradstry stops syncing it. "+
			"Trades already imported stay, and you can connect again later.", broker, ws.Name),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, disconnectOutput{}, err
	}
	if !outcome.Approved {
		status := "cancelled"
		if outcome.Token != "" {
			status = "needs_confirmation"
		}
		return outcome.Ask, disconnectOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
	}

	if err := t.api.disconnect(ctx, caller.Token, ws.ID); err != nil {
		return nil, disconnectOutput{}, graphql.ForUser(err)
	}
	return nil, disconnectOutput{Status: "disconnected", Message: fmt.Sprintf("Disconnected %s from %q.", broker, ws.Name)}, nil
}
