"use client";

import {
	ArrowReloadHorizontalIcon,
	BankIcon,
	Delete02Icon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrokerageHistorySetup } from "@tradstry/app-ui/components/brokerage/history-import-policy";
import { SyncConfidenceCard } from "@tradstry/app-ui/components/brokerage/sync-confidence-card";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tradstry/app-ui/components/ui/dialog";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import type { Workspace } from "@tradstry/app-ui/components/workspaces";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import {
	useBrokerageBalances,
	useBrokerageConnectionAccounts,
	useBrokerageReconciliation,
	useBrokerageSyncOutcome,
	useBrokerageTransactionImportPolicy,
	useDisconnectBrokerage,
	useExpandBrokerageTransactionHistory,
	useFinalizeBrokerageSetup,
	useInitiateConnection,
	useSyncBrokerageData,
} from "@tradstry/app-ui/hooks/brokerage";
import type {
	TransactionImportMode,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { platformUrl, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(
	value: number | null | undefined,
	currency: string,
): string {
	if (value == null) return "—";
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toFixed(2)} ${currency}`;
	}
}

function formatSyncTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function AdditionalBrokerageAccounts({ workspace }: { workspace: Workspace }) {
	const accounts = useBrokerageConnectionAccounts(
		workspace.id,
		!workspace.snaptradeConnectionDisabled,
	);
	const finalizeSetup = useFinalizeBrokerageSetup();
	const currentPolicy = useBrokerageTransactionImportPolicy(workspace.id);
	const available = useMemo(
		() =>
			(accounts.data ?? []).filter(
				(account) => !account.current && !account.linkedWorkspaceId,
			),
		[accounts.data],
	);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [importPolicy, setImportPolicy] =
		useState<TransactionImportPolicyInput>({
			mode: "one_year",
		});
	const initializedAccounts = useRef("");
	const historySelectId = useId();
	const availableKey = available.map((account) => account.id).join(":");

	useEffect(() => {
		if (initializedAccounts.current === availableKey) return;
		initializedAccounts.current = availableKey;
		setSelectedIds(new Set(available.map((account) => account.id)));
	}, [available, availableKey]);

	if (workspace.snaptradeConnectionDisabled) return null;
	if (accounts.isLoading) {
		return (
			<p className="mt-2.5 border-t pt-2.5 text-[0.65rem] text-muted-foreground">
				Checking for other brokerage accounts…
			</p>
		);
	}
	if (accounts.error) {
		return (
			<p className="mt-2.5 border-t pt-2.5 text-[0.65rem] text-destructive">
				Could not load the other accounts from this brokerage.
			</p>
		);
	}
	if (available.length === 0) return null;

	async function handleCreateWorkspaces() {
		try {
			const primary = (accounts.data ?? []).find((account) => account.current);
			if (!primary)
				throw new Error("The current brokerage account is not mapped");
			const saved = currentPolicy.data;
			const primaryPolicy: TransactionImportPolicyInput = saved
				? {
						mode: saved.mode,
						...(saved.mode === "custom" && saved.startDate
							? { customStartDate: saved.startDate }
							: {}),
					}
				: { mode: "all" };
			const created = await finalizeSetup.mutateAsync({
				workspaceId: workspace.id,
				primarySnaptradeAccountId: primary.id,
				accounts: [
					{ snaptradeAccountId: primary.id, policy: primaryPolicy },
					...[...selectedIds].map((snaptradeAccountId) => ({
						snaptradeAccountId,
						policy: importPolicy,
					})),
				],
			});
			const additions = created.filter((item) => item.id !== workspace.id);
			toast.success(
				additions.length === 1
					? `Created ${additions[0]?.name ?? "brokerage"} workspace`
					: `Created ${additions.length} brokerage workspaces`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create brokerage workspaces",
			);
		}
	}

	return (
		<div className="mt-2.5 border-t pt-2.5">
			<div className="space-y-0.5">
				<p className="text-xs font-medium">Other brokerage accounts</p>
				<p className="text-[0.65rem] text-muted-foreground">
					Create a separate workspace for each selected account.
				</p>
			</div>
			<div className="mt-2 grid gap-1.5">
				{available.map((account) => (
					<label
						key={account.id}
						htmlFor={`brokerage-account-${account.id}`}
						className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2"
					>
						<Checkbox
							id={`brokerage-account-${account.id}`}
							checked={selectedIds.has(account.id)}
							onCheckedChange={(checked) => {
								setSelectedIds((current) => {
									const next = new Set(current);
									if (checked) next.add(account.id);
									else next.delete(account.id);
									return next;
								});
							}}
						/>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-xs font-medium">
								{account.name}
							</span>
							{account.institutionName && (
								<span className="block truncate text-[0.625rem] text-muted-foreground">
									{account.institutionName}
								</span>
							)}
						</span>
					</label>
				))}
			</div>
			<div className="mt-2.5 flex flex-wrap items-center gap-2">
				<label
					htmlFor={historySelectId}
					className="text-[0.65rem] text-muted-foreground"
				>
					Import history
				</label>
				<select
					id={historySelectId}
					className="h-8 rounded-md border bg-background px-2 text-xs"
					value={importPolicy.mode}
					onChange={(event) =>
						setImportPolicy({
							mode: event.target.value as TransactionImportMode,
						})
					}
				>
					<option value="one_year">Past year · Recommended</option>
					<option value="two_years">Past 2 years</option>
					<option value="all">All available history</option>
					<option value="custom">Custom start date</option>
				</select>
				{importPolicy.mode === "custom" ? (
					<input
						type="date"
						aria-label="Additional accounts custom start date"
						max={new Date().toISOString().slice(0, 10)}
						className="h-8 rounded-md border bg-background px-2 text-xs"
						value={importPolicy.customStartDate ?? ""}
						onChange={(event) =>
							setImportPolicy({
								mode: "custom",
								customStartDate: event.target.value,
							})
						}
					/>
				) : null}
			</div>
			<Button
				className="mt-2.5 w-full"
				size="sm"
				onClick={handleCreateWorkspaces}
				disabled={
					selectedIds.size === 0 ||
					finalizeSetup.isPending ||
					(importPolicy.mode === "custom" && !importPolicy.customStartDate)
				}
			>
				{finalizeSetup.isPending
					? "Creating workspaces…"
					: `Create ${selectedIds.size} workspace${selectedIds.size === 1 ? "" : "s"}`}
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// ConnectionCard — one connected brokerage
// ---------------------------------------------------------------------------

function ConnectionCard({ workspace }: { workspace: Workspace }) {
	const platform = useTradstryPlatform();
	const [refreshQueued, setRefreshQueued] = useState(false);
	const outcomeBaseline = useRef<string | null>(null);
	const { data: syncOutcome } = useBrokerageSyncOutcome(
		workspace.id,
		refreshQueued ? 2_000 : 60_000,
	);
	const refreshActive = refreshQueued || syncOutcome?.status === "queued";
	const { data: reconciliation } = useBrokerageReconciliation(
		workspace.id,
		refreshActive ? 2_000 : false,
	);
	const { data: balances, isLoading } = useBrokerageBalances(
		workspace.id,
		refreshActive ? 5_000 : false,
	);
	const connectionAccounts = useBrokerageConnectionAccounts(
		workspace.id,
		!workspace.snaptradeConnectionDisabled,
	);
	const disconnect = useDisconnectBrokerage();
	const sync = useSyncBrokerageData();
	const initiate = useInitiateConnection();
	const importPolicy = useBrokerageTransactionImportPolicy(workspace.id);
	const expandHistory = useExpandBrokerageTransactionHistory();
	const [reconnecting, setReconnecting] = useState(false);
	const [showHistoryExpansion, setShowHistoryExpansion] = useState(false);
	const [expandedPolicy, setExpandedPolicy] =
		useState<TransactionImportPolicyInput>({
			mode: "all",
		});

	const latestBalanceSync = useMemo(() => {
		return (balances ?? []).reduce<string | null>((latest, balance) => {
			if (!balance.syncedAt) return latest;
			return latest === null || balance.syncedAt > latest
				? balance.syncedAt
				: latest;
		}, null);
	}, [balances]);

	useEffect(() => {
		if (syncOutcome?.status === "queued") setRefreshQueued(true);
	}, [syncOutcome?.status]);

	useEffect(() => {
		if (!refreshQueued) return;
		if (
			syncOutcome?.status === "failed" &&
			syncOutcome.finishedAt !== outcomeBaseline.current
		) {
			setRefreshQueued(false);
			toast.error(syncOutcome.error ?? "Brokerage refresh failed");
			return;
		}
		if (
			syncOutcome?.status === "completed" &&
			syncOutcome.finishedAt !== outcomeBaseline.current
		) {
			setRefreshQueued(false);
			toast.success("Brokerage refresh complete");
			return;
		}
		const timeout = window.setTimeout(() => {
			setRefreshQueued(false);
			toast.info(
				"Brokerage is still refreshing. The latest saved data remains available.",
			);
		}, 90_000);
		return () => window.clearTimeout(timeout);
	}, [refreshQueued, syncOutcome]);

	async function handleReconnect() {
		setReconnecting(true);
		try {
			const callbackUrl = platformUrl(
				platform,
				`/dashboard/brokerage/callback?workspaceId=${workspace.id}`,
			);
			const portal = await initiate.mutateAsync({
				workspaceId: workspace.id,
				customRedirect: callbackUrl,
				reconnect: true,
			});
			await platform.openExternal(portal.redirectUrl);
		} catch (err) {
			toast.error(
				`Failed to reconnect: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
			setReconnecting(false);
		}
	}

	async function handleSync() {
		outcomeBaseline.current = syncOutcome?.finishedAt ?? null;
		try {
			const result = await sync.mutateAsync(workspace.id);
			if (result.status === "queued") {
				setRefreshQueued(true);
				toast.info("Refreshing brokerage data. This can take up to a minute.");
			} else if (
				result.transactionsSynced === 0 &&
				result.holdingsSynced === 0 &&
				result.balancesSynced === 0
			) {
				toast.success("Brokerage data is already up to date");
			} else {
				toast.success(
					`Updated ${result.transactionsSynced} transactions, ${result.holdingsSynced} holdings, and ${result.balancesSynced} balances`,
				);
			}
		} catch (err) {
			setRefreshQueued(false);
			toast.error(err instanceof Error ? err.message : "Failed to sync");
		}
	}

	async function handleDisconnect() {
		if (!confirm("Disconnect this brokerage? You can reconnect later.")) return;
		try {
			await disconnect.mutateAsync(workspace.id);
			toast.success("Brokerage disconnected");
		} catch {
			toast.error("Failed to disconnect");
		}
	}

	async function handleExpandHistory() {
		try {
			await expandHistory.mutateAsync({
				workspaceId: workspace.id,
				policy: expandedPolicy,
			});
			setShowHistoryExpansion(false);
			await handleSync();
			toast.success("Older brokerage history is being imported");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not expand brokerage history",
			);
		}
	}

	return (
		<div className="overflow-hidden rounded-lg border bg-background">
			{/* Header row */}
			<div className="flex items-center justify-between gap-4 px-3 py-2.5">
				<div className="flex items-center gap-2.5">
					<div className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
						<HugeiconsIcon icon={BankIcon} strokeWidth={2} className="size-4" />
					</div>
					<div>
						<p className="text-xs font-semibold">
							{workspace.broker ?? "Brokerage"}
						</p>
						<p className="text-[0.65rem] text-muted-foreground">
							{workspace.name}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					{reconnecting ? (
						<output
							aria-label="Reconnecting brokerage"
							className="flex size-8 items-center justify-center text-muted-foreground"
						>
							<HugeiconsIcon
								icon={Loading03Icon}
								strokeWidth={2}
								className="size-4 animate-spin"
								aria-hidden
							/>
						</output>
					) : (
						<>
							{refreshActive && (
								<span className="mr-1 text-[0.625rem] font-medium text-muted-foreground">
									Refreshing…
								</span>
							)}
							{workspace.snaptradeConnectionDisabled && (
								<>
									<span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-destructive">
										Disconnected
									</span>
									<Button
										variant="outline"
										size="sm"
										onClick={handleReconnect}
										title="Reconnect"
									>
										Reconnect
									</Button>
								</>
							)}
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={handleSync}
								disabled={
									sync.isPending ||
									refreshActive ||
									workspace.snaptradeConnectionDisabled
								}
								title={
									workspace.snaptradeConnectionDisabled
										? "Reconnect before syncing"
										: refreshActive
											? "Refresh in progress"
											: "Sync"
								}
							>
								<HugeiconsIcon
									icon={ArrowReloadHorizontalIcon}
									strokeWidth={2}
									className={`size-3.5 ${sync.isPending || refreshActive ? "animate-spin" : ""}`}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={handleDisconnect}
								disabled={disconnect.isPending}
								title="Disconnect"
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<HugeiconsIcon
									icon={Delete02Icon}
									strokeWidth={2}
									className="size-3.5"
								/>
							</Button>
						</>
					)}
				</div>
			</div>

			<div className="grid border-t sm:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.55fr)]">
				<section aria-label="Account balance" className="bg-muted/[0.14] p-3">
					<p className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">
						Account balance
					</p>
					{isLoading ? (
						<p className="mt-3 text-[0.65rem] text-muted-foreground">
							Loading balances...
						</p>
					) : balances && balances.length > 0 ? (
						<div className="mt-2.5 space-y-3">
							{balances.map((balance) => (
								<div key={balance.id}>
									<div className="flex items-center gap-2">
										<span className="rounded-md bg-background px-1.5 py-1 text-[0.6rem] font-semibold uppercase text-muted-foreground ring-1 ring-foreground/10">
											{balance.currency}
										</span>
										<div className="h-px flex-1 bg-border" />
									</div>
									<div className="mt-2 grid grid-cols-2 gap-4">
										<div>
											<p className="text-[0.6rem] text-muted-foreground">
												Cash
											</p>
											<p className="mt-0.5 text-sm font-semibold tabular-nums">
												{formatCurrency(balance.cash, balance.currency)}
											</p>
										</div>
										<div>
											<p className="text-[0.6rem] text-muted-foreground">
												Buying power
											</p>
											<p className="mt-0.5 text-sm font-semibold tabular-nums">
												{formatCurrency(balance.buyingPower, balance.currency)}
											</p>
										</div>
									</div>
								</div>
							))}
							{latestBalanceSync && (
								<p className="text-[0.6rem] text-muted-foreground">
									Updated {formatSyncTime(latestBalanceSync)}
								</p>
							)}
						</div>
					) : (
						<p className="mt-3 text-[0.65rem] text-muted-foreground">
							No balance reported.
						</p>
					)}
				</section>
				<div className="border-t p-3 sm:border-t-0 sm:border-l">
					<SyncConfidenceCard
						workspaceId={workspace.id}
						workspaceName={workspace.name}
						brokerageAccountName={
							connectionAccounts.data?.find((account) => account.current)
								?.name ?? workspace.name
						}
						outcome={syncOutcome}
						reconciliation={reconciliation}
						connectionDisabled={workspace.snaptradeConnectionDisabled}
						isRefreshing={refreshActive}
						isSyncing={sync.isPending}
						isReconnecting={reconnecting}
						onSync={() => void handleSync()}
						onReconnect={() => void handleReconnect()}
					/>
				</div>
			</div>
			<div className="px-3 pb-3">
				{importPolicy.data ? (
					<div className="mb-3 rounded-md border bg-muted/15 p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p className="text-xs font-medium">Transaction history</p>
								<p className="mt-0.5 text-[0.65rem] text-muted-foreground">
									{importPolicy.data.mode === "all"
										? "All available history"
										: `Imported since ${importPolicy.data.startDate ?? "the configured date"}`}
									{importPolicy.data.initialImportCompletedAt
										? " · Initial import complete"
										: " · Initial import pending"}
								</p>
							</div>
							{importPolicy.data.mode !== "all" ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setShowHistoryExpansion((value) => !value)}
								>
									Import older history
								</Button>
							) : null}
						</div>
						{showHistoryExpansion ? (
							<div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
								<label className="grid gap-1 text-[0.65rem] text-muted-foreground">
									Older range
									<select
										className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
										value={expandedPolicy.mode}
										onChange={(event) =>
											setExpandedPolicy({
												mode: event.target.value as TransactionImportMode,
											})
										}
									>
										{importPolicy.data.mode === "one_year" ? (
											<option value="two_years">Past 2 years</option>
										) : null}
										<option value="all">All available history</option>
										<option value="custom">Custom earlier date</option>
									</select>
								</label>
								{expandedPolicy.mode === "custom" ? (
									<input
										type="date"
										aria-label="Older history start date"
										max={importPolicy.data.startDate ?? undefined}
										className="h-8 rounded-md border bg-background px-2 text-xs"
										value={expandedPolicy.customStartDate ?? ""}
										onChange={(event) =>
											setExpandedPolicy({
												mode: "custom",
												customStartDate: event.target.value,
											})
										}
									/>
								) : null}
								<Button
									size="sm"
									onClick={() => void handleExpandHistory()}
									disabled={
										expandHistory.isPending ||
										(expandedPolicy.mode === "custom" &&
											!expandedPolicy.customStartDate)
									}
								>
									{expandHistory.isPending ? "Saving…" : "Import older history"}
								</Button>
								<p className="w-full text-[0.625rem] text-muted-foreground">
									Existing transactions and journal work are preserved.
								</p>
							</div>
						) : null}
					</div>
				) : null}
				<AdditionalBrokerageAccounts workspace={workspace} />
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// BrokerageButton — header trigger + modal
// ---------------------------------------------------------------------------

