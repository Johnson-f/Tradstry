import { expect, test } from 'bun:test'
import { formatDate, formatMoney, localToday } from './format'

test('localToday uses the local calendar date', () => {
  expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
})

test('plain dates are not shifted by the time zone', () => {
  expect(formatDate('2026-01-01')).toContain('2026')
  expect(formatDate('2026-01-01')).toContain('1')
  expect(formatDate(null)).toBe('—')
  expect(formatDate('not a date')).toBe('—')
})

test('money falls back when the currency is not a three-letter code', () => {
  expect(formatMoney(null, 'USD')).toBe('—')
  expect(formatMoney(12.5, 'USDT')).toBe(`${(12.5).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`)
  expect(formatMoney(12.5, null)).toBe((12.5).toLocaleString(undefined, { maximumFractionDigits: 2 }))
})
