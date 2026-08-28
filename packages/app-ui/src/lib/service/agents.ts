import type {
	GraphQLFetcher,
	GraphQLSubscriber,
	GraphQLSubscriptionHandlers,
} from "@tradstry/app-ui/lib/client";
import type {
	AgentActionProposal,
	AgentActivityEntry,
	AgentActivitySummary,
	AgentCapabilities,
	AgentContextSearchResult,
	AgentConversation,
	AgentMemory,
	AgentMessage,
	AgentMessageActivity,
	AgentRewriteAction,
	AgentRun,
	AgentRunHandle,
	SendAgentMessageInput,
} from "@tradstry/app-ui/lib/types/agents";

const CONVERSATION_FIELDS = `
  id
  workspaceId
  title
  createdAt
  updatedAt
`;

const MESSAGE_FIELDS = `
  id
  conversationId
  sequence
  role
  contentJson
  sources {
    title
    sourceType
    excerpt
    sourceUrl
    freshness
  }
  createdAt
`;

const RUN_FIELDS = `
  id
  conversationId
  status
  modelCalls
  toolCalls
  errorCode
  createdAt
  updatedAt
  completedAt
`;

const RUN_HANDLE_FIELDS = `
  runId
  conversationId
  status
`;

const MEMORY_FIELDS = `
  id
  workspaceId
  kind
  subjectKey
  text
  status
  pinned
  provenanceExcerpt
  confidence
  userEdited
  createdAt
  updatedAt
`;

const ACTION_PROPOSAL_FIELDS = `
  id
  runId
  conversationId
  kind
  payloadJson
  previewJson
  status
  expiresAt
  createdAt
  updatedAt
`;

const ACTIVITY_ENTRY_FIELDS = `
  sequence
  activityId
  parentActivityId
  category
  status
  label
  detail
  durationMs
  metadata {
    symbol
    recordCount
    dateRangeLabel
    sourceCount
    retryable
  }
  createdAt
`;

const ACTIVITY_SUMMARY_FIELDS = `
  messageId
  status
  durationMs
  modelCalls
  toolCalls
  subagentCount
  sourceCount
  hasFailures
`;

export const AGENT_RUN_ACTIVITY_SUBSCRIPTION = `
  subscription AgentRunActivity($runId: String!, $afterSequence: Int!) {
    agentRunActivity(runId: $runId, afterSequence: $afterSequence) {
      ${ACTIVITY_ENTRY_FIELDS}
    }
  }
`;

export async function fetchAgentCapabilities(
	fetcher: GraphQLFetcher,
): Promise<AgentCapabilities> {
	const data = await fetcher<{ agentCapabilities: AgentCapabilities }>(`
    query AgentCapabilities {
      agentCapabilities {
        enabled
        runtimeVersion
        turnRuntime
        modelRolesReady
        memory
        actions
        notebookAssistance
      }
    }
  `);
	return data.agentCapabilities;
}

export async function fetchAgentConversations(
	fetcher: GraphQLFetcher,
	workspaceId: string,
	limit?: number,
): Promise<AgentConversation[]> {
	const data = await fetcher<{ agentConversations: AgentConversation[] }>(
		`query AgentConversations($workspaceId: String!, $limit: Int) {
      agentConversations(workspaceId: $workspaceId, limit: $limit) {
        ${CONVERSATION_FIELDS}
      }
    }`,
		{ workspaceId, limit },
	);
	return data.agentConversations;
}

export async function fetchAgentContextSearch(
	fetcher: GraphQLFetcher,
	workspaceId: string,
	query: string,
	limit = 30,
): Promise<AgentContextSearchResult[]> {
	const data = await fetcher<{
		agentContextSearch: AgentContextSearchResult[];
	}>(
		`query AgentContextSearch($workspaceId: String!, $query: String!, $limit: Int) {
      agentContextSearch(workspaceId: $workspaceId, query: $query, limit: $limit) {
        key
        kind
        id
        title
        subtitle
        metadataJson
      }
    }`,
		{ workspaceId, query, limit },
	);
	return data.agentContextSearch;
}

export async function fetchAgentMessages(
	fetcher: GraphQLFetcher,
	conversationId: string,
	limit?: number,
): Promise<AgentMessage[]> {
	const data = await fetcher<{ agentMessages: AgentMessage[] }>(
		`query AgentMessages($conversationId: String!, $limit: Int) {
      agentMessages(conversationId: $conversationId, limit: $limit) {
        ${MESSAGE_FIELDS}
      }
    }`,
		{ conversationId, limit },
	);
	return data.agentMessages;
}

