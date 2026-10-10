package journal

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
)

type (
	quickChoice    string
	planFollowed   string
	takeawaySource string
)

var positivePrice = regexp.MustCompile(`^\d+(\.\d+)?$`)

type contextInput struct {
	WorkspaceID            string   `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID                string   `json:"trade_id" jsonschema:"ID from list_trades"`
	Stop                   string   `json:"stop,omitempty" jsonschema:"the stop the user had: a price such as 182.50, none if they had no stop, or unknown"`
	Playbook               string   `json:"playbook,omitempty" jsonschema:"name of the playbook (strategy) the trade followed, or none to clear it"`
	Notes                  string   `json:"notes,omitempty" jsonschema:"replaces the trade's notes"`
	AppendNotes            string   `json:"append_notes,omitempty" jsonschema:"added after the existing notes"`
	AddTags                []string `json:"add_tags,omitempty" jsonschema:"tag names to add"`
	RemoveTags             []string `json:"remove_tags,omitempty" jsonschema:"tag names to remove"`
	AddBrokenPrinciples    []string `json:"add_broken_principles,omitempty" jsonschema:"titles of trading principles the user broke on this trade"`
	RemoveBrokenPrinciples []string `json:"remove_broken_principles,omitempty" jsonschema:"titles of principles to clear from this trade"`
	ClaimedAt              string   `json:"claimed_at,omitempty" jsonschema:"RFC 3339 time the user says they made this decision; only when they state it, never to make a plan look made before entry"`
}

func (t *tools) updateContext(ctx context.Context, req *mcp.CallToolRequest, in contextInput) (*mcp.CallToolResult, contextView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, contextView{}, err
	}
	if in.Stop == "" && in.Playbook == "" && in.Notes == "" && in.AppendNotes == "" &&
		len(in.AddTags)+len(in.RemoveTags)+len(in.AddBrokenPrinciples)+len(in.RemoveBrokenPrinciples) == 0 {
		return nil, contextView{}, errors.New("say what to change: stop, playbook, notes, tags or broken principles")
	}
	if in.ClaimedAt != "" {
		if _, err := time.Parse(time.RFC3339, in.ClaimedAt); err != nil {
			return nil, contextView{}, errors.New("claimed_at must be an RFC 3339 time such as 2026-10-09T14:30:00Z")
		}
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, contextView{}, err
	}
	lookup, err := t.api.names(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, contextView{}, forUser(err)
	}

	// Another device may save between the read and the write; one fresh attempt
	// merges onto what it saved instead of overwriting it.
	for attempt := 0; ; attempt++ {
		d, err := t.api.detail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
		if err != nil {
			return nil, contextView{}, forUser(err)
		}
		if d.Trade == nil {
			return nil, contextView{}, errors.New("trade not found; call list_trades for valid IDs")
		}
		input, err := contextChange(in, d.Context, lookup)
		if err != nil {
			return nil, contextView{}, err
		}
		saved, err := t.api.saveContext(ctx, caller.Token, in.WorkspaceID, input, d.Context)
		if isConflict(err) && attempt == 0 {
			continue
		}
		if err != nil {
			return nil, contextView{}, forUser(err)
		}
		return nil, contextView{
			Stop:             stopText(saved),
			Playbook:         strings.Join(namesOf(nonEmpty(saved.PlaybookID), lookup.Playbooks), ""),
			Tags:             namesOf(saved.TagIDs, lookup.Tags),
			BrokenPrinciples: namesOf(saved.ViolatedPrincipleIDs, lookup.Principles),
			Notes:            str(saved.Notes),
			RecordedPhase:    str(saved.Phase),
			ClaimedAt:        str(saved.ClaimedAt),
		}, nil
	}
}

func nonEmpty(id *string) []string {
	if id == nil {
		return nil
	}
	return []string{*id}
}

// contextChange builds the full input the backend expects, keeping everything
// the user did not mention as it is now.
func contextChange(in contextInput, current tradeContext, lookup names) (map[string]any, error) {
	input := map[string]any{
		"entryId":         in.TradeID,
		"expectedVersion": current.Version,
		"stopState":       current.StopState,
		"stopPrice":       current.StopPrice,
		"playbookId":      current.PlaybookID,
	}
	switch stop := strings.TrimSpace(in.Stop); stop {
	case "":
	case "none", "unknown":
		input["stopState"], input["stopPrice"] = stop, nil
	default:
		price := strings.TrimPrefix(stop, "$")
		if !positivePrice.MatchString(price) || strings.Trim(price, "0.") == "" {
			return nil, errors.New("stop must be a positive price, none, or unknown")
		}
		input["stopState"], input["stopPrice"] = "price", price
	}
	switch {
	case in.Playbook == "":
	case strings.EqualFold(in.Playbook, "none"):
		input["playbookId"] = nil
	default:
		ids, err := resolve("playbook", []string{in.Playbook}, lookup.Playbooks)
		if err != nil {
			return nil, err
		}
		input["playbookId"] = ids[0]
	}
	switch {
	case in.Notes != "":
		input["notes"] = in.Notes
	case in.AppendNotes != "":
		input["notes"] = strings.TrimSpace(str(current.Notes) + "\n\n" + in.AppendNotes)
	}
	if len(in.AddTags)+len(in.RemoveTags) > 0 {
		ids, err := adjust("tag", current.TagIDs, in.AddTags, in.RemoveTags, lookup.Tags)
		if err != nil {
			return nil, err
		}
		input["tagIds"] = ids
	}
	if len(in.AddBrokenPrinciples)+len(in.RemoveBrokenPrinciples) > 0 {
		ids, err := adjust("principle", current.ViolatedPrincipleIDs, in.AddBrokenPrinciples, in.RemoveBrokenPrinciples, lookup.Principles)
		if err != nil {
			return nil, err
		}
		input["violatedPrincipleIds"] = ids
	}
	if in.ClaimedAt != "" {
		input["claimedAt"] = in.ClaimedAt
	} else {
		input["claimedAt"] = current.ClaimedAt
	}
	return input, nil
}

// adjust applies additions and removals to the current IDs. The backend replaces
// the whole list on every save, so sending only the new names would erase the rest.
func adjust(kind string, current, add, remove []string, options []named) ([]string, error) {
	added, err := resolve(kind, add, options)
	if err != nil {
		return nil, err
	}
	removed, err := resolve(kind, remove, options)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(current)+len(added))
	for _, id := range append(slices.Clone(current), added...) {
		if !slices.Contains(ids, id) && !slices.Contains(removed, id) {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

type reviewInput struct {
	WorkspaceID    string         `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID        string         `json:"trade_id" jsonschema:"ID from list_trades"`
	Takeaway       string         `json:"takeaway,omitempty" jsonschema:"the user's lesson from this trade, in their words"`
	TakeawaySource takeawaySource `json:"takeaway_source,omitempty" jsonschema:"required with takeaway: user_wrote, or user_approved when you suggested it and the user explicitly accepted that exact text"`
	QuickChoices   []quickChoice  `json:"quick_choices,omitempty" jsonschema:"replaces the trade's quick choices"`
	PlanFollowed   planFollowed   `json:"plan_followed,omitempty" jsonschema:"did the user follow their plan"`
}

