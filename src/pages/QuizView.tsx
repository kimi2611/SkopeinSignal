import { useEffect, useMemo, useRef, useState } from 'react'
import { Award, ChevronDown, ChevronUp, GraduationCap, Loader2, MessageSquareText, Mic, Square, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/Common'
import { IeltsWorkshop } from '../components/IeltsWorkshop'
import { FeedbackFollowUp } from '../components/learning/FeedbackFollowUp'
import { trpc } from '../providers/trpc'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { uid } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { consumeEpisodeTarget, QUIZ_EPISODE_KEY } from '../lib/studyNavigation'
import { transcriptToText } from '../lib/transcript'
import type { Episode, PodcastShow, QuizAttempt, QuizQuestion, QuizVerdict, StudySession, ViewKey } from '../types'

// Minimal structural typing for the Web Speech API (not in the TS DOM lib).
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const EXCERPT_CHARS = 6000

type Phase = 'pick' | 'answering' | 'results'

/** Map a failed tRPC call to a stable machine code (set by the quiz router). */
function quizErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/AI_[A-Z_]+|UNAUTHORIZED/)
  return match ? match[0] : 'AI_UNKNOWN'
}

type MissedWordCaptureProps = {
  episodeId: string
  language: PodcastShow['language']
  context: string
  takenSurfaces: Set<string>
  onSave: (input: { episodeId: string; surface: string; translation: string; language: PodcastShow['language']; context: string; startSeconds: null }) => void
}

/** A2 quiz->deck bridge: capture one word from a missed/partial question into
 * the vocabulary deck. Manual confirmation only — the AI never guesses words. */
function MissedWordCapture({ episodeId, language, context, takenSurfaces, onSave }: MissedWordCaptureProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [surface, setSurface] = useState('')
  const [translation, setTranslation] = useState('')
  const normalized = surface.trim().toLocaleLowerCase()
  const duplicate = normalized !== '' && takenSurfaces.has(normalized)
  const canSave = surface.trim() !== '' && translation.trim() !== '' && !duplicate

  if (!open) {
    return <button type="button" className="text-link quiz-word-capture-toggle" onClick={() => setOpen(true)}>{t('Save a word from this question to your deck')}</button>
  }
  return (
    <form className="quiz-word-capture" onSubmit={(event) => {
      event.preventDefault()
      if (!canSave) return
      onSave({ episodeId, surface: surface.trim(), translation: translation.trim(), language, context: context.trim().slice(0, 300), startSeconds: null })
      setSurface('')
      setTranslation('')
      setOpen(false)
    }}>
      <input className="field" value={surface} onChange={(event) => setSurface(event.target.value)} placeholder={t('Word')} aria-label={t('Word')} />
      <input className="field" value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder={t('Translation')} aria-label={t('Translation')} />
      <button type="submit" className="btn btn-secondary" disabled={!canSave}>{t('Save to deck')}</button>
      {duplicate && <p className="form-hint">{t('This word is already in your deck.')}</p>}
    </form>
  )
}

