package notebook

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/oauth"
)

type folderView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	ParentID  string `json:"parent_id,omitempty"`
	IsSystem  bool   `json:"is_system,omitempty" jsonschema:"managed by Tradstry; cannot be renamed, moved or deleted, but its notes can"`
	NoteCount int    `json:"note_count" jsonschema:"notes directly in this folder"`
}

type workspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type listFoldersOutput struct {
	Folders      []folderView `json:"folders"`
	UnfiledNotes int          `json:"unfiled_notes"`
}

func (t *tools) listFolders(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, listFoldersOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, listFoldersOutput{}, err
	}
	folders, counts, err := t.api.folders(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listFoldersOutput{}, forUser(err)
	}
	direct := map[string]int{}
	out := listFoldersOutput{Folders: make([]folderView, 0, len(folders))}
	for _, c := range counts {
		if c.FolderID == nil {
			out.UnfiledNotes = c.NoteCount
		} else {
			direct[*c.FolderID] = c.NoteCount
		}
	}
	paths := paths(folders)
	for _, f := range folders {
		v := folderView{ID: f.ID, Name: f.Name, Path: paths[f.ID], IsSystem: f.IsSystem, NoteCount: direct[f.ID]}
		if f.ParentFolderID != nil {
			v.ParentID = *f.ParentFolderID
		}
		out.Folders = append(out.Folders, v)
	}
	sort.SliceStable(out.Folders, func(i, j int) bool { return out.Folders[i].Path < out.Folders[j].Path })
	return nil, out, nil
}

type createFolderInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Name        string `json:"name" jsonschema:"the folder's name, such as Macro"`
	ParentID    string `json:"parent_id,omitempty" jsonschema:"folder to create it in; top level when left out"`
}

func (t *tools) createFolder(ctx context.Context, req *mcp.CallToolRequest, in createFolderInput) (*mcp.CallToolResult, folderView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, folderView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, folderView{}, errors.New("give the folder a name")
	}
	var parent *string
	if in.ParentID != "" {
		parent = &in.ParentID
	}
	f, err := t.api.createFolder(ctx, caller.Token, in.WorkspaceID, name, parent)
	if err != nil {
		return nil, folderView{}, forUser(err)
	}
	return t.folderAfter(ctx, caller.Token, in.WorkspaceID, f.ID)
}

// folderAfter reads a folder back with its path once a change has landed.
func (t *tools) folderAfter(ctx context.Context, token, ws, id string) (*mcp.CallToolResult, folderView, error) {
	folders, counts, err := t.api.folders(ctx, token, ws)
	if err != nil {
		return nil, folderView{}, forUser(err)
	}
	paths := paths(folders)
	for _, f := range folders {
		if f.ID != id {
			continue
		}
		v := folderView{ID: f.ID, Name: f.Name, Path: paths[f.ID], IsSystem: f.IsSystem}
		if f.ParentFolderID != nil {
			v.ParentID = *f.ParentFolderID
		}
		for _, c := range counts {
			if c.FolderID != nil && *c.FolderID == id {
				v.NoteCount = c.NoteCount
			}
		}
		return nil, v, nil
	}
	return nil, folderView{}, errors.New("folder not found; call list_folders for valid IDs")
}

type renameFolderInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	FolderID    string `json:"folder_id" jsonschema:"ID from list_folders"`
	Name        string `json:"name" jsonschema:"the new name"`
}

func (t *tools) renameFolder(ctx context.Context, req *mcp.CallToolRequest, in renameFolderInput) (*mcp.CallToolResult, folderView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, folderView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, folderView{}, errors.New("give the folder a name")
	}
	if _, err := t.api.renameFolder(ctx, caller.Token, in.FolderID, name); err != nil {
		return nil, folderView{}, forUser(err)
	}
	return t.folderAfter(ctx, caller.Token, in.WorkspaceID, in.FolderID)
}

type moveFolderInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	FolderID    string `json:"folder_id" jsonschema:"ID from list_folders"`
	ParentID    string `json:"parent_id,omitempty" jsonschema:"folder to move it into"`
	TopLevel    bool   `json:"top_level,omitempty" jsonschema:"move it out to the top level"`
}

func (t *tools) moveFolder(ctx context.Context, req *mcp.CallToolRequest, in moveFolderInput) (*mcp.CallToolResult, folderView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, folderView{}, err
	}
	if (in.ParentID == "") == !in.TopLevel {
		return nil, folderView{}, errors.New("pass either parent_id or top_level")
	}
	var parent *string
	if in.ParentID != "" {
		parent = &in.ParentID
	}
	if err := t.api.move(ctx, caller.Token, in.WorkspaceID, in.FolderID, "FOLDER", parent); err != nil {
		return nil, folderView{}, forUser(err)
	}
	return t.folderAfter(ctx, caller.Token, in.WorkspaceID, in.FolderID)
}

type deleteFolderInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	FolderID          string `json:"folder_id" jsonschema:"ID from list_folders"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

func (t *tools) deleteFolder(ctx context.Context, req *mcp.CallToolRequest, in deleteFolderInput) (*mcp.CallToolResult, deleteOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	folders, counts, err := t.api.folders(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, deleteOutput{}, forUser(err)
	}
	target, subfolders, notes := subtree(folders, counts, in.FolderID)
	if target == nil {
		return nil, deleteOutput{}, errors.New("folder not found; call list_folders for valid IDs")
	}
	if target.IsSystem {
		return nil, deleteOutput{}, errors.New("this is a system folder Tradstry manages; it cannot be deleted, though its notes can")
	}

	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool:     "delete_folder",
		Target:   target.ID,
		Question: deleteFolderQuestion(paths(folders)[target.ID], subfolders, notes),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, deleteOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.deleteFolder(ctx, caller.Token, target.ID); err != nil {
		return nil, deleteOutput{}, forUser(err)
	}
	return nil, deleteOutput{Status: "deleted", Message: fmt.Sprintf(
		"Deleted “%s”. Its notes can be restored one by one with restore_note for 30 days.", target.Name)}, nil
}

// subtree finds the folder with id and counts the folders and notes beneath it.
func subtree(folders []folder, counts []folderCount, id string) (*folder, int, int) {
	children := map[string][]string{}
	var target *folder
	for i, f := range folders {
		if f.ID == id {
			target = &folders[i]
		}
		if f.ParentFolderID != nil {
			children[*f.ParentFolderID] = append(children[*f.ParentFolderID], f.ID)
		}
	}
	if target == nil {
		return nil, 0, 0
	}
	direct := map[string]int{}
	for _, c := range counts {
		if c.FolderID != nil {
			direct[*c.FolderID] = c.NoteCount
		}
	}
	subfolders, notes := 0, 0
	queue := []string{id}
	seen := map[string]bool{}
	for len(queue) > 0 {
		at := queue[0]
		queue = queue[1:]
		if seen[at] {
			continue
		}
		seen[at] = true
		notes += direct[at]
		for _, child := range children[at] {
			subfolders++
			queue = append(queue, child)
		}
	}
	return target, subfolders, notes
}

func deleteFolderQuestion(path string, subfolders, notes int) string {
	var holds []string
	if subfolders > 0 {
		holds = append(holds, plural(subfolders, "subfolder"))
	}
	if notes > 0 {
		holds = append(holds, plural(notes, "note"))
	}
	if len(holds) == 0 {
		return fmt.Sprintf("Delete the empty folder “%s”?", path)
	}
	return fmt.Sprintf("Delete the folder “%s” with its %s? Its notes can be restored one by one for 30 days.",
		path, strings.Join(holds, " and "))
}

func plural(n int, noun string) string {
	if n == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
