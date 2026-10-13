package tags

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
)

type tools struct {
	api       api
	confirmer *confirm.Confirmer
}

func Register(server *mcp.Server, client *graphql.Client, confirmer *confirm.Confirmer) {
	t := &tools{api: api{client: client}, confirmer: confirmer}
	write := &mcp.ToolAnnotations{DestructiveHint: new(false), OpenWorldHint: new(false)}
	destructive := &mcp.ToolAnnotations{DestructiveHint: new(true), OpenWorldHint: new(false)}

	mcp.AddTool(server, &mcp.Tool{
		Name:  "list_tags",
		Title: "List tags",
		Description: "The workspace's tag categories in order, each with its tags and how many journal trades carry each tag. " +
			"Mistakes, Tactics and Edges are built in; tags in Mistakes are what get_mistake_costs reports.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: new(false)},
	}, t.list)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_tag",
		Title:       "Create tag",
		Description: "Add a tag to a category, such as FOMO under Mistakes. " + colorHelp,
		Annotations: write,
	}, t.createTag)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_tag",
		Title:       "Update tag",
		Description: "Rename a tag or change its color. " + colorHelp,
		Annotations: write,
	}, t.updateTag)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "merge_tags",
		Title: "Merge tags",
		Description: "Fold one tag into another: every trade with the first gets the second, and the first is removed. " +
			"The user must confirm first, because it cannot be undone.",
		Annotations: destructive,
	}, t.merge)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_tag",
		Title: "Delete tag",
		Description: "Delete a tag and remove it from every trade. The user must confirm first, because it cannot be undone. " +
			"To combine two tags without losing trades, use merge_tags.",
		Annotations: destructive,
	}, t.deleteTag)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_tag_category",
		Title:       "Create tag category",
		Description: "Add a tag category, such as Market conditions. " + colorHelp,
		Annotations: write,
	}, t.createCategory)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_tag_category",
		Title:       "Update tag category",
		Description: "Rename a tag category or change its color. Built-in categories keep their names. " + colorHelp,
		Annotations: write,
	}, t.updateCategory)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "move_tag_category",
		Title:       "Move tag category",
		Description: "Change where a category sits in the list; position 1 is the top.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.moveCategory)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_tag_category_workspaces",
		Title:       "Choose tag category workspaces",
		Description: "Make a tag category and its tags available in every workspace, or only in the ones listed.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false), IdempotentHint: true, OpenWorldHint: new(false)},
	}, t.setWorkspaces)

	mcp.AddTool(server, &mcp.Tool{
		Name:  "delete_tag_category",
		Title: "Delete tag category",
		Description: "Delete a category with all its tags, removing them from every trade. Built-in categories cannot be deleted. " +
			"The user must confirm first, because it cannot be undone.",
		Annotations: destructive,
	}, t.deleteCategory)
}

const colorHelp = "Colors are hex like #22c55e or one of: red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, gray."

var namedColors = map[string]string{
	"red": "#ef4444", "orange": "#f97316", "amber": "#f59e0b", "yellow": "#eab308", "green": "#22c55e", "teal": "#14b8a6",
	"blue": "#3b82f6", "indigo": "#6366f1", "purple": "#a855f7", "pink": "#ec4899", "gray": "#6b7280", "grey": "#6b7280",
}

var hexColor = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

func parseColor(given string) (string, error) {
	given = strings.ToLower(strings.TrimSpace(given))
	if hex, ok := namedColors[given]; ok {
		return hex, nil
	}
	if hexColor.MatchString(given) {
		return given, nil
	}
	return "", fmt.Errorf("%q is not a color. %s", given, colorHelp)
}

type tagView struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Color  string `json:"color,omitempty"`
	Trades *int   `json:"trades,omitempty" jsonschema:"journal trades carrying the tag; absent when the journal is off"`
}

type categoryView struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind" jsonschema:"mistake, tactic or edge for the built-in categories; custom otherwise"`
	Position    int       `json:"position"`
	Color       string    `json:"color,omitempty"`
	AvailableIn []string  `json:"available_in" jsonschema:"workspace names, or All workspaces"`
	Tags        []tagView `json:"tags"`
}

