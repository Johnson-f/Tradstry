import { describe, expect, test } from 'bun:test'
import {
  BACKEND_URL,
  GraphQLRequestError,
  backendWebSocketUrl,
  createGraphQLFetcher,
  retryDelay,
  type TokenSource,
} from './api'

/** A session that Stytch can refresh, fail to reach, or end. */
function tokens(initial: string | null) {
  let token = initial
  let refreshes = 0
  let refresh: 'ok' | 'offline' | 'ended' = 'ok'
  const source: TokenSource = {
    getToken: () => token,
    refresh: async () => {
      refreshes += 1
      if (refresh === 'offline') throw new Error('network')
      if (refresh === 'ended') {
        token = null
        throw new Error('session ended')
      }
      token = `fresh-${refreshes}`
    },
  }
  return {
    source,
    refreshes: () => refreshes,
    token: () => token,
    refreshWill: (outcome: 'ok' | 'offline' | 'ended') => {
      refresh = outcome
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

  test('refreshes once and retries when the token is refused', async () => {
    for (const code of ['token_expired', 'invalid_token']) {
      const auth = tokens('stale')
      const { fetchImpl, bearers } = scripted(json(401, { error: code }), json(200, { data: { me: 1 } }))
      const graphql = createGraphQLFetcher(auth.source, fetchImpl)
      expect(await graphql('{ me }')).toEqual({ me: 1 })
      expect(bearers).toEqual(['Bearer stale', 'Bearer fresh-1'])
      expect(auth.refreshes()).toBe(1)
    }
  })

  test('a fresh token the backend still refuses is an error, not a sign-out', async () => {
    const auth = tokens('stale')
    const { fetchImpl } = scripted(json(401, { error: 'invalid_token' }), json(401, { error: 'invalid_token' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error).toBeInstanceOf(GraphQLRequestError)
    expect(error.code).toBe('SESSION_NOT_ACCEPTED')
    expect(error.extensions).toEqual({ reason: 'invalid_token' })
    expect(auth.refreshes()).toBe(1)
    expect(auth.token()).toBe('fresh-1', 'the session is kept')
  })

  test('signs out only when Stytch ends the session', async () => {
    const auth = tokens('stale')
    auth.refreshWill('ended')
    const { fetchImpl, bearers } = scripted(json(401, { error: 'invalid_token' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error.message).toBe('You are signed out.')
    expect(bearers).toEqual(['Bearer stale'])
    expect(auth.token()).toBeNull()
  })

  test('a refresh that cannot reach Stytch keeps the session', async () => {
    const auth = tokens('stale')
    auth.refreshWill('offline')
    const { fetchImpl } = scripted(json(401, { error: 'token_expired' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error.code).toBe('AUTH_UNAVAILABLE')
    expect(auth.token()).toBe('stale')
  })

  test('without a session there is nothing to refresh', async () => {
    const auth = tokens(null)
    const { fetchImpl, bearers } = scripted(json(401, { error: 'missing_token' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error.code).toBe('missing_token')
    expect(bearers).toEqual([null])
    expect(auth.refreshes()).toBe(0)
  })

  test('other failures leave the session alone', async () => {
    const auth = tokens('jwt-1')
    const { fetchImpl } = scripted(json(503, { error: 'keys_unavailable' }))
    const graphql = createGraphQLFetcher(auth.source, fetchImpl)
    const error = (await graphql('{ me }').catch((e: unknown) => e)) as GraphQLRequestError
    expect(error.code).toBe('keys_unavailable')
    expect(auth.refreshes()).toBe(0)
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

test('reconnects back off to 30 seconds, with up to a second of jitter', () => {
  expect([0, 1, 2, 3, 10].map((retries) => retryDelay(retries, 0))).toEqual([1000, 2000, 4000, 8000, 30_000])
  expect(retryDelay(0, 0.999)).toBe(1999)
})
