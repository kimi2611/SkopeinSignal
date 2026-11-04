import type { Episode, KimiSummary, ListeningNote, PodcastShow, SavedResourceReport, StudySession, VocabularyEntry } from '../types'
import { formatTimecode, transcriptToText } from './transcript'

export function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'untitled-episode'
}

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function linguaCafeText(session: StudySession): string {
  return transcriptToText(session.segments)
}

export function vocabularyCsv(entries: VocabularyEntry[], episode: Episode, show: PodcastShow): string {
  const header = ['Word', 'Translation', 'Language', 'Context', 'Timestamp', 'Episode', 'Show']
  const rows = entries.map((entry) => [
    entry.surface,
    entry.translation,
    entry.language,
    entry.context,
    entry.startSeconds === null ? '' : formatTimecode(entry.startSeconds),
    episode.title,
    show.name,
  ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}`
}

export function handoffMarkdown(episode: Episode, show: PodcastShow, session: StudySession, entries: VocabularyEntry[]): string {
  const transcript = session.segments.map((segment) => {
    const time = segment.start === null ? '' : `**[${formatTimecode(segment.start)}]** `
    return `${time}${segment.text.trim()}`
  }).join('\n\n')
  const vocabulary = entries.length
    ? entries.map((entry) => `| ${mdCell(entry.surface)} | ${mdCell(entry.translation)} | ${mdCell(entry.context)} | ${entry.startSeconds === null ? '—' : formatTimecode(entry.startSeconds)} |`).join('\n')
    : '| (No vocabulary saved for this episode) |  |  |  |'
  return `# ${episode.title}\n\n- Show: ${show.name}\n- Episode ID: ${episode.id}\n- Original page: ${episode.link || 'Not provided'}\n- Audio: ${session.audioMode === 'rss' ? session.audioUrl || episode.audioUrl || 'Not provided' : 'Local file (not included in this document)'}\n- Playback completed: ${session.completedAt || 'Not completed; manually exported by user'}\n- Handoff generated: ${new Date().toISOString()}\n\n## Instructions\n\nThis file was generated locally by SkopeinSignal and is not proof of import into KimiClaw or LinguaCafe. Export the plain-text import file separately; vocabulary can be exported as CSV.\n\n## Transcript\n\n${transcript || '(No transcript)'}\n\n## Vocabulary archive\n\n| Word | Translation | Context | Timestamp |\n| --- | --- | --- | --- |\n${vocabulary}\n`
}

export interface CompositeHandoffSelection {
  transcript: boolean
  summary: boolean
  notes: boolean
  vocabulary: boolean
  sourceLinks: boolean
  resourceReports: boolean
}

export interface CompositeHandoffInput {
  episode: Episode
  show: PodcastShow
  session: StudySession
  entries: VocabularyEntry[]
  summary?: KimiSummary
  notes: ListeningNote[]
  resourceReports: SavedResourceReport[]
  selection: CompositeHandoffSelection
  generatedAt?: string
}

/** Build one finished document without changing any of the legacy handoff files. */
export function compositeHandoffMarkdown(input: CompositeHandoffInput): string {
  return compositeHandoff(input, 'markdown')
}

export function compositeHandoffText(input: CompositeHandoffInput): string {
  return compositeHandoff(input, 'text')
}

function compositeHandoff(input: CompositeHandoffInput, format: 'markdown' | 'text'): string {
  const { episode, show, session, entries, summary, notes, resourceReports, selection } = input
  const markdown = format === 'markdown'
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const heading = (level: number, text: string) => markdown ? `${'#'.repeat(level)} ${text}` : text.toLocaleUpperCase()
  const field = (label: string, value: string | number) => markdown ? `- **${label}:** ${value}` : `${label}: ${value}`
  const list = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- None recorded'
  const sections: string[] = [[
    heading(1, `Finished episode document: ${episode.title}`),
    [field('Show', show.name), field('Episode ID', episode.id), field('Generated', generatedAt), field('Audio', 'Not included; keep local audio and original media files separately')].join('\n'),
  ].join('\n\n')]

  if (selection.sourceLinks) {
    const links = [
      episode.link ? field('Original episode', episode.link) : '',
      session.audioMode === 'rss' && (session.audioUrl || episode.audioUrl) ? field('Public audio', session.audioUrl || episode.audioUrl) : '',
      show.feedUrl ? field('Show feed', show.feedUrl) : '',
    ].filter(Boolean)
    sections.push([heading(2, 'Source links'), links.join('\n') || 'No source links were saved for this episode.'].join('\n\n'))
  }

  if (selection.transcript) {
    const transcript = session.segments.map((segment) => {
      const start = segment.start === null ? '' : formatTimecode(segment.start)
      const end = segment.end === null ? '' : formatTimecode(segment.end)
      const timing = start && end ? `${start} → ${end}` : start || 'Untimed'
      return `${markdown ? `**[${timing}]**` : `[${timing}]`} ${segment.text.trim()}`
    }).join('\n\n')
    sections.push([heading(2, 'Original transcript'), transcript || 'No transcript has been saved for this episode.'].join('\n\n'))
  }

  if (selection.summary) {
    sections.push(summary ? [
      heading(2, 'Kimi summary'),
      [field('Source', summary.source), field('Updated', summary.updatedAt)].join('\n'),
      [heading(3, 'Theme'), summary.theme].join('\n\n'),
      [heading(3, 'Core arguments'), list(summary.coreArguments)].join('\n\n'),
      [heading(3, 'Evidence & materials'), list(summary.evidence)].join('\n\n'),
      [heading(3, 'Expert perspectives'), list(summary.expertPerspectives)].join('\n\n'),
    ].join('\n\n') : [heading(2, 'Kimi summary'), 'No Kimi summary has been saved for this episode.'].join('\n\n'))
  }

  if (selection.notes) {
    const content = notes.map((note, index) => [
      heading(3, `Note or draft ${index + 1}`),
      [field('Updated', note.updatedAt), field('Audio position', note.startSeconds === null ? 'Untimed' : formatTimecode(note.startSeconds))].join('\n'),
      note.body,
    ].join('\n\n')).join('\n\n')
    sections.push([heading(2, 'Notes & finished drafts'), content || 'No notes or finished drafts have been saved for this episode.'].join('\n\n'))
  }

  if (selection.vocabulary) {
    const vocabulary = markdown
      ? entries.length ? [
          '| Word | Translation | Language | Context | Timestamp |',
          '| --- | --- | --- | --- | --- |',
          ...entries.map((entry) => `| ${mdCell(entry.surface)} | ${mdCell(entry.translation)} | ${entry.language} | ${mdCell(entry.context)} | ${entry.startSeconds === null ? 'Untimed' : formatTimecode(entry.startSeconds)} |`),
        ].join('\n') : 'No vocabulary has been saved for this episode.'
      : entries.map((entry) => [
          entry.surface,
          field('Translation', entry.translation || 'Not provided'),
          field('Language', entry.language),
          field('Context', entry.context || 'Not provided'),
          field('Timestamp', entry.startSeconds === null ? 'Untimed' : formatTimecode(entry.startSeconds)),
        ].join('\n')).join('\n\n') || 'No vocabulary has been saved for this episode.'
    sections.push([heading(2, 'Vocabulary'), vocabulary].join('\n\n'))
  }

  if (selection.resourceReports) {
    const reports = resourceReports.map((saved, reportIndex) => {
      const report = saved.report
      const comparisons = report.comparisons.map((comparison, sourceIndex) => {
        const resource = comparison.resource
        const provenance = resource.provenance?.map((item) => `${item.database} · ${item.retrieval} · ${item.retrievedAt}`).join(' | ')
        return [
          heading(4, `Source ${sourceIndex + 1}: ${resource.title}`),
          [
            field('Authors', resource.authors.join(', ') || 'Not listed'),
            field('Year', resource.year ?? 'Not listed'),
            field('Venue', resource.venue || 'Not listed'),
            field('Database', resource.database),
            field('DOI', resource.doi || 'Not provided'),
            field('Landing page', resource.url || 'Not provided'),
            field('Evidence scope', comparison.evidenceScope),
            field('Metadata verification', resource.verification?.status ?? 'Not recorded'),
            provenance ? field('Source retrieval', provenance) : '',
          ].filter(Boolean).join('\n'),
          resource.abstract ? [heading(5, 'Abstract returned by the database'), resource.abstract].join('\n\n') : '',
          [heading(5, 'Expert view · AI paraphrase'), comparison.expertView].join('\n\n'),
          [heading(5, 'Where the ideas meet'), comparison.alignment].join('\n\n'),
          [heading(5, 'Key difference'), comparison.keyDifference].join('\n\n'),
        ].filter(Boolean).join('\n\n')
      }).join('\n\n')
      return [
        heading(3, `Resources report ${reportIndex + 1}: ${saved.title}`),
        [field('Query', report.query), field('Searched', report.searchedAt), field('Saved report updated', saved.updatedAt)].join('\n'),
        saved.idea ? [heading(4, 'Idea investigated'), saved.idea].join('\n\n') : '',
        report.sourceOutcomes?.length ? [heading(4, 'Search receipt'), list(report.sourceOutcomes.map((source) => `${source.database}: ${source.status}; ${source.recordCount} usable records`))].join('\n\n') : '',
        [heading(4, 'Overall comparison'), report.overallComparison].join('\n\n'),
        [heading(4, 'Implementation possibility'), report.feasibility].join('\n\n'),
        [heading(4, 'What must be true'), list(report.assumptions)].join('\n\n'),
        [heading(4, 'Smallest useful next experiment'), report.nextExperiment].join('\n\n'),
        [heading(4, 'Evidence limits'), list(report.caveats)].join('\n\n'),
        [heading(4, 'Expert comparisons'), comparisons || 'No source comparisons were saved in this report.'].join('\n\n'),
        'Evidence remains limited to the saved metadata and abstracts. This is not a full-text systematic review.',
      ].filter(Boolean).join('\n\n')
    }).join('\n\n')
    sections.push([heading(2, 'Resources reports'), reports || 'No Resources reports are linked to this episode.'].join('\n\n'))
  }

  return `${sections.join('\n\n')}\n`
}

export function handoffFiles(episode: Episode, show: PodcastShow, session: StudySession, entries: VocabularyEntry[]): File[] {
  const base = safeFilename(`${show.shortName}-${episode.title}`)
  return [
    new File([handoffMarkdown(episode, show, session, entries)], `${base}-KimiClaw.md`, { type: 'text/markdown;charset=utf-8' }),
    new File([linguaCafeText(session)], `${base}-LinguaCafe.txt`, { type: 'text/plain;charset=utf-8' }),
    new File([vocabularyCsv(entries, episode, show)], `${base}-vocabulary.csv`, { type: 'text/csv;charset=utf-8' }),
  ]
}

export async function shareHandoff(files: File[], title: string): Promise<'shared' | 'unavailable' | 'cancelled'> {
  if (!navigator.share) return 'unavailable'
  if (navigator.canShare && !navigator.canShare({ files })) return 'unavailable'
  try {
    await navigator.share({ files, title, text: 'SkopeinSignal study handoff: transcript, LinguaCafe plain text, and vocabulary.' })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'unavailable'
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}
