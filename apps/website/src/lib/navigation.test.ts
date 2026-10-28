import { expect, test } from 'bun:test'
import { pageTitle } from './navigation'

test('the breadcrumb names the section', () => {
  expect(pageTitle('/')).toBe('Dashboard')
  expect(pageTitle('/settings')).toBe('Settings')
  expect(pageTitle('/brokerage/oauth/callback')).toBe('Brokerage')
  expect(pageTitle('/w/0192')).toBe('Dashboard')
  expect(pageTitle('/brokerages')).toBe('Dashboard')
})
