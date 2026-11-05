import { ArrowRight, Check, Download, FileInput, FileText, Lightbulb, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useI18n } from '../../lib/i18n'
import { buildWritingDraft } from '../../lib/summaryOutput'
import { openInsightsEpisode, openNotesWriter, openStudySetup, openStudyTab } from '../../lib/studyNavigation'

export type WorkflowStage = 'material' | 'transcript' | 'summary' | 'draft' | 'export'

export function WorkflowJourney({ episodeId, current }: { episodeId: string; current: WorkflowStage }) {
  const { state } = useWorkspace()
  const { t } = useI18n()
  const episode = state.episodes.find((item) => item.id === episodeId)
  const session = state.studySessions.find((item) => item.episodeId === episodeId)
  const summary = state.summaries.find((item) => item.episodeId === episodeId)
  const notes = state.notes.filter((item) => item.episodeId === episodeId)
  if (!episode) return null

  const ready: Record<WorkflowStage, boolean> = {
    material: true,
    transcript: Boolean(session?.segments.length),
    summary: Boolean(summary),
    draft: notes.length > 0,
    export: Boolean(session?.handoffExportedAt),
  }
  const steps = [
    { key: 'material' as const, label: t('Material'), icon: FileInput },
    { key: 'transcript' as const, label: t('Transcript'), icon: FileText },
    { key: 'summary' as const, label: t('Summary'), icon: Lightbulb },
    { key: 'draft' as const, label: t('Draft'), icon: NotebookPen },
    { key: 'export' as const, label: t('Export'), icon: Download },
  ]
  const nextStage: WorkflowStage | null = !ready.transcript ? 'transcript' : !ready.summary ? 'summary' : !ready.draft ? 'draft' : !ready.export ? 'export' : null
  const nextLabels: Record<WorkflowStage, string> = {
    material: t('Next: choose source material'),
    transcript: t('Next: import or paste a transcript'),
    summary: t('Next: create or import a summary'),
    draft: t('Next: continue writing from the summary'),
    export: t('Next: compose and export the finished document'),
  }

  const go = (stage: WorkflowStage) => {
    if (stage === 'material') {
      if (session) openStudyTab(episodeId, 'transcript')
      else openStudySetup(episodeId)
      return
    }
    if (stage === 'transcript') {
      if (ready.transcript) openStudyTab(episodeId, 'transcript')
      else openStudySetup(episodeId)
      return
    }
    if (stage === 'summary') { openInsightsEpisode(episodeId, 'summary'); return }
    if (stage === 'draft') {
      const body = summary ? buildWritingDraft(episode, summary, session) : ''
      if (!openNotesWriter(episodeId, body)) toast.error(t('The browser could not stage the draft. Your summary is unchanged; copy or download it, then paste it into Notes.'))
      return
    }
    openStudyTab(episodeId, 'handoff')
  }

  return <section className="workflow-journey" aria-label={t('Content workflow')}>
    <div className="workflow-journey-heading"><span className="section-index">{t('ONE EPISODE / ONE CONTINUOUS WORKFLOW')}</span><strong>{episode.title}</strong></div>
    <ol className="workflow-steps">
      {steps.map((step, index) => {
        const Icon = step.icon
        return <li key={step.key} className={`${ready[step.key] ? 'is-ready' : ''} ${current === step.key ? 'is-current' : ''}`}>
          <button type="button" onClick={() => go(step.key)} aria-current={current === step.key ? 'step' : undefined} aria-label={t('{number}. {label} — {status}', { number: index + 1, label: step.label, status: ready[step.key] ? t('ready') : t('not yet') })}>
            <span className="workflow-step-index">{ready[step.key] ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span>
            <Icon size={15} /><span>{step.label}</span><small>{ready[step.key] ? t('Ready') : t('Not yet')}</small>
          </button>
        </li>
      })}
    </ol>
    <div className="workflow-next">
      <p>{nextStage ? t('Your existing content stays in place when you move between steps.') : t('Every step has content. Reopen any step to revise it or export again.')}</p>
      {nextStage ? <button type="button" className="btn btn-secondary btn-small" onClick={() => go(nextStage)}>{nextLabels[nextStage]}<ArrowRight size={15} /></button> : <button type="button" className="btn btn-secondary btn-small" onClick={() => go('export')}>{t('Open finished-document export')}<ArrowRight size={15} /></button>}
    </div>
  </section>
}
