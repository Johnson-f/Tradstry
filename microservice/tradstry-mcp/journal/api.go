package journal

import (
	"context"
	"errors"
	"strings"

	"tradstry-mcp/graphql"
)

type flowStatus struct {
	Enabled            bool    `json:"enabled"`
	SourceRevision     int     `json:"sourceRevision"`
	ProjectionRevision int     `json:"projectionRevision"`
	ImportState        string  `json:"importState"`
	LastError          *string `json:"lastError"`
	Timezone           string  `json:"timezone"`
}

func (s flowStatus) ready() bool {
	return s.Enabled && s.ImportState == "idle" && s.ProjectionRevision >= s.SourceRevision
}

type preparation struct {
	SourceRevision   int     `json:"sourceRevision"`
	BrokerRecords    int     `json:"brokerRecords"`
	ExistingEntries  int     `json:"existingEntries"`
	ReadyTrades      int     `json:"readyTrades"`
	AttentionGroups  int     `json:"attentionGroups"`
	ConflictingLinks int     `json:"conflictingLinks"`
	FirstExecution   *string `json:"firstExecution"`
	Timezone         string  `json:"timezone"`
}

type tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type trade struct {
	ID                   string   `json:"id"`
	SourceKind           string   `json:"sourceKind"`
	Symbol               string   `json:"symbol"`
	SymbolName           *string  `json:"symbolName"`
	Direction            string   `json:"direction"`
	Currency             *string  `json:"currency"`
	OpenDate             *string  `json:"openDate"`
	CloseDate            *string  `json:"closeDate"`
	EntryPrice           *string  `json:"entryPrice"`
	ExitPrice            *string  `json:"exitPrice"`
	EnteredQuantity      *string  `json:"enteredQuantity"`
	RemainingQuantity    *string  `json:"remainingQuantity"`
	RealizedNet          *string  `json:"realizedNet"`
	FeesPaid             *string  `json:"feesPaid"`
	LifecycleState       string   `json:"lifecycleState"`
	Outcome              string   `json:"outcome"`
	ReviewState          string   `json:"reviewState"`
	Tags                 []tag    `json:"tags"`
	MaterializedRevision int      `json:"materializedRevision"`
	RecordVersion        int      `json:"recordVersion"`
	IssueCode            *string  `json:"issueCode"`
	IssueMessage         *string  `json:"issueMessage"`
	PossibleDuplicates   []string `json:"possibleDuplicates"`
	RetiredAt            *string  `json:"retiredAt"`
	SuccessorID          *string  `json:"successorId"`
	PlaybookID           *string  `json:"playbookId"`
}

type tradeContext struct {
	Version              int      `json:"version"`
	StopState            string   `json:"stopState"`
	StopPrice            *string  `json:"stopPrice"`
	PlaybookID           *string  `json:"playbookId"`
	Phase                *string  `json:"phase"`
	RecordedAt           *string  `json:"recordedAt"`
	ClaimedAt            *string  `json:"claimedAt"`
	Notes                *string  `json:"notes"`
	TagIDs               []string `json:"tagIds"`
	ViolatedPrincipleIDs []string `json:"violatedPrincipleIds"`
}

type draft struct {
	Version       int      `json:"version"`
	Takeaway      string   `json:"takeaway"`
	ChoiceIDs     []string `json:"choiceIds"`
	PlanAdherence *string  `json:"planAdherence"`
}

type execution struct {
	Role       string  `json:"role"`
	Side       string  `json:"side"`
	Quantity   string  `json:"quantity"`
	Price      *string `json:"price"`
	Fee        *string `json:"fee"`
	ExecutedAt string  `json:"executedAt"`
	Precision  string  `json:"precision"`
}

type review struct {
	Version       int      `json:"version"`
	Takeaway      string   `json:"takeaway"`
	ChoiceIDs     []string `json:"choiceIds"`
	PlanAdherence *string  `json:"planAdherence"`
	CreatedAt     string   `json:"createdAt"`
}

type detail struct {
	Trade      *trade       `json:"journalTradeV2"`
	Context    tradeContext `json:"journalContextV2"`
	Draft      draft        `json:"journalReviewDraftV2"`
	Executions []execution  `json:"journalExecutionsV2"`
	Reviews    []review     `json:"journalReviewHistoryV2"`
}

