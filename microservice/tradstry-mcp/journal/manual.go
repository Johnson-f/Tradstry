package journal

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
)

const (
	manualFields   = `id workspaceId symbol tradeType openDate closeDate entryPrice exitPrice positionSize contractMultiplier stopLoss fees status notes recordVersion possibleDuplicates`
	manualQuery    = `query ManualTrade($id: String!) { journalEntry(id: $id) { ` + manualFields + ` } }`
	createManual   = `mutation CreateManualTrade($input: CreateJournalEntryInput!) { createJournalEntry(input: $input) { ` + manualFields + ` } }`
	updateManual   = `mutation UpdateManualTrade($id: String!, $input: UpdateJournalEntryInput!) { updateJournalEntry(id: $id, input: $input) { ` + manualFields + ` } }`
	deleteManual   = `mutation DeleteManualTrade($id: String!) { deleteJournalEntry(id: $id) }`
	brokerReadOnly = "JOURNAL_V2_REQUIRED"
)

type manualTrade struct {
	ID                 string   `json:"id"`
	WorkspaceID        string   `json:"workspaceId"`
	Symbol             string   `json:"symbol"`
	TradeType          string   `json:"tradeType"`
	OpenDate           string   `json:"openDate"`
	CloseDate          string   `json:"closeDate"`
	EntryPrice         float64  `json:"entryPrice"`
	ExitPrice          float64  `json:"exitPrice"`
	PositionSize       float64  `json:"positionSize"`
	ContractMultiplier float64  `json:"contractMultiplier"`
	StopLoss           *float64 `json:"stopLoss"`
	Fees               *float64 `json:"fees"`
	Status             string   `json:"status"`
	Notes              *string  `json:"notes"`
	RecordVersion      int      `json:"recordVersion"`
	PossibleDuplicates []string `json:"possibleDuplicates"`
}

type manualView struct {
	ID                  string   `json:"id"`
	Symbol              string   `json:"symbol"`
	Direction           string   `json:"direction"`
	OpenedAt            string   `json:"opened_at"`
	ClosedAt            string   `json:"closed_at"`
	EntryPrice          float64  `json:"entry_price"`
	ExitPrice           float64  `json:"exit_price"`
	Quantity            float64  `json:"quantity"`
	ContractMultiplier  float64  `json:"contract_multiplier"`
	Stop                *float64 `json:"stop,omitempty"`
	Fees                *float64 `json:"fees,omitempty" jsonschema:"absent means not entered, so results are before fees"`
	Outcome             string   `json:"outcome" jsonschema:"profit or loss, after fees when they are entered"`
	Notes               string   `json:"notes,omitempty"`
	PossibleDuplicateOf []string `json:"possible_duplicate_of,omitempty" jsonschema:"broker trades it may repeat; it is not counted until the user answers through resolve_possible_duplicate"`
}

func (m manualTrade) view() manualView {
	return manualView{
		ID: m.ID, Symbol: m.Symbol, Direction: m.TradeType, OpenedAt: m.OpenDate, ClosedAt: m.CloseDate,
		EntryPrice: m.EntryPrice, ExitPrice: m.ExitPrice, Quantity: m.PositionSize, ContractMultiplier: m.ContractMultiplier,
		Stop: m.StopLoss, Fees: m.Fees, Outcome: m.Status, Notes: str(m.Notes), PossibleDuplicateOf: m.PossibleDuplicates,
	}
}

