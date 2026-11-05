import { describe, expect, it } from 'vitest'
import { vocabularyCsv } from './handoff'
import type { Episode, PodcastShow, VocabularyEntry } from '../types'

const show: PodcastShow = {
  id: 'show-1', name: 'The "Listening" Show', shortName: 'Listening', code: 'LS', tier: 'main',
  domain: 'Ideas', language: 'English', role: 'Test show', feedUrl: '', skipStreak: 0, totalSnips: 0,
}

const episode: Episode = {
  id: 'episode-1', guid: 'guid-1', showId: show.id, title: 'A episode, with commas',
  description: '', link: '', audioUrl: '', publishedAt: '2026-01-01', durationMinutes: 20,
  status: 'queue', addedAt: '2026-01-01', source: 'manual',
}

function entry(patch: Partial<VocabularyEntry>): VocabularyEntry {
  return {
    id: 'word-1', episodeId: episode.id, surface: 'observe', translation: '观察', language: 'English',
    context: 'Observe, then "listen".', startSeconds: 65, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    ...patch,
  }
}

describe('episode vocabulary CSV handoff', () => {
  it('exports the documented seven columns in order with a UTF-8 BOM', () => {
    const csv = vocabularyCsv([entry({})], episode, show)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('\uFEFF"Word","Translation","Language","Context","Timestamp","Episode","Show"')
    expect(lines[1]).toBe('"observe","观察","English","Observe, then ""listen"".","01:05","A episode, with commas","The ""Listening"" Show"')
  })

  it('keeps an untimed timestamp empty and flattens multiline context into one CSV record', () => {
    const csv = vocabularyCsv([entry({ context: 'First line\nSecond line', startSeconds: null })], episode, show)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('"First line Second line"')
    expect(lines[1]).toContain('"English","First line Second line",""')
  })

  it('exports only the header for an episode without saved vocabulary', () => {
    expect(vocabularyCsv([], episode, show).split('\n')).toHaveLength(1)
  })
})
