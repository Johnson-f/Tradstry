package calculator

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/numfmt"
	"tradstry-mcp/oauth"
)

// activePlan is an open plan's status; its entries start as "planned".
const activePlan = "active"

type planEntryView struct {
	Number           int     `json:"number" jsonschema:"pass to update_position_plan"`
	Price            float64 `json:"price"`
	RiskSharePercent float64 `json:"risk_share_percent"`
	Shares           float64 `json:"shares"`
	Status           string  `json:"status" jsonschema:"planned, filled or skipped"`
	FilledAt         string  `json:"filled_at,omitempty"`
}

type planView struct {
	ID            string          `json:"id"`
	Symbol        string          `json:"symbol"`
	Direction     string          `json:"direction"`
	Status        string          `json:"status" jsonschema:"active until every entry is filled or skipped, then completed or cancelled"`
	Stop          float64         `json:"stop"`
	AverageEntry  float64         `json:"average_entry"`
	TotalShares   float64         `json:"total_shares"`
	PositionValue float64         `json:"position_value"`
	RiskPercent   float64         `json:"risk_percent"`
	Balance       float64         `json:"account_balance"`
	Entries       []planEntryView `json:"entries"`
	Notes         string          `json:"notes,omitempty"`
	CreatedAt     string          `json:"created_at"`
	Note          string          `json:"note,omitempty"`
}

func toPlanView(p plan) planView {
	v := planView{
		ID: p.ID, Symbol: p.Symbol, Direction: p.PositionType, Status: p.Status, Stop: p.StopLoss,
		AverageEntry: numfmt.Round2(p.EntryPrice), TotalShares: p.TotalShares, PositionValue: numfmt.Round2(p.PositionValue),
		RiskPercent: p.AccountRisk, Balance: numfmt.Round2(p.AccountBalance), CreatedAt: p.CreatedAt, Entries: []planEntryView{},
	}
	if p.Notes != nil {
		v.Notes = *p.Notes
	}
	if p.InstrumentJSON != nil {
		v.Note = "This is an options plan; update it on tradstry.com."
	}
	for i, t := range p.Tranches {
		e := planEntryView{Number: i + 1, Price: t.TargetPrice, RiskSharePercent: t.Percent, Shares: t.Shares, Status: t.Status}
		if t.FilledAt != nil {
			e.FilledAt = *t.FilledAt
		}
		v.Entries = append(v.Entries, e)
	}
	return v
}

type createPlanInput struct {
	sizeInput
	Symbol string `json:"symbol" jsonschema:"ticker, such as AAPL"`
	Notes  string `json:"notes,omitempty" jsonschema:"the user's own thesis or reminders"`
}

func (t *tools) createPlan(ctx context.Context, req *mcp.CallToolRequest, in createPlanInput) (*mcp.CallToolResult, planView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, planView{}, err
	}
	symbol := strings.ToUpper(strings.TrimSpace(in.Symbol))
	if symbol == "" {
		return nil, planView{}, errors.New("give the symbol")
	}
	s, calc, err := t.sizeFor(ctx, caller.Token, in.sizeInput)
	if err != nil {
		return nil, planView{}, err
	}
	tranches := make([]map[string]any, 0, len(s.Entries))
	for _, e := range s.Entries {
		tranches = append(tranches, map[string]any{"percent": e.RiskPercent, "shares": e.Shares, "targetPrice": e.Price})
	}
	input := map[string]any{
		"workspaceId": in.WorkspaceID, "symbol": symbol, "positionType": s.Direction, "entryPrice": s.AverageEntry,
		"stopLoss": s.Stop, "accountBalance": s.Balance, "accountRisk": s.RiskPercent, "totalShares": s.TotalShares,
		"positionValue": s.PositionValue, "tranches": tranches,
	}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		input["notes"] = notes
	}
	created, err := t.api.createPlan(ctx, caller.Token, input)
	if err != nil {
		return nil, planView{}, graphql.ForUser(err)
	}
	v := toPlanView(created)
	if len(calc.Warnings) > 0 {
		v.Note = strings.Join(calc.Warnings, "; ")
	}
	return nil, v, nil
}

type listPlansInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	All         bool   `json:"all,omitempty" jsonschema:"include completed and cancelled plans"`
}

func (t *tools) listPlans(ctx context.Context, req *mcp.CallToolRequest, in listPlansInput) (*mcp.CallToolResult, struct {
	Plans []planView `json:"plans"`
}, error) {
	var out struct {
		Plans []planView `json:"plans"`
	}
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, out, err
	}
	plans, err := t.api.plans(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, out, graphql.ForUser(err)
	}
	slices.SortStableFunc(plans, func(a, b plan) int {
		open := func(p plan) int {
			if p.Status == activePlan {
				return 0
			}
			return 1
		}
		return open(a) - open(b)
	})
	out.Plans = []planView{}
	for _, p := range plans {
		if in.All || p.Status == activePlan {
			out.Plans = append(out.Plans, toPlanView(p))
		}
	}
	return nil, out, nil
}

func (t *tools) findPlan(ctx context.Context, token, ws, id string) (plan, error) {
	plans, err := t.api.plans(ctx, token, ws)
	if err != nil {
		return plan{}, graphql.ForUser(err)
	}
	for _, p := range plans {
		if p.ID == id {
			return p, nil
		}
	}
	return plan{}, errors.New("plan not found; call list_position_plans for valid IDs")
}

type entryUpdate struct {
	Number    int     `json:"number" jsonschema:"the entry's number from list_position_plans"`
	Status    string  `json:"status" jsonschema:"filled or skipped"`
	FillPrice float64 `json:"fill_price,omitempty" jsonschema:"the actual fill price, when it differs from the planned one; shares are resized to keep the entry's risk"`
}

