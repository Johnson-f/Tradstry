import { Switch } from '@base-ui/react/switch'
import { Tabs } from '@base-ui/react/tabs'
import { useStytchUser } from '@stytch/react'
import { useRouter } from '@tanstack/react-router'
import { Layers2, Search, Settings2, Tags, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { DevicesCard } from '@/components/account/devices-card'
import { JournalLabelsSettings } from '@/components/trades/labels-settings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspacesSettings } from '@/components/workspace/workspaces-settings'
import { userEmail, userFullName } from '@/lib/auth/stytch'
import { isDarkMode, setDarkMode } from '@/lib/theme'

export type SettingsTab = 'general' | 'workspaces' | 'journal' | 'you'

const sections = [
  {
    value: 'general',
    label: 'General',
    icon: Settings2,
    keywords: 'appearance theme dark light model referrals reviews',
  },
  {
    value: 'workspaces',
    label: 'Workspaces',
    icon: Layers2,
    keywords: 'brokerage accounts import manual rename delete',
  },
  { value: 'journal', label: 'Journal', icon: Tags, keywords: 'labels edges entry tactics tags mistakes' },
  {
    value: 'you',
    label: 'Account',
    icon: UserRound,
    keywords: 'profile name email devices sessions security sign out',
  },
] as const

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = 'general',
  tab,
  onTabChange,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: SettingsTab
  tab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
  returnFocus?: RefObject<HTMLButtonElement | null>
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open || tab !== undefined) return
    return router.subscribe('onResolved', ({ pathChanged }) => {
      if (pathChanged) onOpenChange(false)
    })
  }, [open, tab, router, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={title}
        finalFocus={returnFocus}
        overlayClassName="bg-black/40 data-open:animate-none data-closed:animate-none"
        className="flex h-[min(44rem,calc(100dvh-3rem))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-0 font-[Arial,Helvetica,sans-serif] shadow-2xl sm:max-w-5xl data-open:animate-none data-closed:animate-none [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4"
      >
        <DialogTitle ref={title} tabIndex={-1} className="sr-only">
          Settings
        </DialogTitle>
        <DialogDescription className="sr-only">
          Manage your preferences, workspaces, journal labels, and account.
        </DialogDescription>
        <SettingsContent initialTab={initialTab} tab={tab} onTabChange={onTabChange} />
      </DialogContent>
    </Dialog>
  )
}

