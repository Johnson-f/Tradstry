"use client";

import { Products, StytchLogin, useStytchSession } from "@stytch/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { inkTheme } from "@/components/auth/theme";
import {
  rememberReturnTo,
  safeReturnPath,
  takeReturnTo,
} from "@/lib/auth-redirect";
import { absoluteUrl, SESSION_DURATION_MINUTES } from "@/lib/stytch";

const presentation = {
  theme: inkTheme,
  options: { hideHeaderText: true },
};

export function AuthLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useStytchSession();
  const next = safeReturnPath(searchParams.get("next"));
  const [origin, setOrigin] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    rememberReturnTo(next);
  }, [next]);

  React.useEffect(() => {
    if (session) router.replace(takeReturnTo());
  }, [session, router]);

  const config = React.useMemo(() => {
    if (!origin) return null;
    const authenticateUrl = absoluteUrl("/authenticate");
    return {
      products: [Products.oauth, Products.passwords],
      oauthOptions: {
        providers: [{ type: "google" as const }],
        loginRedirectURL: authenticateUrl,
        signupRedirectURL: authenticateUrl,
      },
      passwordOptions: {
        resetPasswordRedirectURL: absoluteUrl("/reset-password"),
      },
      sessionOptions: { sessionDurationMinutes: SESSION_DURATION_MINUTES },
    };
  }, [origin]);

  if (!config) return null;
  return <StytchLogin config={config} presentation={presentation} />;
}
