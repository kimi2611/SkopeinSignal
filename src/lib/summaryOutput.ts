import type { Episode, KimiSummary, StudySession } from '../types'
import { transcriptToText } from './transcript'

const WRITING_TRANSCRIPT_LIMIT = 12000

function markdownList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- None recorded'
}

export function summaryBodyMarkdown(summary: KimiSummary): string {
  return [
    '## Theme',
    summary.theme,
    '## Core arguments',
    markdownList(summary.coreArguments),
    '## Evidence & materials',
    markdownList(summary.evidence),
    '## Expert perspectives',
    markdownList(summary.expertPerspectives),
  ].join('\n\n')
}

export function summaryToMarkdown(summary: KimiSummary, episode?: Episode): string {
  return [
    `# ${episode?.title ?? summary.theme}`,
    `- Episode ID: ${summary.episodeId}`,
    `- Summary source: ${summary.source}`,
    `- Summary updated: ${summary.updatedAt}`,
    summaryBodyMarkdown(summary),
  ].join('\n\n')
}

export function summaryToText(summary: KimiSummary, episode?: Episode): string {
  const section = (title: string, items: string[]) => `${title}\n${items.length ? items.map((item) => `- ${item}`).join('\n') : '- None recorded'}`
  return [
    episode?.title ?? summary.theme,
    `Episode ID: ${summary.episodeId}`,
    `Summary source: ${summary.source}`,
    `Summary updated: ${summary.updatedAt}`,
    `THEME\n${summary.theme}`,
    section('CORE ARGUMENTS', summary.coreArguments),
    section('EVIDENCE & MATERIALS', summary.evidence),
    section('EXPERT PERSPECTIVES', summary.expertPerspectives),
  ].join('\n\n')
}

export function buildSummaryNote(summary: KimiSummary, episode: Episode): string {
  return summaryToMarkdown(summary, episode)
}

/** Stage an honest editable draft; long transcripts are excerpted, never silently truncated. */
export function buildWritingDraft(episode: Episode, summary: KimiSummary, session?: StudySession): string {
  const fullTranscript = session ? transcriptToText(session.segments).trim() : ''
  const excerpted = fullTranscript.length > WRITING_TRANSCRIPT_LIMIT
  const transcript = fullTranscript
    ? `${excerpted ? '[Opening 12,000 characters only. The complete transcript remains in Listen & Read.]\n\n' : ''}${fullTranscript.slice(0, WRITING_TRANSCRIPT_LIMIT)}`
    : '[No saved transcript is attached to this episode.]'
  return [
    `# Working draft: ${episode.title}`,
    summaryBodyMarkdown(summary),
    `## Source transcript${excerpted ? ' — opening excerpt' : ''}`,
    transcript,
    '## My draft',
    '',
  ].join('\n\n')
}