func (t *tools) saveReview(ctx context.Context, req *mcp.CallToolRequest, in reviewInput) (*mcp.CallToolResult, draftView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, draftView{}, err
	}
	if in.Takeaway == "" && in.QuickChoices == nil && in.PlanFollowed == "" {
		return nil, draftView{}, errors.New("say what to save: takeaway, quick_choices or plan_followed")
	}
	if in.Takeaway != "" && in.TakeawaySource == "" {
		return nil, draftView{}, errors.New("a takeaway needs takeaway_source; only save text the user wrote or explicitly approved")
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, draftView{}, err
	}

	for attempt := 0; ; attempt++ {
		d, err := t.api.detail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
		if err != nil {
			return nil, draftView{}, forUser(err)
		}
		if d.Trade == nil {
			return nil, draftView{}, errors.New("trade not found; call list_trades for valid IDs")
		}
		input := map[string]any{
			"entryId":         in.TradeID,
			"expectedVersion": d.Draft.Version,
			"takeaway":        d.Draft.Takeaway,
			"choiceIds":       d.Draft.ChoiceIDs,
			"planAdherence":   d.Draft.PlanAdherence,
		}
		if in.Takeaway != "" {
			input["takeaway"] = in.Takeaway
		}
		if in.QuickChoices != nil {
			choices := make([]string, len(in.QuickChoices))
			for i, c := range in.QuickChoices {
				choices[i] = string(c)
			}
			input["choiceIds"] = choices
		}
		if in.PlanFollowed != "" {
			input["planAdherence"] = string(in.PlanFollowed)
		}
		if input["choiceIds"] == nil {
			input["choiceIds"] = []string{}
		}

		saved, err := t.api.saveDraft(ctx, caller.Token, in.WorkspaceID, input, d.Draft)
		if isConflict(err) && attempt == 0 {
			continue
		}
		if err != nil {
			return nil, draftView{}, forUser(err)
		}
		return nil, draftView{Takeaway: saved.Takeaway, QuickChoices: saved.ChoiceIDs, PlanFollowed: str(saved.PlanAdherence)}, nil
	}
}

type markInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string `json:"trade_id" jsonschema:"ID from list_trades"`
	SessionID   string `json:"session_id,omitempty" jsonschema:"from next_trade_to_review, to move that session on"`
}

