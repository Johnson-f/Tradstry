import { expect, test } from 'bun:test'
import { signInRedirectFor } from './auth-guard'

test('signed-out visitors go to sign-in and keep where they were going', () => {
  expect(signInRedirectFor({ isSignedIn: false }, '/settings?tab=1')).toEqual({
    to: '/sign-in',
    search: { next: '/settings?tab=1' },
  })
})

test('signed-in visitors stay', () => {
  expect(signInRedirectFor({ isSignedIn: true }, '/settings')).toBeNull()
})
