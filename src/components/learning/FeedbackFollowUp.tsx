import { BookOpenCheck, Lightbulb, ListChecks, NotebookPen, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useI18n } from '../../lib/i18n'
import { uid } from '../../lib/format'
import { bestMatchingSegmentStart } from '../../lib/feedbackMatch'
import type { LearningTask } from '../../types'

interface FeedbackFollowUpProps {
  episodeId: string
  sourceId: string
  feedback: string
  sourceText: string
  startSeconds?: number | null
}

export function FeedbackFollowUp({ episodeId, sourceId, feedback, sourceText, startSeconds }: FeedbackFollowUpProps) {
  const { state, saveLearningTask } = useWorkspace()
  const { t } = useI18n()
  const session = state.studySessions.find((item) => item.episodeId === episodeId)
  const matchedStart = startSeconds === undefined ? bestMatchingSegmentStart(session?.segments ?? [], sourceText) : startSeconds

  const create = (kind: LearningTask['kind']) => {
    const duplicate = state.learningTasks.find((task) => task.sourceId === sourceId && task.kind === kind && task.status === 'open')
    if (duplicate) {
      toast.message(t('This follow-up is already in the episode learning record.'))
      return
    }
    const now = new Date().toISOString()
    const titles: Record<LearningTask['kind'], string> = {
      replay: t('Replay the transcript behind this misunderstanding'),
      note: t('Rewrite the argument in Notes'),
      spark: t('Develop the new idea from this feedback'),
      retest: t('Retest this material after revision'),
    }
    const task: LearningTask = {
      id: uid('learning-task'),
      episodeId,
      kind,
      title: titles[kind],
      detail: feedback.trim().slice(0, 5000),
      sourceId,
      startSeconds: kind === 'replay' ? matchedStart : null,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
    saveLearningTask(task)
    toast.success(t('Follow-up added to the episode learning record. Your review intervals were not changed.'))
  }

  return <section className="feedback-follow-up" aria-labelledby={`follow-up-${sourceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>
    <div><span className="section-index">{t('ERROR → LEARNING / YOUR CHOICE')}</span><h3 id={`follow-up-${sourceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>{t('Turn this feedback into a concrete next step')}</h3><p>{t('Nothing is scheduled automatically. Choose an action; you can complete, reopen, or delete it in the episode learning record.')}</p></div>
    <div className="feedback-follow-up-actions">
      <button type="button" className="btn btn-secondary" onClick={() => create('replay')}><RotateCcw size={15} />{t('Replay related passage')}</button>
      <button type="button" className="btn btn-secondary" onClick={() => create('note')}><NotebookPen size={15} />{t('Create rewrite task')}</button>
      <button type="button" className="btn btn-secondary" onClick={() => create('spark')}><Lightbulb size={15} />{t('Develop a new idea')}</button>
      <button type="button" className="btn btn-secondary" onClick={() => create('retest')}><ListChecks size={15} />{t('Add a later retest')}</button>
    </div>
    {matchedStart === null && <small><BookOpenCheck size={13} />{t('No reliable transcript match was found for this paraphrased feedback. Replay opens the episode without claiming a precise source timestamp.')}</small>}
  </section>
}
