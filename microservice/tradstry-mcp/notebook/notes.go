package notebook

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
)

const unfiled = "Unfiled"

type linkedTrade struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type mediaView struct {
	Hash     string  `json:"hash"`
	Type     string  `json:"type" jsonschema:"image or video"`
	Width    int     `json:"width,omitempty"`
	Height   int     `json:"height,omitempty"`
	Bytes    int64   `json:"bytes"`
	Filename string  `json:"filename,omitempty"`
	Seconds  float64 `json:"duration_seconds,omitempty"`
}

type noteView struct {
	ID           string        `json:"id"`
	WorkspaceID  string        `json:"workspace_id"`
	Title        string        `json:"title"`
	Folder       string        `json:"folder" jsonschema:"the folder's path, or Unfiled"`
	FolderID     string        `json:"folder_id,omitempty"`
	Markdown     string        `json:"markdown"`
	Revision     string        `json:"revision" jsonschema:"pass to edit_note or rewrite_note"`
	Placeholders int           `json:"placeholders,omitempty" jsonschema:"blocks shown as <!-- tradstry:keep … --> lines"`
	Starred      bool          `json:"starred"`
	Pinned       bool          `json:"pinned"`
	UpdatedAt    string        `json:"updated_at"`
	LinkedTrades []linkedTrade `json:"linked_trades"`
	Media        []mediaView   `json:"media"`
}

type savedView struct {
	ID             string        `json:"id"`
	Title          string        `json:"title"`
	Folder         string        `json:"folder"`
	Revision       string        `json:"revision" jsonschema:"the note's revision after this change"`
	Placeholders   int           `json:"placeholders,omitempty"`
	Changes        *changesView  `json:"changes,omitempty"`
	FormattingLost []string      `json:"formatting_lost,omitempty" jsonschema:"formatting Markdown cannot express that was dropped from rewritten blocks; tell the user"`
	Replayed       bool          `json:"replayed,omitempty" jsonschema:"true when this exact change had already been applied"`
	Starred        bool          `json:"starred"`
	Pinned         bool          `json:"pinned"`
	LinkedTrades   []linkedTrade `json:"linked_trades"`
}

type changesView struct {
	Kept     int `json:"kept"`
	Changed  int `json:"changed"`
	Inserted int `json:"inserted"`
	Removed  int `json:"removed"`
}

func (t *tools) folderPaths(ctx context.Context, token, ws string) (map[string]string, error) {
	folders, _, err := t.api.folders(ctx, token, ws)
	if err != nil {
		return nil, err
	}
	return paths(folders), nil
}

func paths(folders []folder) map[string]string {
	byID := map[string]folder{}
	for _, f := range folders {
		byID[f.ID] = f
	}
	out := map[string]string{}
	for _, f := range folders {
		var parts []string
		seen := map[string]bool{}
		for at, ok := f, true; ok && !seen[at.ID]; {
			seen[at.ID] = true
			parts = append([]string{at.Name}, parts...)
			if at.ParentFolderID == nil {
				break
			}
			at, ok = byID[*at.ParentFolderID]
		}
		out[f.ID] = strings.Join(parts, " / ")
	}
	return out
}

func folderName(paths map[string]string, id *string) string {
	if id == nil {
		return unfiled
	}
	if path, ok := paths[*id]; ok {
		return path
	}
	return *id
}

func toNoteView(d document, paths map[string]string) noteView {
	v := noteView{
		ID: d.ID, WorkspaceID: d.WorkspaceID, Title: d.Title, Folder: folderName(paths, d.FolderID),
		Markdown: d.Markdown, Revision: d.Revision, Placeholders: d.Placeholders,
		Starred: d.IsStarred, Pinned: d.IsPinned, UpdatedAt: d.UpdatedAt,
		LinkedTrades: links(d), Media: make([]mediaView, 0, len(d.Media)),
	}
	if d.FolderID != nil {
		v.FolderID = *d.FolderID
	}
	for _, m := range d.Media {
		v.Media = append(v.Media, mediaView{
			Hash: m.Hash, Type: m.MediaType, Width: m.Width, Height: m.Height,
			Bytes: m.Bytes, Filename: m.OriginalFilename, Seconds: m.DurationSeconds,
		})
	}
	return v
}

