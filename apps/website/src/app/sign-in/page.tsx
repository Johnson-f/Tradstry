import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLogin } from "@/components/auth/auth-login";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in · Tradstry",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to pick up where you left off."
    >
      <Suspense>
        <AuthLogin />
      </Suspense>
    </AuthShell>
  );
}
