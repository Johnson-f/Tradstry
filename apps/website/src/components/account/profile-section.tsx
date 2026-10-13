"use client";

import { useStytch, useStytchUser } from "@stytch/nextjs";
import * as React from "react";
import { toast } from "sonner";
import {
  errorMessage,
  Field,
  Section,
  Spinner,
} from "@/components/account/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@tradstry/app-ui/components/ui/avatar";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { userAvatarUrl, userEmail } from "@/lib/stytch";

export function ProfileSection() {
  const stytch = useStytch();
  const { user } = useStytchUser();

  const [firstName, setFirstName] = React.useState(user?.name.first_name ?? "");
  const [lastName, setLastName] = React.useState(user?.name.last_name ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!user) return null;

  const avatarUrl = userAvatarUrl(user);
  const dirty =
    firstName.trim() !== user.name.first_name ||
    lastName.trim() !== user.name.last_name;

  const initials =
    `${firstName.at(0) ?? ""}${lastName.at(0) ?? ""}`.toUpperCase() ||
    (userEmail(user).at(0) ?? "U").toUpperCase();

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await stytch.user.update({
        name: { first_name: firstName.trim(), last_name: lastName.trim() },
      });
      toast.success("Profile updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update your profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Profile photo">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={avatarUrl} alt="" />
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>
          <p className="text-xs text-muted-foreground">
            {avatarUrl
              ? "Your photo comes from your connected Google account."
              : "Connect a Google account to show your photo here."}
          </p>
        </div>
      </Section>
      <Section
        title="Display name"
        footer={
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Spinner /> : null}
            Save changes
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="account-first-name">
            <Input
              id="account-first-name"
              value={firstName}
              autoComplete="given-name"
              className="h-9 bg-background"
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="account-last-name">
            <Input
              id="account-last-name"
              value={lastName}
              autoComplete="family-name"
              className="h-9 bg-background"
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </Section>
    </div>
  );
}
