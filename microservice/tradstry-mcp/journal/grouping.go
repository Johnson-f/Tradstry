package journal

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
)

// The backend's preview tokens expire after ten minutes.
const previewTTL = 10 * time.Minute

type direction string

// preview remembers what a preview showed, so the confirmation can describe the
// exact change the user is approving.
type preview struct {
	subject   string
	workspace string
	summary   string
	created   time.Time
}

type previews struct {
	mu      sync.Mutex
	byToken map[string]preview
}

func (p *previews) remember(token string, value preview) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, old := range p.byToken {
		if time.Since(old.created) > previewTTL {
			delete(p.byToken, key)
		}
	}
	p.byToken[token] = value
}

func (p *previews) take(token, subject, workspace string) (preview, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	value, ok := p.byToken[token]
	if !ok || value.subject != subject || value.workspace != workspace || time.Since(value.created) > previewTTL {
		return preview{}, false
	}
	return value, true
}

func (p *previews) forget(token string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.byToken, token)
}

type suggestionsInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string `json:"trade_id,omitempty" jsonschema:"only suggestions for this trade"`
	Offset      int    `json:"offset,omitempty" jsonschema:"from next_offset, for more suggestions"`
}

type suggestionView struct {
	ID              string `json:"id"`
	TradeID         string `json:"trade_id"`
	Explanation     string `json:"explanation"`
	ConfirmedBefore int    `json:"confirmed_before" jsonschema:"how often the user accepted this kind of suggestion before"`
}

type suggestionsOutput struct {
	Suggestions []suggestionView `json:"suggestions"`
	NextOffset  int              `json:"next_offset,omitempty"`
}

type suggestionInput struct {
	WorkspaceID  string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	SuggestionID string `json:"suggestion_id" jsonschema:"ID from list_grouping_suggestions"`
}

type mergeInput struct {
	WorkspaceID string   `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeIDs    []string `json:"trade_ids" jsonschema:"two or more trades in the same instrument and direction; the first keeps its context, tags and notes, the others are retired into it"`
}

type directionInput struct {
	WorkspaceID string    `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string    `json:"trade_id" jsonschema:"an incomplete trade whose direction is unknown"`
	Direction   direction `json:"direction" jsonschema:"long or short, as the user says the position was"`
}

type groupView struct {
	Trade       string `json:"trade" jsonschema:"trade ID, or new for a trade the change would create"`
	Direction   string `json:"direction"`
	Quantity    string `json:"quantity"`
	StillOpen   string `json:"still_open,omitempty"`
	RealizedNet string `json:"realized_net,omitempty" jsonschema:"absent means unknown, not zero"`
	Fees        string `json:"fees,omitempty"`
	Executions  int    `json:"executions"`
	From        string `json:"from,omitempty"`
	To          string `json:"to,omitempty"`
}

type previewOutput struct {
	PreviewID string      `json:"preview_id" jsonschema:"pass to confirm_grouping_change after the user approves"`
	Before    []groupView `json:"before"`
	After     []groupView `json:"after"`
	Summary   string      `json:"summary"`
	Message   string      `json:"message"`
}

type confirmGroupingInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	PreviewID         string `json:"preview_id" jsonschema:"from a preview tool"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly approved the change"`
}

type confirmGroupingOutput struct {
	Status            string   `json:"status" jsonschema:"applied, needs_confirmation or cancelled"`
	Message           string   `json:"message"`
	TradeIDs          []string `json:"trade_ids,omitempty"`
	ConfirmationToken string   `json:"confirmation_token,omitempty"`
}

func (t *tools) listSuggestions(ctx context.Context, req *mcp.CallToolRequest, in suggestionsInput) (*mcp.CallToolResult, suggestionsOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, suggestionsOutput{}, err
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, suggestionsOutput{}, err
	}
	var entryID *string
	if in.TradeID != "" {
		entryID = &in.TradeID
	}
	found, err := t.api.suggestions(ctx, caller.Token, in.WorkspaceID, entryID, in.Offset)
	if err != nil {
		return nil, suggestionsOutput{}, forUser(err)
	}
	out := suggestionsOutput{Suggestions: []suggestionView{}}
	for _, s := range found {
		out.Suggestions = append(out.Suggestions, suggestionView{s.ID, s.EntryID, s.Explanation, s.PreviousConfirmations})
	}
	// The backend pages suggestions three at a time.
	if len(found) == 3 {
		out.NextOffset = in.Offset + 3
	}
	return nil, out, nil
}

