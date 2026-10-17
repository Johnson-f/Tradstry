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
export function executionTime(fill: { executedAt: string | null; precision: string }, timezone?: string) {
  if (!fill.executedAt) return "Date unavailable";
  if (fill.precision !== "timestamp") return tradeDate(fill.executedAt, timezone) + " · time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(fill.executedAt));
}
export function calendarDate(value: string, timezone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function startOfDay(date: string, timezone?: string) {
  const [year, month, day] = date.split("-").map(Number);
  const midnight = Date.UTC(year!, month! - 1, day!);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - instant;
  };
  // A second pass corrects the offset when midnight falls near a DST change.
  const instant = midnight - offset(midnight - offset(midnight));
  return new Date(instant).toISOString();
}
type Direction = "long" | "short";
const opens = (side: string, direction: Direction) => side.toUpperCase().startsWith(direction === "long" ? "BUY" : "SELL");
/** The running position after each execution, and how far the first overshooting exit goes below zero. */
export function positionHistory(rows: { side: string; quantity: string }[], direction: Direction) {
  // Fractional shares must sum exactly, or a balanced history can end at -2e-16.
  const scale = Math.max(0, ...rows.map((row) => row.quantity.trim().split(".")[1]?.length ?? 0));
  const units = (value: string) => {
    const [whole = "0", fraction = ""] = value.trim().split(".");
    return BigInt(whole + fraction.padEnd(scale, "0"));
  };
  const number = (value: bigint) => Number(value) / 10 ** scale;
  let position = BigInt(0);
  const steps = rows.map((row) => {
    const before = position;
    position += opens(row.side, direction) ? units(row.quantity) : -units(row.quantity);
    return {
      before: number(before),
      position: number(position),
      short: before >= BigInt(0) && position < BigInt(0) ? number(-position) : 0,
    };
  });
  const deficit = Math.max(0, ...steps.map((step) => -step.position));
  const broken = steps.findIndex((step) => step.position < 0);
  return { steps, deficit, broken };
}
/** A trade's dates, falling back to its executions when the history is unresolved. */
export function tradeSpan(trade: { openDate: string | null; closeDate: string | null; firstExecutionAt: string | null; lastExecutionAt: string | null }, timezone?: string) {
  const start = trade.openDate ?? trade.firstExecutionAt;
  const end = trade.openDate ? trade.closeDate : trade.lastExecutionAt;
  if (!start) return tradeDate(null);
  const first = tradeDate(start, timezone);
  const last = end ? tradeDate(end, timezone) : null;
  return last && last !== first ? `${first} → ${last}` : first;
}
