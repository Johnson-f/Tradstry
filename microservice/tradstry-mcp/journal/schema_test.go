package journal

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"statusQuery":          statusQuery,
		"prepareQuery":         prepareQuery,
		"enableMutation":       enableMutation,
		"tradesQuery":          tradesQuery,
		"detailQuery":          detailQuery,
		"saveContextMutation":  saveContextMutation,
		"saveDraftMutation":    saveDraftMutation,
		"markReviewedMutation": markReviewedMutation,
		"openSessionMutation":  openSessionMutation,
		"moveCursorMutation":   moveCursorMutation,
		"namesQuery":           namesQuery,
		"suggestionsQuery":     suggestionsQuery,
		"historyQuery":         historyQuery,
		"executionsQuery":      executionsQuery,
		"previewGrouping":      previewGroupingMutation,
		"confirmGrouping":      confirmGroupingMutation,
		"keepSeparate":         keepSeparateMutation,
		"manualQuery":          manualQuery,
		"createManual":         createManual,
		"updateManual":         updateManual,
		"deleteManual":         deleteManual,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
