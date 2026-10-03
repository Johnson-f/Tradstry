"use client";

import { AgentPanelTrigger } from "@tradstry/app-ui/components/agents";
import { BrokerageButton } from "@tradstry/app-ui/components/brokerage";
import { getDashboardRouteMeta } from "@tradstry/app-ui/components/dashboard-route-meta";
import { NotificationsButton } from "@tradstry/app-ui/components/notifications";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@tradstry/app-ui/components/ui/breadcrumb";
import { SidebarTrigger } from "@tradstry/app-ui/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { WorkspaceSwitcher } from "@tradstry/app-ui/components/workspaces";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";

export function SiteHeader({ actions }: { actions?: React.ReactNode }) {
	const { pathname } = useTradstryPlatform();
	const title = getDashboardRouteMeta(pathname).title;

	return (
		<header className="relative z-30 flex h-(--header-height) shrink-0 items-center bg-background">
			<div className="flex w-full min-w-0 items-center gap-2 px-4">
				<Tooltip>
					<TooltipTrigger asChild>
						<SidebarTrigger
							aria-label="Toggle sidebar"
							aria-keyshortcuts="Meta+B Control+B"
							className="-ml-1 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4!"
						/>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="flex items-center gap-2">
						<span>Toggle sidebar</span>
						<kbd className="rounded bg-background/15 px-1.5 py-0.5 font-mono text-[0.6rem]">
							⌘/Ctrl B
						</kbd>
					</TooltipContent>
				</Tooltip>
				<span className="mr-2 h-4 w-px shrink-0 bg-border" aria-hidden />
				<Breadcrumb className="min-w-0">
					<BreadcrumbList className="flex-nowrap gap-2 text-sm">
						<BreadcrumbItem className="min-w-0">
							<WorkspaceSwitcher />
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden sm:block" />
						<BreadcrumbItem className="min-w-0">
							<h1 className="truncate text-sm font-normal">
								<BreadcrumbPage>{title}</BreadcrumbPage>
							</h1>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<div className="ml-auto flex shrink-0 items-center gap-0.5">
					<BrokerageButton />
					<NotificationsButton />
					<AgentPanelTrigger />
					{actions ? <div className="ml-1.5">{actions}</div> : null}
				</div>
			</div>
		</header>
	);
}
