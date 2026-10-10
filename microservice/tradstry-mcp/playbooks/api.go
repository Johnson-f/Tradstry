package playbooks

import (
	"context"

	"tradstry-mcp/graphql"
)

type playbook struct {
	ID                  string   `json:"id"`
	WorkspaceID         string   `json:"workspaceId"`
	Name                string   `json:"name"`
	EdgeName            string   `json:"edgeName"`
	EntryRules          string   `json:"entryRules"`
	ExitRules           string   `json:"exitRules"`
	PositionSizingRules string   `json:"positionSizingRules"`
	AdditionalRules     *string  `json:"additionalRules"`
	Availability        string   `json:"availability"`
	WorkspaceIDs        []string `json:"workspaceIds"`
	WinRate             float64  `json:"winRate"`
	CumulativeProfit    float64  `json:"cumulativeProfit"`
	AverageGain         float64  `json:"averageGain"`
	AverageLoss         float64  `json:"averageLoss"`
	TradeCount          int      `json:"tradeCount"`
}

type workspace struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
}

type principleRef struct {
	Title      string  `json:"title"`
	PlaybookID *string `json:"playbookId"`
}

const (
	fields = `id workspaceId name edgeName entryRules exitRules positionSizingRules additionalRules availability workspaceIds ` +
		`winRate cumulativeProfit averageGain averageLoss tradeCount`

	listQuery = `query Playbooks($ws: String!) {
		playbooks(workspaceId: $ws) { ` + fields + ` }
		workspaces { id name currency }
	}`
	getQuery = `query Playbook($id: String!) {
		playbook(id: $id) { ` + fields + ` }
		workspaces { id name currency }
	}`
	principlesQuery       = `query PlaybookPrinciples($ws: String!) { principles(workspaceId: $ws) { title playbookId } }`
	createMutation        = `mutation CreatePlaybook($input: CreatePlaybookInput!) { createPlaybook(input: $input) { ` + fields + ` } }`
	updateMutation        = `mutation UpdatePlaybook($id: String!, $input: UpdatePlaybookInput!) { updatePlaybook(id: $id, input: $input) { ` + fields + ` } }`
	applicabilityMutation = `mutation SetPlaybookApplicability($id: String!, $input: StrategyApplicabilityInput!) {
		setPlaybookApplicability(id: $id, input: $input) { ` + fields + ` }
	}`
	deleteMutation = `mutation DeletePlaybook($id: String!) { deletePlaybook(id: $id) }`
)

type api struct {
	client *graphql.Client
}

func (a api) list(ctx context.Context, token, ws string) ([]playbook, []workspace, error) {
	var data struct {
		Playbooks  []playbook  `json:"playbooks"`
		Workspaces []workspace `json:"workspaces"`
	}
	err := a.client.Do(ctx, token, listQuery, map[string]any{"ws": ws}, &data)
	return data.Playbooks, data.Workspaces, err
}

func (a api) get(ctx context.Context, token, id string) (*playbook, []workspace, error) {
	var data struct {
		Playbook   *playbook   `json:"playbook"`
		Workspaces []workspace `json:"workspaces"`
	}
	err := a.client.Do(ctx, token, getQuery, map[string]any{"id": id}, &data)
	return data.Playbook, data.Workspaces, err
}

// principlesUsing names the principles, across workspaces, that belong to playbook id.
func (a api) principlesUsing(ctx context.Context, token, id string, workspaces []workspace) ([]string, error) {
	var titles []string
	for _, ws := range workspaces {
		var data struct {
			Principles []principleRef `json:"principles"`
		}
		if err := a.client.Do(ctx, token, principlesQuery, map[string]any{"ws": ws.ID}, &data); err != nil {
			return nil, err
		}
		for _, p := range data.Principles {
			if p.PlaybookID != nil && *p.PlaybookID == id {
				titles = append(titles, p.Title)
			}
		}
	}
	return titles, nil
}

func (a api) create(ctx context.Context, token string, input map[string]any) (playbook, error) {
	var data struct {
		Playbook playbook `json:"createPlaybook"`
	}
	err := a.client.Do(ctx, token, createMutation, map[string]any{"input": input}, &data)
	return data.Playbook, err
}

func (a api) update(ctx context.Context, token, id string, input map[string]any) (playbook, error) {
	var data struct {
		Playbook playbook `json:"updatePlaybook"`
	}
	err := a.client.Do(ctx, token, updateMutation, map[string]any{"id": id, "input": input}, &data)
	return data.Playbook, err
}

func (a api) setApplicability(ctx context.Context, token, id, availability string, workspaceIDs []string) (playbook, error) {
	var data struct {
		Playbook playbook `json:"setPlaybookApplicability"`
	}
	if workspaceIDs == nil {
		workspaceIDs = []string{}
	}
	err := a.client.Do(ctx, token, applicabilityMutation, map[string]any{
		"id": id, "input": map[string]any{"availability": availability, "workspaceIds": workspaceIDs},
	}, &data)
	return data.Playbook, err
}

func (a api) delete(ctx context.Context, token, id string) (bool, error) {
	var data struct {
		Deleted bool `json:"deletePlaybook"`
	}
	err := a.client.Do(ctx, token, deleteMutation, map[string]any{"id": id}, &data)
	return data.Deleted, err
}
