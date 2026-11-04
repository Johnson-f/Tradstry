// Runs after `vite build`: writes the static landing page, the app shell that
// every other route is served from, the sitemap and llms.txt into dist/.
import { readFile, writeFile } from 'node:fs/promises'
import { landingDocument, shellDocument, sitemap } from '../src/components/landing/prerender'
import { llmsTxt } from '../src/components/landing/seo'

const dist = new URL('../dist/', import.meta.url)
const template = await readFile(new URL('index.html', dist), 'utf8')

await writeFile(new URL('shell.html', dist), shellDocument(template))
await writeFile(new URL('index.html', dist), landingDocument(template))
await writeFile(new URL('sitemap.xml', dist), sitemap(new Date().toISOString().slice(0, 10)))
await writeFile(new URL('llms.txt', dist), llmsTxt())

console.log('Prerendered index.html; wrote shell.html, sitemap.xml and llms.txt')
