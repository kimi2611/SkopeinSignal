import { useMemo, useState } from 'react'
import { GitBranch, Lightbulb, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { uid } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { IdeaEvolutionPanel } from './IdeaEvolutionPanel'

interface IdeaEvolutionStudioProps {
  onOpenResources: (sparkId: string) => void
}

export function IdeaEvolutionStudio({ onOpenResources }: IdeaEvolutionStudioProps) {
  const { state, saveSpark } = useWorkspace()
  const { t } = useI18n()
  const orderedSparkIds = useMemo(() => {
    const updatedAt = new Map(state.ideaEvolutions.map((evolution) => [evolution.sparkId, evolution.updatedAt]))
    return [...state.sparks]
      .sort((left, right) => (updatedAt.get(right.id) ?? right.createdAt).localeCompare(updatedAt.get(left.id) ?? left.createdAt))
      .map((spark) => spark.id)
  }, [state.sparks, state.ideaEvolutions])
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(!state.sparks.length)
  const [idea, setIdea] = useState('')
  const activeId = orderedSparkIds.includes(selectedId) ? selectedId : orderedSparkIds[0] ?? ''
  const spark = state.sparks.find((item) => item.id === activeId) ?? null
  const show = spark?.episodeId ? state.shows.find((item) => item.id === state.episodes.find((episode) => episode.id === spark.episodeId)?.showId) : undefined

  const createIdea = () => {
    const text = idea.trim()
    if (!text) return
    const now = new Date().toISOString()
    const id = uid('spark')
    saveSpark({ id, episodeId: null, text, reply: null, createdAt: now })
    setSelectedId(id)
    setIdea('')
    setCreating(false)
    toast.success(t('Original idea saved. Its evolution timeline is ready below.'))
  }

  return <div className="idea-evolution-studio">
    <section className="panel idea-evolution-overview">
      <div className="idea-evolution-overview-heading">
        <GitBranch size={24} />
        <div><span className="section-index">{t('IDEA EVOLUTION / YOUR THINKING OVER TIME')}</span><h2>{t('See how an idea changes under pressure.')}</h2><p>{t('Start with your own claim—no AI feedback required. Keep the original intact, then add research, revisions, challenges, and your spoken or written defense as separate dated stages.')}</p></div>
        <button type="button" className="btn btn-secondary" onClick={() => setCreating((current) => !current)} aria-expanded={creating}><Plus size={16} />{t('Start a new idea')}</button>
      </div>

      {creating && <div className="idea-origin-composer">
        <label className="form-stack"><span className="field-label">{t('Original idea')}</span><textarea className="field textarea" rows={5} maxLength={1500} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder={t('Write the claim you want to test, revise, and defend…')} /></label>
        <div><small>{t('This creates a local original stage only. It does not call AI or replace an existing idea.')}</small><button type="button" className="btn btn-primary" disabled={!idea.trim()} onClick={createIdea}><Lightbulb size={16} />{t('Create evolution timeline')}</button></div>
      </div>}

      {!!state.sparks.length && <label className="idea-evolution-picker"><span className="field-label">{t('Idea to evolve')}</span><select className="field" value={activeId} onChange={(event) => { setSelectedId(event.target.value); setCreating(false) }}>{orderedSparkIds.map((id) => {
        const item = state.sparks.find((candidate) => candidate.id === id)
        const evolution = state.ideaEvolutions.find((candidate) => candidate.sparkId === id)
        return item && <option key={id} value={id}>{item.text.slice(0, 120)} · {t('{count} stages', { count: evolution?.stages.length ?? 1 })}</option>
      })}</select></label>}

      {!spark && !creating && <div className="empty-state"><GitBranch size={28} /><h3>{t('No idea timeline yet')}</h3><p>{t('Choose Start a new idea to create the original stage. Existing saved sparks will also appear here automatically.')}</p></div>}
    </section>

    {spark && <section className="panel idea-evolution-detail" aria-label={t('Selected idea evolution')}>
      <IdeaEvolutionPanel key={spark.id} spark={spark} show={show} onOpenResources={onOpenResources} />
    </section>}
  </div>
}
