package notebook_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

type fakeFolder struct {
	ID             string  `json:"id"`
	ParentFolderID *string `json:"parentFolderId"`
	Name           string  `json:"name"`
	IsSystem       bool    `json:"isSystem"`
}

type fakeNote struct {
	ID          string
	WorkspaceID string
	FolderID    *string
	Title       string
	Markdown    string
	Revision    int
	Starred     bool
	Pinned      bool
	Trades      []string
	Media       []map[string]any
	Deleted     bool
}

// fakeAPI keeps a notebook in memory and answers the notebook operations the way
// the Tradstry backend does, including revision conflicts.
type fakeAPI struct {
	mu        sync.Mutex
	folders   []fakeFolder
	notes     map[string]*fakeNote
	conflicts int
	// typed is what the user types on the web when an edit hits a conflict.
	typed  func(*fakeNote)
	edits  []map[string]any
	nextID int
}

func newFake() *fakeAPI {
	macro := "macro"
	return &fakeAPI{
		folders: []fakeFolder{
			{ID: "system", Name: "System", IsSystem: true},
			{ID: "macro", Name: "Macro"},
			{ID: "fomc", Name: "FOMC", ParentFolderID: &macro},
		},
		notes: map[string]*fakeNote{
			"n1": {ID: "n1", WorkspaceID: "ws1", FolderID: new("fomc"), Title: "FOMC playbook", Revision: 1,
				Markdown: "# FOMC playbook\n\nWait for the statement.\n\n![chart](media:" + hash + ")",
				Media:    []map[string]any{{"hash": hash, "mediaType": "image", "width": 640, "height": 480, "bytes": 1200, "originalFilename": "chart.png", "durationSeconds": 0}}},
			"n2": {ID: "n2", WorkspaceID: "ws1", Title: "Loose thoughts", Revision: 1, Markdown: "# Loose thoughts\n\nSize down."},
			"n3": {ID: "n3", WorkspaceID: "ws1", FolderID: new("macro"), Title: "Rates", Revision: 1, Markdown: "# Rates\n\nTen-year."},
		},
	}
}

var hash = strings.Repeat("a", 64)

func (f *fakeAPI) revision(n *fakeNote) string { return fmt.Sprintf("rev%d", n.Revision) }

