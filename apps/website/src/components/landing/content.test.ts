import { describe, expect, test } from "bun:test";
import * as content from "./content";

describe("public landing plans", () => {
  test("shows Free and Pro without exposing the internal Founder tier", () => {
    expect(content.PLANS.map((plan) => plan.id)).toEqual(["free", "pro"]);
    expect(content.PLANS.map((plan) => String(plan.id))).not.toContain(
      "founder",
    );
  });
});

describe("landing narrative", () => {
  test("keeps the MCP server visible as a core product capability", () => {
    expect(content.METRICS.some((metric) => metric.label === "MCP tools")).toBe(
      true,
    );
    expect(
      content.PLAN_INCLUDES.some((feature) => /MCP server/i.test(feature)),
    ).toBe(true);
  });

  test("moves from the trading leak to one connected record before pricing", () => {
    expect((content as Record<string, unknown>).LANDING_SECTIONS).toEqual([
      "signal",
      "leak",
      "record",
      "mcp",
      "proof",
      "pricing",
      "faq",
    ]);
  });

  test("uses a static hero when motion or data should be reduced", () => {
    const getOrbitMode = (
      content as unknown as {
        getOrbitMode?: (input: {
          reducedMotion: boolean;
          saveData: boolean;
          viewportWidth: number;
        }) => string;
      }
    ).getOrbitMode;

    expect(
      getOrbitMode?.({
        reducedMotion: true,
        saveData: false,
        viewportWidth: 1440,
      }),
    ).toBe("static");
    expect(
      getOrbitMode?.({
        reducedMotion: false,
        saveData: true,
        viewportWidth: 1440,
      }),
    ).toBe("static");
  });
});
