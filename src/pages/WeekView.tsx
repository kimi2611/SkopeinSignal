import { useState } from 'react'
import { ArrowRight, BookOpen, CircleAlert, Clock3 } from 'lucide-react'
import { useWorkspace } from '../hooks/useWorkspace'
import { getEpisodeDurationCategory } from '../lib/format'
import { moduleTitle } from '../lib/themeTitles'
import { useI18n } from '../lib/i18n'
import { getEpisodeLens, getEpisodeValueCategory, LENS_NAMES } from '../lib/lenses'
import { AddManualButton, FeedProgress, PageHeader, RefreshButton } from '../components/Common'
import { EpisodeList } from '../components/EpisodeList'
import { ContinueLearning } from '../components/learning/ContinueLearning'
import type { EpisodeLens, ViewKey } from '../types'

export function WeekView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state } = useWorkspace()
  const theme = state.settings.theme
  const { t } = useI18n()
  const [lens, setLens] = useState<'all' | EpisodeLens>('all')
  const queue = state.episodes.filter((episode) => episode.status === 'queue')
  const visibleQueue = queue.filter((episode) => lens === 'all' || getEpisodeLens(episode, state.shows.find((show) => show.id === episode.showId)) === lens)
  const inboxCount = state.episodes.filter((episode) => episode.status === 'inbox').length
  const longCount = queue.filter((episode) => getEpisodeDurationCategory(episode) === 'long').length
  const mediumCount = queue.filter((episode) => getEpisodeDurationCategory(episode) === 'medium').length
  const microCount = queue.filter((episode) => getEpisodeDurationCategory(episode) === 'micro').length
  const timelyCount = state.episodes.filter((episode) => getEpisodeValueCategory(episode, state.shows.find((show) => show.id === episode.showId)) === 'timely').length
  const evergreenCount = state.episodes.filter((episode) => getEpisodeValueCategory(episode, state.shows.find((show) => show.id === episode.showId)) === 'evergreen').length
  const unclassifiedCount = state.episodes.filter((episode) => getEpisodeValueCategory(episode, state.shows.find((show) => show.id === episode.showId)) === 'uncategorized').length
  const warnings = state.shows.filter((show) => show.skipStreak >= 2)

  return (
    <div className="page-wrap week-page">
      <PageHeader
        view="week"
        kicker={t('WEEKLY LISTENING DESK')}
        title={t(moduleTitle(theme, 'week'))}
        copy={t('Set an attention budget before choosing content. Separate quotas for long interviews, medium episodes, and micro discussions keep “core listening” from becoming “every episode.”')}
        actions={<><AddManualButton /><RefreshButton /></>}
      />
      <FeedProgress />
      <ContinueLearning />
      <div className="week-grid">
        <main className="week-main">
          {!state.activities.length && queue.some((episode) => episode.source === 'seed') && (
            <div className="initial-note"><BookOpen size={18} /><p><strong>{t('Initial suggested queue')}</strong> {t('is built from public episode information, not your listening history. Remove, skip, or replace anything; output statistics begin with your own first record.')}</p></div>
          )}
          <section className="quota-section" aria-labelledby="quota-title">
            <div className="section-heading"><div><span className="section-index">01</span><h2 id="quota-title">{t('This week’s queue')}</h2></div><span className="section-count">{t('{count} episodes queued', { count: queue.length })}</span></div>
            <div className="quota-grid">
              <Quota label={t('Long interviews')} used={longCount} cap={state.settings.longCap} detail={t('> 60 minutes, with room for deep conversation')} />
              <Quota label={t('Medium episodes')} used={mediumCount} cap={state.settings.mediumCap} detail={t('> 30 and ≤ 60 minutes, for focused listening')} />
              <Quota label={t('Micro discussions')} used={microCount} cap={state.settings.microCap} detail={t('≤ 30 minutes, for radar and concise exchanges')} />
            </div>
            <div className="lens-filter">
              <div><span className="section-kicker">{t('SEMANTIC CLASSIFICATION')}</span><p>{t('Two subject-based views, independent of selection, skipping, duration, and show tier.')}</p></div>
              <div className="lens-filter-options" role="group" aria-label={t('Filter queue by semantic lens')}>
                <button type="button" className={lens === 'all' ? 'active' : ''} aria-pressed={lens === 'all'} onClick={() => setLens('all')}><strong>{t('All topics')}</strong><small>{t('{count} episodes', { count: queue.length })}</small></button>
                {(['aithrascope', 'dikelens'] as const).map((item) => <button type="button" key={item} className={lens === item ? `active lens-${item}` : ''} aria-pressed={lens === item} onClick={() => setLens(item)}><strong>{t(LENS_NAMES[item])}</strong><small>{t(item === 'aithrascope' ? 'Science, technology, AI & business' : 'Society, ethics, history & culture')} · {t('{count} episodes', { count: queue.filter((episode) => getEpisodeLens(episode, state.shows.find((show) => show.id === episode.showId)) === item).length })}</small></button>)}
              </div>
            </div>
            <EpisodeList
              episodes={visibleQueue}
              mode="queue"
              emptyTitle={t(queue.length ? 'No queued episodes in this lens' : 'Nothing scheduled for this week')}
              emptyCopy={t(queue.length ? 'Switch to All topics or choose the other semantic lens.' : 'Choose what truly deserves your time in the inbox. Selection requires at least two reasons.')}
              emptyAction={queue.length ? <button type="button" className="btn btn-secondary" onClick={() => setLens('all')}>{t('Show all topics')}</button> : <button type="button" className="btn btn-primary" onClick={() => onNavigate('inbox')}>{t('Open inbox')}<ArrowRight size={16} /></button>}
            />
          </section>
          <button type="button" className="inbox-callout" onClick={() => onNavigate('inbox')}>
            <span><strong>{t('{count} episodes', { count: inboxCount })}</strong> {t('waiting for a decision in the inbox')}</span><span>{t('Compare first, then select')}<ArrowRight size={17} /></span>
          </button>
        </main>
        <aside className="review-rail" aria-label={t('Weekly review rail')}>
          <section>
            <div className="rail-heading"><Clock3 size={17} /><h2>{t('Research value')}</h2></div>
            <div className="rail-stat"><strong>{timelyCount}</strong><span>{t('timely episodes')}</span></div>
            <div className="rail-stat"><strong>{evergreenCount}</strong><span>{t('evergreen references')}</span></div>
            <div className="rail-stat"><strong>{unclassifiedCount}</strong><span>{t('unclassified episodes')}</span></div>
            <button type="button" className="text-link" onClick={() => onNavigate('insights')}>{t('Open value insights')}<ArrowRight size={15} /></button>
          </section>
          <section>
            <div className="rail-heading"><CircleAlert size={17} /><h2>{t('Downgrade signals')}</h2></div>
            {warnings.length ? <ul className="warning-list">{warnings.map((show) => <li key={show.id}><strong>{show.shortName}</strong><span>{t('Skipped {count} times in a row', { count: show.skipStreak })}{show.skipStreak >= 3 ? t('; consider a lower tier') : t('; keep observing')}</span></li>)}</ul> : <p className="rail-copy">{t('No consecutive-skip signals. Completing an episode resets that show’s counter.')}</p>}
          </section>
          <section>
            <div className="rail-heading"><BookOpen size={17} /><h2>{t('Reference boundaries')}</h2></div>
            <p className="rail-copy">{t('{count} shows are organized. TOE’s existing 41 snips remain part of your personal library; keep listening in Snipd or import public audio and transcripts into Listen & Read.', { count: state.shows.length })}</p>
            <button type="button" className="text-link" onClick={() => onNavigate('study')}>{t('Open Listen & Read')}<ArrowRight size={15} /></button>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Quota({ label, used, cap, detail }: { label: string; used: number; cap: number; detail: string }) {
  const { t } = useI18n()
  return (
    <div className="quota-item">
      <div><span>{label}</span><strong>{used}<small> / {cap}</small></strong></div>
      <div className="quota-dots" aria-label={t('{label}: {used} used, {cap} available', { label, used, cap })}>{Array.from({ length: Math.max(cap, used) }, (_, index) => <span key={index} className={index < used ? 'used' : ''} />)}</div>
      <p>{detail}</p>
    </div>
  )
}
