"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";
import type * as React from "react";

const stytch = createStytchClient(
  process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN ?? "",
  { customBaseUrl: process.env.NEXT_PUBLIC_STYTCH_DOMAIN || undefined },
);

export function AppStytchProvider({ children }: { children: React.ReactNode }) {
  return <StytchProvider stytch={stytch}>{children}</StytchProvider>;
}
