package tags_test

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"tradstry-mcp/mcptest"
)

type fakeAPI struct {
	mu         sync.Mutex
	categories []map[string]any
	tags       []map[string]any
	journalOn  bool
	calls      []string
	order      []any
}

func newFake() *fakeAPI {
	mistake := "MISTAKE"
	return &fakeAPI{
		journalOn: true,
		categories: []map[string]any{
			{"id": "c-mistakes", "name": "Mistakes", "role": mistake, "color": nil, "sortOrder": 0, "availability": "all", "workspaceIds": []string{}},
			{"id": "c-market", "name": "Market", "role": nil, "color": "#3b82f6", "sortOrder": 1, "availability": "all", "workspaceIds": []string{}},
		},
		tags: []map[string]any{
			{"id": "t-fomo", "categoryId": "c-mistakes", "name": "FOMO", "color": nil},
			{"id": "t-chase", "categoryId": "c-mistakes", "name": "Chased", "color": nil},
			{"id": "t-trend", "categoryId": "c-market", "name": "Trend day", "color": nil},
			{"id": "t-fomo2", "categoryId": "c-market", "name": "Chased", "color": nil},
		},
	}
}

func (f *fakeAPI) respond(req mcptest.Request) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := req.Variables
	for _, op := range []string{"createTagCategory", "renameTagCategory", "setTagCategoryColor", "reorderTagCategories", "setTagCategoryApplicability", "deleteTagCategory", "createTag(", "renameTag(", "setTagColor", "mergeTags", "deleteTag("} {
		if strings.Contains(req.Query, op) {
			f.calls = append(f.calls, strings.TrimSuffix(op, "("))
		}
	}
	switch {
	case strings.Contains(req.Query, "journalTradesV2"):
		return data(map[string]any{"journalTradesV2": []any{
			map[string]any{"tags": []any{map[string]any{"id": "t-fomo"}}},
			map[string]any{"tags": []any{map[string]any{"id": "t-fomo"}, map[string]any{"id": "t-trend"}}},
		}})
	case strings.Contains(req.Query, "createTagCategory"):
		c := map[string]any{"id": "c-new", "name": v["name"], "role": nil, "color": v["color"], "sortOrder": 2, "availability": "all", "workspaceIds": []string{}}
		f.categories = append(f.categories, c)
		return data(map[string]any{"createTagCategory": c})
	case strings.Contains(req.Query, "createTag("):
		t := map[string]any{"id": "t-new", "categoryId": v["category"], "name": v["name"], "color": v["color"]}
		f.tags = append(f.tags, t)
		return data(map[string]any{"createTag": t})
	case strings.Contains(req.Query, "reorderTagCategories"):
		f.order = v["order"].([]any)
		return data(map[string]any{"reorderTagCategories": true})
	case strings.Contains(req.Query, "setTagCategoryApplicability"):
		c := f.categories[1]
		input := v["input"].(map[string]any)
		c["availability"], c["workspaceIds"] = input["availability"], input["workspaceIds"]
		return data(map[string]any{"setTagCategoryApplicability": c})
	case strings.Contains(req.Query, "mergeTags"), strings.Contains(req.Query, "deleteTag("), strings.Contains(req.Query, "deleteTagCategory"):
		for _, key := range []string{"mergeTags", "deleteTag", "deleteTagCategory"} {
			if strings.Contains(req.Query, key) {
				return data(map[string]any{key: true})
			}
		}
	case strings.Contains(req.Query, "renameTag("), strings.Contains(req.Query, "setTagColor"):
		return data(map[string]any{"renameTag": f.tags[0], "setTagColor": f.tags[0]})
	default:
		return data(map[string]any{
			"tagCategories":     f.categories,
			"tags":              f.tags,
			"journalFlowStatus": map[string]any{"enabled": f.journalOn},
			"workspaces":        []any{map[string]any{"id": "ws1", "name": "Main"}, map[string]any{"id": "ws2", "name": "Options"}},
		})
	}
	return `{"data":null,"errors":[{"message":"unexpected"}]}`
}

func (f *fakeAPI) sent() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.calls)
}

func data(value any) string {
	body, _ := json.Marshal(map[string]any{"data": value})
	return string(body)
}

type category struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"`
	Position    int      `json:"position"`
	Color       string   `json:"color"`
	AvailableIn []string `json:"available_in"`
	Tags        []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Color  string `json:"color"`
		Trades *int   `json:"trades"`
	} `json:"tags"`
}

type confirmResult struct {
	Status            string `json:"status"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token"`
}

