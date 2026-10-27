import { useStytch } from '@stytch/react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { takeReturnTo } from '@/lib/auth/auth-redirect'
import { SESSION_DURATION_MINUTES } from '@/lib/auth/stytch'

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
  const error = !handled
    ? 'This sign-in link is missing or invalid. Start again to continue.'
    : failed
      ? 'Your sign-in link may have expired or already been used. Start again to continue.'
      : null

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
        <div role="alert" className="flex flex-col gap-4">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
          <Button render={<Link to="/sign-in" />}>Back to sign in</Button>
        </div>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Signing you in…" description="Hang tight while we finish.">
      <LoaderCircle
        role="status"
        aria-label="Signing in"
        className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
    </AuthShell>
  )
}
