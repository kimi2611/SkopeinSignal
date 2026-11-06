import puppeteer from '/opt/skopein-whisper/gate/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'

const BASE = 'https://skopeinsignal.tail155820.ts.net'
const GOOD = {
  'zh-CN': /用你自己的|你的 key|你的密钥|自己的 DeepSeek/,
  en: /your own key|your DeepSeek key/i,
  de: /deinen eigenen|deinem eigenen|eigenen DeepSeek/i,
}
const BAD_BROWSERKEY = /只存在你的浏览器|lives only in your browser|ausschließlich in deinem Browser/
const SITE_OWNER = /站主额度|站长额度|site owner|Site-Betreiber|Seitenbetreiber/i

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const calls = []
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/api/trpc') || u.includes('/api/transcribe')) calls.push(`${r.status()} ${u.split('/api/')[1].slice(0, 60)}`)
})

await page.goto(`${BASE}/#/guide`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.evaluate(() => localStorage.setItem('skopein.entrance.seen', '1'))
await new Promise((r) => setTimeout(r, 1500))

const stored = await page.evaluate(() => localStorage.getItem('tingwen.workspace.v1'))
console.log('workspace key present:', !!stored, 'len', stored ? stored.length : 0)

async function setLocale(locale) {
  const raw = await page.evaluate(() => localStorage.getItem('tingwen.workspace.v1'))
  const state = raw ? JSON.parse(raw) : {}
  state.settings = { ...(state.settings || {}), uiLocale: locale }
  await page.evaluate((s) => localStorage.setItem('tingwen.workspace.v1', JSON.stringify(s)), state)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('.page-wrap'), { timeout: 45000 })
  await new Promise((r) => setTimeout(r, 1200))
  return page.evaluate(() => document.documentElement.lang)
}

for (const locale of ['zh-CN', 'de', 'en']) {
  const lang = await setLocale(locale)
  const out = {}
  for (const route of ['guide', 'quiz', 'cards']) {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction(() => !!document.querySelector('.page-wrap'), { timeout: 45000 })
    await new Promise((r) => setTimeout(r, 1200))
    const text = await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => { d.open = true })
      return document.body.innerText
    })
    out[route] = {
      chars: text.length,
      badBrowserKey: (text.match(BAD_BROWSERKEY) || []).length,
      mentionsSiteOwner: (text.match(SITE_OWNER) || []).length,
      ownKeyWording: (text.match(GOOD[locale]) || []).length,
      mixedLang: locale !== 'en' && /Sign in|Your rules|Local review/.test(text),
    }
  }
  console.log(locale, 'html-lang=', lang, JSON.stringify(out))
}

console.log('api calls:', calls.slice(0, 8))
await browser.close()
