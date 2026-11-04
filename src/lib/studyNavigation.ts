import { readSetupDraft, writeSetupDraft } from './studySetupDraft'

export const STUDY_EPISODE_KEY = 'tingwen.study.episode'
export const STUDY_SEEK_KEY = 'tingwen.study.seek'
export const STUDY_TAB_KEY = 'tingwen.study.tab'
export const STUDY_SETUP_KEY = 'tingwen.study.setup'
export const QUIZ_EPISODE_KEY = 'tingwen.quiz.episode'
export const NOTES_EPISODE_KEY = 'tingwen.notes.episode'
export const NOTES_DRAFT_KEY = 'tingwen.notes.draft'
export const SPARK_EPISODE_KEY = 'tingwen.sparks.episode'
export const INSIGHTS_EPISODE_KEY = 'tingwen.insights.episode'
export const INSIGHTS_TAB_KEY = 'tingwen.insights.tab'

export type StudyTabTarget = 'transcript' | 'notes' | 'vocabulary' | 'handoff'
export type InsightsTabTarget = 'summary' | 'classification' | 'episodes' | 'understanding'

export interface NotesDraftTarget {
  episodeId: string
  body: string
}

export function navigateToHash(path: string): void {
  window.location.hash = path
}

export function rememberEpisodeTarget(key: string, episodeId: string): void {
  try { sessionStorage.setItem(key, episodeId) } catch { /* Hash navigation still works. */ }
}

export function consumeEpisodeTarget(key: string): string {
  try {
    const value = sessionStorage.getItem(key) ?? ''
    sessionStorage.removeItem(key)
    return value
  } catch { return '' }
}

function openStudyTarget(episodeId: string, tab: StudyTabTarget, startSeconds?: number, setup = false): void {
  try {
    sessionStorage.setItem(STUDY_EPISODE_KEY, episodeId)
    sessionStorage.setItem(STUDY_TAB_KEY, tab)
    if (setup) sessionStorage.setItem(STUDY_SETUP_KEY, '1')
    else sessionStorage.removeItem(STUDY_SETUP_KEY)
    if (typeof startSeconds === 'number' && Number.isFinite(startSeconds)) sessionStorage.setItem(STUDY_SEEK_KEY, String(Math.max(0, startSeconds)))
    else sessionStorage.removeItem(STUDY_SEEK_KEY)
  } catch { /* Navigation still works. */ }
  if (window.location.hash === '#/study') {
    window.dispatchEvent(new CustomEvent<string>('tingwen:select-episode', { detail: episodeId }))
    window.scrollTo(0, 0)
  } else {
    window.location.hash = '/study'
  }
}

export function openStudyEpisode(episodeId: string, startSeconds?: number): void {
  openStudyTarget(episodeId, 'transcript', startSeconds)
}

export function openStudyTab(episodeId: string, tab: StudyTabTarget): void {
  openStudyTarget(episodeId, tab)
}

export function openStudySetup(episodeId: string): void {
  openStudyTarget(episodeId, 'transcript', undefined, true)
}

export function openInsightsEpisode(episodeId: string, tab: InsightsTabTarget = 'summary'): void {
  try {
    sessionStorage.setItem(INSIGHTS_EPISODE_KEY, episodeId)
    sessionStorage.setItem(INSIGHTS_TAB_KEY, tab)
  } catch { /* Hash navigation still works. */ }
  if (window.location.hash === '#/insights') {
    window.dispatchEvent(new CustomEvent<string>('tingwen:select-insights-episode', { detail: episodeId }))
    window.scrollTo(0, 0)
  } else {
    window.location.hash = '/insights'
  }
}

export function openNotesWriter(episodeId: string, body = ''): boolean {
  let staged = true
  try {
    sessionStorage.setItem(NOTES_EPISODE_KEY, episodeId)
    if (body) sessionStorage.setItem(NOTES_DRAFT_KEY, JSON.stringify({ episodeId, body } satisfies NotesDraftTarget))
    else sessionStorage.removeItem(NOTES_DRAFT_KEY)
  } catch { staged = false }
  if (window.location.hash === '#/notes') {
    window.dispatchEvent(new CustomEvent<string>('tingwen:select-notes-episode', { detail: episodeId }))
    window.scrollTo(0, 0)
  } else {
    window.location.hash = '/notes'
  }
  return staged
}

export function stageTranscriptForStudy(episodeId: string, transcript: string, filename: string): boolean {
  const key = `skopein.study.setup.${episodeId}`
  const previous = readSetupDraft(key) ?? {}
  writeSetupDraft(key, { ...previous, transcript, filename })
  const saved = readSetupDraft(key)
  if (saved?.transcript !== transcript || saved.filename !== filename) return false
  openStudySetup(episodeId)
  return true
}

export function consumeStudyTab(): StudyTabTarget | null {
  try {
    const value = sessionStorage.getItem(STUDY_TAB_KEY)
    sessionStorage.removeItem(STUDY_TAB_KEY)
    return value === 'transcript' || value === 'notes' || value === 'vocabulary' || value === 'handoff' ? value : null
  } catch { return null }
}

export function consumeStudySetup(): boolean {
  try {
    const value = sessionStorage.getItem(STUDY_SETUP_KEY) === '1'
    sessionStorage.removeItem(STUDY_SETUP_KEY)
    return value
  } catch { return false }
}

export function consumeInsightsTab(): InsightsTabTarget | null {
  try {
    const value = sessionStorage.getItem(INSIGHTS_TAB_KEY)
    sessionStorage.removeItem(INSIGHTS_TAB_KEY)
    return value === 'summary' || value === 'classification' || value === 'episodes' || value === 'understanding' ? value : null
  } catch { return null }
}

export function consumeNotesDraft(): NotesDraftTarget | null {
  try {
    const raw = sessionStorage.getItem(NOTES_DRAFT_KEY)
    sessionStorage.removeItem(NOTES_DRAFT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<NotesDraftTarget>
    return typeof value.episodeId === 'string' && typeof value.body === 'string' && value.body.trim()
      ? { episodeId: value.episodeId, body: value.body }
      : null
  } catch { return null }
}

export function readStudyEpisode(): string {
  try { return sessionStorage.getItem(STUDY_EPISODE_KEY) ?? '' } catch { return '' }
}

export function readStudySeek(): number | null {
  try {
    const stored = sessionStorage.getItem(STUDY_SEEK_KEY)
    sessionStorage.removeItem(STUDY_SEEK_KEY)
    if (stored === null) return null
    const seconds = Number(stored)
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  } catch { return null }
}