type session struct {
	ID               string   `json:"id"`
	Date             string   `json:"date"`
	Queue            []string `json:"queue"`
	Completed        []string `json:"completed"`
	CursorEntryID    *string  `json:"cursorEntryId"`
	Version          int      `json:"version"`
	RefreshAvailable bool     `json:"refreshAvailable"`
}

type named struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

const (
	tradeFields   = `id sourceKind symbol symbolName direction currency openDate closeDate entryPrice exitPrice enteredQuantity remainingQuantity realizedNet feesPaid lifecycleState outcome reviewState tags { id name } materializedRevision recordVersion issueCode issueMessage possibleDuplicates retiredAt successorId playbookId`
	contextFields = `version stopState stopPrice playbookId phase recordedAt claimedAt notes tagIds violatedPrincipleIds`
	draftFields   = `version takeaway choiceIds planAdherence`
	sessionFields = `id date queue completed cursorEntryId version refreshAvailable`

	statusQuery    = `query JournalFlowStatus($workspaceId: String!) { journalFlowStatus(workspaceId: $workspaceId) { enabled sourceRevision projectionRevision importState lastError timezone } }`
	prepareQuery   = `query PrepareJournalFlow($workspaceId: String!, $flatBefore: String) { prepareJournalFlow(workspaceId: $workspaceId, flatBefore: $flatBefore) { sourceRevision brokerRecords existingEntries readyTrades attentionGroups conflictingLinks firstExecution timezone } }`
	enableMutation = `mutation EnableJournalFlow($workspaceId: String!, $expectedRevision: Int!, $flatBefore: String, $timezone: String!, $clientId: String!, $mutationId: String!) {
  enableJournalFlow(workspaceId: $workspaceId, expectedRevision: $expectedRevision, flatBefore: $flatBefore, timezone: $timezone, clientId: $clientId, mutationId: $mutationId) { enabled }
}`
	tradesQuery = `query JournalTradesV2($workspaceId: String!) { journalTradesV2(workspaceId: $workspaceId) { ` + tradeFields + ` } }`
	detailQuery = `query JournalDetailV2($workspaceId: String!, $entryId: String!) {
  journalTradeV2(workspaceId: $workspaceId, entryId: $entryId) { ` + tradeFields + ` }
  journalContextV2(workspaceId: $workspaceId, entryId: $entryId) { ` + contextFields + ` }
  journalReviewDraftV2(workspaceId: $workspaceId, entryId: $entryId) { ` + draftFields + ` }
  journalExecutionsV2(workspaceId: $workspaceId, entryId: $entryId) { role side quantity price fee executedAt precision }
  journalReviewHistoryV2(workspaceId: $workspaceId, entryId: $entryId) { version takeaway choiceIds planAdherence createdAt }
}`
	saveContextMutation = `mutation SaveJournalContext($workspaceId: String!, $input: JournalContextInputV2!, $clientId: String!, $mutationId: String!) {
  saveJournalContext(workspaceId: $workspaceId, input: $input, clientId: $clientId, mutationId: $mutationId) { ` + contextFields + ` }
}`
	saveDraftMutation = `mutation SaveJournalReviewDraft($workspaceId: String!, $input: JournalReviewDraftInputV2!, $clientId: String!, $mutationId: String!) {
  saveJournalReviewDraft(workspaceId: $workspaceId, input: $input, clientId: $clientId, mutationId: $mutationId) { ` + draftFields + ` }
}`
	markReviewedMutation = `mutation MarkJournalTradeReviewed($workspaceId: String!, $input: JournalFinalizeReviewInputV2!, $clientId: String!, $mutationId: String!) {
  markJournalTradeReviewed(workspaceId: $workspaceId, input: $input, clientId: $clientId, mutationId: $mutationId) { version takeaway choiceIds planAdherence createdAt }
}`
	openSessionMutation = `mutation OpenJournalReviewSession($workspaceId: String!, $date: String, $refresh: Boolean!, $expectedVersion: Int, $clientId: String!, $mutationId: String!) {
  openJournalReviewSession(workspaceId: $workspaceId, date: $date, refresh: $refresh, expectedVersion: $expectedVersion, clientId: $clientId, mutationId: $mutationId) { ` + sessionFields + ` }
}`
	moveCursorMutation = `mutation MoveJournalReviewCursor($workspaceId: String!, $sessionId: String!, $entryId: String!, $expectedVersion: Int!, $clientId: String!, $mutationId: String!) {
  moveJournalReviewCursor(workspaceId: $workspaceId, sessionId: $sessionId, entryId: $entryId, expectedVersion: $expectedVersion, clientId: $clientId, mutationId: $mutationId)
}`
	groupFields   = `entryId direction remainingQuantity enteredQuantity feesPaid realizedNet allocations { executedAt }`
	previewFields = `token entryIds beforeGroups { ` + groupFields + ` } groups { ` + groupFields + ` }`

	suggestionsQuery = `query JournalSuggestionsV2($workspaceId: String!, $entryId: String, $offset: Int!) {
  journalGroupingSuggestionsV2(workspaceId: $workspaceId, entryId: $entryId, offset: $offset) { id entryId explanation previousConfirmations }
}`
	historyQuery = `query JournalGroupingHistoryV2($workspaceId: String!, $entryId: String!) {
  journalGroupingHistoryV2(workspaceId: $workspaceId, entryId: $entryId) { id kind state createdAt }
}`
	executionsQuery = `query JournalExecutionsV2($workspaceId: String!, $entryId: String!) {
  journalExecutionsV2(workspaceId: $workspaceId, entryId: $entryId) { transactionId quantity }
}`
	previewSuggestionMutation = `mutation PreviewJournalSuggestion($workspaceId: String!, $suggestionId: String!) {
  previewJournalSuggestion(workspaceId: $workspaceId, suggestionId: $suggestionId) { ` + previewFields + ` }
}`
	previewGroupingMutation = `mutation PreviewJournalGrouping($workspaceId: String!, $input: JournalGroupingInputV2!) {
  previewJournalGrouping(workspaceId: $workspaceId, input: $input) { ` + previewFields + ` }
}`
	previewUndoMutation = `mutation PreviewUndoJournalGrouping($workspaceId: String!, $operationId: String!) {
  previewUndoJournalGrouping(workspaceId: $workspaceId, operationId: $operationId) { ` + previewFields + ` }
}`
	confirmGroupingMutation = `mutation ConfirmJournalGrouping($workspaceId: String!, $token: String!, $clientId: String!, $mutationId: String!) {
  confirmJournalGrouping(workspaceId: $workspaceId, token: $token, clientId: $clientId, mutationId: $mutationId) { operationId entryIds }
}`
	keepSeparateMutation = `mutation KeepManualTradeSeparate($workspaceId: String!, $entryId: String!, $expectedVersion: Int!, $clientId: String!, $mutationId: String!) {
  keepManualTradeSeparate(workspaceId: $workspaceId, entryId: $entryId, expectedVersion: $expectedVersion, clientId: $clientId, mutationId: $mutationId) { ` + tradeFields + ` }
}`
	dismissSuggestionMutation = `mutation DismissJournalSuggestion($workspaceId: String!, $suggestionId: String!, $clientId: String!, $mutationId: String!) {
  dismissJournalSuggestion(workspaceId: $workspaceId, suggestionId: $suggestionId, clientId: $clientId, mutationId: $mutationId)
}`
	namesQuery = `query JournalNames($workspaceId: String!) {
  tags(workspaceId: $workspaceId) { id name }
  playbooks(workspaceId: $workspaceId) { id name }
  principles(workspaceId: $workspaceId) { id title }
}`
)

