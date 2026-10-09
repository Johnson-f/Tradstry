// Package confirm gets the user's approval before a tool does something that
// cannot be undone.
//
// Clients that support form elicitation ask the user directly, so the assistant
// cannot approve on the user's behalf. Other clients get a short-lived token:
// the assistant must ask the user in the conversation and pass the token back.
package confirm

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const tokenTTL = 10 * time.Minute

type Confirmer struct {
	key []byte
	now func() time.Time
}

// New returns a Confirmer with a per-process signing key, so tokens stop
// working when the server restarts. They are only meant to span one exchange.
func New() *Confirmer {
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	return &Confirmer{key: key, now: time.Now}
}

type Action struct {
	// Tool is the name of the tool asking, which the assistant calls again with the token.
	Tool string
	// Target identifies what the action affects, such as a workspace ID.
	Target string
	// Question is shown to the user and must say what will be lost.
	Question string
}

type Outcome struct {
	Approved bool
	// Token is set when the assistant must ask the user and call again.
	Token string
	// Message explains an outcome that is not approved, for the tool result.
	Message string
}

var formSchema = &jsonschema.Schema{
	Type: "object",
	Properties: map[string]*jsonschema.Schema{
		"confirm": {Type: "boolean", Title: "Yes, I understand this cannot be undone"},
	},
	Required: []string{"confirm"},
}

// Confirm asks subject to approve action. token is what the assistant passed
// back from an earlier call, if anything.
func (c *Confirmer) Confirm(ctx context.Context, req *mcp.CallToolRequest, subject string, action Action, token string) (Outcome, error) {
	if supportsForm(req.Session) {
		res, err := req.Session.Elicit(ctx, &mcp.ElicitParams{
			Mode:            "form",
			Message:         action.Question,
			RequestedSchema: formSchema,
		})
		if err != nil {
			return Outcome{}, fmt.Errorf("ask the user to confirm: %w", err)
		}
		if res.Action == "accept" && res.Content["confirm"] == true {
			return Outcome{Approved: true}, nil
		}
		return Outcome{Message: "The user did not confirm, so nothing was changed."}, nil
	}

	if token != "" && c.valid(token, subject, action) {
		return Outcome{Approved: true}, nil
	}
	message := fmt.Sprintf(
		"Nothing has been changed yet. Show the user this and ask them to confirm:\n\n%s\n\n"+
			"Only if they clearly agree, call %s again with the same arguments plus this confirmation_token. It expires in %d minutes.",
		action.Question, action.Tool, int(tokenTTL.Minutes()))
	if token != "" {
		message = "That confirmation_token is invalid or has expired. " + message
	}
	return Outcome{Token: c.issue(subject, action), Message: message}, nil
}

func supportsForm(session *mcp.ServerSession) bool {
	if session == nil {
		return false
	}
	params := session.InitializeParams()
	if params == nil || params.Capabilities == nil || params.Capabilities.Elicitation == nil {
		return false
	}
	// An elicitation capability without modes predates URL mode and means form.
	caps := params.Capabilities.Elicitation
	return caps.Form != nil || caps.URL == nil
}

func (c *Confirmer) issue(subject string, action Action) string {
	expires := strconv.FormatInt(c.now().Add(tokenTTL).Unix(), 10)
	return expires + "." + c.sign(expires, subject, action)
}

func (c *Confirmer) valid(token, subject string, action Action) bool {
	expires, sig, ok := strings.Cut(token, ".")
	if !ok {
		return false
	}
	unix, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || !c.now().Before(time.Unix(unix, 0)) {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(c.sign(expires, subject, action)))
}

func (c *Confirmer) sign(expires, subject string, action Action) string {
	mac := hmac.New(sha256.New, c.key)
	for _, part := range []string{expires, subject, action.Tool, action.Target} {
		mac.Write([]byte(part))
		mac.Write([]byte{0})
	}
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
