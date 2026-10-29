import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { graphql } from '@/lib/client/backend'
import type { BrokerProvider } from './broker-catalog'
import type {
  AccountChoice,
  AccountSelection,
  AuthorizationStatus,
  BrokerageAccount,
  BrokerageConnection,
  ImportMode,
} from './brokerage-model'
import { WORKSPACES_KEY } from '@/lib/client/workspaces'

export interface BrokerageActivity {
  id: string
  type: string
  tradeDate: string | null
  units: number | null
  price: number | null
  amount: number | null
  currency: string | null
  fee: number | null
  symbol: string | null
  optionSymbol: string | null
  description: string | null
}

export interface SyncStatus {
  account: BrokerageAccount
  initialImportCompletedAt: string | null
  transactionsSyncedThrough: string | null
  holdingsSyncedAt: string | null
  nextSyncAt: string | null
  lastError: string | null
}

export interface Holdings {
  capturedAt: string
  positions: unknown
  balances: unknown
}

export interface BrokerageOrder {
  id: string
  status: string | null
  action: string | null
  symbol: string | null
  totalUnits: number | null
  filledUnits: number | null
  executionPrice: number | null
  timePlaced: string | null
  timeExecuted: string | null
}

const ACCOUNT_FIELDS =
  'id name maskedNumber rawType accountType taxTreatment cashOrMargin isPaper importMode importStartDate initialImportCompletedAt unlinked workspaceId'
const CHOICE_FIELDS =
  'connectionId institutionName snaptradeAccountId name maskedNumber rawType accountType taxTreatment cashOrMargin isPaper linkedWorkspaceId previouslyLinked'

export const brokerageKeys = {
  status: ['brokerage', 'status'],
  connections: ['brokerage', 'connections'],
  workspace: (id: string) => ['workspace', id],
}

export function useBrokerageStatus() {
  return useQuery({
    queryKey: brokerageKeys.status,
    queryFn: () =>
      graphql<{ brokerageStatus: { available: boolean; oauthAvailable: boolean } }>(
        'query BrokerageStatus { brokerageStatus { available oauthAvailable } }',
      ),
    select: (data) => data.brokerageStatus,
    staleTime: 5 * 60_000,
  })
}

export function useBrokerageProviders(enabled: boolean) {
  return useQuery({
    queryKey: ['brokerage', 'providers'],
    queryFn: () => graphql<{ brokerageProviders: BrokerProvider[] }>(
      'query BrokerageProviders { brokerageProviders { slug name logoUrl enabled maintenanceMode } }',
    ),
    select: (data) => data.brokerageProviders,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** `refresh` re-checks health with SnapTrade; without it, the stored state. */
export function useBrokerageConnections(enabled: boolean, refresh = true) {
  return useQuery({
    queryKey: [...brokerageKeys.connections, refresh],
    queryFn: () =>
      graphql<{ brokerageConnections: BrokerageConnection[] }>(
        `query BrokerageConnections($refresh: Boolean!) { brokerageConnections(refresh: $refresh) {
          id authMode institutionName disabled disabledAt newAccountsAvailable unlinked grantStatus checkedAt
          accounts { ${ACCOUNT_FIELDS} }
        } }`,
        { refresh },
      ),
    select: (data) => data.brokerageConnections,
    enabled,
  })
}

/** Refetches everything brokerage linking can change. */
export function useInvalidateBrokerage() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['brokerage'] }),
        queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY }),
        queryClient.invalidateQueries({ queryKey: ['workspace'] }),
      ]),
    [queryClient],
  )
}

export function startBrokerageConnection(reconnectConnectionId?: string, brokerSlug?: string) {
  return graphql<{ startBrokerageConnection: { url: string } }>(
    'mutation StartBrokerageConnection($reconnectConnectionId: ID, $brokerSlug: String) { startBrokerageConnection(reconnectConnectionId: $reconnectConnectionId, brokerSlug: $brokerSlug) { url } }',
    { reconnectConnectionId: reconnectConnectionId ?? null, brokerSlug: brokerSlug ?? null },
  ).then((data) => data.startBrokerageConnection.url)
}

