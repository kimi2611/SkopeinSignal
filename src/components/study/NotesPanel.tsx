import { useState, type FormEvent } from 'react'
import { Clock3, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formatTimecode } from '../../lib/transcript'
import { useI18n } from '../../lib/i18n'
import type { Episode, ListeningNote } from '../../types'

interface NotesPanelProps {
  episode: Episode
  notes: ListeningNote[]
  currentTime: number
  onSeek: (seconds: number) => void
}

export function NotesPanel({ episode, notes, currentTime, onSeek }: NotesPanelProps) {
  const { saveListeningNote, removeListeningNote } = useWorkspace()
  const { t, locale } = useI18n()
  const [draft, setDraft] = useState('')
  const [attachTime, setAttachTime] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    saveListeningNote({ episodeId: episode.id, body: draft, startSeconds: attachTime ? Math.floor(currentTime) : null })
    setDraft('')
    toast.success(t(attachTime ? 'Note saved at {time}.' : 'Note saved without a timestamp.', { time: formatTimecode(Math.floor(currentTime)) }))
  }

  return (
    <section className="notes-desk" aria-labelledby="episode-notes-title">
      <div className="study-section-heading"><div><span className="section-index">{t('LISTENING NOTES')}</span><h2 id="episode-notes-title">{t('Think while you listen')}</h2><p>{t('Audio continues in the background. Save a thought at the current playback position, or leave it untimed.')}</p></div><span className="notes-count">{t(notes.length === 1 ? '{count} note' : '{count} notes', { count: notes.length })}</span></div>
      <form className="note-composer" onSubmit={submit}>
        <label className="field-label" htmlFor="episode-note-draft">{t('New note for this episode')}</label>
        <textarea id="episode-note-draft" className="field textarea" rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('Capture an argument, a question, or something to revisit…')} autoFocus />
        <div className="note-composer-footer">
          <label className="timestamp-toggle"><input type="checkbox" checked={attachTime} onChange={(event) => setAttachTime(event.target.checked)} /><Clock3 size={15} /><span>{t('Attach {time}', { time: formatTimecode(Math.floor(currentTime)) })}</span></label>
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()}><NotebookPen size={16} />{t('Save note')}</button>
        </div>
      </form>

      {!notes.length ? <div className="empty-state"><NotebookPen size={28} /><h3>{t('No notes for this episode yet')}</h3><p>{t('Write above without pausing. Timestamped notes become direct paths back into the audio.')}</p></div> : <div className="notes-list">{notes.map((note) => <article className="note-row" key={note.id}>
        <div className="note-row-meta">{note.startSeconds !== null ? <button type="button" className="note-time" onClick={() => onSeek(note.startSeconds ?? 0)}><Clock3 size={14} />{formatTimecode(note.startSeconds)}</button> : <span>{t('UNTIMED')}</span>}<time dateTime={note.updatedAt}>{new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt))}</time></div>
        {editingId === note.id ? <div className="note-edit"><textarea className="field textarea" rows={4} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} autoFocus /><div><button type="button" className="btn btn-primary btn-small" disabled={!editDraft.trim()} onClick={() => { saveListeningNote({ episodeId: note.episodeId, body: editDraft, startSeconds: note.startSeconds }, note.id); setEditingId(null); toast.success(t('Note updated.')) }}>{t('Save')}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>{t('Cancel')}</button></div></div> : <p className="note-body">{note.body}</p>}
        <div className="note-actions"><button type="button" className="text-link" onClick={() => { setEditingId(note.id); setEditDraft(note.body) }}><Pencil size={14} />{t('Edit')}</button><button type="button" className="text-link danger-text" onClick={() => { if (window.confirm(t('Delete this note?'))) { removeListeningNote(note.id); toast.success(t('Note deleted.')) } }}><Trash2 size={14} />{t('Delete')}</button></div>
      </article>)}</div>}
    </section>
  )
}
