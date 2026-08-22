import type { GraphQLFetcher } from "@tradstry/app-ui/lib/client";
import type {
	CreatePlaybookInput,
	PlaybookWithStats,
	UpdatePlaybookInput,
} from "@tradstry/app-ui/lib/types/playbook";

const PLAYBOOK_FIELDS = `
  id
  userId
  workspaceId
  name
  edgeName
  entryRules
  exitRules
  positionSizingRules
  additionalRules
  availability
  workspaceIds
  createdAt
  updatedAt
  winRate
  cumulativeProfit
  averageGain
  averageLoss
  tradeCount
`;

const PLAYBOOKS_QUERY = `
  query Playbooks($workspaceId: String!) {
    playbooks(workspaceId: $workspaceId) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

const PLAYBOOK_QUERY = `
  query Playbook($id: String!) {
    playbook(id: $id) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

const STRATEGY_LIBRARY_PLAYBOOKS_QUERY = `
  query StrategyLibraryPlaybooks($statsWorkspaceId: String!) {
    strategyLibraryPlaybooks(statsWorkspaceId: $statsWorkspaceId) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

const CREATE_PLAYBOOK_MUTATION = `
  mutation CreatePlaybook($input: CreatePlaybookInput!) {
    createPlaybook(input: $input) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

const UPDATE_PLAYBOOK_MUTATION = `
  mutation UpdatePlaybook($id: String!, $input: UpdatePlaybookInput!) {
    updatePlaybook(id: $id, input: $input) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

const DELETE_PLAYBOOK_MUTATION = `
  mutation DeletePlaybook($id: String!) {
    deletePlaybook(id: $id)
  }
`;

const SET_PLAYBOOK_APPLICABILITY_MUTATION = `
  mutation SetPlaybookApplicability($id: String!, $input: StrategyApplicabilityInput!) {
    setPlaybookApplicability(id: $id, input: $input) {
      ${PLAYBOOK_FIELDS}
    }
  }
`;

export async function fetchPlaybooks(
	fetcher: GraphQLFetcher,
	workspaceId: string,
): Promise<PlaybookWithStats[]> {
	const data = await fetcher<{ playbooks: PlaybookWithStats[] }>(
		PLAYBOOKS_QUERY,
		{ workspaceId },
	);
	return data.playbooks;
}

export async function fetchPlaybook(
	fetcher: GraphQLFetcher,
	id: string,
): Promise<PlaybookWithStats | null> {
	const data = await fetcher<{ playbook: PlaybookWithStats | null }>(
		PLAYBOOK_QUERY,
		{ id },
	);
	return data.playbook;
}

export async function fetchStrategyLibraryPlaybooks(
	fetcher: GraphQLFetcher,
	statsWorkspaceId: string,
): Promise<PlaybookWithStats[]> {
	const data = await fetcher<{
		strategyLibraryPlaybooks: PlaybookWithStats[];
	}>(STRATEGY_LIBRARY_PLAYBOOKS_QUERY, { statsWorkspaceId });
	return data.strategyLibraryPlaybooks;
}

export async function createPlaybook(
	fetcher: GraphQLFetcher,
	input: CreatePlaybookInput,
): Promise<PlaybookWithStats> {
	const data = await fetcher<{ createPlaybook: PlaybookWithStats }>(
		CREATE_PLAYBOOK_MUTATION,
		{ input },
	);
	return data.createPlaybook;
}

export async function updatePlaybook(
	fetcher: GraphQLFetcher,
	id: string,
	input: UpdatePlaybookInput,
): Promise<PlaybookWithStats> {
	const data = await fetcher<{ updatePlaybook: PlaybookWithStats }>(
		UPDATE_PLAYBOOK_MUTATION,
		{ id, input },
	);
	return data.updatePlaybook;
}

export async function deletePlaybook(
	fetcher: GraphQLFetcher,
	id: string,
): Promise<boolean> {
	const data = await fetcher<{ deletePlaybook: boolean }>(
		DELETE_PLAYBOOK_MUTATION,
		{ id },
	);
	return data.deletePlaybook;
}

export async function setPlaybookApplicability(
	fetcher: GraphQLFetcher,
	id: string,
	input: { availability: "all" | "selected"; workspaceIds: string[] },
): Promise<PlaybookWithStats> {
	const data = await fetcher<{ setPlaybookApplicability: PlaybookWithStats }>(
		SET_PLAYBOOK_APPLICABILITY_MUTATION,
		{ id, input },
	);
	return data.setPlaybookApplicability;
}
