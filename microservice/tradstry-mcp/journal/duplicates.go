package journal

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/oauth"
)

type duplicateAnswer string

type resolveDuplicateInput struct {
	WorkspaceID       string          `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID           string          `json:"trade_id" jsonschema:"the manual trade waiting as a possible duplicate"`
	Answer            duplicateAnswer `json:"answer" jsonschema:"same: it is the broker trade, so merge them; separate: it is a different trade, so count both"`
	BrokerTradeID     string          `json:"broker_trade_id,omitempty" jsonschema:"for same, which broker trade it repeats; needed only when it may repeat more than one"`
	ConfirmationToken string          `json:"confirmation_token,omitempty" jsonschema:"for separate, only after the user agreed to the question in needs_confirmation"`
}

type resolveDuplicateOutput struct {
	Status            string         `json:"status" jsonschema:"preview (same: confirm it with confirm_grouping_change), kept_separate, needs_confirmation or cancelled"`
	Message           string         `json:"message"`
	Preview           *previewOutput `json:"preview,omitempty"`
	Trade             *tradeView     `json:"trade,omitempty"`
	ConfirmationToken string         `json:"confirmation_token,omitempty"`
}

func (t *tools) resolveDuplicate(ctx context.Context, req *mcp.CallToolRequest, in resolveDuplicateInput) (*mcp.CallToolResult, resolveDuplicateOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, resolveDuplicateOutput{}, err
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, resolveDuplicateOutput{}, err
	}
	d, err := t.api.detail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	if err != nil {
		return nil, resolveDuplicateOutput{}, forUser(err)
	}
	if d.Trade == nil {
		return nil, resolveDuplicateOutput{}, errors.New("trade not found; call list_trades for valid IDs")
	}
	held := *d.Trade
	if str(held.IssueCode) != "possible_duplicate" || len(held.PossibleDuplicates) == 0 {
		return nil, resolveDuplicateOutput{}, errors.New("this trade is not waiting for a duplicate check")
	}

	switch in.Answer {
	case "same":
		broker := in.BrokerTradeID
		if broker == "" && len(held.PossibleDuplicates) == 1 {
			broker = held.PossibleDuplicates[0]
		}
		if !slices.Contains(held.PossibleDuplicates, broker) {
			return nil, resolveDuplicateOutput{}, fmt.Errorf("say which broker trade it repeats: broker_trade_id must be one of %v", held.PossibleDuplicates)
		}
		// The manual trade keeps its identity, so its notes, tags and context stay,
		// while the broker's executions supply the results.
		_, preview, err := t.previewWith(ctx, req, in.WorkspaceID, func(token string) (groupingPreview, error) {
			allocations, err := t.wholeTrades(ctx, token, in.WorkspaceID, []string{broker})
			if err != nil {
				return groupingPreview{}, err
			}
			p, err := t.api.previewGrouping(ctx, token, in.WorkspaceID, map[string]any{
				"entryIds": []string{broker, held.ID},
				"groups":   []map[string]any{{"entryId": held.ID, "allocations": allocations}},
			})
			return p, forUser(err)
		})
		if err != nil {
			return nil, resolveDuplicateOutput{}, err
		}
		return nil, resolveDuplicateOutput{
			Status:  "preview",
			Message: "Nothing has changed yet. Show the user this merge; the trade keeps their notes and takes the broker's results. Only if they approve, call confirm_grouping_change with this preview_id.",
			Preview: &preview,
		}, nil

	case "separate":
		outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
			Tool:   "resolve_possible_duplicate",
			Target: held.ID,
			Question: fmt.Sprintf("Keep the manual %s trade closed %s as a separate trade? It will count in every total alongside the broker trade it overlaps. "+
				"Only confirm if you really made both trades.", held.Symbol, str(held.CloseDate)),
		}, in.ConfirmationToken)
		if err != nil {
			return nil, resolveDuplicateOutput{}, err
		}
		if !outcome.Approved {
			status := "cancelled"
			if outcome.Token != "" {
				status = "needs_confirmation"
			}
			return outcome.Ask, resolveDuplicateOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
		}
		kept, err := t.api.keepSeparate(ctx, caller.Token, in.WorkspaceID, held)
		if err != nil {
			if isConflict(err) {
				return nil, resolveDuplicateOutput{}, errors.New("the trade changed on another device; check it with get_trade and ask again")
			}
			return nil, resolveDuplicateOutput{}, forUser(err)
		}
		view := toView(kept)
		return nil, resolveDuplicateOutput{Status: "kept_separate", Message: "Kept as a separate trade. It now counts in every total.", Trade: &view}, nil
	}
	return nil, resolveDuplicateOutput{}, errors.New(`answer must be "same" or "separate"`)
}
