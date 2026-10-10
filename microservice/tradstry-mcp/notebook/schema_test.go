package notebook

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"foldersQuery":         foldersQuery,
		"summariesQuery":       summariesQuery,
		"documentQuery":        documentQuery,
		"searchQuery":          searchQuery,
		"deletedQuery":         deletedQuery,
		"createNoteMutation":   createNoteMutation,
		"editNoteMutation":     editNoteMutation,
		"flagsMutation":        flagsMutation,
		"moveMutation":         moveMutation,
		"linkMutation":         linkMutation,
		"deleteMutation":       deleteMutation,
		"restoreMutation":      restoreMutation,
		"createFolderMutation": createFolderMutation,
		"renameFolderMutation": renameFolderMutation,
		"deleteFolderMutation": deleteFolderMutation,
		"tradeNoteMutation":    tradeNoteMutation,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
