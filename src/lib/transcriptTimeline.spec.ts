import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../types'
import { transcriptToVtt } from './transcript'
import {
  buildTimedSegments,
  clearSegmentTimeline,
  estimateTimelineDrafts,
  parseTimelineTime,
  TimelineValidationError,
  timelineDraftsFromSegments,
  type TimelineDraft,
  type TimelineErrorReason,
} from './transcriptTimeline'

const segments: TranscriptSegment[] = [
  { id: 'a', start: null, end: null, text: 'Four' },
  { id: 'b', start: null, end: null, text: 'Twelve chars' },
]

function drafts(...values: string[]): Record<string, TimelineDraft> {
  return Object.fromEntries(segments.map((segment, index) => [segment.id, {
    start: values[index * 2] ?? '',
    end: values[index * 2 + 1] ?? '',
  }]))
}

function expectTimelineError(run: () => unknown, reason: TimelineErrorReason, segmentIndex: number) {
  try {
    run()
    throw new Error('Expected timeline validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(TimelineValidationError)
    expect(error).toMatchObject({ reason, segmentIndex })
  }
}

describe('imported transcript timeline', () => {
  it('parses minute, hour and fractional-second input without accepting invalid clock values', () => {
    expect(parseTimelineTime('01:05.250')).toBe(65.25)
    expect(parseTimelineTime('1:02:03,5')).toBe(3723.5)
    expect(parseTimelineTime(' 00:00 ')).toBe(0)
    expect(parseTimelineTime('00:60.000')).toBeNull()
    expect(parseTimelineTime('01:05:60')).toBeNull()
    expect(parseTimelineTime('65')).toBeNull()
    expect(parseTimelineTime('not a time')).toBeNull()
  })

  it('creates editable drafts from existing timestamps', () => {
    expect(timelineDraftsFromSegments([{ id: 'timed', start: 65.25, end: 3723.5, text: 'Timed' }])).toEqual({
      timed: { start: '01:05.250', end: '01:02:03.500' },
    })
  })

  it('estimates a proportional review draft and lands exactly on the audio duration', () => {
    const original = structuredClone(segments)
    const estimated = estimateTimelineDrafts(segments, 16)
    expect(estimated.a).toEqual({ start: '00:00.000', end: '00:04.000' })
    expect(estimated.b).toEqual({ start: '00:04.000', end: '00:16.000' })
    expect(buildTimedSegments(segments, estimated, 16).map((segment) => [segment.start, segment.end])).toEqual([[0, 4], [4, 16]])
    expect(segments).toEqual(original)
  })

  it('rejects estimation when audio metadata is unavailable or too short', () => {
    expectTimelineError(() => estimateTimelineDrafts(segments, Number.NaN), 'estimate-too-short', -1)
    expectTimelineError(() => estimateTimelineDrafts(segments, 0.001), 'estimate-too-short', -1)
  })

  it('saves ordered timestamps without changing segment identity or text', () => {
    const timed = buildTimedSegments(segments, drafts('00:01.000', '00:04.000', '00:04.000', '01:05.250'), 70)
    expect(timed).toEqual([
      { id: 'a', start: 1, end: 4, text: 'Four' },
      { id: 'b', start: 4, end: 65.25, text: 'Twelve chars' },
    ])
    expect(transcriptToVtt(timed)).toContain('00:01.000 --> 00:04.000\nFour')
    expect(transcriptToVtt(timed)).toContain('00:04.000 --> 01:05.250\nTwelve chars')
  })

  it('reports the exact segment for missing or malformed values', () => {
    expectTimelineError(() => buildTimedSegments(segments, drafts('', '00:04.000', '00:04.000', '00:08.000'), 10), 'missing', 0)
    expectTimelineError(() => buildTimedSegments(segments, drafts('00:00.000', '00:04.000', 'later', '00:08.000'), 10), 'invalid', 1)
  })

  it('rejects reversed and overlapping segment boundaries', () => {
    expectTimelineError(() => buildTimedSegments(segments, drafts('00:04.000', '00:02.000', '00:04.000', '00:08.000'), 10), 'order', 0)
    expectTimelineError(() => buildTimedSegments(segments, drafts('00:00.000', '00:05.000', '00:04.000', '00:08.000'), 10), 'overlap', 1)
  })

  it('rejects cues beyond loaded audio metadata but allows manual editing before metadata loads', () => {
    expectTimelineError(() => buildTimedSegments(segments, drafts('00:00.000', '00:04.000', '00:04.000', '00:11.000'), 10), 'duration', 1)
    expect(buildTimedSegments(segments, drafts('00:00.000', '00:04.000', '00:04.000', '00:11.000'), null)[1].end).toBe(11)
  })

  it('removes only the timeline and preserves transcript content', () => {
    const timed = buildTimedSegments(segments, drafts('00:00.000', '00:04.000', '00:04.000', '00:08.000'), 10)
    expect(clearSegmentTimeline(timed)).toEqual(segments)
  })
})
