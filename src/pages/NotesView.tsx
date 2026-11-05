import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, BookMarked, Clock3, Copy, Download, GraduationCap, NotebookPen, PenLine, Pencil, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApplePencilStudio } from '../components/ApplePencilStudio'
import { IeltsWorkshop } from '../components/IeltsWorkshop'
import { PageHeader } from '../components/Common'
import { useWorkspace } from '../hooks/useWorkspace'
import { downloadText } from '../lib/handoff'
import { useI18n } from '../lib/i18n'
import { buildObsidianNewUri, launchObsidianUri, OBSIDIAN_DIRECT_URI_MAX } from '../lib/obsidian'
import { consumeEpisodeTarget, consumeNotesDraft, NOTES_EPISODE_KEY, openStudyEpisode } from '../lib/studyNavigation'
import { formatTimecode } from '../lib/transcript'
import { UnifiedSearchResults } from '../components/UnifiedSearch'
import { WorkflowJourney } from '../components/learning/WorkflowJourney'
import type { ViewKey } from '../types'

const OBSIDIAN_VAULT_KEY = 'tingwen.obsidian.vault'
const OBSIDIAN_FOLDER_KEY = 'tingwen.obsidian.folder'

function makeObsidianFilePath(folder: string): string {
  const safeFolder = folder.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.' && part !== '..').join('/')
  const filename = `Listening Notes ${new Date().toISOString().slice(0, 10)}.md`
  return safeFolder ? `${safeFolder}/${filename}` : filename
}