type api struct {
	client *graphql.Client
}

func (a api) status(ctx context.Context, token, ws string) (flowStatus, error) {
	var data struct {
		Status flowStatus `json:"journalFlowStatus"`
	}
	err := a.client.Do(ctx, token, statusQuery, map[string]any{"workspaceId": ws}, &data)
	return data.Status, err
}

func (a api) prepare(ctx context.Context, token, ws string, flatBefore *string) (preparation, error) {
	var data struct {
		Prepare preparation `json:"prepareJournalFlow"`
	}
	err := a.client.Do(ctx, token, prepareQuery, map[string]any{"workspaceId": ws, "flatBefore": flatBefore}, &data)
	return data.Prepare, err
}

func (a api) enable(ctx context.Context, token, ws string, revision int, flatBefore *string, timezone string) error {
	return a.client.Do(ctx, token, enableMutation, map[string]any{
		"workspaceId": ws, "expectedRevision": revision, "flatBefore": flatBefore, "timezone": timezone,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("enable", ws, revision, flatBefore, timezone),
	}, nil)
}

func (a api) trades(ctx context.Context, token, ws string) ([]trade, error) {
	var data struct {
		Trades []trade `json:"journalTradesV2"`
	}
	err := a.client.Do(ctx, token, tradesQuery, map[string]any{"workspaceId": ws}, &data)
	return data.Trades, err
}

