export function money(value: string | null, currency: string | null = "USD") {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount); }
  catch { return `${value} ${currency ?? ""}`.trim(); }
}
export function tradeDate(value: string | null, timezone?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: timezone }).format(new Date(value)) : "Date unknown";
}
export function quantityMath(left: string, right: string, subtract = false): string {
  if (![left, right].every((value) => /^\d+(?:\.\d{1,28})?$/.test(value))) throw new Error("Enter a positive quantity using ordinary decimal notation.");
  const scale = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const units = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(`${whole}${fraction.padEnd(scale, "0")}`); };
  const result = subtract ? units(left) - units(right) : units(left) + units(right);
  if (result < BigInt(0)) throw new Error("The split quantity cannot exceed the execution quantity.");
  const digits = result.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") || "0" : digits;
}