func links(d document) []linkedTrade {
	out := make([]linkedTrade, 0, len(d.LinkedTrades))
	for _, l := range d.LinkedTrades {
		out = append(out, linkedTrade(l))
	}
	return out
}

func toSavedView(d document, paths map[string]string) savedView {
	return savedView{
		ID: d.ID, Title: d.Title, Folder: folderName(paths, d.FolderID), Revision: d.Revision,
		Placeholders: d.Placeholders, Starred: d.IsStarred, Pinned: d.IsPinned, LinkedTrades: links(d),
	}
}

func (t *tools) saved(ctx context.Context, token string, r editResult) (savedView, error) {
	paths, err := t.folderPaths(ctx, token, r.Note.WorkspaceID)
	if err != nil {
		return savedView{}, err
	}
	v := toSavedView(r.Note, paths)
	v.Changes = &changesView{Kept: r.Changes.Kept, Changed: r.Changes.Changed, Inserted: r.Changes.Inserted, Removed: r.Changes.Removed}
	v.FormattingLost = r.FormattingLost
	v.Replayed = r.Replayed
	return v, nil
}

type noteInput struct {
	NoteID string `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
}

func (t *tools) getNote(ctx context.Context, req *mcp.CallToolRequest, in noteInput) (*mcp.CallToolResult, noteView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, noteView{}, err
	}
	d, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, noteView{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, d.WorkspaceID)
	if err != nil {
		return nil, noteView{}, forUser(err)
	}
	return nil, toNoteView(d, paths), nil
}

type listNotesInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	FolderID    string `json:"folder_id,omitempty" jsonschema:"only notes directly in this folder"`
	Unfiled     bool   `json:"unfiled,omitempty" jsonschema:"only notes in no folder"`
	Starred     *bool  `json:"starred,omitempty" jsonschema:"true for starred notes only, false for the rest"`
	Pinned      *bool  `json:"pinned,omitempty" jsonschema:"true for pinned notes only, false for the rest"`
	TradeID     string `json:"trade_id,omitempty" jsonschema:"only notes linked to this trade"`
	Cursor      string `json:"cursor,omitempty" jsonschema:"next_cursor from the previous page"`
}

type noteSummary struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Folder       string   `json:"folder"`
	Preview      string   `json:"preview"`
	Starred      bool     `json:"starred"`
	Pinned       bool     `json:"pinned"`
	LinkedTrades []string `json:"linked_trade_ids"`
	UpdatedAt    string   `json:"updated_at"`
}

type listNotesOutput struct {
	Notes      []noteSummary `json:"notes"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func (t *tools) listNotes(ctx context.Context, req *mcp.CallToolRequest, in listNotesInput) (*mcp.CallToolResult, listNotesOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, listNotesOutput{}, err
	}
	if in.FolderID != "" && in.Unfiled {
		return nil, listNotesOutput{}, errors.New("pass folder_id or unfiled, not both")
	}
	filter := map[string]any{"unfiled": in.Unfiled, "starred": in.Starred, "pinned": in.Pinned}
	if in.FolderID != "" {
		filter["folderId"] = in.FolderID
	}
	if in.TradeID != "" {
		filter["tradeId"] = in.TradeID
	}
	page, err := t.api.summaries(ctx, caller.Token, in.WorkspaceID, filter, in.Cursor)
	if err != nil {
		return nil, listNotesOutput{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listNotesOutput{}, forUser(err)
	}
	out := listNotesOutput{Notes: make([]noteSummary, 0, len(page.Notes))}
	for _, n := range page.Notes {
		out.Notes = append(out.Notes, noteSummary{
			ID: n.ID, Title: n.Title, Folder: folderName(paths, n.FolderID), Preview: n.Preview,
			Starred: n.IsStarred, Pinned: n.IsPinned, LinkedTrades: nonNil(n.TradeIDs), UpdatedAt: n.UpdatedAt,
		})
	}
	if page.NextCursor != nil {
		out.NextCursor = *page.NextCursor
	}
	return nil, out, nil
}

type searchInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Query       string `json:"query" jsonschema:"what to look for, in the user's words"`
	Limit       int    `json:"limit,omitempty" jsonschema:"at most 20; defaults to 10"`
}

