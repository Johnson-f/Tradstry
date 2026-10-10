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
	"time"
)

const (
	maxResponseBytes = 8 << 20
	defaultTimeout   = 30 * time.Second
)

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
	if err == nil {
		return nil
	}
	var apiErr *Error
	if errors.Is(err, ErrAccountRequired) || errors.Is(err, ErrUnauthorized) || errors.As(err, &apiErr) {
		return err
	}
	slog.Error("Tradstry API call failed", "error", err)
	return ErrUnavailable
}

type Client struct {
	base string
	url  string
	http *http.Client
}

func NewClient(apiURL string, httpClient *http.Client) *Client {
	return &Client{base: apiURL, url: apiURL + "/graphql", http: httpClient}
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

// Do runs a GraphQL operation as the user who owns token and decodes its data
// into out. Calls without a deadline on ctx get a 30-second one; slow operations
// such as a brokerage sync set their own.
func (c *Client) Do(ctx context.Context, token, query string, variables map[string]any, out any) error {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultTimeout)
		defer cancel()
	}
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

// ErrTooLarge is returned by Get when the body exceeds the caller's limit.
var ErrTooLarge = errors.New("the file is too large to show here")

// ErrNotFound is returned by Get when the Tradstry API has nothing at path.
var ErrNotFound = errors.New("not found")

// Get fetches a REST resource such as notebook media as the user who owns token.
// It returns the body and its content type, or ErrTooLarge past limit bytes.
func (c *Client) Get(ctx context.Context, token, path string, limit int64) ([]byte, string, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultTimeout)
		defer cancel()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("reach Tradstry API: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return nil, "", ErrUnauthorized
	case resp.StatusCode == http.StatusForbidden:
		return nil, "", ErrAccountRequired
	case resp.StatusCode == http.StatusNotFound:
		return nil, "", ErrNotFound
	case resp.StatusCode != http.StatusOK:
		return nil, "", fmt.Errorf("Tradstry API returned HTTP %d for %s", resp.StatusCode, path)
	}
	if resp.ContentLength > limit {
		return nil, "", ErrTooLarge
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, "", fmt.Errorf("read %s: %w", path, err)
	}
	if int64(len(body)) > limit {
		return nil, "", ErrTooLarge
	}
	return body, resp.Header.Get("Content-Type"), nil
}