export function BrokerageButton() {
	const platform = useTradstryPlatform();
	const [open, setOpen] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const workspace = useActiveWorkspace();
	const connected = !!workspace?.snaptradeConnectionId;
	const initiate = useInitiateConnection();
	const setupAccounts = useBrokerageConnectionAccounts(
		workspace?.id ?? null,
		connected && workspace?.brokerageSetupComplete === false,
	);
	const finalizeSetup = useFinalizeBrokerageSetup();
	const setupSync = useSyncBrokerageData();

	async function handleFinalizeSetup(value: {
		primarySnaptradeAccountId: string;
		accounts: Array<{
			snaptradeAccountId: string;
			policy: TransactionImportPolicyInput;
		}>;
	}) {
		if (!workspace) return;
		try {
			const configured = await finalizeSetup.mutateAsync({
				workspaceId: workspace.id,
				...value,
			});
			for (const item of configured) await setupSync.mutateAsync(item.id);
			toast.success("Brokerage import started");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not save brokerage import setup",
			);
		}
	}

	async function handleConnect() {
		if (!workspace) return;
		setConnecting(true);
		try {
			const callbackUrl = platformUrl(
				platform,
				`/dashboard/brokerage/callback?workspaceId=${workspace.id}`,
			);
			const portal = await initiate.mutateAsync({
				workspaceId: workspace.id,
				customRedirect: callbackUrl,
			});
			await platform.openExternal(portal.redirectUrl);
		} catch (err) {
			toast.error(
				`Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
			setConnecting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="relative"
							aria-label="Brokerage"
						>
							<HugeiconsIcon
								icon={BankIcon}
								strokeWidth={2}
								className="size-4.5"
							/>
							{connected ? (
								<span
									className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500 ring-2 ring-background"
									aria-hidden
								/>
							) : null}
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{connected ? "Brokerage connected" : "Connect brokerage"}
				</TooltipContent>
			</Tooltip>
			<DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-4xl">
				<DialogHeader className="shrink-0">
					<DialogTitle>Brokerage connection</DialogTitle>
					<DialogDescription>
						Connect one brokerage account to this workspace.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="-mx-4 min-h-0 px-4 [&>[data-radix-scroll-area-viewport]]:max-h-[calc(100svh-9rem)]">
					<div className="flex flex-col gap-3">
						{!connected || !workspace ? (
							<div className="flex flex-col items-center gap-3 py-6 text-center">
								<div className="rounded-full bg-muted p-3">
									<HugeiconsIcon
										icon={BankIcon}
										strokeWidth={2}
										className="size-6 text-muted-foreground"
									/>
								</div>
								<div>
									<p className="text-sm font-medium">No connections yet</p>
									<p className="mt-1 text-xs text-muted-foreground">
										Link a brokerage to sync your trades, positions, and
										balances.
									</p>
								</div>
								<Button
									size="sm"
									onClick={handleConnect}
									disabled={connecting || !workspace}
								>
									{connecting ? (
										<>
											<HugeiconsIcon
												icon={Loading03Icon}
												strokeWidth={2}
												className="size-4 animate-spin"
												aria-hidden
											/>
											Connecting
										</>
									) : (
										"Connect Brokerage"
									)}
								</Button>
							</div>
						) : !workspace.brokerageSetupComplete ? (
							setupAccounts.isLoading ? (
								<p className="py-8 text-center text-sm text-muted-foreground">
									Loading brokerage accounts…
								</p>
							) : setupAccounts.error ? (
								<p
									role="alert"
									className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
								>
									Could not load the accounts for this connection. Close and
									reopen this panel to retry.
								</p>
							) : (
								<BrokerageHistorySetup
									accounts={setupAccounts.data ?? []}
									workspaceName={workspace.name}
									onSubmit={(value) => void handleFinalizeSetup(value)}
									isSubmitting={finalizeSetup.isPending || setupSync.isPending}
								/>
							)
						) : (
							<ConnectionCard workspace={workspace} />
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
