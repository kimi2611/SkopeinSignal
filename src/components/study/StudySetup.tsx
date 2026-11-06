import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FileAudio, FileText, Link2, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { ImportPreviewDialog, type ImportCandidate, type ImportKind } from '../ImportPreviewDialog'
import { saveLocalAudio } from '../../lib/media'
import { parseTranscript } from '../../lib/transcript'
import { parseKimiSummary } from '../../lib/kimiSummary'
import { MAX_VOCABULARY_IMPORT, parseVocabularyFileText } from '../../lib/vocabularyImport'
import { openInsightsEpisode } from '../../lib/studyNavigation'
import { publicHttpUrlError } from '../../lib/publicUrl'
import { unlockAudioContextForGesture, type AsrConcreteLanguage, type AsrLanguage, type AsrModelTier, type ChannelLabel, type TranscribeProgress } from '../../lib/localTranscribe'
import { transcriptionJobs, useTranscriptionJob } from '../../lib/transcriptionJobs'
import { clearSetupDraft, readSetupDraft, writeSetupDraft } from '../../lib/studySetupDraft'
import type { SnipdResolveResult } from '../../../api/snipdRouter'
import { useI18n, type TranslationValues } from '../../lib/i18n'
import { trpc } from '../../providers/trpc'

type TFunc = (key: string, values?: TranslationValues) => string

/** Stage label for the on-device transcriber — every stage is explicit so a stall is attributable (download vs. model init vs. decode vs. transcribe). */
function asrStageLabel(t: TFunc, p: TranscribeProgress): string {
  switch (p.stage) {
    case 'queued': return p.detail ? t('Queued — {detail}', { detail: p.detail }) : t('Queued…')
    case 'uploading': return t('Uploading audio · {progress}%', { progress: Math.round(p.progress * 100) })
    case 'checking': return t('Checking this browser…')
    case 'downloading': return t('Downloading model · {progress}%', { progress: Math.round(p.progress * 100) })
    case 'initializing': return t('Preparing the recognizer — after the download this can take a minute or two…')
    case 'decoding': return p.progress > 0 ? t('Decoding audio · {progress}%', { progress: Math.round(p.progress * 100) }) : t('Decoding audio…')
    case 'transcribing': return t('Transcribing · {progress}%', { progress: Math.round(p.progress * 100) })
    case 'done': return t('Finishing…')
  }
}

