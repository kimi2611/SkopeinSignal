export type Tier = 'radar' | 'main' | 'supplement' | 'archive'
export type UiLocale = 'en' | 'zh-CN' | 'de'
export type AtelierTheme = 'toot-puddle' | 'forest-dusk' | 'mist-dawn' | 'whimsical' | 'pure'
export type EpisodeStatus = 'inbox' | 'queue' | 'listened' | 'skipped' | 'archived'
export type EpisodeLens = 'aithrascope' | 'dikelens'
export type EpisodeDurationCategory = 'long' | 'medium' | 'micro'
export type ViewKey = 'week' | 'inbox' | 'shows' | 'dedupe' | 'study' | 'quiz' | 'sparks' | 'gallery' | 'notes' | 'insights' | 'cards' | 'guide' | 'account' | 'settings'
export type EpisodeValueCategory = 'timely' | 'evergreen' | 'uncategorized'

export interface PodcastShow {
  id: string
  name: string
  shortName: string
  code: string
  tier: Tier
  domain: string
  language: 'Chinese' | 'English' | 'Deutsch'
  role: string
  feedUrl: string
  skipStreak: number
  totalSnips: number
}

export interface Episode {
  id: string
  guid: string
  showId: string
  title: string
  description: string
  link: string
  audioUrl: string
  publishedAt: string
  durationMinutes: number | null
  status: EpisodeStatus
  addedAt: string
  listenedAt?: string
  skippedAt?: string
  skipReason?: string
  selectionReasons?: string[]
  dedupKey?: string
  lens?: EpisodeLens
  valueCategory?: EpisodeValueCategory
  source: 'rss' | 'manual' | 'seed'
}

export interface Activity {
  id: string
  episodeId: string
  showId: string
  type: 'listened' | 'skipped'
  date: string
  note?: string
  snips?: number
  reason?: string
}

export interface FeedState {
  status: 'success' | 'error'
  message: string
  updatedAt: string
  addedCount?: number
}

export interface TranscriptSegment {
  id: string
  start: number | null
  end: number | null
  text: string
}

export interface StudySession {
  episodeId: string
  audioMode: 'rss' | 'local'
  audioUrl: string
  transcriptFormat: 'vtt' | 'srt' | 'txt' | 'md'
  segments: TranscriptSegment[]
  positionSeconds: number
  followTranscript: boolean
  updatedAt: string
  completedAt?: string
  handoffExportedAt?: string
}

export interface VocabularyEntry {
  id: string
  episodeId: string
  surface: string
  translation: string
  language: PodcastShow['language']
  context: string
  startSeconds: number | null
  createdAt: string
  updatedAt: string
}

export interface ListeningNote {
  id: string
  episodeId: string
  body: string
  startSeconds: number | null
  createdAt: string
  updatedAt: string
}

export interface PencilPoint {
  x: number
  y: number
  pressure: number
}

export interface PencilStroke {
  id: string
  color: string
  width: number
  points: PencilPoint[]
}

export interface PencilDrawing {
  id: string
  title: string
  episodeId: string | null
  strokes: PencilStroke[]
  recognizedText?: string
  recognitionConfidence?: 'high' | 'medium' | 'low'
  createdAt: string
  updatedAt: string
}

export interface QuizQuestion {
  id: string
  prompt: string
  referenceAnswer: string
}

export type QuizVerdictValue = 'correct' | 'partial' | 'missed'

export interface QuizVerdict {
  questionId: string
  verdict: QuizVerdictValue
  feedback: string
}

export interface QuizAttempt {
  id: string
  episodeId: string
  questions: QuizQuestion[]
  answers: Record<string, string>
  verdicts: QuizVerdict[]
  score: number
  createdAt: string
}

export interface SparkReply {
  evaluation: string
  strengths: string[]
  suggestions: string[]
  followUp: string
}

export interface Spark {
  id: string
  episodeId: string | null
  text: string
  reply: SparkReply | null
  createdAt: string
}

export interface KimiSummary {
  episodeId: string
  theme: string
  coreArguments: string[]
  evidence: string[]
  expertPerspectives: string[]
  source: 'json' | 'markdown' | 'text' | 'snipd' | 'ai'
  importedAt: string
  updatedAt: string
}

