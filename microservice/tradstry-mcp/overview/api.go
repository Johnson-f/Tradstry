package overview

import (
	"context"

	"tradstry-mcp/graphql"
)

const (
	workspacesQuery = `query OverviewWorkspaces { workspaces { id name currency broker snaptradeConnectionId snaptradeConnectionDisabled brokerageSetupComplete } }`
	journalQuery    = `query OverviewJournal($workspaceId: String!) {
  journalFlowStatus(workspaceId: $workspaceId) { enabled sourceRevision projectionRevision importState lastError }
  journalTradesV2(workspaceId: $workspaceId) { lifecycleState reviewState }
}`
	syncQuery = `query OverviewSync($workspaceId: String!) {
  brokerageSyncOutcome(workspaceId: $workspaceId) { status error finishedAt succeededAt }
}`
)

type workspace struct {
	ID                          string  `json:"id"`
	Name                        string  `json:"name"`
	Currency                    string  `json:"currency"`
	Broker                      *string `json:"broker"`
	SnaptradeConnectionID       *string `json:"snaptradeConnectionId"`
	SnaptradeConnectionDisabled bool    `json:"snaptradeConnectionDisabled"`
	BrokerageSetupComplete      bool    `json:"brokerageSetupComplete"`
}

type flowStatus struct {
	Enabled            bool    `json:"enabled"`
	SourceRevision     int     `json:"sourceRevision"`
	ProjectionRevision int     `json:"projectionRevision"`
	ImportState        string  `json:"importState"`
	LastError          *string `json:"lastError"`
}

type trade struct {
	LifecycleState string `json:"lifecycleState"`
	ReviewState    string `json:"reviewState"`
}

type journal struct {
	Status flowStatus `json:"journalFlowStatus"`
	Trades []trade    `json:"journalTradesV2"`
}

type syncOutcome struct {
	Status      string  `json:"status"`
	Error       *string `json:"error"`
	FinishedAt  *string `json:"finishedAt"`
	SucceededAt *string `json:"succeededAt"`
}

type api struct {
	client *graphql.Client
}

func (a api) workspaces(ctx context.Context, token string) ([]workspace, error) {
	var data struct {
		Workspaces []workspace `json:"workspaces"`
	}
	err := a.client.Do(ctx, token, workspacesQuery, nil, &data)
	return data.Workspaces, err
}

func (a api) journal(ctx context.Context, token, ws string) (journal, error) {
	var data journal
	err := a.client.Do(ctx, token, journalQuery, map[string]any{"workspaceId": ws}, &data)
	return data, err
}

func (a api) lastSync(ctx context.Context, token, ws string) (*syncOutcome, error) {
	var data struct {
		Outcome *syncOutcome `json:"brokerageSyncOutcome"`
	}
	err := a.client.Do(ctx, token, syncQuery, map[string]any{"workspaceId": ws}, &data)
	return data.Outcome, err
}
