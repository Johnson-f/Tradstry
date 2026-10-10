package brokerage

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"workspaceQuery":        workspaceQuery,
		"initiateMutation":      initiateMutation,
		"completeMutation":      completeMutation,
		"accountsQuery":         accountsQuery,
		"finalizeMutation":      finalizeMutation,
		"syncMutation":          syncMutation,
		"outcomeQuery":          outcomeQuery,
		"disconnectMutation":    disconnectMutation,
		"initiateOAuthMutation": initiateOAuthMutation,
		"oauthStatusQuery":      oauthStatusQuery,
		"oauthAccountsQuery":    oauthAccountsQuery,
		"finalizeOAuthMutation": finalizeOAuthMutation,
		"reauthorizeMutation":   reauthorizeMutation,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
