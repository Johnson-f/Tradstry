export type AgentRunStatus =
	| "QUEUED"
	| "RUNNING"
	| "WAITING_FOR_APPROVAL"
	| "COMPLETED"
	| "FAILED"
	| "CANCELLED";

export type AgentIntent =
	| "PERFORMANCE_SNAPSHOT"
	| "TRADE_LOOKUP"
	| "PLAYBOOK_LOOKUP"
	| "MARKET_QUOTE"
	| "MARKET_NEWS";

export type AgentRewriteAction =
	| "SUMMARIZE"
	| "FIX_SPELLING"
	| "SIMPLIFY"
	| "EXPAND";

export interface AgentCapabilities {
	enabled: boolean;
	runtimeVersion: string;
	turnRuntime: boolean;
	modelRolesReady: boolean;
	memory: boolean;
	actions: boolean;
	notebookAssistance: boolean;
}

export interface AgentConversation {
	id: string;
	workspaceId: string;
	title: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AgentSource {
	title: string;
	sourceType: string;
	excerpt: string;
	sourceUrl: string | null;
	freshness: string;
}

export interface AgentMessage {
	id: string;
	conversationId: string;
	sequence: number;
	role: string;
	contentJson: string;
	sources: AgentSource[];
	createdAt: string;
}

export interface AgentRun {
	id: string;
	conversationId: string;
	status: AgentRunStatus;
	modelCalls: number;
	toolCalls: number;
	errorCode: string | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export interface AgentRunHandle {
	runId: string;
	conversationId: string;
	status: AgentRunStatus;
}

export type AgentActivityCategory = "MODEL" | "TOOL" | "SUBAGENT" | "SYSTEM";

export type AgentActivityStatus =
	| "STARTED"
	| "COMPLETED"
	| "FAILED"
	| "CANCELLED"
	| "INTERRUPTED";

export interface AgentActivityMetadata {
	symbol: string | null;
	recordCount: number | null;
	dateRangeLabel: string | null;
	sourceCount: number | null;
	retryable: boolean | null;
}

export interface AgentActivityEntry {
	sequence: number;
	activityId: string;
	parentActivityId: string | null;
	category: AgentActivityCategory;
	status: AgentActivityStatus;
	label: string;
	detail: string | null;
	durationMs: number | null;
	metadata: AgentActivityMetadata;
	createdAt: string;
}

export interface AgentActivitySummary {
	messageId: string;
	status: AgentRunStatus;
	durationMs: number | null;
	modelCalls: number;
	toolCalls: number;
	subagentCount: number;
	sourceCount: number;
	hasFailures: boolean;
}

export interface AgentMessageActivity {
	summary: AgentActivitySummary;
	entries: AgentActivityEntry[];
}

export type AgentMemoryKind = "preference" | "goal" | "routine" | "instruction";

export type AgentMemoryStatus =
	| "pending_review"
	| "active"
	| "superseded"
	| "deleted";

export interface AgentMemory {
	id: string;
	workspaceId: string | null;
	kind: AgentMemoryKind;
	subjectKey: string;
	text: string;
	status: AgentMemoryStatus;
	pinned: boolean;
	provenanceExcerpt: string;
	confidence: number;
	userEdited: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface AgentActionProposal {
	id: string;
	runId: string;
	conversationId: string;
	kind: string;
	payloadJson: string;
	previewJson: string;
	status: string;
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface AgentDateRangeInput {
	from: string;
	to: string;
}

export interface AgentMessageContextInput {
	explicitIntent?: AgentIntent;
	tradeIds?: string[];
	playbookIds?: string[];
	noteIds?: string[];
	dateRange?: AgentDateRangeInput;
	marketSymbol?: string;
	mediaIds?: string[];
	references: AgentContextReferenceInput[];
}

export type AgentContextKind =
	| "TRADE"
	| "PLAYBOOK"
	| "NOTE"
	| "MEDIA"
	| "MARKET"
	| "DATE_RANGE";

export interface AgentContextSearchResult {
	key: string;
	kind: AgentContextKind;
	id: string | null;
	title: string;
	subtitle: string;
	metadataJson: string;
}

export interface AgentContextReferenceInput {
	key: string;
	kind: AgentContextKind;
	id: string | null;
	title: string;
	subtitle: string;
}

export interface SendAgentMessageInput {
	conversationId: string;
	content: string;
	context?: AgentMessageContextInput;
	idempotencyKey: string;
}
