"use client";

import * as React from "react";
import {
  createGraphQLFetcher,
  GraphQLRequestError,
} from "@/lib/client/backend-connection";
import { useGetToken } from "@/lib/client/use-get-token";

export type AuthSession = {
  id: string;
  startedAt: string;
  lastAccessedAt: string;
  expiresAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

const AUTH_SESSIONS_QUERY = `
  query AuthSessions {
    authSessions {
      id
      startedAt
      lastAccessedAt
      expiresAt
      ipAddress
      userAgent
      current
    }
  }
`;

const REVOKE_AUTH_SESSION_MUTATION = `
  mutation RevokeAuthSession($id: String!) {
    revokeAuthSession(id: $id)
  }
`;

const DELETE_ACCOUNT_MUTATION = `
  mutation DeleteAccount {
    deleteAccount
  }
`;

export function isReauthRequired(err: unknown): boolean {
  return err instanceof GraphQLRequestError && err.code === "REAUTH_REQUIRED";
}

export function useAccountApi() {
  const getToken = useGetToken();
  return React.useMemo(() => {
    const fetcher = createGraphQLFetcher(getToken);
    return {
      listSessions: async () =>
        (await fetcher<{ authSessions: AuthSession[] }>(AUTH_SESSIONS_QUERY))
          .authSessions,
      revokeSession: (id: string) =>
        fetcher<{ revokeAuthSession: boolean }>(
          REVOKE_AUTH_SESSION_MUTATION,
          { id },
        ),
      deleteAccount: () =>
        fetcher<{ deleteAccount: boolean }>(DELETE_ACCOUNT_MUTATION),
    };
  }, [getToken]);
}
