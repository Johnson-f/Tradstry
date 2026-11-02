import { useStytch } from '@stytch/react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { takeReturnTo } from '@/lib/auth/auth-redirect'
import { SESSION_DURATION_MINUTES } from '@/lib/auth/stytch'

const STALLED_AFTER_MS = 20_000

export const Route = createFileRoute('/authenticate')({
  component: Authenticate,
})

/** Finishes Google and magic-link sign-in: Stytch redirects here with a token. */
function Authenticate() {
  const stytch = useStytch()
  const router = useRouter()
  const started = useRef(false)
  // Read once: authenticateByUrl strips the token from the URL as it starts.
  const [handled] = useState(() => !!stytch.parseAuthenticateUrl()?.handled)
  const [failed, setFailed] = useState(false)
  const [stalled, setStalled] = useState(false)
  const error = !handled
    ? 'This sign-in link is missing or invalid. Start again to continue.'
    : failed
      ? 'Your sign-in link may have expired or already been used. Start again to continue.'
      : stalled
        ? 'Signing in is taking longer than it should. Check your connection and start again.'
        : null

  useEffect(() => {
    if (!handled) return
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS)
    return () => clearTimeout(timer)
  }, [handled])

  useEffect(() => {
    // StrictMode mounts twice in development; a token is single use.
    if (!handled || started.current) return
    started.current = true

    stytch
      .authenticateByUrl({ session_duration_minutes: SESSION_DURATION_MINUTES })
      .then(() => router.history.replace(takeReturnTo()))
      .catch((cause: unknown) => {
        console.error('Stytch authenticate failed', cause)
        setFailed(true)
      })
  }, [stytch, router, handled])

  if (error) {
    return (
      <AuthShell title="We couldn't sign you in." description={error}>
        <div role="alert" className="flex flex-col items-center gap-4">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
          <Button className="w-full" render={<Link to="/sign-in" />}>
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Signing you in…" description="Hang tight while we finish.">
      <div className="flex justify-center">
        <LoaderCircle
          role="status"
          aria-label="Signing in"
          className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      </div>
    </AuthShell>
  )
}
