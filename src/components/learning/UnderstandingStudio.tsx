import { useMemo, useState } from 'react'
import { BookOpenCheck, Check, CircleHelp, Clock3, Layers3, Loader2, Network, NotebookPen, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { chunkTranscriptSegments, selectTranscriptScope, transcriptCharacterCount, type UnderstandingScope } from '@contracts/understanding'
import { trpc } from '../../providers/trpc'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../lib/i18n'
import { uid } from '../../lib/format'
import { openStudyEpisode } from '../../lib/studyNavigation'
import type { Episode, UnderstandingClaim, UnderstandingRecord } from '../../types'

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/AI_[A-Z_]+|UNDERSTANDING_[A-Z_]+|UNAUTHORIZED/)?.[0] ?? 'AI_UNKNOWN'
}

export function UnderstandingStudio({ episode }: { episode: Episode }) {
  const { state, saveUnderstanding, removeUnderstanding, saveClaimReview, saveListeningNote } = useWorkspace()
  const { t, locale } = useI18n()
  const { isAuthenticated } = useAuth()
  const [scope, setScope] = useState<UnderstandingScope>('full')
  const [error, setError] = useState('')
  const [view, setView] = useState<'episode' | 'themes'>('episode')
  const session = state.studySessions.find((item) => item.episodeId === episode.id)
  const records = state.understandings.filter((item) => item.episodeId === episode.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const [recordId, setRecordId] = useState(records[0]?.id ?? '')
  const record = records.find((item) => item.id === recordId) ?? records[0]
  const analyze = trpc.understanding.analyze.useMutation()
  const language = locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English'
  const scopeLabels: Record<UnderstandingScope, string> = {
    full: t('Full transcript'),
    opening: t('Opening third'),
    middle: t('Middle third'),
    closing: t('Closing third'),
  }
  const selectedSegments = useMemo(() => session ? selectTranscriptScope(session.segments, scope) : [], [scope, session])
  const chunks = useMemo(() => chunkTranscriptSegments(selectedSegments), [selectedSegments])
  const sourceCharacters = session ? transcriptCharacterCount(session.segments) : 0
  const coveredCharacters = transcriptCharacterCount(selectedSegments)

  const generate = async () => {
    if (!session || !selectedSegments.length || analyze.isPending) return
    setError('')
    try {
      const result = await analyze.mutateAsync({
        episodeTitle: episode.title,
        language,
        scope,
        sourceCharacters,
        sourceSegments: session.segments.length,
        segments: selectedSegments,
      })
      const now = new Date().toISOString()
      const understandingId = uid('understanding')
      const saved: UnderstandingRecord = {
        ...result,
        id: understandingId,
        episodeId: episode.id,
        chapters: result.chapters.map((chapter, chapterIndex) => ({
          ...chapter,
          id: `${understandingId}-chapter-${chapterIndex + 1}`,
          claims: chapter.claims.map((claim, claimIndex) => ({ ...claim, id: `${understandingId}-claim-${chapterIndex + 1}-${claimIndex + 1}` })),
        })),
        createdAt: now,
        updatedAt: now,
      }
      saveUnderstanding(saved)
      setRecordId(saved.id)
      toast.success(t('Understanding record saved with source-linked evidence.'))
    } catch (reason) {
      setError(errorCode(reason))
    }
  }

  const review = (claim: UnderstandingClaim, status: 'agree' | 'unsure' | 'verify') => {
    const previous = state.claimReviews.find((item) => item.claimId === claim.id && item.episodeId === episode.id)
    saveClaimReview({ id: previous?.id ?? uid('review'), episodeId: episode.id, claimId: claim.id, status, note: previous?.note ?? '', updatedAt: new Date().toISOString() })
  }

  const claimToNote = (claim: UnderstandingClaim) => {
    saveListeningNote({
      episodeId: episode.id,
      body: `${claim.text}\n\n${t('Transcript evidence')}: “${claim.evidence}”`,
      startSeconds: claim.startSeconds,
    })
    toast.success(t('Claim and its source passage added to Notes.'))
  }

  const errorText: Record<string, string> = {
    UNDERSTANDING_TOO_LARGE: t('This selection needs more than 12 analysis chunks. Choose Opening, Middle, or Closing, or split a very long transcript into chapters before importing.'),
    AI_EVIDENCE_NOT_GROUNDED: t('The AI could not return verbatim, segment-linked evidence. Nothing was saved; retry deliberately or choose a smaller section.'),
    AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted. Your existing records and transcript remain available.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Existing notes and summaries still work.'),
    AI_TRANSIENT: t('The AI service is busy. No request was retried automatically; start again when ready.'),
    AI_CONTENT_REJECTED: t('The AI declined this transcript selection. Try another section.'),
    UNAUTHORIZED: t('Sign in to generate understanding records.'),
    AI_UNKNOWN: t('Understanding could not be generated. Nothing was saved and no request was retried automatically.'),
  }

  return <section className="understanding-studio" aria-labelledby="understanding-title">
    <div className="understanding-heading">
      <div><span className="section-index">{t('EVIDENCE / FULL TRANSCRIPT, NOT AN OPENING EXCERPT')}</span><h2 id="understanding-title">{t('Understand the argument. Interrogate the evidence.')}</h2><p>{t('Generate source-linked chapter maps, mark claims you agree with or still need to verify, and carry exact passages into Notes. A new record is saved only after the complete request succeeds.')}</p></div>
      <div className="understanding-view-switch" role="tablist" aria-label={t('Understanding view')}><button type="button" role="tab" aria-selected={view === 'episode'} className={view === 'episode' ? 'active' : ''} onClick={() => setView('episode')}><BookOpenCheck size={15} />{t('This episode')}</button><button type="button" role="tab" aria-selected={view === 'themes'} className={view === 'themes' ? 'active' : ''} onClick={() => setView('themes')}><Network size={15} />{t('Across episodes')}</button></div>
    </div>

    {view === 'themes' ? <ThemeMapStudio /> : <>
      <div className="understanding-generate">
        <div className="understanding-scope" role="group" aria-label={t('Transcript coverage')}>{(['full', 'opening', 'middle', 'closing'] as const).map((item) => <button type="button" key={item} className={scope === item ? 'active' : ''} aria-pressed={scope === item} onClick={() => setScope(item)}>{scopeLabels[item]}</button>)}</div>
        <div className="understanding-coverage"><span>{t('{covered} of {total} characters', { covered: coveredCharacters.toLocaleString(), total: sourceCharacters.toLocaleString() })}</span><span>{t('{chunks} chunks + 1 synthesis = {calls} billable calls', { chunks: chunks.length, calls: chunks.length + 1 })}</span></div>
        <button type="button" className="btn btn-primary" disabled={!isAuthenticated || !selectedSegments.length || chunks.length > 12 || analyze.isPending} onClick={() => void generate()}>{analyze.isPending ? <><Loader2 size={16} className="spin" />{t('Reading and linking evidence…')}</> : <><Layers3 size={16} />{t('Generate understanding')}</>}</button>
        <small>{t('Calls run sequentially and are never automatically retried. “Full” covers every imported segment only when it needs at most 12 chunks; the receipt below always reports actual coverage.')}</small>
      </div>
      {!session?.segments.length && <p className="learning-empty">{t('Import a transcript in Listen & Read first. Existing imported Kimi summaries below remain available without AI.')}</p>}
      {!isAuthenticated && <p className="form-hint">{t('Sign in to generate new analysis. Saved understanding records remain readable on this device.')}</p>}
      {error && <div className="cloud-sync-error" role="alert"><p>{errorText[error] ?? errorText.AI_UNKNOWN}</p></div>}

      {record ? <article className="understanding-record">
        <header><div><span className="section-index">{t('SAVED UNDERSTANDING / {scope}', { scope: record.scope.toUpperCase() })}</span><h3>{record.theme}</h3></div>{records.length > 1 && <select className="field" aria-label={t('Saved understanding versions')} value={record.id} onChange={(event) => setRecordId(event.target.value)}>{records.map((item) => <option key={item.id} value={item.id}>{new Date(item.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : locale)} · {item.scope}</option>)}</select>}<button type="button" className="btn btn-ghost btn-icon" onClick={() => { if (window.confirm(t('Delete this understanding record? Claim reviews, notes, and the transcript are kept.'))) removeUnderstanding(record.id) }} aria-label={t('Delete understanding record')}><Trash2 size={16} /></button></header>
        <div className="understanding-receipt"><span>{t('{covered}/{total} characters', { covered: record.coveredCharacters.toLocaleString(), total: record.sourceCharacters.toLocaleString() })}</span><span>{t('{covered}/{total} segments', { covered: record.coveredSegments, total: record.sourceSegments })}</span><span>{t('{count} analysis chunks + 1 synthesis', { count: record.chunkCount })}</span></div>
        <div className="understanding-arguments"><section><h4>{t('Core arguments')}</h4><ol>{record.coreArguments.map((item) => <li key={item}>{item}</li>)}</ol></section><section><h4>{t('Questions still open')}</h4><ul>{record.openQuestions.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
        <div className="understanding-chapters">{record.chapters.map((chapter, index) => <section key={chapter.id}><div className="chapter-heading"><span>{String(index + 1).padStart(2, '0')}</span><div><h4>{chapter.title}</h4><p>{chapter.summary}</p></div></div>{chapter.claims.map((claim) => {
          const reviewState = state.claimReviews.find((item) => item.claimId === claim.id && item.episodeId === episode.id)
          return <article className="evidence-claim" key={claim.id}><p className="claim-text">{claim.text}</p><blockquote>{claim.evidence}</blockquote><div className="claim-actions"><button type="button" className="text-link" onClick={() => openStudyEpisode(episode.id, claim.startSeconds ?? undefined)}><Play size={14} />{claim.startSeconds === null ? t('Open transcript segment') : t('Replay from {time}', { time: new Date(claim.startSeconds * 1000).toISOString().slice(11, 19) })}</button><button type="button" className="text-link" onClick={() => claimToNote(claim)}><NotebookPen size={14} />{t('Add evidence to Notes')}</button></div><div className="claim-review" role="group" aria-label={t('Your position on this claim')}><button type="button" className={reviewState?.status === 'agree' ? 'active' : ''} aria-pressed={reviewState?.status === 'agree'} onClick={() => review(claim, 'agree')}><Check size={13} />{t('Agree')}</button><button type="button" className={reviewState?.status === 'unsure' ? 'active' : ''} aria-pressed={reviewState?.status === 'unsure'} onClick={() => review(claim, 'unsure')}><CircleHelp size={13} />{t('Unsure')}</button><button type="button" className={reviewState?.status === 'verify' ? 'active' : ''} aria-pressed={reviewState?.status === 'verify'} onClick={() => review(claim, 'verify')}><Clock3 size={13} />{t('Verify')}</button></div></article>
        })}</section>)}</div>
      </article> : <p className="learning-empty">{t('No generated understanding record for this episode yet. Your original summary import below is unchanged.')}</p>}
    </>}
  </section>
}

function ThemeMapStudio() {
  const { state, saveThemeMap, removeThemeMap } = useWorkspace()
  const { t, locale } = useI18n()
  const { isAuthenticated } = useAuth()
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const generate = trpc.understanding.themes.useMutation()
  const candidates = state.understandings.filter((record) => record.chapters.some((chapter) => chapter.claims.length))
  const language = locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English'

  const selectedRecords = candidates.filter((record) => selected.includes(record.id))
  const selectedEpisodeCount = new Set(selectedRecords.map((record) => record.episodeId)).size
  const roleLabels = {
    support: t('SUPPORT'),
    contrast: t('CONTRAST'),
    question: t('QUESTION'),
  }

  const build = async () => {
    const records = selectedRecords.flatMap((record) => {
      const episode = state.episodes.find((item) => item.id === record.episodeId)
      return episode ? [{ episodeId: record.episodeId, episodeTitle: episode.title, claims: record.chapters.flatMap((chapter) => chapter.claims).map((claim) => ({ id: claim.id, text: claim.text, evidence: claim.evidence })) }] : []
    })
    if (records.length < 2 || selectedEpisodeCount < 2) return
    setError('')
    try {
      const result = await generate.mutateAsync({ language, records })
      const now = new Date().toISOString()
      result.themes.forEach((theme) => saveThemeMap({ ...theme, id: uid('theme'), createdAt: now, updatedAt: now }))
      setSelected([])
      toast.success(t('Cross-episode themes saved with their original claim references.'))
    } catch (reason) { setError(errorCode(reason)) }
  }

  return <div className="theme-map-studio">
    <div className="theme-map-generate"><div><h3>{t('Compare arguments across episodes')}</h3><p>{t('Choose at least two saved understanding records. Every grouped claim remains linked to its original episode and evidence.')}</p></div><div className="theme-record-choices">{candidates.map((record) => {
      const episode = state.episodes.find((item) => item.id === record.episodeId)
      const checked = selected.includes(record.id)
      return <label key={record.id}><input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== record.id) : [...current, record.id].slice(-12))} /><span><strong>{episode?.title ?? record.episodeId}</strong><small>{record.theme} · {new Date(record.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : locale)} · {record.scope}</small></span></label>
    })}</div><button type="button" className="btn btn-primary" disabled={!isAuthenticated || selectedRecords.length < 2 || selectedEpisodeCount < 2 || generate.isPending} onClick={() => void build()}>{generate.isPending ? <><Loader2 size={16} className="spin" />{t('Comparing claims…')}</> : <><Network size={16} />{t('Build theme maps')}</>}</button><small>{t('One billable AI call, never automatically retried. Choose up to 12 record versions spanning at least two episodes.')}</small></div>
    {error && <div className="cloud-sync-error" role="alert"><p>{error === 'AI_QUOTA_EXHAUSTED' ? t('The site owner’s AI quota is exhausted. Existing theme maps remain available.') : t('Theme maps could not be generated. Nothing was saved and no request was retried automatically.')}</p></div>}
    {!candidates.length && <p className="learning-empty">{t('Generate understanding records for at least two episodes before comparing themes.')}</p>}
    <div className="theme-map-list">{state.themeMaps.map((map) => <article key={map.id}><header><div><span className="section-index">{t('{count} EPISODES / SHARED INQUIRY', { count: map.episodeIds.length })}</span><h3>{map.title}</h3></div><button type="button" className="btn btn-ghost btn-icon" onClick={() => { if (window.confirm(t('Delete this theme map? Source records and notes are kept.'))) removeThemeMap(map.id) }} aria-label={t('Delete theme map')}><Trash2 size={16} /></button></header><p>{map.synthesis}</p><ul>{map.questions.map((item) => <li key={item}>{item}</li>)}</ul><div className="theme-claims">{map.claims.map((reference) => {
      const episode = state.episodes.find((item) => item.id === reference.episodeId)
      const claim = state.understandings.find((record) => record.episodeId === reference.episodeId)?.chapters.flatMap((chapter) => chapter.claims).find((item) => item.id === reference.claimId)
      return <button type="button" key={`${reference.episodeId}-${reference.claimId}`} onClick={() => openStudyEpisode(reference.episodeId, claim?.startSeconds ?? undefined)}><span>{roleLabels[reference.role]}</span><strong>{claim?.text ?? t('Source claim is no longer available')}</strong><small>{episode?.title}</small></button>
    })}</div></article>)}</div>
  </div>
}
