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
import { Avatar, AvatarFallback, AvatarImage } from "@tradstry/app-ui/components/ui/avatar";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tradstry/app-ui/components/ui/tabs";

const TABS = [
  {
    value: "profile",
    label: "Profile",
    description: "Your public identity across Tradstry.",
    group: "Account",
    icon: UserCircle02Icon,
    render: () => <ProfileSection />,
  },
  {
    value: "email",
    label: "Email",
    description: "Choose where sign-in codes and account notices arrive.",
    group: "Account",
    icon: Mail01Icon,
    render: () => <EmailSection />,
  },
  {
    value: "notifications",
    label: "Notifications",
    description: "Decide which trading events deserve your attention.",
    group: "Preferences",
    icon: Notification02Icon,
    render: () => <NotificationsSection />,
  },
  {
    value: "security",
    label: "Security",
    description: "Passwords, connected accounts, and active devices.",
    group: "Access",
    icon: SecurityCheckIcon,
    render: () => <SecuritySection />,
  },
  {
    value: "danger",
    label: "Data & privacy",
    description: "Export your information or permanently close the account.",
    group: "Data",
    icon: DatabaseExportIcon,
    render: () => (
      <div className="grid gap-4">
        <ExportSection />
        <DangerSection />
      </div>
    ),
  },
] as const;

const GROUPS = ["Account", "Preferences", "Access", "Data"] as const;

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = React.useState<string>("profile");
  const { user } = useUser();
  const active = TABS.find((item) => item.value === tab) ?? TABS[0];
  const fullName = user?.fullName ?? "Tradstry account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    `${user?.firstName?.at(0) ?? ""}${user?.lastName?.at(0) ?? ""}`.toUpperCase() ||
    email.at(0)?.toUpperCase() ||
    "T";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(42rem,calc(100svh-1.5rem))] gap-0 overflow-hidden border-border/70 p-0 sm:max-w-[62rem]">
        <Tabs
          value={tab}
          onValueChange={setTab}
          orientation="vertical"
          className="flex h-full min-h-0 flex-col gap-0 overflow-hidden sm:flex-row"
        >
          <aside className="flex w-full shrink-0 flex-col border-b border-border/60 bg-muted/25 sm:h-full sm:w-[15.5rem] sm:border-r sm:border-b-0">
            <div className="border-b border-border/60 p-4 pr-12 sm:p-5 sm:pr-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em]">
                Settings
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                Your Tradstry account control center.
              </DialogDescription>

              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80 p-3">
                <Avatar className="size-10 border border-border/50">
                  <AvatarImage src={user?.imageUrl} alt="" />
                  <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-[-0.01em]">{fullName}</p>
                  <p className="truncate text-[0.68rem] text-muted-foreground">{email}</p>
                </div>
              </div>
            </div>

            <TabsList
              variant="line"
              aria-label="Settings sections"
              className="h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-2 sm:flex-1 sm:flex-col sm:justify-start sm:overflow-y-auto sm:p-3"
            >
              {GROUPS.map((group) => (
                <React.Fragment key={group}>
                  <p className="mt-3 hidden px-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 first:mt-0 sm:block">
                    {group}
                  </p>
                  {TABS.filter((item) => item.group === group).map((item) => (
                    <TabsTrigger
                      key={item.value}
                      value={item.value}
                      className="group h-9 w-auto flex-none justify-start gap-2 rounded-lg px-2.5 text-[0.72rem] font-medium text-muted-foreground after:hidden hover:bg-background/70 hover:text-foreground data-[state=active]:!bg-foreground data-[state=active]:!text-background sm:w-full"
                    >
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={1.9}
                        className="size-4"
                      />
                      {item.label}
                    </TabsTrigger>
                  ))}
                </React.Fragment>
              ))}
            </TabsList>

          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-background">
            <header className="relative shrink-0 border-b border-border/60 px-5 py-4 pr-12 sm:px-7 sm:py-5 sm:pr-14">
              <span className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-foreground/25" />
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
                  <HugeiconsIcon icon={active.icon} strokeWidth={1.9} className="size-[1.05rem]" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.025em]">{active.label}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{active.description}</p>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1">
              {TABS.map((item) => (
                <TabsContent
                  key={item.value}
                  value={item.value}
                  className="h-full min-h-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-1 data-[state=active]:duration-200 motion-reduce:animate-none"
                >
                  <ScrollArea className="h-full">
                    <div className="mx-auto max-w-[44rem] p-4 sm:p-6">
                      {item.render()}
                    </div>
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
