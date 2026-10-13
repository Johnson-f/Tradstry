"use client";

import { useStytch, useStytchUser } from "@stytch/nextjs";
import {
  Cancel01Icon,
  Mail01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import {
  type EmailResource,
  errorMessage,
  Field,
  Section,
  Spinner,
} from "@/components/account/shared";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { SESSION_DURATION_MINUTES, type StytchUser } from "@/lib/stytch";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AddState =
  | { step: "idle" }
  | { step: "entering" }
  | { step: "verifying"; email: string; methodId: string };

export function EmailSection() {
  const { user } = useStytchUser();
  if (!user) return null;
  return <EmailSectionBody user={user} />;
}

function EmailSectionBody({ user }: { user: StytchUser }) {
  const stytch = useStytch();

  const [add, setAdd] = React.useState<AddState>({ step: "idle" });
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);

  function reset() {
    setAdd({ step: "idle" });
    setEmail("");
    setCode("");
    setError(null);
  }

  async function sendCode() {
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sent = await stytch.otps.email.loginOrCreate(address, {
        expiration_minutes: 10,
      });
      setAdd({ step: "verifying", email: address, methodId: sent.method_id });
    } catch (err) {
      setError(errorMessage(err, "Could not add that email address."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (add.step !== "verifying") return;
    setBusy(true);
    setError(null);
    try {
      await stytch.otps.authenticate(code, add.methodId, {
        session_duration_minutes: SESSION_DURATION_MINUTES,
      });
      await stytch.user.get();
      toast.success(`${add.email} verified.`);
      reset();
    } catch (err) {
      setError(
        errorMessage(err, "That code didn't match. Check your inbox and retry."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: EmailResource) {
    setRowBusy(item.email_id);
    try {
      await stytch.user.deleteEmail(item.email_id);
      await stytch.user.get();
      toast.success(`${item.email} removed.`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove that email address."));
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <Section
      title="Email addresses"
      description="Any verified address can be used to sign in."
    >
      <div className="grid gap-3">
        <ul className="grid gap-2">
          {user.emails.map((item) => {
            const pending = rowBusy === item.email_id;
            const removable = user.emails.length > 1 && !pending;
            return (
              <li
                key={item.email_id}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5"
              >
                <HugeiconsIcon
                  icon={Mail01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.email}
                </span>
                {item.verified ? null : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Unverified
                  </Badge>
                )}
                {pending ? (
                  <Spinner className="mx-2 text-muted-foreground" />
                ) : null}
                {removable ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${item.email}`}
                        onClick={() => remove(item)}
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          strokeWidth={2}
                          className="size-4"
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove</TooltipContent>
                  </Tooltip>
                ) : null}
              </li>
            );
          })}
        </ul>

        {add.step === "idle" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdd({ step: "entering" })}
            className="justify-self-start"
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
            Add email address
          </Button>
        ) : (
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            {add.step === "entering" ? (
              <Field
                label="New email address"
                htmlFor="account-new-email"
                error={error}
                hint="We'll send a 6-digit code to confirm it's yours."
              >
                <Input
                  id="account-new-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendCode();
                  }}
                />
              </Field>
            ) : (
              <Field
                label={`Enter the code sent to ${add.email}`}
                htmlFor="account-email-code"
                error={error}
                hint="It may take a minute to arrive."
              >
                <Input
                  id="account-email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") verifyCode();
                  }}
                  className="font-mono tracking-[0.4em]"
                />
              </Field>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              {add.step === "entering" ? (
                <Button size="sm" onClick={sendCode} disabled={busy || !email}>
                  {busy ? <Spinner /> : null}
                  Send code
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={verifyCode}
                  disabled={busy || code.length < 6}
                >
                  {busy ? <Spinner /> : null}
                  Verify
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
