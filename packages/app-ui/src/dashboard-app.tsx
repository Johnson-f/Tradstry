"use client";

import { Analytics } from "@tradstry/app-ui/components/analytics";
import { AppSidebar } from "@tradstry/app-ui/components/app-sidebar";
import { BrokerageEmptyState } from "@tradstry/app-ui/components/brokerage/brokerage-empty-state";
import { BrokerageTransactions } from "@tradstry/app-ui/components/brokerage/brokerage-transactions";
import { ChatProvider } from "@tradstry/app-ui/components/chat/chat-panel";
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
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
	SidebarInset,
	SidebarProvider,
} from "@tradstry/app-ui/components/ui/sidebar";
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
			<div className="flex flex-1 flex-col overflow-auto">
				{workspaces.isLoading || workspaces.isPending ? (
					<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
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
					<div className="p-4 md:p-6">
						<DashboardCardError
							title="Dashboard"
							error={workspaces.error}
							onRetry={workspaces.refetch}
							className="min-h-[32rem]"
						/>
					</div>
				) : (
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
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
		</>
	);
}

function BrokerageScreen() {
	const workspace = useActiveWorkspace();
	return (
		<>
			<SiteHeader />
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{workspace?.snaptradeConnectionId ? (
					<BrokerageTransactions />
				) : (
					<BrokerageEmptyState />
				)}
			</div>
		</>
	);
}

function Screen({ pathname }: { pathname: string }) {
	if (pathname.startsWith("/dashboard/analytics")) {
		return (
			<>
				<SiteHeader />
				<FeatureScroll>
					<Analytics />
				</FeatureScroll>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/brokerage")) return <BrokerageScreen />;
	if (pathname.startsWith("/dashboard/markets")) {
		return (
			<>
				<SiteHeader />
				<Markets />
			</>
		);
	}
	if (pathname.startsWith("/dashboard/journal")) {
		return (
			<>
				<SiteHeader />
				<FeatureScroll>
					<Journal />
				</FeatureScroll>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/notebook")) {
		return (
			<>
				<SiteHeader />
				<div className="flex min-h-0 flex-1">
					<Notebook />
				</div>
			</>
		);
	}
	if (pathname.startsWith("/dashboard/playbook")) {
		return (
			<>
				<SiteHeader />
				<FeatureScroll>
					<Playbook />
				</FeatureScroll>
			</>
		);
	}
	return <DashboardHome />;
}

function FeatureScroll({ children }: { children: React.ReactNode }) {
	return (
		<ScrollArea className="min-h-0 flex-1">
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
					{children}
				</div>
			</div>
		</ScrollArea>
	);
}

export function DashboardApp({ pathname }: { pathname: string }) {
	return (
		<ChatProvider>
			<SidebarProvider
				style={
					{
						"--sidebar-width": "calc(var(--spacing) * 72)",
						"--header-height": "calc(var(--spacing) * 12)",
					} as React.CSSProperties
				}
			>
				<AppSidebar />
				<SidebarInset className="min-h-0 overflow-hidden">
					<Screen pathname={pathname} />
				</SidebarInset>
			</SidebarProvider>
		</ChatProvider>
	);
}
