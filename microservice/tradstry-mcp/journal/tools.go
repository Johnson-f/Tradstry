package journal

import (
	"crypto/rand"
	"reflect"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
)

var enums = map[reflect.Type]*jsonschema.Schema{
	reflect.TypeFor[flatAnswer]():      {Type: "string", Enum: []any{"yes", "no", "not_sure"}},
	reflect.TypeFor[lifecycle]():       {Type: "string", Enum: []any{"open", "closed", "incomplete"}},
	reflect.TypeFor[sortOrder]():       {Type: "string", Enum: []any{"opened", "closed"}},
	reflect.TypeFor[reviewState]():     {Type: "string", Enum: []any{"unreviewed", "in_progress", "reviewed", "outdated"}},
	reflect.TypeFor[planFollowed]():    {Type: "string", Enum: []any{"yes", "partly", "no", "no_plan"}},
	reflect.TypeFor[takeawaySource]():  {Type: "string", Enum: []any{"user_wrote", "user_approved"}},
	reflect.TypeFor[direction]():       {Type: "string", Enum: []any{"long", "short"}},
	reflect.TypeFor[duplicateAnswer](): {Type: "string", Enum: []any{"same", "separate"}},
	reflect.TypeFor[quickChoice](): {Type: "string", Enum: []any{
		"entered_early", "entered_late", "moved_stop", "followed_exit_plan", "exited_early",
		"held_too_long", "sized_well", "oversized", "followed_plan", "no_plan",
	}},
}

func inputSchema[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](&jsonschema.ForOptions{TypeSchemas: enums})
	if err != nil {
		panic(err)
	}
	return schema
}

