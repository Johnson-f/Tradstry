import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { graphql } from '@/lib/client/backend'

export interface Workspace {
  id: string
  name: string
  createdAt: string
}

export const WORKSPACES_KEY = ['workspaces']

/** Shared by components and route loaders, so both read one cache entry. */
export const workspacesQuery = queryOptions({
  queryKey: WORKSPACES_KEY,
  queryFn: () =>
    graphql<{ workspaces: Workspace[] }>('query Workspaces { workspaces { id name createdAt } }').then(
      (data) => data.workspaces,
    ),
})

export function useWorkspaces() {
  return useQuery(workspacesQuery)
}

/** Deleting a workspace detaches its brokerage account, so connections change too. */
function useInvalidateWorkspaces() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY }),
        queryClient.invalidateQueries({ queryKey: ['brokerage', 'connections'] }),
      ]),
    [queryClient],
  )
}

export function useCreateWorkspace() {
  const invalidate = useInvalidateWorkspaces()
  return useMutation({
    mutationFn: (name: string) =>
      graphql<{ createWorkspace: Workspace }>(
        'mutation CreateWorkspace($name: String!) { createWorkspace(name: $name) { id name createdAt } }',
        { name },
      ).then((data) => data.createWorkspace),
    onSuccess: invalidate,
  })
}

export function useRenameWorkspace() {
  const invalidate = useInvalidateWorkspaces()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      graphql('mutation RenameWorkspace($id: ID!, $name: String!) { renameWorkspace(id: $id, name: $name) { id } }', {
        id,
        name,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteWorkspace() {
  const invalidate = useInvalidateWorkspaces()
  return useMutation({
    mutationFn: (id: string) => graphql('mutation DeleteWorkspace($id: ID!) { deleteWorkspace(id: $id) }', { id }),
    onSuccess: invalidate,
  })
}
