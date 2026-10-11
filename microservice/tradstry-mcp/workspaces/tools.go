package workspaces

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
)

type (
	currency    string
	assetClass  string
	riskProfile string
)

// The backend validates only asset class; these match what the web app offers.
var enums = map[reflect.Type]*jsonschema.Schema{
	reflect.TypeFor[currency]():    {Type: "string", Enum: []any{"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"}},
	reflect.TypeFor[assetClass]():  {Type: "string", Enum: []any{"stocks", "options", "futures", "forex", "crypto", "mixed", "other"}},
	reflect.TypeFor[riskProfile](): {Type: "string", Enum: []any{"conservative", "moderate", "aggressive"}},
}

func inputSchema[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](&jsonschema.ForOptions{TypeSchemas: enums})
	if err != nil {
		panic(err)
	}
	return schema
}

type view struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Currency    string   `json:"currency"`
	AssetClass  string   `json:"asset_class"`
	RiskProfile string   `json:"risk_profile"`
	Broker      string   `json:"broker,omitempty"`
	TotalValue  *float64 `json:"total_value,omitempty" jsonschema:"the broker's reported account value; absent when the broker reports none, which does not mean the account is empty"`

	BrokerageConnected          bool `json:"brokerage_connected"`
	BrokerageConnectionDisabled bool `json:"brokerage_connection_disabled" jsonschema:"true when the broker link needs to be reconnected"`
	BrokerageSetupComplete      bool `json:"brokerage_setup_complete" jsonschema:"false while a connected broker still needs its accounts chosen with set_up_brokerage_accounts"`
}

func toView(w workspace) view {
	v := view{
		ID:                          w.ID,
		Name:                        w.Name,
		Currency:                    w.Currency,
		AssetClass:                  w.AssetClass,
		RiskProfile:                 w.RiskProfile,
		BrokerageConnected:          w.SnaptradeConnectionID != nil,
		BrokerageConnectionDisabled: w.SnaptradeConnectionDisabled,
		BrokerageSetupComplete:      w.BrokerageSetupComplete,
	}
	if w.Broker != nil {
		v.Broker = *w.Broker
	}
	// The backend stores 0 when the broker has not reported a value.
	if w.TotalValue != nil && *w.TotalValue > 0 {
		v.TotalValue = w.TotalValue
	}
	return v
}

type listOutput struct {
	Workspaces []view `json:"workspaces"`
}

type createInput struct {
	Name        string      `json:"name" jsonschema:"display name, such as Options Account"`
	Currency    currency    `json:"currency,omitempty" jsonschema:"account currency; defaults to USD"`
	AssetClass  assetClass  `json:"asset_class,omitempty" jsonschema:"what the account mainly trades; defaults to mixed"`
	RiskProfile riskProfile `json:"risk_profile,omitempty" jsonschema:"the trader's risk appetite for this account; defaults to moderate"`
}

type updateInput struct {
	WorkspaceID string      `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Name        string      `json:"name,omitempty" jsonschema:"new display name"`
	Currency    currency    `json:"currency,omitempty" jsonschema:"new account currency"`
	AssetClass  assetClass  `json:"asset_class,omitempty" jsonschema:"new main asset class"`
	RiskProfile riskProfile `json:"risk_profile,omitempty" jsonschema:"new risk profile"`
}

type deleteInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed to the deletion"`
}

type deleteOutput struct {
	Status            string `json:"status" jsonschema:"deleted, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

type tools struct {
	api       api
	confirmer *confirm.Confirmer
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{api: api{client: client}, confirmer: confirmer}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_workspaces",
		Title:       "List workspaces",
		Description: "List the user's workspaces. Each workspace is one trading account with its own currency and optional brokerage connection.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_workspace",
		Title:       "Create workspace",
		Description: "Create a workspace for a new trading account. Only the name is required.",
		InputSchema: inputSchema[createInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)},
	}, t.create)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_workspace",
		Title:       "Update workspace",
		Description: "Rename a workspace or change its currency, asset class or risk profile. Fields left out keep their current values.",
		InputSchema: inputSchema[updateInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.update)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_workspace",
		Title: "Delete workspace",
		Description: "Permanently delete a workspace and everything in it. The user must confirm first: " +
			"either the app asks them directly, or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.delete)
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, listOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	found, err := t.api.list(ctx, caller.Token)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	out := listOutput{Workspaces: make([]view, 0, len(found))}
	for _, w := range found {
		out.Workspaces = append(out.Workspaces, toView(w))
	}
	return nil, out, nil
}

func (t *tools) create(ctx context.Context, req *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, view{}, errors.New("give the workspace a name")
	}
	input := settings(in.Currency, in.AssetClass, in.RiskProfile)
	input["name"] = name

	created, err := t.api.create(ctx, caller.Token, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(created), nil
}

func (t *tools) update(ctx context.Context, req *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	input := settings(in.Currency, in.AssetClass, in.RiskProfile)
	if name := strings.TrimSpace(in.Name); name != "" {
		input["name"] = name
	}
	if len(input) == 0 {
		return nil, view{}, errors.New("say what to change: name, currency, asset_class or risk_profile")
	}

	updated, err := t.api.update(ctx, caller.Token, in.WorkspaceID, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(updated), nil
}

// settings builds the GraphQL input fields that were given.
func settings(c currency, a assetClass, r riskProfile) map[string]any {
	input := map[string]any{}
	if c != "" {
		input["currency"] = string(c)
	}
	if a != "" {
		input["assetClass"] = string(a)
	}
	if r != "" {
		input["riskProfile"] = string(r)
	}
	return input
}

func (t *tools) delete(ctx context.Context, req *mcp.CallToolRequest, in deleteInput) (*mcp.CallToolResult, deleteOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	all, err := t.api.list(ctx, caller.Token)
	if err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	var target *workspace
	for i := range all {
		if all[i].ID == in.WorkspaceID {
			target = &all[i]
		}
	}
	if target == nil {
		return nil, deleteOutput{}, errors.New("workspace not found; call list_workspaces for valid IDs")
	}
	// Checked here as well as in the backend so the user is never asked to
	// confirm a deletion that cannot happen.
	if len(all) == 1 {
		return nil, deleteOutput{}, errors.New("this is the user's only workspace; Tradstry needs at least one, so it cannot be deleted")
	}

	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:     "delete_workspace",
		Target:   target.ID,
		Question: deleteQuestion(*target),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	if !outcome.Approved {
		status := "cancelled"
		if outcome.Token != "" {
			status = "needs_confirmation"
		}
		return outcome.Ask, deleteOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
	}

	deleted, err := t.api.delete(ctx, caller.Token, target.ID)
	if err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	if !deleted {
		return nil, deleteOutput{}, errors.New("workspace not found; it may already have been deleted")
	}
	return nil, deleteOutput{Status: "deleted", Message: fmt.Sprintf("Deleted the workspace %q.", target.Name)}, nil
}

func deleteQuestion(w workspace) string {
	question := fmt.Sprintf("Permanently delete the workspace %q? Everything in it is deleted too: "+
		"imported broker trades, journal entries, notebook notes, playbooks, principles, tags, "+
		"AI conversations and position calculator history.", w.Name)
	if w.SnaptradeConnectionID != nil {
		question += " Its brokerage connection is removed as well."
	}
	return question + " This cannot be undone."
}
