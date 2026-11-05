import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheck, CircleHelp, Clock3, Copy, Download, FileJson, FileText, Import, Lightbulb, Loader2, NotebookPen, PenLine, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/Common'
import { EpisodeValueReason } from '../components/EpisodeActions'
import { ImportPreviewDialog, type ImportCandidate, type ImportKind } from '../components/ImportPreviewDialog'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'
import { trpc } from '../providers/trpc'
import { KIMI_IMPORT_LIMIT_BYTES, parseKimiSummary } from '../lib/kimiSummary'
import { getEpisodeValueCategory } from '../lib/lenses'
import { consumeEpisodeTarget, consumeInsightsTab, INSIGHTS_EPISODE_KEY, openNotesWriter, stageTranscriptForStudy } from '../lib/studyNavigation'
import { MAX_VOCABULARY_IMPORT, parseVocabularyFileText } from '../lib/vocabularyImport'
import { UnderstandingStudio } from '../components/learning/UnderstandingStudio'
import { WorkflowJourney } from '../components/learning/WorkflowJourney'
import { buildSummaryNote, buildWritingDraft, summaryToMarkdown, summaryToText } from '../lib/summaryOutput'
import { safeFilename, downloadText } from '../lib/handoff'
import { useI18n } from '../lib/i18n'
import type { EpisodeValueCategory } from '../types'

const TEMPLATE = `# Theme
Replace with the episode’s central research question.

# Core arguments
- First claim and why it matters.
- Second claim or counterargument.

# Evidence
- Study, example, dataset, or first-hand account supporting the claims.

# Expert perspectives
- Guest or expert name: their distinct angle, disagreement, or caveat.
`

const VALUE_CATEGORY_LABELS: Record<EpisodeValueCategory, string> = {
  timely: 'Strong timeliness',
  evergreen: 'Long replay value',
  uncategorized: 'Unclassified',
}

function summaryErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/AI_[A-Z_]+|SUMMARY_[A-Z_]+|UNAUTHORIZED/)?.[0] ?? 'AI_UNKNOWN'
}

