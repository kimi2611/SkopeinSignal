export interface UnderstandingSourceSegment {
  id: string
  start: number | null
  end: number | null
  text: string
}

export type UnderstandingScope = 'full' | 'opening' | 'middle' | 'closing'

export interface TranscriptChunk {
  index: number
  segments: UnderstandingSourceSegment[]
  characterCount: number
}

export const UNDERSTANDING_CHUNK_CHARS = 6000
export const UNDERSTANDING_MAX_CHUNKS = 12

export function selectTranscriptScope(
  segments: UnderstandingSourceSegment[],
  scope: UnderstandingScope,
): UnderstandingSourceSegment[] {
  if (scope === 'full' || segments.length < 3) return segments
  const third = Math.ceil(segments.length / 3)
  if (scope === 'opening') return segments.slice(0, third)
  if (scope === 'middle') return segments.slice(third, third * 2)
  return segments.slice(third * 2)
}

export function chunkTranscriptSegments(
  segments: UnderstandingSourceSegment[],
  maxCharacters = UNDERSTANDING_CHUNK_CHARS,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = []
  let current: UnderstandingSourceSegment[] = []
  let count = 0
  const push = () => {
    if (!current.length) return
    chunks.push({ index: chunks.length, segments: current, characterCount: count })
    current = []
    count = 0
  }
  for (const segment of segments) {
    const text = segment.text.trim()
    if (!text) continue
    const normalized = { ...segment, text }
    if (current.length && count + text.length + 1 > maxCharacters) push()
    // An exceptionally long imported paragraph remains one honest chunk rather
    // than being silently cut away from its segment id and timestamp.
    current.push(normalized)
    count += text.length + (count ? 1 : 0)
    if (count >= maxCharacters) push()
  }
  push()
  return chunks
}

export function transcriptCharacterCount(segments: UnderstandingSourceSegment[]): number {
  return segments.reduce((total, segment) => total + segment.text.trim().length, 0)
}
