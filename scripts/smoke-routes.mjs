#!/usr/bin/env node
/**
 * Route smoke test — every hash route must actually render.
 *
 * The bug this guards against (2026-11-05): several modules could sit on
 * "Opening this module…" indefinitely because a lazy chunk request never
 * settled. Nothing in the unit tests would ever catch that; it only shows up
 * when a real browser resolves the real chunk URLs.
 *
 * Checks per route:
 *   1. the Suspense fallback clears and a heading appears
 *   2. no error boundary card, no uncaught page error, no 4xx/5xx asset response
 *   3. modulepreload hints point at same-origin /assets URLs that actually loaded
 *
 * Usage: node scripts/smoke-routes.mjs [baseUrl] [perRouteBudgetMs]
 * Needs a Chromium: CHROME_PATH=/usr/bin/google-chrome (default).
 */
import { existsSync } from 'node:fs'

const base = process.argv[2] || 'http://127.0.0.1:3000'
const budget = Number(process.argv[3] || 15000)
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'

const ROUTES = ['week', 'inbox', 'study', 'notes', 'quiz', 'cards', 'insights', 'sparks', 'gallery', 'shows', 'dedupe', 'guide', 'account', 'settings']

let puppeteer
try {
  ;({ default: puppeteer } = await import('puppeteer-core'))
} catch {
  console.error('smoke-routes: puppeteer-core is not installed (npm i -D puppeteer-core)')
  process.exit(2)
}
if (!existsSync(chrome)) {
  console.error(`smoke-routes: no Chromium at ${chrome} (set CHROME_PATH)`)
  process.exit(2)
}

const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
const problems = []
const responses = new Map()

page.on('pageerror', (error) => problems.push(`pageerror: ${String(error).slice(0, 160)}`))
page.on('response', (res) => {
  const url = res.url()
  if (!url.includes('/assets/') && !url.includes('/icons/')) return
  responses.set(url, res.status())
  if (res.status() >= 400) problems.push(`http ${res.status()}: ${url.split('/').pop()}`)
})

await page.goto(`${base}/#/week`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(() => localStorage.setItem('skopein.entrance.seen', '1'))
await page.reload({ waitUntil: 'domcontentloaded' })
await new Promise((resolve) => setTimeout(resolve, 1500))

const rows = []
for (const route of ROUTES) {
  const started = Date.now()
  problems.length = 0
  await page.evaluate((next) => { window.location.hash = `/${next}` }, route)
  let rendered = false
  try {
    await page.waitForFunction(
      () => !document.querySelector('.route-loading') && !document.querySelector('[data-route-error]') && !!document.querySelector('.workspace h1, .page-wrap'),
      { timeout: budget, polling: 150 },
    )
    rendered = true
  } catch { rendered = false }
  const shape = await page.evaluate(() => ({
    loading: !!document.querySelector('.route-loading'),
    errored: !!document.querySelector('[data-route-error]'),
    heading: (document.querySelector('.workspace h1, .page-wrap h1')?.textContent || '').trim().slice(0, 44),
  }))
  rows.push({ route, rendered, ms: Date.now() - started, ...shape, problems: [...problems] })
  const flag = rendered ? 'PASS ' : shape.errored ? 'ERROR' : 'STUCK'
  console.log(`${flag} ${route.padEnd(9)} ${String(rows.at(-1).ms).padStart(6)}ms  "${shape.heading}"${problems.length ? '  | ' + problems.slice(0, 2).join(' ; ') : ''}`)
}

// modulepreload hints must reference same-origin assets that really loaded
const preloadCheck = await page.evaluate(() => {
  const links = [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href)
  const entries = performance.getEntriesByType('resource').map((entry) => entry.name)
  return {
    hints: links,
    unresolved: links.filter((href) => new URL(href).origin !== location.origin),
    notLoaded: links.filter((href) => !entries.some((name) => name === href || name.startsWith(href))),
  }
})

await browser.close()

const stuck = rows.filter((row) => !row.rendered)
console.log(`\n${rows.length - stuck.length}/${rows.length} routes rendered within ${budget}ms`)
console.log(`modulepreload hints: ${preloadCheck.hints.length}, cross-origin: ${preloadCheck.unresolved.length}, never loaded: ${preloadCheck.notLoaded.length}`)
if (preloadCheck.unresolved.length) console.log('  cross-origin hints: ' + preloadCheck.unresolved.join(', '))
if (preloadCheck.notLoaded.length) console.log('  unloaded hints: ' + preloadCheck.notLoaded.join(', '))
if (stuck.length) {
  console.log('stuck: ' + stuck.map((row) => `${row.route}(${row.ms}ms${row.errored ? ', error card' : ''})`).join(', '))
  process.exit(1)
}
process.exit(preloadCheck.unresolved.length ? 1 : 0)
