import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, Landmark, Layers2, LoaderCircle, NotebookPen, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewWorkspaceDialog } from '@/components/workspace/new-workspace-dialog'
import { useBrokerageConnections, useBrokerageStatus } from '@/lib/client/brokerage'
import { useWorkspaces } from '@/lib/client/workspaces'
import { describeSource, workspaceSources } from '@/lib/workspace'

const menuItemClass =
  'min-h-9 gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground [&_svg]:text-muted-foreground'

export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate()
  const workspaces = useWorkspaces()
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true, false)
  const [creating, setCreating] = useState(false)

  const list = workspaces.data ?? []
  const current = list.find((workspace) => workspace.id === workspaceId)
  const sources = workspaceSources(
    list.map((workspace) => workspace.id),
    status.data?.available === false ? undefined : connections.data,
  )
  const CurrentIcon = sources[workspaceId]?.kind === 'brokerage' ? Landmark : Layers2

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Workspace: ${current?.name ?? 'loading'}. Switch workspace`}
          render={<Button variant="ghost" size="sm" />}
          className="-mx-2 h-8 min-w-0 max-w-60 cursor-pointer gap-2 rounded-lg px-2 text-sm font-medium transition-none data-popup-open:bg-muted"
        >
          <CurrentIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{current?.name ?? 'Workspace'}</span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="w-72 max-w-[calc(100vw-24px)] rounded-xl p-1.5 font-[Arial,Helvetica,sans-serif] shadow-lg ring-border data-open:animate-none data-closed:animate-none"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.isPending ? (
              <div role="status" className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Loading workspaces…
              </div>
            ) : workspaces.isError && list.length === 0 ? (
              <div role="alert" className="space-y-2 px-2.5 py-3">
                <p className="text-sm text-muted-foreground">Couldn’t load your workspaces.</p>
                <DropdownMenuItem
                  className="min-h-8 rounded-md px-2 text-sm font-medium"
                  closeOnClick={false}
                  disabled={workspaces.isFetching}
                  onClick={() => void workspaces.refetch()}
                >
                  Try again
                </DropdownMenuItem>
              </div>
            ) : list.length === 0 ? (
              <p className="px-2.5 py-3 text-sm text-muted-foreground">No workspaces yet.</p>
            ) : (
              <DropdownMenuRadioGroup
                value={workspaceId}
                onValueChange={(id: string) => {
                  if (id !== workspaceId) {
                    void navigate({ to: '/w/$workspaceId', params: { workspaceId: id } })
                  }
                }}
                className="max-h-64 space-y-1 overflow-y-auto overscroll-contain"
              >
                {list.map((workspace) => {
                  const source = sources[workspace.id]
                  const detail = describeSource(source)
                  const Icon = source?.kind === 'brokerage'
                    ? Landmark
                    : source?.kind === 'manual' ? NotebookPen : Layers2

                  return (
                    <DropdownMenuRadioItem
                      key={workspace.id}
                      value={workspace.id}
                      label={workspace.name}
                      closeOnClick
                      className="min-h-12 gap-3 rounded-lg py-2 pr-8 pl-2.5 data-checked:bg-accent/70 data-checked:text-accent-foreground"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" title={workspace.name}>
                          {workspace.name}
                        </span>
                        {detail && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={detail}>
                            {detail}
                          </span>
                        )}
                      </span>
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="mx-1 my-1.5" />
          <DropdownMenuGroup>
            <DropdownMenuItem className={menuItemClass} onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              New workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => void navigate({ to: '/settings', search: { tab: 'workspaces' } })}
            >
              <Settings className="size-4" aria-hidden />
              Manage workspaces
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
