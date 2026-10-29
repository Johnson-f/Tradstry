import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useBrokerageConnections, useBrokerageStatus } from '@/lib/client/brokerage/brokerage'
import { connectionsNeedingAttention } from '@/lib/client/brokerage/brokerage-model'

export function BrokerageAttentionBanner() {
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true, false)
  const broken = connectionsNeedingAttention(connections.data ?? [])
  if (broken.length === 0) return null

  return (
    <Alert
      role="status"
      className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border-amber-500/20 bg-amber-500/5 p-4"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <AlertDescription className="min-w-0 flex-1">
        {broken.length === 1
          ? `${broken[0].institutionName} stopped syncing.`
          : `${broken.length} brokerages stopped syncing.`}
      </AlertDescription>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/brokerage/connections" />}>
        Review connection
      </Button>
    </Alert>
  )
}
