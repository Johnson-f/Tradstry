"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useGraphQL } from "@tradstry/app-ui/lib/client";
import * as brokerageService from "@tradstry/app-ui/lib/service/brokerage";
import { snapTradeOAuthPhase } from "@tradstry/app-ui/lib/snaptrade-oauth-flow";
import type {
	BrokerageAccountImportInput,
	BrokerageBalance,
	BrokerageConnectionAccount,
	BrokerageDataIssueReport,
	BrokerageHolding,
	BrokerageReconciliation,
	BrokerageSyncOutcome,
	BrokerageTransaction,
	BrokerageTransactionsPage,
	ConnectionPortal,
	PendingTrade,
	ReportBrokerageDataIssueInput,
	SnapTradeOAuthStart,
	SnapTradeOAuthStatus,
	SyncResult,
	TransactionFilters,
	TransactionImportPolicy,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { useAuth, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const TRANSACTIONS_KEY = ["brokerage-transactions"] as const;
const HOLDINGS_KEY = ["brokerage-holdings"] as const;
const BALANCES_KEY = ["brokerage-balances"] as const;
const CONNECTION_ACCOUNTS_KEY = ["brokerage-connection-accounts"] as const;
const LINKED_TX_IDS_KEY = ["linked-brokerage-tx-ids"] as const;
const PENDING_TRADES_KEY = ["pending-trades"] as const;
const WORKSPACES_KEY = ["workspaces"] as const;
const SYNC_OUTCOME_KEY = ["brokerage-sync-outcome"] as const;
const RECONCILIATION_KEY = ["brokerage-reconciliation"] as const;
const IMPORT_POLICY_KEY = ["brokerage-transaction-import-policy"] as const;

export function useBrokerageTransactions(
	workspaceId: string | null,
	filters?: TransactionFilters,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageTransactionsPage>({
		queryKey: [...TRANSACTIONS_KEY, workspaceId, filters],
		queryFn: () =>
			brokerageService.fetchTransactions(fetcher, workspaceId!, filters),
		enabled: isLoaded && isSignedIn && !!workspaceId,
		placeholderData: keepPreviousData,
	});
}

export function useBrokerageHoldings(workspaceId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageHolding[]>({
		queryKey: [...HOLDINGS_KEY, workspaceId],
		queryFn: () => brokerageService.fetchHoldings(fetcher, workspaceId!),
		enabled: isLoaded && isSignedIn && !!workspaceId,
	});
}

export function useBrokerageBalances(
	workspaceId: string | null,
	refetchInterval: number | false = false,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageBalance[]>({
		queryKey: [...BALANCES_KEY, workspaceId],
		queryFn: () => brokerageService.fetchBalances(fetcher, workspaceId!),
		enabled: isLoaded && isSignedIn && !!workspaceId,
		refetchInterval,
	});
}

export function useBrokerageSyncOutcome(
	workspaceId: string | null,
	refetchInterval: number | false = false,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageSyncOutcome | null>({
		queryKey: [...SYNC_OUTCOME_KEY, workspaceId],
		queryFn: () => {
			if (!workspaceId) throw new Error("workspace id is required");
			return brokerageService.fetchBrokerageSyncOutcome(fetcher, workspaceId);
		},
		enabled: isLoaded && isSignedIn && !!workspaceId,
		refetchInterval,
	});
}

export function useBrokerageReconciliation(
	workspaceId: string | null,
	refetchInterval: number | false = false,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageReconciliation | null>({
		queryKey: [...RECONCILIATION_KEY, workspaceId],
		queryFn: () => {
			if (!workspaceId) throw new Error("workspace id is required");
			return brokerageService.fetchBrokerageReconciliation(
				fetcher,
				workspaceId,
			);
		},
		enabled: isLoaded && isSignedIn && !!workspaceId,
		refetchInterval,
	});
}

export function useBrokerageConnectionAccounts(
	workspaceId: string | null,
	enabled = true,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageConnectionAccount[]>({
		queryKey: [...CONNECTION_ACCOUNTS_KEY, workspaceId],
		queryFn: () => {
			if (!workspaceId) throw new Error("workspace id is required");
			return brokerageService.fetchBrokerageConnectionAccounts(
				fetcher,
				workspaceId,
			);
		},
		enabled: isLoaded && isSignedIn && enabled && !!workspaceId,
	});
}

export function useBrokerageTransactionImportPolicy(
	workspaceId: string | null,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery<TransactionImportPolicy | null>({
		queryKey: [...IMPORT_POLICY_KEY, workspaceId],
		queryFn: () => {
			if (!workspaceId) throw new Error("workspace id is required");
			return brokerageService.fetchTransactionImportPolicy(
				fetcher,
				workspaceId,
			);
		},
		enabled: isLoaded && isSignedIn && !!workspaceId,
	});
}

export function useLinkedBrokerageTransactionIds(workspaceId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<string[]>({
		queryKey: [...LINKED_TX_IDS_KEY, workspaceId],
		queryFn: () =>
			brokerageService.fetchLinkedBrokerageTransactionIds(
				fetcher,
				workspaceId!,
			),
		enabled: isLoaded && isSignedIn && !!workspaceId,
	});
}

/**
 * Hydrate full transaction objects from a list of ids. Used by the multi-select
 * merge flow so a selection that spans several server-side pages resolves to all
 * of its transactions, not just the ones on the current page. Shares its cache
 * key with the merge modal's prefill query.
 */
export function useBrokerageTransactionsByIds(ids: string[]) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<BrokerageTransaction[]>({
		queryKey: ["brokerage-tx-by-ids", ids],
		queryFn: () =>
			brokerageService.fetchBrokerageTransactionsByIds(fetcher, ids),
		enabled: isLoaded && isSignedIn && ids.length > 0,
	});
}

export function usePendingTrades(workspaceId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<PendingTrade[]>({
		queryKey: [...PENDING_TRADES_KEY, workspaceId],
		queryFn: () => brokerageService.fetchPendingTrades(fetcher, workspaceId!),
		enabled: isLoaded && isSignedIn && !!workspaceId,
		staleTime: 30_000,
	});
}

export function useRegroupBrokerageEpisode() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			episodeId,
			transactionIds,
		}: {
			episodeId: string;
			transactionIds: string[];
		}) =>
			brokerageService.regroupBrokerageEpisode(
				fetcher,
				episodeId,
				transactionIds,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: PENDING_TRADES_KEY });
			queryClient.invalidateQueries({ queryKey: ["trade-review-inbox"] });
		},
	});
}

