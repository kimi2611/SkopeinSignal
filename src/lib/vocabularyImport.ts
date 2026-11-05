export interface VocabularyImportEntry {
  surface: string
  translation: string
}

export type VocabularyFileFormat = 'txt' | 'csv' | 'tsv'

export const MAX_VOCABULARY_IMPORT = 500

function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim()
}

export function parseVocabularyLine(line: string): VocabularyImportEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const byEquals = trimmed.split(/\s*[=＝]\s*/)
  if (byEquals.length >= 2 && byEquals[0].trim()) return { surface: byEquals[0].trim(), translation: byEquals.slice(1).join(' = ').trim() }
  const byTab = trimmed.split('\t')
  if (byTab.length >= 2 && byTab[0].trim()) return { surface: byTab[0].trim(), translation: byTab.slice(1).join(' ').trim() }
  const commaIndex = trimmed.indexOf(',')
  if (commaIndex > 0) return { surface: trimmed.slice(0, commaIndex).trim(), translation: trimmed.slice(commaIndex + 1).trim() }
  const chineseComma = trimmed.indexOf('，')
  if (chineseComma > 0) return { surface: trimmed.slice(0, chineseComma).trim(), translation: trimmed.slice(chineseComma + 1).trim() }
  return { surface: trimmed, translation: '' }
}

export function parseVocabularyLines(text: string): VocabularyImportEntry[] {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map(parseVocabularyLine).filter((item): item is VocabularyImportEntry => !!item)
}

/** Parse ordinary CSV / TSV, including quoted delimiters and escaped quotes. */
function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') quoted = false
      else cell += character
      continue
    }
    if (character === '"' && !cell.trim()) quoted = true
    else if (character === delimiter) {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('INVALID_DELIMITED_FILE')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

const WORD_HEADERS = new Set(['word', 'surface', 'vocabulary', 'term', '单词', '词语', '生词'])
const TRANSLATION_HEADERS = new Set(['translation', 'meaning', 'definition', '翻译', '译文', '释义'])

export function parseVocabularyFileText(text: string, format: VocabularyFileFormat): VocabularyImportEntry[] {
  if (format === 'txt') return parseVocabularyLines(text)
  const rows = parseDelimited(text, format === 'csv' ? ',' : '\t')
  if (!rows.length) return []
  const normalizedHeader = rows[0].map((cell) => cleanCell(cell).toLocaleLowerCase())
  const headerWordIndex = normalizedHeader.findIndex((cell) => WORD_HEADERS.has(cell))
  const hasHeader = headerWordIndex >= 0
  const wordIndex = hasHeader ? headerWordIndex : 0
  const translationIndex = hasHeader
    ? normalizedHeader.findIndex((cell) => TRANSLATION_HEADERS.has(cell))
    : 1
  return rows.slice(hasHeader ? 1 : 0).map((row) => ({
    surface: cleanCell(row[wordIndex] ?? ''),
    translation: cleanCell(translationIndex >= 0 ? row[translationIndex] ?? '' : ''),
  })).filter((item) => !!item.surface)
}
