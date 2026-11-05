import { describe, expect, it } from 'vitest'
import { compositeHandoffMarkdown, compositeHandoffText, type CompositeHandoffInput, type CompositeHandoffSelection } from './handoff'
import type { Episode, KimiSummary, ListeningNote, PodcastShow, SavedResourceReport, StudySession, VocabularyEntry } from '../types'

const show: PodcastShow = {
  id: 'show-1', name: 'Evidence Show', shortName: 'Evidence', code: 'EV', tier: 'main', domain: 'Research',
  language: 'English', role: 'Test fixture', feedUrl: 'https://example.com/feed.xml', skipStreak: 0, totalSnips: 0,
}
const episode: Episode = {
  id: 'episode-1', guid: 'guid-1', showId: show.id, title: 'From source to finished draft', description: '',
  link: 'https://example.com/episodes/1', audioUrl: 'https://example.com/episodes/1.mp3', publishedAt: '2026-01-01',
  durationMinutes: 42, status: 'listened', addedAt: '2026-01-01', source: 'manual',
}
const session: StudySession = {
  episodeId: episode.id, audioMode: 'rss', audioUrl: episode.audioUrl, transcriptFormat: 'vtt',
  segments: [{ id: 'segment-1', start: 0, end: 4.5, text: 'The complete source sentence remains in the document.' }],
  positionSeconds: 0, followTranscript: true, updatedAt: '2026-01-02T00:00:00.000Z',
}
const summary: KimiSummary = {
  episodeId: episode.id, theme: 'A traceable writing workflow', coreArguments: ['Preserve the evidence chain.'],
  evidence: ['The source sentence is retained.'], expertPerspectives: ['The guest asks for explicit limits.'],
  source: 'ai', importedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}
const notes: ListeningNote[] = [{
  id: 'note-1', episodeId: episode.id, body: '# Finished draft\nA complete user-written conclusion.',
  startSeconds: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T01:00:00.000Z',
}]
const entries: VocabularyEntry[] = [{
  id: 'word-1', episodeId: episode.id, surface: 'traceable', translation: '可追溯的', language: 'English',
  context: 'A traceable workflow.', startSeconds: 2, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}]
const resourceReports: SavedResourceReport[] = [{
  id: 'report-1', title: 'Fixture research comparison', idea: 'Test whether evidence remains linked.',
  episodeId: episode.id, sparkId: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T02:00:00.000Z',
  report: {
    query: 'evidence chain', searchedAt: '2026-01-02T01:30:00.000Z', overallComparison: 'The records address different parts of the workflow.',
    feasibility: 'Start with one source-linked draft.', assumptions: ['The source remains available.'], nextExperiment: 'Export and reopen one document.',
    caveats: ['Only metadata and the returned abstract were compared.'],
    sourceOutcomes: [{ database: 'OpenAlex', status: 'ok', recordCount: 1 }],
    comparisons: [{
      expertView: 'AI paraphrase of the returned abstract.', alignment: 'Both emphasize provenance.', keyDifference: 'Only this fixture discusses exports.', evidenceScope: 'abstract',
      resource: {
        id: 'resource-fixture', title: 'A test-only scholarly record', authors: ['Fixture Author'], year: 2024, venue: 'Fixture Journal',
        url: 'https://doi.org/10.1000/composite-fixture', doi: '10.1000/composite-fixture', database: 'OpenAlex',
        abstract: 'This abstract is explicit test fixture text, not a production citation.',
        verification: { status: 'cross-verified', sources: ['OpenAlex', 'Crossref'], conflicts: [], checkedAt: '2026-01-02T01:30:00.000Z' },
        provenance: [{ database: 'OpenAlex', retrieval: 'network', retrievedAt: '2026-01-02T01:30:00.000Z' }],
      },
    }],
  },
}]
const allSelected: CompositeHandoffSelection = { transcript: true, summary: true, notes: true, vocabulary: true, sourceLinks: true, resourceReports: true }
const input: CompositeHandoffInput = {
  episode, show, session, entries, summary, notes, resourceReports, selection: allSelected, generatedAt: '2026-01-03T00:00:00.000Z',
}

describe('finished-document composite handoff', () => {
  it('combines every selected content type without losing source or evidence metadata', () => {
    const markdown = compositeHandoffMarkdown(input)
    expect(markdown).toContain('# Finished episode document: From source to finished draft')
    expect(markdown).toContain('The complete source sentence remains in the document.')
    expect(markdown).toContain('A traceable writing workflow')
    expect(markdown).toContain('A complete user-written conclusion.')
    expect(markdown).toContain('| traceable | 可追溯的 | English |')
    expect(markdown).toContain('https://example.com/episodes/1')
    expect(markdown).toContain('https://example.com/feed.xml')
    expect(markdown).toContain('10.1000/composite-fixture')
    expect(markdown).toContain('https://doi.org/10.1000/composite-fixture')
    expect(markdown).toContain('**Evidence scope:** abstract')
    expect(markdown).toContain('**Metadata verification:** cross-verified')
    expect(markdown).toContain('This abstract is explicit test fixture text, not a production citation.')
    expect(markdown).toContain('This is not a full-text systematic review.')
    expect(markdown).toContain('**Audio:** Not included')
  })

  it('exports only checked sections in TXT', () => {
    const text = compositeHandoffText({
      ...input,
      selection: { transcript: false, summary: true, notes: false, vocabulary: false, sourceLinks: false, resourceReports: true },
    })
    expect(text).toContain('KIMI SUMMARY')
    expect(text).toContain('RESOURCES REPORTS')
    expect(text).not.toContain('ORIGINAL TRANSCRIPT')
    expect(text).not.toContain('NOTES & FINISHED DRAFTS')
    expect(text).not.toContain('SOURCE LINKS')
    expect(text).not.toContain('| traceable |')
    expect(text).toContain('DOI: 10.1000/composite-fixture')
  })

  it('does not invent section content when nothing is selected', () => {
    const markdown = compositeHandoffMarkdown({
      ...input,
      selection: { transcript: false, summary: false, notes: false, vocabulary: false, sourceLinks: false, resourceReports: false },
    })
    expect(markdown).toContain(episode.title)
    expect(markdown).not.toContain('## Original transcript')
    expect(markdown).not.toContain('## Kimi summary')
    expect(markdown).not.toContain('## Resources reports')
  })
})