type tools struct {
	api       api
	confirmer *confirm.Confirmer
	pollEvery time.Duration
	nonce     func() string
	previews  *previews
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{
		api: api{client: client}, confirmer: confirmer, pollEvery: time.Second, nonce: rand.Text,
		previews: &previews{byToken: map[string]preview{}},
	}
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)}
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_journal_status",
		Title: "Journal status",
		Description: "Journal status (is the trade journal on, up to date, broker import). When off, previews what start_journal would produce: " +
			"earlier entries that stay, new trades and trades needing attention, for each answer to whether the account was flat before its first imported execution.",
		Annotations: readOnly,
	}, t.status)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "start_journal",
		Title: "Start journal",
		Description: "Start journal, or correct its starting-history confirmation after it is already on. Ask the user whether the account held no positions before " +
			"its first imported execution and pass their answer; if they are unsure, use not_sure. A yes must be confirmed by the user.",
		InputSchema: inputSchema[startInput](),
		Annotations: write,
	}, t.start)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_trades",
		Title: "List trades",
		Description: "List journal trades (trade history, P&L, filters by state, review, symbol, opened/closed dates, playbook, tag; sort; pagination with cursor; choose fields). " +
			"Also returns journal totals, such as how many closed trades still need review. Money is to the cent.",
		InputSchema: inputSchema[listInput](),
		Annotations: readOnly,
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "export_trades",
		Title: "Export trades",
		Description: "Export journal trades as CSV text (spreadsheet, all matching trades at once, up to 5000 rows). Same filters, sort and fields as list_trades; " +
			"use it instead of paging when you need the whole history.",
		InputSchema: inputSchema[exportInput](),
		Annotations: readOnly,
	}, t.export)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_trade",
		Title:       "Get trade",
		Description: "Get one journal trade (results, broker executions, context (stop, playbook, tags, broken principles, notes) and review draft).",
		Annotations: readOnly,
	}, t.get)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "update_trade_context",
		Title: "Update trade context",
		Description: "Update trade context (stop, playbook, notes, tags, broken principles). Only what is given changes. " +
			"Record what the user tells you; never invent a stop or a plan.",
		InputSchema: inputSchema[contextInput](),
		Annotations: write,
	}, t.updateContext)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "save_trade_review",
		Title: "Save trade review",
		Description: "Save trade review draft (the user's takeaway, quick choices and whether they followed their plan). " +
			"The takeaway must be the user's own words, or a suggestion of yours they explicitly approved word for word; never save one silently.",
		InputSchema: inputSchema[reviewInput](),
		Annotations: write,
	}, t.saveReview)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_trade_reviewed",
		Title:       "Mark trade reviewed",
		Description: "Mark trade reviewed (finish a closed trade's review) once its takeaway is saved. Call only when the user says the review is done.",
		Annotations: write,
	}, t.markReviewed)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "next_trade_to_review",
		Title: "Next trade to review",
		Description: "Next trade to review (daily review walkthrough of one trading day's closed trades, by default the latest day). Returns the current trade with its details " +
			"and the session's progress, and resumes where the user left off.",
		InputSchema: inputSchema[nextInput](),
		Annotations: write,
	}, t.next)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_grouping_suggestions",
		Title: "Grouping suggestions",
		Description: "List grouping suggestions (trades that may be split or combined wrongly, regroup executions). " +
			"A suggestion never applies itself: preview it, show the user, and confirm only if they agree.",
		Annotations: readOnly,
	}, t.listSuggestions)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_suggestion",
		Title:       "Preview suggestion",
		Description: "Preview grouping suggestion (before and after of one suggestion). Changes nothing.",
		Annotations: readOnly,
	}, t.previewSuggestion)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_merge",
		Title:       "Preview merging trades",
		Description: "Preview merging trades (before and after of combining whole trades in the same instrument into one). Changes nothing.",
		Annotations: readOnly,
	}, t.previewMerge)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "preview_direction_fix",
		Title: "Preview direction fix",
		Description: "Preview direction fix (incomplete trade with unknown direction: what it becomes as long or short). " +
			"Use the direction the user states; never guess it. Changes nothing.",
		InputSchema: inputSchema[directionInput](),
		Annotations: readOnly,
	}, t.previewDirection)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_undo_grouping",
		Title:       "Preview undo",
		Description: "Preview undo grouping (before and after of undoing the latest grouping change to a trade). Changes nothing.",
		Annotations: readOnly,
	}, t.previewUndo)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "confirm_grouping_change",
		Title: "Confirm grouping change",
		Description: "Confirm grouping change (apply a previewed merge, split, regroup or undo). The user must approve it: either the app asks them directly, " +
			"or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.confirmGrouping)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "add_manual_trade",
		Title: "Add a manual trade",
		Description: "Add manual trade (record a closed trade made outside a connected broker, with entry, exit, quantity, fees). Use only what the user said: never invent prices, times, stops or fees. " +
			"Works whether or not the journal is on. Calling again with the same details returns the trade already recorded.",
		InputSchema: inputSchema[addManualInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.addManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_manual_trade",
		Title:       "Edit a manual trade",
		Description: "Update manual trade (correct entry, exit, quantity, fees, stop or notes). Broker trades cannot be edited here.",
		InputSchema: inputSchema[updateManualInput](),
		Annotations: write,
	}, t.updateManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_manual_trade",
		Title:       "Delete a manual trade",
		Description: "Delete manual trade, after the user approves: either the app asks them directly, or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.deleteManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "resolve_possible_duplicate",
		Title: "Resolve possible duplicate",
		Description: "Resolve possible duplicate (a manual trade that overlaps a broker trade). It is held out of every total until the user says whether it is the same trade. " +
			"Ask them; never decide for them. same previews merging it into the broker trade (confirm with confirm_grouping_change); " +
			"separate keeps both, after the user approves.",
		InputSchema: inputSchema[resolveDuplicateInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)},
	}, t.resolveDuplicate)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "dismiss_suggestion",
		Title:       "Dismiss suggestion",
		Description: "Dismiss grouping suggestion the user disagrees with. Tradstry learns from it.",
		Annotations: write,
	}, t.dismissSuggestion)
}
