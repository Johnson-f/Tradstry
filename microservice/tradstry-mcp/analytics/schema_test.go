package analytics

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

// Every operation this package can send must match the backend's schema, even
// ones no tool test happens to exercise.
func TestOperationsMatchTheBackendSchema(t *testing.T) {
	operations := map[string]string{
		"contextQuery":     contextQuery,
		"namesQuery":       namesQuery,
		"performanceQuery": performanceQuery,
		"dailyQuery":       dailyQuery,
		"mistakesQuery":    mistakesQuery,
	}
	for dimension := range breakdownFields {
		operations["breakdownQuery("+dimension+")"] = breakdownQuery(dimension)
	}
	for name, query := range operations {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
