import { useEffect, useState, type FormEvent } from 'react'
import { FileAudio, FileText, Import, Languages, Lightbulb, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { useI18n } from '../lib/i18n'

export type ImportKind = 'audio' | 'transcript' | 'vocabulary' | 'summary'

export interface ImportCandidate {
  file: File
  initialKind: ImportKind
  allowedKinds: ImportKind[]
  text?: string
  episodeTitle?: string
  vocabularyMode?: 'deck-review' | 'episode-import'
}

interface ImportPreviewDialogProps {
  candidate: ImportCandidate
  onCancel: () => void
  onConfirm: (kind: ImportKind) => void | Promise<void>
}

const PREVIEW_CHARACTERS = 6000

export function ImportPreviewDialog(props: ImportPreviewDialogProps) {
  const { candidate } = props
  const key = `${candidate.file.name}:${candidate.file.size}:${candidate.file.lastModified}:${candidate.initialKind}`
  return <ImportPreviewDialogContent key={key} {...props} />
}

function ImportPreviewDialogContent({ candidate, onCancel, onConfirm }: ImportPreviewDialogProps) {
  const { t } = useI18n()
  const [kind, setKind] = useState<ImportKind>(candidate.initialKind)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audioUrl] = useState(() => candidate.initialKind === 'audio' ? URL.createObjectURL(candidate.file) : '')

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  const extension = candidate.file.name.includes('.') ? candidate.file.name.split('.').pop()?.toLocaleUpperCase() : ''
  const fileType = candidate.file.type || (extension ? t('{extension} file', { extension }) : t('Unspecified file type'))
  const episode = candidate.episodeTitle || t('Selected episode')
  const labels: Record<ImportKind, string> = {
    audio: t('Audio'),
    transcript: t('Transcript'),
    vocabulary: t('Vocabulary list'),
    summary: t('Kimi summary'),
  }
  const descriptions: Record<ImportKind, string> = {
    audio: t('Play or transcribe this recording in Listen & Read.'),
    transcript: t('Use these paragraphs or timed cues as the episode transcript.'),
    vocabulary: t('Parse words and translations into the flashcard deck.'),
    summary: t('Validate the four-part summary and attach it to this episode.'),
  }
  const targets: Record<ImportKind, string> = {
    audio: t('Listen & Read → Audio source → {episode}', { episode }),
    transcript: t('Listen & Read → Transcript setup → {episode}', { episode }),
    vocabulary: candidate.vocabularyMode === 'episode-import' ? t('Cards → Episode vocabulary → {episode}', { episode }) : t('Cards → Vocabulary import'),
    summary: t('Value Insights → Kimi summary → {episode}', { episode }),
  }
  const storage: Record<ImportKind, string> = {
    audio: t('Nothing is stored yet. After confirmation, saving the listening desk puts the audio in IndexedDB in this browser only. Audio is excluded from JSON backups and cloud workspace sync.'),
    transcript: t('Nothing is stored yet. Confirmation fills the setup draft; the transcript joins this browser workspace only when you save the listening desk. Signed-in cloud sync includes text after it succeeds.'),
    vocabulary: t('Nothing is stored yet. Confirmed entries are saved in this browser workspace, with duplicates skipped. Signed-in cloud sync includes vocabulary after it succeeds.'),
    summary: t('Nothing is stored yet. A valid summary is saved with this episode in the browser workspace. Signed-in cloud sync includes the summary after it succeeds.'),
  }
  const nextSteps: Record<ImportKind, string> = {
    audio: t('Next: review the selected audio, optionally start on-device transcription, then save the listening desk.'),
    transcript: t('Next: review the text and timings in the setup editor, then save. Your previous saved transcript remains unchanged until then.'),
    vocabulary: candidate.vocabularyMode === 'episode-import' ? t('Next: valid new entries are attached to this episode immediately and duplicates are skipped. Review them in Cards or Listen & Read.') : t('Next: review the parsed entries, language, and optional episode, then use the existing Import words button.'),
    summary: t('Next: the validated summary replaces this episode’s previous summary. You can then save it to Notes, download it, or continue writing.'),
  }
  const icons: Record<ImportKind, typeof FileText> = {
    audio: FileAudio,
    transcript: FileText,
    vocabulary: Languages,
    summary: Lightbulb,
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    // DialogContent is portalled, but React events still bubble through the
    // component tree. Never let confirmation submit a surrounding setup form.
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(kind)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('This file could not be imported. Nothing was saved; choose a different type or repair the file.'))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <DialogContent className="modal-content import-preview-dialog max-h-[92dvh] overflow-y-auto sm:max-w-3xl" aria-describedby="import-preview-description">
        <form onSubmit={(event) => void confirm(event)}>
          <DialogHeader className="pr-8 text-left">
            <div className="modal-kicker"><Import size={14} /> {t('IMPORT / PREVIEW / CONFIRM')}</div>
            <DialogTitle className="modal-title">{t('Check before anything is saved')}</DialogTitle>
            <DialogDescription id="import-preview-description" className="modal-description">{t('Confirm the content type, destination, storage boundary, and next action. Cancel leaves all existing workspace content unchanged.')}</DialogDescription>
          </DialogHeader>

          <dl className="import-file-facts">
            <div><dt>{t('File')}</dt><dd>{candidate.file.name}</dd></div>
            <div><dt>{t('Detected file type')}</dt><dd>{fileType}</dd></div>
            <div><dt>{t('Size')}</dt><dd>{formatFileSize(candidate.file.size)}</dd></div>
          </dl>

          <fieldset className="import-kind-choices">
            <legend>{t('What does this file contain?')}</legend>
            {candidate.allowedKinds.map((item) => {
              const Icon = icons[item]
              return <label key={item} className={`choice-row ${kind === item ? 'is-selected' : ''}`}>
                <input type="radio" name="import-kind" value={item} checked={kind === item} onChange={() => { setKind(item); setError('') }} />
                <Icon size={18} />
                <span><strong>{labels[item]}</strong><small>{descriptions[item]}</small></span>
              </label>
            })}
          </fieldset>
          {candidate.allowedKinds.length > 1 && <p className="form-hint import-ambiguity-note">{t('A TXT or Markdown extension does not prove whether the content is a transcript, summary, or word list. Choose explicitly; the site will not guess from the extension alone.')}</p>}

          <section className="import-content-preview" aria-labelledby="import-content-preview-title">
            <h3 id="import-content-preview-title">{t('Content preview')}</h3>
            {candidate.initialKind === 'audio'
              ? <audio className="import-audio-preview" controls preload="metadata" src={audioUrl}>{t('Audio preview is not supported in this browser. You can still confirm or cancel the file.')}</audio>
              : <><pre>{candidate.text?.slice(0, PREVIEW_CHARACTERS) || t('No text content could be previewed.')}</pre>{(candidate.text?.length ?? 0) > PREVIEW_CHARACTERS && <small>{t('Preview shows the opening {shown} of {total} characters; the complete file is used after confirmation.', { shown: PREVIEW_CHARACTERS, total: candidate.text?.length ?? 0 })}</small>}</>}
          </section>

          <dl className="import-route-facts">
            <div><dt>{t('Target module')}</dt><dd>{targets[kind]}</dd></div>
            <div><dt>{t('Storage')}</dt><dd>{storage[kind]}</dd></div>
            <div><dt>{t('After confirmation')}</dt><dd>{nextSteps[kind]}</dd></div>
          </dl>
          {error && <p className="form-error" role="alert">{error}</p>}
          <DialogFooter className="modal-footer">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>{t('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Import size={16} />}{busy ? t('Checking…') : t('Confirm & continue')}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
