import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Award, BookOpenCheck, Clock3, FileInput, GraduationCap, Loader2, Mic, Sparkles, Square, UserRound } from 'lucide-react'
import { trpc } from '../providers/trpc'
import { FeedbackFollowUp } from './learning/FeedbackFollowUp'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { useI18n } from '../lib/i18n'
import { transcriptToText } from '../lib/transcript'
import type { KimiSummary, ViewKey } from '../types'

type Material = Pick<KimiSummary, 'theme' | 'coreArguments' | 'evidence' | 'expertPerspectives'>
type Source = 'saved' | 'snipd' | 'ai'
type Phase = 'setup' | 'answer' | 'results'
type TimingMode = 'exam' | 'practice'
type SpeakingQuestion = { id: string; part: 1 | 2 | 3; prompt: string; referenceNotes: string }
type WritingTask = { prompt: string; context: string; minimumWords: number; suggestedMinutes: number }
type SpeakingResult = {
  overallBand: number
  fluencyCoherence: number
  lexicalResource: number
  grammaticalRangeAccuracy: number
  pronunciationNote: string
  questionFeedback: Array<{ questionId: string; feedback: string }>
  nextSteps: string[]
}
type WritingResult = {
  overallBand: number
  taskResponse: number
  coherenceCohesion: number
  lexicalResource: number
  grammaticalRangeAccuracy: number
  generalFeedback: string
  nextSteps: string[]
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/AI_[A-Z_]+|UNAUTHORIZED/)?.[0] ?? 'AI_UNKNOWN'
}

function speakingAnswerSeconds(part: 1 | 2 | 3): number {
  if (part === 1) return 30
  if (part === 2) return 120
  return 60
}

