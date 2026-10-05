"use client";

import {
	Alert02Icon,
	ArrowDown01Icon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ReconciliationSummary } from "@tradstry/app-ui/components/brokerage/reconciliation-summary";
import { ReportIncorrectDataDialog } from "@tradstry/app-ui/components/brokerage/report-incorrect-data-dialog";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import {
	formatNextSyncTimestamp,
	formatSyncTimestamp,
	syncConfidenceState,
} from "@tradstry/app-ui/lib/brokerage-sync-confidence";
import type {
	BrokerageReconciliation,
	BrokerageSyncOutcome,
} from "@tradstry/app-ui/lib/types/brokerage";

interface SyncConfidenceCardProps {
	workspaceId: string;
	workspaceName: string;
	brokerageAccountName: string;
	outcome: BrokerageSyncOutcome | null | undefined;
	reconciliation: BrokerageReconciliation | null | undefined;
	connectionDisabled: boolean;
	isRefreshing: boolean;
	isSyncing: boolean;
	isReconnecting: boolean;
	showActions?: boolean;
	onSync: () => void;
	onReconnect: () => void;
}

export function SyncConfidenceCard({
	workspaceId,
	workspaceName,
	brokerageAccountName,
	outcome,
	reconciliation,
	connectionDisabled,
	isRefreshing,
	isSyncing,
	isReconnecting,
	showActions = true,
	onSync,
	onReconnect,
}: SyncConfidenceCardProps) {
	const state = syncConfidenceState(outcome, connectionDisabled, isRefreshing);
	const showAction = showActions && state.action !== null;
	const actionIsReconnect = state.action === "reconnect";
	const icon =
		state.tone === "success"
			? CheckmarkCircle02Icon
			: state.tone === "danger"
				? Alert02Icon
				: state.tone === "progress"
					? Loading03Icon
					: InformationCircleIcon;

	return (
		<section aria-label="Brokerage sync overview" className="space-y-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div
						className={`flex items-center gap-2 text-sm font-medium ${state.tone === "danger" ? "text-destructive" : "text-foreground"}`}
					>
						<HugeiconsIcon
							icon={icon}
							aria-hidden="true"
							className={`size-4 shrink-0 ${state.tone === "progress" ? "animate-spin motion-reduce:animate-none" : ""}`}
						/>
						<span>{state.label}</span>
					</div>
					<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						{state.description}
					</p>
				</div>
				{showAction && (
					<Button
						type="button"
						variant={actionIsReconnect ? "default" : "outline"}
						size="sm"
						onClick={actionIsReconnect ? onReconnect : onSync}
						disabled={isSyncing || isReconnecting}
					>
						{actionIsReconnect
							? isReconnecting
								? "Opening…"
								: "Reconnect"
							: isSyncing
								? "Syncing…"
								: state.action === "retry"
									? "Retry"
									: "Sync now"}
					</Button>
				)}
			</div>

			<div className="space-y-4">
				<div className="grid grid-cols-3 gap-3 border-y py-4">
					<SyncCount label="Transactions" value={outcome?.transactionsSynced} />
					<SyncCount label="Holdings" value={outcome?.holdingsSynced} />
					<SyncCount label="Balances" value={outcome?.balancesSynced} />
				</div>

				<div className="grid gap-4 text-xs sm:grid-cols-2">
					<div>
						<p className="text-muted-foreground">Last successful</p>
						<p className="mt-1.5 font-medium text-foreground">
							{formatSyncTimestamp(outcome?.succeededAt)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Next automatic sync</p>
						<p className="mt-1.5 font-medium text-foreground">
							{formatNextSyncTimestamp(
								outcome?.nextScheduledAt,
								connectionDisabled,
							)}
						</p>
					</div>
				</div>
			</div>

			<ReconciliationSummary reconciliation={reconciliation} />

			<div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3">
				<Collapsible className="min-w-0 flex-1 text-xs">
					<CollapsibleTrigger className="group flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						Sync details
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							aria-hidden="true"
							className="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md bg-muted/30 p-2.5 text-muted-foreground">
							<dt>Workspace</dt>
							<dd className="truncate text-right text-foreground">
								{workspaceName}
							</dd>
							<dt>Latest attempt</dt>
							<dd className="text-right text-foreground">
								{formatSyncTimestamp(outcome?.startedAt)}
							</dd>
							<dt>Finished</dt>
							<dd className="text-right text-foreground">
								{formatSyncTimestamp(outcome?.finishedAt)}
							</dd>
						</dl>
					</CollapsibleContent>
				</Collapsible>
				<ReportIncorrectDataDialog
					workspaceId={workspaceId}
					workspaceName={workspaceName}
					brokerageAccountName={brokerageAccountName}
					diagnosticId={reconciliation?.diagnosticId ?? outcome?.diagnosticId}
				/>
			</div>
		</section>
	);
}

function SyncCount({
	label,
	value,
}: {
	label: string;
	value: number | undefined;
}) {
	return (
		<div>
			<p className="text-lg font-semibold tabular-nums">{value ?? "—"}</p>
			<p className="mt-1 text-xs text-muted-foreground">{label}</p>
		</div>
	);
}
