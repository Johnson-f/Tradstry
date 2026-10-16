"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";
import { usePathname } from "next/navigation";
import type * as React from "react";

const stytch = createStytchClient(
  process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN ?? "",
  { customBaseUrl: process.env.NEXT_PUBLIC_STYTCH_DOMAIN || undefined },
);

let identityProviderClient: ReturnType<typeof createStytchClient> | undefined;

function getIdentityProviderClient() {
  const domain = process.env.NEXT_PUBLIC_STYTCH_IDP_DOMAIN;
  if (!domain) return stytch;

  identityProviderClient ??= createStytchClient(
    process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN ?? "",
    { customBaseUrl: domain },
  );
  return identityProviderClient;
}

export function AppStytchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const client =
    pathname === "/oauth/authorize" ? getIdentityProviderClient() : stytch;

  return <StytchProvider stytch={client}>{children}</StytchProvider>;
}
