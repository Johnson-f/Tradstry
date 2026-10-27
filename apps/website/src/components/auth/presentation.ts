import { shadcnTheme, type PresentationConfig } from '@stytch/react'

/** Stytch's prebuilt UI drawn with the site's shadcn variables. */
export const presentation: PresentationConfig = {
  theme: shadcnTheme,
  options: { hideHeaderText: true },
}

export const signInPresentation: PresentationConfig = {
  theme: {
    ...shadcnTheme,
    'color-scheme': 'light',
    'font-family': 'Arial, Helvetica, sans-serif',
    'text-base': '16px',
    'button-radius': '999px',
    'input-radius': '999px',
    background: '#ffffff',
    foreground: '#1f1f1f',
    primary: '#1f1f1f',
    'primary-foreground': '#ffffff',
    input: '#e3e3e3',
    border: '#dadce0',
    'muted-foreground': '#808080',
    'container-border': 'transparent',
    'container-width': '400px',
  },
  options: { hideHeaderText: true },
}
