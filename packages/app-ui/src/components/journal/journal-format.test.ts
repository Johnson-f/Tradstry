import { describe, expect, test } from "bun:test";
import { calendarDate, dayLabel, formatR, positionHistory, startOfDay } from "./journal-format";

describe("positionHistory", () => {
  const fills = [
    { side: "BUY", quantity: "10" },
    { side: "SELL", quantity: "30" },
    { side: "BUY", quantity: "5" },
    { side: "SELL", quantity: "5" },
  ];

  test("finds the first exit that goes below zero and the smallest starting quantity", () => {
    const history = positionHistory(fills, "long");
    expect(history.steps.map((step) => step.position)).toEqual([10, -20, -15, -20]);
    expect(history.broken).toBe(1);
    expect(history.steps[1]).toEqual({ before: 10, position: -20, short: 20 });
    expect(history.deficit).toBe(20);
  });

  test("a balanced history has no deficit", () => {
    const history = positionHistory(fills.slice(2), "long");
    expect(history.broken).toBe(-1);
    expect(history.deficit).toBe(0);
  });

  test("fractional shares that balance end at exactly zero", () => {
    const history = positionHistory(
      ["1", "0.11994", "0.16355", "0.54776"].map((quantity) => ({ side: "BUY", quantity }))
        .concat([{ side: "SELL", quantity: "1" }, { side: "BUY", quantity: "2" }, { side: "SELL", quantity: "1.83125" }, { side: "SELL", quantity: "1" }]),
      "long",
    );
    expect(history.steps.at(-1)!.position).toBe(0);
    expect(history.broken).toBe(-1);
    expect(history.deficit).toBe(0);
  });

  test("short positions open with sells", () => {
    expect(positionHistory([{ side: "SELL_SHORT", quantity: "4" }, { side: "BUY", quantity: "4" }], "short").deficit).toBe(0);
  });
});

describe("workspace dates", () => {
  test("start of day uses the workspace time zone, including across DST", () => {
    expect(startOfDay("2026-04-06", "America/New_York")).toBe("2026-04-06T04:00:00.000Z");
    expect(startOfDay("2026-12-01", "America/New_York")).toBe("2026-12-01T05:00:00.000Z");
    expect(startOfDay("2026-03-08", "America/New_York")).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfDay("2026-04-06", "UTC")).toBe("2026-04-06T00:00:00.000Z");
  });

  test("calendar date reads the day in the workspace time zone", () => {
    expect(calendarDate("2026-04-07T02:30:00Z", "America/New_York")).toBe("2026-04-06");
    expect(calendarDate("2026-04-07T02:30:00Z", "UTC")).toBe("2026-04-07");
  });
});

describe("formatR", () => {
  test("shows the sign and one decimal", () => {
    expect(formatR("1.2345")).toBe("+1.2R");
    expect(formatR("-0.5")).toBe("−0.5R");
    expect(formatR("0")).toBe("0.0R");
  });

  test("an unknown R is a dash", () => {
    expect(formatR(null)).toBe("—");
    expect(formatR("n/a")).toBe("—");
  });
});

describe("dayLabel", () => {
  test("names the day without shifting it", () => {
    expect(dayLabel("2025-12-19")).toBe("Fri 19 Dec");
  });
});
