import type { CardProgress } from '../types'

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000
const MAX_INTERVAL_DAYS = 36_500
const MAX_REVIEW_COUNT = 1_000_000

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const bounded = Math.min(maximum, Math.max(minimum, value))
  return integer ? Math.round(bounded) : bounded
}

function validIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

export function sanitizeCardProgress(value: unknown, now = new Date()): CardProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const vocabularyId = typeof record.vocabularyId === 'string' ? record.vocabularyId.trim() : ''
  if (!vocabularyId) return null

  const fallback = Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString()
  const lastReviewedAt = typeof record.lastReviewedAt === 'string' && Number.isFinite(new Date(record.lastReviewedAt).getTime())
    ? new Date(record.lastReviewedAt).toISOString()
    : undefined
  return {
    vocabularyId,
    dueAt: validIsoDate(record.dueAt, fallback),
    intervalDays: boundedNumber(record.intervalDays, 0, 0, MAX_INTERVAL_DAYS, true),
    ease: boundedNumber(record.ease, 2.5, 1.3, 3.2),
    repetitions: boundedNumber(record.repetitions, 0, 0, MAX_REVIEW_COUNT, true),
    lapses: boundedNumber(record.lapses, 0, 0, MAX_REVIEW_COUNT, true),
    lastReviewedAt,
  }
}

export function isDue(progress: CardProgress | undefined, now = Date.now()): boolean {
  if (!progress) return true
  const due = new Date(progress.dueAt).getTime()
  return !Number.isFinite(due) || due <= now
}

export function isNew(progress: CardProgress | undefined): boolean {
  return !progress || (!progress.lastReviewedAt && progress.repetitions === 0 && progress.lapses === 0)
}

export function reviewCard(progress: CardProgress | undefined, grade: ReviewGrade, now = new Date()): CardProgress {
  const reviewDate = Number.isFinite(now.getTime()) ? now : new Date()
  const previous: CardProgress = sanitizeCardProgress(progress, reviewDate) ?? {
    vocabularyId: '',
    dueAt: reviewDate.toISOString(),
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
  }
  let ease = previous.ease
  let intervalDays = previous.intervalDays
  let repetitions = previous.repetitions
  let lapses = previous.lapses
  let due = reviewDate.getTime()

  if (grade === 'again') {
    ease = Math.max(1.3, ease - 0.2)
    intervalDays = 0
    repetitions = 0
    lapses += 1
    due += 10 * MINUTE
  } else {
    if (grade === 'hard') {
      ease = Math.max(1.3, ease - 0.15)
      intervalDays = Math.max(1, Math.round((intervalDays || 0.5) * 1.2))
    } else if (grade === 'good') {
      intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(1, Math.round(intervalDays * ease))
    } else {
      ease = Math.min(3.2, ease + 0.15)
      intervalDays = repetitions === 0 ? 4 : Math.max(1, Math.round((intervalDays || 1) * ease * 1.3))
    }
    repetitions = Math.min(MAX_REVIEW_COUNT, repetitions + 1)
    due += intervalDays * DAY
  }

  return {
    ...previous,
    dueAt: new Date(due).toISOString(),
    intervalDays,
    ease: Math.round(ease * 100) / 100,
    repetitions,
    lapses: Math.min(MAX_REVIEW_COUNT, lapses),
    lastReviewedAt: reviewDate.toISOString(),
  }
}
