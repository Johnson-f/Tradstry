"use client";

import { AgentPanel } from "@tradstry/app-ui/components/agents";
import { Analytics } from "@tradstry/app-ui/components/analytics";
import { AppSidebar } from "@tradstry/app-ui/components/app-sidebar";
import { BrokerageEmptyState } from "@tradstry/app-ui/components/brokerage/brokerage-empty-state";
import { BrokerageTransactions } from "@tradstry/app-ui/components/brokerage/brokerage-transactions";
import {
	DashboardCalendar,
	DashboardCardError,
	DashboardRangeSelect,
	DashboardReviewQueueCard,
	DashboardRiskRecoveryCard,
	DashboardTradingPerformanceCard,
	DashboardUpperCard,
	DashboardWinnersLeaksCard,
} from "@tradstry/app-ui/components/dashboard";
import { Journal } from "@tradstry/app-ui/components/journal";
import { Markets } from "@tradstry/app-ui/components/markets";
import { Notebook } from "@tradstry/app-ui/components/notebook";
import { Playbook } from "@tradstry/app-ui/components/playbook";
import { SiteHeader } from "@tradstry/app-ui/components/site-header";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import {
	SidebarInset,
	SidebarProvider,
} from "@tradstry/app-ui/components/ui/sidebar";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useWorkspaces as useWorkspacesQuery } from "@tradstry/app-ui/hooks/workspaces";
import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";
import * as React from "react";

function DashboardHome() {
	const [range, setRange] = React.useState<AnalyticsRange>("LAST_1_MONTH");
	const workspaces = useWorkspacesQuery();
	return (
		<>
			<SiteHeader
				actions={
					<DashboardRangeSelect value={range} onValueChange={setRange} />
				}
			/>
			<PageCanvas>
				<ScrollArea
					type="auto"
					className="min-h-0 min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]]:overscroll-contain [&>[data-slot=scroll-area-viewport]>div]:block!"
				>
					{workspaces.isLoading || workspaces.isPending ? (
						<div className="flex flex-col gap-3 p-3 md:gap-4 md:p-4">
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
								{["a", "b", "c", "d", "e"].map((key) => (
									<Skeleton key={key} className="h-36 rounded-2xl" />
								))}
							</div>
							<div className="grid gap-4 xl:grid-cols-2">
								<Skeleton className="h-96 rounded-2xl" />
								<Skeleton className="h-96 rounded-2xl" />
							</div>
						</div>
					) : workspaces.isError ? (
						<div className="p-3 md:p-4">
							<DashboardCardError
								title="Dashboard"
								error={workspaces.error}
								onRetry={workspaces.refetch}
								className="min-h-[32rem]"
							/>
						</div>
					) : (
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-3 p-3 md:gap-4 md:p-4">
								<DashboardUpperCard range={range} />
								<div className="grid items-stretch gap-4 md:gap-6 @4xl/main:grid-cols-2">
									<DashboardTradingPerformanceCard range={range} />
									<DashboardReviewQueueCard />
								</div>
								<div className="grid items-stretch gap-4 md:gap-6 @4xl/main:grid-cols-2">
									<DashboardRiskRecoveryCard range={range} />
									<DashboardWinnersLeaksCard range={range} />
								</div>
								<DashboardCalendar />
							</div>
						</div>
					)}
				</ScrollArea>
			</PageCanvas>
		</>
	);
}

function BrokerageScreen() {
	const workspace = useActiveWorkspace();
	return (
		<>
			<SiteHeader />
			<PageCanvas>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					{workspace?.snaptradeConnectionId ? (
						<BrokerageTransactions />
					) : (
						<BrokerageEmptyState />
					)}
				</div>
			</PageCanvas>
		</>
	);
}

function Screen({ pathname }: { pathname: string }) {
	if (pathname.startsWith("/dashboard/analytics")) {
		return (
			<>
				<SiteHeader />
				<PageCanvas>
					<FeatureScroll>
						<Analytics />
					</FeatureScroll>
				</PageCanvas>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/brokerage")) return <BrokerageScreen />;
	if (pathname.startsWith("/dashboard/markets")) {
		return (
			<>
				<SiteHeader />
				<PageCanvas>
					<Markets />
				</PageCanvas>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/journal")) {
		return (
			<>
				<SiteHeader />
				<PageCanvas>
					<FeatureScroll>
						<Journal />
					</FeatureScroll>
				</PageCanvas>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/notebook")) {
		return (
			<>
				<SiteHeader />
				<PageCanvas>
					<div className="flex min-h-0 flex-1">
						<Notebook />
					</div>
				</PageCanvas>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/playbook")) {
		return (
			<>
				<SiteHeader />
				<PageCanvas>
					<FeatureScroll>
						<Playbook />
					</FeatureScroll>
				</PageCanvas>
			</>
		);
	}
	return <DashboardHome />;
}

function FeatureScroll({ children }: { children: React.ReactNode }) {
	return (
		<ScrollArea
			type="auto"
			className="min-h-0 min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]]:overscroll-contain [&>[data-slot=scroll-area-viewport]>div]:block!"
		>
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-3 p-3 md:gap-4 md:p-4">
					{children}
				</div>
			</div>
		</ScrollArea>
	);
}

function PageCanvas({ children }: { children: React.ReactNode }) {
	return (
		<section
			data-slot="app-canvas"
			className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
		>
			{children}
		</section>
	);
}

export function DashboardApp({ pathname }: { pathname: string }) {
	return (
		<SidebarProvider
			data-dashboard-shell=""
			className="fixed inset-0 h-dvh min-h-0 overscroll-none bg-[var(--app-chrome)]"
			style={
				{
					"--sidebar-width": "13.5rem",
					"--sidebar-width-icon": "3.25rem",
					"--header-height": "4rem",
				} as React.CSSProperties
			}
		>
			<AppSidebar />
			<SidebarInset className="min-h-0 min-w-0 overflow-hidden bg-background md:border-l md:border-border/60">
				<Screen pathname={pathname} />
			</SidebarInset>
			<AgentPanel />
		</SidebarProvider>
	);
}