func (f *fakeAPI) document(n *fakeNote) map[string]any {
	links := []map[string]any{}
	for _, id := range n.Trades {
		links = append(links, map[string]any{"id": id, "label": "AAPL · 2026-10-03"})
	}
	media := n.Media
	if media == nil {
		media = []map[string]any{}
	}
	return map[string]any{
		"id": n.ID, "workspaceId": n.WorkspaceID, "folderId": n.FolderID, "title": n.Title, "markdown": n.Markdown,
		"revision": f.revision(n), "placeholders": 0, "isStarred": n.Starred, "isPinned": n.Pinned,
		"updatedAt": "2026-10-10T10:00:00.000000Z", "linkedTrades": links, "media": media,
	}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := req.Variables
	input, _ := v["input"].(map[string]any)
	switch {
	case strings.Contains(req.Query, "notebookFolders"):
		counts := map[string]int{}
		unfiled := 0
		for _, n := range f.notes {
			if n.Deleted {
				continue
			}
			if n.FolderID == nil {
				unfiled++
			} else {
				counts[*n.FolderID]++
			}
		}
		out := []map[string]any{{"folderId": nil, "noteCount": unfiled}}
		for id, c := range counts {
			out = append(out, map[string]any{"folderId": id, "noteCount": c})
		}
		return data(map[string]any{"notebookFolders": f.folders, "notebookFolderNoteCounts": out})
	case strings.Contains(req.Query, "notebookNoteSummaries"):
		if v["after"] == "page2" {
			return data(map[string]any{"notebookNoteSummaries": map[string]any{"notes": []any{}, "nextCursor": nil}})
		}
		notes := []map[string]any{}
		for _, id := range []string{"n1", "n2", "n3"} {
			n := f.notes[id]
			notes = append(notes, map[string]any{"id": n.ID, "title": n.Title, "folderId": n.FolderID, "preview": "…",
				"isStarred": n.Starred, "isPinned": n.Pinned, "tradeIds": n.Trades, "updatedAt": "2026-10-10T10:00:00.000000Z"})
		}
		return data(map[string]any{"notebookNoteSummaries": map[string]any{"notes": notes, "nextCursor": "page2"}})
	case strings.Contains(req.Query, "notebookNoteDocument"):
		n, ok := f.notes[fmt.Sprint(v["id"])]
		if !ok || n.Deleted {
			return failure("NOT_FOUND: note not found")
		}
		return data(map[string]any{"notebookNoteDocument": f.document(n)})
	case strings.Contains(req.Query, "searchNotebook"):
		return data(map[string]any{"searchNotebook": []map[string]any{
			{"noteId": "n1", "title": "FOMC playbook", "folderId": "fomc", "excerpt": "Wait for the statement.", "tradeIds": []string{}},
		}})
	case strings.Contains(req.Query, "createNotebookNoteFromMarkdown"):
		f.nextID++
		n := &fakeNote{ID: fmt.Sprintf("new%d", f.nextID), WorkspaceID: fmt.Sprint(input["workspaceId"]), Title: fmt.Sprint(input["title"]), Revision: 1,
			Markdown: "# " + fmt.Sprint(input["title"]) + "\n\n" + fmt.Sprint(input["markdown"])}
		if folder, ok := input["folderId"].(string); ok {
			n.FolderID = &folder
		}
		f.notes[n.ID] = n
		return data(map[string]any{"createNotebookNoteFromMarkdown": f.document(n)})
	case strings.Contains(req.Query, "editNotebookNote"):
		f.edits = append(f.edits, input)
		n := f.notes[fmt.Sprint(input["id"])]
		if expected, ok := input["expectedRevision"]; ok && (f.conflicts > 0 || expected != f.revision(n)) {
			if f.conflicts > 0 {
				f.conflicts--
				n.Revision++
				if f.typed != nil {
					f.typed(n)
				} else {
					n.Markdown += "\n\nTyped on the web."
				}
			}
			return failure("CONFLICT: the note changed since it was read; read it again")
		}
		changed := 0
		if edits, ok := input["replaceText"].([]any); ok {
			for _, e := range edits {
				e := e.(map[string]any)
				if !strings.Contains(n.Markdown, e["old"].(string)) {
					return failure(fmt.Sprintf("TEXT_NOT_FOUND: %q", e["old"]))
				}
				n.Markdown = strings.Replace(n.Markdown, e["old"].(string), e["new"].(string), 1)
				changed++
			}
		}
		if md, ok := input["append"].(string); ok {
			n.Markdown += "\n\n" + md
		}
		if md, ok := input["rewrite"].(string); ok {
			n.Markdown = md
		}
		if title, ok := input["setTitle"].(string); ok {
			n.Title = title
		}
		n.Revision++
		return data(map[string]any{"editNotebookNote": map[string]any{
			"note": f.document(n), "changes": map[string]any{"kept": 1, "changed": changed, "inserted": 0, "removed": 0},
			"formattingLost": []string{"underline"}, "replayed": false,
		}})
	case strings.Contains(req.Query, "setNotebookNoteFlags"):
		n := f.notes[fmt.Sprint(v["id"])]
		if s, ok := v["starred"].(bool); ok {
			n.Starred = s
		}
		if p, ok := v["pinned"].(bool); ok {
			n.Pinned = p
		}
		return data(map[string]any{"setNotebookNoteFlags": map[string]any{"id": n.ID}})
	case strings.Contains(req.Query, "moveNotebookNode"):
		parent, _ := input["newParentFolderId"].(string)
		if input["nodeType"] == "NOTE" {
			n := f.notes[fmt.Sprint(input["nodeId"])]
			n.FolderID = nil
			if parent != "" {
				n.FolderID = &parent
			}
		}
		return data(map[string]any{"moveNotebookNode": true})
	case strings.Contains(req.Query, "linkNotebookNoteTrades"):
		n := f.notes[fmt.Sprint(v["id"])]
		for _, id := range v["add"].([]any) {
			n.Trades = append(n.Trades, id.(string))
		}
		return data(map[string]any{"linkNotebookNoteTrades": n.Trades})
	case strings.Contains(req.Query, "deleteNotebookNote"):
		f.notes[fmt.Sprint(v["id"])].Deleted = true
		return data(map[string]any{"deleteNotebookNote": true})
	case strings.Contains(req.Query, "restoreNotebookNote"):
		n, ok := f.notes[fmt.Sprint(v["id"])]
		if !ok || !n.Deleted {
			return failure("NOT_FOUND: no deleted note with that id can be restored")
		}
		n.Deleted = false
		return data(map[string]any{"restoreNotebookNote": true})
	case strings.Contains(req.Query, "deleteNotebookFolder"):
		return data(map[string]any{"deleteNotebookFolder": true})
	case strings.Contains(req.Query, "createNotebookFolder"):
		folder := fakeFolder{ID: "created", Name: fmt.Sprint(input["name"])}
		if parent, ok := input["parentFolderId"].(string); ok {
			folder.ParentFolderID = &parent
		}
		f.folders = append(f.folders, folder)
		return data(map[string]any{"createNotebookFolder": folder})
	case strings.Contains(req.Query, "ensureJournalContextNote"):
		return data(map[string]any{"ensureJournalContextNote": "n3"})
	}
	return failure("unexpected operation")
}

