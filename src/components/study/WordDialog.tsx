import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Languages, LoaderCircle, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { translateWord } from '../../lib/translation'
import { useI18n } from '../../lib/i18n'
import type { PodcastShow } from '../../types'
import type { WordSelection } from './StudyPlayer'

interface WordDialogProps {
  selection: WordSelection | null
  language: PodcastShow['language']
  onClose: () => void
  onSave: (translation: string) => void
}

export function WordDialog({ selection, language, onClose, onSave }: WordDialogProps) {
  const { t } = useI18n()
  const [translation, setTranslation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lookupNote, setLookupNote] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const lookup = useCallback(async (word: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const result = await translateWord(word, language, controller.signal)
      setTranslation(result)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? t('{message}. You can enter a translation manually.', { message: reason.message }) : t('Online draft translation is unavailable; enter one manually.'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [language, t])

  useEffect(() => {
    if (!selection) return
    setTranslation(selection.entry?.translation ?? '')
    setError('')
    setLookupNote('')
    if (!selection.entry) void lookup(selection.surface)
    return () => abortRef.current?.abort()
  }, [lookup, selection])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!translation.trim()) { setError(t('Translation cannot be empty. Enter one manually before saving.')); return }
    onSave(translation.trim())
  }

  const copyForProvider = (provider: string) => {
    if (!selection) return
    if (!navigator.clipboard) {
      setLookupNote(t('Copy “{word}” manually into {provider}. No translation is returned to SkopeinSignal automatically.', { word: selection.surface, provider }))
      return
    }
    void navigator.clipboard.writeText(selection.surface).then(() => {
      setLookupNote(t('{word} copied for {provider}. Paste it into the provider, then bring your chosen wording back here; no result is imported automatically.', { word: selection.surface, provider }))
    }).catch(() => {
      setLookupNote(t('Copy “{word}” manually into {provider}. No translation is returned to SkopeinSignal automatically.', { word: selection.surface, provider }))
    })
  }

  const eudicUrl = selection
    ? `eudic://x-callback-url/searchword?word=${encodeURIComponent(selection.surface)}&sourceapp=SkopeinSignal`
    : '#'

  return (
    <Dialog open={!!selection} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="modal-content max-h-[88dvh] overflow-y-auto sm:max-w-xl" aria-describedby="word-context">
        {selection && <form onSubmit={submit}>
          <DialogHeader className="pr-8 text-left">
            <div className="modal-kicker"><Languages size={14} /> {t('WORD ARCHIVE')}</div>
            <DialogTitle className="modal-title word-modal-title">{selection.surface}</DialogTitle>
            <DialogDescription className="modal-description">{t(selection.entry ? 'Edit an archived word; saving updates this episode’s vocabulary.' : 'Check the machine draft before saving it to this episode’s vocabulary.')}</DialogDescription>
          </DialogHeader>
          <blockquote id="word-context" className="word-context">{selection.context}</blockquote>
          <div className="form-stack">
            <div className="translation-label"><label className="field-label" htmlFor="word-translation">{t('Translation')}</label><button type="button" className="text-link" onClick={() => void lookup(selection.surface)} disabled={loading}><RefreshCw size={13} />{t('Translate again')}</button></div>
            <textarea id="word-translation" className="field textarea" rows={3} value={translation} onChange={(event) => { setTranslation(event.target.value); setError('') }} placeholder={t(loading ? 'Requesting an online draft…' : 'Enter or correct the translation')} autoFocus />
            {loading && <p className="form-hint"><LoaderCircle className="spin" size={14} /> {t('Requesting a draft from MyMemory')}</p>}
            <p className="form-hint">{t('Machine translation is only a starting point and depends on free quotas, connectivity, and context. Check it before saving. Selecting a word sends only that word to the translation service, never the whole transcript.')}</p>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="dictionary-handoffs">
            <div><strong>{t('Dictionary & translation handoffs')}</strong><span>{t('External tools open separately; they are not embedded plugins or automatic answer sources.')}</span></div>
            <div className="dictionary-links">
              <a className="btn btn-secondary btn-small" href={eudicUrl} onClick={() => setLookupNote(t('Eudic receives only the selected word through its documented app link. If the app is unavailable, use Eudic Web instead.'))}>{t('Eudic app')}<ExternalLink size={13} /></a>
              <a className="btn btn-ghost btn-small" href="https://dict.eudic.net/" target="_blank" rel="noreferrer" onClick={() => copyForProvider('Eudic Web')}>Eudic Web<ExternalLink size={13} /></a>
              <a className="btn btn-ghost btn-small" href="https://dict.youdao.com/" target="_blank" rel="noreferrer" onClick={() => copyForProvider('Youdao')}>Youdao<ExternalLink size={13} /></a>
              <a className="btn btn-ghost btn-small" href="https://translate.google.com/" target="_blank" rel="noreferrer" onClick={() => copyForProvider('Google Translate')}>Google Translate<ExternalLink size={13} /></a>
            </div>
            {lookupNote && <p className="form-hint" role="status">{lookupNote}</p>}
          </div>
          <DialogFooter className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading && !translation.trim()}>{t(selection.entry ? 'Save changes' : 'Save word')}</button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  )
}
