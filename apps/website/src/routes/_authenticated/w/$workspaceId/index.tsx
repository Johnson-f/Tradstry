import { createFileRoute, Link } from '@tanstack/react-router'
import { BrokerageAttentionBanner } from '@/components/brokerage/attention-banner'
import { BrokerageError } from '@/components/brokerage/feedback'
import { panelClass } from '@/components/brokerage/styles'
import { useBrokerageStatus, useSyncStatus } from '@/lib/client/brokerage/brokerage'
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

  // Brokerage details are opened from the workspace menu's View action.
  if (loading || sync.data) return null

  return (
    <div className="mx-auto w-full max-w-240 space-y-6 pt-2 pb-10 sm:pt-3">
      <BrokerageAttentionBanner />
      <h1 className="text-lg font-semibold break-words">{workspace?.name ?? 'Dashboard'}</h1>
      {sync.isError ? (
        <BrokerageError
          message="Could not load this workspace."
          retry={() => void sync.refetch()}
          pending={sync.isFetching}
        />
      ) : (
        <p className={`${panelClass} px-5 py-4 text-[13px] text-muted-foreground`}>
          This workspace is for trades you log yourself.
          {brokerageAvailable && (
            <>
              {' '}
              <Link to="/brokerage/connections" className="text-foreground underline underline-offset-4">
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