func (f *fakeAPI) note(id string) fakeNote {
	f.mu.Lock()
	defer f.mu.Unlock()
	return *f.notes[id]
}

func (f *fakeAPI) sentEdits() []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]map[string]any(nil), f.edits...)
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

func failure(message string) string {
	body, _ := json.Marshal(map[string]any{"data": nil, "errors": []map[string]any{{"message": message}}})
	return string(body)
}

func start(t *testing.T) (*mcptest.Stack, *fakeAPI, *mcp.ClientSession) {
	api := newFake()
	s := mcptest.Start(t, api.respond)
	return s, api, s.Connect(t, nil)
}

type note struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Folder       string `json:"folder"`
	Markdown     string `json:"markdown"`
	Revision     string `json:"revision"`
	Starred      bool   `json:"starred"`
	LinkedTrades []struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	} `json:"linked_trades"`
	Media []struct {
		Hash string `json:"hash"`
		Type string `json:"type"`
	} `json:"media"`
	Changes *struct {
		Changed int `json:"changed"`
	} `json:"changes"`
	FormattingLost []string `json:"formatting_lost"`
}

type deleteResult struct {
	Status            string `json:"status"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token"`
}

func TestGetNoteShowsMarkdownWithItsFolderPathAndMedia(t *testing.T) {
	s, _, session := start(t)
	result, out := mcptest.Call[note](t, session, "get_note", map[string]any{"note_id": "n1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if !strings.HasPrefix(s.Requests()[0].Authorization, "Bearer ey") {
		t.Error("the Tradstry API did not receive the caller's token")
	}
	if out.Folder != "Macro / FOMC" || out.Revision != "rev1" || !strings.Contains(out.Markdown, "Wait for the statement.") {
		t.Errorf("note = %+v", out)
	}
	if len(out.Media) != 1 || out.Media[0].Hash != hash || out.Media[0].Type != "image" {
		t.Errorf("media = %+v", out.Media)
	}

	result, _ = mcptest.Call[note](t, session, "get_note", map[string]any{"note_id": "missing"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "list_notes") {
		t.Errorf("unknown note: %q", mcptest.Text(result))
	}
}

func TestListFoldersAndNotes(t *testing.T) {
	s, _, session := start(t)
	result, folders := mcptest.Call[struct {
		Folders []struct {
			ID        string `json:"id"`
			Path      string `json:"path"`
			NoteCount int    `json:"note_count"`
			IsSystem  bool   `json:"is_system"`
		} `json:"folders"`
		UnfiledNotes int `json:"unfiled_notes"`
	}](t, session, "list_folders", map[string]any{"workspace_id": "ws1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	paths := map[string]int{}
	for _, f := range folders.Folders {
		paths[f.Path] = f.NoteCount
	}
	if paths["Macro / FOMC"] != 1 || paths["Macro"] != 1 || folders.UnfiledNotes != 1 {
		t.Errorf("folders = %+v", folders)
	}

	result, list := mcptest.Call[struct {
		Notes []struct {
			ID     string `json:"id"`
			Folder string `json:"folder"`
		} `json:"notes"`
		NextCursor string `json:"next_cursor"`
	}](t, session, "list_notes", map[string]any{"workspace_id": "ws1", "starred": true, "trade_id": "t1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if list.NextCursor != "page2" || list.Notes[1].Folder != "Unfiled" {
		t.Errorf("list = %+v", list)
	}
	var sent map[string]any
	for _, r := range s.Requests() {
		if strings.Contains(r.Query, "notebookNoteSummaries") {
			sent = r.Variables["filter"].(map[string]any)
		}
	}
	if sent["starred"] != true || sent["tradeId"] != "t1" || sent["pinned"] != nil {
		t.Errorf("filter sent = %v", sent)
	}
}

func TestCreateNoteIsUnfiledByDefaultAndARetryNamesTheSameWrite(t *testing.T) {
	s, _, session := start(t)
	args := map[string]any{"workspace_id": "ws1", "title": " Gap fills ", "markdown": "- [ ] check the open"}
	result, created := mcptest.Call[note](t, session, "create_note", args)
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if created.Title != "Gap fills" || created.Folder != "Unfiled" {
		t.Errorf("created = %+v", created)
	}
	mcptest.Call[note](t, session, "create_note", args)
	var ids []any
	for _, r := range s.Requests() {
		if strings.Contains(r.Query, "createNotebookNoteFromMarkdown") {
			input := r.Variables["input"].(map[string]any)
			ids = append(ids, input["mutationId"])
			if _, hasFolder := input["folderId"]; hasFolder {
				t.Error("a folder was sent although none was asked for")
			}
		}
	}
	if len(ids) != 2 || ids[0] != ids[1] {
		t.Errorf("a retried create must reuse its mutation id: %v", ids)
	}
}

func TestEditNoteRetriesOnceWhenTheUserTypedElsewhere(t *testing.T) {
	_, api, session := start(t)
	api.conflicts = 1
	result, out := mcptest.Call[note](t, session, "edit_note", map[string]any{
		"note_id": "n2", "revision": "rev1", "edits": []map[string]any{{"old_text": "Size down.", "new_text": "Size down by half."}},
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if got := api.note("n2").Markdown; !strings.Contains(got, "Size down by half.") || !strings.Contains(got, "Typed on the web.") {
		t.Errorf("markdown = %q", got)
	}
	edits := api.sentEdits()
	if len(edits) != 2 || edits[0]["expectedRevision"] != "rev1" || edits[1]["expectedRevision"] != "rev2" {
		t.Errorf("edits sent = %v", edits)
	}
	if edits[0]["mutationId"] == edits[1]["mutationId"] {
		t.Error("the retry against a newer revision must be a new write")
	}
	if out.Changes == nil || out.Changes.Changed != 1 || len(out.FormattingLost) != 1 {
		t.Errorf("result = %+v", out)
	}
}

func TestEditNoteStopsWhenTheTextItReplacesChanged(t *testing.T) {
	_, api, session := start(t)
	api.conflicts = 1
	api.typed = func(n *fakeNote) { n.Markdown = strings.Replace(n.Markdown, "Size down.", "Size down by a third.", 1) }
	result, _ := mcptest.Call[note](t, session, "edit_note", map[string]any{
		"note_id": "n2", "revision": "rev1", "edits": []map[string]any{{"old_text": "Size down.", "new_text": "x"}},
	})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "get_note") {
		t.Errorf("result = %q", mcptest.Text(result))
	}
	if len(api.sentEdits()) != 1 {
		t.Errorf("an edit whose text no longer matches was retried: %v", api.sentEdits())
	}

	result, _ = mcptest.Call[note](t, session, "edit_note", map[string]any{
		"note_id": "n3", "revision": "rev1", "edits": []map[string]any{{"old_text": "Five-year.", "new_text": "x"}},
	})
	if !strings.Contains(mcptest.Text(result), "Copy old_text exactly") {
		t.Errorf("text not found: %q", mcptest.Text(result))
	}
}

func TestAppendNeverRequiresAnUnchangedNoteAndRewriteNeverRetries(t *testing.T) {
	_, api, session := start(t)
	result, _ := mcptest.Call[note](t, session, "append_to_note", map[string]any{"note_id": "n2", "markdown": "More."})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if edit := api.sentEdits()[0]; edit["expectedRevision"] != nil || edit["append"] != "More." {
		t.Errorf("append sent %v", edit)
	}

	api.conflicts = 1
	result, _ = mcptest.Call[note](t, session, "rewrite_note", map[string]any{"note_id": "n2", "revision": "rev2", "markdown": "# New"})
	if !result.IsError {
		t.Error("a rewrite based on stale text was applied")
	}
	if len(api.sentEdits()) != 2 {
		t.Errorf("a stale rewrite was retried: %d edits", len(api.sentEdits()))
	}
}

func TestUpdateNoteRenamesStarsMovesAndLinks(t *testing.T) {
	s, api, session := start(t)
	result, out := mcptest.Call[note](t, session, "update_note", map[string]any{
		"note_id": "n1", "title": "Rate decisions", "starred": true, "unfiled": true, "link_trades": []string{"t1"},
	})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	got := api.note("n1")
	if got.Title != "Rate decisions" || !got.Starred || got.FolderID != nil || len(got.Trades) != 1 {
		t.Errorf("note = %+v", got)
	}
	if out.Folder != "Unfiled" || len(out.LinkedTrades) != 1 || out.LinkedTrades[0].Label == "" {
		t.Errorf("result = %+v", out)
	}
	if edit := api.sentEdits()[0]; edit["setTitle"] != "Rate decisions" || edit["expectedRevision"] != "rev1" {
		t.Errorf("title edit = %v", edit)
	}
	for _, r := range s.Requests() {
		if strings.Contains(r.Query, "moveNotebookNode") {
			if input := r.Variables["input"].(map[string]any); input["newParentFolderId"] != nil || input["nodeType"] != "NOTE" {
				t.Errorf("move = %v", input)
			}
		}
	}

	if result, _ := mcptest.Call[note](t, session, "update_note", map[string]any{"note_id": "n1"}); !result.IsError {
		t.Error("an update with nothing to change was accepted")
	}
}

func TestDeleteNoteNeedsTheUsersConfirmationAndCanBeRestored(t *testing.T) {
	_, api, session := start(t)
	args := map[string]any{"note_id": "n2"}
	result, first := mcptest.Call[deleteResult](t, session, "delete_note", args)
	if result.IsError || first.Status != "needs_confirmation" || !strings.Contains(first.Message, "Loose thoughts") {
		t.Fatalf("first = %+v %q", first, mcptest.Text(result))
	}
	if api.note("n2").Deleted {
		t.Fatal("deleted before the user confirmed")
	}
	args["confirmation_token"] = first.ConfirmationToken
	if _, done := mcptest.Call[deleteResult](t, session, "delete_note", args); done.Status != "deleted" {
		t.Fatalf("confirmed = %+v", done)
	}
	if !api.note("n2").Deleted {
		t.Fatal("not deleted")
	}

	result, restored := mcptest.Call[note](t, session, "restore_note", map[string]any{"note_id": "n2"})
	if result.IsError || restored.Title != "Loose thoughts" || api.note("n2").Deleted {
		t.Errorf("restore = %+v %q", restored, mcptest.Text(result))
	}
	result, _ = mcptest.Call[note](t, session, "restore_note", map[string]any{"note_id": "n2"})
	if !strings.Contains(mcptest.Text(result), "list_deleted_notes") {
		t.Errorf("restoring a live note: %q", mcptest.Text(result))
	}
}

func TestDeleteFolderSaysWhatGoesWithIt(t *testing.T) {
	_, _, session := start(t)
	result, out := mcptest.Call[deleteResult](t, session, "delete_folder", map[string]any{"workspace_id": "ws1", "folder_id": "macro"})
	if result.IsError || out.Status != "needs_confirmation" {
		t.Fatalf("result = %+v %q", out, mcptest.Text(result))
	}
	if !strings.Contains(out.Message, "“Macro” with its 1 subfolder and 2 notes") {
		t.Errorf("question = %q", out.Message)
	}

	result, _ = mcptest.Call[deleteResult](t, session, "delete_folder", map[string]any{"workspace_id": "ws1", "folder_id": "system"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "system folder") {
		t.Errorf("system folder: %q", mcptest.Text(result))
	}
}

func TestViewNoteMediaShowsTheImage(t *testing.T) {
	s, _, session := start(t)
	png := []byte("\x89PNG\r\n\x1a\nfake")
	s.ServeFile("/notebook/media/"+hash, "image/png", png)

	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "view_note_media", Arguments: map[string]any{"note_id": "n1", "hash": hash},
	})
	if err != nil || result.IsError {
		t.Fatalf("result = %v %q", err, mcptest.Text(result))
	}
	image, ok := result.Content[0].(*mcp.ImageContent)
	if !ok || image.MIMEType != "image/png" || string(image.Data) != string(png) {
		t.Errorf("content = %#v", result.Content[0])
	}

	result, _ = mcptest.Call[struct{}](t, session, "view_note_media", map[string]any{"note_id": "n2", "hash": hash})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "not in this note") {
		t.Errorf("foreign hash: %q", mcptest.Text(result))
	}
}

func TestViewNoteMediaFallsBackToTheThumbnailWhenTooLarge(t *testing.T) {
	s, _, session := start(t)
	s.ServeFile("/notebook/media/"+hash, "image/png", make([]byte, 6<<20))
	s.ServeFile("/notebook/media/"+hash+"/thumb", "image/jpeg", []byte("thumb"))

	result, out := mcptest.Call[struct {
		Shown string `json:"shown"`
	}](t, session, "view_note_media", map[string]any{"note_id": "n1", "hash": hash})
	if result.IsError || out.Shown != "thumbnail" {
		t.Fatalf("result = %+v %q", out, mcptest.Text(result))
	}
	if image := result.Content[0].(*mcp.ImageContent); image.MIMEType != "image/jpeg" {
		t.Errorf("mime = %s", image.MIMEType)
	}
}

func TestSearchAndOpenTradeNote(t *testing.T) {
	_, _, session := start(t)
	result, found := mcptest.Call[struct {
		Results []struct {
			NoteID string `json:"note_id"`
			Folder string `json:"folder"`
		} `json:"results"`
	}](t, session, "search_notes", map[string]any{"workspace_id": "ws1", "query": "statement"})
	if result.IsError || len(found.Results) != 1 || found.Results[0].Folder != "Macro / FOMC" {
		t.Errorf("search = %+v %q", found, mcptest.Text(result))
	}

	result, opened := mcptest.Call[note](t, session, "open_trade_note", map[string]any{"workspace_id": "ws1", "trade_id": "t1"})
	if result.IsError || opened.ID != "n3" || opened.Folder != "Macro" {
		t.Errorf("trade note = %+v %q", opened, mcptest.Text(result))
	}
}
