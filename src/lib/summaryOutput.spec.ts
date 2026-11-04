import { describe, expect, it } from 'vitest'
import { buildSummaryNote, buildWritingDraft, summaryToMarkdown, summaryToText } from './summaryOutput'
import type { Episode, KimiSummary, StudySession } from '../types'

const episode: Episode = {
  id: 'episode-summary', guid: 'guid-summary', showId: 'show-1', title: 'A source-linked episode', description: '',
  link: 'https://example.com/episode', audioUrl: 'https://example.com/audio.mp3', publishedAt: '2026-01-01',
  durationMinutes: 30, status: 'queue', addedAt: '2026-01-01', source: 'manual',
}

const summary: KimiSummary = {
  episodeId: episode.id,
  theme: 'How evidence becomes a durable draft',
  coreArguments: ['Start with the source transcript.'],
  evidence: ['A saved passage supports the claim.'],
  expertPerspectives: ['The guest distinguishes speed from reliability.'],
  source: 'text', importedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}

function sessionWithText(text: string): StudySession {
  return {
    episodeId: episode.id, audioMode: 'rss', audioUrl: episode.audioUrl, transcriptFormat: 'txt',
    segments: [{ id: 'segment-1', start: null, end: null, text }], positionSeconds: 0,
    followTranscript: true, updatedAt: '2026-01-02T00:00:00.000Z',
  }
}

describe('summary output', () => {
  it('exports all four summary sections in Markdown and TXT', () => {
    for (const output of [summaryToMarkdown(summary, episode), summaryToText(summary, episode)]) {
      expect(output).toContain(episode.title)
      expect(output).toContain(summary.theme)
      expect(output).toContain(summary.coreArguments[0])
      expect(output).toContain(summary.evidence[0])
      expect(output).toContain(summary.expertPerspectives[0])
      expect(output).toContain(episode.id)
    }
  })

  it('uses the same complete summary when saving it as a note', () => {
    expect(buildSummaryNote(summary, episode)).toBe(summaryToMarkdown(summary, episode))
  })

  it('labels the 12,000-character opening instead of silently truncating a long transcript', () => {
    const draft = buildWritingDraft(episode, summary, sessionWithText(`${'a'.repeat(12020)}UNIQUE_END`))
    expect(draft).toContain('[Opening 12,000 characters only. The complete transcript remains in Listen & Read.]')
    expect(draft).toContain('## Source transcript — opening excerpt')
    expect(draft).not.toContain('UNIQUE_END')
    expect(draft).toContain('## My draft')
  })

  it('keeps a short transcript complete and states honestly when none exists', () => {
    const short = buildWritingDraft(episode, summary, sessionWithText('Complete short source.'))
    expect(short).toContain('Complete short source.')
    expect(short).not.toContain('opening excerpt')
    expect(buildWritingDraft(episode, summary)).toContain('[No saved transcript is attached to this episode.]')
  })
})
