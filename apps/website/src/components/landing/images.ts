export interface LandingImage {
  /** File name under public/landing/. */
  file: string
  width: number
  height: number
  /** Flip to true once the file is in public/landing/. */
  ready: boolean
  alt: string
  /** What the artwork should show, for whoever draws it. */
  brief: string
}

export const LANDING_IMAGES = {
  hero: {
    file: 'hero.webp',
    width: 1024,
    height: 1024,
    ready: true,
    alt: 'Tradstry’s fox reviewing a trading journal beside a laptop showing a chart',
    brief: 'Hero mascot in the house style: a Tradstry animal at a desk, reviewing a journal with a small chart beside it.',
  },
  journal: {
    file: 'journal.webp',
    width: 896,
    height: 896,
    ready: true,
    alt: 'Tradstry’s owl writing trade notes in an open journal',
    brief: 'An animal writing in a notebook, a trade ticket clipped to the page.',
  },
  ai: {
    file: 'ai.webp',
    width: 768,
    height: 768,
    ready: true,
    alt: 'Tradstry’s owl reviewing a trading chart in a conversation with an AI assistant',
    brief: 'An animal chatting with a friendly assistant bubble, a small P&L chart between them.',
  },
  cta: {
    file: 'cta.webp',
    width: 448,
    height: 448,
    ready: true,
    alt: 'Tradstry’s fox waving with a journal tucked under one arm',
    brief: 'A full-body animal waving, for the closing "start your journal" section.',
  },
} satisfies Record<string, LandingImage>

/** Not shown on the page: index.html points link previews at it. */
export const SOCIAL_PREVIEW: LandingImage = {
  file: 'og-image.png',
  width: 1200,
  height: 630,
  ready: true,
  alt: 'Tradstry: the trading journal that builds itself',
  brief: 'Link preview card: the Tradstry logo, the headline, and a cropped dashboard.',
}
