import puppeteer from '/opt/skopein-whisper/gate/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
const BASE = 'https://skopeinsignal.tail155820.ts.net'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.goto(`${BASE}/#/guide`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('skopein.entrance.seen', '1'))
await new Promise((r) => setTimeout(r, 1200))

async function setLocale(locale) {
  const raw = await page.evaluate(() => localStorage.getItem('tingwen.workspace.v1'))
  const state = raw ? JSON.parse(raw) : {}
  state.settings = { ...(state.settings || {}), uiLocale: locale }
  await page.evaluate((s) => localStorage.setItem('tingwen.workspace.v1', JSON.stringify(s)), state)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('.page-wrap'), { timeout: 45000 })
  await new Promise((r) => setTimeout(r, 1000))
}

async function body(route) {
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('.page-wrap'), { timeout: 45000 })
  await new Promise((r) => setTimeout(r, 1000))
  return page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true })
    return document.body.innerText
  })
}

await setLocale('en')
const en = await body('guide')
const sentences = en.split(/(?<=[.!?])\s+/).filter((s) => /site owner|AI buttons|own key/i.test(s))
console.log('EN:', JSON.stringify(sentences.slice(0, 3), null, 0))

for (const loc of ['zh-CN', 'de']) {
  await setLocale(loc)
  for (const route of ['quiz', 'cards']) {
    const t = await body(route)
    console.log(loc, route, '=>', JSON.stringify(t.replace(/\n+/g, ' | ').slice(0, 320)))
  }
}
await browser.close()
