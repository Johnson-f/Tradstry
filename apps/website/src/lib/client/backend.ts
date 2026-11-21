import { stytchTokens } from '@/lib/auth/stytch'
import { createAuthenticatedFetch, createGraphQLFetcher, createSubscriptionClient } from '@/lib/client/api'

export const authenticatedFetch = createAuthenticatedFetch(stytchTokens)

/** GraphQL over HTTP to the Tradstry backend, as the signed-in user. */
export const graphql = createGraphQLFetcher(stytchTokens)

/** GraphQL subscriptions over WebSocket, as the signed-in user. */
export const subscriptions = createSubscriptionClient(stytchTokens)
