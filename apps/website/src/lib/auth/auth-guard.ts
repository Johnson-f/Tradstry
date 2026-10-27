export interface AuthState {
  isSignedIn: boolean
}

export interface SignInRedirect {
  to: '/sign-in'
  search: { next: string }
}

/**
 * Where a visitor to an app route must go first, if anywhere. This is a UX
 * guard only: the backend verifies the session JWT on every request.
 */
export function signInRedirectFor(
  auth: AuthState,
  href: string,
): SignInRedirect | null {
  if (auth.isSignedIn) return null
  return { to: '/sign-in', search: { next: href } }
}
