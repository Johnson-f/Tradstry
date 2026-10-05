"use client";

import { useUser } from "@clerk/nextjs";
import { Camera01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import {
  clerkError,
  Field,
  Section,
  Spinner,
} from "@/components/account/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@tradstry/app-ui/components/ui/avatar";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export function ProfileSection() {
  const { user } = useUser();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = React.useState(user?.firstName ?? "");
  const [lastName, setLastName] = React.useState(user?.lastName ?? "");
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!user) return null;

  const dirty =
    firstName.trim() !== (user.firstName ?? "") ||
    lastName.trim() !== (user.lastName ?? "");

  const initials =
    `${firstName.at(0) ?? ""}${lastName.at(0) ?? ""}`.toUpperCase() ||
    (user.primaryEmailAddress?.emailAddress.at(0) ?? "U").toUpperCase();

  async function save() {
    if (!user || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      toast.success("Profile updated.");
    } catch (err) {
      setError(clerkError(err, "Could not update your profile."));
    } finally {
      setSaving(false);
    }
  }

  async function setImage(file: File | null) {
    if (!user) return;
    if (file && !file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file && file.size > MAX_AVATAR_BYTES) {
      setError("Images must be under 10 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await user.setProfileImage({ file });
      toast.success(file ? "Photo updated." : "Photo removed.");
    } catch (err) {
      setError(clerkError(err, "Could not update your photo."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Profile photo">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            aria-label="Change profile photo"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="size-14">
              <AvatarImage src={user.imageUrl} alt="" />
              <AvatarFallback className="text-base">{initials}</AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
              {uploading ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={Camera01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              )}
            </span>
          </button>

          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                Change photo
              </Button>
              {user.hasImage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setImage(null)}
                  disabled={uploading}
                  className="h-8 text-muted-foreground"
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG or GIF. Up to 10 MB.
            </p>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (file) setImage(file);
            }}
          />
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
