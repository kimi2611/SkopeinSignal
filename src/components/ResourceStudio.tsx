import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, BookOpen, Database, Download, FlaskConical, FolderOpen, Lightbulb, Loader2, NotebookPen, Save, Search, Scale, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import type { ResearchResource, ResourceComparison, ResourceReport } from '@contracts/research'
import { trpc } from '../providers/trpc'
import { useWorkspace } from '../hooks/useWorkspace'
import { useI18n } from '../lib/i18n'
import { uid } from '../lib/format'
import { downloadText, safeFilename } from '../lib/handoff'
import type { IdeaEvolution, SavedResourceReport } from '../types'

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/AI_[A-Z_]+|RESOURCE_[A-Z_]+|UNAUTHORIZED/)?.[0] ?? 'AI_UNKNOWN'
}

interface ResourceStudioProps {
  initialEpisodeId?: string
  initialSparkId?: string
}

export function ResourceStudio({ initialEpisodeId = '', initialSparkId = '' }: ResourceStudioProps) {
  const { state, saveResourceReport, removeResourceReport, saveListeningNote, saveSpark, saveIdeaEvolution } = useWorkspace()
  const { t, locale } = useI18n()
  const initialSpark = state.sparks.find((spark) => spark.id === initialSparkId)
  const [text, setText] = useState(initialSpark?.text ?? '')
  const [report, setReport] = useState<ResourceReport | null>(null)
  const [activeId, setActiveId] = useState('')
  const [title, setTitle] = useState('')
  const [episodeId, setEpisodeId] = useState(initialSpark?.episodeId ?? initialEpisodeId)
  const [sparkId, setSparkId] = useState(initialSparkId)
  const [error, setError] = useState('')
  const compare = trpc.resources.compare.useMutation()
  const language = locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English'
  const sourceDate = (value: string) => new Date(value).toLocaleString(locale === 'en' ? 'en-US' : locale)
  const verificationLabel = (resource: ResearchResource) => {
    if (resource.verification?.status === 'cross-verified') return t('Cross-source metadata matched')
    if (resource.verification?.status === 'metadata-conflict') return t('Metadata needs review')
    return t('Single-source · not cross-checked')
  }
  const verificationDescription = (resource: ResearchResource) => {
    if (resource.verification?.status === 'cross-verified') return t('The canonical DOI and normalized title match in OpenAlex and Crossref. This confirms bibliographic consistency, not the truth of the findings.')
    if (resource.verification?.status === 'metadata-conflict') {
      const fields = resource.verification.conflicts.map((field) => field === 'title' ? t('title') : t('year')).join(' / ')
      return t('The DOI matches, but the {fields} metadata differs between indexes. Review both source records before citing.', { fields })
    }
    if (resource.verification?.status === 'single-source') return t('Only one scholarly index supplied this record in this search. Its metadata has not been cross-checked against the other index.')
    return t('This saved report has no cross-source verification record. Open the original source before citing it.')
  }
  const provenanceText = (resource: ResearchResource) => resource.provenance?.map((item) => {
    const retrieval = item.retrieval === 'stale-cache' ? t('time-limited cached snapshot') : item.retrieval === 'cache' ? t('validated fresh cache') : t('live response')
    return `${item.database} · ${retrieval} · ${sourceDate(item.retrievedAt)}`
  }).join(' | ') ?? ''

  const errorCopy: Record<string, string> = {
    AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted. Your idea remains here; no search was retried.'),
    AI_CONTENT_REJECTED: t('The AI declined this idea. Rephrase it as a researchable claim and try again.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
    AI_TRANSIENT: t('The AI service is busy. Nothing was retried automatically; start the comparison again when ready.'),
    AI_INVALID_REQUEST: t('The research request could not be prepared. Shorten the idea and try again.'),
    AI_EMPTY_RESULT: t('The AI returned an incomplete comparison. No result was saved; try again when ready.'),
    RESOURCE_SEARCH_UNAVAILABLE: t('Both scholarly databases are unavailable right now. Your idea remains here; try the search again later.'),
    RESOURCE_NO_MATCHES: t('The live scholarly indexes returned no usable records for this query. Broaden the idea or name the mechanism you want to compare.'),
    UNAUTHORIZED: t('Sign in to use Resources.'),
    AI_UNKNOWN: t('The research request failed. Your idea remains here; try again when ready.'),
  }

  const persist = (patch: Partial<Pick<SavedResourceReport, 'title' | 'episodeId' | 'sparkId'>> = {}) => {
    if (!report) return
    const previous = state.resourceReports.find((item) => item.id === activeId)
    const now = new Date().toISOString()
    const saved: SavedResourceReport = {
      id: activeId || uid('resource-report'),
      title: patch.title === undefined ? title.trim() || text.trim().slice(0, 90) : patch.title.trim() || text.trim().slice(0, 90),
      idea: text.trim(),
      episodeId: patch.episodeId === undefined ? episodeId || null : patch.episodeId,
      sparkId: patch.sparkId === undefined ? sparkId || null : patch.sparkId,
      report,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    saveResourceReport(saved)
    setActiveId(saved.id)
    setTitle(saved.title)
  }

  const recordResearchStage = (body: string, sourceId: string | null, targetSparkId = sparkId) => {
    if (!targetSparkId) return
    const spark = state.sparks.find((item) => item.id === targetSparkId)
    if (!spark) return
    const now = new Date().toISOString()
    const existing = state.ideaEvolutions.find((item) => item.sparkId === targetSparkId)
    const evolution: IdeaEvolution = existing ?? {
      id: uid('evolution'),
      sparkId: targetSparkId,
      episodeId: spark.episodeId,
      title: spark.text.slice(0, 90),
      stages: [{ id: uid('stage'), kind: 'origin', text: spark.text, sourceId: spark.id, createdAt: spark.createdAt }],
      createdAt: spark.createdAt,
      updatedAt: now,
    }
    if (sourceId && evolution.stages.some((stage) => stage.kind === 'research' && stage.sourceId === sourceId && stage.text === body)) return
    saveIdeaEvolution({
      ...evolution,
      stages: [...evolution.stages, { id: uid('stage'), kind: 'research', text: body, sourceId, createdAt: now }],
      updatedAt: now,
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const spark = text.trim()
    if (spark.length < 4 || compare.isPending) return
    setError('')
    setReport(null)
    setActiveId('')
    try {
      const result = await compare.mutateAsync({ language, spark })
      const now = new Date().toISOString()
      const saved: SavedResourceReport = {
        id: uid('resource-report'),
        title: spark.slice(0, 90),
        idea: spark,
        episodeId: episodeId || null,
        sparkId: sparkId || null,
        report: result,
        createdAt: now,
        updatedAt: now,
      }
      saveResourceReport(saved)
      if (saved.sparkId) recordResearchStage([
        `${t('Research comparison')}: ${result.overallComparison}`,
        `${t('What must be true')}: ${result.assumptions.join(' | ')}`,
      ].join('\n'), saved.id, saved.sparkId)
      setReport(result)
      setActiveId(saved.id)
      setTitle(saved.title)
      toast.success(t('Research report saved. Reopen it below or carry its evidence into Notes and idea evolution.'))
    } catch (reason) {
      setError(errorCode(reason))
    }
  }

  const reopen = (saved: SavedResourceReport) => {
    setReport(saved.report)
    setActiveId(saved.id)
    setTitle(saved.title)
    setText(saved.idea)
    setEpisodeId(saved.episodeId ?? '')
    setSparkId(saved.sparkId ?? '')
    setError('')
  }

  const removeSaved = (id: string) => {
    if (!window.confirm(t('Delete this saved research report? Notes, sparks, and idea stages already created from it are kept.'))) return
    removeResourceReport(id)
    if (activeId === id) {
      setActiveId('')
      setReport(null)
      setTitle('')
    }
  }

  const receipt = () => [
    `${t('Query')}: ${report?.query ?? ''}`,
    `${t('Searched')}: ${report?.searchedAt ?? ''}`,
    ...(report?.sourceOutcomes?.map((source) => `${source.database}: ${source.status === 'ok' ? t('available · {count} usable records', { count: source.recordCount }) : t('unavailable in this search')}`) ?? []),
    t('The analysis uses titles, metadata, and abstracts returned in this search. It is not a full-text systematic review.'),
  ].join('\n')

  const comparisonText = (comparison: ResourceComparison) => [
    comparison.resource.title,
    `${comparison.resource.database}${comparison.resource.doi ? ` · DOI: ${comparison.resource.doi}` : ''}`,
    comparison.resource.url,
    `${comparison.resource.authors.join(', ') || t('Authors not listed')} · ${comparison.resource.year ?? t('Year not listed')} · ${comparison.resource.venue}`,
    `${t('Evidence scope')}: ${comparison.evidenceScope === 'abstract' ? t('Abstract evidence') : t('Metadata only')}`,
    `${t('Metadata verification')}: ${verificationLabel(comparison.resource)} — ${verificationDescription(comparison.resource)}`,
    ...(provenanceText(comparison.resource) ? [`${t('Source retrieval')}: ${provenanceText(comparison.resource)}`] : []),
    `${t('Expert view · AI paraphrase')}: ${comparison.expertView}`,
    `${t('Where your ideas meet')}: ${comparison.alignment}`,
    `${t('The subtle, consequential difference')}: ${comparison.keyDifference}`,
    receipt(),
  ].join('\n\n')

  const synthesisText = () => [
    title || text,
    `${t('Synthesis')}: ${report?.overallComparison ?? ''}`,
    `${t('Implementation possibility')}: ${report?.feasibility ?? ''}`,
    `${t('What must be true')}: ${report?.assumptions.join(' | ') ?? ''}`,
    `${t('Smallest useful next experiment')}: ${report?.nextExperiment ?? ''}`,
    `${t('Evidence limits')}: ${report?.caveats.join(' | ') ?? ''}`,
    receipt(),
  ].join('\n\n')

  const downloadReport = () => {
    if (!report) return
    persist()
    const comparisons = report.comparisons.map((comparison, index) => [
      `### ${index + 1}. ${comparison.resource.title}`,
      comparisonText(comparison),
    ].join('\n\n')).join('\n\n')
    const markdown = [
      `# ${title.trim() || text.trim().slice(0, 90) || t('Research report')}`,
      `${t('Query')}: ${report.query}`,
      `${t('Searched')}: ${report.searchedAt}`,
      `${t('File generated')}: ${new Date().toISOString()}`,
      `## ${t('Synthesis')}`,
      synthesisText(),
      `## ${t('Expert comparisons')}`,
      comparisons,
    ].join('\n\n')
    const requestedFilename = safeFilename(title.trim() || text.trim() || 'research-report')
    const portableFilename = /^[\x20-\x7E]+$/.test(requestedFilename)
      ? requestedFilename
      : `research-report-${new Date().toISOString().slice(0, 10)}`
    downloadText(markdown, `${portableFilename}.md`, 'text/markdown;charset=utf-8')
    toast.success(t('Report download started. Confirm the Markdown file in Downloads or Files.'))
  }

  const transfer = (body: string, destination: 'note' | 'spark') => {
    if (destination === 'note') {
      if (!episodeId) {
        toast.error(t('Link this report to an episode before adding evidence to Notes.'))
        return
      }
      saveListeningNote({ episodeId, body, startSeconds: null })
      toast.success(t('Research evidence added to Notes with its source and evidence scope.'))
      return
    }

    const now = new Date().toISOString()
    let targetSparkId = sparkId
    let spark = state.sparks.find((item) => item.id === targetSparkId)
    if (!spark) {
      targetSparkId = uid('spark')
      spark = { id: targetSparkId, episodeId: episodeId || null, text: text.trim().slice(0, 1500) || title, reply: null, createdAt: now }
      saveSpark(spark)
      setSparkId(targetSparkId)
    }
    recordResearchStage(body, activeId || null, targetSparkId)
    persist({ sparkId: targetSparkId })
    toast.success(t('Research evidence added to the idea’s evolution record.'))
  }

  const selectSpark = (value: string) => {
    const spark = state.sparks.find((item) => item.id === value)
    const nextEpisodeId = spark?.episodeId ?? episodeId
    setSparkId(value)
    if (spark?.episodeId) setEpisodeId(spark.episodeId)
    persist({ sparkId: value || null, episodeId: nextEpisodeId || null })
  }

  return <div className="resource-studio">
    <section className="panel resource-compose">
      <div className="resource-heading"><Database size={24} /><div><span className="section-index">{t('RESOURCES / LIVE SCHOLARLY EVIDENCE')}</span><h2>{t('Put the idea beside real research.')}</h2><p>{t('AI turns your spark into a scholarly search, retrieves live records, then compares claims and evidence. Expert views are labelled paraphrases—not quotations—and every source opens its real DOI or database page.')}</p></div></div>
      {!!state.sparks.length && <div className="resource-recent"><span>{t('Start from a saved spark')}</span><div>{state.sparks.slice(0, 3).map((spark) => <button type="button" key={spark.id} onClick={() => { setText(spark.text); setSparkId(spark.id); setEpisodeId(spark.episodeId ?? ''); setReport(null); setActiveId(''); setError('') }}><Lightbulb size={13} />{spark.text}</button>)}</div></div>}
      <form onSubmit={(event) => void submit(event)}>
        <label className="form-stack"><span className="field-label">{t('Idea to investigate')}</span><textarea className="field textarea" rows={6} maxLength={1500} value={text} onChange={(event) => setText(event.target.value)} placeholder={t('State the mechanism, assumption, or possibility you want to test against expert work…')} /></label>
        <div className="resource-submit"><small>{report ? t('This report is already in your research library. Save the complete Markdown report here, including every comparison, real DOI or database link, and its evidence limits.') : t('One request uses two billable AI calls: search planning and evidence comparison. OpenAlex and Crossref are queried independently; one healthy source can still return results, and matching DOIs are compared. Neither AI call is automatically retried. Only validated successful responses can use the labelled, time-limited cache fallback. Access challenges pause that provider and are never bypassed. A completed report is saved to your research library and can then be downloaded with one click.')}</small><div className="resource-submit-actions"><button type="submit" className={`btn ${report ? 'btn-secondary' : 'btn-primary'}`} disabled={text.trim().length < 4 || compare.isPending}>{compare.isPending ? <><Loader2 size={16} className="spin" />{t('Searching and comparing…')}</> : <><Search size={16} />{t('Find expert resources')}</>}</button>{report && <button type="button" className="btn btn-primary" onClick={downloadReport}><Download size={16} />{t('Save complete report')}</button>}</div></div>
      </form>
    </section>

    {!!state.resourceReports.length && <section className="panel saved-resource-reports" aria-labelledby="saved-resources-title">
      <div className="panel-head"><div><span className="section-index">{t('PERSISTENT RESEARCH LIBRARY')}</span><h2 id="saved-resources-title">{t('Saved research reports')}</h2></div><span>{state.resourceReports.length}</span></div>
      <div className="saved-resource-list">{state.resourceReports.map((saved) => <article key={saved.id} className={activeId === saved.id ? 'active' : ''}>
        <button type="button" onClick={() => reopen(saved)}><FolderOpen size={15} /><span><strong>{saved.title}</strong><small>{saved.report.comparisons.length} {t('sources')} · {new Date(saved.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : locale)}</small></span></button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeSaved(saved.id)} aria-label={t('Delete saved research report')}><Trash2 size={15} /></button>
      </article>)}</div>
    </section>}

    {error && <section className="panel ai-degraded" role="alert"><h3>{t('Resources unavailable')}</h3><p>{errorCopy[error] ?? errorCopy.AI_UNKNOWN}</p></section>}

    {report && <div className="resource-report">
      <section className="panel resource-save-bar" aria-label={t('Saved report details')}>
        <label><span className="field-label">{t('Report title')}</span><input className="field" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} onBlur={() => persist()} /></label>
        <label><span className="field-label">{t('Linked episode')}</span><select className="field" value={episodeId} onChange={(event) => { const value = event.target.value; setEpisodeId(value); persist({ episodeId: value || null }) }}><option value="">{t('No specific episode')}</option>{state.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></label>
        <label><span className="field-label">{t('Linked idea evolution')}</span><select className="field" value={sparkId} onChange={(event) => selectSpark(event.target.value)}><option value="">{t('Create or choose when evidence is transferred')}</option>{state.sparks.map((spark) => <option key={spark.id} value={spark.id}>{spark.text.slice(0, 120)}</option>)}</select></label>
        <button type="button" className="btn btn-secondary" onClick={downloadReport}><Download size={15} />{t('Download Markdown')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { persist(); toast.success(t('Report title and links saved.')) }}><Save size={15} />{t('Save details')}</button>
      </section>

      <section className="panel resource-search-receipt"><span className="section-index">{t('SEARCH RECEIPT')}</span><p><em>{t('Query')}</em>{report.query}</p><p><em>{t('Searched')}</em>{sourceDate(report.searchedAt)}</p>{report.sourceOutcomes?.map((source) => <p key={source.database}><em>{source.database}</em><span className={source.status === 'unavailable' ? 'resource-source-unavailable' : ''}>{source.status === 'ok' ? t('available · {count} usable records', { count: source.recordCount }) : t('unavailable in this search · the other source was used')}</span></p>)}<small>{t('The analysis below uses titles, metadata, and abstracts returned in this search. Cross-source checks compare bibliographic metadata only; they do not prove research findings or turn this into a full-text systematic review.')}</small></section>

      <section className="resource-comparisons" aria-label={t('Expert comparisons')}>{report.comparisons.map((comparison, index) => <article className="panel resource-card" key={comparison.resource.id}>
        <div className="resource-card-index"><span>{String(index + 1).padStart(2, '0')}</span><span className="resource-card-badges"><span className={`resource-evidence-scope ${comparison.evidenceScope}`}>{comparison.evidenceScope === 'abstract' ? t('Abstract evidence') : t('Metadata only')}</span><span className={`resource-verification ${comparison.resource.verification?.status ?? 'single-source'}`}>{verificationLabel(comparison.resource)}</span></span></div>
        <h3>{comparison.resource.title}</h3>
        <p className="resource-byline">{comparison.resource.authors.join(', ') || t('Authors not listed')} · {comparison.resource.year ?? t('Year not listed')} · {comparison.resource.venue}</p>
        <a className="resource-source-link" href={comparison.resource.url} target="_blank" rel="noreferrer"><BookOpen size={14} />{comparison.resource.database}{comparison.resource.doi ? ' · DOI' : ''}<ArrowUpRight size={14} /></a>
        <div className={`resource-verification-detail ${comparison.resource.verification?.status ?? 'single-source'}`}><ShieldCheck size={15} /><p>{verificationDescription(comparison.resource)}</p></div>
        {!!provenanceText(comparison.resource) && <small className={`resource-provenance ${comparison.resource.provenance?.some((item) => item.retrieval === 'stale-cache') ? 'stale' : ''}`}>{t('Source retrieval')}: {provenanceText(comparison.resource)}</small>}
        <div className="resource-reading"><section><em>{t('Expert view · AI paraphrase')}</em><p>{comparison.expertView}</p></section><section><em>{t('Where your ideas meet')}</em><p>{comparison.alignment}</p></section><section className="resource-difference"><em>{t('The subtle, consequential difference')}</em><p>{comparison.keyDifference}</p></section></div>
        <div className="resource-transfer-actions"><button type="button" className="text-link" onClick={() => transfer(comparisonText(comparison), 'note')}><NotebookPen size={14} />{t('Add literature and differences to Notes')}</button><button type="button" className="text-link" onClick={() => transfer(comparisonText(comparison), 'spark')}><Sparkles size={14} />{t('Add to idea evolution')}</button></div>
      </article>)}</section>

      <section className="panel resource-synthesis"><div className="resource-synthesis-icon"><Scale size={22} /></div><div><span className="section-index">{t('SYNTHESIS / DIFFERENCE & POSSIBILITY')}</span><h2>{t('What changes when the evidence sits beside the idea?')}</h2><p>{report.overallComparison}</p></div></section>

      <section className="panel resource-feasibility"><div><span className="section-index">{t('IMPLEMENTATION POSSIBILITY')}</span><h2>{t('A cautious path from thought to test')}</h2><p>{report.feasibility}</p></div><div className="resource-assumptions"><h3>{t('What must be true')}</h3><ul>{report.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="resource-next-test"><FlaskConical size={20} /><div><h3>{t('Smallest useful next experiment')}</h3><p>{report.nextExperiment}</p></div></div>{!!report.caveats.length && <div className="resource-caveats"><em>{t('Evidence limits')}</em><ul>{report.caveats.map((item) => <li key={item}>{item}</li>)}</ul></div>}<div className="resource-transfer-actions"><button type="button" className="text-link" onClick={() => transfer(synthesisText(), 'note')}><NotebookPen size={14} />{t('Add synthesis to Notes')}</button><button type="button" className="text-link" onClick={() => transfer(synthesisText(), 'spark')}><Sparkles size={14} />{t('Add synthesis to idea evolution')}</button></div></section>
    </div>}
  </div>
}

