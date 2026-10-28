import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { useBrokerageConnections, useBrokerageStatus } from '@/lib/client/brokerage'
import { connectionsNeedingAttention } from '@/lib/client/brokerage-model'

export function BrokerageAttentionBanner() {
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true, false)
  const broken = connectionsNeedingAttention(connections.data ?? [])
  if (broken.length === 0) return null

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {broken.length === 1
          ? `${broken[0].institutionName} stopped syncing.`
          : `${broken.length} brokerages stopped syncing.`}
      </p>
      <Link to="/brokerage" className="shrink-0 font-medium underline underline-offset-4">
        Fix it
      </Link>
    </div>
  )
}
