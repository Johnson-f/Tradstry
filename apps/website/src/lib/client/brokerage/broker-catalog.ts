export interface BrokerIdentity {
  slug: string
  name: string
  logoUrl: string | null
}

export interface BrokerProvider extends BrokerIdentity {
  enabled: boolean
  maintenanceMode: boolean
}

export interface BrokerOption extends BrokerIdentity {
  unavailableReason: string | null
}

// Public catalog checked 2026-10-28: https://support.snaptrade.com/brokerages
// Logos: https://snaptrade.com/brokerage-integrations
// Keep the full list visible while client-specific availability loads. Live
// client info supplies current names/logos, availability, and new integrations.
const institutions: Array<[slug: string, name: string, logo: string | null]> = [
  ['AJ-BELL', 'AJ Bell', 'ajbell-logo-square.jpg'],
  ['ALPACA', 'Alpaca', 'alpaca-logo-square.png'],
  ['ALPACA-PAPER', 'Alpaca Paper', 'alpaca-logo-square.png'],
  ['BANK-OF-AMERICA', 'Bank of America', 'bank-of-america-logo-square.png'],
  ['BINANCE', 'Binance', 'binance-logo-square.png'],
  ['BMO-INVESTORLINE', 'BMO InvestorLine', 'bmo.jpg'],
  ['BUX', 'Bux', 'bux-square-logo.jpg'],
  ['CAPITAL-ONE', 'Capital One', 'capital-one-logo-square.png'],
  ['CHASE', 'Chase', 'chase-logo-square.png'],
  ['CIBC-INVESTORS-EDGE', 'CIBC Investor’s Edge', 'cibc.jpg'],
  ['CITI', 'Citi', 'citi-logo-square.png'],
  ['COINBASE', 'Coinbase', 'coinbase-logo-square.jpg'],
  ['COMMSEC', 'CommSec', 'commsec-logo-square.jpg'],
  ['DEGIRO', 'DEGIRO', null],
  ['ETRADE', 'E*Trade', 'etrade-logo-square.jpg'],
  ['EDWARD-JONES', 'Edward Jones', 'edward-jones-logo-square.png'],
  ['EMPOWER', 'Empower', 'empower-logo-square.png'],
  ['ETORO', 'eToro', 'etoro-logo-square.png'],
  ['FIDELITY', 'Fidelity', 'fidelity-logo-square.png'],
  ['HARGREAVES-LANSDOWN', 'Hargreaves Lansdown', 'hargreaves.jpg'],
  ['INTERACTIVE-BROKERS-FLEX', 'Interactive Brokers', 'interactive-brokers-logo-square.png'],
  ['KRAKEN', 'Kraken', 'kraken-logo-square.png'],
  ['MOOMOO', 'Moomoo', 'moomoo-logo-square.jpg'],
  ['NATIONAL-BANK-DIRECT-BROKERAGE', 'National Bank Direct Brokerage', 'nbdb.jpg'],
  ['PNC', 'PNC Bank', 'pnc-logo-square.png'],
  ['PUBLIC', 'Public', 'public-logo-square.png'],
  ['QTRADE-DIRECT-INVESTING', 'Qtrade Direct Investing', 'qtrade.jpg'],
  ['QUESTRADE', 'Questrade', 'questrade-logo-square.png'],
  ['ROBINHOOD', 'Robinhood', 'robinhood-logo-square.png'],
  ['ROBINHOOD-AGENTIC', 'Robinhood Agentic Trading', 'robinhood-logo-square.png'],
  ['SCHWAB', 'Schwab', 'schwab-logo-square.png'],
  ['STAKEAUS', 'Stake Australia', 'stake-logo-square.png'],
  ['TASTYTRADE', 'tastytrade', 'tastytrade-logo-square.png'],
  ['TD-DIRECT-INVESTING', 'TD Direct Investing', 'TDSQUARE.png'],
  ['TIAA', 'TIAA', 'tiaa-logo-square.png'],
  ['TRADESTATION', 'TradeStation', 'tradestation-logo-square.png'],
  ['TRADESTATION-SIM', 'TradeStation Paper', 'tradestation-logo-square.png'],
  ['TRADIER', 'Tradier', 'tradier-logo-square.png'],
  ['TRADING212', 'Trading212', 'trading212-logo-square.png'],
  ['TRADING212-PRACTICE', 'Trading212 Practice', 'trading212-logo-square.png'],
  ['TRANSAMERICA', 'Transamerica', 'transamerica-logo-square.png'],
  ['UPSTOX', 'Upstox', 'upstox-logo-square.png'],
  ['US-BANK', 'US Bank', 'us-bank-logo-square.png'],
  ['VANGUARD', 'Vanguard US', 'vanguard-logo-square.png'],
  ['WEALTHSIMPLETRADE', 'Wealthsimple', 'Wealthsimple-logo-square.png'],
  ['WEBULL', 'Webull', 'webull-logo-square.jpg'],
  ['WEBULL-CANADA', 'Webull Canada', 'webull-logo-square.jpg'],
  ['WELLS-FARGO', 'Wells Fargo', 'wells-fargo-logo-square.png'],
  ['ZERODHA', 'Zerodha', 'zerodha-logo-square.png'],
]

const featured = ['ROBINHOOD', 'PUBLIC', 'ETRADE', 'WEALTHSIMPLETRADE']

export function brokerOptions(providers?: BrokerProvider[]): BrokerOption[] {
  const catalog = new Map<string, BrokerIdentity>(
    institutions.map(([slug, name, logo]) => [
      slug,
      {
        slug,
        name,
        logoUrl: logo ? `https://passiv-brokerage-logos.s3.ca-central-1.amazonaws.com/${logo}` : null,
      },
    ]),
  )
  const live = new Map(providers?.map((provider) => [provider.slug, provider]))
  for (const provider of providers ?? []) {
    catalog.set(provider.slug, {
      ...provider,
      logoUrl: provider.logoUrl ?? catalog.get(provider.slug)?.logoUrl ?? null,
    })
  }
  const rank = (slug: string) => {
    const index = featured.indexOf(slug)
    return index < 0 ? featured.length : index
  }
  return [...catalog.values()]
    .map((broker) => {
      const provider = live.get(broker.slug)
      return {
        ...broker,
        unavailableReason:
          providers === undefined
            ? null
            : !provider
              ? 'Not enabled'
              : provider.maintenanceMode
                ? 'Maintenance'
                : !provider.enabled
                  ? 'Unavailable'
                  : null,
      }
    })
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name))
}
