import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/brokerage/connections')({
  beforeLoad: () => {
    throw redirect({ to: '/brokerage', replace: true })
  },
})
