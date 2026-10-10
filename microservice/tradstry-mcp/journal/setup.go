package journal

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
)

// How long start_journal waits for the first trades before reporting that the
// journal is still being built.
const activationWait = 15 * time.Second

type workspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"ID from list_workspaces"`
}

type importPreview struct {
	ReadyTrades    int `json:"ready_trades"`
	NeedsAttention int `json:"needs_attention" jsonschema:"groups of executions that cannot become trades until their history is resolved"`
}

type statusOutput struct {
	Enabled  bool   `json:"enabled"`
	Ready    bool   `json:"ready" jsonschema:"false while trades are still being built after a sync"`
	Timezone string `json:"timezone,omitempty"`
	Message  string `json:"message"`

	BrokerRecords   int            `json:"broker_records,omitempty"`
	FirstExecution  string         `json:"first_execution,omitempty"`
	IfAccountFlat   *importPreview `json:"if_account_was_flat,omitempty" jsonschema:"what starting the journal gives if the account held nothing before its first imported execution"`
	IfNotFlat       *importPreview `json:"if_not_flat,omitempty" jsonschema:"what it gives otherwise"`
	ConflictingLink int            `json:"conflicting_links,omitempty"`
}

type flatAnswer string

type startInput struct {
	WorkspaceID       string     `json:"workspace_id" jsonschema:"ID from list_workspaces"`
	AccountWasFlat    flatAnswer `json:"account_was_flat" jsonschema:"the user's own answer to: did this account hold no positions at all before its first imported execution? Ask them; never assume"`
	Timezone          string     `json:"timezone,omitempty" jsonschema:"IANA time zone that decides which day a trade belongs to, such as America/New_York; defaults to the journal's default"`
	ConfirmationToken string     `json:"confirmation_token,omitempty" jsonschema:"only when a previous call returned one and the user then explicitly confirmed"`
}

type startOutput struct {
	Status            string `json:"status" jsonschema:"ready, updating, needs_confirmation or cancelled"`
	Message           string `json:"message"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
}

func (t *tools) status(ctx context.Context, req *mcp.CallToolRequest, in workspaceInput) (*mcp.CallToolResult, statusOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, statusOutput{}, err
	}
	st, err := t.api.status(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, statusOutput{}, forUser(err)
	}
	if st.Enabled {
		out := statusOutput{Enabled: true, Ready: st.ready(), Timezone: st.Timezone, Message: "The journal is up to date."}
		switch {
		case st.ImportState == "failed":
			out.Message = "The last broker import failed, so the journal may be missing recent trades. Try sync_brokerage."
		case !out.Ready:
			out.Message = "The journal is building trades from the latest broker sync."
		}
		return nil, out, nil
	}

	notFlat, err := t.api.prepare(ctx, caller.Token, in.WorkspaceID, nil)
	if err != nil {
		return nil, statusOutput{}, forUser(err)
	}
	out := statusOutput{
		Timezone:        notFlat.Timezone,
		BrokerRecords:   notFlat.BrokerRecords,
		IfNotFlat:       &importPreview{notFlat.ReadyTrades, notFlat.AttentionGroups},
		ConflictingLink: notFlat.ConflictingLinks,
		Message:         "The journal is off. start_journal turns it on; ask the user first whether the account was flat before its first imported execution.",
	}
	if notFlat.FirstExecution != nil {
		out.FirstExecution = *notFlat.FirstExecution
		flat, err := t.api.prepare(ctx, caller.Token, in.WorkspaceID, notFlat.FirstExecution)
		if err != nil {
			return nil, statusOutput{}, forUser(err)
		}
		out.IfAccountFlat = &importPreview{flat.ReadyTrades, flat.AttentionGroups}
	}
	return nil, out, nil
}

func (t *tools) start(ctx context.Context, req *mcp.CallToolRequest, in startInput) (*mcp.CallToolResult, startOutput, error) {
	caller, err := clerk.CallerOf(req)
	if err != nil {
		return nil, startOutput{}, err
	}
	st, err := t.api.status(ctx, caller.Token, in.WorkspaceID)
	if err != nil {
		return nil, startOutput{}, forUser(err)
	}
	if st.Enabled {
		return nil, startOutput{}, errors.New("the journal is already on for this workspace")
	}
	if in.Timezone != "" {
		if _, err := time.LoadLocation(in.Timezone); err != nil {
			return nil, startOutput{}, fmt.Errorf("%q is not an IANA time zone such as America/New_York", in.Timezone)
		}
	}

	baseline, err := t.api.prepare(ctx, caller.Token, in.WorkspaceID, nil)
	if err != nil {
		return nil, startOutput{}, forUser(err)
	}
	var flatBefore *string
	if in.AccountWasFlat == "yes" {
		if baseline.FirstExecution == nil {
			return nil, startOutput{}, errors.New("there are no imported executions yet, so there is nothing to mark as starting flat; answer no or not_sure")
		}
		// Claiming a flat start makes the journal treat the first executions as
		// complete positions; if it is false, those trades get wrong results.
		outcome, err := t.confirmer.Confirm(ctx, req, caller.Subject, confirm.Action{
			Tool:   "start_journal",
			Target: in.WorkspaceID,
			Question: fmt.Sprintf("Confirm this account held no positions at all before %s, its first imported execution. "+
				"If it did, Tradstry would build trades with the wrong cost and profit. Only confirm if you are sure.", *baseline.FirstExecution),
		}, in.ConfirmationToken)
		if err != nil {
			return nil, startOutput{}, err
		}
		if !outcome.Approved {
			status := "cancelled"
			if outcome.Token != "" {
				status = "needs_confirmation"
			}
			return nil, startOutput{Status: status, Message: outcome.Message, ConfirmationToken: outcome.Token}, nil
		}
		flatBefore = baseline.FirstExecution
	}

	plan, err := t.api.prepare(ctx, caller.Token, in.WorkspaceID, flatBefore)
	if err != nil {
		return nil, startOutput{}, forUser(err)
	}
	if plan.ConflictingLinks > 0 {
		return nil, startOutput{}, errors.New("some existing journal entries are linked to the same broker records more than once; open the journal on tradstry.com to reconcile them first")
	}
	timezone := in.Timezone
	if timezone == "" {
		timezone = plan.Timezone
	}
	if err := t.api.enable(ctx, caller.Token, in.WorkspaceID, plan.SourceRevision, flatBefore, timezone); err != nil {
		return nil, startOutput{}, forUser(err)
	}

	if t.waitUntilReady(ctx, caller.Token, in.WorkspaceID) {
		return nil, startOutput{Status: "ready", Message: fmt.Sprintf("The journal is on, with %d trades ready. list_trades shows them.", plan.ReadyTrades)}, nil
	}
	return nil, startOutput{Status: "updating", Message: "The journal is on and still building trades. Check again shortly with get_journal_status."}, nil
}

func (t *tools) waitUntilReady(ctx context.Context, token, ws string) bool {
	deadline := time.Now().Add(activationWait)
	for {
		if st, err := t.api.status(ctx, token, ws); err == nil && st.ready() {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(t.pollEvery):
		}
	}
}
