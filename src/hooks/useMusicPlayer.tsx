/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PERFORMANCE_RECORDINGS, type PerformanceRecording, type RecordingId } from '../data/recordings'
import { useI18n } from '../lib/i18n'

interface PlaybackEventDetail {
  episodeId: string
  playing: boolean
  currentTime: number
}

interface MusicPlayerContextValue {
  recording: PerformanceRecording
  recordingId: RecordingId
  playing: boolean
  engaged: boolean
  podcastPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  selectRecording: (id: RecordingId) => void
  togglePerformance: () => Promise<void>
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  close: () => void
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [recordingId, setRecordingId] = useState<RecordingId>('bassoon-glinka')
  const [playing, setPlaying] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [podcastPlaying, setPodcastPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(.55)
  const recording = PERFORMANCE_RECORDINGS.find((item) => item.id === recordingId) ?? PERFORMANCE_RECORDINGS[0]

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackEventDetail>).detail
      setPodcastPlaying(detail.playing)
      if (detail.playing) audioRef.current?.pause()
    }
    window.addEventListener('tingwen:playback', listener)
    return () => window.removeEventListener('tingwen:playback', listener)
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const selectRecording = (id: RecordingId) => {
    if (id === recordingId) return
    audioRef.current?.pause()
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setRecordingId(id)
  }

  const togglePerformance = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); return }
    const podcastAudio = document.querySelector<HTMLAudioElement>('audio.study-audio')
    if (podcastPlaying || (podcastAudio && !podcastAudio.paused)) {
      setPodcastPlaying(true)
      toast.message(t('Recorded music is unavailable while podcast audio is playing. Pause the episode first.'))
      return
    }
    setEngaged(true)
    try {
      await audio.play()
    } catch {
      setPlaying(false)
      toast.error(t('This recording could not be played. Check browser media support and try again.'))
    }
  }

  const seek = (seconds: number) => {
    if (!Number.isFinite(seconds)) return
    if (audioRef.current) audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
  }

  const close = () => {
    audioRef.current?.pause()
    if (audioRef.current) audioRef.current.currentTime = 0
    setPlaying(false)
    setCurrentTime(0)
    setEngaged(false)
  }

  return (
    <MusicPlayerContext.Provider value={{ recording, recordingId, playing, engaged, podcastPlaying, currentTime, duration, volume, selectRecording, togglePerformance, seek, setVolume, close }}>
      {children}
      <audio
        ref={audioRef}
        className="recording-audio"
        src={recording.src}
        preload="metadata"
        onPlay={() => { setPlaying(true); setEngaged(true) }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); event.currentTarget.volume = volume }}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
        onError={() => { setPlaying(false); toast.error(t('This recording could not be loaded. Reconnect once to cache it, then try again.')) }}
      />
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const context = useContext(MusicPlayerContext)
  if (!context) throw new Error('useMusicPlayer must be used inside MusicPlayerProvider')
  return context
}
