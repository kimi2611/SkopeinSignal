import { useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, GitBranch, Lightbulb, Loader2, Mic, PenLine, Send, Sparkles, Square, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { ApplePencilStudio } from '../components/ApplePencilStudio'
import { ResourceStudio } from '../components/ResourceStudio'
import { IdeaEvolutionPanel } from '../components/learning/IdeaEvolutionPanel'
import { IdeaEvolutionStudio } from '../components/learning/IdeaEvolutionStudio'
import { PageHeader } from '../components/Common'
import { trpc } from '../providers/trpc'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { uid } from '../lib/format'
import { useI18n, ti } from '../lib/i18n'
import { consumeEpisodeTarget, SPARK_EPISODE_KEY } from '../lib/studyNavigation'
import { moduleTitle } from '../lib/themeTitles'
import { transcriptToText } from '../lib/transcript'
import { useSpeechInput } from '../hooks/useSpeechInput'
import type { Episode, Spark, SparkReply, ViewKey } from '../types'

const EXCERPT_CHARS = 6000

// Sharp, non-generic thought-starters; two are drawn at random on each open.
// ti() marks each string for the i18n sync so translations stay in step.
const RANDOM_STARTER_POOL = [
  ti('The strongest evidence was…, and it would break if…'),
  ti('The guest assumed…, but never actually proved it.'),
  ti('If the opposite were true, the host would have to explain…'),
  ti('The numbers sounded impressive until I compared them to…'),
  ti('I would ask the host exactly one question: …'),
  ti('The part I almost skipped turned out to matter because…'),
  ti('This whole argument quietly depends on… being true.'),
  ti('The metaphor doing the heavy lifting was…'),
  ti('Somewhere in the middle I changed my mind about…'),
  ti('The disagreement I kept waiting for never came — about…'),
  ti('If this episode were a book chapter, its title would be…'),
  ti('The story that stuck with me was…, because…'),
]

function sparksErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/AI_[A-Z_]+|UNAUTHORIZED/)
  return match ? match[0] : 'AI_UNKNOWN'
}

