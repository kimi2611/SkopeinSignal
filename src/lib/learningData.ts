import type {
  ClaimReview,
  IdeaEvolution,
  IdeaStage,
  LearningTask,
  SavedResourceReport,
  Spark,
  ThemeMap,
  UnderstandingChapter,
  UnderstandingClaim,
  UnderstandingRecord,
  WorkspaceState,
} from '../types'
import type { ResourceReport } from '@contracts/research'
import { uid } from './format'

const text = (value: unknown, max = 4000): string => typeof value === 'string' ? value.trim().slice(0, max) : ''
const id = (value: unknown): string => text(value, 160)
const date = (value: unknown): string => text(value, 80) || new Date().toISOString()
const nullableId = (value: unknown): string | null => text(value, 160) || null
const strings = (value: unknown, count = 12, max = 2000): string[] => Array.isArray(value)
  ? value.flatMap((item) => text(item, max) ? [text(item, max)] : []).slice(0, count)
  : []

function sanitizeReport(value: unknown): ResourceReport | null {
  if (!value || typeof value !== 'object') return null
  const report = value as Partial<ResourceReport>
  if (!Array.isArray(report.comparisons)) return null
  const comparisons = report.comparisons.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || !candidate.resource) return []
    const resource = candidate.resource
    const title = text(resource.title, 1200)
    const url = text(resource.url, 2000)
    if (!title || !/^https:\/\//.test(url)) return []
    return [{
      expertView: text(candidate.expertView),
      alignment: text(candidate.alignment),
      keyDifference: text(candidate.keyDifference),
      evidenceScope: candidate.evidenceScope === 'abstract' ? 'abstract' as const : 'metadata' as const,
      resource: {
        id: id(resource.id) || url,
        title,
        authors: strings(resource.authors, 8, 300),
        year: Number.isInteger(resource.year) ? resource.year ?? null : null,
        venue: text(resource.venue, 500),
        url,
        doi: text(resource.doi, 2000) || null,
        database: resource.database === 'Crossref' ? 'Crossref' as const : 'OpenAlex' as const,
        abstract: text(resource.abstract, 6000),
        ...(resource.verification && typeof resource.verification === 'object' ? {
          verification: {
            status: resource.verification.status === 'cross-verified' || resource.verification.status === 'metadata-conflict'
              ? resource.verification.status
              : 'single-source' as const,
            sources: Array.isArray(resource.verification.sources)
              ? resource.verification.sources.filter((source) => source === 'OpenAlex' || source === 'Crossref').slice(0, 2)
              : [],
            conflicts: Array.isArray(resource.verification.conflicts)
              ? resource.verification.conflicts.filter((field) => field === 'title' || field === 'year').slice(0, 2)
              : [],
            checkedAt: text(resource.verification.checkedAt, 80),
          },
        } : {}),
        ...(Array.isArray(resource.provenance) ? {
          provenance: resource.provenance.flatMap((item) => {
            if (!item || typeof item !== 'object' || !text(item.retrievedAt, 80)) return []
            return [{
              database: item.database === 'Crossref' ? 'Crossref' as const : 'OpenAlex' as const,
              retrieval: item.retrieval === 'stale-cache' || item.retrieval === 'cache' ? item.retrieval : 'network' as const,
              retrievedAt: text(item.retrievedAt, 80),
            }]
          }).slice(0, 2),
        } : {}),
      },
    }]
  })
  if (!comparisons.length || !text(report.overallComparison) || !text(report.feasibility)) return null
  return {
    query: text(report.query, 300),
    searchedAt: date(report.searchedAt),
    comparisons,
    overallComparison: text(report.overallComparison, 8000),
    feasibility: text(report.feasibility, 8000),
    assumptions: strings(report.assumptions, 8),
    nextExperiment: text(report.nextExperiment, 5000),
    caveats: strings(report.caveats, 8),
    ...(Array.isArray(report.sourceOutcomes) ? {
      sourceOutcomes: report.sourceOutcomes.flatMap((source) => {
        if (!source || typeof source !== 'object') return []
        return [{
          database: source.database === 'Crossref' ? 'Crossref' as const : 'OpenAlex' as const,
          status: source.status === 'unavailable' ? 'unavailable' as const : 'ok' as const,
          recordCount: Number.isInteger(source.recordCount) ? Math.max(0, Math.min(20, source.recordCount)) : 0,
        }]
      }).slice(0, 2),
    } : {}),
  }
}

