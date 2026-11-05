import { useMemo, useState } from 'react'
import { Check, RotateCcw, ScanSearch, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/Common'
import { useEpisodeActions } from '../components/EpisodeActions'
import { useWorkspace } from '../hooks/useWorkspace'
import { findDuplicatePairs } from '../lib/dedupe'
import { formatDate, formatDuration } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { DuplicatePair, Episode } from '../types'

export function DedupeView() {
  const { state, dismissPair, undismissPair, addManualPair, skipEpisode } = useWorkspace()
  const { openDetail } = useEpisodeActions()
  const { t, locale } = useI18n()
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [manualLeft, setManualLeft] = useState('')
  const [manualRight, setManualRight] = useState('')
  const pairs = useMemo(() => findDuplicatePairs(state.episodes, state.dismissedPairs, state.manualPairs), [state.episodes, state.dismissedPairs, state.manualPairs])
  const activeEpisodes = useMemo(() => state.episodes.filter((episode) => episode.status === 'inbox' || episode.status === 'queue'), [state.episodes])
  const episodeById = useMemo(() => new Map(state.episodes.map((episode) => [episode.id, episode])), [state.episodes])
  const showName = (episode: Episode) => state.shows.find((show) => show.id === episode.showId)?.shortName ?? t('Unknown show')
  const keep = (pair: DuplicatePair, winner: Episode, loser: Episode) => {
    skipEpisode(loser.id, `Duplicates “${winner.title}”; the other version was kept`, false)
    dismissPair(pair.key)
    toast.success(t('Primary version kept. The duplicate was skipped without adding a downgrade signal.'))
  }
  const keepNeither = (pair: DuplicatePair) => {
    skipEpisode(pair.left.id, 'Duplicate pair skipped in Dedupe; neither version was kept', false)
    skipEpisode(pair.right.id, 'Duplicate pair skipped in Dedupe; neither version was kept', false)
    dismissPair(pair.key)
    toast.success(t('Both episodes moved to skipped history. Nothing was deleted; either can be restored from Decision history.'))
  }
  const dismissed = state.dismissedPairs.map((key) => {
    const [leftId, rightId] = key.split('::')
    return { key, left: episodeById.get(leftId), right: episodeById.get(rightId) }
  })

  const submitManualPair = () => {
    if (!manualLeft || !manualRight || manualLeft === manualRight) return
    addManualPair([manualLeft, manualRight].sort().join('::'))
    setManualLeft('')
    setManualRight('')
    toast.success(t('Pair marked for review. It appears above, even if the rules found no overlap.'))
  }

  return (
    <div className="page-wrap">
      <PageHeader view="dedupe" kicker={t('DEDUPE / HUMAN REVIEW')} title={t('Find similarity without deleting on your behalf.')} copy={t('Local rules check matching dedupe keys, guest hints, identical titles, and high title-token overlap. They do not understand full semantics, so every pair requires your confirmation — and you can mark a pair the rules missed, or restore a dismissed one.')} actions={<button type="button" className="btn btn-secondary" onClick={() => { setLastScan(new Date().toISOString()); toast.success(t('Scan complete: {count} pairs await review.', { count: pairs.length })) }}><ScanSearch size={16} />{t('Scan again')}</button>} />
      <div className="rule-strip"><span>{t('Same dedupe key → 100%')}</span><span>{t('Same title → 100%')}</span><span>{t('Same guest / title-prefix hint → at least 80%')}</span><span>{t('Title-token Jaccard ≥ 34% with at least 2 shared terms')}</span>{lastScan && <span>{t('Last scan {date} {time}', { date: formatDate(lastScan), time: new Date(lastScan).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</span>}</div>
      {pairs.length ? <div className="pair-list">{pairs.map((pair) => (
        <section className="duplicate-pair" key={pair.key}>
          <div className="pair-heading"><div><span className="section-kicker">{t('Similarity {score}%', { score: Math.round(pair.score * 100) })}</span><h2>{t('Pair awaiting review')}</h2></div><div className="shared-terms">{pair.shared.map((term) => <span key={term}>{term}</span>)}</div></div>
          <div className="pair-episodes">
            {[{ episode: pair.left, side: t('Left') }, { episode: pair.right, side: t('Right') }].map(({ episode, side }) => (
              <article key={episode.id} className="pair-episode"><div className="episode-meta"><span>{side} · {showName(episode)}</span><span>{formatDuration(episode.durationMinutes)}</span><span>{formatDate(episode.publishedAt)}</span></div><button type="button" className="episode-title" onClick={() => openDetail(episode)}>{episode.title}</button><p>{episode.description || t('No description yet. Open the episode detail to compare.')}</p></article>
            ))}
          </div>
          <div className="pair-actions"><button type="button" className="btn btn-secondary" onClick={() => { dismissPair(pair.key); toast.success(t('Pair dismissed; both episodes were kept.')) }}><Check size={16} />{t('Keep both')}</button><button type="button" className="btn btn-ghost" onClick={() => keep(pair, pair.left, pair.right)}>{t('Keep left, skip right')}</button><button type="button" className="btn btn-ghost" onClick={() => keep(pair, pair.right, pair.left)}>{t('Keep right, skip left')}</button><button type="button" className="btn btn-ghost" onClick={() => keepNeither(pair)}>{t('Keep neither')}</button></div>
        </section>
      ))}</div> : <div className="empty-state dedupe-empty"><ScanSearch size={28} /><h3>{t('No duplicate candidates await review')}</h3><p>{t('This does not prove there is no overlap. Rules primarily inspect titles and manual dedupe keys; you still need to judge same-guest episodes with very different titles.')}</p><p>{t('{count} dismissed pairs will not reappear in future scans.', { count: state.dismissedPairs.length })}</p></div>}

      <div className="dedupe-manual-grid">
        <section className="dedupe-manual" aria-labelledby="dedupe-manual-title">
          <div className="study-section-heading"><div><span className="section-index">{t('MANUAL REVIEW')}</span><h2 id="dedupe-manual-title">{t('Mark a pair the rules missed')}</h2></div></div>
          <p className="form-hint">{t('Content value is your call: if two episodes cover the same ground but their titles differ, mark them here. The pair joins the review list above and waits for your decision.')}</p>
          <div className="dedupe-manual-pickers">
            <label><span>{t('Episode A')}</span><select className="field" value={manualLeft} onChange={(event) => setManualLeft(event.target.value)}><option value="">{t('Choose an episode')}</option>{activeEpisodes.map((episode) => <option key={episode.id} value={episode.id}>{showName(episode)} · {episode.title}</option>)}</select></label>
            <label><span>{t('Episode B')}</span><select className="field" value={manualRight} onChange={(event) => setManualRight(event.target.value)}><option value="">{t('Choose an episode')}</option>{activeEpisodes.map((episode) => <option key={episode.id} value={episode.id}>{showName(episode)} · {episode.title}</option>)}</select></label>
            <button type="button" className="btn btn-primary" disabled={!manualLeft || !manualRight || manualLeft === manualRight} onClick={submitManualPair}><Link2 size={16} />{t('Mark as duplicate pair')}</button>
          </div>
        </section>

        {dismissed.length > 0 && <section className="dedupe-manual" aria-labelledby="dedupe-dismissed-title">
          <div className="study-section-heading"><div><span className="section-index">{t('DISMISSED')}</span><h2 id="dedupe-dismissed-title">{t('Dismissed pairs')}</h2></div></div>
          <p className="form-hint">{t('Dismissed pairs stay out of future scans. Change your mind anytime — restoring puts the pair back into review.')}</p>
          <ul className="dismissed-list">
            {dismissed.map(({ key, left, right }) => (
              <li key={key}>
                <span className="dismissed-titles">{left?.title ?? t('(episode removed)')} ↔ {right?.title ?? t('(episode removed)')}</span>
                <button type="button" className="text-link" onClick={() => { undismissPair(key); toast.success(t('Pair restored to the review list.')) }}><RotateCcw size={14} />{t('Restore')}</button>
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </div>
  )
}