export function useResetBrokerageEpisodeGrouping() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (episodeId: string) =>
			brokerageService.resetBrokerageEpisodeGrouping(fetcher, episodeId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: PENDING_TRADES_KEY });
			queryClient.invalidateQueries({ queryKey: ["trade-review-inbox"] });
		},
	});
}

export function useInitiateConnection() {
	const fetcher = useGraphQL();

	return useMutation<
		ConnectionPortal,
		Error,
		{
			workspaceId: string;
			brokerageId?: string;
			customRedirect?: string;
			reconnect?: boolean;
		}
	>({
		mutationFn: ({ workspaceId, brokerageId, customRedirect, reconnect }) =>
			brokerageService.initiateConnection(
				fetcher,
				workspaceId,
				brokerageId,
				customRedirect,
				reconnect,
			),
	});
}

export function useInitiateSnapTradeOAuth() {
	const fetcher = useGraphQL();
	return useMutation<
		SnapTradeOAuthStart,
		Error,
		{ workspaceId: string; platform: "web" | "desktop" }
	>({
		mutationFn: ({ workspaceId, platform }) =>
			brokerageService.initiateSnapTradeOAuth(fetcher, workspaceId, platform),
	});
}

export function useSnapTradeOAuthAvailable() {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: ["snaptrade-oauth-available"],
		queryFn: () => brokerageService.fetchSnapTradeOAuthAvailable(fetcher),
		enabled: isLoaded && isSignedIn,
		staleTime: 60_000,
	});
}

export function useSnapTradeOAuthStatus(attemptId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery<SnapTradeOAuthStatus | null>({
		queryKey: ["snaptrade-oauth-status", attemptId],
		queryFn: () => {
			if (!attemptId) throw new Error("OAuth attempt ID is required");
			return brokerageService.fetchSnapTradeOAuthStatus(fetcher, attemptId);
		},
		enabled: isLoaded && isSignedIn && !!attemptId,
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "authorized" ||
				status === "denied" ||
				status === "failed" ||
				status === "expired"
				? false
				: 1000;
		},
	});
}

export function useSnapTradeOAuthAccounts(
	attemptId: string | null,
	enabled = true,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery<BrokerageConnectionAccount[]>({
		queryKey: ["snaptrade-oauth-accounts", attemptId],
		queryFn: () => {
			if (!attemptId) throw new Error("OAuth attempt ID is required");
			return brokerageService.fetchSnapTradeOAuthAccounts(fetcher, attemptId);
		},
		enabled: isLoaded && isSignedIn && enabled && !!attemptId,
	});
}

