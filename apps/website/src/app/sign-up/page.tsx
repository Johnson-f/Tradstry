import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLogin } from "@/components/auth/auth-login";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Start journalling · Tradstry",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Start your trading journal."
      subtitle="Your trades tell a story. Start making sense of it."
    >
      <Suspense>
        <AuthLogin />
      </Suspense>
    </AuthShell>
  );
}
