import { uid } from './format'
import type { TranscriptSegment } from '../types'

export type TranscriptFormat = 'vtt' | 'srt' | 'txt' | 'md'

export interface ParsedTranscript {
  format: TranscriptFormat
  segments: TranscriptSegment[]
}

export function parseTranscript(source: string, filename = ''): ParsedTranscript {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!text) return { format: 'txt', segments: [] }
  const extension = filename.toLocaleLowerCase().split('.').pop() ?? ''
  const looksTimed = text.includes('-->') && /(?:^|\n)\s*(?:\d+\n)?\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->/m.test(text)
  if (looksTimed || extension === 'vtt' || extension === 'srt') {
    const segments = parseTimedBlocks(text)
    if (segments.length) return { format: extension === 'srt' || /^WEBVTT/m.test(text) === false && /^\d+\n/m.test(text) ? 'srt' : 'vtt', segments }
  }
  const looksMarkdown = /^\s{0,3}#{1,6}\s+|\[[^\]]+\]\([^)]*\)|^\s*[-*+]\s+|\*\*[^*]+\*\*|__[^_]+__/m.test(text)
  const format: TranscriptFormat = extension === 'md' || extension === 'markdown' || (!extension && looksMarkdown) ? 'md' : 'txt'
  const cleaned = format === 'md' ? cleanMarkdown(text) : cleanCueText(text)
  const paragraphs = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  return {
    format,
    segments: paragraphs.map((part) => ({ id: uid('segment'), start: null, end: null, text: part })),
  }
}

function parseTimedBlocks(text: string): TranscriptSegment[] {
  const normalized = text.replace(/^WEBVTT[^\n]*\n/i, '').replace(/^NOTE(?:\n[^\n]*)*(?:\n{2,}|$)/gm, '')
  const blocks = normalized.split(/\n{2,}/)
  const segments: TranscriptSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue
    const timing = lines[timingIndex]
    const [rawStart, rawEnd] = timing.split('-->').map((part) => part.trim())
    const start = parseTimecode(rawStart.split(/\s+/)[0])
    const end = parseTimecode(rawEnd.split(/\s+/)[0])
    const content = cleanCueText(lines.slice(timingIndex + 1).join('\n'))
    if (start === null || end === null || !content) continue
    segments.push({ id: uid('segment'), start, end, text: content })
  }
  return segments.sort((left, right) => (left.start ?? 0) - (right.start ?? 0))
}

export function parseTimecode(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4].padEnd(3, '0'))
  if (minutes >= 60 || seconds >= 60) return null
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export function formatTimecode(value: number | null, milliseconds = false): string {
  if (value === null || !Number.isFinite(value)) return '--:--'
  const safe = Math.max(0, value)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const base = hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return milliseconds ? `${base}.${String(Math.floor((safe % 1) * 1000)).padStart(3, '0')}` : base
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n')
}

export function transcriptToVtt(segments: TranscriptSegment[]): string | null {
  if (!segments.length || segments.some((segment) => segment.start === null || segment.end === null)) return null
  const cues = segments.map((segment, index) => `${index + 1}\n${formatTimecode(segment.start, true)} --> ${formatTimecode(segment.end, true)}\n${segment.text.trim()}`)
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export function cleanMarkdown(value: string): string {
  return value
    .replace(/^---\n[\s\S]*?\n---\n?/m, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanCueText(value: string): string {
  return value
    .replace(/<v(?:\.[^ >]+)?\s+[^>]+>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}
