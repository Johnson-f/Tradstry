package calculator

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

type direction string

func inputSchema[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](&jsonschema.ForOptions{TypeSchemas: map[reflect.Type]*jsonschema.Schema{
		reflect.TypeFor[direction](): {Type: "string", Enum: []any{"long", "short"}},
	}})
	if err != nil {
		panic(err)
	}
	return schema
}

type tools struct {
	api       api
	confirmer *confirm.Confirmer
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{api: api{client: client}, confirmer: confirmer}
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)}
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}
	destructive := &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_risk_rules",
		Title: "Risk rules",
		Description: "The user's position sizing rules for a workspace: account balance, percent risked per trade and widest stop allowed, " +
			"plus the balance their broker reports.",
		Annotations: readOnly,
	}, t.getRules)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_risk_rules",
		Title:       "Set risk rules",
		Description: "Change the user's position sizing rules. Fields left out stay as they are. Use only numbers the user gave.",
		Annotations: write,
	}, t.setRules)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "calculate_position",
		Title: "Size a position",
		Description: "How many shares to buy or short so a stop-out loses only the planned risk. Saves nothing. " +
			"Uses the saved risk percent and the broker's balance unless given others. Shares round down so the loss never exceeds the budget. " +
			"For a scale-in, give several entries and how the risk splits between them. Stocks and ETFs only.",
		InputSchema: inputSchema[sizeInput](),
		Annotations: readOnly,
	}, t.calculate)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "save_calculation",
		Title: "Save calculation to history",
		Description: "Size a position as calculate_position does and record it in the calculator's history, " +
			"for when the user wants to keep the numbers but not plan the trade.",
		InputSchema: inputSchema[saveInput](),
		Annotations: write,
	}, t.saveCalculation)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "create_position_plan",
		Title: "Plan a position",
		Description: "Size a position and save it as a plan before the trade. When the trade happens, the journal matches it to the plan, " +
			"and the plan's stop gives the trade its R. Take the symbol, entries and stop from the user.",
		InputSchema: inputSchema[createPlanInput](),
		Annotations: write,
	}, t.createPlan)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_position_plans",
		Title:       "List position plans",
		Description: "The user's position plans, open ones first, with each entry's status.",
		Annotations: readOnly,
	}, t.listPlans)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "update_position_plan",
		Title: "Update position plan",
		Description: "Mark a plan's entries filled or skipped, change its notes, or cancel it. When every entry is filled or skipped, " +
			"the plan is completed and recorded in the calculator's history, or cancelled if nothing filled.",
		Annotations: write,
	}, t.updatePlan)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_position_plan",
		Title:       "Delete position plan",
		Description: "Delete a plan. The user must confirm first. Cancelling with update_position_plan keeps it on record instead.",
		Annotations: destructive,
	}, t.deletePlan)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_calculator_history",
		Title:       "Calculator history",
		Description: "Positions the user sized and saved, and plans they completed, newest first.",
		Annotations: readOnly,
	}, t.listHistory)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_calculator_entry",
		Title:       "Delete calculator history entry",
		Description: "Remove one entry from the calculator's history. The user must confirm first.",
		Annotations: destructive,
	}, t.deleteEntry)
}

type workspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type rulesView struct {
	AccountBalance float64  `json:"account_balance,omitempty" jsonschema:"the balance the user saved"`
	BrokerBalance  *float64 `json:"broker_balance,omitempty" jsonschema:"the balance the connected broker reports; sizing prefers it"`
	RiskPercent    float64  `json:"risk_percent,omitempty" jsonschema:"percent of the balance risked per trade"`
	MaxStopPercent float64  `json:"max_stop_percent,omitempty" jsonschema:"widest stop allowed, as a percent of the entry price"`
	Currency       string   `json:"currency"`
	Note           string   `json:"note,omitempty"`
}

func (t *tools) rulesOf(ctx context.Context, token, ws string) (settings, rulesView, error) {
	s, err := t.api.settings(ctx, token, ws)
	if err != nil {
		return settings{}, rulesView{}, graphql.ForUser(err)
	}
	if s.Workspace == nil {
		return settings{}, rulesView{}, errors.New("workspace not found; call list_workspaces for valid IDs")
	}
	v := rulesView{Currency: s.Workspace.Currency}
	if b := s.Workspace.TotalValue; b != nil && *b > 0 {
		v.BrokerBalance = b
	}
	if s.Rule == nil {
		v.Note = "No sizing rules are saved yet; ask the user for their risk per trade and set them with set_risk_rules."
	} else {
		v.AccountBalance, v.RiskPercent, v.MaxStopPercent = s.Rule.AccountBalance, s.Rule.AccountRisk, s.Rule.MaxStopLossPct
	}
	return s, v, nil
}

