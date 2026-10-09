package graphql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

const maxResponseBytes = 8 << 20

var (
	ErrAccountRequired = errors.New("no Tradstry account exists for this login. Sign up at tradstry.com, then try again")
	ErrUnauthorized    = errors.New("the Tradstry API rejected the login. Reconnect Tradstry in this app and try again")
	ErrUnavailable     = errors.New("Tradstry is unavailable right now. Try again shortly")
)

// Error is a non-auth error reported by the Tradstry API, such as a failed validation.
type Error struct {
	Messages []string
}

func (e *Error) Error() string {
	return "Tradstry: " + strings.Join(e.Messages, "; ")
}

// ForUser returns err when the user can act on it. Anything else is logged and
// replaced with ErrUnavailable so transport details stay out of the conversation.
func ForUser(err error) error {
	var apiErr *Error
	if errors.Is(err, ErrAccountRequired) || errors.Is(err, ErrUnauthorized) || errors.As(err, &apiErr) {
		return err
	}
	slog.Error("Tradstry API call failed", "error", err)
	return ErrUnavailable
}

type Client struct {
	url  string
	http *http.Client
}

func NewClient(apiURL string, httpClient *http.Client) *Client {
	return &Client{url: apiURL + "/graphql", http: httpClient}
}

type response struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message    string `json:"message"`
		Extensions struct {
			Code string `json:"code"`
		} `json:"extensions"`
	} `json:"errors"`
}

// Do runs a GraphQL operation as the user who owns token and decodes its data into out.
func (c *Client) Do(ctx context.Context, token, query string, variables map[string]any, out any) error {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("reach Tradstry API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return ErrUnauthorized
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Tradstry API returned HTTP %d", resp.StatusCode)
	}

	var decoded response
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(&decoded); err != nil {
		return fmt.Errorf("decode Tradstry API response: %w", err)
	}
	if len(decoded.Errors) > 0 {
		apiErr := &Error{}
		for _, e := range decoded.Errors {
			if e.Extensions.Code == "ACCOUNT_REQUIRED" {
				return ErrAccountRequired
			}
			apiErr.Messages = append(apiErr.Messages, e.Message)
		}
		return apiErr
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(decoded.Data, out)
}