export function useFinalizeSnapTradeOAuthSetup() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			attemptId,
			input,
		}: {
			attemptId: string;
			input: {
				workspaceId: string;
				primarySnaptradeAccountId: string;
				accounts: BrokerageAccountImportInput[];
			};
		}) =>
			brokerageService.finalizeSnapTradeOAuthSetup(fetcher, attemptId, input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
	});
}

export function useCompleteSnapTradeOAuthReauthorization() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (attemptId: string) =>
			brokerageService.completeSnapTradeOAuthReauthorization(
				fetcher,
				attemptId,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
	});
}

export function useSnapTradeOAuthFlow() {
	const platform = useTradstryPlatform();
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const completedReauthorization = useRef<string | null>(null);
	const initiate = useInitiateSnapTradeOAuth();
	const status = useSnapTradeOAuthStatus(attemptId);
	const phase = snapTradeOAuthPhase(status.data);
	const accounts = useSnapTradeOAuthAccounts(attemptId, phase === "setup");
	const finalize = useFinalizeSnapTradeOAuthSetup();
	const completeReauthorization = useCompleteSnapTradeOAuthReauthorization();
	const sync = useSyncBrokerageData();

	useEffect(() => {
		if (
			!attemptId ||
			phase !== "reauthorizing" ||
			completedReauthorization.current === attemptId
		) {
			return;
		}
		completedReauthorization.current = attemptId;
		void (async () => {
			try {
				const workspace = await completeReauthorization.mutateAsync(attemptId);
				await sync.mutateAsync(workspace.id);
				toast.success("SnapTrade access reauthorized");
				setAttemptId(null);
			} catch (error) {
				completedReauthorization.current = null;
				setAttemptId(null);
				toast.error(
					error instanceof Error
						? error.message
						: "Could not finish SnapTrade reauthorization",
				);
			}
		})();
	}, [attemptId, completeReauthorization, phase, sync]);

	async function start(workspaceId: string) {
		const started = await initiate.mutateAsync({
			workspaceId,
			platform: platform.kind,
		});
		setAttemptId(started.attemptId);
		try {
			await platform.openExternal(started.authorizationUrl);
		} catch (error) {
			setAttemptId(null);
			throw error;
		}
		return started;
	}

	async function finishConnect(
		workspaceId: string,
		value: {
			primarySnaptradeAccountId: string;
			accounts: BrokerageAccountImportInput[];
		},
	) {
		if (!attemptId) throw new Error("OAuth attempt ID is required");
		const configured = await finalize.mutateAsync({
			attemptId,
			input: { workspaceId, ...value },
		});
		for (const workspace of configured) await sync.mutateAsync(workspace.id);
		setAttemptId(null);
		platform.navigate("/dashboard/journal");
		return configured;
	}

	return {
		attemptId,
		status,
		phase,
		accounts,
		start,
		finishConnect,
		cancel: () => setAttemptId(null),
		isStarting: initiate.isPending,
		isSubmitting:
			finalize.isPending || completeReauthorization.isPending || sync.isPending,
	};
}

export function useCompleteConnection() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	return useMutation<
		boolean,
		Error,
		{ workspaceId: string; connectionId: string }
	>({
		mutationFn: ({ workspaceId, connectionId }) =>
			brokerageService.completeConnection(fetcher, workspaceId, connectionId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces"] });
		},
	});
}

export function useRevokeSnapTradeOAuth() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => brokerageService.revokeSnapTradeOAuth(fetcher),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
	});
}

export function useCreateBrokerageAccountWorkspaces() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			workspaceId,
			snaptradeAccountIds,
		}: {
			workspaceId: string;
			snaptradeAccountIds: string[];
		}) =>
			brokerageService.createBrokerageAccountWorkspaces(
				fetcher,
				workspaceId,
				snaptradeAccountIds,
			),
		onSuccess: (_created, { workspaceId }) => {
			queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
			queryClient.invalidateQueries({
				queryKey: [...CONNECTION_ACCOUNTS_KEY, workspaceId],
			});
		},
	});
}

export function useFinalizeBrokerageSetup() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation<
		Awaited<ReturnType<typeof brokerageService.finalizeBrokerageSetup>>,
		Error,
		Parameters<typeof brokerageService.finalizeBrokerageSetup>[1]
	>({
		mutationFn: (input) =>
			brokerageService.finalizeBrokerageSetup(fetcher, input),
		onSuccess: (configured) => {
			queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
			for (const workspace of configured) {
				queryClient.invalidateQueries({
					queryKey: [...IMPORT_POLICY_KEY, workspace.id],
				});
			}
		},
	});
}

