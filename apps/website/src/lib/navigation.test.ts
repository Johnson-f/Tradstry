import { expect, test } from 'bun:test'
import { pageTitle, workspaceLocation, workspaceSection } from './navigation'

test('the breadcrumb names the section', () => {
  expect(pageTitle('/app')).toBe('Dashboard')
  expect(pageTitle('/brokerage')).toBe('Journal')
  expect(pageTitle('/settings')).toBe('Settings')
  expect(pageTitle('/tax')).toBe('Realized gains')
  expect(pageTitle('/brokerage/oauth/callback')).toBe('Journal')
  expect(pageTitle('/w/0192')).toBe('Dashboard')
  expect(pageTitle('/w/0192/')).toBe('Dashboard')
  expect(pageTitle('/w/0192/journal')).toBe('Journal')
  expect(pageTitle('/w/0192/analytics')).toBe('Analytics')
  expect(pageTitle('/w/0192/analytics/')).toBe('Analytics')
  expect(pageTitle('/brokerage/connections')).toBe('Journal')
  expect(pageTitle('/settings/workspaces')).toBe('Settings')
  expect(pageTitle('/settings-other')).toBe('Journal')
})

test('switching or creating a workspace keeps Home or Journal selected', () => {
  expect(workspaceLocation('second', workspaceSection('/w/main'))).toEqual({
    to: '/w/$workspaceId',
    params: { workspaceId: 'second' },
  })
  expect(workspaceLocation('second', workspaceSection('/app'))).toEqual({
    to: '/w/$workspaceId',
    params: { workspaceId: 'second' },
  })
  expect(workspaceLocation('second', workspaceSection('/w/main/journal/trade'))).toEqual({
    to: '/w/$workspaceId/journal',
    params: { workspaceId: 'second' },
  })
  expect(workspaceLocation('second')).toEqual({
    to: '/w/$workspaceId/journal',
    params: { workspaceId: 'second' },
  })
})

test('the sidebar keeps the selected workspace between Home and Journal', () => {
  expect(workspaceLocation('main')).toEqual({
    to: '/w/$workspaceId/journal',
    params: { workspaceId: 'main' },
  })
  expect(workspaceLocation('main', 'home')).toEqual({
    to: '/w/$workspaceId',
    params: { workspaceId: 'main' },
  })
})

test('switching workspace keeps Analytics selected', () => {
  expect(workspaceSection('/w/main/analytics')).toBe('analytics')
  expect(workspaceLocation('second', 'analytics')).toEqual({
    to: '/w/$workspaceId/analytics',
    params: { workspaceId: 'second' },
  })
  expect(workspaceLocation(undefined, 'analytics')).toEqual({ to: '/brokerage' })
})

test('Journal without a selected workspace uses its entry route instead of Home', () => {
  expect(workspaceLocation()).toEqual({ to: '/brokerage' })
  expect(workspaceLocation(undefined, 'home')).toEqual({ to: '/app' })
})
