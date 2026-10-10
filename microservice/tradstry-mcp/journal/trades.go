package journal

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
)

const (
	defaultListLimit = 25
	maxListLimit     = 100
)

type (
	lifecycle   string
	reviewState string
)

type listInput struct {
	WorkspaceID string      `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	State       lifecycle   `json:"state,omitempty" jsonschema:"open, closed, or incomplete (history missing, so results are unknown)"`
	Review      reviewState `json:"review,omitempty" jsonschema:"unreviewed, reviewed, or outdated (reviewed before the trade or its stop/playbook changed)"`
	Symbol      string      `json:"symbol,omitempty"`
	From        string      `json:"from,omitempty" jsonschema:"YYYY-MM-DD; trades closed (or, if open, opened) on or after this UTC date"`
	To          string      `json:"to,omitempty" jsonschema:"YYYY-MM-DD; trades closed (or, if open, opened) on or before this UTC date"`
	Limit       int         `json:"limit,omitempty" jsonschema:"at most 100; defaults to 25, newest first"`
}

type tradeView struct {
	ID                  string   `json:"id"`
	Symbol              string   `json:"symbol"`
	Name                string   `json:"name,omitempty"`
	Direction           string   `json:"direction"`
	State               string   `json:"state"`
	Outcome             string   `json:"outcome" jsonschema:"profit, loss, breakeven, or unknown"`
	Review              string   `json:"review"`
	OpenedAt            string   `json:"opened_at,omitempty"`
	ClosedAt            string   `json:"closed_at,omitempty"`
	EntryPrice          string   `json:"entry_price,omitempty"`
	ExitPrice           string   `json:"exit_price,omitempty"`
	Quantity            string   `json:"quantity,omitempty"`
	RemainingQuantity   string   `json:"remaining_quantity,omitempty"`
	RealizedNet         string   `json:"realized_net,omitempty" jsonschema:"realized profit or loss after fees, in currency; absent means unknown, not zero"`
	Fees                string   `json:"fees,omitempty"`
	Currency            string   `json:"currency,omitempty"`
	Tags                []string `json:"tags,omitempty"`
	Issue               string   `json:"issue,omitempty"`
	PossibleDuplicateOf []string `json:"possible_duplicate_of,omitempty" jsonschema:"broker trades this manual trade may repeat; it is not counted until the user answers through resolve_possible_duplicate"`
	ReplacedBy          string   `json:"replaced_by,omitempty" jsonschema:"this trade was regrouped; use this trade ID instead"`
}

type counts struct {
	Open       int `json:"open"`
	Closed     int `json:"closed"`
	Incomplete int `json:"incomplete"`
	ToReview   int `json:"closed_unreviewed"`
	Outdated   int `json:"outdated"`
}

type listOutput struct {
	Matching int         `json:"matching"`
	Trades   []tradeView `json:"trades"`
	Journal  counts      `json:"journal" jsonschema:"totals across the whole journal"`
	Note     string      `json:"note,omitempty"`
}

func str(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func toView(t trade) tradeView {
	view := tradeView{
		ID: t.ID, Symbol: t.Symbol, Name: str(t.SymbolName), Direction: t.Direction,
		State: t.LifecycleState, Outcome: t.Outcome, Review: t.ReviewState,
		OpenedAt: str(t.OpenDate), ClosedAt: str(t.CloseDate),
		EntryPrice: str(t.EntryPrice), ExitPrice: str(t.ExitPrice),
		Quantity: str(t.EnteredQuantity), RealizedNet: str(t.RealizedNet), Fees: str(t.FeesPaid),
		Currency: str(t.Currency), Issue: str(t.IssueMessage), ReplacedBy: str(t.SuccessorID),
	}
	if t.LifecycleState == "open" {
		view.RemainingQuantity = str(t.RemainingQuantity)
	}
	if str(t.IssueCode) == "possible_duplicate" {
		view.PossibleDuplicateOf = t.PossibleDuplicates
	}
	for _, tag := range t.Tags {
		view.Tags = append(view.Tags, tag.Name)
	}
	return view
}

// day is the UTC date a trade belongs to for filtering: when it closed, or
// when it opened if it is still open.
func day(t trade) string {
	date := str(t.CloseDate)
	if date == "" {
		date = str(t.OpenDate)
	}
	if len(date) >= 10 {
		return date[:10]
	}
	return ""
}

func (t *tools) requireJournal(ctx context.Context, token, ws string) (flowStatus, error) {
	st, err := t.api.status(ctx, token, ws)
	if err != nil {
		return st, forUser(err)
	}
	if !st.Enabled {
		return st, errors.New("the journal is off for this workspace; see get_journal_status and start_journal")
	}
	return st, nil
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	limit := in.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		return nil, listOutput{}, fmt.Errorf("limit can be at most %d", maxListLimit)
	}
	st, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, err
	}
	all, err := t.api.trades(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, forUser(err)
	}

	out := listOutput{Trades: []tradeView{}}
	if !st.ready() {
		out.Note = "The journal is still building trades from the latest broker sync, so this list may be incomplete."
	}
	for _, tr := range all {
		switch tr.LifecycleState {
		case "open":
			out.Journal.Open++
		case "closed":
			out.Journal.Closed++
			if tr.ReviewState == "unreviewed" {
				out.Journal.ToReview++
			}
		case "incomplete":
			out.Journal.Incomplete++
		}
		if tr.ReviewState == "outdated" {
			out.Journal.Outdated++
		}

		if (in.State != "" && tr.LifecycleState != string(in.State)) ||
			(in.Review != "" && tr.ReviewState != string(in.Review)) ||
			(in.Symbol != "" && !strings.EqualFold(tr.Symbol, in.Symbol)) ||
			(in.From != "" && day(tr) < in.From) ||
			(in.To != "" && day(tr) > in.To) {
			continue
		}
		out.Matching++
		if len(out.Trades) < limit {
			out.Trades = append(out.Trades, toView(tr))
		}
	}
	return nil, out, nil
}

type tradeInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string `json:"trade_id" jsonschema:"ID from list_trades"`
}

type contextView struct {
	Stop             string   `json:"stop" jsonschema:"a price, none, or unknown"`
	Playbook         string   `json:"playbook,omitempty"`
	Tags             []string `json:"tags,omitempty"`
	BrokenPrinciples []string `json:"broken_principles,omitempty"`
	Notes            string   `json:"notes,omitempty"`
	RecordedPhase    string   `json:"recorded_phase,omitempty" jsonschema:"when the context was last saved relative to the trade: pre_entry, during_trade, retrospective or unknown"`
	ClaimedAt        string   `json:"claimed_at,omitempty" jsonschema:"when the user says they decided this"`
}

type draftView struct {
	Takeaway     string   `json:"takeaway,omitempty"`
	QuickChoices []string `json:"quick_choices,omitempty"`
	PlanFollowed string   `json:"plan_followed,omitempty"`
}

type executionView struct {
	Role       string `json:"role" jsonschema:"entry or exit"`
	Side       string `json:"side"`
	Quantity   string `json:"quantity"`
	Price      string `json:"price,omitempty"`
	Fee        string `json:"fee,omitempty" jsonschema:"absent when the broker did not report one"`
	ExecutedAt string `json:"executed_at"`
	DateOnly   bool   `json:"date_only,omitempty" jsonschema:"the broker gave only the day, so the order within it is unknown"`
}

type tradeDetail struct {
	Trade        tradeView       `json:"trade"`
	Executions   []executionView `json:"executions"`
	Context      contextView     `json:"context"`
	Draft        draftView       `json:"review_draft"`
	LastReviewed string          `json:"last_reviewed_at,omitempty"`
}

func (t *tools) get(ctx context.Context, req *mcp.CallToolRequest, in tradeInput) (*mcp.CallToolResult, tradeDetail, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, tradeDetail{}, err
	}
	out, err := t.tradeDetail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	return nil, out, err
}

func (t *tools) tradeDetail(ctx context.Context, token, ws, tradeID string) (tradeDetail, error) {
	if _, err := t.requireJournal(ctx, token, ws); err != nil {
		return tradeDetail{}, err
	}
	d, err := t.api.detail(ctx, token, ws, tradeID)
	if err != nil {
		return tradeDetail{}, forUser(err)
	}
	if d.Trade == nil {
		return tradeDetail{}, errors.New("trade not found; call list_trades for valid IDs")
	}
	lookup, err := t.api.names(ctx, token, ws)
	if err != nil {
		return tradeDetail{}, forUser(err)
	}

	out := tradeDetail{Trade: toView(*d.Trade), Executions: []executionView{}}
	for _, e := range d.Executions {
		out.Executions = append(out.Executions, executionView{
			Role: e.Role, Side: e.Side, Quantity: e.Quantity, Price: str(e.Price), Fee: str(e.Fee),
			ExecutedAt: e.ExecutedAt, DateOnly: e.Precision == "date",
		})
	}
	out.Context = contextView{
		Stop:             stopText(d.Context),
		Tags:             namesOf(d.Context.TagIDs, lookup.Tags),
		BrokenPrinciples: namesOf(d.Context.ViolatedPrincipleIDs, lookup.Principles),
		Notes:            str(d.Context.Notes),
		RecordedPhase:    str(d.Context.Phase),
		ClaimedAt:        str(d.Context.ClaimedAt),
	}
	if d.Context.PlaybookID != nil {
		out.Context.Playbook = strings.Join(namesOf([]string{*d.Context.PlaybookID}, lookup.Playbooks), "")
	}
	out.Draft = draftView{Takeaway: d.Draft.Takeaway, QuickChoices: d.Draft.ChoiceIDs, PlanFollowed: str(d.Draft.PlanAdherence)}
	if len(d.Reviews) > 0 {
		out.LastReviewed = d.Reviews[0].CreatedAt
	}
	return out, nil
}

func stopText(c tradeContext) string {
	if c.StopState == "price" {
		return str(c.StopPrice)
	}
	return c.StopState
}

func namesOf(ids []string, options []named) []string {
	var found []string
	for _, id := range ids {
		if i := slices.IndexFunc(options, func(n named) bool { return n.ID == id }); i >= 0 {
			found = append(found, options[i].Name)
		}
	}
	return found
}

// resolve turns names the user said into IDs, matching case-insensitively.
func resolve(kind string, wanted []string, options []named) ([]string, error) {
	ids := make([]string, 0, len(wanted))
	for _, name := range wanted {
		i := slices.IndexFunc(options, func(n named) bool { return strings.EqualFold(strings.TrimSpace(n.Name), strings.TrimSpace(name)) })
		if i < 0 {
			available := make([]string, 0, len(options))
			for _, o := range options {
				available = append(available, o.Name)
			}
			if len(available) == 0 {
				return nil, fmt.Errorf("there are no %ss in this workspace yet; create them on tradstry.com", kind)
			}
			return nil, fmt.Errorf("no %s named %q; available: %s", kind, name, strings.Join(available, ", "))
		}
		ids = append(ids, options[i].ID)
	}
	return ids, nil
}