type addManualInput struct {
	WorkspaceID        string    `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Symbol             string    `json:"symbol" jsonschema:"ticker; for options, the underlying"`
	Direction          direction `json:"direction"`
	OpenedAt           string    `json:"opened_at" jsonschema:"RFC 3339 with the UTC offset, such as 2026-09-01T09:35:00-04:00"`
	ClosedAt           string    `json:"closed_at" jsonschema:"RFC 3339 with the UTC offset"`
	EntryPrice         float64   `json:"entry_price" jsonschema:"average price paid or received per share or contract when opening"`
	ExitPrice          float64   `json:"exit_price" jsonschema:"average price per share or contract when closing"`
	Quantity           float64   `json:"quantity" jsonschema:"shares, or contracts for options"`
	ContractMultiplier float64   `json:"contract_multiplier,omitempty" jsonschema:"options only, usually 100; leave out for shares"`
	Stop               *float64  `json:"stop,omitempty" jsonschema:"the stop in place when the trade opened, if the user had one"`
	Fees               *float64  `json:"fees,omitempty" jsonschema:"total fees and commissions; leave out when the user does not know them, and 0 only when there were none"`
	Notes              string    `json:"notes,omitempty" jsonschema:"the user's own words about the trade"`
}

type manualOutput struct {
	Message string     `json:"message"`
	Trade   manualView `json:"trade"`
}

func parseTime(name, value string) (time.Time, error) {
	at, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be RFC 3339 with the UTC offset, such as 2026-09-01T09:35:00-04:00", name)
	}
	return at, nil
}

// tradeID names one trade the user described, so a retried call returns the
// trade it already made instead of adding another.
func tradeID(parts ...any) string {
	raw, _ := json.Marshal(parts)
	b := sha256.Sum256(raw)
	b[6] = b[6]&0x0f | 0x80
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func manualMessage(m manualTrade, verb string) string {
	if len(m.PossibleDuplicates) > 0 {
		return verb + " It overlaps a trade imported from the broker, so it is left out of every total until the user says whether it is the same trade; ask them, then use resolve_possible_duplicate."
	}
	if m.Fees == nil {
		return verb + " No fees were entered, so its result is before fees."
	}
	return verb
}

func (t *tools) addManual(ctx context.Context, req *mcp.CallToolRequest, in addManualInput) (*mcp.CallToolResult, manualOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, manualOutput{}, err
	}
	opened, err := parseTime("opened_at", in.OpenedAt)
	if err != nil {
		return nil, manualOutput{}, err
	}
	closed, err := parseTime("closed_at", in.ClosedAt)
	if err != nil {
		return nil, manualOutput{}, err
	}
	if closed.Before(opened) {
		return nil, manualOutput{}, errors.New("closed_at is before opened_at")
	}
	symbol := strings.ToUpper(strings.TrimSpace(in.Symbol))
	input := map[string]any{
		"workspaceId": in.WorkspaceID, "symbol": symbol, "tradeType": string(in.Direction),
		"openDate": opened.UTC().Format(time.RFC3339), "closeDate": closed.UTC().Format(time.RFC3339),
		"entryPrice": in.EntryPrice, "exitPrice": in.ExitPrice, "positionSize": in.Quantity, "stopLoss": 0.0,
	}
	if in.Stop != nil {
		input["stopLoss"] = *in.Stop
	}
	if in.Fees != nil {
		input["fees"] = *in.Fees
	}
	if in.ContractMultiplier > 0 {
		input["contractMultiplier"] = in.ContractMultiplier
	}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		input["notes"] = notes
	}
	input["id"] = tradeID("add_manual_trade", input)

	created, err := t.api.createManual(ctx, caller.Token, input)
	if err != nil {
		return nil, manualOutput{}, graphql.ForUser(err)
	}
	return nil, manualOutput{Message: manualMessage(created, "Recorded."), Trade: created.view()}, nil
}

type updateManualInput struct {
	WorkspaceID string     `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string     `json:"trade_id" jsonschema:"a manual trade's ID"`
	Symbol      string     `json:"symbol,omitempty" jsonschema:"corrected ticker"`
	Direction   *direction `json:"direction,omitempty"`
	OpenedAt    string     `json:"opened_at,omitempty" jsonschema:"RFC 3339 with the UTC offset"`
	ClosedAt    string     `json:"closed_at,omitempty" jsonschema:"RFC 3339 with the UTC offset"`
	EntryPrice  *float64   `json:"entry_price,omitempty" jsonschema:"corrected price per share or contract when opening"`
	ExitPrice   *float64   `json:"exit_price,omitempty" jsonschema:"corrected price per share or contract when closing"`
	Quantity    *float64   `json:"quantity,omitempty" jsonschema:"corrected shares, or contracts for options"`
	Stop        *float64   `json:"stop,omitempty" jsonschema:"0 removes the stop"`
	Fees        *float64   `json:"fees,omitempty" jsonschema:"corrected total fees and commissions; 0 only when there were none"`
	FeesUnknown bool       `json:"fees_unknown,omitempty" jsonschema:"true when the user says the fees entered are wrong and unknown"`
	Notes       *string    `json:"notes,omitempty" jsonschema:"replaces the notes; an empty string removes them"`
}

func (a api) manual(ctx context.Context, token, id string) (*manualTrade, error) {
	var data struct {
		Trade *manualTrade `json:"journalEntry"`
	}
	err := a.client.Do(ctx, token, manualQuery, map[string]any{"id": id}, &data)
	return data.Trade, err
}

func (a api) createManual(ctx context.Context, token string, input map[string]any) (manualTrade, error) {
	var data struct {
		Trade manualTrade `json:"createJournalEntry"`
	}
	err := a.client.Do(ctx, token, createManual, map[string]any{"input": input}, &data)
	return data.Trade, err
}

func (a api) updateManual(ctx context.Context, token, id string, input map[string]any) (manualTrade, error) {
	var data struct {
		Trade manualTrade `json:"updateJournalEntry"`
	}
	err := a.client.Do(ctx, token, updateManual, map[string]any{"id": id, "input": input}, &data)
	return data.Trade, err
}

