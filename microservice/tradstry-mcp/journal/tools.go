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
	reflect.TypeFor[reviewState]():     {Type: "string", Enum: []any{"unreviewed", "reviewed", "outdated"}},
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
		Description: "Whether the workspace's journal is on and up to date. When it is off, shows how many trades starting it would create, " +
			"depending on whether the account was flat before its first imported execution.",
		Annotations: readOnly,
	}, t.status)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "start_journal",
		Title: "Start journal",
		Description: "Turn on the journal so broker executions become trades. Ask the user whether the account held no positions before " +
			"its first imported execution and pass their answer; if they are unsure, use not_sure. A yes must be confirmed by the user.",
		InputSchema: inputSchema[startInput](),
		Annotations: write,
	}, t.start)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_trades",
		Title:       "List trades",
		Description: "List journal trades, newest first, with filters. Also returns totals, such as how many closed trades still need review.",
		InputSchema: inputSchema[listInput](),
		Annotations: readOnly,
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_trade",
		Title:       "Get trade",
		Description: "One trade's results, broker executions, context (stop, playbook, tags, broken principles, notes) and review draft.",
		Annotations: readOnly,
	}, t.get)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "update_trade_context",
		Title: "Update trade context",
		Description: "Record the trade's stop, playbook, notes, tags or broken principles. Only what is given changes. " +
			"Record what the user tells you; never invent a stop or a plan.",
		InputSchema: inputSchema[contextInput](),
		Annotations: write,
	}, t.updateContext)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "save_trade_review",
		Title: "Save trade review",
		Description: "Save the user's review draft: their takeaway, quick choices and whether they followed their plan. " +
			"The takeaway must be the user's own words, or a suggestion of yours they explicitly approved word for word; never save one silently.",
		InputSchema: inputSchema[reviewInput](),
		Annotations: write,
	}, t.saveReview)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_trade_reviewed",
		Title:       "Mark trade reviewed",
		Description: "Finish reviewing a closed trade once its takeaway is saved. Call only when the user says the review is done.",
		Annotations: write,
	}, t.markReviewed)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "next_trade_to_review",
		Title: "Next trade to review",
		Description: "Walk through one trading day's closed trades, by default the latest day. Returns the current trade with its details " +
			"and the session's progress, and resumes where the user left off.",
		InputSchema: inputSchema[nextInput](),
		Annotations: write,
	}, t.next)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_grouping_suggestions",
		Title: "Grouping suggestions",
		Description: "Tradstry's suggestions for trades that may be split or combined wrongly. " +
			"A suggestion never applies itself: preview it, show the user, and confirm only if they agree.",
		Annotations: readOnly,
	}, t.listSuggestions)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_suggestion",
		Title:       "Preview suggestion",
		Description: "Show the before and after of a grouping suggestion. Changes nothing.",
		Annotations: readOnly,
	}, t.previewSuggestion)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_merge",
		Title:       "Preview merging trades",
		Description: "Show the before and after of combining whole trades in the same instrument into one. Changes nothing.",
		Annotations: readOnly,
	}, t.previewMerge)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "preview_direction_fix",
		Title: "Preview direction fix",
		Description: "For an incomplete trade whose direction is unknown, show what it becomes as long or short. " +
			"Use the direction the user states; never guess it. Changes nothing.",
		InputSchema: inputSchema[directionInput](),
		Annotations: readOnly,
	}, t.previewDirection)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "preview_undo_grouping",
		Title:       "Preview undo",
		Description: "Show the before and after of undoing the latest grouping change to a trade. Changes nothing.",
		Annotations: readOnly,
	}, t.previewUndo)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "confirm_grouping_change",
		Title: "Confirm grouping change",
		Description: "Apply a previewed grouping change. The user must approve it: either the app asks them directly, " +
			"or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.confirmGrouping)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "add_manual_trade",
		Title: "Add a manual trade",
		Description: "Record a closed trade the user made outside a connected broker. Use only what the user said: never invent prices, times, stops or fees. " +
			"Works whether or not the journal is on. Calling again with the same details returns the trade already recorded.",
		InputSchema: inputSchema[addManualInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.addManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_manual_trade",
		Title:       "Edit a manual trade",
		Description: "Change only the details the user corrects on a manual trade. Broker trades cannot be edited here.",
		InputSchema: inputSchema[updateManualInput](),
		Annotations: write,
	}, t.updateManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_manual_trade",
		Title:       "Delete a manual trade",
		Description: "Delete a manual trade after the user approves: either the app asks them directly, or this returns needs_confirmation with a token to pass back only after the user agrees.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.deleteManual)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "resolve_possible_duplicate",
		Title: "Resolve possible duplicate",
		Description: "A manual trade that overlaps a broker trade is held out of every total until the user says whether it is the same trade. " +
			"Ask them; never decide for them. same previews merging it into the broker trade (confirm with confirm_grouping_change); " +
			"separate keeps both, after the user approves.",
		InputSchema: inputSchema[resolveDuplicateInput](),
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)},
	}, t.resolveDuplicate)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "dismiss_suggestion",
		Title:       "Dismiss suggestion",
		Description: "Reject a grouping suggestion the user disagrees with. Tradstry learns from it.",
		Annotations: write,
	}, t.dismissSuggestion)
}