type updatePlanInput struct {
	WorkspaceID string        `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	PlanID      string        `json:"plan_id" jsonschema:"ID from list_position_plans"`
	Entries     []entryUpdate `json:"entries,omitempty" jsonschema:"entries to mark filled or skipped"`
	Notes       *string       `json:"notes,omitempty" jsonschema:"replaces the notes; an empty string removes them"`
	Cancel      bool          `json:"cancel,omitempty" jsonschema:"cancel the plan; it stays on record"`
}

func (t *tools) updatePlan(ctx context.Context, req *mcp.CallToolRequest, in updatePlanInput) (*mcp.CallToolResult, planView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, planView{}, err
	}
	if len(in.Entries) == 0 && in.Notes == nil && !in.Cancel {
		return nil, planView{}, errors.New("say what to change: entries, notes or cancel")
	}
	p, err := t.findPlan(ctx, caller.Token, in.WorkspaceID, in.PlanID)
	if err != nil {
		return nil, planView{}, err
	}
	if p.InstrumentJSON != nil {
		return nil, planView{}, errors.New("this is an options plan; update it on tradstry.com")
	}
	if p.Status != activePlan {
		return nil, planView{}, fmt.Errorf("this plan is already %s", p.Status)
	}

	input := map[string]any{}
	if in.Notes != nil {
		if notes := strings.TrimSpace(*in.Notes); notes == "" {
			input["clearNotes"] = true
		} else {
			input["notes"] = notes
		}
	}
	next := slices.Clone(p.Tranches)
	var changes []map[string]any
	for _, u := range in.Entries {
		if u.Number < 1 || u.Number > len(next) {
			return nil, planView{}, fmt.Errorf("the plan has entries 1 to %d", len(next))
		}
		if u.Status != "filled" && u.Status != "skipped" {
			return nil, planView{}, errors.New("an entry's status is filled or skipped")
		}
		tr := &next[u.Number-1]
		if tr.Status != "planned" {
			return nil, planView{}, fmt.Errorf("entry %d is already %s", u.Number, tr.Status)
		}
		change := map[string]any{"id": tr.ID, "status": u.Status}
		if u.Status == "filled" && u.FillPrice > 0 && u.FillPrice != tr.TargetPrice {
			resized, err := size(p.PositionType, p.StopLoss, p.AccountBalance, p.AccountRisk*tr.Percent/100,
				[]plannedEntry{{Price: u.FillPrice, RiskPercent: 100}}, false)
			if err != nil {
				return nil, planView{}, fmt.Errorf("entry %d at %g: %w", u.Number, u.FillPrice, err)
			}
			tr.TargetPrice, tr.Shares = u.FillPrice, resized.TotalShares
		}
		if u.Status == "filled" {
			change["targetPrice"], change["shares"] = tr.TargetPrice, tr.Shares
		}
		tr.Status = u.Status
		changes = append(changes, change)
	}
	if len(changes) > 0 {
		input["tranches"] = changes
	}

	resolved := !slices.ContainsFunc(next, func(tr tranche) bool { return tr.Status == "planned" })
	filled := slices.DeleteFunc(slices.Clone(next), func(tr tranche) bool { return tr.Status != "filled" })
	switch {
	case in.Cancel:
		input["status"] = "cancelled"
	case resolved && len(filled) == 0:
		input["status"] = "cancelled"
	}

	updated, err := t.api.updatePlan(ctx, caller.Token, p.ID, input)
	if err != nil {
		return nil, planView{}, graphql.ForUser(err)
	}
	v := toPlanView(updated)
	if in.Cancel || !resolved {
		return nil, v, nil
	}
	if len(filled) == 0 {
		v.Note = "Nothing was filled, so the plan was cancelled."
		return nil, v, nil
	}

	// Every entry is settled and something filled: record the result, as the web
	// calculator does, then complete the plan.
	shares, value := 0.0, 0.0
	for _, tr := range filled {
		shares += tr.Shares
		value += tr.Shares * tr.TargetPrice
	}
	average := value / shares
	historyTranches := make([]map[string]any, 0, len(updated.Tranches))
	for _, tr := range updated.Tranches {
		ht := map[string]any{"id": tr.ID, "percent": tr.Percent, "shares": tr.Shares, "targetPrice": tr.TargetPrice, "status": tr.Status}
		if tr.FilledAt != nil {
			ht["filledAt"] = *tr.FilledAt
		}
		historyTranches = append(historyTranches, ht)
	}
	if _, err := t.api.createEntry(ctx, caller.Token, map[string]any{
		"workspaceId": in.WorkspaceID, "symbol": p.Symbol, "positionType": p.PositionType, "entryPrice": average,
		"stopLoss": p.StopLoss, "accountBalance": p.AccountBalance, "accountRisk": p.AccountRisk, "shares": shares,
		"positionValue": value, "accountPct": value / p.AccountBalance * 100, "stopLossPct": stopDistance(average, p.StopLoss),
		"planId": p.ID, "tranches": historyTranches,
	}); err != nil {
		return nil, planView{}, graphql.ForUser(err)
	}
	completed, err := t.api.updatePlan(ctx, caller.Token, p.ID, map[string]any{"status": "completed"})
	if err != nil {
		return nil, planView{}, graphql.ForUser(err)
	}
	v = toPlanView(completed)
	v.Note = fmt.Sprintf("Completed: %g shares at an average of %.2f, recorded in the calculator's history.", shares, average)
	return nil, v, nil
}

type deletePlanInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	PlanID            string `json:"plan_id" jsonschema:"ID from list_position_plans"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

func (t *tools) deletePlan(ctx context.Context, req *mcp.CallToolRequest, in deletePlanInput) (*mcp.CallToolResult, confirmOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	p, err := t.findPlan(ctx, caller.Token, in.WorkspaceID, in.PlanID)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_position_plan", Target: p.ID,
		Question: fmt.Sprintf("Delete the %s %s plan (%g shares, stop %g)? A trade matched to it loses the plan's stop for R. This cannot be undone.",
			p.Symbol, p.PositionType, p.TotalShares, p.StopLoss),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.deletePlan(ctx, caller.Token, p.ID); err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	return nil, confirmOutput{Status: "done", Message: fmt.Sprintf("Deleted the %s plan.", p.Symbol)}, nil
}
