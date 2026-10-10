package brokerage

import (
	"context"

	"tradstry-mcp/graphql"
)

type workspace struct {
	ID                          string  `json:"id"`
	Name                        string  `json:"name"`
	Broker                      *string `json:"broker"`
	SnaptradeConnectionID       *string `json:"snaptradeConnectionId"`
	SnaptradeConnectionDisabled bool    `json:"snaptradeConnectionDisabled"`
	BrokerageSetupComplete      bool    `json:"brokerageSetupComplete"`
	SnaptradeAuthMode           string  `json:"snaptradeAuthMode"`
}

type account struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	InstitutionName     *string `json:"institutionName"`
	LinkedWorkspaceID   *string `json:"linkedWorkspaceId"`
	LinkedWorkspaceName *string `json:"linkedWorkspaceName"`
	Current             bool    `json:"current"`
}

type syncResult struct {
	Status             string `json:"status"`
	TransactionsSynced int    `json:"transactionsSynced"`
	HoldingsSynced     int    `json:"holdingsSynced"`
	BalancesSynced     int    `json:"balancesSynced"`
}

type syncOutcome struct {
	Status             string  `json:"status"`
	Error              *string `json:"error"`
	StartedAt          *string `json:"startedAt"`
	FinishedAt         *string `json:"finishedAt"`
	SucceededAt        *string `json:"succeededAt"`
	NextScheduledAt    *string `json:"nextScheduledAt"`
	TransactionsSynced int     `json:"transactionsSynced"`
	HoldingsSynced     int     `json:"holdingsSynced"`
	BalancesSynced     int     `json:"balancesSynced"`
}

const (
	workspaceQuery = `query Workspace($id: String!) {
  workspace(id: $id) { id name broker snaptradeConnectionId snaptradeConnectionDisabled brokerageSetupComplete snaptradeAuthMode }
}`
	initiateMutation = `mutation InitiateBrokerageConnection($workspaceId: String!, $customRedirect: String, $reconnect: Boolean) {
  initiateBrokerageConnection(workspaceId: $workspaceId, customRedirect: $customRedirect, reconnect: $reconnect) { redirectUrl }
}`
	completeMutation = `mutation CompleteBrokerageConnection($workspaceId: String!, $connectionId: String!) {
  completeBrokerageConnection(workspaceId: $workspaceId, connectionId: $connectionId)
}`
	accountsQuery = `query BrokerageConnectionAccounts($workspaceId: String!) {
  brokerageConnectionAccounts(workspaceId: $workspaceId) { id name institutionName linkedWorkspaceId linkedWorkspaceName current }
}`
	finalizeMutation = `mutation FinalizeBrokerageSetup($input: FinalizeBrokerageSetupInput!) {
  finalizeBrokerageSetup(input: $input) { id name }
}`
	syncMutation = `mutation SyncBrokerageData($workspaceId: String!) {
  syncBrokerageData(workspaceId: $workspaceId) { status transactionsSynced holdingsSynced balancesSynced }
}`
	outcomeQuery = `query BrokerageSyncOutcome($workspaceId: String!) {
  brokerageSyncOutcome(workspaceId: $workspaceId) { status error startedAt finishedAt succeededAt nextScheduledAt transactionsSynced holdingsSynced balancesSynced }
}`
	disconnectMutation = `mutation DisconnectBrokerage($workspaceId: String!) {
  disconnectBrokerage(workspaceId: $workspaceId)
}`
	initiateOAuthMutation = `mutation InitiateSnaptradeOauth($workspaceId: String!, $platform: String!) {
  initiateSnaptradeOauth(workspaceId: $workspaceId, platform: $platform) { attemptId authorizationUrl }
}`
	oauthStatusQuery = `query SnaptradeOauthStatus($attemptId: String!) {
  snaptradeOauthStatus(attemptId: $attemptId) { status errorCode intent }
}`
	oauthAccountsQuery = `query SnaptradeOauthAccounts($attemptId: String!) {
  snaptradeOauthAccounts(attemptId: $attemptId) { id name institutionName linkedWorkspaceId linkedWorkspaceName current }
}`
	finalizeOAuthMutation = `mutation FinalizeSnaptradeOauthSetup($attemptId: String!, $input: FinalizeBrokerageSetupInput!) {
  finalizeSnaptradeOauthSetup(attemptId: $attemptId, input: $input) { id name }
}`
	reauthorizeMutation = `mutation CompleteSnaptradeOauthReauthorization($attemptId: String!) {
  completeSnaptradeOauthReauthorization(attemptId: $attemptId) { id }
}`
)

