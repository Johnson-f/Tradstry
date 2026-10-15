package journal

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/numfmt"
	"tradstry-mcp/oauth"
)

type (
	lifecycle   string
	reviewState string
)

type tradeView struct {
	ID                  string   `json:"id"`
	Symbol              string   `json:"symbol,omitempty"`
	Name                string   `json:"name,omitempty"`
	Direction           string   `json:"direction,omitempty"`
	State               string   `json:"state,omitempty"`
	Outcome             string   `json:"outcome,omitempty" jsonschema:"profit, loss, breakeven, or unknown"`
	Review              string   `json:"review,omitempty"`
	OpenedAt            string   `json:"opened_at,omitempty"`
	ClosedAt            string   `json:"closed_at,omitempty"`
	FirstExecutionAt    string   `json:"first_execution_at,omitempty" jsonschema:"when the trade's first broker execution happened; present even when the trade is incomplete and has no opened_at"`
	LastExecutionAt     string   `json:"last_execution_at,omitempty"`
	ExecutionCount      int      `json:"execution_count,omitempty"`
	EntryPrice          string   `json:"entry_price,omitempty"`
	ExitPrice           string   `json:"exit_price,omitempty"`
	Quantity            string   `json:"quantity,omitempty"`
	RemainingQuantity   string   `json:"remaining_quantity,omitempty"`
	BoughtQuantity      string   `json:"bought_quantity,omitempty" jsonschema:"incomplete trades only: total quantity bought across its executions"`
	SoldQuantity        string   `json:"sold_quantity,omitempty" jsonschema:"incomplete trades only: total quantity sold across its executions"`
	RealizedNet         string   `json:"realized_net,omitempty" jsonschema:"realized profit or loss after fees, in currency, to the cent; absent means unknown, not zero"`
	Fees                string   `json:"fees,omitempty" jsonschema:"total fees, to the cent; absent means none"`
	Currency            string   `json:"currency,omitempty"`
	Tags                []string `json:"tags,omitempty"`
	Playbook            string   `json:"playbook,omitempty"`
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
		FirstExecutionAt: str(t.FirstExecutionAt), LastExecutionAt: str(t.LastExecutionAt), ExecutionCount: t.ExecutionCount,
		EntryPrice: tidy(str(t.EntryPrice)), ExitPrice: tidy(str(t.ExitPrice)), Quantity: tidy(str(t.EnteredQuantity)),
		RealizedNet: numfmt.Money(str(t.RealizedNet)),
		Currency:    str(t.Currency), Issue: str(t.IssueMessage), ReplacedBy: str(t.SuccessorID),
	}
	if fees := str(t.FeesPaid); !numfmt.IsZero(fees) {
		view.Fees = numfmt.Money(fees)
	}
	if t.LifecycleState == "open" {
		view.RemainingQuantity = tidy(str(t.RemainingQuantity))
	}
	if t.LifecycleState == "incomplete" {
		view.BoughtQuantity, view.SoldQuantity = tidy(str(t.BoughtQuantity)), tidy(str(t.SoldQuantity))
	}
	if str(t.IssueCode) == "possible_duplicate" {
		view.PossibleDuplicateOf = t.PossibleDuplicates
	}
	for _, tag := range t.Tags {
		view.Tags = append(view.Tags, tag.Name)
	}
	return view
}

// The website still shows a workspace's trades while the automatic journal is off,
// read-only, so listing and reading them must work too; changing them must not.
const journalOffNote = "The automatic journal is off for this workspace, so these are only the trades recorded so far: new broker fills won't become trades, and trades can't be edited or reviewed until start_journal turns it on (see get_journal_status)."

func (t *tools) journalStatus(ctx context.Context, token, ws string) (flowStatus, error) {
	st, err := t.api.status(ctx, token, ws)
	if err != nil {
		return st, forUser(err)
	}
	return st, nil
}

func (t *tools) requireJournal(ctx context.Context, token, ws string) (flowStatus, error) {
	st, err := t.journalStatus(ctx, token, ws)
	if err != nil {
		return st, err
	}
	if !st.Enabled {
		return st, errors.New("the journal is off for this workspace; see get_journal_status and start_journal")
	}
	return st, nil
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
	Note         string          `json:"note,omitempty"`
}

func (t *tools) get(ctx context.Context, req *mcp.CallToolRequest, in tradeInput) (*mcp.CallToolResult, tradeDetail, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, tradeDetail{}, err
	}
	st, err := t.journalStatus(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, tradeDetail{}, err
	}
	out, err := t.tradeDetail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	if err == nil && !st.Enabled {
		out.Note = journalOffNote
	}
	return nil, out, err
}

func (t *tools) tradeDetail(ctx context.Context, token, ws, tradeID string) (tradeDetail, error) {
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

// playbookID resolves a playbook given by ID or by name.
func playbookID(playbooks []named, given string) (string, error) {
	given = strings.TrimSpace(given)
	var names []string
	for _, p := range playbooks {
		if p.ID == given || strings.EqualFold(p.Name, given) {
			return p.ID, nil
		}
		names = append(names, p.Name)
	}
	if len(names) == 0 {
		return "", fmt.Errorf("there is no playbook %q; this workspace has no playbooks", given)
	}
	return "", fmt.Errorf("there is no playbook %q; the playbooks are: %s", given, strings.Join(names, ", "))
}

// tagID resolves a tag given by ID or by name.
func tagID(tags []named, given string) (string, error) {
	given = strings.TrimSpace(given)
	var matches []string
	for _, t := range tags {
		if t.ID == given {
			return t.ID, nil
		}
		if strings.EqualFold(t.Name, given) {
			matches = append(matches, t.ID)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return "", fmt.Errorf("there is no tag %q; list_tags shows them", given)
	}
	return "", fmt.Errorf("%q is the name of more than one tag; pass its ID from list_tags", given)
}