func kind(c category) string {
	if c.Role == nil {
		return "custom"
	}
	return strings.ToLower(*c.Role)
}

func ordered(c catalog) []category {
	out := slices.Clone(c.Categories)
	slices.SortStableFunc(out, func(a, b category) int { return a.SortOrder - b.SortOrder })
	return out
}

func viewOf(c catalog, cat category, position int, usage map[string]int) categoryView {
	v := categoryView{ID: cat.ID, Name: cat.Name, Kind: kind(cat), Position: position, Color: deref(cat.Color),
		AvailableIn: []string{"All workspaces"}, Tags: []tagView{}}
	if cat.Availability == "selected" {
		v.AvailableIn = []string{}
		for _, w := range c.Workspaces {
			if slices.Contains(cat.WorkspaceIDs, w.ID) {
				v.AvailableIn = append(v.AvailableIn, w.Name)
			}
		}
	}
	for _, tg := range c.Tags {
		if tg.CategoryID != cat.ID {
			continue
		}
		tv := tagView{ID: tg.ID, Name: tg.Name, Color: deref(tg.Color)}
		if usage != nil {
			n := usage[tg.ID]
			tv.Trades = &n
		}
		v.Tags = append(v.Tags, tv)
	}
	return v
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// findCategory resolves a category given by ID or name.
func findCategory(c catalog, given string) (category, error) {
	given = strings.TrimSpace(given)
	for _, cat := range c.Categories {
		if cat.ID == given || strings.EqualFold(cat.Name, given) {
			return cat, nil
		}
	}
	names := make([]string, 0, len(c.Categories))
	for _, cat := range ordered(c) {
		names = append(names, cat.Name)
	}
	return category{}, fmt.Errorf("there is no tag category %q; the categories are: %s", given, strings.Join(names, ", "))
}

// findTag resolves a tag given by ID, by name, or as "Category / Tag" when a
// name is used in more than one category.
func findTag(c catalog, given string) (tag, error) {
	given = strings.TrimSpace(given)
	categoryName, tagName, qualified := strings.Cut(given, "/")
	var matches []tag
	for _, tg := range c.Tags {
		if tg.ID == given {
			return tg, nil
		}
		if qualified {
			cat, err := findCategory(c, categoryName)
			if err == nil && cat.ID == tg.CategoryID && strings.EqualFold(tg.Name, strings.TrimSpace(tagName)) {
				matches = append(matches, tg)
			}
		} else if strings.EqualFold(tg.Name, given) {
			matches = append(matches, tg)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return tag{}, fmt.Errorf("there is no tag %q; call list_tags to see them", given)
	}
	var options []string
	for _, tg := range matches {
		cat, _ := findCategory(c, tg.CategoryID)
		options = append(options, cat.Name+" / "+tg.Name)
	}
	return tag{}, fmt.Errorf("%q is in more than one category; say which: %s", given, strings.Join(options, ", "))
}

type workspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type listOutput struct {
	Categories []categoryView `json:"categories"`
	Note       string         `json:"note,omitempty"`
}

func (t *tools) list(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	c, err := t.api.catalog(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	usage, err := t.api.usage(ctx, caller.Token, in.WorkspaceID, c)
	if err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	out := listOutput{Categories: []categoryView{}}
	for i, cat := range ordered(c) {
		out.Categories = append(out.Categories, viewOf(c, cat, i+1, usage))
	}
	if usage == nil {
		out.Note = "The journal is off, so trade counts are not shown."
	}
	return nil, out, nil
}

// load reads the catalog and trade counts a change needs.
func (t *tools) load(ctx context.Context, token, ws string) (catalog, map[string]int, error) {
	c, err := t.api.catalog(ctx, token, ws)
	if err != nil {
		return catalog{}, nil, graphql.ForUser(err)
	}
	usage, err := t.api.usage(ctx, token, ws, c)
	return c, usage, graphql.ForUser(err)
}

func (t *tools) categoryAfter(ctx context.Context, token, ws, id string) (categoryView, error) {
	c, usage, err := t.load(ctx, token, ws)
	if err != nil {
		return categoryView{}, err
	}
	for i, cat := range ordered(c) {
		if cat.ID == id {
			return viewOf(c, cat, i+1, usage), nil
		}
	}
	return categoryView{}, errors.New("tag category not found; call list_tags")
}

func optionalColor(given string) (*string, error) {
	if strings.TrimSpace(given) == "" {
		return nil, nil
	}
	hex, err := parseColor(given)
	return &hex, err
}

type createTagInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Category    string `json:"category" jsonschema:"the category, by name or ID"`
	Name        string `json:"name" jsonschema:"such as FOMO"`
	Color       string `json:"color,omitempty" jsonschema:"hex or a plain color name; the category's color when left out"`
}

func (t *tools) createTag(ctx context.Context, req *mcp.CallToolRequest, in createTagInput) (*mcp.CallToolResult, categoryView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, categoryView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, categoryView{}, errors.New("give the tag a name")
	}
	color, err := optionalColor(in.Color)
	if err != nil {
		return nil, categoryView{}, err
	}
	c, _, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, categoryView{}, err
	}
	cat, err := findCategory(c, in.Category)
	if err != nil {
		return nil, categoryView{}, err
	}
	if _, err := t.api.createTag(ctx, caller.Token, in.WorkspaceID, cat.ID, name, color); err != nil {
		return nil, categoryView{}, graphql.ForUser(err)
	}
	v, err := t.categoryAfter(ctx, caller.Token, in.WorkspaceID, cat.ID)
	return nil, v, err
}

type updateTagInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Tag         string `json:"tag" jsonschema:"by name, ID, or Category / Tag"`
	Name        string `json:"name,omitempty" jsonschema:"new name"`
	Color       string `json:"color,omitempty" jsonschema:"hex or a plain color name"`
	ClearColor  bool   `json:"clear_color,omitempty" jsonschema:"use the category's color again"`
}

func (t *tools) updateTag(ctx context.Context, req *mcp.CallToolRequest, in updateTagInput) (*mcp.CallToolResult, categoryView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, categoryView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" && in.Color == "" && !in.ClearColor {
		return nil, categoryView{}, errors.New("say what to change: name, color or clear_color")
	}
	color, err := optionalColor(in.Color)
	if err != nil {
		return nil, categoryView{}, err
	}
	c, _, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, categoryView{}, err
	}
	tg, err := findTag(c, in.Tag)
	if err != nil {
		return nil, categoryView{}, err
	}
	if name != "" {
		if _, err := t.api.renameTag(ctx, caller.Token, tg.ID, name); err != nil {
			return nil, categoryView{}, graphql.ForUser(err)
		}
	}
	if color != nil || in.ClearColor {
		if _, err := t.api.tagColor(ctx, caller.Token, tg.ID, color); err != nil {
			return nil, categoryView{}, graphql.ForUser(err)
		}
	}
	v, err := t.categoryAfter(ctx, caller.Token, in.WorkspaceID, tg.CategoryID)
	return nil, v, err
}

