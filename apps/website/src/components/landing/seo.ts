import { QUESTIONS } from '@/components/landing/faq'

export const SITE_URL = 'https://tradstry.com'
export const MCP_URL = 'https://mcp.tradstry.com/mcp'

export const PAGE_TITLE = 'Tradstry — the trading journal that builds itself'

export const PAGE_DESCRIPTION =
  'Tradstry is a trading journal and analytics app for stock and options traders. Connect your broker, and every fill becomes a trade to journal, analyze and plan from. Ask Claude or ChatGPT about your own numbers.'

const FEATURES = [
  'Read-only brokerage import that rebuilds fills into trades, including scale-ins, partial exits and option legs',
  'Manual fills for brokers that cannot be connected',
  'Trade journal with rich notes, your own edge, entry tactic, tag and mistake labels, and behavior ratings',
  'Analytics: net P&L, win rate, expectancy, profit factor, drawdown, a trading calendar, and breakdowns by edge, symbol, time and mistake',
  'Position sizing calculator and trade plans with split entries and per-workspace risk rules',
  'Separate workspaces for each account',
  'Remote MCP server for Claude, ChatGPT and other AI assistants, read-only unless the trader allows writes',
]

const MCP_TOOLS = {
  read: ['get_overview', 'review_period', 'analyze', 'find_trades', 'get_trade', 'open_positions', 'list_plans', 'size_position'],
  write: ['journal_trade', 'save_plan', 'link_plan'],
}

/** schema.org data for search engines and AI crawlers, built from the same copy as the page. */
export function structuredData() {
  const organization = `${SITE_URL}/#organization`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organization,
        name: 'Tradstry',
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/favicon.svg`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Tradstry',
        url: `${SITE_URL}/`,
        publisher: { '@id': organization },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Tradstry',
        url: `${SITE_URL}/`,
        description: PAGE_DESCRIPTION,
        applicationCategory: 'FinanceApplication',
        applicationSubCategory: 'Trading journal',
        operatingSystem: 'Web',
        image: `${SITE_URL}/landing/og-image.png`,
        featureList: FEATURES,
        publisher: { '@id': organization },
      },
      {
        '@type': 'FAQPage',
        mainEntity: QUESTIONS.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }
}

/** The llms.txt summary (llmstxt.org) that AI tools read to learn what Tradstry is. */
export function llmsTxt() {
  return `# Tradstry

> ${PAGE_DESCRIPTION}

Tradstry does not place trades, hold money, or give investment, tax or legal advice. Brokerage access is read-only.

## Features

${FEATURES.map((feature) => `- ${feature}`).join('\n')}

## AI assistants (MCP)

- Server: ${MCP_URL} (Streamable HTTP; users sign in with their Tradstry account over OAuth)
- Works with Claude (claude.ai, Desktop, mobile, Claude Code), ChatGPT, and any MCP client
- Read tools: ${MCP_TOOLS.read.join(', ')}
- Write tools, only with the trader's separate permission: ${MCP_TOOLS.write.join(', ')}
- Prompts: weekly_review, premarket_plan, trade_postmortem

## FAQ

${QUESTIONS.map(({ question, answer }) => `### ${question}\n\n${answer}`).join('\n\n')}

## Links

- [Home](${SITE_URL}/): what Tradstry does, with examples
- [Sign in or create an account](${SITE_URL}/sign-in)
`
}
