"use client";

import {
  AlertCircleIcon,
  ArrowRight02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStytch } from "@stytch/nextjs";
import { Button } from "@tradstry/app-ui/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { takeReturnTo } from "@/lib/auth-redirect";
import { SESSION_DURATION_MINUTES } from "@/lib/stytch";

export function AuthenticateCallback() {
  const stytch = useStytch();
  const router = useRouter();
  const started = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    const parsed = stytch.parseAuthenticateUrl();
    if (!parsed?.handled) {
      setError(
        "This sign-in link is missing or invalid. Start again to continue.",
      );
      return;
    }
    stytch
      .authenticateByUrl({ session_duration_minutes: SESSION_DURATION_MINUTES })
      .then(() => router.replace(takeReturnTo()))
      .catch((cause) => {
        console.error("Stytch authenticate failed", cause);
        setError(
          "Your sign-in link may have expired or already been used. Start again to continue.",
        );
      });
  }, [stytch, router]);

  return (
    <div>
      <div role={error ? "alert" : "status"} aria-atomic="true">
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-600">
          <HugeiconsIcon
            icon={error ? AlertCircleIcon : Loading03Icon}
            strokeWidth={1.7}
            className={
              error
                ? "size-6"
                : "size-6 animate-spin motion-reduce:animate-none"
            }
            aria-hidden="true"
          />
        </div>
        <h1
          id="auth-title"
          className="text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.04em] text-zinc-950 sm:text-4xl"
        >
          {error ? "We couldn’t sign you in." : "Signing you in…"}
        </h1>
        <p className="mt-4 text-pretty text-[15px] leading-7 text-zinc-600">
          {error ?? "Hang tight while we finish your sign-in."}
        </p>
      </div>
      {error && (
        <Button
          asChild
          className="mt-8 h-12 w-full justify-between rounded-[10px] bg-zinc-950 px-4 text-sm text-white hover:bg-zinc-800 focus-visible:ring-zinc-500/40"
        >
          <Link href="/sign-in">
            Back to sign in
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              className="size-4"
              aria-hidden="true"
            />
          </Link>
        </Button>
      )}
    </div>
  );
}
