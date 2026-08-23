"use client";

import {
  DatabaseExportIcon,
  Mail01Icon,
  Notification02Icon,
  SecurityCheckIcon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { DangerSection } from "@/components/account/danger-section";
import { EmailSection } from "@/components/account/email-section";
import { ExportSection } from "@/components/account/export-section";
import { NotificationsSection } from "@/components/account/notifications-section";
import { ProfileSection } from "@/components/account/profile-section";
import { SecuritySection } from "@/components/account/security-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tradstry/app-ui/components/ui/tabs";

const TABS = [
  {
    value: "profile",
    label: "Profile",
    icon: UserCircle02Icon,
    render: () => <ProfileSection />,
  },
  {
    value: "email",
    label: "Email",
    icon: Mail01Icon,
    render: () => <EmailSection />,
  },
  {
    value: "notifications",
    label: "Notifications",
    icon: Notification02Icon,
    render: () => <NotificationsSection />,
  },
  {
    value: "security",
    label: "Security",
    icon: SecurityCheckIcon,
    render: () => <SecuritySection />,
  },
  {
    value: "danger",
    label: "Data & privacy",
    icon: DatabaseExportIcon,
    render: () => (
      <div className="grid gap-4">
        <ExportSection />
        <DangerSection />
      </div>
    ),
  },
] as const;

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = React.useState<string>("profile");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(34rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[50rem]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.015em]">
            <span className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
              <HugeiconsIcon
                icon={UserCircle02Icon}
                strokeWidth={2}
                className="size-[1.1rem]"
              />
            </span>
            Settings
          </DialogTitle>
          <DialogDescription className="pl-[2.625rem]">
            Manage your identity, notifications, security, and account data.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          orientation="vertical"
          className="min-h-0 flex-1 flex-col gap-0 overflow-hidden sm:flex-row"
        >
          <TabsList
            variant="line"
            aria-label="Settings sections"
            className="h-auto w-full shrink-0 flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none border-b border-border/60 bg-muted/20 p-2 sm:h-full sm:w-40 sm:flex-col sm:border-r sm:border-b-0"
          >
            {TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-9 w-auto flex-none justify-start gap-2 rounded-lg px-2.5 text-[0.72rem] font-medium text-muted-foreground after:hidden hover:bg-muted/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.05)] sm:w-full"
              >
                <HugeiconsIcon
                  icon={item.icon}
                  strokeWidth={1.8}
                  className="size-4"
                />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1 bg-background">
            {TABS.map((item) => (
              <TabsContent
                key={item.value}
                value={item.value}
                className="h-full min-h-0 overflow-hidden"
              >
                <ScrollArea className="h-full">
                  <div className="mx-auto max-w-[38rem] p-3.5">
                    {item.render()}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
