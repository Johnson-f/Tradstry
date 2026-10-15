package overview

import (
	"testing"

	"tradstry-mcp/gqlcheck"
)

func TestOperationsMatchTheBackendSchema(t *testing.T) {
	for name, query := range map[string]string{
		"workspacesQuery": workspacesQuery,
		"journalQuery":    journalQuery,
		"syncQuery":       syncQuery,
	} {
		if err := gqlcheck.Document(query); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
