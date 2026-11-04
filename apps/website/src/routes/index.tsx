import { createFileRoute, redirect } from '@tanstack/react-router'
import { LandingPage } from '@/components/landing/landing-page'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isSignedIn) throw redirect({ to: '/app', replace: true })
    if (location.hash) throw redirect({ to: '/', search: true, hash: '', replace: true })
  },
  component: LandingPage,
})
