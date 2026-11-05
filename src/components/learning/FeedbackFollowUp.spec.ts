import { describe, expect, it } from 'vitest'
import { bestMatchingSegmentStart } from '../../lib/feedbackMatch'
import type { TranscriptSegment } from '../../types'

const segments: TranscriptSegment[] = [
  { id: 'one', start: 10, end: 20, text: 'The host argues that attention routines shape durable memory.' },
  { id: 'two', start: 25, end: 35, text: 'A completely different recipe discusses apples, ovens, and sugar.' },
]

describe('feedback follow-up transcript matching', () => {
  it('returns a real segment timestamp only for positive lexical overlap', () => {
    expect(bestMatchingSegmentStart(segments, 'The feedback says I confused durable memory with attention routines.')).toBe(10)
  })

  it('does not invent a timestamp for unrelated paraphrased feedback', () => {
    expect(bestMatchingSegmentStart(segments, 'My answer needed a clearer discussion of ocean navigation.')).toBeNull()
  })
})
