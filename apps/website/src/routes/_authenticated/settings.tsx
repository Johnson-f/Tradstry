import { Switch } from '@base-ui/react/switch'
import { Tabs } from '@base-ui/react/tabs'
import { useStytchUser } from '@stytch/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { DevicesCard } from '@/components/account/devices-card'
import { Button } from '@/components/ui/button'
import { tabClass, tabListClass } from '@/components/ui/tab-styles'
import { WorkspacesSettings } from '@/components/workspace/workspaces-settings'
import { userEmail, userFullName } from '@/lib/auth/stytch'
import { isDarkMode, setDarkMode } from '@/lib/theme'

const TABS = ['general', 'workspaces', 'you'] as const
type SettingsTab = (typeof TABS)[number]

export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
    TABS.includes(search.tab as SettingsTab) && search.tab !== 'general' ? { tab: search.tab as SettingsTab } : {},
  component: Settings,
})

function Settings() {
  const { user } = useStytchUser()
  const [darkMode, updateDarkMode] = useState(isDarkMode)
  const { tab = 'general' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="mx-auto w-full max-w-160 pt-2 pb-10 sm:pt-3">
      <h1 className="sr-only">Settings</h1>
      <Tabs.Root
        value={tab}
        onValueChange={(value: SettingsTab) =>
          void navigate({ search: value === 'general' ? {} : { tab: value }, replace: true })
        }
      >
        <Tabs.List aria-label="Settings" className={tabListClass}>
          <Tabs.Tab value="general" className={tabClass}>
            General
          </Tabs.Tab>
          <Tabs.Tab value="workspaces" className={tabClass}>
            Workspaces
          </Tabs.Tab>
          <Tabs.Tab value="you" className={tabClass}>
            You
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general" className="space-y-5 pt-5 outline-none">
          <section aria-labelledby="model-heading" className="space-y-2">
            <h2 id="model-heading" className="text-[13px] font-medium">
              Model <span className="ml-1.5 text-xs font-normal text-muted-foreground">Preview</span>
            </h2>
            <div className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:divide-white/10 dark:border-white/10">
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Claude · Anthropic</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Model selection is not available yet.</p>
                </div>
                <Button disabled size="sm" variant="secondary" className="h-7.5 px-3">Change</Button>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Your invite link</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Referrals are not available yet.</p>
                </div>
                <Button disabled size="sm" variant="secondary" className="h-7.5 px-3">Copy link</Button>
              </div>
            </div>
          </section>

          <section aria-labelledby="appearance-heading" className="space-y-2">
            <h2 id="appearance-heading" className="text-[13px] font-medium">Appearance</h2>
            <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-neutral-200/60 bg-card px-5 py-3 shadow-xs dark:border-white/10">
              <label htmlFor="dark-mode" className="cursor-pointer text-sm">Dark mode</label>
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
                <label htmlFor="pause-reviews" className="text-sm font-medium">Pause reviews</label>
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

        <Tabs.Panel value="workspaces" className="space-y-5 pt-5 outline-none">
          <WorkspacesSettings />
        </Tabs.Panel>

        <Tabs.Panel value="you" className="space-y-5 pt-5 outline-none">
          <section aria-labelledby="profile-heading" className="space-y-2">
            <h2 id="profile-heading" className="text-[13px] font-medium">Profile</h2>
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
      </Tabs.Root>
    </div>
  )
}
