package confirm

import (
	"testing"
	"time"
)

func TestTokensOnlyConfirmTheActionTheyWereIssuedFor(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	c := New()
	c.now = func() time.Time { return now }
	action := Action{Tool: "delete_workspace", Target: "ws1"}
	token := c.issue("user_1", action)

	if !c.valid(token, "user_1", action) {
		t.Fatal("a fresh token for the same user and action must be valid")
	}
	rejected := map[string]func() bool{
		"other user":    func() bool { return c.valid(token, "user_2", action) },
		"other target":  func() bool { return c.valid(token, "user_1", Action{Tool: "delete_workspace", Target: "ws2"}) },
		"other tool":    func() bool { return c.valid(token, "user_1", Action{Tool: "delete_note", Target: "ws1"}) },
		"tampered":      func() bool { return c.valid(token+"x", "user_1", action) },
		"malformed":     func() bool { return c.valid("not-a-token", "user_1", action) },
		"other process": func() bool { return New().valid(token, "user_1", action) },
	}
	for name, valid := range rejected {
		if valid() {
			t.Errorf("%s: token accepted", name)
		}
	}

	now = now.Add(tokenTTL)
	if c.valid(token, "user_1", action) {
		t.Error("an expired token was accepted")
	}
}
