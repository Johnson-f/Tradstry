"use client";

import {
	Alert02Icon,
	ArrowDown01Icon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import {
	brokerageReconciliationPresentation,
	type ReconciliationTone,
} from "@tradstry/app-ui/lib/brokerage-reconciliation";
import { formatSyncTimestamp } from "@tradstry/app-ui/lib/brokerage-sync-confidence";
import type { BrokerageReconciliation } from "@tradstry/app-ui/lib/types/brokerage";
import type { ReactNode } from "react";

const TONE_CLASSES: Record<ReconciliationTone, string> = {
	neutral: "border-border bg-muted/20 text-muted-foreground",
	progress: "border-border bg-muted/20 text-muted-foreground",
	success: "border-border bg-muted/20 text-muted-foreground",
	warning: "border-border bg-muted/20 text-foreground",
	danger: "border-destructive/25 bg-background text-destructive",
};

function StatusIcon({ tone }: { tone: ReconciliationTone }) {
	const icon =
		tone === "success"
			? CheckmarkCircle02Icon
			: tone === "danger" || tone === "warning"
				? Alert02Icon
				: tone === "progress"
					? Loading03Icon
					: InformationCircleIcon;
	return (
		<HugeiconsIcon
			icon={icon}
			aria-hidden="true"
			className={`mt-0.5 size-4 shrink-0 ${tone === "progress" ? "animate-spin motion-reduce:animate-none" : ""}`}
			strokeWidth={2}
		/>
	);
}

export function ReconciliationSummary({
	reconciliation,
}: {
	reconciliation: BrokerageReconciliation | null | undefined;
}) {
	const presentation = brokerageReconciliationPresentation(reconciliation);
	const brokerCount = reconciliation?.brokerTransactionCount;
	const localCount = reconciliation?.localTransactionCount;

	return (
		<section aria-label="Broker data verification" className="space-y-3">
			<div
				className={`rounded-xl border p-4 ${TONE_CLASSES[presentation.tone]}`}
			>
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<div className="flex min-w-0 items-start gap-2">
						<StatusIcon tone={presentation.tone} />
						<div className="min-w-0">
							<p className="text-xs font-medium text-foreground">
								{presentation.label}
							</p>
							<p className="mt-1 text-xs leading-relaxed">
								{presentation.description}
							</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-foreground">
						<span>
							<span className="text-muted-foreground">Broker</span>{" "}
							<strong>{brokerCount ?? "—"}</strong>
						</span>
						<span aria-hidden="true" className="text-muted-foreground">
							⇄
						</span>
						<span>
							<span className="text-muted-foreground">Tradstry</span>{" "}
							<strong>{localCount ?? "—"}</strong>
						</span>
					</div>
				</div>
			</div>

			{reconciliation && (
				<Collapsible className="text-xs">
					<CollapsibleTrigger className="group flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						Verification details
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							aria-hidden="true"
							className="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="mt-2 grid gap-2 rounded-md border bg-muted/20 p-2.5 sm:grid-cols-2">
							<MetricGroup title="Fills">
								<Metric
									label="Imported this sync"
									value={reconciliation.importedTransactionCount}
								/>
								<Metric
									label="Already stored"
									value={reconciliation.duplicateTransactionCount}
								/>
								<Metric
									label="Skipped"
									value={reconciliation.skippedTransactionCount}
									attention={reconciliation.skippedTransactionCount > 0}
								/>
								<Metric
									label="Pending"
									value={reconciliation.pendingTransactionCount}
									attention={reconciliation.pendingTransactionCount > 0}
								/>
								<Metric
									label="Failed"
									value={reconciliation.failedTransactionCount}
									attention={reconciliation.failedTransactionCount > 0}
								/>
							</MetricGroup>
							<MetricGroup title="Differences">
								<Metric
									label="Missing broker fills"
									value={reconciliation.missingTransactionCount}
									attention={reconciliation.missingTransactionCount > 0}
								/>
								<Metric
									label="Local-only fills"
									value={reconciliation.extraTransactionCount}
									attention={reconciliation.extraTransactionCount > 0}
								/>
								<Metric
									label="Broker holdings"
									value={reconciliation.brokerHoldingCount}
								/>
								<Metric
									label="Saved holdings"
									value={reconciliation.localHoldingCount}
								/>
								<Metric
									label="Balance differences"
									value={reconciliation.balanceDiscrepancyCount}
									attention={reconciliation.balanceDiscrepancyCount > 0}
								/>
							</MetricGroup>
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t pt-2 text-muted-foreground sm:col-span-2">
								<dt>Fills checked</dt>
								<dd className="text-right text-foreground">
									{formatSyncTimestamp(reconciliation.transactionCheckedAt)}
								</dd>
								<dt>Portfolio checked</dt>
								<dd className="text-right text-foreground">
									{formatSyncTimestamp(reconciliation.portfolioCheckedAt)}
								</dd>
							</dl>
						</div>
					</CollapsibleContent>
				</Collapsible>
			)}
		</section>
	);
}

function MetricGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div>
			<p className="mb-1.5 font-semibold text-foreground">{title}</p>
			<dl className="space-y-1 text-muted-foreground">{children}</dl>
		</div>
	);
}

function Metric({
	label,
	value,
	attention = false,
}: {
	label: string;
	value: number;
	attention?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt>{label}</dt>
			<dd
				className={`font-medium tabular-nums ${attention ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}
			>
				{value}
			</dd>
		</div>
	);
}
