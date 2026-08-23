"use client";

import {
  Logout01Icon,
  MenuCircleIcon,
  PlusSignIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import { WorkspaceDialog } from "@tradstry/app-ui/components/workspaces";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import * as React from "react";

export function NavUser() {
  const { signOut, renderAccountDialog } = useTradstryPlatform();
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-8 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-sidebar-foreground/65 outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/40 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground"
          >
            <HugeiconsIcon icon={MenuCircleIcon} className="size-[1.15rem]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-64 rounded-xl p-1.5"
          side="bottom"
          align="end"
          sideOffset={8}
        >
          <DropdownMenuGroup className="space-y-0.5">
            <DropdownMenuItem
              onClick={() => setAccountOpen(true)}
              disabled={!renderAccountDialog}
              className="min-h-8 rounded-lg px-2.5"
            >
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setWorkspaceOpen(true)}
              className="min-h-8 rounded-lg px-2.5"
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-2.5 py-1 text-[0.65rem] font-medium text-muted-foreground">
            Account
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => void signOut()}
              className="min-h-8 rounded-lg px-2.5"
            >
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {renderAccountDialog?.(accountOpen, setAccountOpen)}
      <WorkspaceDialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} />
    </>
  );
}