func (t *tools) getRules(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, rulesView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, rulesView{}, err
	}
	_, v, err := t.rulesOf(ctx, caller.Token, in.WorkspaceID)
	return nil, v, err
}

type setRulesInput struct {
	WorkspaceID    string   `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	AccountBalance *float64 `json:"account_balance,omitempty" jsonschema:"balance to size from when the broker reports none"`
	RiskPercent    *float64 `json:"risk_percent,omitempty" jsonschema:"percent of the balance to risk per trade, such as 1"`
	MaxStopPercent *float64 `json:"max_stop_percent,omitempty" jsonschema:"widest stop allowed, as a percent of the entry price"`
}

func (t *tools) setRules(ctx context.Context, req *mcp.CallToolRequest, in setRulesInput) (*mcp.CallToolResult, rulesView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, rulesView{}, err
	}
	if in.AccountBalance == nil && in.RiskPercent == nil && in.MaxStopPercent == nil {
		return nil, rulesView{}, errors.New("say what to change: account_balance, risk_percent or max_stop_percent")
	}
	s, _, err := t.rulesOf(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, rulesView{}, err
	}
	next := rule{}
	if s.Rule != nil {
		next = *s.Rule
	}
	for _, set := range []struct {
		value *float64
		into  *float64
		name  string
		max   float64
	}{
		{in.AccountBalance, &next.AccountBalance, "account_balance", 0},
		{in.RiskPercent, &next.AccountRisk, "risk_percent", 100},
		{in.MaxStopPercent, &next.MaxStopLossPct, "max_stop_percent", 100},
	} {
		if set.value == nil {
			continue
		}
		if *set.value <= 0 || (set.max > 0 && *set.value > set.max) {
			return nil, rulesView{}, fmt.Errorf("%s must be above zero%s", set.name, map[bool]string{true: " and at most 100", false: ""}[set.max > 0])
		}
		*set.into = *set.value
	}
	if next.AccountRisk == 0 || next.MaxStopLossPct == 0 {
		return nil, rulesView{}, errors.New("the first time, give risk_percent and max_stop_percent together")
	}
	if _, err := t.api.setRule(ctx, caller.Token, in.WorkspaceID, next); err != nil {
		return nil, rulesView{}, graphql.ForUser(err)
	}
	_, v, err := t.rulesOf(ctx, caller.Token, in.WorkspaceID)
	return nil, v, err
}

type entryInput struct {
	Price            float64 `json:"price" jsonschema:"entry price per share"`
	RiskSharePercent float64 `json:"risk_share_percent" jsonschema:"this entry's share of the trade's risk; all entries add up to 100"`
}

type sizeInput struct {
	WorkspaceID    string       `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Direction      direction    `json:"direction" jsonschema:"long or short"`
	Stop           float64      `json:"stop" jsonschema:"stop-loss price"`
	EntryPrice     float64      `json:"entry_price,omitempty" jsonschema:"one entry price; or give entries for a scale-in"`
	Entries        []entryInput `json:"entries,omitempty" jsonschema:"several entry prices with their share of the risk"`
	RiskPercent    float64      `json:"risk_percent,omitempty" jsonschema:"percent of the balance to risk; the saved rule when left out"`
	AccountBalance float64      `json:"account_balance,omitempty" jsonschema:"balance to size from; the broker's balance, then the saved one, when left out"`
	WholeShares    bool         `json:"whole_shares,omitempty" jsonschema:"round down to whole shares, for brokers without fractional shares"`
}

type entryView struct {
	Number           int     `json:"number"`
	Price            float64 `json:"price"`
	RiskSharePercent float64 `json:"risk_share_percent"`
	Shares           float64 `json:"shares"`
	Risk             float64 `json:"risk" jsonschema:"loss if stopped out"`
	PositionValue    float64 `json:"position_value"`
	StopDistance     float64 `json:"stop_distance_percent"`
}