function asrErrorLabel(t: TFunc, message: string): string {
  if (message.startsWith('asr-unsupported-browser')) return t('This browser cannot run on-device transcription (missing: {missing}). It needs WebAssembly SIMD support — iPadOS 16.4+ or a current desktop browser. You can still import a transcript file.', { missing: message.split(':')[1] || 'wasm-simd' })
  if (message === 'audio-decode-failed') return t('This audio could not be decoded in the browser. Convert it to MP3 or WAV and try again.')
  if (message === 'audio-too-long') return t('This file is longer than three hours — the honest limit for on-device transcription in a browser tab. Split it into parts, or import a transcript instead.')
  if (message === 'audio-too-large') return t('This file is too long to decode in one piece and this browser cannot stream its format. MP3 and WAV stream fine — convert the file to MP3, or import a transcript instead.')
  if (message === 'model-download-stalled') return t('The model download stalled. Check the connection and retry — the first run downloads about 40 MB (80 MB at the higher quality tier), later runs use the browser cache.')
  if (message.startsWith('model-init-timeout') || message.startsWith('model-init-failed')) {
    const reason = message.split(/:(.*)/s)[1]?.trim()
    return t('The model downloaded but could not start — this usually means the tab ran out of memory. Close other tabs and apps, keep the smaller model tier, and retry.')
      + (reason ? ` (${reason})` : '')
  }
  if (message.startsWith('upload-stalled')) return t('The upload stopped moving — the connection went quiet for 45 seconds. Nothing was transcribed. Check the network and run it again; a big file on a slow uplink is better sent through Kimi Claw.')
  if (message.startsWith('upload-gave-up')) return t('The upload kept failing on one part. Everything already sent is kept on the server — check the connection and start again, it resumes where it stopped instead of starting over.')
  if (message === 'network-error') return t('The connection dropped mid-upload and the server never received a complete file. This is not a rejection — check the network and try again.')
  if (message === 'unauthorized') return t('The server refused the job: the access token is missing or wrong. Paste it in Settings, then run it again.')
  if (message === 'server-busy') return t('The server is already working on another file. One job at a time — try again when that one finishes.')
  if (message === 'rate-limited') return t('This address used up its twelve transcriptions for the hour. Nothing is broken — the limit resets within an hour.')
  if (message === 'not-deployed') return t('The server endpoint is not deployed right now. Nothing was uploaded.')
  if (message.startsWith('out-of-memory')) return t('The server declined to load that model because memory is short. Switch to the small tier, or release medium in Settings.')
  if (message.startsWith('server-error')) return t('The server rejected the job: {detail}', { detail: message.replace(/^server-error:?\s*/, '') || 'unknown reason' })
  if (message === 'empty-transcript') return t('No speech was recognized in this audio. Try a clearer recording, or import a transcript file instead.')
  if (message === 'no-speech-found') return t('This audio sounds instrumental, not spoken — a speech transcript would be invented, so none was written. Import a transcript file instead.')
  return t('On-device transcription failed in this browser. You can still import a VTT / SRT / TXT / MD transcript file.')
}

import type { Episode, PodcastShow, StudySession } from '../../types'
import { readDefaultChannel, readStoredTier, storeTier } from '../TranscriptionPanel'
import { markDefault } from '../../lib/defaultChannel'

interface StudySetupProps {
  episode: Episode
  show: PodcastShow
  session?: StudySession
  onSave: (session: StudySession) => void
  onCancel?: () => void
}

