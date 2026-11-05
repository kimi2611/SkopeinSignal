import { useMemo, useState } from 'react'
import { Search, Settings2 } from 'lucide-react'
import { useWorkspace } from '../hooks/useWorkspace'
import { getEpisodeDurationCategory, TIER_SHORT } from '../lib/format'
import { moduleTitle } from '../lib/themeTitles'
import { useI18n } from '../lib/i18n'
import { getEpisodeLens, LENS_NAMES } from '../lib/lenses'
import { AddManualButton, FeedProgress, PageHeader, RefreshButton } from '../components/Common'
import { EpisodeList } from '../components/EpisodeList'
import type { EpisodeDurationCategory, EpisodeLens, Tier, ViewKey } from '../types'

export function InboxView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state } = useWorkspace()
  const theme = state.settings.theme
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [showId, setShowId] = useState('all')
  const [tier, setTier] = useState<'all' | Tier>('all')
  const [duration, setDuration] = useState<'all' | EpisodeDurationCategory>('all')
  const [lens, setLens] = useState<'all' | EpisodeLens>('all')
  const showMap = useMemo(() => new Map(state.shows.map((show) => [show.id, show])), [state.shows])
  const inbox = useMemo(() => state.episodes.filter((episode) => {
    if (episode.status !== 'inbox') return false
    const show = showMap.get(episode.showId)
    if (showId !== 'all' && episode.showId !== showId) return false
    if (tier !== 'all' && show?.tier !== tier) return false
    if (duration !== 'all' && getEpisodeDurationCategory(episode) !== duration) return false
    if (lens !== 'all' && getEpisodeLens(episode, show) !== lens) return false
    const haystack = `${episode.title} ${episode.description} ${show?.name ?? ''}`.toLocaleLowerCase()
    return haystack.includes(query.trim().toLocaleLowerCase())
  }).sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [state.episodes, showId, tier, duration, lens, query, showMap])
  const history = state.episodes.filter((episode) => ['listened', 'skipped', 'archived'].includes(episode.status)).sort((a, b) => (b.listenedAt ?? b.skippedAt ?? b.addedAt).localeCompare(a.listenedAt ?? a.skippedAt ?? a.addedAt))
  const totalInbox = state.episodes.filter((episode) => episode.status === 'inbox').length
  const errors = Object.values(state.feedStatus).filter((feed) => feed.status === 'error').length

  return (
    <div className="page-wrap">
      <PageHeader view="inbox" kicker={t('INBOX / TRIAGE')} title={t(moduleTitle(theme, 'inbox'))} copy={t('RSS and manual entry only bring candidates here. Compare guests, subjects, and information gain before admitting anything to the weekly queue.')} actions={<><AddManualButton /><RefreshButton /></>} />
      <FeedProgress />
      <div className="filter-bar">
        <label className="search-field"><Search size={17} /><span className="sr-only">{t('Search inbox episodes')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search titles, guests, or shows…')} /></label>
        <label><span className="sr-only">{t('Filter by show')}</span><select className="field" value={showId} onChange={(event) => setShowId(event.target.value)}><option value="all">{t('All shows')}</option>{state.shows.map((show) => <option key={show.id} value={show.id}>{show.shortName}</option>)}</select></label>
        <label><span className="sr-only">{t('Filter by tier')}</span><select className="field" value={tier} onChange={(event) => setTier(event.target.value as 'all' | Tier)}><option value="all">{t('All tiers')}</option>{Object.entries(TIER_SHORT).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label><span className="sr-only">{t('Filter by duration category')}</span><select className="field" value={duration} onChange={(event) => setDuration(event.target.value as 'all' | EpisodeDurationCategory)}><option value="all">{t('All durations')}</option><option value="long">{t('Long interviews')}</option><option value="medium">{t('Medium episodes')}</option><option value="micro">{t('Micro discussions')}</option></select></label>
        <label><span className="sr-only">{t('Filter by semantic lens')}</span><select className="field" value={lens} onChange={(event) => setLens(event.target.value as 'all' | EpisodeLens)}><option value="all">{t('Both semantic lenses')}</option><option value="aithrascope">{t(LENS_NAMES.aithrascope)}</option><option value="dikelens">{t(LENS_NAMES.dikelens)}</option></select></label>
      </div>
      {errors > 0 && <button type="button" className="error-banner" onClick={() => onNavigate('settings')}><Settings2 size={17} /><span>{t('{count} feeds failed their latest RSS refresh. This does not mean there are no new episodes; inspect the error or add one manually.', { count: errors })}</span><strong>{t('View status')}</strong></button>}
      <section className="list-section">
        <div className="section-heading"><div><span className="section-index">02</span><h2>{t('Candidates for triage')}</h2></div><span className="section-count">{t('Showing {shown} / {total}', { shown: inbox.length, total: totalInbox })}</span></div>
        <EpisodeList episodes={inbox} mode="inbox" emptyTitle={totalInbox ? t('No episodes match these filters') : t('Your inbox is clear')} emptyCopy={totalInbox ? t('Clear the search or switch back to all shows, tiers, durations, and semantic lenses.') : t('Refresh public RSS feeds or paste an episode manually from Snipd or a show website.')} emptyAction={!totalInbox ? <AddManualButton secondary={false} /> : undefined} />
      </section>
      {history.length > 0 && <details className="history-panel">
        <summary><span><span className="section-index">03</span><strong>{t('Decision history')}</strong><small>{t('{count} episodes', { count: history.length })}</small></span></summary>
        <p>{t('Review completed, skipped, and archived episodes. Skipped or archived items can be restored to the inbox without losing their semantic lens, notes, or transcript.')}</p>
        <EpisodeList episodes={history} mode="history" emptyTitle={t('No decisions yet')} emptyCopy={t('Completed, skipped, and archived episodes will appear here.')} />
      </details>}
    </div>
  )
}
