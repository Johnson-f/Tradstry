package calculator

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"settingsQuery": settingsQuery,
		"ruleMutation":  ruleMutation,
		"plansQuery":    plansQuery,
		"createPlanOp":  createPlanOp,
		"updatePlanOp":  updatePlanOp,
		"deletePlanOp":  deletePlanOp,
		"historyQuery":  historyQuery,
		"createEntryOp": createEntryOp,
		"deleteEntryOp": deleteEntryOp,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
