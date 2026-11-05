import { AudioLines, BookOpen, ExternalLink, Pause, Play, ShieldCheck } from 'lucide-react'
import { AssetUpdateButton } from '../components/AssetUpdateButton'
import { PageHeader } from '../components/Common'
import { ILLUSTRATION_BY_RECORDING } from '../data/recordingIllustrations'
import { PERFORMANCE_RECORDINGS } from '../data/recordings'
import { useMusicPlayer } from '../hooks/useMusicPlayer'
import { useI18n } from '../lib/i18n'
import { formatTimecode } from '../lib/transcript'

const INSTRUMENT_ORDER = ['Piano', 'Flute', 'Classical guitar', 'Harp', 'Cello', 'Bassoon', 'Symphony orchestra']

export function GalleryView() {
  const { t } = useI18n()
  const { recording, recordingId, playing, podcastPlaying, currentTime, duration, volume, selectRecording, togglePerformance, seek, setVolume } = useMusicPlayer()
  const illustration = ILLUSTRATION_BY_RECORDING[recording.id]

  return (
    <div className="page-wrap gallery-page music-only-page">
      <PageHeader
        view="gallery"
        kicker={t('BROWSING SALON / REAL RECORDINGS')}
        title={t('Real musicians for the browsing hour.')}
        copy={t('Choose from twenty-two performances: thirteen unaccompanied instrumental solos, two chamber works with piano, one wind quintet, four soloist-with-orchestra recordings (a bassoon concerto, two Debussy harp dances with string orchestra, and Mozart’s concerto for flute and harp), and two purely instrumental orchestral recordings. Every track is a public-domain or reusable-licensed performance by named musicians—not a browser-generated imitation; choral works are excluded.')}
      />

      <div className="media-policy-note"><AudioLines size={19} /><p><strong>{t('Two media, two moments.')}</strong> {t('Recorded music is for browsing, notes, and handoff work only. Historical oil paintings and watercolors appear exclusively inside Listen & Read while the actual episode audio is playing.')}</p></div>

      <section className="performance-desk music-only-desk" aria-labelledby="performance-title">
        <div className="performance-intro">
          <span className="section-index">{t('01 / RECORDED PERFORMANCE')}</span>
          <h2 id="performance-title">{t('Seven instrument rooms, twenty-two picture-book stages')}</h2>
          <p>{t('Each selection key keeps Holly Hobbie’s complete illustration in view. The scenes follow the mood of the music; no scene is shared with another performance or with the module introductions.')}</p>
          <div className="performance-facts"><span><small>{t('FORMAT')}</small><strong>{t(recording.format)}</strong></span><span><small>{t('COMPOSER')}</small><strong>{recording.composer}</strong></span><span><small>{t('LICENSE')}</small><strong>{t(recording.license)}</strong></span></div>
        </div>

        <div className="recording-instrument-rooms">
          {INSTRUMENT_ORDER.map((instrument) => {
            const items = PERFORMANCE_RECORDINGS.filter((item) => item.instrument === instrument)
            return (
              <section className="recording-instrument-room" key={instrument} aria-labelledby={`instrument-${instrument.replaceAll(' ', '-').toLowerCase()}`}>
                <header><h3 id={`instrument-${instrument.replaceAll(' ', '-').toLowerCase()}`}>{t(instrument)}</h3><span>{t('{count} performances', { count: items.length })}</span></header>
                <div className="recording-picture-grid" role="group" aria-label={t(instrument)}>
                  {items.map((item) => {
                    const art = ILLUSTRATION_BY_RECORDING[item.id]
                    const active = recordingId === item.id
                    return (
                      <button type="button" key={item.id} className={`recording-illustration-key${active ? ' active' : ''}`} aria-pressed={active} onClick={() => selectRecording(item.id)}>
                        <span className="recording-illustration-frame"><img src={art.src} alt={`${t(art.book)}: ${t(art.scene)}`} loading="lazy" /></span>
                        <span className="recording-key-copy"><strong>{item.work}</strong><small>{t(item.character)}</small><em>{t(art.scene)}</em></span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <div className="performance-console">
          <div className="recording-summary"><span className="field-label">{t('Now selected')}</span><strong>{recording.work}</strong><p>{recording.performer}</p><p className="recording-note">{t(recording.note)}</p><AssetUpdateButton src={recording.src} /></div>
          <button type="button" className={`performance-play ${playing ? 'is-playing' : ''}`} onClick={() => void togglePerformance()} aria-label={playing ? t('Pause recorded performance') : t('Play recorded performance')} disabled={podcastPlaying && !playing}>{playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}<span>{playing ? t('Pause performance') : podcastPlaying ? t('Podcast audio is playing') : t('Play recording')}<small>{playing ? t('Real performance · playing now') : t('Real performance · local MP3')}</small></span></button>
          <label className="volume-control"><span>{t('Volume')}</span><input type="range" min="0" max="0.85" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
        </div>

        <div className="recording-timeline"><input className="recording-seek" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} disabled={!duration} aria-label={t('Recording position')} onChange={(event) => seek(Number(event.target.value))} /><span>{formatTimecode(currentTime)} / {formatTimecode(duration)}</span></div>

        <div className="recording-credit"><ShieldCheck size={18} /><div><strong>{t('Performance credit')}</strong><p>{recording.work} · {recording.performer}</p><p>{t(recording.modification)} {t('No performer or ensemble endorsement is implied.')}</p></div><div className="recording-credit-links"><a href={recording.sourceUrl} target="_blank" rel="noreferrer">{t('Source recording')}<ExternalLink size={13} /></a><a href={recording.licenseUrl} target="_blank" rel="noreferrer">{t('License details')}<ExternalLink size={13} /></a></div></div>
        <div className="recording-credit illustration-credit"><BookOpen size={18} /><div><strong>{t('Picture-book illustration credit')}</strong><p>{illustration.book}{illustration.bookYear ? ` (${illustration.bookYear})` : ''} · {t(illustration.scene)}</p><p>{t('Illustration: Holly Hobbie · Toot & Puddle · complete page/scene; resized for the selection key, with any removed text or margins lying outside the complete illustration.')} {t('Copyright remains with the artist and publisher; shown here as a credited picture-book reference, not as an open-licensed asset.')}</p></div><div className="recording-credit-links"><a href={illustration.sourceUrl} target="_blank" rel="noreferrer">{t(illustration.sourceLabel)}<ExternalLink size={13} /></a></div></div>
        <p className="performance-note"><AudioLines size={15} />{t('Music continues when you switch modules. Starting real podcast audio pauses it; use the floating controls to pause, return here, or stop.')}</p>
      </section>
    </div>
  )
}
