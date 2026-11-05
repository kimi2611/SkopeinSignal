import { useMemo, useState } from 'react'
import { BookOpenCheck, Loader2, Mic, MessageCircleQuestion, Scale, Send, ShieldCheck, Square } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '../../providers/trpc'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useSpeechInput } from '../../hooks/useSpeechInput'
import { uid } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import type { IdeaEvolution, IdeaStage, PodcastShow, Spark } from '../../types'

interface IdeaEvolutionPanelProps {
  spark: Spark
  show?: PodcastShow
  onOpenResources: (sparkId: string) => void
}

type DefenseDraft = {
  challenge: string
  defensePrompt: string
  evidenceNeeded: string[]
  counterargument: string
}

export function IdeaEvolutionPanel({ spark, show, onOpenResources }: IdeaEvolutionPanelProps) {
  const { state, saveIdeaEvolution } = useWorkspace()
  const { t, locale } = useI18n()
  const evolution = state.ideaEvolutions.find((item) => item.sparkId === spark.id) ?? null
  const [revision, setRevision] = useState('')
  const [defenseDraft, setDefenseDraft] = useState<DefenseDraft | null>(null)
  const [defense, setDefense] = useState('')
  const defend = trpc.sparks.defend.useMutation()
  const language = show?.language ?? (locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English')
  const speechLang = language === 'Chinese' ? 'zh-CN' : language === 'Deutsch' ? 'de-DE' : 'en-US'
  const dictation = useSpeechInput(speechLang, (combined) => setDefense(combined.slice(0, 4000)), () => defense)

  const baseEvolution = useMemo((): IdeaEvolution => evolution ?? {
    id: uid('evolution'),
    sparkId: spark.id,
    episodeId: spark.episodeId,
    title: spark.text.slice(0, 90),
    stages: [{ id: uid('stage'), kind: 'origin', text: spark.text, sourceId: spark.id, createdAt: spark.createdAt }],
    createdAt: spark.createdAt,
    updatedAt: spark.createdAt,
  }, [evolution, spark])

  const stageLabels: Record<IdeaStage['kind'], string> = {
    origin: t('ORIGINAL IDEA'),
    'ai-question': t('AI QUESTION'),
    research: t('RESEARCH'),
    revision: t('REVISION / CURRENT CLAIM'),
    defense: t('SELF-DEFENSE'),
  }
  const orderedStages = [...baseEvolution.stages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const latestRevision = [...orderedStages].reverse().find((stage) => stage.kind === 'revision')
  const currentClaim = latestRevision?.text ?? spark.text
  const supports = [spark.reply?.evaluation, ...(spark.reply?.strengths ?? [])].filter((item): item is string => !!item)
  const unknowns = [...(defenseDraft?.evidenceNeeded ?? []), ...(spark.reply?.suggestions ?? [])].filter((item): item is string => !!item)
  const counterpoints = [defenseDraft?.counterargument, spark.reply?.followUp].filter((item): item is string => !!item)

  const saveStage = (kind: IdeaStage['kind'], textValue: string, title?: string) => {
    const clean = textValue.trim()
    if (!clean) return
    const now = new Date().toISOString()
    saveIdeaEvolution({
      ...baseEvolution,
      title: title?.trim() || baseEvolution.title,
      stages: [...baseEvolution.stages, { id: uid('stage'), kind, text: clean, sourceId: null, createdAt: now }],
      updatedAt: now,
    })
  }

  const saveRevision = (makeCurrentClaim: boolean) => {
    const clean = revision.trim()
    if (!clean) return
    saveStage('revision', clean, makeCurrentClaim ? clean.slice(0, 90) : undefined)
    setRevision('')
    toast.success(makeCurrentClaim ? t('Current claim updated in the idea evolution record.') : t('Revision added to the idea evolution record.'))
  }

  const requestDefense = async () => {
    if (defend.isPending) return
    try {
      const result = await defend.mutateAsync({
        language,
        spark: currentClaim,
        episodeTitle: spark.episodeId ? state.episodes.find((item) => item.id === spark.episodeId)?.title : undefined,
        evolution: orderedStages.slice(-30).map((stage) => ({ kind: stage.kind, text: stage.text })),
      })
      setDefenseDraft(result)
      saveStage('ai-question', [result.challenge, result.defensePrompt, ...result.evidenceNeeded, result.counterargument].filter(Boolean).join('\n'))
      toast.success(t('Self-defense challenge added. Answer it in your own words.'))
    } catch {
      toast.error(t('The self-defense request failed. Nothing was retried automatically.'))
    }
  }

  const saveDefense = () => {
    const clean = defense.trim()
    if (!clean) return
    saveStage('defense', clean)
    setDefense('')
    toast.success(t('Your spoken or written defense was added to the idea evolution record.'))
  }

  return <section className="idea-evolution" aria-labelledby={`idea-evolution-${spark.id}`}>
    <div className="idea-evolution-heading">
      <div><span className="section-index">{t('IDEA EVOLUTION / CLAIM UNDER PRESSURE')}</span><h3 id={`idea-evolution-${spark.id}`}>{baseEvolution.title}</h3></div>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpenResources(spark.id)}><BookOpenCheck size={15} />{t('Compare with research')}</button>
    </div>

    <div className="idea-current-claim">
      <span>{t('Current claim')}</span>
      <p>{currentClaim}</p>
    </div>

    <ol className="idea-stage-list">
      {orderedStages.map((stage) => <li key={stage.id} className={`idea-stage idea-stage-${stage.kind}`}>
        <span>{stageLabels[stage.kind]}</span>
        <p>{stage.text}</p>
        <small>{new Date(stage.createdAt).toLocaleString(locale === 'en' ? 'en-US' : locale)}</small>
      </li>)}
    </ol>

    <div className="idea-evidence-board">
      <section><em>{t('Support already recorded')}</em>{supports.length ? <ul>{supports.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('No supporting note has been recorded yet.')}</p>}</section>
      <section><em>{t('Counterpoints')}</em>{counterpoints.length ? <ul>{counterpoints.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('Ask for a self-defense challenge to surface a counterargument.')}</p>}</section>
      <section><em>{t('Unknown or still to verify')}</em>{unknowns.length ? <ul>{unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('No verification gap has been recorded yet.')}</p>}</section>
    </div>

    <div className="idea-revision-box">
      <label className="form-stack"><span className="field-label">{t('Revise the idea in your own words')}</span><textarea className="field textarea" rows={4} maxLength={4000} value={revision} onChange={(event) => setRevision(event.target.value)} placeholder={t('State what changed after feedback or research…')} /></label>
      <div><button type="button" className="btn btn-secondary" disabled={!revision.trim()} onClick={() => saveRevision(false)}>{t('Record revision')}</button><button type="button" className="btn btn-primary" disabled={!revision.trim()} onClick={() => saveRevision(true)}><ShieldCheck size={15} />{t('Make this the current claim')}</button></div>
    </div>

    <div className="idea-defense-box">
      <div><span className="section-index">{t('SPOKEN DEFENSE')}</span><h4>{t('Answer the strongest challenge aloud or in writing')}</h4></div>
      <button type="button" className="btn btn-secondary" disabled={defend.isPending} onClick={() => void requestDefense()}>{defend.isPending ? <><Loader2 size={15} className="spin" />{t('Preparing challenge…')}</> : <><MessageCircleQuestion size={15} />{t('Ask AI for a challenge')}</>}</button>
      {defenseDraft && <div className="idea-defense-challenge"><strong>{defenseDraft.challenge}</strong><p>{defenseDraft.defensePrompt}</p><small><Scale size={13} />{defenseDraft.evidenceNeeded.join(' · ')}</small></div>}
      <label className="form-stack"><span className="field-label">{t('Your defense')}</span><textarea className="field textarea" rows={4} maxLength={4000} value={defense} onChange={(event) => setDefense(event.target.value)} placeholder={t('Defend the revised claim. Name evidence, limits, and what would change your mind…')} /></label>
      <div className="idea-defense-actions">{dictation.supported && <button type="button" className={`btn ${dictation.listening ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dictation.listening ? dictation.stop() : dictation.start()}>{dictation.listening ? <><Square size={14} />{t('Stop recording')}</> : <><Mic size={14} />{t('Dictate defense')}</>}</button>}<button type="button" className="btn btn-primary" disabled={!defense.trim()} onClick={saveDefense}><Send size={14} />{t('Save defense')}</button></div>
    </div>
  </section>
}
