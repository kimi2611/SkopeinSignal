/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSeedEpisodes, CURRENT_SEED_REVISION, ORIGINAL_SEED_IDS, ORIGINAL_SEED_STATUSES } from '../data/seed'
import { initialShows } from '../data/shows'
import { feedErrorMessage, fetchFeed, DEFAULT_PROXY_URL, FEED_RECOVERY_ROUNDS } from '../lib/rss'
import { getDurationCap, getEpisodeDurationCategory, uid } from '../lib/format'
import { clearLocalAudio } from '../lib/media'
import { sanitizeCardProgress } from '../lib/cards'
import { sanitizeKimiSummary } from '../lib/kimiSummary'
import { ensureIdeaEvolutions, sanitizeLearningCollections } from '../lib/learningData'
import { useCloudWorkspace, type CloudWorkspaceControls } from './useCloudWorkspace'
import type { Activity, CardProgress, ClaimReview, Episode, FeedState, IdeaEvolution, KimiSummary, LearningTask, ListeningNote, PencilDrawing, PodcastShow, QuizAttempt, SavedResourceReport, Spark, StudySession, ThemeMap, TranscriptSegment, UnderstandingRecord, VocabularyEntry, WorkspaceSettings, WorkspaceState } from '../types'

const STORAGE_KEY = 'tingwen.workspace.v1'

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  uiLocale: 'en',
  theme: 'toot-puddle',
  longCap: 4,
  mediumCap: 7,
  microCap: 3,
  autoRefresh: false,
  proxyUrl: DEFAULT_PROXY_URL,
}

export interface RefreshProgress {
  active: boolean
  completed: number
  total: number
  currentShow: string
  currentShowId: string
  recoveryRound?: number
  recoveryRounds?: number
}

export interface ManualEpisodeInput {
  showId: string
  title: string
  description: string
  link: string
  audioUrl: string
  publishedAt: string
  durationMinutes: number | null
  dedupKey?: string
}

