import { describe, expect, it } from 'vitest'
import { chunkTranscriptSegments, selectTranscriptScope, transcriptCharacterCount, UNDERSTANDING_MAX_CHUNKS } from './understanding'
import type { UnderstandingSourceSegment } from './understanding'

const segments: UnderstandingSourceSegment[] = Array.from({ length: 12 }, (_, index) => ({
  id: `segment-${index + 1}`,
  start: index * 10,
  end: index * 10 + 9,
  text: `Segment ${index + 1} `.repeat(500),
}))

describe('transcript understanding scope and chunking', () => {
  it('selects opening, middle, and closing transcript thirds without inventing coverage', () => {
    expect(selectTranscriptScope(segments, 'full')).toHaveLength(12)
    expect(selectTranscriptScope(segments, 'opening').map((item) => item.id)).toEqual(['segment-1', 'segment-2', 'segment-3', 'segment-4'])
    expect(selectTranscriptScope(segments, 'middle').map((item) => item.id)).toEqual(['segment-5', 'segment-6', 'segment-7', 'segment-8'])
    expect(selectTranscriptScope(segments, 'closing').map((item) => item.id)).toEqual(['segment-9', 'segment-10', 'segment-11', 'segment-12'])
  })

  it('groups chunks by segment boundaries and preserves ids and timestamps', () => {
    const chunks = chunkTranscriptSegments(segments.slice(0, 8), 6000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flatMap((chunk) => chunk.segments).map((item) => item.id)).toEqual(segments.slice(0, 8).map((item) => item.id))
    expect(chunks.every((chunk) => chunk.segments.every((item) => item.start !== null))).toBe(true)
    expect(transcriptCharacterCount(chunks.flatMap((chunk) => chunk.segments))).toBe(segments.slice(0, 8).reduce((sum, item) => sum + item.text.length, 0))
  })

  it('marks an oversized transcript instead of silently truncating it', () => {
    const chunks = chunkTranscriptSegments([...segments, { id: 'segment-13', start: 120, end: 129, text: 'Segment 13 '.repeat(500) }], 1000)
    expect(chunks.length).toBeGreaterThan(UNDERSTANDING_MAX_CHUNKS)
  })
})
