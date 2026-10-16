package journal

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/oauth"
)

const (
	defaultListLimit = 25
	maxListLimit     = 100
	maxExportRows    = 5000
)

type sortOrder string

type tradeFilter struct {
	WorkspaceID string      `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	State       lifecycle   `json:"state,omitempty" jsonschema:"open, closed, or incomplete (history missing, so results are unknown)"`
	Review      reviewState `json:"review,omitempty" jsonschema:"unreviewed (unfinished, including in_progress), in_progress (saved review work), reviewed, or outdated (reviewed before the trade or its stop/playbook changed)"`
	Symbol      string      `json:"symbol,omitempty" jsonschema:"ticker, such as AAPL"`
	OpenedFrom  string      `json:"opened_from,omitempty" jsonschema:"YYYY-MM-DD; trades opened on or after this UTC date. A trade with no open date (incomplete) counts as opened at its first execution"`
	OpenedTo    string      `json:"opened_to,omitempty" jsonschema:"YYYY-MM-DD; trades opened on or before this UTC date"`
	ClosedFrom  string      `json:"closed_from,omitempty" jsonschema:"YYYY-MM-DD; trades closed on or after this UTC date. Open trades never match; an incomplete trade counts as closed at its last execution"`
	ClosedTo    string      `json:"closed_to,omitempty" jsonschema:"YYYY-MM-DD; trades closed on or before this UTC date"`
	Playbook    string      `json:"playbook,omitempty" jsonschema:"only trades that used this playbook, by name or ID from list_playbooks"`
	Tag         string      `json:"tag,omitempty" jsonschema:"only trades carrying this tag, by name or ID from list_tags"`
	Sort        sortOrder   `json:"sort,omitempty" jsonschema:"opened (default): newest open date first; closed: newest close date first, with open trades after. Trades with no such date come last"`
}

type listInput struct {
	tradeFilter
	Fields []string `json:"fields,omitempty" jsonschema:"trade fields to include besides id, to keep the answer short; defaults to all. One or more of the names in trades[]"`
	Limit  int      `json:"limit,omitempty" jsonschema:"at most 100; defaults to 25"`
	Cursor string   `json:"cursor,omitempty" jsonschema:"next_cursor from the previous page; use it with exactly the same filters and sort"`
}

type exportInput struct {
	tradeFilter
	Fields []string `json:"fields,omitempty" jsonschema:"columns to include besides id; defaults to all"`
}

type listOutput struct {
	Matching   int         `json:"matching" jsonschema:"trades matching the filters across all pages"`
	Trades     []tradeView `json:"trades"`
	NextCursor string      `json:"next_cursor,omitempty" jsonschema:"pass as cursor for the next page; absent on the last page"`
	Currency   string      `json:"currency,omitempty" jsonschema:"currency of the money fields of every trade listed, when they all share one; otherwise each trade carries its own"`
	Journal    counts      `json:"journal" jsonschema:"totals across the whole journal"`
	Note       string      `json:"note,omitempty"`
}

type exportOutput struct {
	Matching  int      `json:"matching"`
	Exported  int      `json:"exported" jsonschema:"rows in the CSV text"`
	Truncated bool     `json:"truncated,omitempty" jsonschema:"more trades matched than the export holds; narrow the filters"`
	Columns   []string `json:"columns"`
	Note      string   `json:"note,omitempty"`
}

type column struct {
	name  string
	text  func(*tradeView) *string
	list  func(*tradeView) *[]string
	count func(*tradeView) *int
}

func textColumn(name string, field func(*tradeView) *string) column {
	return column{name: name, text: field}
}

var columns = []column{
	textColumn("symbol", func(v *tradeView) *string { return &v.Symbol }),
	textColumn("name", func(v *tradeView) *string { return &v.Name }),
	textColumn("direction", func(v *tradeView) *string { return &v.Direction }),
	textColumn("state", func(v *tradeView) *string { return &v.State }),
	textColumn("outcome", func(v *tradeView) *string { return &v.Outcome }),
	textColumn("review", func(v *tradeView) *string { return &v.Review }),
	textColumn("opened_at", func(v *tradeView) *string { return &v.OpenedAt }),
	textColumn("closed_at", func(v *tradeView) *string { return &v.ClosedAt }),
	textColumn("first_execution_at", func(v *tradeView) *string { return &v.FirstExecutionAt }),
	textColumn("last_execution_at", func(v *tradeView) *string { return &v.LastExecutionAt }),
	{name: "execution_count", count: func(v *tradeView) *int { return &v.ExecutionCount }},
	textColumn("entry_price", func(v *tradeView) *string { return &v.EntryPrice }),
	textColumn("exit_price", func(v *tradeView) *string { return &v.ExitPrice }),
	textColumn("quantity", func(v *tradeView) *string { return &v.Quantity }),
	textColumn("remaining_quantity", func(v *tradeView) *string { return &v.RemainingQuantity }),
	textColumn("bought_quantity", func(v *tradeView) *string { return &v.BoughtQuantity }),
	textColumn("sold_quantity", func(v *tradeView) *string { return &v.SoldQuantity }),
	textColumn("realized_net", func(v *tradeView) *string { return &v.RealizedNet }),
	textColumn("fees", func(v *tradeView) *string { return &v.Fees }),
	textColumn("currency", func(v *tradeView) *string { return &v.Currency }),
	{name: "tags", list: func(v *tradeView) *[]string { return &v.Tags }},
	textColumn("playbook", func(v *tradeView) *string { return &v.Playbook }),
	textColumn("issue", func(v *tradeView) *string { return &v.Issue }),
	{name: "possible_duplicate_of", list: func(v *tradeView) *[]string { return &v.PossibleDuplicateOf }},
	textColumn("replaced_by", func(v *tradeView) *string { return &v.ReplacedBy }),
}

func (c column) clear(v *tradeView) {
	switch {
	case c.text != nil:
		*c.text(v) = ""
	case c.list != nil:
		*c.list(v) = nil
	default:
		*c.count(v) = 0
	}
}

func (c column) cell(v *tradeView) string {
	switch {
	case c.text != nil:
		return *c.text(v)
	case c.list != nil:
		return strings.Join(*c.list(v), ";")
	}
	if n := *c.count(v); n > 0 {
		return strconv.Itoa(n)
	}
	return ""
}

func chosenColumns(fields []string) ([]column, error) {
	if len(fields) == 0 {
		return columns, nil
	}
	var chosen []column
	for _, field := range fields {
		name := strings.ToLower(strings.TrimSpace(field))
		if name == "id" {
			continue
		}
		i := slices.IndexFunc(columns, func(c column) bool { return c.name == name })
		if i < 0 {
			names := make([]string, len(columns))
			for j, c := range columns {
				names[j] = c.name
			}
			return nil, fmt.Errorf("unknown field %q; the fields are: id (always included), %s", field, strings.Join(names, ", "))
		}
		if !slices.ContainsFunc(chosen, columns[i].is) {
			chosen = append(chosen, columns[i])
		}
	}
	return chosen, nil
}

func (c column) is(other column) bool { return c.name == other.name }

type selection struct {
	status  flowStatus
	trades  []trade
	journal counts
	lookup  names
	hash    string
}

func parseDay(label, value string) error {
	if value == "" {
		return nil
	}
	if _, err := time.Parse(time.DateOnly, value); err != nil {
		return fmt.Errorf("%s must be YYYY-MM-DD", label)
	}
	return nil
}

func instant(value *string) time.Time {
	if value == nil {
		return time.Time{}
	}
	at, err := time.Parse(time.RFC3339, *value)
	if err != nil {
		return time.Time{}
	}
	return at.UTC()
}

// Trades with no open or close date, such as incomplete ones, fall back to
// their executions so every date filter and sort sees them.
func openedAt(t trade) time.Time {
	if at := instant(t.OpenDate); !at.IsZero() {
		return at
	}
	return instant(t.FirstExecutionAt)
}

func closedAt(t trade) time.Time {
	if at := instant(t.CloseDate); !at.IsZero() {
		return at
	}
	if t.LifecycleState == "incomplete" {
		return instant(t.LastExecutionAt)
	}
	return time.Time{}
}

func withinDays(at time.Time, from, to string) bool {
	if from == "" && to == "" {
		return true
	}
	if at.IsZero() {
		return false
	}
	day := at.Format(time.DateOnly)
	return (from == "" || day >= from) && (to == "" || day <= to)
}

func newestFirst(a, b time.Time) int {
	switch {
	case a.IsZero() && b.IsZero():
		return 0
	case a.IsZero():
		return 1
	case b.IsZero():
		return -1
	}
	return b.Compare(a)
}

func (t *tools) selectTrades(ctx context.Context, token string, in tradeFilter) (*selection, error) {
	for label, value := range map[string]string{"opened_from": in.OpenedFrom, "opened_to": in.OpenedTo, "closed_from": in.ClosedFrom, "closed_to": in.ClosedTo} {
		if err := parseDay(label, value); err != nil {
			return nil, err
		}
	}
	if in.Sort != "" && in.Sort != "opened" && in.Sort != "closed" {
		return nil, errors.New("sort must be opened or closed")
	}
	st, err := t.journalStatus(ctx, token, in.WorkspaceID)
	if err != nil {
		return nil, err
	}
	all, err := t.api.trades(ctx, token, in.WorkspaceID)
	if err != nil {
		return nil, forUser(err)
	}
	lookup, err := t.api.names(ctx, token, in.WorkspaceID)
	if err != nil {
		return nil, forUser(err)
	}
	playbook, tagged := "", ""
	if in.Playbook != "" {
		if playbook, err = playbookID(lookup.Playbooks, in.Playbook); err != nil {
			return nil, err
		}
	}
	if in.Tag != "" {
		if tagged, err = tagID(lookup.Tags, in.Tag); err != nil {
			return nil, err
		}
	}

	sel := &selection{status: st, lookup: lookup}
	sum := sha256.Sum256(fmt.Appendf(nil, "%q", []string{
		in.WorkspaceID, string(in.State), string(in.Review), strings.ToUpper(in.Symbol), in.OpenedFrom, in.OpenedTo,
		in.ClosedFrom, in.ClosedTo, playbook, tagged, string(in.Sort),
	}))
	sel.hash = hex.EncodeToString(sum[:6])

	for _, tr := range all {
		switch tr.LifecycleState {
		case "open":
			sel.journal.Open++
		case "closed":
			sel.journal.Closed++
			if tr.ReviewState == "unreviewed" || tr.ReviewState == "in_progress" {
				sel.journal.ToReview++
			}
		case "incomplete":
			sel.journal.Incomplete++
		}
		if tr.ReviewState == "outdated" {
			sel.journal.Outdated++
		}

		reviewMatches := in.Review == "" || tr.ReviewState == string(in.Review) || (in.Review == "unreviewed" && tr.ReviewState == "in_progress")
		if (in.State != "" && tr.LifecycleState != string(in.State)) ||
			!reviewMatches ||
			(in.Symbol != "" && !strings.EqualFold(tr.Symbol, in.Symbol)) ||
			!withinDays(openedAt(tr), in.OpenedFrom, in.OpenedTo) ||
			!withinDays(closedAt(tr), in.ClosedFrom, in.ClosedTo) ||
			(playbook != "" && str(tr.PlaybookID) != playbook) ||
			(tagged != "" && !slices.ContainsFunc(tr.Tags, func(t tag) bool { return t.ID == tagged })) {
			continue
		}
		sel.trades = append(sel.trades, tr)
	}

	primary, secondary := openedAt, closedAt
	if in.Sort == "closed" {
		primary, secondary = closedAt, openedAt
	}
	slices.SortStableFunc(sel.trades, func(a, b trade) int {
		if c := newestFirst(primary(a), primary(b)); c != 0 {
			return c
		}
		if c := newestFirst(secondary(a), secondary(b)); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	return sel, nil
}

func (s *selection) view(tr trade) tradeView {
	view := toView(tr)
	view.Playbook = strings.Join(namesOf(nonEmpty(tr.PlaybookID), s.lookup.Playbooks), "")
	return view
}

func (s *selection) note() string {
	switch {
	case !s.status.Enabled:
		return journalOffNote
	case !s.status.ready():
		return "The journal is still building trades from the latest broker sync, so this list may be incomplete."
	}
	return ""
}

func encodeCursor(offset int, hash string) string {
	return base64.RawURLEncoding.EncodeToString(fmt.Appendf(nil, "%d.%s", offset, hash))
}

func decodeCursor(cursor, hash string) (int, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	offset, rest, found := strings.Cut(string(raw), ".")
	n, convErr := strconv.Atoi(offset)
	if err != nil || !found || convErr != nil || n < 0 {
		return 0, errors.New("cursor is not valid; use next_cursor exactly as returned")
	}
	if rest != hash {
		return 0, errors.New("cursor belongs to different filters or sort; repeat the same filters as the call that returned it, or start again without a cursor")
	}
	return n, nil
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := oauth.CallerOf(req)
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
	chosen, err := chosenColumns(in.Fields)
	if err != nil {
		return nil, listOutput{}, err
	}
	sel, err := t.selectTrades(ctx, caller.Token, in.tradeFilter)
	if err != nil {
		return nil, listOutput{}, err
	}
	offset := 0
	if in.Cursor != "" {
		if offset, err = decodeCursor(in.Cursor, sel.hash); err != nil {
			return nil, listOutput{}, err
		}
	}

	out := listOutput{Matching: len(sel.trades), Trades: []tradeView{}, Journal: sel.journal, Note: sel.note()}
	page := sel.trades[min(offset, len(sel.trades)):]
	if len(page) > limit {
		page = page[:limit]
		out.NextCursor = encodeCursor(offset+limit, sel.hash)
	}
	for _, tr := range page {
		view := sel.view(tr)
		keepOnly(&view, chosen, in.Fields)
		out.Trades = append(out.Trades, view)
	}
	out.Currency = hoistCurrency(out.Trades)
	return nil, out, nil
}

func keepOnly(view *tradeView, chosen []column, fields []string) {
	if len(fields) == 0 {
		return
	}
	for _, c := range columns {
		if !slices.ContainsFunc(chosen, c.is) {
			c.clear(view)
		}
	}
}

// hoistCurrency moves a currency shared by every listed trade to the top
// level, and returns it; trades in mixed currencies keep their own.
func hoistCurrency(trades []tradeView) string {
	shared := ""
	for _, tr := range trades {
		if tr.Currency == "" {
			continue
		}
		if shared != "" && tr.Currency != shared {
			return ""
		}
		shared = tr.Currency
	}
	for i := range trades {
		trades[i].Currency = ""
	}
	return shared
}

func (t *tools) export(ctx context.Context, req *mcp.CallToolRequest, in exportInput) (*mcp.CallToolResult, exportOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, exportOutput{}, err
	}
	chosen, err := chosenColumns(in.Fields)
	if err != nil {
		return nil, exportOutput{}, err
	}
	sel, err := t.selectTrades(ctx, caller.Token, in.tradeFilter)
	if err != nil {
		return nil, exportOutput{}, err
	}

	out := exportOutput{Matching: len(sel.trades), Columns: []string{"id"}, Note: sel.note()}
	for _, c := range chosen {
		out.Columns = append(out.Columns, c.name)
	}
	rows := sel.trades
	if len(rows) > maxExportRows {
		rows, out.Truncated = rows[:maxExportRows], true
		out.Note = strings.TrimSpace(fmt.Sprintf("Only the first %d of %d matching trades are in the CSV; narrow the filters (dates, symbol, state) to export the rest. %s", maxExportRows, out.Matching, out.Note))
	}
	out.Exported = len(rows)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write(out.Columns)
	for _, tr := range rows {
		view := sel.view(tr)
		record := []string{view.ID}
		for _, c := range chosen {
			record = append(record, c.cell(&view))
		}
		_ = w.Write(record)
	}
	w.Flush()
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: buf.String()}}}, out, nil
}

// tidy trims the float noise the backend's double-precision columns carry, such
// as 175.30000000000001, without fixing a number of decimals.
func tidy(value string) string {
	if value == "" {
		return ""
	}
	n, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
		return value
	}
	return strconv.FormatFloat(math.Round(n*1e6)/1e6, 'f', -1, 64)
}