type markOutput struct {
	Message    string `json:"message"`
	ReviewedAt string `json:"reviewed_at"`
}

func (t *tools) markReviewed(ctx context.Context, req *mcp.CallToolRequest, in markInput) (*mcp.CallToolResult, markOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, markOutput{}, err
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, markOutput{}, err
	}
	d, err := t.api.detail(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	if err != nil {
		return nil, markOutput{}, forUser(err)
	}
	if d.Trade == nil {
		return nil, markOutput{}, errors.New("trade not found; call list_trades for valid IDs")
	}
	input := map[string]any{
		"entryId":                in.TradeID,
		"expectedEntryRevision":  d.Trade.MaterializedRevision,
		"expectedContextVersion": d.Context.Version,
		"expectedDraftVersion":   d.Draft.Version,
	}
	if in.SessionID != "" {
		input["sessionId"] = in.SessionID
	}
	saved, err := t.api.markReviewed(ctx, caller.Token, in.WorkspaceID, input)
	if err != nil {
		return nil, markOutput{}, forUser(err)
	}
	return nil, markOutput{
		Message:    fmt.Sprintf("Marked the %s trade reviewed (review %d).", d.Trade.Symbol, saved.Version),
		ReviewedAt: saved.CreatedAt,
	}, nil
}

type nextInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Date        string `json:"date,omitempty" jsonschema:"YYYY-MM-DD trading day to review; defaults to the latest day with closed trades"`
	Skip        bool   `json:"skip,omitempty" jsonschema:"move past the current trade without reviewing it"`
	Refresh     bool   `json:"refresh,omitempty" jsonschema:"include trades that synced for this day after the session started"`
}

type nextOutput struct {
	Status           string       `json:"status" jsonschema:"next, done or no_trades"`
	SessionID        string       `json:"session_id,omitempty" jsonschema:"pass to mark_trade_reviewed"`
	Day              string       `json:"day,omitempty"`
	Reviewed         int          `json:"reviewed"`
	Total            int          `json:"total"`
	RefreshAvailable bool         `json:"refresh_available,omitempty" jsonschema:"trades for this day changed since the session started; call again with refresh"`
	Trade            *tradeDetail `json:"trade,omitempty"`
}

func (t *tools) next(ctx context.Context, req *mcp.CallToolRequest, in nextInput) (*mcp.CallToolResult, nextOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, nextOutput{}, err
	}
	if in.Date != "" {
		if _, err := time.Parse(time.DateOnly, in.Date); err != nil {
			return nil, nextOutput{}, errors.New("date must be YYYY-MM-DD")
		}
	}
	if _, err := t.requireJournal(ctx, caller.Token, in.WorkspaceID); err != nil {
		return nil, nextOutput{}, err
	}
	var date *string
	if in.Date != "" {
		date = &in.Date
	}
	s, err := t.api.openSession(ctx, caller.Token, in.WorkspaceID, date, false, nil, t.nonce())
	if err != nil {
		return nil, nextOutput{}, forUser(err)
	}
	if s == nil {
		return nil, nextOutput{Status: "no_trades"}, nil
	}
	if in.Refresh && s.RefreshAvailable {
		version := s.Version
		if s, err = t.api.openSession(ctx, caller.Token, in.WorkspaceID, &s.Date, true, &version, t.nonce()); err != nil {
			return nil, nextOutput{}, forUser(err)
		}
	}
	if in.Skip && s.CursorEntryID != nil {
		if next, ok := after(s, *s.CursorEntryID); ok {
			if err := t.api.moveCursor(ctx, caller.Token, in.WorkspaceID, s.ID, next, s.Version); err != nil {
				return nil, nextOutput{}, forUser(err)
			}
			s.CursorEntryID = &next
		}
	}

	out := nextOutput{
		SessionID: s.ID, Day: s.Date, Reviewed: len(s.Completed), Total: len(s.Queue),
		RefreshAvailable: s.RefreshAvailable,
	}
	if s.CursorEntryID == nil || slices.Contains(s.Completed, *s.CursorEntryID) {
		out.Status = "done"
		return nil, out, nil
	}
	detail, err := t.tradeDetail(ctx, caller.Token, in.WorkspaceID, *s.CursorEntryID)
	if err != nil {
		return nil, nextOutput{}, err
	}
	out.Status, out.Trade = "next", &detail
	return nil, out, nil
}

// after returns the first trade still to review that follows current in the
// session, wrapping around to earlier skipped ones.
func after(s *session, current string) (string, bool) {
	start := slices.Index(s.Queue, current)
	for i := 1; i < len(s.Queue); i++ {
		candidate := s.Queue[(start+i)%len(s.Queue)]
		if !slices.Contains(s.Completed, candidate) {
			return candidate, true
		}
	}
	return "", false
}
