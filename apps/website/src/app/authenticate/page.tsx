import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthenticateCallback } from "@/components/auth/authenticate-callback";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AuthenticatePage() {
  return (
    <AuthShell showTerms={false}>
      <AuthenticateCallback />
    </AuthShell>
  );
}
