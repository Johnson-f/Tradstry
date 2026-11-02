import { describe, expect, test } from 'bun:test'
import {
  BACKEND_URL,
  GraphQLRequestError,
  backendWebSocketUrl,
  createGraphQLFetcher,
  type TokenSource,
} from './api'

function tokens(initial: string | null) {
  let token = initial
  let refreshes = 0
  let signOuts = 0
  let refreshFails = false
  const source: TokenSource = {
    getToken: () => token,
    refresh: async () => {
      refreshes += 1
      if (refreshFails) throw new Error('session ended')
      token = `fresh-${refreshes}`
    },
    signedOut: () => {
      signOuts += 1
    },
  }
  return {
    source,
    refreshes: () => refreshes,
    signOuts: () => signOuts,
    failRefresh: () => {
      refreshFails = true
    },
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A fetch that answers from a script and records the bearer of each call. */
function scripted(...responses: Response[]) {
  const bearers: Array<string | null> = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    bearers.push(headers.get('Authorization'))
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  }) as typeof fetch
  return { fetchImpl, bearers }
}

describe('createGraphQLFetcher', () => {
  test('sends the session JWT and returns data', async () => {
    const { source } = tokens('jwt-1')
    const { fetchImpl, bearers } = scripted(json(200, { data: { me: 1 } }))
    const graphql = createGraphQLFetcher(source, fetchImpl)
    expect(await graphql<{ me: number }>('{ me }')).toEqual({ me: 1 })
    expect(bearers).toEqual(['Bearer jwt-1'])
  })

  test('refreshes once and retries when the token expired', async () => {
    const auth = tokens('stale')
    const { fetchImpl, bearers } = scripted(
      json(401, { error: 'token_expired' }),
      json(200, { data: { me: 1 } }),
    )
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    expect(await graphql('{ me }')).toEqual({ me: 1 })
    expect(bearers).toEqual(['Bearer stale', 'Bearer fresh-1'])
    expect(auth.refreshes()).toBe(1)
    expect(auth.signOuts()).toBe(0)
  })

  test('gives up after one refresh', async () => {
    const auth = tokens('stale')
    const { fetchImpl } = scripted(
      json(401, { error: 'token_expired' }),
      json(401, { error: 'token_expired' }),
    )
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = await graphql('{ me }').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphQLRequestError)
    expect((error as GraphQLRequestError).code).toBe('token_expired')
    expect(auth.refreshes()).toBe(1)
    expect(auth.signOuts()).toBe(1)
  })

  test('signs out when the session can no longer be refreshed', async () => {
    const auth = tokens('stale')
    auth.failRefresh()
    const { fetchImpl, bearers } = scripted(json(401, { error: 'token_expired' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error).toBeInstanceOf(GraphQLRequestError)
    expect(error.message).toBe('You are signed out.')
    expect(bearers).toEqual(['Bearer stale'])
    expect(auth.signOuts()).toBe(1)
  })

  test('does not refresh for other auth failures', async () => {
    const auth = tokens(null)
    const { fetchImpl, bearers } = scripted(
      json(401, { error: 'missing_token' }),
    )
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch(
      (e: unknown) => e,
    )) as GraphQLRequestError
    expect(error.code).toBe('missing_token')
    expect(bearers).toEqual([null])
    expect(auth.refreshes()).toBe(0)
    expect(auth.signOuts()).toBe(1)
  })

  test('other failures leave the session alone', async () => {
    const auth = tokens('jwt-1')
    const { fetchImpl } = scripted(json(503, { error: 'keys_unavailable' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error.code).toBe('keys_unavailable')
    expect(auth.signOuts()).toBe(0)
  })

  test('surfaces GraphQL error codes', async () => {
    const { source } = tokens('jwt-1')
    const { fetchImpl } = scripted(
      json(200, {
        data: null,
        errors: [
          { message: 'Sign in again', extensions: { code: 'REAUTH_REQUIRED' } },
        ],
      }),
    )
    const graphql = createGraphQLFetcher(source, fetchImpl)
    const error = (await graphql('mutation { x }').catch(
      (e: unknown) => e,
    )) as GraphQLRequestError
    expect(error.message).toBe('Sign in again')
    expect(error.code).toBe('REAUTH_REQUIRED')
  })
})

test('the WebSocket URL follows the backend scheme', () => {
  const ws = new URL(backendWebSocketUrl())
  expect(ws.protocol).toBe(
    new URL(BACKEND_URL).protocol === 'https:' ? 'wss:' : 'ws:',
  )
  expect(ws.pathname).toBe('/graphql/ws')
})
