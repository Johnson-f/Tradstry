package playbooks

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
)

type tools struct {
	api       api
	confirmer *confirm.Confirmer
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{api: api{client: client}, confirmer: confirmer}
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)}
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_playbooks",
		Title:       "List playbooks",
		Description: "The playbooks (trading setups) available in a workspace, with their edge and how trades using each have done.",
		Annotations: readOnly,
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_playbook",
		Title:       "Read playbook",
		Description: "A playbook's full rules: entry, exit, position sizing and any others, with its results and the workspaces it is used in.",
		Annotations: readOnly,
	}, t.get)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "create_playbook",
		Title: "Create playbook",
		Description: "Add a playbook, available in every workspace unless set_playbook_workspaces says otherwise. " +
			"Take the edge and every rule from the user; never invent them.",
		Annotations: write,
	}, t.create)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_playbook",
		Title:       "Update playbook",
		Description: "Change a playbook's name, edge or rules. Fields left out stay as they are.",
		Annotations: write,
	}, t.update)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_playbook_workspaces",
		Title:       "Choose playbook workspaces",
		Description: "Make a playbook available in every workspace, or only in the ones listed.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.setWorkspaces)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_playbook",
		Title: "Delete playbook",
		Description: "Delete a playbook. Trades that used it keep their results but lose the link. " +
			"Principles that belong to it must be moved or deleted first. The user must confirm: either the app asks them, " +
			"or this returns needs_confirmation with a token to pass back only after they agree.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.delete)
}

type results struct {
	Trades      int     `json:"trades"`
	Net         float64 `json:"net"`
	Currency    string  `json:"currency,omitempty"`
	WinRate     float64 `json:"win_rate_percent"`
	AverageWin  float64 `json:"average_win"`
	AverageLoss float64 `json:"average_loss"`
}

type summary struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Edge    string   `json:"edge"`
	Results *results `json:"results,omitempty" jsonschema:"trades that used this playbook; absent before its first trade"`
}

type view struct {
	summary
	EntryRules  string   `json:"entry_rules"`
	ExitRules   string   `json:"exit_rules"`
	SizingRules string   `json:"position_sizing_rules"`
	OtherRules  string   `json:"other_rules,omitempty"`
	AvailableIn []string `json:"available_in" jsonschema:"workspace names, or All workspaces"`
}

func currencyOf(workspaces []workspace, id string) string {
	for _, w := range workspaces {
		if w.ID == id {
			return w.Currency
		}
	}
	return ""
}

func toSummary(p playbook, workspaces []workspace) summary {
	s := summary{ID: p.ID, Name: p.Name, Edge: p.EdgeName}
	if p.TradeCount > 0 {
		s.Results = &results{
			Trades: p.TradeCount, Net: p.CumulativeProfit, Currency: currencyOf(workspaces, p.WorkspaceID),
			WinRate: p.WinRate, AverageWin: p.AverageGain, AverageLoss: p.AverageLoss,
		}
	}
	return s
}

func toView(p playbook, workspaces []workspace) view {
	v := view{
		summary: toSummary(p, workspaces), EntryRules: p.EntryRules, ExitRules: p.ExitRules, SizingRules: p.PositionSizingRules,
		AvailableIn: []string{"All workspaces"},
	}
	if p.AdditionalRules != nil {
		v.OtherRules = *p.AdditionalRules
	}
	if p.Availability == "selected" {
		v.AvailableIn = []string{}
		for _, w := range workspaces {
			if slices.Contains(p.WorkspaceIDs, w.ID) {
				v.AvailableIn = append(v.AvailableIn, w.Name)
			}
		}
	}
	return v
}

type listInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type listOutput struct {
	Playbooks []summary `json:"playbooks"`
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	found, workspaces, err := t.api.list(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	out := listOutput{Playbooks: make([]summary, 0, len(found))}
	for _, p := range found {
		out.Playbooks = append(out.Playbooks, toSummary(p, workspaces))
	}
	return nil, out, nil
}

type playbookInput struct {
	PlaybookID string `json:"playbook_id" jsonschema:"ID from list_playbooks"`
}

var errNotFound = errors.New("playbook not found; call list_playbooks for valid IDs")

func (t *tools) get(ctx context.Context, req *mcp.CallToolRequest, in playbookInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	p, workspaces, err := t.api.get(ctx, caller.Token, in.PlaybookID)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	if p == nil {
		return nil, view{}, errNotFound
	}
	return nil, toView(*p, workspaces), nil
}

type createInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Name        string `json:"name" jsonschema:"such as Opening Range Breakout"`
	Edge        string `json:"edge" jsonschema:"why the setup works, in the user's words"`
	EntryRules  string `json:"entry_rules" jsonschema:"when to enter, in the user's words"`
	ExitRules   string `json:"exit_rules" jsonschema:"when to take profit or cut the loss"`
	SizingRules string `json:"position_sizing_rules" jsonschema:"how much to risk or buy"`
	OtherRules  string `json:"other_rules,omitempty" jsonschema:"anything else the user follows with this setup"`
}

