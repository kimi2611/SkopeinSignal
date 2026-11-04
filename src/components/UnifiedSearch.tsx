import { BookOpenCheck, Layers3, Lightbulb, NotebookPen, ScanSearch, SearchX } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { openStudyEpisode } from '../lib/studyNavigation'
import { searchWorkspace } from '../lib/unifiedSearch'
import type { UnifiedSearchResult } from '../lib/unifiedSearch'
import type { WorkspaceState } from '../types'

export function UnifiedSearchResults({ state, query }: { state: WorkspaceState; query: string }) {
  const { t } = useI18n()
  const needle = query.trim()
  if (needle.length < 2) return null
  const results = searchWorkspace(state, needle)
  const labels: Record<UnifiedSearchResult['kind'], string> = {
    transcript: t('TRANSCRIPT'),
    note: t('NOTE'),
    vocabulary: t('WORD'),
    spark: t('SPARK'),
    resource: t('RESOURCE'),
  }
  const icons: Record<UnifiedSearchResult['kind'], typeof NotebookPen> = {
    transcript: BookOpenCheck,
    note: NotebookPen,
    vocabulary: Layers3,
    spark: Lightbulb,
    resource: ScanSearch,
  }
  return <section className="unified-search" aria-label={t('Workspace search results')}>
    <div className="unified-search-heading"><span className="section-index">{t('SEARCH / TRANSCRIPTS · NOTES · WORDS · SPARKS · RESOURCES')}</span><strong>{t('{count} matches across the workspace', { count: results.length })}</strong></div>
    {!results.length ? <p className="unified-search-empty"><SearchX size={16} />{t('No transcript, note, word, spark, or research report contains this search.')}</p> : <div className="unified-search-list">
      {results.map((result) => {
        const Icon = icons[result.kind]
        return <article className="unified-search-result" key={result.id}>
          <span className={`unified-search-kind is-${result.kind}`}><Icon size={13} />{labels[result.kind]}</span>
          <div><strong>{result.title}</strong><p>{result.detail}</p>{result.episodeId && <button type="button" className="text-link" onClick={() => openStudyEpisode(result.episodeId!, result.startSeconds ?? undefined)}>{t('Open source')}</button>}</div>
        </article>
      })}
    </div>}
  </section>
}
