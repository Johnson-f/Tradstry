/**
 * One source of truth for every machine-readable surface: metadata, robots.txt,
 * sitemap.xml, JSON-LD and llms.txt all read from here so they can never disagree.
 */

export const SITE_URL = "https://www.tradstry.com";

export const SITE_NAME = "Tradstry";

export const SITE_TITLE =
  "Tradstry | Trading Journal with a Built-In MCP Server";

/** What an AI assistant quotes when asked what Tradstry is — so it carries the specifics. */
export const SITE_DESCRIPTION =
  "Tradstry is a brokerage-synced trading journal with playbooks, performance analytics, and a built-in MCP server that lets compatible AI tools securely work with your trading record.";

export const SITE_KEYWORDS = [
  "brokerage synced trading journal",
  "trading journal",
  "trade journal software",
  "trading performance analytics",
  "stock trading journal",
  "options trading journal",
  "trading playbook",
  "trading discipline tracker",
  "rule break tracking",
  "trade expectancy",
  "drawdown analysis",
  "MCP server",
  "Model Context Protocol",
] as const;

/**
 * Bumped by hand when public page copy changes. A build-time `new Date()` would mark
 * every route as freshly modified on every deploy, which is a recrawl signal crawlers
 * learn to ignore.
 */
export const CONTENT_LAST_MODIFIED = new Date("2026-08-24");

export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/trading-journal", changeFrequency: "monthly", priority: 0.9 },
  { path: "/mcp", changeFrequency: "monthly", priority: 0.9 },
  { path: "/brokerage-sync", changeFrequency: "monthly", priority: 0.85 },
  { path: "/analytics", changeFrequency: "monthly", priority: 0.85 },
  { path: "/security", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5 },
] as const;

/**
 * Routes that exist behind auth or executable APIs. Auth entry pages are not
 * listed here because crawlers must be able to fetch them and see `noindex`.
 */
export const PRIVATE_PATHS = ["/dashboard/", "/api/"];
