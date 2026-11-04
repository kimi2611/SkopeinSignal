/**
 * Lightweight word-family (lemma) grouping for the vocabulary decks.
 *
 * This is a marking aid, not a linguistic lemmatizer: it folds common English and
 * German inflections (plurals, verb endings, possessives) back to an approximate
 * stem so that "running", "ran"-style neighbours such as "runs" and "run" can be
 * flagged as one family. It never deletes or merges cards — it only marks them.
 * Chinese surfaces carry no inflection and group only on exact form.
 */

const CJK = /[一-鿿㐀-䶿]/
const GERMAN_HINT = /[äöüßÄÖÜ]/

function normalize(surface: string): string {
  return surface
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/^[“”"'‘’„‚«»()[\]{}.,;:!?¿¡…—–-]+|[“”"'‘’„‚«»()[\]{}.,;:!?¿¡…—–-]+$/g, '')
}

function undouble(stem: string): string {
  // running → run, stopped → stop; keep ss/ll/ff endings (miss, staff).
  return /([^lszfe])\1$/.test(stem) ? stem.slice(0, -1) : stem
}

function englishStem(word: string): string {
  let w = word
  if (w.endsWith("'s") || w.endsWith('’s')) w = w.slice(0, -2)
  if (w.length >= 5 && w.endsWith('ied')) return `${w.slice(0, -3)}y` // studied → study
  if (w.length >= 6 && w.endsWith('ing')) {
    const stem = undouble(w.slice(0, -3))
    return stem.length >= 3 ? stem : w
  }
  if (w.length >= 5 && w.endsWith('ed')) {
    const stem = undouble(w.slice(0, -2))
    return stem.length >= 3 ? stem : w
  }
  if (w.length >= 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y` // studies → study
  if (w.length >= 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2) // watches → watch
  if (w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) {
    const stem = w.slice(0, -1)
    return stem.length >= 3 ? stem : w
  }
  return w
}

function germanStem(word: string): string {
  const w = word
  if (w.length >= 6 && w.endsWith('sten')) return w.slice(0, -4)
  if (w.length >= 5 && w.endsWith('en')) return w.slice(0, -2) // machen → mach
  if (w.length >= 5 && w.endsWith('em')) return w.slice(0, -2)
  if (w.length >= 5 && w.endsWith('er')) return w.slice(0, -2) // schneller → schnell (approximate)
  if (w.length >= 5 && w.endsWith('es')) return w.slice(0, -2) // des Hundes → hund (approximate)
  if (w.length >= 5 && w.endsWith('st')) return w.slice(0, -2) // machst → mach
  if (w.length >= 5 && w.endsWith('et')) return w.slice(0, -2) // arbeitet → arbeit
  if (w.length >= 5 && w.endsWith('t')) return w.slice(0, -1) // macht → mach
  if (w.length >= 5 && w.endsWith('e')) return w.slice(0, -1) // mache → mach
  if (w.length >= 5 && w.endsWith('n')) return w.slice(0, -1)
  if (w.length >= 5 && w.endsWith('s') && !/(ss|ß)$/.test(w)) return w.slice(0, -1)
  return w
}

/** Approximate family key for a marked word. Multi-word surfaces key on the full phrase. */
export function lemmaKey(surface: string, language?: string): string {
  const base = normalize(surface)
  if (!base) return ''
  if (CJK.test(base)) return base
  if (base.includes(' ')) return base // phrases group only on identical wording
  const german = language === 'Deutsch' || GERMAN_HINT.test(base)
  return german ? germanStem(base) : englishStem(base)
}

export interface LemmaFamily {
  key: string
  memberIds: string[]
  surfaces: string[]
}

/**
 * Group entries into word families. Only families with two or more distinct
 * surfaces are returned — a lone form is never marked as a duplicate.
 */
export function findLemmaFamilies(entries: Array<{ id: string; surface: string; language?: string }>): Map<string, LemmaFamily> {
  const byLemma = new Map<string, Array<{ id: string; surface: string }>>()
  for (const entry of entries) {
    const key = lemmaKey(entry.surface, entry.language)
    if (!key) continue
    const bucket = byLemma.get(key) ?? []
    bucket.push({ id: entry.id, surface: entry.surface })
    byLemma.set(key, bucket)
  }
  const families = new Map<string, LemmaFamily>()
  for (const [key, members] of byLemma) {
    const surfaces = [...new Set(members.map((member) => member.surface.toLowerCase()))]
    if (members.length < 2 || surfaces.length < 2) continue
    families.set(key, { key, memberIds: members.map((member) => member.id), surfaces })
  }
  return families
}

/** entry id → family (only entries inside a multi-form family). */
export function familyByEntry(entries: Array<{ id: string; surface: string; language?: string }>): Map<string, LemmaFamily> {
  const map = new Map<string, LemmaFamily>()
  for (const family of findLemmaFamilies(entries).values()) {
    for (const id of family.memberIds) map.set(id, family)
  }
  return map
}