function SettingsContent({
  initialTab,
  tab: controlledTab,
  onTabChange,
}: {
  initialTab: SettingsTab
  tab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
}) {
  const { user } = useStytchUser()
  const [darkMode, updateDarkMode] = useState(isDarkMode)
  const [selectedTab, setSelectedTab] = useState(initialTab)
  const [search, setSearch] = useState('')
  const tab = controlledTab ?? selectedTab
  const query = search.trim().toLocaleLowerCase()
  const visibleSections = sections.filter((section) =>
    `${section.label} ${section.keywords}`.toLocaleLowerCase().includes(query),
  )
  const activeTab = visibleSections.some((section) => section.value === tab) ? tab : visibleSections[0]?.value

  return (
    <Tabs.Root
      value={activeTab ?? null}
      orientation="vertical"
      onValueChange={(value: SettingsTab) => {
        setSelectedTab(value)
        onTabChange?.(value)
      }}
      className="flex min-h-0 min-w-0 flex-1 max-sm:flex-col"
    >
      <aside className="flex w-52 shrink-0 flex-col gap-3 border-r border-border/60 bg-muted/25 p-3 max-sm:w-full max-sm:border-r-0 max-sm:border-b max-sm:pr-14 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search settings"
            placeholder="Search settings"
            className="h-9 border-transparent bg-muted/70 pl-9 text-[13px] shadow-none"
          />
        </div>
        <Tabs.List
          aria-label="Settings sections"
          className="flex min-h-0 flex-col gap-1 overflow-y-auto max-sm:max-h-24 max-sm:flex-row max-sm:flex-wrap"
        >
          {visibleSections.map(({ value, label, icon: Icon }) => (
            <Tabs.Tab
              key={value}
              value={value}
              className="flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-muted data-active:font-medium data-active:text-foreground"
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={`shrink-0 px-5 pt-6 pb-5 pr-14 sm:pt-8 sm:pr-16 ${activeTab === 'journal' ? 'sm:pl-6' : 'sm:pl-8'}`}
        >
          <h2 className="text-xl font-semibold tracking-tight">
            {activeTab === 'journal'
              ? 'Journal labels'
              : (sections.find((section) => section.value === activeTab)?.label ?? 'Search settings')}
          </h2>
          {activeTab === 'journal' && (
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              Organize your edges, entry tactics, tags, and mistakes. Shared across workspaces.
            </p>
          )}
        </header>
        {activeTab === 'journal' ? (
          <Tabs.Panel value="journal" className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none">
            <JournalLabelsSettings layout="tabs" />
          </Tabs.Panel>
        ) : (
          <ScrollArea
            key={activeTab ?? 'empty'}
            className="min-h-0 flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-contain"
          >
            <div className="px-5 pb-8 sm:px-8">
              {!activeTab && (
                <div role="status" className="py-12 text-center">
                  <p className="text-sm font-medium">No settings found</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Try searching for appearance, workspaces, labels, or devices.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-3" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                </div>
              )}

              <Tabs.Panel value="general" className="space-y-7 outline-none">
                <section aria-labelledby="model-heading" className="space-y-2">
                  <h2 id="model-heading" className="text-[13px] font-medium">
                    Model <span className="ml-1.5 text-xs font-normal text-muted-foreground">Preview</span>
                  </h2>
                  <div className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:divide-white/10 dark:border-white/10">
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Claude · Anthropic</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          Model selection is not available yet.
                        </p>
                      </div>
                      <Button disabled size="sm" variant="secondary" className="h-7.5 px-3">
                        Change
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Your invite link</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">Referrals are not available yet.</p>
                      </div>
                      <Button disabled size="sm" variant="secondary" className="h-7.5 px-3">
                        Copy link
                      </Button>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="appearance-heading" className="space-y-2">
                  <h2 id="appearance-heading" className="text-[13px] font-medium">
                    Appearance
                  </h2>
                  <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-neutral-200/60 bg-card px-5 py-3 shadow-xs dark:border-white/10">
                    <label htmlFor="dark-mode" className="cursor-pointer text-sm">
                      Dark mode
                    </label>
                    <Switch.Root
                      id="dark-mode"
                      checked={darkMode}
                      onCheckedChange={(checked) => {
                        updateDarkMode(checked)
                        setDarkMode(checked)
                      }}
                      className="inline-flex h-5.5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-neutral-300 p-0.5 outline-offset-4 focus-visible:outline-2 data-checked:bg-neutral-900 dark:bg-neutral-600 dark:data-checked:bg-neutral-100"
                    >
                      <Switch.Thumb className="size-4.5 rounded-full bg-white shadow-sm data-checked:translate-x-3.5 dark:data-checked:bg-neutral-900" />
                    </Switch.Root>
                  </div>
                </section>

                <section aria-labelledby="running-heading" className="space-y-2">
                  <h2 id="running-heading" className="text-[13px] font-medium">
                    Running <span className="ml-1.5 text-xs font-normal text-muted-foreground">Preview</span>
                  </h2>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200/60 bg-card px-5 py-3.5 shadow-xs dark:border-white/10">
                    <div className="min-w-0">
                      <label htmlFor="pause-reviews" className="text-sm font-medium">
                        Pause reviews
                      </label>
                      <p id="pause-reviews-description" className="mt-0.5 text-[13px] text-muted-foreground">
                        Automated reviews are not available yet.
                      </p>
                    </div>
                    <Switch.Root
                      id="pause-reviews"
                      aria-describedby="pause-reviews-description"
                      disabled
                      checked={false}
                      className="inline-flex h-5.5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-neutral-300 p-0.5 opacity-50 dark:bg-neutral-600"
                    >
                      <Switch.Thumb className="size-4.5 rounded-full bg-white shadow-sm" />
                    </Switch.Root>
                  </div>
                </section>
              </Tabs.Panel>

              <Tabs.Panel value="workspaces" className="space-y-5 outline-none">
                <WorkspacesSettings />
              </Tabs.Panel>

              <Tabs.Panel value="you" className="space-y-5 outline-none">
                <section aria-labelledby="profile-heading" className="space-y-2">
                  <h2 id="profile-heading" className="text-[13px] font-medium">
                    Profile
                  </h2>
                  <dl className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:divide-white/10 dark:border-white/10">
                    <div className="px-5 py-3.5">
                      <dt className="text-[13px] text-muted-foreground">Name</dt>
                      <dd className="mt-0.5 text-sm break-words">{userFullName(user) || 'Not provided'}</dd>
                    </div>
                    <div className="px-5 py-3.5">
                      <dt className="text-[13px] text-muted-foreground">Email</dt>
                      <dd className="mt-0.5 text-sm break-words">{userEmail(user) || 'Not provided'}</dd>
                    </div>
                  </dl>
                </section>
                <DevicesCard />
              </Tabs.Panel>
            </div>
          </ScrollArea>
        )}
      </div>
    </Tabs.Root>
  )
}