export function NotesView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state, saveListeningNote, removeListeningNote } = useWorkspace()
  const { t, locale } = useI18n()
  const [mode, setMode] = useState<'write' | 'pencil' | 'ielts'>('write')
  const [query, setQuery] = useState('')
  const [showId, setShowId] = useState('all')
  const [episodeId, setEpisodeId] = useState(() => {
    const target = consumeEpisodeTarget(NOTES_EPISODE_KEY)
    return state.episodes.some((episode) => episode.id === target)
      ? target
      : state.studySessions[0]?.episodeId ?? state.episodes[0]?.id ?? ''
  })
  const [stagedDraft] = useState(() => consumeNotesDraft())
  const [draft, setDraft] = useState(() => stagedDraft?.episodeId === episodeId ? stagedDraft.body : '')
  const [draftNotice, setDraftNotice] = useState(() => stagedDraft?.episodeId === episodeId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [obsidianVault, setObsidianVault] = useState(() => localStorage.getItem(OBSIDIAN_VAULT_KEY) ?? '')
  const [obsidianFolder, setObsidianFolder] = useState(() => localStorage.getItem(OBSIDIAN_FOLDER_KEY) ?? 'SkopeinSignal')

  useEffect(() => {
    try {
      localStorage.setItem(OBSIDIAN_VAULT_KEY, obsidianVault)
      localStorage.setItem(OBSIDIAN_FOLDER_KEY, obsidianFolder)
    } catch {
      // These optional handoff labels are non-critical and contain no credentials.
    }
  }, [obsidianFolder, obsidianVault])

  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (!state.episodes.some((episode) => episode.id === id)) return
      consumeEpisodeTarget(NOTES_EPISODE_KEY)
      const staged = consumeNotesDraft()
      setMode('write')
      setEpisodeId(id)
      setDraft(staged?.episodeId === id ? staged.body : '')
      setDraftNotice(staged?.episodeId === id)
    }
    window.addEventListener('tingwen:select-notes-episode', listener)
    return () => window.removeEventListener('tingwen:select-notes-episode', listener)
  }, [state.episodes])

  const notes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return state.notes.filter((note) => {
      const episode = state.episodes.find((item) => item.id === note.episodeId)
      if (showId !== 'all' && episode?.showId !== showId) return false
      return !needle || `${note.body} ${episode?.title ?? ''}`.toLocaleLowerCase().includes(needle)
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [query, showId, state.episodes, state.notes])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!episodeId || !draft.trim()) return
    saveListeningNote({ episodeId, body: draft, startSeconds: null })
    setDraft('')
    setDraftNotice(false)
    toast.success(t('Note added to the notebook.'))
  }

  const markdown = useMemo(() => {
    const content = notes.map((note) => {
      const episode = state.episodes.find((item) => item.id === note.episodeId)
      const show = state.shows.find((item) => item.id === episode?.showId)
      return `## ${episode?.title ?? t('Episode no longer in workspace')}\n\n- ${t('Show')}: ${show?.name ?? t('Unknown')}\n- ${t('Note updated')}: ${note.updatedAt}\n- ${t('Audio position')}: ${note.startSeconds === null ? t('Untimed') : formatTimecode(note.startSeconds)}\n\n${note.body}`
    }).join('\n\n---\n\n')
    return `# ${t('SkopeinSignal')} Listening Notes\n\n${t('Exported')}: ${new Date().toISOString()}\n\n${content || t('No notes match the current filters.')}\n`
  }, [notes, state.episodes, state.shows, t])

  const exportNotes = () => {
    downloadText(markdown, `SkopeinSignal-notes-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown;charset=utf-8')
    toast.success(t('Exported {count} notes.', { count: notes.length }))
  }

  const obsidianOpenFailed = () => {
    downloadText(markdown, `SkopeinSignal-notes-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown;charset=utf-8')
    toast.error(t('Obsidian could not be opened, so the Markdown file was downloaded instead. No import was confirmed.'))
  }

  const openWithClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
    } catch {
      downloadText(markdown, `SkopeinSignal-notes-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown;charset=utf-8')
      toast.error(t('Clipboard access was unavailable, so the Markdown file was downloaded instead. Obsidian was not opened.'))
      return
    }
    try {
      launchObsidianUri(buildObsidianNewUri({ vault: obsidianVault, file: makeObsidianFilePath(obsidianFolder), clipboard: true }))
    } catch {
      obsidianOpenFailed()
      return
    }
    toast.message(t('Markdown copied and Obsidian open requested. Confirm the new note in Obsidian; this website receives no import receipt.'))
  }

  const openInObsidian = async () => {
    const file = makeObsidianFilePath(obsidianFolder)
    const directUri = buildObsidianNewUri({ vault: obsidianVault, file, content: markdown })
    if (directUri.length > OBSIDIAN_DIRECT_URI_MAX) { await openWithClipboard(); return }
    try {
      launchObsidianUri(directUri)
    } catch {
      obsidianOpenFailed()
      return
    }
    toast.message(t('Obsidian open requested. Confirm the new note in Obsidian; this website cannot verify receipt or import.'))
  }

  return (
    <div className="page-wrap notes-page">
      <PageHeader view="notes" kicker={t('NOTEBOOK / LISTENING MEMORY')} title={t('Keep the thought, not just the timestamp.')} copy={t('A single notebook for episode reflections, open questions, and ideas worth revisiting. Timestamped entries made in the listening desk link back to the exact audio position.')} actions={mode === 'write' ? <button type="button" className="btn btn-secondary" onClick={exportNotes} disabled={!state.notes.length}><Download size={16} />{t('Export Markdown')}</button> : undefined} />
      {episodeId && <WorkflowJourney episodeId={episodeId} current="draft" />}

      <div className="notes-mode-switch" role="tablist" aria-label={t('Notebook mode')}><button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')}><NotebookPen size={16} />{t('Written notes')}</button><button type="button" role="tab" aria-selected={mode === 'pencil'} className={mode === 'pencil' ? 'active' : ''} onClick={() => setMode('pencil')}><PenLine size={16} />{t('Apple Pencil mode')}</button><button type="button" role="tab" aria-selected={mode === 'ielts'} className={mode === 'ielts' ? 'active' : ''} onClick={() => setMode('ielts')}><GraduationCap size={16} />{t('IELTS Writing')}</button></div>

      {mode === 'pencil' ? <ApplePencilStudio /> : mode === 'ielts' ? <IeltsWorkshop kind="writing" onNavigate={onNavigate} /> : <>
      <section className="obsidian-handoff" aria-labelledby="obsidian-title">
        <div className="obsidian-handoff-heading"><BookMarked size={22} /><div><span className="section-index">{t('OBSIDIAN / OFFICIAL URI HANDOFF')}</span><h2 id="obsidian-title">{t('Create a note in your Vault')}</h2><p>{t('Send the current filtered selection through Obsidian’s official new-note URI. The website requests Obsidian to open; only Obsidian can confirm that a note was created.')}</p></div></div>
        <div className="obsidian-fields"><label><span className="field-label">{t('Vault name (optional)')}</span><input className="field" value={obsidianVault} onChange={(event) => setObsidianVault(event.target.value)} placeholder={t('Use the current or most recent Vault')} autoComplete="off" /></label><label><span className="field-label">{t('Folder inside the Vault')}</span><input className="field" value={obsidianFolder} onChange={(event) => setObsidianFolder(event.target.value)} placeholder="SkopeinSignal" autoComplete="off" /></label></div>
        <div className="obsidian-handoff-footer"><p><strong>{t('{count} notes in this handoff', { count: notes.length })}</strong><span>{makeObsidianFilePath(obsidianFolder)}</span><small>{t('No account token is requested or stored. Long notebooks use clipboard mode; Markdown download remains the local fallback.')}</small></p><div><button type="button" className="btn btn-secondary" onClick={() => void openWithClipboard()} disabled={!state.notes.length}><Copy size={16} />{t('Copy & open Obsidian')}</button><button type="button" className="btn btn-primary" onClick={() => void openInObsidian()} disabled={!state.notes.length}><BookMarked size={16} />{t('Send to Obsidian')}</button></div></div>
      </section>

      <form className="global-note-composer" onSubmit={submit}>
        <div><span className="section-index">{draftNotice ? t('SUMMARY → EDITABLE DRAFT') : t('QUICK CAPTURE')}</span><h2>{draftNotice ? t('Continue writing from the saved summary') : t('Write without opening the player')}</h2></div>
        {draftNotice && <p className="draft-handoff-notice" role="status">{t('The summary and available source transcript were loaded for editing. Review the text, write your own draft below it, then choose Add to notebook. Nothing is saved automatically.')}</p>}
        <label><span className="field-label">{t('Episode for this note')}</span><select className="field" value={episodeId} onChange={(event) => { setEpisodeId(event.target.value); setDraftNotice(false) }}>{state.episodes.map((episode) => {
          const show = state.shows.find((item) => item.id === episode.showId)
          return <option key={episode.id} value={episode.id}>{show?.shortName ?? t('Unknown')} · {episode.title}</option>
        })}</select></label>
        <label><span className="field-label">{draftNotice ? t('Editable summary, source, and your draft') : t('New untimed note')}</span><textarea className="field textarea" rows={draftNotice ? 14 : 3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('Write a thought to attach to this episode…')} /></label>
        <button type="submit" className="btn btn-primary" disabled={!episodeId || !draft.trim()}><NotebookPen size={16} />{draftNotice ? t('Save finished draft to notebook') : t('Add to notebook')}</button>
      </form>

      <div className="notes-filter"><label className="search-field"><Search size={17} /><span className="sr-only">{t('Search notes')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search transcripts, notes, words, sparks, and resources…')} /></label><label><span className="sr-only">{t('Filter notes by show')}</span><select className="field" value={showId} onChange={(event) => setShowId(event.target.value)}><option value="all">{t('All shows')}</option>{state.shows.map((show) => <option key={show.id} value={show.id}>{show.shortName}</option>)}</select></label><span>{notes.length} / {state.notes.length}</span></div>
      <UnifiedSearchResults state={state} query={query} />

      {!state.notes.length ? <div className="empty-state notes-empty"><NotebookPen size={30} /><h3>{t('Your notebook is open')}</h3><p>{t('Add an untimed note above, or open Listen & Read to capture a thought at the current playback position.')}</p></div> : !notes.length ? <div className="empty-state"><h3>{t('No matching notes')}</h3><p>{t('Clear the search or choose another show.')}</p><button type="button" className="btn btn-secondary" onClick={() => { setQuery(''); setShowId('all') }}>{t('Clear filters')}</button></div> : <div className="global-notes-list">{notes.map((note) => {
        const episode = state.episodes.find((item) => item.id === note.episodeId)
        const show = state.shows.find((item) => item.id === episode?.showId)
        return <article className="global-note" key={note.id}>
          <div className="global-note-rail"><span>{show?.code ?? '—'}</span>{note.startSeconds !== null && <button type="button" onClick={() => openStudyEpisode(note.episodeId, note.startSeconds ?? undefined)} title={t('Open episode at {time}', { time: formatTimecode(note.startSeconds) })}><Clock3 size={14} />{formatTimecode(note.startSeconds)}</button>}</div>
          <div className="global-note-main"><button type="button" className="global-note-episode" onClick={() => openStudyEpisode(note.episodeId)}>{episode?.title ?? t('Episode no longer in workspace')}<ArrowUpRight size={15} /></button><div className="episode-meta"><span>{show?.shortName ?? t('Unknown show')}</span><span>{t('Updated {date}', { date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(note.updatedAt)) })}</span></div>
            {editingId === note.id ? <div className="note-edit"><textarea className="field textarea" rows={5} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} autoFocus /><div><button type="button" className="btn btn-primary btn-small" disabled={!editDraft.trim()} onClick={() => { saveListeningNote({ episodeId: note.episodeId, body: editDraft, startSeconds: note.startSeconds }, note.id); setEditingId(null); toast.success(t('Note updated.')) }}>{t('Save')}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>{t('Cancel')}</button></div></div> : <p className="note-body">{note.body}</p>}
            <div className="note-actions"><button type="button" className="text-link" onClick={() => { setEditingId(note.id); setEditDraft(note.body) }}><Pencil size={14} />{t('Edit')}</button><button type="button" className="text-link danger-text" onClick={() => { if (window.confirm(t('Delete this note?'))) { removeListeningNote(note.id); toast.success(t('Note deleted.')) } }}><Trash2 size={14} />{t('Delete')}</button></div>
          </div>
        </article>
      })}</div>}
      </>}
    </div>
  )
}
