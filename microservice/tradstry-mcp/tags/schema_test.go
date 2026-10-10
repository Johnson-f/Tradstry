package tags

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"listQuery":              listQuery,
		"tradesQuery":            tradesQuery,
		"createCategoryMutation": createCategoryMutation,
		"renameCategoryMutation": renameCategoryMutation,
		"deleteCategoryMutation": deleteCategoryMutation,
		"createTagMutation":      createTagMutation,
		"renameTagMutation":      renameTagMutation,
		"mergeTagsMutation":      mergeTagsMutation,
		"deleteTagMutation":      deleteTagMutation,
		"categoryColorMutation":  categoryColorMutation,
		"reorderMutation":        reorderMutation,
		"applicabilityMutation":  applicabilityMutation,
		"tagColorMutation":       tagColorMutation,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