type calculationView struct {
	Direction      string      `json:"direction"`
	Stop           float64     `json:"stop"`
	AccountBalance float64     `json:"account_balance"`
	BalanceSource  string      `json:"balance_source" jsonschema:"given, broker or saved rule"`
	RiskPercent    float64     `json:"risk_percent"`
	RiskBudget     float64     `json:"risk_budget" jsonschema:"the most the trade may lose"`
	Currency       string      `json:"currency"`
	Entries        []entryView `json:"entries"`
	TotalShares    float64     `json:"total_shares"`
	TotalRisk      float64     `json:"total_risk" jsonschema:"loss if every entry fills and the stop is hit"`
	PositionValue  float64     `json:"position_value"`
	AverageEntry   float64     `json:"average_entry"`
	AccountPercent float64     `json:"account_percent" jsonschema:"position value as a percent of the balance"`
	Warnings       []string    `json:"warnings,omitempty" jsonschema:"tell the user"`
}

// sizeFor resolves the balance and risk, then sizes the position.
func (t *tools) sizeFor(ctx context.Context, token string, in sizeInput) (sizing, calculationView, error) {
	_, rules, err := t.rulesOf(ctx, token, in.WorkspaceID)
	if err != nil {
		return sizing{}, calculationView{}, err
	}
	balance, source := in.AccountBalance, "given"
	if balance <= 0 && rules.BrokerBalance != nil {
		balance, source = *rules.BrokerBalance, "broker"
	}
	if balance <= 0 && rules.AccountBalance > 0 {
		balance, source = rules.AccountBalance, "saved rule"
	}
	if balance <= 0 {
		return sizing{}, calculationView{}, errors.New("there is no balance to size from; ask the user for their account balance")
	}
	risk := in.RiskPercent
	if risk <= 0 {
		risk = rules.RiskPercent
	}
	if risk <= 0 {
		return sizing{}, calculationView{}, errors.New("there is no risk percent; ask the user how much of the account to risk per trade")
	}
	entries := make([]plannedEntry, 0, len(in.Entries))
	for _, e := range in.Entries {
		entries = append(entries, plannedEntry{Price: e.Price, RiskPercent: e.RiskSharePercent})
	}
	if in.EntryPrice > 0 {
		if len(entries) > 0 {
			return sizing{}, calculationView{}, errors.New("give entry_price or entries, not both")
		}
		entries = []plannedEntry{{Price: in.EntryPrice, RiskPercent: 100}}
	}
	s, err := size(string(in.Direction), in.Stop, balance, risk, entries, in.WholeShares)
	if err != nil {
		return sizing{}, calculationView{}, err
	}

	v := calculationView{
		Direction: s.Direction, Stop: s.Stop, AccountBalance: round2(balance), BalanceSource: source, RiskPercent: risk,
		RiskBudget: round2(s.RiskBudget), Currency: rules.Currency, TotalShares: s.TotalShares, TotalRisk: round2(s.TotalRisk),
		PositionValue: round2(s.PositionValue), AverageEntry: round2(s.AverageEntry), AccountPercent: round2(s.PositionValue / balance * 100),
	}
	for i, e := range s.Entries {
		v.Entries = append(v.Entries, entryView{
			Number: i + 1, Price: e.Price, RiskSharePercent: e.RiskPercent, Shares: e.Shares, Risk: round2(e.ActualRisk),
			PositionValue: round2(e.PositionValue), StopDistance: round2(e.StopDistance),
		})
		if rules.MaxStopPercent > 0 && e.StopDistance > rules.MaxStopPercent {
			v.Warnings = append(v.Warnings, fmt.Sprintf("the stop is %.2f%% from the entry at %g, wider than the user's %g%% maximum", e.StopDistance, e.Price, rules.MaxStopPercent))
		}
	}
	if s.PositionValue > balance {
		v.Warnings = append(v.Warnings, "the position is larger than the account balance, so it needs margin")
	}
	return s, v, nil
}

func (t *tools) calculate(ctx context.Context, req *mcp.CallToolRequest, in sizeInput) (*mcp.CallToolResult, calculationView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, calculationView{}, err
	}
	_, v, err := t.sizeFor(ctx, caller.Token, in)
	return nil, v, err
}

