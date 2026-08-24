/** Every unverified claim on the landing page lives here. Replace each TODO before launch. */

/** Rendered by <Faq> and emitted as FAQPage JSON-LD, so both always say the same thing. */
export const FAQS = [
  {
    q: "Which brokers can I connect?",
    a: "Anything SnapTrade supports — 35+ institutions including Schwab, Fidelity, Interactive Brokers, Robinhood, E*TRADE, Webull, Coinbase and eToro. Tradstry pulls your executions and matches them into round trips. You can also add trades by hand if your broker isn't covered.",
  },
  {
    q: "What is MCP, in one sentence?",
    a: "It's the protocol Claude uses to talk to outside tools. Point Claude at Tradstry's MCP server and it can read your trades, analytics, playbooks and notebook — and write to them — without you pasting anything.",
  },
  {
    q: "Does the AI cost extra?",
    a: "No. Over MCP you use your own Claude subscription and your own model, so you're not paying us a margin on tokens.",
  },
  {
    q: "Does it work offline?",
    a: "The desktop app does. It keeps a local database, lets you journal on a plane, and merges cleanly when you reconnect — no last-write-wins data loss.",
  },
  {
    q: "Who owns my data?",
    a: "You do. Export it whenever you like, and deleting your account erases it. We don't sell it, and we don't train on it.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from the account dialog. You keep access until the end of the period you paid for.",
  },
  {
    q: "Which instruments can I journal?",
    a: "Stocks and options. Option trades carry the underlying, call or put, strike, expiration and contract multiplier, and P&L is computed against the multiplier rather than the share price. Futures, forex and spot crypto are not supported yet.",
  },
  {
    q: "How often does Tradstry sync with my broker?",
    a: "Every half hour during US market hours — on the hour and the half hour between 9:00 and 16:00 Eastern — plus a final pass at 16:30 to catch the close, and once over the weekend. Nothing polls overnight, so a sync is never more than thirty minutes behind the market.",
  },
  {
    q: "Is there a Windows or Linux desktop app?",
    a: "Not today. The desktop app is macOS only. Tradstry runs in any modern browser on Windows and Linux, and the browser version has everything except the offline local database.",
  },
  {
    q: "Is there a mobile app?",
    a: "No. Tradstry is responsive and readable on a phone browser, but there is no iOS or Android app, and journalling is designed around a keyboard.",
  },
  {
    q: "Can I share my journal with a coach or a team?",
    a: "No. Tradstry is one account, one trader. There are no seats, roles or shared workspaces — the sync that exists is between your own devices, not between people.",
  },
  {
    q: "What exactly do I get if I export my data?",
    a: "One JSON file containing every row Tradstry holds for you — trades, journal entries, playbooks, principles, tags, notebook folders and notes, brokerage transactions and equity history — plus seven-day download links for any images you uploaded. It downloads from the account page, and exporting deletes nothing.",
  },
  {
    q: "Which account currencies are supported?",
    a: "USD, EUR, GBP, JPY, CAD, AUD and CHF. Each trading account carries its own currency, so a multi-currency book stays separated rather than being converted into one base number.",
  },
];

export type Metric = { value: string; label: string; note: string };
export type Plan = {
  id: "free" | "pro";
  name: string;
  description: string;
  monthlyPrice: string;
  annualPrice: string;
  cta: string;
  features: readonly string[];
};

export const PLACEHOLDER = "TODO";

export const LANDING_SECTIONS = [
  "signal",
  "leak",
  "record",
  "mcp",
  "proof",
  "pricing",
  "faq",
] as const;

export type OrbitMode = "static" | "light" | "full";

export function getOrbitMode({
  reducedMotion,
  saveData,
  viewportWidth,
}: {
  reducedMotion: boolean;
  saveData: boolean;
  viewportWidth: number;
}): OrbitMode {
  if (reducedMotion || saveData) {
    return "static";
  }

  return viewportWidth < 768 ? "light" : "full";
}

