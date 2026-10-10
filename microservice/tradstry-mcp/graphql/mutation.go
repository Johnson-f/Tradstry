package graphql

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// ClientID scopes this server's writes in the backend's idempotency log, which is
// already per user.
const ClientID = "tradstry-mcp"

// MutationID names one logical write: the same tool, input and state observed
// just before it. A retried call replays the stored result instead of writing
// twice, while the same input sent again after the state moved writes again.
func MutationID(parts ...any) string {
	raw, _ := json.Marshal(parts)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:16])
}
