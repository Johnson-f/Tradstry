import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password · Tradstry",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password."
      subtitle="Pick a new one and you're back in."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
