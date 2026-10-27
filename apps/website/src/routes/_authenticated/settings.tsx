import { createFileRoute } from '@tanstack/react-router'
import { DevicesCard } from '@/components/account/devices-card'

export const Route = createFileRoute('/_authenticated/settings')({
  component: Settings,
})

function Settings() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <DevicesCard />
    </div>
  )
}
