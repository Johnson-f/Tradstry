package workspaces

import (
	"context"

	"tradstry-mcp/graphql"
)

type workspace struct {
	ID                          string   `json:"id"`
	Name                        string   `json:"name"`
	Currency                    string   `json:"currency"`
	AssetClass                  string   `json:"assetClass"`
	RiskProfile                 string   `json:"riskProfile"`
	Broker                      *string  `json:"broker"`
	TotalValue                  *float64 `json:"totalValue"`
	SnaptradeConnectionID       *string  `json:"snaptradeConnectionId"`
	SnaptradeConnectionDisabled bool     `json:"snaptradeConnectionDisabled"`
}

const fields = `id name currency assetClass riskProfile broker totalValue snaptradeConnectionId snaptradeConnectionDisabled`

const (
	listQuery      = `query Workspaces { workspaces { ` + fields + ` } }`
	createMutation = `mutation CreateWorkspace($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { ` + fields + ` } }`
	updateMutation = `mutation UpdateWorkspace($id: String!, $input: UpdateWorkspaceInput!) { updateWorkspace(id: $id, input: $input) { ` + fields + ` } }`
	deleteMutation = `mutation DeleteWorkspace($id: String!) { deleteWorkspace(id: $id) }`
)

type api struct {
	client *graphql.Client
}

func (a api) list(ctx context.Context, token string) ([]workspace, error) {
	var data struct {
		Workspaces []workspace `json:"workspaces"`
	}
	err := a.client.Do(ctx, token, listQuery, nil, &data)
	return data.Workspaces, err
}

// create and update take GraphQL input objects; fields left out keep the
// backend's defaults or current values.
func (a api) create(ctx context.Context, token string, input map[string]any) (workspace, error) {
	var data struct {
		CreateWorkspace workspace `json:"createWorkspace"`
	}
	err := a.client.Do(ctx, token, createMutation, map[string]any{"input": input}, &data)
	return data.CreateWorkspace, err
}

func (a api) update(ctx context.Context, token, id string, input map[string]any) (workspace, error) {
	var data struct {
		UpdateWorkspace workspace `json:"updateWorkspace"`
	}
	err := a.client.Do(ctx, token, updateMutation, map[string]any{"id": id, "input": input}, &data)
	return data.UpdateWorkspace, err
}

func (a api) delete(ctx context.Context, token, id string) (bool, error) {
	var data struct {
		DeleteWorkspace bool `json:"deleteWorkspace"`
	}
	err := a.client.Do(ctx, token, deleteMutation, map[string]any{"id": id}, &data)
	return data.DeleteWorkspace, err
}
