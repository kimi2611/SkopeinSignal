import type { KimiSummary } from '../types'

export const KIMI_IMPORT_LIMIT_BYTES = 120 * 1024

type SummaryDraft = Pick<KimiSummary, 'theme' | 'coreArguments' | 'evidence' | 'expertPerspectives' | 'source'>

const FIELD_ALIASES = {
  theme: ['theme', 'topic', '核心主题', '主题'],
  coreArguments: ['corearguments', 'corepoints', 'keyarguments', 'mainarguments', '核心观点', '主题核心观点', '主要观点'],
  evidence: ['evidence', 'supportingevidence', 'evidencematerials', 'materials', '论证依据', '论证依据材料', '论据'],
  expertPerspectives: ['expertperspectives', 'expertviews', 'perspectives', '专家角度', '不同专家角度', '专家观点'],
} as const

function normalizedKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s_\-—:：#]/g, '')
}

function cleanLine(value: string): string {
  return value.trim().replace(/^(?:[-*+•]|\d+[.)])\s+/, '').trim()
}

function lines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return lines(item)
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const expert = typeof record.expert === 'string' ? record.expert : typeof record.name === 'string' ? record.name : ''
        const perspective = record.perspective ?? record.view ?? record.opinion ?? record.summary
        if (typeof perspective === 'string') return [`${expert ? `${expert}: ` : ''}${perspective}`]
      }
      return []
    })
  }
  if (typeof value !== 'string') return []
  return value.split(/\n+/).map(cleanLine).filter(Boolean)
}

function findJsonField(record: Record<string, unknown>, aliases: readonly string[]): unknown {
  const entry = Object.entries(record).find(([key]) => aliases.includes(normalizedKey(key)))
  return entry?.[1]
}

function parseJson(text: string): SummaryDraft {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The JSON summary must be one object with theme and content fields.')
  const record = parsed as Record<string, unknown>
  const draft = {
    theme: lines(findJsonField(record, FIELD_ALIASES.theme)).join(' '),
    coreArguments: lines(findJsonField(record, FIELD_ALIASES.coreArguments)),
    evidence: lines(findJsonField(record, FIELD_ALIASES.evidence)),
    expertPerspectives: lines(findJsonField(record, FIELD_ALIASES.expertPerspectives)),
    source: 'json' as const,
  }
  return validateDraft(draft)
}

function canonicalHeading(line: string): keyof typeof FIELD_ALIASES | null {
  const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/[*_]/g, '').trim()
  const key = normalizedKey(cleaned)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if ((aliases as readonly string[]).some((alias) => normalizedKey(alias) === key)) return field as keyof typeof FIELD_ALIASES
  }
  return null
}

function parseText(text: string, source: 'markdown' | 'text'): SummaryDraft {
  const sections: Record<'theme' | 'coreArguments' | 'evidence' | 'expertPerspectives', string[]> = {
    theme: [], coreArguments: [], evidence: [], expertPerspectives: [],
  }
  let active: keyof typeof sections | null = null
  let sawHeading = false
  const unstructured: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const heading = canonicalHeading(line)
    if (heading && (/^#{1,6}\s/.test(line) || /[:：]$/.test(line) || line.length < 40)) {
      active = heading
      sawHeading = true
      continue
    }
    if (active) sections[active].push(...lines(line))
    else unstructured.push(...lines(line))
  }

  if (!sections.theme.length && unstructured.length) sections.theme = [unstructured[0]]
  if (!sections.coreArguments.length && unstructured.length > 1) sections.coreArguments = unstructured.slice(1)
  if (!sawHeading && source === 'text' && sections.theme.length && !sections.coreArguments.length) {
    sections.coreArguments = sections.theme.splice(1)
  }
  return validateDraft({ ...sections, theme: sections.theme.join(' '), source })
}

function validateDraft(draft: SummaryDraft): SummaryDraft {
  const cleaned = {
    ...draft,
    theme: draft.theme.trim(),
    coreArguments: draft.coreArguments.map(cleanLine).filter(Boolean),
    evidence: draft.evidence.map(cleanLine).filter(Boolean),
    expertPerspectives: draft.expertPerspectives.map(cleanLine).filter(Boolean),
  }
  if (!cleaned.theme) throw new Error('Add a theme before importing the summary.')
  if (!cleaned.coreArguments.length && !cleaned.evidence.length && !cleaned.expertPerspectives.length) {
    throw new Error('Add at least one core argument, evidence item, or expert perspective.')
  }
  return cleaned
}

export function parseKimiSummary(text: string, explicitSource?: KimiSummary['source']): SummaryDraft {
  if (new TextEncoder().encode(text).byteLength > KIMI_IMPORT_LIMIT_BYTES) throw new Error('The summary is larger than 120 KB. Split it into a shorter research note.')
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Paste or choose a Kimi summary first.')
  const source = explicitSource ?? (trimmed.startsWith('{') ? 'json' : /^#{1,6}\s/m.test(trimmed) ? 'markdown' : 'text')
  return source === 'json' ? parseJson(trimmed) : parseText(trimmed, source === 'markdown' ? 'markdown' : 'text')
}

function validIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

function cleanStringItems(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

export function sanitizeKimiSummary(value: unknown, now = new Date()): KimiSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const theme = typeof record.theme === 'string' ? record.theme.trim() : ''
  if (!episodeId || !theme) return null

  const fallback = Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString()
  const importedAt = validIsoDate(record.importedAt, fallback)
  const source = record.source === 'json' || record.source === 'markdown' || record.source === 'text' || record.source === 'snipd' || record.source === 'ai' ? record.source : 'text'
  return {
    episodeId,
    theme,
    coreArguments: cleanStringItems(record.coreArguments),
    evidence: cleanStringItems(record.evidence),
    expertPerspectives: cleanStringItems(record.expertPerspectives),
    source,
    importedAt,
    updatedAt: validIsoDate(record.updatedAt, importedAt),
  }
}