export function InsightsView() {
  const { state, updateEpisode, saveKimiSummary, removeKimiSummary, saveListeningNote, importVocabulary } = useWorkspace()
  const { t, locale } = useI18n()
  const { isAuthenticated } = useAuth()
  const generateSummary = trpc.understanding.summarize.useMutation()
  const [summaryError, setSummaryError] = useState('')
  const [selectedId, setSelectedId] = useState(() => {
    const target = consumeEpisodeTarget(INSIGHTS_EPISODE_KEY)
    return state.episodes.some((episode) => episode.id === target)
      ? target
      : state.episodes.find((episode) => episode.status === 'queue')?.id ?? state.episodes[0]?.id ?? ''
  })
  const [filter, setFilter] = useState<'all' | EpisodeValueCategory>('all')
  const [mobileTab, setMobileTab] = useState<'summary' | 'classification' | 'episodes' | 'understanding'>(() => consumeInsightsTab() ?? 'summary')
  const [draft, setDraft] = useState('')
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const selected = state.episodes.find((episode) => episode.id === selectedId) ?? state.episodes[0]
  const summary = state.summaries.find((item) => item.episodeId === selected?.id)
  const summaryDate = summary ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.updatedAt)) : ''
  const showById = useMemo(() => new Map(state.shows.map((show) => [show.id, show])), [state.shows])
  const visibleEpisodes = state.episodes.filter((episode) => filter === 'all' || getEpisodeValueCategory(episode, showById.get(episode.showId)) === filter)
  const selectedValueCategory = selected ? getEpisodeValueCategory(selected, showById.get(selected.showId)) : 'uncategorized'
  const session = state.studySessions.find((item) => item.episodeId === selected?.id)
  const language = locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English'
  const summaryErrorText: Record<string, string> = {
    SUMMARY_TOO_LARGE: t('This transcript is too long for a one-call summary. Generate a source-linked understanding record by section instead; your existing summary is unchanged.'),
    AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted. Your transcript and any existing summary remain unchanged.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. You can still paste or import a summary below.'),
    AI_TRANSIENT: t('The AI service is busy. No request was retried automatically, and your existing summary was not replaced.'),
    AI_CONTENT_REJECTED: t('The AI declined this transcript. Your existing summary was not replaced.'),
    AI_EMPTY_RESULT: t('The AI returned an incomplete summary. Nothing was saved, and your existing summary was not replaced.'),
    UNAUTHORIZED: t('Sign in with Kimi to generate a summary from this transcript.'),
    AI_UNKNOWN: t('The summary could not be generated. Nothing was saved and no request was retried automatically.'),
  }

  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (!state.episodes.some((episode) => episode.id === id)) return
      consumeEpisodeTarget(INSIGHTS_EPISODE_KEY)
      setSelectedId(id)
      setMobileTab(consumeInsightsTab() ?? 'summary')
      setSummaryError('')
    }
    window.addEventListener('tingwen:select-insights-episode', listener)
    return () => window.removeEventListener('tingwen:select-insights-episode', listener)
  }, [state.episodes])

  if (!selected) return <div className="page-wrap"><PageHeader view="insights" kicker={t('RESEARCH VALUE')} title={t('Timely now. Useful later.')} copy={t('Add an episode before classifying its research value.')} /></div>

  const generate = async () => {
    if (!session?.segments.length || generateSummary.isPending) return
    setSummaryError('')
    try {
      const result = await generateSummary.mutateAsync({ episodeTitle: selected.title, language, segments: session.segments })
      const now = new Date().toISOString()
      saveKimiSummary({
        ...result,
        episodeId: selected.id,
        source: 'ai',
        importedAt: summary?.importedAt ?? now,
        updatedAt: now,
      })
      toast.success(t('Kimi generated and saved the four-part summary from this episode’s transcript.'))
    } catch (reason) {
      setSummaryError(summaryErrorCode(reason))
    }
  }

  const importSummary = (text: string, source?: 'json' | 'markdown' | 'text') => {
    try {
      const parsed = parseKimiSummary(text, source)
      const now = new Date().toISOString()
      saveKimiSummary({ ...parsed, episodeId: selected.id, importedAt: summary?.importedAt ?? now, updatedAt: now })
      setDraft('')
      if (fileRef.current) fileRef.current.value = ''
      toast.success(t('Kimi summary saved to this episode’s workspace record.'))
    } catch (error) {
      toast.error(error instanceof Error ? t(error.message) : t('The summary could not be imported.'))
    }
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    if (!['json', 'md', 'markdown', 'txt'].includes(extension ?? '')) { toast.error(t('Choose a JSON, Markdown, or TXT file.')); return }
    if (extension === 'json' && file.size > KIMI_IMPORT_LIMIT_BYTES) { toast.error(t('The summary is larger than 120 KB. Split it into a shorter research note.')); return }
    if (extension !== 'json' && file.size > 5 * 1024 * 1024) { toast.error(t('Transcript exceeds 5 MB. Split it into chapters before importing to avoid exhausting browser storage.')); return }
    try {
      const text = await file.text()
      setImportCandidate({
        file,
        text,
        initialKind: 'summary',
        allowedKinds: extension === 'json' ? ['summary'] : ['summary', 'transcript', 'vocabulary'],
        episodeTitle: selected.title,
        vocabularyMode: 'episode-import',
      })
    } catch {
      toast.error(t('The summary file could not be read. Nothing was imported.'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = (kind: ImportKind) => {
    const candidate = importCandidate
    if (!candidate) return
    const text = candidate.text ?? ''
    try {
      if (kind === 'summary') {
        const extension = candidate.file.name.split('.').pop()?.toLocaleLowerCase()
        const parsed = parseKimiSummary(text, extension === 'json' ? 'json' : extension === 'txt' ? 'text' : 'markdown')
        const now = new Date().toISOString()
        saveKimiSummary({ ...parsed, episodeId: selected.id, importedAt: summary?.importedAt ?? now, updatedAt: now })
        setDraft('')
        setImportCandidate(null)
        toast.success(t('Kimi summary saved to this episode’s workspace record.'))
        return
      }
      if (kind === 'transcript') {
        if (!stageTranscriptForStudy(selected.id, text, candidate.file.name)) throw new Error(t('The browser could not stage this transcript. Your existing workspace is unchanged; copy the text and paste it into Listen & Read instead.'))
        setImportCandidate(null)
        return
      }
      const entries = parseVocabularyFileText(text, 'txt')
      if (!entries.length) throw new Error(t('No usable word entries were found in this file.'))
      if (entries.length > MAX_VOCABULARY_IMPORT) throw new Error(t('One batch accepts at most 500 valid entries. Split the list and import the parts separately.'))
      const language = showById.get(selected.showId)?.language ?? 'English'
      const added = importVocabulary(entries.map((item) => ({ episodeId: selected.id, surface: item.surface, translation: item.translation, language, context: '', startSeconds: null })))
      const skipped = entries.length - added
      setImportCandidate(null)
      toast.success(skipped > 0
        ? t('Imported {added} words; {skipped} duplicates were skipped.', { added, skipped })
        : t('Imported {added} words. They are cards now — review or test them below.', { added }))
    } catch (reason) {
      throw new Error(reason instanceof Error ? t(reason.message) : t('The summary could not be imported.'))
    }
  }

  const setValue = (valueCategory: EpisodeValueCategory) => {
    updateEpisode(selected.id, { valueCategory })
  }

  const copySummary = async () => {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(summary, selected))
      toast.success(t('Summary copied as Markdown. Paste it wherever you want to continue.'))
    } catch {
      toast.error(t('Clipboard access is unavailable. Use Download Markdown or Download TXT instead; the summary remains saved.'))
    }
  }

  const downloadSummary = (kind: 'markdown' | 'text') => {
    if (!summary) return
    const base = safeFilename(selected.title)
    if (kind === 'markdown') downloadText(summaryToMarkdown(summary, selected), `${base}-summary.md`, 'text/markdown;charset=utf-8')
    else downloadText(summaryToText(summary, selected), `${base}-summary.txt`)
    toast.success(t('Summary file generated. Confirm it in Downloads or Files.'))
  }

  const saveSummaryAsNote = () => {
    if (!summary) return
    saveListeningNote({ episodeId: selected.id, body: buildSummaryNote(summary, selected), startSeconds: null })
    toast.success(t('Summary saved to Notes. Continue writing there whenever you are ready.'))
  }

  const continueWriting = () => {
    if (!summary) return
    const draft = buildWritingDraft(selected, summary, session)
    if (!openNotesWriter(selected.id, draft)) {
      toast.error(t('The browser could not stage the draft. Your summary is unchanged; copy or download it, then paste it into Notes.'))
      return
    }
    toast.message(t('Summary and source text loaded into the notebook editor. Review and save when ready.'))
  }

  return (
    <div className="page-wrap insights-page" data-mobile-tab={mobileTab}>
      <PageHeader
        view="insights"
        kicker={t('RESEARCH VALUE / KIMI NOTES')}
        title={t('Timely now. Useful later.')}
        copy={t('Separate urgent listening from durable reference, generate source-linked understanding, or create a four-part Kimi summary from the saved transcript. You can still paste or import a summary yourself; this workspace never reads private Kimi conversations.')}
      />
      <WorkflowJourney episodeId={selected.id} current="summary" />
      <div className="insights-mobile-tabs" role="tablist" aria-label={t('Value Insights sections')}>
        <button type="button" role="tab" aria-selected={mobileTab === 'summary'} className={mobileTab === 'summary' ? 'active' : ''} onClick={() => setMobileTab('summary')}><Lightbulb size={16} />{t('Summary')}</button>
        <button type="button" role="tab" aria-selected={mobileTab === 'classification'} className={mobileTab === 'classification' ? 'active' : ''} onClick={() => setMobileTab('classification')}><Clock3 size={16} />{t('Classification')}</button>
        <button type="button" role="tab" aria-selected={mobileTab === 'episodes'} className={mobileTab === 'episodes' ? 'active' : ''} onClick={() => setMobileTab('episodes')}><FileText size={16} />{t('Episodes')}</button>
        <button type="button" role="tab" aria-selected={mobileTab === 'understanding'} className={mobileTab === 'understanding' ? 'active' : ''} onClick={() => setMobileTab('understanding')}><BookOpenCheck size={16} />{t('Understanding')}</button>
      </div>

      <section className="value-legend" aria-label={t('Research value categories')}>
        <article><Clock3 size={20} /><div><h2>{t('Strong timeliness')}</h2><p>{t('News, releases, fast-moving markets, or a conversation whose value decays quickly. Listen sooner; revisit the evidence, not the urgency.')}</p></div></article>
        <article><BookOpenCheck size={20} /><div><h2>{t('Long replay value')}</h2><p>{t('Frameworks, foundational research, craft, and arguments worth hearing again. Keep the reasoning and expert disagreements close to the episode.')}</p></div></article>
        <article><CircleHelp size={20} /><div><h2>{t('Unclassified')}</h2><p>{t('Neither signal is strong enough yet. Non-timely episodes stay here instead of defaulting to Long replay value; review or assign a category manually.')}</p></div></article>
      </section>

      <div className="insights-layout">
        <section className="episode-value-index" aria-labelledby="value-index-title">
          <div className="insights-section-heading"><div><span className="section-index">{t('01 / EPISODES')}</span><h2 id="value-index-title">{t('Classify the library')}</h2></div><span>{state.summaries.length} {t('summaries')}</span></div>
          <p className="value-index-copy">{t('Local suggestions need a clear title-strength signal or equivalent corroboration. Ties, weak evidence, and show-context-only matches stay Unclassified. Select an episode to inspect the evidence, confirm a category, or work with its saved understanding records below.')}</p>
          <div className="value-filter" role="group" aria-label={t('Filter by research value')}>
            {(['all', 'timely', 'evergreen', 'uncategorized'] as const).map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{t(item === 'all' ? 'All episodes' : item === 'timely' ? 'Timely' : item === 'evergreen' ? 'Evergreen' : 'Unclassified')}</button>)}
          </div>
          <div className="value-episode-list">
            {visibleEpisodes.map((episode) => <button type="button" key={episode.id} className={selected.id === episode.id ? 'active' : ''} aria-pressed={selected.id === episode.id} onClick={() => { setSelectedId(episode.id); setSummaryError(''); setMobileTab('summary') }}>
              <span>{showById.get(episode.showId)?.shortName ?? t('Unknown show')}</span><strong>{episode.title}</strong><small>{t(VALUE_CATEGORY_LABELS[getEpisodeValueCategory(episode, showById.get(episode.showId))])}{state.summaries.some((item) => item.episodeId === episode.id) ? ` · ${t('Kimi summary')}` : ''}</small>
            </button>)}
            {!visibleEpisodes.length && <p className="insights-empty">{t('No episodes match this value filter.')}</p>}
          </div>
        </section>

        <section className="episode-insight-desk" aria-labelledby="insight-desk-title">
          <div className="insights-section-heading"><div><span className="section-index">{t('02 / RESEARCH NOTE')}</span><h2 id="insight-desk-title">{selected.title}</h2><p>{showById.get(selected.showId)?.name}</p></div></div>
          <div className="insight-classification">
          <div className="value-choice" role="group" aria-label={t('Classify this episode')}>
            <button type="button" className={selectedValueCategory === 'timely' ? 'active timely' : ''} aria-pressed={selectedValueCategory === 'timely'} onClick={() => setValue('timely')}><Clock3 size={17} /><span><strong>{t('Strong timeliness')}</strong><small>{t('Prioritize while the context is current')}</small></span></button>
            <button type="button" className={selectedValueCategory === 'evergreen' ? 'active evergreen' : ''} aria-pressed={selectedValueCategory === 'evergreen'} onClick={() => setValue('evergreen')}><BookOpenCheck size={17} /><span><strong>{t('Long replay value')}</strong><small>{t('Retain for repeated listening and reference')}</small></span></button>
            <button type="button" className={selectedValueCategory === 'uncategorized' ? 'active uncategorized' : ''} aria-pressed={selectedValueCategory === 'uncategorized'} onClick={() => setValue('uncategorized')}><CircleHelp size={17} /><span><strong>{t('Unclassified')}</strong><small>{t('Keep for review when neither signal qualifies')}</small></span></button>
          </div>
          <EpisodeValueReason episode={selected} show={showById.get(selected.showId)} />
          </div>

          <div className="insight-understanding"><UnderstandingStudio key={selected.id} episode={selected} /></div>

          <section className="kimi-generate insight-summary-panel" aria-labelledby="kimi-generate-title">
            <div><span className="section-index">{t('KIMI / ONE-CLICK TRANSCRIPT SUMMARY')}</span><h3 id="kimi-generate-title">{t('Generate the four-part summary here')}</h3><p>{t('Kimi reads the saved transcript and produces Theme, Core arguments, Evidence & materials, and Expert perspectives. It uses one billable AI call and never invents speakers or outside sources.')}</p></div>
            <button type="button" className="btn btn-primary" disabled={!isAuthenticated || !session?.segments.length || generateSummary.isPending} onClick={() => void generate()}>{generateSummary.isPending ? <><Loader2 size={16} className="spin" />{t('Generating summary…')}</> : <><Sparkles size={16} />{summary ? t('Regenerate with Kimi') : t('Generate with Kimi')}</>}</button>
            <small>{summary ? t('A successful generation replaces the current summary. A failed request leaves it untouched.') : t('No summary exists yet. Generation saves only after the complete result succeeds.')}</small>
            {!session?.segments.length && <p className="learning-empty">{t('Import and save a transcript in Listen & Read before generating. Manual paste and file import remain available below.')}</p>}
            {!isAuthenticated && <p className="form-hint">{t('Sign in with Kimi to use AI generation. Existing summaries remain readable without signing in.')}</p>}
            {summaryError && <div className="cloud-sync-error" role="alert"><p>{summaryErrorText[summaryError] ?? summaryErrorText.AI_UNKNOWN}</p></div>}
          </section>

          {summary ? <article className="kimi-summary insight-summary-panel">
            <header><div><span className="section-index"><Lightbulb size={14} />{summary.source === 'ai' ? t('KIMI SUMMARY / AI GENERATED') : t('KIMI SUMMARY / USER IMPORTED')}</span><h3>{summary.theme}</h3></div><button type="button" className="btn btn-ghost btn-icon" onClick={() => { removeKimiSummary(selected.id); toast.message(summary.source === 'ai' ? t('Generated summary removed.') : t('Imported summary removed.')) }} aria-label={t('Remove summary')}><Trash2 size={17} /></button></header>
            <div className="summary-result-actions" aria-label={t('Summary next actions')}>
              <button type="button" className="btn btn-primary btn-small" onClick={continueWriting}><PenLine size={15} />{t('Continue writing')}</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={saveSummaryAsNote}><NotebookPen size={15} />{t('Save to Notes')}</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => void copySummary()}><Copy size={15} />{t('Copy summary')}</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => downloadSummary('markdown')}><Download size={15} />{t('Download Markdown')}</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => downloadSummary('text')}><Download size={15} />{t('Download TXT')}</button>
            </div>
            <p className="form-hint summary-action-hint">{t('Continue writing loads this summary and the available transcript into Notes. Nothing is saved there until you confirm; copying and downloading do not use an AI call.')}</p>
            <SummarySection title={t('Core arguments')} items={summary.coreArguments} />
            <SummarySection title={t('Evidence & materials')} items={summary.evidence} />
            <SummarySection title={t('Expert perspectives')} items={summary.expertPerspectives} />
            <footer>{summary.source === 'ai' ? t('Generated {date} · {source}', { date: summaryDate, source: summary.source.toUpperCase() }) : t('Imported {date} · {source}', { date: summaryDate, source: summary.source.toUpperCase() })}</footer>
          </article> : <div className="summary-empty insight-summary-panel"><Lightbulb size={24} /><h3>{t('No Kimi summary attached yet')}</h3><p>{t('Generate from the saved transcript above, or paste or import below. The summary is stored as plain text with this episode; no HTML or imported code is executed.')}</p></div>}

          <div className="kimi-import insight-summary-panel">
            <div className="kimi-import-heading"><div><span className="section-index">{t('03 / IMPORT OR REPLACE')}</span><h3>{t('Bring in a Kimi content summary')}</h3></div><button type="button" className="text-link" onClick={() => setDraft(TEMPLATE)}>{t('Insert Markdown template')}</button></div>
            <p>{t('Use JSON fields theme, coreArguments, evidence, and expertPerspectives—or Markdown/TXT headings for the same four sections. JSON summaries are limited to 120 KB; TXT and Markdown files up to 5 MB can also be explicitly confirmed as a transcript or vocabulary list.')}</p>
            <label><span className="field-label">{t('Paste summary')}</span><textarea className="field textarea kimi-paste" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('# Theme\n# Core arguments\n# Evidence\n# Expert perspectives')} /></label>
            <div className="kimi-import-actions"><button type="button" className="btn btn-primary" disabled={!draft.trim()} onClick={() => importSummary(draft)}><Import size={16} />{summary ? t('Replace summary') : t('Import summary')}</button><label className="btn btn-secondary file-action"><FileJson size={16} />{t('Choose JSON / MD / TXT')}<input ref={fileRef} type="file" accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div>
            <p className="form-hint"><FileText size={14} />{t('Only a file or text you choose is imported. Saving locally is not a Kimi sync receipt.')}</p>
          </div>
        </section>
      </div>
      {importCandidate && <ImportPreviewDialog candidate={importCandidate} onCancel={() => setImportCandidate(null)} onConfirm={confirmImport} />}
    </div>
  )
}

function SummarySection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <section className="summary-section"><h4>{title}</h4><ul>{items.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</ul></section>
}
