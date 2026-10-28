import { createFileRoute, Link } from '@tanstack/react-router'
import { BrokerageAttentionBanner } from '@/components/brokerage/attention-banner'
import { panelClass } from '@/components/brokerage/styles'
import { Skeleton } from '@/components/ui/skeleton'
import { BrokerageAccountView } from '@/components/workspace/brokerage-account-view'
import { useBrokerageStatus, useSyncStatus } from '@/lib/client/brokerage'
import { useWorkspaces } from '@/lib/client/workspaces'

export const Route = createFileRoute('/_authenticated/w/$workspaceId/')({
  component: WorkspaceDashboard,
})

function WorkspaceDashboard() {
  const { workspaceId } = Route.useParams()
  const workspaces = useWorkspaces()
  const status = useBrokerageStatus()
  const brokerageAvailable = status.data?.available === true
  const sync = useSyncStatus(workspaceId, brokerageAvailable)
  const workspace = workspaces.data?.find((item) => item.id === workspaceId)
  const loading = status.isPending || (brokerageAvailable && sync.isPending)

  return (
    <div className="mx-auto w-full max-w-240 space-y-6 pt-2 pb-10 sm:pt-3">
      <BrokerageAttentionBanner />
      <h1 className="text-lg font-semibold break-words">{workspace?.name ?? 'Dashboard'}</h1>
      {loading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : sync.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load this workspace.
        </p>
      ) : sync.data ? (
        <BrokerageAccountView workspaceId={workspaceId} sync={sync.data} />
      ) : (
        <p className={`${panelClass} px-5 py-4 text-[13px] text-muted-foreground`}>
          This workspace is for trades you log yourself.
          {brokerageAvailable && (
            <>
              {' '}
              <Link to="/brokerage" className="text-foreground underline underline-offset-4">
                Connect a brokerage
              </Link>{' '}
              to import an account into its own workspace.
            </>
          )}
        </p>
      )}
    </div>
  )
}
