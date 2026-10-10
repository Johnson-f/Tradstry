package journal

import "testing"

func TestTheSameWriteAgainstTheSameStateKeepsItsID(t *testing.T) {
	observed := draft{Version: 2, Takeaway: "Trust the plan"}
	input := map[string]any{"entryId": "t1", "takeaway": "Trust the plan"}
	if mutationID("draft", "ws1", input, observed) != mutationID("draft", "ws1", input, observed) {
		t.Error("a retry of the same write must reuse its mutation ID so the backend replays it")
	}
	observed.Version = 3
	if mutationID("draft", "ws1", input, observed) == mutationID("draft", "ws1", input, draft{Version: 2, Takeaway: "Trust the plan"}) {
		t.Error("the same input against a different state is a different write")
	}
	if id := mutationID("draft"); len(id) > 128 {
		t.Errorf("mutation IDs must fit the backend's 128-byte limit, got %d", len(id))
	}
}
