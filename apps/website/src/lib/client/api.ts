import { createClient, type Client } from 'graphql-ws'

export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:7900'
).replace(/\/+$/, '')

export interface TokenSource {
  /** The current session JWT, or null when signed out. */
  getToken(): string | null
  /** Asks Stytch for a fresh session JWT. */
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

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error
  } catch {
    return undefined
  }
}

/**
 * Sends GraphQL over HTTP with the session JWT. Session JWTs live five minutes
 * and the SDK refreshes them in the background, so a `token_expired` answer
 * means a refresh raced the request: refresh once and retry.
 */
export function createGraphQLFetcher(
  tokens: TokenSource,
  fetchImpl: typeof fetch = fetch,
): GraphQLFetcher {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
    const send = () => {
      const token = tokens.getToken()
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
      if (code !== 'token_expired') {
        throw new GraphQLRequestError('You are signed out.', code)
      }
      await tokens.refresh()
      response = await send()
      if (response.status === 401) {
        throw new GraphQLRequestError(
          'You are signed out.',
          await errorCode(response),
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
    connectionParams: async () => {
      await tokens.refresh().catch(() => {})
      const token = tokens.getToken()
      return token ? { token } : {}
    },
  })
}
