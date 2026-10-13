"use client";

import { useStytch, useStytchUser } from "@stytch/nextjs";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { isReauthRequired, useAccountApi } from "@/components/account/api";
import {
  errorMessage,
  Field,
  Section,
  Spinner,
} from "@/components/account/shared";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
  SESSION_DURATION_MINUTES,
  type StytchUser,
  userEmail,
} from "@/lib/stytch";

const LOSSES = [
  "Every trade, tag and journal entry",
  "Your playbooks, principles and notebook",
  "Brokerage connections and synced history",
];

type Reauth =
  | { step: "none" }
  | { step: "password" }
  | { step: "send-code" }
  | { step: "code"; methodId: string };

export function DangerSection() {
  const { user } = useStytchUser();
  if (!user) return null;
  return <DangerSectionBody user={user} />;
}

function DangerSectionBody({ user }: { user: StytchUser }) {
  const stytch = useStytch();
  const api = useAccountApi();

  const [confirmation, setConfirmation] = React.useState("");
  const [reauth, setReauth] = React.useState<Reauth>({ step: "none" });
  const [secret, setSecret] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const email = userEmail(user);
  const matches = confirmation.trim().toLowerCase() === email.toLowerCase();

  async function deleteAndLeave() {
    await api.deleteAccount();
    toast.success("Your account has been deleted.");
    await stytch.session.revoke({ forceClear: true }).catch(() => undefined);
    window.location.assign("/");
  }

  async function destroy() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAndLeave();
    } catch (err) {
      if (isReauthRequired(err)) {
        setReauth({ step: user.password ? "password" : "send-code" });
      } else {
        setError(errorMessage(err, "Could not delete your account."));
      }
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const sent = await stytch.otps.email.send(email, { expiration_minutes: 10 });
      setReauth({ step: "code", methodId: sent.method_id });
    } catch (err) {
      setError(errorMessage(err, "Could not send a code."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmIdentity() {
    setBusy(true);
    setError(null);
    try {
      if (reauth.step === "password") {
        await stytch.passwords.authenticate({
          email,
          password: secret,
          session_duration_minutes: SESSION_DURATION_MINUTES,
        });
      } else if (reauth.step === "code") {
        await stytch.otps.authenticate(secret, reauth.methodId, {
          session_duration_minutes: SESSION_DURATION_MINUTES,
        });
      }
      await deleteAndLeave();
    } catch (err) {
      setError(errorMessage(err, "Could not confirm it's you."));
      setBusy(false);
    }
  }

  return (
    <Section
      tone="destructive"
      title="Delete account"
      description="This permanently erases your account and everything in it. It cannot be undone."
      footer={
        <Button
          size="sm"
          variant="destructive"
          onClick={reauth.step === "none" ? destroy : confirmIdentity}
          disabled={
            !matches ||
            busy ||
            reauth.step === "send-code" ||
            (reauth.step !== "none" && secret.length === 0)
          }
        >
          {busy ? <Spinner /> : null}
          Delete my account
        </Button>
      }
    >
      <div className="grid gap-4">
        <ul className="grid gap-1.5">
          {LOSSES.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-destructive"
              />
              {item}
            </li>
          ))}
        </ul>

        <Field
          label="Type your email to confirm"
          htmlFor="account-delete-confirm"
          error={reauth.step === "none" ? error : null}
          hint={email}
        >
          <Input
            id="account-delete-confirm"
            autoComplete="off"
            placeholder={email}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={confirmation.length > 0 && !matches}
          />
        </Field>

        {reauth.step === "none" ? null : (
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            {reauth.step === "send-code" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  For your security, confirm it's you. We'll email a code to{" "}
                  {email}.
                </p>
                {error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendCode}
                  disabled={busy}
                  className="justify-self-start"
                >
                  {busy ? <Spinner /> : null}
                  Send code
                </Button>
              </>
            ) : (
              <Field
                label={
                  reauth.step === "password"
                    ? "Confirm your password"
                    : `Enter the code sent to ${email}`
                }
                htmlFor="account-delete-reauth"
                error={error}
                hint={
                  reauth.step === "password"
                    ? "Deleting an account needs a recent sign-in."
                    : undefined
                }
              >
                <Input
                  id="account-delete-reauth"
                  type={reauth.step === "password" ? "password" : "text"}
                  autoComplete={
                    reauth.step === "password"
                      ? "current-password"
                      : "one-time-code"
                  }
                  inputMode={reauth.step === "code" ? "numeric" : undefined}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
