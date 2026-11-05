import type { SnipdResolveResult } from '../../api/snipdRouter'
import type { AsrConcreteLanguage, ChannelLabel } from './localTranscribe'

/**
 * The setup form's half-finished work, mirrored to sessionStorage so a page
 * reload (iPadOS suspends and reloads heavy tabs without asking) cannot take
 * the listener's pasted Snipd link, chosen audio mode, or a finished resolve
 * result with it. Cleared when the desk is saved.
 */
export interface SetupDraft {
  audioMode?: 'rss' | 'local'
  snipdUrl?: string
  audioUrlOverride?: string | null
  snipdResult?: SnipdResolveResult | null
  /** Unsaved transcription and subsequent edits survive module switches. */
  transcript?: string
  filename?: string
  asrChannel?: ChannelLabel | null
  asrDetectedLangs?: AsrConcreteLanguage[]
}

const WARNINGS = new Set(['episode-not-found', 'feed-unreachable', 'feed-not-found', 'audio-not-found', 'feed-empty', 'directory-unreachable', 'audio-from-directory'])

/** Structural check — a draft written by an older build must never break a newer one. */
export function isSetupDraft(value: unknown): value is SetupDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  if (draft.audioMode !== undefined && draft.audioMode !== 'rss' && draft.audioMode !== 'local') return false
  if (draft.snipdUrl !== undefined && typeof draft.snipdUrl !== 'string') return false
  if (draft.audioUrlOverride !== undefined && draft.audioUrlOverride !== null && typeof draft.audioUrlOverride !== 'string') return false
  if (draft.transcript !== undefined && typeof draft.transcript !== 'string') return false
  if (draft.filename !== undefined && typeof draft.filename !== 'string') return false
  if (draft.asrChannel !== undefined && draft.asrChannel !== null && !['mono', 'downmix', 'left', 'right'].includes(String(draft.asrChannel))) return false
  if (draft.asrDetectedLangs !== undefined && (!Array.isArray(draft.asrDetectedLangs) || !draft.asrDetectedLangs.every((language) => language === 'en' || language === 'de'))) return false
  const result = draft.snipdResult
  if (result !== undefined && result !== null) {
    if (typeof result !== 'object') return false
    const r = result as Record<string, unknown>
    if (!Array.isArray(r.warnings) || !r.warnings.every((w) => typeof w === 'string' && WARNINGS.has(w))) return false
    if (r.audioUrl !== null && typeof r.audioUrl !== 'string') return false
    if (r.feedUrl !== null && typeof r.feedUrl !== 'string') return false
  }
  return true
}

export function readSetupDraft(key: string): SetupDraft | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSetupDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSetupDraft(key: string, draft: SetupDraft): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // The draft is a safety net, never a reason to interrupt the listener.
  }
}

export function clearSetupDraft(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Same as above.
  }
}