export interface CardProgress {
  vocabularyId: string
  dueAt: string
  intervalDays: number
  ease: number
  repetitions: number
  lapses: number
  lastReviewedAt?: string
}

export interface WorkspaceSettings {
  uiLocale: UiLocale
  theme: AtelierTheme
  longCap: number
  mediumCap: number
  microCap: number
  autoRefresh: boolean
  proxyUrl: string
}

export interface LearningTask {
  id: string
  episodeId: string
  kind: 'replay' | 'note' | 'spark' | 'retest'
  title: string
  detail: string
  sourceId: string | null
  startSeconds: number | null
  status: 'open' | 'done'
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface SavedResourceReport {
  id: string
  title: string
  idea: string
  episodeId: string | null
  sparkId: string | null
  report: import('@contracts/research').ResourceReport
  createdAt: string
  updatedAt: string
}

export interface UnderstandingClaim {
  id: string
  text: string
  evidence: string
  segmentId: string
  startSeconds: number | null
}

export interface UnderstandingChapter {
  id: string
  title: string
  summary: string
  claims: UnderstandingClaim[]
}

export interface UnderstandingRecord {
  id: string
  episodeId: string
  scope: 'full' | 'opening' | 'middle' | 'closing'
  sourceCharacters: number
  coveredCharacters: number
  sourceSegments: number
  coveredSegments: number
  chunkCount: number
  theme: string
  coreArguments: string[]
  openQuestions: string[]
  chapters: UnderstandingChapter[]
  createdAt: string
  updatedAt: string
}

export interface ClaimReview {
  id: string
  episodeId: string
  claimId: string
  status: 'agree' | 'unsure' | 'verify'
  note: string
  updatedAt: string
}

export interface ThemeMapClaim {
  claimId: string
  episodeId: string
  role: 'support' | 'contrast' | 'question'
}

export interface ThemeMap {
  id: string
  title: string
  synthesis: string
  questions: string[]
  claims: ThemeMapClaim[]
  episodeIds: string[]
  createdAt: string
  updatedAt: string
}

export interface IdeaStage {
  id: string
  kind: 'origin' | 'ai-question' | 'research' | 'revision' | 'defense'
  text: string
  sourceId: string | null
  createdAt: string
}

export interface IdeaEvolution {
  id: string
  sparkId: string
  episodeId: string | null
  title: string
  stages: IdeaStage[]
  createdAt: string
  updatedAt: string
}

export interface WorkspaceState {
  version: 1
  seedRevision: number
  shows: PodcastShow[]
  episodes: Episode[]
  activities: Activity[]
  dismissedPairs: string[]
  manualPairs: string[]
  settings: WorkspaceSettings
  feedStatus: Record<string, FeedState>
  lastAutoRefresh: string | null
  studySessions: StudySession[]
  vocabulary: VocabularyEntry[]
  notes: ListeningNote[]
  pencilDrawings: PencilDrawing[]
  summaries: KimiSummary[]
  cardProgress: CardProgress[]
  quizAttempts: QuizAttempt[]
  sparks: Spark[]
  learningTasks: LearningTask[]
  resourceReports: SavedResourceReport[]
  understandings: UnderstandingRecord[]
  claimReviews: ClaimReview[]
  themeMaps: ThemeMap[]
  ideaEvolutions: IdeaEvolution[]
}

export interface FetchedEpisode {
  guid: string
  title: string
  description: string
  link: string
  audioUrl: string
  publishedAt: string
  durationMinutes: number | null
}

export interface DuplicatePair {
  key: string
  left: Episode
  right: Episode
  score: number
  shared: string[]
}

export const TIER_LABELS: Record<Tier, string> = {
  radar: '00 Signal Radar',
  main: '10 Core Threads',
  supplement: '20 Selective Listening',
  archive: '30 Reference Library',
}

export const STATUS_LABELS: Record<EpisodeStatus, string> = {
  inbox: 'Inbox',
  queue: 'This week',
  listened: 'Listened',
  skipped: 'Skipped',
  archived: 'Library',
}