type confirmOutput struct {
	Status            string `json:"status" jsonschema:"done, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func unapproved(outcome confirm.Outcome) confirmOutput {
	status := "cancelled"
	if outcome.Token != "" {
		status = "needs_confirmation"
	}
	return confirmOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}
}

func trades(usage map[string]int, ids ...string) string {
	if usage == nil {
		return "its trades"
	}
	n := 0
	for _, id := range ids {
		n += usage[id]
	}
	if n == 1 {
		return "1 trade"
	}
	return fmt.Sprintf("%d trades", n)
}

type mergeInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	From              string `json:"from" jsonschema:"the tag to fold away, by name, ID, or Category / Tag"`
	Into              string `json:"into" jsonschema:"the tag to keep"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

func (t *tools) merge(ctx context.Context, req *mcp.CallToolRequest, in mergeInput) (*mcp.CallToolResult, confirmOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	c, usage, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	from, err := findTag(c, in.From)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	into, err := findTag(c, in.Into)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if from.ID == into.ID {
		return nil, confirmOutput{}, errors.New("those are the same tag")
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "merge_tags", Target: from.ID + ">" + into.ID,
		Question: fmt.Sprintf("Merge “%s” into “%s”? %s tagged “%s” will be tagged “%s”, and “%s” will be removed. This cannot be undone.",
			from.Name, into.Name, capitalize(trades(usage, from.ID)), from.Name, into.Name, from.Name),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.merge(ctx, caller.Token, from.ID, into.ID); err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	return nil, confirmOutput{Status: "done", Message: fmt.Sprintf("Merged “%s” into “%s”.", from.Name, into.Name)}, nil
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

type deleteTagInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Tag               string `json:"tag" jsonschema:"by name, ID, or Category / Tag"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

func (t *tools) deleteTag(ctx context.Context, req *mcp.CallToolRequest, in deleteTagInput) (*mcp.CallToolResult, confirmOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	c, usage, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	tg, err := findTag(c, in.Tag)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_tag", Target: tg.ID,
		Question: fmt.Sprintf("Delete the tag “%s” and remove it from %s? This cannot be undone.", tg.Name, trades(usage, tg.ID)),
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.deleteTag(ctx, caller.Token, tg.ID); err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	return nil, confirmOutput{Status: "done", Message: fmt.Sprintf("Deleted “%s”.", tg.Name)}, nil
}

type createCategoryInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Name        string `json:"name" jsonschema:"such as Market conditions"`
	Color       string `json:"color,omitempty" jsonschema:"hex or a plain color name"`
}

func (t *tools) createCategory(ctx context.Context, req *mcp.CallToolRequest, in createCategoryInput) (*mcp.CallToolResult, categoryView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, categoryView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, categoryView{}, errors.New("give the category a name")
	}
	color, err := optionalColor(in.Color)
	if err != nil {
		return nil, categoryView{}, err
	}
	created, err := t.api.createCategory(ctx, caller.Token, in.WorkspaceID, name, color)
	if err != nil {
		return nil, categoryView{}, graphql.ForUser(err)
	}
	v, err := t.categoryAfter(ctx, caller.Token, in.WorkspaceID, created.ID)
	return nil, v, err
}

type updateCategoryInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Category    string `json:"category" jsonschema:"by name or ID"`
	Name        string `json:"name,omitempty" jsonschema:"new name"`
	Color       string `json:"color,omitempty" jsonschema:"hex or a plain color name"`
	ClearColor  bool   `json:"clear_color,omitempty" jsonschema:"remove the category's color"`
}

func (t *tools) updateCategory(ctx context.Context, req *mcp.CallToolRequest, in updateCategoryInput) (*mcp.CallToolResult, categoryView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, categoryView{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" && in.Color == "" && !in.ClearColor {
		return nil, categoryView{}, errors.New("say what to change: name, color or clear_color")
	}
	color, err := optionalColor(in.Color)
	if err != nil {
		return nil, categoryView{}, err
	}
	c, _, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, categoryView{}, err
	}
	cat, err := findCategory(c, in.Category)
	if err != nil {
		return nil, categoryView{}, err
	}
	if name != "" {
		if cat.Role != nil {
			return nil, categoryView{}, fmt.Errorf("“%s” is built in and keeps its name; its color can still change", cat.Name)
		}
		if _, err := t.api.renameCategory(ctx, caller.Token, cat.ID, name); err != nil {
			return nil, categoryView{}, graphql.ForUser(err)
		}
	}
	if color != nil || in.ClearColor {
		if _, err := t.api.categoryColor(ctx, caller.Token, cat.ID, color); err != nil {
			return nil, categoryView{}, graphql.ForUser(err)
		}
	}
	v, err := t.categoryAfter(ctx, caller.Token, in.WorkspaceID, cat.ID)
	return nil, v, err
}

type moveCategoryInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Category    string `json:"category" jsonschema:"by name or ID"`
	Position    int    `json:"position" jsonschema:"1 is the top"`
}

func (t *tools) moveCategory(ctx context.Context, req *mcp.CallToolRequest, in moveCategoryInput) (*mcp.CallToolResult, listOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, listOutput{}, err
	}
	c, _, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, listOutput{}, err
	}
	cat, err := findCategory(c, in.Category)
	if err != nil {
		return nil, listOutput{}, err
	}
	order := ordered(c)
	from := slices.IndexFunc(order, func(x category) bool { return x.ID == cat.ID })
	to := min(max(in.Position, 1), len(order)) - 1
	order = slices.Insert(slices.Delete(order, from, from+1), to, cat)
	ids := make([]string, len(order))
	for i, x := range order {
		ids[i] = x.ID
	}
	if err := t.api.reorder(ctx, caller.Token, ids); err != nil {
		return nil, listOutput{}, graphql.ForUser(err)
	}
	return t.list(ctx, req, workspaceInput{WorkspaceID: in.WorkspaceID})
}

type workspacesInput struct {
	WorkspaceID  string   `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Category     string   `json:"category" jsonschema:"by name or ID"`
	All          bool     `json:"all,omitempty" jsonschema:"available in every workspace"`
	WorkspaceIDs []string `json:"workspace_ids,omitempty" jsonschema:"only these workspaces, from list_workspaces"`
}

func (t *tools) setWorkspaces(ctx context.Context, req *mcp.CallToolRequest, in workspacesInput) (*mcp.CallToolResult, categoryView, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, categoryView{}, err
	}
	if in.All == (len(in.WorkspaceIDs) > 0) {
		return nil, categoryView{}, errors.New("pass either all or workspace_ids")
	}
	c, _, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, categoryView{}, err
	}
	cat, err := findCategory(c, in.Category)
	if err != nil {
		return nil, categoryView{}, err
	}
	availability := "selected"
	if in.All {
		availability = "all"
	}
	updated, err := t.api.setWorkspaces(ctx, caller.Token, cat.ID, availability, in.WorkspaceIDs)
	if err != nil {
		return nil, categoryView{}, graphql.ForUser(err)
	}
	position := slices.IndexFunc(ordered(c), func(x category) bool { return x.ID == cat.ID }) + 1
	return nil, viewOf(c, updated, position, nil), nil
}