function sanitizeClaims(value: unknown): UnderstandingClaim[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const claimId = id(candidate.id)
    const claim = text(candidate.text)
    if (!claimId || !claim) return []
    return [{
      id: claimId,
      text: claim,
      evidence: text(candidate.evidence, 5000),
      segmentId: id(candidate.segmentId),
      startSeconds: Number.isFinite(candidate.startSeconds) ? Math.max(0, candidate.startSeconds as number) : null,
    }]
  })
}

export function sanitizeLearningCollections(saved: Partial<WorkspaceState>): Pick<WorkspaceState, 'learningTasks' | 'resourceReports' | 'understandings' | 'claimReviews' | 'themeMaps' | 'ideaEvolutions'> {
  const learningTasks = (Array.isArray(saved.learningTasks) ? saved.learningTasks : []).flatMap((candidate): LearningTask[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const taskId = id(candidate.id)
    const episodeId = id(candidate.episodeId)
    const title = text(candidate.title, 800)
    if (!taskId || !episodeId || !title) return []
    const status = candidate.status === 'done' ? 'done' : 'open'
    const kind = ['replay', 'note', 'spark', 'retest'].includes(candidate.kind as string) ? candidate.kind as LearningTask['kind'] : 'note'
    return [{
      id: taskId,
      episodeId,
      kind,
      title,
      detail: text(candidate.detail, 5000),
      sourceId: nullableId(candidate.sourceId),
      startSeconds: Number.isFinite(candidate.startSeconds) ? Math.max(0, candidate.startSeconds as number) : null,
      status,
      createdAt: date(candidate.createdAt),
      updatedAt: date(candidate.updatedAt),
      completedAt: status === 'done' ? date(candidate.completedAt) : null,
    }]
  }).slice(0, 500)

  const resourceReports = (Array.isArray(saved.resourceReports) ? saved.resourceReports : []).flatMap((candidate): SavedResourceReport[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const report = sanitizeReport(candidate.report)
    const reportId = id(candidate.id)
    const idea = text(candidate.idea, 1500)
    if (!report || !reportId || !idea) return []
    return [{
      id: reportId,
      title: text(candidate.title, 200) || idea.slice(0, 80),
      idea,
      episodeId: nullableId(candidate.episodeId),
      sparkId: nullableId(candidate.sparkId),
      report,
      createdAt: date(candidate.createdAt),
      updatedAt: date(candidate.updatedAt),
    }]
  }).slice(0, 100)

  const understandings = (Array.isArray(saved.understandings) ? saved.understandings : []).flatMap((candidate): UnderstandingRecord[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const recordId = id(candidate.id)
    const episodeId = id(candidate.episodeId)
    const theme = text(candidate.theme, 1500)
    if (!recordId || !episodeId || !theme) return []
    const chapters = (Array.isArray(candidate.chapters) ? candidate.chapters : []).flatMap((chapter): UnderstandingChapter[] => {
      if (!chapter || typeof chapter !== 'object') return []
      const chapterId = id(chapter.id)
      const title = text(chapter.title, 800)
      if (!chapterId || !title) return []
      return [{ id: chapterId, title, summary: text(chapter.summary, 6000), claims: sanitizeClaims(chapter.claims) }]
    }).slice(0, 40)
    const scope = ['full', 'opening', 'middle', 'closing'].includes(candidate.scope as string) ? candidate.scope as UnderstandingRecord['scope'] : 'full'
    return [{
      id: recordId,
      episodeId,
      scope,
      sourceCharacters: Math.max(0, Number(candidate.sourceCharacters) || 0),
      coveredCharacters: Math.max(0, Number(candidate.coveredCharacters) || 0),
      sourceSegments: Math.max(0, Number(candidate.sourceSegments) || 0),
      coveredSegments: Math.max(0, Number(candidate.coveredSegments) || 0),
      chunkCount: Math.max(1, Number(candidate.chunkCount) || 1),
      theme,
      coreArguments: strings(candidate.coreArguments, 12, 4000),
      openQuestions: strings(candidate.openQuestions, 12, 2000),
      chapters,
      createdAt: date(candidate.createdAt),
      updatedAt: date(candidate.updatedAt),
    }]
  }).slice(0, 100)

  const claimReviews = (Array.isArray(saved.claimReviews) ? saved.claimReviews : []).flatMap((candidate): ClaimReview[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const reviewId = id(candidate.id)
    const claimId = id(candidate.claimId)
    const episodeId = id(candidate.episodeId)
    if (!reviewId || !claimId || !episodeId) return []
    const status = candidate.status === 'agree' || candidate.status === 'verify' ? candidate.status : 'unsure'
    return [{ id: reviewId, episodeId, claimId, status, note: text(candidate.note, 3000), updatedAt: date(candidate.updatedAt) }]
  }).slice(0, 2000)

  const themeMaps = (Array.isArray(saved.themeMaps) ? saved.themeMaps : []).flatMap((candidate): ThemeMap[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const mapId = id(candidate.id)
    const title = text(candidate.title, 800)
    if (!mapId || !title || !Array.isArray(candidate.claims)) return []
    const claims = candidate.claims.flatMap((claim): ThemeMap['claims'] => {
      if (!claim || typeof claim !== 'object') return []
      const claimId = id(claim.claimId)
      const episodeId = id(claim.episodeId)
      if (!claimId || !episodeId) return []
      const role = claim.role === 'contrast' || claim.role === 'question' ? claim.role : 'support'
      return [{ claimId, episodeId, role }]
    }).slice(0, 100)
    return [{
      id: mapId,
      title,
      synthesis: text(candidate.synthesis, 8000),
      questions: strings(candidate.questions, 8),
      claims,
      episodeIds: Array.from(new Set((Array.isArray(candidate.episodeIds) ? candidate.episodeIds : []).map(id).filter(Boolean))).slice(0, 40),
      createdAt: date(candidate.createdAt),
      updatedAt: date(candidate.updatedAt),
    }]
  }).slice(0, 100)

  const ideaEvolutions = (Array.isArray(saved.ideaEvolutions) ? saved.ideaEvolutions : []).flatMap((candidate): IdeaEvolution[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const evolutionId = id(candidate.id)
    const sparkId = id(candidate.sparkId)
    if (!evolutionId || !sparkId) return []
    const stages = (Array.isArray(candidate.stages) ? candidate.stages : []).flatMap((stage): IdeaStage[] => {
      if (!stage || typeof stage !== 'object') return []
      const stageId = id(stage.id)
      const body = text(stage.text, 8000)
      if (!stageId || !body) return []
      const kind = ['origin', 'ai-question', 'research', 'revision', 'defense'].includes(stage.kind as string) ? stage.kind as IdeaStage['kind'] : 'revision'
      return [{ id: stageId, kind, text: body, sourceId: nullableId(stage.sourceId), createdAt: date(stage.createdAt) }]
    }).slice(0, 100)
    return [{
      id: evolutionId,
      sparkId,
      episodeId: nullableId(candidate.episodeId),
      title: text(candidate.title, 200) || 'Idea evolution',
      stages,
      createdAt: date(candidate.createdAt),
      updatedAt: date(candidate.updatedAt),
    }]
  }).slice(0, 300)

  return { learningTasks, resourceReports, understandings, claimReviews, themeMaps, ideaEvolutions }
}

export function ensureIdeaEvolutions(sparks: Spark[], existing: IdeaEvolution[]): IdeaEvolution[] {
  const bySpark = new Map(existing.map((item) => [item.sparkId, item]))
  const generated = sparks.flatMap((spark): IdeaEvolution[] => {
    if (bySpark.has(spark.id)) return []
    const stages: IdeaStage[] = [{ id: uid('stage'), kind: 'origin', text: spark.text, sourceId: spark.id, createdAt: spark.createdAt }]
    if (spark.reply?.followUp) stages.push({ id: uid('stage'), kind: 'ai-question', text: spark.reply.followUp, sourceId: spark.id, createdAt: spark.createdAt })
    return [{
      id: uid('evolution'),
      sparkId: spark.id,
      episodeId: spark.episodeId,
      title: spark.text.slice(0, 90),
      stages,
      createdAt: spark.createdAt,
      updatedAt: spark.createdAt,
    }]
  })
  return [...generated, ...existing.filter((item) => sparks.some((spark) => spark.id === item.sparkId))]
}

export function understandingClaims(record: UnderstandingRecord): UnderstandingClaim[] {
  return record.chapters.flatMap((chapter) => chapter.claims)
}