type searchResult struct {
	NoteID       string   `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Title        string   `json:"title"`
	Folder       string   `json:"folder"`
	Excerpt      string   `json:"excerpt" jsonschema:"the passage that matched"`
	LinkedTrades []string `json:"linked_trade_ids"`
}

type searchOutput struct {
	Results []searchResult `json:"results"`
}

func (t *tools) searchNotes(ctx context.Context, req *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, searchOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, searchOutput{}, err
	}
	query := strings.TrimSpace(in.Query)
	if query == "" {
		return nil, searchOutput{}, errors.New("say what to search for")
	}
	limit := in.Limit
	if limit <= 0 || limit > 20 {
		limit = 10
	}
	hits, err := t.api.search(ctx, caller.Token, in.WorkspaceID, query, limit)
	if err != nil {
		return nil, searchOutput{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, searchOutput{}, forUser(err)
	}
	out := searchOutput{Results: make([]searchResult, 0, len(hits))}
	for _, h := range hits {
		out.Results = append(out.Results, searchResult{
			NoteID: h.NoteID, Title: h.Title, Folder: folderName(paths, h.FolderID), Excerpt: h.Excerpt, LinkedTrades: nonNil(h.TradeIDs),
		})
	}
	return nil, out, nil
}

type createInput struct {
	WorkspaceID string   `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Title       string   `json:"title" jsonschema:"becomes the note's first heading"`
	Markdown    string   `json:"markdown,omitempty" jsonschema:"the body in Tradstry Markdown, without the title"`
	FolderID    string   `json:"folder_id,omitempty" jsonschema:"ID from list_folders; unfiled when left out"`
	TradeIDs    []string `json:"trade_ids,omitempty" jsonschema:"trades to link, from list_trades"`
}

func (t *tools) createNote(ctx context.Context, req *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, savedView{}, errors.New("give the note a title")
	}
	input := map[string]any{"workspaceId": in.WorkspaceID, "title": title, "markdown": in.Markdown, "tradeIds": nonNil(in.TradeIDs)}
	if in.FolderID != "" {
		input["folderId"] = in.FolderID
	}
	d, err := t.api.create(ctx, caller.Token, input)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, d.WorkspaceID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	return nil, toSavedView(d, paths), nil
}

type textEdit struct {
	OldText string `json:"old_text" jsonschema:"text copied exactly from get_note's markdown"`
	NewText string `json:"new_text" jsonschema:"what replaces it; empty deletes it"`
}

type editInput struct {
	NoteID   string     `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Revision string     `json:"revision" jsonschema:"from get_note"`
	Edits    []textEdit `json:"edits" jsonschema:"applied in order"`
}

func (t *tools) editNote(ctx context.Context, req *mcp.CallToolRequest, in editInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	if len(in.Edits) == 0 {
		return nil, savedView{}, errors.New("give at least one edit")
	}
	edits := make([]map[string]any, 0, len(in.Edits))
	for _, e := range in.Edits {
		if e.OldText == "" {
			return nil, savedView{}, errors.New("old_text must not be empty; use append_to_note to add text at the end")
		}
		edits = append(edits, map[string]any{"old": e.OldText, "new": e.NewText})
	}

	revision := in.Revision
	// The user may type elsewhere in the note between the read and this edit. When
	// every old_text still reads the same, one fresh attempt applies it on top.
	for attempt := 0; ; attempt++ {
		r, err := t.api.edit(ctx, caller.Token, in.NoteID, map[string]any{"replaceText": edits}, revision, true)
		if code(err) == "CONFLICT" && attempt == 0 {
			fresh, readErr := t.api.document(ctx, caller.Token, in.NoteID)
			if readErr != nil {
				return nil, savedView{}, forUser(readErr)
			}
			if !stillApplies(fresh.Markdown, in.Edits) {
				return nil, savedView{}, fmt.Errorf("the note changed since it was read and the text to replace no longer matches; " +
					"call get_note and make the edit against the new text")
			}
			revision = fresh.Revision
			continue
		}
		if err != nil {
			return nil, savedView{}, forUser(err)
		}
		v, err := t.saved(ctx, caller.Token, r)
		return nil, v, forUser(err)
	}
}

// stillApplies reports whether each edit's old_text occurs exactly once in markdown,
// counting the edits before it.
func stillApplies(markdown string, edits []textEdit) bool {
	for _, e := range edits {
		if strings.Count(markdown, e.OldText) != 1 {
			return false
		}
		markdown = strings.Replace(markdown, e.OldText, e.NewText, 1)
	}
	return true
}

type appendInput struct {
	NoteID   string `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Markdown string `json:"markdown" jsonschema:"Tradstry Markdown to add at the end"`
}

