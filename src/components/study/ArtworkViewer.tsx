import { useState } from 'react'
import { ExternalLink, Info, X } from 'lucide-react'
import { artworkForEpisode, HISTORICAL_ARTWORKS } from '../../data/artworks'
import { ART_GUIDE_BY_ARTWORK } from '../../data/artGuides'
import { AssetUpdateButton } from '../AssetUpdateButton'
import { useI18n } from '../../lib/i18n'

export function ArtworkViewer({ episodeId }: { episodeId: string }) {
  const { t } = useI18n()
  const [artworkId, setArtworkId] = useState(() => artworkForEpisode(episodeId).id)
  const [showNote, setShowNote] = useState(false)
  const artwork = HISTORICAL_ARTWORKS.find((item) => item.id === artworkId) ?? HISTORICAL_ARTWORKS[0]
  const guide = ART_GUIDE_BY_ARTWORK[artwork.id]

  return (
    <div className="living-canvas-body historical-artwork">
      <figure className="historical-artwork-figure">
        <button
          type="button"
          className="artwork-frame"
          onClick={() => setShowNote((value) => !value)}
          aria-expanded={showNote}
          aria-label={showNote ? t('Close the picture-book guide') : t('Open the picture-book guide')}
        >
          <img src={artwork.src} alt={t('{title} by {artist}', { title: artwork.title, artist: artwork.artist })} loading="lazy" decoding="async" />
          <span className="artwork-info-badge">{showNote ? <X size={13} /> : <Info size={13} />}{showNote ? t('Close guide') : t('Picture-book guide')}</span>
        </button>
        {showNote && (
          <div className="artwork-note" role="note">
            <div className="art-guide-reveal">
              <img className="art-guide-image" src={guide.src} alt={t(guide.scene)} loading="lazy" />
              <div className="art-guide-reading">
                <span>{t('A picture-book way of looking')}</span>
                <p>{t(guide.guide)}</p>
              </div>
            </div>
            <div className="artwork-credit-grid">
              <section className="artwork-credit-block" aria-label={t('Historical artwork credits')}>
                <strong>{t('Historical artwork')}</strong>
                <p>{t(artwork.note)}</p>
                <small>{artwork.artist} · {artwork.date} · {artwork.medium} · {artwork.collection} · {t(artwork.license)}</small>
                <a href={artwork.sourceUrl} target="_blank" rel="noreferrer">{t('Work & rights')}<ExternalLink size={12} /></a>
              </section>
              <section className="artwork-credit-block" aria-label={t('Picture-book illustration credits')}>
                <strong>{t('Picture-book illustration')}</strong>
                <small>Holly Hobbie · {guide.book}{guide.bookYear ? ` (${guide.bookYear})` : ''} · {t(guide.scene)}</small>
                <small>{t('Complete interior page or scene; resized without cropping. Copyrighted picture-book reproduction, not public domain or openly licensed.')}</small>
                <a href={guide.sourceUrl} target="_blank" rel="noreferrer">{t(guide.sourceLabel)}<ExternalLink size={12} /></a>
              </section>
            </div>
            <AssetUpdateButton src={artwork.src} />
          </div>
        )}
        <figcaption>
          <div><strong>{artwork.title}</strong><span>{artwork.artist} · {artwork.date}</span></div>
          <small>{artwork.medium} · {artwork.collection}</small>
          <a href={artwork.sourceUrl} target="_blank" rel="noreferrer">{t('Work & rights')}<ExternalLink size={12} /></a>
        </figcaption>
      </figure>
      <label>
        <span className="sr-only">{t('Choose a historical artwork')}</span>
        <select className="field" value={artwork.id} onChange={(event) => { setArtworkId(event.target.value); setShowNote(false) }}>
          <optgroup label={t('Oil paintings')}>{HISTORICAL_ARTWORKS.filter((item) => item.technique === 'oil').map((item) => <option key={item.id} value={item.id}>{item.artist} — {item.title}</option>)}</optgroup>
          <optgroup label={t('Watercolors')}>{HISTORICAL_ARTWORKS.filter((item) => item.technique === 'watercolor').map((item) => <option key={item.id} value={item.id}>{item.artist} — {item.title}</option>)}</optgroup>
        </select>
      </label>
      <p className="artwork-rights">{t('Twenty-two historical works in the public domain. Local optimized reproductions; no image is generated from episode content.')}</p>
    </div>
  )
}
