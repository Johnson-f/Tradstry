package analytics

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/graphql"
	"tradstry-mcp/numfmt"
	"tradstry-mcp/oauth"
)

const (
	defaultGroups = 10
	maxGroups     = 25
	maxDailyDays  = 92
)

var errWorkspaceNotFound = errors.New("workspace not found; call list_workspaces for valid IDs")

type dimension string

var enums = map[reflect.Type]*jsonschema.Schema{
	reflect.TypeFor[preset]():    {Type: "string", Enum: presets},
	reflect.TypeFor[dimension](): {Type: "string", Enum: []any{"symbol", "playbook", "tag", "direction", "holding_time", "day_of_week", "session", "position_size"}},
}

func inputSchema[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](&jsonschema.ForOptions{TypeSchemas: enums})
	if err != nil {
		panic(err)
	}
	return schema
}

type periodView struct {
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
	Timezone string `json:"timezone"`
	Label    string `json:"label"`
}

type coverage struct {
	TradesCounted      int    `json:"trades_counted" jsonschema:"closed trades with known results in the period"`
	ManualTrades       int    `json:"manual_trades_included,omitempty" jsonschema:"manually entered trades among them"`
	ManualWithoutFees  int    `json:"manual_trades_without_fees,omitempty" jsonschema:"manual trades with no fees entered, so their results are before fees"`
	OpenNotCounted     int    `json:"open_positions_not_counted,omitempty" jsonschema:"open positions, in the whole workspace"`
	NeedsReview        int    `json:"trades_waiting_for_the_user,omitempty" jsonschema:"trades left out until the user resolves them, possible duplicates included"`
	PossibleDuplicates int    `json:"possible_duplicates,omitempty" jsonschema:"manual trades that may repeat a broker trade; resolve with resolve_possible_duplicate"`
	Note               string `json:"note"`
}

type common struct {
	Playbook string     `json:"playbook,omitempty" jsonschema:"only trades that used this playbook were counted"`
	Tag      string     `json:"tag,omitempty" jsonschema:"only trades carrying this tag were counted"`
	Period   periodView `json:"period"`
	Currency string     `json:"currency"`
	Coverage coverage   `json:"coverage"`
}

type groupView struct {
	Name         string   `json:"name"`
	Trades       int      `json:"trades"`
	NetProfit    float64  `json:"net_profit"`
	WinRate      *float64 `json:"win_rate" jsonschema:"percent of wins among wins and losses; breakeven trades are left out; null when there were no trades"`
	Expectancy   *float64 `json:"expectancy" jsonschema:"average result per trade; null when there were no trades"`
	ProfitFactor *float64 `json:"profit_factor" jsonschema:"gross wins divided by gross losses; null when undefined: no trades, or no losing trades"`
}

type tools struct {
	api api
	now func() time.Time
}

func Register(server *mcp.Server, client *graphql.Client) {
	t := &tools{api: api{client: client}, now: time.Now}
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: new(false)}
	results := " Quote money in the given currency, mention the coverage note, and call unknown values unknown, never zero."

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_performance",
		Title:       "Trading performance",
		Description: "Get trading performance (P&L, statistics) for a period: net profit, win rate, profit factor, average win and loss, expectancy, drawdown, streaks and holding times." + results,
		InputSchema: inputSchema[performanceInput](),
		Annotations: readOnly,
	}, t.performance)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_daily_pnl",
		Title:       "Daily P&L",
		Description: "Get daily P&L (profit and loss per trading day), at most 92 days. Days are counted in the journal's time zone and add up to the period total." + results,
		InputSchema: inputSchema[performanceInput](),
		Annotations: readOnly,
	}, t.daily)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_breakdown",
		Title: "Performance breakdown",
		Description: "Get performance broken down one way (grouped by symbol, playbook, tag, direction, holding time, weekday, market session or position size). " +
			"Best groups first; when cut short, the worst ones are kept too." + results,
		InputSchema: inputSchema[breakdownInput](),
		Annotations: readOnly,
	}, t.breakdown)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_mistake_costs",
		Title: "Mistake costs",
		Description: "List mistake costs: the user's mistake tags and broken trading principles in a period, worst first, with the trades that had each. " +
			"A mistake's figure is what those trades netted, not money lost because of the mistake; say it that way." + results,
		InputSchema: inputSchema[performanceInput](),
		Annotations: readOnly,
	}, t.mistakes)
}

type performanceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Playbook    string `json:"playbook,omitempty" jsonschema:"only trades that used this playbook, by name or ID from list_playbooks"`
	Tag         string `json:"tag,omitempty" jsonschema:"only trades carrying this tag, by name or ID from list_tags"`
	periodInput
}

type breakdownInput struct {
	WorkspaceID string    `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	By          dimension `json:"by" jsonschema:"how to group the trades"`
	Limit       int       `json:"limit,omitempty" jsonschema:"groups to return, at most 25; defaults to 10"`
	Playbook    string    `json:"playbook,omitempty" jsonschema:"only trades that used this playbook, by name or ID from list_playbooks"`
	Tag         string    `json:"tag,omitempty" jsonschema:"only trades carrying this tag, by name or ID from list_tags"`
	periodInput
}

// prepare resolves everything an answer needs before the analytics call.
func (t *tools) prepare(ctx context.Context, req *mcp.CallToolRequest, ws string, in periodInput, playbook, tag string) (string, workspaceContext, window, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return "", workspaceContext{}, window{}, err
	}
	wc, err := t.api.context(ctx, caller.Token, ws)
	if err != nil {
		if errors.Is(err, errWorkspaceNotFound) {
			return "", workspaceContext{}, window{}, err
		}
		return "", workspaceContext{}, window{}, graphql.ForUser(err)
	}
	w, err := resolvePeriod(in, t.now(), wc.Location)
	if err == nil && playbook != "" {
		w.playbookID, w.playbookName, err = t.playbook(ctx, caller.Token, ws, playbook)
	}
	if err == nil && tag != "" {
		w.tagID, w.tagName, err = t.tag(ctx, caller.Token, ws, tag)
	}
	return caller.Token, wc, w, err
}

// tag resolves a tag given by ID or by name.
func (t *tools) tag(ctx context.Context, token, ws, given string) (string, string, error) {
	tags, err := t.api.tags(ctx, token, ws)
	if err != nil {
		return "", "", graphql.ForUser(err)
	}
	given = strings.TrimSpace(given)
	var matches []named
	for _, tg := range tags {
		if tg.ID == given {
			return tg.ID, tg.Name, nil
		}
		if strings.EqualFold(tg.Name, given) {
			matches = append(matches, tg)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0].ID, matches[0].Name, nil
	case 0:
		return "", "", fmt.Errorf("there is no tag %q; list_tags shows them", given)
	}
	return "", "", fmt.Errorf("%q is the name of more than one tag; pass its ID from list_tags", given)
}

// playbook resolves a playbook given by ID or by name.
func (t *tools) playbook(ctx context.Context, token, ws, given string) (string, string, error) {
	playbooks, _, err := t.api.names(ctx, token, ws)
	if err != nil {
		return "", "", graphql.ForUser(err)
	}
	given = strings.TrimSpace(given)
	var names []string
	for id, name := range playbooks {
		if id == given || strings.EqualFold(name, given) {
			return id, name, nil
		}
		names = append(names, name)
	}
	slices.Sort(names)
	if len(names) == 0 {
		return "", "", fmt.Errorf("there is no playbook %q; this workspace has no playbooks", given)
	}
	return "", "", fmt.Errorf("there is no playbook %q; the playbooks are: %s", given, strings.Join(names, ", "))
}

// describe builds the period, currency and coverage every answer carries.
func describe(wc workspaceContext, w window, a analytics) common {
	cv := a.Coverage
	out := common{
		Playbook: w.playbookName,
		Tag:      w.tagName,
		Period:   periodView{Timezone: wc.Location.String(), Label: w.label},
		Currency: wc.Currency,
		Coverage: coverage{
			TradesCounted: a.TradeCount, ManualTrades: cv.ManualTrades, ManualWithoutFees: cv.ManualWithoutFees, OpenNotCounted: cv.OpenPositions,
			NeedsReview: cv.NeedsReview, PossibleDuplicates: cv.PossibleDuplicates,
			Note: "Counts closed trades with known results.",
		},
	}
	if !w.all {
		out.Period.From, out.Period.To = w.first.Format(time.DateOnly), w.last.Format(time.DateOnly)
	}
	if cv.ManualTrades > 0 {
		out.Coverage.Note += fmt.Sprintf(" Includes %d manually entered trades.", cv.ManualTrades)
	}
	if cv.ManualWithoutFees > 0 {
		out.Coverage.Note += fmt.Sprintf(" %d of them have no fees entered, so their results are before fees.", cv.ManualWithoutFees)
	}
	if cv.OpenPositions > 0 {
		out.Coverage.Note += " Open positions are not counted."
	}
	if cv.PossibleDuplicates > 0 {
		out.Coverage.Note += fmt.Sprintf(" %d manual trades may repeat a broker trade and are left out until the user says whether they are the same trade (list_trades shows them; resolve with resolve_possible_duplicate).", cv.PossibleDuplicates)
	}
	if other := cv.NeedsReview - cv.PossibleDuplicates; other > 0 {
		out.Coverage.Note += fmt.Sprintf(" %d trades with missing or unclear history are left out until fixed in the journal.", other)
	}
	return out
}

// whenTraded is nil when no trade was counted, since averages over nothing are unknown rather than zero.
func whenTraded(trades int, value float64) *float64 {
	if trades == 0 {
		return nil
	}
	return &value
}

// profitFactor is nil when undefined: no trades, or no losing trades.
func profitFactor(trades int, factor *float64) *float64 {
	if trades == 0 || factor == nil {
		return nil
	}
	return numfmt.Ratio(*factor)
}

func viewOf(name string, m metrics) groupView {
	return groupView{
		Name: name, Trades: m.TradeCount, NetProfit: numfmt.Round2(m.NetProfit),
		WinRate:      whenTraded(m.TradeCount, numfmt.Round1(m.WinRate)),
		Expectancy:   whenTraded(m.TradeCount, numfmt.Round2(m.ExpectancyDollars)),
		ProfitFactor: profitFactor(m.TradeCount, m.ProfitFactor),
	}
}

// bestAndWorst sorts groups by net profit and, when there are more than limit,
// keeps both ends so the losers are not cut off.
func bestAndWorst(groups []groupView, limit int) ([]groupView, bool) {
	slices.SortStableFunc(groups, func(a, b groupView) int {
		switch {
		case a.NetProfit > b.NetProfit:
			return -1
		case a.NetProfit < b.NetProfit:
			return 1
		}
		return strings.Compare(a.Name, b.Name)
	})
	if len(groups) <= limit {
		return groups, false
	}
	best := (limit + 1) / 2
	return append(groups[:best:best], groups[len(groups)-(limit-best):]...), true
}

type performanceOutput struct {
	common
	Trades          int      `json:"trades"`
	NetProfit       float64  `json:"net_profit"`
	WinRate         *float64 `json:"win_rate" jsonschema:"percent of wins among wins and losses; breakeven trades are left out; null when there were no trades"`
	ProfitFactor    *float64 `json:"profit_factor" jsonschema:"gross wins divided by gross losses; null when undefined: no trades, or no losing trades"`
	AverageWin      float64  `json:"average_win"`
	AverageLoss     float64  `json:"average_loss" jsonschema:"a positive amount"`
	Expectancy      *float64 `json:"expectancy" jsonschema:"average result per trade; null when there were no trades"`
	MaxDrawdown     float64  `json:"max_drawdown"`
	CurrentDrawdown float64  `json:"current_drawdown"`
	CurrentStreak   int      `json:"current_streak" jsonschema:"positive for consecutive wins, negative for losses"`
	LongestWinning  int      `json:"longest_winning_streak"`
	LongestLosing   int      `json:"longest_losing_streak"`
	AvgHoldWinners  string   `json:"average_hold_winners,omitempty"`
	AvgHoldLosers   string   `json:"average_hold_losers,omitempty"`
	BestDay         *dayView `json:"best_day,omitempty"`
	WorstDay        *dayView `json:"worst_day,omitempty"`
	R               string   `json:"r" jsonschema:"average R-multiple and how many trades it covers, or why it is unknown"`
}

type dayView struct {
	Date      string  `json:"date"`
	NetProfit float64 `json:"net_profit"`
	Trades    int     `json:"trades"`
}

func duration(seconds *float64) string {
	if seconds == nil {
		return ""
	}
	return (time.Duration(*seconds) * time.Second).Round(time.Minute).String()
}

func (t *tools) performance(ctx context.Context, req *mcp.CallToolRequest, in performanceInput) (*mcp.CallToolResult, performanceOutput, error) {
	token, wc, w, err := t.prepare(ctx, req, in.WorkspaceID, in.periodInput, in.Playbook, in.Tag)
	if err != nil {
		return nil, performanceOutput{}, err
	}
	a, err := t.api.analytics(ctx, token, in.WorkspaceID, performanceQuery, w)
	if err != nil {
		return nil, performanceOutput{}, graphql.ForUser(err)
	}
	c := describe(wc, w, a)
	out := performanceOutput{
		common: c, Trades: a.TradeCount, NetProfit: numfmt.Round2(a.NetProfit), WinRate: whenTraded(a.TradeCount, numfmt.Round1(a.WinRate)),
		AverageWin: numfmt.Round2(a.AverageGain), AverageLoss: numfmt.Round2(a.AverageLoss), Expectancy: whenTraded(a.TradeCount, numfmt.Round2(a.ExpectancyDollars)),
		ProfitFactor: profitFactor(a.TradeCount, a.ProfitFactor),
		MaxDrawdown:  numfmt.Round2(a.MaxDrawdownDollars), CurrentDrawdown: numfmt.Round2(a.CurrentDrawdownDollars),
		CurrentStreak: a.CurrentStreak, LongestWinning: a.LongestWinStreak, LongestLosing: a.LongestLossStreak,
		AvgHoldWinners: duration(a.AvgHoldWinnersSecs), AvgHoldLosers: duration(a.AvgHoldLosersSecs),
		R: "unknown: no trade in this period had a stop in place when it opened or set while it was open",
	}
	if a.ExpectancyR != nil && a.RTradeCount > 0 {
		out.R = fmt.Sprintf("%.2fR on average, for %d of %d trades, measured against the stop in place when each trade opened", *a.ExpectancyR, a.RTradeCount, a.TradeCount)
		if a.RTypedStopCount > 0 {
			out.R += fmt.Sprintf("; %d of them use the stop typed with a manual trade, so when it was set is unknown", a.RTypedStopCount)
		}
	}
	for _, d := range a.ByDay {
		day := &dayView{Date: d.Key, NetProfit: numfmt.Round2(d.Metrics.NetProfit), Trades: d.Metrics.TradeCount}
		if out.BestDay == nil || day.NetProfit > out.BestDay.NetProfit {
			out.BestDay = day
		}
		if out.WorstDay == nil || day.NetProfit < out.WorstDay.NetProfit {
			out.WorstDay = day
		}
	}
	return nil, out, nil
}

type dailyOutput struct {
	common
	NetProfit float64     `json:"net_profit"`
	Days      []groupView `json:"days" jsonschema:"one per day with closed trades, oldest first; days without trades are left out"`
}

func (t *tools) daily(ctx context.Context, req *mcp.CallToolRequest, in performanceInput) (*mcp.CallToolResult, dailyOutput, error) {
	token, wc, w, err := t.prepare(ctx, req, in.WorkspaceID, in.periodInput, in.Playbook, in.Tag)
	if err != nil {
		return nil, dailyOutput{}, err
	}
	if w.all || w.days() > maxDailyDays {
		return nil, dailyOutput{}, fmt.Errorf("daily P&L covers at most %d days; choose a shorter period", maxDailyDays)
	}
	a, err := t.api.analytics(ctx, token, in.WorkspaceID, dailyQuery, w)
	if err != nil {
		return nil, dailyOutput{}, graphql.ForUser(err)
	}
	c := describe(wc, w, a)
	out := dailyOutput{common: c, NetProfit: numfmt.Round2(a.NetProfit), Days: make([]groupView, 0, len(a.ByDay))}
	for _, d := range a.ByDay {
		out.Days = append(out.Days, viewOf(d.Key, d.Metrics))
	}
	return nil, out, nil
}

type breakdownOutput struct {
	common
	By        string      `json:"by"`
	Groups    []groupView `json:"groups"`
	CutShort  bool        `json:"cut_short,omitempty" jsonschema:"only the best and worst groups are shown"`
	AllGroups int         `json:"all_groups"`
	Note      string      `json:"note,omitempty"`
}

func (t *tools) breakdown(ctx context.Context, req *mcp.CallToolRequest, in breakdownInput) (*mcp.CallToolResult, breakdownOutput, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = defaultGroups
	}
	if limit > maxGroups {
		return nil, breakdownOutput{}, fmt.Errorf("limit can be at most %d", maxGroups)
	}
	token, wc, w, err := t.prepare(ctx, req, in.WorkspaceID, in.periodInput, in.Playbook, in.Tag)
	if err != nil {
		return nil, breakdownOutput{}, err
	}
	a, err := t.api.analytics(ctx, token, in.WorkspaceID, breakdownQuery(string(in.By)), w)
	if err != nil {
		return nil, breakdownOutput{}, graphql.ForUser(err)
	}
	c := describe(wc, w, a)

	var groups []groupView
	out := breakdownOutput{common: c, By: string(in.By)}
	add := func(raw []group, rename func(string) string) {
		for _, g := range raw {
			groups = append(groups, viewOf(rename(g.Key), g.Metrics))
		}
	}
	same := func(key string) string { return key }
	switch in.By {
	case "symbol":
		add(a.BySymbol, same)
	case "direction":
		add(a.ByDirection, same)
	case "holding_time":
		add(a.ByHolding, func(key string) string {
			return map[string]string{"scalp": "under a day", "swing": "1 to 5 days", "position": "over 5 days"}[key] + orKey(key)
		})
	case "day_of_week":
		add(a.ByDayOfWeek, same)
	case "session":
		add(a.BySession, same)
		out.Note = "Sessions are on New York market hours: premarket before 9:30, morning to 12:00, afternoon to 16:00, then after hours."
	case "position_size":
		add(a.ByPositionSize, func(key string) string { return key + " shares or contracts" })
	case "playbook":
		playbooks, _, err := t.api.names(ctx, token, in.WorkspaceID)
		if err != nil {
			return nil, breakdownOutput{}, graphql.ForUser(err)
		}
		add(a.ByPlaybook, func(id string) string {
			if id == "none" {
				return "no playbook"
			}
			return nameOr(playbooks[id], "a deleted playbook")
		})
	case "tag":
		for _, cat := range a.TagBreakdowns {
			add(cat.Tags, func(tag string) string { return cat.CategoryName + ": " + tag })
		}
		out.Note = "A trade with several tags counts toward each of them, so groups can add up to more than the total."
	default:
		return nil, breakdownOutput{}, fmt.Errorf("unknown breakdown %q", in.By)
	}
	out.AllGroups = len(groups)
	out.Groups, out.CutShort = bestAndWorst(groups, limit)
	if out.Groups == nil {
		out.Groups = []groupView{}
	}
	return nil, out, nil
}

// orKey keeps an unexpected bucket name readable instead of blank.
func orKey(key string) string {
	switch key {
	case "scalp", "swing", "position":
		return ""
	}
	return key
}

func nameOr(name, fallback string) string {
	if name == "" {
		return fallback
	}
	return name
}

type mistakeView struct {
	Kind string `json:"kind" jsonschema:"tag or principle"`
	groupView
}

type mistakesOutput struct {
	common
	Mistakes         []mistakeView `json:"mistakes" jsonschema:"worst net result first"`
	FlawedTrades     int           `json:"trades_with_a_mistake_tag"`
	CleanExpectancy  *float64      `json:"clean_trade_expectancy" jsonschema:"average result of trades without a mistake tag; null when there were none"`
	FlawedExpectancy *float64      `json:"flawed_trade_expectancy" jsonschema:"null when no trade had a mistake tag"`
	ShortfallVsClean float64       `json:"shortfall_vs_clean_trades" jsonschema:"how much less the trades with mistake tags made than if they had averaged like the clean ones"`
	Note             string        `json:"note"`
}

func (t *tools) mistakes(ctx context.Context, req *mcp.CallToolRequest, in performanceInput) (*mcp.CallToolResult, mistakesOutput, error) {
	token, wc, w, err := t.prepare(ctx, req, in.WorkspaceID, in.periodInput, in.Playbook, in.Tag)
	if err != nil {
		return nil, mistakesOutput{}, err
	}
	a, err := t.api.analytics(ctx, token, in.WorkspaceID, mistakesQuery, w)
	if err != nil {
		return nil, mistakesOutput{}, graphql.ForUser(err)
	}
	c := describe(wc, w, a)
	_, principles, err := t.api.names(ctx, token, in.WorkspaceID)
	if err != nil {
		return nil, mistakesOutput{}, graphql.ForUser(err)
	}

	out := mistakesOutput{
		common: c, Mistakes: []mistakeView{},
		FlawedTrades:     a.Discipline.FlawedTradeCount,
		CleanExpectancy:  whenTraded(a.CleanVsFlawed.Clean.TradeCount, numfmt.Round2(a.CleanVsFlawed.Clean.ExpectancyDollars)),
		FlawedExpectancy: whenTraded(a.CleanVsFlawed.Flawed.TradeCount, numfmt.Round2(a.CleanVsFlawed.Flawed.ExpectancyDollars)),
		ShortfallVsClean: numfmt.Round2(a.Discipline.MistakeCost),
		Note: "Each figure is what the trades with that mistake netted, not money lost because of it. " +
			"A trade with several mistakes counts toward each.",
	}
	for _, cat := range a.TagBreakdowns {
		if cat.Role == nil || *cat.Role != "mistake" {
			continue
		}
		for _, g := range cat.Tags {
			out.Mistakes = append(out.Mistakes, mistakeView{"tag", viewOf(g.Key, g.Metrics)})
		}
	}
	for _, g := range a.ByViolatedPrinciple {
		out.Mistakes = append(out.Mistakes, mistakeView{"principle", viewOf(nameOr(principles[g.Key], "a deleted principle"), g.Metrics)})
	}
	slices.SortStableFunc(out.Mistakes, func(x, y mistakeView) int {
		switch {
		case x.NetProfit < y.NetProfit:
			return -1
		case x.NetProfit > y.NetProfit:
			return 1
		}
		return strings.Compare(x.Name, y.Name)
	})
	if out.CleanExpectancy == nil && out.FlawedTrades == a.TradeCount && a.TradeCount > 0 {
		out.Note += " Every trade had a mistake tag, so there is no clean average to compare against."
	}
	return nil, out, nil
}
