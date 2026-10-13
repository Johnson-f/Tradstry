"use client";

import { useStytch, useStytchUser } from "@stytch/nextjs";
import {
  Cancel01Icon,
  ComputerIcon,
  Link01Icon,
  SmartPhone01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { type AuthSession, useAccountApi } from "@/components/account/api";
import {
  EmptyRow,
  errorMessage,
  Field,
  type OAuthProvider,
  Section,
  Spinner,
} from "@/components/account/shared";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Label } from "@tradstry/app-ui/components/ui/label";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import {
  absoluteUrl,
  SESSION_DURATION_MINUTES,
  type StytchUser,
  userEmail,
} from "@/lib/stytch";

const MIN_PASSWORD_LENGTH = 8;

const GOOGLE = "google";

export function SecuritySection() {
  const { user } = useStytchUser();
  if (!user) return null;
  return (
    <div className="grid gap-4">
      <PasswordCard user={user} />
      <ConnectionsCard user={user} />
      <DevicesCard />
    </div>
  );
}

function PasswordCard({ user }: { user: StytchUser }) {
  const stytch = useStytch();
  const api = useAccountApi();

  const hasPassword = user.password !== null;
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [signOutOthers, setSignOutOthers] = React.useState(true);
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ready =
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    (!hasPassword || current.length > 0);

  async function signOutOtherDevices() {
    const sessions = await api.listSessions();
    await Promise.all(
      sessions
        .filter((item) => !item.current)
        .map((item) => api.revokeSession(item.id)),
    );
  }

  async function submit() {
    if (next !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (hasPassword) {
        await stytch.passwords.resetByExistingPassword({
          email: userEmail(user),
          existing_password: current,
          new_password: next,
          session_duration_minutes: SESSION_DURATION_MINUTES,
        });
      } else {
        await stytch.passwords.resetBySession({
          password: next,
          session_duration_minutes: SESSION_DURATION_MINUTES,
        });
      }
      if (signOutOthers) await signOutOtherDevices();
      await stytch.user.get();
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(hasPassword ? "Password changed." : "Password set.");
    } catch (err) {
      setError(errorMessage(err, "Could not update your password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title={hasPassword ? "Password" : "Set a password"}
      description={
        hasPassword
          ? "Changing it can sign you out everywhere else."
          : "You currently sign in without a password. Set one as a fallback."
      }
      footer={
        <Button size="sm" onClick={submit} disabled={!ready || busy}>
          {busy ? <Spinner /> : null}
          {hasPassword ? "Change password" : "Set password"}
        </Button>
      }
    >
      <div className="grid gap-4">
        {hasPassword ? (
          <Field label="Current password" htmlFor="account-current-password">
            <Input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            htmlFor="account-new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <div className="relative">
              <Input
                id="account-new-password"
                type={reveal ? "text" : "password"}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                aria-label={reveal ? "Hide password" : "Show password"}
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500/70"
              >
                <HugeiconsIcon
                  icon={reveal ? ViewOffSlashIcon : ViewIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
            </div>
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="account-confirm-password"
            error={
              confirm.length > 0 && confirm !== next
                ? "Passwords don't match."
                : null
            }
          >
            <Input
              id="account-confirm-password"
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="account-signout-others"
            checked={signOutOthers}
            onCheckedChange={(v) => setSignOutOthers(v === true)}
          />
          <Label
            htmlFor="account-signout-others"
            className="text-xs font-normal text-muted-foreground"
          >
            Sign out of all other devices
          </Label>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function ConnectionsCard({ user }: { user: StytchUser }) {
  const stytch = useStytch();
  const [busy, setBusy] = React.useState<string | null>(null);
  const googleConnected = user.providers.some(
    (p) => p.provider_type.toLowerCase() === GOOGLE,
  );

  async function connect() {
    setBusy(GOOGLE);
    try {
      const { oauth_attach_token } = await stytch.oauth.attach(GOOGLE);
      const redirect = absoluteUrl("/authenticate");
      await stytch.oauth.google.start({
        login_redirect_url: redirect,
        signup_redirect_url: redirect,
        oauth_attach_token,
      });
    } catch (err) {
      toast.error(errorMessage(err, "Could not start that connection."));
      setBusy(null);
    }
  }

  async function disconnect(provider: OAuthProvider) {
    setBusy(provider.oauth_user_registration_id);
    try {
      await stytch.user.deleteOAuthRegistration(
        provider.oauth_user_registration_id,
      );
      await stytch.user.get();
      toast.success("Account disconnected.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not disconnect that account."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title="Connected accounts"
      description="Sign in to Tradstry with a provider you already trust."
    >
      <div className="grid gap-3">
        {user.providers.length === 0 ? (
          <EmptyRow>No providers connected yet.</EmptyRow>
        ) : (
          <ul className="grid gap-2">
            {user.providers.map((provider) => {
              const pending = busy === provider.oauth_user_registration_id;
              return (
                <li
                  key={provider.oauth_user_registration_id}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5"
                >
                  <HugeiconsIcon
                    icon={Link01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">
                    {provider.provider_type}
                  </span>
                  {pending ? (
                    <Spinner className="mx-2 text-muted-foreground" />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Disconnect ${provider.provider_type}`}
                          onClick={() => disconnect(provider)}
                          className="size-8 text-muted-foreground hover:text-destructive"
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            strokeWidth={2}
                            className="size-4"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Disconnect</TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {googleConnected ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={connect}
            >
              {busy === GOOGLE ? <Spinner /> : null}
              Connect Google
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

function describeUserAgent(userAgent: string | null): {
  label: string;
  isMobile: boolean;
} {
  if (!userAgent) return { label: "Unknown device", isMobile: false };
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;
  const system =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  const label =
    browser && system ? `${browser} on ${system}` : (browser ?? system);
  return {
    label: label ?? "Unknown device",
    isMobile: /Mobile|iPhone|Android/.test(userAgent),
  };
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function lastActive(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

function DevicesCard() {
  const api = useAccountApi();
  const [sessions, setSessions] = React.useState<AuthSession[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    api
      .listSessions()
      .then((result) => live && setSessions(result))
      .catch(() => live && setSessions([]));
    return () => {
      live = false;
    };
  }, [api]);

  async function revoke(target: AuthSession) {
    setBusy(target.id);
    try {
      await api.revokeSession(target.id);
      setSessions(await api.listSessions());
      toast.success("Device signed out.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not sign out that device."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title="Active devices"
      description="Everywhere you're currently signed in."
    >
      {sessions === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyRow>No active devices.</EmptyRow>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((item) => {
            const device = describeUserAgent(item.userAgent);
            const pending = busy === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
              >
                <HugeiconsIcon
                  icon={device.isMobile ? SmartPhone01Icon : ComputerIcon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{device.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.ipAddress ?? "Unknown location"} ·{" "}
                    {lastActive(new Date(item.lastAccessedAt))}
                  </p>
                </div>
                {item.current ? (
                  <Badge variant="secondary">This device</Badge>
                ) : pending ? (
                  <Spinner className="mx-2 text-muted-foreground" />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(item)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
