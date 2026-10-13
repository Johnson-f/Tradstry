"use client";

import { Products, StytchPasswordReset, useStytch } from "@stytch/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { inkTheme } from "@/components/auth/theme";
import { takeReturnTo } from "@/lib/auth-redirect";
import { SESSION_DURATION_MINUTES } from "@/lib/stytch";

const config = {
  products: [Products.passwords],
  sessionOptions: { sessionDurationMinutes: SESSION_DURATION_MINUTES },
};
const presentation = { theme: inkTheme, options: { hideHeaderText: true } };

export function ResetPasswordForm() {
  const stytch = useStytch();
  const router = useRouter();
  const [token, setToken] = React.useState<string | null | undefined>();

  React.useEffect(() => {
    setToken(stytch.parseAuthenticateUrl()?.token ?? null);
  }, [stytch]);

  if (token === undefined) return null;
  if (token === null) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-zinc-600">
          This reset link is missing or not valid.
        </p>
        <Link
          href="/sign-in"
          className="text-sm text-zinc-950 underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <StytchPasswordReset
      config={config}
      presentation={presentation}
      passwordResetToken={token}
      callbacks={{
        onEvent: ({ type }) => {
          if (type === "PASSWORD_RESET_BY_EMAIL")
            router.replace(takeReturnTo());
        },
      }}
    />
  );
}
