import { createFileRoute, redirect } from '@tanstack/react-router'
import { WorkspaceLoadError } from '@/components/workspace/workspace-load-error'
import { workspacesQuery } from '@/lib/client/workspaces'
import { workspaceLocation } from '@/lib/navigation'
import { pickWorkspace, rememberedWorkspace } from '@/lib/workspace'

// Keep existing Journal links working by opening the last available workspace.
export const Route = createFileRoute('/_authenticated/brokerage/')({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.fetchQuery({ ...workspacesQuery, staleTime: 60_000 })
    const workspaceId = pickWorkspace(workspaces, rememberedWorkspace())
    if (workspaceId) throw redirect({ ...workspaceLocation('journal', workspaceId), replace: true })
  },
  component: () => null,
  errorComponent: WorkspaceLoadError,
})
