import { useMemo, useState } from 'react'
import { BookMarked, Clock3, Download, Pencil, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { downloadText, safeFilename, vocabularyCsv } from '../../lib/handoff'
import { formatTimecode } from '../../lib/transcript'
import { useI18n } from '../../lib/i18n'
import type { Episode, PodcastShow, VocabularyEntry } from '../../types'
import type { WordSelection } from './StudyPlayer'

interface VocabularyPanelProps {
  episode: Episode
  show: PodcastShow
  entries: VocabularyEntry[]
  onEdit: (selection: WordSelection) => void
  onLocate: (seconds: number) => void
}

export function VocabularyPanel({ episode, show, entries, onEdit, onLocate }: VocabularyPanelProps) {
  const { removeVocabularyEntry } = useWorkspace()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => `${entry.surface} ${entry.translation} ${entry.context}`.toLocaleLowerCase().includes(needle))
  }, [entries, query])

  const exportCsv = () => {
    if (!entries.length) return
    downloadText(vocabularyCsv(entries, episode, show), `${safeFilename(`${show.shortName}-${episode.title}`)}-vocabulary.csv`, 'text/csv;charset=utf-8')
    toast.success(t('Exported {count} vocabulary entries from this episode.', { count: entries.length }))
  }

  return (
    <section className="vocabulary-desk" aria-labelledby="vocabulary-title">
      <div className="study-section-heading">
        <div><span className="section-index">{t('LOCAL VOCABULARY')}</span><h2 id="vocabulary-title">{t('Episode vocabulary')}</h2><p>{t('Words, translations, source sentences, and timestamps are stored in this browser and included in JSON workspace backups.')}</p></div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!entries.length}><Download size={16} />{t('Export CSV')}</button>
      </div>
      <div className="vocabulary-tools">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search words, translations, or sentences')} aria-label={t('Search episode vocabulary')} /></label>
        <span>{t('{shown} / {total} entries', { shown: filtered.length, total: entries.length })}</span>
      </div>
      {!entries.length ? <div className="empty-state"><BookMarked size={28} /><h3>{t('No saved vocabulary yet')}</h3><p>{t('Return to the transcript and select any word. After checking its translation, the word is archived with its sentence and timestamp.')}</p></div> : !filtered.length ? <div className="empty-state"><h3>{t('No matching words')}</h3><p>{t('Try another keyword or clear the search.')}</p><button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>{t('Clear search')}</button></div> : (
        <div className="vocabulary-list">{filtered.map((entry) => (
          <article className="vocabulary-row" key={entry.id}>
            <div className="vocabulary-word"><strong>{entry.surface}</strong><span>{entry.translation}</span></div>
            <blockquote>{entry.context}</blockquote>
            <div className="vocabulary-actions">
              {entry.startSeconds !== null && <button type="button" className="text-link" onClick={() => onLocate(entry.startSeconds ?? 0)}><Clock3 size={14} />{formatTimecode(entry.startSeconds)}</button>}
              <button type="button" className="text-link" onClick={() => onEdit({ surface: entry.surface, context: entry.context, startSeconds: entry.startSeconds, entry })}><Pencil size={14} />{t('Edit')}</button>
              <button type="button" className="text-link danger-text" onClick={() => { if (window.confirm(t('Delete the entry “{word}”?', { word: entry.surface }))) { removeVocabularyEntry(entry.id); toast.success(t('Vocabulary entry deleted.')) } }}><Trash2 size={14} />{t('Delete')}</button>
            </div>
          </article>
        ))}</div>
      )}
    </section>
  )
}
