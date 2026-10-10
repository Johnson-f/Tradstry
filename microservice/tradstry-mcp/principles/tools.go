package principles

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
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_principles",
		Title: "List trading principles",
		Description: "The user's trading rules in priority order, with how often each was broken and how those trades did, all time. " +
			"For one period, use get_mistake_costs.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)},
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "create_principle",
		Title: "Create principle",
		Description: "Add a trading rule. Take the rule and why it matters from the user; never invent them. " +
			"It goes to the bottom of the list; use move_principle to change that.",
		Annotations: write,
	}, t.create)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_principle",
		Title:       "Update principle",
		Description: "Change a principle's wording, playbook or supporting note, or switch it off or on. Fields left out stay as they are.",
		Annotations: write,
	}, t.update)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "move_principle",
		Title:       "Move principle",
		Description: "Change a principle's place in the priority order; position 1 is the top.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.move)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_principle",
		Title: "Delete principle",
		Description: "Delete a principle for good, with its record of broken trades. The user must confirm first: either the app asks them, " +
			"or this returns needs_confirmation with a token to pass back only after they agree. To keep its history, switch it off with update_principle instead.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.delete)
}

type view struct {
	ID           string `json:"id"`
	Position     int    `json:"position,omitempty" jsonschema:"1 is the highest priority"`
	Title        string `json:"title"`
	Rule         string `json:"rule"`
	Why          string `json:"why"`
	Intervention string `json:"intervention,omitempty" jsonschema:"what the user does when tempted to break it"`
	Playbook     string `json:"playbook,omitempty"`
	EvidenceNote *struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"evidence_note,omitempty"`
	Active      bool         `json:"active"`
	TimesBroken int          `json:"times_broken"`
	WhenBroken  *brokenStats `json:"when_broken,omitempty" jsonschema:"results of the trades where it was broken, all time; what those trades netted, not what the mistake alone cost"`
}

type brokenStats struct {
	Net      float64 `json:"net"`
	Currency string  `json:"currency,omitempty"`
	WinRate  float64 `json:"win_rate_percent"`
}

func toView(p principle, position int, playbooks []playbook, currency string) view {
	v := view{
		ID: p.ID, Position: position, Title: p.Title, Rule: p.TheRule, Why: p.Why,
		Active: p.IsActive, TimesBroken: p.ViolationCount,
	}
	if p.Intervention != nil {
		v.Intervention = *p.Intervention
	}
	if p.PlaybookID != nil {
		v.Playbook = *p.PlaybookID
		for _, pb := range playbooks {
			if pb.ID == *p.PlaybookID {
				v.Playbook = pb.Name
			}
		}
	}
	if p.EvidenceNoteID != nil {
		v.EvidenceNote = &struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		}{ID: *p.EvidenceNoteID}
		if p.EvidenceNoteTitle != nil {
			v.EvidenceNote.Title = *p.EvidenceNoteTitle
		}
	}
	if p.ViolationCount > 0 {
		v.WhenBroken = &brokenStats{Net: p.ViolatedCumulativeProfit, Currency: currency, WinRate: p.ViolatedWinRate}
	}
	return v
}

func currencyOf(l listing) string {
	if l.Workspace == nil {
		return ""
	}
	return l.Workspace.Currency
}

type listInput struct {
	WorkspaceID     string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	IncludeInactive bool   `json:"include_inactive,omitempty" jsonschema:"also show principles the user switched off"`
}

type listOutput struct {
	Principles []view `json:"principles"`
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	l, err := t.api.list(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	out := listOutput{Principles: []view{}}
	for i, p := range l.Principles {
		if p.IsActive || in.IncludeInactive {
			out.Principles = append(out.Principles, toView(p, i+1, l.Playbooks, currencyOf(l)))
		}
	}
	return nil, out, nil
}

// playbookID resolves a playbook given by ID or by name.
func playbookID(playbooks []playbook, given string) (string, error) {
	given = strings.TrimSpace(given)
	for _, pb := range playbooks {
		if pb.ID == given || strings.EqualFold(pb.Name, given) {
			return pb.ID, nil
		}
	}
	names := make([]string, 0, len(playbooks))
	for _, pb := range playbooks {
		names = append(names, pb.Name)
	}
	if len(names) == 0 {
		return "", fmt.Errorf("there is no playbook %q; this workspace has no playbooks", given)
	}
	return "", fmt.Errorf("there is no playbook %q; the playbooks are: %s", given, strings.Join(names, ", "))
}

type createInput struct {
	WorkspaceID    string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Title          string `json:"title" jsonschema:"a short name, such as No revenge trades"`
	Rule           string `json:"rule" jsonschema:"the rule itself, in the user's words"`
	Why            string `json:"why" jsonschema:"why it matters to the user"`
	Intervention   string `json:"intervention,omitempty" jsonschema:"what the user will do when tempted to break it"`
	Playbook       string `json:"playbook,omitempty" jsonschema:"the playbook it belongs to, by name or ID"`
	EvidenceNoteID string `json:"evidence_note_id,omitempty" jsonschema:"a note that shows why the rule exists, from list_notes"`
}

func (t *tools) create(ctx context.Context, req *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	title, rule, why := strings.TrimSpace(in.Title), strings.TrimSpace(in.Rule), strings.TrimSpace(in.Why)
	if title == "" || rule == "" || why == "" {
		return nil, view{}, errors.New("a principle needs a title, the rule and why it matters; ask the user for any that are missing")
	}
	l, err := t.api.list(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	input := map[string]any{"workspaceId": in.WorkspaceID, "title": title, "theRule": rule, "why": why}
	if s := strings.TrimSpace(in.Intervention); s != "" {
		input["intervention"] = s
	}
	if in.Playbook != "" {
		id, err := playbookID(l.Playbooks, in.Playbook)
		if err != nil {
			return nil, view{}, err
		}
		input["playbookId"] = id
	}
	if in.EvidenceNoteID != "" {
		input["evidenceNoteId"] = in.EvidenceNoteID
	}
	created, err := t.api.create(ctx, caller.Token, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(created, 0, l.Playbooks, currencyOf(l)), nil
}

type updateInput struct {
	PrincipleID       string `json:"principle_id" jsonschema:"ID from list_principles"`
	Title             string `json:"title,omitempty" jsonschema:"new short name"`
	Rule              string `json:"rule,omitempty" jsonschema:"new wording of the rule, in the user's words"`
	Why               string `json:"why,omitempty" jsonschema:"new reason it matters"`
	Intervention      string `json:"intervention,omitempty" jsonschema:"what the user will do when tempted to break it"`
	ClearIntervention bool   `json:"clear_intervention,omitempty" jsonschema:"remove the intervention"`
	Playbook          string `json:"playbook,omitempty" jsonschema:"by name or ID"`
	ClearPlaybook     bool   `json:"clear_playbook,omitempty" jsonschema:"stop tying the principle to a playbook"`
	EvidenceNoteID    string `json:"evidence_note_id,omitempty" jsonschema:"a note that shows why the rule exists, from list_notes"`
	ClearEvidenceNote bool   `json:"clear_evidence_note,omitempty" jsonschema:"remove the supporting note"`
	Active            *bool  `json:"active,omitempty" jsonschema:"false switches the principle off while keeping its history"`
}

func (t *tools) update(ctx context.Context, req *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, view, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, view{}, err
	}
	input := map[string]any{}
	for key, value := range map[string]string{"title": in.Title, "theRule": in.Rule, "why": in.Why, "intervention": in.Intervention} {
		if s := strings.TrimSpace(value); s != "" {
			input[key] = s
		}
	}
	for key, set := range map[string]bool{"clearIntervention": in.ClearIntervention, "clearPlaybook": in.ClearPlaybook, "clearEvidenceNote": in.ClearEvidenceNote} {
		if set {
			input[key] = true
		}
	}
	if in.EvidenceNoteID != "" {
		input["evidenceNoteId"] = in.EvidenceNoteID
	}
	if in.Active != nil {
		input["isActive"] = *in.Active
	}
	if len(input) == 0 && in.Playbook == "" {
		return nil, view{}, errors.New("say what to change: title, rule, why, intervention, playbook, evidence_note_id or active")
	}

	existing, ws, err := t.api.get(ctx, caller.Token, in.PrincipleID)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	if existing == nil {
		return nil, view{}, errors.New("principle not found; call list_principles for valid IDs")
	}
	l, err := t.api.list(ctx, caller.Token, ws)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	if in.Playbook != "" {
		id, err := playbookID(l.Playbooks, in.Playbook)
		if err != nil {
			return nil, view{}, err
		}
		input["playbookId"] = id
	}
	updated, err := t.api.update(ctx, caller.Token, in.PrincipleID, input)
	if err != nil {
		return nil, view{}, graphql.ForUser(err)
	}
	return nil, toView(updated, position(l.Principles, updated.ID), l.Playbooks, currencyOf(l)), nil
}

func position(all []principle, id string) int {
	return slices.IndexFunc(all, func(p principle) bool { return p.ID == id }) + 1
}

type moveInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	PrincipleID string `json:"principle_id" jsonschema:"ID from list_principles"`
	Position    int    `json:"position" jsonschema:"1 is the top"`
}

func (t *tools) move(ctx context.Context, req *mcp.CallToolRequest, in moveInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	l, err := t.api.list(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	from := position(l.Principles, in.PrincipleID) - 1
	if from < 0 {
		return nil, listOutput{}, errors.New("principle not found in this workspace; call list_principles for valid IDs")
	}
	to := min(max(in.Position, 1), len(l.Principles)) - 1
	moved := l.Principles[from]
	order := slices.Delete(slices.Clone(l.Principles), from, from+1)
	order = slices.Insert(order, to, moved)
	ids := make([]string, len(order))
	for i, p := range order {
		ids[i] = p.ID
	}
	if err := t.api.reorder(ctx, caller.Token, ids); err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	out := listOutput{Principles: make([]view, 0, len(order))}
	for i, p := range order {
		out.Principles = append(out.Principles, toView(p, i+1, l.Playbooks, currencyOf(l)))
	}
	return nil, out, nil
}

type deleteInput struct {
	PrincipleID       string `json:"principle_id" jsonschema:"ID from list_principles"`
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
	p, _, err := t.api.get(ctx, caller.Token, in.PrincipleID)
	if err != nil {
		return nil, deleteOutput{}, graphql.ForUser(err)
	}
	if p == nil {
		return nil, deleteOutput{}, errors.New("principle not found; call list_principles for valid IDs")
	}
	question := fmt.Sprintf("Delete the principle “%s”? This cannot be undone.", p.Title)
	if p.ViolationCount > 0 {
		question = fmt.Sprintf("Delete the principle “%s” and its record of %d broken trades? This cannot be undone. "+
			"Switching it off keeps that history.", p.Title, p.ViolationCount)
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_principle", Target: p.ID, Question: question,
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
	return nil, deleteOutput{Status: "deleted", Message: fmt.Sprintf("Deleted “%s”.", p.Title)}, nil
}
