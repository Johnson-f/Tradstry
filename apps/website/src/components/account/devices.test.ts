import { expect, test } from 'bun:test'
import { describeUserAgent, lastActive } from './devices'

test('user agents become readable device labels', () => {
  expect(
    describeUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    ),
  ).toEqual({ label: 'Safari on macOS', isMobile: false })
  expect(
    describeUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ),
  ).toEqual({ label: 'Safari on iOS', isMobile: true })
  expect(describeUserAgent(null).label).toBe('Unknown device')
})

test('last active reads relative to now', () => {
  const now = Date.parse('2026-10-27T12:00:00Z')
  expect(lastActive('2026-10-27T11:55:00Z', now)).toBe('5 minutes ago')
  expect(lastActive('2026-10-27T09:00:00Z', now)).toBe('3 hours ago')
  expect(lastActive('2026-10-25T12:00:00Z', now)).toBe('2 days ago')
  expect(lastActive(null, now)).toBe('Unknown')
})
