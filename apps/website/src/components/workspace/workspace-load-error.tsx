import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { workspacesQuery } from '@/lib/client/workspaces'

export function WorkspaceLoadError() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const retry = useMutation({
    mutationFn: async () => {
      // Keep the error screen visible until a fresh request succeeds, then
      // rerun the route so its normal workspace redirect can finish.
      await queryClient.fetchQuery({ ...workspacesQuery, staleTime: 0, retry: false })
      await router.invalidate({ sync: true })
    },
  })

  return (
    <section
      aria-labelledby="workspace-load-error-title"
      className="flex min-h-[calc(100dvh-9rem)] items-center justify-center py-8"
    >
      <Card className="w-full max-w-md gap-6 rounded-2xl p-8 text-center shadow-none ring-border/70 sm:p-10">
        <CardHeader role="alert" className="justify-items-center gap-4 p-0">
          <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted/30">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              className="size-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <div className="space-y-2">
            <h1 id="workspace-load-error-title" className="text-xl leading-7 font-semibold tracking-tight">
              Unable to load workspaces
            </h1>
            <CardDescription className="max-w-72 leading-6">
              {retry.isError
                ? 'Still unable to load. Please try again in a moment, or contact support.'
                : 'Please try again, or get help if this keeps happening.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col justify-center gap-2 p-0 sm:flex-row">
          <Button
            className="h-10 px-4 transition-none active:not-aria-[haspopup]:translate-y-0 sm:w-36"
            disabled={retry.isPending}
            aria-busy={retry.isPending}
            onClick={() => {
              if (!retry.isPending) retry.mutate()
            }}
          >
            {retry.isPending ? 'Trying again…' : 'Try again'}
          </Button>
          <Button
            variant="outline"
            className="h-10 px-4 transition-none active:not-aria-[haspopup]:translate-y-0 sm:w-32"
            nativeButton={false}
            render={<a href="https://tradstry.com/support" target="_blank" rel="noreferrer" />}
          >
            Get help
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
