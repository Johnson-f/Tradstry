package notebook

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"math"
	"net/url"
	"strings"

	"tradstry-mcp/graphql"
)

type folder struct {
	ID             string  `json:"id"`
	ParentFolderID *string `json:"parentFolderId"`
	Name           string  `json:"name"`
	IsSystem       bool    `json:"isSystem"`
}

type folderCount struct {
	FolderID  *string `json:"folderId"`
	NoteCount int     `json:"noteCount"`
}

type summary struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	FolderID  *string  `json:"folderId"`
	Preview   string   `json:"preview"`
	IsStarred bool     `json:"isStarred"`
	IsPinned  bool     `json:"isPinned"`
	TradeIDs  []string `json:"tradeIds"`
	UpdatedAt string   `json:"updatedAt"`
}

type summaryPage struct {
	Notes      []summary `json:"notes"`
	NextCursor *string   `json:"nextCursor"`
}

type tradeLink struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type media struct {
	Hash             string  `json:"hash"`
	MediaType        string  `json:"mediaType"`
	Width            int     `json:"width"`
	Height           int     `json:"height"`
	Bytes            int64   `json:"bytes"`
	OriginalFilename string  `json:"originalFilename"`
	DurationSeconds  float64 `json:"durationSeconds"`
}

type document struct {
	ID           string      `json:"id"`
	WorkspaceID  string      `json:"workspaceId"`
	FolderID     *string     `json:"folderId"`
	Title        string      `json:"title"`
	Markdown     string      `json:"markdown"`
	Revision     string      `json:"revision"`
	Placeholders int         `json:"placeholders"`
	IsStarred    bool        `json:"isStarred"`
	IsPinned     bool        `json:"isPinned"`
	UpdatedAt    string      `json:"updatedAt"`
	LinkedTrades []tradeLink `json:"linkedTrades"`
	Media        []media     `json:"media"`
}

type changes struct {
	Kept     int `json:"kept"`
	Changed  int `json:"changed"`
	Inserted int `json:"inserted"`
	Removed  int `json:"removed"`
}

type editResult struct {
	Note           document `json:"note"`
	Changes        changes  `json:"changes"`
	FormattingLost []string `json:"formattingLost"`
	Replayed       bool     `json:"replayed"`
}

type searchHit struct {
	NoteID   string   `json:"noteId"`
	Title    string   `json:"title"`
	FolderID *string  `json:"folderId"`
	Excerpt  string   `json:"excerpt"`
	TradeIDs []string `json:"tradeIds"`
}

type deletedNote struct {
	ID              string  `json:"id"`
	Title           string  `json:"title"`
	FolderID        *string `json:"folderId"`
	DeletedAt       string  `json:"deletedAt"`
	RestorableUntil string  `json:"restorableUntil"`
}

type deletedPage struct {
	Notes      []deletedNote `json:"notes"`
	NextCursor *string       `json:"nextCursor"`
}

const (
	folderFields   = `id parentFolderId name isSystem`
	documentFields = `id workspaceId folderId title markdown revision placeholders isStarred isPinned updatedAt ` +
		`linkedTrades { id label } media { hash mediaType width height bytes originalFilename durationSeconds }`

	foldersQuery = `query NotebookFolders($ws: String!) {
		notebookFolders(workspaceId: $ws) { ` + folderFields + ` }
		notebookFolderNoteCounts(workspaceId: $ws) { folderId noteCount }
	}`
	summariesQuery = `query NotebookNoteSummaries($ws: String!, $filter: NotebookNoteFilter, $first: Int, $after: String) {
		notebookNoteSummaries(workspaceId: $ws, filter: $filter, first: $first, after: $after) {
			notes { id title folderId preview isStarred isPinned tradeIds updatedAt } nextCursor
		}
	}`
	documentQuery = `query NotebookNoteDocument($id: String!) { notebookNoteDocument(id: $id) { ` + documentFields + ` } }`
	searchQuery   = `query SearchNotebook($ws: String!, $query: String!, $limit: Int) {
		searchNotebook(workspaceId: $ws, query: $query, limit: $limit) { noteId title folderId excerpt tradeIds }
	}`
	deletedQuery = `query DeletedNotebookNotes($ws: String!, $after: String) {
		deletedNotebookNotes(workspaceId: $ws, after: $after) { notes { id title folderId deletedAt restorableUntil } nextCursor }
	}`

	createNoteMutation = `mutation CreateNotebookNoteFromMarkdown($input: CreateNotebookNoteFromMarkdownInput!) {
		createNotebookNoteFromMarkdown(input: $input) { ` + documentFields + ` }
	}`
	editNoteMutation = `mutation EditNotebookNote($input: EditNotebookNoteInput!) {
		editNotebookNote(input: $input) {
			note { ` + documentFields + ` } changes { kept changed inserted removed } formattingLost replayed
		}
	}`
	flagsMutation   = `mutation SetNotebookNoteFlags($id: String!, $starred: Boolean, $pinned: Boolean) { setNotebookNoteFlags(id: $id, isStarred: $starred, isPinned: $pinned) { id } }`
	moveMutation    = `mutation MoveNotebookNode($input: MoveNotebookNodeInput!) { moveNotebookNode(input: $input) }`
	linkMutation    = `mutation LinkNotebookNoteTrades($id: String!, $add: [String!]!, $remove: [String!]!) { linkNotebookNoteTrades(id: $id, add: $add, remove: $remove) }`
	deleteMutation  = `mutation DeleteNotebookNote($id: String!) { deleteNotebookNote(id: $id) }`
	restoreMutation = `mutation RestoreNotebookNote($id: String!) { restoreNotebookNote(id: $id) }`

	createFolderMutation = `mutation CreateNotebookFolder($input: CreateNotebookFolderInput!) { createNotebookFolder(input: $input) { ` + folderFields + ` } }`
	renameFolderMutation = `mutation RenameNotebookFolder($id: String!, $name: String!) { renameNotebookFolder(id: $id, name: $name) { ` + folderFields + ` } }`
	deleteFolderMutation = `mutation DeleteNotebookFolder($id: String!) { deleteNotebookFolder(id: $id) }`

	tradeNoteMutation = `mutation EnsureJournalContextNote($ws: String!, $entry: String!, $client: String!, $mutation: String!) {
		ensureJournalContextNote(workspaceId: $ws, entryId: $entry, clientId: $client, mutationId: $mutation)
	}`
)

