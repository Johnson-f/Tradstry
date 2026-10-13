"use client";

import { useStytch, useStytchSession, useStytchUser } from "@stytch/nextjs";
import {
  createHttpGraphQLFetcher,
  createWebSocketGraphQLSubscriber,
  DashboardApp,
  type TradstryPlatform,
  TradstryProvider,
} from "@tradstry/app-ui";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { AccountDialog } from "@/components/account";
import { useGetToken } from "@/lib/client/use-get-token";
import { SITE_URL } from "@/lib/site";
import { userAvatarUrl, userEmail, userFullName } from "@/lib/stytch";

const GRAPHQL_ENDPOINT =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:7899/graphql";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
const DASHBOARD_COMPACT_METRICS =
  process.env.NEXT_PUBLIC_DASHBOARD_COMPACT_METRICS === "true";

export function WebsiteDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const stytch = useStytch();
  const { session, isInitialized } = useStytchSession();
  const { user } = useStytchUser();
  const getToken = useGetToken();
  const { theme = "system", setTheme } = useTheme();

  const fetcher = React.useMemo(
    () =>
      createHttpGraphQLFetcher({
        endpoint: GRAPHQL_ENDPOINT,
        getToken,
      }),
    [getToken],
  );
  const subscriber = React.useMemo(
    () =>
      createWebSocketGraphQLSubscriber({
        endpoint: GRAPHQL_ENDPOINT,
        getToken,
      }),
    [getToken],
  );

  const platform = React.useMemo<TradstryPlatform>(
    () => ({
      kind: "web",
      auth: {
        isLoaded: isInitialized,
        isSignedIn: session !== null,
        getToken,
      },
      user: {
        fullName: userFullName(user) || "User",
        email: userEmail(user),
        imageUrl: userAvatarUrl(user),
      },
      pathname,
      appBaseUrl:
        typeof window === "undefined" ? APP_URL : window.location.origin,
      backendBaseUrl: GRAPHQL_ENDPOINT.replace(/\/graphql\/?$/, ""),
      navigate: router.push,
      openExternal: (url) => {
        window.location.href = url;
      },
      signOut: async () => {
        await stytch.session.revoke({ forceClear: true });
        window.location.assign("/");
      },
      theme: theme === "light" || theme === "dark" ? theme : "system",
      setTheme,
      features: {
        dashboardCompactMetrics: DASHBOARD_COMPACT_METRICS,
      },
      renderAccountDialog: (open, onOpenChange) => (
        <AccountDialog open={open} onOpenChange={onOpenChange} />
      ),
    }),
    [
      getToken,
      isInitialized,
      pathname,
      router.push,
      session,
      setTheme,
      stytch,
      theme,
      user,
    ],
  );

  React.useEffect(() => {
    if (!isInitialized || session) return;
    // The proxy treats any session cookie as signed in, so a stale one left behind
    // would bounce /sign-in straight back here.
    stytch.session
      .revoke({ forceClear: true })
      .catch(() => {})
      .finally(() => router.replace("/sign-in"));
  }, [isInitialized, session, router, stytch]);

  return (
    <TradstryProvider
      platform={platform}
      fetcher={fetcher}
      subscriber={subscriber}
    >
      <DashboardApp pathname={pathname} />
    </TradstryProvider>
  );
}