export function useExpandBrokerageTransactionHistory() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation<
		TransactionImportPolicy,
		Error,
		{ workspaceId: string; policy: TransactionImportPolicyInput }
	>({
		mutationFn: ({ workspaceId, policy }) =>
			brokerageService.expandBrokerageTransactionHistory(
				fetcher,
				workspaceId,
				policy,
			),
		onSuccess: (_policy, { workspaceId }) => {
			queryClient.invalidateQueries({
				queryKey: [...IMPORT_POLICY_KEY, workspaceId],
			});
			queryClient.invalidateQueries({
				queryKey: [...RECONCILIATION_KEY, workspaceId],
			});
		},
	});
}

export function useDisconnectBrokerage() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	return useMutation<boolean, Error, string>({
		mutationFn: (workspaceId: string) =>
			brokerageService.disconnectBrokerage(fetcher, workspaceId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces"] });
		},
	});
}

export function useSyncBrokerageData() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	return useMutation<SyncResult, Error, string>({
		mutationFn: (workspaceId: string) =>
			brokerageService.syncBrokerageData(fetcher, workspaceId),
		onSuccess: (data, workspaceId) => {
			const invalidate = () => {
				queryClient.invalidateQueries({queryKey:["journal-flow"]});
				queryClient.invalidateQueries({
					queryKey: [...TRANSACTIONS_KEY, workspaceId],
				});
				queryClient.invalidateQueries({
					queryKey: [...HOLDINGS_KEY, workspaceId],
				});
				queryClient.invalidateQueries({
					queryKey: [...BALANCES_KEY, workspaceId],
				});
				queryClient.invalidateQueries({
					queryKey: [...SYNC_OUTCOME_KEY, workspaceId],
				});
				queryClient.invalidateQueries({
					queryKey: [...RECONCILIATION_KEY, workspaceId],
				});
			};
			invalidate();
			if (data.status === "queued") {
				for (const delay of [15_000, 30_000, 60_000]) {
					window.setTimeout(invalidate, delay);
				}
			}
		},
		// A sync that fails on stale credentials flags the connection disabled
		// server-side; without this refetch the card keeps showing the stale
		// "connected" state and never offers Reconnect.
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
		},
	});
}

export function useReportBrokerageDataIssue() {
	const fetcher = useGraphQL();
	return useMutation<
		BrokerageDataIssueReport,
		Error,
		ReportBrokerageDataIssueInput
	>({
		mutationFn: (input) =>
			brokerageService.reportBrokerageDataIssue(fetcher, input),
	});
}

const SYNC_STALE_MS = 5 * 60 * 1000; // 5 minutes
const SYNC_STORAGE_KEY = "brokerage-last-sync";

type SyncState = "idle" | "syncing" | "queued" | "synced" | "error";

export function useAutoSync(workspaceId: string | null) {
	const [syncState, setSyncState] = useState<SyncState>("idle");
	const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
	const didRun = useRef(false);
	const { mutateAsync } = useSyncBrokerageData();
	const mutateRef = useRef(mutateAsync);
	mutateRef.current = mutateAsync;

	const runSync = useCallback(async () => {
		if (!workspaceId) return;
		setSyncState("syncing");
		try {
			const result = await mutateRef.current(workspaceId);
			if (result.status === "queued") {
				setSyncState("queued");
				toast.info(
					"Brokerage refresh queued. Updated data will appear when available.",
				);
				return;
			}
			const now = new Date().toISOString();
			sessionStorage.setItem(SYNC_STORAGE_KEY, now);
			setLastSyncTime(now);
			setSyncState("synced");
			toast.success("Brokerage data synced");
		} catch (err) {
			setSyncState("error");
			toast.error(
				err instanceof Error ? err.message : "Failed to sync brokerage data",
			);
		}
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId || didRun.current) return;
		didRun.current = true;

		const stored = sessionStorage.getItem(SYNC_STORAGE_KEY);
		if (stored) {
			const elapsed = Date.now() - new Date(stored).getTime();
			if (elapsed < SYNC_STALE_MS) {
				setLastSyncTime(stored);
				setSyncState("synced");
				return;
			}
		}
		runSync();
	}, [workspaceId, runSync]);

	return { syncState, lastSyncTime, retrySync: runSync };
}
