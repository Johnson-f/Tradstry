package graphql

import "testing"

func TestTheSameWriteAgainstTheSameStateKeepsItsID(t *testing.T) {
	type observed struct {
		Version  int
		Takeaway string
	}
	input := map[string]any{"entryId": "t1", "takeaway": "Trust the plan"}
	first := MutationID("draft", "ws1", input, observed{2, "Trust the plan"})
	retry := MutationID("draft", "ws1", map[string]any{"takeaway": "Trust the plan", "entryId": "t1"}, observed{2, "Trust the plan"})
	if first != retry {
		t.Error("a retry of the same write must reuse its mutation ID so the backend replays it")
	}
	if MutationID("draft", "ws1", input, observed{3, "Trust the plan"}) == MutationID("draft", "ws1", input, observed{2, "Trust the plan"}) {
		t.Error("the same input against a different state is a different write")
	}
	if id := MutationID("draft"); len(id) > 128 {
		t.Errorf("mutation IDs must fit the backend's 128-byte limit, got %d", len(id))
	}
}
