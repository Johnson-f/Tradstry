import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Monitor, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type AuthSession,
  describeUserAgent,
  lastActive,
} from '@/components/account/devices'
import { GraphQLRequestError } from '@/lib/client/api'
import { graphql } from '@/lib/client/backend'
import { useSignOut } from '@/lib/auth/use-sign-out'

const SESSIONS_KEY = ['authSessions']

export function DevicesCard() {
  const queryClient = useQueryClient()
  const signOut = useSignOut(queryClient)
  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () =>
      graphql<{ authSessions: AuthSession[] }>(
        'query AuthSessions { authSessions { id lastAccessedAt ipAddress userAgent current } }',
      ),
    select: (data) => data.authSessions,
  })
  const revoke = useMutation({
    mutationFn: (id: string) =>
      graphql('mutation Revoke($id: String!) { revokeAuthSession(id: $id) }', {
        id,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
  const needsReauth =
    revoke.error instanceof GraphQLRequestError &&
    revoke.error.code === 'REAUTH_REQUIRED'

  return (
    <section aria-labelledby="devices-heading" className="space-y-2">
      <h2 id="devices-heading" className="text-[13px] font-medium">Active devices</h2>
      <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:border-white/10">
        <p className="border-b border-neutral-200/60 px-5 py-3.5 text-[13px] text-muted-foreground dark:border-white/10">
          Everywhere you're currently signed in.
        </p>
        {revoke.isError && (
          <p role="alert" className="px-5 py-3 text-sm text-destructive">
            {needsReauth ? (
              <>
                For your security, sign in again before signing out other
                devices.{' '}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void signOut('/settings')}
                >
                  Sign in again
                </button>
              </>
            ) : (
              'Could not sign out that device. Try again.'
            )}
          </p>
        )}
        {sessions.isPending ? (
          <div className="grid gap-2 px-5 py-3">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : sessions.isError ? (
          <p role="alert" className="px-5 py-3 text-sm text-destructive">
            Could not load your devices: {sessions.error.message}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200/60 dark:divide-white/10">
            {sessions.data.map((item) => (
              <DeviceRow
                key={item.id}
                session={item}
                pending={revoke.isPending && revoke.variables === item.id}
                onRevoke={() => revoke.mutate(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function DeviceRow({
  session,
  pending,
  onRevoke,
}: {
  session: AuthSession
  pending: boolean
  onRevoke: () => void
}) {
  const device = describeUserAgent(session.userAgent)
  const Icon = device.isMobile ? Smartphone : Monitor
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{device.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {session.ipAddress ?? 'Unknown location'} ·{' '}
          {lastActive(session.lastAccessedAt)}
        </p>
      </div>
      {session.current ? (
        <Badge variant="secondary">This device</Badge>
      ) : pending ? (
        <LoaderCircle
          className="mx-2 size-4 animate-spin text-muted-foreground"
          aria-label="Signing out"
        />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRevoke}
          className="text-muted-foreground hover:text-destructive"
        >
          Sign out
        </Button>
      )}
    </li>
  )
}
