"use client";

import { IdentityProvider, useStytch, useStytchSession } from "@stytch/nextjs";
import { useRouter } from "next/navigation";
import * as React from "react";
import { inkTheme } from "@/components/auth/theme";

const presentation = { theme: inkTheme };

export function OAuthConsent() {
  const router = useRouter();
  const stytch = useStytch();
  const { session, isInitialized } = useStytchSession();

  React.useEffect(() => {
    if (!isInitialized || session) return;
    const next = `${window.location.pathname}${window.location.search}`;
    // A stale session cookie would make the proxy bounce /sign-in straight back here.
    stytch.session
      .revoke({ forceClear: true })
      .catch(() => {})
      .finally(() =>
        router.replace(`/sign-in?next=${encodeURIComponent(next)}`),
      );
  }, [isInitialized, session, router, stytch]);

  if (!session) return null;
  return <IdentityProvider presentation={presentation} />;
}
