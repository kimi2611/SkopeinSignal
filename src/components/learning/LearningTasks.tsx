import { ArrowRight, Check, RotateCcw, Trash2 } from 'lucide-react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useI18n } from '../../lib/i18n'
import { NOTES_EPISODE_KEY, QUIZ_EPISODE_KEY, SPARK_EPISODE_KEY, navigateToHash, openStudyEpisode, rememberEpisodeTarget } from '../../lib/studyNavigation'
import type { LearningTask } from '../../types'

export function LearningTasks({ episodeId, compact = false }: { episodeId?: string; compact?: boolean }) {
  const { state, setLearningTaskDone, removeLearningTask } = useWorkspace()
  const { t } = useI18n()
  const tasks = state.learningTasks
    .filter((task) => !episodeId || task.episodeId === episodeId)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.updatedAt.localeCompare(a.updatedAt))
  const kindLabels: Record<LearningTask['kind'], string> = {
    replay: t('REPLAY'),
    retest: t('RETEST'),
    spark: t('SPARK'),
    note: t('NOTE'),
  }

  const openTask = (task: LearningTask) => {
    if (task.kind === 'replay') {
      openStudyEpisode(task.episodeId, task.startSeconds ?? undefined)
      return
    }
    const target = task.kind === 'retest' ? QUIZ_EPISODE_KEY : task.kind === 'spark' ? SPARK_EPISODE_KEY : NOTES_EPISODE_KEY
    rememberEpisodeTarget(target, task.episodeId)
    navigateToHash(task.kind === 'retest' ? '/quiz' : task.kind === 'spark' ? '/sparks' : '/notes')
  }

  if (!tasks.length) return <p className="learning-empty">{t('No follow-up tasks yet. Quiz and IELTS feedback can be turned into replay, note, idea, or retest tasks.')}</p>

  return <div className={`learning-task-list ${compact ? 'is-compact' : ''}`}>
    {tasks.map((task) => {
      const episode = state.episodes.find((item) => item.id === task.episodeId)
      return <article className={`learning-task ${task.status === 'done' ? 'is-done' : ''}`} key={task.id}>
        <button type="button" className="learning-task-open" onClick={() => openTask(task)}>
          <span>{kindLabels[task.kind]}</span>
          <strong>{task.title}</strong>
          {!compact && <small>{episode?.title ?? t('Episode no longer in workspace')}</small>}
          {!compact && task.detail && <p>{task.detail}</p>}
        </button>
        <div className="learning-task-actions">
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setLearningTaskDone(task.id, task.status !== 'done')} aria-label={task.status === 'done' ? t('Reopen task') : t('Mark task done')} title={task.status === 'done' ? t('Reopen task') : t('Mark task done')}>{task.status === 'done' ? <RotateCcw size={16} /> : <Check size={17} />}</button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => { if (window.confirm(t('Delete this follow-up task?'))) removeLearningTask(task.id) }} aria-label={t('Delete task')}><Trash2 size={15} /></button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => openTask(task)} aria-label={t('Open task')}><ArrowRight size={17} /></button>
        </div>
      </article>
    })}
  </div>
}
