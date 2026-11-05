import { ArrowRight, ListChecks } from 'lucide-react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useI18n } from '../../lib/i18n'
import { formatTimecode } from '../../lib/transcript'
import { openStudyEpisode } from '../../lib/studyNavigation'

export function ContinueLearning() {
  const { state } = useWorkspace()
  const { t } = useI18n()
  const candidates = state.studySessions.map((session) => ({
    session,
    episode: state.episodes.find((episode) => episode.id === session.episodeId),
    taskTime: state.learningTasks.filter((task) => task.episodeId === session.episodeId && task.status === 'open').map((task) => task.updatedAt).sort().at(-1) ?? '',
  })).filter((item) => item.episode).sort((a, b) => {
    const aTime = [a.session.updatedAt, a.taskTime].sort().at(-1) ?? ''
    const bTime = [b.session.updatedAt, b.taskTime].sort().at(-1) ?? ''
    return bTime.localeCompare(aTime)
  })
  const latest = candidates[0]
  if (!latest?.episode) return null
  const openTasks = state.learningTasks.filter((task) => task.episodeId === latest.episode?.id && task.status === 'open').length
  return <section className="continue-learning" aria-labelledby="continue-learning-title">
    <div><span className="section-index">{t('CONTINUE / ONE EPISODE, EVERY THREAD')}</span><h2 id="continue-learning-title">{latest.episode.title}</h2><p>{t('Resume at {time} · {tasks} open next steps', { time: formatTimecode(latest.session.positionSeconds), tasks: openTasks })}</p></div>
    <button type="button" className="btn btn-primary" onClick={() => openStudyEpisode(latest.episode!.id, latest.session.positionSeconds)}><ListChecks size={16} />{t('Open learning record')}<ArrowRight size={15} /></button>
  </section>
}