func (a api) detail(ctx context.Context, token, ws, entryID string) (detail, error) {
	var data detail
	err := a.client.Do(ctx, token, detailQuery, map[string]any{"workspaceId": ws, "entryId": entryID}, &data)
	return data, err
}

func (a api) saveContext(ctx context.Context, token, ws string, input map[string]any, observed tradeContext) (tradeContext, error) {
	var data struct {
		Context tradeContext `json:"saveJournalContext"`
	}
	err := a.client.Do(ctx, token, saveContextMutation, map[string]any{
		"workspaceId": ws, "input": input,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("context", ws, input, observed),
	}, &data)
	return data.Context, err
}

func (a api) saveDraft(ctx context.Context, token, ws string, input map[string]any, observed draft) (draft, error) {
	var data struct {
		Draft draft `json:"saveJournalReviewDraft"`
	}
	err := a.client.Do(ctx, token, saveDraftMutation, map[string]any{
		"workspaceId": ws, "input": input,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("draft", ws, input, observed),
	}, &data)
	return data.Draft, err
}

func (a api) markReviewed(ctx context.Context, token, ws string, input map[string]any) (review, error) {
	var data struct {
		Review review `json:"markJournalTradeReviewed"`
	}
	err := a.client.Do(ctx, token, markReviewedMutation, map[string]any{
		"workspaceId": ws, "input": input,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("review", ws, input),
	}, &data)
	return data.Review, err
}

// openSession is safe to repeat: the backend keeps one session per day, so a
// fresh mutation ID never creates a second one.
func (a api) openSession(ctx context.Context, token, ws string, date *string, refresh bool, expectedVersion *int, nonce string) (*session, error) {
	var data struct {
		Session *session `json:"openJournalReviewSession"`
	}
	err := a.client.Do(ctx, token, openSessionMutation, map[string]any{
		"workspaceId": ws, "date": date, "refresh": refresh, "expectedVersion": expectedVersion,
		"clientId": graphql.ClientID, "mutationId": nonce,
	}, &data)
	return data.Session, err
}

func (a api) moveCursor(ctx context.Context, token, ws, sessionID, entryID string, expectedVersion int) error {
	return a.client.Do(ctx, token, moveCursorMutation, map[string]any{
		"workspaceId": ws, "sessionId": sessionID, "entryId": entryID, "expectedVersion": expectedVersion,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("cursor", ws, sessionID, entryID, expectedVersion),
	}, nil)
}

type names struct {
	Tags       []named `json:"tags"`
	Playbooks  []named `json:"playbooks"`
	Principles []named `json:"principles"`
}

func (a api) names(ctx context.Context, token, ws string) (names, error) {
	var data names
	err := a.client.Do(ctx, token, namesQuery, map[string]any{"workspaceId": ws}, &data)
	for i := range data.Principles {
		data.Principles[i].Name = data.Principles[i].Title
	}
	return data, err
}

// isConflict reports a stale version: someone changed the record between the
// read and the write.
func isConflict(err error) bool {
	var apiErr *graphql.Error
	return errors.As(err, &apiErr) && strings.Contains(apiErr.Error(), "CONFLICT:")
}

var (
	errUpdating = errors.New("the journal is updating after a broker sync; try again in a moment")
	errStale    = errors.New("the trades changed or the preview expired; preview the change again")
)

// forUser explains the journal's own error codes in terms the user can act on.
func forUser(err error) error {
	if err == nil {
		return nil
	}
	if apiErr, ok := errors.AsType[*graphql.Error](err); ok {
		switch message := apiErr.Error(); {
		case strings.Contains(message, "REPREVIEW_REQUIRED: wait"):
			return errUpdating
		case strings.Contains(message, "REPREVIEW_REQUIRED"), strings.Contains(message, "PREVIEW_ALREADY_USED"):
			return errStale
		}
	}
	return graphql.ForUser(err)
}

type previewGroup struct {
	EntryID           string  `json:"entryId"`
	Direction         string  `json:"direction"`
	RemainingQuantity string  `json:"remainingQuantity"`
	EnteredQuantity   string  `json:"enteredQuantity"`
	FeesPaid          *string `json:"feesPaid"`
	RealizedNet       *string `json:"realizedNet"`
	Allocations       []struct {
		ExecutedAt string `json:"executedAt"`
	} `json:"allocations"`
}

