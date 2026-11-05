import { describe, expect, it } from 'vitest'
import { buildActivityTimeline, truncateActivityText } from './activity'
import type { CardProgress, ListeningNote, QuizAttempt, Spark, VocabularyEntry } from '../types'

const spark: Spark = { id: 's1', episodeId: 'e1', text: '  The   guest assumed growth ', reply: null, createdAt: '2026-11-03T10:00:00Z' }
const note: ListeningNote = { id: 'n1', episodeId: 'e2', body: 'Key point about trade-offs\nsecond line', startSeconds: 12, createdAt: '2026-11-04T09:00:00Z', updatedAt: '2026-11-04T09:00:00Z' }
const quiz: QuizAttempt = {
  id: 'q1',
  episodeId: 'e1',
  questions: [{ id: 'qa', prompt: 'P1', referenceAnswer: 'R1' }, { id: 'qb', prompt: 'P2', referenceAnswer: 'R2' }],
  answers: { qa: 'a', qb: 'b' },
  verdicts: [],
  score: 80,
  createdAt: '2026-11-04T12:00:00Z',
}
const word: VocabularyEntry = { id: 'v1', episodeId: 'e1', surface: 'ephemeral', translation: '短暂的', language: 'English', context: 'fame is ephemeral', startSeconds: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }
const progress: CardProgress = { vocabularyId: 'v1', dueAt: '2027-01-01T00:00:00Z', intervalDays: 4, ease: 2.5, repetitions: 2, lapses: 0, lastReviewedAt: '2026-11-05T08:00:00Z' }

describe('truncateActivityText', () => {
  it('collapses whitespace and trims', () => {
    expect(truncateActivityText('  a \n b  ')).toBe('a b')
  })
  it('truncates long text with an ellipsis', () => {
    const text = 'x'.repeat(200)
    expect(truncateActivityText(text)).toHaveLength(140)
    expect(truncateActivityText(text).endsWith('…')).toBe(true)
  })
})

describe('buildActivityTimeline', () => {
  it('mixes all four kinds sorted newest first', () => {
    const items = buildActivityTimeline({ sparks: [spark], notes: [note], quizAttempts: [quiz], cardProgress: [progress], vocabulary: [word] })
    expect(items.map((item) => item.kind)).toEqual(['review', 'quiz', 'note', 'spark'])
  })

  it('resolves review surface and episode from vocabulary', () => {
    const items = buildActivityTimeline({ sparks: [], notes: [], quizAttempts: [], cardProgress: [progress], vocabulary: [word] })
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('ephemeral')
    expect(items[0].episodeId).toBe('e1')
  })

  it('skips reviews without lastReviewedAt and items with invalid dates', () => {
    const stale: CardProgress = { ...progress, lastReviewedAt: undefined }
    const badSpark: Spark = { ...spark, id: 's2', createdAt: 'not-a-date' }
    const items = buildActivityTimeline({ sparks: [badSpark], notes: [], quizAttempts: [], cardProgress: [stale], vocabulary: [word] })
    expect(items).toHaveLength(0)
  })

  it('carries quiz score and question count', () => {
    const items = buildActivityTimeline({ sparks: [], notes: [], quizAttempts: [quiz], cardProgress: [], vocabulary: [] })
    expect(items[0].score).toBe(80)
    expect(items[0].title).toBe('2 questions')
  })

  it('caps the list at 200 items', () => {
    const many = Array.from({ length: 250 }, (_, index) => ({ ...spark, id: `s${index}`, createdAt: `2026-11-01T00:${String(index % 60).padStart(2, '0')}:00Z` }))
    const items = buildActivityTimeline({ sparks: many, notes: [], quizAttempts: [], cardProgress: [], vocabulary: [] })
    expect(items).toHaveLength(200)
  })

  it('treats free sparks as episode-less', () => {
    const free: Spark = { ...spark, id: 's9', episodeId: null }
    const items = buildActivityTimeline({ sparks: [free], notes: [], quizAttempts: [], cardProgress: [], vocabulary: [] })
    expect(items[0].episodeId).toBeNull()
  })
})
