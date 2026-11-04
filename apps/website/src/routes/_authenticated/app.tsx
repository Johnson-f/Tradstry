import { createFileRoute, redirect } from '@tanstack/react-router'
import { WorkspaceLoadError } from '@/components/workspace/workspace-load-error'
import { workspacesQuery } from '@/lib/client/workspaces'
import { workspaceLocation } from '@/lib/navigation'
import { pickWorkspace, rememberedWorkspace } from '@/lib/workspace'

export const Route = createFileRoute('/_authenticated/app')({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.fetchQuery({ ...workspacesQuery, staleTime: 60_000 })
    const workspaceId = pickWorkspace(workspaces, rememberedWorkspace())
    if (workspaceId) throw redirect({ ...workspaceLocation(workspaceId, 'home'), replace: true })
  },
  component: () => null,
  errorComponent: WorkspaceLoadError,
})
