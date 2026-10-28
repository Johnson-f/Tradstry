import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { workspaceErrorMessage } from '@/components/workspace/errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateWorkspace } from '@/lib/client/workspaces'

export function NewWorkspaceDialog({
  open,
  onOpenChange,
  navigateAfterCreate = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  navigateAfterCreate?: boolean
}) {
  const navigate = useNavigate()
  const create = useCreateWorkspace()
  const [name, setName] = useState('')

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setName('')
      create.reset()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && create.isPending) return
        close(next)
      }}
    >
      <DialogContent
        showCloseButton={!create.isPending}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 font-[Arial,Helvetica,sans-serif] sm:max-w-md data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40">
            <NotebookPen className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-2">
            <DialogTitle className="font-[Arial,Helvetica,sans-serif] text-lg leading-6 font-semibold">
              New workspace
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Organize the trades you log yourself. Imported brokerage accounts get their own workspace.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedName = name.trim()
            if (!trimmedName || create.isPending) return
            create.mutate(trimmedName, {
              onSuccess: (workspace) => {
                close(false)
                if (navigateAfterCreate) {
                  void navigate({ to: '/w/$workspaceId', params: { workspaceId: workspace.id } })
                }
              },
            })
          }}
        >
          <div className="space-y-2.5">
            <Label htmlFor="new-workspace-name">
              Workspace name
            </Label>
            <Input
              id="new-workspace-name"
              name="workspaceName"
              value={name}
              maxLength={100}
              required
              autoFocus
              autoComplete="off"
              placeholder="e.g. Swing trading"
              disabled={create.isPending}
              aria-describedby={create.isError ? 'new-workspace-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (create.isError) create.reset()
              }}
              className="h-10 bg-background px-3"
            />
            {create.isError && (
              <p id="new-workspace-error" role="alert" className="text-sm text-destructive">
                {workspaceErrorMessage(create.error, 'Could not create the workspace.')}
              </p>
            )}
          </div>

          <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
            <DialogClose
              disabled={create.isPending}
              render={<Button type="button" variant="outline" className="h-9 px-4" />}
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              className="h-9 min-w-36 px-4"
              disabled={!name.trim() || create.isPending}
              aria-busy={create.isPending}
            >
              {create.isPending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
