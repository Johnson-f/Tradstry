import { expect, test } from 'bun:test'
import { formatDate, formatDateTime, formatMoney, localToday, parseLocalDay, setDisplayTimeZone } from './format'

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

test('plain dates parse to the same local day and reject impossible ones', () => {
  const day = parseLocalDay('2026-03-08')
  expect(day && [day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 2, 8])
  expect(day && localToday(day)).toBe('2026-03-08')
  expect(parseLocalDay('2026-02-30')).toBeUndefined()
  expect(parseLocalDay('')).toBeUndefined()
})

test('times follow the display time zone; calendar dates never shift', () => {
  setDisplayTimeZone('MARKET')
  expect(formatDateTime('2026-01-05T15:00:00Z')).toContain('10:00')
  expect(formatDate('2026-01-06T03:00:00Z')).toContain('5')
  expect(formatDate('2026-03-08')).toContain('8')
  setDisplayTimeZone('LOCAL')
  expect(formatDate('2026-03-08')).toContain('8')
})
