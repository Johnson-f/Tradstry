package principles

import (
	"context"

	"tradstry-mcp/graphql"
)

type principle struct {
	ID                       string  `json:"id"`
	Title                    string  `json:"title"`
	TheRule                  string  `json:"theRule"`
	Why                      string  `json:"why"`
	Intervention             *string `json:"intervention"`
	PlaybookID               *string `json:"playbookId"`
	EvidenceNoteID           *string `json:"evidenceNoteId"`
	EvidenceNoteTitle        *string `json:"evidenceNoteTitle"`
	IsActive                 bool    `json:"isActive"`
	ViolationCount           int     `json:"violationCount"`
	ViolatedCumulativeProfit float64 `json:"violatedCumulativeProfit"`
	ViolatedWinRate          float64 `json:"violatedWinRate"`
}

type playbook struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

const (
	fields = `id title theRule why intervention playbookId evidenceNoteId evidenceNoteTitle isActive ` +
		`violationCount violatedCumulativeProfit violatedWinRate`

	listQuery = `query Principles($ws: String!) {
		principles(workspaceId: $ws) { ` + fields + ` }
		playbooks(workspaceId: $ws) { id name }
		workspace(id: $ws) { currency }
	}`
	getQuery        = `query Principle($id: String!) { principle(id: $id) { workspaceId ` + fields + ` } }`
	createMutation  = `mutation CreatePrinciple($input: CreatePrincipleInput!) { createPrinciple(input: $input) { ` + fields + ` } }`
	updateMutation  = `mutation UpdatePrinciple($id: String!, $input: UpdatePrincipleInput!) { updatePrinciple(id: $id, input: $input) { ` + fields + ` } }`
	deleteMutation  = `mutation DeletePrinciple($id: String!) { deletePrinciple(id: $id) }`
	reorderMutation = `mutation ReorderPrinciples($ids: [String!]!) { reorderPrinciples(orderedIds: $ids) }`
)

type api struct {
	client *graphql.Client
}

type listing struct {
	Principles []principle `json:"principles"`
	Playbooks  []playbook  `json:"playbooks"`
	Workspace  *struct {
		Currency string `json:"currency"`
	} `json:"workspace"`
}

// list returns the workspace's principles, highest priority first, with its
// playbooks and currency.
func (a api) list(ctx context.Context, token, ws string) (listing, error) {
	var data listing
	err := a.client.Do(ctx, token, listQuery, map[string]any{"ws": ws}, &data)
	return data, err
}

func (a api) get(ctx context.Context, token, id string) (*principle, string, error) {
	var data struct {
		Principle *struct {
			WorkspaceID string `json:"workspaceId"`
			principle
		} `json:"principle"`
	}
	if err := a.client.Do(ctx, token, getQuery, map[string]any{"id": id}, &data); err != nil || data.Principle == nil {
		return nil, "", err
	}
	return &data.Principle.principle, data.Principle.WorkspaceID, nil
}

func (a api) create(ctx context.Context, token string, input map[string]any) (principle, error) {
	var data struct {
		Principle principle `json:"createPrinciple"`
	}
	err := a.client.Do(ctx, token, createMutation, map[string]any{"input": input}, &data)
	return data.Principle, err
}

func (a api) update(ctx context.Context, token, id string, input map[string]any) (principle, error) {
	var data struct {
		Principle principle `json:"updatePrinciple"`
	}
	err := a.client.Do(ctx, token, updateMutation, map[string]any{"id": id, "input": input}, &data)
	return data.Principle, err
}

func (a api) delete(ctx context.Context, token, id string) (bool, error) {
	var data struct {
		Deleted bool `json:"deletePrinciple"`
	}
	err := a.client.Do(ctx, token, deleteMutation, map[string]any{"id": id}, &data)
	return data.Deleted, err
}

// reorder sets the whole order, first is highest priority. The backend numbers
// only the IDs it is given, so every principle must be in ids.
func (a api) reorder(ctx context.Context, token string, ids []string) error {
	return a.client.Do(ctx, token, reorderMutation, map[string]any{"ids": ids}, nil)
}
