import { createClient, type Client } from 'graphql-ws'

export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:7900'
).replace(/\/+$/, '')

/**
 * The signed-in session. Only Stytch decides that a session is over: when it
 * refuses a refresh, the source forgets the session and `getToken` turns null,
 * which sends the app to sign in. The backend refusing a token never does.
 */
export interface TokenSource {
  /** The current session JWT, or null when signed out. */
  getToken(): string | null
  /** Asks Stytch for a fresh session JWT; rejects if it could not get one. */
  refresh(): Promise<void>
}

export class GraphQLRequestError extends Error {
  readonly code?: string
  readonly extensions: Record<string, unknown>

  constructor(message: string, code?: string, extensions: Record<string, unknown> = {}) {
    super(message)
    this.name = 'GraphQLRequestError'
    this.code = code
    this.extensions = extensions
  }
}

export type GraphQLFetcher = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>

const REFRESH_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error
  } catch {
    return undefined
  }
}

/**
 * Sends GraphQL over HTTP with the session JWT. When the backend refuses the
 * token, ask Stytch for a fresh one and retry once: session JWTs live five
 * minutes, so most refusals are a refresh racing the request. If Stytch ends
 * the session the user is signed out; if the backend still refuses a fresh
 * token, that is reported as an error rather than signing the user out.
 */
export function createGraphQLFetcher(
  tokens: TokenSource,
  fetchImpl: typeof fetch = fetch,
): GraphQLFetcher {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
    let sent: string | null = null
    const send = () => {
      const token = tokens.getToken()
      sent = token
      return fetchImpl(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/graphql-response+json, application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
      })
    }

    let response = await send()
    if (response.status === 401) {
      const code = await errorCode(response)
      if (sent === null) throw new GraphQLRequestError('You are signed out.', code)
      try {
        await withTimeout(tokens.refresh(), REFRESH_TIMEOUT_MS)
      } catch {
        if (tokens.getToken() === null) throw new GraphQLRequestError('You are signed out.', code)
        throw new GraphQLRequestError(
          'Could not confirm your sign-in. Check your connection and try again.',
          'AUTH_UNAVAILABLE',
        )
      }
      response = await send()
      if (response.status === 401) {
        throw new GraphQLRequestError(
          'Tradstry could not verify your sign-in. Try again in a moment.',
          'SESSION_NOT_ACCEPTED',
          { reason: await errorCode(response) },
        )
      }
    }
    if (!response.ok) {
      throw new GraphQLRequestError(
        `Request failed: ${response.status} ${response.statusText}`,
        (await errorCode(response)) ?? `HTTP_${response.status}`,
      )
    }

    const body = (await response.json()) as {
      data?: T
      errors?: Array<{ message: string; extensions?: { code?: string } & Record<string, unknown> }>
    }
    const [error] = body.errors ?? []
    if (error) {
      throw new GraphQLRequestError(error.message, error.extensions?.code, error.extensions)
    }
    return body.data as T
  }
}

/** Milliseconds before reconnect attempt `retries`: 1s, 2s, 4s… up to 30s, plus up to 1s of jitter. */
export function retryDelay(retries: number, jitter = Math.random()): number {
  return Math.min(1000 * 2 ** retries, 30_000) + Math.floor(jitter * 1000)
}

export function backendWebSocketUrl(): string {
  const url = new URL('/graphql/ws', BACKEND_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/**
 * graphql-ws subscriptions. The server closes a socket when its session ends;
 * graphql-ws retries, and every connect fetches a fresh JWT first, so a
 * still-signed-in user reconnects without noticing.
 */
export function createSubscriptionClient(tokens: TokenSource): Client {
  return createClient({
    url: backendWebSocketUrl(),
    lazy: true,
    // The live change feed should outlast flaky networks and sleeping laptops:
    // keep retrying with a growing, jittered delay capped at 30 seconds, and
    // ping so a dead connection is noticed and replaced.
    retryAttempts: Number.POSITIVE_INFINITY,
    shouldRetry: () => true,
    retryWait: (retries) => new Promise((resolve) => setTimeout(resolve, retryDelay(retries))),
    keepAlive: 15_000,
    connectionParams: async () => {
      await tokens.refresh().catch(() => {})
      const token = tokens.getToken()
      return token ? { token } : {}
    },
  })
}
