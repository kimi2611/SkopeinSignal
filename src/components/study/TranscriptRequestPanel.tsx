import { useMemo, useState } from 'react'
import { Clipboard, Download, ExternalLink, FileInput, Send, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { downloadText, safeFilename } from '../../lib/handoff'
import { useI18n } from '../../lib/i18n'
import { publicHttpUrlError } from '../../lib/publicUrl'
import type { Episode, PodcastShow } from '../../types'

interface TranscriptRequestPanelProps {
  episode: Episode
  show: PodcastShow
}

type RequestFormat = 'VTT' | 'SRT' | 'TXT' | 'Markdown'

export function TranscriptRequestPanel({ episode, show }: TranscriptRequestPanelProps) {
  const { updateEpisode } = useWorkspace()
  const { t } = useI18n()
  const [title, setTitle] = useState(episode.title)
  const [showName, setShowName] = useState(show.name)
  const [audioUrl, setAudioUrl] = useState(episode.audioUrl)
  const [format, setFormat] = useState<RequestFormat>('VTT')
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState('')

  const request = useMemo(() => `# Transcript request\n\n- Episode title: ${title.trim()}\n- Podcast: ${showName.trim()}\n- Public audio URL: ${audioUrl.trim()}\n- Requested return format: ${format}\n\nPlease process this episode and return a transcript file in the requested format. Preserve sentence or segment timestamps when possible, especially for VTT or SRT. If the audio link cannot be accessed or transcribed, tell me explicitly rather than inventing a transcript.\n\nAfter receiving the file, I will import it back into SkopeinSignal myself. Preparing or sharing this request is not confirmation that transcription has completed.\n`, [audioUrl, format, showName, title])

  const validate = (): boolean => {
    if (!title.trim() || !showName.trim() || !audioUrl.trim()) {
      setError(t('Episode title, podcast name, and public audio URL are all required.'))
      return false
    }
    const urlError = publicHttpUrlError(audioUrl)
    if (urlError) {
      setError(t(urlError))
      return false
    }
    setError('')
    updateEpisode(episode.id, { audioUrl: audioUrl.trim() })
    return true
  }

  const copyRequest = async () => {
    if (!validate()) return
    try {
      await navigator.clipboard.writeText(request)
      setPrepared(t('Request copied. Paste it into KimiClaw; this is not a processing receipt.'))
      toast.success(t('Transcript request copied. Confirm processing and receipt in KimiClaw.'))
    } catch {
      downloadText(request, `${safeFilename(`${show.shortName}-${title}`)}-transcript-request.md`, 'text/markdown;charset=utf-8')
      setPrepared(t('Clipboard was unavailable, so the request was downloaded instead. No processing receipt has been received.'))
      toast.message(t('Request downloaded because clipboard access was unavailable.'))
    }
  }

  const downloadRequest = () => {
    if (!validate()) return
    downloadText(request, `${safeFilename(`${show.shortName}-${title}`)}-transcript-request.md`, 'text/markdown;charset=utf-8')
    setPrepared(t('Request downloaded. Upload it to KimiClaw yourself; no processing receipt has been received.'))
    toast.success(t('Request file generated. Confirm it in Downloads or Files.'))
  }

  const shareRequest = async () => {
    if (!validate()) return
    if (!navigator.share) {
      downloadRequest()
      toast.message(t('This browser cannot share text directly, so the request was downloaded instead.'))
      return
    }
    try {
      await navigator.share({ title: t('Transcript request: {title}', { title: title.trim() }), text: request })
      setPrepared(t('System share flow completed. Confirm receipt and processing in the destination app.'))
      toast.success(t('Share flow completed. Confirm the request in the receiving app.'))
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      toast.error(t('The request could not be shared. Copy or download it instead.'))
    }
  }

  return (
    <section className="transcript-request" aria-labelledby="transcript-request-title">
      <div className="request-heading">
        <div><span className="section-index">{t('01 / REQUEST A TRANSCRIPT')}</span><h2 id="transcript-request-title">{t('Send the episode brief to KimiClaw')}</h2><p>{t('Provide the title, podcast, and a public audio link. SkopeinSignal prepares a portable request; you confirm access, processing, and file receipt in KimiClaw.')}</p></div>
        <a className="btn btn-secondary" href="https://www.kimi.com/bot" target="_blank" rel="noreferrer">{t('Open KimiClaw')}<ExternalLink size={15} /></a>
      </div>
      <div className="request-grid">
        <label className="form-stack form-span"><span className="field-label">{t('Episode title')}</span><input className="field" value={title} onChange={(event) => { setTitle(event.target.value); setError(''); setPrepared('') }} /></label>
        <label className="form-stack"><span className="field-label">{t('Podcast name')}</span><input className="field" value={showName} onChange={(event) => { setShowName(event.target.value); setError(''); setPrepared('') }} /></label>
        <label className="form-stack"><span className="field-label">{t('Return format')}</span><select className="field" value={format} onChange={(event) => setFormat(event.target.value as RequestFormat)}><option>VTT</option><option>SRT</option><option>TXT</option><option>Markdown</option></select></label>
        <label className="form-stack form-span"><span className="field-label">{t('Public audio URL')}</span><input className="field" type="url" value={audioUrl} onChange={(event) => { setAudioUrl(event.target.value); setError(''); setPrepared('') }} placeholder="https://…" /></label>
      </div>
      <p className="form-hint">{t('Use only audio you are allowed to share. Never place account tokens, private feed parameters, or credentials in this link. KimiClaw must be able to access the source; this site cannot verify that access or transcription remotely.')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="request-actions">
        <button type="button" className="btn btn-primary" onClick={() => void copyRequest()}><Clipboard size={16} />{t('Copy request')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => void shareRequest()}><Share2 size={16} />{t('Share request')}</button>
        <button type="button" className="btn btn-ghost" onClick={downloadRequest}><Download size={16} />{t('Download request')}</button>
      </div>
      {prepared && <p className="request-receipt" role="status"><Send size={15} />{prepared}</p>}
      <div className="request-return"><FileInput size={18} /><p><strong>{t('02 / Bring the transcript back')}</strong><br />{t('After KimiClaw returns a file, download it from the conversation or workspace, then import or paste it in “Transcript source” below. The listening desk is created only after that local import.')}</p></div>
    </section>
  )
}
