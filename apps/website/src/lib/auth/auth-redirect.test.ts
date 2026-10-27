import { beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_RETURN_PATH,
  rememberReturnTo,
  safeReturnPath,
  takeReturnTo,
} from './auth-redirect'

beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as Storage
})

describe('safeReturnPath', () => {
  test('keeps same-origin paths', () => {
    expect(safeReturnPath('/settings?tab=security')).toBe(
      '/settings?tab=security',
    )
  })

  test('refuses anything that could leave the site', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'settings',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnPath(value)).toBeNull()
    }
  })
})

describe('return path storage', () => {
  test('is taken once', () => {
    rememberReturnTo('/settings')
    expect(takeReturnTo()).toBe('/settings')
    expect(takeReturnTo()).toBe(DEFAULT_RETURN_PATH)
  })

  test('a tampered stored value falls back to the default', () => {
    localStorage.setItem('tradstry:return-to', '//evil.example')
    expect(takeReturnTo()).toBe(DEFAULT_RETURN_PATH)
  })

  test('remembering nothing clears an older value', () => {
    rememberReturnTo('/settings')
    rememberReturnTo(null)
    expect(takeReturnTo()).toBe(DEFAULT_RETURN_PATH)
  })
})
