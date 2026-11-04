import type { TranscriptSegment } from '../types'
import { formatTimecode } from './transcript'

export interface TimelineDraft {
  start: string
  end: string
}

export type TimelineErrorReason = 'missing' | 'invalid' | 'order' | 'overlap' | 'duration' | 'estimate-too-short'

export class TimelineValidationError extends Error {
  reason: TimelineErrorReason
  segmentIndex: number

  constructor(reason: TimelineErrorReason, segmentIndex = -1) {
    super(reason)
    this.name = 'TimelineValidationError'
    this.reason = reason
    this.segmentIndex = segmentIndex
  }
}

export function parseTimelineTime(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number((match[4] ?? '0').padEnd(3, '0'))
  if (minutes >= 60 || seconds >= 60) return null
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export function timelineDraftsFromSegments(segments: TranscriptSegment[]): Record<string, TimelineDraft> {
  return Object.fromEntries(segments.map((segment) => [segment.id, {
    start: segment.start === null ? '' : formatTimecode(segment.start, true),
    end: segment.end === null ? '' : formatTimecode(segment.end, true),
  }]))
}

export function estimateTimelineDrafts(segments: TranscriptSegment[], durationSeconds: number): Record<string, TimelineDraft> {
  if (!segments.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds * 1000 < segments.length) {
    throw new TimelineValidationError('estimate-too-short')
  }
  const weights = segments.map((segment) => Math.max(1, Array.from(segment.text.trim()).length))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  let cursor = 0
  let elapsed = 0
  return Object.fromEntries(segments.map((segment, index) => {
    const start = elapsed
    cursor += weights[index]
    elapsed = index === segments.length - 1 ? durationSeconds : durationSeconds * cursor / totalWeight
    return [segment.id, { start: formatTimecode(start, true), end: formatTimecode(elapsed, true) }]
  }))
}

export function buildTimedSegments(
  segments: TranscriptSegment[],
  drafts: Record<string, TimelineDraft>,
  durationSeconds: number | null,
): TranscriptSegment[] {
  let previousEnd = 0
  return segments.map((segment, index) => {
    const draft = drafts[segment.id]
    if (!draft?.start.trim() || !draft.end.trim()) throw new TimelineValidationError('missing', index)
    const start = parseTimelineTime(draft.start)
    const end = parseTimelineTime(draft.end)
    if (start === null || end === null) throw new TimelineValidationError('invalid', index)
    if (end <= start) throw new TimelineValidationError('order', index)
    if (start < previousEnd) throw new TimelineValidationError('overlap', index)
    if (durationSeconds !== null && Number.isFinite(durationSeconds) && end > durationSeconds + 0.05) {
      throw new TimelineValidationError('duration', index)
    }
    previousEnd = end
    return { ...segment, start, end }
  })
}

export function clearSegmentTimeline(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment) => ({ ...segment, start: null, end: null }))
}
