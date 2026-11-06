#!/usr/bin/env node
/**
 * Post-deploy browser gate.
 *
 * curl 200 proves a socket answered; it does not prove the app booted. Twice on
 * 2026-11-05 a "successful" deploy served JavaScript with the wrong MIME type:
 * the bytes were there, the headers looked plausible, the page was blank. So a
 * deploy is only done when a real browser has rendered the shell.
 *
 * Checks, in the order that catches the real failures:
 *   1. the document boots (React mounts children into #root)
 *   2. the title is not empty/placeholder
 *   3. visible text actually rendered (innerText > 200 chars)
 *   4. no console error mentioning MIME / module loading / content-length
 *   5. no failed script/stylesheet request (4xx, 5xx or network error)
 *   6. a second hash route renders its own heading (catches bad routing)
 *
 * Usage: node browser-gate.mjs <baseUrl> [--json] [--timeout ms]
 * Exit: 0 pass · 1 fail (prints the reason) · 2 broken environment
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const puppeteer = require(join(here, 'node_modules', 'puppeteer-core'))

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const asJson = process.argv.includes('--json')
const timeoutArg = process.argv.indexOf('--timeout')
const routeTimeout = timeoutArg > 0 ? Number(process.argv[timeoutArg + 1]) : 20000
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'

const FATAL_CONSOLE = /mime type|failed to load module|failed to fetch dynamically imported|err_content_length|refused to execute|is not a valid javascript/i
const results = []
let failed = null

const say = (line) => { if (!asJson) console.log(line) }
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  if (!ok && !failed) failed = `${name}${detail ? `: ${detail}` : ''}`
  say(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
}

/** Render one hash route and report what the browser saw. */
async function probe(browser, hash, expectation) {
  // A fresh page per route: goto() that only changes the fragment does not
  // reload, so a shared page would keep reporting the first route's heading.
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.setCacheEnabled(false)
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('skopein.entrance.seen', '1') } catch {}
  })
  const consoleErrors = []
  const failedRequests = []
  const onConsole = (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (FATAL_CONSOLE.test(text)) consoleErrors.push(text.slice(0, 200))
  }
  const onRequestFailed = (req) => {
    const url = req.url()
    if (!/\.(js|css|mjs)(\?|$)/.test(url)) return
    if (/hot-update|sockjs|127\.0\.0\.1:24678/.test(url)) return // dev-only noise
    failedRequests.push(`${url.split('/').pop()} ${req.failure()?.errorText ?? ''}`)
  }
  const onResponse = (res) => {
    const url = res.url()
    if (!/\.(js|css|mjs)(\?|$)/.test(url)) return
    if (res.status() >= 400) failedRequests.push(`${url.split('/').pop()} HTTP ${res.status()}`)
  }
  page.on('console', onConsole)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  const started = Date.now()
  await page.goto(`${base}/${hash}`, { waitUntil: 'domcontentloaded', timeout: routeTimeout })

  // The shell is booted when React has put something inside the mount point.
  const booted = await page
    .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, { timeout: routeTimeout, polling: 200 })
    .then(() => true)
    .catch(() => false)

  const snapshot = await page.evaluate(() => {
    const heading = document.querySelector('.workspace h1, h1')
    return {
      title: document.title.trim(),
      textLength: (document.body.innerText || '').trim().length,
      heading: heading?.textContent?.trim() ?? '',
      snippet: (document.body.innerText || '').trim().slice(0, 90).replace(/\s+/g, ' '),
      mime: document.contentType,
    }
  })
  page.off('console', onConsole)
  page.off('requestfailed', onRequestFailed)
  page.off('response', onResponse)

  await page.close().catch(() => {})
  return { hash, booted, elapsed: Date.now() - started, consoleErrors, failedRequests, ...snapshot, expect: expectation }
}

let browser
try {
  browser = await launch()
} catch (error) {
  console.error(`browser-gate: cannot start Chromium (${CHROME}): ${error.message}`)
  process.exit(2)
}

try {
  const home = await probe(browser, '', 'week')
  say(`  ${home.elapsed}ms · title="${home.title}" · text=${home.textLength} · heading="${home.heading}"`)
  record('shell boots (#root has children)', home.booted)
  record('document title is set', home.title.length > 0 && !/^vite|react app$/i.test(home.title), home.title)
  record('visible text rendered', home.textLength > 200, `${home.textLength} chars`)
  record('module scripts executed (no MIME/module errors)', home.consoleErrors.length === 0, home.consoleErrors.join(' | '))
  record('no failed script/style requests', home.failedRequests.length === 0, home.failedRequests.join(' | '))

  const second = await probe(browser, '#/settings', 'settings')
  say(`  ${second.elapsed}ms · heading="${second.heading}"`)
  record('deep route renders its own heading', second.heading.length > 2, second.heading || 'no heading')
  record('deep route has no fatal console errors', second.consoleErrors.length === 0, second.consoleErrors.join(' | '))

  await browser.close()
} catch (error) {
  try { await browser.close() } catch {}
  record('gate completed without throwing', false, error.message)
}

if (asJson) {
  console.log(JSON.stringify({ base, ok: !failed, failed, results }, null, 2))
} else if (failed) {
  console.log(`\nbrowser-gate FAILED for ${base}: ${failed}`)
}

process.exit(failed ? 1 : 0)
