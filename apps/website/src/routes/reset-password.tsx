import { Products, StytchPasswordReset, useStytch } from '@stytch/react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { presentation } from '@/components/auth/presentation'
import { takeReturnTo } from '@/lib/auth/auth-redirect'
import { SESSION_DURATION_MINUTES } from '@/lib/auth/stytch'

export const Route = createFileRoute('/reset-password')({
  component: ResetPassword,
})

const config = {
  products: [Products.passwords],
  sessionOptions: { sessionDurationMinutes: SESSION_DURATION_MINUTES },
}

function ResetPassword() {
  const stytch = useStytch()
  const router = useRouter()
  const token = useMemo(
    () => stytch.parseAuthenticateUrl()?.token ?? null,
    [stytch],
  )

  if (!token) {
    return (
      <AuthShell
        title="Reset your password"
        description="This reset link is missing or not valid."
      >
        <Link to="/sign-in" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Choose a new password">
      <StytchPasswordReset
        config={config}
        presentation={presentation}
        passwordResetToken={token}
        callbacks={{
          onEvent: ({ type }) => {
            if (type === 'PASSWORD_RESET_BY_EMAIL') {
              router.history.replace(takeReturnTo())
            }
          },
        }}
      />
    </AuthShell>
  )
}
