import type { WorkspaceState } from '../types'

export interface UnifiedSearchResult {
  id: string
  kind: 'transcript' | 'note' | 'vocabulary' | 'spark' | 'resource'
  title: string
  detail: string
  episodeId: string | null
  startSeconds: number | null
}

const KIND_LIMIT = 12
const SNIPPET_RADIUS = 90

function includesNeedle(value: string | null | undefined, needle: string): boolean {
  return !!value && value.toLocaleLowerCase().includes(needle)
}

function snippet(value: string, needle: string): string {
  const lower = value.toLocaleLowerCase()
  const index = lower.indexOf(needle)
  if (index < 0) return value.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(value.length, index + needle.length + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`
}

export function searchWorkspace(state: WorkspaceState, query: string): UnifiedSearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle.length < 2) return []
  const episodeById = new Map(state.episodes.map((episode) => [episode.id, episode]))
  const results: UnifiedSearchResult[] = []
  const push = (entries: UnifiedSearchResult[]) => {
    results.push(...entries.slice(0, KIND_LIMIT))
  }

  push(state.studySessions.flatMap((session) => {
    const episode = episodeById.get(session.episodeId)
    return session.segments.filter((segment) => includesNeedle(segment.text, needle)).map((segment) => ({
      id: `transcript-${session.episodeId}-${segment.id}`,
      kind: 'transcript' as const,
      title: episode?.title ?? session.episodeId,
      detail: snippet(segment.text, needle),
      episodeId: session.episodeId,
      startSeconds: segment.start,
    }))
  }))

  push(state.notes.filter((note) => includesNeedle(note.body, needle) || includesNeedle(episodeById.get(note.episodeId)?.title, needle)).map((note) => ({
    id: `note-${note.id}`,
    kind: 'note' as const,
    title: episodeById.get(note.episodeId)?.title ?? note.episodeId,
    detail: snippet(note.body, needle),
    episodeId: note.episodeId,
    startSeconds: note.startSeconds,
  })))

  push(state.vocabulary.filter((entry) => [entry.surface, entry.translation, entry.context].some((value) => includesNeedle(value, needle))).map((entry) => ({
    id: `vocabulary-${entry.id}`,
    kind: 'vocabulary' as const,
    title: `${entry.surface} — ${entry.translation}`,
    detail: snippet(entry.context, needle),
    episodeId: entry.episodeId,
    startSeconds: entry.startSeconds,
  })))

  push(state.sparks.filter((spark) => includesNeedle(spark.text, needle) || includesNeedle(spark.reply?.evaluation, needle)).map((spark) => ({
    id: `spark-${spark.id}`,
    kind: 'spark' as const,
    title: episodeById.get(spark.episodeId ?? '')?.title ?? spark.text.slice(0, 70),
    detail: snippet(spark.text, needle),
    episodeId: spark.episodeId,
    startSeconds: null,
  })))

  push(state.resourceReports.filter((report) => [
    report.title,
    report.idea,
    report.report.query,
    report.report.overallComparison,
    ...report.report.comparisons.flatMap((comparison) => [comparison.resource.title, comparison.expertView, comparison.alignment, comparison.keyDifference]),
  ].some((value) => includesNeedle(value, needle))).map((report) => ({
    id: `resource-${report.id}`,
    kind: 'resource' as const,
    title: report.title,
    detail: snippet(`${report.idea}\n${report.report.overallComparison}`, needle),
    episodeId: report.episodeId,
    startSeconds: null,
  })))

  return results
}
