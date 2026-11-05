import type { ReactNode } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../hooks/useWorkspace'
import { useI18n } from '../lib/i18n'
import { useEpisodeActions } from './EpisodeActions'
import { MODULE_ILLUSTRATIONS } from '../data/moduleIllustrations'
import type { ViewKey } from '../types'

export function ModuleIllustration({ view }: { view: ViewKey }) {
  const { t } = useI18n()
  const illustration = MODULE_ILLUSTRATIONS[view]
  if (!illustration) return null
  const book = `${t(illustration.book)}${illustration.bookYear ? ` (${illustration.bookYear})` : ''}`
  const scene = t(illustration.scene)
  return (
    <figure className="module-pig" data-module={view}>
      <div className="module-pig-art">
        <img src={illustration.src} alt={t('{book} — {scene}', { book, scene })} width="640" height="420" decoding="async" loading="lazy" />
      </div>
      <figcaption>
        <span>{scene}</span>
        <a href={illustration.source} target="_blank" rel="noreferrer" aria-label={t('Open illustration source: {book}', { book })}>{book} · Holly Hobbie</a>
      </figcaption>
    </figure>
  )
}

export function PageHeader({ kicker, title, copy, actions, view }: { kicker: string; title: string; copy: string; actions?: ReactNode; view?: ViewKey }) {
  return (
    <header className={`page-header${view ? ' page-header--illustrated' : ''}`}>
      <div className="page-header-copy"><div className="section-kicker">{kicker}</div><h1>{title}</h1><p>{copy}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
      {view && <ModuleIllustration view={view} />}
    </header>
  )
}

export function RefreshButton({ showIds, label, secondary = false }: { showIds?: string[]; label?: string; secondary?: boolean }) {
  const { refreshFeeds, refreshProgress } = useWorkspace()
  const { t } = useI18n()
  const run = async () => {
    const result = await refreshFeeds(showIds)
    if (result.failed) toast.warning(t('Refresh complete: {added} episodes added; {failed} feeds failed. See Settings for details.', { added: result.added, failed: result.failed }))
    else toast.success(result.added ? t('Refresh complete: {added} new episodes added to the inbox.', { added: result.added }) : t('Refresh complete. No new episodes.'))
  }
  return <button type="button" className={`btn ${secondary ? 'btn-secondary' : 'btn-primary'}`} onClick={() => void run()} disabled={refreshProgress.active}><RefreshCw size={16} className={refreshProgress.active ? 'spin' : ''} />{refreshProgress.active ? t('Refreshing') : label ? t(label) : t('Refresh RSS')}</button>
}

export function AddManualButton({ secondary = true }: { secondary?: boolean }) {
  const { openManual } = useEpisodeActions()
  const { t } = useI18n()
  return <button type="button" className={`btn ${secondary ? 'btn-secondary' : 'btn-primary'}`} onClick={openManual}><Plus size={16} />{t('Add episode')}</button>
}

export function FeedProgress() {
  const { refreshProgress } = useWorkspace()
  const { t } = useI18n()
  if (!refreshProgress.active) return null
  const percent = refreshProgress.total ? Math.round((refreshProgress.completed / refreshProgress.total) * 100) : 0
  return (
    <div className="feed-progress" role="status" aria-live="polite">
      <div><span>{refreshProgress.recoveryRound && refreshProgress.recoveryRounds ? t('Repair round {round}/{rounds} · Reading {show}', { round: refreshProgress.recoveryRound, rounds: refreshProgress.recoveryRounds, show: refreshProgress.currentShow || t('public feed') }) : t('Reading {show}', { show: refreshProgress.currentShow || t('public feed') })}</span><span>{refreshProgress.completed}/{refreshProgress.total}</span></div>
      <div className="progress-track"><span style={{ transform: `scaleX(${percent / 100})` }} /></div>
      <p>{refreshProgress.recoveryRound ? t('Each round tries direct, custom and backup proxies, the alternate address, and the JSON bridge. Temporary network failures pause briefly before the next round; permanent address or RSS errors stop early.') : t('Feeds are read one by one. Failures never erase existing episodes, and manual entry is always available.')}</p>
    </div>
  )
}
