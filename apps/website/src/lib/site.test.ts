import { describe, expect, test } from "bun:test";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_TITLE } from "./site";

describe("public site positioning", () => {
  test("includes the MCP server without making Claude the product identity", () => {
    expect(SITE_DESCRIPTION).toContain("brokerage-synced trading journal");
    expect(SITE_DESCRIPTION).toContain("performance analytics");
    expect(SITE_DESCRIPTION).toMatch(/MCP server/i);
    expect(SITE_TITLE).toMatch(/MCP server/i);
    expect(SITE_KEYWORDS).toContain("MCP server");
    expect(
      [SITE_TITLE, SITE_DESCRIPTION, ...SITE_KEYWORDS].join(" "),
    ).not.toMatch(/claude/i);
  });
});
