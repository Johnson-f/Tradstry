"use client";

import {
	AgentPanel,
	AgentPanelTrigger,
} from "@tradstry/app-ui/components/agents";
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
				<div className="flex min-h-0 flex-1 flex-col overflow-auto">
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
				</div>
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
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
		<ScrollArea className="min-h-0 flex-1">
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
			className="mx-1.5 mb-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1rem] border border-black/10 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.035)] md:mx-2.5 md:mb-10 dark:border-white/10 dark:shadow-[0_1px_2px_rgba(0,0,0,0.28),0_18px_46px_rgba(0,0,0,0.16)]"
		>
			{children}
		</section>
	);
}

export function DashboardApp({ pathname }: { pathname: string }) {
	return (
		<SidebarProvider
			className="bg-[var(--app-chrome)]"
			style={
				{
					"--sidebar-width": "13.5rem",
					"--sidebar-width-icon": "3.25rem",
					"--header-height": "2.75rem",
				} as React.CSSProperties
			}
		>
			<AppSidebar />
			<SidebarInset className="min-h-0 overflow-hidden bg-transparent">
				<Screen pathname={pathname} />
				<div className="absolute bottom-0 right-0 z-30 hidden h-10 items-center md:flex">
					<AgentPanelTrigger placement="dock" />
				</div>
			</SidebarInset>
			<AgentPanel />
		</SidebarProvider>
	);
}
