import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { LandingPage } from '@/components/landing/landing-page'
import { PAGE_TITLE, SITE_URL, structuredData } from '@/components/landing/seo'

const EMPTY_ROOT = '<div id="root"></div>'
const TITLE = '<title>Tradstry</title>'

// The app redirects signed-in visitors to /app; this keeps them from seeing the
// static page flash first. Stytch keeps its session in this cookie.
const SIGNED_IN_CHECK =
  "<script>if(/(?:^|; )stytch_session=/.test(document.cookie))document.documentElement.classList.add('signed-in')</script>" +
  '<style>.signed-in [data-prerendered]{display:none}</style>'

function landingMarkup() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToString(
    <RouterContextProvider router={router}>
      <LandingPage />
    </RouterContextProvider>,
  )
}

function requireMarker(template: string, marker: string) {
  if (!template.includes(marker)) throw new Error(`index.html no longer contains ${marker}`)
}

/** index.html for "/": the landing page as real HTML, which crawlers that don't run JavaScript can read. */
export function landingDocument(template: string) {
  requireMarker(template, EMPTY_ROOT)
  requireMarker(template, TITLE)
  const jsonLd = JSON.stringify(structuredData()).replace(/</g, '\\u003c')
  return template
    .replace(
      TITLE,
      `<title>${PAGE_TITLE}</title>
    <link rel="canonical" href="${SITE_URL}/" />
    <script type="application/ld+json">${jsonLd}</script>
    ${SIGNED_IN_CHECK}`,
    )
    .replace(EMPTY_ROOT, `<div id="root"><div data-prerendered>${landingMarkup()}</div></div>`)
}

/** The page every other route is served from: the empty app, kept out of search results. */
export function shellDocument(template: string) {
  requireMarker(template, TITLE)
  return template.replace(TITLE, `${TITLE}\n    <meta name="robots" content="noindex" />`)
}

export function sitemap(lastModified: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${lastModified}</lastmod>
  </url>
</urlset>
`
}
