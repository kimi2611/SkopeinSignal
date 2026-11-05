import type { TranscriptSegment } from '../types'

const STOP_WORDS = new Set(['about', 'after', 'again', 'because', 'before', 'could', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'what', 'when', 'where', 'which', 'would', 'your', 'yours', 'und', 'der', 'die', 'das', 'mit', 'für', 'auf', 'ein', 'eine', 'einer', 'eines', 'nicht', 'auch', 'sich', 'wie', 'was', 'wenn', 'dann', 'dass'])

function words(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !STOP_WORDS.has(word)) ?? [])
}

/** Return only a positive lexical match; never pretend a paraphrase is an exact citation. */
export function bestMatchingSegmentStart(segments: TranscriptSegment[], sourceText: string): number | null {
  const query = words(sourceText)
  if (!query.size) return null
  let best: { score: number; start: number | null } = { score: 0, start: null }
  for (const segment of segments) {
    const candidate = words(segment.text)
    let overlap = 0
    query.forEach((word) => { if (candidate.has(word)) overlap += 1 })
    const score = overlap / Math.max(4, Math.min(query.size, 16))
    if (overlap >= 2 && score > best.score) best = { score, start: segment.start }
  }
  return best.score >= 0.18 ? best.start : null
}
