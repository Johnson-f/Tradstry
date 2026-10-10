package notebook

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
)

const markdownGuide = "Notes are Tradstry Markdown: Markdown with tables, - [ ] check lists and --- dividers, plus " +
	"![alt](media:<hash>) for an image or video already in the user's notebook, [label](trade:<id>) for a trade chip, " +
	"and a ```trades <label> fenced block of trade IDs for a trade table."

type tools struct {
	api       api
	confirmer *confirm.Confirmer
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{api: api{client: client}, confirmer: confirmer}
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)}
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_folders",
		Title:       "List notebook folders",
		Description: "The workspace's notebook folders as a tree, with each folder's path and how many notes sit directly in it.",
		Annotations: readOnly,
	}, t.listFolders)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_notes",
		Title: "List notes",
		Description: "Notes without their bodies, pinned first then most recently updated, 25 at a time. " +
			"Filter by folder, unfiled, starred, pinned or a linked trade; pass next_cursor to continue.",
		Annotations: readOnly,
	}, t.listNotes)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "get_note",
		Title: "Read note",
		Description: "A note's body as Tradstry Markdown, with the revision to pass when editing it, its linked trades and its media. " +
			"Blocks Markdown cannot carry appear as <!-- tradstry:keep … --> lines: leave them exactly as they are. " + markdownGuide,
		Annotations: readOnly,
	}, t.getNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "search_notes",
		Title: "Search notes",
		Description: "Find notes by what they say, not just their titles, best match first. " +
			"A note saved in the last minute or so may not be searchable yet.",
		Annotations: readOnly,
	}, t.searchNotes)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "view_note_media",
		Title:       "View note image",
		Description: "Show an image from a note so you can describe it. Videos return their thumbnail. Pass a hash from get_note's media list.",
		Annotations: readOnly,
	}, t.viewMedia)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_deleted_notes",
		Title:       "Recently deleted notes",
		Description: "Notes deleted in the last 30 days, which restore_note can bring back.",
		Annotations: readOnly,
	}, t.listDeleted)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "create_note",
		Title: "Create note",
		Description: "Create a note. It is unfiled unless folder_id is given. Retrying the identical call returns the same note. " +
			"Write only what the user asked for. " + markdownGuide,
		Annotations: write,
	}, t.createNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "edit_note",
		Title: "Edit note",
		Description: "Change parts of a note. Each old_text must appear exactly once in get_note's markdown; include enough " +
			"surrounding text to make it unique. Only the blocks you change are rewritten, so the user's formatting elsewhere is kept. " +
			"Prefer this to rewrite_note.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.editNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "append_to_note",
		Title:       "Append to note",
		Description: "Add Markdown to the end of a note. Nothing already there changes.",
		Annotations: write,
	}, t.appendToNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "rewrite_note",
		Title: "Rewrite note",
		Description: "Replace a note's whole body with new Markdown, sent complete. Blocks that come out the same are kept as they were, " +
			"with their formatting; keep every <!-- tradstry:keep … --> line you do not mean to delete.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.rewriteNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "update_note",
		Title: "Update note",
		Description: "Rename a note, star or pin it, move it to a folder or out of every folder, and link or unlink trades. " +
			"Fields left out stay as they are.",
		Annotations: write,
	}, t.updateNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_note",
		Title: "Delete note",
		Description: "Delete a note. The user must confirm first: either the app asks them, or this returns needs_confirmation " +
			"with a token to pass back only after they agree. It can be restored for 30 days.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.deleteNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "restore_note",
		Title:       "Restore note",
		Description: "Bring back a note deleted in the last 30 days. If its folder was deleted too, it comes back unfiled.",
		Annotations: write,
	}, t.restoreNote)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_folder",
		Title:       "Create folder",
		Description: "Create a notebook folder, at the top level or inside parent_id.",
		Annotations: write,
	}, t.createFolder)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "rename_folder",
		Title:       "Rename folder",
		Description: "Rename a notebook folder. System folders cannot be renamed.",
		Annotations: write,
	}, t.renameFolder)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "move_folder",
		Title:       "Move folder",
		Description: "Move a folder inside another folder, or to the top level.",
		Annotations: write,
	}, t.moveFolder)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_folder",
		Title: "Delete folder",
		Description: "Delete a folder with its subfolders and notes. The user must confirm first. " +
			"Its notes can be restored one by one for 30 days.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)},
	}, t.deleteFolder)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "open_trade_note",
		Title: "Open a trade's note",
		Description: "The note that belongs to a journal trade, created on first use in the Recent Trades folder. " +
			"Use it to record thoughts about one trade.",
		Annotations: write,
	}, t.openTradeNote)
}