func (a api) deleteManual(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deleteManual, map[string]any{"id": id}, nil)
}

func (t *tools) readManual(ctx context.Context, token, ws, id string) (manualTrade, error) {
	trade, err := t.api.manual(ctx, token, id)
	if err != nil {
		return manualTrade{}, graphql.ForUser(err)
	}
	if trade == nil || trade.WorkspaceID != ws {
		return manualTrade{}, errors.New("trade not found in this workspace")
	}
	return *trade, nil
}

func (t *tools) updateManual(ctx context.Context, req *mcp.CallToolRequest, in updateManualInput) (*mcp.CallToolResult, manualOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, manualOutput{}, err
	}
	input := map[string]any{}
	if s := strings.TrimSpace(in.Symbol); s != "" {
		input["symbol"] = strings.ToUpper(s)
	}
	if in.Direction != nil {
		input["tradeType"] = string(*in.Direction)
	}
	for name, value := range map[string]string{"openDate": in.OpenedAt, "closeDate": in.ClosedAt} {
		if value == "" {
			continue
		}
		at, err := parseTime(map[string]string{"openDate": "opened_at", "closeDate": "closed_at"}[name], value)
		if err != nil {
			return nil, manualOutput{}, err
		}
		input[name] = at.UTC().Format(time.RFC3339)
	}
	for name, value := range map[string]*float64{"entryPrice": in.EntryPrice, "exitPrice": in.ExitPrice, "positionSize": in.Quantity, "stopLoss": in.Stop, "fees": in.Fees} {
		if value != nil {
			input[name] = *value
		}
	}
	if in.FeesUnknown {
		if in.Fees != nil {
			return nil, manualOutput{}, errors.New("give fees or fees_unknown, not both")
		}
		input["clearFees"] = true
	}
	if in.Notes != nil {
		if strings.TrimSpace(*in.Notes) == "" {
			input["clearNotes"] = true
		} else {
			input["notes"] = *in.Notes
		}
	}
	if len(input) == 0 {
		return nil, manualOutput{}, errors.New("say what to change")
	}

	var updated manualTrade
	// Only the fields the user named are sent, so retrying on top of another
	// device's save keeps that save's other changes.
	for attempt := 0; ; attempt++ {
		current, err := t.readManual(ctx, caller.Token, in.WorkspaceID, in.TradeID)
		if err != nil {
			return nil, manualOutput{}, err
		}
		input["expectedVersion"] = current.RecordVersion
		updated, err = t.api.updateManual(ctx, caller.Token, in.TradeID, input)
		if err == nil {
			break
		}
		if isConflict(err) && attempt == 0 {
			continue
		}
		var apiErr *graphql.Error
		if errors.As(err, &apiErr) && strings.Contains(apiErr.Error(), brokerReadOnly) {
			return nil, manualOutput{}, errors.New("this is a broker trade; its results come from the broker. Record context with update_trade_context instead")
		}
		return nil, manualOutput{}, graphql.ForUser(err)
	}
	return nil, manualOutput{Message: manualMessage(updated, "Updated."), Trade: updated.view()}, nil
}

type deleteManualInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID           string `json:"trade_id" jsonschema:"a manual trade's ID"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only after the user agreed to the question in needs_confirmation"`
}

type deleteManualOutput struct {
	Status            string `json:"status" jsonschema:"deleted, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func (t *tools) deleteManual(ctx context.Context, req *mcp.CallToolRequest, in deleteManualInput) (*mcp.CallToolResult, deleteManualOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, deleteManualOutput{}, err
	}
	trade, err := t.readManual(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	if err != nil {
		return nil, deleteManualOutput{}, err
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:   "delete_manual_trade",
		Target: trade.ID,
		Question: fmt.Sprintf("Delete the manual %s %s trade closed %s? Its notes, tags and review go with it, and it leaves every total.",
			trade.Symbol, trade.TradeType, trade.CloseDate),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, deleteManualOutput{}, err
	}
	if !outcome.Approved {
		status := "cancelled"
		if outcome.Token != "" {
			status = "needs_confirmation"
		}
		return outcome.Ask, deleteManualOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
	}
	if err := t.api.deleteManual(ctx, caller.Token, trade.ID); err != nil {
		var apiErr *graphql.Error
		if errors.As(err, &apiErr) && strings.Contains(apiErr.Error(), brokerReadOnly) {
			return nil, deleteManualOutput{}, errors.New("this is a broker trade and cannot be deleted; regroup it with the grouping tools if it is wrong")
		}
		return nil, deleteManualOutput{}, graphql.ForUser(err)
	}
	return nil, deleteManualOutput{Status: "deleted", Message: "Deleted."}, nil
}
