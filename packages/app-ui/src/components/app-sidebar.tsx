"use client";

import {
	AnalyticsUpIcon,
	BankIcon,
	BookOpen01Icon,
	Calculator01Icon,
	ChartLineData01Icon,
	DashboardSquare01Icon,
	File01Icon,
	Notebook01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradstryMark } from "@tradstry/app-ui/components/logo";
import { NavUser } from "@tradstry/app-ui/components/nav-user";
import { PositionCalculator } from "@tradstry/app-ui/components/position-calculator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@tradstry/app-ui/components/ui/sidebar";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import * as React from "react";

type IconData = typeof DashboardSquare01Icon;
type NavItem = { title: string; url: string; icon: IconData };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
	{
		label: "Trade",
		items: [
			{ title: "Dashboard", url: "/dashboard", icon: DashboardSquare01Icon },
			{ title: "Journal", url: "/dashboard/journal", icon: File01Icon },
			{ title: "Brokerage", url: "/dashboard/brokerage", icon: BankIcon },
		],
	},
	{
		label: "Improve",
		items: [
			{ title: "Playbooks", url: "/dashboard/playbook", icon: BookOpen01Icon },
			{
				title: "Analytics",
				url: "/dashboard/analytics",
				icon: AnalyticsUpIcon,
			},
			{ title: "Notebook", url: "/dashboard/notebook", icon: Notebook01Icon },
		],
	},
	{
		label: "Research",
		items: [
			{
				title: "Markets",
				url: "/dashboard/markets",
				icon: ChartLineData01Icon,
			},
		],
	},
];

function isActive(pathname: string, url: string): boolean {
	if (url === "/dashboard") return pathname === "/dashboard";
	return pathname === url || pathname.startsWith(`${url}/`);
}

export function AppSidebar() {
	const { pathname, navigate } = useTradstryPlatform();
	const [calculatorOpen, setCalculatorOpen] = React.useState(false);

	return (
		<>
			<Sidebar
				collapsible="offcanvas"
				className="border-0 bg-sidebar px-2 pb-10 pt-1.5 text-sidebar-foreground"
			>
				<SidebarHeader className="h-11 justify-center px-1 py-0">
					<div className="flex min-w-0 items-center gap-1">
						<a
							href="/dashboard"
							onClick={(event) => {
								event.preventDefault();
								navigate("/dashboard");
							}}
							aria-label="Tradstry home"
							className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
						>
							<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
								<TradstryMark className="size-3.5" />
							</span>
							<span className="truncate text-base font-bold tracking-[-0.025em]">
								Tradstry
							</span>
						</a>
						<NavUser />
					</div>
				</SidebarHeader>

				<SidebarContent className="gap-1 pt-2">
					{NAV_GROUPS.map((group) => (
						<SidebarGroup key={group.label} className="px-1 py-1.5">
							<SidebarGroupLabel className="h-7 px-2 font-mono text-[0.65rem] font-medium uppercase tracking-[0.13em] text-sidebar-foreground/45">
								{group.label}
							</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu className="gap-0.5">
									{group.items.map((item) => {
										const active = isActive(pathname, item.url);
										return (
											<SidebarMenuItem key={item.url}>
												<SidebarMenuButton
													asChild
													isActive={active}
													tooltip={item.title}
													className="h-9 rounded-lg px-2.5 text-[0.8rem] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-foreground [&_svg]:size-[1.1rem]!"
												>
													<a
														href={item.url}
														onClick={(event) => {
															event.preventDefault();
															navigate(item.url);
														}}
													>
														<HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
														<span>{item.title}</span>
													</a>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
				</SidebarContent>

				<SidebarFooter className="gap-1 px-1 pb-1">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								tooltip="Position Calculator"
								onClick={() => setCalculatorOpen(true)}
								className="h-9 rounded-lg px-2.5 text-[0.8rem] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-[1.1rem]!"
							>
								<HugeiconsIcon icon={Calculator01Icon} strokeWidth={1.8} />
								<span>Position Calculator</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<PositionCalculator
				open={calculatorOpen}
				onOpenChange={setCalculatorOpen}
			/>
		</>
	);
}
