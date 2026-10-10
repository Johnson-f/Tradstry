package playbooks

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"listQuery":             listQuery,
		"getQuery":              getQuery,
		"principlesQuery":       principlesQuery,
		"createMutation":        createMutation,
		"updateMutation":        updateMutation,
		"applicabilityMutation": applicabilityMutation,
		"deleteMutation":        deleteMutation,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