interface WorkspaceContextValue {
  state: WorkspaceState
  storageError: string
  cloud: CloudWorkspaceControls
  refreshProgress: RefreshProgress
  updateShow: (id: string, patch: Partial<Pick<PodcastShow, 'tier' | 'role' | 'feedUrl'>>) => void
  addManualEpisode: (input: ManualEpisodeInput) => Episode
  enqueueEpisode: (id: string, reasons: string[]) => { ok: boolean; message: string }
  removeFromQueue: (id: string) => void
  completeEpisode: (id: string, note: string, snips: number) => void
  skipEpisode: (id: string, reason: string, countStreak?: boolean) => void
  restoreEpisode: (id: string) => void
  archiveEpisode: (id: string) => void
  updateEpisode: (id: string, patch: Partial<Pick<Episode, 'dedupKey' | 'description' | 'audioUrl' | 'lens' | 'valueCategory' | 'durationMinutes'>>) => void
  saveStudySession: (session: StudySession) => void
  updateStudySession: (episodeId: string, patch: Partial<Omit<StudySession, 'episodeId' | 'segments'>>) => void
  updateTranscriptSegment: (episodeId: string, segmentId: string, text: string) => void
  updateTranscriptTimeline: (episodeId: string, segments: TranscriptSegment[]) => void
  removeStudySession: (episodeId: string) => void
  saveVocabularyEntry: (entry: Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => VocabularyEntry
  importVocabulary: (entries: Array<Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>>) => number
  removeVocabularyEntry: (id: string) => void
  saveListeningNote: (note: Omit<ListeningNote, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => ListeningNote
  removeListeningNote: (id: string) => void
  savePencilDrawing: (drawing: PencilDrawing) => void
  removePencilDrawing: (id: string) => void
  saveKimiSummary: (summary: KimiSummary) => void
  removeKimiSummary: (episodeId: string) => void
  saveQuizAttempt: (attempt: QuizAttempt) => void
  removeQuizAttempt: (id: string) => void
  saveSpark: (spark: Spark) => void
  removeSpark: (id: string) => void
  saveLearningTask: (task: LearningTask) => void
  setLearningTaskDone: (id: string, done: boolean) => void
  removeLearningTask: (id: string) => void
  saveResourceReport: (report: SavedResourceReport) => void
  removeResourceReport: (id: string) => void
  saveUnderstanding: (record: UnderstandingRecord) => void
  removeUnderstanding: (id: string) => void
  saveClaimReview: (review: ClaimReview) => void
  saveThemeMap: (map: ThemeMap) => void
  removeThemeMap: (id: string) => void
  saveIdeaEvolution: (evolution: IdeaEvolution) => void
  removeIdeaEvolution: (id: string) => void
  saveCardProgress: (progress: CardProgress) => void
  dismissPair: (key: string) => void
  undismissPair: (key: string) => void
  addManualPair: (key: string) => void
  updateSettings: (patch: Partial<WorkspaceSettings>) => void
  refreshFeeds: (showIds?: string[], options?: { recovery?: boolean }) => Promise<{ added: number; failed: number }>
  importWorkspace: (value: unknown) => { ok: boolean; message: string }
  resetWorkspace: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function createInitialState(): WorkspaceState {
  const now = new Date().toISOString()
  return {
    version: 1,
    seedRevision: CURRENT_SEED_REVISION,
    shows: initialShows.map((show) => ({ ...show })),
    episodes: createSeedEpisodes(now),
    activities: [],
    dismissedPairs: [],
    manualPairs: [],
    settings: { ...DEFAULT_SETTINGS },
    feedStatus: {},
    lastAutoRefresh: null,
    studySessions: [],
    vocabulary: [],
    notes: [],
    pencilDrawings: [],
    summaries: [],
    cardProgress: [],
    quizAttempts: [],
    sparks: [],
    learningTasks: [],
    resourceReports: [],
    understandings: [],
    claimReviews: [],
    themeMaps: [],
    ideaEvolutions: [],
  }
}

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceState>
  return candidate.version === 1
    && Array.isArray(candidate.shows)
    && Array.isArray(candidate.episodes)
    && Array.isArray(candidate.activities)
    && Array.isArray(candidate.dismissedPairs)
    && !!candidate.settings
    && typeof candidate.settings === 'object'
    && !!candidate.feedStatus
    && typeof candidate.feedStatus === 'object'
}

const LEGACY_REASONS: Record<string, string> = {
  '与当前主题主线直接相关': 'Directly connected to a current core thread',
  '嘉宾／作者能提供独特信息': 'The guest or author offers unique information',
  '能提供新的论证或证据': 'Offers a new argument or evidence',
  '回应当前正在研究的问题': 'Addresses a question under active research',
  '与其他候选相比信息增量更高': 'Adds more information than competing candidates',
  '值得保留为专题资料': 'Worth keeping as topical reference',
  '公司／产品发展史值得完整复盘': 'A company and product history worth a full review',
  '与商业主线直接相关': 'Directly connected to the business core thread',
  '物理与 AI 交叉主题': 'At the intersection of physics and AI',
  '嘉宾具有独特研究视角': 'A guest with a distinctive research perspective',
  '补充 AI 产业结构视角': 'Adds an AI industry-structure perspective',
  '短集，适合本周信息雷达': 'A micro discussion suited to this week’s radar',
  '哲学问题入口清晰': 'A clear entry into a philosophical question',
  '短集，适合补充选听': 'A micro discussion suited to selective listening',
  '提供德语媒体观察角度': 'Adds a German-language media perspective',
  '短集，适合信息雷达': 'A micro discussion suited to the signal radar',
  'A short episode suited to this week’s radar': 'A micro discussion suited to this week’s radar',
  'A short episode suited to selective listening': 'A micro discussion suited to selective listening',
  'A short episode suited to the signal radar': 'A micro discussion suited to the signal radar',
}

function refreshUntouchedDefaultQueue(episodes: Episode[]): Episode[] {
  const originalIds = new Set(ORIGINAL_SEED_IDS)
  const defaultQueueUntouched = ORIGINAL_SEED_IDS.every((id) => {
    const episode = episodes.find((item) => item.id === id && item.source === 'seed')
    return episode?.status === ORIGINAL_SEED_STATUSES[id]
  }) && !episodes.some((episode) => episode.status === 'queue' && (episode.source !== 'seed' || !originalIds.has(episode.id)))
  if (!defaultQueueUntouched) return episodes

  const now = episodes.find((episode) => originalIds.has(episode.id))?.addedAt ?? new Date().toISOString()
  const fresh = createSeedEpisodes(now)
  const freshById = new Map(fresh.map((episode) => [episode.id, episode]))
  const retainedIds = new Set<string>()
  const refreshed = episodes.map((episode) => {
    const next = freshById.get(episode.id)
    if (!next || episode.source !== 'seed') return episode
    retainedIds.add(episode.id)
    return {
      ...next,
      addedAt: episode.addedAt,
      description: episode.description,
      link: episode.link || next.link,
      audioUrl: episode.audioUrl || next.audioUrl,
      dedupKey: episode.dedupKey,
      lens: episode.lens,
      valueCategory: episode.valueCategory,
    }
  })
  return [...refreshed, ...fresh.filter((episode) => !retainedIds.has(episode.id))]
}

function sanitizePencilDrawings(value: unknown): PencilDrawing[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): PencilDrawing[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const drawing = candidate as Partial<PencilDrawing>
    if (typeof drawing.id !== 'string' || !Array.isArray(drawing.strokes)) return []
    const strokes = drawing.strokes.flatMap((stroke) => {
      if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points)) return []
      const points = stroke.points.flatMap((point) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return []
        return [{ x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)), pressure: Number.isFinite(point.pressure) ? Math.min(1, Math.max(0.05, point.pressure)) : 0.5 }]
      })
      if (!points.length || typeof stroke.id !== 'string') return []
      return [{
        id: stroke.id,
        color: typeof stroke.color === 'string' && /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : '#263c35',
        width: Number.isFinite(stroke.width) ? Math.min(24, Math.max(1, stroke.width)) : 4,
        points,
      }]
    })
    const now = new Date().toISOString()
    return [{
      id: drawing.id,
      title: typeof drawing.title === 'string' && drawing.title.trim() ? drawing.title.trim().slice(0, 160) : 'Untitled pencil note',
      episodeId: typeof drawing.episodeId === 'string' ? drawing.episodeId : null,
      strokes,
      recognizedText: typeof drawing.recognizedText === 'string' ? drawing.recognizedText.slice(0, 12000) : undefined,
      recognitionConfidence: drawing.recognitionConfidence === 'high' || drawing.recognitionConfidence === 'medium' || drawing.recognitionConfidence === 'low' ? drawing.recognitionConfidence : undefined,
      createdAt: typeof drawing.createdAt === 'string' ? drawing.createdAt : now,
      updatedAt: typeof drawing.updatedAt === 'string' ? drawing.updatedAt : now,
    }]
  })
}

