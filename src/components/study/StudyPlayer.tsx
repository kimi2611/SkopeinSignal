import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Palette, Pencil, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { loadLocalAudio, saveLocalAudio } from '../../lib/media'
import { formatTimecode } from '../../lib/transcript'
import { clearSegmentTimeline } from '../../lib/transcriptTimeline'
import { useI18n } from '../../lib/i18n'
import { ArtworkViewer } from './ArtworkViewer'
import { TranscriptTimelineEditor } from './TranscriptTimelineEditor'
import type { Episode, PodcastShow, StudySession, TranscriptSegment, VocabularyEntry } from '../../types'

export interface WordSelection {
  surface: string
  context: string
  startSeconds: number | null
  entry?: VocabularyEntry
}

export interface SeekRequest {
  seconds: number
  nonce: number
}

interface StudyPlayerProps {
  episode: Episode
  show: PodcastShow
  session: StudySession
  entries: VocabularyEntry[]
  seekRequest: SeekRequest | null
  onOpenSetup: () => void
  onWord: (selection: WordSelection) => void
  onPlaybackChange: (playback: { currentTime: number; playing: boolean }) => void
}

export function StudyPlayer({ episode, session, entries, seekRequest, onOpenSetup, onWord, onPlaybackChange }: StudyPlayerProps) {
  const { updateStudySession, updateTranscriptSegment, updateTranscriptTimeline } = useWorkspace()
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const lastSavedPosition = useRef(session.positionSeconds)
  const positionApplied = useRef(false)
  const [localAudioUrl, setLocalAudioUrl] = useState('')
  const [localAudioError, setLocalAudioError] = useState('')
  const [playbackError, setPlaybackError] = useState('')
  const [currentTime, setCurrentTime] = useState(session.positionSeconds)
  const [playing, setPlaying] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)

  useEffect(() => () => {
    const audio = audioRef.current
    audio?.pause()
    window.dispatchEvent(new CustomEvent('tingwen:playback', { detail: { episodeId: episode.id, currentTime: audio?.currentTime ?? 0, playing: false } }))
  }, [episode.id])

  useEffect(() => {
    if (session.audioMode !== 'local') return
    let cancelled = false
    let objectUrl = ''
    void loadLocalAudio(episode.id).then((blob) => {
      if (!blob) { if (!cancelled) setLocalAudioError(t('Local audio is not on this device. It was never uploaded to the cloud; re-link the original file here to keep the synced transcript, notes, and position.')); return }
      objectUrl = URL.createObjectURL(blob)
      if (cancelled) URL.revokeObjectURL(objectUrl)
      else setLocalAudioUrl(objectUrl)
    }).catch((error: unknown) => {
      if (!cancelled) setLocalAudioError(error instanceof Error ? error.message : t('Local audio could not be read'))
    })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [episode.id, session.audioMode, t])

  const audioUrl = session.audioMode === 'rss' ? session.audioUrl || episode.audioUrl : localAudioUrl
  const audioError = localAudioError || playbackError || (session.audioMode === 'rss' && !audioUrl ? t('This episode has no usable RSS audio URL. Choose a local audio file instead.') : '')

  useEffect(() => {
    if (!seekRequest || !audioRef.current) return
    audioRef.current.currentTime = seekRequest.seconds
    const frame = requestAnimationFrame(() => {
      setCurrentTime(seekRequest.seconds)
      onPlaybackChange({ currentTime: seekRequest.seconds, playing: !audioRef.current?.paused })
    })
    updateStudySession(episode.id, { positionSeconds: seekRequest.seconds })
    return () => cancelAnimationFrame(frame)
  }, [audioUrl, episode.id, onPlaybackChange, seekRequest, updateStudySession])

  const activeIndex = useMemo(() => {
    let active = -1
    session.segments.forEach((segment, index) => {
      if (segment.start === null) return
      if (segment.start <= currentTime && (segment.end === null || currentTime < segment.end + 0.35)) active = index
    })
    return active
  }, [currentTime, session.segments])

  useEffect(() => {
    if (!playing || !session.followTranscript || activeIndex < 0 || !transcriptRef.current) return
    const container = transcriptRef.current
    const element = container.querySelector<HTMLElement>(`[data-segment-index="${activeIndex}"]`)
    if (!element) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({ top: Math.max(0, element.offsetTop - container.clientHeight * 0.3), behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeIndex, playing, session.followTranscript])

  const savedWords = useMemo(() => new Set(entries.map((entry) => entry.surface.toLocaleLowerCase())), [entries])
  const hasTimeline = session.segments.some((segment) => segment.start !== null)
  const timelineActionLabel = hasTimeline ? t('Edit timeline') : t('Set timeline')
  const transcriptHelp = !session.segments.length
    ? t('Audio-only mode. Add a transcript later through Audio & transcript to enable reading and word lookup.')
    : timelineOpen
      ? t('Edit segment boundaries while listening, then save to enable synchronized playback.')
      : hasTimeline
        ? t('The current segment follows playback. Select a timestamp to seek.')
        : t('This transcript has no timeline yet. Set one to enable playback seeking and automatic following.')

  const savePosition = (value: number, force = false) => {
    if (!force && Math.abs(value - lastSavedPosition.current) < 5) return
    lastSavedPosition.current = value
    updateStudySession(episode.id, { positionSeconds: value })
  }

  const announcePlayback = (seconds: number, isPlaying: boolean) => {
    onPlaybackChange({ currentTime: seconds, playing: isPlaying })
    window.dispatchEvent(new CustomEvent('tingwen:playback', { detail: { episodeId: episode.id, currentTime: seconds, playing: isPlaying } }))
  }

  const seek = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
    announcePlayback(seconds, !audioRef.current.paused)
    savePosition(seconds, true)
  }

  const reattachLocalAudio = async (file: File | undefined) => {
    if (!file) return
    try {
      await saveLocalAudio(episode.id, file)
      const blob = await loadLocalAudio(episode.id)
      if (!blob) throw new Error(t('Local audio could not be read'))
      const nextUrl = URL.createObjectURL(blob)
      if (localAudioUrl) URL.revokeObjectURL(localAudioUrl)
      setLocalAudioUrl(nextUrl)
      setLocalAudioError('')
      setPlaybackError('')
      toast.success(t('Audio re-linked on this device. Transcript, notes, and playback position were left unchanged.'))
    } catch (reason) {
      setLocalAudioError(reason instanceof Error ? reason.message : t('Local audio could not be saved'))
    } finally {
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  return (
    <div className="study-player">
      <section className="audio-desk" aria-label={t('Audio player')}>
        <div className="audio-desk-meta">
          <span>{t(session.audioMode === 'rss' ? 'DIRECT AUDIO' : 'LOCAL AUDIO')}</span>
          <strong>{formatTimecode(currentTime)}</strong>
          <button type="button" className="btn btn-ghost btn-small" onClick={onOpenSetup}><Settings2 size={15} />{t('Audio & transcript')}</button>
        </div>
        <div className={`living-canvas ${playing ? 'is-playing' : ''}`}>
          <div className="living-canvas-heading"><Palette size={16} /><span>{t('Playback artwork')}</span><small>{t(playing ? 'Visible only while episode audio plays' : 'Waiting for episode playback')}</small></div>
          {playing ? <ArtworkViewer key={episode.id} episodeId={episode.id} /> : <div className="art-playback-rest"><Palette size={19} /><p>{t('Historical oil paintings and watercolors appear here only during real podcast playback.')}</p></div>}
        </div>
        {audioUrl ? <audio
          ref={audioRef}
          className="study-audio"
          src={audioUrl}
          controls
          preload="metadata"
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget
            setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : null)
            if (positionApplied.current) return
            positionApplied.current = true
            if (session.positionSeconds > 0 && session.positionSeconds < audio.duration) audio.currentTime = session.positionSeconds
            setCurrentTime(audio.currentTime)
            announcePlayback(audio.currentTime, false)
          }}
          onPlay={(event) => { setPlaying(true); announcePlayback(event.currentTarget.currentTime, true) }}
          onPause={(event) => { setPlaying(false); announcePlayback(event.currentTarget.currentTime, false); savePosition(event.currentTarget.currentTime, true) }}
          onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); announcePlayback(event.currentTarget.currentTime, !event.currentTarget.paused); savePosition(event.currentTarget.currentTime) }}
          onEnded={(event) => {
            setPlaying(false)
            announcePlayback(event.currentTarget.currentTime, false)
            savePosition(event.currentTarget.currentTime, true)
            updateStudySession(episode.id, { completedAt: new Date().toISOString() })
            toast.success(t('Playback complete. Your handoff package is ready in the Handoff tab.'))
          }}
          onError={() => setPlaybackError(t('Audio could not be played. The source may be unavailable, restricted, or a webpage rather than an audio file. For Snipd, use exported audio or the actual public media URL.'))}
        /> : <div className="audio-placeholder">{t('Preparing audio…')}</div>}
        {audioError && <div className="study-inline-error" role="alert"><span>{audioError}</span>{session.audioMode === 'local' && <><input ref={audioInputRef} className="sr-only" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" onChange={(event) => void reattachLocalAudio(event.target.files?.[0])} /><button type="button" className="text-link" onClick={() => audioInputRef.current?.click()}>{t('Re-link audio on this device')}</button></>}<button type="button" className="text-link" onClick={onOpenSetup}>{t('Change source')}</button></div>}
      </section>

      <section className="transcript-desk" aria-labelledby="transcript-title">
        <div className="transcript-toolbar">
          <div><span className="section-index">{session.transcriptFormat.toUpperCase()}</span><h2 id="transcript-title">{t('Synchronized transcript')}</h2><p>{transcriptHelp}</p></div>
          {!timelineOpen && <div className="transcript-toolbar-actions">
            {session.segments.length > 0 && <button type="button" className="btn btn-secondary btn-small" onClick={() => { setTimelineOpen(true); setEditingId(null) }}><Clock3 size={15} />{timelineActionLabel}</button>}
            {hasTimeline && <label className="follow-toggle"><span>{t('Auto-follow')}</span><input type="checkbox" role="switch" checked={session.followTranscript} onChange={(event) => updateStudySession(episode.id, { followTranscript: event.target.checked })} /></label>}
          </div>}
        </div>
        {timelineOpen ? <TranscriptTimelineEditor
          segments={session.segments}
          currentTime={currentTime}
          durationSeconds={audioDuration}
          onCancel={() => setTimelineOpen(false)}
          onSave={(segments) => {
            updateTranscriptTimeline(episode.id, segments)
            setTimelineOpen(false)
            toast.success(t('Timeline saved. Select a timestamp to seek, or enable Auto-follow during playback.'))
          }}
          onClear={() => {
            updateTranscriptTimeline(episode.id, clearSegmentTimeline(session.segments))
            setTimelineOpen(false)
            toast.message(t('Timeline removed. Transcript text is unchanged and remains available for reading and word lookup.'))
          }}
        /> : <div className="transcript-scroll" ref={transcriptRef}>
          {session.segments.length === 0 ? <div className="empty-state transcript-empty"><h3>{t('Listening without a transcript')}</h3><p>{t('The audio player, notes, and playback position remain available. Import VTT, SRT, TXT, or Markdown whenever you want synchronized reading and clickable words.')}</p><button type="button" className="btn btn-secondary" onClick={onOpenSetup}>{t('Add a transcript')}</button></div> : session.segments.map((segment, index) => (
            <article key={segment.id} data-segment-index={index} className={`transcript-segment ${index === activeIndex ? 'is-active' : ''}`}>
              <div className="segment-meta">
                {segment.start !== null ? <button type="button" onClick={() => seek(segment.start ?? 0)} aria-label={t('Seek to {time}', { time: formatTimecode(segment.start) })}>{formatTimecode(segment.start)}</button> : <span>{t('READ')}</span>}
                {editingId !== segment.id && <button type="button" className="segment-edit" onClick={() => { setEditingId(segment.id); setDraft(segment.text) }} aria-label={t('Edit this transcript segment')}><Pencil size={14} /></button>}
              </div>
              {editingId === segment.id ? (
                <div className="segment-editor">
                  <textarea className="field textarea" value={draft} onChange={(event) => setDraft(event.target.value)} rows={Math.max(3, Math.ceil(draft.length / 70))} autoFocus />
                  <div><button type="button" className="btn btn-primary btn-small" disabled={!draft.trim()} onClick={() => { updateTranscriptSegment(episode.id, segment.id, draft); setEditingId(null) }}><Check size={14} />{t('Save')}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}><X size={14} />{t('Cancel')}</button></div>
                </div>
              ) : <p className="segment-text"><TokenizedText segment={segment} savedWords={savedWords} onWord={onWord} /></p>}
            </article>
          ))}
        </div>}
      </section>
    </div>
  )
}

function TokenizedText({ segment, savedWords, onWord }: { segment: TranscriptSegment; savedWords: Set<string>; onWord: (selection: WordSelection) => void }) {
  const { t } = useI18n()
  const tokens = segment.text.split(/([\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*)/gu).filter((token) => token !== '')
  return <>{tokens.map((token, index) => {
    if (!/^[\p{L}\p{N}]/u.test(token)) return <span key={index}>{token}</span>
    const saved = savedWords.has(token.toLocaleLowerCase())
    return <button type="button" key={index} className={`word-token ${saved ? 'is-saved' : ''}`} onClick={() => onWord({ surface: token, context: segment.text, startSeconds: segment.start })} aria-label={t('{word}: select to translate', { word: token })}>{token}</button>
  })}</>
}
