import { expect, test } from 'bun:test'
import { pageTitle, workspaceLocation, workspaceSection } from './navigation'

test('the breadcrumb names the section', () => {
  expect(pageTitle('/')).toBe('Dashboard')
  expect(pageTitle('/settings')).toBe('Settings')
  expect(pageTitle('/brokerage/oauth/callback')).toBe('Journal')
  expect(pageTitle('/w/0192')).toBe('Dashboard')
  expect(pageTitle('/w/0192/journal')).toBe('Journal')
  expect(pageTitle('/brokerage/connections')).toBe('Brokerage')
  expect(pageTitle('/brokerages')).toBe('Dashboard')
})

test('switching workspaces keeps the current section', () => {
  expect(workspaceLocation(workspaceSection('/w/main/journal'), 'second')).toEqual({
    to: '/w/$workspaceId/journal',
    params: { workspaceId: 'second' },
  })
  expect(workspaceLocation(workspaceSection('/w/main'), 'second')).toEqual({
    to: '/w/$workspaceId',
    params: { workspaceId: 'second' },
  })
})

test('the sidebar carries the selected workspace between Dashboard and Journal', () => {
  expect(workspaceLocation('journal', 'main').params).toEqual({ workspaceId: 'main' })
  expect(workspaceLocation('dashboard', 'main').params).toEqual({ workspaceId: 'main' })
})

test('a missing workspace falls back to the entry route for the same section', () => {
  expect(workspaceLocation(workspaceSection('/w/deleted/journal'))).toEqual({ to: '/brokerage' })
  expect(workspaceLocation(workspaceSection('/w/deleted'))).toEqual({ to: '/' })
  expect(workspaceSection('/brokerage/connections')).toBe('dashboard')
  expect(workspaceSection('/w/main/journal-notes')).toBe('dashboard')
})
