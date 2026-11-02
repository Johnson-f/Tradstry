import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]

function bootTheme(savedTheme: string | null, blocked = false, systemDark = false) {
  const classes = new Set<string>()
  runInNewContext(bootstrap!, {
    document: {
      documentElement: {
        classList: {
          toggle(name: string, enabled: boolean) {
            if (enabled) classes.add(name)
            else classes.delete(name)
          },
        },
      },
    },
    matchMedia(query: string) {
      expect(query).toBe('(prefers-color-scheme: dark)')
      return { matches: systemDark }
    },
    localStorage: {
      getItem(key: string) {
        if (blocked) throw new Error('Storage unavailable')
        expect(key).toBe('tradstry:theme')
        return savedTheme
      },
    },
  })
  return classes.has('dark')
}

test('saved appearance is applied before styles and the application load', () => {
  expect(bootstrap).toBeDefined()
  expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('rel="stylesheet"'))
  expect(html.indexOf('rel="stylesheet"')).toBeLessThan(html.indexOf('type="module"'))
  expect(bootTheme('dark')).toBe(true)
  expect(bootTheme('light')).toBe(false)
  expect(bootTheme(null)).toBe(false)
})

test('unavailable or invalid stored appearance still boots in light mode', () => {
  expect(bootTheme('invalid')).toBe(false)
  expect(bootTheme(null, true)).toBe(false)
})

test('system appearance follows the operating system', () => {
  expect(bootTheme('system', false, true)).toBe(true)
  expect(bootTheme('system', false, false)).toBe(false)
  expect(bootTheme('light', false, true)).toBe(false)
})