func (t *tools) appendToNote(ctx context.Context, req *mcp.CallToolRequest, in appendInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	if strings.TrimSpace(in.Markdown) == "" {
		return nil, savedView{}, errors.New("give the Markdown to append")
	}
	// The revision only names this write, so appending the same text again later is
	// a new write rather than a replay. Appending never needs the note unchanged.
	current, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	r, err := t.api.edit(ctx, caller.Token, in.NoteID, map[string]any{"append": in.Markdown}, current.Revision, false)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	v, err := t.saved(ctx, caller.Token, r)
	return nil, v, forUser(err)
}

type rewriteInput struct {
	NoteID   string `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Revision string `json:"revision" jsonschema:"from get_note"`
	Markdown string `json:"markdown" jsonschema:"the complete body, including its # title"`
}

func (t *tools) rewriteNote(ctx context.Context, req *mcp.CallToolRequest, in rewriteInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	if strings.TrimSpace(in.Markdown) == "" {
		return nil, savedView{}, errors.New("send the complete note; to delete it use delete_note")
	}
	// No retry on conflict: the rewrite was composed from text that has since
	// changed, and applying it would undo what changed.
	r, err := t.api.edit(ctx, caller.Token, in.NoteID, map[string]any{"rewrite": in.Markdown}, in.Revision, true)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	v, err := t.saved(ctx, caller.Token, r)
	return nil, v, forUser(err)
}

type updateInput struct {
	NoteID       string   `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	Title        string   `json:"title,omitempty" jsonschema:"new title; replaces the note's first heading"`
	Starred      *bool    `json:"starred,omitempty" jsonschema:"star or unstar the note"`
	Pinned       *bool    `json:"pinned,omitempty" jsonschema:"pin the note to the top of the list, or unpin it"`
	FolderID     string   `json:"folder_id,omitempty" jsonschema:"move into this folder, from list_folders"`
	Unfiled      bool     `json:"unfiled,omitempty" jsonschema:"move out of every folder"`
	LinkTrades   []string `json:"link_trades,omitempty" jsonschema:"trade IDs to link, from list_trades"`
	UnlinkTrades []string `json:"unlink_trades,omitempty" jsonschema:"trade IDs to unlink; a trade note's own trade stays linked"`
}

func (t *tools) updateNote(ctx context.Context, req *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	title := strings.TrimSpace(in.Title)
	moving := in.FolderID != "" || in.Unfiled
	if title == "" && in.Starred == nil && in.Pinned == nil && !moving && len(in.LinkTrades) == 0 && len(in.UnlinkTrades) == 0 {
		return nil, savedView{}, errors.New("say what to change: title, starred, pinned, folder_id, unfiled, link_trades or unlink_trades")
	}
	if in.FolderID != "" && in.Unfiled {
		return nil, savedView{}, errors.New("pass folder_id or unfiled, not both")
	}
	d, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}

	if title != "" && title != d.Title {
		for attempt := 0; ; attempt++ {
			_, err = t.api.edit(ctx, caller.Token, d.ID, map[string]any{"setTitle": title}, d.Revision, true)
			if code(err) == "CONFLICT" && attempt == 0 {
				if d, err = t.api.document(ctx, caller.Token, in.NoteID); err != nil {
					return nil, savedView{}, forUser(err)
				}
				continue
			}
			break
		}
		if err != nil {
			return nil, savedView{}, forUser(err)
		}
	}
	if in.Starred != nil || in.Pinned != nil {
		if err := t.api.flags(ctx, caller.Token, d.ID, in.Starred, in.Pinned); err != nil {
			return nil, savedView{}, forUser(err)
		}
	}
	if moving {
		var parent *string
		if in.FolderID != "" {
			parent = &in.FolderID
		}
		if err := t.api.move(ctx, caller.Token, d.WorkspaceID, d.ID, "NOTE", parent); err != nil {
			return nil, savedView{}, forUser(err)
		}
	}
	if len(in.LinkTrades) > 0 || len(in.UnlinkTrades) > 0 {
		if _, err := t.api.link(ctx, caller.Token, d.ID, in.LinkTrades, in.UnlinkTrades); err != nil {
			return nil, savedView{}, forUser(err)
		}
	}

	after, err := t.api.document(ctx, caller.Token, d.ID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, after.WorkspaceID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	return nil, toSavedView(after, paths), nil
}

