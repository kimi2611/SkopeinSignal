import type { CardProgress, ListeningNote, QuizAttempt, Spark, VocabularyEntry } from '../types'

export type ActivityKind = 'spark' | 'note' | 'quiz' | 'review'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** ISO timestamp the item is sorted by. */
  at: string
  episodeId: string | null
  /** One-line summary, already truncated. */
  title: string
  /** Quiz score out of 100, when kind is 'quiz'. */
  score?: number
}

const MAX_ITEMS = 200
const TITLE_CHARS = 140

export function truncateActivityText(value: string, max = TITLE_CHARS): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

export function buildActivityTimeline(input: {
  sparks: Spark[]
  notes: ListeningNote[]
  quizAttempts: QuizAttempt[]
  cardProgress: CardProgress[]
  vocabulary: VocabularyEntry[]
}): ActivityItem[] {
  const items: ActivityItem[] = []
  const wordById = new Map(input.vocabulary.map((entry) => [entry.id, entry]))

  for (const spark of input.sparks) {
    const at = validIso(spark.createdAt)
    if (!at) continue
    items.push({ id: `spark:${spark.id}`, kind: 'spark', at, episodeId: spark.episodeId ?? null, title: truncateActivityText(spark.text) })
  }

  for (const note of input.notes) {
    const at = validIso(note.createdAt)
    if (!at) continue
    items.push({ id: `note:${note.id}`, kind: 'note', at, episodeId: note.episodeId, title: truncateActivityText(note.body) })
  }

  for (const attempt of input.quizAttempts) {
    const at = validIso(attempt.createdAt)
    if (!at) continue
    items.push({
      id: `quiz:${attempt.id}`,
      kind: 'quiz',
      at,
      episodeId: attempt.episodeId,
      title: truncateActivityText(`${attempt.questions.length} questions`),
      score: attempt.score,
    })
  }

  for (const progress of input.cardProgress) {
    const at = progress.lastReviewedAt ? validIso(progress.lastReviewedAt) : null
    if (!at) continue
    const word = wordById.get(progress.vocabularyId)
    items.push({
      id: `review:${progress.vocabularyId}:${at}`,
      kind: 'review',
      at,
      episodeId: word?.episodeId ?? null,
      title: truncateActivityText(word?.surface ?? progress.vocabularyId),
    })
  }

  return items
    .sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0))
    .slice(0, MAX_ITEMS)
}

export const ACTIVITY_KINDS: ActivityKind[] = ['spark', 'note', 'quiz', 'review']