type api struct {
	client *graphql.Client
}

func (a api) workspace(ctx context.Context, token, id string) (*workspace, error) {
	var data struct {
		Workspace *workspace `json:"workspace"`
	}
	err := a.client.Do(ctx, token, workspaceQuery, map[string]any{"id": id}, &data)
	return data.Workspace, err
}

func (a api) initiate(ctx context.Context, token, workspaceID, redirect string, reconnect bool) (string, error) {
	var data struct {
		InitiateBrokerageConnection struct {
			RedirectURL string `json:"redirectUrl"`
		} `json:"initiateBrokerageConnection"`
	}
	err := a.client.Do(ctx, token, initiateMutation, map[string]any{
		"workspaceId": workspaceID, "customRedirect": redirect, "reconnect": reconnect,
	}, &data)
	return data.InitiateBrokerageConnection.RedirectURL, err
}

func (a api) complete(ctx context.Context, token, workspaceID, connectionID string) error {
	return a.client.Do(ctx, token, completeMutation, map[string]any{
		"workspaceId": workspaceID, "connectionId": connectionID,
	}, nil)
}

func (a api) accounts(ctx context.Context, token, workspaceID string) ([]account, error) {
	var data struct {
		Accounts []account `json:"brokerageConnectionAccounts"`
	}
	err := a.client.Do(ctx, token, accountsQuery, map[string]any{"workspaceId": workspaceID}, &data)
	return data.Accounts, err
}

type configured struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (a api) finalize(ctx context.Context, token string, input map[string]any) ([]configured, error) {
	var data struct {
		Configured []configured `json:"finalizeBrokerageSetup"`
	}
	err := a.client.Do(ctx, token, finalizeMutation, map[string]any{"input": input}, &data)
	return data.Configured, err
}

func (a api) sync(ctx context.Context, token, workspaceID string) (syncResult, error) {
	var data struct {
		Sync syncResult `json:"syncBrokerageData"`
	}
	err := a.client.Do(ctx, token, syncMutation, map[string]any{"workspaceId": workspaceID}, &data)
	return data.Sync, err
}

func (a api) outcome(ctx context.Context, token, workspaceID string) (*syncOutcome, error) {
	var data struct {
		Outcome *syncOutcome `json:"brokerageSyncOutcome"`
	}
	err := a.client.Do(ctx, token, outcomeQuery, map[string]any{"workspaceId": workspaceID}, &data)
	return data.Outcome, err
}

func (a api) disconnect(ctx context.Context, token, workspaceID string) error {
	return a.client.Do(ctx, token, disconnectMutation, map[string]any{"workspaceId": workspaceID}, nil)
}

type oauthStart struct {
	AttemptID        string `json:"attemptId"`
	AuthorizationURL string `json:"authorizationUrl"`
}

type oauthStatus struct {
	Status    string  `json:"status"`
	ErrorCode *string `json:"errorCode"`
	Intent    string  `json:"intent"`
}

func (a api) initiateOAuth(ctx context.Context, token, workspaceID string) (oauthStart, error) {
	var data struct {
		Start oauthStart `json:"initiateSnaptradeOauth"`
	}
	err := a.client.Do(ctx, token, initiateOAuthMutation, map[string]any{"workspaceId": workspaceID, "platform": "mcp"}, &data)
	return data.Start, err
}

func (a api) oauthStatus(ctx context.Context, token, attemptID string) (*oauthStatus, error) {
	var data struct {
		Status *oauthStatus `json:"snaptradeOauthStatus"`
	}
	err := a.client.Do(ctx, token, oauthStatusQuery, map[string]any{"attemptId": attemptID}, &data)
	return data.Status, err
}

func (a api) oauthAccounts(ctx context.Context, token, attemptID string) ([]account, error) {
	var data struct {
		Accounts []account `json:"snaptradeOauthAccounts"`
	}
	err := a.client.Do(ctx, token, oauthAccountsQuery, map[string]any{"attemptId": attemptID}, &data)
	return data.Accounts, err
}

func (a api) finalizeOAuth(ctx context.Context, token, attemptID string, input map[string]any) ([]configured, error) {
	var data struct {
		Configured []configured `json:"finalizeSnaptradeOauthSetup"`
	}
	err := a.client.Do(ctx, token, finalizeOAuthMutation, map[string]any{"attemptId": attemptID, "input": input}, &data)
	return data.Configured, err
}

func (a api) reauthorize(ctx context.Context, token, attemptID string) error {
	return a.client.Do(ctx, token, reauthorizeMutation, map[string]any{"attemptId": attemptID}, nil)
}
