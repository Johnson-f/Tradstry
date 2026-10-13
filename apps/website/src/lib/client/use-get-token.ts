"use client";

import { useStytch } from "@stytch/nextjs";
import { useCallback } from "react";

// Session JWTs last five minutes and the SDK refreshes them, so read the current one per request.
export function useGetToken(): () => Promise<string | null> {
  const stytch = useStytch();
  return useCallback(
    async () => stytch.session.getTokens()?.session_jwt ?? null,
    [stytch],
  );
}
