"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { Label } from "@tradstry/app-ui/components/ui/label";
import { cn } from "@tradstry/app-ui/lib/utils";
import type { StytchUser } from "@/lib/stytch";

export type EmailResource = StytchUser["emails"][number];
export type OAuthProvider = StytchUser["providers"][number];

export function errorMessage(err: unknown, fallback: string): string {
  const { error_message, message } = (err ?? {}) as {
    error_message?: string;
    message?: string;
  };
  return error_message ?? message ?? fallback;
}

export function Section({
  title,
  description,
  children,
  footer,
  tone = "default",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  return (
    <section
      className={cn(
        "min-w-0",
        tone === "destructive"
          ? "rounded-xl border border-destructive/25 bg-destructive/[0.02] p-4"
          : "border-b border-border/60 pb-6 last:border-b-0 last:pb-0",
      )}
    >
      <header>
        <h3
          className={cn(
            "text-sm font-medium",
            tone === "destructive" && "text-destructive",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="mt-4">{children}</div>
      {footer ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 [&_button]:h-9 [&_button]:px-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground/80">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
    />
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
      {children}
    </p>
  );
}