export function SparksView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state, saveSpark, removeSpark } = useWorkspace()
  const theme = state.settings.theme
  const { t, locale } = useI18n()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [mode, setMode] = useState<'write' | 'pencil' | 'evolution' | 'resources'>('write')
  const [episodeId, setEpisodeId] = useState(() => {
    const target = consumeEpisodeTarget(SPARK_EPISODE_KEY)
    return state.episodes.some((episode) => episode.id === target) ? target : ''
  })
  const [resourceSparkId, setResourceSparkId] = useState('')
  const [text, setText] = useState('')
  const [aiError, setAiError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showHints, setShowHints] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const respondMutation = trpc.sparks.respond.useMutation()

  const episodeById = useMemo(() => new Map(state.episodes.map((episode) => [episode.id, episode])), [state.episodes])
  const showById = useMemo(() => new Map(state.shows.map((show) => [show.id, show])), [state.shows])

  // Any episode the listener has actually spent time with can anchor a spark.
  const linkable = useMemo(() => {
    const sessionEpisodeIds = new Set(state.studySessions.map((session) => session.episodeId))
    return state.episodes
      .filter((episode) => episode.status === 'listened' || sessionEpisodeIds.has(episode.id))
      .sort((a, b) => (b.listenedAt ?? b.addedAt).localeCompare(a.listenedAt ?? a.addedAt))
  }, [state.episodes, state.studySessions])

  const linkedEpisode: Episode | null = episodeId ? episodeById.get(episodeId) ?? null : null
  const linkedShow = linkedEpisode ? showById.get(linkedEpisode.showId) : undefined
  const replyLanguage = linkedShow?.language ?? (locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English')
  const speechLang = replyLanguage === 'Chinese' ? 'zh-CN' : replyLanguage === 'Deutsch' ? 'de-DE' : 'en-US'

  const dictation = useSpeechInput(speechLang, (combined) => setText(combined.slice(0, 1500)), () => text)

  // Thought-starters for an empty page: local, free, and inserted as a
  // sentence opening the listener completes in their own words. Two sharp,
  // non-generic starters are drawn at random each time the panel opens; five
  // more are anchored to the linked episode (or "the episode I just heard").
  const [randomStarters, setRandomStarters] = useState<string[]>([])

  const hintPrompts = useMemo(() => {
    const anchor = linkedEpisode ? `“${linkedEpisode.title}”` : t('the episode I just heard')
    const linked = [
      t('In {anchor}, the moment that surprised me was…', { anchor }),
      t('{anchor} argues…, and I am not fully convinced because…', { anchor }),
      t('After {anchor}, the question I keep asking is…', { anchor }),
      t('{anchor} reminded me of…, except that…', { anchor }),
      t('If I recommend {anchor} to a friend, my one-minute pitch is…', { anchor }),
    ]
    return [...randomStarters.map((starter) => t(starter)), ...linked]
  }, [t, linkedEpisode, randomStarters])

  const toggleHints = () => {
    setShowHints((value) => {
      if (!value) {
        const pool = [...RANDOM_STARTER_POOL]
        const picks: string[] = []
        while (picks.length < 2 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
        setRandomStarters(picks)
      }
      return !value
    })
  }

  const applyHint = (prompt: string) => {
    setText((current) => {
      const base = current.trim()
      const next = base ? `${base}\n${prompt} ` : `${prompt} `
      return next.slice(0, 1500)
    })
    setShowHints(false)
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length)
    }, 0)
  }

  const openResources = (sparkId: string) => {
    const spark = state.sparks.find((item) => item.id === sparkId)
    setResourceSparkId(sparkId)
    if (spark?.episodeId) setEpisodeId(spark.episodeId)
    setMode('resources')
  }

  const errorCopy: Record<string, string> = {
    AI_QUOTA_EXHAUSTED: t('The active key’s AI quota is exhausted, so spark feedback is unavailable until that key is topped up.'),
    AI_BYOK_REQUIRED: t('AI needs a channel key: add your own DeepSeek key under Settings → AI keys, then retry.'),
    AI_CONTENT_REJECTED: t('The AI declined this content. Try rephrasing the idea in your own words.'),
    AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
    AI_TRANSIENT: t('The AI service is busy right now. Nothing was retried automatically — send the spark again when you are ready.'),
    AI_EMPTY_RESULT: t('The AI returned nothing usable this time. Try sending the spark again.'),
    UNAUTHORIZED: t('Sign in to share sparks.'),
    AI_UNKNOWN: t('The request failed. Nothing was retried automatically — try again when you are ready.'),
  }

  const submit = async () => {
    const spark = text.trim()
    if (spark.length < 4 || respondMutation.isPending) return
    dictation.stop()
    setAiError('')
    const session = linkedEpisode ? state.studySessions.find((item) => item.episodeId === linkedEpisode.id) : undefined
    const excerpt = session && session.segments.length ? transcriptToText(session.segments).slice(0, EXCERPT_CHARS) : undefined
    try {
      const reply: SparkReply = await respondMutation.mutateAsync({
        language: replyLanguage,
        spark,
        episodeTitle: linkedEpisode?.title,
        excerpt: excerpt && excerpt.length >= 200 ? excerpt : undefined,
      })
      saveSpark({ id: uid('spark'), episodeId: linkedEpisode?.id ?? null, text: spark, reply, createdAt: new Date().toISOString() })
      setText('')
      toast.success(t('Spark saved with its AI feedback.'))
    } catch (err) {
      setAiError(sparksErrorCode(err))
    }
  }

  return (
    <div className="page-wrap sparks-page">
      <PageHeader
        view="sparks"
        kicker={t('IDEA SPARKS / AI FEEDBACK')}
        title={t(moduleTitle(theme, 'sparks'))}
        copy={t('Right after an episode, write or dictate the thought that surfaced. The atelier’s AI answers with an honest evaluation, what works, and concrete next steps. AI calls are billed to the DeepSeek key you add yourself under Settings → AI keys (your key, your bill) — so this module requires sign-in.')}
      />

      <div className="notes-mode-switch" role="tablist" aria-label={t('Spark capture mode')}><button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')}><Lightbulb size={16} />{t('Write or dictate')}</button><button type="button" role="tab" aria-selected={mode === 'pencil'} className={mode === 'pencil' ? 'active' : ''} onClick={() => setMode('pencil')}><PenLine size={16} />{t('Apple Pencil mode')}</button><button type="button" role="tab" aria-selected={mode === 'evolution'} className={mode === 'evolution' ? 'active' : ''} onClick={() => setMode('evolution')}><GitBranch size={16} />{t('Idea evolution')}</button><button type="button" role="tab" aria-selected={mode === 'resources'} className={mode === 'resources' ? 'active' : ''} onClick={() => setMode('resources')}><BookOpen size={16} />{t('Resources')}</button></div>

      {!authLoading && !isAuthenticated && (
        <section className="panel sparks-gate">
          <UserRound size={22} />
          <h2>{t('Sign in to share sparks')}</h2>
          <p>{t('Spark feedback runs on the DeepSeek key you add yourself under Settings → AI keys (your key, your bill). Signing in ties each call to your account and stores your sparks in your cloud workspace.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('account')}>{t('Open My Account')}</button>
        </section>
      )}

      {isAuthenticated && (mode === 'pencil' ? <ApplePencilStudio variant="sparks" /> : mode === 'evolution' ? <IdeaEvolutionStudio onOpenResources={openResources} /> : mode === 'resources' ? <ResourceStudio key={resourceSparkId || 'free'} initialSparkId={resourceSparkId} /> : <>

          {aiError && (
            <section className="panel ai-degraded" role="alert">
              <h3>{t('Spark feedback unavailable')}</h3>
              <p>{errorCopy[aiError] ?? errorCopy.AI_UNKNOWN}</p>
            </section>
          )}

          <section className="panel sparks-compose">
            <div className="panel-head">
              <h2>{t('Share a fresh spark')}</h2>
              <label className="sparks-episode-pick">{t('Episode')}
                <select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}>
                  <option value="">{t('No specific episode')}</option>
                  {linkable.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
                </select>
              </label>
            </div>
            <textarea
              ref={inputRef}
              className="sparks-input"
              value={text}
              maxLength={1500}
              rows={4}
              onChange={(event) => setText(event.target.value)}
              placeholder={dictation.supported ? t('What surfaced while listening? Dictate or type it raw — polish comes later…') : t('What surfaced while listening? Type it raw — polish comes later…')}
            />
            <div className="sparks-hints-zone">
              <button type="button" className="text-link sparks-hints-toggle" aria-expanded={showHints} onClick={toggleHints}>
                <Sparkles size={14} />{t('No spark yet? Open thought-starters')}
              </button>
              {showHints && (
                <div className="sparks-hints" role="listbox" aria-label={t('Thought-starters')}>
                  {hintPrompts.map((prompt) => (
                    <button type="button" role="option" aria-selected="false" key={prompt} className="sparks-hint-chip" onClick={() => applyHint(prompt)}>{prompt}</button>
                  ))}
                  <small>{t('Thought-starters are local and free — pick one, finish the sentence in your own words, then decide whether it is worth an AI call.')}</small>
                </div>
              )}
            </div>
            <div className="sparks-compose-bar">
              <span className="sparks-count">{text.trim().length} / 1500</span>
              {dictation.supported && (
                <button type="button" className={`btn ${dictation.listening ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dictation.listening ? dictation.stop() : dictation.start()}>
                  {dictation.listening ? <><Square size={14} />{t('Stop recording')}</> : <><Mic size={14} />{t('Dictate')}</>}
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={text.trim().length < 4 || respondMutation.isPending} onClick={() => void submit()}>
                {respondMutation.isPending ? <><Loader2 size={16} className="spin" />{t('Thinking…')}</> : <><Send size={15} />{t('Share for feedback')}</>}
              </button>
            </div>
            <p className="quiz-fineprint">{t('Your spark — and, when an episode is linked, a transcript excerpt — is sent to the AI behind the active key only to write this feedback. Nothing is retried automatically.')}</p>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>{t('Your sparks')}</h2></div>
            {!state.sparks.length && <p className="empty-state">{t('No sparks yet. The ideas you capture after listening — and the AI’s feedback — are stored here and sync with your cloud workspace.')}</p>}
            <ul className="sparks-list">
              {state.sparks.map((spark: Spark) => {
                const episode = spark.episodeId ? episodeById.get(spark.episodeId) : undefined
                const sparkShow = episode ? showById.get(episode.showId) : undefined
                const expanded = expandedId === spark.id
                return (
                  <li key={spark.id} className="sparks-item">
                    <div className="sparks-item-row">
                      <button type="button" className="sparks-item-main" onClick={() => setExpandedId(expanded ? null : spark.id)} aria-expanded={expanded}>
                        <strong><Lightbulb size={14} />{spark.text}</strong>
                        <span>{episode?.title ?? t('Free spark')} · {new Date(spark.createdAt).toLocaleString(locale === 'en' ? 'en-US' : locale)}</span>
                      </button>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Delete spark')} onClick={() => removeSpark(spark.id)}><Trash2 size={15} /></button>
                    </div>
                    {expanded && spark.reply && (
                      <div className="spark-reply">
                        <p className="spark-evaluation">{spark.reply.evaluation}</p>
                        {!!spark.reply.strengths.length && (
                          <div className="spark-block"><em>{t('What works')}</em><ul>{spark.reply.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
                        )}
                        {!!spark.reply.suggestions.length && (
                          <div className="spark-block"><em>{t('Suggestions')}</em><ul>{spark.reply.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div>
                        )}
                        {spark.reply.followUp && <p className="spark-followup"><em>{t('Go deeper')}</em> {spark.reply.followUp}</p>}
                      </div>
                    )}
                    {expanded && <IdeaEvolutionPanel spark={spark} show={sparkShow} onOpenResources={openResources} />}
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
