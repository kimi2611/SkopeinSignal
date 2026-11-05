import { BookOpenCheck, ChevronDown, ChevronUp, Lightbulb, ListChecks, Play } from 'lucide-react'
import { useState } from 'react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useI18n } from '../../lib/i18n'
import { formatTimecode } from '../../lib/transcript'
import { openStudyEpisode, rememberEpisodeTarget, navigateToHash, INSIGHTS_EPISODE_KEY, SPARK_EPISODE_KEY } from '../../lib/studyNavigation'
import { LearningTasks } from './LearningTasks'
import type { Episode } from '../../types'

export function EpisodeDossier({ episode }: { episode: Episode }) {
  const { state } = useWorkspace()
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const session = state.studySessions.find((item) => item.episodeId === episode.id)
  const words = state.vocabulary.filter((item) => item.episodeId === episode.id)
  const notes = state.notes.filter((item) => item.episodeId === episode.id)
  const attempts = state.quizAttempts.filter((item) => item.episodeId === episode.id)
  const sparks = state.sparks.filter((item) => item.episodeId === episode.id)
  const resources = state.resourceReports.filter((item) => item.episodeId === episode.id)
  const understandings = state.understandings.filter((item) => item.episodeId === episode.id)
  const openTasks = state.learningTasks.filter((item) => item.episodeId === episode.id && item.status === 'open')
  const latestAttempt = attempts[0]
  const timed = session?.segments.every((segment) => segment.start !== null && segment.end !== null) && session.segments.length > 0

  return <section className="episode-dossier" aria-labelledby="episode-dossier-title">
    <button type="button" className="dossier-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span><ListChecks size={18} /><strong id="episode-dossier-title">{t('Episode learning record')}</strong></span>
      <span>{t('{count} open next steps', { count: openTasks.length })}{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</span>
    </button>
    {open && <div className="dossier-body">
      <div className="dossier-ledger" aria-label={t('Episode learning summary')}>
        <div><span>{t('PLAYBACK')}</span><strong>{session ? formatTimecode(session.positionSeconds) : '00:00'}</strong><small>{timed ? t('Timeline ready') : t('Reading / untimed')}</small></div>
        <div><span>{t('LANGUAGE')}</span><strong>{words.length}</strong><small>{t('saved words')}</small></div>
        <div><span>{t('UNDERSTANDING')}</span><strong>{understandings.length}</strong><small>{latestAttempt ? t('Latest quiz {score}/100', { score: latestAttempt.score }) : t('{count} notes', { count: notes.length })}</small></div>
        <div><span>{t('IDEAS')}</span><strong>{sparks.length}</strong><small>{t('{count} research reports', { count: resources.length })}</small></div>
      </div>
      <div className="dossier-next">
        <div className="dossier-actions">
          <button type="button" className="btn btn-primary" onClick={() => openStudyEpisode(episode.id, session?.positionSeconds)}><Play size={15} />{t('Continue listening')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { rememberEpisodeTarget(INSIGHTS_EPISODE_KEY, episode.id); navigateToHash('/insights') }}><BookOpenCheck size={15} />{t('Build understanding')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { rememberEpisodeTarget(SPARK_EPISODE_KEY, episode.id); navigateToHash('/sparks') }}><Lightbulb size={15} />{t('Develop an idea')}</button>
        </div>
        <LearningTasks episodeId={episode.id} compact />
      </div>
    </div>}
  </section>
}