export async function fetchAgentRun(
	fetcher: GraphQLFetcher,
	runId: string,
): Promise<AgentRun> {
	const data = await fetcher<{ agentRun: AgentRun }>(
		`query AgentRun($runId: String!) {
      agentRun(runId: $runId) {
        ${RUN_FIELDS}
      }
    }`,
		{ runId },
	);
	return data.agentRun;
}

export async function fetchAgentMessageActivity(
	fetcher: GraphQLFetcher,
	messageId: string,
): Promise<AgentMessageActivity | null> {
	const data = await fetcher<{
		agentMessageActivity: AgentMessageActivity | null;
	}>(
		`query AgentMessageActivity($messageId: String!) {
      agentMessageActivity(messageId: $messageId) {
        summary { ${ACTIVITY_SUMMARY_FIELDS} }
        entries { ${ACTIVITY_ENTRY_FIELDS} }
      }
    }`,
		{ messageId },
	);
	return data.agentMessageActivity;
}

export async function fetchAgentMessageActivitySummaries(
	fetcher: GraphQLFetcher,
	messageIds: string[],
): Promise<AgentActivitySummary[]> {
	const data = await fetcher<{
		agentMessageActivitySummaries: AgentActivitySummary[];
	}>(
		`query AgentMessageActivitySummaries($messageIds: [String!]!) {
      agentMessageActivitySummaries(messageIds: $messageIds) {
        ${ACTIVITY_SUMMARY_FIELDS}
      }
    }`,
		{ messageIds },
	);
	return data.agentMessageActivitySummaries;
}

export async function fetchAgentMemories(
	fetcher: GraphQLFetcher,
	workspaceId?: string,
	includeInactive = false,
): Promise<AgentMemory[]> {
	const data = await fetcher<{ agentMemories: AgentMemory[] }>(
		`query AgentMemories($workspaceId: String, $includeInactive: Boolean) {
      agentMemories(workspaceId: $workspaceId, includeInactive: $includeInactive) {
        ${MEMORY_FIELDS}
      }
    }`,
		{ workspaceId, includeInactive },
	);
	return data.agentMemories;
}

export async function fetchAgentActionProposal(
	fetcher: GraphQLFetcher,
	id: string,
): Promise<AgentActionProposal> {
	const data = await fetcher<{ agentActionProposal: AgentActionProposal }>(
		`query AgentActionProposal($id: String!) {
      agentActionProposal(id: $id) {
        ${ACTION_PROPOSAL_FIELDS}
      }
    }`,
		{ id },
	);
	return data.agentActionProposal;
}

export async function createAgentConversation(
	fetcher: GraphQLFetcher,
	workspaceId: string,
): Promise<AgentConversation> {
	const data = await fetcher<{ createAgentConversation: AgentConversation }>(
		`mutation CreateAgentConversation($workspaceId: String!) {
      createAgentConversation(workspaceId: $workspaceId) {
        ${CONVERSATION_FIELDS}
      }
    }`,
		{ workspaceId },
	);
	return data.createAgentConversation;
}

export async function renameAgentConversation(
	fetcher: GraphQLFetcher,
	conversationId: string,
	title: string,
): Promise<AgentConversation> {
	const data = await fetcher<{ renameAgentConversation: AgentConversation }>(
		`mutation RenameAgentConversation($conversationId: String!, $title: String!) {
      renameAgentConversation(conversationId: $conversationId, title: $title) {
        ${CONVERSATION_FIELDS}
      }
    }`,
		{ conversationId, title },
	);
	return data.renameAgentConversation;
}

export async function deleteAgentConversation(
	fetcher: GraphQLFetcher,
	conversationId: string,
): Promise<boolean> {
	const data = await fetcher<{ deleteAgentConversation: boolean }>(
		`mutation DeleteAgentConversation($conversationId: String!) {
      deleteAgentConversation(conversationId: $conversationId)
    }`,
		{ conversationId },
	);
	return data.deleteAgentConversation;
}

export async function sendAgentMessage(
	fetcher: GraphQLFetcher,
	input: SendAgentMessageInput,
): Promise<AgentRunHandle> {
	const data = await fetcher<{ sendAgentMessage: AgentRunHandle }>(
		`mutation SendAgentMessage($input: SendAgentMessageInput!) {
      sendAgentMessage(input: $input) {
        ${RUN_HANDLE_FIELDS}
      }
    }`,
		{ input },
	);
	return data.sendAgentMessage;
}

