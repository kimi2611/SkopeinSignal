#!/usr/bin/env node
/**
 * i18n-sync — keeps the zh-CN / de dictionaries in sync with the English source.
 *
 * Source keys come from two places:
 *   1. Every literal first argument of t('…') / t("…") in src/**​/*.{ts,tsx}.
 *   2. Data-file fields that are rendered through t() at runtime:
 *      - src/data/moduleIllustrations.ts → scene
 *      - src/data/recordings.ts          → modification
 *      - src/data/artworks.ts            → license, note
 *      - src/data/artGuides.ts           → sourceLabel (scene/guide use ti())
 *      (Book titles, composer names, performer names etc. stay untranslated by convention.)
 *
 * Usage:
 *   node scripts/i18n-sync.mjs           check only — exit 1 when any key is missing
 *   node scripts/i18n-sync.mjs --fill    insert missing keys (identity placeholder) and exit 0
 *   node scripts/i18n-sync.mjs --report  additionally list stale keys and placeholder mismatches
 *
 * `npm run build` runs this via prebuild with --fill, so a source refresh can never
 * silently ship an untranslated string: the gap is inserted, listed on the console,
 * and waits for a human translation (identity fallback keeps the UI readable meanwhile).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const LOCALES = [
  { locale: 'zh-CN', files: ['src/lib/translations/zh-CN.ts', 'src/lib/translations/research.ts'], exportNames: ['zhCN', 'zhCNResearch'] },
  { locale: 'de', files: ['src/lib/translations/de.ts', 'src/lib/translations/research.ts'], exportNames: ['de', 'deResearch'] },
]
const DATA_FIELDS = [
  { file: 'src/data/moduleIllustrations.ts', field: 'scene' },
  { file: 'src/data/recordings.ts', field: 'modification' },
  { file: 'src/data/recordings.ts', field: 'character' },
  { file: 'src/data/recordings.ts', field: 'note' },
  { file: 'src/data/recordingIllustrations.ts', field: 'scene' },
  { file: 'src/data/artworks.ts', field: 'license' },
  { file: 'src/data/artworks.ts', field: 'note' },
  { file: 'src/data/artGuides.ts', field: 'sourceLabel' },
]

const args = process.argv.slice(2)
const FILL = args.includes('--fill')
const REPORT = args.includes('--report')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

/** Unescape a TS string literal body (without its quotes). */
function unescapeTs(body) {
  return body.replace(/\\(.)/gs, (_, ch) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`' }[ch] ?? ch))
}

function extractTCalls(source) {
  const keys = new Set()
  // t('…'), t("…"), ti('…') — first argument only, tolerant of escaped quotes inside.
  const re = /(?:^|[^\w$])ti?\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/gs
  let match
  while ((match = re.exec(source))) keys.add(unescapeTs(match[2]))
  return keys
}

function extractDataField(source, field) {
  const keys = new Set()
  const re = new RegExp(`\\b${field}:\\s*(['"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`, 'gs')
  let match
  while ((match = re.exec(source))) keys.add(unescapeTs(match[2]))
  return keys
}

function collectSourceKeys() {
  const keys = new Map() // key → first file seen in
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const key of extractTCalls(source)) if (!keys.has(key)) keys.set(key, relative(ROOT, file))
  }
  for (const { file, field } of DATA_FIELDS) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const key of extractDataField(source, field)) if (!keys.has(key)) keys.set(key, `${file} (${field})`)
  }
  return keys
}

/** Parse `"key": "value",` entry lines of every exported dictionary object in a file. */
function parseDictionary(path, exportNames) {
  const source = readFileSync(path, 'utf8')
  const entries = new Map()
  const entryRe = /^\s*"((?:\\.|[^"\\])*)":\s*"((?:\\.|[^"\\])*)",?\s*$/gm
  let match
  while ((match = entryRe.exec(source))) {
    const key = unescapeTs(match[1])
    if (!entries.has(key)) entries.set(key, unescapeTs(match[2]))
  }
  return { source, entries, exportNames }
}

function placeholders(text) {
  return [...text.matchAll(/\{[^{}]+\}/g)].map((m) => m[0]).sort()
}

function main() {
  const sourceKeys = collectSourceKeys()
  let missingTotal = 0
  const problems = []

  for (const { locale, files, exportNames } of LOCALES) {
    const [mainFile, ...extraFiles] = files
    const dicts = [mainFile, ...extraFiles].map((file) => parseDictionary(join(ROOT, file), exportNames))
    const known = new Map()
    for (const dict of dicts) for (const [key, value] of dict.entries) if (!known.has(key)) known.set(key, value)

    const missing = [...sourceKeys.keys()].filter((key) => !known.has(key))
    missingTotal += missing.length

    if (missing.length) {
      console.log(`\n[${locale}] ${missing.length} missing ${missing.length === 1 ? 'key' : 'keys'}:`)
      for (const key of missing) console.log(`  + ${JSON.stringify(key)}   ← ${sourceKeys.get(key)}`)
      if (FILL) {
        const path = join(ROOT, mainFile)
        const dict = dicts[0]
        const additions = missing.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(key)},`).join('\n')
        const tail = /\n}\s*$/
        if (!tail.test(dict.source)) throw new Error(`${mainFile}: cannot locate the final closing brace`)
        writeFileSync(path, dict.source.replace(tail, `\n  // — i18n-sync ${new Date().toISOString().slice(0, 10)}: identity placeholders, translate below —\n${additions}\n}\n`))
        console.log(`  → inserted ${missing.length} identity placeholder(s) into ${mainFile}`)
      }
    }

    if (REPORT) {
      const stale = [...known.keys()].filter((key) => !sourceKeys.has(key))
      if (stale.length) {
        console.log(`\n[${locale}] ${stale.length} stale key(s) no longer referenced by source (kept; harmless):`)
        for (const key of stale.slice(0, 20)) console.log(`  - ${JSON.stringify(key)}`)
        if (stale.length > 20) console.log(`  … and ${stale.length - 20} more`)
      }
      for (const [key, value] of known) {
        const need = placeholders(key)
        const have = placeholders(value)
        if (need.some((ph) => !have.includes(ph))) problems.push(`[${locale}] placeholder mismatch: ${JSON.stringify(key)} → ${JSON.stringify(value)}`)
      }
    }
  }

  console.log(`\nSource keys: ${sourceKeys.size} · locales: ${LOCALES.map((l) => l.locale).join(', ')}`)
  for (const problem of problems) console.log(`WARN ${problem}`)
  if (missingTotal && !FILL) {
    console.log(`FAIL — ${missingTotal} missing key(s). Run \`npm run i18n:sync\` to insert placeholders, then translate them.`)
    process.exit(1)
  }
  console.log(missingTotal ? `OK — placeholders inserted; translate the listed keys to finish.` : `OK — every source key is translated in all locales.`)
}

main()
