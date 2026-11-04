import { chromium } from '/home/kimi/.npm-global/lib/node_modules/playwright/index.mjs'

const BASE = process.env.SWEEP_BASE ?? 'http://localhost:3000'
const VIEWS = ['week', 'inbox', 'shows', 'dedupe', 'insights', 'study', 'quiz', 'sparks', 'cards', 'gallery', 'notes', 'guide', 'settings', 'account']
const LOCALES = ['en', 'zh-CN', 'de']
const results = []
const check = (name, ok, detail = '') => { results.push([ok, name, detail]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

const browser = await chromium.launch()

// ---------- A. Every view x every locale loads with clean console ----------
for (const locale of LOCALES) {
  const context = await browser.newContext({ locale })
  const page = await context.newPage()
  const consoleErrors = []
  const badResponses = []
  page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('401')) consoleErrors.push(msg.text()) })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  page.on('response', (res) => { if (res.status() >= 400 && !res.url().includes('/api/trpc')) badResponses.push(`${res.status()} ${res.url()}`) })
  await page.addInitScript((loc) => {
    localStorage.setItem('skopein.entrance.seen', '1')
    const raw = localStorage.getItem('tingwen.workspace.v1')
    if (raw) { const ws = JSON.parse(raw); ws.settings.uiLocale = loc; localStorage.setItem('tingwen.workspace.v1', JSON.stringify(ws)) }
  }, locale)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!localStorage.getItem('tingwen.workspace.v1'), null, { timeout: 10000 })
  await page.evaluate((loc) => {
    const ws = JSON.parse(localStorage.getItem('tingwen.workspace.v1'))
    ws.settings.uiLocale = loc
    localStorage.setItem('tingwen.workspace.v1', JSON.stringify(ws))
  }, locale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  for (const view of VIEWS) {
    await page.evaluate((v) => { location.hash = `#/${v}` }, view)
    await page.waitForTimeout(650)
    const body = await page.textContent('body')
    check(`${locale}/${view} renders content`, body.trim().length > 200, `len=${body.trim().length}`)
  }
  check(`${locale} console clean across ${VIEWS.length} views`, consoleErrors.length === 0, consoleErrors[0] ?? '')
  check(`${locale} no failed asset requests`, badResponses.length === 0, badResponses[0] ?? '')
  await context.close()
}

// ---------- B. Renamed brand appears in all locales ----------
{
  const brandNeedles = {
    en: 'Private Podcast Learning Atelier',
    'zh-CN': '私人播客学习台',
    de: 'Privates Podcast-Lernatelier',
  }
  for (const [locale, needle] of Object.entries(brandNeedles)) {
    const context = await browser.newContext({ locale })
    const page = await context.newPage()
    await page.addInitScript((loc) => {
      localStorage.setItem('skopein.entrance.seen', '1')
      const raw = localStorage.getItem('tingwen.workspace.v1')
      if (raw) { const ws = JSON.parse(raw); ws.settings.uiLocale = loc; localStorage.setItem('tingwen.workspace.v1', JSON.stringify(ws)) }
    }, locale)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!localStorage.getItem('tingwen.workspace.v1'), null, { timeout: 10000 })
    await page.evaluate((loc) => {
      const ws = JSON.parse(localStorage.getItem('tingwen.workspace.v1'))
      ws.settings.uiLocale = loc
      localStorage.setItem('tingwen.workspace.v1', JSON.stringify(ws))
    }, locale)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const body = await page.textContent('body')
    check(`brand renamed ${locale}`, body.includes(needle), needle)
    await context.close()
  }
}

// ---------- C. Sparks: 2 random + 5 linked starters ----------
{
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('skopein.entrance.seen', '1'))
  // sign in via mocked auth so the compose panel renders
  await page.route('**/api/trpc/**', async (route) => {
    const url = route.request().url()
    if (url.includes('auth.me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ result: { data: { json: { id: 7, email: 'o@e.com', name: 'Owner' } } } }]) })
    return route.continue()
  })
  await page.goto(BASE + '/#/sparks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const toggle = page.locator('.sparks-hints-toggle')
  await toggle.click()
  await page.waitForTimeout(400)
  const chips = await page.locator('.sparks-hint-chip').allTextContents()
  check('seven starters offered (2 random + 5 linked)', chips.length === 7, `count=${chips.length}`)
  check('five linked starters anchored', chips.slice(2).every((text) => text.includes('the episode I just heard')), chips[2]?.slice(0, 40) ?? '')
  await context.close()
}

// ---------- D. On-device transcriber: gated UI + real VTT ----------
{
  const context = await browser.newContext()
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('401')) consoleErrors.push(msg.text()) })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.addInitScript(() => localStorage.setItem('skopein.entrance.seen', '1'))
  await page.goto(BASE + '/#/study', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!localStorage.getItem('tingwen.workspace.v1'), null, { timeout: 10000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  check('transcriber hidden before file choice', await page.locator('[data-testid="local-asr"]').count() === 0)
  await page.locator('input[name="audio-mode"][value="local"]').check()
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles('/tmp/asr-sample.wav')
  await page.waitForTimeout(500)
  check('transcriber appears after file choice', await page.locator('[data-testid="local-asr"]').count() === 1)
  check('free + on-device framing shown', (await page.textContent('[data-testid="local-asr"]')).includes('no Kimi quota'))
  check('language select offers en/de only', await page.locator('[data-testid="local-asr"] select').first().locator('option').count() === 2)
  check('quality tier select offers standard/higher', await page.locator('[data-testid="local-asr"] select').nth(1).locator('option').count() === 2)
  await page.locator('[data-testid="local-asr"] button', { hasText: 'Transcribe on this device' }).click()
  const started = Date.now()
  let outcome = 'timeout'
  while (Date.now() - started < 240000) {
    const transcript = await page.locator('#study-transcript').inputValue()
    if (transcript.startsWith('WEBVTT')) { outcome = 'vtt'; break }
    const err = await page.locator('[data-testid="local-asr"] .form-error').textContent().catch(() => '')
    if (err && err.trim()) { outcome = `honest-error: ${err.slice(0, 80)}`; break }
    await page.waitForTimeout(2500)
  }
  console.log(`  asr outcome after ${Math.round((Date.now() - started) / 1000)}s: ${outcome}`)
  check('on-device transcription produced VTT', outcome === 'vtt', outcome)
  if (outcome === 'vtt') {
    const transcript = await page.locator('#study-transcript').inputValue()
    check('vtt has timed cues', /00:00:0\d\.\d{3} --> 00:00:/.test(transcript), transcript.slice(0, 60).replace(/\n/g, ' | '))
  }
  check('transcriber run console clean', consoleErrors.length === 0, consoleErrors[0] ?? '')
  await context.close()
}

const failed = results.filter(([ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) { failed.forEach(([, name, detail]) => console.log(`FAILED: ${name} ${detail}`)); process.exit(1) }
await browser.close()
