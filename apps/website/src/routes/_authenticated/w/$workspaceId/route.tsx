import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { workspacesQuery } from '@/lib/client/workspaces'
import { rememberWorkspace } from '@/lib/workspace'
import { workspaceLocation, workspaceSection } from '@/lib/navigation'

export const Route = createFileRoute('/_authenticated/w/$workspaceId')({
  // fetchQuery, not ensureQueryData, so a workspace deleted since the list was
  // cached (its query invalidated) is caught here instead of rendering.
  loader: async ({ context, params, location }) => {
    const workspaces = await context.queryClient.fetchQuery({ ...workspacesQuery, staleTime: 60_000 })
    if (!workspaces.some((workspace) => workspace.id === params.workspaceId)) {
      throw redirect({ ...workspaceLocation(workspaceSection(location.pathname)), replace: true })
    }
  },
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams()
  useEffect(() => rememberWorkspace(workspaceId), [workspaceId])
  return <Outlet />
}
