import { type OAuthAuthorizeParams, useStytch, useStytchUser } from '@stytch/react'
import { Check, LoaderCircle, MonitorSmartphone, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type Permission, appIcons, permissions, returnTarget } from '@/lib/auth/consent'
import { userEmail } from '@/lib/auth/stytch'

type Screen =
  | { kind: 'loading' }
  | { kind: 'consent'; appName: string; icons: string[]; grants: Permission[]; unavailable: boolean }
  | { kind: 'sending'; granted: boolean }
  | { kind: 'error'; message: string }

function errorMessage(error: unknown): string {
  const message = (error as { error_message?: unknown } | null)?.error_message
  return typeof message === 'string' && message ? message : 'This connection request could not be checked.'
}

/** The app's icon, trying each candidate in turn; its initial if none loads. */
function AppMark({ name, icons }: { name: string; icons: string[] }) {
  const [attempt, setAttempt] = useState(0)
  const icon = icons[attempt]
  return (
    <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-lg font-semibold">
      {icon ? (
        <img
          src={icon}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setAttempt((current) => current + 1)}
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6 font-[Arial,Helvetica,sans-serif]">
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}

/**
 * Tradstry's consent screen for Connected Apps such as Claude and ChatGPT,
 * built on Stytch's headless IdP calls so it looks like the rest of the app.
 * It follows Stytch's own flow: check the request, ask only when consent is
 * required, then send the user back to the app with the result.
 */
export function ConsentScreen({
  request,
  requestError,
  onSwitchAccount,
}: {
  request: OAuthAuthorizeParams
  requestError: string | null
  onSwitchAccount: () => void
}) {
  const stytch = useStytch()
  const { user } = useStytchUser()
  const [screen, setScreen] = useState<Screen>(() =>
    requestError ? { kind: 'error', message: requestError } : { kind: 'loading' },
  )

  const submit = useCallback(
    async (granted: boolean) => {
      setScreen({ kind: 'sending', granted })
      try {
        const response = await stytch.idp.oauthAuthorizeSubmit({ ...request, consent_granted: granted })
        window.location.href = response.redirect_uri
      } catch (error) {
        setScreen({ kind: 'error', message: errorMessage(error) })
      }
    },
    [stytch, request],
  )

  useEffect(() => {
    if (requestError) return
    let cancelled = false
    stytch.idp
      .oauthAuthorizeStart(request)
      .then((start) => {
        if (cancelled) return
        if (!start.consent_required) {
          void submit(false)
          return
        }
        setScreen({
          kind: 'consent',
          appName: start.client.client_name || 'An app',
          icons: appIcons(start.client),
          grants: permissions(start.scope_results.filter((result) => result.is_grantable)),
          unavailable: start.scope_results.some((result) => !result.is_grantable),
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setScreen({ kind: 'error', message: errorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [stytch, request, requestError, submit])

  if (screen.kind === 'error') {
    return (
      <Frame>
        <div className="rounded-2xl border bg-card p-8 text-center shadow-xs">
          <h1 className="text-xl font-semibold tracking-tight">Can’t connect this app</h1>
          <p role="alert" className="mt-2 text-sm leading-6 text-muted-foreground">
            {screen.message} Start the connection again from the app.
          </p>
        </div>
      </Frame>
    )
  }

  if (screen.kind === 'loading') {
    return (
      <Frame>
        <div role="status" aria-label="Checking the connection request" className="rounded-2xl border bg-card p-8 shadow-xs">
          <div className="flex justify-center gap-3">
            <Skeleton className="size-12 rounded-xl" />
            <Skeleton className="size-12 rounded-xl" />
          </div>
          <Skeleton className="mx-auto mt-6 h-6 w-2/3" />
          <Skeleton className="mx-auto mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-28 w-full rounded-xl" />
          <Skeleton className="mt-6 h-10 w-full" />
        </div>
      </Frame>
    )
  }

  if (screen.kind === 'sending') {
    return (
      <Frame>
        <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-xs">
          <LoaderCircle className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {screen.granted ? 'Connecting… you’ll be sent back to the app.' : 'Sending you back to the app…'}
          </p>
        </div>
      </Frame>
    )
  }

  const target = returnTarget(request.redirect_uri)
  const email = userEmail(user)

  return (
    <Frame>
      <div className="rounded-2xl border bg-card p-8 shadow-xs">
        <div className="flex items-center justify-center gap-3" aria-hidden>
          <img src="/favicon.svg" alt="" className="size-12 rounded-xl" />
          <span className="flex gap-1">
            <span className="size-1 rounded-full bg-muted-foreground/40" />
            <span className="size-1 rounded-full bg-muted-foreground/40" />
            <span className="size-1 rounded-full bg-muted-foreground/40" />
          </span>
          <AppMark name={screen.appName} icons={screen.icons} />
        </div>

        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight text-balance">
          Connect {screen.appName} to Tradstry
        </h1>
        {email && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span> ·{' '}
            <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={onSwitchAccount}>
              Not you?
            </button>
          </p>
        )}

        <section aria-labelledby="consent-grants" className="mt-7 rounded-xl border bg-muted/30">
          <h2 id="consent-grants" className="px-4 pt-3.5 text-xs font-medium text-muted-foreground">
            {screen.appName} will be able to
          </h2>
          <ul className="divide-y divide-border/70">
            {screen.grants.map((grant) => (
              <li key={grant.title} className="flex gap-3 px-4 py-3">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{grant.title}</p>
                  {grant.detail && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{grant.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {screen.unavailable && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            It also asked for permissions your account doesn’t have; those won’t be granted.
          </p>
        )}

        {target && (
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            {target.local ? (
              <MonitorSmartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            ) : (
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            )}
            <span>
              {target.local ? (
                <>
                  You’ll return to an app running on this computer (
                  <span className="font-medium text-foreground">{target.host}</span>). Only allow it if you just started
                  this connection yourself.
                </>
              ) : (
                <>
                  You’ll return to <span className="font-medium text-foreground">{target.host}</span>.
                </>
              )}
            </span>
          </p>
        )}

        <div className="mt-7 grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="h-10" onClick={() => void submit(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-10" autoFocus onClick={() => void submit(true)}>
            Allow access
          </Button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
        Only connect apps you trust. Tradstry never shares your password.
      </p>
    </Frame>
  )
}
