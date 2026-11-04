import { expect, test } from 'bun:test'
import { QUESTIONS } from '@/components/landing/faq'
import { landingDocument, shellDocument, sitemap } from '@/components/landing/prerender'
import { MCP_URL, PAGE_TITLE, SITE_URL, llmsTxt } from '@/components/landing/seo'

const template = await Bun.file(new URL('../../../index.html', import.meta.url)).text()

function structuredDataIn(html: string) {
  const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1]
  return JSON.parse(json ?? 'null') as { '@graph': Array<Record<string, unknown>> }
}

test('the landing document is readable without JavaScript and describes Tradstry to crawlers', () => {
  const html = landingDocument(template)
  expect(html).toContain(`<title>${PAGE_TITLE}</title>`)
  expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/" />`)
  expect(html).toContain('The trading journal that builds itself.')
  expect(html).not.toContain('<div id="root"></div>')
  for (const { question } of QUESTIONS) expect(html).toContain(question.replace(/'/g, '&#x27;'))

  const graph = structuredDataIn(html)['@graph']
  expect(graph.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'])
  expect((graph[3].mainEntity as unknown[]).length).toBe(QUESTIONS.length)
})

test('every other route gets the empty app, kept out of search results', () => {
  const html = shellDocument(template)
  expect(html).toContain('<meta name="robots" content="noindex" />')
  expect(html).toContain('<div id="root"></div>')
  expect(landingDocument(template)).not.toContain('noindex')
})

test('a changed index.html fails the build instead of shipping an empty page', () => {
  expect(() => landingDocument(template.replace('<div id="root"></div>', '<div id="app"></div>'))).toThrow()
})

test('llms.txt and the sitemap point AI tools and crawlers at the right places', () => {
  const text = llmsTxt()
  expect(text.startsWith('# Tradstry\n')).toBe(true)
  expect(text).toContain(MCP_URL)
  for (const { question } of QUESTIONS) expect(text).toContain(`### ${question}`)
  expect(sitemap('2026-11-04')).toContain(`<loc>${SITE_URL}/</loc>`)
})