type groupingPreview struct {
	Token        string         `json:"token"`
	EntryIDs     []string       `json:"entryIds"`
	BeforeGroups []previewGroup `json:"beforeGroups"`
	Groups       []previewGroup `json:"groups"`
}

type suggestion struct {
	ID                    string `json:"id"`
	EntryID               string `json:"entryId"`
	Explanation           string `json:"explanation"`
	PreviousConfirmations int    `json:"previousConfirmations"`
}

type groupingOperation struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	State     string `json:"state"`
	CreatedAt string `json:"createdAt"`
}

type allocation struct {
	TransactionID string `json:"transactionId"`
	Quantity      string `json:"quantity"`
}

func (a api) suggestions(ctx context.Context, token, ws string, entryID *string, offset int) ([]suggestion, error) {
	var data struct {
		Suggestions []suggestion `json:"journalGroupingSuggestionsV2"`
	}
	err := a.client.Do(ctx, token, suggestionsQuery, map[string]any{"workspaceId": ws, "entryId": entryID, "offset": offset}, &data)
	return data.Suggestions, err
}

func (a api) history(ctx context.Context, token, ws, entryID string) ([]groupingOperation, error) {
	var data struct {
		History []groupingOperation `json:"journalGroupingHistoryV2"`
	}
	err := a.client.Do(ctx, token, historyQuery, map[string]any{"workspaceId": ws, "entryId": entryID}, &data)
	return data.History, err
}

func (a api) executions(ctx context.Context, token, ws, entryID string) ([]allocation, error) {
	var data struct {
		Executions []allocation `json:"journalExecutionsV2"`
	}
	err := a.client.Do(ctx, token, executionsQuery, map[string]any{"workspaceId": ws, "entryId": entryID}, &data)
	return data.Executions, err
}

func (a api) previewSuggestion(ctx context.Context, token, ws, suggestionID string) (groupingPreview, error) {
	var data struct {
		Preview groupingPreview `json:"previewJournalSuggestion"`
	}
	err := a.client.Do(ctx, token, previewSuggestionMutation, map[string]any{"workspaceId": ws, "suggestionId": suggestionID}, &data)
	return data.Preview, err
}

func (a api) previewGrouping(ctx context.Context, token, ws string, input map[string]any) (groupingPreview, error) {
	var data struct {
		Preview groupingPreview `json:"previewJournalGrouping"`
	}
	err := a.client.Do(ctx, token, previewGroupingMutation, map[string]any{"workspaceId": ws, "input": input}, &data)
	return data.Preview, err
}

func (a api) previewUndo(ctx context.Context, token, ws, operationID string) (groupingPreview, error) {
	var data struct {
		Preview groupingPreview `json:"previewUndoJournalGrouping"`
	}
	err := a.client.Do(ctx, token, previewUndoMutation, map[string]any{"workspaceId": ws, "operationId": operationID}, &data)
	return data.Preview, err
}

func (a api) confirmGrouping(ctx context.Context, token, ws, previewToken string) ([]string, error) {
	var data struct {
		Result struct {
			EntryIDs []string `json:"entryIds"`
		} `json:"confirmJournalGrouping"`
	}
	err := a.client.Do(ctx, token, confirmGroupingMutation, map[string]any{
		"workspaceId": ws, "token": previewToken,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("confirm-grouping", ws, previewToken),
	}, &data)
	return data.Result.EntryIDs, err
}

func (a api) dismissSuggestion(ctx context.Context, token, ws, suggestionID string) error {
	return a.client.Do(ctx, token, dismissSuggestionMutation, map[string]any{
		"workspaceId": ws, "suggestionId": suggestionID,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("dismiss-suggestion", ws, suggestionID),
	}, nil)
}

func (a api) keepSeparate(ctx context.Context, token, ws string, t trade) (trade, error) {
	var data struct {
		Trade trade `json:"keepManualTradeSeparate"`
	}
	err := a.client.Do(ctx, token, keepSeparateMutation, map[string]any{
		"workspaceId": ws, "entryId": t.ID, "expectedVersion": t.RecordVersion,
		"clientId": graphql.ClientID, "mutationId": graphql.MutationID("keep_manual_trade_separate", ws, t.ID, t.RecordVersion),
	}, &data)
	return data.Trade, err
}
