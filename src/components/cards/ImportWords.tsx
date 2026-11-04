import { useMemo, useState } from 'react'
import { FileText, FileUp, Import, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { ImportPreviewDialog, type ImportCandidate } from '../ImportPreviewDialog'
import { useI18n } from '../../lib/i18n'
import { MAX_VOCABULARY_IMPORT, parseVocabularyFileText, parseVocabularyLines, type VocabularyFileFormat, type VocabularyImportEntry } from '../../lib/vocabularyImport'
import type { PodcastShow } from '../../types'

const LANGUAGE_VALUES: Array<PodcastShow['language']> = ['English', 'Deutsch', 'Chinese']
const MAX_FILE_BYTES = 1024 * 1024

type FileIssue = 'type' | 'size' | 'read' | 'format' | 'empty' | 'limit' | ''

export function ImportWords() {
  const { state, importVocabulary } = useWorkspace()
  const { t } = useI18n()
  const [list, setList] = useState('')
  const [language, setLanguage] = useState<PodcastShow['language']>('English')
  const [episodeId, setEpisodeId] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileEntries, setFileEntries] = useState<VocabularyImportEntry[]>([])
  const [fileIssue, setFileIssue] = useState<FileIssue>('')
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null)

  const parsed = useMemo(() => parseVocabularyLines(list), [list])
  const fileIssueText: Record<Exclude<FileIssue, ''>, string> = {
    type: t('Choose a CSV, TSV, or TXT word-list file.'),
    size: t('The word-list file is larger than 1 MB. Split it into smaller files and import them separately.'),
    read: t('The word-list file could not be read. Your deck and manual paste were not changed.'),
    format: t('The delimited file is malformed. Check for an unfinished quoted cell, then try again.'),
    empty: t('No usable word entries were found in this file.'),
    limit: t('One batch accepts at most 500 valid entries. Split the list and import the parts separately.'),
  }

  const importEntries = (entries: VocabularyImportEntry[]): boolean => {
    if (!entries.length) return false
    if (entries.length > MAX_VOCABULARY_IMPORT) {
      toast.error(t('One batch accepts at most 500 valid entries. Split the list and import the parts separately.'))
      return false
    }
    const added = importVocabulary(entries.map((item) => ({
      episodeId,
      surface: item.surface,
      translation: item.translation,
      language,
      context: '',
      startSeconds: null,
    })))
    const skipped = entries.length - added
    toast.success(skipped > 0
      ? t('Imported {added} words; {skipped} duplicates were skipped.', { added, skipped })
      : t('Imported {added} words. They are cards now — review or test them below.', { added }))
    return true
  }

  const runImport = () => {
    if (importEntries(parsed)) setList('')
  }

  const clearFile = () => {
    setFileName('')
    setFileEntries([])
    setFileIssue('')
  }

  const readFile = async (file: File | undefined) => {
    clearFile()
    setImportCandidate(null)
    if (!file) return
    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    if (!extension || !['csv', 'tsv', 'txt'].includes(extension)) {
      setFileIssue('type')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileIssue('size')
      return
    }
    try {
      const text = await file.text()
      setImportCandidate({
        file,
        text,
        initialKind: 'vocabulary',
        allowedKinds: ['vocabulary'],
        episodeTitle: state.episodes.find((episode) => episode.id === episodeId)?.title,
        vocabularyMode: 'deck-review',
      })
    } catch {
      setFileIssue('read')
    }
  }

  const confirmFileType = () => {
    if (!importCandidate) return
    const extension = importCandidate.file.name.split('.').pop()?.toLocaleLowerCase() as VocabularyFileFormat
    try {
      const entries = parseVocabularyFileText(importCandidate.text ?? '', extension)
      if (!entries.length) throw new Error(fileIssueText.empty)
      if (entries.length > MAX_VOCABULARY_IMPORT) throw new Error(fileIssueText.limit)
      setFileName(importCandidate.file.name)
      setFileEntries(entries)
      setFileIssue('')
      setImportCandidate(null)
    } catch (error) {
      throw new Error(error instanceof Error && error.message === 'INVALID_DELIMITED_FILE' ? fileIssueText.format : error instanceof Error ? error.message : fileIssueText.read)
    }
  }

  const runFileImport = () => {
    if (importEntries(fileEntries)) clearFile()
  }

  return (
    <section className="panel card-import" aria-labelledby="card-import-title">
      <div className="panel-head"><h2 id="card-import-title">{t('Import words in one batch')}</h2><span className="sparks-count">{t('{count} lines ready', { count: parsed.length })}</span></div>

      <div className="card-file-import">
        <div className="card-import-method-heading"><FileUp size={18} /><div><h3>{t('Import a word-list file')}</h3><p>{t('Choose a CSV, TSV, or TXT file, review its preview, then confirm the batch. CSV and TSV may use Word and Translation headers; the site’s seven-column vocabulary CSV is also accepted. Nothing is uploaded to a server.')}</p></div></div>
        <label className="btn btn-secondary file-action"><FileText size={16} />{t('Choose word-list file')}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(file) }} /></label>
        {fileIssue && <p className="form-error" role="alert">{fileIssueText[fileIssue]}</p>}
        {fileName && <div className="card-file-ready">
          <div className="card-file-name"><FileText size={16} /><strong>{fileName}</strong><span>{t('{count} valid entries', { count: fileEntries.length })}</span><button type="button" className="btn btn-ghost btn-icon" aria-label={t('Clear selected word-list file')} onClick={clearFile}><X size={15} /></button></div>
          <ol className="card-file-preview">{fileEntries.slice(0, 5).map((item, index) => <li key={`${index}-${item.surface}`}><strong>{item.surface}</strong><span>{item.translation || '—'}</span></li>)}</ol>
          {fileEntries.length > 5 && <small>{t('{count} more entries are ready but not shown in this preview.', { count: fileEntries.length - 5 })}</small>}
        </div>}
      </div>

      <div className="card-manual-import">
        <h3>{t('Or paste the list manually')}</h3>
        <p className="form-hint">{t('One word per line, optionally with its translation: “word”, “word = translation”, “word, translation”, or word and translation separated by a tab. Everything imports at once — no per-word clicking. Words already in your deck are skipped.')}</p>
        <textarea className="field textarea card-import-input" rows={6} value={list} onChange={(event) => setList(event.target.value)} placeholder={'serendipity = 意外之喜\naufmerksam, 专注的\n阈值 = threshold'} aria-label={t('Paste one word per line')} />
      </div>

      <div className="card-import-controls">
        <label><span>{t('Language')}</span><select className="field" value={language} onChange={(event) => setLanguage(event.target.value as PodcastShow['language'])}>{LANGUAGE_VALUES.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label><span>{t('Attach to an episode (optional)')}</span><select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}><option value="">{t('No episode — deck only')}</option>{state.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></label>
        {fileName && <button type="button" className="btn btn-primary" onClick={runFileImport}><FileUp size={16} />{t('Import {count} words from file', { count: fileEntries.length })}</button>}
        <button type="button" className="btn btn-primary" disabled={!parsed.length} onClick={runImport}><Import size={16} />{t('Import {count} words', { count: parsed.length })}</button>
      </div>
      {importCandidate && <ImportPreviewDialog candidate={importCandidate} onCancel={() => setImportCandidate(null)} onConfirm={confirmFileType} />}
    </section>
  )
}