function sanitizeQuizAttempts(value: unknown): QuizAttempt[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): QuizAttempt[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const attempt = candidate as Partial<QuizAttempt>
    if (typeof attempt.id !== 'string' || typeof attempt.episodeId !== 'string') return []
    const questions = (Array.isArray(attempt.questions) ? attempt.questions : []).flatMap((question) => {
      if (!question || typeof question.prompt !== 'string' || !question.prompt.trim()) return []
      return [{
        id: typeof question.id === 'string' && question.id.trim() ? question.id : uid('quizq'),
        prompt: question.prompt.trim().slice(0, 1200),
        referenceAnswer: typeof question.referenceAnswer === 'string' ? question.referenceAnswer.trim().slice(0, 2000) : '',
      }]
    })
    if (!questions.length) return []
    const questionIds = new Set(questions.map((question) => question.id))
    const answers: Record<string, string> = {}
    if (attempt.answers && typeof attempt.answers === 'object') {
      for (const [key, answer] of Object.entries(attempt.answers)) {
        if (questionIds.has(key) && typeof answer === 'string' && answer.trim()) answers[key] = answer.trim().slice(0, 2000)
      }
    }
    const verdicts = (Array.isArray(attempt.verdicts) ? attempt.verdicts : []).flatMap((verdict) => {
      if (!verdict || typeof verdict.questionId !== 'string' || !questionIds.has(verdict.questionId)) return []
      if (verdict.verdict !== 'correct' && verdict.verdict !== 'partial' && verdict.verdict !== 'missed') return []
      return [{ questionId: verdict.questionId, verdict: verdict.verdict, feedback: typeof verdict.feedback === 'string' ? verdict.feedback.trim().slice(0, 2000) : '' }]
    })
    return [{
      id: attempt.id,
      episodeId: attempt.episodeId,
      questions,
      answers,
      verdicts,
      score: Number.isFinite(attempt.score) ? Math.min(100, Math.max(0, Math.round(attempt.score as number))) : 0,
      createdAt: typeof attempt.createdAt === 'string' ? attempt.createdAt : new Date().toISOString(),
    }]
  })
}

function sanitizeSparks(value: unknown): Spark[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): Spark[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const spark = candidate as Partial<Spark>
    if (typeof spark.id !== 'string' || typeof spark.text !== 'string' || !spark.text.trim()) return []
    const reply = spark.reply && typeof spark.reply === 'object' && typeof spark.reply.evaluation === 'string' && spark.reply.evaluation.trim()
      ? {
          evaluation: spark.reply.evaluation.trim().slice(0, 2000),
          strengths: (Array.isArray(spark.reply.strengths) ? spark.reply.strengths : []).filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim().slice(0, 400)).slice(0, 4),
          suggestions: (Array.isArray(spark.reply.suggestions) ? spark.reply.suggestions : []).filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim().slice(0, 400)).slice(0, 4),
          followUp: typeof spark.reply.followUp === 'string' ? spark.reply.followUp.trim().slice(0, 600) : '',
        }
      : null
    return [{
      id: spark.id,
      episodeId: typeof spark.episodeId === 'string' ? spark.episodeId : null,
      text: spark.text.trim().slice(0, 1500),
      reply,
      createdAt: typeof spark.createdAt === 'string' ? spark.createdAt : new Date().toISOString(),
    }]
  })
}