type api struct {
	client *graphql.Client
}

func (a api) folders(ctx context.Context, token, ws string) ([]folder, []folderCount, error) {
	var data struct {
		Folders []folder      `json:"notebookFolders"`
		Counts  []folderCount `json:"notebookFolderNoteCounts"`
	}
	err := a.client.Do(ctx, token, foldersQuery, map[string]any{"ws": ws}, &data)
	return data.Folders, data.Counts, err
}

func (a api) summaries(ctx context.Context, token, ws string, filter map[string]any, cursor string) (summaryPage, error) {
	var data struct {
		Page summaryPage `json:"notebookNoteSummaries"`
	}
	vars := map[string]any{"ws": ws, "filter": filter, "first": 25}
	if cursor != "" {
		vars["after"] = cursor
	}
	err := a.client.Do(ctx, token, summariesQuery, vars, &data)
	return data.Page, err
}

func (a api) document(ctx context.Context, token, id string) (document, error) {
	var data struct {
		Document document `json:"notebookNoteDocument"`
	}
	err := a.client.Do(ctx, token, documentQuery, map[string]any{"id": id}, &data)
	return data.Document, err
}

func (a api) search(ctx context.Context, token, ws, query string, limit int) ([]searchHit, error) {
	var data struct {
		Hits []searchHit `json:"searchNotebook"`
	}
	err := a.client.Do(ctx, token, searchQuery, map[string]any{"ws": ws, "query": query, "limit": limit}, &data)
	return data.Hits, err
}

func (a api) deleted(ctx context.Context, token, ws, cursor string) (deletedPage, error) {
	var data struct {
		Page deletedPage `json:"deletedNotebookNotes"`
	}
	vars := map[string]any{"ws": ws}
	if cursor != "" {
		vars["after"] = cursor
	}
	err := a.client.Do(ctx, token, deletedQuery, vars, &data)
	return data.Page, err
}

func (a api) create(ctx context.Context, token string, input map[string]any) (document, error) {
	input["clientId"] = graphql.ClientID
	input["mutationId"] = graphql.MutationID("create_note", input)
	var data struct {
		Document document `json:"createNotebookNoteFromMarkdown"`
	}
	err := a.client.Do(ctx, token, createNoteMutation, map[string]any{"input": input}, &data)
	return data.Document, err
}

// edit applies one edit based on the note at revision. The mutation id covers that
// revision, so a retry replays while the same edit after the note moved on writes
// again. With enforce, the backend refuses the edit if the note has changed since.
func (a api) edit(ctx context.Context, token, id string, edit map[string]any, revision string, enforce bool) (editResult, error) {
	input := map[string]any{
		"id":         id,
		"clientId":   graphql.ClientID,
		"mutationId": graphql.MutationID("edit_note", id, revision, edit),
	}
	if enforce {
		input["expectedRevision"] = revision
	}
	maps.Copy(input, edit)
	var data struct {
		Result editResult `json:"editNotebookNote"`
	}
	err := a.client.Do(ctx, token, editNoteMutation, map[string]any{"input": input}, &data)
	return data.Result, err
}

