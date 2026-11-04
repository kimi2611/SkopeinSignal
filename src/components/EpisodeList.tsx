import { Archive, ArrowUpRight, AudioLines, Check, MoreHorizontal, RotateCcw, X } from 'lucide-react'
import { useWorkspace } from '../hooks/useWorkspace'
import { formatDate, formatDuration } from '../lib/format'
import { openStudyEpisode } from '../lib/studyNavigation'
import { useI18n } from '../lib/i18n'
import { getEpisodeLens, LENS_NAMES } from '../lib/lenses'
import { useEpisodeActions } from './EpisodeActions'
import type { Episode } from '../types'

interface EpisodeListProps {
  episodes: Episode[]
  mode: 'queue' | 'inbox' | 'history'
  emptyTitle: string
  emptyCopy: string
  emptyAction?: React.ReactNode
}

export function EpisodeList({ episodes, mode, emptyTitle, emptyCopy, emptyAction }: EpisodeListProps) {
  const { state, removeFromQueue, restoreEpisode, archiveEpisode } = useWorkspace()
  const { openDetail, openSelect, openComplete, openSkip } = useEpisodeActions()
  const { t } = useI18n()

  if (!episodes.length) {
    return <div className="empty-state"><span className="empty-mark">∅</span><h3>{emptyTitle}</h3><p>{emptyCopy}</p>{emptyAction}</div>
  }

  return (
    <div className="episode-list">
      {episodes.map((episode) => {
        const show = state.shows.find((item) => item.id === episode.showId)
        const lens = getEpisodeLens(episode, show)
        return (
          <article className="episode-row" key={episode.id}>
            <div className="episode-code" aria-hidden="true">{show?.code ?? '??'}</div>
            <div className="episode-main">
              <div className="episode-meta"><span>{show?.shortName ?? t('Unknown show')}</span><span className={`lens-badge lens-${lens}`}>{t(LENS_NAMES[lens])}</span><span>{formatDuration(episode.durationMinutes)}</span><span>{formatDate(episode.publishedAt)}</span></div>
              <button type="button" className="episode-title" onClick={() => openDetail(episode)}>{episode.title}<ArrowUpRight size={16} /></button>
              {episode.description && <p className="episode-description">{episode.description}</p>}
              {mode === 'queue' && !!episode.selectionReasons?.length && <p className="episode-reasons">{episode.selectionReasons.slice(0, 2).map((reason) => t(reason)).join(' · ')}</p>}
              {episode.status === 'skipped' && episode.skipReason && <p className="episode-reasons">{t('Skipped: {reason}', { reason: t(episode.skipReason) })}</p>}
            </div>
            <div className="episode-actions">
              {mode === 'queue' && <>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => openStudyEpisode(episode.id)}><AudioLines size={15} />{t('Study')}</button>
                <button type="button" className="btn btn-primary btn-small" onClick={() => openComplete(episode)}><Check size={15} />{t('Complete')}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => openSkip(episode)}><X size={15} />{t('Skip')}</button>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => { removeFromQueue(episode.id) }} aria-label={t('Remove {title} from this week’s queue', { title: episode.title })} title={t('Remove from queue')}><MoreHorizontal size={18} /></button>
              </>}
              {mode === 'inbox' && <>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => openSelect(episode)}>{t('Select')}</button>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => archiveEpisode(episode.id)} aria-label={t('Move {title} to the reference library', { title: episode.title })} title={t('Move to library')}><Archive size={17} /></button>
              </>}
              {mode === 'history' && episode.status !== 'listened' && <button type="button" className="btn btn-ghost btn-small" onClick={() => restoreEpisode(episode.id)}><RotateCcw size={15} />{t('Restore')}</button>}
            </div>
          </article>
        )
      })}
    </div>
  )
}
