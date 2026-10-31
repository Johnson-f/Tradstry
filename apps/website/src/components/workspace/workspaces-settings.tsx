import { Link } from '@tanstack/react-router'
import { Landmark, Layers2, LoaderCircle, MoreHorizontal, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { workspaceErrorMessage } from '@/components/workspace/errors'
import { NewWorkspaceDialog } from '@/components/workspace/new-workspace-dialog'
import { useBrokerageConnections, useBrokerageStatus } from '@/lib/client/brokerage/brokerage'
import {
  type Workspace,
  useDeleteWorkspace,
  useRenameWorkspace,
  useWorkspaces,
} from '@/lib/client/workspaces'
import { formatDate } from '@/lib/format'
import { type WorkspaceSource, describeSource, workspaceSources } from '@/lib/workspace'

export function WorkspacesSettings() {
  const workspaces = useWorkspaces()
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true, false)
  const [creating, setCreating] = useState(false)
  const list = workspaces.data ?? []
  const sources = workspaceSources(
    list.map((workspace) => workspace.id),
    status.data?.available === false ? undefined : connections.data,
  )

  return (
    <section aria-labelledby="workspaces-heading" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <h2 id="workspaces-heading" className="text-lg font-semibold tracking-tight">Workspaces</h2>
            {!workspaces.isPending && list.length > 0 && (
              <Badge variant="secondary" className="min-w-6 justify-center tabular-nums">
                {list.length}
              </Badge>
            )}
          </div>
          <p className="max-w-100 text-sm leading-relaxed text-muted-foreground">
            Organize your manual trades and imported brokerage accounts.
          </p>
        </div>
        <Button className="h-9 shrink-0 self-start px-3" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          New workspace
        </Button>
      </div>

      {workspaces.isPending ? (
        <Card className="gap-0 py-0">
          <CardContent role="status" className="space-y-4 p-5">
            <span className="sr-only">Loading workspaces…</span>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3" aria-hidden>
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-36 max-w-full" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : workspaces.isError && list.length === 0 ? (
        <Card>
          <CardContent role="alert" className="space-y-3">
            <p className="text-sm text-muted-foreground">Couldn’t load your workspaces. Please try again.</p>
            <Button variant="outline" disabled={workspaces.isFetching} onClick={() => void workspaces.refetch()}>
              {workspaces.isFetching && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <Layers2 className="mb-2 size-7 text-muted-foreground" aria-hidden />
            <h3 className="font-medium">No workspaces yet</h3>
            <p className="text-sm text-muted-foreground">Create a workspace to start organizing your trades.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            <ul aria-label="Your workspaces" className="divide-y divide-border/70">
              {list.map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  source={sources[workspace.id]}
                  canDelete={list.length > 1}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} navigateAfterCreate={false} />
    </section>
  )
}

function WorkspaceRow({
  workspace,
  source,
  canDelete,
}: {
  workspace: Workspace
  source: WorkspaceSource | undefined
  canDelete: boolean
}) {
  const rename = useRenameWorkspace()
  const remove = useDeleteWorkspace()
  const [draft, setDraft] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const created = formatDate(workspace.createdAt)
  const detail = describeSource(source) ?? (created !== '—' ? `Created ${created}` : null)
  const Icon = source?.kind === 'brokerage' ? Landmark : source?.kind === 'manual' ? NotebookPen : Layers2

  return (
    <li className="space-y-3 px-4 py-4 sm:px-5">
      {draft === null ? (
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
            <Icon className="size-4.5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to="/w/$workspaceId/journal"
              params={{ workspaceId: workspace.id }}
              title={workspace.name}
              className="block truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {workspace.name}
            </Link>
            {detail && <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>{detail}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${workspace.name}`}
              render={<Button variant="ghost" size="icon" />}
              className="shrink-0 text-muted-foreground"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="min-h-9 gap-2.5 px-2"
                  onClick={() => {
                    rename.reset()
                    setDraft(workspace.name)
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  className="min-h-9 gap-2.5 px-2"
                  onClick={() => {
                    remove.reset()
                    setDeleting(true)
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span>
                    Delete workspace
                    {!canDelete && <span className="block text-xs font-normal">Keep at least one workspace</span>}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedName = draft.trim()
            if (!trimmedName || trimmedName === workspace.name || rename.isPending) return
            rename.mutate({ id: workspace.id, name: trimmedName }, { onSuccess: () => setDraft(null) })
          }}
        >
          <Label htmlFor={`rename-${workspace.id}`}>Workspace name</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`rename-${workspace.id}`}
              value={draft}
              maxLength={100}
              required
              autoFocus
              disabled={rename.isPending}
              aria-describedby={rename.isError ? `rename-error-${workspace.id}` : undefined}
              onChange={(event) => {
                setDraft(event.target.value)
                if (rename.isError) rename.reset()
              }}
              className="h-9 min-w-0 flex-1"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                className="h-9 px-3"
                disabled={!draft.trim() || draft.trim() === workspace.name || rename.isPending}
              >
                {rename.isPending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                {rename.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                disabled={rename.isPending}
                onClick={() => {
                  setDraft(null)
                  rename.reset()
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      )}
      {rename.isError && (
        <p id={`rename-error-${workspace.id}`} role="alert" className="text-sm text-destructive">
          {workspaceErrorMessage(rename.error, 'Could not rename the workspace.')}
        </p>
      )}

      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (remove.isPending) return
          setDeleting(open)
          if (!open) remove.reset()
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-[Arial,Helvetica,sans-serif]">Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed break-words">
              “{workspace.name}” will be permanently deleted. This cannot be undone.
              {source?.kind === 'brokerage' && ' The brokerage account stays connected, but has no workspace until you import it again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && (
            <p role="alert" className="text-sm text-destructive">
              {workspaceErrorMessage(remove.error, 'Could not delete the workspace.')}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canDelete || remove.isPending}
              aria-busy={remove.isPending}
              onClick={() => {
                if (!canDelete || remove.isPending) return
                remove.mutate(workspace.id, { onSuccess: () => setDeleting(false) })
              }}
            >
              {remove.isPending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {remove.isPending ? 'Deleting…' : 'Delete workspace'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
