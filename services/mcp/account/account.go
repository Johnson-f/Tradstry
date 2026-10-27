// Package account exposes who the connected user is.
package account

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Johnson-f/Tradstry-v2-/services/mcp/graphql"
	"github.com/Johnson-f/Tradstry-v2-/services/mcp/oauth"
)

const meQuery = `query Me { me { stytchUserId email fullName } }`

type Account struct {
	StytchUserID string  `json:"stytch_user_id"`
	Email        *string `json:"email"`
	FullName     *string `json:"full_name"`
}

func Register(server *mcp.Server, api *graphql.Client) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_account",
		Title:       "Get account",
		Description: "Returns the Tradstry account this app is connected to: its name and email.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, Account, error) {
		caller, err := oauth.CallerOf(req)
		if err != nil {
			return nil, Account{}, err
		}
		var data struct {
			Me struct {
				StytchUserID string  `json:"stytchUserId"`
				Email        *string `json:"email"`
				FullName     *string `json:"fullName"`
			} `json:"me"`
		}
		if err := api.Do(ctx, caller.Token, meQuery, nil, &data); err != nil {
			return nil, Account{}, graphql.ForUser(err)
		}
		return nil, Account(data.Me), nil
	})
}
