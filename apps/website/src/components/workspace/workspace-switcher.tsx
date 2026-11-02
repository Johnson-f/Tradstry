import { useNavigate } from '@tanstack/react-router'
import { MoreVerticalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronsUpDown, Landmark, Layers2, LoaderCircle, NotebookPen, Plus, Settings } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BrokerageAccountDialog } from '@/components/workspace/brokerage-account-dialog'
import { NewWorkspaceDialog } from '@/components/workspace/new-workspace-dialog'
import { useBrokerageConnections, useBrokerageStatus } from '@/lib/client/brokerage/brokerage'
import { useWorkspaces } from '@/lib/client/workspaces'
import { type WorkspaceSection, workspaceLocation } from '@/lib/navigation'
import { describeSource, workspaceSources } from '@/lib/workspace'

const menuItemClass =
  'min-h-9 gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground [&_svg]:text-muted-foreground'

export function WorkspaceSwitcher({
  workspaceId,
  section = 'journal',
}: {
  workspaceId?: string
  section?: WorkspaceSection
}) {
  const navigate = useNavigate()
  const workspaces = useWorkspaces()
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true, false)
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewing, setViewing] = useState<{ id: string; name: string; institutionName: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const list = workspaces.data ?? []
  const current = list.find((workspace) => workspace.id === workspaceId)
  const sources = workspaceSources(
    list.map((workspace) => workspace.id),
    status.data?.available === false ? undefined : connections.data,
  )
  const CurrentIcon = workspaceId && sources[workspaceId]?.kind === 'brokerage' ? Landmark : Layers2
  const groups = [
    { kind: 'manual', label: 'Manual workspaces' },
    { kind: 'brokerage', label: 'Brokerage workspaces' },
    { kind: 'unknown', label: null },
  ]
    .map((group) => ({
      ...group,
      items: list.filter((workspace) => (sources[workspace.id]?.kind ?? 'unknown') === group.kind),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <TooltipProvider delay={250}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          ref={triggerRef}
          aria-label={current ? `Workspace: ${current.name}. Switch workspace` : 'Choose workspace'}
          render={<Button variant="ghost" size="sm" />}
          className="-mx-2 h-8 min-w-0 max-w-60 cursor-pointer gap-2 rounded-lg px-2 text-sm font-medium transition-none data-popup-open:bg-muted"
        >
          <CurrentIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{current?.name ?? 'Workspace'}</span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          finalFocus={viewing || settingsOpen ? false : undefined}
          side="bottom"
          align="start"
          sideOffset={8}
          className="w-72 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl p-1.5 font-[Arial,Helvetica,sans-serif] shadow-lg ring-border data-open:animate-none data-closed:animate-none"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.isPending ? (
              <div
                role="status"
                className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground"
              >
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
              <ScrollArea className="max-h-64 overflow-hidden [&_[data-slot=scroll-area-viewport]]:max-h-[min(16rem,calc(var(--available-height)-8rem))] [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
                <DropdownMenuRadioGroup
                  value={workspaceId ?? ''}
                  onValueChange={(id: string) => {
                    if (id !== workspaceId) {
                      void navigate(workspaceLocation(id, section))
                    }
                  }}
                  className="space-y-1 pr-1.5"
                >
                  {groups.map((group, index) => (
                    <Fragment key={group.kind}>
                      {index > 0 && <Separator className="mx-1 my-2 data-horizontal:w-auto" />}
                      <DropdownMenuGroup>
                        {group.label && (
                          <DropdownMenuLabel className="px-2.5 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">
                            {group.label}
                          </DropdownMenuLabel>
                        )}
                        {group.items.map((workspace) => {
                          const source = sources[workspace.id]
                          const detail = describeSource(source)
                          const Icon =
                            source?.kind === 'brokerage'
                              ? Landmark
                              : source?.kind === 'manual'
                                ? NotebookPen
                                : Layers2

                          return (
                            <div
                              key={workspace.id}
                              className="group/workspace-row flex items-center gap-1 rounded-lg has-data-highlighted:bg-accent"
                            >
                              <DropdownMenuRadioItem
                                value={workspace.id}
                                label={workspace.name}
                                closeOnClick
                                showIndicator={false}
                                className="min-h-12 min-w-0 flex-1 gap-3 rounded-lg bg-transparent px-2.5 py-2 focus:bg-transparent data-checked:bg-transparent data-checked:text-accent-foreground"
                              >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
                                  <Icon className="size-4" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium" title={workspace.name}>
                                    {workspace.name}
                                  </span>
                                  {detail && (
                                    <span
                                      className="mt-0.5 block truncate text-xs text-muted-foreground"
                                      title={detail}
                                    >
                                      {detail}
                                    </span>
                                  )}
                                </span>
                              </DropdownMenuRadioItem>
                              {source?.kind === 'brokerage' && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <DropdownMenuItem
                                        nativeButton
                                        render={<Button variant="ghost" size="icon-sm" />}
                                        label={`View ${workspace.name}`}
                                        aria-label={`View ${workspace.name}`}
                                        className="pointer-events-none mr-1 size-7 shrink-0 justify-center rounded-md bg-transparent p-0 opacity-0 transition-none hover:bg-transparent focus:bg-transparent group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100 group-has-[:focus-visible]/workspace-row:pointer-events-auto group-has-[:focus-visible]/workspace-row:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                                        onClick={() => {
                                          setViewing({
                                            id: workspace.id,
                                            name: workspace.name,
                                            institutionName: source.institutionName,
                                          })
                                          setMenuOpen(false)
                                        }}
                                      />
                                    }
                                  >
                                    <HugeiconsIcon
                                      icon={MoreVerticalIcon}
                                      className="size-4"
                                      strokeWidth={1.5}
                                      aria-hidden
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    sideOffset={6}
                                    className="font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none"
                                  >
                                    View
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })}
                      </DropdownMenuGroup>
                    </Fragment>
                  ))}
                </DropdownMenuRadioGroup>
              </ScrollArea>
            )}
          </DropdownMenuGroup>
          <Separator className="mx-1 my-1.5 data-horizontal:w-auto" />
          <DropdownMenuGroup>
            <DropdownMenuItem className={menuItemClass} onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              New workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" aria-hidden />
              Manage workspaces
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} section={section} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab="workspaces"
        returnFocus={triggerRef}
      />
      {viewing && (
        <BrokerageAccountDialog
          key={viewing.id}
          workspace={viewing}
          onClose={() => setViewing(null)}
          returnFocus={triggerRef}
        />
      )}
    </TooltipProvider>
  )
}
