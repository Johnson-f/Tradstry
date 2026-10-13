const STORAGE_KEY = "tradstry:return-to";

export const DEFAULT_RETURN_PATH = "/dashboard";

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

// Magic links open in a new tab and OAuth leaves the origin, so only localStorage survives.
export function rememberReturnTo(path: string | null): void {
  try {
    if (path) localStorage.setItem(STORAGE_KEY, path);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function takeReturnTo(): string {
  try {
    const stored = safeReturnPath(localStorage.getItem(STORAGE_KEY));
    localStorage.removeItem(STORAGE_KEY);
    return stored ?? DEFAULT_RETURN_PATH;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}
