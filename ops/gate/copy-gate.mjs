#!/usr/bin/env node
/**
 * Copy truth gate.
 *
 * A page can boot and still lie. On 2026-11-06 the site shipped "the key lives
 * only in your browser" while the key was AES-256-GCM ciphertext in
 * user_provider_keys on the server — a claim about page behaviour that no
 * smoke test would ever catch. This gate pins the copy that touches money,
 * login, storage and capability, in all three languages.
 *
 * Two layers, because they fail differently:
 *   1. the served bundle — catches stale builds (the old string was still in a
 *      cached chunk long after the source changed);
 *   2. a real browser per locale — catches untranslated keys, which render as
 *      English inside a Chinese page and are invisible to grep.
 *
 * Usage: node copy-gate.mjs <baseUrl> [--json] [--timeout ms]
 * Exit: 0 pass · 1 violation · 2 broken environment
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const puppeteer = require(join(here, 'node_modules', 'puppeteer-core'))

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const asJson = process.argv.includes('--json')
const tArg = process.argv.indexOf('--timeout')
const timeout = tArg > 0 ? Number(process.argv[tArg + 1]) : 25000
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const rules = JSON.parse(readFileSync(join(here, 'copy-rules.json'), 'utf8'))

const violations = []
const say = (s) => { if (!asJson) console.log(s) }

// 1. the bundle actually being served
try {
  const html = await (await fetch(base + '/', { signal: AbortSignal.timeout(timeout) })).text()
  const entry = (html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0]
  if (!entry) { console.error('copy-gate: no entry bundle referenced in index.html'); process.exit(2) }
  const js = await (await fetch(base + entry, { signal: AbortSignal.timeout(timeout * 2) })).text()
  for (const bad of rules.forbidden) if (new RegExp(bad, 'u').test(js)) violations.push({ where: 'bundle', detail: bad, entry })
  for (const need of rules.requiredBundle || []) if (!js.includes(need)) violations.push({ where: 'bundle', detail: `missing required copy: ${need}` })
  say(`bundle ${entry} · ${js.length} bytes · forbidden hits ${violations.length}`)
} catch (err) {
  console.error('copy-gate: cannot fetch the bundle — ' + err.message); process.exit(2)
}

// 2. rendered copy, one page per locale (a hash change does not reload)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  for (const locale of [...new Set(rules.required.map(r => r.locale))]) {
    const page = await browser.newPage()
    await page.goto(base + '/?fresh=' + Date.now(), { waitUntil: 'networkidle2', timeout })
    // the guide is behind the entrance screen; without this it renders 5.7k chars of skeleton
    await page.evaluate(() => localStorage.setItem('skopein.entrance.seen', '1'))
    await page.goto(base + '/#/settings', { waitUntil: 'networkidle2', timeout })
    await new Promise(r => setTimeout(r, 700))
    await page.evaluate((l) => { const s = document.querySelector('#ui-language'); if (s) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })) } }, locale)
    await new Promise(r => setTimeout(r, 1200))
    await page.goto(base + '/#/guide', { waitUntil: 'networkidle2', timeout })
    await new Promise(r => setTimeout(r, 1500))
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true))
    await new Promise(r => setTimeout(r, 600))
    const text = await page.evaluate(() => document.body.innerText)
    const lang = await page.evaluate(() => document.documentElement.lang)
    if (text.length < 20000) violations.push({ where: locale, detail: `guide rendered only ${text.length} chars — page did not load, gate result would be a false pass` })
    for (const bad of rules.forbidden) if (new RegExp(bad, 'u').test(text)) violations.push({ where: locale, detail: bad })
    for (const need of rules.required.filter(r => r.locale === locale)) if (!text.includes(need.phrase)) violations.push({ where: locale, detail: `missing required copy: ${need.phrase}` })
    say(`${locale} (html.lang=${lang}) · ${text.length} chars`)
    await page.close()
  }
} finally { await browser.close() }

if (violations.length) {
  console.error('copy-gate: FAILED')
  for (const v of violations) console.error(`  [${v.where}] ${v.detail}`)
  process.exit(1)
}
console.log('copy-gate: copy matches code behaviour in every locale')