func (t *tools) create(ctx context.Context, req *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	input := map[string]any{"workspaceId": in.WorkspaceID}
	var missing []string
	for _, f := range []struct{ key, label, value string }{
		{"name", "name", in.Name}, {"edgeName", "edge", in.Edge}, {"entryRules", "entry rules", in.EntryRules},
		{"exitRules", "exit rules", in.ExitRules}, {"positionSizingRules", "position sizing rules", in.SizingRules},
	} {
		value := strings.TrimSpace(f.value)
		if value == "" {
			missing = append(missing, f.label)
		}
		input[f.key] = value
	}
	if len(missing) > 0 {
		return nil, view{}, fmt.Errorf("a playbook needs its %s; ask the user", strings.Join(missing, ", "))
	}
	if s := strings.TrimSpace(in.OtherRules); s != "" {
		input["additionalRules"] = s
	}
	created, err := t.api.create(ctx, caller.Token, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	_, workspaces, err := t.api.list(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(created, workspaces), nil
}

type updateInput struct {
	PlaybookID      string `json:"playbook_id" jsonschema:"ID from list_playbooks"`
	Name            string `json:"name,omitempty" jsonschema:"new name"`
	Edge            string `json:"edge,omitempty" jsonschema:"new description of why the setup works"`
	EntryRules      string `json:"entry_rules,omitempty" jsonschema:"replaces the entry rules"`
	ExitRules       string `json:"exit_rules,omitempty" jsonschema:"replaces the exit rules"`
	SizingRules     string `json:"position_sizing_rules,omitempty" jsonschema:"replaces the position sizing rules"`
	OtherRules      string `json:"other_rules,omitempty" jsonschema:"replaces the other rules"`
	ClearOtherRules bool   `json:"clear_other_rules,omitempty" jsonschema:"remove the other rules entirely"`
}

func (t *tools) update(ctx context.Context, req *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	input := map[string]any{}
	for key, value := range map[string]string{
		"name": in.Name, "edgeName": in.Edge, "entryRules": in.EntryRules, "exitRules": in.ExitRules,
		"positionSizingRules": in.SizingRules, "additionalRules": in.OtherRules,
	} {
		if s := strings.TrimSpace(value); s != "" {
			input[key] = s
		}
	}
	if in.ClearOtherRules {
		input["clearAdditionalRules"] = true
	}
	if len(input) == 0 {
		return nil, view{}, errors.New("say what to change: name, edge, entry_rules, exit_rules, position_sizing_rules or other_rules")
	}
	updated, err := t.api.update(ctx, caller.Token, in.PlaybookID, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return t.withWorkspaces(ctx, caller.Token, updated)
}

func (t *tools) withWorkspaces(ctx context.Context, token string, p playbook) (*mcp.CallToolResult, view, error) {
	_, workspaces, err := t.api.list(ctx, token, p.WorkspaceID)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(p, workspaces), nil
}

type workspacesInput struct {
	PlaybookID   string   `json:"playbook_id" jsonschema:"ID from list_playbooks"`
	All          bool     `json:"all,omitempty" jsonschema:"available in every workspace"`
	WorkspaceIDs []string `json:"workspace_ids,omitempty" jsonschema:"only these workspaces, from list_workspaces"`
}

func (t *tools) setWorkspaces(ctx context.Context, req *mcp.CallToolRequest, in workspacesInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	if in.All == (len(in.WorkspaceIDs) > 0) {
		return nil, view{}, errors.New("pass either all or workspace_ids")
	}
	availability := "selected"
	if in.All {
		availability = "all"
	}
	updated, err := t.api.setApplicability(ctx, caller.Token, in.PlaybookID, availability, in.WorkspaceIDs)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return t.withWorkspaces(ctx, caller.Token, updated)
}

type deleteInput struct {
	PlaybookID        string `json:"playbook_id" jsonschema:"ID from list_playbooks"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

type deleteOutput struct {
	Status            string `json:"status" jsonschema:"deleted, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func (t *tools) delete(ctx context.Context, req *mcp.CallToolRequest, in deleteInput) (*mcp.CallToolResult, deleteOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	p, workspaces, err := t.api.get(ctx, caller.Token, in.PlaybookID)
	if err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	if p == nil {
		return nil, deleteOutput{}, errNotFound
	}
	// Checked before asking, so the user is never asked to approve a delete the
	// backend will refuse.
	dependents, err := t.api.principlesUsing(ctx, caller.Token, p.ID, workspaces)
	if err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	if len(dependents) > 0 {
		return nil, deleteOutput{}, fmt.Errorf("“%s” cannot be deleted while these principles belong to it: %s. "+
			"Move them to another playbook or clear their playbook with update_principle first", p.Name, strings.Join(dependents, ", "))
	}

	question := fmt.Sprintf("Delete the playbook “%s”? This cannot be undone.", p.Name)
	if p.TradeCount > 0 {
		question = fmt.Sprintf("Delete the playbook “%s”? Its %d trades keep their results but will no longer be linked to it. "+
			"This cannot be undone.", p.Name, p.TradeCount)
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_playbook", Target: p.ID, Question: question,
	}, in.ConfirmationToken)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	if !outcome.Approved {
		status := "cancelled"
		if outcome.Token != "" {
			status = "needs_confirmation"
		}
		return nil, deleteOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
	}
	if _, err := t.api.delete(ctx, caller.Token, p.ID); err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	return nil, deleteOutput{Status: "deleted", Message: fmt.Sprintf("Deleted “%s”.", p.Name)}, nil
}