type deleteCategoryInput struct {
	WorkspaceID       string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	Category          string `json:"category" jsonschema:"by name or ID"`
	ConfirmationToken string `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly agreed"`
}

func (t *tools) deleteCategory(ctx context.Context, req *mcp.CallToolRequest, in deleteCategoryInput) (*mcp.CallToolResult, confirmOutput, error) {
	caller, err := oauth.CallerOf(req)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	c, usage, err := t.load(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	cat, err := findCategory(c, in.Category)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if cat.Role != nil {
		return nil, confirmOutput{}, fmt.Errorf("“%s” is built in and cannot be deleted; its tags can be", cat.Name)
	}
	var ids []string
	for _, tg := range c.Tags {
		if tg.CategoryID == cat.ID {
			ids = append(ids, tg.ID)
		}
	}
	question := fmt.Sprintf("Delete the empty category “%s”?", cat.Name)
	if len(ids) > 0 {
		question = fmt.Sprintf("Delete the category “%s” with its %d tags, removing them from %s? This cannot be undone.",
			cat.Name, len(ids), trades(usage, ids...))
	}
	outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
		Tool: "delete_tag_category", Target: cat.ID, Question: question,
	}, in.ConfirmationToken)
	if err != nil {
		return nil, confirmOutput{}, err
	}
	if !outcome.Approved {
		return outcome.Ask, unapproved(outcome), nil
	}
	if err := t.api.deleteCategory(ctx, caller.Token, cat.ID); err != nil {
		return nil, confirmOutput{}, graphql.ForUser(err)
	}
	return nil, confirmOutput{Status: "done", Message: fmt.Sprintf("Deleted “%s”.", cat.Name)}, nil
}
