"use client";

import {
  DatabaseExportIcon,
  Mail01Icon,
  Notification02Icon,
  SecurityCheckIcon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useUser } from "@clerk/nextjs";
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
  DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tradstry/app-ui/components/ui/tabs";
import { useIsMobile } from "@tradstry/app-ui/hooks/use-mobile";

const TABS = [
  {
    value: "profile",
    label: "Profile",
    description: "Choose how you appear in Tradstry.",
    icon: UserCircle02Icon,
    render: () => <ProfileSection />,
  },
  {
    value: "email",
    label: "Email",
    description: "Manage your sign-in and contact email addresses.",
    icon: Mail01Icon,
    render: () => <EmailSection />,
  },
  {
    value: "notifications",
    label: "Notifications",
    description: "Choose what you hear about and when.",
    icon: Notification02Icon,
    render: () => <NotificationsSection />,
  },
  {
    value: "security",
    label: "Security",
    description: "Passwords, connected accounts, and active devices.",
    icon: SecurityCheckIcon,
    render: () => <SecuritySection />,
  },
  {
    value: "danger",
    label: "Data & privacy",
    description: "Export your information or permanently close the account.",
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
  const isMobile = useIsMobile();
  const { user } = useUser();
  const active = TABS.find((item) => item.value === tab) ?? TABS[0];
  const fullName = user?.fullName ?? "Tradstry account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(36rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[52rem]">
        <header className="shrink-0 border-b px-5 py-4 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-base font-semibold tracking-tight">Settings</DialogTitle>
          <DialogDescription className="mt-1 truncate text-xs" title={email || fullName}>
            {email || fullName}
          </DialogDescription>
        </header>
        <Tabs
          value={tab}
          onValueChange={setTab}
          orientation={isMobile ? "horizontal" : "vertical"}
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden md:flex-row"
        >
          <aside className="w-full shrink-0 overflow-hidden border-b bg-muted/20 md:w-44 md:border-r md:border-b-0">
            <TabsList
              variant="line"
              aria-label="Settings sections"
              className="h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none p-2 group-data-horizontal/tabs:h-auto md:flex-col md:p-3"
            >
              {TABS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-9 w-auto flex-none justify-start gap-2 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors after:hidden hover:bg-muted/70 data-[state=active]:!bg-muted data-[state=active]:!text-foreground data-[state=active]:shadow-none md:w-full"
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="shrink-0 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
              <h2 className="text-lg font-semibold tracking-tight">{active.label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{active.description}</p>
            </header>
            <div className="min-h-0 flex-1">
              {TABS.map((item) => (
                <TabsContent key={item.value} value={item.value} className="m-0 h-full min-h-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="px-5 pb-6 sm:px-6">{item.render()}</div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