export async function cancelAgentRun(
	fetcher: GraphQLFetcher,
	runId: string,
): Promise<boolean> {
	const data = await fetcher<{ cancelAgentRun: boolean }>(
		`mutation CancelAgentRun($runId: String!) {
      cancelAgentRun(runId: $runId)
    }`,
		{ runId },
	);
	return data.cancelAgentRun;
}

export async function updateAgentMemory(
	fetcher: GraphQLFetcher,
	id: string,
	text: string,
): Promise<AgentMemory> {
	const data = await fetcher<{ updateAgentMemory: AgentMemory }>(
		`mutation UpdateAgentMemory($id: String!, $text: String!) {
      updateAgentMemory(id: $id, text: $text) {
        ${MEMORY_FIELDS}
      }
    }`,
		{ id, text },
	);
	return data.updateAgentMemory;
}

export async function setAgentMemoryPinned(
	fetcher: GraphQLFetcher,
	id: string,
	pinned: boolean,
): Promise<AgentMemory> {
	const data = await fetcher<{ setAgentMemoryPinned: AgentMemory }>(
		`mutation SetAgentMemoryPinned($id: String!, $pinned: Boolean!) {
      setAgentMemoryPinned(id: $id, pinned: $pinned) {
        ${MEMORY_FIELDS}
      }
    }`,
		{ id, pinned },
	);
	return data.setAgentMemoryPinned;
}

export async function forgetAgentMemory(
	fetcher: GraphQLFetcher,
	id: string,
): Promise<boolean> {
	const data = await fetcher<{ forgetAgentMemory: boolean }>(
		`mutation ForgetAgentMemory($id: String!) {
      forgetAgentMemory(id: $id)
    }`,
		{ id },
	);
	return data.forgetAgentMemory;
}

export async function approveAgentAction(
	fetcher: GraphQLFetcher,
	proposalId: string,
	idempotencyKey: string,
): Promise<AgentActionProposal> {
	const data = await fetcher<{ approveAgentAction: AgentActionProposal }>(
		`mutation ApproveAgentAction($proposalId: String!, $idempotencyKey: String!) {
      approveAgentAction(proposalId: $proposalId, idempotencyKey: $idempotencyKey) {
        ${ACTION_PROPOSAL_FIELDS}
      }
    }`,
		{ proposalId, idempotencyKey },
	);
	return data.approveAgentAction;
}

export async function rejectAgentAction(
	fetcher: GraphQLFetcher,
	proposalId: string,
): Promise<AgentActionProposal> {
	const data = await fetcher<{ rejectAgentAction: AgentActionProposal }>(
		`mutation RejectAgentAction($proposalId: String!) {
      rejectAgentAction(proposalId: $proposalId) {
        ${ACTION_PROPOSAL_FIELDS}
      }
    }`,
		{ proposalId },
	);
	return data.rejectAgentAction;
}

export async function autocompleteAgentNotebook(
	fetcher: GraphQLFetcher,
	title: string,
	text: string,
): Promise<string> {
	const data = await fetcher<{ agentNotebookAutocomplete: string }>(
		`mutation AgentNotebookAutocomplete($title: String!, $text: String!) {
      agentNotebookAutocomplete(title: $title, text: $text)
    }`,
		{ title, text },
	);
	return data.agentNotebookAutocomplete;
}

export async function rewriteAgentNotebook(
	fetcher: GraphQLFetcher,
	action: AgentRewriteAction,
	text: string,
): Promise<string> {
	const data = await fetcher<{ agentNotebookRewrite: string }>(
		`mutation AgentNotebookRewrite($action: AgentRewriteAction!, $text: String!) {
      agentNotebookRewrite(action: $action, text: $text)
    }`,
		{ action, text },
	);
	return data.agentNotebookRewrite;
}

export function subscribeAgentRunActivity(
	subscriber: GraphQLSubscriber,
	runId: string,
	afterSequence: number,
	handlers: GraphQLSubscriptionHandlers<AgentActivityEntry>,
): () => void {
	return subscriber<{ agentRunActivity: AgentActivityEntry }>(
		AGENT_RUN_ACTIVITY_SUBSCRIPTION,
		{ runId, afterSequence },
		{
			onMessage: (data) => handlers.onMessage(data.agentRunActivity),
			onError: handlers.onError,
			onComplete: handlers.onComplete,
		},
	);
}
