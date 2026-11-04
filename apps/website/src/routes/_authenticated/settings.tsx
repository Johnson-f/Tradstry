import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SettingsDialog, type SettingsTab } from '@/components/settings/settings-dialog'

const TABS = ['general', 'workspaces', 'journal', 'you'] as const

export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
    TABS.includes(search.tab as SettingsTab) && search.tab !== 'general' ? { tab: search.tab as SettingsTab } : {},
  component: Settings,
})

function Settings() {
  const { tab = 'general' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <SettingsDialog
      open
      tab={tab}
      onTabChange={(value) => void navigate({ search: value === 'general' ? {} : { tab: value }, replace: true })}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: '/app', replace: true })
      }}
    />
  )
}