type saveInput struct {
	sizeInput
	Symbol string `json:"symbol" jsonschema:"ticker, such as AAPL"`
}

type savedView struct {
	ID string `json:"id"`
	calculationView
}

func (t *tools) saveCalculation(ctx context.Context, req *mcp.CallToolRequest, in saveInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	symbol := strings.ToUpper(strings.TrimSpace(in.Symbol))
	if symbol == "" {
		return nil, savedView{}, errors.New("give the symbol")
	}
	s, v, err := t.sizeFor(ctx, caller.Token, in.sizeInput)
	if err != nil {
		return nil, savedView{}, err
	}
	input := map[string]any{
		"workspaceId": in.WorkspaceID, "symbol": symbol, "positionType": s.Direction, "entryPrice": s.AverageEntry,
		"stopLoss": s.Stop, "accountBalance": s.Balance, "accountRisk": s.RiskPercent, "shares": s.TotalShares,
		"positionValue": s.PositionValue, "accountPct": s.PositionValue / s.Balance * 100,
		"stopLossPct": stopDistance(s.AverageEntry, s.Stop),
	}
	entry, err := t.api.createEntry(ctx, caller.Token, input)
	if err != nil {
		return nil, savedView{}, graphql.ForUser(err)
	}
	return nil, savedView{ID: entry.ID, calculationView: v}, nil
}

type historyInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Limit       int    `json:"limit,omitempty" jsonschema:"at most 50; defaults to 10"`
}

type historyView struct {
	ID             string  `json:"id"`
	Symbol         string  `json:"symbol"`
	Direction      string  `json:"direction"`
	Entry          float64 `json:"entry" jsonschema:"average entry price"`
	Stop           float64 `json:"stop"`
	Shares         float64 `json:"shares"`
	PositionValue  float64 `json:"position_value"`
	RiskPercent    float64 `json:"risk_percent"`
	AccountPercent float64 `json:"account_percent"`
	FromPlan       string  `json:"from_plan,omitempty" jsonschema:"the plan this completed, if any"`
	SavedAt        string  `json:"saved_at"`
}

func (t *tools) listHistory(ctx context.Context, req *mcp.CallToolRequest, in historyInput) (*mcp.CallToolResult, struct {
	Entries []historyView `json:"entries"`
}, error) {
	var out struct {
		Entries []historyView `json:"entries"`
	}
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, out, err
	}
	entries, err := t.api.history(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, out, graphql.ForUser(err)
	}
	limit := in.Limit
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	out.Entries = []historyView{}
	for _, e := range entries[:min(limit, len(entries))] {
		v := historyView{
			ID: e.ID, Symbol: e.Symbol, Direction: e.PositionType, Entry: round2(e.EntryPrice), Stop: e.StopLoss, Shares: e.Shares,
			PositionValue: round2(e.PositionValue), RiskPercent: e.AccountRisk, AccountPercent: round2(e.AccountPct), SavedAt: e.CreatedAt,
		}
		if e.PlanID != nil {
			v.FromPlan = *e.PlanID
		}
		out.Entries = append(out.Entries, v)
	}
	return nil, out, nil
}

type deleteEntryInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	EntryID           string `json:"entry_id" jsonschema:"ID from list_calculator_history"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

type confirmOutput struct {
	Status            string `json:"status" jsonschema:"done, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func unapproved(outcome confirm.Outcome) confirmOutput {
	status := "cancelled"
	if outcome.Token != "" {
		status = "needs_confirmation"
	}
	return confirmOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}
}

func (t *tools) deleteEntry(ctx context.Context, req *mcp.CallToolRequest, in deleteEntryInput) (*mcp.CallToolResult, confirmOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	entries, err := t.api.history(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	var found *historyEntry
	for i := range entries {
		if entries[i].ID == in.EntryID {
			found = &entries[i]
		}
	}
	if found == nil {
		return nil, confirmOutput{}, errors.New("history entry not found; call list_calculator_history for valid IDs")
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_calculator_entry", Target: found.ID,
		Question: fmt.Sprintf("Delete the saved %s %s calculation (%g shares at %.2f)? This cannot be undone.", found.Symbol, found.PositionType, found.Shares, found.EntryPrice),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.deleteEntry(ctx, caller.Token, found.ID); err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	return nil, confirmOutput{Status: "done", Message: "Deleted the history entry."}, nil
}