type deleteNoteInput struct {
	NoteID            string `json:"note_id" jsonschema:"ID from list_notes or search_notes"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

type deleteOutput struct {
	Status            string `json:"status" jsonschema:"deleted, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func (t *tools) deleteNote(ctx context.Context, req *mcp.CallToolRequest, in deleteNoteInput) (*mcp.CallToolResult, deleteOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	d, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, deleteOutput{}, forUser(err)
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:     "delete_note",
		Target:   d.ID,
		Question: fmt.Sprintf("Delete the note “%s”? It can be restored for 30 days.", d.Title),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	if !outcome.Approved {
		return nil, unapproved(outcome), nil
	}
	if _, err := t.api.deleteNote(ctx, caller.Token, d.ID); err != nil {
		return nil, deleteOutput{}, forUser(err)
	}
	return nil, deleteOutput{Status: "deleted", Message: fmt.Sprintf("Deleted “%s”. restore_note brings it back within 30 days.", d.Title)}, nil
}

func unapproved(outcome confirm.Outcome) deleteOutput {
	status := "cancelled"
	if outcome.Token != "" {
		status = "needs_confirmation"
	}
	return deleteOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}
}

func (t *tools) restoreNote(ctx context.Context, req *mcp.CallToolRequest, in noteInput) (*mcp.CallToolResult, savedView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, savedView{}, err
	}
	if err := t.api.restore(ctx, caller.Token, in.NoteID); err != nil {
		if code(err) == "NOT_FOUND" {
			return nil, savedView{}, errors.New("no note with that ID can be restored; list_deleted_notes shows what can")
		}
		return nil, savedView{}, forUser(err)
	}
	d, err := t.api.document(ctx, caller.Token, in.NoteID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	paths, err := t.folderPaths(ctx, caller.Token, d.WorkspaceID)
	if err != nil {
		return nil, savedView{}, forUser(err)
	}
	return nil, toSavedView(d, paths), nil
}

type deletedInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Cursor      string `json:"cursor,omitempty" jsonschema:"next_cursor from the previous page"`
}

type deletedView struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	DeletedAt       string `json:"deleted_at"`
	RestorableUntil string `json:"restorable_until"`
}

type deletedOutput struct {
	Notes      []deletedView `json:"notes"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func (t *tools) listDeleted(ctx context.Context, req *mcp.CallToolRequest, in deletedInput) (*mcp.CallToolResult, deletedOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, deletedOutput{}, err
	}
	page, err := t.api.deleted(ctx, caller.Token, in.WorkspaceID, in.Cursor)
	if err != nil {
		return nil, deletedOutput{}, forUser(err)
	}
	out := deletedOutput{Notes: make([]deletedView, 0, len(page.Notes))}
	for _, n := range page.Notes {
		out.Notes = append(out.Notes, deletedView{ID: n.ID, Title: n.Title, DeletedAt: n.DeletedAt, RestorableUntil: n.RestorableUntil})
	}
	if page.NextCursor != nil {
		out.NextCursor = *page.NextCursor
	}
	return nil, out, nil
}

type tradeNoteInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	TradeID     string `json:"trade_id" jsonschema:"ID from list_trades"`
}

func (t *tools) openTradeNote(ctx context.Context, req *mcp.CallToolRequest, in tradeNoteInput) (*mcp.CallToolResult, noteView, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, noteView{}, err
	}
	id, err := t.api.tradeNote(ctx, caller.Token, in.WorkspaceID, in.TradeID)
	if err != nil {
		return nil, noteView{}, forUser(err)
	}
	return t.getNote(ctx, req, noteInput{NoteID: id})
}
