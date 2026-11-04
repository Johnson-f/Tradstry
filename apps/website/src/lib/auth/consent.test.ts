import { expect, test } from 'bun:test'
import { appIcons, permissions, returnTarget } from './consent'

test('permissions read in Tradstry terms, most important first, identity folded into one line', () => {
  const lines = permissions([
    { scope: 'openid', description: '' },
    { scope: 'offline_access', description: 'Maintain access' },
    { scope: 'email', description: '' },
    { scope: 'tradstry:read', description: 'Read your Tradstry trading journal.' },
    { scope: 'tradstry:write', description: '' },
  ])
  expect(lines.map((line) => line.title)).toEqual([
    'Read your trading journal',
    'Add to your journal',
    'Stay connected',
    'See your name and email address',
  ])
})

test('an unfamiliar scope keeps Stytch’s description', () => {
  expect(permissions([{ scope: 'full_access', description: 'Full access to your account' }])).toEqual([
    { title: 'Full access to your account', detail: '' },
  ])
})

test('the return target names the host and flags apps on this computer', () => {
  expect(returnTarget('https://claude.ai/api/mcp/auth_callback')).toEqual({ host: 'claude.ai', local: false })
  expect(returnTarget('http://localhost:53621/callback')).toEqual({ host: 'localhost', local: true })
  expect(returnTarget('http://127.0.0.1:9000/callback')).toEqual({ host: '127.0.0.1', local: true })
  expect(returnTarget('not a url')).toBeNull()
})

test('app icons: Stytch’s logo first, then the app’s own site', () => {
  expect(
    appIcons({ client_id: 'https://claude.ai/oauth/claude-code-client-metadata', client_name: 'Claude Code' }),
  ).toEqual(['https://claude.ai/apple-touch-icon.png'])
  expect(
    appIcons({
      client_id: 'https://chatgpt.com/oauth/client.json',
      client_name: 'ChatGPT',
      client_logo_url: 'https://persistent.oaistatic.com/sonic/misc/openai-logo.png',
    }),
  ).toEqual(['https://persistent.oaistatic.com/sonic/misc/openai-logo.png', 'https://chatgpt.com/apple-touch-icon.png'])
  expect(appIcons({ client_id: 'connected-app-test-1234', client_name: 'Claude' })).toEqual([
    'https://claude.ai/apple-touch-icon.png',
  ])
  expect(appIcons({ client_id: 'connected-app-test-5678', client_name: 'My Script' })).toEqual([])
})
