import { expect, test } from 'bun:test'
import { brokerOptions, type BrokerProvider } from './broker-catalog'

const provider = (slug: string, overrides: Partial<BrokerProvider> = {}): BrokerProvider => ({
  slug,
  name: slug,
  logoUrl: null,
  enabled: true,
  maintenanceMode: false,
  ...overrides,
})

test('the public catalog keeps regional and paper integrations distinct', () => {
  const options = brokerOptions()
  const slugs = options.map((broker) => broker.slug)
  expect(slugs.slice(0, 4)).toEqual(['ROBINHOOD', 'PUBLIC', 'ETRADE', 'WEALTHSIMPLETRADE'])
  expect(new Set(slugs).size).toBe(slugs.length)
  for (const slug of [
    'WEBULL',
    'WEBULL-CANADA',
    'ALPACA-PAPER',
    'TRADESTATION-SIM',
    'TRADING212-PRACTICE',
    'ZERODHA',
    'AJ-BELL',
  ]) {
    expect(slugs).toContain(slug)
  }
})

test('unknown availability does not invent coming-soon restrictions', () => {
  expect(brokerOptions().every((broker) => broker.unavailableReason === null)).toBe(true)
})

test('client access and broker maintenance determine which rows are disabled', () => {
  const options = brokerOptions([
    provider('ROBINHOOD'),
    provider('PUBLIC', { maintenanceMode: true }),
    provider('ETRADE', { enabled: false }),
  ])
  expect(options.find((broker) => broker.slug === 'ROBINHOOD')?.unavailableReason).toBeNull()
  expect(options.find((broker) => broker.slug === 'PUBLIC')?.unavailableReason).toBe('Maintenance')
  expect(options.find((broker) => broker.slug === 'ETRADE')?.unavailableReason).toBe('Unavailable')
  expect(options.find((broker) => broker.slug === 'SCHWAB')?.unavailableReason).toBe('Not enabled')
})

test('new provider integrations appear and live metadata overrides the snapshot', () => {
  const options = brokerOptions([
    provider('NEW-BROKER', { name: 'New Broker', logoUrl: 'https://example.test/new.png' }),
    provider('ROBINHOOD', { name: 'Updated Name' }),
  ])
  expect(options.find((broker) => broker.slug === 'NEW-BROKER')).toMatchObject({
    name: 'New Broker',
    logoUrl: 'https://example.test/new.png',
    unavailableReason: null,
  })
  expect(options.filter((broker) => broker.slug === 'ROBINHOOD')).toHaveLength(1)
  expect(options.find((broker) => broker.slug === 'ROBINHOOD')).toMatchObject({
    name: 'Updated Name',
    logoUrl: expect.stringContaining('robinhood-logo-square.png'),
  })
})