export function QuizView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state, saveQuizAttempt, removeQuizAttempt, saveVocabularyEntry } = useWorkspace()
  const { t, locale } = useI18n()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [practiceMode, setPracticeMode] = useState<'short' | 'long' | 'ielts'>('short')
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(() => {
    const target = consumeEpisodeTarget(QUIZ_EPISODE_KEY)
    if (!target) return ''
    const episode = state.episodes.find((item) => item.id === target)
    const session = state.studySessions.find((item) => item.episodeId === target && item.segments.length > 0)
    const language = state.shows.find((item) => item.id === episode?.showId)?.language
    return episode && session && (language === 'English' || language === 'Deutsch') ? target : ''
  })
  const [questionCount, setQuestionCount] = useState(4)
  const [phase, setPhase] = useState<Phase>('pick')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [verdicts, setVerdicts] = useState<QuizVerdict[]>([])
  const [score, setScore] = useState(0)
  const [aiError, setAiError] = useState('')
  const [activeMicId, setActiveMicId] = useState<string | null>(null)
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const answerBaseRef = useRef('')
  const generateMutation = trpc.quiz.generate.useMutation()
  const gradeMutation = trpc.quiz.grade.useMutation()

  const episodeById = useMemo(() => new Map(state.episodes.map((episode) => [episode.id, episode])), [state.episodes])
  const showById = useMemo(() => new Map(state.shows.map((show) => [show.id, show])), [state.shows])

  // Voice quizzes run in English and German only: the speech recognizer and the
  // grading prompts are tuned for those two languages, so transcripts in other
  // languages are listed as excluded rather than offered half-working.
  const { eligible, excludedCount } = useMemo(() => {
    const withTranscript = state.studySessions
      .filter((session) => session.segments.length > 0)
      .map((session) => ({ session, episode: episodeById.get(session.episodeId) }))
      .filter((pair): pair is { session: StudySession; episode: Episode } => !!pair.episode)
    const supported = withTranscript.filter((pair) => {
      const language = showById.get(pair.episode.showId)?.language
      return language === 'English' || language === 'Deutsch'
    })
    supported.sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt))
    return { eligible: supported, excludedCount: withTranscript.length - supported.length }
  }, [state.studySessions, episodeById, showById])

  const selected = eligible.find((pair) => pair.episode.id === selectedEpisodeId) ?? null
  const selectedShow: PodcastShow | undefined = selected ? showById.get(selected.episode.showId) : undefined
  // `eligible` above already filters to English/Deutsch shows, so this narrow is
  // a no-op at runtime — it exists to give the tRPC input schema a precise type.
  const quizLanguage: 'English' | 'Deutsch' = selectedShow?.language === 'Deutsch' ? 'Deutsch' : 'English'
  const speechLang = selectedShow?.language === 'Deutsch' ? 'de-DE' : 'en-US'
  const speechSupported = typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null

  const stopListening = () => {
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
    recognitionRef.current = null
    setActiveMicId(null)
  }
  useEffect(() => stopListening, [])

  const changePracticeMode = (mode: 'short' | 'long' | 'ielts') => {
    if (mode === practiceMode) return
    stopListening()
    setPracticeMode(mode)
    setQuestionCount(mode === 'long' ? 3 : 4)
    setPhase('pick')
    setQuestions([])
    setAnswers({})
    setVerdicts([])
    setAiError('')
  }

  const startListening = (question: QuizQuestion) => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    stopListening()
    const recognition = new Ctor()
    recognition.lang = speechLang
    recognition.interimResults = true
    recognition.continuous = practiceMode === 'long'
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript
      }
      const combined = `${answerBaseRef.current}${transcript}`.trim()
      setAnswers((current) => ({ ...current, [question.id]: combined }))
    }
    recognition.onend = () => { recognitionRef.current = null; setActiveMicId(null) }
    recognition.onerror = (event) => {
      recognitionRef.current = null
      setActiveMicId(null)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error(t('Microphone access was blocked. This quiz is voice-only — allow the microphone to answer.'))
      } else if (event.error === 'no-speech') {
        toast.message(t('No speech was captured. Nothing was graded as wrong; check the microphone and dictate the answer again.'))
      } else if (event.error === 'audio-capture' || event.error === 'network') {
        toast.error(t('Speech recognition failed before grading. This is a recognition problem, not a comprehension result; nothing was marked wrong — try the answer again.'))
      }
    }
    recognitionRef.current = recognition
    answerBaseRef.current = answers[question.id] ? `${answers[question.id]} ` : ''
    setActiveMicId(question.id)
    try { recognition.start() } catch { stopListening() }
  }

  const generate = async () => {
    if (!selected || !selectedShow) return
    setAiError('')
    const excerpt = transcriptToText(selected.session.segments).slice(0, EXCERPT_CHARS)
    try {
      const result = await generateMutation.mutateAsync({
        episodeTitle: selected.episode.title,
        showName: selectedShow.name,
        language: quizLanguage,
        excerpt,
        mode: practiceMode === 'long' ? 'long' : 'short',
        questionCount,
      })
      setQuestions(result.questions)
      setAnswers({})
      setVerdicts([])
      setPhase('answering')
    } catch (err) {
      setAiError(quizErrorCode(err))
    }
  }

  const answeredCount = questions.filter((question) => (answers[question.id] ?? '').trim()).length

  const grade = async () => {
    if (!selected || !selectedShow || !questions.length) return
    stopListening()
    setAiError('')
    const payloadAnswers = questions
      .map((question) => ({ questionId: question.id, answer: (answers[question.id] ?? '').trim() }))
      .filter((answer) => answer.answer)
    try {
      const result = await gradeMutation.mutateAsync({
        episodeTitle: selected.episode.title,
        language: quizLanguage,
        questions,
        answers: payloadAnswers,
      })
      setVerdicts(result.verdicts)
      setScore(result.score)
      setPhase('results')
      const attempt: QuizAttempt = {
        id: uid('quiz'),
        episodeId: selected.episode.id,
        questions,
        answers: Object.fromEntries(payloadAnswers.map((answer) => [answer.questionId, answer.answer])),
        verdicts: result.verdicts,
        score: result.score,
        createdAt: new Date().toISOString(),
      }
      saveQuizAttempt(attempt)
      toast.success(t('Quiz graded and saved to your history.'))
    } catch (err) {
      setAiError(quizErrorCode(err))
    }
  }

  const verdictFor = (questionId: string) => verdicts.find((verdict) => verdict.questionId === questionId)
  const verdictLabel = (value: QuizVerdict['verdict']) => value === 'correct' ? t('Understood') : value === 'partial' ? t('Partly understood') : t('Missed')
  const takenSurfaces = useMemo(() => new Set(state.vocabulary.map((entry) => entry.surface.trim().toLocaleLowerCase()).filter(Boolean)), [state.vocabulary])

  const aiErrorCopy: Record<string, string> = {
    AI_QUOTA_EXHAUSTED: t('The active key’s AI quota is exhausted, so the voice quiz is unavailable until that key is topped up.'),
    AI_BYOK_REQUIRED: t('AI needs a channel key: add your own DeepSeek key under Settings → AI keys, then retry.'),
    AI_CONTENT_REJECTED: t('The AI declined this content. Try a different episode or a shorter excerpt.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
    AI_TRANSIENT: t('The AI service is busy right now. Nothing was retried automatically — start the request again when you are ready.'),
    AI_EMPTY_RESULT: t('The AI returned nothing usable this time. Try generating the questions again.'),
    UNAUTHORIZED: t('Sign in to use the voice quiz.'),
    AI_UNKNOWN: t('The quiz request failed. Nothing was retried automatically — try again when you are ready.'),
  }

  return (
    <div className="page-wrap quiz-page">
      <PageHeader
        view="quiz"
        kicker={practiceMode === 'ielts' ? t('IELTS / SPEAKING STUDIO') : practiceMode === 'short' ? t('LISTENING COMPREHENSION / SHORT SPOKEN ANSWERS') : t('LISTENING COMPREHENSION / AI LONG-FORM QUESTIONS')}
        title={practiceMode === 'ielts' ? t('Let the argument become your own voice.') : practiceMode === 'short' ? t('Answer what stayed with you, briefly.') : t('Take a passage into a deeper conversation.')}
        copy={practiceMode === 'ielts' ? t('Build an unofficial IELTS Speaking paper from Snipd takeaways or an AI summary of the podcast. Answer Parts 1–3 aloud, then receive criterion-based practice feedback.') : practiceMode === 'short' ? t('Choose an English or German episode with a transcript. AI asks concise comprehension questions; answer each in one or two spoken sentences, without typing. This is the separate short-answer exercise, not the long-form interview.') : t('Choose an English or German episode with a transcript. AI quotes a longer passage and asks you to interpret its reasoning in a developed spoken paragraph. This is the separate long-form exercise, not the short-answer quiz.')}
      />

      <div className="notes-mode-switch" role="tablist" aria-label={t('Voice practice mode')}>
        <button type="button" role="tab" aria-selected={practiceMode === 'short'} className={practiceMode === 'short' ? 'active' : ''} onClick={() => changePracticeMode('short')}><Mic size={16} />{t('Short spoken answers')}</button>
        <button type="button" role="tab" aria-selected={practiceMode === 'long'} className={practiceMode === 'long' ? 'active' : ''} onClick={() => changePracticeMode('long')}><MessageSquareText size={16} />{t('AI long-form questions')}</button>
        <button type="button" role="tab" aria-selected={practiceMode === 'ielts'} className={practiceMode === 'ielts' ? 'active' : ''} onClick={() => changePracticeMode('ielts')}><GraduationCap size={16} />{t('IELTS Speaking')}</button>
      </div>

      {practiceMode !== 'ielts' && !authLoading && !isAuthenticated && (
        <section className="panel quiz-gate">
          <UserRound size={22} />
          <h2>{t('Sign in to use the voice quiz')}</h2>
          <p>{t('Question generation and grading run on the active key — the site AI by default, your own DeepSeek key once you enable one. Signing in ties each call to your account and stores quiz history in your cloud workspace.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('account')}>{t('Open My Account')}</button>
        </section>
      )}

      {practiceMode === 'ielts' ? <IeltsWorkshop kind="speaking" onNavigate={onNavigate} /> : isAuthenticated && (
        <>
          {aiError && (
            <section className="panel ai-degraded" role="alert">
              <h3>{t('Voice quiz unavailable')}</h3>
              <p>{aiErrorCopy[aiError] ?? aiErrorCopy.AI_UNKNOWN}</p>
            </section>
          )}

          {phase === 'pick' && (
            <section className="panel">
              <div className="panel-head">
                <h2>{t('Choose an episode with a transcript')}</h2>
                <label className="quiz-count">{t('Questions')}
                  <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
                    {(practiceMode === 'long' ? [2, 3, 4] : [3, 4, 5, 6]).map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
              </div>
              {!eligible.length && (
                <p className="empty-state">{t('No English or German episode has a transcript yet. Set up a listening desk in Listen & Read, import a VTT/SRT/TXT transcript (or transcribe on-device), then return here to test your understanding.')}</p>
              )}
              {excludedCount > 0 && (
                <p className="quiz-language-note" data-testid="quiz-language-note">{t('{count} transcript(s) in other languages are not listed — the voice quiz runs in English and German only.', { count: excludedCount })}</p>
              )}
              {!speechSupported && (
                <p className="quiz-language-note quiz-voice-warning" data-testid="quiz-voice-warning">{t('Heads-up before you start: this quiz is answered out loud, and this browser has no speech recognition — Firefox desktop is the usual case. Open the site in Chrome, Edge, or Safari to take it, or use Word Decks meanwhile.')}</p>
              )}
              <ul className="quiz-episode-list">
                {eligible.map(({ session, episode }) => {
                  const show = showById.get(episode.showId)
                  const active = selectedEpisodeId === episode.id
                  return (
                    <li key={episode.id}>
                      <button type="button" className={`quiz-episode ${active ? 'active' : ''}`} onClick={() => setSelectedEpisodeId(episode.id)} aria-pressed={active}>
                        <strong>{episode.title}</strong>
                        <span>{show?.shortName ?? ''} · {show?.language ?? ''} · {t('{count} transcript segments', { count: session.segments.length })}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="quiz-actions">
                <button type="button" className="btn btn-primary" disabled={!selected || generateMutation.isPending} onClick={() => void generate()}>
                  {generateMutation.isPending ? <><Loader2 size={16} className="spin" />{t('Generating questions…')}</> : practiceMode === 'short' ? <><Mic size={16} />{t('Generate short-answer questions')}</> : <><MessageSquareText size={16} />{t('Generate long-form questions')}</>}
                </button>
              </div>
              <p className="quiz-fineprint">{practiceMode === 'short' ? t('Short-answer questions use only the episode transcript excerpt and call for one or two spoken sentences. The excerpt is sent to the AI behind the active key; generation is never auto-retried.') : t('Long-form questions quote two to four transcript sentences and call for a developed spoken paragraph. The excerpt is sent to the AI behind the active key; generation is never auto-retried.')}</p>
            </section>
          )}

          {phase !== 'pick' && selected && (
            <section className="panel">
              <div className="panel-head">
                <h2>{selected.episode.title}</h2>
                <span className="quiz-progress-label">{t('{answered} of {total} answered', { answered: answeredCount, total: questions.length })}</span>
              </div>
              <ol className="quiz-question-list">
                {questions.map((question, index) => {
                  const verdict = phase === 'results' ? verdictFor(question.id) : undefined
                  return (
                    <li key={question.id} className={`quiz-question ${verdict ? `verdict-${verdict.verdict}` : ''}`}>
                      <p className="quiz-prompt"><b>{index + 1}.</b> {question.prompt}</p>
                      {phase === 'answering' && (
                        <div className="quiz-answer">
                          {speechSupported ? <>
                            <textarea
                              value={answers[question.id] ?? ''}
                              readOnly
                              aria-label={t('Your spoken answer')}
                              placeholder={practiceMode === 'short' ? t('Tap Answer by voice and give a one- or two-sentence answer…') : t('Tap Answer by voice and develop your interpretation in a spoken paragraph…')}
                              rows={practiceMode === 'short' ? 2 : 5}
                            />
                            <div className="quiz-voice-row">
                              <button
                                type="button"
                                className={`btn ${activeMicId === question.id ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => activeMicId === question.id ? stopListening() : startListening(question)}
                              >
                                {activeMicId === question.id ? <><Square size={14} />{t('Stop recording')}</> : <><Mic size={14} />{t('Answer by voice')}</>}
                              </button>
                              {(answers[question.id] ?? '').trim() && <button type="button" className="text-link" onClick={() => setAnswers((current) => ({ ...current, [question.id]: '' }))}>{t('Clear and answer again')}</button>}
                            </div>
                          </> : (
                            <p className="quiz-fineprint quiz-voice-only-note">{t('This quiz is voice-only, and this browser does not support speech recognition. Open the quiz in Chrome, Edge, or Safari on iPad to answer out loud.')}</p>
                          )}
                        </div>
                      )}
                      {phase === 'results' && verdict && (
                        <div className="quiz-result">
                          <span className={`quiz-chip ${verdict.verdict}`}>{verdictLabel(verdict.verdict)}</span>
                          <p><em>{t('Your answer')}</em> {(answers[question.id] ?? '').trim() || t('(no answer)')}</p>
                          <p><em>{t('Feedback')}</em> {verdict.feedback}</p>
                          <p><em>{t('Reference answer')}</em> {question.referenceAnswer}</p>
                        </div>
                      )}
                      {phase === 'results' && verdict && verdict.verdict !== 'correct' && (
                        <>
                          <FeedbackFollowUp
                            episodeId={selected.episode.id}
                            sourceId={`quiz-${selected.episode.id}-${question.id}`}
                            feedback={verdict.feedback || t('This answer needs revision.')}
                            sourceText={`${question.prompt}\n${question.referenceAnswer}\n${answers[question.id] ?? ''}\n${verdict.feedback}`}
                          />
                          <MissedWordCapture
                            episodeId={selected.episode.id}
                            language={state.shows.find((item) => item.id === selected.episode.showId)?.language ?? 'English'}
                            context={question.prompt}
                            takenSurfaces={takenSurfaces}
                            onSave={(input) => {
                              saveVocabularyEntry(input)
                              toast.success(t('Word saved to your deck.'))
                            }}
                          />
                        </>
                      )}
                    </li>
                  )
                })}
              </ol>
              {phase === 'answering' && (
                <div className="quiz-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => { stopListening(); setPhase('pick') }}>{t('Back to episode list')}</button>
                  <button type="button" className="btn btn-primary" disabled={!answeredCount || gradeMutation.isPending} onClick={() => void grade()}>
                    {gradeMutation.isPending ? <><Loader2 size={16} className="spin" />{t('Grading…')}</> : <><Award size={16} />{t('Grade my answers')}</>}
                  </button>
                </div>
              )}
              {phase === 'results' && (
                <div className="quiz-score">
                  <strong>{t('Your score')}</strong>
                  <span>{score} / 100</span>
                  <div className="quiz-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setPhase('pick')}>{t('Back to episode list')}</button>
                    <button type="button" className="btn btn-primary" disabled={generateMutation.isPending} onClick={() => void generate()}>{t('Try a new quiz')}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h2>{t('Past quizzes')}</h2></div>
            {!state.quizAttempts.length && <p className="empty-state">{t('No quizzes yet. Your graded quizzes are stored here and sync with your cloud workspace.')}</p>}
            <ul className="quiz-history">
              {state.quizAttempts.map((attempt) => {
                const episode = episodeById.get(attempt.episodeId)
                const expanded = expandedAttemptId === attempt.id
                return (
                  <li key={attempt.id}>
                    <div className="quiz-history-row">
                      <button type="button" className="quiz-history-main" onClick={() => setExpandedAttemptId(expanded ? null : attempt.id)} aria-expanded={expanded}>
                        <strong>{episode?.title ?? t('(episode removed)')}</strong>
                        <span>{new Date(attempt.createdAt).toLocaleString(locale === 'en' ? 'en-US' : locale)}</span>
                      </button>
                      <span className="quiz-history-score">{attempt.score}</span>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Delete quiz')} onClick={() => removeQuizAttempt(attempt.id)}><Trash2 size={15} /></button>
                    </div>
                    {expanded && (
                      <ol className="quiz-question-list compact">
                        {attempt.questions.map((question, index) => {
                          const verdict = attempt.verdicts.find((item) => item.questionId === question.id)
                          return (
                            <li key={question.id} className={`quiz-question ${verdict ? `verdict-${verdict.verdict}` : ''}`}>
                              <p className="quiz-prompt"><b>{index + 1}.</b> {question.prompt}</p>
                              {verdict && <div className="quiz-result"><span className={`quiz-chip ${verdict.verdict}`}>{verdictLabel(verdict.verdict)}</span><p><em>{t('Your answer')}</em> {attempt.answers[question.id] ?? t('(no answer)')}</p><p><em>{t('Feedback')}</em> {verdict.feedback}</p></div>}
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
