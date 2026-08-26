"use client";

import { BrokerageButton } from "@tradstry/app-ui/components/brokerage";
import { getDashboardRouteMeta } from "@tradstry/app-ui/components/dashboard-route-meta";
import { NotificationsButton } from "@tradstry/app-ui/components/notifications";
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
    <header className="relative z-30 flex h-(--header-height) shrink-0 items-center bg-transparent">
      <div className="flex w-full min-w-0 items-center px-2.5 md:px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarTrigger
              aria-label="Toggle sidebar"
              aria-keyshortcuts="Meta+B Control+B"
              className="mr-1.5 size-8 rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8 [&_svg]:size-[1.125rem]!"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            <span>Toggle sidebar</span>
            <kbd className="rounded bg-background/15 px-1.5 py-0.5 font-mono text-[0.6rem]">
              ⌘/Ctrl B
            </kbd>
          </TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 items-center">
          <h1 className="shrink-0 text-sm font-semibold tracking-[-0.015em]">
            {title}
          </h1>
          <span
            className="mx-2.5 h-3.5 w-px shrink-0 bg-foreground/10"
            aria-hidden
          />
          <WorkspaceSwitcher />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <BrokerageButton />
          <NotificationsButton />
          {actions ? <div className="ml-1.5">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
