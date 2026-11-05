import { ArrowUpRight, Music2, Pause, Play, X } from 'lucide-react'
import { useMusicPlayer } from '../hooks/useMusicPlayer'
import { useI18n } from '../lib/i18n'
import { formatTimecode } from '../lib/transcript'
import type { ViewKey } from '../types'

interface MusicMiniPlayerProps {
  view: ViewKey
  onNavigate: (view: ViewKey) => void
}

export function MusicMiniPlayer({ view, onNavigate }: MusicMiniPlayerProps) {
  const { t } = useI18n()
  const { recording, playing, engaged, podcastPlaying, currentTime, duration, togglePerformance, close } = useMusicPlayer()
  if (!engaged || view === 'gallery') return null

  return (
    <aside className="music-mini-player" aria-label={t('Continuous recorded music')}>
      <div className="music-mini-progress" aria-hidden="true"><span style={{ transform: `scaleX(${duration > 0 ? Math.min(currentTime / duration, 1) : 0})` }} /></div>
      <div className="music-mini-main">
        <span className="music-mini-mark"><Music2 size={18} /></span>
        <div className="music-mini-copy"><small>{t(podcastPlaying ? 'PAUSED · PODCAST PLAYING' : playing ? 'PLAYING ACROSS PAGES' : 'RECORDED MUSIC')}</small><strong>{recording.work}</strong><span>{recording.performer} · {formatTimecode(currentTime)}</span></div>
        <button type="button" className="music-mini-toggle" onClick={() => void togglePerformance()} disabled={podcastPlaying && !playing} aria-label={playing ? t('Pause recorded performance') : t('Play recorded performance')}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <button type="button" className="music-mini-return" onClick={() => onNavigate('gallery')}><span>{t('Performance Room')}</span><ArrowUpRight size={16} /><span className="sr-only">{t('Return to Performance Room')}</span></button>
        <button type="button" className="music-mini-close" onClick={close} aria-label={t('Stop and close recorded music')}><X size={17} /></button>
      </div>
    </aside>
  )
}
