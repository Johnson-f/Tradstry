package gqlcheck

import "testing"

func TestTheBackendSchemaLoads(t *testing.T) {
	if _, err := schema(); err != nil {
		t.Fatal(err)
	}
}

func TestMisspeltFieldsAndArgumentsAreCaught(t *testing.T) {
	if err := Document(`query { workspaces { id name } }`); err != nil {
		t.Errorf("a valid query was rejected: %v", err)
	}
	for _, query := range []string{
		`query { workspaces { id nmae } }`,
		`query { workspace(identifier: "x") { id } }`,
		`mutation { deleteWorkspace }`,
	} {
		if Document(query) == nil {
			t.Errorf("%s was accepted", query)
		}
	}
	if err := Operation(`query W($id: String!) { workspace(id: $id) { id } }`, map[string]any{}); err == nil {
		t.Error("a missing required variable was accepted")
	}
}
