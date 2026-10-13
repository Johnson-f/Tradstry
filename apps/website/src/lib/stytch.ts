import type { User } from "@stytch/nextjs";

export const SESSION_DURATION_MINUTES = 43_200;

export type StytchUser = User;

export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export function userFullName(user: StytchUser | null): string {
  if (!user) return "";
  const { first_name, middle_name, last_name } = user.name;
  return [first_name, middle_name, last_name].filter(Boolean).join(" ");
}

export function userEmail(user: StytchUser | null): string {
  const emails = user?.emails ?? [];
  return (emails.find((item) => item.verified) ?? emails[0])?.email ?? "";
}

export function userAvatarUrl(user: StytchUser | null): string | undefined {
  return user?.providers.find((provider) => provider.profile_picture_url)
    ?.profile_picture_url;
}
