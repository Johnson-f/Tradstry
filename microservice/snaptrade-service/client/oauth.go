package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"snaptrade-service/contract"
)

const oauthMetadataURL = "https://api.snaptrade.com/.well-known/oauth-authorization-server"

type oauthMetadata struct {
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	RevocationEndpoint    string `json:"revocation_endpoint"`
}

type oauthTokenPayload struct {
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	ExpiresIn    int64           `json:"expires_in"`
	Scope        json.RawMessage `json:"scope"`
	Sub          json.RawMessage `json:"sub"`
}

func (c *SnapTradeClient) BeginOAuth(state, challenge, redirectURI string, scopes []string) (string, contract.ResponseMeta, error) {
	metadata, meta, err := c.oauthMetadata()
	if err != nil {
		return "", meta, err
	}
	if err := c.requireOAuthConfig(); err != nil {
		return "", meta, err
	}
	authorizationURL, err := url.Parse(metadata.AuthorizationEndpoint)
	if err != nil {
		return "", meta, fmt.Errorf("invalid OAuth authorization endpoint")
	}
	query := authorizationURL.Query()
	query.Set("response_type", "code")
	query.Set("client_id", c.oauthClientID)
	query.Set("redirect_uri", redirectURI)
	query.Set("scope", strings.Join(scopes, " "))
	query.Set("state", state)
	query.Set("code_challenge", challenge)
	query.Set("code_challenge_method", "S256")
	authorizationURL.RawQuery = query.Encode()
	return authorizationURL.String(), meta, nil
}

func (c *SnapTradeClient) ExchangeOAuthCode(code, verifier, redirectURI string) (contract.OAuthTokens, contract.ResponseMeta, error) {
	metadata, meta, err := c.oauthMetadata()
	if err != nil {
		return contract.OAuthTokens{}, meta, err
	}
	return c.oauthToken(metadata.TokenEndpoint, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"code_verifier": {verifier},
		"redirect_uri":  {redirectURI},
	})
}

func (c *SnapTradeClient) RefreshOAuthToken(refreshToken string) (contract.OAuthTokens, contract.ResponseMeta, error) {
	metadata, meta, err := c.oauthMetadata()
	if err != nil {
		return contract.OAuthTokens{}, meta, err
	}
	return c.oauthToken(metadata.TokenEndpoint, url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	})
}

func (c *SnapTradeClient) RevokeOAuthToken(token string) (contract.ResponseMeta, error) {
	metadata, meta, err := c.oauthMetadata()
	if err != nil {
		return meta, err
	}
	if err := c.requireOAuthConfig(); err != nil {
		return meta, err
	}
	request, err := http.NewRequest(http.MethodPost, metadata.RevocationEndpoint, strings.NewReader(url.Values{
		"token":           {token},
		"token_type_hint": {"refresh_token"},
	}.Encode()))
	if err != nil {
		return meta, fmt.Errorf("build OAuth revocation request: %w", err)
	}
	request.SetBasicAuth(c.oauthClientID, c.oauthClientSecret)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return meta, fmt.Errorf("OAuth revocation request failed")
	}
	defer response.Body.Close()
	meta = ResponseMeta(response)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return meta, NewSnapTradeAPIError(response, body, fmt.Errorf("OAuth revocation failed"))
	}
	return meta, nil
}

func (c *SnapTradeClient) oauthMetadata() (oauthMetadata, contract.ResponseMeta, error) {
	request, err := http.NewRequest(http.MethodGet, c.oauthMetadataURL, nil)
	if err != nil {
		return oauthMetadata{}, contract.ResponseMeta{}, err
	}
	request.Header.Set("Accept", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return oauthMetadata{}, contract.ResponseMeta{}, fmt.Errorf("OAuth discovery failed")
	}
	defer response.Body.Close()
	meta := ResponseMeta(response)
	if response.StatusCode != http.StatusOK {
		return oauthMetadata{}, meta, fmt.Errorf("OAuth discovery failed with status %d", response.StatusCode)
	}
	var value oauthMetadata
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&value); err != nil {
		return oauthMetadata{}, meta, fmt.Errorf("decode OAuth discovery: %w", err)
	}
	if value.AuthorizationEndpoint == "" || value.TokenEndpoint == "" || value.RevocationEndpoint == "" {
		return oauthMetadata{}, meta, fmt.Errorf("OAuth discovery omitted required endpoints")
	}
	return value, meta, nil
}

func (c *SnapTradeClient) oauthToken(endpoint string, form url.Values) (contract.OAuthTokens, contract.ResponseMeta, error) {
	if err := c.requireOAuthConfig(); err != nil {
		return contract.OAuthTokens{}, contract.ResponseMeta{}, err
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return contract.OAuthTokens{}, contract.ResponseMeta{}, fmt.Errorf("build OAuth token request: %w", err)
	}
	request.SetBasicAuth(c.oauthClientID, c.oauthClientSecret)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return contract.OAuthTokens{}, contract.ResponseMeta{}, fmt.Errorf("OAuth token request failed")
	}
	defer response.Body.Close()
	meta := ResponseMeta(response)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return contract.OAuthTokens{}, meta, NewSnapTradeAPIError(response, body, fmt.Errorf("OAuth token request failed"))
	}
	var payload oauthTokenPayload
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return contract.OAuthTokens{}, meta, fmt.Errorf("decode OAuth token response: %w", err)
	}
	if payload.AccessToken == "" || payload.RefreshToken == "" || payload.ExpiresIn <= 0 {
		return contract.OAuthTokens{}, meta, fmt.Errorf("OAuth token response omitted required fields")
	}
	return contract.OAuthTokens{
		AccessToken:     payload.AccessToken,
		RefreshToken:    payload.RefreshToken,
		ExpiresIn:       payload.ExpiresIn,
		Scopes:          parseOAuthScopes(payload.Scope),
		OAuthClientID:   c.oauthClientID,
		SnapTradeUserID: parseOAuthSubject(payload.Sub),
	}, meta, nil
}

func (c *SnapTradeClient) requireOAuthConfig() error {
	if c.oauthClientID == "" || c.oauthClientSecret == "" {
		return fmt.Errorf("SnapTrade OAuth is not configured")
	}
	return nil
}

func parseOAuthScopes(raw json.RawMessage) []string {
	var value string
	if json.Unmarshal(raw, &value) == nil {
		return strings.Fields(value)
	}
	var values []string
	_ = json.Unmarshal(raw, &values)
	return values
}

func parseOAuthSubject(raw json.RawMessage) string {
	var object map[string]any
	if json.Unmarshal(raw, &object) == nil {
		for _, key := range []string{"snaptrade_user_id", "snaptradeUserId", "user_id", "userId"} {
			if value, ok := object[key].(string); ok {
				return value
			}
		}
	}
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}
