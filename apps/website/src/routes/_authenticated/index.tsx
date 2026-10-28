import { createFileRoute, redirect } from '@tanstack/react-router'
import { workspacesQuery } from '@/lib/client/workspaces'
import { pickWorkspace, rememberedWorkspace } from '@/lib/workspace'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.fetchQuery({ ...workspacesQuery, staleTime: 60_000 })
    const workspaceId = pickWorkspace(workspaces, rememberedWorkspace())
    if (workspaceId) throw redirect({ to: '/w/$workspaceId', params: { workspaceId }, replace: true })
  },
  component: NoWorkspace,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Could not reach the Tradstry API. Refresh to try again.
    </p>
  ),
})

function NoWorkspace() {
  return <p className="text-sm text-muted-foreground">You have no workspaces. Create one in Settings.</p>
}