export function startSnapTradeAuthorization(intent: 'CONNECT' | 'REAUTHORIZE') {
  return graphql<{ startSnapTradeAuthorization: { attemptId: string; authorizationUrl: string } }>(
    'mutation StartSnapTradeAuthorization($intent: AuthorizationIntent!) { startSnapTradeAuthorization(intent: $intent) { attemptId authorizationUrl } }',
    { intent },
  ).then((data) => data.startSnapTradeAuthorization.authorizationUrl)
}

/**
 * Confirms the connection the Connection Portal returned. A query, not a
 * mutation, so a remount or StrictMode re-run reuses the answer; the backend
 * upserts, so repeating it is harmless anyway.
 */
export function useCompleteBrokerageConnection(snaptradeConnectionId: string | null) {
  return useQuery({
    queryKey: ['brokerage', 'complete', snaptradeConnectionId],
    queryFn: () =>
      graphql<{ completeBrokerageConnection: AccountChoice[] }>(
        `mutation CompleteBrokerageConnection($id: String!) { completeBrokerageConnection(snaptradeConnectionId: $id) { ${CHOICE_FIELDS} } }`,
        { id: snaptradeConnectionId },
      ),
    select: (data) => data.completeBrokerageConnection,
    enabled: snaptradeConnectionId !== null,
    staleTime: Infinity,
    retry: false,
  })
}

export function useConnectionAccountChoices(connectionId: string | null) {
  return useQuery({
    queryKey: ['brokerage', 'connection-accounts', connectionId],
    queryFn: () =>
      graphql<{ brokerageConnectionAccounts: AccountChoice[] }>(
        `query ConnectionAccounts($id: ID!) { brokerageConnectionAccounts(connectionId: $id) { ${CHOICE_FIELDS} } }`,
        { id: connectionId },
      ),
    select: (data) => data.brokerageConnectionAccounts,
    enabled: connectionId !== null,
    retry: false,
  })
}

/** Polls an OAuth attempt every second until it stops being in flight. */
export function useAuthorizationStatus(attemptId: string | null, keepPolling: (status: AuthorizationStatus | null) => boolean) {
  return useQuery({
    queryKey: ['brokerage', 'authorization', attemptId],
    queryFn: () =>
      graphql<{ snapTradeAuthorizationStatus: AuthorizationStatus | null }>(
        'query AuthorizationStatus($id: ID!) { snapTradeAuthorizationStatus(attemptId: $id) { status errorCode intent expired } }',
        { id: attemptId },
      ),
    select: (data) => data.snapTradeAuthorizationStatus,
    enabled: attemptId !== null,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && keepPolling(data.snapTradeAuthorizationStatus) ? 1000 : false
    },
    retry: false,
  })
}

export function useAuthorizationAccountChoices(attemptId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['brokerage', 'authorization-accounts', attemptId],
    queryFn: () =>
      graphql<{ snapTradeAuthorizationAccounts: AccountChoice[] }>(
        `query AuthorizationAccounts($id: ID!) { snapTradeAuthorizationAccounts(attemptId: $id) { ${CHOICE_FIELDS} } }`,
        { id: attemptId },
      ),
    select: (data) => data.snapTradeAuthorizationAccounts,
    enabled: attemptId !== null && enabled,
    retry: false,
  })
}

export function useFinalizeAccounts() {
  const invalidate = useInvalidateBrokerage()
  return useMutation({
    mutationFn: (accounts: AccountSelection[]) =>
      graphql<{ finalizeBrokerageAccounts: BrokerageAccount[] }>(
        `mutation FinalizeAccounts($accounts: [AccountSelectionInput!]!) { finalizeBrokerageAccounts(accounts: $accounts) { ${ACCOUNT_FIELDS} } }`,
        { accounts },
      ).then((data) => data.finalizeBrokerageAccounts),
    onSuccess: invalidate,
  })
}

export function useDisconnectConnection() {
  const invalidate = useInvalidateBrokerage()
  return useMutation({
    mutationFn: (connectionId: string) =>
      graphql('mutation Disconnect($id: ID!) { disconnectBrokerageConnection(connectionId: $id) }', {
        id: connectionId,
      }),
    onSuccess: invalidate,
  })
}

