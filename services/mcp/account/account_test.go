package account_test

import (
	"strings"
	"testing"

	"github.com/Johnson-f/Tradstry-v2-/services/mcp/account"
	"github.com/Johnson-f/Tradstry-v2-/services/mcp/mcptest"
)

func TestGetAccountActsWithTheCallersOwnToken(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string {
		return `{"data":{"me":{"stytchUserId":"user-test-123","email":"ada@example.com","fullName":"Ada Trader"}}}`
	})
	token := s.Signer.AccessToken(t)
	session := s.Connect(t, token)

	result, got := mcptest.Call[account.Account](t, session, "get_account", map[string]any{})
	if result.IsError {
		t.Fatalf("tool error: %s", mcptest.Text(result))
	}
	if got.StytchUserID != "user-test-123" || got.Email == nil || *got.Email != "ada@example.com" {
		t.Errorf("account = %+v", got)
	}

	requests := s.Requests()
	if len(requests) != 1 {
		t.Fatalf("API requests = %d, want 1", len(requests))
	}
	if requests[0].Authorization != "Bearer "+token {
		t.Error("the tool did not forward the caller's access token")
	}
}

func TestGetAccountExplainsAMissingAccount(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string {
		return `{"data":null,"errors":[{"message":"no account","extensions":{"code":"ACCOUNT_REQUIRED"}}]}`
	})
	session := s.Connect(t, s.Signer.AccessToken(t))

	result, _ := mcptest.Call[account.Account](t, session, "get_account", map[string]any{})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "Sign up at tradstry.com") {
		t.Errorf("result = %+v", result)
	}
}