func (t *tools) previewSuggestion(ctx context.Context, req *mcp.CallToolRequest, in suggestionInput) (*mcp.CallToolResult, previewOutput, error) {
	return t.previewWith(ctx, req, in.WorkspaceID, func(token string) (groupingPreview, error) {
		p, err := t.api.previewSuggestion(ctx, token, in.WorkspaceID, in.SuggestionID)
		return p, forUser(err)
	})
}

func (t *tools) previewMerge(ctx context.Context, req *mcp.CallToolRequest, in mergeInput) (*mcp.CallToolResult, previewOutput, error) {
	if len(in.TradeIDs) < 2 || len(slices.Compact(slices.Sorted(slices.Values(in.TradeIDs)))) != len(in.TradeIDs) {
		return nil, previewOutput{}, errors.New("give two or more different trades to merge")
	}
	return t.previewWith(ctx, req, in.WorkspaceID, func(token string) (groupingPreview, error) {
		allocations, err := t.wholeTrades(ctx, token, in.WorkspaceID, in.TradeIDs)
		if err != nil {
			return groupingPreview{}, err
		}
		p, err := t.api.previewGrouping(ctx, token, in.WorkspaceID, map[string]any{
			"entryIds": in.TradeIDs,
			"groups":   []map[string]any{{"entryId": in.TradeIDs[0], "allocations": allocations}},
		})
		return p, forUser(err)
	})
}

func (t *tools) previewDirection(ctx context.Context, req *mcp.CallToolRequest, in directionInput) (*mcp.CallToolResult, previewOutput, error) {
	return t.previewWith(ctx, req, in.WorkspaceID, func(token string) (groupingPreview, error) {
		allocations, err := t.wholeTrades(ctx, token, in.WorkspaceID, []string{in.TradeID})
		if err != nil {
			return groupingPreview{}, err
		}
		p, err := t.api.previewGrouping(ctx, token, in.WorkspaceID, map[string]any{
			"entryIds":  []string{in.TradeID},
			"groups":    []map[string]any{{"entryId": in.TradeID, "allocations": allocations}},
			"direction": string(in.Direction),
		})
		return p, forUser(err)
	})
}

func (t *tools) previewUndo(ctx context.Context, req *mcp.CallToolRequest, in tradeInput) (*mcp.CallToolResult, previewOutput, error) {
	return t.previewWith(ctx, req, in.WorkspaceID, func(token string) (groupingPreview, error) {
		history, err := t.api.history(ctx, token, in.WorkspaceID, in.TradeID)
		if err != nil {
			return groupingPreview{}, forUser(err)
		}
		// History is newest first, and only the latest applied change can be undone.
		i := slices.IndexFunc(history, func(op groupingOperation) bool { return op.State == "committed" })
		if i < 0 {
			return groupingPreview{}, errors.New("this trade has no grouping change to undo")
		}
		p, err := t.api.previewUndo(ctx, token, in.WorkspaceID, history[i].ID)
		return p, forUser(err)
	})
}

// wholeTrades lists every execution the trades hold, adding up an execution
// that is shared between them, so a regrouping keeps every quantity.
func (t *tools) wholeTrades(ctx context.Context, token, ws string, tradeIDs []string) ([]allocation, error) {
	var order []string
	totals := map[string]*big.Rat{}
	places := 0
	for _, id := range tradeIDs {
		held, err := t.api.executions(ctx, token, ws, id)
		if err != nil {
			return nil, forUser(err)
		}
		if len(held) == 0 {
			return nil, fmt.Errorf("trade %s has no broker executions to regroup", id)
		}
		for _, e := range held {
			quantity, ok := new(big.Rat).SetString(e.Quantity)
			if !ok {
				return nil, fmt.Errorf("unreadable quantity %q", e.Quantity)
			}
			if _, fraction, found := strings.Cut(e.Quantity, "."); found {
				places = max(places, len(fraction))
			}
			if totals[e.TransactionID] == nil {
				totals[e.TransactionID] = new(big.Rat)
				order = append(order, e.TransactionID)
			}
			totals[e.TransactionID].Add(totals[e.TransactionID], quantity)
		}
	}
	allocations := make([]allocation, 0, len(order))
	for _, id := range order {
		quantity := totals[id].FloatString(places)
		if strings.Contains(quantity, ".") {
			quantity = strings.TrimRight(strings.TrimRight(quantity, "0"), ".")
		}
		allocations = append(allocations, allocation{TransactionID: id, Quantity: quantity})
	}
	return allocations, nil
}

