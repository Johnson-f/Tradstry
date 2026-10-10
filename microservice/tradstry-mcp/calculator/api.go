package calculator

import (
	"context"

	"tradstry-mcp/graphql"
)

type rule struct {
	AccountBalance float64 `json:"accountBalance"`
	AccountRisk    float64 `json:"accountRisk"`
	MaxStopLossPct float64 `json:"maxStopLossPct"`
}

type tranche struct {
	ID          string  `json:"id"`
	Percent     float64 `json:"percent"`
	Shares      float64 `json:"shares"`
	TargetPrice float64 `json:"targetPrice"`
	Status      string  `json:"status"`
	FilledAt    *string `json:"filledAt"`
}

type plan struct {
	ID             string    `json:"id"`
	WorkspaceID    string    `json:"workspaceId"`
	Symbol         string    `json:"symbol"`
	PositionType   string    `json:"positionType"`
	EntryPrice     float64   `json:"entryPrice"`
	StopLoss       float64   `json:"stopLoss"`
	AccountBalance float64   `json:"accountBalance"`
	AccountRisk    float64   `json:"accountRisk"`
	TotalShares    float64   `json:"totalShares"`
	PositionValue  float64   `json:"positionValue"`
	Status         string    `json:"status"`
	Tranches       []tranche `json:"tranches"`
	Notes          *string   `json:"notes"`
	InstrumentJSON *string   `json:"instrumentJson"`
	CreatedAt      string    `json:"createdAt"`
}

type historyEntry struct {
	ID             string    `json:"id"`
	Symbol         string    `json:"symbol"`
	PositionType   string    `json:"positionType"`
	EntryPrice     float64   `json:"entryPrice"`
	StopLoss       float64   `json:"stopLoss"`
	AccountBalance float64   `json:"accountBalance"`
	AccountRisk    float64   `json:"accountRisk"`
	Shares         float64   `json:"shares"`
	PositionValue  float64   `json:"positionValue"`
	AccountPct     float64   `json:"accountPct"`
	StopLossPct    float64   `json:"stopLossPct"`
	PlanID         *string   `json:"planId"`
	Tranches       []tranche `json:"tranches"`
	CreatedAt      string    `json:"createdAt"`
}

const (
	ruleFields    = `accountBalance accountRisk maxStopLossPct`
	trancheFields = `id percent shares targetPrice status filledAt`
	planFields    = `id workspaceId symbol positionType entryPrice stopLoss accountBalance accountRisk totalShares positionValue status notes instrumentJson createdAt tranches { ` + trancheFields + ` }`
	historyFields = `id symbol positionType entryPrice stopLoss accountBalance accountRisk shares positionValue accountPct stopLossPct planId createdAt tranches { ` + trancheFields + ` }`
	settingsQuery = `query CalculatorSettings($ws: String!) { positionCalculatorRule(workspaceId: $ws) { ` + ruleFields + ` } workspace(id: $ws) { totalValue currency } }`
	ruleMutation  = `mutation UpsertPositionCalculatorRule($input: UpsertPositionCalculatorRuleInput!) { upsertPositionCalculatorRule(input: $input) { ` + ruleFields + ` } }`
	plansQuery    = `query PositionCalculatorPlans($ws: String!) { positionCalculatorPlans(workspaceId: $ws) { ` + planFields + ` } }`
	createPlanOp  = `mutation CreatePositionCalculatorPlan($input: CreatePositionCalculatorPlanInput!) { createPositionCalculatorPlan(input: $input) { ` + planFields + ` } }`
	updatePlanOp  = `mutation UpdatePositionCalculatorPlan($id: String!, $input: UpdatePositionCalculatorPlanInput!) { updatePositionCalculatorPlan(id: $id, input: $input) { ` + planFields + ` } }`
	deletePlanOp  = `mutation DeletePositionCalculatorPlan($id: String!) { deletePositionCalculatorPlan(id: $id) }`
	historyQuery  = `query PositionCalculatorHistory($ws: String!) { positionCalculatorHistory(workspaceId: $ws) { ` + historyFields + ` } }`
	createEntryOp = `mutation CreatePositionCalculatorHistory($input: CreatePositionCalculatorHistoryInput!) { createPositionCalculatorHistory(input: $input) { ` + historyFields + ` } }`
	deleteEntryOp = `mutation DeletePositionCalculatorHistory($id: String!) { deletePositionCalculatorHistory(id: $id) }`
)

type api struct {
	client *graphql.Client
}

type settings struct {
	Rule      *rule `json:"positionCalculatorRule"`
	Workspace *struct {
		TotalValue *float64 `json:"totalValue"`
		Currency   string   `json:"currency"`
	} `json:"workspace"`
}

func (a api) settings(ctx context.Context, token, ws string) (settings, error) {
	var data settings
	err := a.client.Do(ctx, token, settingsQuery, map[string]any{"ws": ws}, &data)
	return data, err
}

func (a api) setRule(ctx context.Context, token, ws string, r rule) (rule, error) {
	var data struct {
		Rule rule `json:"upsertPositionCalculatorRule"`
	}
	err := a.client.Do(ctx, token, ruleMutation, map[string]any{"input": map[string]any{
		"workspaceId": ws, "accountBalance": r.AccountBalance, "accountRisk": r.AccountRisk, "maxStopLossPct": r.MaxStopLossPct,
	}}, &data)
	return data.Rule, err
}

func (a api) plans(ctx context.Context, token, ws string) ([]plan, error) {
	var data struct {
		Plans []plan `json:"positionCalculatorPlans"`
	}
	err := a.client.Do(ctx, token, plansQuery, map[string]any{"ws": ws}, &data)
	return data.Plans, err
}

func (a api) createPlan(ctx context.Context, token string, input map[string]any) (plan, error) {
	var data struct {
		Plan plan `json:"createPositionCalculatorPlan"`
	}
	err := a.client.Do(ctx, token, createPlanOp, map[string]any{"input": input}, &data)
	return data.Plan, err
}

func (a api) updatePlan(ctx context.Context, token, id string, input map[string]any) (plan, error) {
	var data struct {
		Plan plan `json:"updatePositionCalculatorPlan"`
	}
	err := a.client.Do(ctx, token, updatePlanOp, map[string]any{"id": id, "input": input}, &data)
	return data.Plan, err
}

func (a api) deletePlan(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deletePlanOp, map[string]any{"id": id}, nil)
}

func (a api) history(ctx context.Context, token, ws string) ([]historyEntry, error) {
	var data struct {
		Entries []historyEntry `json:"positionCalculatorHistory"`
	}
	err := a.client.Do(ctx, token, historyQuery, map[string]any{"ws": ws}, &data)
	return data.Entries, err
}

func (a api) createEntry(ctx context.Context, token string, input map[string]any) (historyEntry, error) {
	var data struct {
		Entry historyEntry `json:"createPositionCalculatorHistory"`
	}
	err := a.client.Do(ctx, token, createEntryOp, map[string]any{"input": input}, &data)
	return data.Entry, err
}

func (a api) deleteEntry(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deleteEntryOp, map[string]any{"id": id}, nil)
}
