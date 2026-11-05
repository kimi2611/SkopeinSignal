import { describe, expect, it } from 'vitest'
import { searchWorkspace } from './unifiedSearch'
import type { WorkspaceState } from '../types'

const state = {
  version: 1,
  seedRevision: 1,
  shows: [],
  episodes: [{ id: 'episode-1', showId: 'show-1', title: 'Memory episode', status: 'queue', addedAt: '2026-01-01' }],
  activities: [],
  dismissedPairs: [],
  manualPairs: [],
  settings: { uiLocale: 'en', longCap: 4, mediumCap: 7, microCap: 3, autoRefresh: false, proxyUrl: '' },
  feedStatus: {},
  lastAutoRefresh: null,
  studySessions: [{ episodeId: 'episode-1', positionSeconds: 12, segments: [{ id: 'seg-1', start: 10, end: 20, text: 'Attention routines shape durable memory.' }] }],
  vocabulary: [{ id: 'word-1', episodeId: 'episode-1', surface: 'durable', translation: '持久的', language: 'English', context: 'durable memory', startSeconds: 10, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  notes: [{ id: 'note-1', episodeId: 'episode-1', body: 'Durable memory needs review.', startSeconds: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  pencilDrawings: [],
  summaries: [],
  cardProgress: [],
  quizAttempts: [],
  sparks: [{ id: 'spark-1', episodeId: 'episode-1', text: 'Durable ideas survive testing.', reply: null, createdAt: '2026-01-01' }],
  learningTasks: [],
  resourceReports: [],
  understandings: [],
  claimReviews: [],
  themeMaps: [],
  ideaEvolutions: [],
} as unknown as WorkspaceState

describe('unified workspace search', () => {
  it('matches transcripts, notes, vocabulary, and sparks with real source locations', () => {
    const kinds = searchWorkspace(state, 'durable').map((result) => result.kind)
    expect(kinds).toEqual(expect.arrayContaining(['transcript', 'note', 'vocabulary', 'spark']))
    expect(searchWorkspace(state, 'durable').find((result) => result.kind === 'transcript')?.startSeconds).toBe(10)
  })

  it('does not search on a one-character needle', () => {
    expect(searchWorkspace(state, 'd')).toEqual([])
  })
})
