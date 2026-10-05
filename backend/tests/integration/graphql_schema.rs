use async_graphql::Schema;
use tradstry_backend::graphql::{Mutation, Query, Subscription};

/// async-graphql panics while registering two types under one GraphQL name, and it
/// does so at schema build — which happens on server startup, not in any test. Two
/// distinct Rust types called `NotebookMutation` (the mutation root, and the push
/// mutation's input object) took the backend down on boot. Building the roots needs
/// none of the injected clients, so a plain test catches it.
#[test]
fn schema_builds_without_duplicate_type_names() {
    let schema = Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .finish();

    let sdl = schema.sdl();
    // Internal request structs must not change arguments used by web/desktop.
    assert!(sdl.contains("enableJournalFlow(workspaceId: String!, expectedRevision: Int!, flatBefore: String, timezone: String!, clientId: String!, mutationId: String!): JournalActivationV2!"));
    assert!(sdl.contains("openJournalReviewSession(workspaceId: String!, date: String, refresh: Boolean! = false, expectedVersion: Int, clientId: String!, mutationId: String!): JournalReviewSessionV2"));
    assert!(sdl.contains("moveJournalReviewCursor(workspaceId: String!, sessionId: String!, entryId: String!, expectedVersion: Int!, clientId: String!, mutationId: String!): Int!"));
    assert!(
        sdl.contains("input NotebookMutationInput"),
        "the push mutation's input object must not collide with the mutation root"
    );
    assert!(sdl.contains("marketQuotes(symbols: [String!]!): MarketQuotesGql!"));
    assert!(sdl.contains("agentCapabilities: AgentCapabilitiesGql!"));
    assert!(sdl.contains(
        "agentConversations(workspaceId: String!, limit: Int): [AgentConversationGql!]!"
    ));
    assert!(sdl.contains(
        "agentContextSearch(workspaceId: String!, query: String!, limit: Int): [AgentContextSearchResultGql!]!"
    ));
    assert!(sdl.contains("enum AgentContextKindGql"));
    assert!(sdl.contains("noteIds: [String!]"));
    assert!(sdl.contains("references: [AgentContextReferenceInput!]!"));
    assert!(sdl.contains("sendAgentMessage(input: SendAgentMessageInput!): AgentRunHandleGql!"));
    assert!(
        sdl.contains(
            "agentRunActivity(runId: String!, afterSequence: Int!): AgentActivityEntryGql!"
        )
    );
    assert!(sdl.contains("agentMessageActivity(messageId: String!): AgentMessageActivityGql"));
    assert!(sdl.contains(
        "agentMessageActivitySummaries(messageIds: [String!]!): [AgentActivitySummaryGql!]!"
    ));
    assert!(!sdl.contains("AgentRunEventGql"));
    assert!(sdl.contains("sources: [AgentSourceGql!]!"));
    assert!(sdl.contains(
        "agentMemories(workspaceId: String, includeInactive: Boolean): [AgentMemoryGql!]!"
    ));
    assert!(sdl.contains("updateAgentMemory(id: String!, text: String!): AgentMemoryGql!"));
    assert!(sdl.contains("setAgentMemoryPinned(id: String!, pinned: Boolean!): AgentMemoryGql!"));
    assert!(sdl.contains("forgetAgentMemory(id: String!): Boolean!"));
    assert!(sdl.contains("agentActionProposal(id: String!): AgentActionProposalGql!"));
    assert!(sdl.contains(
        "approveAgentAction(proposalId: String!, idempotencyKey: String!): AgentActionProposalGql!"
    ));
    assert!(sdl.contains("rejectAgentAction(proposalId: String!): AgentActionProposalGql!"));
    assert!(sdl.contains("agentNotebookAutocomplete(title: String!, text: String!): String!"));
    assert!(
        sdl.contains("agentNotebookRewrite(action: AgentRewriteAction!, text: String!): String!")
    );
    assert!(
        sdl.contains("marketPriceUpdates(symbols: [String!]!): MarketPriceUpdateGql!"),
        "the live market subscription must be present"
    );

    let sync_result = sdl
        .split_once("type SyncResult {")
        .and_then(|(_, tail)| tail.split_once('}'))
        .map(|(fields, _)| fields)
        .expect("the brokerage sync result type must be present");
    assert!(
        sync_result.contains("status: String!"),
        "the sync mutation response must expose its completion status"
    );
    assert!(
        sdl.contains("brokerageSyncOutcome(workspaceId: String!): BrokerageSyncOutcome"),
        "the delayed sync outcome query must be present"
    );
    assert!(sdl.contains("type BrokerageSyncOutcome {"));
    assert!(sdl.contains("error: String"));
    assert!(sdl.contains("diagnosticId: String"));
    assert!(sdl.contains("succeededAt: String"));
    assert!(sdl.contains("nextScheduledAt: String"));
    assert!(sdl.contains(
        "reportBrokerageDataIssue(input: ReportBrokerageDataIssueInput!): BrokerageDataIssueReport!"
    ));
    assert!(sdl.contains("diagnosticId: String!"));
    assert!(sdl.contains("transactionsSynced: Int!"));
    assert!(sdl.contains("holdingsSynced: Int!"));
    assert!(sdl.contains("balancesSynced: Int!"));
    assert!(sdl.contains("brokerageReconciliation(workspaceId: String!): BrokerageReconciliation"));
    assert!(sdl.contains("type BrokerageReconciliation {"));
    assert!(sdl.contains("brokerTransactionCount: Int!"));
    assert!(sdl.contains("localTransactionCount: Int!"));
    assert!(sdl.contains("missingTransactionCount: Int!"));
    assert!(sdl.contains("balanceDiscrepancyCount: Int!"));
    assert!(sdl.contains("transactionError: String"));
    assert!(sdl.contains("portfolioError: String"));
    assert!(
        sdl.contains("tranches: [HistoryTranche!]!"),
        "calculator history must expose its resolved execution legs"
    );
    assert!(
        sdl.contains("tranches: [CreateHistoryTrancheInput!]"),
        "calculator history creation must accept an execution snapshot"
    );
    assert!(
        sdl.contains("manualExecutionClaims(workspaceId: String!): [ManualExecutionClaimGql!]!")
    );
    assert!(sdl.contains("recordManualExecution("));
    assert!(sdl.contains("dismissManualExecution(id: String!): Boolean!"));
    assert!(sdl.contains("tradeReviewPreview(episodeId: String!, planId: String!): String!"));
    assert!(sdl.contains(
        "publishBrokerageEpisodeReview(input: PublishBrokerageEpisodeReviewInput!): String!"
    ));
    assert!(sdl.contains("requiresManualGrouping: Boolean!"));
    assert!(sdl.contains("isManuallyGrouped: Boolean!"));
    assert!(sdl.contains("episodeId: String!"));
    assert!(sdl.contains(
        "regroupBrokerageEpisode(episodeId: String!, transactionIds: [String!]!): String!"
    ));
    assert!(sdl.contains("resetBrokerageEpisodeGrouping(episodeId: String!): Boolean!"));
    assert!(sdl.contains(
        "tradingPerformance(workspaceId: String!, timeFilter: AnalyticsTimeFilterInput!): TradingPerformanceGql!"
    ));
    assert!(sdl.contains("totalRealizedPnl: Float!"));
    assert!(sdl.contains("needsReviewCount: Int!"));
    assert!(sdl.contains("currentDrawdown: Float!"));
    assert!(sdl.contains("maxDrawdown: Float!"));
    assert!(sdl.contains("currentStreak: Int!"));
    assert!(sdl.contains("bestSymbol: PerformanceBreakdownGql"));
    assert!(sdl.contains("worstSymbol: PerformanceBreakdownGql"));
    assert!(sdl.contains("bestDay: PerformanceBreakdownGql"));
    assert!(sdl.contains("worstDay: PerformanceBreakdownGql"));
    assert!(sdl.contains("type PerformanceBreakdownGql {"));
    assert!(sdl.contains("episodeClosedDate: String"));
    assert!(sdl.contains("type CalendarDaySummaryGql {"));
    assert!(sdl.contains("type CalendarWeekSummaryGql {"));
    assert!(sdl.contains("winningTradeCount: Int!"));
    assert!(sdl.contains("breakevenTradeCount: Int!"));
    assert!(sdl.contains("losingTradeCount: Int!"));
    assert!(sdl.contains("averageRealizedR: Float"));
    assert!(sdl.contains("riskDefinedTradeCount: Int!"));
    assert!(sdl.contains(
        "setPlaybookApplicability(id: String!, input: StrategyApplicabilityInput!): PlaybookWithStats!"
    ));
    assert!(sdl.contains(
        "setTagCategoryApplicability(id: String!, input: TagCategoryApplicabilityInput!): TagCategoryGql!"
    ));
    assert!(sdl.contains("availability: String!"));
    assert!(sdl.contains("workspaceIds: [String!]!"));
    assert!(
        sdl.contains("strategyLibraryPlaybooks(statsWorkspaceId: String!): [PlaybookWithStats!]!")
    );
    assert!(sdl.contains("strategyLibraryTagCategories: [TagCategoryGql!]!"));
    assert!(sdl.contains("strategyLibraryTags(categoryId: String): [TagGql!]!"));
    assert!(sdl.contains("drawdown: Float!"));
    assert!(!sdl.contains("accountEquityHistory("));
    assert!(!sdl.contains("rebuildAccountEquityHistory("));
}
