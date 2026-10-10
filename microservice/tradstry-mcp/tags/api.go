package tags

import (
	"context"

	"tradstry-mcp/graphql"
)

type category struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Role         *string  `json:"role"`
	Color        *string  `json:"color"`
	SortOrder    int      `json:"sortOrder"`
	Availability string   `json:"availability"`
	WorkspaceIDs []string `json:"workspaceIds"`
}

type tag struct {
	ID         string  `json:"id"`
	CategoryID string  `json:"categoryId"`
	Name       string  `json:"name"`
	Color      *string `json:"color"`
}

type workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type taggedTrade struct {
	Tags []struct {
		ID string `json:"id"`
	} `json:"tags"`
}

const (
	categoryFields = `id name role color sortOrder availability workspaceIds`
	tagFields      = `id categoryId name color`

	listQuery = `query Tags($ws: String!) {
		tagCategories(workspaceId: $ws) { ` + categoryFields + ` }
		tags(workspaceId: $ws) { ` + tagFields + ` }
		journalFlowStatus(workspaceId: $ws) { enabled }
		workspaces { id name }
	}`
	tradesQuery = `query TaggedTrades($ws: String!) { journalTradesV2(workspaceId: $ws) { tags { id } } }`

	createCategoryMutation = `mutation CreateTagCategory($ws: String!, $name: String!, $color: String) { createTagCategory(workspaceId: $ws, name: $name, color: $color) { ` + categoryFields + ` } }`
	renameCategoryMutation = `mutation RenameTagCategory($id: String!, $name: String!) { renameTagCategory(id: $id, name: $name) { ` + categoryFields + ` } }`
	categoryColorMutation  = `mutation SetTagCategoryColor($id: String!, $color: String) { setTagCategoryColor(id: $id, color: $color) { ` + categoryFields + ` } }`
	reorderMutation        = `mutation ReorderTagCategories($order: [ReorderTagCategoryInput!]!) { reorderTagCategories(order: $order) }`
	applicabilityMutation  = `mutation SetTagCategoryApplicability($id: String!, $input: TagCategoryApplicabilityInput!) { setTagCategoryApplicability(id: $id, input: $input) { ` + categoryFields + ` } }`
	deleteCategoryMutation = `mutation DeleteTagCategory($id: String!) { deleteTagCategory(id: $id) }`
	createTagMutation      = `mutation CreateTag($ws: String!, $category: String!, $name: String!, $color: String) { createTag(workspaceId: $ws, categoryId: $category, name: $name, color: $color) { ` + tagFields + ` } }`
	renameTagMutation      = `mutation RenameTag($id: String!, $name: String!) { renameTag(id: $id, name: $name) { ` + tagFields + ` } }`
	tagColorMutation       = `mutation SetTagColor($id: String!, $color: String) { setTagColor(id: $id, color: $color) { ` + tagFields + ` } }`
	mergeTagsMutation      = `mutation MergeTags($from: String!, $into: String!) { mergeTags(fromId: $from, intoId: $into) }`
	deleteTagMutation      = `mutation DeleteTag($id: String!) { deleteTag(id: $id) }`
)

type api struct {
	client *graphql.Client
}

type catalog struct {
	Categories []category  `json:"tagCategories"`
	Tags       []tag       `json:"tags"`
	Workspaces []workspace `json:"workspaces"`
	Journal    *struct {
		Enabled bool `json:"enabled"`
	} `json:"journalFlowStatus"`
}

func (a api) catalog(ctx context.Context, token, ws string) (catalog, error) {
	var data catalog
	err := a.client.Do(ctx, token, listQuery, map[string]any{"ws": ws}, &data)
	return data, err
}

// usage counts the journal's trades carrying each tag. It is nil when the
// journal is off, because only journal trades can be counted.
func (a api) usage(ctx context.Context, token, ws string, c catalog) (map[string]int, error) {
	if c.Journal == nil || !c.Journal.Enabled {
		return nil, nil
	}
	var data struct {
		Trades []taggedTrade `json:"journalTradesV2"`
	}
	if err := a.client.Do(ctx, token, tradesQuery, map[string]any{"ws": ws}, &data); err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, t := range data.Trades {
		for _, tg := range t.Tags {
			counts[tg.ID]++
		}
	}
	return counts, nil
}

func (a api) createCategory(ctx context.Context, token, ws, name string, color *string) (category, error) {
	var data struct {
		Category category `json:"createTagCategory"`
	}
	err := a.client.Do(ctx, token, createCategoryMutation, map[string]any{"ws": ws, "name": name, "color": color}, &data)
	return data.Category, err
}

func (a api) categoryColor(ctx context.Context, token, id string, color *string) (category, error) {
	var data struct {
		Category category `json:"setTagCategoryColor"`
	}
	err := a.client.Do(ctx, token, categoryColorMutation, map[string]any{"id": id, "color": color}, &data)
	return data.Category, err
}

// reorder sets every category's place; the first ID comes first.
func (a api) reorder(ctx context.Context, token string, ids []string) error {
	order := make([]map[string]any, len(ids))
	for i, id := range ids {
		order[i] = map[string]any{"id": id, "sortOrder": i}
	}
	return a.client.Do(ctx, token, reorderMutation, map[string]any{"order": order}, nil)
}

func (a api) setWorkspaces(ctx context.Context, token, id, availability string, workspaceIDs []string) (category, error) {
	var data struct {
		Category category `json:"setTagCategoryApplicability"`
	}
	if workspaceIDs == nil {
		workspaceIDs = []string{}
	}
	err := a.client.Do(ctx, token, applicabilityMutation, map[string]any{
		"id": id, "input": map[string]any{"availability": availability, "workspaceIds": workspaceIDs},
	}, &data)
	return data.Category, err
}

func (a api) renameCategory(ctx context.Context, token, id, name string) (category, error) {
	var data struct {
		Category category `json:"renameTagCategory"`
	}
	err := a.client.Do(ctx, token, renameCategoryMutation, map[string]any{"id": id, "name": name}, &data)
	return data.Category, err
}

func (a api) deleteCategory(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deleteCategoryMutation, map[string]any{"id": id}, nil)
}

func (a api) createTag(ctx context.Context, token, ws, categoryID, name string, color *string) (tag, error) {
	var data struct {
		Tag tag `json:"createTag"`
	}
	err := a.client.Do(ctx, token, createTagMutation, map[string]any{"ws": ws, "category": categoryID, "name": name, "color": color}, &data)
	return data.Tag, err
}

func (a api) tagColor(ctx context.Context, token, id string, color *string) (tag, error) {
	var data struct {
		Tag tag `json:"setTagColor"`
	}
	err := a.client.Do(ctx, token, tagColorMutation, map[string]any{"id": id, "color": color}, &data)
	return data.Tag, err
}

func (a api) renameTag(ctx context.Context, token, id, name string) (tag, error) {
	var data struct {
		Tag tag `json:"renameTag"`
	}
	err := a.client.Do(ctx, token, renameTagMutation, map[string]any{"id": id, "name": name}, &data)
	return data.Tag, err
}

func (a api) merge(ctx context.Context, token, from, into string) error {
	return a.client.Do(ctx, token, mergeTagsMutation, map[string]any{"from": from, "into": into}, nil)
}

func (a api) deleteTag(ctx context.Context, token, id string) error {
	return a.client.Do(ctx, token, deleteTagMutation, map[string]any{"id": id}, nil)
}