export function useRevokeSnapTrade() {
  const invalidate = useInvalidateBrokerage()
  return useMutation({
    mutationFn: () =>
      graphql<{
        revokeSnapTradeAuthorization: { revoked: boolean; upstreamConfirmed: boolean; unlinkedConnections: number }
      }>(
        'mutation RevokeSnapTrade { revokeSnapTradeAuthorization { revoked upstreamConfirmed unlinkedConnections } }',
      ).then((data) => data.revokeSnapTradeAuthorization),
    onSuccess: invalidate,
  })
}

/** Null for a manual workspace. Needs brokerage to be available. */
export function useSyncStatus(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: [...brokerageKeys.workspace(workspaceId), 'sync'],
    queryFn: () =>
      graphql<{ brokerageSyncStatus: SyncStatus | null }>(
        `query SyncStatus($id: ID!) { brokerageSyncStatus(workspaceId: $id) {
          initialImportCompletedAt transactionsSyncedThrough holdingsSyncedAt nextSyncAt lastError
          account { ${ACCOUNT_FIELDS} }
        } }`,
        { id: workspaceId },
      ),
    select: (data) => data.brokerageSyncStatus,
    enabled,
    refetchInterval: (query) => {
      const sync = query.state.data?.brokerageSyncStatus
      if (!sync || sync.account.unlinked) return false
      return sync.initialImportCompletedAt ? 30_000 : 5000
    },
  })
}

export function useHoldings(workspaceId: string, enabled: boolean, live = true) {
  return useQuery({
    queryKey: [...brokerageKeys.workspace(workspaceId), 'holdings'],
    queryFn: () =>
      graphql<{ brokerageHoldings: Holdings | null }>(
        'query Holdings($id: ID!) { brokerageHoldings(workspaceId: $id) { capturedAt positions balances } }',
        { id: workspaceId },
      ),
    select: (data) => data.brokerageHoldings,
    enabled,
    refetchInterval: live ? 30_000 : false,
  })
}

export const ACTIVITY_PAGE_SIZE = 50

export function useActivities(workspaceId: string, page: number, enabled: boolean, live = true) {
  return useQuery({
    queryKey: [...brokerageKeys.workspace(workspaceId), 'activities', page],
    queryFn: () =>
      graphql<{ brokerageActivities: { total: number; items: BrokerageActivity[] } }>(
        `query Activities($id: ID!, $offset: Int!, $limit: Int!) { brokerageActivities(workspaceId: $id, offset: $offset, limit: $limit) {
          total items { id type tradeDate units price amount currency fee symbol optionSymbol description }
        } }`,
        { id: workspaceId, offset: page * ACTIVITY_PAGE_SIZE, limit: ACTIVITY_PAGE_SIZE },
      ),
    select: (data) => data.brokerageActivities,
    enabled,
    placeholderData: (previous) => previous,
    refetchInterval: live ? 30_000 : false,
  })
}

export function useOrders(workspaceId: string, live: boolean) {
  return useQuery({
    queryKey: [...brokerageKeys.workspace(workspaceId), 'orders'],
    queryFn: () => graphql<{ brokerageOrders: BrokerageOrder[] }>(
      `query Orders($id: ID!) { brokerageOrders(workspaceId: $id, limit: 200) {
        id status action symbol totalUnits filledUnits executionPrice timePlaced timeExecuted
      } }`,
      { id: workspaceId },
    ),
    select: (data) => data.brokerageOrders,
    refetchInterval: live ? 30_000 : false,
  })
}

export function useRefreshHoldings(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) =>
      graphql('mutation RefreshHoldings($id: ID!) { refreshBrokerageHoldings(accountId: $id) }', { id: accountId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokerageKeys.workspace(workspaceId) }),
  })
}

export function useExpandHistory(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { accountId: string; importMode: ImportMode; customStartDate: string | null }) =>
      graphql(
        `mutation ExpandHistory($accountId: ID!, $importMode: ImportMode!, $customStartDate: NaiveDate) {
          expandBrokerageHistory(accountId: $accountId, importMode: $importMode, customStartDate: $customStartDate) { id }
        }`,
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brokerageKeys.workspace(workspaceId) }),
  })
}
