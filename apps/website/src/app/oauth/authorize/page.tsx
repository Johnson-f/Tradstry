import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { OAuthConsent } from "@/components/auth/oauth-consent";

export const metadata: Metadata = {
  title: "Authorize access · Tradstry",
  robots: { index: false, follow: false },
};

export default function OAuthAuthorizePage() {
  return (
    <AuthShell
      title="Connect an app."
      subtitle="Review what it can access."
    >
      <OAuthConsent />
    </AuthShell>
  );
}
