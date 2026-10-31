import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/w/$workspaceId/')({
  component: () => null,
})