function migrateSavedState(saved: WorkspaceState): WorkspaceState {
  const legacySettings = saved.settings as Partial<WorkspaceSettings> & { shortCap?: number; longThreshold?: number }
  const migratedEpisodes = (saved.seedRevision ?? 1) < CURRENT_SEED_REVISION ? refreshUntouchedDefaultQueue(saved.episodes) : saved.episodes
  const vocabulary = Array.isArray(saved.vocabulary) ? saved.vocabulary.map((entry) => ({ ...entry })) : []
  const vocabularyIds = new Set(vocabulary.flatMap((entry) => entry && typeof entry.id === 'string' ? [entry.id] : []))
  const seenSummaryEpisodes = new Set<string>()
  const summaries = (Array.isArray(saved.summaries) ? saved.summaries : [])
    .map((summary) => sanitizeKimiSummary(summary))
    .filter((summary): summary is KimiSummary => {
      if (!summary || seenSummaryEpisodes.has(summary.episodeId)) return false
      seenSummaryEpisodes.add(summary.episodeId)
      return true
    })
  const seenProgressWords = new Set<string>()
  const cardProgress = (Array.isArray(saved.cardProgress) ? saved.cardProgress : [])
    .map((progress) => sanitizeCardProgress(progress))
    .filter((progress): progress is CardProgress => {
      if (!progress || !vocabularyIds.has(progress.vocabularyId) || seenProgressWords.has(progress.vocabularyId)) return false
      seenProgressWords.add(progress.vocabularyId)
      return true
    })
  const learning = sanitizeLearningCollections(saved)
  const sparks = sanitizeSparks(saved.sparks)
  return {
    ...saved,
    ...learning,
    ideaEvolutions: ensureIdeaEvolutions(sparks, learning.ideaEvolutions),
    seedRevision: CURRENT_SEED_REVISION,
    settings: {
      uiLocale: legacySettings.uiLocale && ['en', 'zh-CN', 'de'].includes(legacySettings.uiLocale) ? legacySettings.uiLocale : 'en',
      theme: legacySettings.theme && ['toot-puddle', 'forest-dusk', 'mist-dawn', 'whimsical', 'pure'].includes(legacySettings.theme) ? legacySettings.theme : DEFAULT_SETTINGS.theme,
      longCap: legacySettings.longCap === 2 ? 4 : legacySettings.longCap ?? DEFAULT_SETTINGS.longCap,
      mediumCap: legacySettings.mediumCap ?? DEFAULT_SETTINGS.mediumCap,
      microCap: legacySettings.microCap ?? DEFAULT_SETTINGS.microCap,
      autoRefresh: legacySettings.autoRefresh ?? DEFAULT_SETTINGS.autoRefresh,
      proxyUrl: legacySettings.proxyUrl ?? DEFAULT_SETTINGS.proxyUrl,
    },
    shows: saved.shows.map((show) => {
      const builtIn = initialShows.find((item) => item.id === show.id)
      const legacyLanguage = show.language as string
      return {
        ...show,
        language: legacyLanguage === '中文' ? 'Chinese' : show.language,
        domain: builtIn && /[\u4e00-\u9fff]/.test(show.domain) ? builtIn.domain : show.domain,
        role: builtIn && /[\u4e00-\u9fff]/.test(show.role) ? builtIn.role : show.role,
      }
    }),
    episodes: migratedEpisodes.map((episode) => ({
      ...episode,
      selectionReasons: episode.selectionReasons?.map((reason) => LEGACY_REASONS[reason] ?? reason),
      lens: episode.lens === 'aithrascope' || episode.lens === 'dikelens' ? episode.lens : undefined,
      valueCategory: episode.valueCategory === 'timely' || episode.valueCategory === 'evergreen' || episode.valueCategory === 'uncategorized' ? episode.valueCategory : undefined,
      description: episode.source === 'seed' && /[\u4e00-\u9fff]/.test(episode.description)
        ? createSeedEpisodes(episode.addedAt).find((item) => item.id === episode.id)?.description ?? episode.description
        : episode.description,
    })),
    studySessions: Array.isArray(saved.studySessions) ? saved.studySessions.map((session) => ({ ...session, followTranscript: session.followTranscript ?? true })) : [],
    vocabulary,
    notes: Array.isArray(saved.notes) ? saved.notes.map((note) => ({ ...note })) : [],
    pencilDrawings: sanitizePencilDrawings(saved.pencilDrawings),
    summaries,
    cardProgress,
    quizAttempts: sanitizeQuizAttempts(saved.quizAttempts),
    sparks,
    manualPairs: Array.isArray(saved.manualPairs) ? saved.manualPairs.filter((key): key is string => typeof key === 'string' && key.includes('::')).slice(0, 500) : [],
  }
}