func (t *tools) previewWith(ctx context.Context, req *mcp.CallToolRequest, ws string, build func(token string) (groupingPreview, error)) (*mcp.CallToolResult, previewOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, previewOutput{}, err
	}
	if _, err := t.requireJournal(ctx, caller.Token, ws); err != nil {
		return nil, previewOutput{}, err
	}
	// build reports errors the user can read; the API's are already translated.
	p, err := build(caller.Token)
	if err != nil {
		return nil, previewOutput{}, err
	}
	symbol := ""
	if len(p.EntryIDs) > 0 {
		if d, err := t.api.detail(ctx, caller.Token, ws, p.EntryIDs[0]); err == nil && d.Trade != nil {
			symbol = d.Trade.Symbol + " "
		}
	}
	out := previewOutput{
		PreviewID: p.Token,
		Before:    groupViews(p.BeforeGroups, nil),
		After:     groupViews(p.Groups, p.EntryIDs),
		Message: "Nothing has changed yet. Show the user this before and after; only if they approve, call confirm_grouping_change. " +
			"The preview expires in 10 minutes.",
	}
	out.Summary = fmt.Sprintf("Before: %s. After: %s.", describe(symbol, out.Before), describe(symbol, out.After))
	t.previews.remember(p.Token, preview{subject: caller.Subject, workspace: ws, summary: out.Summary, created: time.Now()})
	return nil, out, nil
}

func groupViews(groups []previewGroup, existing []string) []groupView {
	views := make([]groupView, 0, len(groups))
	for _, g := range groups {
		view := groupView{
			Trade: g.EntryID, Direction: g.Direction, Quantity: g.EnteredQuantity,
			RealizedNet: str(g.RealizedNet), Fees: str(g.FeesPaid), Executions: len(g.Allocations),
		}
		if existing != nil && !slices.Contains(existing, g.EntryID) {
			view.Trade = "new"
		}
		if g.RemainingQuantity != "0" {
			view.StillOpen = g.RemainingQuantity
		}
		for _, a := range g.Allocations {
			if date := a.ExecutedAt; date != "" {
				if view.From == "" || date < view.From {
					view.From = date
				}
				if date > view.To {
					view.To = date
				}
			}
		}
		views = append(views, view)
	}
	return views
}

func describe(symbol string, groups []groupView) string {
	parts := make([]string, 0, len(groups))
	for _, g := range groups {
		result := "result unknown"
		if g.RealizedNet != "" {
			result = "realized " + g.RealizedNet
		}
		parts = append(parts, fmt.Sprintf("%s%s %s (%s)", symbol, g.Direction, g.Quantity, result))
	}
	noun := "trades"
	if len(groups) == 1 {
		noun = "trade"
	}
	return fmt.Sprintf("%d %s: %s", len(groups), noun, strings.Join(parts, "; "))
}

func (t *tools) confirmGrouping(ctx context.Context, req *mcp.CallToolRequest, in confirmGroupingInput) (*mcp.CallToolResult, confirmGroupingOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, confirmGroupingOutput{}, err
	}
	shown, ok := t.previews.take(in.PreviewID, caller.Subject, in.WorkspaceID)
	if !ok {
		return nil, confirmGroupingOutput{}, errors.New("that preview has expired or was already used; preview the change again")
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:     "confirm_grouping_change",
		Target:   in.PreviewID,
		Question: "Regroup these trades? " + shown.summary + " Reviews of the affected trades may need redoing. You can undo this until the next sync or grouping change.",
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmGroupingOutput{}, err
	}
	if !outcome.Approved {
		status := "cancelled"
		if outcome.Token != "" {
			status = "needs_confirmation"
		}
		return outcome.Ask, confirmGroupingOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
	}

	trades, err := t.api.confirmGrouping(ctx, caller.Token, in.WorkspaceID, in.PreviewID)
	if err != nil {
		if errors.Is(forUser(err), errStale) {
			t.previews.forget(in.PreviewID)
		}
		return nil, confirmGroupingOutput{}, forUser(err)
	}
	t.previews.forget(in.PreviewID)
	return nil, confirmGroupingOutput{Status: "applied", Message: "Regrouped. " + shown.summary, TradeIDs: trades}, nil
}

type dismissOutput struct {
	Message string `json:"message"`
}

func (t *tools) dismissSuggestion(ctx context.Context, req *mcp.CallToolRequest, in suggestionInput) (*mcp.CallToolResult, dismissOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, dismissOutput{}, err
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, dismissOutput{}, err
	}
	if err := t.api.dismissSuggestion(ctx, caller.Token, in.WorkspaceID, in.SuggestionID); err != nil {
		return nil, dismissOutput{}, forUser(err)
	}
	return nil, dismissOutput{Message: "Dismissed. Tradstry learns from this for future suggestions."}, nil
}
