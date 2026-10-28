import { GraphQLRequestError } from '@/lib/client/api'

export function workspaceErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof GraphQLRequestError) {
    if (error.code === 'LAST_WORKSPACE') return 'You need at least one workspace.'
    if (error.code === 'INVALID_NAME') return 'Names are 1 to 100 characters.'
  }
  return fallback
}
