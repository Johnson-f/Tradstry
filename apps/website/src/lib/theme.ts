const THEME_KEY = 'tradstry:theme'

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function setDarkMode(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch {
    // Keep the selected appearance for this visit even if it cannot be saved.
  }
}