export function StudySetup({ episode, show, session, onSave, onCancel }: StudySetupProps) {
  const { state, updateEpisode, saveKimiSummary, importVocabulary } = useWorkspace()
  const { t } = useI18n()
  const transcriptionJob = useTranscriptionJob(episode.id)
  const asr = transcriptionJob?.status === 'running' ? transcriptionJob.progress : null
  // Half-finished setup work survives a page reload: iPadOS can suspend and
  // silently reload this tab during a long resolve, and before this draft
  // existed that took the pasted link, the chosen mode, and the resolved
  // result with it.
  const draftKey = `skopein.study.setup.${episode.id}`
  const [draft] = useState(() => readSetupDraft(draftKey))
  const [audioMode, setAudioMode] = useState<'rss' | 'local'>(draft?.audioMode ?? session?.audioMode ?? (episode.audioUrl ? 'rss' : 'local'))
  const [audioUrlOverride, setAudioUrlOverride] = useState<string | null>(draft?.audioUrlOverride ?? null)
  const directAudioUrl = audioUrlOverride ?? session?.audioUrl ?? episode.audioUrl
  const [transcript, setTranscript] = useState(draft?.transcript ?? '')
  const [filename, setFilename] = useState(draft?.filename ?? '')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asrError, setAsrError] = useState('')
  // Auto-detect by default: the model itself names the language per window,
  // so a German episode can no longer come out as English-sounding gibberish
  // just because the show metadata did not say "Deutsch".
  const [asrLang, setAsrLang] = useState<AsrLanguage>('auto')
  const [asrTier, setAsrTier] = useState<AsrModelTier>('tiny')
  // Server transcription needs a bench token. Kept in localStorage so a desk is
  // set up once and remembered, not retyped per episode.
  // Server model tier. 'medium' is more accurate and slower, and it costs 1.5 GB
  // of server RAM — the sidecar loads it on demand and the settings page can
  // unload it, so this is a per-episode choice, not a global one.
  const [asrServerTier, setAsrServerTier] = useState<'small' | 'medium'>(() => readStoredTier())
  const [asrToken, setAsrToken] = useState<string>(() => {
    try { return localStorage.getItem('skopein.whisper.token') ?? '' } catch { return '' }
  })
  const [asrChannel, setAsrChannel] = useState<ChannelLabel | null>(draft?.asrChannel ?? null)
  const [asrDetectedLangs, setAsrDetectedLangs] = useState<AsrConcreteLanguage[]>(draft?.asrDetectedLangs ?? [])
  const [snipdUrl, setSnipdUrl] = useState(draft?.snipdUrl ?? '')
  const [snipdError, setSnipdError] = useState('')
  const [snipdNotice, setSnipdNotice] = useState('')
  const [snipdResult, setSnipdResult] = useState<SnipdResolveResult | null>(draft?.snipdResult ?? null)
  const snipdResolve = trpc.snipd.resolve.useMutation()
  const { isAuthenticated } = useAuth()
  const transcriptInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    writeSetupDraft(draftKey, { audioMode, snipdUrl, audioUrlOverride, snipdResult, transcript, filename, asrChannel, asrDetectedLangs })
  }, [draftKey, audioMode, snipdUrl, audioUrlOverride, snipdResult, transcript, filename, asrChannel, asrDetectedLangs])

  useEffect(() => {
    if (transcriptionJob?.status !== 'done' || transcriptionJob.consumed || !transcriptionJob.result) return
    const result = transcriptionJob.result
    setTranscript(result.vtt)
    setFilename(`${transcriptionJob.filename.replace(/\.[^.]+$/, '')}.ondevice.vtt`)
    setAsrChannel(result.channel)
    setAsrDetectedLangs(result.languages)
    transcriptionJobs.consume(transcriptionJob.id)
    toast.success(t('Draft transcript generated on this device — review it before saving.'))
  }, [transcriptionJob, t])

  /** Seconds → h:mm:ss for the resolved-episode summary line. */
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.round(seconds % 60)
    const pad = (v: number) => String(v).padStart(2, '0')
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
  }

  /**
   * Resolve a public Snipd share link server-side: share page → metadata →
   * original RSS feed → the matching episode's enclosure URL. The resolved
   * audio URL fills the direct-URL field below; nothing is saved until the
   * listener submits the form as usual.
   */
  const resolveSnipdLink = async () => {
    const url = snipdUrl.trim()
    if (!url || snipdResolve.isPending) return
    setSnipdError('')
    setSnipdNotice('')
    setSnipdResult(null)
    snipdResolve.reset() // drop a stale result card from a previous link
    try {
      const result = await snipdResolve.mutateAsync({ url })
      setSnipdResult(result) // lives in state (and the draft), so a reload cannot take it
      if (result.audioUrl) {
        setAudioUrlOverride(result.audioUrl)
        setError('')
        // Toasts are unreliable on iPadOS (short-lived overlay windows), so the
        // success state lives in the resolve panel itself, not in a toast.
        setSnipdNotice(result.matchedBy
          ? t('Episode audio link resolved from the public RSS feed — review it below.')
          : t('Episode audio link resolved from the public podcast directory — review it below.'))
      } else if (result.feedUrl) {
        setSnipdNotice(t('The feed was found, but this episode’s audio was not in it.'))
      }
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : ''
      const trpcCode = (reason as { data?: { code?: string } })?.data?.code
      if (trpcCode === 'UNAUTHORIZED' || code.includes('Authentication required')) setSnipdError(t('Sign in to resolve Snipd share links — the resolver contacts third-party servers and is limited to signed-in listeners.'))
      else if (code.includes('not-a-snipd-share-link')) setSnipdError(t('That is not a public Snipd share link. It should look like https://share.snipd.com/episode/… — open the episode in Snipd, choose Share, and copy the link.'))
      else if (code.includes('share-page-blocked')) setSnipdError(t('Snipd’s share page currently blocks requests from this server (anti-bot protection), so the link cannot be resolved here — this is not a problem with your link. Open the episode in your podcast app instead and paste its public audio URL directly below.'))
      else if (code.includes('share-page-unreachable')) setSnipdError(t('Snipd and the public metadata relays are temporarily unavailable (rate limit, timeout, or anti-bot protection). This does not mean your link is invalid. Please retry shortly, or paste the episode’s public audio URL below to continue now.'))
      else if (code.includes('feed-not-found')) setSnipdError(t('The share page did not name its RSS feed and the public podcast directory had no match. Find the episode in your podcast app and paste its audio URL directly below.'))
      else if (code.includes('directory-unreachable')) setSnipdError(t('The public podcast directory could not be reached just now, so the feed could not be looked up — please try again in a moment.'))
      else setSnipdError(t('This Snipd link could not be resolved. You can still paste the episode’s public audio URL directly below.'))
    }
  }

  const runLocalTranscription = async () => {
    if (!audioFile || asr) return
    setAsrError('')
    setAsrChannel(null)
    setAsrDetectedLangs([])
    // Create and unlock the decode AudioContext NOW, synchronously inside the
    // click gesture. Ownership then transfers to the application-level job:
    // leaving this view cannot cancel inference or strand an open context.
    const audioContext = unlockAudioContextForGesture()
    try {
      const data = await audioFile.arrayBuffer()
      transcriptionJobs.start({
        episodeId: episode.id,
        data,
        filename: audioFile.name,
        language: asrLang,
        model: asrTier,
        audioContext,
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setAsrError(asrErrorLabel(t, message))
      if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => undefined)
    }
  }

  /**
   * Server path: better quality than the bundled tiny model and roughly 3x real
   * time on the box, but the audio leaves the device. Offered as an explicit
   * choice next to the on-device button, never silently.
   */
  const runServerTranscription = async () => {
    if (!audioFile || asr) return
    if (!asrToken.trim()) {
      setAsrError(t('Paste the bench access token first — the server refuses anonymous jobs.'))
      return
    }
    setAsrError('')
    setAsrChannel(null)
    setAsrDetectedLangs([])
    try {
      const data = await audioFile.arrayBuffer()
      transcriptionJobs.start({
        episodeId: episode.id,
        data,
        filename: audioFile.name,
        language: asrLang,
        model: asrTier,
        provider: 'server',
        token: asrToken.trim(),
        tier: asrServerTier,
        contentType: audioFile.type || 'application/octet-stream',
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setAsrError(asrErrorLabel(t, message))
    }
  }

  const readTranscript = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError(t('Transcript exceeds 5 MB. Split it into chapters before importing to avoid exhausting browser storage.')); return }
    try {
      const text = await file.text()
      const extension = file.name.split('.').pop()?.toLocaleLowerCase()
      const fixedTranscript = extension === 'vtt' || extension === 'srt'
      setImportCandidate({
        file,
        text,
        initialKind: 'transcript',
        allowedKinds: fixedTranscript ? ['transcript'] : ['transcript', 'summary', 'vocabulary'],
        episodeTitle: episode.title,
        vocabularyMode: 'episode-import',
      })
      setError('')
    } catch {
      setError(t('Could not read this transcript. Use UTF-8 encoded VTT, SRT, TXT, or Markdown.'))
    } finally {
      if (transcriptInput.current) transcriptInput.current.value = ''
    }
  }

  const chooseAudio = (file: File | undefined) => {
    if (!file) return
    setImportCandidate({ file, initialKind: 'audio', allowedKinds: ['audio'], episodeTitle: episode.title })
    if (audioInput.current) audioInput.current.value = ''
  }

  const confirmImport = (kind: ImportKind) => {
    const candidate = importCandidate
    if (!candidate) return
    if (kind === 'audio') {
      setAudioMode('local')
      setAudioFile(candidate.file)
      setImportCandidate(null)
      setError('')
      return
    }
    const text = candidate.text ?? ''
    if (kind === 'transcript') {
      setTranscript(text)
      setFilename(candidate.file.name)
      setImportCandidate(null)
      setError('')
      toast.success(t('Transcript added to the setup draft. Review it, then save the listening desk to replace the saved transcript.'))
      return
    }
    try {
      if (kind === 'summary') {
        const extension = candidate.file.name.split('.').pop()?.toLocaleLowerCase()
        const parsed = parseKimiSummary(text, extension === 'md' || extension === 'markdown' ? 'markdown' : 'text')
        const now = new Date().toISOString()
        saveKimiSummary({ ...parsed, episodeId: episode.id, importedAt: state.summaries.find((item) => item.episodeId === episode.id)?.importedAt ?? now, updatedAt: now })
        setImportCandidate(null)
        toast.success(t('Kimi summary saved to this episode’s workspace record.'))
        openInsightsEpisode(episode.id, 'summary')
        return
      }
      const entries = parseVocabularyFileText(text, 'txt')
      if (!entries.length) throw new Error(t('No usable word entries were found in this file.'))
      if (entries.length > MAX_VOCABULARY_IMPORT) throw new Error(t('One batch accepts at most 500 valid entries. Split the list and import the parts separately.'))
      const added = importVocabulary(entries.map((item) => ({ episodeId: episode.id, surface: item.surface, translation: item.translation, language: show.language, context: '', startSeconds: null })))
      const skipped = entries.length - added
      setImportCandidate(null)
      toast.success(skipped > 0
        ? t('Imported {added} words; {skipped} duplicates were skipped.', { added, skipped })
        : t('Imported {added} words. They are cards now — review or test them below.', { added }))
    } catch (reason) {
      throw new Error(reason instanceof Error ? t(reason.message) : t('The file could not be imported. Nothing was saved.'))
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const parsed = parseTranscript(transcript, filename)
    if (!parsed.segments.length && transcript.trim()) { setError(t('This transcript could not be parsed. Repair it, or leave the transcript empty for audio-only playback.')); return }
    if (parsed.segments.length > 5000) { setError(t('Transcript exceeds 5,000 segments. Split it into chapters before importing.')); return }
    if (audioMode === 'rss') {
      const urlError = publicHttpUrlError(directAudioUrl)
      if (urlError) { setError(t(urlError)); return }
    }
    if (audioMode === 'local' && !audioFile && session?.audioMode !== 'local') { setError(t('Choose a local audio file.')); return }
    setBusy(true)
    try {
      if (audioMode === 'local' && audioFile) await saveLocalAudio(episode.id, audioFile)
      if (audioMode === 'rss' && directAudioUrl.trim() !== episode.audioUrl) updateEpisode(episode.id, { audioUrl: directAudioUrl.trim() })
      clearSetupDraft(draftKey) // the draft's job ends when the desk is saved
      onSave({
        episodeId: episode.id,
        audioMode,
        audioUrl: audioMode === 'rss' ? directAudioUrl.trim() : '',
        transcriptFormat: parsed.format,
        segments: parsed.segments,
        positionSeconds: 0,
        followTranscript: session?.followTranscript ?? true,
        updatedAt: new Date().toISOString(),
      })
    } catch (reason) {
      setError(reason instanceof Error ? t('{message}. You can also use RSS audio.', { message: reason.message }) : t('Audio could not be saved. You can also use RSS audio.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="study-setup" onSubmit={submit} noValidate>
      <div className="study-setup-intro">
        <span className="section-index">{t('02 / RETURN & SETUP')}</span>
        <h2>{t(session ? 'Change audio or transcript' : 'Import the returned transcript')}</h2>
        <p>{t('Start with audio alone, or add the file KimiClaw returned. VTT and SRT provide segment-level synchronization; TXT and Markdown support clickable words immediately, and you can set their timeline after import. Audio is never uploaded unless you choose a server or cloud channel — the optional on-device transcriber below runs entirely in this browser.')}</p>
      </div>
      <div className="study-setup-grid">
        <section aria-labelledby="audio-source-title">
          <div className="study-setup-heading"><FileAudio size={18} /><h3 id="audio-source-title">{t('Audio source')}</h3></div>
          <div className="source-choices">
            <label className={`choice-row ${audioMode === 'rss' ? 'is-selected' : ''}`}>
              <input type="radio" name="audio-mode" value="rss" checked={audioMode === 'rss'} onChange={() => { setAudioMode('rss'); setError('') }} />
              <span><strong>{t('Public RSS or direct audio URL')}</strong><small>{t('Streams in this player; not downloaded to the workspace')}</small></span>
            </label>
            <label className={`choice-row ${audioMode === 'local' ? 'is-selected' : ''}`}>
              <input type="radio" name="audio-mode" value="local" checked={audioMode === 'local'} onChange={() => { setAudioMode('local'); setError('') }} />
              <span><strong>{t('Local or Snipd-exported audio')}</strong><small>{t('Stored in this browser; excluded from JSON backups')}</small></span>
            </label>
          </div>
          <div hidden={audioMode !== 'rss'}>
            <div className="form-stack snipd-resolve">
              <span className="field-label">{t('Resolve a Snipd share link')}</span>
              <div className="snipd-resolve-row">
                <input className="field" type="url" value={snipdUrl} onChange={(event) => { setSnipdUrl(event.target.value); setSnipdError(''); setSnipdNotice(''); setSnipdResult(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void resolveSnipdLink() } }} placeholder="https://share.snipd.com/episode/…" />
                <button type="button" className="btn btn-secondary" disabled={snipdResolve.isPending || !snipdUrl.trim() || !isAuthenticated} onClick={() => void resolveSnipdLink()}><Link2 size={16} />{snipdResolve.isPending ? t('Resolving…') : t('Resolve')}</button>
              </div>
              <small className="form-hint">{t('Paste a public Snipd share link. The server reads only the public share page and the show’s original RSS feed, then fills the episode’s real audio URL into the field below. No Snipd sign-in, and private subscriptions are never touched.')}</small>
              {!isAuthenticated && <small className="form-hint">{t('Sign in to use link resolution.')}</small>}
              {snipdError && <p className="form-error" role="alert">{snipdError}</p>}
              {!snipdError && snipdNotice && <p className="form-hint" role="status">{snipdNotice}</p>}
              {snipdResult && (
                <div className="snipd-result">
                  <strong>{snipdResult.episodeTitle ?? snipdResult.showTitle ?? t('Resolved link')}</strong>
                  {snipdResult.showTitle && snipdResult.episodeTitle && <span className="snipd-result-line">{snipdResult.showTitle}</span>}
                  <span className="snipd-result-line">
                    {snipdResult.pubDate ? new Date(snipdResult.pubDate).toLocaleDateString() : ''}
                    {snipdResult.pubDate && snipdResult.durationSeconds ? ' · ' : ''}
                    {snipdResult.durationSeconds ? formatDuration(snipdResult.durationSeconds) : ''}
                    {snipdResult.matchedBy ? ` · ${t('matched via {by}', { by: snipdResult.matchedBy })}` : ''}
                  </span>
                  {snipdResult.feedUrl && <span className="snipd-result-line snipd-feed-url">{t('RSS feed: {url}', { url: snipdResult.feedUrl })}</span>}
                  {snipdResult.warnings.includes('episode-not-found') && <span className="snipd-result-line">{t('The feed was found, but this episode was not in it — older episodes sometimes age out of an RSS feed. Pick the episode in a podcast app to copy its audio URL.')}</span>}
                  {snipdResult.warnings.includes('feed-unreachable') && <span className="snipd-result-line">{t('The feed address was found but could not be read just now — try again later.')}</span>}
                  {snipdResult.warnings.includes('feed-not-found') && <span className="snipd-result-line">{t('No RSS feed could be found for this link; the audio URL came from the share page itself.')}</span>}
                  {snipdResult.warnings.includes('directory-unreachable') && <span className="snipd-result-line">{t('The public podcast directory could not be reached, so only the audio declared by the share page itself is shown.')}</span>}
                  {snipdResult.warnings.includes('audio-from-directory') && <span className="snipd-result-line">{t('This episode was not listed in the readable part of the feed, so the audio URL came from the public podcast directory.')}</span>}
                  {snipdResult.warnings.includes('audio-not-found') && <span className="snipd-result-line">{t('The episode was found in the feed, but it declares no audio file.')}</span>}
                </div>
              )}
            </div>
            <label className="form-stack direct-audio-field"><span className="field-label">{t('Direct public audio URL')}</span><input className="field" type="url" value={directAudioUrl} onChange={(event) => { setAudioUrlOverride(event.target.value); setError('') }} placeholder="https://…/episode.mp3" /><small className="form-hint">{t('For Snipd, resolve a share link above or use audio you exported. A Snipd share webpage is not an audio direct link. Never paste passwords, account tokens, or private feed parameters; the site does not sign in to Snipd or read private subscriptions.')}</small></label>
          </div>
          <div hidden={audioMode !== 'local'}>
            <button type="button" className="btn btn-secondary file-picker" onClick={() => audioInput.current?.click()}><Upload size={16} />{audioFile ? audioFile.name : t(session?.audioMode === 'local' ? 'Replace local audio (optional)' : 'Choose audio file')}</button>
            <input ref={audioInput} className="sr-only" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" onChange={(event) => chooseAudio(event.target.files?.[0])} />
            {audioFile && <p className="form-hint">{t('Selected {filename}, {size} MB', { filename: audioFile.name, size: (audioFile.size / 1024 / 1024).toFixed(1) })}</p>}
          </div>
        </section>
        <section aria-labelledby="transcript-source-title">
          <div className="study-setup-heading"><FileText size={18} /><h3 id="transcript-source-title">{t('Transcript source')}</h3></div>
          <button type="button" className="btn btn-secondary file-picker" onClick={() => transcriptInput.current?.click()}><Upload size={16} />{t('Import VTT / SRT / TXT / MD')}</button>
          <input ref={transcriptInput} className="sr-only" type="file" accept=".vtt,.srt,.txt,.md,.markdown,text/plain,text/markdown" onChange={(event) => void readTranscript(event.target.files?.[0])} />
          {audioMode === 'local' && (audioFile || transcriptionJob) && (
            <div className="local-asr" data-testid="local-asr">
              <div className="local-asr-head"><Sparkles size={16} /><strong>{t('Free on-device transcription (experimental)')}</strong></div>
              <p className="form-hint">{t('Runs entirely in this browser with a small open model (~40 MB, bundled with the site). The audio never leaves this device and no Kimi quota is used. English and German audio (auto-detected by default), up to 3 hours per file — long MP3/WAV episodes stream through a memory-safe decoder, so a full podcast episode fits; expect a rough draft to review, and long pieces can take a while on a tablet (recognition runs slower than real time there). Stereo files are auditioned on three channels (mix, left, right) and the cleanest is transcribed; a larger model is available below for difficult audio.')}</p>
              <div className="local-asr-controls">
                <label className="local-asr-lang"><span className="field-label">{t('Audio language')}</span>
                  <select className="field" value={asrLang} disabled={!!asr} onChange={(event) => setAsrLang(event.target.value as AsrLanguage)}>
                    <option value="auto">{t('Auto-detect (recommended)')}</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                  </select>
                </label>
                <label className="local-asr-lang"><span className="field-label">{t('Recognition quality')}</span>
                  <select className="field" value={asrTier} disabled={!!asr} onChange={(event) => setAsrTier(event.target.value as AsrModelTier)}>
                    <option value="tiny">{t('Standard — 40 MB model, bundled')}</option>
                    <option value="base">{t('Higher — 80 MB model, bundled')}</option>
                  </select>
                </label>
                <button type="button" className="btn btn-secondary" disabled={!!asr || !audioFile} onClick={() => void runLocalTranscription()}>{asr ? t('Transcribing on device…') : markDefault(t('Transcribe on this device (free)'), 'device', readDefaultChannel(), ` · ${t('your default')}`)}</button>
                <button type="button" className="btn btn-secondary" disabled={!!asr || !audioFile} onClick={() => void runServerTranscription()}>{markDefault(t('Transcribe on the server (better quality)'), 'server', readDefaultChannel(), ` · ${t('your default')}`)}</button>
              </div>
              <label className="local-asr-lang">
                <span className="field-label">{t('Server model')}</span>
                <select className="field" value={asrServerTier} disabled={!!asr} onChange={(event) => { const next = event.target.value as 'small' | 'medium'; setAsrServerTier(next); storeTier(next) }}>
                  <option value="small">{t('Fast — small, about 3x real time')}</option>
                  <option value="medium">{t('Careful — medium, slower but hears more (loads 1.5 GB on the server)')}</option>
                </select>
              </label>
              <label className="local-asr-lang" style={{ marginTop: 8 }}>
                <span className="field-label">{t('Server access token')}</span>
                <input
                  className="field"
                  type="password"
                  value={asrToken}
                  onChange={(event) => {
                    setAsrToken(event.target.value)
                    try { localStorage.setItem('skopein.whisper.token', event.target.value) } catch { /* private mode */ }
                  }}
                  placeholder={t('Only needed for server transcription')}
                />
              </label>
              <p className="form-hint">{t('On-device transcription works best on short clips — aim for ten minutes or less; the hard limit is three hours. It is private and free but much less accurate on long audio. The server path hears accents and names better and never keeps the file, but the audio is uploaded.')}</p>
              {asr && (
                <div className="local-asr-progress" role="status">
                  <span>{asrStageLabel(t, asr)}{asr.detail ? ` · ${asr.detail}` : ''}</span>
                  <progress value={asr.progress} max={1} />
                </div>
              )}
              {asrChannel && !asr && <p className="form-hint">{t('Channel used: {channel}', { channel: t(asrChannel === 'mono' ? 'mono' : asrChannel === 'downmix' ? 'stereo mix' : asrChannel === 'left' ? 'left channel' : 'right channel') })}</p>}
              {asrLang === 'auto' && asrDetectedLangs.length > 0 && !asr && <p className="form-hint">{t('Detected language: {language}', { language: asrDetectedLangs.map((language) => language === 'de' ? 'Deutsch' : 'English').join(' + ') })}</p>}
              {(asrError || transcriptionJob?.status === 'error') && <p className="form-error" role="alert">{asrError || asrErrorLabel(t, transcriptionJob?.error ?? '')}</p>}
            </div>
          )}
          <label className="field-label" htmlFor="study-transcript">{t('Or paste transcript text')}</label>
          <textarea id="study-transcript" className="field textarea transcript-input" rows={10} value={transcript} onChange={(event) => { setTranscript(event.target.value); setError('') }} placeholder={'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nYour transcript here…'} />
          <p className="form-hint">{t('Snipd-exported Markdown can be imported directly. After import, choose Set timeline to assign segment boundaries manually or review an estimate based on audio duration and text length.')}</p>
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="study-setup-actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{t(busy ? 'Saving…' : session ? 'Save and rebuild desk' : 'Create listening desk')}</button>
      </div>
      {importCandidate && <ImportPreviewDialog candidate={importCandidate} onCancel={() => setImportCandidate(null)} onConfirm={confirmImport} />}
    </form>
  )
}
