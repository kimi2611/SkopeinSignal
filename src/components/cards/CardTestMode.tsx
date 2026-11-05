import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, ClipboardList, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { reviewCard } from '../../lib/cards'
import { useI18n } from '../../lib/i18n'
import { trpc } from '../../providers/trpc'
import type { VocabularyEntry } from '../../types'

type QuestionKind = 'choice' | 'truefalse' | 'written' | 'qanda'
type GeneratorKind = 'local' | 'ai'

function testErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/AI_[A-Z_]+|UNAUTHORIZED/)
  return match ? match[0] : 'AI_UNKNOWN'
}

interface TestQuestion {
  kind: QuestionKind
  entry: VocabularyEntry
  /** Long-form quoted-passage question for qanda items; '' otherwise. */
  questionText: string
  options: string[]
  correctOption: number
  proposed: string
  proposalIsCorrect: boolean
}

type TestPhase = 'config' | 'running' | 'results'

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/^[.,;:!?'"„“”‘’()[\]-]+|[.,;:!?'"“”‘’()[\]-]+$/g, '')
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

/** Open answer-first rotation: written and qanda each take two slots per cycle. */
function weightedCycle(types: QuestionKind[]): QuestionKind[] {
  const cycle = [...types]
  for (const kind of types) if (kind === 'written' || kind === 'qanda') cycle.push(kind)
  return cycle
}

/** Blank the word's first occurrence in its episode context — a free local Q&A. */
function blankInContext(surface: string, context: string): string {
  const index = context.toLocaleLowerCase().indexOf(surface.toLocaleLowerCase())
  if (index < 0) return ''
  return `${context.slice(0, index)}_____${context.slice(index + surface.length)}`.trim()
}

function buildTest(deck: VocabularyEntry[], all: VocabularyEntry[], count: number, types: QuestionKind[]): TestQuestion[] {
  const translationPool = [...new Set(all.map((entry) => entry.translation.trim()).filter(Boolean))]
  const cycle = weightedCycle(types)
  return shuffle(deck).slice(0, count).map((entry, index) => {
    const kind = cycle[index % cycle.length]
    const distractors = shuffle(translationPool.filter((translation) => normalize(translation) !== normalize(entry.translation))).slice(0, 3)
    if (kind === 'choice' && distractors.length >= 3) {
      const options = shuffle([entry.translation, ...distractors])
      return { kind, entry, questionText: '', options, correctOption: options.findIndex((option) => option === entry.translation), proposed: '', proposalIsCorrect: true }
    }
    if (kind === 'truefalse' && distractors.length >= 1) {
      const proposalIsCorrect = Math.random() < 0.5
      return { kind, entry, questionText: '', options: [], correctOption: -1, proposed: proposalIsCorrect ? entry.translation : distractors[0], proposalIsCorrect }
    }
    if (kind === 'qanda' && entry.context.trim()) {
      const questionText = blankInContext(entry.surface, entry.context)
      if (questionText) return { kind, entry, questionText, options: [], correctOption: -1, proposed: '', proposalIsCorrect: true }
    }
    return { kind: 'written', entry, questionText: '', options: [], correctOption: -1, proposed: '', proposalIsCorrect: true }
  })
}

function gradeAnswer(question: TestQuestion, answer: string | number | boolean | undefined): boolean {
  if (answer === undefined) return false
  if (question.kind === 'choice') return answer === question.correctOption
  if (question.kind === 'truefalse') return answer === question.proposalIsCorrect
  return typeof answer === 'string' && normalize(answer) === normalize(question.entry.surface)
}

interface CardTestModeProps {
  deck: VocabularyEntry[]
  all: VocabularyEntry[]
}

export function CardTestMode({ deck, all }: CardTestModeProps) {
  const { t } = useI18n()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { state, saveCardProgress } = useWorkspace()
  const progressById = useMemo(() => new Map(state.cardProgress.map((progress) => [progress.vocabularyId, progress])), [state.cardProgress])
  // Tests run on English and German words only — the written-answer matching
  // and distractor logic are tuned for those two languages; other cards stay
  // in the deck for review but are skipped in tests.
  const testDeck = useMemo(() => deck.filter((entry) => entry.language === 'English' || entry.language === 'Deutsch'), [deck])
  const excludedCount = deck.length - testDeck.length
  const [phase, setPhase] = useState<TestPhase>('config')
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuestionKind[]>(['qanda', 'written'])
  const [generator, setGenerator] = useState<GeneratorKind>('local')
  const [aiError, setAiError] = useState('')
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [answers, setAnswers] = useState<Array<string | number | boolean | undefined>>([])
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const testedRef = useRef<VocabularyEntry[]>([])
  const syncedRef = useRef(false)
  const [syncSummary, setSyncSummary] = useState({ right: 0, wrong: 0 })
  const generateTest = trpc.cards.generateTest.useMutation()

  const distractorCount = useMemo(() => new Set(all.map((entry) => normalize(entry.translation)).filter(Boolean)).size, [all])
  const canStart = testDeck.length >= 2 && types.length > 0 && !generateTest.isPending
  const current = questions[index]

  const errorCopy: Record<string, string> = {
    AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted, so AI test building is unavailable until the quota is topped up in Kimi. The local builder stays free and ready.'),
    AI_CONTENT_REJECTED: t('The AI declined this word list. Try a different deck filter.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
    AI_TRANSIENT: t('The AI service is busy right now. Nothing was retried automatically — the local builder is always available.'),
    AI_EMPTY_RESULT: t('The AI returned nothing usable this time. Try again, or build the test locally.'),
    UNAUTHORIZED: t('Sign in to use AI test building.'),
    AI_UNKNOWN: t('The request failed. Nothing was retried automatically — the local builder is always available.'),
  }

  const toggleType = (kind: QuestionKind) => {
    setTypes((currentTypes) => currentTypes.includes(kind) ? currentTypes.filter((item) => item !== kind) : [...currentTypes, kind])
  }

  const beginRun = (built: TestQuestion[]) => {
    setQuestions(built)
    setAnswers(new Array(built.length).fill(undefined))
    setIndex(0)
    setDraft('')
    syncedRef.current = false
    setPhase('running')
  }

  const start = () => {
    setAiError('')
    if (generator === 'local') {
      beginRun(buildTest(testDeck, all, count, types))
      return
    }
    // AI build: the model writes long quoted-passage questions and any
    // plausible distractors; assembly and grading stay local.
    const tested = shuffle(testDeck).slice(0, count).filter((entry) => entry.translation.trim())
    if (tested.length < 2) {
      toast.error(t('AI test building needs at least two cards with translations in the filtered deck.'))
      return
    }
    testedRef.current = tested
    const translationLanguage = tested.find((entry) => entry.language)?.language ?? 'English'
    generateTest.mutate(
      {
        translationLanguage,
        words: tested.map((entry) => ({ surface: entry.surface, translation: entry.translation, ...(entry.context.trim() ? { context: entry.context.trim().slice(0, 500) } : {}) })),
        types,
        pool: [...new Set(all.map((entry) => entry.translation.trim()).filter(Boolean))].slice(0, 200),
      },
      {
        onSuccess: (result) => {
          const built: TestQuestion[] = result.questions.map((question, questionIndex) => ({
            kind: question.kind,
            entry: testedRef.current[questionIndex],
            questionText: question.question,
            options: question.options,
            correctOption: question.correctIndex,
            proposed: question.proposed,
            proposalIsCorrect: question.proposalIsCorrect,
          })).filter((question) => question.entry)
          if (!built.length) {
            setAiError('AI_EMPTY_RESULT')
            return
          }
          if (!result.charged) toast.success(t('Written-only tests need no AI — built locally, nothing billed.'))
          beginRun(built)
        },
        onError: (err) => setAiError(testErrorCode(err)),
      },
    )
  }

  const record = (value: string | number | boolean) => {
    setAnswers((currentAnswers) => currentAnswers.map((item, itemIndex) => itemIndex === index ? value : item))
    setDraft('')
    if (index + 1 < questions.length) setIndex(index + 1)
    else setPhase('results')
  }

  // A1 deck<->test bridge: once a run reaches the results page, write each
  // answered card back into the SM-2 schedule — correct advances ('good'),
  // wrong requeues for today ('again', lapses +1). Unanswered questions are
  // left untouched. Purely local; no AI call.
  useEffect(() => {
    if (phase !== 'results' || syncedRef.current) return
    syncedRef.current = true
    let right = 0
    let wrong = 0
    questions.forEach((question, questionIndex) => {
      if (answers[questionIndex] === undefined) return
      const correct = gradeAnswer(question, answers[questionIndex])
      const reviewed = { ...reviewCard(progressById.get(question.entry.id), correct ? 'good' : 'again'), vocabularyId: question.entry.id }
      saveCardProgress(reviewed)
      if (correct) right += 1
      else wrong += 1
    })
    setSyncSummary({ right, wrong })
    if (right + wrong > 0) toast.success(t('Deck schedule updated: {right} advanced, {wrong} requeued for today.', { right, wrong }))
  }, [phase, questions, answers, progressById, saveCardProgress, t])

  const correctCount = questions.filter((question, questionIndex) => gradeAnswer(question, answers[questionIndex])).length
  const scorePercent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0

  if (phase === 'config') {
    return (
      <section className="review-desk card-test" aria-labelledby="card-test-title">
        <div className="review-desk-heading"><div><span className="section-index">{t('02 / TEST')}</span><h2 id="card-test-title">{t('Quizlet-style written test')}</h2></div></div>
        {aiError && (
          <div className="panel ai-degraded" role="alert">
            <h3>{t('AI test building unavailable')}</h3>
            <p>{errorCopy[aiError] ?? errorCopy.AI_UNKNOWN}</p>
          </div>
        )}
        <div className="card-test-generator" role="group" aria-label={t('Test builder')}>
          <button type="button" className={generator === 'local' ? 'active' : ''} aria-pressed={generator === 'local'} onClick={() => setGenerator('local')}>
            <ClipboardList size={15} /><span><strong>{t('Local builder')}</strong><small>{t('Free, offline — passage blanks from each card’s own context')}</small></span>
          </button>
          <button type="button" className={generator === 'ai' ? 'active' : ''} aria-pressed={generator === 'ai'} onClick={() => setGenerator('ai')} disabled={authLoading || !isAuthenticated} title={!isAuthenticated ? t('Sign in to use AI test building.') : undefined}>
            <Sparkles size={15} /><span><strong>{t('AI builder')}</strong><small>{t('AI writes long quoted-passage questions — billed to the site owner')}</small></span>
          </button>
        </div>
        {!authLoading && !isAuthenticated && <p className="form-hint">{t('The AI builder needs a signed-in account; the local builder works without one.')}</p>}
        <p className="form-hint">{generator === 'ai' ? t('One AI call per test, never retried automatically. Q&A passages are the main dish — the AI writes a longer quoted-passage question per card, plus distractors only if you enabled choice or true/false. Assembly and grading still happen locally in your browser, and results are not saved.') : t('Built locally from the filtered deck — mostly Q&A: passage-blank questions from each card’s episode context and type-the-word answers, with multiple choice or true/false only if you add them. Graded instantly in your browser. No AI call, no cost, and results are not saved.')}</p>
        <div className="card-test-config">
          <label><span>{t('Questions')}</span><select className="field" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <div className="card-test-types" role="group" aria-label={t('Question types')}>
            <button type="button" className={types.includes('qanda') ? 'active' : ''} aria-pressed={types.includes('qanda')} onClick={() => toggleType('qanda')}><Check size={14} />{t('Q&A passage')}</button>
            <button type="button" className={types.includes('written') ? 'active' : ''} aria-pressed={types.includes('written')} onClick={() => toggleType('written')}><Check size={14} />{t('Written')}</button>
            <button type="button" className={types.includes('choice') ? 'active' : ''} aria-pressed={types.includes('choice')} onClick={() => toggleType('choice')} disabled={generator === 'local' && distractorCount < 4}><Check size={14} />{t('Multiple choice')}</button>
            <button type="button" className={types.includes('truefalse') ? 'active' : ''} aria-pressed={types.includes('truefalse')} onClick={() => toggleType('truefalse')} disabled={generator === 'local' && distractorCount < 2}><Check size={14} />{t('True / false')}</button>
          </div>
          <button type="button" className="btn btn-primary card-test-start" disabled={!canStart} onClick={start}>
            {generateTest.isPending ? <><Loader2 size={16} className="spin" />{t('Building test…')}</> : <><ClipboardList size={16} />{t('Start test')}</>}
          </button>
        </div>
        {testDeck.length < 2 && <p className="form-hint">{t('A test needs at least two English or German cards in the filtered deck. Import words or choose another deck filter.')}</p>}
        {excludedCount > 0 && <p className="form-hint" data-testid="card-test-language-note">{t('{count} card(s) in other languages are skipped — tests run on English and German words only.', { count: excludedCount })}</p>}
        {generator === 'local' && distractorCount < 4 && <p className="form-hint">{t('Multiple choice unlocks once your vocabulary holds at least four distinct translations — or switch to the AI builder, which writes its own distractors.')}</p>}
      </section>
    )
  }

  if (phase === 'running' && current) {
    return (
      <section className="review-desk card-test" aria-labelledby="card-test-running">
        <div className="review-desk-heading"><div><span className="section-index">{t('02 / TEST')}</span><h2 id="card-test-running">{t('Answer without peeking')}</h2></div><span>{t('{position} of {count}', { position: index + 1, count: questions.length })}</span></div>
        <div className="flashcard card-test-prompt">
          <span className="flashcard-side">{current.kind === 'choice' ? t('CHOOSE THE TRANSLATION') : current.kind === 'truefalse' ? t('TRUE OR FALSE') : current.kind === 'qanda' ? t('ANSWER THE QUESTION') : t('TYPE THE WORD')}</span>
          {current.kind === 'qanda' ? <p className="card-test-passage">{current.questionText}</p> : <strong>{current.kind === 'written' ? (current.entry.translation || current.entry.surface) : current.entry.surface}</strong>}
          {current.kind !== 'written' && current.kind !== 'qanda' && !!current.entry.context && <p>{current.entry.context}</p>}
          {current.kind === 'truefalse' && <p className="flashcard-translation">{t('Proposed translation: {translation}', { translation: current.proposed })}</p>}
        </div>
        {current.kind === 'choice' && <div className="card-test-options">{current.options.map((option, optionIndex) => <button type="button" key={optionIndex} onClick={() => record(optionIndex)}><b>{String.fromCharCode(65 + optionIndex)}</b>{option}</button>)}</div>}
        {current.kind === 'truefalse' && <div className="card-test-options two"><button type="button" onClick={() => record(true)}><Check size={17} />{t('True')}</button><button type="button" onClick={() => record(false)}><X size={17} />{t('False')}</button></div>}
        {(current.kind === 'written' || current.kind === 'qanda') && (
          <form className="card-test-written" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) record(draft) }}>
            <input className="field" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('Type the matching word…')} aria-label={t('Type the matching word')} autoFocus />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>{t('Answer')}<ChevronRight size={15} /></button>
          </form>
        )}
      </section>
    )
  }

  return (
    <section className="review-desk card-test" aria-labelledby="card-test-results">
      <div className="review-desk-heading"><div><span className="section-index">{t('02 / TEST')}</span><h2 id="card-test-results">{t('Test results')}</h2></div><span className="card-test-score">{correctCount} / {questions.length} · {scorePercent}%</span></div>
      {(syncSummary.right + syncSummary.wrong) > 0 && <p className="form-hint">{t('Synced to your deck: {right} card(s) advanced, {wrong} requeued for today’s review.', syncSummary)}</p>}
      <ol className="card-test-review">
        {questions.map((question, questionIndex) => {
          const correct = gradeAnswer(question, answers[questionIndex])
          const answer = answers[questionIndex]
          const answerText = answer === undefined ? t('(no answer)') : question.kind === 'choice' ? question.options[answer as number] : question.kind === 'truefalse' ? (answer ? t('True') : t('False')) : String(answer)
          const expected = question.kind === 'truefalse' ? `${question.entry.surface} = ${question.entry.translation}` : `${question.entry.surface} → ${question.entry.translation}`
          return (
            <li key={question.entry.id} className={correct ? 'is-correct' : 'is-wrong'}>
              {correct ? <Check size={15} /> : <X size={15} />}
              <div><strong>{expected}</strong>{question.kind === 'qanda' && question.questionText && <span className="card-test-review-passage">{question.questionText}</span>}<span>{t('Your answer: {answer}', { answer: answerText })}</span></div>
            </li>
          )
        })}
      </ol>
      <div className="quiz-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setPhase('config')}>{t('Change test setup')}</button>
        <button type="button" className="btn btn-primary" onClick={start}><RotateCcw size={16} />{t('Retake with new questions')}</button>
      </div>
    </section>
  )
}
