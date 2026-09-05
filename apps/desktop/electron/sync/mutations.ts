import type { DatabaseSync } from "node:sqlite";

export function enqueueMutation(
  db: DatabaseSync,
  name: string,
  args: Record<string, unknown>,
  hlc: string,
): void {
  db.prepare("INSERT INTO outbox (name, args, hlc) VALUES (?, ?, ?)").run(name, JSON.stringify(args), hlc);
}

export function decodeBase64Strict(value: string): Uint8Array {
  const compact = value.trim();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) {
    throw new Error("invalid base64");
  }
  return Buffer.from(compact, "base64");
}