func (a api) flags(ctx context.Context, token, id string, starred, pinned *bool) error {
	return a.client.Do(ctx, token, flagsMutation, map[string]any{"id": id, "starred": starred, "pinned": pinned}, nil)
}

// move files a note or folder last among its new siblings; nil parent means the top level.
func (a api) move(ctx context.Context, token, ws, id, kind string, parent *string) error {
	return a.client.Do(ctx, token, moveMutation, map[string]any{"input": map[string]any{
		"workspaceId": ws, "nodeId": id, "nodeType": kind, "newParentFolderId": parent, "newSortOrder": math.MaxInt32,
	}}, nil)
}

func (a api) link(ctx context.Context, token, id string, add, remove []string) ([]string, error) {
	var data struct {
		Linked []string `json:"linkNotebookNoteTrades"`
	}
	err := a.client.Do(ctx, token, linkMutation, map[string]any{"id": id, "add": nonNil(add), "remove": nonNil(remove)}, &data)
	return data.Linked, err
}

func (a api) deleteNote(ctx context.Context, token, id string) (bool, error) {
	var data struct {
		Deleted bool `json:"deleteNotebookNote"`
	}
	err := a.client.Do(ctx, token, deleteMutation, map[string]any{"id": id}, &data)
	return data.Deleted, err
}

func (a api) restore(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, restoreMutation, map[string]any{"id": id}, nil)
}

func (a api) createFolder(ctx context.Context, token, ws, name string, parent *string) (folder, error) {
	var data struct {
		Folder folder `json:"createNotebookFolder"`
	}
	input := map[string]any{"workspaceId": ws, "name": name, "parentFolderId": parent}
	err := a.client.Do(ctx, token, createFolderMutation, map[string]any{"input": input}, &data)
	return data.Folder, err
}

func (a api) renameFolder(ctx context.Context, token, id, name string) (folder, error) {
	var data struct {
		Folder folder `json:"renameNotebookFolder"`
	}
	err := a.client.Do(ctx, token, renameFolderMutation, map[string]any{"id": id, "name": name}, &data)
	return data.Folder, err
}

func (a api) deleteFolder(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deleteFolderMutation, map[string]any{"id": id}, nil)
}

func (a api) tradeNote(ctx context.Context, token, ws, tradeID string) (string, error) {
	var data struct {
		NoteID string `json:"ensureJournalContextNote"`
	}
	err := a.client.Do(ctx, token, tradeNoteMutation, map[string]any{
		"ws": ws, "entry": tradeID, "client": graphql.ClientID, "mutation": graphql.MutationID("open_trade_note", ws, tradeID),
	}, &data)
	return data.NoteID, err
}

const maxImageBytes = 5 << 20

// mediaFile fetches a note's image, or a video's thumbnail, for the assistant to see.
func (a api) mediaFile(ctx context.Context, token, hash string, thumbnail bool) ([]byte, string, error) {
	path := "/notebook/media/" + url.PathEscape(hash)
	if thumbnail {
		path += "/thumb"
	}
	return a.client.Get(ctx, token, path, maxImageBytes)
}

func nonNil(ids []string) []string {
	if ids == nil {
		return []string{}
	}
	return ids
}

// code is the backend's error code for err, such as CONFLICT, or "".
func code(err error) string {
	var apiErr *graphql.Error
	if !errors.As(err, &apiErr) || len(apiErr.Messages) == 0 {
		return ""
	}
	head, _, found := strings.Cut(apiErr.Messages[0], ":")
	if !found || strings.ToUpper(head) != head || strings.Contains(head, " ") {
		return ""
	}
	return head
}

// forUser explains the notebook's error codes in terms the assistant can act on.
func forUser(err error) error {
	if err == nil {
		return nil
	}
	switch code(err) {
	case "":
		return graphql.ForUser(err)
	case "NOT_FOUND":
		return errors.New("note not found; call list_notes or search_notes for valid IDs")
	case "CONFLICT":
		return errors.New("the note changed since it was read; call get_note and make the edit against the new text and revision")
	case "TEXT_NOT_FOUND":
		return fmt.Errorf("%s. Copy old_text exactly from get_note's markdown", message(err))
	case "INVALID_REFERENCE":
		return fmt.Errorf("%s. Use only media hashes from get_note and trade IDs from list_trades", message(err))
	default:
		return errors.New(message(err))
	}
}

func message(err error) string {
	var apiErr *graphql.Error
	errors.As(err, &apiErr)
	return strings.Join(apiErr.Messages, "; ")
}