/**
 * Product facts, not adoption claims — every one is checkable.
 * 27 = tools in mcp-server/src/tools; 36 = ANALYTICS_SECTIONS + ADVANCED_SECTIONS.
 */
export const METRICS: Metric[] = [
  {
    value: "27",
    label: "MCP tools",
    note: "Connect your journal to compatible AI clients",
  },
  {
    value: "36",
    label: "Analytics computed",
    note: "Expectancy, SQN, drawdown, R-distribution",
  },
  {
    // SnapTrade's own published figure: "400M+ retail investor accounts across 35+
    // financial institutions". We set no brokerage_id filter, so we inherit all of them.
    value: "35+",
    label: "Brokerages supported",
    note: "Schwab, Fidelity, IBKR, Robinhood and more, via SnapTrade",
  },
  {
    value: "0",
    label: "Of your data used for training",
    note: "Export it or delete it, any time",
  },
];

/**
 * A worked example, not anyone's trading record — and the copy says so on the page.
 * Figures are the demo book shown in this page's screenshots, so the two agree:
 * 138 trades, 110 clean / 28 breaking a principle.
 */
export const EXAMPLE = {
  lede: "The rules are the edge. Here is the size of it.",
  body: "One account, one year, 138 trades. Same trader, same setups — split by whether the trade followed the plan that was written before it was taken. Tradstry is what makes that split visible.",
  columns: [
    {
      title: "Followed the plan",
      count: "110 trades",
      tone: "profit",
      rows: [
        { label: "Win rate", value: "70.9%" },
        { label: "Average loss", value: "−0.97R" },
      ],
    },
    {
      title: "Broke a rule",
      count: "28 trades",
      tone: "loss",
      rows: [
        { label: "Win rate", value: "14.3%" },
        { label: "Average loss", value: "−2.45R" },
      ],
    },
  ],
  footnote:
    "Example account — the same book shown in the screenshots on this page. Illustrative figures, not a projection and not a performance claim.",
} as const;

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Build the record before you pay for the analysis.",
    monthlyPrice: "$0",
    annualPrice: "$0",
    cta: "Start free",
    features: [
      "6 workspaces",
      "1 brokerage connection",
      "Unlimited imported trades",
      "1 year of brokerage history",
      "Core journal and dashboard",
      "15 Tradstry AI actions per month",
      "50 MB media storage",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "The complete feedback loop for an active trading practice.",
    monthlyPrice: "$20",
    annualPrice: "$15",
    cta: "Upgrade to Pro",
    features: [
      "Unlimited workspaces and imported trades",
      "5 brokerage connections",
      "Complete analytics and discipline tracking",
      "300 Tradstry AI actions per month",
      "1 GB media storage",
      "MCP access and the macOS desktop app",
    ],
  },
];

export const PLAN_INCLUDES = [
  "Unlimited trades, tags and journal entries",
  "Brokerage sync with automatic trade matching",
  "Full analytics suite — expectancy, SQN, drawdown, R-distribution",
  "Playbooks, principles and discipline tracking",
  "Notebook with offline-first sync",
  "Desktop app for macOS",
  "Authenticated MCP server for your trading record",
];

export const SCREENSHOTS = {
  workspace: {
    src: "/shot-dashboard.png",
    alt: "The Tradstry dashboard",
    ratio: "2992 / 1716",
  },
  journal: {
    src: "/shot-journal.png",
    alt: "The trade journal, with each trade tagged by setup and mistake",
    ratio: "2992 / 1719",
  },
  notebook: {
    src: "/shot-notebook.png",
    alt: "The notebook, with a trading lesson written as a numbered list",
    ratio: "2992 / 1713",
  },
  mcp: {
    src: "/shot-mcp.png",
    alt: "Claude calling the Tradstry MCP server to analyse a trading account",
    ratio: "1782 / 1578",
  },
} satisfies Record<string, { src: string | null; alt: string; ratio: string }>;
