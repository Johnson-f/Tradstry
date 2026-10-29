import { createFileRoute } from '@tanstack/react-router'

// Workspace ownership and the remembered selection come from the parent route.
export const Route = createFileRoute('/_authenticated/w/$workspaceId/journal')({
  component: () => null,
})