func TestListShowsCategoriesInOrderWithTradeCounts(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, out := mcptest.Call[struct{ Categories []category }](t, session, "list_tags", map[string]any{"workspace_id": "ws1"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	mistakes := out.Categories[0]
	if mistakes.Kind != "mistake" || mistakes.Position != 1 || out.Categories[1].Kind != "custom" {
		t.Errorf("categories = %+v", out.Categories)
	}
	if fomo := mistakes.Tags[0]; fomo.Name != "FOMO" || fomo.Trades == nil || *fomo.Trades != 2 {
		t.Errorf("FOMO = %+v", fomo)
	}

	api.journalOn = false
	_, off := mcptest.Call[struct {
		Categories []category
		Note       string
	}](t, session, "list_tags", map[string]any{"workspace_id": "ws1"})
	if off.Categories[0].Tags[0].Trades != nil || !strings.Contains(off.Note, "journal is off") {
		t.Errorf("journal off = %+v", off)
	}
}

func TestCreateTagFindsTheCategoryByNameAndReadsPlainColors(t *testing.T) {
	api := newFake()
	s := mcptest.Start(t, api.respond)
	session := s.Connect(t, nil)

	result, out := mcptest.Call[category](t, session, "create_tag", map[string]any{"workspace_id": "ws1", "category": "mistakes", "name": "Revenge", "color": "Red"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	for _, r := range s.Requests() {
		if strings.Contains(r.Query, "createTag(") && (r.Variables["category"] != "c-mistakes" || r.Variables["color"] != "#ef4444") {
			t.Errorf("sent %v", r.Variables)
		}
	}
	if out.Name != "Mistakes" || out.Tags[len(out.Tags)-1].Name != "Revenge" {
		t.Errorf("result = %+v", out)
	}
	result, _ = mcptest.Call[category](t, session, "create_tag", map[string]any{"workspace_id": "ws1", "category": "Mistakes", "name": "x", "color": "sparkly"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "is not a color") {
		t.Errorf("bad color: %q", mcptest.Text(result))
	}
}

func TestATagNameUsedTwiceMustBeQualified(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[category](t, session, "update_tag", map[string]any{"workspace_id": "ws1", "tag": "Chased", "name": "Chased entry"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "Mistakes / Chased") {
		t.Errorf("ambiguous: %q", mcptest.Text(result))
	}
	result, _ = mcptest.Call[category](t, session, "update_tag", map[string]any{"workspace_id": "ws1", "tag": "Mistakes / Chased", "name": "Chased entry"})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
}

func TestBuiltInCategoriesKeepTheirNamesAndCannotBeDeleted(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[category](t, session, "update_tag_category", map[string]any{"workspace_id": "ws1", "category": "Mistakes", "name": "Errors"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "built in") {
		t.Errorf("rename built-in: %q", mcptest.Text(result))
	}
	result, _ = mcptest.Call[confirmResult](t, session, "delete_tag_category", map[string]any{"workspace_id": "ws1", "category": "Mistakes"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "cannot be deleted") {
		t.Errorf("delete built-in: %q", mcptest.Text(result))
	}

	result, first := mcptest.Call[confirmResult](t, session, "delete_tag_category", map[string]any{"workspace_id": "ws1", "category": "Market"})
	if result.IsError || first.Status != "needs_confirmation" || !strings.Contains(first.Message, "2 tags, removing them from 1 trade") {
		t.Errorf("first = %+v %q", first, mcptest.Text(result))
	}
	if slices.Contains(api.sent(), "deleteTagCategory") {
		t.Error("deleted before the user confirmed")
	}
}

func TestMergeAndDeleteWaitForTheUser(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	args := map[string]any{"workspace_id": "ws1", "from": "FOMO", "into": "Mistakes / Chased"}
	_, first := mcptest.Call[confirmResult](t, session, "merge_tags", args)
	if first.Status != "needs_confirmation" || !strings.Contains(first.Message, "2 trades tagged “FOMO” will be tagged “Chased”") {
		t.Fatalf("first = %+v", first)
	}
	args["confirmation_token"] = first.ConfirmationToken
	if _, done := mcptest.Call[confirmResult](t, session, "merge_tags", args); done.Status != "done" {
		t.Errorf("confirmed = %+v", done)
	}

	_, del := mcptest.Call[confirmResult](t, session, "delete_tag", map[string]any{"workspace_id": "ws1", "tag": "Trend day"})
	if del.Status != "needs_confirmation" || !strings.Contains(del.Message, "remove it from 1 trade") {
		t.Errorf("delete = %+v", del)
	}
	if got := api.sent(); fmt.Sprint(got) != "[mergeTags]" {
		t.Errorf("calls = %v", got)
	}
}

func TestMoveAndChooseWorkspaces(t *testing.T) {
	api := newFake()
	session := mcptest.Start(t, api.respond).Connect(t, nil)

	result, _ := mcptest.Call[struct{ Categories []category }](t, session, "move_tag_category", map[string]any{"workspace_id": "ws1", "category": "Market", "position": 1})
	if result.IsError {
		t.Fatal(mcptest.Text(result))
	}
	if first := api.order[0].(map[string]any); first["id"] != "c-market" || first["sortOrder"] != float64(0) {
		t.Errorf("order = %v", api.order)
	}

	result, out := mcptest.Call[category](t, session, "set_tag_category_workspaces", map[string]any{"workspace_id": "ws1", "category": "Market", "workspace_ids": []string{"ws2"}})
	if result.IsError || fmt.Sprint(out.AvailableIn) != "[Options]" {
		t.Errorf("workspaces = %+v %q", out, mcptest.Text(result))
	}
}
