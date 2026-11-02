const THEME_KEY = 'tradstry:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export type Theme = 'light' | 'dark' | 'system'

let stopFollowingSystem: (() => void) | null = null

export function storedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  } catch {
    return 'light'
  }
}

function paint(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Applies a theme now and, for "system", whenever the operating system switches. */
export function applyTheme(theme: Theme, save = true): void {
  paint(theme)
  stopFollowingSystem?.()
  stopFollowingSystem = null
  if (theme === 'system') {
    const media = window.matchMedia(DARK_QUERY)
    const follow = () => paint('system')
    media.addEventListener('change', follow)
    stopFollowingSystem = () => media.removeEventListener('change', follow)
  }
  if (!save) return
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Keep the selected appearance for this visit even if it cannot be saved.
  }
}