export function IeltsWorkshop({ kind, onNavigate }: { kind: 'speaking' | 'writing'; onNavigate: (view: ViewKey) => void }) {
  const { state, saveKimiSummary } = useWorkspace()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { t } = useI18n()
  const [episodeId, setEpisodeId] = useState('')
  const [source, setSource] = useState<Source>('ai')
  const [snipdText, setSnipdText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [material, setMaterial] = useState<Material | null>(null)
  const [questions, setQuestions] = useState<SpeakingQuestion[]>([])
  const [task, setTask] = useState<WritingTask | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [essay, setEssay] = useState('')
  const [speakingResult, setSpeakingResult] = useState<SpeakingResult | null>(null)
  const [writingResult, setWritingResult] = useState<WritingResult | null>(null)
  const [error, setError] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [timingMode, setTimingMode] = useState<TimingMode>('exam')
  const [secondsLeft, setSecondsLeft] = useState(2400)
  const [speakingTimeLeft, setSpeakingTimeLeft] = useState<Record<string, number>>({})
  const [timedOutQuestion, setTimedOutQuestion] = useState('')
  const activeQuestionRef = useRef('')
  const stopAnswerRef = useRef<() => void>(() => {})

  const generateSpeaking = trpc.ielts.generateSpeaking.useMutation()
  const generateWriting = trpc.ielts.generateWriting.useMutation()
  const gradeSpeaking = trpc.ielts.gradeSpeaking.useMutation()
  const gradeWriting = trpc.ielts.gradeWriting.useMutation()
  const generating = kind === 'speaking' ? generateSpeaking.isPending : generateWriting.isPending
  const grading = kind === 'speaking' ? gradeSpeaking.isPending : gradeWriting.isPending

  const episodeOptions = useMemo(() => state.episodes.filter((episode) => {
    const hasTranscript = state.studySessions.some((session) => session.episodeId === episode.id && session.segments.length > 0)
    const hasSummary = state.summaries.some((summary) => summary.episodeId === episode.id)
    return hasTranscript || hasSummary
  }).sort((a, b) => (b.listenedAt ?? b.addedAt).localeCompare(a.listenedAt ?? a.addedAt)), [state.episodes, state.studySessions, state.summaries])

  const episode = episodeOptions.find((item) => item.id === episodeId) ?? episodeOptions[0]
  const show = state.shows.find((item) => item.id === episode?.showId)
  const session = state.studySessions.find((item) => item.episodeId === episode?.id)
  const savedSummary = state.summaries.find((item) => item.episodeId === episode?.id)
  const excerpt = session?.segments.length ? transcriptToText(session.segments).slice(0, 8000) : ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSource(savedSummary ? 'saved' : excerpt.length >= 200 ? 'ai' : 'snipd')
      setPhase('setup')
      setMaterial(null)
      setQuestions([])
      setTask(null)
      setAnswers({})
      setSpeakingTimeLeft({})
      setTimedOutQuestion('')
      setActiveQuestion('')
      activeQuestionRef.current = ''
      setEssay('')
      setSpeakingResult(null)
      setWritingResult(null)
      setError('')
    }, 0)
    return () => window.clearTimeout(timer)
    // Material selection intentionally resets only when the episode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id])

  useEffect(() => {
    if (kind !== 'writing' || phase !== 'answer' || timingMode !== 'exam') return
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [kind, phase, timingMode])

  const dictation = useSpeechInput('en-US', (combined) => {
    const id = activeQuestionRef.current
    if (id) setAnswers((current) => ({ ...current, [id]: combined.slice(0, 4000) }))
  }, () => answers[activeQuestionRef.current] ?? '')

  const startAnswer = (id: string) => {
    const question = questions.find((item) => item.id === id)
    if (!question || timingMode === 'exam' && speakingTimeLeft[id] === 0) return
    activeQuestionRef.current = id
    setActiveQuestion(id)
    setTimedOutQuestion('')
    setSpeakingTimeLeft((current) => current[id] === undefined
      ? { ...current, [id]: speakingAnswerSeconds(question.part) }
      : current)
    dictation.start()
  }
  const stopAnswer = () => {
    dictation.stop()
    setActiveQuestion('')
    activeQuestionRef.current = ''
  }
  stopAnswerRef.current = stopAnswer

  useEffect(() => {
    if (kind !== 'speaking' || phase !== 'answer' || timingMode !== 'exam' || !activeQuestion || !dictation.listening) return
    const timer = window.setInterval(() => {
      setSpeakingTimeLeft((current) => {
        const remaining = current[activeQuestion]
        if (remaining === undefined) return current
        return { ...current, [activeQuestion]: Math.max(0, remaining - 1) }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [kind, phase, timingMode, activeQuestion, dictation.listening])

  useEffect(() => {
    if (kind !== 'speaking' || phase !== 'answer' || timingMode !== 'exam' || !activeQuestion || !dictation.listening || speakingTimeLeft[activeQuestion] !== 0) return
    setTimedOutQuestion(activeQuestion)
    stopAnswerRef.current()
  }, [kind, phase, timingMode, activeQuestion, dictation.listening, speakingTimeLeft])

  const clearSpeakingAnswer = (id: string) => {
    if (activeQuestionRef.current === id) stopAnswer()
    setAnswers((current) => ({ ...current, [id]: '' }))
    setSpeakingTimeLeft((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setTimedOutQuestion((current) => current === id ? '' : current)
  }

  const generate = async () => {
    if (!episode || !show || generating) return
    setError('')
    const input = {
      episodeTitle: episode.title,
      showName: show.name,
      source,
      excerpt: source === 'ai' ? excerpt : undefined,
      snipdText: source === 'snipd' ? snipdText.trim() : undefined,
      instruction: source === 'ai' && instruction.trim() ? instruction.trim() : undefined,
      savedMaterial: source === 'saved' && savedSummary ? {
        theme: savedSummary.theme,
        coreArguments: savedSummary.coreArguments,
        evidence: savedSummary.evidence,
        expertPerspectives: savedSummary.expertPerspectives,
      } : undefined,
    }
    try {
      if (kind === 'speaking') {
        const result = await generateSpeaking.mutateAsync(input)
        setMaterial(result.material)
        setQuestions(result.questions)
        setTask(null)
        if (source !== 'saved') saveKimiSummary({ ...result.material, episodeId: episode.id, source, importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      } else {
        const result = await generateWriting.mutateAsync(input)
        setMaterial(result.material)
        setTask(result.task)
        setQuestions([])
        setSecondsLeft(result.task.suggestedMinutes * 60)
        if (source !== 'saved') saveKimiSummary({ ...result.material, episodeId: episode.id, source, importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      }
      setAnswers({})
      setSpeakingTimeLeft({})
      setTimedOutQuestion('')
      setActiveQuestion('')
      activeQuestionRef.current = ''
      setEssay('')
      setSpeakingResult(null)
      setWritingResult(null)
      setPhase('answer')
    } catch (reason) {
      setError(errorCode(reason))
    }
  }

  const grade = async () => {
    if (!episode || grading) return
    stopAnswer()
    setError('')
    try {
      if (kind === 'speaking') {
        const result = await gradeSpeaking.mutateAsync({
          episodeTitle: episode.title,
          questions,
          answers: questions.map((question) => ({ questionId: question.id, answer: (answers[question.id] ?? '').trim() })),
        })
        setSpeakingResult(result)
      } else if (task) {
        const result = await gradeWriting.mutateAsync({ episodeTitle: episode.title, task: { prompt: task.prompt, context: task.context }, answer: essay.trim() })
        setWritingResult(result)
      }
      setPhase('results')
    } catch (reason) {
      setError(errorCode(reason))
    }
  }

  const errorCopy: Record<string, string> = {
    AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted. Top it up in Kimi before using IELTS practice.'),
    AI_CONTENT_REJECTED: t('The AI declined this material. Try different notes or a shorter transcript excerpt.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
    AI_TRANSIENT: t('The AI service is busy. Nothing was retried automatically; start the request again when ready.'),
    AI_EMPTY_RESULT: t('The AI returned an incomplete paper. Generate it again before answering.'),
    UNAUTHORIZED: t('Sign in to use IELTS practice.'),
    AI_UNKNOWN: t('The request failed. Nothing was retried automatically; try again when ready.'),
  }

  if (!authLoading && !isAuthenticated) {
    return <section className="panel ielts-gate"><UserRound size={22} /><h2>{t('Sign in for IELTS practice')}</h2><p>{t('Paper generation and band feedback use the site owner’s AI quota. Your saved podcast material remains in your workspace.')}</p><button type="button" className="btn btn-primary" onClick={() => onNavigate('account')}>{t('Open My Account')}</button></section>
  }

  const canGenerate = !!episode && (source === 'saved' ? !!savedSummary : source === 'snipd' ? snipdText.trim().length >= 80 : excerpt.length >= 200)
  const answeredCount = questions.filter((question) => (answers[question.id] ?? '').trim()).length
  const wordCount = essay.trim() ? essay.trim().split(/\s+/).length : 0
  const sourceLabels: Record<Source, string> = { saved: t('Saved material'), snipd: t('Import from Snipd'), ai: t('Ask AI to summarise') }
  const bands = kind === 'speaking' && speakingResult ? [
    [t('Fluency & coherence'), speakingResult.fluencyCoherence],
    [t('Lexical resource'), speakingResult.lexicalResource],
    [t('Grammatical range & accuracy'), speakingResult.grammaticalRangeAccuracy],
  ] : kind === 'writing' && writingResult ? [
    [t('Task response'), writingResult.taskResponse],
    [t('Coherence & cohesion'), writingResult.coherenceCohesion],
    [t('Lexical resource'), writingResult.lexicalResource],
    [t('Grammatical range & accuracy'), writingResult.grammaticalRangeAccuracy],
  ] : []
  const followUpSourceId = episode
    ? `ielts-${kind}-${episode.id}-${kind === 'speaking' ? questions.map((question) => question.id).join('-') : task?.prompt.slice(0, 60) ?? 'paper'}`
    : ''
  const followUpFeedback = speakingResult
    ? [...speakingResult.questionFeedback.map((item) => item.feedback), speakingResult.pronunciationNote, ...speakingResult.nextSteps].filter(Boolean).join('\n')
    : writingResult
      ? [writingResult.generalFeedback, ...writingResult.nextSteps].filter(Boolean).join('\n')
      : ''
  const followUpSourceText = [
    material?.theme ?? '',
    ...(material?.coreArguments ?? []),
    ...(kind === 'speaking' ? questions.map((question) => `${question.prompt}\n${question.referenceNotes}\n${answers[question.id] ?? ''}`) : [task ? `${task.context}\n${task.prompt}\n${essay}` : '']),
    followUpFeedback,
  ].filter(Boolean).join('\n')
  const activeSpeakingSeconds = activeQuestion ? speakingTimeLeft[activeQuestion] : undefined
  const timingModeControl = <div className="ielts-timing-control">
    <div className="ielts-timing-tabs" role="group" aria-label={kind === 'writing' ? t('IELTS writing timing mode') : t('IELTS speaking timing mode')}>
      <button type="button" className={timingMode === 'exam' ? 'active' : ''} aria-pressed={timingMode === 'exam'} onClick={() => setTimingMode('exam')}><Clock3 size={15} />{t('Timed exam')}</button>
      <button type="button" className={timingMode === 'practice' ? 'active' : ''} aria-pressed={timingMode === 'practice'} onClick={() => setTimingMode('practice')}><BookOpenCheck size={15} />{t('Untimed practice')}</button>
    </div>
    <p>{kind === 'speaking'
      ? timingMode === 'exam'
        ? t('Speaking exam mode times each recording: 30 seconds for Part 1, 120 seconds for Part 2, and 60 seconds for Part 3. At zero, recording stops and the recognised answer is kept; nothing is submitted automatically.')
        : t('Speaking practice mode has no countdown or automatic stop. Switch at any point without losing questions, recognised answers, or your current progress.')
      : timingMode === 'exam'
        ? t('Standard exam mode keeps the suggested-minute countdown. You can switch to untimed practice at any point without losing the paper or your essay.')
        : t('Practice mode has no countdown and never submits automatically. Keep writing for as long as you need, then request band feedback when ready.')}</p>
  </div>

  return <div className="ielts-workshop">
    {error && <section className="panel ai-degraded" role="alert"><h3>{t('IELTS practice unavailable')}</h3><p>{errorCopy[error] ?? errorCopy.AI_UNKNOWN}</p></section>}

    {phase === 'setup' && <section className="panel ielts-setup">
      <div className="ielts-section-heading"><div><span className="section-index">{t('01 / SOURCE MATERIAL')}</span><h2>{t('Turn one episode into an English exam paper')}</h2></div><span className="ielts-unofficial">{t('Unofficial practice')}</span></div>
      {!episodeOptions.length ? <p className="empty-state">{t('No podcast material is ready yet. Import a transcript in Listen & Read, or create a summary first.')}</p> : <>
        <label className="form-stack"><span className="field-label">{t('Podcast episode')}</span><select className="field" value={episode?.id ?? ''} onChange={(event) => setEpisodeId(event.target.value)}>{episodeOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <div className="ielts-source-tabs" role="tablist" aria-label={t('Material source')}>{(['saved', 'snipd', 'ai'] as Source[]).map((item) => <button key={item} type="button" role="tab" aria-selected={source === item} className={source === item ? 'active' : ''} disabled={item === 'saved' && !savedSummary || item === 'ai' && excerpt.length < 200} onClick={() => setSource(item)}>{item === 'snipd' ? <FileInput size={15} /> : item === 'ai' ? <Sparkles size={15} /> : <BookOpenCheck size={15} />}{sourceLabels[item]}</button>)}</div>
        {source === 'saved' && savedSummary && <div className="ielts-source-note"><strong>{savedSummary.theme}</strong><p>{t('{arguments} core arguments and {evidence} evidence items will ground the paper.', { arguments: savedSummary.coreArguments.length, evidence: savedSummary.evidence.length })}</p></div>}
        {source === 'snipd' && <label className="form-stack"><span className="field-label">{t('Paste Snipd summary or key takeaways')}</span><textarea className="field textarea" rows={7} value={snipdText} onChange={(event) => setSnipdText(event.target.value)} placeholder={t('Paste the episode summary, key takeaways, or exported snips here…')} /><small className="form-hint">{t('This imports text you provide; the site does not access a private Snipd account. The AI structures only these notes into arguments and evidence.')}</small></label>}
        {source === 'ai' && <label className="form-stack"><span className="field-label">{t('Summarising instruction (optional)')}</span><textarea className="field textarea" rows={3} maxLength={600} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t('For example: focus on the strongest counterargument and the evidence that would test it…')} /><small className="form-hint">{t('Up to 8,000 transcript characters are sent to the site’s AI. No audio file is uploaded.')}</small></label>}
        {timingModeControl}
        <button type="button" className="btn btn-primary" disabled={!canGenerate || generating} onClick={() => void generate()}>{generating ? <><Loader2 size={16} className="spin" />{t('Preparing your paper…')}</> : <><GraduationCap size={16} />{kind === 'speaking' ? t('Generate Speaking Parts 1–3') : t('Generate Writing Task 2')}</>}</button>
      </>}
    </section>}

    {phase !== 'setup' && episode && <section className="panel ielts-paper">
      <button type="button" className="text-link ielts-back" onClick={() => { stopAnswer(); setPhase('setup') }}><ArrowLeft size={14} />{t('Change material or paper')}</button>
      {phase === 'answer' && timingModeControl}
      <div className="ielts-section-heading"><div><span className="section-index">{kind === 'speaking' ? t('02 / SPEAKING PAPER') : t('02 / WRITING PAPER')}</span><h2>{episode.title}</h2></div>{phase === 'answer' && (timingMode === 'practice' ? <span className="ielts-practice-badge"><BookOpenCheck size={16} />{t('Untimed practice mode')}</span> : kind === 'writing' ? <span className={`ielts-timer ${secondsLeft === 0 ? 'is-over' : ''}`}><Clock3 size={16} />{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span> : activeSpeakingSeconds !== undefined ? <span className={`ielts-timer ${activeSpeakingSeconds === 0 ? 'is-over' : ''}`}><Clock3 size={16} />{Math.floor(activeSpeakingSeconds / 60)}:{String(activeSpeakingSeconds % 60).padStart(2, '0')}</span> : <span className="ielts-practice-badge"><Clock3 size={16} />{t('Per-answer exam timing')}</span>)}</div>
      {material && <details className="ielts-material"><summary>{t('Inspect the arguments behind this paper')}</summary><div><strong>{material.theme}</strong><ul>{material.coreArguments.map((item) => <li key={item}>{item}</li>)}</ul>{!!material.evidence.length && <><em>{t('Evidence')}</em><ul>{material.evidence.map((item) => <li key={item}>{item}</li>)}</ul></>}</div></details>}

      {kind === 'speaking' && <ol className="ielts-speaking-list">{questions.map((question) => {
        const feedback = speakingResult?.questionFeedback.find((item) => item.questionId === question.id)
        const isRecording = dictation.listening && activeQuestion === question.id
        return <li key={question.id} className="ielts-speaking-question">
          <span className="ielts-part">{t('Part {part}', { part: question.part })}</span>
          <p>{question.prompt}</p>
          {phase === 'answer' && <div className="ielts-speaking-answer">
            <textarea readOnly rows={question.part === 2 ? 5 : 3} value={answers[question.id] ?? ''} aria-label={t('Spoken answer for Part {part}', { part: question.part })} placeholder={t('Answer aloud; your speech transcript appears here…')} />
            <small className="ielts-speaking-timing">{timingMode === 'exam'
              ? t('Exam answer limit: {seconds} seconds. The countdown runs only while recording.', { seconds: speakingAnswerSeconds(question.part) })
              : t('No time limit. Stop recording yourself when you are ready.')}</small>
            {dictation.supported ? <div>
              <button type="button" className={`btn ${isRecording ? 'btn-primary' : 'btn-secondary'}`} disabled={timingMode === 'exam' && speakingTimeLeft[question.id] === 0} onClick={() => isRecording ? stopAnswer() : startAnswer(question.id)}>{isRecording ? <><Square size={14} />{t('Stop recording')}</> : <><Mic size={14} />{question.part === 2 ? t('Speak for 1–2 minutes') : t('Answer by voice')}</>}</button>
              {(answers[question.id] ?? '').trim() && <button type="button" className="text-link" onClick={() => clearSpeakingAnswer(question.id)}>{t('Clear and answer again')}</button>}
            </div> : <small>{t('This browser has no speech recognition. Open Chrome, Edge, or Safari on iPad for the speaking paper.')}</small>}
            {timedOutQuestion === question.id && <small role="status" className="ielts-speaking-timeout">{t('Time is up. Recording stopped and the recognised answer was kept. Clear and answer again to restart this question.')}</small>}
          </div>}
          {phase === 'results' && <div className="ielts-answer-review"><p><em>{t('Your answer')}</em>{(answers[question.id] ?? '').trim() || t('(no answer)')}</p><p><em>{t('Feedback')}</em>{feedback?.feedback ?? t('No individual feedback was returned.')}</p></div>}
        </li>
      })}</ol>}

      {kind === 'writing' && task && <div className="ielts-writing-task"><div className="ielts-task-brief"><span className="section-index">{t('ACADEMIC WRITING / TASK 2')}</span><p>{task.context}</p><h3>{task.prompt}</h3><small>{timingMode === 'practice' ? t('Write at least {words} words. Untimed practice; {minutes} minutes is only the standard exam target.', { words: task.minimumWords, minutes: task.suggestedMinutes }) : t('Write at least {words} words. Suggested time: {minutes} minutes.', { words: task.minimumWords, minutes: task.suggestedMinutes })}</small></div>{phase === 'answer' ? <label className="form-stack"><span className="field-label">{t('Your essay')}</span><textarea className="field textarea ielts-essay" rows={18} value={essay} onChange={(event) => setEssay(event.target.value)} placeholder={t('Present a clear position and develop it with reasons and examples…')} /><span className="ielts-word-count">{t('{count} words', { count: wordCount })}{wordCount < task.minimumWords ? ` · ${t('{remaining} to minimum', { remaining: task.minimumWords - wordCount })}` : ` · ${t('Minimum reached')}`}</span></label> : <div className="ielts-essay-review"><em>{t('Your essay · {count} words', { count: wordCount })}</em><p>{essay}</p></div>}</div>}

      {phase === 'answer' && <div className="quiz-actions"><button type="button" className="btn btn-primary" disabled={grading || (kind === 'speaking' ? answeredCount === 0 : !essay.trim())} onClick={() => void grade()}>{grading ? <><Loader2 size={16} className="spin" />{t('Assessing…')}</> : <><Award size={16} />{t('Get band feedback')}</>}</button><p className="quiz-fineprint">{t('AI band estimates are for practice only and are not IELTS results. No request is automatically retried.')}</p></div>}

      {phase === 'results' && <div className="ielts-results"><div className="ielts-overall"><span>{t('Estimated overall band')}</span><strong>{(kind === 'speaking' ? speakingResult?.overallBand : writingResult?.overallBand)?.toFixed(1)}</strong></div><div className="ielts-band-grid">{bands.map(([label, score]) => <div key={String(label)}><span>{label}</span><strong>{Number(score).toFixed(1)}</strong></div>)}</div>{speakingResult && <p className="ielts-pronunciation-note"><em>{t('Pronunciation not banded')}</em>{speakingResult.pronunciationNote}</p>}{writingResult && <p className="ielts-general-feedback">{writingResult.generalFeedback}</p>}<div className="ielts-next-steps"><h3>{t('What to revise next')}</h3><ul>{(speakingResult?.nextSteps ?? writingResult?.nextSteps ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>{episode && followUpFeedback && <FeedbackFollowUp episodeId={episode.id} sourceId={followUpSourceId} feedback={followUpFeedback} sourceText={followUpSourceText} />}<button type="button" className="btn btn-secondary" onClick={() => setPhase('setup')}>{t('Prepare another paper')}</button></div>}
    </section>}
  </div>
}