function loadInitialState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed: unknown = JSON.parse(raw)
    if (!isWorkspaceState(parsed)) return createInitialState()
    return migrateSavedState(parsed)
  } catch {
    return createInitialState()
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(loadInitialState)
  const [storageError, setStorageError] = useState('')
  const cloud = useCloudWorkspace({ state, setState, createInitialState, isWorkspaceState, migrateSavedState })
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress>({ active: false, completed: 0, total: 0, currentShow: '', currentShowId: '' })
  const refreshingRef = useRef(false)
  const autoRefreshStarted = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      setStorageError('')
    } catch {
      setStorageError('Browser storage is full. Export a JSON backup now and remove old episodes or large transcripts; keep original audio files separately.')
    }
  }, [state])

  const updateShow = useCallback((id: string, patch: Partial<Pick<PodcastShow, 'tier' | 'role' | 'feedUrl'>>) => {
    setState((current) => ({ ...current, shows: current.shows.map((show) => show.id === id ? { ...show, ...patch } : show) }))
  }, [])

  const addManualEpisode = useCallback((input: ManualEpisodeInput): Episode => {
    const now = new Date().toISOString()
    const episode: Episode = {
      id: uid('manual'),
      guid: input.dedupKey?.trim() ? `manual:${input.dedupKey.trim()}` : uid('manual-guid'),
      showId: input.showId,
      title: input.title.trim(),
      description: input.description.trim().slice(0, 1200),
      link: input.link.trim(),
      audioUrl: input.audioUrl.trim(),
      publishedAt: input.publishedAt ? new Date(`${input.publishedAt}T12:00:00`).toISOString() : '',
      durationMinutes: input.durationMinutes,
      status: 'inbox',
      addedAt: now,
      dedupKey: input.dedupKey?.trim() || undefined,
      source: 'manual',
    }
    setState((current) => ({ ...current, episodes: [episode, ...current.episodes] }))
    return episode
  }, [])

  const enqueueEpisode = useCallback((id: string, reasons: string[]) => {
    const episode = state.episodes.find((item) => item.id === id)
    if (!episode) return { ok: false, message: 'This episode could not be found. Refresh and try again.' }
    if (reasons.length < 2) return { ok: false, message: 'Choose at least two reasons for adding it.' }
    const queued = state.episodes.filter((item) => item.status === 'queue')
    const category = getEpisodeDurationCategory(episode)
    const used = queued.filter((item) => getEpisodeDurationCategory(item) === category).length
    const cap = getDurationCap(state.settings, category)
    if (used >= cap) {
      const message = category === 'long'
        ? 'The weekly long-interview quota is full. Remove a long episode before adding this one.'
        : category === 'medium'
          ? 'The weekly medium-episode quota is full. Remove a medium episode before adding this one.'
          : 'The weekly micro-discussion quota is full. Remove a micro discussion before adding this one.'
      return { ok: false, message }
    }

    setState((current) => ({
      ...current,
      episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'queue', selectionReasons: reasons, skipReason: undefined } : item),
    }))
    return { ok: true, message: 'Added to this week’s queue.' }
  }, [state.episodes, state.settings])

  const removeFromQueue = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'inbox', selectionReasons: undefined } : item),
    }))
  }, [])

  const completeEpisode = useCallback((id: string, note: string, snips: number) => {
    const now = new Date().toISOString()
    setState((current) => {
      const episode = current.episodes.find((item) => item.id === id)
      if (!episode) return current
      const activity: Activity = { id: uid('activity'), episodeId: id, showId: episode.showId, type: 'listened', date: now, note: note.trim(), snips }
      return {
        ...current,
        episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'listened', listenedAt: now, skipReason: undefined } : item),
        activities: [activity, ...current.activities],
        shows: current.shows.map((show) => show.id === episode.showId ? { ...show, totalSnips: Math.max(0, show.totalSnips + snips), skipStreak: 0 } : show),
      }
    })
  }, [])

  const skipEpisode = useCallback((id: string, reason: string, countStreak = true) => {
    const now = new Date().toISOString()
    setState((current) => {
      const episode = current.episodes.find((item) => item.id === id)
      if (!episode) return current
      const activity: Activity = { id: uid('activity'), episodeId: id, showId: episode.showId, type: 'skipped', date: now, reason: reason.trim() }
      return {
        ...current,
        episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'skipped', skippedAt: now, skipReason: reason.trim(), selectionReasons: undefined } : item),
        activities: [activity, ...current.activities],
        shows: current.shows.map((show) => show.id === episode.showId && countStreak ? { ...show, skipStreak: show.skipStreak + 1 } : show),
      }
    })
  }, [])

  const restoreEpisode = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'inbox', selectionReasons: undefined } : item),
    }))
  }, [])

  const archiveEpisode = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      episodes: current.episodes.map((item) => item.id === id ? { ...item, status: 'archived', selectionReasons: undefined } : item),
    }))
  }, [])

  const updateEpisode = useCallback((id: string, patch: Partial<Pick<Episode, 'dedupKey' | 'description' | 'audioUrl' | 'lens' | 'valueCategory' | 'durationMinutes'>>) => {
    setState((current) => ({ ...current, episodes: current.episodes.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  }, [])

  const saveStudySession = useCallback((session: StudySession) => {
    setState((current) => {
      const exists = current.studySessions.some((item) => item.episodeId === session.episodeId)
      return {
        ...current,
        studySessions: exists
          ? current.studySessions.map((item) => item.episodeId === session.episodeId ? session : item)
          : [session, ...current.studySessions],
      }
    })
  }, [])

  const updateStudySession = useCallback((episodeId: string, patch: Partial<Omit<StudySession, 'episodeId' | 'segments'>>) => {
    setState((current) => ({
      ...current,
      studySessions: current.studySessions.map((session) => session.episodeId === episodeId ? { ...session, ...patch, updatedAt: new Date().toISOString() } : session),
    }))
  }, [])

  const updateTranscriptSegment = useCallback((episodeId: string, segmentId: string, text: string) => {
    setState((current) => ({
      ...current,
      studySessions: current.studySessions.map((session) => session.episodeId === episodeId ? {
        ...session,
        updatedAt: new Date().toISOString(),
        segments: session.segments.map((segment) => segment.id === segmentId ? { ...segment, text: text.trim() } : segment),
      } : session),
    }))
  }, [])

  const updateTranscriptTimeline = useCallback((episodeId: string, segments: TranscriptSegment[]) => {
    setState((current) => ({
      ...current,
      studySessions: current.studySessions.map((session) => session.episodeId === episodeId ? {
        ...session,
        segments,
        updatedAt: new Date().toISOString(),
      } : session),
    }))
  }, [])

  const removeStudySession = useCallback((episodeId: string) => {
    setState((current) => {
      const removedWordIds = new Set(current.vocabulary.filter((entry) => entry.episodeId === episodeId).map((entry) => entry.id))
      return {
        ...current,
        studySessions: current.studySessions.filter((session) => session.episodeId !== episodeId),
        vocabulary: current.vocabulary.filter((entry) => entry.episodeId !== episodeId),
        notes: current.notes.filter((note) => note.episodeId !== episodeId),
        pencilDrawings: current.pencilDrawings.filter((drawing) => drawing.episodeId !== episodeId),
        learningTasks: current.learningTasks.filter((task) => task.episodeId !== episodeId),
        understandings: current.understandings.filter((record) => record.episodeId !== episodeId),
        claimReviews: current.claimReviews.filter((review) => review.episodeId !== episodeId),
        cardProgress: current.cardProgress.filter((progress) => !removedWordIds.has(progress.vocabularyId)),
      }
    })
  }, [])

  const saveVocabularyEntry = useCallback((input: Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>, id?: string): VocabularyEntry => {
    const now = new Date().toISOString()
    const entry: VocabularyEntry = { ...input, id: id ?? uid('word'), createdAt: now, updatedAt: now }
    setState((current) => {
      const existing = id ? current.vocabulary.find((item) => item.id === id) : undefined
      const saved = existing ? { ...entry, createdAt: existing.createdAt } : entry
      return {
        ...current,
        vocabulary: existing
          ? current.vocabulary.map((item) => item.id === id ? saved : item)
          : [saved, ...current.vocabulary],
      }
    })
    return entry
  }, [])

  const importVocabulary = useCallback((inputs: Array<Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>>): number => {
    let added = 0
    setState((current) => {
      const seen = new Set(current.vocabulary.map((entry) => `${entry.episodeId}${entry.language}${entry.surface.trim().toLocaleLowerCase()}`))
      const fresh: VocabularyEntry[] = []
      for (const input of inputs.slice(0, 500)) {
        const surface = input.surface.trim()
        if (!surface) continue
        const signature = `${input.episodeId}${input.language}${surface.toLocaleLowerCase()}`
        if (seen.has(signature)) continue
        seen.add(signature)
        const now = new Date().toISOString()
        fresh.push({ ...input, surface, translation: input.translation.trim(), id: uid('word'), createdAt: now, updatedAt: now })
        added += 1
      }
      return fresh.length ? { ...current, vocabulary: [...fresh, ...current.vocabulary] } : current
    })
    return added
  }, [])

  const removeVocabularyEntry = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      vocabulary: current.vocabulary.filter((entry) => entry.id !== id),
      cardProgress: current.cardProgress.filter((progress) => progress.vocabularyId !== id),
    }))
  }, [])

  const saveListeningNote = useCallback((input: Omit<ListeningNote, 'id' | 'createdAt' | 'updatedAt'>, id?: string): ListeningNote => {
    const now = new Date().toISOString()
    const note: ListeningNote = { ...input, body: input.body.trim(), id: id ?? uid('note'), createdAt: now, updatedAt: now }
    setState((current) => {
      const existing = id ? current.notes.find((item) => item.id === id) : undefined
      const saved = existing ? { ...note, createdAt: existing.createdAt } : note
      return {
        ...current,
        notes: existing ? current.notes.map((item) => item.id === id ? saved : item) : [saved, ...current.notes],
      }
    })
    return note
  }, [])

  const removeListeningNote = useCallback((id: string) => {
    setState((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== id) }))
  }, [])

  const savePencilDrawing = useCallback((drawing: PencilDrawing) => {
    setState((current) => {
      const exists = current.pencilDrawings.some((item) => item.id === drawing.id)
      return {
        ...current,
        pencilDrawings: exists
          ? current.pencilDrawings.map((item) => item.id === drawing.id ? drawing : item)
          : [drawing, ...current.pencilDrawings],
      }
    })
  }, [])

  const removePencilDrawing = useCallback((id: string) => {
    setState((current) => ({ ...current, pencilDrawings: current.pencilDrawings.filter((drawing) => drawing.id !== id) }))
  }, [])

  const saveKimiSummary = useCallback((summary: KimiSummary) => {
    setState((current) => {
      const exists = current.summaries.some((item) => item.episodeId === summary.episodeId)
      return {
        ...current,
        summaries: exists
          ? current.summaries.map((item) => item.episodeId === summary.episodeId ? summary : item)
          : [summary, ...current.summaries],
      }
    })
  }, [])

  const removeKimiSummary = useCallback((episodeId: string) => {
    setState((current) => ({ ...current, summaries: current.summaries.filter((summary) => summary.episodeId !== episodeId) }))
  }, [])

  const saveQuizAttempt = useCallback((attempt: QuizAttempt) => {
    setState((current) => ({ ...current, quizAttempts: [attempt, ...current.quizAttempts.filter((item) => item.id !== attempt.id)].slice(0, 100) }))
  }, [])

  const removeQuizAttempt = useCallback((id: string) => {
    setState((current) => ({ ...current, quizAttempts: current.quizAttempts.filter((attempt) => attempt.id !== id) }))
  }, [])

  const saveSpark = useCallback((spark: Spark) => {
    setState((current) => {
      const sparks = [spark, ...current.sparks.filter((item) => item.id !== spark.id)].slice(0, 200)
      return { ...current, sparks, ideaEvolutions: ensureIdeaEvolutions(sparks, current.ideaEvolutions) }
    })
  }, [])

  const removeSpark = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      sparks: current.sparks.filter((spark) => spark.id !== id),
      ideaEvolutions: current.ideaEvolutions.filter((item) => item.sparkId !== id),
    }))
  }, [])

  const saveLearningTask = useCallback((task: LearningTask) => {
    setState((current) => ({ ...current, learningTasks: [task, ...current.learningTasks.filter((item) => item.id !== task.id)].slice(0, 500) }))
  }, [])

  const setLearningTaskDone = useCallback((id: string, done: boolean) => {
    const now = new Date().toISOString()
    setState((current) => ({ ...current, learningTasks: current.learningTasks.map((task) => task.id === id ? { ...task, status: done ? 'done' : 'open', completedAt: done ? now : null, updatedAt: now } : task) }))
  }, [])

  const removeLearningTask = useCallback((id: string) => {
    setState((current) => ({ ...current, learningTasks: current.learningTasks.filter((task) => task.id !== id) }))
  }, [])

  const saveResourceReport = useCallback((report: SavedResourceReport) => {
    setState((current) => ({ ...current, resourceReports: [report, ...current.resourceReports.filter((item) => item.id !== report.id)].slice(0, 100) }))
  }, [])

  const removeResourceReport = useCallback((id: string) => {
    setState((current) => ({ ...current, resourceReports: current.resourceReports.filter((report) => report.id !== id) }))
  }, [])

  const saveUnderstanding = useCallback((record: UnderstandingRecord) => {
    setState((current) => ({ ...current, understandings: [record, ...current.understandings.filter((item) => item.id !== record.id)].slice(0, 100) }))
  }, [])

  const removeUnderstanding = useCallback((id: string) => {
    setState((current) => ({ ...current, understandings: current.understandings.filter((record) => record.id !== id) }))
  }, [])

  const saveClaimReview = useCallback((review: ClaimReview) => {
    setState((current) => ({ ...current, claimReviews: [review, ...current.claimReviews.filter((item) => item.claimId !== review.claimId || item.episodeId !== review.episodeId)] }))
  }, [])

  const saveThemeMap = useCallback((map: ThemeMap) => {
    setState((current) => ({ ...current, themeMaps: [map, ...current.themeMaps.filter((item) => item.id !== map.id)].slice(0, 100) }))
  }, [])

  const removeThemeMap = useCallback((id: string) => {
    setState((current) => ({ ...current, themeMaps: current.themeMaps.filter((map) => map.id !== id) }))
  }, [])

  const saveIdeaEvolution = useCallback((evolution: IdeaEvolution) => {
    setState((current) => ({ ...current, ideaEvolutions: [evolution, ...current.ideaEvolutions.filter((item) => item.id !== evolution.id)].slice(0, 300) }))
  }, [])

  const removeIdeaEvolution = useCallback((id: string) => {
    setState((current) => ({ ...current, ideaEvolutions: current.ideaEvolutions.filter((item) => item.id !== id) }))
  }, [])

  const saveCardProgress = useCallback((progress: CardProgress) => {
    setState((current) => {
      const exists = current.cardProgress.some((item) => item.vocabularyId === progress.vocabularyId)
      return {
        ...current,
        cardProgress: exists
          ? current.cardProgress.map((item) => item.vocabularyId === progress.vocabularyId ? progress : item)
          : [progress, ...current.cardProgress],
      }
    })
  }, [])

  const dismissPair = useCallback((key: string) => {
    setState((current) => ({ ...current, dismissedPairs: current.dismissedPairs.includes(key) ? current.dismissedPairs : [...current.dismissedPairs, key] }))
  }, [])

  const undismissPair = useCallback((key: string) => {
    setState((current) => ({ ...current, dismissedPairs: current.dismissedPairs.filter((item) => item !== key) }))
  }, [])

  const addManualPair = useCallback((key: string) => {
    setState((current) => ({
      ...current,
      dismissedPairs: current.dismissedPairs.filter((item) => item !== key),
      manualPairs: current.manualPairs.includes(key) ? current.manualPairs : [...current.manualPairs, key],
    }))
  }, [])

  const updateSettings = useCallback((patch: Partial<WorkspaceSettings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }, [])

  const refreshFeeds = useCallback(async (showIds?: string[], options: { recovery?: boolean } = {}) => {
    if (refreshingRef.current) return { added: 0, failed: 0 }
    refreshingRef.current = true
    const targets = state.shows.filter((show) => !showIds || showIds.includes(show.id))
    const knownGuids = new Set(state.episodes.map((episode) => `${episode.showId}\u0000${episode.guid}`))
    let added = 0
    let failed = 0
    setRefreshProgress({ active: true, completed: 0, total: targets.length, currentShow: '', currentShowId: '' })

    for (let index = 0; index < targets.length; index += 1) {
      const show = targets[index]
      setRefreshProgress({ active: true, completed: index, total: targets.length, currentShow: show.shortName, currentShowId: show.id, recoveryRound: options.recovery ? 1 : undefined, recoveryRounds: options.recovery ? FEED_RECOVERY_ROUNDS : undefined })
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), options.recovery ? 120000 : 60000)
      const updatedAt = new Date().toISOString()
      try {
        const fetched = await fetchFeed(show.feedUrl, state.settings.proxyUrl, controller.signal, {
          recovery: options.recovery,
          onRecoveryRound: (recoveryRound, recoveryRounds) => setRefreshProgress({ active: true, completed: index, total: targets.length, currentShow: show.shortName, currentShowId: show.id, recoveryRound, recoveryRounds }),
        })
        const fresh = fetched.filter((item) => !knownGuids.has(`${show.id}\u0000${item.guid}`))
        fresh.forEach((item) => knownGuids.add(`${show.id}\u0000${item.guid}`))
        const showAdded = fresh.length
        setState((current) => {
          const existing = new Set(current.episodes.filter((episode) => episode.showId === show.id).map((episode) => episode.guid))
          const newEpisodes: Episode[] = fresh.filter((item) => !existing.has(item.guid)).map((item) => ({
            ...item,
            id: uid('rss'),
            showId: show.id,
            status: 'inbox',
            addedAt: updatedAt,
            source: 'rss',
          }))
          const feedState: FeedState = {
            status: 'success',
            message: showAdded ? `${showAdded} new episodes added to the inbox` : 'Feed read successfully; no new episodes',
            updatedAt,
            addedCount: showAdded,
          }
          return {
            ...current,
            episodes: [...newEpisodes.reverse(), ...current.episodes],
            feedStatus: { ...current.feedStatus, [show.id]: feedState },
          }
        })
        added += showAdded
      } catch (error) {
        failed += 1
        const message = feedErrorMessage(error)
        setState((current) => ({
          ...current,
          feedStatus: { ...current.feedStatus, [show.id]: { status: 'error', message, updatedAt } },
        }))
      } finally {
        window.clearTimeout(timeout)
      }
    }

    setRefreshProgress({ active: false, completed: targets.length, total: targets.length, currentShow: '', currentShowId: '' })
    refreshingRef.current = false
    return { added, failed }
  }, [state.episodes, state.settings.proxyUrl, state.shows])

  const importWorkspace = useCallback((value: unknown) => {
    if (!isWorkspaceState(value)) return { ok: false, message: 'This is not a valid SkopeinSignal workspace backup.' }
    const showsValid = value.shows.every((show) => show && typeof show.id === 'string' && typeof show.name === 'string')
    const episodesValid = value.episodes.every((episode) => episode && typeof episode.id === 'string' && typeof episode.title === 'string' && typeof episode.showId === 'string')
    if (!showsValid || !episodesValid) return { ok: false, message: 'The backup is missing required show or episode fields. Nothing was imported.' }
    setState(migrateSavedState({
      ...value,
      dismissedPairs: [...value.dismissedPairs],
      feedStatus: { ...value.feedStatus },
    }))
    return { ok: true, message: 'Workspace imported successfully.' }
  }, [])

  const resetWorkspace = useCallback(() => {
    refreshingRef.current = false
    void clearLocalAudio().catch(() => undefined)
    setState(createInitialState())
  }, [])

  useEffect(() => {
    if (!state.settings.autoRefresh || state.lastAutoRefresh === todayKey() || autoRefreshStarted.current) return
    autoRefreshStarted.current = true
    void refreshFeeds().then(() => {
      setState((current) => ({ ...current, lastAutoRefresh: todayKey() }))
    })
  }, [refreshFeeds, state.lastAutoRefresh, state.settings.autoRefresh])

  const value = useMemo<WorkspaceContextValue>(() => ({
    state,
    storageError,
    cloud,
    refreshProgress,
    updateShow,
    addManualEpisode,
    enqueueEpisode,
    removeFromQueue,
    completeEpisode,
    skipEpisode,
    restoreEpisode,
    archiveEpisode,
    updateEpisode,
    saveStudySession,
    updateStudySession,
    updateTranscriptSegment,
    updateTranscriptTimeline,
    removeStudySession,
    saveVocabularyEntry,
    importVocabulary,
    removeVocabularyEntry,
    saveListeningNote,
    removeListeningNote,
    savePencilDrawing,
    removePencilDrawing,
    saveKimiSummary,
    removeKimiSummary,
    saveQuizAttempt,
    removeQuizAttempt,
    saveSpark,
    removeSpark,
    saveLearningTask,
    setLearningTaskDone,
    removeLearningTask,
    saveResourceReport,
    removeResourceReport,
    saveUnderstanding,
    removeUnderstanding,
    saveClaimReview,
    saveThemeMap,
    removeThemeMap,
    saveIdeaEvolution,
    removeIdeaEvolution,
    saveCardProgress,
    dismissPair,
    undismissPair,
    addManualPair,
    updateSettings,
    refreshFeeds,
    importWorkspace,
    resetWorkspace,
  }), [state, storageError, cloud, refreshProgress, updateShow, addManualEpisode, enqueueEpisode, removeFromQueue, completeEpisode, skipEpisode, restoreEpisode, archiveEpisode, updateEpisode, saveStudySession, updateStudySession, updateTranscriptSegment, updateTranscriptTimeline, removeStudySession, saveVocabularyEntry, importVocabulary, removeVocabularyEntry, saveListeningNote, removeListeningNote, savePencilDrawing, removePencilDrawing, saveKimiSummary, removeKimiSummary, saveQuizAttempt, removeQuizAttempt, saveSpark, removeSpark, saveLearningTask, setLearningTaskDone, removeLearningTask, saveResourceReport, removeResourceReport, saveUnderstanding, removeUnderstanding, saveClaimReview, saveThemeMap, removeThemeMap, saveIdeaEvolution, removeIdeaEvolution, saveCardProgress, dismissPair, undismissPair, addManualPair, updateSettings, refreshFeeds, importWorkspace, resetWorkspace])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}

export { STORAGE_KEY }
